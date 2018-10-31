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
import { tryFunctionOrLogError, graphQLResultHasError } from "apollo-utilities";
import { OperationVariables, MutationUpdaterFn } from "apollo-client";
import { hash } from "./utils";
import { Observable } from "apollo-link";
import { Subscription } from "apollo-client/util/Observable";
import { DataProxy } from "apollo-cache";

//#region Types
type DeltaSyncUpdateLastSyncAction = AnyAction & {
    payload: {
        hash: string,
        lastSyncTimestamp: number,
        baseLastSyncTimestamp: number,
    }
};

type SubscribeWithSyncEffectOptions<T, TVariables = OperationVariables> = SubscribeWithSyncOptions<T, TVariables> & {
    lastSyncTimestamp?: number,
    baseLastSyncTimestamp?: number,
};

export type DeltaSyncEffect<T> = {
    options: SubscribeWithSyncEffectOptions<any, any>,
    observer: ZenObservable.SubscriptionObserver<T>,
    callback: (Subscription) => void,
};

export const DELTASYNC_KEY = 'deltaSync';
export type DeltaSyncState = {
    metadata: {
        [key: string]: DeltaSyncStateMetadata
    }
};
export type DeltaSyncStateMetadata = {
    baseLastSyncTimestamp: number
    lastSyncTimestamp: number
};

type SubscriptionMessagesProcessorCreator = (proxy: DataProxy, updateFunction: MutationUpdaterFn) => SubscriptionMessagesProcessor;
type SubscriptionMessagesProcessor = {
    enqueue: (x: any) => void,
    ready: () => void,
    close: () => void,
}

type DeltaSyncReducer = () => (state: AppSyncMetadataState, action: AnyAction) => AppSyncMetadataState;
//#endregion

//#region Constants
const actions = {
    ENQUEUE: 'DELTASYNC_ENQUEUE_RECONNECT',
    UPDATE_LASTSYNC: 'DELTASYNC_UPDATE_LASTSYNC',
};
// const UPPER_BOUND_TIME_MS = (24 * 60 * 60 * 1000);
const UPPER_BOUND_TIME_MS = 2 * 60 * 1000;
const BUFFER_MILLISECONDS = 2000;
//#endregion

//#region helpers
const subscriptionMessagesProcessorCreator: SubscriptionMessagesProcessorCreator = (proxy, updateFunction) => {
    let buffer = [];
    let ready = false;

    const wrappedUpdateFunction: MutationUpdaterFn = (proxy, record) => tryFunctionOrLogError(() => updateFunction(proxy, record))

    const processor: SubscriptionMessagesProcessor = {
        enqueue: record => {
            if (ready) {
                wrappedUpdateFunction(proxy, record);

                return;
            }

            buffer.push(record);
        },
        ready: () => {
            if (ready) {
                return;
            }

            buffer.forEach(record => wrappedUpdateFunction(proxy, record));
            buffer = [];

            ready = true;
        },
        close: () => {
            buffer = [];
            ready = true;
        }
    };

    return processor;
};

