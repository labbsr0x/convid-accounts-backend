'use strict';

const Express = require('express');
const MongoClient = require('mongodb').MongoClient;
const PrometheusClient = require('prom-client');
const BodyParser = require('body-parser');
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
    })

    app.get('/machine/:machineId', (req, res) => {
        getMachineConnectionParams(req, res);
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
            dbMongo.collection(ACCOUNT_COLLECTION).insertOne(req.body, function (error, accountInserted) {
                if (error) {
                    res.status(500).send({ message: 'Error to insert account.' });
                    throw error;
                }

                res.status(201).send(accountInserted.ops);
                mongoClient.close();
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

        dbMongo.collection(ACCOUNT_COLLECTION).findOne({}, function (errorFind, account) {
            if (errorFind) {
                throw errorFind;
            }

            res.send(account);
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
    const sshUsername = process.env.SSH_USERNAME
    const sshPassword = process.env.SSH_PASSWORD
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

        const dbMongo = mongoClient.db(MONGO_TABLE);

        dbMongo.collection(ACCOUNT_COLLECTION).findOne({ accountId: req.params.accountId }, function (errorFind, account) {
            if (errorFind) {
                res.status(500).send({ message: 'Error creating id.' });
                throw errorFind;
            }

            let registeredMachine = { machineId }
            const tunnelPort = Math.floor(Math.random() * 40000) + 3000

            registeredMachine.account = account
            registeredMachine.sshHost = sshHost
            registeredMachine.sshPort = sshPort
            registeredMachine.sshUsername = sshUsername
            registeredMachine.sshPassword = sshPassword
            registeredMachine.tunnelPort = tunnelPort
            dbMongo.collection(REGISTERED_MACHINE_COLLECTION).insertOne(registeredMachine, function (error) {
                if (error) {
                    res.status(500).send({ message: 'Error to insert machine.' });
                    throw error;
                }

                if (account) {
                    res.setHeader("Location", "http://" + baseDomain + "/account/" + account.accountId + "/machine/" + machineId);
                    res.json({ machineId: machineId, sshHost: sshHost, sshPort: sshPort, tunnelPort: tunnelPort + "" });
                } else {
                    res.status(404).send({ message: 'No account found with ID: ' + req.params.accountId });
                }

                mongoClient.close();
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
                delete machine._id
                delete machine.account._id
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

