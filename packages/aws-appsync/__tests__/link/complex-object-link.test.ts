import { ApolloLink, execute, Observable } from "apollo-link";
import gql from 'graphql-tag';
import { complexObjectLink, ComplexObjectLink } from "../../src/link/complex-object-link";

const { S3 } = require("@aws-sdk/client-s3");
jest.mock("@aws-sdk/client-s3");
S3.mockResolvedValue(jest.fn());

const { Upload } = require("@aws-sdk/lib-storage");
jest.mock("@aws-sdk/lib-storage")
const returnPromise = Promise.resolve({});
Upload.done = () => returnPromise;

const inspectionLink = jest.fn((operation, forward) => forward(operation));

const prepareLinkForTest = link => ApolloLink.from([
    link,
    new ApolloLink(inspectionLink),
    new ApolloLink(() => Observable.of({ data: { x: 'fakeResult' } }))
]);

const oldObjectKeys = Object.keys;

afterEach(() => {
    jest.clearAllMocks();

    Object.keys = oldObjectKeys;
});

test('Can instantiate link', () => {
    const link = new ComplexObjectLink(null);

    expect(link).toBeInstanceOf(ComplexObjectLink);
});

test('Can instantiate link using function', () => {
    const link = complexObjectLink(null);

    expect(link).toBeInstanceOf(ApolloLink);
});

test('Is ignored for queries', done => {
    const link = complexObjectLink(fail);

    const query = gql`query { someQuery { aField } }`;

    execute(prepareLinkForTest(link), { query }).subscribe({
        next: () => {
            expect(Upload).toHaveBeenCalledTimes(0);
            done();
        },
        error: fail
    });
});

test('Is ignored for subscriptions', done => {
    const link = complexObjectLink(fail);

    const query = gql`subscription { someSubscription { aField } }`;

    execute(prepareLinkForTest(link), { query }).subscribe({
        next: () => {
            expect(Upload).toHaveBeenCalledTimes(0);
            done();
        },
        error: fail
    });
});

test('Is ignored for mutations with no S3Object', done => {
    const link = complexObjectLink(fail);

    const operation = {
        query: gql`mutation { someMutation { aField } }`,
        variables: {
            varA: 'somevalue'
        },
    };

    execute(prepareLinkForTest(link), operation).subscribe({
        next: () => {
            expect(Upload).toHaveBeenCalledTimes(0);
            done();
        },
        error: fail
    });
});

test('Is run for mutations with a S3Object', done => {
    const link = complexObjectLink(null);

    const operation = {
        query: gql`mutation { someMutation { aField } }`,
        variables: {
            aFile: {
                bucket: 'bucket',
                key: 'key',
                region: 'region',
                mimeType: 'mimeType',
                localUri: {},
            }
        },
    };

    execute(prepareLinkForTest(link), operation).subscribe({
        next: () => {
            expect(Upload).toHaveBeenCalled();
            done();
        },
        error: fail
    });
});

test('Is run for mutations with multiple S3Objects', done => {
    const link = complexObjectLink(null);

    const operation = {
        query: gql`mutation { someMutation { aField } }`,
        variables: {
            aFile: {
                bucket: 'bucket1',
                key: 'key1',
                region: 'region1',
                mimeType: 'mimeType1',
                localUri: {},
            },
            anotherFile: {
                bucket: 'bucket2',
                key: 'key2',
                region: 'region2',
                mimeType: 'mimeType2',
                localUri: {},
            }
        },
    };

    execute(prepareLinkForTest(link), operation).subscribe({
        next: () => {
            expect(Upload).toHaveBeenCalledTimes(2);
            done();
        },
        error: fail
    });
});

test('Is run for mutations with multiple S3Objects (array)', done => {
    const link = complexObjectLink(null);

    const operation = {
        query: gql`mutation { someMutation { aField } }`,
        variables: {
            anArray: [
                {
                    bucket: 'bucket1',
                    key: 'key1',
                    region: 'region1',
                    mimeType: 'mimeType1',
                    localUri: {},
                },
                {
                    bucket: 'bucket2',
                    key: 'key2',
                    region: 'region2',
                    mimeType: 'mimeType2',
                    localUri: {},
                },
                {
                    bucket: 'bucket3',
                    key: 'key3',
                    region: 'region3',
                    mimeType: 'mimeType3',
                    localUri: {},
                }
            ]
        },
    };

    execute(prepareLinkForTest(link), operation).subscribe({
        next: () => {
            expect(Upload).toHaveBeenCalledTimes(3);
            done();
        },
        error: fail
    });
});

