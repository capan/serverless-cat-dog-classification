import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as logs from 'aws-cdk-lib/aws-logs';
import { ManagedPolicy, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';


export class FileUploadSqsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create an S3 bucket to store the uploaded files
    const commonBucket = new s3.Bucket(this, 'CommonUploadBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const dogBucket = new s3.Bucket(this, 'DogBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const catBucket = new s3.Bucket(this, 'CatBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Create a DynamoDB table to store file metadata
    const fileStatusTable = new dynamodb.Table(this, 'FileMetadataTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      stream: dynamodb.StreamViewType.NEW_IMAGE,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create an SQS queue to store file names
    const queue = new sqs.Queue(this, 'FileQueue', {
      visibilityTimeout: cdk.Duration.minutes(180),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      receiveMessageWaitTime: cdk.Duration.seconds(20),
      // deadLetterQueue: {
      //   maxReceiveCount: 10,
      //   queue: deadLetterQueue
      // }
    });

    const statusQueue = new sqs.Queue(this, 'StatusQueue', {
      visibilityTimeout: cdk.Duration.minutes(10),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      receiveMessageWaitTime: cdk.Duration.seconds(5),
      // deliveryDelay: cdk.Duration.seconds(3),
      // contentBasedDeduplication: true,
      fifo: true,
    });

    const api = new appsync.GraphqlApi(this, 'StatusApi', {
      name: 'MyStatusApi',
      schema: appsync.SchemaFile.fromAsset('schema.graphql'),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.API_KEY,
        }
      }
    });

    const imageDataSource = api.addNoneDataSource("ImageDataSource");
    imageDataSource.createResolver("ImageDataSourceResolver", {
      typeName: 'Mutation',
      fieldName: 'updateStatus',
      requestMappingTemplate: appsync.MappingTemplate.fromFile('update-status-request.vtl'),
      responseMappingTemplate: appsync.MappingTemplate.fromFile('update-status-response.vtl'),
    })
    const imageSubscription = api.addNoneDataSource("ImageSubscription");
    imageSubscription.createResolver("ImageSubscriptionResolver", {
      typeName: 'Subscription',
      fieldName: 'onUpdateStatus',
      requestMappingTemplate: appsync.MappingTemplate.fromFile('on-update-status-request.vtl'),
      responseMappingTemplate: appsync.MappingTemplate.fromFile('on-update-status-response.vtl'),
    });

    // const subscriptionHandler = new lambda.Function(this, 'subscriptionHandler', {
    //   runtime: lambda.Runtime.PYTHON_3_8,
    //   code: lambda.Code.fromAsset('lambda-src'),
    //   handler: 'subscription.handler'
    // });

    const itemsTableRole = new Role(this, 'ItemsDynamoDBRole', {
      assumedBy: new ServicePrincipal('appsync.amazonaws.com')
    });

    itemsTableRole.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AmazonDynamoDBFullAccess'));

    // Create a Lambda function to save the file metadata to DynamoDB
    const metadataFunction = new lambda.Function(this, 'SaveMetadataFunction', {
      runtime: lambda.Runtime.PYTHON_3_8,
      code: lambda.Code.fromAsset('lambda-src'),
      logRetention: logs.RetentionDays.ONE_DAY,
      insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_98_0,
      handler: 'save_metadata.handler',
      environment: {
        TABLE_NAME: fileStatusTable.tableName,
        QUEUE_URL: statusQueue.queueUrl,
        COMMON_BUCKET_NAME: commonBucket.bucketName,
      }
    });

    const classificationFunction = new lambda.DockerImageFunction(this, 'Classifier', {
      code: lambda.DockerImageCode.fromImageAsset("lambda-src/classification"),
      architecture: lambda.Architecture.ARM_64,
      logRetention: logs.RetentionDays.ONE_DAY,
      insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_98_0,
      memorySize: 3008,
      timeout: cdk.Duration.minutes(15),
      environment: {
        BUCKET_NAME: commonBucket.bucketName,
      }
    });

    const updateClassifiedImageStatusFunction = new lambda.Function(this, 'UpdateClassifiedImageStatusFunction', {
      runtime: lambda.Runtime.PYTHON_3_8,
      code: lambda.Code.fromAsset('lambda-src'),
      logRetention: logs.RetentionDays.ONE_DAY,
      handler: 'update_classified_image_status.handler',
      insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_98_0,
      environment: {
        TABLE_NAME: fileStatusTable.tableName,
        QUEUE_URL: statusQueue.queueUrl,
      }
    });

    const moveAndDeleteImageFunction = new lambda.Function(this, 'MoveAndDeleteImageFunction', {
      runtime: lambda.Runtime.PYTHON_3_8,
      code: lambda.Code.fromAsset('lambda-src'),
      handler: 'move_and_delete_image.handler',
      logRetention: logs.RetentionDays.ONE_DAY,
      insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_98_0,
      environment: {
        BUCKET_NAME: commonBucket.bucketName,
        DOG_BUCKET_NAME: dogBucket.bucketName,
        CAT_BUCKET_NAME: catBucket.bucketName,
      }
    });

    // pollQueueFunction.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
    //   actions: ['sqs:ReceiveMessage', 'sqs:DeleteMessage'],
    //   resources: [queue.queueArn],
    // }));

    // pollQueueFunction.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
    //   actions: ['appsync:GraphQL'],
    //   resources: [api.arn],
    // }));

    // const rule = new cdk.aws_events.Rule(this, 'PollQueueRule', {
    //   eventPattern: {
    //     source: ['aws.lambda'],
    //   },
    //   schedule: cdk.aws_events.Schedule.rate(cdk.Duration.seconds(60))
    // });

    // rule.addTarget(new cdk.aws_events_targets.LambdaFunction(pollQueueFunction, {
    //   event: cdk.aws_events.RuleTargetInput.fromObject({ action: 'poll' })
    // }));

    // Create a state machine to orchestrate the file processing steps
    const stateMachine = new stepfunctions.StateMachine(this, 'FileProcessingStateMachine', {
      stateMachineType: stepfunctions.StateMachineType.EXPRESS,
      logs: {
        destination: new logs.LogGroup(this, 'StateMachineLogGroup', {
          retention: logs.RetentionDays.ONE_DAY,
        })
      },
      definition: stepfunctions.Chain.start(new tasks.LambdaInvoke(this, 'SaveMetadata', {
        lambdaFunction: metadataFunction,
        outputPath: '$.Payload',
      }).addRetry({ maxAttempts: 2 }))
        .next(new tasks.LambdaInvoke(this, 'ClassifyImage', {
          lambdaFunction: classificationFunction,
          outputPath: '$.Payload',
        })
          .addRetry({ maxAttempts: 5, interval: cdk.Duration.seconds(30), backoffRate: 3 })
        )
        .next(new tasks.LambdaInvoke(this, 'UpdateClassifiedImageStatus', {
          lambdaFunction: updateClassifiedImageStatusFunction,
          outputPath: '$.Payload',
        })
          .addRetry({ maxAttempts: 2, interval: cdk.Duration.seconds(5), backoffRate: 2 })
        )
        .next(new tasks.LambdaInvoke(this, 'MoveAndDeleteImage', {
          lambdaFunction: moveAndDeleteImageFunction,
          outputPath: '$.Payload',
        })
          .addRetry({ maxAttempts: 2, interval: cdk.Duration.seconds(5), backoffRate: 2 })
        )
    });

    const stateMachineTriggerFunction = new lambda.Function(this, 'TriggerFunction', {
      runtime: lambda.Runtime.PYTHON_3_8,
      code: lambda.Code.fromAsset('lambda-src'),
      logRetention: logs.RetentionDays.ONE_DAY,
      insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_98_0,
      handler: 'handler.upload',
      environment: {
        STATE_MACHINE_ARN: stateMachine.stateMachineArn,
        QUEUE_URL: queue.queueUrl,
      }
    });

    const objectPutEventSource = new lambdaEventSources.SqsEventSource(queue, {
      batchSize: 1,
      filters: [
        lambda.FilterCriteria.filter({ body: { Records: { eventName: lambda.FilterRule.isEqual("ObjectCreated:Put") } } })
      ]
    });

    stateMachineTriggerFunction.addEventSource(objectPutEventSource);

    const pollQueueFunction = new lambda.Function(this, 'PollQueueForStatusUpdatesFunction', {
      runtime: lambda.Runtime.PYTHON_3_8,
      code: lambda.Code.fromAsset('lambda-src'),
      handler: 'poll_queue.handler',
      logRetention: logs.RetentionDays.ONE_DAY,
      insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_98_0,
      timeout: cdk.Duration.minutes(1),
      environment: {
        API_URL: api.graphqlUrl,
        QUEUE_URL: queue.queueUrl,
        API_KEY: api.apiKey!,
      }
    });
    const objectStatusUpdateEventSource = new lambdaEventSources.SqsEventSource(statusQueue);
    pollQueueFunction.addEventSource(objectStatusUpdateEventSource);
    // const objectStatusUpdateEventSource = new lambdaEventSources.SqsEventSource(queue, {
    //   batchSize: 1,
    //   reportBatchItemFailures: true,
    //   filters: [
    //     lambda.FilterCriteria.filter({ body: { status: lambda.FilterRule.isEqual("UPLOADED") } })
    //   ]
    // });
    // pollQueueFunction.addEventSource(objectStatusUpdateEventSource);



    commonBucket.grantReadWrite(metadataFunction);
    commonBucket.grantReadWrite(moveAndDeleteImageFunction);
    dogBucket.grantReadWrite(moveAndDeleteImageFunction);
    catBucket.grantReadWrite(moveAndDeleteImageFunction);
    commonBucket.grantRead(classificationFunction);
    fileStatusTable.grantReadWriteData(metadataFunction);
    fileStatusTable.grantReadWriteData(updateClassifiedImageStatusFunction);
    // table.grantWriteData(queueFunction);
    statusQueue.grantSendMessages(metadataFunction);
    statusQueue.grantSendMessages(updateClassifiedImageStatusFunction);
    // commonBucket.addObjectCreatedNotification(new s3n.LambdaDestination(triggerFunction), { suffix: '.png', });
    // commonBucket.addObjectCreatedNotification(new s3n.LambdaDestination(triggerFunction), { suffix: '.jpg', });
    commonBucket.addObjectCreatedNotification(new s3n.SqsDestination(queue), { suffix: '.png', });
    commonBucket.addObjectCreatedNotification(new s3n.SqsDestination(queue), { suffix: '.jpg', });
    stateMachine.grantStartExecution(stateMachineTriggerFunction);
    // queue.grantConsumeMessages(stateMachineTriggerFunction);
  }
}
