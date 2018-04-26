/*!
 * Copyright 2017-2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * Licensed under the Amazon Software License (the "License"). You may not use this file except in compliance with the License. A copy of
 * the License is located at
 *     http://aws.amazon.com/asl/
 * or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
import "node-window-polyfill/register";
import 'setimmediate';
import ApolloClient, { ApolloClientOptions, MutationOptions } from 'apollo-client';
import { InMemoryCache } from 'apollo-cache-inmemory';
import { ApolloLink, FetchResult, Observable } from 'apollo-link';
import { HttpLink } from 'apollo-link-http';
import { getMainDefinition, getOperationDefinition, variablesInOperation } from 'apollo-utilities';

import OfflineCache from './cache/index';
import { OfflineLink, AuthLink, NonTerminatingHttpLink, SubscriptionHandshakeLink, ComplexObjectLink } from './link';
import { createStore } from './store';

export const createSubscriptionHandshakeLink = (url, resultsFetcherLink = new HttpLink({ uri: url })) => {
    return ApolloLink.split(
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
        resultsFetcherLink,
    );
};

export const createAuthLink = ({ url, region, auth }) => new AuthLink({ url, region, auth });

const passthrough = (op, forward) => (forward ? forward(op) : Observable.of());

export const createAppSyncLink = ({
    url,
    region,
    auth,
    complexObjectsCredentials,
    resultsFetcherLink = new HttpLink({ uri: url }),
}) => {
    const link = ApolloLink.from([
        createLinkWithStore((store) => new OfflineLink(store)),
        new ComplexObjectLink(complexObjectsCredentials),
        createAuthLink({ url, region, auth }),
        createSubscriptionHandshakeLink(url, resultsFetcherLink)
    ].filter(Boolean));

    return link;
};

export const createLinkWithCache = (createLinkFunc = () => new ApolloLink(passthrough)) => {
    let theLink;

    return new ApolloLink((op, forward) => {
        if (!theLink) {
            const { cache } = op.getContext();

            theLink = createLinkFunc(cache);
        }

        return theLink.request(op, forward);
    });
}

const createLinkWithStore = (createLinkFunc = () => new ApolloLink(passthrough)) => {
    return createLinkWithCache(({ store }) => store ? createLinkFunc(store) : new ApolloLink(passthrough));
}

class AWSAppSyncClient extends ApolloClient {

    /**
     * @type {Promise<AWSAppSyncClient>}
     */
    hydratedPromise;

    hydrated = () => this.hydratedPromise;

    /**
     *
     * @param {object} appSyncOptions
     * @param {ApolloClientOptions<InMemoryCache>} options
     */
    constructor({
        url,
        region,
        auth,
        conflictResolver,
        complexObjectsCredentials,
        cacheOptions,
        disableOffline = false
    } = {}, options = {}) {
        const { cache: customCache, link: customLink } = options;

        if (!customLink && (!url || !region || !auth)) {
            throw new Error(
                'In order to initialize AWSAppSyncClient, you must specify url, region and auth properties on the config object or a custom link.'
            );
        }

        let resolveClient;

        const store = disableOffline ? null : createStore(() => this, () => resolveClient(this), conflictResolver);
        const cache = disableOffline ? (customCache || new InMemoryCache(cacheOptions)) : new OfflineCache(store, cacheOptions);

        const waitForRehydrationLink = new ApolloLink((op, forward) => {
            let handle = null;

            return new Observable(observer => {
                this.hydratedPromise.then(() => {
                    handle = passthrough(op, forward).subscribe(observer);
                }).catch(observer.error);

                return () => {
                    if (handle) {
                        handle.unsubscribe();
                    }
                };
            });
        });
        const link = waitForRehydrationLink.concat(customLink || createAppSyncLink({ url, region, auth, complexObjectsCredentials }));

        const newOptions = {
            ...options,
            link,
            cache,
        };

        super(newOptions);

        this.hydratedPromise = disableOffline ? Promise.resolve(this) : new Promise(resolve => resolveClient = resolve);
    }

    /**
     *
     * @param {MutationOptions} options
     * @returns {Promise<FetchResult>}
     */
    mutate(options) {
        const { update, refetchQueries, context: origContext = {}, ...otherOptions } = options;
        const { AASContext: { doIt = false, ...restAASContext } = {} } = origContext;

        const context = {
            ...origContext,
            AASContext: {
                doIt,
                ...restAASContext,
                ...(!doIt ? { refetchQueries, update } : {}),
            }
        };

        const { optimisticResponse, variables } = otherOptions;
        const data = optimisticResponse &&
            (typeof optimisticResponse === 'function' ? { ...optimisticResponse(variables) } : optimisticResponse);

        const newOptions = {
            ...otherOptions,
            optimisticResponse: data,
            update,
            ...(doIt ? { refetchQueries } : {}),
            context,
        }

        return super.mutate(newOptions);
    }

}

export default AWSAppSyncClient;
export { AWSAppSyncClient };
