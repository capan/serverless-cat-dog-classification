FROM public.ecr.aws/lambda/python:3.8

RUN yum update -y && yum install -y gcc-c++ pkgconfig poppler-cpp-devel wget curl tar xz gzip make ffmpeg libsm6 libxext6 libgl1 && yum clean all
RUN wget https://github.com/madler/zlib/archive/v1.2.11.tar.gz && tar -zxvf v1.2.11.tar.gz && cd zlib-1.2.11 && ./configure --prefix=/bin/zlib/ && make && make install && export LD_LIBRARY_PATH="/bin/zlib/lib":$LD_LIBRARY_PATH
RUN ln -s -f /usr/local/lib/libz.so.1.2.9/lib libz.so.1

COPY requirements.txt ${LAMBDA_TASK_ROOT}/
COPY app.py ${LAMBDA_TASK_ROOT}/
COPY 1.jpg ${LAMBDA_TASK_ROOT}/
RUN pip install -r requirements.txt
COPY cats_vs_dogs ${LAMBDA_TASK_ROOT}/cats_vs_dogs
CMD ["app.handler"]