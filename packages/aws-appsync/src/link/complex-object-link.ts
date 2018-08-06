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
import { getOperationDefinition } from "apollo-utilities";
import { ExecutionResult, GraphQLError } from 'graphql';

import upload from "./complex-object-link-uploader";
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
export const complexObjectLink = (credentials) => {
    return new ApolloLink((operation, forward) => {
        return new Observable(observer => {
            let handle;
            const { operation: operationType } = getOperationDefinition(operation.query);
            const isMutation = operationType === 'mutation';
            const _a = isMutation ? findInObject(operation.variables) : [];
            let uploadPromise = Promise.resolve(operation);

            if (Object.keys(_a).length > 0) {
                const uploadCredentials = typeof credentials === 'function' ? credentials.call() : credentials;
              
                let fileFieldKey;
                const _uploadFiles = function (obj) {
                    Object.keys(obj).find(function (indexKey: any) {
                        let fileField = obj[indexKey];
                        if (fileField && typeof fileField === 'object') {
                            if(Array.isArray(fileField)){
                                fileFieldKey = indexKey;
                                _uploadFiles(fileField)
                                return false
                            }
                            uploadPromise = Promise.resolve(uploadCredentials).then(credentials => upload(fileField, { credentials }).then(() => {
                                    const { bucket, key, region } = fileField;
                                    if(obj instanceof Array){
                                        operation.variables[fileFieldKey][indexKey] = { bucket: bucket, key: key, region: region };
                                    }else{
                                        operation.variables[indexKey] = { bucket: bucket, key: key, region: region };
                                    }
                              
                                    return operation;
                                }).catch(err => {                
                                    const error = new GraphQLError(err.message);
                                     (error as AWSAppsyncGraphQLError).errorType = 'AWSAppSyncClient:S3UploadException'

                                    throw new ApolloError({
                                        graphQLErrors: [error],
                                    });
                                })
                            );
                        }
                    });
                }
                _uploadFiles(_a);
            }
            uploadPromise
                .then(forward)
                .then(observable => {
                    handle = observable.subscribe({
                        next: observer.next.bind(observer),
                        error: observer.error.bind(observer),
                        complete: observer.complete.bind(observer),
                    });
                }).catch(err => {
                    observer.error(err);
                });
            return () => {
                if (handle) handle.unsubscribe();
            };
        });
    });
}
const complexObjectFields = [
    { name: 'bucket', type: 'string' },
    { name: 'key', type: 'string' },
    { name: 'region', type: 'string' },
    { name: 'mimeType', type: 'string' },
    { name: 'localUri', type: 'object' },
];
const findInObject = function (obj) {
    let s3Files = {}
    let which;
    let prevKey;
    const _findInObject = function (obj) {
        let s3Obj = [];
        return Object.keys(obj).find(function (key: any) {
            let val = obj[key];
            if (val && typeof val === 'object') {
                const hasFields = complexObjectFields.every(function (field) {
                    const hasValue = val[field.name];
                    const types: string[] = Array.isArray(field.type) ? field.type : [field.type];
                    const isOfType = hasValue && types.reduce(function (prev, curr) {
                        return prev || typeof val[field.name] === curr;
                    }, false);
                    return isOfType;
                });
                if (hasFields) {
                    which = val;
                    if(obj instanceof Array){
                        s3Obj[key] = which;
                        s3Files[prevKey] = s3Obj;                        
                    }else{
                        s3Files[key] = which;
                    }
                    return false;
                }
                prevKey = key;                
                _findInObject(val);
            }
            return false;
        });
    };
    _findInObject(obj);
    return s3Files;
};