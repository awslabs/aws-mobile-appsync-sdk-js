/*!
 * Copyright 2017-2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * Licensed under the Amazon Software License (the "License"). You may not use this file except in compliance with the License. A copy of 
 * the License is located at
 *     http://aws.amazon.com/asl/
 * or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY 
 * KIND, express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
import { ApolloError } from 'apollo-client';
import { Observable, Operation } from 'apollo-link';
import { ApolloLink } from 'apollo-link';
import { getOperationDefinition } from "apollo-utilities";
import { GraphQLError } from 'graphql';

import * as S3 from 'aws-sdk/clients/s3';

export class ComplexObjectLink extends ApolloLink {

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
            const fileField = isMutation && findInObject(operation.variables);

            let uploadPromise = Promise.resolve();

            if (fileField) {
                const {
                    bucket: Bucket,
                    key: Key,
                    region,
                    mimeType: ContentType,
                    localUri: Body,
                } = fileField;
                const s3 = new S3({
                    credentials,
                    region,
                });

                uploadPromise = s3.upload({
                    Bucket,
                    Key,
                    Body,
                    ContentType,
                }).promise().catch(err => {
                    const error = new GraphQLError(err.message);
                    error.errorType = 'AWSAppSyncClient:S3UploadException'

                    throw new ApolloError({
                        graphQLErrors: [error],
                    });
                });
            }

            const promise = uploadPromise.then(() => forward(operation));

            promise.then(observable => {
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
    { name: 'localUri', type: 'object' },
];
const findInObject = obj => {
    let which;

    const _findInObject = obj => {
        return Object.keys(obj).find(key => {
            const val = obj[key];

            if (typeof val === 'object') {
                const hasFields = complexObjectFields.every(field => val[field.name] && typeof val[field.name] === field.type);

                if (hasFields) {
                    which = val;
                    return true;
                }

                return _findInObject(val);
            }

            return false;
        });
    }

    _findInObject(obj);

    return which;
};

const formatAsRequest = ({ operationName, variables, query }, options) => {
    const body = {
        operationName,
        variables,
        query: print(query)
    };

    return {
        body: JSON.stringify(body),
        method: 'POST',
        ...options,
        headers: {
            accept: '*/*',
            'content-type': 'application/json; charset=utf-8',
            ...options.headers,
        },
    };
}
