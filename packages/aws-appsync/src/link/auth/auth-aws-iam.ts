const SERVICE = 'appsync';
import { Signer } from '../signer';
import * as Url from 'url';
import { Credentials, CredentialsOptions } from 'aws-sdk/lib/credentials';
import { print } from 'graphql/language/printer';
import { AuthType } from "./auth-type";

interface HeadersIam {
    credentials?: (() => Credentials | CredentialsOptions | null | Promise<Credentials | CredentialsOptions | null>) | Credentials | CredentialsOptions | null,
}

export class AuthAwsIAM extends AuthType {

    constructor(header: HeadersIam) {
        super(header);
    }

    async getExtraHeader(operation, url, region) {
        const { credentials } = this.getOptions();
        const service = SERVICE;

        // qui ho dovuto castarlo come any, probabilmente colpa di typescript solamente
        let creds = typeof credentials === 'function' ? (credentials as any).call() : (credentials || {});

        if (creds && typeof creds.getPromise === 'function') {
            await creds.getPromise();
        }

        const { accessKeyId, secretAccessKey, sessionToken } = await creds;

        const { host, path } = Url.parse(url);

        const formatted = {
            ...this.formatAsRequest(operation, {}),
            service, region, url, host, path
        };

        return Signer.sign(formatted, { access_key: accessKeyId, secret_key: secretAccessKey, session_token: sessionToken });
    }

    formatAsRequest = ({ operationName, variables, query }, options) => {
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
                'content-type': 'application/json; charset=UTF-8',
                ...options.headers,
            },
        };
    }
}