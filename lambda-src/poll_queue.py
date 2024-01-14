import boto3
import json
import urllib3
import os
import time

sqs = boto3.client('sqs', region_name='eu-central-1')
http = urllib3.PoolManager(maxsize=10)

attribute_name = 'specific-attribute'
api_key = os.environ['API_KEY']
api_url = os.environ['API_URL']


def handler(event, context):
    print(event)
    for record in event['Records']:
        body = record['body']
        message = json.loads(body)
        variables = {
            'id': message['id'],
            'name': message['name'],
            'status': message['status'],
            'classification_result': message['classification_result'],
            'uploadedAt': message['uploaded_at'],
        }
        if 'image' in message:
            variables['image'] = message['image']

        mutation = """
            mutation UpdateStatus($id: ID!, $name: String!, $status: String!, $classification_result: String!, $uploadedAt: String!, $image: String) {
                updateStatus(id: $id, name: $name, status: $status, classification_result: $classification_result, uploaded_at: $uploadedAt, image: $image) {
                    id
                    name
                    status
                    classification_result
                    uploaded_at,
                    image
                }
            }
            """
        url = 'API_URL'.replace('API_URL', api_url)
        headers = {
            'Content-Type': 'application/json',
            'x-api-key': api_key
        }
        payload = {
            'query': mutation,
            'variables': variables
        }

        response = http.request(
            'POST', url, headers=headers, body=json.dumps(payload))
        print(response.data.decode('utf-8'))

        if response.status != 200:
            raise Exception(f"Request failed: {response.status}")
        time.sleep(1)

        print(f"Processed file: {message['name']}")
