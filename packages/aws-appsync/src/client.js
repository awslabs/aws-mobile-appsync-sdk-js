/*!
 * Copyright 2017-2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * Licensed under the Amazon Software License (the "License"). You may not use this file except in compliance with the License. A copy of 
 * the License is located at
 *     http://aws.amazon.com/asl/
 * or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY 
 * KIND, express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
import ApolloClient, { ApolloClientOptions, MutationOptions } from 'apollo-client';
import { InMemoryCache } from 'apollo-cache-inmemory';
import { ApolloLink, FetchResult } from 'apollo-link';
import { HttpLink } from 'apollo-link-http';
import { getMainDefinition, getOperationDefinition, variablesInOperation } from 'apollo-utilities';

import OfflineCache from './cache/index';
import { OfflineLink, AuthLink, NonTerminatingHttpLink, SubscriptionHandshakeLink, ComplexObjectLink } from './link';
import { createStore } from './store';

class AWSAppSyncClient extends ApolloClient {

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
    constructor({ url, region, auth, conflictResolver, complexObjectsCredentials, disableOffline = false }, options) {
        if (!url || !region || !auth) {
            throw new Error(
                'In order to initialize AWSAppSyncClient, you must specify url, region and auth properties on the config object.'
            );
        }

        let res;
        this.hydratedPromise = new Promise((resolve, reject) => {
            res = resolve;
        });

        const store = disableOffline ? null : createStore(
            this,
            () => {
                store.dispatch({ type: 'REHYDRATE_STORE' });
                res(this);
            },
            conflictResolver,
        );
        const cache = disableOffline ? new InMemoryCache() : new OfflineCache(store);

        const passthrough = (op, forward) => (forward ? forward(op) : Observable.of());
        let link = ApolloLink.from([
            disableOffline ? passthrough : new OfflineLink(store),
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

        if (disableOffline) {
            res(this);
        }
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
