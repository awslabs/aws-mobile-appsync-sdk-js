/*!
 * Copyright 2017-2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { createHttpLink, HttpOptions } from '@apollo/client';
import { NonTerminatingLink } from './non-terminating-link';

export class NonTerminatingHttpLink extends NonTerminatingLink {
    constructor(contextKey: string, options: HttpOptions) {
        const link = createHttpLink(options);

        super(contextKey, { link });
    }
}
