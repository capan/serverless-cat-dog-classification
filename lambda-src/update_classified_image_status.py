import boto3
import os
import json
import datetime
import uuid

sqs = boto3.client('sqs', region_name='eu-central-1')
queue_url = os.environ['QUEUE_URL']


def handler(event, context):
    dynamodb = boto3.client('dynamodb', region_name='eu-central-1')
    print(event)
    fileId = event['fileId']
    fileName = event['fileName']
    result = event['result']
    table_name = os.environ['TABLE_NAME']
    if result != 'ERROR':
        status = 'FINISHED'
    else:
        status = 'ERROR'
    dt = datetime.datetime.now()
    dynamodb.update_item(
        TableName=table_name,
        Key={"id": {"S": fileId}},
        UpdateExpression="set #s = :s, #r = :r",
        ExpressionAttributeValues={
            ':s': {'S': status},
            ':r': {'S': result}
        },
        ExpressionAttributeNames={
            "#s": "status",
            "#r": "classification_result"
        }
    )
    message_body = {
        'id': fileId,
        'name': fileName,
        'status': status,
        'classification_result': result,
        'uploaded_at': str(dt)
    }
    message_attributes = {
        'specific-attribute': {
            'DataType': 'String',
            'StringValue': 'true'
        }
    }
    try:
        print('Publishing message to SQS with body: ' + json.dumps(message_body))
        response = sqs.send_message(
            QueueUrl=queue_url,
            MessageBody=json.dumps(message_body),
            MessageAttributes=message_attributes,
            MessageGroupId='status-updates-metadata',
            MessageDeduplicationId=str(uuid.uuid4())
        )
        print(response)
    except Exception as e:
        print(e)
        print('Error publishing message to SQS')

    return {
        'statusCode': 200,
        'body': 'Table updated successfully',
        'fileId': fileId,
        'fileName': fileName,
        'result': result,
        'status': status
    }
