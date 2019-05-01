/*!
 * Copyright 2017-2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { ApolloLink, Operation, NextLink, Observable } from "apollo-link";
import { RetryLink } from "apollo-link-retry";
import { getOperationFieldName, passthroughLink } from "../utils";
import { AWSAppsyncGraphQLError } from "../types";
import { ConflictResolver } from "../client";

export default class ConflictResolutionLink extends ApolloLink {

    private conflictResolver: ConflictResolver;
    private maxRetries: number;
    private link: ApolloLink;

    constructor(conflictResolver: ConflictResolver, maxRetries: number = 10) {
        super();

        this.conflictResolver = conflictResolver;
        this.maxRetries = maxRetries;
        this.link = ApolloLink.from([
            new RetryLink({
                delay: { initial: 0, max: 0 },
                attempts: (count, operation, error) => {
                    if (count > this.maxRetries) {
                        return false;
                    }

                    if (this.hasConflictError(error)) {
                        if (typeof this.conflictResolver === 'function') {
                            const { data } = (error as AWSAppsyncGraphQLError);
                            const { query: mutation } = operation;
                            const mutationName = getOperationFieldName(mutation);
                            const operationType = 'mutation';
                            const retries = count;
                            const variables = { ...operation.variables };

                            const newVars = this.conflictResolver({
                                data,
                                mutation,
                                mutationName,
                                operationType,
                                retries,
                                variables,
                            });

                            if (newVars === 'DISCARD') {
                                return false;
                            }

                            if (newVars) {
                                operation.variables = newVars;

                                return true;
                            }
                        }
                    }

                    return false;
                }
            }),
            new ApolloLink((op, fwd) => new Observable(observer => {
                fwd(op).subscribe({
                    next: data => {
                        const err = (data.errors || []).find(this.hasConflictError);

                        if (err) {
                            observer.error(err);
                        } else {
                            observer.next({
                                ...data,
                                context: {
                                    ...data.context,
                                    additionalDataContext: {
                                        newVars: op.variables,
                                    }
                                }
                            });
                        }
                    },
                    error: observer.error.bind(observer),
                    complete: observer.complete.bind(observer),
                });

                return () => null;
            }))
        ]);
    }

    private hasConflictError(error) {
        const hasConflictError = [
            'DynamoDB:ConditionalCheckFailedException'
        ].some(err => err === (error as AWSAppsyncGraphQLError).errorType);

        return hasConflictError;
    }

    request(operation: Operation, forward: NextLink) {
        if (typeof this.conflictResolver !== 'function') {
            return passthroughLink(operation, forward);
        }

        return this.link.request(operation, forward);
    }
}
