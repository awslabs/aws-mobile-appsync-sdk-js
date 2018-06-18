/*!
 * Copyright 2017-2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * Licensed under the Amazon Software License (the "License"). You may not use this file except in compliance with the License. A copy of
 * the License is located at
 *     http://aws.amazon.com/asl/
 * or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
import { ApolloLink, Observable } from "apollo-link";

import * as Paho from '../vendor/paho-mqtt';

const { Client } = Paho;

export class SubscriptionHandshakeLink extends ApolloLink {

    /**
     * @type {string}
     */
    subsInfoContextKey;

    /**
     * @type {Map<Paho.Client, [string]>}
     */
    clientTopics = new Map();

    /**
     * @type {Map<string, Observer>}
     */
    topicObserver = new Map();

    constructor(subsInfoContextKey) {
        super();
        this.subsInfoContextKey = subsInfoContextKey;
    }

    request = (operation) => {
        const { [this.subsInfoContextKey]: subsInfo } = operation.getContext();
        const {
            extensions: {
                subscription: { newSubscriptions, mqttConnections }
            }
        } = subsInfo;

        const newTopics = Object.keys(newSubscriptions).map(subKey => newSubscriptions[subKey].topic);
        const prevTopicsSet = new Set(this.topicObserver.keys());
        const newTopicsSet = new Set(newTopics);
        const lastTopicObserver = new Map(this.topicObserver);

        const connectionsInfo = mqttConnections.map(connInfo => {
            const connTopics = connInfo.topics;

            const topicsForClient = new Set([
                ...connTopics.filter(x => prevTopicsSet.has(x)),
                ...connTopics.filter(x => newTopicsSet.has(x)),
            ]);

            return {
                ...connInfo,
                topics: Array.from(topicsForClient.values())
            };
        }).filter(connInfo => connInfo.topics.length);

        return new Observable(observer => {
            Promise.resolve()
                // Disconnect existing clients, wait for them to disconnect
                .then(this.disconnectAll)
                // Connect to all topics
                .then(this.connectAll.bind(this, observer, connectionsInfo, lastTopicObserver));

            return () => {
                const [topic,] = Array.from(this.topicObserver).find(([topic, obs]) => obs === observer) || [];

                const [client,] = Array.from(this.clientTopics).find(([client, t]) => t.indexOf(topic) > -1) || [];

                if (client && topic) {
                    this.unsubscribeFromTopic(client, topic).then(() => {
                        const activeTopics = this.clientTopics.get(client) || [];

                        if (!activeTopics.length) {
                            this.disconnectClient(client, activeTopics);
                        }
                    });
                }
            };
        });
    }

    /**
     * @returns  {Promise<void>}
     */
    disconnectAll = () => {
        const disconnectPromises = Array.from(this.clientTopics)
            .map(([client, topics]) => this.disconnectClient(client, topics));

        return Promise.all(disconnectPromises).then(() => undefined);
    }

    unsubscribeFromTopic = (client, topic) => {
        return new Promise((resolve, reject) => {
            if (!client.isConnected()) {
                const topics = this.clientTopics.get(client).filter(t => t !== topic);
                this.clientTopics.set(client, topics);
                this.topicObserver.delete(topic);
                return resolve(topic);
            }

            client.unsubscribe(topic, {
                onSuccess: () => {
                    const topics = this.clientTopics.get(client).filter(t => t !== topic);
                    this.clientTopics.set(client, topics);
                    this.topicObserver.delete(topic);
                    resolve(topic);
                },
                onFailure: reject,
            });
        })
    }

    /**
     *
     * @param {Paho.Client} client
     * @param {Set<string>} topics
     */
    disconnectClient = (client, topics) => {
        // console.log(`Unsubscribing from ${topics.length} topics`, topics);

        const unsubPromises = [];
        topics.forEach(topic => {
            unsubPromises.push(this.unsubscribeFromTopic(client, topic));
        });

        return Promise.all(unsubPromises).then(([...topics]) => {
            // console.log(`Unsubscribed from ${topics.length} topics`, topics);

            return new Promise((resolve, reject) => {
                if (!client.isConnected()) {
                    return resolve({ client, topics });
                }

                client.onConnectionLost = () => resolve({ client, topics });

                client.disconnect();
            });
        });
    }

    /**
     *
     * @param {ZenObservable.Observer} observer
     * @param {[any]} connectionsInfo
     * @returns {Promise<void>}
     */
    connectAll = (observer, connectionsInfo = [], lastTopicObserver) => {
        const connectPromises = connectionsInfo.map(this.connect.bind(this, observer, lastTopicObserver));

        return Promise.all(connectPromises).then(() => undefined);
    }

    connect = (observer, lastTopicObserver, connectionInfo) => {
        const { topics, client: clientId, url } = connectionInfo;

        const client = new Paho.Client(url, clientId);
        // client.trace = console.log.bind(null, clientId);

        client.onMessageArrived = ({ destinationName, payloadString }) => this.onMessage(destinationName, payloadString);

        return new Promise((resolve, reject) => {
            client.connect({
                useSSL: url.indexOf('wss://') === 0,
                mqttVersion: 3,
                onSuccess: () => resolve(client),
                onFailure: reject,
            });
        }).then(client => {
            // console.log(`Doing setup for ${topics.length} topics`, topics);

            const subPromises = topics.map(topic => new Promise((resolve, reject) => {
                client.subscribe(topic, {
                    onSuccess: () => {
                        if (!this.topicObserver.has(topic)) {
                            this.topicObserver.set(topic, lastTopicObserver.get(topic) || observer);
                        }

                        resolve(topic);
                    },
                    onFailure: reject,
                });
            }));

            return Promise.all(subPromises).then(([...topics]) => {
                // console.log('All topics subscribed', topics);

                this.clientTopics.set(client, topics);

                return { client, topics };
            });
        });
    }

    onMessage = (topic, message) => {
        const parsedMessage = JSON.parse(message);
        const observer = this.topicObserver.get(topic);

        // console.log(topic, parsedMessage);

        try {
            observer.next(parsedMessage);
        } catch (err) {
            // console.error(err);
        }
    }
}
