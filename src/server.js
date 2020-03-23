'use strict';

const Express = require('express');
const MongoClient = require('mongodb').MongoClient;
const PrometheusClient = require('prom-client');
const BodyParser = require('body-parser');
const { log } = require('./util/logging');
const moduleJwt = require('./modules/jwt');
const moduleTotp = require('./modules/totp');
const conf = require('./modules/conf');
var cors = require('cors')

const PORT = 9999;
const HOST = '0.0.0.0';

const MONGO_TABLE = 'db_convid';
const ACCOUNT_COLLECTION = 'account';
const REGISTERED_MACHINE_COLLECTION = 'registered_machine';

const app = Express();
const metrics = configureMetrics();
configureMiddlewares();
configureRoutes();

app.listen(PORT, HOST);
console.log(`Running on http://${HOST}:${PORT}`);


function configureMiddlewares() {

    app.use(cors())

    //Configure recept of JSON body.
    app.use(BodyParser.json());
    app.use(BodyParser.urlencoded({
        extended: true
    }));

    app.use((req, res, next) => {
        //Count all the requests, except the metrics.
        if (req.path !== '/metrics') {
            metrics.counterInvocation.inc();
        }

        next();
    });
}

function configureRoutes() {
    app.get('/', (req, res) => {
        res.send('Convid - account backend');
    });

    app.post('/account', (req, res) => {
        insertAccount(req, res);
    });

    app.get('/account', (req, res) => {
        listAccount(res);
    });

    app.post('/account/:accountId/machine', (req, res) => {
        generateMachineConnectionParams(req, res);
    });

    app.get('/account/:accountId/machine/:machineId', (req, res) => {
        validateSSHConnection(req, res);
    });

    app.get('/machine', (req, res) => {
        listMachines(res);
    });

    app.get('/machine/:machineId', (req, res) => {
        getMachineConnectionParams(req, res);
    });

    app.post('/machine/:machineId/token', (req, res) => {
        getMachineConnectionParamsTotp(req, res);
    });

    app.get('/metrics', (req, res) => {
        connectExporter(res);
    });


}

function insertAccount(req, res) {

    const mongoClient = new MongoClient(process.env.URL_MONGODB_SENHA);

    mongoClient.connect(function (error) {
        if (error) {
            throw error;
        }

        const dbMongo = mongoClient.db(MONGO_TABLE);

        if (Array.isArray(req.body)) {

            dbMongo.collection(ACCOUNT_COLLECTION).insertMany(req.body, function (error, accountInserted) {
                if (error) {
                    res.status(500).send({ message: 'Error to insert account.' });
                    throw error;
                }

                res.status(200).send(accountInserted.ops);
                mongoClient.close();
            });
        } else {


            dbMongo.collection(ACCOUNT_COLLECTION).findOne({ $or: [{ accountId: req.body.accountId }, { email: req.body.email }] }, function (errorFind, account) {
                if (errorFind) {
                    throw errorFind;
                }

                if (account != null) {
                    res.status(409).send({ message: 'Already registered' });
                    mongoClient.close();
                    return;
                } else {
                    dbMongo.collection(ACCOUNT_COLLECTION).insertOne(req.body, function (error, accountInserted) {
                        if (error) {
                            res.status(500).send({ message: 'Error to insert account.' });
                            throw error;
                        }

                        res.status(201).send(accountInserted.ops);
                        mongoClient.close();
                        return;
                    });
                }
            });
        }

    });
}

function listAccount(res) {
    const mongoClient = new MongoClient(process.env.URL_MONGODB_SENHA);

    mongoClient.connect(function (error) {
        if (error) {
            res.status(500).send({ message: 'Error to list account.' });
            throw error;
        }

        const dbMongo = mongoClient.db(MONGO_TABLE);

        dbMongo.collection(ACCOUNT_COLLECTION).find({}).toArray(function (errorFind, account) {
            if (errorFind) {
                throw errorFind;
            }

            res.send(account);
            mongoClient.close();
        });

    });
}

