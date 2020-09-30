/*!
 * Copyright 2017-2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { ApolloLink, Observable, Operation, FetchResult, ApolloError } from "@apollo/client";

import { rootLogger } from "./utils";
import * as Paho from './vendor/paho-mqtt';
import { FieldNode } from "graphql";
import { getMainDefinition } from "apollo-utilities";

const logger = rootLogger.extend('subscriptions');
const mqttLogger = logger.extend('mqtt');

type SubscriptionExtension = {
    mqttConnections: MqttConnectionInfo[],
    newSubscriptions: NewSubscriptions,
}

type MqttConnectionInfo = {
    client: string,
    url: string,
    topics: string[],
};

type NewSubscriptions = {
    [key: string]: {
        topic: string,
        expireTime: number,
    }
};

type ClientObservers = {
    client: any,
    observers: Set<ZenObservable.Observer<any>>,
}

export const CONTROL_EVENTS_KEY = '@@controlEvents';

export class SubscriptionHandshakeLink extends ApolloLink {

    private subsInfoContextKey: string;

    private topicObservers: Map<string, Set<ZenObservable.Observer<any>>> = new Map();

    private clientObservers: Map<string, ClientObservers> = new Map();

    constructor(subsInfoContextKey) {
        super();
        this.subsInfoContextKey = subsInfoContextKey;
    }

    request(operation: Operation) {
        const {
            [this.subsInfoContextKey]: subsInfo,
            controlMessages: { [CONTROL_EVENTS_KEY]: controlEvents } = { [CONTROL_EVENTS_KEY]: undefined }
        } = operation.getContext();
        const {
            extensions: {
                subscription: { newSubscriptions, mqttConnections }
            } = { subscription: { newSubscriptions: {}, mqttConnections: [] } },
            errors = [],
        }: {
            extensions?: {
                subscription: SubscriptionExtension
            },
            errors: any[]
        } = subsInfo;

        if (errors && errors.length) {
            return new Observable(observer => {
                observer.error(new ApolloError({
                    errorMessage: 'Error during subscription handshake',
                    extraInfo: { errors },
                    graphQLErrors: errors
                }));

                return () => { };
            });
        }

        const newSubscriptionTopics = Object.keys(newSubscriptions).map(subKey => newSubscriptions[subKey].topic);
        const existingTopicsWithObserver = new Set(newSubscriptionTopics.filter(t => this.topicObservers.has(t)));
        const newTopics = new Set(newSubscriptionTopics.filter(t => !existingTopicsWithObserver.has(t)));

        return new Observable<FetchResult>(observer => {
            existingTopicsWithObserver.forEach(t => {
                this.topicObservers.get(t).add(observer);
                const anObserver = Array.from(this.topicObservers.get(t)).find(() => true);

                const [clientId] = Array.from(this.clientObservers).find(([, { observers }]) => observers.has(anObserver));
                this.clientObservers.get(clientId).observers.add(observer);
            });

            const newTopicsConnectionInfo = mqttConnections
                .filter(c => c.topics.some(t => newTopics.has(t)))
                .map(({ topics, ...rest }) => ({
                    ...rest,
                    topics: topics.filter(t => newTopics.has(t))
                } as MqttConnectionInfo));

            this.connectNewClients(newTopicsConnectionInfo, observer, operation);

            return () => {
                const clientsForCurrentObserver = Array.from(this.clientObservers).filter(([, { observers }]) => observers.has(observer));
                clientsForCurrentObserver.forEach(([clientId]) => this.clientObservers.get(clientId).observers.delete(observer));

                this.clientObservers.forEach(({ observers, client }) => {
                    if (observers.size === 0) {
                        if (client.isConnected()) {
                            client.disconnect();
                        }
                        this.clientObservers.delete(client.clientId);
                    }
                });
                this.clientObservers = new Map(
                    Array.from(this.clientObservers).filter(([, { observers }]) => observers.size > 0)
                );

                this.topicObservers.forEach(observers => observers.delete(observer));

                this.topicObservers = new Map(
                    Array.from(this.topicObservers)
                        .filter(([, observers]) => observers.size > 0)
                );
            };
        }).filter(data => {
            const { extensions: { controlMsgType = undefined } = {} } = data;
            const isControlMsg = typeof controlMsgType !== 'undefined';

            return controlEvents === true || !isControlMsg;
        });
    }

    async connectNewClients(connectionInfo: MqttConnectionInfo[], observer: ZenObservable.Observer<FetchResult>, operation: Operation) {
        const { query } = operation;
        const selectionNames = (getMainDefinition(query).selectionSet.selections as FieldNode[]).map(({ name: { value } }) => value);

        const result = Promise.all(connectionInfo.map(c => this.connectNewClient(c, observer, selectionNames)));

        const data = selectionNames.reduce(
            (acc, name) => (acc[name] = acc[name] || null, acc),
            {}
        );

        observer.next({
            data,
            extensions: {
                controlMsgType: 'CONNECTED',
                controlMsgInfo: {
                    connectionInfo,
                },
            }
        });

        return result
    };

    async connectNewClient(connectionInfo: MqttConnectionInfo, observer: ZenObservable.Observer<FetchResult>, selectionNames: string[]) {
        const { client: clientId, url, topics } = connectionInfo;
        const client: any = new Paho.Client(url, clientId);

        client.trace = mqttLogger.bind(null, clientId);
        client.onConnectionLost = ({ errorCode, ...args }) => {
            if (errorCode !== 0) {
                topics.forEach(t => {
                    if (this.topicObservers.has(t)) {
                        this.topicObservers.get(t).forEach(observer => observer.error({ ...args, permanent: true }));
                    }
                });
            }

            topics.forEach(t => this.topicObservers.delete(t));
        };

        (client as any).onMessageArrived = ({ destinationName, payloadString }) => this.onMessage(destinationName, payloadString, selectionNames);

        await new Promise((resolve, reject) => {
            client.connect({
                useSSL: url.indexOf('wss://') === 0,
                mqttVersion: 3,
                onSuccess: () => resolve(client),
                onFailure: reject,
            });
        });

        await this.subscribeToTopics(client, topics, observer);

        return client;
    }

    subscribeToTopics<T>(client, topics: string[], observer: ZenObservable.Observer<T>) {
        return Promise.all(topics.map(topic => this.subscribeToTopic(client, topic, observer)));
    }

    subscribeToTopic<T>(client, topic: string, observer: ZenObservable.Observer<T>) {
        return new Promise((resolve, reject) => {
            (client as any).subscribe(topic, {
                onSuccess: () => {
                    if (!this.topicObservers.has(topic)) {
                        this.topicObservers.set(topic, new Set());
                    }
                    if (!this.clientObservers.has(client.clientId)) {
                        this.clientObservers.set(client.clientId, { client, observers: new Set() });
                    }

                    this.topicObservers.get(topic).add(observer);
                    this.clientObservers.get(client.clientId).observers.add(observer);

                    resolve(topic);
                },
                onFailure: reject,
            });
        });
    }

    onMessage = (topic: string, message: string, selectionNames: string[]) => {
        const parsedMessage = JSON.parse(message);
        const observers = this.topicObservers.get(topic);

        const data = selectionNames.reduce(
            (acc, name) => (acc[name] = acc[name] || null, acc),
            parsedMessage.data || {}
        );

        logger('Message received', { data, topic, observers });

        observers.forEach(observer => {
            try {
                observer.next({
                    ...parsedMessage,
                    ...{ data },
                })
            } catch (err) {
                logger(err);
            }
        });
    }
}
