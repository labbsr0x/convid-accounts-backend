'use strict';

const Express = require('express');
const MongoClient = require('mongodb').MongoClient;
const PrometheusClient = require('prom-client');
const BodyParser = require('body-parser');

const PORT = 9999;
const HOST = '0.0.0.0';

const MONGO_TABLE = 'db_convid';
const MONGO_COLLECTIONS = 'accounts';

const app = Express();
const metrics = configureMetrics();
configureMiddlewares();
configureRoutes();

app.listen(PORT, HOST);
console.log(`Running on http://${HOST}:${PORT}`);


function configureMiddlewares() {
    //Configure recept of JSON body.
    app.use(BodyParser.json());

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
        res.send('Convid - accounts backend');
    });

    app.post('/accounts', (req, res) => {
        insertAccounts(req, res);
    });

    app.get('/accounts', (req, res) => {
        listAccounts(res);
    });

    app.get('/metrics', (req, res) => {
        connectExporter(res);
    });

    app.post('/accounts/:email/machine/', (req, res) => {
        getMachineId(req, res);
    })

    app.post('/accounts/:email/machine/:id', (req, res) => {
        getMachine(req, res);
    })

}

function insertAccounts(req, res) {
    const mongoClient = new MongoClient(process.env.URL_MONGODB_SENHA);

    mongoClient.connect(function (error) {
        if (error) {
            throw error;
        }

        const dbMongo = mongoClient.db(MONGO_TABLE);

        if (Array.isArray(req.body)) {
            dbMongo.collection(MONGO_COLLECTIONS).insertMany(req.body, function (error, accountsInserted) {
                if (error) {
                    res.status(500).send({ message: 'Error to insert accounts.' });
                    throw error;
                }

                res.status(200).send(accountsInserted.ops);
                mongoClient.close();
            });
        } else {
            dbMongo.collection(MONGO_COLLECTIONS).insertOne(req.body, function (error, accountInserted) {
                if (error) {
                    res.status(500).send({ message: 'Error to insert account.' });
                    throw error;
                }

                res.status(200).send(accountInserted.ops);
                mongoClient.close();
            });
        }

    });
}

function listAccounts(res) {
    const mongoClient = new MongoClient(process.env.URL_MONGODB_SENHA);

    mongoClient.connect(function (error) {
        if (error) {
            res.status(500).send({ message: 'Error to list accounts.' });
            throw error;
        }

        const dbMongo = mongoClient.db(MONGO_TABLE);

        dbMongo.collection(MONGO_COLLECTIONS).findOne({}, function (errorFind, accounts) {
            if (errorFind) {
                throw errorFind;
            }

            res.send(accounts);
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

function getMachineId(req, res) {

    const mongoClient = new MongoClient(process.env.URL_MONGODB_SENHA);
    const baseDomain = process.env.BASE_DOMAIN
    const accounts = req.body

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

        dbMongo.collection(MONGO_COLLECTIONS).findOne({ email: accounts.email }, function (errorFind, accounts) {
            if (errorFind) {
                res.status(500).send({ message: 'Error creating id.' });
                throw errorFind;
            }

            if (accounts) {
                accounts.machineId = machineId;


                try {
                    dbMongo.collection(MONGO_COLLECTIONS).updateOne(
                        { email: accounts.email },
                        { $set: { "machineId": machineId, } })
                } catch (error) {
                    console.error(error);
                    res.status(500).send({ message: "Error creating id" })
                }

                res.setHeader("Content-Type", "text/plain")
                res.setHeader("Location", "http://" + baseDomain + "/account/" + accounts.email + "/machine/" + machineId);
                res.send(machineId);
            } else {
                res.status(500).send({ message: 'Machine not registered.' });
            }

            mongoClient.close();
        });

    });
}


function getMachine(req, res) {

    const mongoClient = new MongoClient(process.env.URL_MONGODB_SENHA);
    const baseDomain = process.env.BASE_DOMAIN
    const accounts = req.body

    mongoClient.connect(function (error) {
        if (error) {
            res.status(500).send({ message: 'Error retrieving machine.' });
            throw error;
        }

        const dbMongo = mongoClient.db(MONGO_TABLE);

        dbMongo.collection(MONGO_COLLECTIONS).findOne({ email: accounts.email }, function (errorFind, accounts) {
            if (errorFind) {
                res.status(500).send({ message: 'Error creating id.' });
                throw errorFind;
            }

            if (accounts) {
                res.setHeader("Content-Type", "application/json")
                const response = {"machineId": accounts.machineId, "machinePort": 1234}
                res.send(response);
            } else {
                res.status(500).send({ message: 'Machine not registered.' });
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

