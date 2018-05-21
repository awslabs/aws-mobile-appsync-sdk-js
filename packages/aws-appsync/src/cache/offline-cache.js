/*!
 * Copyright 2017-2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * Licensed under the Amazon Software License (the "License"). You may not use this file except in compliance with the License. A copy of
 * the License is located at
 *     http://aws.amazon.com/asl/
 * or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
import { Cache } from 'apollo-cache';
import { InMemoryCache, ApolloReducerConfig, NormalizedCache, defaultDataIdFromObject } from 'apollo-cache-inmemory';
import { Store, Action } from 'redux';

export const NORMALIZED_CACHE_KEY = 'appsync';
export const METADATA_KEY = 'appsync-metadata';
export { defaultDataIdFromObject };

export const DO_IT_KEY = typeof Symbol !== 'undefined' ? Symbol('doIt') : '@@doIt';

const WRITE_CACHE_ACTION = 'AAS_WRITE_CACHE';

export default class MyCache extends InMemoryCache {

    /**
     * @type {Store<NormalizedCache>}
     * @private
     */
    store;

    /**
     *
     * @param {Store<NormalizedCache>} store
     * @param {ApolloReducerConfig} config
     */
    constructor(store, config = {}) {
        super(config);

        this.store = store;

        this.cancelSubscription = store.subscribe(() => {
            const { [NORMALIZED_CACHE_KEY]: normCache = {}, rehydrated = false } = this.store.getState();
            super.restore({ ...normCache });
            if (rehydrated) {
                // console.log('Rehydrated! Cancelling subscription.');
                this.cancelSubscription();
            }
        });
    }

    restore(data) {
        this.store.dispatch(writeThunk(WRITE_CACHE_ACTION, data));

        super.restore(data);
        super.broadcastWatches();

        return this;
    }

    transformDocument(document) {
        const doIt = document[DO_IT_KEY];
        const result = super.transformDocument(document);

        result[DO_IT_KEY] = doIt;

        return result;
    }

    /**
     *
     * @param {Cache.WriteOptions} write
     */
    write(write) {
        super.write(write);
        if (this.data && typeof this.data.record === 'undefined') {
            // do not persist contents of a RecordingCache
            const data = super.extract(true);
            this.store.dispatch(writeThunk(WRITE_CACHE_ACTION, data));
        } else {
            // console.log('NO DISPATCH FOR RECORDINGCACHE')
        }
    }

    reset() {
        this.store.dispatch(writeThunk(WRITE_CACHE_ACTION, {}));

        return super.reset();
    }

    recordOptimisticTransaction(transaction, id) {
        const x = c => {
            // console.log('doing transaction', id);
            const proxy = new Proxy(c, {
                get: (target, property, receiver) => {
                    switch (property) {
                        case 'writeQuery':
                            // case 'write':
                            // return (...args) => console.log(property, ...args);
                            return (...args) => target[property].apply(target, args);
                        // return (...args) => (console.log(property, ...args), target[property].apply(target, args));
                    }
                    return target[property];
                }
            });
            return transaction(proxy)
        };
        return super.recordOptimisticTransaction(x, id);

        // this.data
        // get this.optimistic.find(o => o.id === id) // {id, transaction, data}
    }

    removeOptimistic(id) {
        return super.removeOptimistic(id);
    }
}

const writeThunk = (type, payload) => (dispatch) => {
    dispatch({
        type,
        payload,
    });
};

export const reducer = () => ({
    [NORMALIZED_CACHE_KEY]: (state = {}, action) => {
        const { type, payload: normCache } = action;
        switch (type) {
            case WRITE_CACHE_ACTION:
                return {
                    ...normCache
                };
            default:
                return state;
        }
    }
});
