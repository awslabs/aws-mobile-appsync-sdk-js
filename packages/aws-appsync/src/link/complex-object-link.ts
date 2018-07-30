/*!
 * Copyright 2017-2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * Licensed under the Amazon Software License (the "License"). You may not use this file except in compliance with the License. A copy of 
 * the License is located at
 *     http://aws.amazon.com/asl/
 * or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY 
 * KIND, express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
import { ApolloError } from 'apollo-client';
import { Observable, Operation } from 'apollo-link';
import { ApolloLink } from 'apollo-link';
import { getOperationDefinition } from 'apollo-utilities';
import { ExecutionResult, GraphQLError } from 'graphql';

import upload from './complex-object-link-uploader';
import { AWSAppsyncGraphQLError } from '../types';

export class ComplexObjectLink extends ApolloLink {
  private link: ApolloLink;

  constructor(credentials) {
    super();

    this.link = complexObjectLink(credentials);
  }

  request(operation, forward) {
    return this.link.request(operation, forward);
  }
}

const replace = (obj, path, newValue) => {
  if (path.length === 1) {
    obj[path] = newValue;
  } else {
    const newPath = path.shift();
    replace(obj[newPath], path, newValue);
  }
};

export const complexObjectLink = credentials => {
  return new ApolloLink((operation, forward) => {
    return new Observable(observer => {
      let handle;

      const { operation: operationType } = getOperationDefinition(
        operation.query,
      );
      const isMutation = operationType === 'mutation';
      const files = isMutation ? findInObject(operation.variables) : {};

      let uploadPromise = Promise.resolve(operation);

      if (Object.keys(files).length > 0) {
        const uploadCredentials =
          typeof credentials === 'function' ? credentials.call() : credentials;

        uploadPromise = Promise.resolve(uploadCredentials)
          .then(credentials =>
            Promise.all(
              Object.keys(files).map(
                async key => await upload(files[key], { credentials }),
              ),
            ),
          )
          .then(() => {
            Object.keys(files).forEach(path => {
              const { bucket, key, region } = files[path];
              replace(operation.variables, path.split('.'), {
                bucket,
                key,
                region,
              });
            });
            return operation;
          })
          .catch(err => {
            const error = new GraphQLError(err.message);
            (error as AWSAppsyncGraphQLError).errorType =
              'AWSAppSyncClient:S3UploadException';

            throw new ApolloError({
              graphQLErrors: [error],
            });
          });
      }

      uploadPromise
        .then(forward)
        .then(observable => {
          handle = observable.subscribe({
            next: observer.next.bind(observer),
            error: observer.error.bind(observer),
            complete: observer.complete.bind(observer),
          });
        })
        .catch(err => {
          observer.error(err);
        });

      return () => {
        if (handle) handle.unsubscribe();
      };
    });
  });
};

const complexObjectFields = [
  { name: 'bucket', type: 'string' },
  { name: 'key', type: 'string' },
  { name: 'region', type: 'string' },
  { name: 'mimeType', type: 'string' },
  { name: 'localUri', type: 'object' },
];

const findInObject = (obj, prefix = undefined, data = {}) => {
  const result = Object.keys(obj).forEach(key => {
    const val = obj[key];

    if (val && typeof val === 'object') {
      const hasFields = complexObjectFields.every(field => {
        const hasValue = val[field.name];
        const types: string[] = Array.isArray(field.type)
          ? field.type
          : [field.type];
        const isOfType =
          hasValue &&
          types.reduce((prev, curr) => {
            return prev || typeof val[field.name] === curr;
          }, false);

        return isOfType;
      });

      if (hasFields) {
        data = { ...data, [prefix ? `${prefix}.${key}` : key]: val };
      } else {
        data = {
          ...data,
          ...findInObject(val, prefix ? `${prefix}.${key}` : key, data),
        };
      }
    }
  });

  return data;
};
