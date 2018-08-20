import { replaceUsingMap, getIds } from "../../src/link/offline-link";
import { defaultDataIdFromObject } from "../../src/cache";
import { v4 as uuid } from "uuid";

describe("replaceUsingMap", function () {
    test("it replaces", function () {
        const map = {
            'aaa': 'bbb'
        };

        const source = {
            myMutation: {
                id: 'aaa'
            }
        };

        const expected = {
            myMutation: {
                id: 'bbb'
            }
        };

        expect(replaceUsingMap(source, map)).toEqual(expected);
    });

    test("it replaces in array values", function () {
        const map = {
            'aaa': 'bbb'
        };

        const source = {
            myMutation: {
                ids: ['aaa']
            }
        };

        const expected = {
            myMutation: {
                ids: ['bbb']
            }
        };

        expect(replaceUsingMap(source, map)).toEqual(expected);
    });

    test("it replaces in array values (awslabs/aws-mobile-appsync-sdk-js#229)", function () {
        const map = {
            'aaa-123': 'bbb-456'
        };

        const source = {
            myMutation: {
                ids: ['aaa-123']
            }
        };

        const expected = {
            myMutation: {
                ids: ['bbb-456']
            }
        };

        expect(replaceUsingMap(source, map)).toEqual(expected);
    });

    test("it replaces deeply nested", function () {
        const map = {
            'aaa': 'bbb'
        };

        const source = {
            myMutation: {
                someField1: {
                    someField2: {
                        id: 'aaa'
                    }
                }
            }
        };

        const expected = {
            myMutation: {
                someField1: {
                    someField2: {
                        id: 'bbb'
                    }
                }
            }
        };

        expect(replaceUsingMap(source, map)).toEqual(expected);
    });

    test("it replaces multiple occurences", function () {
        const map = {
            'aaa': 'bbb'
        };

        const source = {
            myMutation: {
                id: 'aaa',
                someOtherField: 'aaa'
            }
        };

        const expected = {
            myMutation: {
                id: 'bbb',
                someOtherField: 'bbb'
            }
        };

        expect(replaceUsingMap(source, map)).toEqual(expected);
    });

    ['', null, undefined, false].forEach(function (testCase) {
        test("it doesn't replace on falsy values (" + testCase + ")", function () {
            const map = {};

            const source = testCase;
            const expected = source;

            expect(replaceUsingMap(source, map)).toEqual(expected);
        });

    });

});

describe("getIds", function () {
    test("it returns an id from a simple object", function () {
        const source = {
            anOperation: {
                __typename: 'aType',
                id: uuid()
            }
        };

        const expected = {
            anOperation: source.anOperation.id
        };

        expect(getIds(defaultDataIdFromObject, source)).toEqual(expected);
    });

    test("it doesn't return ids that are not uuids", function () {
        const source = {
            anOperation: {
                __typename: 'aType',
                id: 'not-a-uuid'
            }
        };

        const expected = {};

        expect(getIds(defaultDataIdFromObject, source)).toEqual(expected);
    });

    test("it returns empty when no ids are present", function () {
        const source = {
            anOperation: {
                __typename: 'aType',
                aField: uuid()
            }
        };

        const expected = {};

        expect(getIds(defaultDataIdFromObject, source)).toEqual(expected);
    });

    test("it returns a nested id from an object", function () {
        const source = {
            anOperation: {
                __typename: 'aType',
                aField: {
                    __typename: 'anotherType',
                    id: uuid()
                }
            }
        };

        const expected = {
            "anOperation.aField": source.anOperation.aField.id
        };

        expect(getIds(defaultDataIdFromObject, source)).toEqual(expected);
    });

    test("it returns nested ids from an object", function () {
        const source = {
            anOperation: {
                __typename: 'aType',
                id: uuid(),
                aField: {
                    __typename: 'anotherType',
                    id: uuid()
                }
            }
        };

        const expected = {
            "anOperation": source.anOperation.id,
            "anOperation.aField": source.anOperation.aField.id
        };

        expect(getIds(defaultDataIdFromObject, source)).toEqual(expected);
    });

    test("it doesn't return ids from arrays", function () {
        const source = {
            anOperation: {
                __typename: 'aType',
                id: uuid(),
                aField: {
                    __typename: 'anotherType',
                    id: uuid(),
                    anArray: [
                        uuid(),
                        uuid(),
                    ]
                }
            }
        };

        const expected = {
            "anOperation": source.anOperation.id,
            "anOperation.aField": source.anOperation.aField.id,
        };

        expect(getIds(defaultDataIdFromObject, source)).toEqual(expected);
    });

    test("it returns ids using a custom dataIdFromObject", function () {
        const source = {
            anOperation: {
                __typename: 'aType',
                idField: uuid(),
                aField: {
                    __typename: 'anotherType',
                    idField: uuid()
                }
            }
        };

        const expected = {
            "anOperation": source.anOperation.idField,
            "anOperation.aField": source.anOperation.aField.idField,
        };

        // only use "idField" instead of "__typename" and "id"
        const dataIdFromObject = ({ idField }) => `${idField}`;

        expect(getIds(dataIdFromObject, source)).toEqual(expected);
    });

});

