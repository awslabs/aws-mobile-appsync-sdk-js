/*!
 * Copyright 2017-2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import AWSAppSyncClient from "./client";
export * from "./client";
export { Signer } from 'aws-appsync-auth-link';
export * from './helpers/offline';

export default AWSAppSyncClient;
