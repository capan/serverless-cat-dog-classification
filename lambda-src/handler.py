import os
import json
import boto3

my_state_machine_arn = os.environ['STATE_MACHINE_ARN']
client = boto3.client('stepfunctions')
queue_url = os.environ['QUEUE_URL']
sqs = boto3.client('sqs', region_name='eu-central-1')


def upload(event, context):
    print(event)
    s3events = event['Records']
    for s3event in s3events:
        receipt_handle = s3event['receiptHandle']
        parsed = json.loads(s3event['body'])
        for record in parsed['Records']:
            response = client.start_execution(
                stateMachineArn=my_state_machine_arn,
                input=json.dumps(record['s3'])
            )
            sqs.delete_message(
                QueueUrl=queue_url,
                ReceiptHandle=receipt_handle
            )
