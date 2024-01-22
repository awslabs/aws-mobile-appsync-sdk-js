/*!
 * Copyright 2017-2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { ApolloLink, Observable, Operation, FetchResult } from "@apollo/client/core";

import { rootLogger } from "./utils";

import {
  Signer,
  AuthOptions,
  AUTH_TYPE,
  USER_AGENT_HEADER,
  USER_AGENT
} from "aws-appsync-auth-link";
import { GraphQLError, print } from "graphql";
import * as url from "url";
import { v4 as uuid } from "uuid";
import {
  AppSyncRealTimeSubscriptionConfig,
  SOCKET_STATUS,
  ObserverQuery,
  SUBSCRIPTION_STATUS,
  MESSAGE_TYPES,
  CONTROL_MSG
} from "./types";
import { jitteredExponentialRetry, NonRetryableError } from "./utils/retry";

const logger = rootLogger.extend("subscriptions");

export const CONTROL_EVENTS_KEY = "@@controlEvents";

const NON_RETRYABLE_CODES = [400, 401, 403];

const SERVICE = "appsync";

const APPSYNC_REALTIME_HEADERS = {
  accept: 'application/json, text/javascript',
  'content-encoding': 'amz-1.0',
  'content-type': 'application/json; charset=UTF-8'
};

/**
 * Time in milliseconds to wait for GQL_CONNECTION_INIT message
 */
const CONNECTION_INIT_TIMEOUT = 15000;

/**
 * Time in milliseconds to wait for GQL_START_ACK message
 */
const START_ACK_TIMEOUT = 15000;

/**
 * Frequency in milliseconds in which the server sends GQL_CONNECTION_KEEP_ALIVE messages
 */
const SERVER_KEEP_ALIVE_TIMEOUT = 1 * 60 * 1000;

/**
 * Default Time in milliseconds to wait for GQL_CONNECTION_KEEP_ALIVE message
 */
const DEFAULT_KEEP_ALIVE_TIMEOUT = 5 * 60 * 1000;

const standardDomainPattern = /^https:\/\/\w{26}\.appsync\-api\.\w{2}(?:(?:\-\w{2,})+)\-\d\.amazonaws.com\/graphql$/i;

const customDomainPath = '/realtime';

export class AppSyncRealTimeSubscriptionHandshakeLink extends ApolloLink {
  private url: string;
  private region: string;
  private auth: AuthOptions;
  private awsRealTimeSocket: WebSocket;
  private socketStatus: SOCKET_STATUS = SOCKET_STATUS.CLOSED;
  private keepAliveTimeoutId;
  private keepAliveTimeout?: number = undefined;
  private subscriptionObserverMap: Map<string, ObserverQuery> = new Map();
  private promiseArray: Array<{ res: Function; rej: Function }> = [];

  constructor({ url: theUrl, region: theRegion, auth: theAuth, keepAliveTimeoutMs }: AppSyncRealTimeSubscriptionConfig) {
    super();
    this.url = theUrl;
    this.region = theRegion;
    this.auth = theAuth;
    this.keepAliveTimeout = keepAliveTimeoutMs;

    if (this.keepAliveTimeout < SERVER_KEEP_ALIVE_TIMEOUT) {
      let configName: keyof AppSyncRealTimeSubscriptionConfig = 'keepAliveTimeoutMs';

      throw new Error(`${configName} must be greater than or equal to ${SERVER_KEEP_ALIVE_TIMEOUT} (${this.keepAliveTimeout} used).`);
    }
  }

  // Check if url matches standard domain pattern
  private isCustomDomain(url: string): boolean {
    return url.match(standardDomainPattern) === null;
  }

