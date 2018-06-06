/*!
 * Copyright 2017-2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * Licensed under the Amazon Software License (the "License"). You may not use this file except in compliance with the License. A copy of
 * the License is located at
 *     http://aws.amazon.com/asl/
 * or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
import { readQueryFromStore, defaultNormalizedCacheFactory } from "apollo-cache-inmemory";
import { ApolloLink, Observable, Operation } from "apollo-link";
import { getOperationDefinition, getOperationName } from "apollo-utilities";
import { Store, combineReducers } from "redux";
import { PERSIST_REHYDRATE } from "@redux-offline/redux-offline/lib/constants";

import { NORMALIZED_CACHE_KEY, METADATA_KEY } from "../cache";

const actions = {
    SAVE_SNAPSHOT: 'SAVE_SNAPSHOT',
    ENQUEUE: 'ENQUEUE_OFFLINE_MUTATION',
    COMMIT: 'COMMIT_OFFLINE_MUTATION',
    ROLLBACK: 'ROLLBACK_OFFLINE_MUTATION',
    SAVE_SERVER_ID: 'SAVE_SERVER_ID',
};

export class OfflineLink extends ApolloLink {

    /**
     * @type {Store}
     * @private
     */
    store;

    /**
     *
     * @param {Store} store
     */
    constructor(store) {
        super();
        this.store = store;
    }

    request(operation, forward) {
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
                const { optimisticResponse, AASContext: { doIt = false } = {} } = operation.getContext();

                if (!doIt) {
                    if (!optimisticResponse) {
                        console.warn('An optimisticResponse was not provided, it is required when using offline capabilities.');

                        if (!online) {
                            throw new Error('Missing optimisticResponse while offline.');
                        }

                        // offline muation without optimistic response is processed immediately
                    } else {
                        const data = enqueueMutation(operation, this.store, observer);

                        observer.next({ data });
                        observer.complete();

                        return () => null;
                    }
                }
            }

            const handle = forward(operation).subscribe({
                next: data => {
                    if (isMutation) {
                        const { [METADATA_KEY]: { snapshot: { cache: cacheSnapshot } } } = this.store.getState();
                        const { cache, AASContext: { client } } = operation.getContext();

                        client.queryManager.broadcastQueries = () => { };

                        const silenceBroadcast = cache.silenceBroadcast;
                        cache.silenceBroadcast = true;

                        cache.restore({ ...cacheSnapshot });

                        cache.silenceBroadcast = silenceBroadcast;
                    }

                    observer.next(data);
                },
                error: observer.error.bind(observer),
                complete: observer.complete.bind(observer),
            });

            return () => {
                if (handle) handle.unsubscribe();
            };
        });
    }
}

export const saveSnapshot = (cache) => ({
    type: actions.SAVE_SNAPSHOT,
    payload: { cache },
});

/**
 *
 * @param {Operation} operation
 * @param {Store} theStore
 */
const processOfflineQuery = (operation, theStore) => {
    const { [NORMALIZED_CACHE_KEY]: normalizedCache = {} } = theStore.getState();
    const { query, variables } = operation;

    const store = defaultNormalizedCacheFactory(normalizedCache);

    const data = readQueryFromStore({
        store,
        query,
        variables,
    });

    return data;
}

/**
 *
 * @param {Operation} operation
 * @param {Store} theStore
 */
const enqueueMutation = (operation, theStore, observer) => {
    const { query: mutation, variables } = operation;
    const { cache, optimisticResponse, AASContext: { doIt = false, refetchQueries, update } = {} } = operation.getContext();

    setImmediate(() => {
        theStore.dispatch({
            type: actions.ENQUEUE,
            payload: { optimisticResponse },
            meta: {
                offline: {
                    effect: {
                        mutation,
                        variables,
                        refetchQueries,
                        update,
                        optimisticResponse,
                    },
                    commit: { type: actions.COMMIT, meta: { optimisticResponse } },
                    rollback: { type: actions.ROLLBACK },
                }
            }
        });
    });

    return optimisticResponse;
}

/**
 *
 * @param {*} client
 * @param {*} effect
 * @param {*} action
 */
export const offlineEffect = (store, client, effect, action) => {
    const doIt = true;
    const { variables: origVars = {}, optimisticResponse: origOptimistic, ...otherOptions } = effect;

    const context = { AASContext: { doIt } };

    const { [METADATA_KEY]: { idsMap } } = store.getState();
    const variables = replaceUsingMap({ ...origVars }, idsMap);
    const optimisticResponse = replaceUsingMap({ ...origOptimistic }, idsMap);

    const options = {
        ...otherOptions,
        variables,
        optimisticResponse,
        context,
    };

    return client.mutate(options);
}

