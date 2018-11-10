/*!
 * Copyright 2017-2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * Licensed under the Amazon Software License (the "License"). You may not use this file except in compliance with the License. A copy of
 * the License is located at
 *     http://aws.amazon.com/asl/
 * or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
import { OfflineAction } from "@redux-offline/redux-offline/lib/types";
import { NormalizedCacheObject, readQueryFromStore, defaultNormalizedCacheFactory } from "apollo-cache-inmemory";
import { Store, AnyAction } from "redux";
import { OfflineCache, AppSyncMetadataState, METADATA_KEY } from "./cache/offline-cache";
import AWSAppSyncClient, { OfflineCallback, SubscribeWithSyncOptions, QuerySyncOptions } from "./client";
import { OfflineEffectConfig } from "./store";
import { tryFunctionOrLogError, graphQLResultHasError, getMainDefinition, addTypenameToDocument } from "apollo-utilities";
import { OperationVariables, MutationUpdaterFn } from "apollo-client";
import { hash, getOperationFieldName } from "./utils";
import { Observable } from "apollo-link";
import { Subscription } from "apollo-client/util/Observable";
import { DataProxy } from "apollo-cache";
import debug from 'debug';
import { SKIP_RETRY_KEY } from "./link/retry-link";
import { DocumentNode, print, OperationDefinitionNode, FieldNode, ExecutionResult } from "graphql";
import { getOpTypeFromOperationName, CacheOperationTypes, getUpdater, QueryWithVariables } from "./helpers/offline";
import { boundSaveSnapshot, replaceUsingMap, EnqueuedMutationEffect, offlineEffectConfig as mutationsConfig } from "./link/offline-link";

const logger = debug('aws-appsync:deltasync');

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
const DEFAULT_UPPER_BOUND_TIME_MS = 24 * 60 * 60 * 1000;
const MIN_UPPER_BOUND_TIME_MS = 2 * 1000;
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
            query: baseQueryQuery = null,
            variables: baseQueryVariables = {},
        } = {},
        subscriptionQuery: {
            query: subscriptionQueryQuery = null,
            variables: subscriptionQueryVariables = {},
        } = {},
        deltaQuery: {
            query: deltaQueryQuery = null,
            variables: deltaQueryVariables = {},
        } = {},
    } = options;

    const baseQuery = baseQueryQuery ? {
        query: print(baseQueryQuery),
        variables: baseQueryVariables,
    } : {};
    const subscriptionQuery = subscriptionQueryQuery ? {
        query: print(subscriptionQueryQuery),
        variables: subscriptionQueryVariables,
    } : {};
    const deltaQuery = deltaQueryQuery ? {
        query: print(deltaQueryQuery),
        variables: deltaQueryVariables,
    } : {};

    return hash(JSON.stringify({
        baseQuery,
        subscriptionQuery,
        deltaQuery,
    }));
}
//#endregion

//#region Redux
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

    let upperBoundTimeMS = DEFAULT_UPPER_BOUND_TIME_MS;

    let { lastSyncTimestamp, baseLastSyncTimestamp } = options;
    const hash = hashForOptions(options);
    const itemInHash = store.getState()[METADATA_KEY][DELTASYNC_KEY].metadata[hash];

    let networkStatusSubscription: Subscription;
    let subscription: Subscription;
    let baseQueryTimeoutId: number;
    let subscriptionProcessor: SubscriptionMessagesProcessor;
    const unsubscribeAll = () => {
        logger('Unsubscribing');

        if (networkStatusSubscription) networkStatusSubscription.unsubscribe();

        if (subscription) subscription.unsubscribe();

        if (baseQueryTimeoutId) clearTimeout(baseQueryTimeoutId);

        if (subscriptionProcessor) subscriptionProcessor.close();
    };

    const enqueueAgain = () => {
        unsubscribeAll();

        logger('Re-queuing', { baseLastSyncTimestamp, lastSyncTimestamp });
        boundEnqueueDeltaSync(store, { ...options, lastSyncTimestamp, baseLastSyncTimestamp }, observer, callback);
    };

    if (typeof callback === 'function') {
        let handle = new Observable(() => () => unsubscribeAll()).subscribe({ next: () => { } });
        callback(handle);
    }

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

    const STOP_CACHE_RECORDING = Symbol('lawea');
    let recorderCacheWrites = [];

    const cacheProxy = new Proxy(client.cache, {
        get: (target, name, receiver) => {
            switch (name) {
                case 'write':
                    return (options) => {
                        if (!receiver[STOP_CACHE_RECORDING]) {
                            recorderCacheWrites.push(options);
                        }

                        return target[name](options);
                    }
            }

            return target[name];
        }
    });

    subscriptionProcessor = subscriptionMessagesProcessorCreator(cacheProxy, (proxy, record) => {
        const { update } = options.subscriptionQuery;

        if (typeof update === 'function') {
            update(proxy, record);

            client.queryManager.broadcastQueries();
        }
    });

    try {
        let error;


        const {
            [METADATA_KEY]: { idsMap, snapshot: { cache: cacheSnapshot } },
            offline: { outbox: enquededMutations }
        } = store.getState();

        //#region Base query
        if (baseQuery && baseQuery.query) {
            const { query, update, variables, refreshIntervalInSeconds } = baseQuery;

            upperBoundTimeMS = refreshIntervalInSeconds ? refreshIntervalInSeconds * 1000 : DEFAULT_UPPER_BOUND_TIME_MS;

            const skipBaseQuery = baseLastSyncTimestamp
                ? Date.now() - baseLastSyncTimestamp < upperBoundTimeMS
                : itemInHash.baseLastSyncTimestamp && Date.now() - itemInHash.baseLastSyncTimestamp < upperBoundTimeMS;

            logger(`${skipBaseQuery ? 'Skipping' : 'Running'} base query`, { baseLastSyncTimestamp, itemInHash });
            if (!skipBaseQuery) {
                const result = await client.query({
                    fetchPolicy: 'network-only',
                    query,
                    variables,
                });
                cacheProxy.writeQuery({ query, data: result.data });

                if (typeof update === 'function') {
                    tryFunctionOrLogError(() => {
                        update(cacheProxy, result);
                    });
                }

                baseLastSyncTimestamp = new Date().getTime() - BUFFER_MILLISECONDS;
                boundUpdateLastSync(store, { hash, baseLastSyncTimestamp });
            } else {
                const data = readQueryFromStore({
                    store: defaultNormalizedCacheFactory(cacheSnapshot),
                    query: addTypenameToDocument(query),
                    variables,
                });

                cacheProxy.writeQuery({ query, variables, data });
            }
        }
        //#endregion

        //#region Subscription
        if (subscriptionQuery && subscriptionQuery.query) {
            const { query, variables } = subscriptionQuery;

            subscription = client.subscribe({
                query: query,
                variables: {
                    ...variables,
                    [SKIP_RETRY_KEY]: true,
                },
            }).subscribe({
                next: data => {
                    subscriptionProcessor.enqueue(data);
                },
                error: (err) => {
                    error = err;
                    unsubscribeAll();

                    if (graphQLResultHasError(err) || err.graphQLErrors) {
                        // send error to observable, unsubscribe all, do not enqueue
                        observer.error(err);
                        return;
                    }

                    enqueueAgain();
                }
            });
        }
        //#endregion

        //#region Delta query
        if (deltaQuery && deltaQuery.query) {
            const { query, update, variables } = deltaQuery;

            logger('Running deltaQuery', { lastSyncTimestamp, baseLastSyncTimestamp });
            const result = await client.query({
                fetchPolicy: 'no-cache',
                query: query,
                variables: {
                    ...variables,
                    lastSync: lastSyncTimestamp || baseLastSyncTimestamp,
                },
            });

            if (typeof update === 'function') {
                tryFunctionOrLogError(() => {
                    update(cacheProxy, result);
                });
            }

            lastSyncTimestamp = new Date().getTime() - BUFFER_MILLISECONDS;
            boundUpdateLastSync(store, { hash, lastSyncTimestamp });
        }
        //#endregion

        if (error) {
            throw error;
        }

        // process subscription messages
        subscriptionProcessor.ready();
        cacheProxy[STOP_CACHE_RECORDING] = true;


        // Restore from cache snapshot
        client.cache.restore(cacheSnapshot as TCache);

        recorderCacheWrites.forEach(client.cache.write.bind(client.cache));

        boundSaveSnapshot(store, client.cache);

        const dataStore = client.queryManager.dataStore;
        const enqueuedActionsFilter = [mutationsConfig.enqueueAction];
        enquededMutations
            .filter(({ type }) => enqueuedActionsFilter.indexOf(type) > -1)
            .forEach(({ meta: { offline: { effect } } }) => {
                const {
                    operation: { variables = {}, query: document = null } = {},
                    update,
                    optimisticResponse: origOptimisticResponse,
                } = effect as EnqueuedMutationEffect<any>;

                if (typeof update !== 'function') {
                    return;
                }

                const optimisticResponse = replaceUsingMap({ ...origOptimisticResponse }, idsMap);
                const result = { data: optimisticResponse };

                dataStore.markMutationResult({
                    mutationId: null,
                    result,
                    document,
                    variables,
                    updateQueries: {}, // TODO: populate this?
                    update
                });
            });

        client.queryManager.broadcastQueries();

        if (baseQuery && baseQuery.query) {
            const baseQueryTimeout = Math.max(
                upperBoundTimeMS - (Date.now() - baseLastSyncTimestamp),
                MIN_UPPER_BOUND_TIME_MS
            );
            logger(`Re-running in ${baseQueryTimeout / 1000 / 60} minutes`);
            baseQueryTimeoutId = (global as any).setTimeout(() => enqueueAgain(), baseQueryTimeout);
        }
    } catch (error) {
        unsubscribeAll();

        throw error
    }
};

const discard = (_callback: OfflineCallback, error: Error, action: OfflineAction, retries) => {
    const { meta: { offline: { effect } } } = action;
    const { observer } = effect as DeltaSyncEffect<any>;

    if (observer && observer.error && !observer.closed) {
        observer.error(error);
    }

    return true;
};

const reducer: DeltaSyncReducer = () => (state: AppSyncMetadataState, action: AnyAction) => {

    switch (action.type) {
        case actions.UPDATE_LASTSYNC:
            logger(action.type, (action as DeltaSyncUpdateLastSyncAction).payload);
            return lastSyncReducer(state, action as DeltaSyncUpdateLastSyncAction);
        case actions.ENQUEUE:
            logger(action.type, ((action as OfflineAction).meta.offline.effect as any).options);
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

//#region Builder

export const buildSync = <T = { [key: string]: any }, TVariables = OperationVariables>(
    typename: string,
    options: {
        baseQuery?: BuildBaseQuerySyncOptions<T, TVariables>,
        subscriptionQuery?: BuildQuerySyncOptions<TVariables>,
        deltaQuery?: BuildQuerySyncOptions<TVariables>,
        cacheUpdates?: (item: T) => QueryWithVariables[],
    },
    idField: string = 'id',
) => {
    const {
        baseQuery,
        subscriptionQuery,
        deltaQuery,
        cacheUpdates = () => [] as QueryWithVariables[]
    } = options;
    const loggerHelper = logger.extend('helper');

    const result = {
        baseQuery: {
            ...baseQuery,
            ...(baseQuery && {
                update: (cache, { data }: ExecutionResult) => {
                    const opFieldName = getOperationFieldName(baseQuery.query);
                    const { [opFieldName]: result }: { [opFieldName: string]: T[] } = data;

                    writeCacheUpdates(loggerHelper, cache, result, cacheUpdates);
                }
            })
        },
        subscriptionQuery: {
            ...subscriptionQuery,
            ...(subscriptionQuery && {
                update: (cache, { data }: ExecutionResult) => {
                    updateBaseWithDelta<T, TVariables>(loggerHelper, baseQuery, subscriptionQuery, cache, data as T, cacheUpdates, typename, idField);
                }
            })
        },
        deltaQuery: {
            ...deltaQuery,
            ...(deltaQuery && {
                update: (cache, { data }: ExecutionResult) => {
                    updateBaseWithDelta<T, TVariables>(loggerHelper, baseQuery, deltaQuery, cache, data as T, cacheUpdates, typename, idField);
                }
            })
        },
    } as SubscribeWithSyncOptions<T, TVariables>;

    loggerHelper('buildSync options', result);

    return result;
};

const writeCacheUpdates = <T = { [key: string]: any }>(
    logger,
    cache: DataProxy,
    result: T[],
    cacheUpdates: (item: T) => QueryWithVariables[] = () => [] as QueryWithVariables[]
) => {
    const cacheUpdatesLogger = logger.extend('cacheUpdates');

    cacheUpdatesLogger('writeCacheUpdates');

    result.forEach(item => cacheUpdates(item).forEach(({ query, variables }) => {
        const opFieldName = getOperationFieldName(query);
        const data = { [opFieldName]: item };

        cacheUpdatesLogger(`Writing ${opFieldName}`, { variables, data });

        cache.writeQuery({ query, variables, data });
    }));
};

const deltaRecordsProcessor = <T = { [key: string]: any }>(
    logger,
    deltaOperationName: string,
    deltaRecords: T[],
    baseResult: T[],
    typename: string,
    idField
) => {
    const opType = getOpTypeFromOperationName(deltaOperationName);

    logger({ deltaOperationName, opType, deltaRecords });

    if (!deltaRecords.length) {
        return baseResult;
    }

    let result = [...baseResult];

    deltaRecords.forEach(deltaRecord => {
        const incomingRecord = { ...(deltaRecord as any), __typename: typename };

        const isRemove = opType === CacheOperationTypes.REMOVE || incomingRecord.aws_ds === 'DELETE';
        const updater = getUpdater<T>(
            opType === CacheOperationTypes.AUTO && !isRemove
                ? CacheOperationTypes.ADD
                : (isRemove ? CacheOperationTypes.REMOVE : opType),
            idField
        );

        logger({ incomingRecord, isRemove });

        result = updater([...baseResult], incomingRecord);
    });

    return result;
};

const updateBaseWithDelta = <T = { [key: string]: any }, TVariables = OperationVariables>(
    logger,
    baseQuery: BuildBaseQuerySyncOptions<TVariables>,
    otherQuery: BuildQuerySyncOptions<TVariables>,
    cache: DataProxy,
    data: T,
    cacheUpdates: (item: T) => QueryWithVariables[] = () => [] as QueryWithVariables[],
    typename: string,
    idField: string = 'id',
) => {
    const updateLogger = logger.extend('update');

    if (!baseQuery || !baseQuery.query) {
        updateLogger('No baseQuery provided');
        return;
    }

    const { query, variables } = baseQuery;

    const operationName = getOperationFieldName(query);

    const { [operationName]: baseResult } = cache.readQuery({ query, variables });

    if (!Array.isArray(baseResult)) {
        throw new Error('Not an array');
    }

    const opDefinition = getMainDefinition(otherQuery.query);
    const { name: { value: opName }, alias: opAliasNode } = opDefinition.selectionSet.selections[0] as FieldNode;
    const { value: opAlias = null } = opAliasNode || {};

    const { kind, operation: graphqlOperation } = opDefinition as OperationDefinitionNode;
    const isSubscription = kind === 'OperationDefinition' && graphqlOperation === 'subscription';

    const [deltaOperationName] = isSubscription ? Object.keys(data) : [opAlias || opName];
    const { [deltaOperationName]: records }: { [key: string]: any } = data;
    const deltaRecords = [].concat(records) as T[];

    const result = deltaRecordsProcessor<T>(updateLogger, deltaOperationName, deltaRecords, baseResult, typename, idField);

    if (result === baseResult) {
        return;
    }

    cache.writeQuery({ query, data: { [operationName]: result } });

    writeCacheUpdates(updateLogger, cache, deltaRecords, cacheUpdates);
};

export type COSA<TVariables = OperationVariables> = BuildQuerySyncOptions<TVariables>;
export type BuildQuerySyncOptions<TVariables = OperationVariables> = {
    query: DocumentNode, variables: TVariables
};

export type BuildBaseQuerySyncOptions<T, TVariables = OperationVariables> = QuerySyncOptions<T, TVariables> & {
    refreshIntervalInSeconds?: number
};

//#endregion

export const offlineEffectConfig: OfflineEffectConfig = {
    enqueueAction: actions.ENQUEUE,
    effect,
    discard,
    reducer,
};
