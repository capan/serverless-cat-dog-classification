import uuid
import boto3
import json
import os
import datetime
import base64


sqs = boto3.client('sqs', region_name='eu-central-1')
s3 = boto3.client('s3')
dynamodb = boto3.client('dynamodb', region_name='eu-central-1')
queue_url = os.environ['QUEUE_URL']
common_bucket_name = os.environ['COMMON_BUCKET_NAME']


def handler(event, context):
    # Make sure you have the correct region for your DynamoDB table
    # Get the file name and size from the event
    file_name = event['object']['key']

    # Get the table name from the environment variables
    table_name = os.environ['TABLE_NAME']

    # Generate a unique ID for the file
    file_id = str(uuid.uuid4())
    dt = datetime.datetime.now()
    # Construct the item to be added to the table
    item = {
        'id': {'S': file_id},
        'name': {'S': file_name},
        'status': {'S': 'UPLOADED'},
        'classification_result': {'S': 'UNKNOWN'},
        'uploaded_at': {'S': str(dt)}
    }

    # Add the item to the table
    dynamodb.put_item(TableName=table_name, Item=item)
    response = s3.get_object(Bucket=common_bucket_name, Key=file_name)
    image_content = response['Body'].read()
    encoded_image = base64.b64encode(image_content).decode("utf-8")
    message_body = {
        'id': file_id,
        'name': file_name,
        'status': 'UPLOADED',
        'classification_result': 'UNKNOWN',
        'uploaded_at': str(dt),
        'image': encoded_image
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
            MessageDeduplicationId=file_id
        )
        print(response)
    except Exception as e:
        print(e)
        print('Error publishing message to SQS')

    return {
        'statusCode': 200,
        'fileName': file_name,
        'fileId': file_id,
        'body': 'File metadata saved successfully'
    }
