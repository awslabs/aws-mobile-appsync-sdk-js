/*!
 * Copyright 2017-2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { GraphQLError } from "graphql";

interface AWSAppsyncGraphQLError extends GraphQLError {
    errorType: string;
    data?: object;
}

export {
    AWSAppsyncGraphQLError
}
