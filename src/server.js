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
        if(req.path !== '/metrics') {
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

    app.post('/accounts/:email/machine', (req,res) => {
        getMachineId(res);
    })

}

function insertAccounts(req, res) {
    const mongoClient = new MongoClient(process.env.URL_MONGODB_SENHA);

    mongoClient.connect(function(error) {
        if (error) {
            throw error;
        }

        const dbMongo = mongoClient.db(MONGO_TABLE);

        if (Array.isArray(req.body)) {
            dbMongo.collection(MONGO_COLLECTIONS).insertMany(req.body, function(error, accountsInserted) {
                if (error) {
                    res.status(500).send({message: 'Error to insert accounts.'});
                    throw error;
                }
                
                res.status(200).send(accountsInserted.ops);
                mongoClient.close();
            });
        } else {
            dbMongo.collection(MONGO_COLLECTIONS).insertOne(req.body, function(error, accountInserted) {
                if (error) {
                    res.status(500).send({message: 'Error to insert account.'});
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

    mongoClient.connect(function(error) {
        if (error) {
            res.status(500).send({message: 'Error to list accounts.'});
            throw error;
        }

        const dbMongo = mongoClient.db(MONGO_TABLE);

        dbMongo.collection(MONGO_COLLECTIONS).findOne({}, function(errorFind, accounts) {
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

function getMachineId(res) {

    const mongoClient = new MongoClient(process.env.URL_MONGODB_SENHA);

    mongoClient.connect(function(error) {
        if (error) {
            res.status(500).send({message: 'Error creating id.'});
            throw error;
        }

        const dbMongo = mongoClient.db(MONGO_TABLE);

        dbMongo.collection(MONGO_COLLECTIONS).findOne({}, function(errorFind, accounts) {
            if (errorFind) {
                res.status(500).send({message: 'Machine not registered.'});
                throw errorFind;
            }
            
            res.setHeader("Content-Type", "text/plain")
            res.setHeader("Location", "http://anyserver.com/account/"+accounts.email+"/machine/ABC1234");
            res.send("ABC1234");
            mongoClient.close();
        });

    });

}
