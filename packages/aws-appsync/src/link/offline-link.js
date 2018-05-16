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
import { Store } from "redux";

import { NORMALIZED_CACHE_KEY } from "../cache";

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
                const { cache, optimisticResponse, AASContext: { doIt = false } = {} } = operation.getContext();

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
            type: 'SOME_ACTION',
            payload: {},
            meta: {
                offline: {
                    effect: {
                        mutation,
                        variables,
                        refetchQueries,
                        update,
                        optimisticResponse,
                    },
                    commit: { type: 'SOME_ACTION_COMMIT', meta: null },
                    rollback: { type: 'SOME_ACTION_ROLLBACK', meta: null },
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
export const offlineEffect = (client, effect, action) => {
    const doIt = true;
    const { ...otherOptions } = effect;

    const context = { AASContext: { doIt } };

    const options = {
        ...otherOptions,
        context,
    };

    return client.mutate(options);
}

export const reducer = () => ({
    eclipse: (state = {}, action) => {
        const { type, payload } = action;
        switch (type) {
            case 'SOME_ACTION':
                return {
                    ...state,
                };
            case 'SOME_ACTION_COMMIT':
                return {
                    ...state,
                };
            case 'SOME_ACTION_ROLLBACK':
                return {
                    ...state,
                };
            default:
                return state;
        }
    }
});

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
        const { networkError: { graphQLErrors } = { graphQLErrors: [] } } = error;
        const appSyncClientError = graphQLErrors.find(err => err.errorType && err.errorType.startsWith('AWSAppSyncClient:'));

        if (appSyncClientError) {
            // console.error('Discarding action.', action, appSyncClientError);

            return true;
        }
    }

    return error.permanent || retries > 10;
};
