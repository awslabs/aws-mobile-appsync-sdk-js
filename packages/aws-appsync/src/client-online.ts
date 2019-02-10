/*!
 * Copyright 2017-2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * Licensed under the Amazon Software License (the "License"). You may not use this file except in compliance with the License. A copy of
 * the License is located at
 *     http://aws.amazon.com/asl/
 * or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
import 'setimmediate';
import ApolloClient, { ApolloClientOptions } from 'apollo-client';
import { InMemoryCache, ApolloReducerConfig, NormalizedCacheObject } from 'apollo-cache-inmemory';
import { ApolloLink, Observable } from 'apollo-link';
import { createHttpLink } from 'apollo-link-http';
import {
    AuthLink,
    AuthType,
} from './link';
import { ApolloCache } from 'apollo-cache';
import { AuthOptions } from './link';
import { DocumentNode } from 'graphql';
import { passthroughLink } from './utils';
import ConflictResolutionLink from './link/conflict-resolution-link';
import { createRetryLink } from './link/retry-link';



export const createAuthLink = ({ authType, url, region }: AuthOptions) => new AuthLink({ authType, url, region });

export const createAppSyncOnlineLink = ({
    url,
    region,
    authType,
    complexObjects,
    resultsFetcherLink = createHttpLink({ uri: url }),
    conflictResolver,
    subscription,
}: {
    url: string,
    region: string,
    authType: AuthType,
    complexObjects: ApolloLink,
    resultsFetcherLink?: ApolloLink,
    conflictResolver?: ConflictResolver,
    subscription?: (string, ApolloLink) => ApolloLink,
}) => {
    const link = ApolloLink.from([
        new ConflictResolutionLink(conflictResolver),
        complexObjects,//new ComplexObjectLink(complexObjectsCredentials),
        subscription ? createRetryLink(ApolloLink.from([
            createAuthLink({ authType, url, region }),
            subscription(url, resultsFetcherLink)])) :
            createRetryLink(ApolloLink.from([
                createAuthLink({ authType, url, region }), resultsFetcherLink]))

    ].filter(Boolean));

    return link;
};


export interface AWSAppSyncClientOnlineOptions {
    url: string,
    region: string,
    authType: AuthType,
    conflictResolver?: ConflictResolver,
    complexObjects?: ApolloLink,
    cacheOptions?: ApolloReducerConfig,
    subscription?: (string, ApolloLink) => ApolloLink,
}


export interface ConflictResolutionInfo {
    mutation: DocumentNode,
    mutationName: string,
    operationType: string,
    variables: any,
    data: any,
    retries: number,
}

export type ConflictResolver = (obj: ConflictResolutionInfo) => 'DISCARD' | any;

class AWSAppSyncClientOnline<TCacheShape extends NormalizedCacheObject> extends ApolloClient<TCacheShape> {

    private hydratedPromise: Promise<AWSAppSyncClientOnline<TCacheShape>>;

    hydrated() {
        return this.hydratedPromise
    };

    constructor({
        url,
        region,
        authType,
        conflictResolver,
        complexObjects,
        cacheOptions = {},
        subscription,
    }: AWSAppSyncClientOnlineOptions, options?: Partial<ApolloClientOptions<TCacheShape>>) {
        const { cache: customCache = undefined, link: customLink = undefined } = options || {};

        if (!customLink && (!url || !region || !authType)) {
            throw new Error(
                'In order to initialize AWSAppSyncClient, you must specify url, region and auth properties on the config object or a custom link.'
            );
        }
        
        const cache: ApolloCache<any> = (customCache || new InMemoryCache(cacheOptions))

        const waitForRehydrationLink = new ApolloLink((op, forward) => {
            let handle = null;

            return new Observable(observer => {
                this.hydratedPromise.then(() => {
                    handle = passthroughLink(op, forward).subscribe(observer);
                }).catch(observer.error);

                return () => {
                    if (handle) {
                        handle.unsubscribe();
                    }
                };
            });
        });
        const link = waitForRehydrationLink.concat(customLink || createAppSyncOnlineLink({ url, region, authType, complexObjects, conflictResolver, subscription }));

        const newOptions = {
            ...options,
            link,
            cache,
        };

        super(newOptions);

        this.hydratedPromise = Promise.resolve(this);
    }
}

export default AWSAppSyncClientOnline;
export { AWSAppSyncClientOnline };
