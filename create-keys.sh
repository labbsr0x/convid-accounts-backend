#!/bin/bash

openssl genrsa -out test-rsa.key 1024
openssl rsa -in test-rsa.key -pubout > test-rsa.pub