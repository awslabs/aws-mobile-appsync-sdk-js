/*!
 * Copyright 2017-2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * Licensed under the Amazon Software License (the "License"). You may not use this file except in compliance with the License. A copy of 
 * the License is located at
 *     http://aws.amazon.com/asl/
 * or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY 
 * KIND, express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
import * as React from "react";
import { View, Text, StyleSheet, NetInfo, ViewPropTypes } from "react-native";
import * as PropTypes from 'prop-types';

import AWSAppSyncClient from 'aws-appsync';

export interface RehydrateProps {
    rehydrated: boolean;
    children: React.ReactNode;
    style: any;
}

const Rehydrate = (props: RehydrateProps) => (
    <View style={[styles.container, props.style || {}]} >
        {props.rehydrated ? props.children : <Text>Loading...</Text>}
    </View>
);

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});

interface RehydratedState {
    rehydrated: boolean
}

export interface RehydratedProps {
    render?: ((props: { rehydrated: boolean }) => React.ReactNode);
    children?: React.ReactChildren;
    loading?: React.ComponentType<any>;
    style?: any;
}

export default class Rehydrated extends React.Component<RehydratedProps, RehydratedState> {

    static contextTypes = {
        client: PropTypes.instanceOf(AWSAppSyncClient).isRequired,
    };

    static propTypes = {
        render: PropTypes.func,
        children: PropTypes.node,
        loading: PropTypes.node,
        style: ViewPropTypes ? ViewPropTypes.style : View.propTypes.style,
    };

    constructor(props, context) {
        super(props, context);

        this.state = {
            rehydrated: false
        };
    }

    async componentWillMount() {
        await this.context.client.hydrated();
        await NetInfo.isConnected.fetch();

        this.setState({
            rehydrated: true
        });
    }

    render() {
        const { render, children, loading, style } = this.props;
        const { rehydrated } = this.state;

        if (render) return render({ rehydrated });

        if (children) {
            if (loading) return rehydrated ? children : loading;

            return (
                <Rehydrate rehydrated={rehydrated} style={style} >
                    {children}
                </Rehydrate>
            );
        }
    }
}
