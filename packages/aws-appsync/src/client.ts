/*!
 * Copyright 2017-2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import 'setimmediate';
import ApolloClient, { ApolloClientOptions, MutationOptions, OperationVariables, MutationUpdaterFn } from 'apollo-client';
import { InMemoryCache, ApolloReducerConfig, NormalizedCacheObject } from 'apollo-cache-inmemory';
import { ApolloLink, Observable, FetchResult, NextLink } from 'apollo-link';
import { createHttpLink } from 'apollo-link-http';
import { getMainDefinition } from 'apollo-utilities';
import { ApolloLink as ApolloLinkV3 } from "@apollo/client";
import { Store } from 'redux';

import { OfflineCache, defaultDataIdFromObject } from './cache/index';
import { OfflineCache as OfflineCacheType, METADATA_KEY } from './cache/offline-cache';
import {
    OfflineLink,
    ComplexObjectLink,
} from './link';
import { createStore, StoreOptions, DEFAULT_KEY_PREFIX } from './store';
import { ApolloCache } from 'apollo-cache';
import { AuthOptions, AuthLink, AUTH_TYPE } from 'aws-appsync-auth-link';
import { createSubscriptionHandshakeLink } from 'aws-appsync-subscription-link';
import { Credentials, CredentialsOptions } from 'aws-sdk/lib/credentials';
import { OperationDefinitionNode, DocumentNode } from 'graphql';
import { passthroughLink } from './utils';
import ConflictResolutionLink from './link/conflict-resolution-link';
import { createRetryLink } from './link/retry-link';
import { boundEnqueueDeltaSync, buildSync, DELTASYNC_KEY, hashForOptions } from "./deltaSync";
import { Subscription } from 'apollo-client/util/Observable';
import { PERMANENT_ERROR_KEY } from './link/retry-link';


export { defaultDataIdFromObject };

class CatchErrorLink extends ApolloLink {
    
    private link: ApolloLink;
    
    constructor(linkGenerator: () => ApolloLink) {
        try {
            super();
            this.link = linkGenerator();
        } catch (error) {
            error[PERMANENT_ERROR_KEY] = true;
            throw error;
        }
    }

    request(operation, forward?: NextLink) {
        return this.link.request(operation, forward);
    }
}

class PermanentErrorLink extends ApolloLink {

    private link: ApolloLink;

    constructor(link: ApolloLink) {
        super();

        this.link = link;
    }

    request(operation, forward?: NextLink) {
        return new Observable(observer => {
            const subscription = this.link.request(operation, forward).subscribe({
                next: observer.next.bind(observer),
                error: err => {
                    if (err.permanent) {
                        err[PERMANENT_ERROR_KEY] = true;
                    }
                    observer.error.call(observer, err);
                },
                complete: observer.complete.bind(observer)
            })

            return () => {
                subscription.unsubscribe();
            }
        });
    }
}

export const createAppSyncLink = ({
    url,
    region,
    auth,
    complexObjectsCredentials,
    resultsFetcherLink = createHttpLink({ uri: url }),
    conflictResolver,
}: {
    url: string,
    region: string,
    auth: AuthOptions,
    complexObjectsCredentials: CredentialsGetter,
    resultsFetcherLink?: ApolloLink,
    conflictResolver?: ConflictResolver,
}) => {
    const link = ApolloLink.from([
        createLinkWithStore((store) => new OfflineLink(store)),
        new ConflictResolutionLink(conflictResolver),
        new ComplexObjectLink(complexObjectsCredentials),
        createRetryLink(ApolloLink.from([
            new CatchErrorLink(() =>new AuthLink({ url, region, auth }) as unknown as ApolloLink),
            new PermanentErrorLink(createSubscriptionHandshakeLink(
                { url, region, auth }, 
                resultsFetcherLink  as unknown as ApolloLinkV3)  as unknown as ApolloLink,
            )
        ]))
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

type CredentialsGetter = () => (Credentials | CredentialsOptions | Promise<Credentials> | Promise<CredentialsOptions> | null) | Credentials | CredentialsOptions | Promise<Credentials> | Promise<CredentialsOptions> | null;

export interface AWSAppSyncClientOptions {
    url: string,
    region: string,
    auth: AuthOptions,
    conflictResolver?: ConflictResolver,
    complexObjectsCredentials?: CredentialsGetter,
    cacheOptions?: ApolloReducerConfig,
    disableOffline?: boolean,
    offlineConfig?: OfflineConfig,
}

export type OfflineConfig = Pick<Partial<StoreOptions<any>>, 'storage' | 'callback' | 'keyPrefix'> & {
    storeCacheRootMutation?: boolean
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

const keyPrefixesInUse = new Set<string>();

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
        auth,
        conflictResolver,
        complexObjectsCredentials,
        cacheOptions = {},
        disableOffline = false,
        offlineConfig: {
            storage = undefined,
            keyPrefix = undefined,
            callback = () => { },
            storeCacheRootMutation = false,
        } = {},
    }: AWSAppSyncClientOptions, options?: Partial<ApolloClientOptions<TCacheShape>>) {
        const { cache: customCache = undefined, link: customLink = undefined } = options || {};

        if (!customLink && (!url || !region || !auth)) {
            throw new Error(
                'In order to initialize AWSAppSyncClient, you must specify url, region and auth properties on the config object or a custom link.'
            );
        }

        keyPrefix = keyPrefix || DEFAULT_KEY_PREFIX;
        if (!disableOffline && keyPrefixesInUse.has(keyPrefix)) {
            throw new Error(`The keyPrefix ${keyPrefix} is already in use. Multiple clients cannot share the same keyPrefix. Provide a different keyPrefix in the offlineConfig object.`);
        }

        let resolveClient;

        const dataIdFromObject = disableOffline ? () => null : cacheOptions.dataIdFromObject || defaultDataIdFromObject;
        const store = disableOffline ? null : createStore({
            clientGetter: () => this,
            persistCallback: () => { resolveClient(this); },
            dataIdFromObject,
            storage,
            keyPrefix,
            callback
        });
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
        const link = waitForRehydrationLink.concat(customLink || createAppSyncLink({ url, region, auth, complexObjectsCredentials, conflictResolver }));

        const newOptions = {
            ...options,
            link,
            cache,
        };

        super(newOptions);

        this.hydratedPromise = disableOffline ? Promise.resolve(this) : new Promise(resolve => { resolveClient = resolve; });
        this._disableOffline = disableOffline;
        this._store = store;

        if (!disableOffline) {
            keyPrefixesInUse.add(keyPrefix);
        }
    }

    isOfflineEnabled() {
        return !this._disableOffline;
    }

    mutate<T, TVariables = OperationVariables>(options: MutationOptions<T, TVariables>) {
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
export { AUTH_TYPE, buildSync };
