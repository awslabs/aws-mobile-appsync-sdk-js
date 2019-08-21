/*!
 * Copyright 2017-2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { v4 as uuid } from 'uuid';
import { cloneDeep } from 'apollo-utilities';
import { ApolloClient, MutationOptions, SubscribeToMoreOptions, OperationVariables } from 'apollo-client';
import { DocumentNode, InputObjectTypeDefinitionNode, NamedTypeNode } from 'graphql';
import AWSAppSyncClient from '../client';
import { replaceUsingMap } from '../link';
import { getOperationFieldName, rootLogger } from '../utils';

const logger = rootLogger.extend('offline-helper');

export enum CacheOperationTypes {
    AUTO = 'auto',
    ADD = 'add',
    REMOVE = 'remove',
    UPDATE = 'update',
};

const prefixesForRemove = [
    'delete',
    'deleted',
    'discard',
    'discarded',
    'erase',
    'erased',
    'remove',
    'removed'
];

const prefixesForUpdate = [
    'update',
    'updated',
    'upsert',
    'upserted',
    'edit',
    'edited',
    'modify',
    'modified',
];

const prefixesForAdd = [
    'create',
    'created',
    'put',
    'set',
    'add',
    'added',
    'new',
    'insert',
    'inserted',
];

export const getOpTypeFromOperationName = (opName = ''): CacheOperationTypes => {
    // Note: we do a toLowerCase() and startsWith() to avoid ambiguity with operations like "RemoveAddendum"
    const comparator = prefix => opName.toLowerCase().startsWith(prefix) || opName.toLowerCase().startsWith(`on${prefix}`);

    let result = CacheOperationTypes.AUTO;

    [
        [prefixesForAdd, CacheOperationTypes.ADD],
        [prefixesForRemove, CacheOperationTypes.REMOVE],
        [prefixesForUpdate, CacheOperationTypes.UPDATE],
    ].forEach(([prefix, type]: [string[], CacheOperationTypes]) => {
        if (prefix.some(comparator)) {
            result = type;

            return;
        }
    });

    return result;
};

export type QueryWithVariables<TVariables = OperationVariables> = {
    query: DocumentNode,
    variables?: TVariables,
};

export type CacheUpdateQuery = QueryWithVariables | DocumentNode;

export type CacheUpdatesDefinitions = {
    [key in CacheOperationTypes]?: CacheUpdateQuery | CacheUpdateQuery[]
} | CacheUpdateQuery | CacheUpdateQuery[];

export type CacheUpdatesOptions = ((variables?: object) => CacheUpdatesDefinitions) | CacheUpdatesDefinitions;

/**
 * Builds a SubscribeToMoreOptions object ready to be used by Apollo's subscribeToMore() to automatically update the query result in the
 * cache according to the cacheUpdateQuery parameter
 * 
 * @param subscriptionQuery The GraphQL subscription DocumentNode or CacheUpdateQuery
 * @param cacheUpdateQuery The query for which the result needs to be updated
 * @param idField 
 * @param operationType 
 */
const buildSubscription = (
    subscriptionQuery: CacheUpdateQuery,
    cacheUpdateQuery: CacheUpdateQuery,
    idField?: string,
    operationType?: CacheOperationTypes
): SubscribeToMoreOptions => {
    const document = (subscriptionQuery && (subscriptionQuery as QueryWithVariables).query) || (subscriptionQuery as DocumentNode);
    const variables = (subscriptionQuery && (subscriptionQuery as QueryWithVariables).variables) || {} as OperationVariables;

    const query = (cacheUpdateQuery && (cacheUpdateQuery as QueryWithVariables).query) || (cacheUpdateQuery as DocumentNode);
    const queryField = getOperationFieldName(query);


    return {
        document,
        variables,
        updateQuery: (prev, { subscriptionData: { data } }) => {
            const [subField] = Object.keys(data);
            const { [subField]: mutadedItem } = data;

            const optype = operationType || getOpTypeFromOperationName(subField);

            const updater = getUpdater(optype, idField);
            let updatedOpResult;
            let result;

            const path = findArrayInObject(prev);
            if(path) {
                const arr = [...getValueByPath(prev, path)];
                updatedOpResult = updater(arr, mutadedItem);
            }
            else {
                updatedOpResult = updater(prev, mutadedItem);
            }            

            if (!path || path.length === 0) {
                result = updatedOpResult;
            } else {
                const cloned = cloneDeep(prev);
                setValueByPath(cloned, path, updatedOpResult);

                result = cloned[queryField];
            }

            return {
                [queryField]: result
            };
        }
    }
}