function listMachines(res) {
    const mongoClient = new MongoClient(process.env.URL_MONGODB_SENHA);

    mongoClient.connect(function (error) {
        if (error) {
            res.status(500).send({ message: 'Error connecting to mongo to list machines.' });
            throw error;
        }

        const dbMongo = mongoClient.db(MONGO_TABLE);

        dbMongo.collection(REGISTERED_MACHINE_COLLECTION).find({}).toArray(function (errorFind, machines) {
            if (errorFind) {
                throw errorFind;
            }

            res.send(machines);
            mongoClient.close();
        });

    });
}

function configureMetrics() {
    const counterUpTime = new PrometheusClient.Counter({
        name: 'up_time',
        help: 'Time that node service is UP. (Seconds)'
    });

    //Begin to count the time that node service is up.
    setInterval(() => counterUpTime.inc(), 1000);

    const counterInvocation = new PrometheusClient.Counter({
        name: 'invocation_count',
        help: 'Request Count.'
    });

    return {
        counterUpTime,
        counterInvocation
    };
}

function connectExporter(res) {
    res.set('Content-Type', PrometheusClient.register.contentType);
    res.send(PrometheusClient.register.metrics());
}

function generateMachineConnectionParams(req, res) {

    const mongoClient = new MongoClient(process.env.URL_MONGODB_SENHA);
    const baseDomain = process.env.BASE_DOMAIN

    const sshHost = process.env.SSH_HOST
    const sshPort = process.env.SSH_PORT
    const tunnelPortRange = process.env.TUNNEL_PORT_RANGE
    // const lowerPort = tunnelPortRange.split(/-/)[0]
    // const higherPort = tunnelPortRange.split(/-/)[1]

    const min = Math.ceil(1000);
    const max = Math.floor(9999);

    const number = Math.floor(Math.random() * (max - min)) + min;

    var machineId = makeid(3) + number.toString()

    mongoClient.connect(function (error) {
        if (error) {
            res.status(500).send({ message: 'Error creating id.' });
            throw error;
        }

        log.debug("Mongo Connected")
        const dbMongo = mongoClient.db(MONGO_TABLE);

        dbMongo.collection(ACCOUNT_COLLECTION).findOne({ accountId: req.params.accountId }, function (errorFind, account) {
            if (errorFind) {
                res.status(500).send({ message: 'Error creating id.' });
                throw errorFind;
            }

            log.debug("Account founded")
            log.trace("accound:", JSON.stringify(account));
            let registeredMachine = { machineId }
            const tunnelPort = (Math.floor(Math.random() * 40000) + 3000) + ""
            
            registeredMachine.account = account
            
            registeredMachine.sshHost = sshHost
            registeredMachine.sshPort = sshPort + ""
            registeredMachine.sshUsername = registeredMachine.machineId
            registeredMachine.sshPassword = req.params.accountId
            registeredMachine.tunnelPort = tunnelPort + ""

            if(conf.withTOTP){
                log.debug("Try to create totp")
                log.trace(JSON.stringify(registeredMachine));
                moduleTotp.createTOTP(machineId).then((totpInfo) => {
                    log.trace(JSON.stringify(totpInfo))
                    registeredMachine.totpSecret = totpInfo.secret.base32;
                    insertMachineData(req, res, dbMongo, mongoClient, registeredMachine, totpInfo);
                }).catch((err) => {
                    log.error(err);
                })
            }else{
                insertMachineData(req, res, dbMongo, mongoClient, registeredMachine, null);
            } 
        });

    });

}

function getMachineConnectionParams(req, res) {
    const mongoClient = new MongoClient(process.env.URL_MONGODB_SENHA);

    mongoClient.connect(function (error) {
        if (error) {
            res.status(500).send({ message: 'Error to get machineID.' });
            throw error;
        }

        const dbMongo = mongoClient.db(MONGO_TABLE);

        dbMongo.collection(REGISTERED_MACHINE_COLLECTION).findOne({ "machineId": req.params.machineId }, function (errorFind, machine) {
            if (errorFind) {
                throw errorFind;
            }

            if (machine) {
                delete machine._id
                delete machine.account._id
                delete machine.totpSecret
                res.send(machine);
            } else {
                res.status(404)
                res.send({})
            }

            mongoClient.close();
        });

    });
}

