#!/bin/bash

openssl genrsa -out test_rsa.key 1024
openssl rsa -in test_rsa.key -pubout > test_rsa.pub