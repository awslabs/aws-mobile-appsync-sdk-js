import { ApolloLink, Observable } from 'apollo-link';
const packageInfo = require("../../../package.json");

import { userAgent } from "../../platform";
import { AuthType } from './auth-type';
const USER_AGENT_HEADER = 'x-amz-user-agent';
const USER_AGENT = `aws-amplify/${packageInfo.version}${userAgent && ' '}${userAgent}`;


export class AuthLink extends ApolloLink {

    private link: ApolloLink;
    private options: AuthOptions;

    constructor(options: AuthOptions) {
        super();
        this.options = options;
        this.link = this.authLink();
    }

    request(operation, forward) {
        return this.link.request(operation, forward);
    }

    async getPromise(operation, forward) {
        const {authType, url, region} = this.options;
        const origContext = operation.getContext();
        let headers = {
            ...origContext.headers,
            [USER_AGENT_HEADER]: USER_AGENT,
        };
        const extraHeaders = await authType.getExtraHeader(operation, url, region);
        operation.setContext({
            ...origContext,
            headers: {
                ...headers,
                ...extraHeaders
            },
        });
        return forward(operation);
    };

    authLink() {
        return new ApolloLink((operation, forward) => {
            return new Observable(observer => {
                let handle;
    
                let promise: Promise<Observable<any>> = this.getPromise(operation, forward);
    
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
}

export interface AuthOptions {
    authType: AuthType,
    url: string,
    region: string
};
