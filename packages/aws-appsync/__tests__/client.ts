import gql from "graphql-tag";
import { v4 as uuid } from "uuid";
import { Observable } from "apollo-link";
import { AWSAppSyncClientOptions, AWSAppSyncClient, AUTH_TYPE, ConflictResolutionInfo, ConflictResolver } from "../src/client";
import { Store } from "redux";
import { OfflineCache } from "../src/cache/offline-cache";
import { NormalizedCacheObject } from "apollo-cache-inmemory";
import type { GraphQLError } from "graphql";
import { ApolloError } from "apollo-client";
import { AWSAppsyncGraphQLError } from "../src/types";
import { DEFAULT_KEY_PREFIX } from "../src/store";
(global as any).fetch = jest.fn()

let setNetworkOnlineStatus: (online: boolean) => void;
jest.mock("@redux-offline/redux-offline/lib/defaults/detectNetwork", () => (callback) => {
    setNetworkOnlineStatus = online => {
        setTimeout(() => callback({ online }), 0);
    };

    // Setting initial network online status
    callback({ online: true });
});
jest.mock('apollo-link-http', () => ({
    createHttpLink: jest.fn(),
}));
let mockHttpResponse: (responses: any[] | any, delay?: number) => void;
let factory: (opts: AWSAppSyncClientOptions) => AWSAppSyncClient<any>;
let isOptimistic;
let Signer;
beforeEach(() => {
    let createHttpLink;
    jest.resetModules();
    jest.isolateModules(() => {
        const { AWSAppSyncClient } = require('../src/client');
        ({ isOptimistic } = require("../src/link/offline-link"));
        ({ createHttpLink } = require("apollo-link-http"));
        ({ Signer } = require("aws-appsync-auth-link"));

        factory = (opts) => {
            return new AWSAppSyncClient(opts);
        };
    });

    mockHttpResponse = (responses: any[] | any, delay:number = 0) => {
        const mock = (createHttpLink as jest.Mock);

        const requestMock = jest.fn();

        [].concat(responses).forEach((resp) => {
            requestMock.mockImplementationOnce(() => new Observable(observer => {
                const timer = setTimeout(() => {
                    observer.next({ ...resp });
                    observer.complete();
                }, delay);

                // On unsubscription, cancel the timer
                return () => clearTimeout(timer);
            }));
        });

        mock.mockImplementation(() => ({
            request: requestMock
        }));
    };
});

const getStoreState = <T extends NormalizedCacheObject>(client: AWSAppSyncClient<T>) => ((client as any)._store as Store<OfflineCache>).getState();

const getOutbox = <T extends NormalizedCacheObject>(client: AWSAppSyncClient<T>) => getStoreState(client).offline.outbox;

class MemoryStorage {
    private storage;
    private logger;
    constructor({ logger = null, initialState = {} } = {}) {
        this.storage = Object.assign({}, initialState)
        this.logger = logger
    }

    log(...args) {
        if (this.logger && typeof this.logger === 'function') {
            this.logger(...args)
        }
    }
    setItem(key, value, callback?) {
        return new Promise((resolve, reject) => {
            this.storage[key] = value
            this.log('setItem called with', key, value)
            if (callback) callback(null, value)
            resolve(value)
        })
    }

    getItem(key, callback?) {
        return new Promise((resolve, reject) => {
            this.log('getItem called with', key)
            const value = this.storage[key]
            if (callback) callback(null, value)
            resolve(value)
        })
    }

    removeItem(key, callback?) {
        return new Promise((resolve, reject) => {
            this.log('removeItem called with', key)
            const value = this.storage[key]
            delete this.storage[key]
            if (callback) callback(null, value)
            resolve(value)
        })
    }

    getAllKeys(callback?) {
        return new Promise((resolve, reject) => {
            this.log('getAllKeys called')
            const keys = Object.keys(this.storage)
            if (callback) callback(null, keys)
            resolve(keys)
        })
    }
}

