/*!
 * Copyright 2017-2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { createHttpLink, FetchOptions } from 'apollo-link-http';
import { NonTerminatingLink } from './non-terminating-link';

export class NonTerminatingHttpLink extends NonTerminatingLink {
    constructor(contextKey: string, options: FetchOptions) {
        const link = createHttpLink(options);

        super(contextKey, { link });
    }
}
