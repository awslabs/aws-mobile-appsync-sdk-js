/*!
 * Copyright 2017-2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as S3 from 'aws-sdk/clients/s3';

export default (fileField, { credentials }) => {
    const {
        bucket: Bucket,
        key: Key,
        region,
        mimeType: ContentType,
        localUri: Body,
    } = fileField;

    const s3 = new S3({
        credentials,
        region,
    });

    return s3.upload({
        Bucket,
        Key,
        Body,
        ContentType,
    }).promise();
};