  request(operation: Operation) {
    const { query, variables } = operation;
    const {
      controlMessages: { [CONTROL_EVENTS_KEY]: controlEvents } = {
        [CONTROL_EVENTS_KEY]: undefined
      },
      headers
    } = operation.getContext();
    return new Observable<FetchResult>(observer => {
      if (!this.url) {
        observer.error({
          errors: [
            {
              ...new GraphQLError(
                `Subscribe only available for AWS AppSync endpoint`
              ),
            },
          ],
        });
        observer.complete();
      } else {
        const subscriptionId = uuid();
        let token = this.auth.type === AUTH_TYPE.AMAZON_COGNITO_USER_POOLS ||
          this.auth.type === AUTH_TYPE.OPENID_CONNECT
          ? this.auth.jwtToken
          : null;

        token = this.auth.type === AUTH_TYPE.AWS_LAMBDA ? this.auth.token : token;

        const options = {
          appSyncGraphqlEndpoint: this.url,
          authenticationType: this.auth.type,
          query: print(query),
          region: this.region,
          graphql_headers: () => (headers),
          variables,
          apiKey: this.auth.type === AUTH_TYPE.API_KEY ? this.auth.apiKey : "",
          credentials:
            this.auth.type === AUTH_TYPE.AWS_IAM ? this.auth.credentials : null,
          token
        };

        this._startSubscriptionWithAWSAppSyncRealTime({
          options,
          observer,
          subscriptionId
        });

        return async () => {
          // Cleanup after unsubscribing or observer.complete was called after _startSubscriptionWithAWSAppSyncRealTime
          try {
            this._verifySubscriptionAlreadyStarted(subscriptionId);
            const { subscriptionState } = this.subscriptionObserverMap.get(
              subscriptionId
            );
            if (subscriptionState === SUBSCRIPTION_STATUS.CONNECTED) {
              this._sendUnsubscriptionMessage(subscriptionId);
            } else {
              throw new Error(
                "Subscription has failed, starting to remove subscription."
              );
            }
          } catch (err) {
            this._removeSubscriptionObserver(subscriptionId);
            return;
          }
        };
      }
    }).filter(data => {
      const { extensions: { controlMsgType = undefined } = {} } = data;
      const isControlMsg = typeof controlMsgType !== "undefined";

      return controlEvents === true || !isControlMsg;
    });
  }

  private async _verifySubscriptionAlreadyStarted(subscriptionId) {
    const { subscriptionState } = this.subscriptionObserverMap.get(
      subscriptionId
    );
    // This in case unsubscribe is invoked before sending start subscription message
    if (subscriptionState === SUBSCRIPTION_STATUS.PENDING) {
      return new Promise((res, rej) => {
        const {
          observer,
          subscriptionState,
          variables,
          query
        } = this.subscriptionObserverMap.get(subscriptionId);
        this.subscriptionObserverMap.set(subscriptionId, {
          observer,
          subscriptionState,
          variables,
          query,
          subscriptionReadyCallback: res,
          subscriptionFailedCallback: rej
        });
      });
    }
  }

  private _sendUnsubscriptionMessage(subscriptionId) {
    try {
      if (
        this.awsRealTimeSocket &&
        this.awsRealTimeSocket.readyState === WebSocket.OPEN &&
        this.socketStatus === SOCKET_STATUS.READY
      ) {
        // Preparing unsubscribe message to stop receiving messages for that subscription
        const unsubscribeMessage = {
          id: subscriptionId,
          type: MESSAGE_TYPES.GQL_STOP
        };
        const stringToAWSRealTime = JSON.stringify(unsubscribeMessage);
        this.awsRealTimeSocket.send(stringToAWSRealTime);

        this._removeSubscriptionObserver(subscriptionId);
      }
    } catch (err) {
      // If GQL_STOP is not sent because of disconnection issue, then there is nothing the client can do
      logger({ err });
    }
  }

  private _removeSubscriptionObserver(subscriptionId) {
    this.subscriptionObserverMap.delete(subscriptionId);
    // Verifying for 1000ms after removing subscription in case there are new subscriptions on mount / unmount
    setTimeout(this._closeSocketIfRequired.bind(this), 1000);
  }

  private _closeSocketIfRequired() {
    if (this.subscriptionObserverMap.size > 0) {
      // There are active subscriptions on the WebSocket
      return;
    }

    if (!this.awsRealTimeSocket) {
      this.socketStatus = SOCKET_STATUS.CLOSED;
      return;
    }
    if (this.awsRealTimeSocket.bufferedAmount > 0) {
      // There is still data on the WebSocket
      setTimeout(this._closeSocketIfRequired.bind(this), 1000);
    } else {
      logger("closing WebSocket...");
      clearTimeout(this.keepAliveTimeoutId);
      const tempSocket = this.awsRealTimeSocket;
      tempSocket.close(1000);
      this.awsRealTimeSocket = null;
      this.socketStatus = SOCKET_STATUS.CLOSED;
    }
  }