export const getUpdater = <T>(opType: CacheOperationTypes, idField = 'id'): (arr: T[], newItem?: T) => T[] => {
    let updater;

    switch (opType) {
        case CacheOperationTypes.ADD:
            updater = (currentValue, newItem) => {
                if (Array.isArray(currentValue)) {
                    return !newItem ? [...currentValue] : [...currentValue.filter(item => item[idField] !== newItem[idField]), newItem]
                } else {
                    return newItem;
                }
            };
            break;
        case CacheOperationTypes.UPDATE:
            updater = (currentValue, newItem) => {
                if (Array.isArray(currentValue)) {
                    return !newItem ? [...currentValue] : currentValue.map(item => item[idField] === newItem[idField] ? newItem : item);
                } else {
                    return newItem;
                }
            };
            break;
        case CacheOperationTypes.REMOVE:
            updater = (currentValue, newItem) => {
                if (Array.isArray(currentValue)) {
                    return !newItem ? [...currentValue] : currentValue.filter(item => item[idField] !== newItem[idField]);
                } else {
                    return null;
                }
            }
            break;
        default:
            updater = (currentValue) => currentValue;
    }

    return updater;
}

const getOpTypeQueriesMap = (cacheUpdateQuery: CacheUpdatesOptions, variables): CacheUpdatesDefinitions => {
    const cacheUpdateQueryVal = typeof cacheUpdateQuery === 'function' ?
        cacheUpdateQuery(variables) :
        cacheUpdateQuery || {};

    let opTypeQueriesMap = cacheUpdateQueryVal;

    if (isDocument(cacheUpdateQueryVal) ||
        isDocument((cacheUpdateQueryVal as QueryWithVariables).query) ||
        Array.isArray(cacheUpdateQuery)) {
        opTypeQueriesMap = { [CacheOperationTypes.AUTO]: [].concat(cacheUpdateQueryVal) } as CacheUpdatesDefinitions;
    }

    return opTypeQueriesMap;
};

const getEvaluatedOp = (opType: CacheOperationTypes, mutationField: string, operationType: CacheOperationTypes) => {
    const evaluatedOP = opType === CacheOperationTypes.AUTO ?
        (operationType || getOpTypeFromOperationName(mutationField)) :
        opType;

    return evaluatedOP;
};

const findArrayInObject = (obj, path: string[] = []): string[] => {
    if (Array.isArray(obj)) {
        return path;
    }

    if (!isObject(obj)) {
        return undefined;
    }

    let result: string[];

    Object.keys(obj).some(key => {
        const newPath = findArrayInObject(obj[key], path.concat(key));

        if (newPath) {
            result = newPath;
            return true;
        }

        return false;
    });

    return result;
};

const getValueByPath = (obj, path: string[] = []) => {
    if (!isObject(obj)) {
        return obj;
    }

    return path.reduce((acc, elem) => {
        const val = acc && acc[elem];

        if (val) {
            return val;
        }

        return null;
    }, obj);
};

const setValueByPath = <T>(obj: T, path: string[] = [], value): T => path.reduce((acc, elem, i, arr) => {
    if (arr.length - 1 === i) {
        acc[elem] = value;

        return obj;
    }

    return acc[elem];
}, obj);

const isDocument = (doc) => !!doc && doc.kind === 'Document';

// make sure that the object is of type object and is not null.
const isObject = (object) => object != null && (typeof object === 'object')

export type VariablesInfo<T = OperationVariables> = {
    inputType: DocumentNode,
    variables: T
};

/**
 * Builds a MutationOptions object ready to be used by the ApolloClient to automatically update the cache according to the cacheUpdateQuery 
 * parameter
 * 
 * @param client An ApolloClient instance
 * @param mutation DocumentNode for the muation
 * @param variables An object with the mutation variables
 * @param cacheUpdateQuery The queries to update in the cache
 * @param typename __typename from your schema
 * @param idField The name of the field with the ID
 * @param operationType Override for the operation type
 * 
 * @returns Mutation options to be used by the ApolloClient
 */
