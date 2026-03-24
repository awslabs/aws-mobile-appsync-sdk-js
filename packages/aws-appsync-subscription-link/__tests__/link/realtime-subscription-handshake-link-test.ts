import { AUTH_TYPE } from "aws-appsync-auth-link";
import { execute } from "@apollo/client/core";
import gql from 'graphql-tag';
import { AppSyncRealTimeSubscriptionHandshakeLink } from '../../src/realtime-subscription-handshake-link';
import { MESSAGE_TYPES } from "../../src/types";
import { v4 as uuid } from "uuid";
jest.mock('uuid', () => ({ v4: jest.fn() }));

const query = gql`subscription { someSubscription { aField } }`

/**
 * Helper to decode a base64url-encoded header from the Sec-WebSocket-Protocol value.
 * The protocol value is prefixed with "header-".
 */
function decodeProtocolHeader(protocols: string | string[]): Record<string, string> {
  const arr = Array.isArray(protocols) ? protocols : [protocols];
  const headerProtocol = arr.find(p => p.startsWith("header-"));
  if (!headerProtocol) throw new Error("No header- protocol found");
  const base64url = headerProtocol.slice("header-".length);
  // Convert base64url back to standard base64
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(base64, "base64").toString());
}

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
        expect.assertions(3);
        jest.spyOn(Date.prototype, 'toISOString').mockImplementation(jest.fn(() => {
            return "2019-11-13T18:47:04.733Z";
        }));
        AppSyncRealTimeSubscriptionHandshakeLink.createWebSocket = jest.fn((url, protocol) => {
            // URL should be clean — no query string with credentials
            expect(url).toBe('wss://apikeytesturl1234567890123.appsync-realtime-api.us-west-2.amazonaws.com/graphql');
            // Protocol should be an array with graphql-ws and header- prefix
            expect(Array.isArray(protocol)).toBe(true);
            const header = decodeProtocolHeader(protocol);
            expect(header["x-api-key"]).toBe("xxxxx");
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
        expect.assertions(3);
        jest.spyOn(Date.prototype, 'toISOString').mockImplementation(jest.fn(() => {
            return "2019-11-13T18:47:04.733Z";
        }));
        AppSyncRealTimeSubscriptionHandshakeLink.createWebSocket = jest.fn((url, protocol) => {
            expect(url).toBe('wss://apikeytest.testcustomdomain.com/graphql/realtime');
            expect(Array.isArray(protocol)).toBe(true);
            const header = decodeProtocolHeader(protocol);
            expect(header["x-api-key"]).toBe("xxxxx");
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
        expect.assertions(3);
        jest.spyOn(Date.prototype, 'toISOString').mockImplementation(jest.fn(() => {
            return "2019-11-13T18:47:04.733Z";
        }));
        AppSyncRealTimeSubscriptionHandshakeLink.createWebSocket = jest.fn((url, protocol) => {
            expect(url).toBe('wss://cognitouserpooltesturl1234.appsync-realtime-api.us-west-2.amazonaws.com/graphql');
            expect(Array.isArray(protocol)).toBe(true);
            const header = decodeProtocolHeader(protocol);
            expect(header["Authorization"]).toBe("token");
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
        expect.assertions(3);
        jest.spyOn(Date.prototype, 'toISOString').mockImplementation(jest.fn(() => {
            return "2019-11-13T18:47:04.733Z";
        }));
        AppSyncRealTimeSubscriptionHandshakeLink.createWebSocket = jest.fn((url, protocol) => {
            expect(url).toBe('wss://cognitouserpools.testcustomdomain.com/graphql/realtime');
            expect(Array.isArray(protocol)).toBe(true);
            const header = decodeProtocolHeader(protocol);
            expect(header["Authorization"]).toBe("token");
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
        expect.assertions(3);
        jest.spyOn(Date.prototype, 'toISOString').mockImplementation(jest.fn(() => {
            return "2019-11-13T18:47:04.733Z";
        }));
        AppSyncRealTimeSubscriptionHandshakeLink.createWebSocket = jest.fn((url, protocol) => {
            expect(url).toBe('wss://openidconnecttesturl123456.appsync-realtime-api.us-west-2.amazonaws.com/graphql');
            expect(Array.isArray(protocol)).toBe(true);
            const header = decodeProtocolHeader(protocol);
            expect(header["Authorization"]).toBe("token");
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
        expect.assertions(3);
        jest.spyOn(Date.prototype, 'toISOString').mockImplementation(jest.fn(() => {
            return "2019-11-13T18:47:04.733Z";
        }));
        AppSyncRealTimeSubscriptionHandshakeLink.createWebSocket = jest.fn((url, protocol) => {
            expect(url).toBe('wss://openidconnecttesturl.testcustomdomain.com/graphql/realtime');
            expect(Array.isArray(protocol)).toBe(true);
            const header = decodeProtocolHeader(protocol);
            expect(header["Authorization"]).toBe("token");
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
        expect.assertions(3);
        jest.spyOn(Date.prototype, 'toISOString').mockImplementation(jest.fn(() => {
            return "2019-11-13T18:47:04.733Z";
        }));
        AppSyncRealTimeSubscriptionHandshakeLink.createWebSocket = jest.fn((url, protocol) => {
            expect(url).toBe('wss://awslambdatesturl1234567890.appsync-realtime-api.us-west-2.amazonaws.com/graphql');
            expect(Array.isArray(protocol)).toBe(true);
            const header = decodeProtocolHeader(protocol);
            expect(header["Authorization"]).toBe("token");
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
        expect.assertions(3);
        jest.spyOn(Date.prototype, 'toISOString').mockImplementation(jest.fn(() => {
            return "2019-11-13T18:47:04.733Z";
        }));
        AppSyncRealTimeSubscriptionHandshakeLink.createWebSocket = jest.fn((url, protocol) => {
            expect(url).toBe('wss://awslambdatesturl.testcustomdomain.com/graphql/realtime');
            expect(Array.isArray(protocol)).toBe(true);
            const header = decodeProtocolHeader(protocol);
            expect(header["Authorization"]).toBe("token");
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
            expect(url).toBe('wss://apikeytest.testcustomdomain.com/graphql/realtime');
            expect(Array.isArray(protocol)).toBe(true);
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
            expect(url).toBe('wss://apikeytest.testcustomdomain.com/graphql/realtime');
            expect(Array.isArray(protocol)).toBe(true);
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

    test("URL does not contain credentials in query string", (done) => {
        expect.assertions(2);
        jest.spyOn(Date.prototype, 'toISOString').mockImplementation(jest.fn(() => {
            return "2019-11-13T18:47:04.733Z";
        }));
        AppSyncRealTimeSubscriptionHandshakeLink.createWebSocket = jest.fn((url, protocol) => {
            // The URL must not contain any query parameters with auth material
            expect(url.includes("?")).toBe(false);
            // Auth should be in the protocol header instead
            const header = decodeProtocolHeader(protocol);
            expect(header["x-api-key"]).toBe("my-secret-key");
            done();
            return new myWebSocket();
        });
        const link = new AppSyncRealTimeSubscriptionHandshakeLink({
            auth: {
                type: AUTH_TYPE.API_KEY,
                apiKey: "my-secret-key",
            },
            region: "us-west-2",
            url: "https://securitytesturl12345678901.appsync-api.us-west-2.amazonaws.com/graphql",
        });

        execute(link, { query }).subscribe({
            error: () => { fail; },
            next: () => { done(); },
            complete: () => { done(); },
        });
    });

});
