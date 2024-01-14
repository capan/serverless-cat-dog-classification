import boto3
import os


def handler(event, context):
    # Make sure you have the correct region for your S3 bucket
    s3 = boto3.client('s3', region_name='eu-central-1')

    # Get the file object and file name from the event
    file = event['body']
    file_name = event['file_name']

    # Set the desired bucket and object name
    bucket = os.environ['BUCKET_NAME']
    key = file_name

    # Upload the file
    s3.upload_fileobj(file, bucket, key)

    return {
        'statusCode': 200,
        'fileName': file_name,
        'body': 'File uploaded successfully'
    }
