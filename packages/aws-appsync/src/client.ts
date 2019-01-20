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
import { getMainDefinition } from 'apollo-utilities';
import { Store } from 'redux';

import { OfflineCache, defaultDataIdFromObject } from './cache/index';
import { OfflineCache as OfflineCacheType, METADATA_KEY } from './cache/offline-cache';
import {
    OfflineLink,
    AuthLink,
    NonTerminatingLink,
    SubscriptionHandshakeLink,
    ComplexObjectLink,
    AUTH_TYPE
} from './link';
import { createStore } from './store';
import { ApolloCache } from 'apollo-cache';
import { AuthOptions } from './link/auth-link';
import { Credentials, CredentialsOptions } from 'aws-sdk/lib/credentials';
import { OperationDefinitionNode, DocumentNode } from 'graphql';
import { passthroughLink } from './utils';
import ConflictResolutionLink from './link/conflict-resolution-link';
import { createRetryLink } from './link/retry-link';
import { boundEnqueueDeltaSync, buildSync, DELTASYNC_KEY, hashForOptions } from "./deltaSync";
import { Subscription } from 'apollo-client/util/Observable';
import { CONTROL_EVENTS_KEY } from './link/subscription-handshake-link';
import { S3Config } from "./link/complex-object-link";

export { defaultDataIdFromObject };

export const createSubscriptionHandshakeLink = (url: string, resultsFetcherLink: ApolloLink = createHttpLink({ uri: url })) => {
    return ApolloLink.split(
        operation => {
            const { query } = operation;
            const { kind, operation: graphqlOperation } = getMainDefinition(query) as OperationDefinitionNode;
            const isSubscription = kind === 'OperationDefinition' && graphqlOperation === 'subscription';

            return isSubscription;
        },
        ApolloLink.from([
            new NonTerminatingLink('controlMessages', {
                link: new ApolloLink((operation, _forward) => new Observable<any>(observer => {
                    const { variables: { [CONTROL_EVENTS_KEY]: controlEvents, ...variables } } = operation;

                    if (typeof controlEvents !== 'undefined') {
                        operation.variables = variables;
                    }

                    observer.next({ [CONTROL_EVENTS_KEY]: controlEvents });

                    return () => { };
                }))
            }),
            new NonTerminatingLink('subsInfo', { link: resultsFetcherLink }),
            new SubscriptionHandshakeLink('subsInfo'),
        ]),
        resultsFetcherLink,
    );
};

export const createAuthLink = ({ url, region, auth }: { url: string, region: string, auth: AuthOptions }) => new AuthLink({ url, region, auth });

export const createAppSyncLink = ({
    url,
    region,
    auth,
    complexObjectsCredentials,
    resultsFetcherLink = createHttpLink({ uri: url }),
    conflictResolver,
    s3Config
}: {
        url: string,
        region: string,
        auth: AuthOptions,
        complexObjectsCredentials: CredentialsGetter,
        resultsFetcherLink?: ApolloLink,
        conflictResolver?: ConflictResolver,
        s3Config?: S3Config,
    }) => {
    const link = ApolloLink.from([
        createLinkWithStore((store) => new OfflineLink(store)),
        new ConflictResolutionLink(conflictResolver),
        new ComplexObjectLink(complexObjectsCredentials, s3Config),
        createRetryLink(ApolloLink.from([
            createAuthLink({ url, region, auth }),
            createSubscriptionHandshakeLink(url, resultsFetcherLink)
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

type CredentialsGetter = () => (Credentials | CredentialsOptions | null) | Credentials | CredentialsOptions | null;

export interface AWSAppSyncClientOptions {
    url: string,
    region: string,
    auth: AuthOptions,
    conflictResolver?: ConflictResolver,
    complexObjectsCredentials?: CredentialsGetter,
    cacheOptions?: ApolloReducerConfig,
    disableOffline?: boolean,
    offlineConfig?: OfflineConfig,
    s3Config?: S3Config,
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
        auth,
        conflictResolver,
        complexObjectsCredentials,
        cacheOptions = {},
        disableOffline = false,
        offlineConfig: {
            storage = undefined,
            callback = () => { },
            storeCacheRootMutation = false,
        } = {},
        s3Config = {}
    }: AWSAppSyncClientOptions, options?: Partial<ApolloClientOptions<TCacheShape>>) {
        const { cache: customCache = undefined, link: customLink = undefined } = options || {};

        if (!customLink && (!url || !region || !auth)) {
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
        const link = waitForRehydrationLink.concat(customLink || createAppSyncLink({ url, region, auth, complexObjectsCredentials, conflictResolver , s3Config}));

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
export { AUTH_TYPE, buildSync };
