const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const conf = require ("./conf");
const { log } = require('../util/logging');

async function createTOTP(machineId) {
    log.debug("totp > createTOTP");
    try{
        let machineIdName = "Convid " + machineId.charAt(0) + "*****" + machineId.charAt(machineId.length-1);
        let secret = speakeasy.generateSecret({length: 20, issuer: conf.issuer, name: machineIdName, symbols: true})
        log.trace("Secret: " + JSON.stringify(secret))
        let urlTotp = await qrcode.toDataURL(secret.otpauth_url);
        log.trace("URL TOTP: " + urlTotp)
        return { secret, urlTotp }
    }catch (err) {
        log.error("error at create totp: " + err);
        return false;
    }
}

function validateTOTP(code, secret){
    log.debug("totp > validateTOTP");
    log.trace("Code: ", code);
    return speakeasy.totp.verify({ secret: secret,
        encoding: 'base32',
        token: code,
        window: 2
    });
}

module.exports = {
    createTOTP,
    validateTOTP,
}