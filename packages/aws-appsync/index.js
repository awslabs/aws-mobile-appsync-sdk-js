"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var apollo_utilities_1 = require("apollo-utilities");
var apollo_link_1 = require("apollo-link");
var crypto = require('aws-sdk/lib/browserCryptoLib');
exports.passthroughLink = function (op, forward) { return (forward ? forward(op) : apollo_link_1.Observable.of()); };
exports.isUuid = function (val) { return typeof val === 'string' && val.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i); };
exports.getOperationFieldName = function (operation) { return apollo_utilities_1.resultKeyNameFromField(operation.definitions[0].selectionSet.selections[0]); };
exports.hash = function (src) { return crypto.createHash('sha256').update(src || {}, 'utf8').digest('hex'); };
