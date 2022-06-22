import { AUTH_TYPE } from "aws-appsync-auth-link";
import { execute } from "apollo-link";
import gql from 'graphql-tag';
import { AppSyncRealTimeSubscriptionHandshakeLink } from '../../src/realtime-subscription-handshake-link';
import { MESSAGE_TYPES } from "../../src/types";
import { v4 as uuid } from "uuid";
jest.mock('uuid', () => ({ v4: jest.fn() }));

const query = gql`subscription { someSubscription { aField } }`

class myWebSocket implements WebSocket {
    binaryType: BinaryType;
    bufferedAmount: number;
    extensions: string;
    onclose: (this: WebSocket, ev: CloseEvent) => any;
    onerror: (this: WebSocket, ev: Event) => any;
    onmessage: (this: WebSocket, ev: MessageEvent) => any;
    onopen: (this: WebSocket, ev: Event) => any;
    protocol: string;
    readyState: number;
    url: string;
    close(code?: number, reason?: string): void {
        throw new Error("Method not implemented.");
    }
    send(data: string | ArrayBuffer | Blob | ArrayBufferView): void {
        throw new Error("Method not implemented.");
    }
    CLOSED: number;
    CLOSING: number;
    CONNECTING: number;
    OPEN: number;
    addEventListener<K extends "close" | "error" | "message" | "open">(type: K, listener: (this: WebSocket, ev: WebSocketEventMap[K]) => void, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: any, listener: any, options?: any) {
        throw new Error("Method not implemented.");
    }
    removeEventListener<K extends "close" | "error" | "message" | "open">(type: K, listener: (this: WebSocket, ev: WebSocketEventMap[K]) => void, options?: boolean | EventListenerOptions): void;
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
    removeEventListener(type: any, listener: any, options?: any) {
        throw new Error("Method not implemented.");
    }
    dispatchEvent(event: Event): boolean {
        throw new Error("Method not implemented.");
    }
}

