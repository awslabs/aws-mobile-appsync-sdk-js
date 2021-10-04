/*!
 * Copyright 2017-2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Upload } from "@aws-sdk/lib-storage";
import { S3Client, S3 } from "@aws-sdk/client-s3";

export default (fileField, { credentials}): Promise<{}> => {
    const {
        bucket: Bucket,
        key: Key,
        region,
        mimeType: ContentType,
        localUri: Body,
    } = fileField;

  const target = { Bucket, Key, Body, ContentType };
  
  const parallelUploads3 = new Upload({
    client: new S3({ credentials, region }) || new S3Client({ credentials, region }),
    leavePartsOnError: false, // optional manually handle dropped parts
    params: target,
  });

  return parallelUploads3.done();
};