  private async _startSubscriptionWithAWSAppSyncRealTime({
    options,
    observer,
    subscriptionId
  }) {
    const {
      appSyncGraphqlEndpoint,
      authenticationType,
      query,
      variables,
      apiKey,
      region,
      graphql_headers = () => ({}),
      credentials,
      token
    } = options;
    const subscriptionState: SUBSCRIPTION_STATUS = SUBSCRIPTION_STATUS.PENDING;
    const data = {
      query,
      variables
    };
    // Having a subscription id map will make it simple to forward messages received
    this.subscriptionObserverMap.set(subscriptionId, {
      observer,
      query,
      variables,
      subscriptionState,
      startAckTimeoutId: null,
    });

    // Preparing payload for subscription message

    const dataString = JSON.stringify(data);
    const headerObj = {
      ...(await this._awsRealTimeHeaderBasedAuth({
        apiKey,
        appSyncGraphqlEndpoint,
        authenticationType,
        payload: dataString,
        canonicalUri: "",
        region,
        credentials,
        token,
        graphql_headers
      })),
      [USER_AGENT_HEADER]: USER_AGENT
    };

    const subscriptionMessage = {
      id: subscriptionId,
      payload: {
        data: dataString,
        extensions: {
          authorization: {
            ...headerObj
          }
        }
      },
      type: MESSAGE_TYPES.GQL_START
    };

    const stringToAWSRealTime = JSON.stringify(subscriptionMessage);

    try {
      await this._initializeWebSocketConnection({
        apiKey,
        appSyncGraphqlEndpoint,
        authenticationType,
        region,
        credentials,
        token
      });
    } catch (err) {
      const { message = "" } = err;
      observer.error({
        errors: [
          {
            ...new GraphQLError(`Connection failed: ${message}`)
          }
        ]
      });
      observer.complete();

      const { subscriptionFailedCallback } =
        this.subscriptionObserverMap.get(subscriptionId) || {};

      // Notify concurrent unsubscription
      if (typeof subscriptionFailedCallback === "function") {
        subscriptionFailedCallback();
      }
      return;
    }

    // There could be a race condition when unsubscribe gets called during _initializeWebSocketConnection
    // For example if unsubscribe gets invoked before it finishes WebSocket handshake or START_ACK
    // subscriptionFailedCallback subscriptionReadyCallback are used to synchonized that

    const {
      subscriptionFailedCallback,
      subscriptionReadyCallback
    } = this.subscriptionObserverMap.get(subscriptionId) || {};

    // This must be done before sending the message in order to be listening immediately
    this.subscriptionObserverMap.set(subscriptionId, {
      observer,
      subscriptionState,
      variables,
      query,
      subscriptionReadyCallback,
      subscriptionFailedCallback,
      startAckTimeoutId: (setTimeout(() => {
        this._timeoutStartSubscriptionAck.call(this, subscriptionId);
      }, START_ACK_TIMEOUT) as unknown) as number
    });

    if (this.awsRealTimeSocket) {
      this.awsRealTimeSocket.send(stringToAWSRealTime);
    }
  }

