from skimage import io
import cv2
from huggingface_hub import from_pretrained_keras
import boto3
import os
import numpy as np


def handler(event, context):
    ROWS, COLS = 150, 150
    model = from_pretrained_keras(
        pretrained_model_name_or_path="cats_vs_dogs/")
    s3_client = boto3.client('s3')
    file_name = event.get('fileName')
    file_id = event.get('fileId')
    print("Classifying image: {}".format(file_name))
    obj = s3_client.get_object(
        Bucket=os.environ['BUCKET_NAME'], Key=file_name)
    data = obj['Body'].read()
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    img = cv2.resize(img, (ROWS, COLS), interpolation=cv2.INTER_CUBIC)
    img = img / 255.0
    img = img.reshape(1, ROWS, COLS, 3)
    prediction = model.predict(img)[0][0]
    result = {
        'fileId': file_id,
        'fileName': file_name,
    }
    try:
        if prediction >= 0.5:
            print('I am {:.2%} sure {} is a Cat'.format(prediction, file_name))
            result['result'] = "cat"
        else:
            print('I am {:.2%} sure {} is a Dog'.format(
                1-prediction, file_name))
            result['result'] = "dog"
    except Exception as e:
        print(e)
        result['result'] = "ERROR"
    finally:
        print(result)
        return result
