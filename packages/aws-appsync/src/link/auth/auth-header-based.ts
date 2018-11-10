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


export function authNone() {
    return new AuthHeaderBased({ header: '', value: '' });
}

export function authCognito(jwtToken: string | (() => (string | Promise<string>))) {
    return new AuthHeaderBased({ header: 'Authorization', value: jwtToken });
}

export function authOpenID(jwtToken: string | (() => (string | Promise<string>))) {
    return new AuthHeaderBased({ header: 'Authorization', value: jwtToken });
}

export function authApiKey(apiKey: string | (() => (string | Promise<string>))) {
    return new AuthHeaderBased({ header: 'X-Api-Key', value: apiKey });
}