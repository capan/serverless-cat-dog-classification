import os
import boto3


def handler(event, context):
    # Make sure you have the correct region for your S3 bucket
    s3 = boto3.client('s3', region_name='eu-central-1')

    # Get the file object and file name from the event
    file_name = event['fileName']
    status = event['status']
    result = event['result']

    # Set the desired bucket and object name
    source_bucket = os.environ['BUCKET_NAME']
    dog_target_bucket = os.environ['DOG_BUCKET_NAME']
    cat_target_bucket = os.environ['CAT_BUCKET_NAME']

    if(status == 'FINISHED'):
        dest_bucket = ''
        if(result == 'dog'):
            dest_bucket = dog_target_bucket
        elif(result == 'cat'):
            dest_bucket = cat_target_bucket
        s3.copy_object(Bucket=dest_bucket, CopySource={
                       'Bucket': source_bucket, 'Key': file_name}, Key=file_name)
        # Delete the file from the source bucket
        s3.delete_object(Bucket=source_bucket, Key=file_name)
