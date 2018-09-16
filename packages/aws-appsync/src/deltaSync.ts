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

const actions = {
    ENQUEUE: 'DELTASYNC_ENQUEUE_RECONNECT',
    UPDATE_LASTSYNC: 'DELTASYNC_UPDATE_LASTSYNC',
};

declare type DeltaSyncSyncAction<T, TVariables = OperationVariables> = AnyAction & {
    payload: SubscribeWithSyncOptions<T, TVariables>
};

export declare type DeltaSyncEffect<T> = {
    options: SubscribeWithSyncOptions<any>,
    observer: ZenObservable.SubscriptionObserver<T>,
};

const effect = async <TCache extends NormalizedCacheObject>(
    store: Store<OfflineCache>,
    client: AWSAppSyncClient<TCache>,
    effect: DeltaSyncEffect<any>,
    action: OfflineAction,
    callback: OfflineCallback,
    offlineStatusChangeObservable: Observable<any>
): Promise<void> => {
    const { options, observer: origObserver } = effect;

    if (!origObserver || typeof origObserver.next !== 'function' || origObserver.closed) {
        return;
    }

    const hash = hashForOptions(options);
    const itemInHash = store.getState()[METADATA_KEY][DELTASYNC_KEY].metadata[hash];

    let {
        lastSyncTimestamp = (itemInHash && itemInHash[DELTASYNC_LASTSYNC_KEY]) || new Date().getTime()
    } = options;

    // Initial query
    await client.query({
        fetchPolicy: itemInHash && !itemInHash[DELTASYNC_PENDING_KEY] ? 'cache-first' : 'network-only',
        query: options.initialQuery.query,
        variables: options.initialQuery.variables,
    });

    let subscription;

    if (options.subscriptionQuery) {
        subscription = client.subscribe({
            query: options.subscriptionQuery.query,
            variables: options.subscriptionQuery.variables,
        }).subscribe({
            next: data => {
                tryFunctionOrLogError(() => {
                    options.subscriptionQuery.update(client.cache, data);

                    client.queryManager.broadcastQueries();
                });

                lastSyncTimestamp = new Date().getTime();
                boundUpdateLastSync(store, { ...options, lastSyncTimestamp });
            },
            error: () => {
                boundEnqueueDeltaSync(store, { ...options, lastSyncTimestamp }, origObserver);
            }
        });
    }

    const deltaQuery = await client.query({
        fetchPolicy: 'network-only',
        query: options.deltaQuery.query,
        variables: {
            ...(options.deltaQuery.variables as any),
            lastSync: lastSyncTimestamp,
        },
    });


    tryFunctionOrLogError(() => {
        options.initialQuery.update(client.cache, deltaQuery);

        client.queryManager.broadcastQueries();
    });

    lastSyncTimestamp = new Date().getTime();
    boundUpdateLastSync(store, { ...options, lastSyncTimestamp });

    let handle = offlineStatusChangeObservable.subscribe({
        next: ({ online }) => {
            if (!online) {
                boundEnqueueDeltaSync(store, { ...options, lastSyncTimestamp }, origObserver);

                if (subscription) {
                    subscription.unsubscribe();
                }
                if (handle) {
                    handle.unsubscribe();
                }
            }
        }
    });
};

export const boundEnqueueDeltaSync = <T, TVariables = OperationVariables>(
    store: Store<any>,
    options: SubscribeWithSyncOptions<T, TVariables>,
    observer: ZenObservable.SubscriptionObserver<T>
) => {
    store.dispatch({
        type: offlineEffectConfig.enqueueAction,
        meta: {
            offline: {
                effect: { options: { ...options }, observer } as DeltaSyncEffect<any>
            },
        }
    });
}

const boundUpdateLastSync = <T, TVariables = OperationVariables>(
    store: Store<any>,
    options: SubscribeWithSyncOptions<T, TVariables>,
) => {
    store.dispatch({
        type: actions.UPDATE_LASTSYNC,
        payload: {
            ...options,
        }
    } as DeltaSyncSyncAction<T, TVariables>);
}

const discard = (callback: OfflineCallback, error, action, retries) => {
    return retries > 10;
};


export const DELTASYNC_KEY = 'deltaSync';
export const DELTASYNC_LASTSYNC_KEY = 'lastSync';
export const DELTASYNC_PENDING_KEY = 'pending';
export type DeltaSyncState = {
    metadata: {
        [key: string]: {
            [DELTASYNC_LASTSYNC_KEY]: number
            [DELTASYNC_PENDING_KEY]?: boolean
        }
    }
};

const hashForOptions = (options: SubscribeWithSyncOptions<any>) => {
    const {
        initialQuery: {
            query: initialQueryQuery,
            variables: initialQueryVariables,
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

    const initialQuery = {
        query: initialQueryQuery,
        variables: initialQueryVariables,
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
        initialQuery,
        subscriptionQuery,
        deltaQuery,
    })
}

type DeltaSyncReducer = () => (state: AppSyncMetadataState, action: AnyAction) => AppSyncMetadataState;
const reducer: DeltaSyncReducer = () => (state: AppSyncMetadataState, action: AnyAction) => {

    switch (action.type) {
        case actions.UPDATE_LASTSYNC:
            return lastSyncReducer(state, action as DeltaSyncSyncAction<any, any>);
        case actions.ENQUEUE:
            return enqueReducer(state, action as OfflineAction);
        default:
            return state;
    }
};

const lastSyncMetadataReducer = (state: AppSyncMetadataState, action: DeltaSyncSyncAction<any, any>) => {
    const { payload: { lastSyncTimestamp, ...otherOptions } } = action;

    const hash = hashForOptions(otherOptions as SubscribeWithSyncOptions<any, any>);

    const { [DELTASYNC_KEY]: { metadata = {} } = {} } = state;

    const newState = {
        ...state,
        [DELTASYNC_KEY]: {
            metadata: {
                ...metadata,
                [hash]: {
                    ...metadata[hash],
                    lastSyncTimestamp,
                    pending: !metadata[hash],
                }
            }
        }
    };

    return newState as AppSyncMetadataState;
};
const lastSyncReducer = (state: AppSyncMetadataState, action: DeltaSyncSyncAction<any, any>) => {
    const { type, payload } = action;

    return lastSyncMetadataReducer(
        state,
        {
            type,
            payload
        } as DeltaSyncSyncAction<any, any>
    );
};
const enqueReducer = (state: AppSyncMetadataState, action: OfflineAction) => {
    const { type, meta: { offline: { effect } } } = action;
    const { options } = effect as DeltaSyncEffect<any>;

    return lastSyncMetadataReducer(state, {
        type,
        payload: {
            ...options
        }
    });
};

export const offlineEffectConfig: OfflineEffectConfig = {
    enqueueAction: actions.ENQUEUE,
    effect,
    discard,
    reducer,
};
