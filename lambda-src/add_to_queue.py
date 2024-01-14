import boto3
import os
import json


def handler(event, context):
    # Make sure you have the correct region for your SQS queue
    sqs = boto3.client('sqs', region_name='eu-central-1')
    dynamodb = boto3.client('dynamodb', region_name='eu-central-1')

    # Get the file name from the event
    fileId = event['fileId']
    fileName = event['fileName']
    print("fileId: ", fileId)
    # Get the queue URL from the environment variables
    queue_url = os.environ['QUEUE_URL']
    table_name = os.environ['TABLE_NAME']

    # Construct the message to be added to the queue
    message = {
        'file_id': fileId
    }
    dynamodb.update_item(
        TableName=table_name,
        Key={"id": {"S": fileId}},
        UpdateExpression="set #s = :s",
        ExpressionAttributeValues={
            ':s': {'S': 'QUEUED'},
        },
        ExpressionAttributeNames={
            "#s": "status"
        }
    )

    # Add the message to the queue
    sqs.send_message(QueueUrl=queue_url, MessageBody=json.dumps(message))

    return {
        'statusCode': 200,
        'body': 'File name added to queue successfully',
        'fileId': fileId,
        'fileName': fileName,
    }