  private _initializeWebSocketConnection({
    appSyncGraphqlEndpoint,
    authenticationType,
    apiKey,
    region,
    credentials,
    token
  }): Promise<void> {
    if (this.socketStatus === SOCKET_STATUS.READY) {
      return;
    }
    return new Promise(async (res, rej) => {
      this.promiseArray.push({ res, rej });

      if (this.socketStatus === SOCKET_STATUS.CLOSED) {
        try {
          this.socketStatus = SOCKET_STATUS.CONNECTING;

          const payloadString = "{}";
          const headerString = JSON.stringify(
            await this._awsRealTimeHeaderBasedAuth({
              authenticationType,
              payload: payloadString,
              canonicalUri: "/connect",
              apiKey,
              appSyncGraphqlEndpoint,
              region,
              credentials,
              token,
              graphql_headers: () => { }
            })
          );
          const headerQs = Buffer.from(headerString).toString("base64");

          const payloadQs = Buffer.from(payloadString).toString("base64");

          let discoverableEndpoint = appSyncGraphqlEndpoint;

          if (this.isCustomDomain(discoverableEndpoint)) {
            discoverableEndpoint = discoverableEndpoint.concat(
              customDomainPath
            );
          } else {
            discoverableEndpoint = discoverableEndpoint.replace('appsync-api', 'appsync-realtime-api').replace('gogi-beta', 'grt-beta');
          }

          discoverableEndpoint = discoverableEndpoint
            .replace("https://", "wss://")
            .replace('http://', 'ws://')

          const awsRealTimeUrl = `${discoverableEndpoint}?header=${headerQs}&payload=${payloadQs}`;

          await this._initializeRetryableHandshake({ awsRealTimeUrl });

          this.promiseArray.forEach(({ res }) => {
            logger("Notifying connection successful");
            res();
          });
          this.socketStatus = SOCKET_STATUS.READY;
          this.promiseArray = [];
        } catch (err) {
          this.promiseArray.forEach(({ rej }) => rej(err));
          this.promiseArray = [];
          if (
            this.awsRealTimeSocket &&
            this.awsRealTimeSocket.readyState === WebSocket.OPEN
          ) {
            this.awsRealTimeSocket.close(3001);
          }
          this.awsRealTimeSocket = null;
          this.socketStatus = SOCKET_STATUS.CLOSED;
        }
      }
    });
  }

  private async _awsRealTimeHeaderBasedAuth({
    authenticationType,
    payload,
    canonicalUri,
    appSyncGraphqlEndpoint,
    apiKey,
    region,
    credentials,
    token,
    graphql_headers
  }) {
    const headerHandler: Record<
      string,
      (info: any) => Promise<Record<string, string>>
    > = {
      API_KEY: this._awsRealTimeApiKeyHeader.bind(this),
      AWS_IAM: this._awsRealTimeIAMHeader.bind(this),
      OPENID_CONNECT: this._awsRealTimeAuthorizationHeader.bind(this),
      AMAZON_COGNITO_USER_POOLS: this._awsRealTimeAuthorizationHeader.bind(this),
      AWS_LAMBDA: this._awsRealTimeAuthorizationHeader.bind(this)
    };

    const handler = headerHandler[authenticationType];

    if (typeof handler !== "function") {
      logger(`Authentication type ${authenticationType} not supported`);
      return {};
    }

    const { host } = url.parse(appSyncGraphqlEndpoint);

    const result = await handler({
      payload,
      canonicalUri,
      appSyncGraphqlEndpoint,
      apiKey,
      region,
      host,
      credentials,
      token,
      graphql_headers
    });

    return result;
  }

  private async _awsRealTimeAuthorizationHeader({
    host,
    token,
    graphql_headers
  }): Promise<Record<string, string>> {
    return {
      Authorization:
        typeof token === "function"
          ? await token.call(undefined)
          : await token,
      host,
      ...(await graphql_headers())
    };
  }

  private async _awsRealTimeApiKeyHeader({
    apiKey,
    host,
    graphql_headers
  }): Promise<Record<string, string>> {
    const dt = new Date();
    const dtStr = dt.toISOString().replace(/[:\-]|\.\d{3}/g, "");

    return {
      host,
      "x-amz-date": dtStr,
      "x-api-key": apiKey,
      ...(await graphql_headers()),
    };
  }

  private async _awsRealTimeIAMHeader({
    payload,
    canonicalUri,
    appSyncGraphqlEndpoint,
    region,
    credentials
  }): Promise<Record<string, string>> {
    const endpointInfo = {
      region,
      service: SERVICE
    };

    let creds =
      typeof credentials === "function"
        ? credentials.call()
        : credentials || {};

    if (creds && typeof creds.getPromise === "function") {
      await creds.getPromise();
    }

    if (!creds) {
      throw new Error("No credentials");
    }
    const { accessKeyId, secretAccessKey, sessionToken } = await creds;

    const formattedCredentials = {
      access_key: accessKeyId,
      secret_key: secretAccessKey,
      session_token: sessionToken
    };

    const request = {
      url: `${appSyncGraphqlEndpoint}${canonicalUri}`,
      body: payload,
      method: "POST",
      headers: { ...APPSYNC_REALTIME_HEADERS }
    };

    const signed_params = Signer.sign(
      request,
      formattedCredentials,
      endpointInfo
    );
    return signed_params.headers;
  }