function makeid(length) {
    var result = '';
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

function validateSSHConnection(req, res) {
    const mongoClient = new MongoClient(process.env.URL_MONGODB_SENHA);

    mongoClient.connect(function (error) {
        if (error) {
            res.status(500).send({ message: 'Error connecting to mongo to validate SSH connection' });
            throw error;
        }

        const dbMongo = mongoClient.db(MONGO_TABLE);

        dbMongo.collection(REGISTERED_MACHINE_COLLECTION).findOne({ "machineId": req.params.machineId }, function (errorFind, machine) {
            if (errorFind) {
                res.status(500).send({ message: 'Validation Error' });
                throw errorFind;
            }
            let status = 500;
            let message = { message: 'SSH Connection NOT validated' }
            if (machine) {
                if (machine.account) {
                    if (machine.account.accountId == req.params.accountId) {
                        status = 200;
                        message = { message: 'Validated!' };
                    }
                }
            }
            res.status(status).send(message);
            mongoClient.close();
        });

    });
}

function getMachineConnectionParamsTotp(req, res) {
    const mongoClient = new MongoClient(process.env.URL_MONGODB_SENHA);

    mongoClient.connect(function (error) {
        if (error) {
            res.status(500).send({ message: 'Error connecting to mongo to validate SSH connection' });
            throw error;
        }

        const dbMongo = mongoClient.db(MONGO_TABLE);

        dbMongo.collection(REGISTERED_MACHINE_COLLECTION).findOne({ "machineId": req.params.machineId }, function (errorFind, machine) {
            if (errorFind) {
                res.status(500).send({ message: 'Validation Error' });
                throw errorFind;
            }

            let status = 500;
            let message = { message: 'Validation Error' }

            if (machine) {
                if (machine.totpSecret) {
                    let validationResult = moduleTotp.validateTOTP(req.body.code, machine.totpSecret);
                    // log.info("TOTP Validation Result: ", validationResult);
                    if (validationResult) {
                        status = 200;
                        message = {
                            machinePort: machine.tunnelPort, 
                            token: moduleJwt.generateToken(machine.account.accountId, machine.machineId, `localhost:${machine.tunnelPort}`, "localhost:3389")
                        }
                    }
                }
            }
            res.status(status).send(message);
            mongoClient.close();
        });
    });
} 

function insertMachineData(req, res, dbMongo, mongoClient, registeredMachine, totpInfo) {
    log.info("Insert Machine Data")
    dbMongo.collection(REGISTERED_MACHINE_COLLECTION).insertOne(registeredMachine, function (error) {
        if (error) {
            res.status(500).send({ message: 'Error to insert machine.' });
            throw error;
        }
        let urlTOTP = "";
        if(totpInfo){
            urlTOTP = totpInfo.urlTotp;
        }

        log.debug("Inserted data")
        if (registeredMachine.account) {
            res.setHeader("Location", "http://" + conf.audience + "/account/" + registeredMachine.account.accountId + "/machine/" + registeredMachine.machineId);
            res.json({ 
                machineId: registeredMachine.machineId,
                sshHost: registeredMachine.sshHost,
                sshPort: registeredMachine.sshPort,
                totpUrl: urlTOTP,
                token: moduleJwt.generateToken(registeredMachine.account.accountId, registeredMachine.machineId, `localhost:${registeredMachine.tunnelPort}`, "localhost:3389")
            })
            // res.json({ machineId: machineId, sshHost: sshHost, sshPort: sshPort, sshUsername: registeredMachine.sshUsername, sshPassword: registeredMachine.sshPassword, tunnelPort: registeredMachine.tunnelPort });
        } else {
            res.status(404).send({ message: 'No account found with ID: ' + req.params.accountId });
        }

        mongoClient.close();
    });
}