test('https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/237', done => {
    Object.keys = (obj) => { 
        if (typeof obj !== 'object') {
            fail("Object.keys was called with a non-object");
        }

        return oldObjectKeys(obj);
    };

    const link = complexObjectLink(null);

    const operation = {
        query: gql`mutation { someMutation { aField } }`,
        variables: {
            media: [
                "media1",
                "media2",
            ],
            name: "Something",
        },
    };

    execute(prepareLinkForTest(link), operation).subscribe({
        next: () => {
            expect(Upload).not.toHaveBeenCalled();
            done();
        },
        error: fail
    });
});

test('Calls observable.error on error', done => {
    const link = complexObjectLink(null);

    const operation = {
        query: gql`mutation { someMutation { aField } }`,
        variables: {
            aFile: {
                bucket: 'bucket',
                key: 'key',
                region: 'region',
                mimeType: 'mimeType',
                localUri: {},
            }
        },
    };

    (Upload as jest.Mocked<any>).mockImplementationOnce(() => ({
        done: () => { throw new Error('Some S3 error') }
    }));

    execute(prepareLinkForTest(link), operation).subscribe({
        next: done,
        error: (err) => {
            expect(err.message).toBe('GraphQL error: Some S3 error')
            expect(err.graphQLErrors.length).toBe(1);
            expect(err.graphQLErrors[0].errorType).toBe('AWSAppSyncClient:S3UploadException');
            expect(err).toBeInstanceOf(Error);
            done();
        }
    });
});

test('Is run for mutations with a nested S3Object', done => {
    const link = complexObjectLink(null);

    const operation = {
        query: gql`mutation { someMutation { aField } }`,
        variables: {
            levelOne: {
                levelTwo: {
                    levelThree: {
                        aFile: {
                            bucket: 'bucket',
                            key: 'key',
                            region: 'region',
                            mimeType: 'mimeType',
                            localUri: {},
                        }
                    }
                }
            }
        },
    };

    execute(prepareLinkForTest(link), operation).subscribe({
        next: () => {
            expect(Upload).toHaveBeenCalledWith({
              client: returnPromise,
              leavePartsOnError: false,
              params:{
                Bucket: 'bucket',
                Key: 'key',
                Body: {},
                ContentType: 'mimeType',
              }
            });

            const [vars] = [...inspectionLink.mock.calls].pop();
            expect(vars).toMatchObject({
                variables: {
                    levelOne: {
                        levelTwo: {
                            levelThree: {
                                aFile: {
                                    bucket: 'bucket',
                                    key: 'key',
                                    region: 'region',
                                }
                            }
                        }
                    }
                }
            });

            done();
        },
        error: fail
    });
});

test('Removes localUri and mimeType from variables sent to api and keeps everything else', done => {
    const link = complexObjectLink(null);

    const input = {
        levelOne: {
            levelTwo: {
                levelThree: {
                    aFile: {
                        bucket: 'bucket',
                        key: 'key',
                        region: 'region',
                        mimeType: 'mimeType',
                        localUri: {},
                        aField: 'a value'
                    }
                }
            }
        }
    };

    const operation = {
        query: gql`mutation { someMutation { aField } }`,
        variables: input,
    };

    execute(prepareLinkForTest(link), operation).subscribe({
        next: () => {
            expect(Upload).toHaveBeenCalledWith({
              client: returnPromise,
              leavePartsOnError: false,
              params:{
                Bucket: 'bucket',
                Key: 'key',
                Body: {},
                ContentType: 'mimeType',
              }
            });

            const [{ variables: vars }] = [...inspectionLink.mock.calls].pop();
            expect(vars.levelOne.levelTwo.levelThree.aFile.aField).toBe('a value');
            expect(vars.levelOne.levelTwo.levelThree.aFile.localUri).toBeUndefined();
            expect(vars.levelOne.levelTwo.levelThree.aFile.mimeType).toBeUndefined();

            done();
        },
        error: fail
    });
})
