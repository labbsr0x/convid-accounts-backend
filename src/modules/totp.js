const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const conf = require ("./conf");
const { log } = require('../util/logging');

async function createTOTP(machineId) {
    log.debug("totp > createTOTP");
    try{
        let secret = speakeasy.generateSecret({length: 20, issuer: conf.issuer, name: machineId, symbols: true})
        log.trace("Secret: " + JSON.stringify(secret))
        let urlTotp = await qrcode.toDataURL(secret.otpauth_url);
        log.trace("URL TOTP: " + urlTotp)
        return { secret, urlTotp }
    }catch (err) {
        log.error("error at create totp: " + err);
        return false;
    }
}

module.exports = {
    createTOTP
}