/*!
 * Copyright 2017-2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * Licensed under the Amazon Software License (the "License"). You may not use this file except in compliance with the License. A copy of
 * the License is located at
 *     http://aws.amazon.com/asl/
 * or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
import { ApolloLink, Observable } from "apollo-link";

import * as Paho from '../vendor/paho-mqtt';

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

export class SubscriptionHandshakeLink extends ApolloLink {

    private subsInfoContextKey: string;

    private topicObservers: Map<string, Set<ZenObservable.Observer<any>>> = new Map();

    private clientObservers: Map<string, ClientObservers> = new Map();

    constructor(subsInfoContextKey) {
        super();
        this.subsInfoContextKey = subsInfoContextKey;
    }

    request(operation) {
        const { [this.subsInfoContextKey]: subsInfo } = operation.getContext();
        const {
            extensions: {
                subscription: { newSubscriptions, mqttConnections }
            }
        }: { extensions: { subscription: SubscriptionExtension } } = subsInfo;

        const newSubscriptionTopics = Object.keys(newSubscriptions).map(subKey => newSubscriptions[subKey].topic);
        const existingTopicsWithObserver = new Set(newSubscriptionTopics.filter(t => this.topicObservers.has(t)));
        const newTopics = new Set(newSubscriptionTopics.filter(t => !existingTopicsWithObserver.has(t)));

        return new Observable(observer => {
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

            this.connectNewClients(newTopicsConnectionInfo, observer);

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
        });
    }

    connectNewClients<T>(connectionInfo: MqttConnectionInfo[], observer: ZenObservable.Observer<T>) {
        return Promise.all(connectionInfo.map(c => this.connectNewClient(c, observer)));
    };

    async connectNewClient<T>(connectionInfo: MqttConnectionInfo, observer: ZenObservable.Observer<T>) {
        const { client: clientId, url, topics } = connectionInfo;
        const client: any = new Paho.Client(url, clientId);

        // client.trace = console.log.bind(null, clientId);
        client.onConnectionLost = ({ errorCode, ...args }) => {
            if (errorCode !== 0) {
                topics.forEach(t => {
                    this.topicObservers.get(t).forEach(observer => observer.error(args));
                });
            }

            topics.forEach(t => this.topicObservers.delete(t));
        };

        (client as any).onMessageArrived = ({ destinationName, payloadString }) => this.onMessage(destinationName, payloadString);

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

    onMessage = (topic, message) => {
        const parsedMessage = JSON.parse(message);
        const observers = this.topicObservers.get(topic);

        observers.forEach(observer => {
            try {
                observer.next(parsedMessage)
            } catch (err) {
                // console.error(err);
            }
        });
    }
}