const getClient = (options?: Partial<AWSAppSyncClientOptions>) => {
    const defaultOptions: AWSAppSyncClientOptions = {
        url: 'some url',
        region: 'some region',
        auth: {
            type: AUTH_TYPE.API_KEY,
            apiKey: 'some key'
        },
        disableOffline: false,
        offlineConfig: {
            storage: new MemoryStorage(),
            callback: null,
        },
    };

    const client: AWSAppSyncClient<any> = factory({
        ...defaultOptions,
        ...options,
        offlineConfig: {
            ...defaultOptions.offlineConfig,
            ...options.offlineConfig,
        }
    });

    return client;
};

const WAIT = 200;

const createBackendError: (path: string[], errorType: string, rest?: any) => AWSAppsyncGraphQLError = (path = [], errorType, rest = {}) => {
    const error = {
        path,
        data: null,
        errorType,
        errorInfo: null,
        locations: [{ line: 2, column: 3 }],
        message: "Some error message",
        ...rest,
    } as AWSAppsyncGraphQLError;

    return error;
};

const createGraphQLError: (error: GraphQLError) => ApolloError = backendError => new ApolloError({
    graphQLErrors: [{ ...backendError }],
    networkError: null,
    errorMessage: `GraphQL error: ${backendError.message}`
});

describe("Offline disabled", () => {

    test("it updates the cache with server response", async () => {
        const localId = uuid();
        const serverId = uuid();

        const optimisticResponse = {
            addTodo: {
                __typename: 'Todo',
                id: localId,
                name: 'MyTodo1'
            }
        };
        const serverResponse = {
            addTodo: {
                __typename: 'Todo',
                id: serverId,
                name: 'MyTodo1'
            }
        };

        mockHttpResponse({ data: serverResponse });

        const client = getClient({ disableOffline: true });

        const resultPromise = client.mutate({
            mutation: gql`mutation($name: String!) {
                addTodo(
                    name: $name
                ) {
                    id,
                    name
                }
            }`,
            variables: {
                name: 'MyTodo1'
            },
            optimisticResponse
        });

        // The optimistic response is present in the cache
        expect(client.cache.extract(true)).toMatchObject({
            [`Todo:${localId}`]: optimisticResponse.addTodo
        });

        const result = await resultPromise;

        expect(result).toMatchObject({ data: { ...serverResponse } });

        // The server response is present in the cache
        expect(client.cache.extract(false)).toMatchObject({
            [`Todo:${serverId}`]: serverResponse.addTodo
        });
    });

    test("Conflict resolution (offline disabled)", async () => {
        const localId = uuid();
        const serverId = uuid();

        const optimisticResponse = {
            addTodo: {
                __typename: 'Todo',
                id: localId,
                name: 'MyTodo1',
                version: 1
            }
        };
        const serverResponse = {
            addTodo: {
                __typename: 'Todo',
                id: serverId,
                name: 'MyTodo1',
                version: 2
            }
        };

        const backendError = createBackendError(['addTodo'], 'DynamoDB:ConditionalCheckFailedException', { data: serverResponse.addTodo });

        mockHttpResponse([
            {
                data: { addTodo: null },
                errors: [backendError]
            },
            {
                data: { addTodo: null },
                errors: [{ ...backendError, data: { ...serverResponse.addTodo, version: serverResponse.addTodo.version + 1 } }]
            },
            {
                data: { addTodo: null },
                errors: [{ ...backendError, data: { ...serverResponse.addTodo, version: serverResponse.addTodo.version + 2 } }]
            },
            { data: serverResponse }
        ]);

        const conflictResolver = jest.fn((obj: ConflictResolutionInfo) => {
            if (obj.mutationName === 'addTodo') {
                return {
                    ...obj.variables,
                    expectedVersion: obj.data.version,
                };
            }
        });

        const client = getClient({ disableOffline: true, conflictResolver });

        const resultPromise = client.mutate({
            mutation: gql`mutation($name: String! $expectedVersion: Integer) {
                addTodo(
                    name: $name
                    expectedVersion: $expectedVersion
                ) {
                    id,
                    name
                    version
                }
            }`,
            variables: {
                name: 'MyTodo1',
                expectedVersion: optimisticResponse.addTodo.version,
            },
            optimisticResponse
        });

        // The optimistic response is present in the cache
        expect(client.cache.extract(true)).toMatchObject({
            [`Todo:${localId}`]: optimisticResponse.addTodo
        });

        const result = await resultPromise;

        expect(conflictResolver).toHaveBeenCalledTimes(3);
        expect(result).toMatchObject({ data: { ...serverResponse } });

        // The server response is present in the cache
        expect(client.cache.extract(false)).toMatchObject({
            [`Todo:${serverId}`]: serverResponse.addTodo
        });
    });

    test("error handling", async () => {
        const localId = uuid();

        const optimisticResponse = {
            addTodo: {
                __typename: 'Todo',
                id: localId,
                name: 'MyTodo1'
            }
        };

        const backendError = createBackendError(['addTodo'], 'DynamoDB:AmazonDynamoDBException');
        const graphqlError = createGraphQLError(backendError);

        mockHttpResponse({
            data: { addTodo: null },
            errors: [backendError]
        });

        const client = getClient({ disableOffline: true });

        const resultPromise = client.mutate({
            mutation: gql`mutation($name: String!) {
                addTodo(
                    name: $name
                ) {
                    id,
                    name
                }
            }`,
            variables: {
                name: 'MyTodo1'
            },
            optimisticResponse
        });

        // The optimistic response is present in the cache
        expect(client.cache.extract(true)).toMatchObject({
            [`Todo:${localId}`]: optimisticResponse.addTodo
        });

        try {
            await resultPromise;

            fail("Error wasn't thrown");
        } catch (error) {
            expect(error).toMatchObject(graphqlError);
        }

        // The optimistic response is no longer present in the cache
        expect(client.cache.extract(true)).toEqual({});
        expect(client.cache.extract(false)).toEqual({});
    });
});

