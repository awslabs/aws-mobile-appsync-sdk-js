import { Action, applyMiddleware, createStore, compose, combineReducers, Store } from 'redux';
import { offline } from '@redux-offline/redux-offline';
import offlineConfig from '@redux-offline/redux-offline/lib/defaults';
import thunk from 'redux-thunk';

import { AWSAppSyncClient } from './client';
import { reducer as cacheReducer, NORMALIZED_CACHE_KEY } from './cache/index';
import { reducer as commitReducer, offlineEffect, discard } from './link/offline-link';

/**
 * 
 * @param {AWSAppSyncClient} client
 * @param {Function} persistCallback 
 * @param {Function} conflictResolver 
 * @param {Object} customOfflineConfig 
 */
const newStore = (client, persistCallback = () => null, conflictResolver, customOfflineConfig) => {
    const finalOfflineConfig = Object.assign({}, offlineConfig, customOfflineConfig);
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
        typeof window !== 'undefined' && window.__REDUX_DEVTOOLS_EXTENSION__ && window.__REDUX_DEVTOOLS_EXTENSION__(),
        compose(
            applyMiddleware(thunk),
            offline({
                ...finalOfflineConfig,
                persistCallback,
                persistOptions: {
                    whitelist: [NORMALIZED_CACHE_KEY, 'offline']
                },
                effect: (effect, action) => offlineEffect(client, effect, action),
                discard: discard(conflictResolver),
            })
        )
    );
};

export {
    newStore as createStore
}