describe("RealTime subscription link", () => {

    test("Can instantiate link", () => {
        expect.assertions(1);
        const link = new AppSyncRealTimeSubscriptionHandshakeLink({
            auth: {
                type: AUTH_TYPE.API_KEY,
                apiKey: 'xxxxx'
            },
            region: 'us-west-2',
            url: 'https://firsttesturl12345678901234.appsync-api.us-west-2.amazonaws.com/graphql'
        });

        expect(link).toBeInstanceOf(AppSyncRealTimeSubscriptionHandshakeLink);
    });

    test("Can instantiate link with custom domain", () => {
        expect.assertions(1);
        const link = new AppSyncRealTimeSubscriptionHandshakeLink({
            auth: {
                type: AUTH_TYPE.API_KEY,
                apiKey: 'xxxxx'
            },
            region: 'us-west-2',
            url: 'https://test1.testcustomdomain.com/graphql'
        });

        expect(link).toBeInstanceOf(AppSyncRealTimeSubscriptionHandshakeLink);
    });

    test("Initialize WebSocket correctly for API KEY", (done) => {
        expect.assertions(2);
        jest.spyOn(Date.prototype, 'toISOString').mockImplementation(jest.fn(() => {
            return "2019-11-13T18:47:04.733Z";
        }));
        AppSyncRealTimeSubscriptionHandshakeLink.createWebSocket = jest.fn((url, protocol) => {
            expect(url).toBe('wss://apikeytesturl1234567890123.appsync-realtime-api.us-west-2.amazonaws.com/graphql?header=eyJob3N0IjoiYXBpa2V5dGVzdHVybDEyMzQ1Njc4OTAxMjMuYXBwc3luYy1hcGkudXMtd2VzdC0yLmFtYXpvbmF3cy5jb20iLCJ4LWFtei1kYXRlIjoiMjAxOTExMTNUMTg0NzA0WiIsIngtYXBpLWtleSI6Inh4eHh4In0=&payload=e30=');
            expect(protocol).toBe('graphql-ws');
            done();
            return new myWebSocket();
        });
        const link = new AppSyncRealTimeSubscriptionHandshakeLink({
            auth: {
                type: AUTH_TYPE.API_KEY,
                apiKey: 'xxxxx'
            },
            region: 'us-west-2',
            url: 'https://apikeytesturl1234567890123.appsync-api.us-west-2.amazonaws.com/graphql'
        });

        execute(link, { query }).subscribe({
            error: (err) => {
                console.log(JSON.stringify(err));
                fail;
            },
            next: (data) => {
                console.log({ data });
                done();
            },
            complete: () => {
                console.log('done with this');
                done();
            }

        });
    });

    test("Initialize WebSocket correctly for API KEY with custom domain", (done) => {
        expect.assertions(2);
        jest.spyOn(Date.prototype, 'toISOString').mockImplementation(jest.fn(() => {
            return "2019-11-13T18:47:04.733Z";
        }));
        AppSyncRealTimeSubscriptionHandshakeLink.createWebSocket = jest.fn((url, protocol) => {
            expect(url).toBe('wss://apikeytest.testcustomdomain.com/graphql/realtime?header=eyJob3N0IjoiYXBpa2V5dGVzdC50ZXN0Y3VzdG9tZG9tYWluLmNvbSIsIngtYW16LWRhdGUiOiIyMDE5MTExM1QxODQ3MDRaIiwieC1hcGkta2V5IjoieHh4eHgifQ==&payload=e30=');
            expect(protocol).toBe('graphql-ws');
            done();
            return new myWebSocket();
        });
        const link = new AppSyncRealTimeSubscriptionHandshakeLink({
            auth: {
                type: AUTH_TYPE.API_KEY,
                apiKey: 'xxxxx'
            },
            region: 'us-west-2',
            url: 'https://apikeytest.testcustomdomain.com/graphql'
        });

        execute(link, { query }).subscribe({
            error: (err) => {
                console.log(JSON.stringify(err));
                fail;
            },
            next: (data) => {
                console.log({ data });
                done();
            },
            complete: () => {
                console.log('done with this');
                done();
            }

        });
    });

    test("Initialize WebSocket correctly for COGNITO USER POOLS", (done) => {
        expect.assertions(2);
        jest.spyOn(Date.prototype, 'toISOString').mockImplementation(jest.fn(() => {
            return "2019-11-13T18:47:04.733Z";
        }));
        AppSyncRealTimeSubscriptionHandshakeLink.createWebSocket = jest.fn((url, protocol) => {
            expect(url).toBe('wss://cognitouserpooltesturl1234.appsync-realtime-api.us-west-2.amazonaws.com/graphql?header=eyJBdXRob3JpemF0aW9uIjoidG9rZW4iLCJob3N0IjoiY29nbml0b3VzZXJwb29sdGVzdHVybDEyMzQuYXBwc3luYy1hcGkudXMtd2VzdC0yLmFtYXpvbmF3cy5jb20ifQ==&payload=e30=');
            expect(protocol).toBe('graphql-ws');
            done();
            return new myWebSocket();
        });
        const link = new AppSyncRealTimeSubscriptionHandshakeLink({
            auth: {
                type: AUTH_TYPE.AMAZON_COGNITO_USER_POOLS,
                jwtToken: 'token'
            },
            region: 'us-west-2',
            url: 'https://cognitouserpooltesturl1234.appsync-api.us-west-2.amazonaws.com/graphql'
        });

        execute(link, { query }).subscribe({
            error: (err) => {
                console.log(JSON.stringify(err));
                fail;
            },
            next: (data) => {
                console.log({ data });
                done();
            },
            complete: () => {
                console.log('done with this');
                done();
            }

        });
    });

    test("Initialize WebSocket correctly for COGNITO USER POOLS with custom domain", (done) => {
        expect.assertions(2);
        jest.spyOn(Date.prototype, 'toISOString').mockImplementation(jest.fn(() => {
            return "2019-11-13T18:47:04.733Z";
        }));
        AppSyncRealTimeSubscriptionHandshakeLink.createWebSocket = jest.fn((url, protocol) => {
            expect(url).toBe('wss://cognitouserpools.testcustomdomain.com/graphql/realtime?header=eyJBdXRob3JpemF0aW9uIjoidG9rZW4iLCJob3N0IjoiY29nbml0b3VzZXJwb29scy50ZXN0Y3VzdG9tZG9tYWluLmNvbSJ9&payload=e30=');
            expect(protocol).toBe('graphql-ws');
            done();
            return new myWebSocket();
        });
        const link = new AppSyncRealTimeSubscriptionHandshakeLink({
            auth: {
                type: AUTH_TYPE.AMAZON_COGNITO_USER_POOLS,
                jwtToken: 'token'
            },
            region: 'us-west-2',
            url: 'https://cognitouserpools.testcustomdomain.com/graphql'
        });

        execute(link, { query }).subscribe({
            error: (err) => {
                console.log(JSON.stringify(err));
                fail;
            },
            next: (data) => {
                console.log({ data });
                done();
            },
            complete: () => {
                console.log('done with this');
                done();
            }

        });
    });

    test("Initialize WebSocket correctly for OPENID_CONNECT", (done) => {
        expect.assertions(2);
        jest.spyOn(Date.prototype, 'toISOString').mockImplementation(jest.fn(() => {
            return "2019-11-13T18:47:04.733Z";
        }));
        AppSyncRealTimeSubscriptionHandshakeLink.createWebSocket = jest.fn((url, protocol) => {
            expect(url).toBe('wss://openidconnecttesturl123456.appsync-realtime-api.us-west-2.amazonaws.com/graphql?header=eyJBdXRob3JpemF0aW9uIjoidG9rZW4iLCJob3N0Ijoib3BlbmlkY29ubmVjdHRlc3R1cmwxMjM0NTYuYXBwc3luYy1hcGkudXMtd2VzdC0yLmFtYXpvbmF3cy5jb20ifQ==&payload=e30=');
            expect(protocol).toBe('graphql-ws');
            done();
            return new myWebSocket();
        });
        const link = new AppSyncRealTimeSubscriptionHandshakeLink({
            auth: {
                type: AUTH_TYPE.OPENID_CONNECT,
                jwtToken: 'token'
            },
            region: 'us-west-2',
            url: 'https://openidconnecttesturl123456.appsync-api.us-west-2.amazonaws.com/graphql'
        });

        execute(link, { query }).subscribe({
            error: (err) => {
                console.log(JSON.stringify(err));
                fail;
            },
            next: (data) => {
                console.log({ data });
                done();
            },
            complete: () => {
                console.log('done with this');
                done();
            }

        });
    });

    test("Initialize WebSocket correctly for OPENID_CONNECT with custom domain", (done) => {
        expect.assertions(2);
        jest.spyOn(Date.prototype, 'toISOString').mockImplementation(jest.fn(() => {
            return "2019-11-13T18:47:04.733Z";
        }));
        AppSyncRealTimeSubscriptionHandshakeLink.createWebSocket = jest.fn((url, protocol) => {
            expect(url).toBe('wss://openidconnecttesturl.testcustomdomain.com/graphql/realtime?header=eyJBdXRob3JpemF0aW9uIjoidG9rZW4iLCJob3N0Ijoib3BlbmlkY29ubmVjdHRlc3R1cmwudGVzdGN1c3RvbWRvbWFpbi5jb20ifQ==&payload=e30=');
            expect(protocol).toBe('graphql-ws');
            done();
            return new myWebSocket();
        });
        const link = new AppSyncRealTimeSubscriptionHandshakeLink({
            auth: {
                type: AUTH_TYPE.OPENID_CONNECT,
                jwtToken: 'token'
            },
            region: 'us-west-2',
            url: 'https://openidconnecttesturl.testcustomdomain.com/graphql'
        });

        execute(link, { query }).subscribe({
            error: (err) => {
                console.log(JSON.stringify(err));
                fail;
            },
            next: (data) => {
                console.log({ data });
                done();
            },
            complete: () => {
                console.log('done with this');
                done();
            }

        });
    });

    test('Initialize WebSocket correctly for AWS_LAMBDA', (done) => {
        expect.assertions(2);
        jest.spyOn(Date.prototype, 'toISOString').mockImplementation(jest.fn(() => {
            return "2019-11-13T18:47:04.733Z";
        }));
        AppSyncRealTimeSubscriptionHandshakeLink.createWebSocket = jest.fn((url, protocol) => {
            expect(url).toBe('wss://awslambdatesturl1234567890.appsync-realtime-api.us-west-2.amazonaws.com/graphql?header=eyJBdXRob3JpemF0aW9uIjoidG9rZW4iLCJob3N0IjoiYXdzbGFtYmRhdGVzdHVybDEyMzQ1Njc4OTAuYXBwc3luYy1hcGkudXMtd2VzdC0yLmFtYXpvbmF3cy5jb20ifQ==&payload=e30=');
            expect(protocol).toBe('graphql-ws');
            done();
            return new myWebSocket();
        });
        const link = new AppSyncRealTimeSubscriptionHandshakeLink({
            auth: {
                type: AUTH_TYPE.AWS_LAMBDA,
                token: 'token'
            },
            region: 'us-west-2',
            url: 'https://awslambdatesturl1234567890.appsync-api.us-west-2.amazonaws.com/graphql'
        });

        execute(link, { query }).subscribe({
            error: (err) => {
                fail;
            },
            next: (data) => {
                done();
            },
            complete: () => {
                done();
            }

        });
    })

    test('Initialize WebSocket correctly for AWS_LAMBDA with custom domain', (done) => {
        expect.assertions(2);
        jest.spyOn(Date.prototype, 'toISOString').mockImplementation(jest.fn(() => {
            return "2019-11-13T18:47:04.733Z";
        }));
        AppSyncRealTimeSubscriptionHandshakeLink.createWebSocket = jest.fn((url, protocol) => {
            expect(url).toBe('wss://awslambdatesturl.testcustomdomain.com/graphql/realtime?header=eyJBdXRob3JpemF0aW9uIjoidG9rZW4iLCJob3N0IjoiYXdzbGFtYmRhdGVzdHVybC50ZXN0Y3VzdG9tZG9tYWluLmNvbSJ9&payload=e30=');
            expect(protocol).toBe('graphql-ws');
            done();
            return new myWebSocket();
        });
        const link = new AppSyncRealTimeSubscriptionHandshakeLink({
            auth: {
                type: AUTH_TYPE.AWS_LAMBDA,
                token: 'token'
            },
            region: 'us-west-2',
            url: 'https://awslambdatesturl.testcustomdomain.com/graphql'
        });

        execute(link, { query }).subscribe({
            error: (err) => {
                fail;
            },
            next: (data) => {
                done();
            },
            complete: () => {
                done();
            }

        });
    });

    test("Can use a custom keepAliveTimeoutMs", (done) => {
        const id = "abcd-efgh-ijkl-mnop";
        uuid.mockImplementationOnce(() => id);

        expect.assertions(5);
        jest.spyOn(Date.prototype, 'toISOString').mockImplementation(jest.fn(() => {
            return "2019-11-13T18:47:04.733Z";
        }));
        AppSyncRealTimeSubscriptionHandshakeLink.createWebSocket = jest.fn((url, protocol) => {
            expect(url).toBe('wss://apikeytest.testcustomdomain.com/graphql/realtime?header=eyJob3N0IjoiYXBpa2V5dGVzdC50ZXN0Y3VzdG9tZG9tYWluLmNvbSIsIngtYW16LWRhdGUiOiIyMDE5MTExM1QxODQ3MDRaIiwieC1hcGkta2V5IjoieHh4eHgifQ==&payload=e30=');
            expect(protocol).toBe('graphql-ws');
            const socket = new myWebSocket();

            setTimeout(() => {
                socket.close = () => {};
                socket.onopen.call(socket, (undefined as unknown as Event));
                socket.send = (msg: string) => {
                    const { type } = JSON.parse(msg);

                    switch (type) {
                        case MESSAGE_TYPES.GQL_CONNECTION_INIT:
                            socket.onmessage.call(socket, {
                                data: JSON.stringify({
                                    type: MESSAGE_TYPES.GQL_CONNECTION_ACK,
                                    payload: {
                                        connectionTimeoutMs: 99999,
                                    },
                                })
                            } as MessageEvent);
                            setTimeout(() => {
                                socket.onmessage.call(socket, {
                                    data: JSON.stringify({
                                        id,
                                        type: MESSAGE_TYPES.GQL_DATA,
                                        payload: {
                                            data: { something: 123 },
                                        },
                                    })
                                } as MessageEvent);

                            }, 100);
                            break;
                    }
                };
            }, 100);

            return socket;
        });
        const link = new AppSyncRealTimeSubscriptionHandshakeLink({
            auth: {
                type: AUTH_TYPE.API_KEY,
                apiKey: 'xxxxx'
            },
            region: 'us-west-2',
            url: 'https://apikeytest.testcustomdomain.com/graphql',
            keepAliveTimeoutMs: 123456,
        });

        expect(link).toBeInstanceOf(AppSyncRealTimeSubscriptionHandshakeLink);
        expect((link as any).keepAliveTimeout).toBe(123456);

        const sub = execute(link, { query }).subscribe({
            error: (err) => {
                console.log(JSON.stringify(err));
                fail();
            },
            next: (data) => {
                expect((link as any).keepAliveTimeout).toBe(123456);
                done();
                sub.unsubscribe();
            },
            complete: () => {
                console.log('done with this');
                fail();
            }

        });
    });

    test("Uses service-provided timeout when no custom keepAliveTimeoutMs is configured", (done) => {
        const id = "abcd-efgh-ijkl-mnop";
        uuid.mockImplementationOnce(() => id);

        expect.assertions(5);
        jest.spyOn(Date.prototype, 'toISOString').mockImplementation(jest.fn(() => {
            return "2019-11-13T18:47:04.733Z";
        }));
        AppSyncRealTimeSubscriptionHandshakeLink.createWebSocket = jest.fn((url, protocol) => {
            expect(url).toBe('wss://apikeytest.testcustomdomain.com/graphql/realtime?header=eyJob3N0IjoiYXBpa2V5dGVzdC50ZXN0Y3VzdG9tZG9tYWluLmNvbSIsIngtYW16LWRhdGUiOiIyMDE5MTExM1QxODQ3MDRaIiwieC1hcGkta2V5IjoieHh4eHgifQ==&payload=e30=');
            expect(protocol).toBe('graphql-ws');
            const socket = new myWebSocket();

            setTimeout(() => {
                socket.close = () => {};
                socket.onopen.call(socket, (undefined as unknown as Event));
                socket.send = (msg: string) => {
                    const { type } = JSON.parse(msg);

                    switch (type) {
                        case MESSAGE_TYPES.GQL_CONNECTION_INIT:
                            socket.onmessage.call(socket, {
                                data: JSON.stringify({
                                    type: MESSAGE_TYPES.GQL_CONNECTION_ACK,
                                    payload: {
                                        connectionTimeoutMs: 99999,
                                    },
                                })
                            } as MessageEvent);
                            setTimeout(() => {
                                socket.onmessage.call(socket, {
                                    data: JSON.stringify({
                                        id,
                                        type: MESSAGE_TYPES.GQL_DATA,
                                        payload: {
                                            data: { something: 123 },
                                        },
                                    })
                                } as MessageEvent);

                            }, 100);
                            break;
                    }
                };
            }, 100);

            return socket;
        });
        const link = new AppSyncRealTimeSubscriptionHandshakeLink({
            auth: {
                type: AUTH_TYPE.API_KEY,
                apiKey: 'xxxxx'
            },
            region: 'us-west-2',
            url: 'https://apikeytest.testcustomdomain.com/graphql',
        });

        expect(link).toBeInstanceOf(AppSyncRealTimeSubscriptionHandshakeLink);
        expect((link as any).keepAliveTimeout).toBeUndefined();

        const sub = execute(link, { query }).subscribe({
            error: (err) => {
                console.log(JSON.stringify(err));
                fail();
            },
            next: (data) => {
                expect((link as any).keepAliveTimeout).toBe(99999);
                done();
                sub.unsubscribe();
            },
            complete: () => {
                console.log('done with this');
                fail();
            }

        });
    });


});
