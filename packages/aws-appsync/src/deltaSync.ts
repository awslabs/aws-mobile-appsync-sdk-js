/*!
 * Copyright 2017-2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * Licensed under the Amazon Software License (the "License"). You may not use this file except in compliance with the License. A copy of
 * the License is located at
 *     http://aws.amazon.com/asl/
 * or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
import { OfflineAction } from "@redux-offline/redux-offline/lib/types";
import { NormalizedCacheObject } from "apollo-cache-inmemory";
import { Store, AnyAction } from "redux";
import { OfflineCache, AppSyncMetadataState, METADATA_KEY } from "./cache/offline-cache";
import AWSAppSyncClient, { OfflineCallback, SubscribeWithSyncOptions } from "./client";
import { OfflineEffectConfig } from "./store";
import { tryFunctionOrLogError } from "apollo-utilities";
import { OperationVariables } from "apollo-client";
import { hash } from "./utils";
import { Observable } from "apollo-link";
import { Subscription } from "apollo-client/util/Observable";

const actions = {
    ENQUEUE: 'DELTASYNC_ENQUEUE_RECONNECT',
    UPDATE_LASTSYNC: 'DELTASYNC_UPDATE_LASTSYNC',
};

declare type DeltaSyncUpdateLastSyncAction = AnyAction & {
    payload: {
        hash: string,
        lastSyncTimestamp: number,
    }
};

export declare type DeltaSyncEffect<T> = {
    options: SubscribeWithSyncOptions<any>,
    observer: ZenObservable.SubscriptionObserver<T>,
    callback: (Subscription) => void,
};

const UPPER_BOUND_TIME_MS = (24 * 60 * 60 * 1000);
const BUFFER_MILLISECONDS = 2000;

const effect = async <TCache extends NormalizedCacheObject>(
    store: Store<OfflineCache>,
    client: AWSAppSyncClient<TCache>,
    effect: DeltaSyncEffect<any>,
    _action: OfflineAction,
    _offlineCallback: OfflineCallback,
    offlineStatusChangeObservable: Observable<any>
): Promise<void> => {
    const { options, observer: origObserver, callback = () => { } } = effect;

    if (!origObserver || typeof origObserver.next !== 'function' || origObserver.closed) {
        return;
    }

    const hash = hashForOptions(options);
    const itemInHash = store.getState()[METADATA_KEY][DELTASYNC_KEY].metadata[hash];

    let { lastSyncTimestamp } = options;

    if (typeof lastSyncTimestamp === 'undefined') {
        lastSyncTimestamp = (itemInHash && itemInHash.lastSyncTimestamp) || new Date().getTime() - BUFFER_MILLISECONDS
    }

    // Initial query
    let initialQueryTimeoutId: number;
    if (options.baseQuery.query) {

        let func = async () => {
            // TODO: use buffer?
            const XXXX = new Date().getTime() - UPPER_BOUND_TIME_MS - BUFFER_MILLISECONDS;
            const skipBaseQuery = itemInHash ? ((itemInHash.lastSyncTimestamp - XXXX) >= 0 && !itemInHash.pending) : false;

            const fetchPolicy = skipBaseQuery ? 'cache-first' : 'network-only';
            console.log(
                `${skipBaseQuery ? 'Skipping' : 'Running'} baseQuery`,
                { fetchPolicy },
                ...(itemInHash && [itemInHash.pending, itemInHash.lastSyncTimestamp, XXXX, itemInHash.lastSyncTimestamp - XXXX])
            );
            const result = await client.query({
                fetchPolicy,
                query: options.baseQuery.query,
                variables: options.baseQuery.variables,
            });

            if (!skipBaseQuery) {
                lastSyncTimestamp = new Date().getTime() - BUFFER_MILLISECONDS;
                boundUpdateLastSync(store, hash, lastSyncTimestamp);
            }

            tryFunctionOrLogError(() => {
                options.baseQuery.update(client.cache, result);

                client.queryManager.broadcastQueries();
            });

            initialQueryTimeoutId = (global as any).setTimeout(func, 24 * 60 * 1000);
        };

        await func();

    }

    let subscription: Subscription;

    if (options.subscriptionQuery) {
        console.log('Running subscriptionQuery');
        subscription = client.subscribe({
            query: options.subscriptionQuery.query,
            variables: options.subscriptionQuery.variables,
        }).subscribe({
            next: data => {
                tryFunctionOrLogError(() => {
                    options.subscriptionQuery.update(client.cache, data);

                    client.queryManager.broadcastQueries();
                });
            },
            error: () => {
                boundEnqueueDeltaSync(store, { ...options, lastSyncTimestamp }, origObserver, callback);
            }
        });

        if (typeof callback === 'function') {
            callback(subscription);
        }
    }

    if (options.deltaQuery) {
        console.log('Running deltaQuery');
        const deltaQuery = await client.query({
            fetchPolicy: 'network-only',
            query: options.deltaQuery.query,
            variables: {
                ...(options.deltaQuery.variables as any),
                lastSync: lastSyncTimestamp,
            },
        });

        tryFunctionOrLogError(() => {
            options.deltaQuery.update(client.cache, deltaQuery);

            client.queryManager.broadcastQueries();
        });

        lastSyncTimestamp = new Date().getTime() - BUFFER_MILLISECONDS;
        boundUpdateLastSync(store, hash, lastSyncTimestamp);
    }

    let handle = offlineStatusChangeObservable.subscribe({
        next: ({ online }) => {
            if (!online) {
                boundEnqueueDeltaSync(store, { ...options, lastSyncTimestamp }, origObserver, callback);

                if (initialQueryTimeoutId) {
                    clearInterval(initialQueryTimeoutId);
                }

                if (subscription) {
                    subscription.unsubscribe();
                }

                handle.unsubscribe();
            }
        }
    });
};

export const boundEnqueueDeltaSync = <T, TVariables = OperationVariables>(
    store: Store<any>,
    options: SubscribeWithSyncOptions<T, TVariables>,
    observer: ZenObservable.SubscriptionObserver<T>,
    callback: (Subscription) => void,
) => {
    const effect: DeltaSyncEffect<any> = { options: { ...options }, observer, callback };

    store.dispatch({
        type: offlineEffectConfig.enqueueAction,
        meta: {
            offline: {
                effect
            },
        }
    });
}

const boundUpdateLastSync = (
    store: Store<any>,
    hash: string,
    lastSyncTimestamp: number,
) => {
    const action: DeltaSyncUpdateLastSyncAction = {
        type: actions.UPDATE_LASTSYNC,
        payload: {
            hash,
            lastSyncTimestamp
        }
    };

    store.dispatch(action);
}

const discard = (callback: OfflineCallback, error, action, retries) => {
    return retries > 10;
};


export const DELTASYNC_KEY = 'deltaSync';
export type DeltaSyncState = {
    metadata: {
        [key: string]: {
            lastSyncTimestamp: number
            pending?: boolean
        }
    }
};

const hashForOptions = (options: SubscribeWithSyncOptions<any>) => {
    const {
        baseQuery: {
            query: baseQueryQuery,
            variables: baseQueryVariables,
        },
        subscriptionQuery: {
            query: subscriptionQueryQuery = {},
            variables: subscriptionQueryVariables = {},
        } = {},
        deltaQuery: {
            query: deltaQueryQuery,
            variables: deltaQueryVariables,
        },
    } = options;

    const baseQuery = {
        query: baseQueryQuery,
        variables: baseQueryVariables,
    };
    const subscriptionQuery = {
        query: subscriptionQueryQuery,
        variables: subscriptionQueryVariables,
    };
    const deltaQuery = {
        query: deltaQueryQuery,
        variables: deltaQueryVariables,
    };

    return hash({
        baseQuery,
        subscriptionQuery,
        deltaQuery,
    })
}

type DeltaSyncReducer = () => (state: AppSyncMetadataState, action: AnyAction) => AppSyncMetadataState;
const reducer: DeltaSyncReducer = () => (state: AppSyncMetadataState, action: AnyAction) => {

    switch (action.type) {
        case actions.UPDATE_LASTSYNC:
            console.log(action.type, action);
            return lastSyncReducer(state, action as DeltaSyncUpdateLastSyncAction);
        case actions.ENQUEUE:
            console.log(action.type, (action as OfflineAction).meta.offline.effect);
            return enqueReducer(state, action as OfflineAction);
        default:
            const newState: AppSyncMetadataState = {
                ...state,
                deltaSync: {
                    metadata: {},
                    ...state.deltaSync,
                }
            };

            return newState;
    }
};

const lastSyncReducer = (state: AppSyncMetadataState, action: DeltaSyncUpdateLastSyncAction) => {
    const { payload: { lastSyncTimestamp, hash } } = action;

    const { metadata } = state[DELTASYNC_KEY];
    const { [hash]: hashMetadata } = metadata;

    const newState = {
        ...state,
        [DELTASYNC_KEY]: {
            ...state[DELTASYNC_KEY],
            metadata: {
                ...metadata,
                [hash]: {
                    ...hashMetadata,
                    lastSyncTimestamp,
                    pending: !hashMetadata,
                }
            }
        }
    };

    return newState as AppSyncMetadataState;
};

const enqueReducer = (state: AppSyncMetadataState, action: OfflineAction) => {
    const { meta: { offline: { effect } } } = action;
    const { options } = effect as DeltaSyncEffect<any>;

    const { metadata } = state[DELTASYNC_KEY];

    const hash = hashForOptions(options);
    const hashMetadata = metadata[hash];

    const { lastSyncTimestamp = options.lastSyncTimestamp } = hashMetadata || {};

    const newState = {
        ...state,
        [DELTASYNC_KEY]: {
            metadata: {
                ...metadata,
                [hash]: {
                    ...hashMetadata,
                    lastSyncTimestamp,
                    pending: !hashMetadata,
                }
            }
        }
    };

    return newState as AppSyncMetadataState;
};

export const offlineEffectConfig: OfflineEffectConfig = {
    enqueueAction: actions.ENQUEUE,
    effect,
    discard,
    reducer,
};