describe("Offline enabled", () => {

    test("it updates the cache with server response", async () => {
        const localId = uuid();
        const serverId = uuid();

        const optimisticResponse = {
            addTodo: {
                __typename: 'Todo',
                id: localId,
                name: 'MyTodo1'
            }
        };
        const serverResponse = {
            addTodo: {
                __typename: 'Todo',
                id: serverId,
                name: 'MyTodo1'
            }
        };

        mockHttpResponse({ data: serverResponse });

        const client = getClient({ disableOffline: false });

        const resultPromise = client.mutate({
            mutation: gql`mutation($name: String!) {
                addTodo(
                    name: $name
                ) {
                    id,
                    name
                }
            }`,
            variables: {
                name: 'MyTodo1'
            },
            optimisticResponse
        });

        // The optimistic response is present in the cache
        expect(client.cache.extract(true)).toMatchObject({
            [`Todo:${localId}`]: optimisticResponse.addTodo
        });

        const result = await resultPromise;

        // Give it some time
        await new Promise(r => setTimeout(r, WAIT));

        expect(result).toMatchObject({ data: { ...serverResponse } });

        // The server response is present in the cache
        expect(client.cache.extract(false)).toMatchObject({
            [`Todo:${serverId}`]: serverResponse.addTodo
        });

        expect(isOptimistic(result)).toBe(false);
    });

    test("it updates the cache with optimistic response (offline)", async () => {
        const localId = uuid();
        const serverId = uuid();

        const optimisticResponse = {
            addTodo: {
                __typename: 'Todo',
                id: localId,
                name: 'MyTodo1'
            }
        };
        const serverResponse = {
            addTodo: {
                __typename: 'Todo',
                id: serverId,
                name: 'MyTodo1'
            }
        };

        mockHttpResponse({ data: serverResponse });

        const client = getClient({ disableOffline: false });

        setNetworkOnlineStatus(false);

        const resultPromise = client.mutate({
            mutation: gql`mutation($name: String!) {
                addTodo(
                    name: $name
                ) {
                    id,
                    name
                }
            }`,
            variables: {
                name: 'MyTodo1'
            },
            optimisticResponse
        });

        // The optimistic response is present in the cache
        expect(client.cache.extract(true)).toMatchObject({
            [`Todo:${localId}`]: optimisticResponse.addTodo
        });

        const result = await resultPromise;

        expect(isOptimistic(result)).toBe(true);

        // Give it some time
        await new Promise(r => setTimeout(r, WAIT));

        expect(result).toMatchObject({ data: { ...optimisticResponse } });

        // The optimistic response is present in the cache
        expect(client.cache.extract(false)).toMatchObject({
            [`Todo:${localId}`]: optimisticResponse.addTodo
        });
    });

    test("error handling (online)", async () => {
        const localId = uuid();

        const optimisticResponse = {
            addTodo: {
                __typename: 'Todo',
                id: localId,
                name: 'MyTodo1'
            }
        };

        const backendError = createBackendError(['addTodo'], 'DynamoDB:AmazonDynamoDBException');
        const graphqlError = createGraphQLError(backendError);

        mockHttpResponse({
            data: { addTodo: null },
            errors: [backendError]
        });

        const conflictResolver = jest.fn();
        const callback = jest.fn();
        const client = getClient({ disableOffline: false, conflictResolver, offlineConfig: { callback } });

        const resultPromise = client.mutate({
            mutation: gql`mutation($name: String!) {
                addTodo(
                    name: $name
                ) {
                    id,
                    name
                }
            }`,
            variables: {
                name: 'MyTodo1'
            },
            optimisticResponse
        });

        // The optimistic response is present in the cache
        expect(client.cache.extract(true)).toMatchObject({
            [`Todo:${localId}`]: optimisticResponse.addTodo
        });

        try {
            await resultPromise;

            fail("Error wasn't thrown");
        } catch (error) {
            expect(error).toMatchObject(graphqlError);
        }

        expect(conflictResolver).not.toBeCalled();
        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith({
            mutation: "addTodo",
            variables: {
                name: 'MyTodo1'
            },
            error: new ApolloError({ graphQLErrors: [backendError] }),
            notified: true,
        }, null);

        // The optimistic response is no longer present in the cache
        expect(client.cache.extract(true)).not.toMatchObject({
            [`Todo:${localId}`]: optimisticResponse.addTodo
        });
    });

    test("conflict resolution", async () => {
        const localId = uuid();
        const serverId = uuid();

        const variables = {
            name: 'MyTodo1',
            expectedVersion: 2,
        };

        const optimisticResponse = {
            addTodo: {
                __typename: 'Todo',
                id: localId,
                name: variables.name,
                version: variables.expectedVersion,
            }
        };

        const serverResponse = {
            addTodo: {
                __typename: 'Todo',
                id: serverId,
                name: 'MyTodo1',
                version: optimisticResponse.addTodo.version + 1
            }
        };

        const backendError = createBackendError(['addTodo'], 'DynamoDB:ConditionalCheckFailedException', { data: serverResponse.addTodo });

        mockHttpResponse([
            {
                data: { addTodo: null },
                errors: [backendError]
            },
            { data: { ...serverResponse } }
        ]);

        const conflictResolver: ConflictResolver = jest.fn(({ variables, data, ...rest }) => {
            return {
                ...variables,
                expectedVersion: data.version
            };
        });
        const callback = jest.fn();
        const client = getClient({ disableOffline: false, conflictResolver, offlineConfig: { callback } });

        const resultPromise = client.mutate({
            mutation: gql`mutation($name: String! $version: Integer) {
                addTodo(
                    name: $name
                    expectedVersion: $version
                ) {
                    id,
                    name,
                    version
                }
            }`,
            variables,
            optimisticResponse
        });

        // The optimistic response is present in the cache
        expect(client.cache.extract(true)).toMatchObject({
            [`Todo:${localId}`]: optimisticResponse.addTodo
        });

        try {
            const result = await resultPromise;

            expect(conflictResolver).toHaveBeenCalledTimes(1);
            expect(callback).toHaveBeenCalledTimes(1);
            expect(callback).toHaveBeenCalledWith(null, {
                data: serverResponse,
                variables: { ...variables, expectedVersion: variables.expectedVersion + 1 },
                mutation: 'addTodo',
                notified: true,
            });

            expect(result).toMatchObject({ data: serverResponse });
        } catch (error) {
            fail(error);
        }

        // The optimistic response is no longer present in the cache
        expect(client.cache.extract(true)).not.toMatchObject({
            [`Todo:${localId}`]: optimisticResponse.addTodo
        });

        // The server response is present in the cache
        expect(client.cache.extract(false)).toMatchObject({
            [`Todo:${serverId}`]: serverResponse.addTodo
        });
    });

    test("it updates ids of dependent mutations", async () => {
        const localId = uuid();
        const serverId = uuid();
        const localIdChild = uuid();
        const serverIdChild = uuid();

        const optimisticResponseParent = {
            addParent: {
                __typename: 'Parent',
                id: localId,
                name: 'Parent'
            }
        };
        const serverResponseParent = {
            addParent: {
                __typename: 'Parent',
                id: serverId,
                name: 'Parent'
            }
        };

        const optimisticResponseChild = {
            addChild: {
                __typename: 'Child',
                id: localIdChild,
                parentId: localId,
                name: 'Child'
            }
        };
        const serverResponseChild = {
            addChild: {
                __typename: 'Child',
                id: serverIdChild,
                parentId: serverId,
                name: 'Child'
            }
        };

        mockHttpResponse([
            { data: serverResponseParent },
            { data: serverResponseChild },
        ]);

        const client = getClient({ disableOffline: false });
        await client.hydrated();

        expect(getOutbox(client).length).toBe(0);

        setNetworkOnlineStatus(false);
        await new Promise(r => setTimeout(r, WAIT));

        const parent = await client.mutate({
            mutation: gql`mutation($name: String!) {
                addParent(
                    name: $name
                ) {
                    id,
                    name
                }
            }`,
            variables: {
                name: 'Parent'
            },
            optimisticResponse: optimisticResponseParent,
            update: <T = {
                [key: string]: any;
            }>(proxy, { data }) => {
                proxy.writeQuery({
                    query: gql`query Bla($id: ID) {
                        getParent(id: $id) {
                            id
                            name
                        }
                    }`,
                    variables: {
                        id: data.addParent.id
                    },
                    data: {
                        getParent: { ...data.addParent }
                    }
                })
            }
        });
        expect(parent.data).toMatchObject(optimisticResponseParent);

        const child = await client.mutate({
            mutation: gql`mutation($parentId: ID, $name: String!) {
                addChild(
                    parentId: $parentId
                    name: $name
                ) {
                    id,
                    parentId,
                    name
                }
            }`,
            variables: {
                parentId: localId,
                name: 'Child'
            },
            optimisticResponse: optimisticResponseChild,
            update: <T = {
                [key: string]: any;
            }>(proxy, { data }) => {
                proxy.writeQuery({
                    query: gql`query Ble($id: ID!) {
                        getChild(id: $id) {
                            id
                            parentId
                            name
                        }
                    }`,
                    variables: {
                        id: data.addChild.id
                    },
                    data: {
                        getChild: { ...data.addChild }
                    }
                })
            }
        });
        expect(child.data).toMatchObject(optimisticResponseChild);

        // The optimistic response is present in the cache
        expect(client.cache.extract(false)).toMatchObject({
            [`Parent:${localId}`]: optimisticResponseParent.addParent,
            [`Child:${localIdChild}`]: optimisticResponseChild.addChild
        });

        // wait for them to show in outbox
        await new Promise(r => setTimeout(r, WAIT));

        // asert queue
        expect(getOutbox(client).length).toBe(2);

        setNetworkOnlineStatus(true);
        await new Promise(r => setTimeout(r, WAIT));

        // Wait for queue to drain?
        await new Promise(r => setTimeout(r, WAIT));

        // asert queue
        expect(getOutbox(client).length).toBe(0);

        // Give it some time
        await new Promise(r => setTimeout(r, WAIT));

        // The server response is present in the cache
        expect(client.cache.extract(false)).toMatchObject({
            [`Parent:${serverId}`]: serverResponseParent.addParent,
            [`Child:${serverIdChild}`]: serverResponseChild.addChild,
        });
    });

    test("it updates ids of dependent mutations (no update functions)", async () => {
        const localId = uuid();
        const serverId = uuid();
        const localIdChild = uuid();
        const serverIdChild = uuid();

        const optimisticResponseParent = {
            addParent: {
                __typename: 'Parent',
                id: localId,
                name: 'Parent'
            }
        };
        const serverResponseParent = {
            addParent: {
                __typename: 'Parent',
                id: serverId,
                name: 'Parent'
            }
        };

        const optimisticResponseChild = {
            addChild: {
                __typename: 'Child',
                id: localIdChild,
                parentId: localId,
                name: 'Child'
            }
        };
        const serverResponseChild = {
            addChild: {
                __typename: 'Child',
                id: serverIdChild,
                parentId: serverId,
                name: 'Child'
            }
        };

        mockHttpResponse([
            { data: serverResponseParent },
            { data: serverResponseChild },
        ]);

        const client = getClient({ disableOffline: false });
        await client.hydrated();

        expect(getOutbox(client).length).toBe(0);

        setNetworkOnlineStatus(false);
        await new Promise(r => setTimeout(r, WAIT));

        const parent = await client.mutate({
            mutation: gql`mutation($name: String!) {
                addParent(
                    name: $name
                ) {
                    id,
                    name
                }
            }`,
            variables: {
                name: 'Parent'
            },
            optimisticResponse: optimisticResponseParent,
        });
        expect(parent.data).toMatchObject(optimisticResponseParent);

        const child = await client.mutate({
            mutation: gql`mutation($parentId: ID, $name: String!) {
                addChild(
                    parentId: $parentId
                    name: $name
                ) {
                    id,
                    parentId,
                    name
                }
            }`,
            variables: {
                parentId: localId,
                name: 'Child'
            },
            optimisticResponse: optimisticResponseChild,
        });
        expect(child.data).toMatchObject(optimisticResponseChild);

        // The optimistic response is present in the cache
        expect(client.cache.extract(false)).toMatchObject({
            [`Parent:${localId}`]: optimisticResponseParent.addParent,
            [`Child:${localIdChild}`]: optimisticResponseChild.addChild
        });

        // wait for them to show in outbox
        await new Promise(r => setTimeout(r, WAIT));

        // asert queue
        expect(getOutbox(client).length).toBe(2);

        setNetworkOnlineStatus(true);
        await new Promise(r => setTimeout(r, WAIT));

        // Wait for queue to drain?
        await new Promise(r => setTimeout(r, WAIT));

        // asert queue
        expect(getOutbox(client).length).toBe(0);

        // Give it some time
        await new Promise(r => setTimeout(r, WAIT));

        // The server response is present in the cache
        expect(client.cache.extract(false)).toMatchObject({
            [`Parent:${serverId}`]: serverResponseParent.addParent,
            [`Child:${serverIdChild}`]: serverResponseChild.addChild,
        });
    });

    // missing update function
});

