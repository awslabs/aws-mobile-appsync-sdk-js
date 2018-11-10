/*!
 * Copyright 2017-2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * Licensed under the Amazon Software License (the "License"). You may not use this file except in compliance with the License. A copy of 
 * the License is located at
 *     http://aws.amazon.com/asl/
 * or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY 
 * KIND, express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
import { ApolloLink } from 'apollo-link';
import { setContext } from 'apollo-link-context';

export class NonTerminatingLink extends ApolloLink {

    private contextKey: string;
    private link: ApolloLink;

    constructor(contextKey: string, { link }: { link: ApolloLink }) {
        super();

        this.contextKey = contextKey;
        this.link = link;
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
