/*!
 * Copyright 2017-2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { OfflineAction } from "@redux-offline/redux-offline/lib/types";
import { NormalizedCacheObject, defaultNormalizedCacheFactory } from "apollo-cache-inmemory";
import { Store, AnyAction } from "redux";
import { OfflineCache, AppSyncMetadataState, METADATA_KEY } from "./cache/offline-cache";
import AWSAppSyncClient, { OfflineCallback, SubscribeWithSyncOptions, QuerySyncOptions } from "./client";
import { OfflineEffectConfig } from "./store";
import { tryFunctionOrLogError, graphQLResultHasError, getMainDefinition, addTypenameToDocument } from "apollo-utilities";
import { OperationVariables, MutationUpdaterFn } from "apollo-client";
import { hash, getOperationFieldName, rootLogger } from "./utils";
import { Observable, FetchResult } from "apollo-link";
import { Subscription } from "apollo-client/util/Observable";
import { DataProxy } from "apollo-cache";
import { SKIP_RETRY_KEY } from "./link/retry-link";
import { DocumentNode, print, OperationDefinitionNode, FieldNode, ExecutionResult } from "graphql";
import { getOpTypeFromOperationName, CacheOperationTypes, getUpdater, QueryWithVariables } from "./helpers/offline";
import { boundSaveSnapshot, replaceUsingMap, EnqueuedMutationEffect, offlineEffectConfig as mutationsConfig } from "./link/offline-link";
import { CONTROL_EVENTS_KEY } from "aws-appsync-subscription-link";

const logger = rootLogger.extend('deltasync');

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

export const hashForOptions = (options: SubscribeWithSyncOptions<any>) => {
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
        // If we don't have an observer, we complete this effect (this means the app was closed/opened and a completely 
        // new deltaSync will happen)
        return;
    }

    let upperBoundTimeMS = DEFAULT_UPPER_BOUND_TIME_MS;

    const hash = hashForOptions(options);
    const itemInHash = store.getState()[METADATA_KEY][DELTASYNC_KEY].metadata[hash];
    let {
        lastSyncTimestamp = itemInHash.lastSyncTimestamp,
        baseLastSyncTimestamp = itemInHash.baseLastSyncTimestamp
    } = options;


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

    const STOP_CACHE_RECORDING = typeof Symbol !== 'undefined' ? Symbol('stopCacheRecording') : '@@stopCacheRecording';

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

        //#region Subscription
        const subsControlLogger = logger.extend('subsc-control');

        await new Promise(resolve => {
            if (subscriptionQuery && subscriptionQuery.query) {
                const { query, variables } = subscriptionQuery;

                subscription = client.subscribe<FetchResult, any>({
                    query: query,
                    variables: {
                        ...variables,
                        [SKIP_RETRY_KEY]: true,
                        [CONTROL_EVENTS_KEY]: true,
                    },
                }).filter(data => {
                    const { extensions: { controlMsgType = undefined, controlMsgInfo = undefined } = {} } = data;
                    const isControlMsg = typeof controlMsgType !== 'undefined';

                    if (controlMsgType) {
                        subsControlLogger(controlMsgType, controlMsgInfo);

                        if (controlMsgType === 'CONNECTED') {
                            resolve();
                        }
                    }

                    return !isControlMsg;
                }).subscribe({
                    next: data => {
                        subscriptionProcessor.enqueue(data);
                    },
                    error: (err) => {
                        resolve();

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
            } else {
                resolve();
            }
        });

        if (error) {
            throw error;
        }
        //#endregion

        const { baseRefreshIntervalInSeconds } = baseQuery || { baseRefreshIntervalInSeconds: undefined };
        upperBoundTimeMS = baseRefreshIntervalInSeconds ? baseRefreshIntervalInSeconds * 1000 : DEFAULT_UPPER_BOUND_TIME_MS;

        const skipBaseQuery = !(baseQuery && baseQuery.query) || (baseLastSyncTimestamp
            ? Date.now() - baseLastSyncTimestamp < upperBoundTimeMS
            : itemInHash.baseLastSyncTimestamp && Date.now() - itemInHash.baseLastSyncTimestamp < upperBoundTimeMS);

        //#region Base query
        if (baseQuery && baseQuery.query) {
            const { query, update, variables } = baseQuery;

            logger(`${skipBaseQuery ? 'Skipping' : 'Running'} base query`, { baseLastSyncTimestamp, itemInHash });
            if (!skipBaseQuery) {
                const result = await client.query({
                    fetchPolicy: 'no-cache',
                    query,
                    variables,
                });
                cacheProxy.writeQuery({ query, variables, data: result.data });

                if (typeof update === 'function') {
                    tryFunctionOrLogError(() => {
                        update(cacheProxy, result);
                    });
                }

                baseLastSyncTimestamp = Date.now() - BUFFER_MILLISECONDS;
                boundUpdateLastSync(store, { hash, baseLastSyncTimestamp });
            } else {
                try {
                    if (enquededMutations.length === 1) {
                        boundSaveSnapshot(store, client.cache);
                    }
                    const {
                        [METADATA_KEY]: { snapshot: { cache: cacheSnapshot } },
                    } = store.getState();

                    const data = (cacheProxy as any).storeReader.readQueryFromStore({
                        store: defaultNormalizedCacheFactory(cacheSnapshot),
                        query: addTypenameToDocument(query),
                        variables,
                    });

                    cacheProxy.writeQuery({ query, variables, data });
                } catch (error) {
                    logger('Error reading/writting baseQuery from store', error);
                }
            }
        }
        //#endregion

        //#region Delta query
        if (deltaQuery && deltaQuery.query && !skipBaseQuery) {
            logger('Skipping deltaQuery');
        }

        if (deltaQuery && deltaQuery.query && skipBaseQuery) {
            const { query, update, variables } = deltaQuery;

            logger('Running deltaQuery', { lastSyncTimestamp, baseLastSyncTimestamp });
            const result = await client.query({
                fetchPolicy: 'no-cache',
                query: query,
                variables: {
                    ...variables,
                    lastSync: Math.floor((lastSyncTimestamp || baseLastSyncTimestamp) / 1000) || 0,
                },
            });

            if (typeof update === 'function') {
                tryFunctionOrLogError(() => {
                    update(cacheProxy, result);
                });
            }

            lastSyncTimestamp = Date.now() - BUFFER_MILLISECONDS;
            boundUpdateLastSync(store, { hash, lastSyncTimestamp });
        }
        //#endregion

        if (error) {
            throw error;
        }

        // process subscription messages
        subscriptionProcessor.ready();
        cacheProxy[STOP_CACHE_RECORDING] = true;

        if (enquededMutations.length === 1) {
            boundSaveSnapshot(store, client.cache);
        } else {
            // Restore from cache snapshot
            client.cache.restore(cacheSnapshot as TCache);
        }

        recorderCacheWrites.forEach(client.cache.write.bind(client.cache));

        boundSaveSnapshot(store, client.cache);

        client.initQueryManager();
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

        throw error;
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
            return metadataReducer(state, action as OfflineAction);
        default:
            const newState: AppSyncMetadataState = {
                ...state,
                [DELTASYNC_KEY]: {
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

    const newState: AppSyncMetadataState = {
        ...state,
        [DELTASYNC_KEY]: {
            ...deltaSync,
            metadata: {
                ...otherHashes,
                [hash]: newMetadata
            }
        }
    };

    return newState;
};

const metadataReducer = (state: AppSyncMetadataState, action: OfflineAction) => {
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

    const newState: AppSyncMetadataState = {
        ...state,
        [DELTASYNC_KEY]: {
            metadata: {
                ...metadata,
                [hash]: newMetadata,
            }
        }
    };

    return newState;
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
        baseQuery?: BuildBaseQuerySyncOptions<T>,
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

    const result: SubscribeWithSyncOptions<T> = {
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
                    updateBaseWithDelta<T>(loggerHelper, baseQuery, subscriptionQuery, cache, data as T, cacheUpdates, typename, idField);
                }
            })
        },
        deltaQuery: {
            ...deltaQuery,
            ...(deltaQuery && {
                update: (cache, { data }: ExecutionResult) => {
                    updateBaseWithDelta<T>(loggerHelper, baseQuery, deltaQuery, cache, data as T, cacheUpdates, typename, idField);
                }
            })
        },
    };

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

        result = updater([...result], incomingRecord);
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

    const opDefinition = getMainDefinition(otherQuery.query);
    const { name: { value: opName }, alias: opAliasNode } = opDefinition.selectionSet.selections[0] as FieldNode;
    const { value: opAlias = null } = opAliasNode || {};

    const { kind, operation: graphqlOperation } = opDefinition as OperationDefinitionNode;
    const isSubscription = kind === 'OperationDefinition' && graphqlOperation === 'subscription';

    const [deltaOperationName] = isSubscription ? Object.keys(data) : [opAlias || opName];
    const { [deltaOperationName]: records }: { [key: string]: any } = data;
    const deltaRecords = [].concat(records) as T[];

    if (!baseQuery || !baseQuery.query) {
        updateLogger('No baseQuery provided');
    } else {
        const { query, variables } = baseQuery;

        const operationName = getOperationFieldName(query);

        const { [operationName]: baseResult } = cache.readQuery<{ [key: string]: any }>({ query, variables });

        if (!Array.isArray(baseResult)) {
            throw new Error('Result of baseQuery is not an array');
        }

        const result = deltaRecordsProcessor<T>(updateLogger, deltaOperationName, deltaRecords, baseResult, typename, idField);

        if (result !== baseResult) {
            cache.writeQuery({ query, data: { [operationName]: result } });
        }
    }

    writeCacheUpdates(updateLogger, cache, deltaRecords, cacheUpdates);
};

export type BuildQuerySyncOptions<TVariables = OperationVariables> = {
    query: DocumentNode, variables: TVariables
};

export type BuildBaseQuerySyncOptions<T, TVariables = OperationVariables> = QuerySyncOptions<T, TVariables> & {
    baseRefreshIntervalInSeconds?: number
};

//#endregion

export const offlineEffectConfig: OfflineEffectConfig = {
    enqueueAction: actions.ENQUEUE,
    effect,
    discard,
    reducer,
};
