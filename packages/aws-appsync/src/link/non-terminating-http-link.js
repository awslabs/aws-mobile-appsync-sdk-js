/*!
 * Copyright 2017-2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * Licensed under the Amazon Software License (the "License"). You may not use this file except in compliance with the License. A copy of 
 * the License is located at
 *     http://aws.amazon.com/asl/
 * or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY 
 * KIND, express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
import { ApolloLink, Observable } from 'apollo-link';
import { setContext } from 'apollo-link-context';
import { createHttpLink } from 'apollo-link-http';

export class NonTerminatingHttpLink extends ApolloLink {

    contextKey;
    /** @type {ApolloLink} */
    link;

    constructor(contextKey, options) {
        super();
        this.contextKey = contextKey;
        this.link = createHttpLink(options);
    }

    request(operation, forward) {
        return setContext(async (request, prevContext) => {
            const result = await new Promise((resolve, reject) => {
                this.link.request(operation).subscribe({
                    next: resolve,
                    error: reject,
                });
            });

            return {
                ...prevContext,
                [this.contextKey]: result,
            }
        }).request(operation, forward);
    }
}
