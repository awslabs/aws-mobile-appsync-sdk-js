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

import { userAgent } from "./platform";
import { Credentials, CredentialsOptions } from 'aws-sdk/lib/credentials';

const packageInfo = require("../package.json");

const SERVICE = 'appsync';
export const USER_AGENT_HEADER = 'x-amz-user-agent';
export const USER_AGENT = `aws-amplify/${packageInfo.version}${userAgent && ' '}${userAgent}`;

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

type KeysWithType<O, T> = {
    [K in keyof O]: O[K] extends T ? K : never
}[keyof O];
type AuthOptionsNone = { type: AUTH_TYPE.NONE };
type AuthOptionsIAM = {
    type: KeysWithType<typeof AUTH_TYPE, AUTH_TYPE.AWS_IAM>,
    credentials: (() => Credentials | CredentialsOptions | Promise<Credentials | CredentialsOptions | null>) | Credentials | CredentialsOptions | null,
};
type AuthOptionsApiKey = {
    type: KeysWithType<typeof AUTH_TYPE, AUTH_TYPE.API_KEY>,
    apiKey: (() => (string | Promise<string>)) | string,
};
type AuthOptionsOAuth = {
    type: KeysWithType<typeof AUTH_TYPE, AUTH_TYPE.AMAZON_COGNITO_USER_POOLS> | KeysWithType<typeof AUTH_TYPE, AUTH_TYPE.OPENID_CONNECT>,
    jwtToken: (() => (string | Promise<string>)) | string,
};
export type AuthOptions = AuthOptionsNone | AuthOptionsIAM | AuthOptionsApiKey | AuthOptionsOAuth;

export const authLink = ({ url, region, auth: { type } = <AuthOptions>{}, auth }) => {
    return new ApolloLink((operation, forward) => {
        return new Observable(observer => {
            let handle;

            let promise: Promise<Observable<any>>;

            switch (type) {
                case AUTH_TYPE.NONE:
                    promise = headerBasedAuth(undefined, operation, forward);
                    break;
                case AUTH_TYPE.AWS_IAM:
                    const { credentials = {} } = auth;
                    promise = iamBasedAuth({
                        credentials,
                        region,
                        url,
                    }, operation, forward);
                    break;
                case AUTH_TYPE.API_KEY:
                    const { apiKey = '' } = auth;
                    promise = headerBasedAuth({ header: 'X-Api-Key', value: apiKey }, operation, forward);
                    break;
                case AUTH_TYPE.AMAZON_COGNITO_USER_POOLS:
                case AUTH_TYPE.OPENID_CONNECT:
                    const { jwtToken = '' } = auth;
                    promise = headerBasedAuth({ header: 'Authorization', value: jwtToken }, operation, forward);
                    break;
                default:
                    const error = new Error(`Invalid AUTH_TYPE: ${(<AuthOptions>auth).type}`);

                    throw error;
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

