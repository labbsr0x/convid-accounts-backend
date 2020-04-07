
const issuer = process.env.ISSUER_NAME || "localAccount";
const audience = process.env.BASE_DOMAIN || "http://localhost:9000";
const expiresIn = process.env.EXPIRATION_TIME || "12h";
const algorithm = process.env.ALGORITHM || "RS512";
const privateKeyFile = `${process.env.KEY_USING_SECRET == "true" ? "/run/secrets/" : ""}${process.env.PRIVATE_KEY}`
const publicKeyFile = `${process.env.KEY_USING_SECRET == "true" ? "/run/secrets/" : ""}${process.env.PUBLIC_KEY}`
const logLevel = process.env.LOG_LEVEL || 'info';

module.exports = {
    issuer,
    audience,
    expiresIn,
    algorithm,
    privateKeyFile,
    publicKeyFile,
    logLevel
}