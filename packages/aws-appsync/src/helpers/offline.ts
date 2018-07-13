import {v4 as uuid} from 'uuid';
import { resultKeyNameFromField } from 'apollo-utilities';

const operationTypes = {
    AUTO: 'auto',
    ADD: 'add',
    REMOVE: 'remove',
    UPDATE: 'update',
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
    // const OP_TYPE_REGEX = /^[a-zA-Z][a-z]+/;
    // const comparator = prefix => prefix === (opName.match(OP_TYPE_REGEX) || [])[0];

    // Note: we do a toLowerCase() and startsWith() to avoid ambiguity with operations like "RemoveAddendum"
    const comparator = prefix => opName.toLowerCase().startsWith(prefix);

    let result = operationTypes.AUTO;

    [
        [prefixesForAdd, operationTypes.ADD],
        [prefixesForRemove, operationTypes.REMOVE],
        [prefixesForUpdate, operationTypes.UPDATE],
    ].forEach(([prefix, type]: [string[], string]) => {
        if (prefix.some(comparator)) {
            result = type;

            return;
        }
    });

    return result;
};

const buildSubscription = (subscriptionQuery, cacheUpdateQuery, operationType, idField) => {

    const queryField = resultKeyNameFromField(cacheUpdateQuery.definitions[0].selectionSet.selections[0]);

    return {
        document: subscriptionQuery,
        updateQuery: (prev, { subscriptionData: { data } }) => {
            const [subField] = Object.keys(data);
            const { [subField]: mutadedItem } = data;

            const optype = operationType || getOpTypeFromOperationName(subField);

            const updater = getUpdater(optype, idField);

            const arr = Array.isArray(prev[queryField]) ?
                [...prev[queryField]] :
                (Object.keys(prev).length === 0 ? [] : { ...prev[queryField] });

            const updatedOpResult = updater(arr, mutadedItem);

            return {
                [queryField]: updatedOpResult
            };
        }
    }
}

const getUpdater = (opType, idField = 'id') => {
    let updater = (arr, item) => arr;

    switch (opType) {
        case operationTypes.ADD:
        case operationTypes.UPDATE:
            updater = (arr, newItem) => [...arr.filter(item => item[idField] !== newItem[idField]), newItem];
            break;
        case operationTypes.REMOVE:
            updater = (arr, newItem) => arr.filter(item => item[idField] !== newItem[idField]);
            break;
        default:
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

const buildMutation = (client, mutation, variables, cacheUpdateQuery, typename, idField = 'id', operationType?) => {
    const opTypeQueriesMap = getOpTypeQueriesMap(cacheUpdateQuery, variables);

    const { id, _id } = variables;

    Object.keys(opTypeQueriesMap).forEach(opType => {
        const queries = opTypeQueriesMap[opType];

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

            const comparator = idField ?
                elem => elem[idField] === variables[idField] :
                elem => elem.id === id || elem._id === _id;

            const path = findArrayInObject(result);
            const arr = [...getValueByPath(result, path)];

            const cachedItem = arr.find(comparator);

            variables.version = cachedItem ? Math.max(cachedItem.version || 1, variables.version || 1) : variables.version || 1;
        });
    });

    const mutationField = resultKeyNameFromField(mutation.definitions[0].selectionSet.selections[0]);

    return {
        variables,
        optimisticResponse: typename ? {
            __typename: "Mutation",
            [mutationField]: {
                __typename: typename, [idField]: uuid(), ...variables
            }
        } : null,
        update: (proxy, { data: { [mutationField]: mutatedItem } }) => {
            Object.keys(opTypeQueriesMap).forEach(opType => {
                const queries = opTypeQueriesMap[opType];

                const updaterFn = getUpdater(getEvaluatedOp(opType, mutationField, operationType), idField);

                queries.forEach(queryEntry => {
                    const query = (queryEntry && queryEntry.query) || queryEntry;
                    const queryVars = (queryEntry && queryEntry.variables) || {};

                    const queryField = resultKeyNameFromField(query.definitions[0].selectionSet.selections[0]);

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
        props: ({ mutate, ...props }) => {
            return {
                ...props,
                [mutationField]: mutate,
            }
        }
    }
}

export { 
    buildSubscription,
    buildMutation
};