  private async _initializeRetryableHandshake({ awsRealTimeUrl }) {
    logger(`Initializaling retryable Handshake`);
    await jitteredExponentialRetry(this._initializeHandshake.bind(this), [
      { awsRealTimeUrl }
    ]);
  }

  private async _initializeHandshake({ awsRealTimeUrl }) {
    logger(`Initializing handshake ${awsRealTimeUrl}`);
    // Because connecting the socket is async, is waiting until connection is open
    // Step 1: connect websocket
    try {
      await (() => {
        return new Promise<void>((res, rej) => {
          const newSocket = AppSyncRealTimeSubscriptionHandshakeLink.createWebSocket(awsRealTimeUrl, "graphql-ws");
          newSocket.onerror = () => {
            logger(`WebSocket connection error`);
          };
          newSocket.onclose = () => {
            rej(new Error("Connection handshake error"));
          };
          newSocket.onopen = () => {
            this.awsRealTimeSocket = newSocket;
            return res();
          };
        });
      })();


      // Step 2: wait for ack from AWS AppSyncReaTime after sending init
      await (() => {
        return new Promise((res, rej) => {
          let ackOk = false;
          this.awsRealTimeSocket.onerror = error => {
            logger(`WebSocket closed ${JSON.stringify(error)}`);
          };
          this.awsRealTimeSocket.onclose = event => {
            logger(`WebSocket closed ${event.reason}`);
            rej(new Error(JSON.stringify(event)));
          };

          this.awsRealTimeSocket.onmessage = (message: MessageEvent) => {
            logger(
              `subscription message from AWS AppSyncRealTime: ${message.data} `
            );
            const data = JSON.parse(message.data);
            const {
              type,
              payload: { connectionTimeoutMs = DEFAULT_KEEP_ALIVE_TIMEOUT } = {}
            } = data;
            if (type === MESSAGE_TYPES.GQL_CONNECTION_ACK) {
              ackOk = true;
              this.keepAliveTimeout = this.keepAliveTimeout ?? connectionTimeoutMs;
              this.awsRealTimeSocket.onmessage = this._handleIncomingSubscriptionMessage.bind(
                this
              );

              this.awsRealTimeSocket.onerror = err => {
                logger(err);
                this._errorDisconnect(CONTROL_MSG.CONNECTION_CLOSED);
              };

              this.awsRealTimeSocket.onclose = event => {
                logger(`WebSocket closed ${event.reason}`);
                this._errorDisconnect(CONTROL_MSG.CONNECTION_CLOSED);
              };

              res("Cool, connected to AWS AppSyncRealTime");
              return;
            }

            if (type === MESSAGE_TYPES.GQL_CONNECTION_ERROR) {
              const {
                payload: {
                  errors: [{ errorType = "", errorCode = 0 } = {}] = []
                } = {}
              } = data;

              rej({ errorType, errorCode });
            }
          };

          const gqlInit = {
            type: MESSAGE_TYPES.GQL_CONNECTION_INIT
          };
          this.awsRealTimeSocket.send(JSON.stringify(gqlInit));

          function checkAckOk() {
            if (!ackOk) {
              rej(
                new Error(
                  `Connection timeout: ack from AWSRealTime was not received on ${CONNECTION_INIT_TIMEOUT} ms`
                )
              );
            }
          }

          setTimeout(checkAckOk.bind(this), CONNECTION_INIT_TIMEOUT);
        });
      })();
    } catch (err) {
      const { errorType, errorCode } = err;

      if (NON_RETRYABLE_CODES.indexOf(errorCode) >= 0) {
        throw new NonRetryableError(errorType);
      } else if (errorType) {
        throw new Error(errorType);
      } else {
        throw err;
      }
    }
  }

