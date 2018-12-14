/*!
 * Copyright 2017-2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * Licensed under the Amazon Software License (the "License"). You may not use this file except in compliance with the License. A copy of
 * the License is located at
 *     http://aws.amazon.com/asl/
 * or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
import { ApolloLink } from "apollo-link";
import { RetryLink } from "apollo-link-retry";
import { OfflineAction } from "@redux-offline/redux-offline/lib/types";
import { graphQLResultHasError } from "apollo-utilities";

const BASE_TIME_MS = 100;
const JITTER_FACTOR = 100;
const MAX_DELAY_MS = 5 * 60 * 1000;

const getDelay = count => ((2 ** count) * BASE_TIME_MS) + (JITTER_FACTOR * Math.random());

export const SKIP_RETRY_KEY = '@@skipRetry';
export const PERMANENT_ERROR_KEY = typeof Symbol !== 'undefined' ? Symbol('permanentError') : '@@permanentError';

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
