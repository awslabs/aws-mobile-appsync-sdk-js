/*!
 * Copyright 2017-2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * Licensed under the Amazon Software License (the "License"). You may not use this file except in compliance with the License. A copy of 
 * the License is located at
 *     http://aws.amazon.com/asl/
 * or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY 
 * KIND, express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
import * as React from 'react';
import * as PropTypes from 'prop-types';

import AWSAppSyncClient from 'aws-appsync';

export interface RehydrateProps {
    rehydrated: boolean;
    children: any,
}

const Rehydrate = (props: RehydrateProps) => (
    <div className={`awsappsync ${props.rehydrated ? 'awsappsync--rehydrated' : 'awsappsync--rehydrating'}`}>
        {props.rehydrated ? props.children : <span>Loading...</span>}
    </div>
);

interface RehydratedState {
    rehydrated: boolean
}

export default class Rehydrated extends React.Component<void, RehydratedState> {

    static contextTypes = {
        client: PropTypes.instanceOf(AWSAppSyncClient).isRequired,
    };

    constructor(props, context) {
        super(props, context);

        this.state = {
            rehydrated: false
        };
    }

    async componentWillMount() {
        await this.context.client.hydrated();

        this.setState({
            rehydrated: true
        });
    }

    render() {
        return (
            <Rehydrate rehydrated={this.state.rehydrated}>
                {this.props.children}
            </Rehydrate>
        );
    }
}