describe("Multi client", () => {
    test("Can pass a prefix and it is used", async () => {
        const storage = new MemoryStorage();

        mockHttpResponse({
            data: {
                someQuery: {
                    __typename: 'someType',
                    someField: 'someValue'
                }
            }
        });

        const client = getClient({
            disableOffline: false,
            offlineConfig: {
                keyPrefix: 'myPrefix',
                storage,
            }
        });

        await client.hydrated();

        await client.query({
            query: gql`query {
                someQuery {
                    someField
                }
            }`
        });

        // Give it some time
        await new Promise(r => setTimeout(r, WAIT));

        const allKeys = await storage.getAllKeys() as string[];

        expect(allKeys.length).toBeGreaterThan(0);
        allKeys.forEach(key => expect(key).toMatch(/^myPrefix:.+/));
    });

    test.each([false, null, ''])("Uses default prefix for falsey (%o) keyPrefix", async (keyPrefix: any) => {
        const storage = new MemoryStorage();
        mockHttpResponse({
            data: {
                someQuery: {
                    __typename: 'someType',
                    someField: 'someValue'
                }
            }
        });

        const client = getClient({
            disableOffline: false,
            offlineConfig: {
                keyPrefix,
                storage,
            }
        });

        await client.hydrated();

        await client.query({
            query: gql`query {
                someQuery {
                    someField
                }
            }`
        });

        // Give it some time
        await new Promise(r => setTimeout(r, WAIT));

        const allKeys = await storage.getAllKeys() as string[];

        expect(allKeys.length).toBeGreaterThan(0);
        allKeys.forEach(key => expect(key).toMatch(new RegExp(`^${DEFAULT_KEY_PREFIX}:.+`)));
    });

    test("Can use different prefixes", async () => {
        const prefixes = ['myPrefix1', 'myPrefix2', 'myPrefix3'];

        const instances = [];

        for (let keyPrefix of prefixes) {
            const storage = new MemoryStorage();
            mockHttpResponse({
                data: {
                    someQuery: {
                        __typename: 'someType',
                        someField: 'someValue'
                    }
                }
            });

            const client = getClient({
                disableOffline: false,
                offlineConfig: {
                    keyPrefix,
                    storage,
                }
            });

            instances.push(client);

            await client.hydrated();

            await client.query({
                query: gql`query {
                    someQuery {
                        someField
                    }
                }`
            });

            // Give it some time
            await new Promise(r => setTimeout(r, WAIT));

            const allKeys = await storage.getAllKeys() as string[];

            expect(allKeys.length).toBeGreaterThan(0);
            allKeys.forEach(key => expect(key).toMatch(new RegExp(`^${keyPrefix}:.+`)));
        };

        expect(instances.length).toEqual(prefixes.length);
    });

    test('Cannot use same keyPrefix more than once', () => {
        getClient({
            disableOffline: false,
            offlineConfig: {
                keyPrefix: 'myPrefix',
            }
        });

        expect(() => {
            getClient({
                disableOffline: false,
                offlineConfig: {
                    keyPrefix: 'myPrefix',
                }
            });
        }).toThrowError('The keyPrefix myPrefix is already in use. Multiple clients cannot share the same keyPrefix.');
    });
});

