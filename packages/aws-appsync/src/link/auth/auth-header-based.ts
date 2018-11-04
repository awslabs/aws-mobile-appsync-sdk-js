import { AuthType } from "./auth-type";

export interface HeadersBased {
    header: string,
    value: string | (() => (string | Promise<string>))
}

export class AuthHeaderBased extends AuthType {

    constructor(header: HeadersBased) {
        super(header);
    }

    async getExtraHeader(operation, url, region) {
        const { header, value } = this.getOptions();
        const headerValue = typeof value === 'function' ? await value.call(undefined) : await value;
        return {
            ...{ [header]: headerValue }
        };
    }
}

export const AUTH_NONE = new AuthHeaderBased({ header: '', value: '' });


class AuthJWT extends AuthHeaderBased {
    
    constructor(jwtToken: string | (() => (string | Promise<string>))) {
        super( { header: 'Authorization', value: jwtToken });
    }
}

export class AuthCognito extends AuthJWT {};

export class AuthOpenID extends AuthJWT {};


export class AuthApiKey extends AuthHeaderBased {
    
    constructor(apiKey: string | (() => (string | Promise<string>))) {
        super( { header: 'X-Api-Key', value: apiKey });
    }
}