export const reducer = dataIdFromObject => ({
    [METADATA_KEY]: metadataReducer(dataIdFromObject),
});

const metadataReducer = dataIdFromObject => (state, action) => {
    const { type, payload } = action;

    switch (type) {
        case PERSIST_REHYDRATE:
            const { [METADATA_KEY]: rehydratedState } = payload;

            return rehydratedState || state;
        default:
            const snapshot = snapshotReducer(state && state.snapshot, action);
            const idsMap = idsMapReducer(state && state.idsMap, { ...action, remainingMutations: snapshot.enqueuedMutations }, dataIdFromObject);

            return {
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

            return { ...cache.extract(false) };
        default:
            return state;
    }
};

export const saveServerId = (optimisticResponse, data) => ({
    type: actions.SAVE_SERVER_ID,
    meta: { optimisticResponse },
    payload: { data },
});

const idsMapReducer = (state = {}, action, dataIdFromObject) => {
    const { type, payload, meta } = action;

    switch (type) {
        case actions.ENQUEUE:
            const { optimisticResponse } = payload;

            const ids = getIds(dataIdFromObject, optimisticResponse);
            const entries = Object.values(ids).reduce((acc, id) => (acc[id] = null, acc), {});

            return {
                ...state,
                ...entries,
            };
        case actions.COMMIT:
            const { remainingMutations } = action;

            // Clear ids map on last mutation
            return remainingMutations ? state : {};
        case actions.SAVE_SERVER_ID:
            const { optimisticResponse } = meta;
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

export const discard = (fn = () => null) => (error, action, retries) => {
    const { graphQLErrors = [] } = error;
    const conditionalCheck = graphQLErrors.find(err => err.errorType === 'DynamoDB:ConditionalCheckFailedException');

    if (conditionalCheck) {
        if (typeof fn === 'function') {
            const { data, path } = conditionalCheck;
            const { meta: { offline: { effect: { mutation, variables } } } } = action;
            const mutationName = getOperationName(mutation);
            const operationDefinition = getOperationDefinition(mutation)
            const { operation: operationType } = operationDefinition;

            try {
                const conflictResolutionResult = fn({
                    mutation,
                    mutationName,
                    operationType,
                    variables,
                    data,
                    retries,
                });

                if (conflictResolutionResult === 'DISCARD') {
                    return true;
                }

                if (conflictResolutionResult) {
                    action.meta.offline.effect.variables = conflictResolutionResult;

                    return false;
                }
            } catch (err) {
                // console.error('Error running conflict resolution. Discarding mutation.', err);

                return true;
            }
        }
    } else if (graphQLErrors.length) {
        // console.error('Discarding action.', action, graphQLErrors);

        return true;
    } else {
        const { networkError: { graphQLErrors = [] } = { graphQLErrors: [] } } = error;
        const appSyncClientError = graphQLErrors.find(err => err.errorType && err.errorType.startsWith('AWSAppSyncClient:'));

        if (appSyncClientError) {
            // console.error('Discarding action.', action, appSyncClientError);

            return true;
        }
    }

    return error.permanent || retries > 10;
};

//#region utils

export const replaceUsingMap = (obj, map = {}) => {
    if (!obj) {
        return obj;
    }

    const newVal = map[obj];
    if (newVal) {
        obj = newVal;

        return obj;
    }

    Object.keys(obj).forEach(key => {
        const val = obj[key];

        if (Array.isArray(val)) {
            val.forEach((v, i) => replaceUsingMap(v, map));
        } else if (typeof val === 'object') {
            replaceUsingMap(val, map);
        } else {
            const newVal = map[val];
            if (newVal) {
                obj[key] = newVal;
            }
        }
    });

    return obj;
};

const getIds = (dataIdFromObject, obj, path = '', acc = {}) => {
    if (!obj) {
        return acc;
    }

    const dataId = dataIdFromObject(obj);
    if (dataId) {
        const [, id] = dataId.split(':');
        acc[path] = id;
    }

    Object.keys(obj).forEach(key => {
        const val = obj[key];

        if (Array.isArray(val)) {
            val.forEach((v, i) => getIds(dataIdFromObject, v, `${path}.${key}[${i}]`, acc));
        } else if (typeof val === 'object') {
            getIds(dataIdFromObject, val, `${path}${path && '.'}${key}`, acc);
        }
    });

    return getIds(dataIdFromObject, null, path, acc);
};

const intersectingKeys = (obj1 = {}, obj2 = {}) => {
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    return keys1.filter(k => keys2.indexOf(k) !== -1);
};

const mapIds = (obj1, obj2) => intersectingKeys(obj1, obj2).reduce((acc, k) => (acc[obj1[k]] = obj2[k], acc), {});
//#endregion
