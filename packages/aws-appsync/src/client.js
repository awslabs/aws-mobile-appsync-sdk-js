/*!
 * Copyright 2017-2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * Licensed under the Amazon Software License (the "License"). You may not use this file except in compliance with the License. A copy of 
 * the License is located at
 *     http://aws.amazon.com/asl/
 * or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY 
 * KIND, express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
import ApolloClient, { ApolloClientOptions, MutationOptions } from 'apollo-client';
import { NormalizedCache } from 'apollo-cache-inmemory';
import { ApolloLink, FetchResult } from 'apollo-link';
import { HttpLink } from 'apollo-link-http';
import { getMainDefinition, getOperationDefinition, variablesInOperation } from 'apollo-utilities';

import { Action, applyMiddleware, createStore, compose, combineReducers, Store } from 'redux';
import { offline } from '@redux-offline/redux-offline';
import offlineConfig from '@redux-offline/redux-offline/lib/defaults';
import thunk from 'redux-thunk';

import InMemoryCache, { reducer as cacheReducer, NORMALIZED_CACHE_KEY } from './cache/index';
import { OfflineLink, AuthLink, NonTerminatingHttpLink, SubscriptionHandshakeLink, ComplexObjectLink } from './link';
import { reducer as commitReducer, offlineEffect, discard } from './link/offline-link';

/**
 * 
 * @param {Function} persistCallback 
 * @param {*} effect
 * @returns {Store<NormalizedCache>}
 */
const newStore = (persistCallback = () => null, effect, discard) => {
    return createStore(
        combineReducers({
            rehydrated: (state = false, action) => {
                switch (action.type) {
                    case 'REHYDRATE_STORE':
                        return true;
                    default:
                        return state;
                }
            },
            ...cacheReducer(),
            ...commitReducer(),
        }),
        window && window.__REDUX_DEVTOOLS_EXTENSION__ ? window.__REDUX_DEVTOOLS_EXTENSION__() : {},
        compose(
            applyMiddleware(thunk),
            offline({
                ...offlineConfig,
                persistCallback,
                persistOptions: {
                    whitelist: [NORMALIZED_CACHE_KEY, 'offline']
                },
                effect,
                discard,
            })
        )
    );
};

class AWSAppSyncClient extends ApolloClient {

    /**
     * @type {Store<{}>}
     * @private
     */
    aasStore;

    /**
     * @type {Promise<AWSAppSyncClient>}
     */
    hydratedPromise;

    hydrated = () => this.hydratedPromise;

    /**
     * 
     * @param {string} url 
     * @param {ApolloClientOptions<InMemoryCache>} options
     */
    constructor({ url, region, auth, conflictResolver, complexObjectsCredentials }, options) {
        if (!url || !region || !auth) {
            throw new Error(`
                In order to initialize AWSAppSyncClient, you must specify url, region and auth properties on the config object.
            `);
        }

        let res;
        const hydratedPromise = new Promise((resolve, reject) => {
            res = resolve;
        });

        const store = newStore(
            () => {
                this.aasStore.dispatch({ type: 'REHYDRATE_STORE' });
                res(this);
            },
            (effect, action) => offlineEffect(this, effect, action),
            discard(conflictResolver),
        );
        const cache = new InMemoryCache(store);

        let link = ApolloLink.from([
            new OfflineLink(store),
            new ComplexObjectLink(complexObjectsCredentials),
            new AuthLink({ url, region, auth }),
            ApolloLink.split(
                operation => {
                    const { query } = operation;
                    const { kind, operation: graphqlOperation } = getMainDefinition(query);
                    const isSubscription = kind === 'OperationDefinition' && graphqlOperation === 'subscription';

                    return isSubscription;
                },
                ApolloLink.from([
                    new NonTerminatingHttpLink('subsInfo', { uri: url }, true),
                    new SubscriptionHandshakeLink('subsInfo'),
                ]),
                new HttpLink({ uri: url }),
            ),
        ]);

        const newOptions = {
            ...options,
            link,
            cache,
        };

        super(newOptions);

        this.hydratedPromise = hydratedPromise;
        this.aasStore = store;
    }

    /**
     * 
     * @param {MutationOptions} options
     * @returns {Promise<FetchResult>}
     */
    mutate(options, extraOpts = {}) {
        const { mutation, variables: mutationVariables, optimisticResponse, context: origContext = {} } = options;
        const { AASContext: { ...origASAContext = {} } = {} } = origContext;

        const operationDefinition = getOperationDefinition(mutation);
        const varsInOperation = variablesInOperation(operationDefinition);
        const variables = Array.from(varsInOperation).reduce((obj, key) => {
            obj[key] = mutationVariables[key];
            return obj;
        }, {});

        // refetchQueries left out intentionally when !doIt so we don't run them twice
        const { refetchQueries, ...otherOptions } = options;
        const { doIt } = origASAContext;

        const context = {
            ...origContext,
            AASContext: {
                ...origASAContext,
                mutation,
                variables,
                optimisticResponse,
                refetchQueries,
            },
        };

        return super.mutate({
            ...otherOptions,
            refetchQueries: doIt ? refetchQueries : undefined,
            context,
        });
    }

};

export { AWSAppSyncClient };
