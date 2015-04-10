var Lighter = require('nodejs-lighter');
var config = require('./config.sample.json');
var ServiceClient = require('../index');

var lighter = new Lighter(config);
var logger = lighter.logger;
var middlewares = lighter.middlewares;

lighter.use(middlewares.contextCreator());
lighter.use(middlewares.logger(logger));

var serviceClient = new ServiceClient({
    registry: config.serviceRegistry,
    serviceName: 'configuration-service'
});

lighter.get('/config', function (req, res, next) {
    serviceClient.get('/sections/databases').then(function (result) {
        next({body: result});
    }).catch(function (error) {
        next(error);
    });
});

lighter.use(middlewares.responder);

lighter.run();

