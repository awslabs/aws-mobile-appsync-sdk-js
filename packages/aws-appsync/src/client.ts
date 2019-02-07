/*!
 * Copyright 2017-2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * Licensed under the Amazon Software License (the "License"). You may not use this file except in compliance with the License. A copy of
 * the License is located at
 *     http://aws.amazon.com/asl/
 * or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
import 'setimmediate';
import ApolloClient, { ApolloClientOptions, MutationOptions, OperationVariables, MutationUpdaterFn } from 'apollo-client';
import { InMemoryCache, ApolloReducerConfig, NormalizedCacheObject } from 'apollo-cache-inmemory';
import { ApolloLink, Observable, FetchResult } from 'apollo-link';
import { createHttpLink } from 'apollo-link-http';
import { Store } from 'redux';

import { OfflineCache, defaultDataIdFromObject } from './cache/index';
import { OfflineCache as OfflineCacheType, METADATA_KEY } from './cache/offline-cache';
import {
    OfflineLink,
    AuthLink,
    AuthType,
} from './link';
import { createStore } from './store';
import { ApolloCache } from 'apollo-cache';
import { AuthOptions } from './link';
import { DocumentNode } from 'graphql';
import { passthroughLink } from './utils';
import ConflictResolutionLink from './link/conflict-resolution-link';
import { createRetryLink } from './link/retry-link';
import { boundEnqueueDeltaSync, buildSync, DELTASYNC_KEY, hashForOptions } from "./deltaSync";
import { Subscription } from 'apollo-client/util/Observable';

export { defaultDataIdFromObject };



export const createAuthLink = ({ authType, url, region }: AuthOptions) => new AuthLink({ authType, url, region });

export const createAppSyncLink = ({
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
        createLinkWithStore((store) => new OfflineLink(store)),
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

export const createLinkWithCache = (createLinkFunc = (cache: ApolloCache<any>) => new ApolloLink(passthroughLink)) => {
    let theLink;

    return new ApolloLink((op, forward) => {
        if (!theLink) {
            const { cache } = op.getContext();

            theLink = createLinkFunc(cache);
        }

        return theLink.request(op, forward);
    });
}

export interface CacheWithStore<T> extends ApolloCache<T> {
    store: Store<OfflineCacheType>
}

const createLinkWithStore = (createLinkFunc = (store: Store<OfflineCacheType>) => new ApolloLink(passthroughLink)) => {
    return createLinkWithCache((cache) => {
        const { store } = cache as CacheWithStore<OfflineCacheType>;

        return store ? createLinkFunc(store) : new ApolloLink(passthroughLink)
    });
}


export interface AWSAppSyncClientOptions {
    url: string,
    region: string,
    authType: AuthType,
    conflictResolver?: ConflictResolver,
    complexObjects?: ApolloLink,
    cacheOptions?: ApolloReducerConfig,
    disableOffline?: boolean,
    offlineConfig?: OfflineConfig,
    subscription?: (string, ApolloLink) => ApolloLink,
}

export interface OfflineConfig {
    storage?: any,
    callback?: OfflineCallback,
    storeCacheRootMutation?: boolean,
};

// TODO: type defs
export type OfflineCallback = (err: any, success: any) => void;

export interface ConflictResolutionInfo {
    mutation: DocumentNode,
    mutationName: string,
    operationType: string,
    variables: any,
    data: any,
    retries: number,
}

export type ConflictResolver = (obj: ConflictResolutionInfo) => 'DISCARD' | any;

class AWSAppSyncClient<TCacheShape extends NormalizedCacheObject> extends ApolloClient<TCacheShape> {

    private _store: Store<OfflineCacheType>
    private hydratedPromise: Promise<AWSAppSyncClient<TCacheShape>>;

    hydrated() {
        return this.hydratedPromise
    };

    private _disableOffline: boolean;

    constructor({
        url,
        region,
        authType,
        conflictResolver,
        complexObjects,
        cacheOptions = {},
        disableOffline = false,
        subscription,
        offlineConfig: {
            storage = undefined,
            callback = () => { },
            storeCacheRootMutation = false,
        } = {},
    }: AWSAppSyncClientOptions, options?: Partial<ApolloClientOptions<TCacheShape>>) {
        const { cache: customCache = undefined, link: customLink = undefined } = options || {};

        if (!customLink && (!url || !region || !authType)) {
            throw new Error(
                'In order to initialize AWSAppSyncClient, you must specify url, region and auth properties on the config object or a custom link.'
            );
        }

        let resolveClient;

        const dataIdFromObject = disableOffline ? () => null : cacheOptions.dataIdFromObject || defaultDataIdFromObject;
        const store = disableOffline ? null : createStore(
            () => this, () => { resolveClient(this); },
            dataIdFromObject,
            storage,
            callback
        );
        const cache: ApolloCache<any> = disableOffline
            ? (customCache || new InMemoryCache(cacheOptions))
            : new OfflineCache({ store, storeCacheRootMutation }, cacheOptions);

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
        const link = waitForRehydrationLink.concat(customLink || createAppSyncLink({ url, region, authType, complexObjects, conflictResolver, subscription }));

        const newOptions = {
            ...options,
            link,
            cache,
        };

        super(newOptions);

        this.hydratedPromise = disableOffline ? Promise.resolve(this) : new Promise(resolve => { resolveClient = resolve; });
        this._disableOffline = disableOffline;
        this._store = store;
    }

    isOfflineEnabled() {
        return !this._disableOffline;
    }

    mutate<T, TVariables = OperationVariables>(options: MutationOptions<T, TVariables>): Promise<FetchResult<T>> {
        if (!this.isOfflineEnabled()) {
            return super.mutate(options);
        }

        const doIt = false;
        const {
            context: origContext,
            optimisticResponse,
            update,
            fetchPolicy,
            ...otherOptions
        } = options;

        const context = {
            ...origContext,
            AASContext: {
                doIt,
                optimisticResponse,
                update,
                fetchPolicy,
                // updateQueries,
                // refetchQueries,
            }
        };

        return super.mutate({
            optimisticResponse,
            context,
            update,
            fetchPolicy,
            ...otherOptions,
        });
    }

    sync<T, TVariables = OperationVariables>(options: SubscribeWithSyncOptions<T, TVariables>): Subscription {
        if (!this.isOfflineEnabled()) {
            throw new Error('Not supported');
        }

        return new Observable<T>(observer => {
            let handle: Subscription;
            const callback = (subscription: Subscription) => {
                handle = subscription;
            };

            (async () => {
                await this.hydrated();

                const hash = hashForOptions(options);
                const itemInHash = this._store.getState()[METADATA_KEY][DELTASYNC_KEY].metadata[hash];
                const { baseLastSyncTimestamp = null } = itemInHash || {};

                boundEnqueueDeltaSync(this._store, { ...options, baseLastSyncTimestamp }, observer, callback);
            })();

            return () => {
                if (handle) {
                    handle.unsubscribe();
                }
            }
        }).subscribe(() => { });
    }
}

export type QuerySyncOptions<T, TVariables = OperationVariables> = {
    query: DocumentNode, variables: TVariables, update: MutationUpdaterFn<T>
};

export type BaseQuerySyncOptions<T, TVariables = OperationVariables> = QuerySyncOptions<T, TVariables> & {
    baseRefreshIntervalInSeconds?: number
};

export type SubscribeWithSyncOptions<T, TVariables = OperationVariables> = {
    baseQuery?: BaseQuerySyncOptions<T, TVariables>,
    subscriptionQuery?: QuerySyncOptions<T, TVariables>,
    deltaQuery?: QuerySyncOptions<T, TVariables>,
};

export default AWSAppSyncClient;
export { AWSAppSyncClient };
export { buildSync };
