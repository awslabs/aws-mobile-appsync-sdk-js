/*!
 * Copyright 2017-2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { ApolloLink } from "apollo-link";
import { RetryLink } from "apollo-link-retry";
import { OfflineAction } from "@redux-offline/redux-offline/lib/types";
import { graphQLResultHasError } from "apollo-utilities";

export const PERMANENT_ERROR_KEY = typeof Symbol !== 'undefined' ? Symbol('permanentError') : '@@permanentError';
const BASE_TIME_MS = 100;
const JITTER_FACTOR = 100;
const MAX_DELAY_MS = 5 * 60 * 1000;

const getDelay = count => ((2 ** count) * BASE_TIME_MS) + (JITTER_FACTOR * Math.random());

export const SKIP_RETRY_KEY = '@@skipRetry';

export const getEffectDelay = (_action: OfflineAction, retries: number) => {
    const delay = getDelay(retries);

    return delay <= MAX_DELAY_MS ? delay : null;
};

export const createRetryLink = (origLink: ApolloLink) => {
    let delay;

    const retryLink = new RetryLink({
        attempts: (count, operation, error) => {
            const { [PERMANENT_ERROR_KEY]: permanent = false } = error;
            const { [SKIP_RETRY_KEY]: skipRetry = false } = operation.variables;

            if (permanent) {
                return false;
            }

            if (error.statusCode >= 400 && error.statusCode < 500) {
                return false;
            }

            if (graphQLResultHasError({ errors: error ? error.graphQLErrors : [] })) {
                return false;
            }

            if (skipRetry) {
                return false;
            }

            delay = getDelay(count);

            return delay <= MAX_DELAY_MS;
        },
        delay: (_count, _operation, _error) => delay,
    });

    const link = ApolloLink.from([
        retryLink,
        origLink,
    ]);

    return new ApolloLink((operation, forward) => {
        const { [SKIP_RETRY_KEY]: skipRetry = false, ...otherVars } = operation.variables;

        if (skipRetry) {
            operation.variables = otherVars;
        }

        return link.request(operation, forward);
    });
};
