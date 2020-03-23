'use strict';

const fs   = require('fs');
const jwt  = require('jsonwebtoken');
const conf = require('./conf');
const uuidv4 = require('uuid').v4;

const privateKey = fs.readFileSync(conf.privateKeyFile, 'utf8');
const publicKey = fs.readFileSync(conf.publicKeyFile, 'utf8');

const signOptions = { issuer: conf.issuer, audience: conf.audience, expiresIn: conf.expiresIn, algorithm: conf.algorithm };
const verifyOptions = { issuer:  conf.issuer, audience:  conf.audience, expiresIn:  conf.expiresIn, algorithm:  [ conf.algorithm ] };

function generateToken(aid, mid, rfw, lfw) {
    let payload = {
        aid: aid,
        rfw: rfw,
        lfw: lfw,
        sub: mid,
        pty: "false",
        jti: uuidv4()
    };
    return jwt.sign(payload, privateKey, signOptions);
}

function verifyToken(token) {
    try{
        return jwt.verify(token, publicKey, verifyOptions);
    }catch(err){
        return false;
    }
}

function decode(token){
    return jwt.decode(token, { complete: true });
}

module.exports = {
    generateToken,
    verifyToken,
    decode
}
