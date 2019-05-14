/*!
 * Copyright 2017-2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { rootLogger } from "./utils";
import { applyMiddleware, createStore, compose, combineReducers, Store, Reducer, AnyAction, ReducersMapObject } from 'redux';
import { offline } from '@redux-offline/redux-offline';
import defaultOfflineConfig from '@redux-offline/redux-offline/lib/defaults';
import { PERSIST_REHYDRATE } from "@redux-offline/redux-offline/lib/constants";
import { KEY_PREFIX as REDUX_PERSIST_KEY_PREFIX } from "redux-persist/constants";
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

const logger = rootLogger.extend('store');

export type StoreOptions<TCacheShape extends NormalizedCacheObject> = {
    clientGetter: () => AWSAppSyncClient<TCacheShape>,
    persistCallback: () => void,
    dataIdFromObject: (obj: any) => string | null,
    keyPrefix?: string,
    storage?: any,
    callback: OfflineCallback,
};

export const DEFAULT_KEY_PREFIX = REDUX_PERSIST_KEY_PREFIX;

const newStore = <TCacheShape extends NormalizedCacheObject>({
    clientGetter = () => null,
    persistCallback = () => null,
    dataIdFromObject,
    keyPrefix,
    storage,
    callback = () => { },
}: StoreOptions<TCacheShape>): Store<any> => {
    logger('Creating store');

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
                persistCallback: () => {
                    logger('Storage ready');

                    persistCallback();
                },
                persistOptions: {
                    ...(keyPrefix && { keyPrefix: `${keyPrefix}:` }),
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
].filter(Boolean).reduce((acc, { enqueueAction, ...rest }) => {
    acc[enqueueAction] = { enqueueAction, ...rest };

    return acc;
}, {}) as OfflineEffectConfigMap;

const reducer: (dataIdFromObject: IdGetter) => ReducersMapObject = <S>(dataIdFromObject) => ({
    [METADATA_KEY]: (state: S, action: AnyAction) => Object.entries(offlineEffectsConfigs)
        .reduce((acc, [, { reducer = () => x => x }]) => reducer(dataIdFromObject)(acc, action), state)
});

const effect = async (effect, action: OfflineAction, store, clientGetter, callback, offlineStatusChangeCallbackCreator: OfflineStatusChangeCallbackCreator) => {
    const config = offlineEffectsConfigs[action.type];

    const observable = new Observable(observer => {
        offlineStatusChangeCallbackCreator(onlineStatus => {
            observer.next(onlineStatus);
        });

        return () => { };
    });

    if (config && config.effect) {
        logger(`Executing effect for ${action.type}`);

        return config.effect(store, clientGetter, effect, action, callback, observable);
    }

    logger(`No effect found for ${action.type}`);
};

const discard = (callback, error, action, retries) => {
    const { discard } = offlineEffectsConfigs[action.type];

    if (discard) {
        logger(`Executing discard for ${action.type}`, discard);

        return discard(callback, error, action, retries);
    }

    logger(`No custom discard found for ${action.type}. Discarding effect.`);
    return true;
};

export {
    newStore as createStore
}
