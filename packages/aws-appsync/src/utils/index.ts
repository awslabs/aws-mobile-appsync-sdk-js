/*!
 * Copyright 2017-2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { DocumentNode, OperationDefinitionNode, FieldNode } from "graphql";
import { resultKeyNameFromField } from "apollo-utilities";
import { Observable } from "apollo-link";
import { Sha256 } from '@aws-crypto/sha256-universal';

export const passthroughLink = (op, forward) => (forward ? forward(op) : Observable.of());

export const isUuid = val => typeof val === 'string' && val.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);

export const getOperationFieldName = (operation: DocumentNode): string => resultKeyNameFromField(
    (operation.definitions[0] as OperationDefinitionNode).selectionSet.selections[0] as FieldNode
);

export const hash = (src: any) => {
    src = src || {};
    const hash = new Sha256();
    hash.update(src, 'utf8');
    const result = hash.digestSync() as unknown as string;
    return result;
};

export { default as rootLogger } from './logger';
