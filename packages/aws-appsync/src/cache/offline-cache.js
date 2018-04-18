/*!
 * Copyright 2017-2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * Licensed under the Amazon Software License (the "License"). You may not use this file except in compliance with the License. A copy of
 * the License is located at
 *     http://aws.amazon.com/asl/
 * or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
import { Cache } from 'apollo-cache';
import { InMemoryCache, ApolloReducerConfig, NormalizedCache } from 'apollo-cache-inmemory';
import { Store, Action } from 'redux';

export const NORMALIZED_CACHE_KEY = 'appsync';
export const WRITE_ACTION = 'AAS_WRITE';

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

    /**
     *
     * @param {Cache.WriteOptions} write
     */
    write(write) {
        super.write(write);
        if (this.data && typeof this.data.record === 'undefined') {
            // do not persist contents of a RecordingCache
            const data = super.extract(true);
            this.store.dispatch(writeThunk(data));
        } else {
          // console.log('NO DISPATCH FOR RECORDINGCACHE')
        }
    }

    reset() {
        this.store.dispatch(writeThunk({}));

        return super.reset();
    }
}

const writeThunk = (payload) => (dispatch) => {
    dispatch({
        type: WRITE_ACTION,
        payload,
    });
};

export const reducer = () => ({
    [NORMALIZED_CACHE_KEY]: (state = {}, action) => {
        const { type, payload: normCache } = action;
        switch (type) {
            case WRITE_ACTION:
                return {
                    ...normCache
                };
            default:
                return state;
        }
    }
});
