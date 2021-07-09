/*!
 * Copyright 2017-2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { defaultNormalizedCacheFactory, NormalizedCacheObject } from "apollo-cache-inmemory";
import { ApolloLink, Observable, Operation, execute, GraphQLRequest, NextLink, FetchResult } from "apollo-link";
import { getOperationDefinition, getMutationDefinition, resultKeyNameFromField, tryFunctionOrLogError } from "apollo-utilities";
import { PERSIST_REHYDRATE } from "@redux-offline/redux-offline/lib/constants";
import { OfflineAction } from "@redux-offline/redux-offline/lib/types";
import { FieldNode, ExecutionResult } from "graphql";

import { NORMALIZED_CACHE_KEY, METADATA_KEY } from "../cache";
import { AWSAppsyncGraphQLError } from "../types";
import { Store } from "redux";
import { OfflineCache, AppSyncMetadataState } from "../cache/offline-cache";
import { isUuid, getOperationFieldName, rootLogger } from "../utils";
import AWSAppSyncClient from "..";
import { MutationUpdaterFn, MutationQueryReducersMap, ApolloError } from "apollo-client";
import { RefetchQueryDescription, FetchPolicy } from "apollo-client/core/watchQueryOptions";
import { OfflineCallback } from "../client";
import { SKIP_RETRY_KEY } from "./retry-link";
import { OfflineEffectConfig } from "../store";

const logger = rootLogger.extend('offline-link');

const actions = {
    SAVE_SNAPSHOT: 'SAVE_SNAPSHOT',
    ENQUEUE: 'ENQUEUE_OFFLINE_MUTATION',
    COMMIT: 'COMMIT_OFFLINE_MUTATION',
    ROLLBACK: 'ROLLBACK_OFFLINE_MUTATION',
    SAVE_SERVER_ID: 'SAVE_SERVER_ID',
};

const IS_OPTIMISTIC_KEY = typeof Symbol !== 'undefined' ? Symbol('isOptimistic') : '@@isOptimistic';

export const isOptimistic = obj => typeof obj[IS_OPTIMISTIC_KEY] !== undefined ? !!obj[IS_OPTIMISTIC_KEY] : false;

export class OfflineLink extends ApolloLink {

    private store: Store<OfflineCache>;

    constructor(store: Store<OfflineCache>) {
        super();

        this.store = store;
    }

    request(operation: Operation, forward: NextLink) {
        return new Observable(observer => {
            const { offline: { online } } = this.store.getState();
            const { operation: operationType } = getOperationDefinition(operation.query);
            const isMutation = operationType === 'mutation';
            const isQuery = operationType === 'query';

            if (!online && isQuery) {
                const data = processOfflineQuery(operation, this.store);

                observer.next({ data });
                observer.complete();

                return () => null;
            }

            if (isMutation) {
                const { AASContext: { doIt = false } = {}, cache } = operation.getContext();

                if (!doIt) {
                    const { [METADATA_KEY]: { snapshot: { enqueuedMutations } } } = this.store.getState();

                    if (enqueuedMutations === 0) {
                        boundSaveSnapshot(this.store, cache);
                    }

                    const data = enqueueMutation(operation, this.store, observer);

                    if (!online) {
                        observer.next({ data, [IS_OPTIMISTIC_KEY]: true });
                        observer.complete();
                    }

                    return () => null;
                }
            }

            const handle = forward(operation).subscribe({
                next: observer.next.bind(observer),
                error: observer.error.bind(observer),
                complete: observer.complete.bind(observer),
            });

            return () => {
                if (handle) handle.unsubscribe();
            };
        });
    }
}

export const boundSaveSnapshot = (store, cache) => store.dispatch(saveSnapshot(cache));
const saveSnapshot = (cache) => ({
    type: actions.SAVE_SNAPSHOT,
    payload: { cache },
});

const processOfflineQuery = (operation: Operation, theStore: Store<OfflineCache>) => {
    const { [NORMALIZED_CACHE_KEY]: normalizedCache = {} } = theStore.getState();
    const { query, variables } = operation;
    const { cache } = operation.getContext();

    const store = defaultNormalizedCacheFactory(normalizedCache);

    const data = cache.storeReader.readQueryFromStore({
        store,
        query,
        variables,
    });

    return data;
}

export type EnqueuedMutationEffect<T> = {
    optimisticResponse: object,
    operation: GraphQLRequest,
    update: MutationUpdaterFn<T>,
    updateQueries: MutationQueryReducersMap<T>,
    refetchQueries: ((result: ExecutionResult) => RefetchQueryDescription) | RefetchQueryDescription,
    observer: ZenObservable.SubscriptionObserver<T>,
    fetchPolicy?: FetchPolicy
};

const enqueueMutation = <T>(operation: Operation, theStore: Store<OfflineCache>, observer: ZenObservable.SubscriptionObserver<T>): object => {
    const { query: mutation, variables } = operation;
    const {
        AASContext: {
            optimisticResponse: origOptimistic,
            update,
            updateQueries,
            refetchQueries,
            fetchPolicy,
        },
    } = operation.getContext();

    const optimisticResponse = typeof origOptimistic === 'function' ? origOptimistic(variables) : origOptimistic;

    setImmediate(() => {
        const effect: EnqueuedMutationEffect<any> = {
            optimisticResponse,
            operation,
            update,
            updateQueries,
            refetchQueries,
            fetchPolicy,
            observer,
        };

        theStore.dispatch({
            type: actions.ENQUEUE,
            payload: { optimisticResponse },
            meta: {
                offline: {
                    effect,
                    commit: { type: actions.COMMIT },
                    rollback: { type: actions.ROLLBACK },
                }
            }
        });
    });

    let result;

    if (optimisticResponse) {
        result = optimisticResponse;
    } else {
        const mutationDefinition = getMutationDefinition(mutation);

        result = mutationDefinition.selectionSet.selections.reduce((acc, elem: FieldNode) => {
            acc[resultKeyNameFromField(elem)] = null

            return acc;
        }, {});
    }

    return result;
}

const effect = async <TCache extends NormalizedCacheObject>(
    store: Store<OfflineCache>,
    client: AWSAppSyncClient<TCache>,
    effect: EnqueuedMutationEffect<any>,
    action: OfflineAction,
    callback: OfflineCallback,
): Promise<FetchResult<Record<string, any>, Record<string, any>>> => {
    const doIt = true;
    const {
        optimisticResponse: origOptimistic,
        operation: { variables: origVars, query: mutation, context },
        update,
        updateQueries,
        refetchQueries,
        fetchPolicy,
        observer,
    } = effect;

    await client.hydrated();

    const { [METADATA_KEY]: { idsMap } } = store.getState();
    const variables = {
        ...replaceUsingMap({ ...origVars }, idsMap),
        [SKIP_RETRY_KEY]: true, // Enqueued mutations shouldn't be retried by the retryLink, but by redux-offline
    };
    const optimisticResponse = replaceUsingMap({ ...origOptimistic }, idsMap);

    return new Promise((resolve, reject) => {
        if (!client.queryManager) {
            client.initQueryManager();
        }

        const buildOperationForLink: Function = (client.queryManager as any).buildOperationForLink;
        const extraContext = {
            AASContext: {
                doIt
            },
            ...context,
            optimisticResponse
        };
        const operation = buildOperationForLink.call(client.queryManager, mutation, variables, extraContext);

        logger('Executing link', operation);
        execute(client.link, operation).subscribe({
            next: data => {
                boundSaveServerId(store, optimisticResponse, data.data);

                const {
                    [METADATA_KEY]: { idsMap, snapshot: { cache: cacheSnapshot } },
                    offline: { outbox: [, ...enquededMutations] }
                } = store.getState();

                // Restore from cache snapshot
                client.cache.restore(cacheSnapshot as TCache);

                const dataStore = client.queryManager.dataStore;

                if (fetchPolicy !== 'no-cache') {
                    dataStore.markMutationResult({
                        mutationId: null,
                        result: data,
                        document: mutation,
                        variables,
                        updateQueries: {}, // TODO: populate this?
                        update
                    });
                }

                boundSaveSnapshot(store, client.cache);

                // Apply enqueued update functions to new cache
                const enqueuedActionsFilter = [
                    offlineEffectConfig.enqueueAction
                ];
                enquededMutations
                    .filter(({ type }) => enqueuedActionsFilter.indexOf(type) > -1)
                    .forEach(({ meta: { offline: { effect } } }) => {
                        const {
                            operation: { variables = {}, query: document = null } = {},
                            update,
                            optimisticResponse: origOptimisticResponse,
                            fetchPolicy,
                        } = effect as EnqueuedMutationEffect<any>;

                        if (typeof update !== 'function') {
                            logger('No update function for mutation', { document, variables });
                            return;
                        }

                        const optimisticResponse = replaceUsingMap({ ...origOptimisticResponse }, idsMap);
                        const result = { data: optimisticResponse };

                        if (fetchPolicy !== 'no-cache') {
                            logger('Running update function for mutation', { document, variables });

                            dataStore.markMutationResult({
                                mutationId: null,
                                result,
                                document,
                                variables,
                                updateQueries: {}, // TODO: populate this?
                                update
                            });
                        }
                    });

                client.queryManager.broadcastQueries();

                resolve({ data });

                if (observer.next && !observer.closed) {
                    observer.next({ ...data, [IS_OPTIMISTIC_KEY]: false });
                    observer.complete();
                } else {
                    // throw new Error('Manually interact with cache');
                }

                if (typeof callback === 'function') {
                    const mutationName = getOperationFieldName(mutation);
                    const { additionalDataContext: { newVars = operation.variables } = {}, ...restContext } = data.context || {};

                    if (!Object.keys(restContext || {}).length) {
                        delete data.context;
                    } else {
                        data.context = restContext;
                    }

                    tryFunctionOrLogError(() => {
                        const errors = data.errors ? {
                            mutation: mutationName,
                            variables: newVars,
                            error: new ApolloError({
                                graphQLErrors: data.errors,
                            }),
                            notified: !!observer.next,
                        } : null;
                        const success = errors === null ? {
                            mutation: mutationName,
                            variables: newVars,
                            ...data,
                            notified: !!observer.next,
                        } : null;

                        callback(errors, success);
                    });
                }
            },
            error: err => {
                logger('Error when executing link', err);

                reject(err);
            }
        });
    });
}

const reducer = dataIdFromObject => (state: AppSyncMetadataState, action) => {
    const { type, payload } = action;

    switch (type) {
        case PERSIST_REHYDRATE:
            const { [METADATA_KEY]: rehydratedState } = payload;

            return rehydratedState || state;
        default:
            const { idsMap: origIdsMap = {}, snapshot: origSnapshot = {}, ...restState } = state || {};
            const snapshot = snapshotReducer(origSnapshot, action);
            const idsMap = idsMapReducer(origIdsMap, { ...action, remainingMutations: snapshot.enqueuedMutations }, dataIdFromObject);

            return {
                ...restState,
                snapshot,
                idsMap,
            };
    }
};

const snapshotReducer = (state, action) => {
    const enqueuedMutations = enqueuedMutationsReducer(state && state.enqueuedMutations, action);
    const cache = cacheSnapshotReducer(state && state.cache, {
        ...action,
        enqueuedMutations
    });

    return {
        enqueuedMutations,
        cache,
    };
};

const enqueuedMutationsReducer = (state = 0, action) => {
    const { type } = action;

    switch (type) {
        case actions.ENQUEUE:
            return state + 1;
        case actions.COMMIT:
        case actions.ROLLBACK:
            return state - 1;
        default:
            return state;
    }
};

const cacheSnapshotReducer = (state = {}, action) => {
    const { type, payload } = action;

    switch (type) {
        case actions.SAVE_SNAPSHOT:
            const { cache } = payload;
            const cacheContents = { ...cache.extract(false) };

            return cacheContents;
        default:
            return state;
    }
};

const boundSaveServerId = (store, optimisticResponse, data) => store.dispatch(saveServerId(optimisticResponse, data));
const saveServerId = (optimisticResponse, data) => ({
    type: actions.SAVE_SERVER_ID,
    payload: { data, optimisticResponse },
});

const idsMapReducer = (state = {}, action, dataIdFromObject) => {
    const { type, payload = {} } = action;
    const { optimisticResponse } = payload;

    switch (type) {
        case actions.ENQUEUE:
            const ids = getIds(dataIdFromObject, optimisticResponse);
            const entries = Object.values(ids).reduce((acc: { [key: string]: string }, id: string) => (acc[id] = null, acc), {}) as object;

            return {
                ...state,
                ...entries,
            };
        case actions.COMMIT:
            const { remainingMutations } = action;

            // Clear ids map on last mutation
            return remainingMutations ? state : {};
        case actions.SAVE_SERVER_ID:
            const { data } = payload;

            const oldIds = getIds(dataIdFromObject, optimisticResponse);
            const newIds = getIds(dataIdFromObject, data);

            const mapped = mapIds(oldIds, newIds);

            return {
                ...state,
                ...mapped,
            };
        default:
            return state;
    }
};

const discard = (callback: OfflineCallback, error, action, retries) => {
    const discardResult = _discard(error, action, retries);

    if (discardResult) {
        // Call global error callback and observer
        const { meta: { offline: { effect: { observer } } } } = action;

        if (observer && !observer.closed) {
            observer.error(error);
        }

        if (typeof callback === 'function') {
            tryFunctionOrLogError(() => {
                callback({ error }, null);
            });
        }
    }

    return discardResult;
}

const _discard = (error, action: OfflineAction, retries) => {
    const { graphQLErrors = [] }: { graphQLErrors: AWSAppsyncGraphQLError[] } = error;

    if (graphQLErrors.length) {
        logger('Discarding action.', action, graphQLErrors);

        return true;
    } else {
        const { networkError: { graphQLErrors = [] } = { graphQLErrors: [] } } = error;
        const appSyncClientError = graphQLErrors.find(err => err.errorType && err.errorType.startsWith('AWSAppSyncClient:'));

        if (appSyncClientError) {
            logger('Discarding action.', action, appSyncClientError);

            return true;
        }
    }

    return error.permanent || retries > 10;
};

//#region utils

export const replaceUsingMap = (obj, map = {}) => {
    if (!obj || !map) {
        return obj;
    }

    const newVal = map[obj];
    if (newVal) {
        obj = newVal;

        return obj;
    }

    if (typeof obj === 'object') {
        Object.keys(obj).forEach(key => {
            const val = obj[key];

            if (Array.isArray(val)) {
                obj[key] = val.map((v, i) => replaceUsingMap(v, map));
            } else if (typeof val === 'object') {
                obj[key] = replaceUsingMap(val, map);
            } else {
                const newVal = map[val];
                if (newVal) {
                    obj[key] = newVal;
                }
            }
        });
    }

    return obj;
};

export const getIds = (dataIdFromObject, obj, path = '', acc = {}) => {
    if (!obj) {
        return acc;
    }

    if (typeof obj === 'object') {
        const dataId = dataIdFromObject(obj);

        if (dataId) {
            const [, , id = null] = dataId.match(/(.+:)?(.+)/) || [];

            if (isUuid(dataId)) {
                acc[path] = id;
            }
        }

        Object.keys(obj).forEach(key => {
            const val = obj[key];

            if (Array.isArray(val)) {
                val.forEach((v, i) => getIds(dataIdFromObject, v, `${path}.${key}[${i}]`, acc));
            } else if (typeof val === 'object') {
                getIds(dataIdFromObject, val, `${path}${path && '.'}${key}`, acc);
            }
        });
    }

    return getIds(dataIdFromObject, null, path, acc);
};

const intersectingKeys = (obj1 = {}, obj2 = {}) => {
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    return keys1.filter(k => keys2.indexOf(k) !== -1);
};

const mapIds = (obj1, obj2) => intersectingKeys(obj1, obj2).reduce((acc, k) => (acc[obj1[k]] = obj2[k], acc), {});
//#endregion

export const offlineEffectConfig: OfflineEffectConfig = {
    enqueueAction: actions.ENQUEUE,
    effect,
    discard,
    reducer,
};