const hashForOptions = (options: SubscribeWithSyncOptions<any>) => {
    const {
        baseQuery: {
            query: baseQueryQuery = {},
            variables: baseQueryVariables = {},
        } = {},
        subscriptionQuery: {
            query: subscriptionQueryQuery = {},
            variables: subscriptionQueryVariables = {},
        } = {},
        deltaQuery: {
            query: deltaQueryQuery = {},
            variables: deltaQueryVariables = {},
        } = {},
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
//#endregion

const effect = async <TCache extends NormalizedCacheObject>(
    store: Store<OfflineCache>,
    client: AWSAppSyncClient<TCache>,
    effect: DeltaSyncEffect<any>,
    _action: OfflineAction,
    _offlineCallback: OfflineCallback,
    offlineStatusChangeObservable: Observable<any>
): Promise<void> => {
    const { options, options: {
        baseQuery,
        subscriptionQuery,
        deltaQuery,
    }, observer, callback = () => { } } = effect;

    if (!observer || typeof observer.next !== 'function' || observer.closed) {
        return;
    }

    let { lastSyncTimestamp, baseLastSyncTimestamp } = options;
    const hash = hashForOptions(options);
    const itemInHash = store.getState()[METADATA_KEY][DELTASYNC_KEY].metadata[hash];

    let networkStatusSubscription: Subscription;
    let subscription: Subscription;
    let baseQueryTimeoutId: number;
    let subscriptionProcessor: SubscriptionMessagesProcessor;
    const unsubscribeAll = () => {
        if (networkStatusSubscription) networkStatusSubscription.unsubscribe();

        if (subscription) subscription.unsubscribe();

        if (baseQueryTimeoutId) clearTimeout(baseQueryTimeoutId);

        if (subscriptionProcessor) subscriptionProcessor.close();
    };

    const enqueueAgain = () => {
        unsubscribeAll();

        // console.log('Enqueuing', { baseLastSyncTimestamp, lastSyncTimestamp });
        boundEnqueueDeltaSync(store, { ...options, lastSyncTimestamp, baseLastSyncTimestamp }, observer, callback);
    };

    networkStatusSubscription = new Observable(obs => {
        const handle = offlineStatusChangeObservable.subscribe({
            next: ({ online }) => {
                if (!online) {
                    obs.next(null);
                    obs.complete();
                }
            },
            complete: () => obs.complete(),
        });

        return () => handle.unsubscribe();
    }).subscribe({
        next: () => {
            enqueueAgain();
        }
    });

    subscriptionProcessor = subscriptionMessagesProcessorCreator(client.cache, (proxy, record) => {
        const { update } = options.subscriptionQuery;

        if (typeof update === 'function') {
            update(proxy, record);

            client.queryManager.broadcastQueries();
        }
    });

    try {

        //#region Base query
        if (baseQuery && baseQuery.query) {
            const { query, update, variables } = baseQuery;
            const skipBaseQuery = baseLastSyncTimestamp
                ? Date.now() - baseLastSyncTimestamp < UPPER_BOUND_TIME_MS
                : itemInHash.baseLastSyncTimestamp && Date.now() - itemInHash.baseLastSyncTimestamp < UPPER_BOUND_TIME_MS;

            console.log(`${skipBaseQuery ? 'Skipping' : 'Running'} base query`, { baseLastSyncTimestamp, itemInHash });
            if (!skipBaseQuery) {
                const result = await client.query({
                    fetchPolicy: 'network-only',
                    query,
                    variables,
                });

                tryFunctionOrLogError(() => {
                    update(client.cache, result);

                    client.queryManager.broadcastQueries();
                });

                baseLastSyncTimestamp = new Date().getTime() - BUFFER_MILLISECONDS;
                boundUpdateLastSync(store, { hash, baseLastSyncTimestamp });
            }
        }
        //#endregion

        //#region Subscription
        if (subscriptionQuery && subscriptionQuery.query) {
            const { query, variables } = subscriptionQuery;

            subscription = client.subscribe({
                query: query,
                variables: variables,
            }).subscribe({
                next: data => {
                    subscriptionProcessor.enqueue(data);
                },
                error: (err) => {
                    if (graphQLResultHasError(err) || err.graphQLErrors) {
                        // send error to observable, unsubscribe all, do not enqueue
                        observer.error(err);
                        unsubscribeAll();
                        return;
                    }

                    enqueueAgain();
                }
            });

            if (typeof callback === 'function') {
                callback(subscription);
            }
        }
        //#endregion

        //#region Delta query
        if (deltaQuery && deltaQuery.query) {
            const { query, update, variables } = deltaQuery;

            console.log('Running deltaQuery');
            const result = await client.query({
                fetchPolicy: 'network-only',
                query: query,
                variables: {
                    ...variables,
                    lastSync: lastSyncTimestamp || baseLastSyncTimestamp,
                },
            });

            tryFunctionOrLogError(() => {
                update(client.cache, result);

                client.queryManager.broadcastQueries();
            });

            lastSyncTimestamp = new Date().getTime() - BUFFER_MILLISECONDS;
            boundUpdateLastSync(store, { hash, lastSyncTimestamp });
        }
        //#endregion

        // process subscription messages
        subscriptionProcessor.ready();

        const XXX = UPPER_BOUND_TIME_MS - (Date.now() - baseLastSyncTimestamp);
        console.log(`Re-running in ${XXX / 1000 / 60} minutes`);
        baseQueryTimeoutId = (global as any).setTimeout(() => enqueueAgain(), XXX);
    } catch (error) {
        observer.error(error);
        // Redux-offline will discard and send error to observer, see: discard()

        unsubscribeAll();
    }
};

const discard = (_callback: OfflineCallback, error: Error, action: OfflineAction, retries) => {
    const { meta: { offline: { effect } } } = action;
    const { observer } = effect as DeltaSyncEffect<any>;

    if (observer && observer.error) {
        console.warn('Discarding');
        observer.error(error);
    }

    return true;
};

//#region redux
const reducer: DeltaSyncReducer = () => (state: AppSyncMetadataState, action: AnyAction) => {

    switch (action.type) {
        case actions.UPDATE_LASTSYNC:
            console.debug(action.type, (action as DeltaSyncUpdateLastSyncAction).payload);
            return lastSyncReducer(state, action as DeltaSyncUpdateLastSyncAction);
        case actions.ENQUEUE:
            console.debug(action.type, ((action as OfflineAction).meta.offline.effect as any).options);
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
    const { payload: { lastSyncTimestamp, hash, baseLastSyncTimestamp } } = action;

    const { metadata, ...deltaSync } = state[DELTASYNC_KEY];
    const { [hash]: hashMetadata, ...otherHashes } = metadata;

    const newMetadata: DeltaSyncStateMetadata = {
        baseLastSyncTimestamp: baseLastSyncTimestamp || hashMetadata.baseLastSyncTimestamp,
        lastSyncTimestamp,
    };

    const newState = {
        ...state,
        [DELTASYNC_KEY]: {
            ...deltaSync,
            metadata: {
                ...otherHashes,
                [hash]: newMetadata
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

    const {
        lastSyncTimestamp = options.lastSyncTimestamp,
        baseLastSyncTimestamp = options.baseLastSyncTimestamp,
    } = hashMetadata || {};

    const newMetadata: DeltaSyncStateMetadata = {
        lastSyncTimestamp,
        baseLastSyncTimestamp: options.baseLastSyncTimestamp === null ? null : baseLastSyncTimestamp,
    };
    console.warn(newMetadata);

    const newState = {
        ...state,
        [DELTASYNC_KEY]: {
            metadata: {
                ...metadata,
                [hash]: newMetadata,
            }
        } as DeltaSyncState
    };

    return newState as AppSyncMetadataState;
};

export const boundEnqueueDeltaSync = <T, TVariables = OperationVariables>(
    store: Store<any>,
    options: SubscribeWithSyncEffectOptions<T, TVariables>,
    observer: ZenObservable.SubscriptionObserver<T>,
    callback: (Subscription) => void,
) => {
    const effect: DeltaSyncEffect<any> = { options, observer, callback };

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
    { hash, lastSyncTimestamp, baseLastSyncTimestamp }: {
        hash: string,
        lastSyncTimestamp?: number,
        baseLastSyncTimestamp?: number,
    }
) => {
    const action: DeltaSyncUpdateLastSyncAction = {
        type: actions.UPDATE_LASTSYNC,
        payload: {
            hash,
            lastSyncTimestamp,
            baseLastSyncTimestamp,
        }
    };

    store.dispatch(action);
}
//#endregion

export const offlineEffectConfig: OfflineEffectConfig = {
    enqueueAction: actions.ENQUEUE,
    effect,
    discard,
    reducer,
};
