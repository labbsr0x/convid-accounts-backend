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

//Control to avoid inserting tunnelPort duplicated.
let countGeneratingTunnelPort = 0;
let arrayTunnelPortsInserting = [];

const app = Express();
const metrics = configureMetrics();

configureMongoDB().catch(error => {
    console.error('Error to configure mongoDB.');
    console.error(error);
});

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

async function configureMongoDB() {
    const mongoClient = await MongoClient.connect(process.env.URL_MONGODB_SENHA);

    /**
     * Let the attribute tunnelPort unique.
     * https://thecodebarbarian.com/enforcing-uniqueness-with-mongodb-partial-unique-indexes.html
     */
    mongoClient.db(MONGO_TABLE).collection(REGISTERED_MACHINE_COLLECTION).ensureIndex(
        { tunnelPort: 1 }, 
        { sparse: true, unique: true });
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

            if(account) {
                res.send(account);
            }else {
                res.status(404).send({message: 'Accounts not found.'});
            }

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
    const sshPortInternal = process.env.SSH_PORT_INTERNAL || process.env.SSH_PORT
    const tunnelPortRange = process.env.TUNNEL_PORT_RANGE
    // const lowerPort = tunnelPortRange.split(/-/)[0]
    // const higherPort = tunnelPortRange.split(/-/)[1]


    const min = Math.ceil(1000);
    const max = Math.floor(9999);
    const number = Math.floor(Math.random() * (max - min)) + min;

    const machineId = makeid(3) + number.toString();

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
          
            let registeredMachine = { machineId };
            registeredMachine.account = account;
            registeredMachine.sshHost = sshHost;
            registeredMachine.sshPort = sshPort + "";
            registeredMachine.sshPortInternal = sshPortInternal + ""
            registeredMachine.sshUsername = registeredMachine.machineId;
            registeredMachine.sshPassword = req.params.accountId;

            getTunnelPort(dbMongo).then(tunnelPort => {
                registeredMachine.tunnelPort = tunnelPort + '';

                if(conf.withTOTP){
                    log.debug("Try to create totp");
                    log.trace(JSON.stringify(registeredMachine));
                    moduleTotp.createTOTP(machineId).then((totpInfo) => {
                        log.trace(JSON.stringify(totpInfo))
                        registeredMachine.totpSecret = totpInfo.secret.base32;
                        insertMachineData(req, res, dbMongo, mongoClient, registeredMachine, totpInfo);
                    }).catch((err) => {
                        log.error(err);
                    });
                } else{
                    insertMachineData(req, res, dbMongo, mongoClient, registeredMachine, null);
                } 
            },
            error => {
                mongoClient.close();
                console.error('Error to get the tunnelPort.');
                console.error(error);
                res.status(500).send({ message: 'Error to insert machine.' });
                return;
            });

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
                if (conf.withTOTP) {
                    machine['withTotp'] = true
                }else{
                    machine['withTotp'] = false
                    machine['token'] = moduleJwt.generateToken(machine.account.accountId, machine.machineId, `localhost:${machine.tunnelPort}`, `localhost:${machine.tunnelPort}`)
                }
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


function generateTunnelPort() {
    return Math.floor(Math.random() * (getLastTunnelPort() - getFirstTunnelPort()) ) + getFirstTunnelPort();
}

function getMaxTunnelPorts() {
    // Plus 1 because the last port is included.
    // Ex: Range 3000 to 3001, there is 2 ports and not 1.
    return (getLastTunnelPort() - getFirstTunnelPort()) + 1;
}

function getFirstTunnelPort() {
    return parseInt(process.env.TUNNEL_PORT_RANGE.split(/-/)[0]);
}

function getLastTunnelPort() {
    return parseInt(process.env.TUNNEL_PORT_RANGE.split(/-/)[1]);
}

function getTunnelPort(dbMongo) {
    return new Promise((resolve, reject) => {
        //List all machines to check the valuable tunnel port.
        dbMongo.collection(REGISTERED_MACHINE_COLLECTION).find({}, { projection: { 'tunnelPort': 1 } })
        .toArray((errorFindMachines, machines) => {
            if (errorFindMachines) {
                reject(errorFindMachines);
                return;
            }

            if (machines.length >= getMaxTunnelPorts()) {
                reject({message: 'no tunnel port avaliable.'});
                return;
            }

            //Indicate that is generating a tunnel port to avoid duplicated.
            countGeneratingTunnelPort++;

            let tunnelPort = generateTunnelPort();
            const MAX_TRY_GENERATE = 100000;
            let tryGenerate = 0;
            
            let validTunnelPort = false;
            while(!validTunnelPort) {
                // Check tunnel port in mongoDB and in nodeJS concurrent requests.
                validTunnelPort = (machines.find(machine => parseInt(machine.tunnelPort) === tunnelPort) == null) && 
                    (arrayTunnelPortsInserting.find(tunnelPortInserting => tunnelPortInserting === tunnelPort) == null);

                //Generate another tunnel port if it is already used.
                if(!validTunnelPort) {
                    //limit to not cause loop.
                    if (tryGenerate > MAX_TRY_GENERATE) {
                        //Indicate that stopped generating tunnel port.
                        countGeneratingTunnelPort--;

                        reject({message: 'max try of generate hit.'});
                        return;
                    }

                    //the last tunnel range is difficult to hit.
                    tunnelPort = (tryGenerate < MAX_TRY_GENERATE) ? generateTunnelPort() : getLastTunnelPort();
                }

                tryGenerate++;
            }

            //Keep the tunnel port to avoid duplicated insert.
            arrayTunnelPortsInserting.push(tunnelPort);

            resolve(tunnelPort);
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
                if (conf.withTOTP) {
                    if (machine.totpSecret) {
                        let validationResult = moduleTotp.validateTOTP(req.body.code, machine.totpSecret);
                        // log.info("TOTP Validation Result: ", validationResult);
                        if (validationResult) {
                            status = 200;
                            message = {
                                sshHost: machine.sshHost,
                                sshPort: machine.sshPort,
                                machinePort: machine.tunnelPort, 
                                token: moduleJwt.generateToken(machine.account.accountId, machine.machineId, `localhost:${machine.tunnelPort}`, `localhost:${machine.tunnelPort}`)
                            }
                        }
                    }
                }else{    
                    status = 200;
                    message = {
                        sshHost: machine.sshHost,
                        sshPort: machine.sshPort,
                        machinePort: machine.tunnelPort, 
                        token: moduleJwt.generateToken(machine.account.accountId, machine.machineId, `localhost:${machine.tunnelPort}`, `localhost:${machine.tunnelPort}`)
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
        //Finished to insert tunnel port.
        countGeneratingTunnelPort--;

        //Cleaning the tunnel port cache.
        const indexTunnelPortInserted = arrayTunnelPortsInserting.indexOf(parseInt(registeredMachine.tunnelPort));
        if (indexTunnelPortInserted >= 0) {
            arrayTunnelPortsInserting.splice(indexTunnelPortInserted, 1);
        }

        if (error) {
            console.error(error);
            res.status(500).send({ message: 'Error to insert machine.' });
            return;
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
                sshPortInternal: registeredMachine.sshPortInternal,
                tunnelPort: registeredMachine.tunnelPort,
                totpUrl: urlTOTP,
                token: moduleJwt.generateToken(registeredMachine.account.accountId, registeredMachine.machineId, `localhost:${registeredMachine.tunnelPort}`, `localhost:${registeredMachine.tunnelPort}`)
            })
        } else {
            res.status(404).send({ message: 'No account found with ID: ' + req.params.accountId });
        }

        mongoClient.close();
    });
}
