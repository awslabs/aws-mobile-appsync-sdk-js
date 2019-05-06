/*!
 * Copyright 2017-2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { ApolloError } from 'apollo-client';
import { Observable, Operation } from 'apollo-link';
import { ApolloLink } from 'apollo-link';
import { getOperationDefinition } from "apollo-utilities";
import { ExecutionResult, GraphQLError } from 'graphql';

import upload from "./complex-object-link-uploader";
import { AWSAppsyncGraphQLError } from '../types';

export class ComplexObjectLink extends ApolloLink {

    private link: ApolloLink;

    constructor(credentials) {
        super();

        this.link = complexObjectLink(credentials);
    }

    request(operation, forward) {
        return this.link.request(operation, forward);
    }
}

export const complexObjectLink = (credentials) => {
    return new ApolloLink((operation, forward) => {
        return new Observable(observer => {
            let handle;

            const { operation: operationType } = getOperationDefinition(operation.query);
            const isMutation = operationType === 'mutation';
            const objectsToUpload = isMutation ? findInObject(operation.variables) : {};

            let uploadPromise = Promise.resolve(operation);

            if (Object.keys(objectsToUpload).length) {
                const uploadCredentials = typeof credentials === 'function' ? credentials.call() : credentials;

                uploadPromise = Promise.resolve(uploadCredentials)
                    .then(credentials => {
                        const uploadPromises = Object.entries(objectsToUpload).map(([_, fileField]) => upload(fileField, { credentials }));

                        return Promise.all([operation, ...uploadPromises] as Promise<any>[]);
                    })
                    .then(([operation, ...all]) => operation)
                    .catch(err => {
                        const error = new GraphQLError(err.message);
                        (error as AWSAppsyncGraphQLError).errorType = 'AWSAppSyncClient:S3UploadException'

                        throw new ApolloError({
                            graphQLErrors: [error],
                            extraInfo: err,
                        });
                    });
            }

            uploadPromise
                .then(forward)
                .then(observable => {
                    handle = observable.subscribe({
                        next: observer.next.bind(observer),
                        error: observer.error.bind(observer),
                        complete: observer.complete.bind(observer),
                    });
                }).catch(err => {
                    observer.error(err);
                });

            return () => {
                if (handle) handle.unsubscribe();
            };
        });
    });
}

const complexObjectFields = [
    { name: 'bucket', type: 'string' },
    { name: 'key', type: 'string' },
    { name: 'region', type: 'string' },
    { name: 'mimeType', type: 'string' },
    { name: 'localUri', type: ['object', 'string'] },
];
const findInObject = obj => {
    const testFn = val => {
        return complexObjectFields.every(field => {
            const hasValue = val[field.name];
            const types: string[] = Array.isArray(field.type) ? field.type : [field.type];
            const isOfType = hasValue && types.reduce((prev, curr) => {
                return prev || typeof val[field.name] === curr;
            }, false);

            return isOfType;
        });
    };

    const _findInObject = (obj, path = '', acc = {}) => {
        if (!obj) {
            return acc;
        }

        if (testFn(obj)) {
            acc[path] = { ...obj };
            delete obj.mimeType;
            delete obj.localUri;
        }

        if (typeof obj === 'object') {
            Object.keys(obj).forEach(key => {
                const val = obj[key];

                if (Array.isArray(val)) {
                    val.forEach((v, i) => _findInObject(v, `${path}.${key}[${i}]`, acc));
                } else if (typeof val === 'object') {
                    _findInObject(val, `${path}${path && '.'}${key}`, acc);
                }
            });
        }

        return _findInObject(null, path, acc);
    };

    return _findInObject(obj);
};
