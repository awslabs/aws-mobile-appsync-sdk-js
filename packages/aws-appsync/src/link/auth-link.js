/*!
 * Copyright 2017-2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * Licensed under the Amazon Software License (the "License"). You may not use this file except in compliance with the License. A copy of 
 * the License is located at
 *     http://aws.amazon.com/asl/
 * or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY 
 * KIND, express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
import { Observable, Operation, NextLink } from 'apollo-link';
import { ApolloLink } from 'apollo-link';
import { print } from 'graphql/language/printer';

import aws4 from './signer/signer';
import * as Url from 'url';

import { userAgent } from "../platform";

const packageInfo = require("../../package.json");

const SERVICE = 'appsync';
const USER_AGENT_HEADER = 'x-amz-user-agent';
const USER_AGENT = `aws-amplify/${packageInfo.version}${userAgent && ' '}${userAgent}`;

export const AUTH_TYPE = {
    NONE: 'NONE',
    API_KEY: 'API_KEY',
    AWS_IAM: 'AWS_IAM',
    AMAZON_COGNITO_USER_POOLS: 'AMAZON_COGNITO_USER_POOLS',
    OPENID_CONNECT: 'OPENID_CONNECT',
}

export class AuthLink extends ApolloLink {

    /**
     * 
     * @param {*} options
     */
    constructor(options) {
        super();

        this.link = authLink(options);
    }

    request(operation, forward) {
        return this.link.request(operation, forward);
    }
}

const headerBasedAuth = async ({ header, value } = { header: '', value: '' }, operation, forward) => {
    const origContext = operation.getContext();
    let headers = {
        ...origContext.headers,
        [USER_AGENT_HEADER]: USER_AGENT,
    };

    if (header && value) {
        const headerValue = typeof value === 'function' ? await value.call() : await value;

        headers = {
            ...{ [header]: headerValue },
            ...headers
        };
    }

    operation.setContext({
        ...origContext,
        headers,
    });

    return forward(operation);

};

const iamBasedAuth = async ({ credentials, region, url }, operation, forward) => {
    const service = SERVICE;
    const origContext = operation.getContext();

    let creds = typeof credentials === 'function' ? credentials.call() : (credentials || {});

    if (creds && typeof creds.getPromise === 'function') {
        await creds.getPromise();
    }

    const { accessKeyId, secretAccessKey, sessionToken } = await creds;

    const { host, path } = Url.parse(url);

    const formatted = {
        ...formatAsRequest(operation, {}),
        service, region, url, host, path
    };

    const { headers } = aws4.sign(formatted, { access_key: accessKeyId, secret_key: secretAccessKey, session_token: sessionToken });

    operation.setContext({
        ...origContext,
        headers: {
            ...origContext.headers,
            ...headers,
            [USER_AGENT_HEADER]: USER_AGENT,
        },
    });

    return forward(operation);
}

export const authLink = ({ url, region, auth: { type, credentials, apiKey, jwtToken } = {} }) => {
    return new ApolloLink((operation, forward) => {
        return new Observable(observer => {
            let handle;

            let promise = Promise.resolve();

            switch (type) {
                case AUTH_TYPE.NONE:
                    promise = headerBasedAuth(undefined, operation, forward);
                    break;
                case AUTH_TYPE.AWS_IAM:
                    promise = iamBasedAuth({
                        credentials,
                        region,
                        url,
                    }, operation, forward);
                    break;
                case AUTH_TYPE.API_KEY:
                    promise = headerBasedAuth({ header: 'X-Api-Key', value: apiKey }, operation, forward);
                    break;
                case AUTH_TYPE.AMAZON_COGNITO_USER_POOLS:
                case AUTH_TYPE.OPENID_CONNECT:
                    promise = headerBasedAuth({ header: 'Authorization', value: jwtToken }, operation, forward);
                    break;
                default:
                    throw new Error(`Invalid AUTH_TYPE: ${type}`);
            }

            promise.then(observable => {
                handle = observable.subscribe({
                    next: observer.next.bind(observer),
                    error: observer.error.bind(observer),
                    complete: observer.complete.bind(observer),
                });
            })

            return () => {
                if (handle) handle.unsubscribe();
            };
        });
    });
}

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