const buildMutation = <T = OperationVariables>(
    client: ApolloClient<any>,
    mutation: DocumentNode,
    variablesInfo: VariablesInfo<T> | T,
    cacheUpdateQuery: CacheUpdatesOptions,
    typename: string,
    idField: string = 'id',
    operationType?: CacheOperationTypes
): MutationOptions => {
    const isVariablesInfo = typeof (variablesInfo as VariablesInfo).variables === 'object';
    const variables = isVariablesInfo ? (variablesInfo as VariablesInfo).variables : variablesInfo as T;

    const hasInputType = Object.keys(variables).length === 1 && typeof variables.input === 'object';

    const inputTypeVersionField = isVariablesInfo && ((variablesInfo as VariablesInfo).inputType.definitions[0] as InputObjectTypeDefinitionNode).fields.find(f =>
        ['version', 'expectedVersion'].find(n => n === f.name.value) && (f.type as NamedTypeNode).name.value === 'Int'
    );
    const useVersioning: boolean = hasInputType ? !!inputTypeVersionField : true;

    const opTypeQueriesMap = getOpTypeQueriesMap(cacheUpdateQuery, variables);

    const { [idField || 'id']: idCustomField } = hasInputType ? variables.input : variables;
    
    const comparator = elem => elem[idField] === idCustomField;

    let version = 0;

    for (let opType in opTypeQueriesMap) {
        const queries: CacheUpdateQuery[] = [].concat(opTypeQueriesMap[opType]);

        queries.forEach(queryEntry => {
            const query = (queryEntry && (queryEntry as QueryWithVariables).query) || (queryEntry as DocumentNode);
            const queryVars = (queryEntry && (queryEntry as QueryWithVariables).variables) || {};
            const queryField = getOperationFieldName(query);

            let result;
            let cachedItem;
            try {
                const { [queryField]: queryRead } = client.readQuery<{ [key: string]: any }>({ query, variables: queryVars });
                result = queryRead;
            } catch (err) {
                logger('Skipping query', query, err.message);

                return;
            }

            const path = findArrayInObject(result);
            if(path) {
                const arr = [...getValueByPath(result, path)]
                cachedItem = arr.find(comparator);
            } else {
                cachedItem = result;
            }

            if (cachedItem) {
                version = Math.max(version, cachedItem.version);
            }
        });
    };

    const mutationField = getOperationFieldName(mutation);

    const cache: { getIdsMap: () => object } = client &&
        client instanceof AWSAppSyncClient &&
        (client as AWSAppSyncClient<any>).isOfflineEnabled() &&
        (client.cache as any);

    const versionFieldName: string = inputTypeVersionField ? inputTypeVersionField.name.value : '';

    return {
        mutation,
        variables: hasInputType
            ? { input: { ...(useVersioning && { [versionFieldName]: version }), ...variables.input } }
            : { version, expectedVersion: version, ...variables },
        optimisticResponse: typename ? {
            __typename: "Mutation",
            [mutationField]: {
                __typename: typename,
                [idField]: (hasInputType ? variables.input : variables)[idField] || uuid(),
                ...(hasInputType ? variables.input : variables),
                version: version + 1
            }
        } : null,
        update: (proxy, { data: { [mutationField]: mutatedItem } }) => {
            for (let opType in opTypeQueriesMap) {
                const queries: CacheUpdateQuery[] = [].concat(opTypeQueriesMap[opType]);

                const updaterFn = getUpdater(getEvaluatedOp(opType as CacheOperationTypes, mutationField, operationType), idField);

                queries.forEach(queryEntry => {
                    const query = (queryEntry && (queryEntry as QueryWithVariables).query) || (queryEntry as DocumentNode);
                    const queryField = getOperationFieldName(query);

                    let queryVars = (queryEntry && (queryEntry as QueryWithVariables).variables) || {};

                    if (cache) {
                        queryVars = replaceUsingMap({ ...queryVars }, cache.getIdsMap());
                    }

                    let data;
                    let updatedOpResult;
                    try {
                        data = proxy.readQuery({ query, variables: queryVars });
                    } catch (err) {
                        logger('Skipping query', query, err.message);

                        return;
                    }

                    const opResultCachedValue = data[queryField];

                    const path = findArrayInObject(opResultCachedValue);
                    if (path) {
                        const arr = [...getValueByPath(opResultCachedValue, path)];
                        updatedOpResult = updaterFn(arr, mutatedItem);
                    } else {
                        updatedOpResult = updaterFn(opResultCachedValue, mutatedItem);
                    }
                   

                    if (!path || path.length === 0) {
                        data[queryField] = updatedOpResult;
                    } else {
                        setValueByPath(data[queryField], path, updatedOpResult);
                    }

                    proxy.writeQuery({ query, variables: queryVars, data });
                });
            }
        },
    }
}

export {
    buildSubscription,
    buildMutation
};