  private _handleIncomingSubscriptionMessage(message: MessageEvent) {
    logger(`subscription message from AWS AppSync RealTime: ${message.data}`);
    const { id = "", payload, type } = JSON.parse(message.data);
    const {
      observer = null,
      query = "",
      variables = {},
      startAckTimeoutId = 0,
      subscriptionReadyCallback = null,
      subscriptionFailedCallback = null
    } = this.subscriptionObserverMap.get(id) || {};

    logger({ id, observer, query, variables });

    if (type === MESSAGE_TYPES.GQL_DATA && payload && payload.data) {
      if (observer) {
        observer.next(payload);
      } else {
        logger(`observer not found for id: ${id}`);
      }
      return;
    }

    if (type === MESSAGE_TYPES.GQL_START_ACK) {
      logger(`subscription ready for ${JSON.stringify({ query, variables })}`);
      if (typeof subscriptionReadyCallback === "function") {
        subscriptionReadyCallback();
      }
      clearTimeout(startAckTimeoutId as number);
      if (observer) {
        observer.next({
          data: payload,
          extensions: {
            controlMsgType: "CONNECTED"
          }
        });
      } else {
        logger(`observer not found for id: ${id}`);
      }

      const subscriptionState = SUBSCRIPTION_STATUS.CONNECTED;
      this.subscriptionObserverMap.set(id, {
        observer,
        query,
        variables,
        startAckTimeoutId: null,
        subscriptionState,
        subscriptionReadyCallback,
        subscriptionFailedCallback
      });

      return;
    }

    if (type === MESSAGE_TYPES.GQL_CONNECTION_KEEP_ALIVE) {
      clearTimeout(this.keepAliveTimeoutId);
      this.keepAliveTimeoutId = setTimeout(
        this._errorDisconnect.bind(this, CONTROL_MSG.TIMEOUT_DISCONNECT),
        this.keepAliveTimeout
      );
      return;
    }

    if (type === MESSAGE_TYPES.GQL_ERROR) {
      const subscriptionState = SUBSCRIPTION_STATUS.FAILED;
      this.subscriptionObserverMap.set(id, {
        observer,
        query,
        variables,
        startAckTimeoutId,
        subscriptionReadyCallback,
        subscriptionFailedCallback,
        subscriptionState
      });

      clearTimeout(startAckTimeoutId);

      if (observer) {
        observer.error({
          errors: [
            {
              ...new GraphQLError(`Connection failed: ${JSON.stringify(payload)}`)
            }
          ]
        });
        observer.complete();
      } else {
        logger(`observer not found for id: ${id}`);
      }
      
      if (typeof subscriptionFailedCallback === "function") {
        subscriptionFailedCallback();
      }
    }
  }

  private _errorDisconnect(msg: string) {
    logger(`Disconnect error: ${msg}`);
    this.subscriptionObserverMap.forEach(({ observer }) => {
      if (observer && !observer.closed) {
        observer.error({
          errors: [{ ...new GraphQLError(msg) }],
        });
      }
    });
    this.subscriptionObserverMap.clear();
    if (this.awsRealTimeSocket) {
      this.awsRealTimeSocket.close();
    }

    this.socketStatus = SOCKET_STATUS.CLOSED;
  }

  private _timeoutStartSubscriptionAck(subscriptionId) {
    const { observer, query, variables } =
      this.subscriptionObserverMap.get(subscriptionId) || {};

    if (!observer) {
      return;
    }

    this.subscriptionObserverMap.set(subscriptionId, {
      observer,
      query,
      variables,
      subscriptionState: SUBSCRIPTION_STATUS.FAILED
    });

    if (observer && !observer.closed) {
      observer.error({
        errors: [
          {
            ...new GraphQLError(
              `Subscription timeout ${JSON.stringify({ query, variables })}`
            )
          }
        ]
      });
      // Cleanup will be automatically executed
      observer.complete();
    }
    logger("timeoutStartSubscription", JSON.stringify({ query, variables }));
  }

  static createWebSocket(awsRealTimeUrl: string, protocol: string): WebSocket {
    return new WebSocket(awsRealTimeUrl, protocol);
  }
}
