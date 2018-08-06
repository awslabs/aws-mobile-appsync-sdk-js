import { v4 as uuid } from 'uuid';
import { resultKeyNameFromField, cloneDeep } from 'apollo-utilities';
import { ApolloClient, MutationOptions, SubscribeToMoreOptions } from 'apollo-client';
import { DocumentNode, OperationDefinitionNode, FieldNode } from 'graphql';
import AWSAppSyncClient from '../client';
import { replaceUsingMap } from '../link';

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

const getOpTypeFromOperationName = (opName = '') => {
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

export type QueryWithVariables = {
    query: DocumentNode,
    variables?: object,
};

export type CacheUpdateQuery = QueryWithVariables | DocumentNode;

export type CacheUpdatesDefinitions = {
    [key in CacheOperationTypes]?: CacheUpdateQuery | CacheUpdateQuery[]
};

export type CacheUpdatesOptions = (variables?: object) => CacheUpdatesDefinitions | CacheUpdatesDefinitions;

const getOperationFieldName = (operation: DocumentNode): string => resultKeyNameFromField(
    (operation.definitions[0] as OperationDefinitionNode).selectionSet.selections[0] as FieldNode
);

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
    const variables = (subscriptionQuery && (subscriptionQuery as QueryWithVariables).variables) || {};

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

            const path = findArrayInObject(prev);
            const arr = [...getValueByPath(prev, path)];

            const updatedOpResult = updater(arr, mutadedItem);

            let result;

            if (path.length === 0) {
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

const getUpdater = <T>(opType: CacheOperationTypes, idField = 'id'): (arr: T[], newItem?: T) => T[] => {
    let updater;

    switch (opType) {
        case CacheOperationTypes.ADD:
        case CacheOperationTypes.UPDATE:
            updater = (arr, newItem) => !newItem ? [...arr] : [...arr.filter(item => item[idField] !== newItem[idField]), newItem];
            break;
        case CacheOperationTypes.REMOVE:
            updater = (arr, newItem) => !newItem ? [] : arr.filter(item => item[idField] !== newItem[idField]);
            break;
        default:
            updater = arr => arr;
    }

    return updater;
}

const getOpTypeQueriesMap = (cacheUpdateQuery: CacheUpdatesOptions, variables): CacheUpdatesDefinitions => {
    const cacheUpdateQueryVal = typeof cacheUpdateQuery === 'function' ?
        cacheUpdateQuery(variables) :
        cacheUpdateQuery || {};
    const opTypeQueriesMap = isDocument(cacheUpdateQueryVal) ?
        { [CacheOperationTypes.AUTO]: [].concat(cacheUpdateQueryVal) } as CacheUpdatesDefinitions :
        cacheUpdateQueryVal;

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

const getValueByPath = (obj, path: string[]) => {
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
const buildMutation = (
    client: ApolloClient<any>,
    mutation: DocumentNode,
    variables: object = {},
    cacheUpdateQuery: CacheUpdatesOptions,
    typename: string,
    idField: string = 'id',
    operationType?: CacheOperationTypes
): MutationOptions => {
    const opTypeQueriesMap = getOpTypeQueriesMap(cacheUpdateQuery, variables);

    const { [idField || 'id']: idCustomField } = variables;

    const comparator = elem => elem[idField] === idCustomField;

    let version = 0;

    for (let opType in opTypeQueriesMap) {
        const queries: CacheUpdateQuery[] = [].concat(opTypeQueriesMap[opType]);

        queries.forEach(queryEntry => {
            const query = (queryEntry && (queryEntry as QueryWithVariables).query) || (queryEntry as DocumentNode);
            const queryVars = (queryEntry && (queryEntry as QueryWithVariables).variables) || {};
            const queryField = getOperationFieldName(query);

            let result;
            try {
                const { [queryField]: queryRead } = client.readQuery({ query, variables: queryVars });

                result = queryRead;
            } catch (err) {
                console.warn('Skipping query', query, err.message);

                return;
            }

            const path = findArrayInObject(result);
            const arr = [...getValueByPath(result, path)];

            const cachedItem = arr.find(comparator);

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

    return {
        mutation,
        variables: { ...variables, version },
        optimisticResponse: typename ? {
            __typename: "Mutation",
            [mutationField]: {
                __typename: typename,
                [idField]: variables[idField] || uuid(),
                ...variables,
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

                    try {
                        data = proxy.readQuery({ query, variables: queryVars });
                    } catch (err) {
                        console.warn('Skipping query', query, err.message);

                        return;
                    }

                    const opResultCachedValue = data[queryField];

                    const path = findArrayInObject(opResultCachedValue);
                    const arr = [...getValueByPath(opResultCachedValue, path)];

                    const updatedOpResult = updaterFn(arr, mutatedItem);

                    if (path.length === 0) {
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
