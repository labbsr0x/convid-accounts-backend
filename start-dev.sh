#!/bin/bash

MONGODB_USUARIO=usuario MONGODB_SENHA=senha docker-compose up --build -d && docker-compose logs -f
