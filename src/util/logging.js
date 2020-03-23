const pino = require('pino');
const conf = require('../modules/conf');

const log = pino({ level: conf.logLevel,  prettyPrint: { colorize: true } });

module.exports = {
    log
}