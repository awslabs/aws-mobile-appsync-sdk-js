import { v4 as uuid } from 'uuid';
import { resultKeyNameFromField, cloneDeep } from 'apollo-utilities';
import { ApolloClient, MutationOptions, SubscribeToMoreOptions } from 'apollo-client';
import { DocumentNode } from 'graphql';
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

const buildSubscription = (
    subscriptionQuery: DocumentNode,
    cacheUpdateQuery,
    variables?: any,
    idField?: string,
    operationType?: CacheOperationTypes
): SubscribeToMoreOptions => {

    const queryField = resultKeyNameFromField(cacheUpdateQuery.definitions[0].selectionSet.selections[0]);

    return {
        document: subscriptionQuery,
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

const getUpdater = (opType, idField = 'id'): (arr: object[], newItem?: object) => object[] => {
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

const getOpTypeQueriesMap = (cacheUpdateQuery, variables) => {
    const cacheUpdateQueryVal = typeof cacheUpdateQuery === 'function' ?
        cacheUpdateQuery(variables) :
        cacheUpdateQuery || {};
    const opTypeQueriesMap = isDocument(cacheUpdateQueryVal) ?
        { 'auto': [].concat(cacheUpdateQueryVal) } :
        cacheUpdateQueryVal;

    return opTypeQueriesMap;
};

const getEvaluatedOp = (opType, mutationField, operationType) => {
    const evaluatedOP = opType === 'auto' ?
        (operationType || getOpTypeFromOperationName(mutationField)) :
        opType;

    return evaluatedOP;
};

const findArrayInObject = (obj, path = []) => {
    if (Array.isArray(obj)) {
        return path;
    }

    if (typeof obj !== 'object') {
        return undefined;
    }

    let result;

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

const getValueByPath = (obj, path) => {
    if (typeof obj !== 'object') {
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

const setValueByPath = (obj, path = [], value) => path.reduce((acc, elem, i, arr) => {
    if (arr.length - 1 === i) {
        acc[elem] = value;

        return obj;
    }

    return acc[elem];
}, obj);

const isDocument = (doc) => doc && doc.kind === 'Document';

const buildMutation = (
    client: ApolloClient<any>,
    mutation: DocumentNode,
    variables: any = {},
    cacheUpdateQuery,
    typename: string,
    idField: string = 'id',
    operationType?: CacheOperationTypes
): MutationOptions => {
    const opTypeQueriesMap = getOpTypeQueriesMap(cacheUpdateQuery, variables);

    const { id, _id, [idField]: idCustomField } = variables;

    const comparator = idField ?
        elem => elem[idField] === idCustomField :
        elem => elem.id === id || elem._id === _id;

    let version = 0;

    Object.keys(opTypeQueriesMap).forEach(opType => {
        const queries = [].concat(opTypeQueriesMap[opType]);

        queries.forEach(queryEntry => {
            const query = (queryEntry && queryEntry.query) || queryEntry;
            const queryVars = (queryEntry && queryEntry.variables) || {};
            const queryField = resultKeyNameFromField(query.definitions[0].selectionSet.selections[0]);

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
    });

    const mutationField = resultKeyNameFromField(mutation.definitions[0].selectionSet.selections[0]);

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
                __typename: typename, [idField]: variables[idField] || uuid(), ...variables, version: version + 1
            }
        } : null,
        update: (proxy, { data: { [mutationField]: mutatedItem } }) => {
            Object.keys(opTypeQueriesMap).forEach(opType => {
                const queries = [].concat(opTypeQueriesMap[opType]);

                const updaterFn = getUpdater(getEvaluatedOp(opType, mutationField, operationType), idField);

                queries.forEach(queryEntry => {
                    const query = (queryEntry && queryEntry.query) || queryEntry;
                    const queryField = resultKeyNameFromField(query.definitions[0].selectionSet.selections[0]);

                    let queryVars = (queryEntry && queryEntry.variables) || {};

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
            });
        },
    }
}

export {
    buildSubscription,
    buildMutation
};
