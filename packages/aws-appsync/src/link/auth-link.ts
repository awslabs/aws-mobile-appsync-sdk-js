/*!
 * Copyright 2017-2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Observable, Operation, NextLink } from 'apollo-link';
import { ApolloLink } from 'apollo-link';
import { ExecutionResult } from 'graphql';
import { print } from 'graphql/language/printer';

import { Signer } from './signer';
import * as Url from 'url';

import { userAgent } from "../platform";
import { Credentials, CredentialsOptions } from 'aws-sdk/lib/credentials';

const packageInfo = require("../../package.json");

const SERVICE = 'appsync';
const USER_AGENT_HEADER = 'x-amz-user-agent';
const USER_AGENT = `aws-amplify/${packageInfo.version}${userAgent && ' '}${userAgent}`;

export enum AUTH_TYPE {
    NONE = 'NONE',
    API_KEY = 'API_KEY',
    AWS_IAM = 'AWS_IAM',
    AMAZON_COGNITO_USER_POOLS = 'AMAZON_COGNITO_USER_POOLS',
    OPENID_CONNECT = 'OPENID_CONNECT',
}

export class AuthLink extends ApolloLink {

    private link: ApolloLink;

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

interface Headers {
    header: string,
    value: string | (() => (string | Promise<string>))
}

const headerBasedAuth = async ({ header, value }: Headers = { header: '', value: '' }, operation, forward) => {
    const origContext = operation.getContext();
    let headers = {
        ...origContext.headers,
        [USER_AGENT_HEADER]: USER_AGENT,
    };

    if (header && value) {
        const headerValue = typeof value === 'function' ? await value.call(undefined) : await value;

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

    const { headers } = Signer.sign(formatted, { access_key: accessKeyId, secret_key: secretAccessKey, session_token: sessionToken });

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

export interface AuthOptions {
    type: AUTH_TYPE,
    credentials?: (() => Credentials | CredentialsOptions | null | Promise<Credentials | CredentialsOptions | null>) | Credentials | CredentialsOptions | null,
    apiKey?: (() => (string | Promise<string>)) | string,
    jwtToken?: (() => (string | Promise<string>)) | string,
};

export const authLink = ({ url, region, auth: { type = AUTH_TYPE.NONE, credentials = {}, apiKey = '', jwtToken = '' } = <AuthOptions>{} }) => {
    return new ApolloLink((operation, forward) => {
        return new Observable(observer => {
            let handle;

            let promise: Promise<Observable<any>>;

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
        variables: removeTemporaryVariables(variables),
        query: print(query)
    };

    return {
        body: JSON.stringify(body),
        method: 'POST',
        ...options,
        headers: {
            accept: '*/*',
            'content-type': 'application/json; charset=UTF-8',
            ...options.headers,
        },
    };
}

/**
 * Removes all temporary variables (starting with '@@') so that the signature matches the final request.
 */
const removeTemporaryVariables = (variables: any) =>
  Object.keys(variables)
    .filter(key => !key.startsWith("@@"))
    .reduce((acc, key) => {
      acc[key] = variables[key];
      return acc;
    }, {});

