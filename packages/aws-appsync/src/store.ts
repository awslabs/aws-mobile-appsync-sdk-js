/*!
 * Copyright 2017-2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * Licensed under the Amazon Software License (the "License"). You may not use this file except in compliance with the License. A copy of
 * the License is located at
 *     http://aws.amazon.com/asl/
 * or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
import { applyMiddleware, createStore, compose, combineReducers, Store, Reducer, AnyAction, ReducersMapObject } from 'redux';
import { offline } from '@redux-offline/redux-offline';
import defaultOfflineConfig from '@redux-offline/redux-offline/lib/defaults';
import { PERSIST_REHYDRATE } from "@redux-offline/redux-offline/lib/constants";
import thunk from 'redux-thunk';

import { AWSAppSyncClient, OfflineCallback } from './client';
import { reducer as cacheReducer, NORMALIZED_CACHE_KEY, METADATA_KEY } from './cache/index';
import { getEffectDelay } from './link/retry-link';
import { offlineEffectConfig as mutationsConfig } from './link/offline-link';
import { NormalizedCacheObject, IdGetter } from 'apollo-cache-inmemory';
import { OfflineAction, NetInfo, NetworkCallback } from '@redux-offline/redux-offline/lib/types';
import { offlineEffectConfig as deltaSyncConfig } from "./deltaSync";
import { Observable } from 'apollo-link';

const { detectNetwork } = defaultOfflineConfig;

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
            ...reducer(dataIdFromObject),
        }),
        typeof window !== 'undefined' && (window as any).__REDUX_DEVTOOLS_EXTENSION__ && (window as any).__REDUX_DEVTOOLS_EXTENSION__(),
        compose(
            applyMiddleware(thunk),
            offline({
                ...defaultOfflineConfig,
                retry: getEffectDelay,
                persistCallback,
                persistOptions: {
                    ...(storage && { storage }),
                    whitelist: [
                        NORMALIZED_CACHE_KEY,
                        METADATA_KEY,
                        'offline',
                    ]
                },
                effect: (effectPayload, action) => effect(
                    effectPayload,
                    action,
                    store,
                    clientGetter(),
                    callback,
                    detectNetwork as OfflineStatusChangeCallbackCreator
                ),
                discard: (error, action, retries) => discard(callback, error, action, retries),
            })
        )
    );

    return store;
};

// TODO: Use Typescript's Pick to type this with Config from redux-offline
export declare type OfflineEffectConfig = {
    enqueueAction: string,
    effect?: Function,
    discard?: Function,
    retry?: Function,
    reducer?: (dataIdFromObject: IdGetter) => Reducer<any>,
};

export declare type OfflineStatusChangeCallbackCreator = (callback: NetworkCallback) => void;
export declare type OfflineStatusChangeCallback = (result: {
    online: boolean,
    netInfo?: NetInfo
}) => void;

declare type OfflineEffectConfigMap = {
    [key: string]: OfflineEffectConfig
};

const offlineEffectsConfigs = [
    mutationsConfig,
    deltaSyncConfig
].reduce((acc, { enqueueAction, ...rest }) => (acc[enqueueAction] = { enqueueAction, ...rest }, acc), {}) as OfflineEffectConfigMap;

const reducer: (dataIdFromObject: IdGetter) => ReducersMapObject = <S>(dataIdFromObject) => ({
    [METADATA_KEY]: (state: S, action: AnyAction) => Object.entries(offlineEffectsConfigs)
        .reduce((acc, [, { reducer = () => x => x }]) => reducer(dataIdFromObject)(acc, action), state)
});

const effect = async (effect, action: OfflineAction, store, clientGetter, callback, offlineStatusChangeCallbackCreator: OfflineStatusChangeCallbackCreator) => {
    const config = offlineEffectsConfigs[action.type];

    const observable = new Observable(observer => {
        offlineStatusChangeCallbackCreator(x => {
            observer.next(x);
        });

        return () => { };
    });

    if (config) {
        return config.effect(store, clientGetter, effect, action, callback, observable);
    }
};

const discard = (callback, error, action, retries) => {
    const config = offlineEffectsConfigs[action.type];

    if (config) {
        return config.discard(callback, error, action, retries);
    }

    return true;
};

export {
    newStore as createStore
}
