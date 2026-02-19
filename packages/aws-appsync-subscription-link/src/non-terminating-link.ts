/*!
 * Copyright 2017-2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { ApolloLink } from '@apollo/client/core';
import type { FetchResult } from '@apollo/client/core';
import { setContext } from '@apollo/client/link/context';
import type { Observable } from 'rxjs';

export class NonTerminatingLink extends ApolloLink {

    private contextKey: string;
    private link: ApolloLink;

    constructor(contextKey: string, { link }: { link: ApolloLink }) {
        super();

        this.contextKey = contextKey;
        this.link = link;
    }

    request(operation, forward?: ApolloLink.ForwardFunction): Observable<FetchResult> {
        return (setContext(async (_request, prevContext) => {
            const result = await new Promise((resolve, reject) => {
                this.link.request(operation, forward).subscribe({
                    next: resolve,
                    error: reject,
                });
            });

            return {
                ...prevContext,
                [this.contextKey]: result,
            }
        })).request(operation, forward);
    }
}
