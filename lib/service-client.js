var Promise = require('bluebird');
var EventEmitter = require('events').EventEmitter;
var request = require('request');
var SocketClient = require('socket.io-client');
var u = require('underscore');
var util = require('util');

var version = require('../package.json').version;

function ServiceClient(options) {
    this.serviceName = options.serviceName;
    this.registry = options.registry;
    this.timeout = options.timeout || 3000;
    this.logger = options.logger || console;
    this.services = null;
    this.clientId = options.clientId;
    this.companyCode = options.companyCode;

    var self = this,
        registry = this.registry,
        logger = this.logger;

    this.socket = SocketClient('http://' + registry.host + ':' + registry.port);
    this.socket.on('connect', function () {
        logger.trace('Connected to service registry.');
        refreshServicesConfig(self);
    });
    this.socket.on('serviceChanged', function (data) {
        var serviceName = data.serviceName;
        logger.trace("Config of '%s' changed.", serviceName);

        self.services = null;
        //self.emit('change', data);
    });
}

util.inherits(ServiceClient, EventEmitter);


function getServicesConfigFromRegistry(self, companyCode) {
    return new Promise(function (resolve, reject) {
        var logger = self.logger,
            registry = self.registry,
            host = registry.host,
            port = registry.port,
            serviceName = self.serviceName,
            url = 'http://' + host + ':' + port + '/v1/services/' + encodeURIComponent(serviceName),
            requestOptions = {
                headers: {
                    Accept: 'application/json',
                    'Accept-Language': 'en-US',
                    'Content-Type': 'application/json',
                    'User-Agent': 'service-client/' + version,
                    'x-company-code': companyCode
                },
                url: url,
                timeout: registry.timeout || 3000,
                json: true
            };

            logger.trace("getting service config from registry: " + url);
            request.get(requestOptions, function (error, response, body) {
                if (error) {
                    reject(error);
                    return;
                }

                if (typeof body === 'string') {
                    body = JSON.parse(body);
                }

                if (response.statusCode != 200) {
                    error = body && body.meta && body.meta.error;
                    reject(error);
                    return;
                }
                resolve(body.response);
            });
    });
}

function refreshServicesConfig(self) {
    getServicesConfigFromRegistry(self).then(function (services) {
        self.services = services;
    });
}

ServiceClient.prototype.request = function (requestUri, options) {
    var self = this,
        logger = this.logger;

    logger.trace("begin request service '" + self.serviceName + "'");
    return new Promise(function (resolve, reject) {
        Promise.resolve().then(function () {
            if (self.services) {
                return;
            }

            return getServicesConfigFromRegistry(self).then(function (services) {
                self.services = services;
            });
        }).then(function () {
            if (!self.services || !self.services.length) {
                throw new Error("Unknown service '" + self.serviceName + "'. Please check the service name.");
            }

            var service = self.services[0],
                host = service.host,
                port = service.port,
                apiUri = service['api-uri'],
                url = 'http://' + host + ':' + port + apiUri + requestUri,
                companyCode = options.companyCode || self.companyCode,
                clientId = options.clientId || self.clientId,
                requestOptions = {
                    method: options.method,
                    headers: u.extend({
                        Accept: 'application/json',
                        'Accept-Language': 'en-US',
                        'Content-Type': 'application/json',
                        'User-Agent': 'service-client/' + version,
                        'x-company-code': companyCode,
                        'x-client-id': clientId
                    }, options.headers),
                    url: url,
                    timeout: self.timeout || 5000,
                    json: options.body
                };

            logger.trace("sending request to '" + self.serviceName + "': " + url);
            request(requestOptions, function (error, response, body) {
                if (error) {
                    reject(error);
                    return;
                }

                if (typeof body === 'string') {
                    body = JSON.parse(body);
                }

                if (response.statusCode != 200) {
                    error = body && body.meta && body.meta.error;
                    reject(error);
                    return;
                }
                resolve(body.response);
            });
        });
    });
}

ServiceClient.prototype.get = function (uri, options) {
    if (!options) {
        options = {};
    }

    options.method = 'GET';
    return this.request(uri, options);
};

ServiceClient.prototype.post = function (uri, options) {
    if (!options) {
        options = {};
    }

    options.method = 'POST';
    return this.request(uri, options);
};

ServiceClient.prototype.put = function (uri, options) {
    if (!options) {
        options = {};
    }

    options.method = 'PUT';
    return this.request(uri, options);
};

ServiceClient.prototype.del = ServiceClient.prototype.delete = function (uri, options) {
    if (!options) {
        options = {};
    }

    options.method = 'DELETE';
    return this.request(uri, options);
};

module.exports = ServiceClient;