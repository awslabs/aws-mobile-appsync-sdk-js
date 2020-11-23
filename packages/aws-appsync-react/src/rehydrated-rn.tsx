/*!
 * Copyright 2017-2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as React from "react";
import { View, Text, StyleSheet, ViewPropTypes } from "react-native";
import NetInfo from '@react-native-community/netinfo';
import * as PropTypes from 'prop-types';

import AWSAppSyncClient from 'aws-appsync';
import { RehydratedState } from './index'

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

export interface RehydratedProps {
    render?: ((props: { rehydrated: boolean }) => React.ReactNode);
    children?: React.ReactNode;
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

    async componentDidMount() {
        await this.context.client.hydrated();
        await NetInfo.fetch();

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