describe('Auth modes', () => {
    test('AWS_IAM calls signer', async () => {
        const signerSpy = jest.spyOn(Signer, 'sign');

        mockHttpResponse({
            data: {
                someQuery: {
                    __typename: 'someType',
                    someField: 'someValue'
                }
            }
        });

        const credentials = {
            accessKeyId: 'access',
            secretAccessKey: 'secret',
            sessionToken: 'session',
        };

        const client = getClient({
            disableOffline: false,
            url: 'https://somehost/graphql',
            auth: {
                type: AUTH_TYPE.AWS_IAM,
                credentials: () => credentials
            }
        });

        await client.hydrated();

        await client.query({
            query: gql`query {
                someQuery {
                    someField
                }
            }`,
            fetchPolicy: "network-only"
        });

        // Give it some time
        await new Promise(r => setTimeout(r, WAIT));

        expect(signerSpy).toHaveBeenCalledWith(expect.anything(), {
            access_key: credentials.accessKeyId,
            secret_key: credentials.secretAccessKey,
            session_token: credentials.sessionToken,
        });
        expect(signerSpy).toReturnWith(expect.objectContaining({
            headers: expect.objectContaining({
                Authorization: expect.stringMatching(/^AWS4\-HMAC\-SHA256 Credential=/),
                'X-Amz-Security-Token': 'session',
                'x-amz-date': expect.stringMatching(/^\d{8}T\d{6}Z$/),
            })
        }));
    });
});
