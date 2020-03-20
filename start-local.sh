#!/bin/sh

export URL_MONGODB_SENHA="mongodb://usuario:senha@localhost:27017/db_convid?authMechanism=DEFAULT&authSource=admin"
export BASE_DOMAIN="anyserver.com"
export SSH_HOST="localhost"
export SSH_PORT="2222"

export TUNNEL_PORT_RANGE="3000-60000"

node ./src/server.js