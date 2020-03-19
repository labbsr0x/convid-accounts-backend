#!/bin/sh

export URL_MONGODB_SENHA="mongodb://usuario:senha@localhost:27017/db_convid?authMechanism=DEFAULT&authSource=admin"
export BASE_DOMAIN="anyserver.com"
node ./src/server.js