import { applyMiddleware, createStore, compose, combineReducers, Store } from 'redux';
import { offline } from '@redux-offline/redux-offline';
import offlineConfig from '@redux-offline/redux-offline/lib/defaults';
import { PERSIST_REHYDRATE } from "@redux-offline/redux-offline/lib/constants";
import thunk from 'redux-thunk';

import { AWSAppSyncClient, OfflineCallback } from './client';
import { reducer as cacheReducer, NORMALIZED_CACHE_KEY, METADATA_KEY } from './cache/index';
import { reducer as offlineMetadataReducer, offlineEffect, discard } from './link/offline-link';
import { NormalizedCacheObject } from 'apollo-cache-inmemory';

const newStore = <TCacheShape extends NormalizedCacheObject>(
    clientGetter: () => AWSAppSyncClient<TCacheShape> = () => null,
    persistCallback = () => null,
    dataIdFromObject: (obj) => string | null,
    storage: any,
    callback: OfflineCallback = () => { },
): Store<any> => {

    const store = createStore(
        combineReducers({
            rehydrated: (state = false, action) => {
                switch (action.type) {
                    case PERSIST_REHYDRATE:
                        return true;
                    default:
                        return state;
                }
            },
            ...cacheReducer(),
            ...offlineMetadataReducer(dataIdFromObject),
        }),
        typeof window !== 'undefined' && (window as any).__REDUX_DEVTOOLS_EXTENSION__ && (window as any).__REDUX_DEVTOOLS_EXTENSION__(),
        compose(
            applyMiddleware(thunk),
            offline({
                ...offlineConfig,
                persistCallback,
                persistOptions: {
                    ...(storage && { storage }),
                    whitelist: [
                        NORMALIZED_CACHE_KEY,
                        METADATA_KEY,
                        'offline',
                    ]
                },
                effect: (effect, action) => offlineEffect(store, clientGetter(), effect, action, callback),
                discard: discard(callback),
            })
        )
    );

    return store;
};

export {
    newStore as createStore
}
