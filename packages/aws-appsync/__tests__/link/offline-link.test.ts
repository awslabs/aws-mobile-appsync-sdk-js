import { replaceUsingMap, getIds } from "../../src/link/offline-link";
import { defaultDataIdFromObject } from "../../src/cache";

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
                id: '123'
            }
        };

        const expected = {
            "anOperation": '123'
        };

        expect(getIds(defaultDataIdFromObject, source)).toEqual(expected);
    });

    test("it returns empty when no ids are present", function () {
        const source = {
            anOperation: {
                __typename: 'aType',
                aField: '123'
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
                    id: '456'
                }
            }
        };

        const expected = {
            "anOperation.aField": '456'
        };

        expect(getIds(defaultDataIdFromObject, source)).toEqual(expected);
    });

    test("it returns nested ids from an object", function () {
        const source = {
            anOperation: {
                __typename: 'aType',
                id: '123',
                aField: {
                    __typename: 'anotherType',
                    id: '456'
                }
            }
        };

        const expected = {
            "anOperation": '123',
            "anOperation.aField": '456'
        };

        expect(getIds(defaultDataIdFromObject, source)).toEqual(expected);
    });

    test("it returns ids from arrays", function () {
        const source = {
            anOperation: {
                __typename: 'aType',
                id: '123',
                aField: {
                    __typename: 'anotherType',
                    id: '456',
                    anArray: [
                        '789',
                        '012',
                    ]
                }
            }
        };

        const expected = {
            "anOperation": '123',
            "anOperation.aField": '456',
            "anOperation.aField.anArray[0]": '789',
            "anOperation.aField.anArray[1]": '012'
        };

        expect(getIds(defaultDataIdFromObject, source)).toEqual(expected);
    });

    test("it returns ids using a custom dataIdFromObject", function () {
        const source = {
            anOperation: {
                __typename: 'aType',
                idField: '123',
                aField: {
                    __typename: 'anotherType',
                    idField: '456'
                }
            }
        };

        const expected = {
            "anOperation": '123',
            "anOperation.aField": '456',
        };

        // only use "idField" instead of "__typename" and "id"
        const dataIdFromObject = ({ idField }) => `${idField}`;

        expect(getIds(dataIdFromObject, source)).toEqual(expected);
    });

});

