#!/bin/sh

export URL_MONGODB_SENHA="mongodb://usuario:senha@localhost:27017/db_convid?authMechanism=DEFAULT&authSource=admin"

node ./src/server.js