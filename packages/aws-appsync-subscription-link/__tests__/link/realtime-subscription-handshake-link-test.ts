import { AUTH_TYPE } from "aws-appsync-auth-link";
import { execute } from "@apollo/client/core";
import gql from 'graphql-tag';
import { AppSyncRealTimeSubscriptionHandshakeLink } from '../../src/realtime-subscription-handshake-link';

const query = gql`subscription { someSubscription { aField } }`

class myWebSocket implements WebSocket {
    binaryType: BinaryType; bufferedAmount: number;
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
            region: 'us-east-1',
            url: 'https://xxxxx.appsync-api.amazonaws.com/graphql'
        });

        expect(link).toBeInstanceOf(AppSyncRealTimeSubscriptionHandshakeLink);
    });

    test("Initialize WebSocket correctly for API KEY", (done) => {
        expect.assertions(2);
        jest.spyOn(Date.prototype, 'toISOString').mockImplementation(jest.fn(() => {
            return "2019-11-13T18:47:04.733Z";
        }));
        AppSyncRealTimeSubscriptionHandshakeLink.createWebSocket = jest.fn((url, protocol) => {
            expect(url).toBe('wss://xxxxx.appsync-realtime-api.amazonaws.com/graphql?header=eyJob3N0IjoieHh4eHguYXBwc3luYy1hcGkuYW1hem9uYXdzLmNvbSIsIngtYW16LWRhdGUiOiIyMDE5MTExM1QxODQ3MDRaIiwieC1hcGkta2V5IjoieHh4eHgifQ==&payload=e30=');
            expect(protocol).toBe('graphql-ws');
            done();
            return new myWebSocket();
        });
        const link = new AppSyncRealTimeSubscriptionHandshakeLink({
            auth: {
                type: AUTH_TYPE.API_KEY,
                apiKey: 'xxxxx'
            },
            region: 'us-east-1',
            url: 'https://xxxxx.appsync-api.amazonaws.com/graphql'
        });

        execute(link, { query }).subscribe({
            error: (err) => {
                console.log({ err });
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
            expect(url).toBe('wss://xxxxx.appsync-realtime-api.amazonaws.com/graphql?header=eyJBdXRob3JpemF0aW9uIjoidG9rZW4iLCJob3N0IjoieHh4eHguYXBwc3luYy1hcGkuYW1hem9uYXdzLmNvbSJ9&payload=e30=');
            expect(protocol).toBe('graphql-ws');
            done();
            return new myWebSocket();
        });
        const link = new AppSyncRealTimeSubscriptionHandshakeLink({
            auth: {
                type: AUTH_TYPE.AMAZON_COGNITO_USER_POOLS,
                jwtToken: 'token'
            },
            region: 'us-east-1',
            url: 'https://xxxxx.appsync-api.amazonaws.com/graphql'
        });

        execute(link, { query }).subscribe({
            error: (err) => {
                console.log({ err });
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
            expect(url).toBe('wss://xxxxx.appsync-realtime-api.amazonaws.com/graphql?header=eyJBdXRob3JpemF0aW9uIjoidG9rZW4iLCJob3N0IjoieHh4eHguYXBwc3luYy1hcGkuYW1hem9uYXdzLmNvbSJ9&payload=e30=');
            expect(protocol).toBe('graphql-ws');
            done();
            return new myWebSocket();
        });
        const link = new AppSyncRealTimeSubscriptionHandshakeLink({
            auth: {
                type: AUTH_TYPE.OPENID_CONNECT,
                jwtToken: 'token'
            },
            region: 'us-east-1',
            url: 'https://xxxxx.appsync-api.amazonaws.com/graphql'
        });

        execute(link, { query }).subscribe({
            error: (err) => {
                console.log({ err });
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
            expect(url).toBe('wss://xxxxx.appsync-realtime-api.amazonaws.com/graphql?header=eyJBdXRob3JpemF0aW9uIjoidG9rZW4iLCJob3N0IjoieHh4eHguYXBwc3luYy1hcGkuYW1hem9uYXdzLmNvbSJ9&payload=e30=');
            expect(protocol).toBe('graphql-ws');
            done();
            return new myWebSocket();
        });
        const link = new AppSyncRealTimeSubscriptionHandshakeLink({
            auth: {
                type: AUTH_TYPE.AWS_LAMBDA,
                token: 'token'
            },
            region: 'us-east-1',
            url: 'https://xxxxx.appsync-api.amazonaws.com/graphql'
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

});
