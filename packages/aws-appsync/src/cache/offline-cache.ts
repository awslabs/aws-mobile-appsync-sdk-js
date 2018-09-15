/*!
 * Copyright 2017-2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * Licensed under the Amazon Software License (the "License"). You may not use this file except in compliance with the License. A copy of
 * the License is located at
 *     http://aws.amazon.com/asl/
 * or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
import { Cache } from 'apollo-cache';
import { InMemoryCache, ApolloReducerConfig, defaultDataIdFromObject, NormalizedCacheObject } from 'apollo-cache-inmemory';
import { Store } from 'redux';
import { AppState } from '@redux-offline/redux-offline/lib/types';

export const NORMALIZED_CACHE_KEY = 'appsync';
export const METADATA_KEY = 'appsync-metadata';
export { defaultDataIdFromObject };

const WRITE_CACHE_ACTION = 'AAS_WRITE_CACHE';

export interface OfflineCache extends AppState {
    rehydrated: boolean,
    [NORMALIZED_CACHE_KEY]: NormalizedCacheObject,
    [METADATA_KEY]: {
        idsMap: {
            [key: string]: string
        },
        snapshot: {
            cache: NormalizedCacheObject,
            enqueuedMutations: number,
        }
    },
}

export default class MyCache extends InMemoryCache {

    private store: Store<OfflineCache>;

    constructor(store: Store<OfflineCache>, config: ApolloReducerConfig = {}) {
        super(config);

        this.store = store;

        const cancelSubscription = store.subscribe(() => {
            const { [NORMALIZED_CACHE_KEY]: normCache = {}, rehydrated = false } = this.store.getState();
            super.restore({ ...normCache });
            if (rehydrated) {
                // console.log('Rehydrated! Cancelling subscription.');
                cancelSubscription();
            }
        });
    }

    restore(data: NormalizedCacheObject) {
        this.store.dispatch(writeThunk(WRITE_CACHE_ACTION, data));

        super.restore(data);
        super.broadcastWatches();

        return this;
    }

    write(write: Cache.WriteOptions) {
        super.write(write);
        if (this.data && typeof (this.data as any).record === 'undefined') {
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

    getIdsMap() {
        const { [METADATA_KEY]: { idsMap } } = this.store.getState();

        return { ...idsMap };
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
