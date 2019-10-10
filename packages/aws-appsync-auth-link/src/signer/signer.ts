/*
Copyright 2017 - 2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.
Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance with the License. A copy of the License is located at
    http://aws.amazon.com/apache2.0/
or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and limitations under the License.
*/
global.Buffer = global.Buffer || require('buffer').Buffer; // Required for aws sigv4 signing

var url = require('url'),
    crypto = require('aws-sdk/global').util.crypto;

var encrypt = function (key, src, encoding = '') {
    return crypto.lib.createHmac('sha256', key).update(src, 'utf8').digest(encoding);
};

var hash = function (src) {
    src = src || '';
    return crypto.createHash('sha256').update(src, 'utf8').digest('hex');
};

/**
* @private
* Create canonical headers
*
<pre>
CanonicalHeaders =
    CanonicalHeadersEntry0 + CanonicalHeadersEntry1 + ... + CanonicalHeadersEntryN
CanonicalHeadersEntry =
    Lowercase(HeaderName) + ':' + Trimall(HeaderValue) + '\n'
</pre>
*/
var canonical_headers = function (headers) {
    if (!headers || Object.keys(headers).length === 0) { return ''; }

    return Object.keys(headers)
        .map(function (key) {
            return {
                key: key.toLowerCase(),
                value: headers[key] ? headers[key].trim().replace(/\s+/g, ' ') : ''
            };
        })
        .sort(function (a, b) {
            return a.key < b.key ? -1 : 1;
        })
        .map(function (item) {
            return item.key + ':' + item.value;
        })
        .join('\n') + '\n';
};

/**
* List of header keys included in the canonical headers.
* @access private
*/
var signed_headers = function (headers) {
    return Object.keys(headers)
        .map(function (key) { return key.toLowerCase(); })
        .sort()
        .join(';');
};

/**
* @private
* Create canonical request
* Refer to {@link http://docs.aws.amazon.com/general/latest/gr/sigv4-create-canonical-request.html|Create a Canonical Request}
*
<pre>
CanonicalRequest =
    HTTPRequestMethod + '\n' +
    CanonicalURI + '\n' +
    CanonicalQueryString + '\n' +
    CanonicalHeaders + '\n' +
    SignedHeaders + '\n' +
    HexEncode(Hash(RequestPayload))
</pre>
*/
var canonical_request = function (request) {
    var url_info = url.parse(request.url);

    return [
        request.method || '/',
        url_info.path,
        url_info.query,
        canonical_headers(request.headers),
        signed_headers(request.headers),
        hash(request.body)
    ].join('\n');
};

var parse_service_info = function (request) {
    var url_info = url.parse(request.url),
        host = url_info.host;

    var matched = host.match(/([^.]+)\.(?:([^.]*)\.)?amazonaws\.com$/),
        parsed = (matched || []).slice(1, 3);

    if (parsed[1] === 'es') { // Elastic Search
        parsed = parsed.reverse();
    }

    return {
        service: request.service || parsed[0],
        region: request.region || parsed[1]
    };
};

var credential_scope = function (d_str, region, service) {
    return [
        d_str,
        region,
        service,
        'aws4_request',
    ].join('/');
};

/**
* @private
* Create a string to sign
* Refer to {@link http://docs.aws.amazon.com/general/latest/gr/sigv4-create-string-to-sign.html|Create String to Sign}
*
<pre>
StringToSign =
    Algorithm + \n +
    RequestDateTime + \n +
    CredentialScope + \n +
    HashedCanonicalRequest
</pre>
*/
var string_to_sign = function (algorithm, canonical_request, dt_str, scope) {
    return [
        algorithm,
        dt_str,
        scope,
        hash(canonical_request)
    ].join('\n');
};

/**
* @private
* Create signing key
* Refer to {@link http://docs.aws.amazon.com/general/latest/gr/sigv4-calculate-signature.html|Calculate Signature}
*
<pre>
kSecret = your secret access key
kDate = HMAC("AWS4" + kSecret, Date)
kRegion = HMAC(kDate, Region)
kService = HMAC(kRegion, Service)
kSigning = HMAC(kService, "aws4_request")
</pre>
*/
var get_signing_key = function (secret_key = '', d_str, service_info) {
    var k = ('AWS4' + secret_key),
        k_date = encrypt(k, d_str),
        k_region = encrypt(k_date, service_info.region),
        k_service = encrypt(k_region, service_info.service),
        k_signing = encrypt(k_service, 'aws4_request');

    return k_signing;
};

var get_signature = function (signing_key, str_to_sign) {
    return encrypt(signing_key, str_to_sign, 'hex');
};

/**
* @private
* Create authorization header
* Refer to {@link http://docs.aws.amazon.com/general/latest/gr/sigv4-add-signature-to-request.html|Add the Signing Information}
*/
var get_authorization_header = function (algorithm, access_key = '', scope, signed_headers, signature) {
    return [
        algorithm + ' ' + 'Credential=' + access_key + '/' + scope,
        'SignedHeaders=' + signed_headers,
        'Signature=' + signature
    ].join(', ');
};

/**
* Sign a HTTP request, add 'Authorization' header to request param
* @method sign
* @memberof Signer
* @static
*
* @param {object} request - HTTP request object
<pre>
request: {
    method: GET | POST | PUT ...
    url: ...,
    headers: {
        header1: ...
    },
    body: data
}
</pre>
* @param {object} access_info - AWS access credential info
<pre>
access_info: {
    access_key: ...,
    secret_key: ...,
    session_token: ...
}
</pre>
* @param {object} [service_info] - AWS service type and region, optional,
*                                  if not provided then parse out from url
<pre>
service_info: {
    service: ...,
    region: ...
}
</pre>
*
* @returns {object} Signed HTTP request
*/
var sign = function (request, access_info, service_info = null) {
    request.headers = request.headers || {};

    // datetime string and date string
    var dt = new Date(),
        dt_str = dt.toISOString().replace(/[:-]|\.\d{3}/g, ''),
        d_str = dt_str.substr(0, 8),
        algorithm = 'AWS4-HMAC-SHA256';

    var url_info = url.parse(request.url)
    request.headers['host'] = url_info.host;
    request.headers['x-amz-date'] = dt_str;
    if (access_info.session_token) {
        request.headers['X-Amz-Security-Token'] = access_info.session_token;
    }

    // Task 1: Create a Canonical Request
    var request_str = canonical_request(request);

    // Task 2: Create a String to Sign
    service_info = service_info || parse_service_info(request);
    var scope = credential_scope(
        d_str,
        service_info.region,
        service_info.service
    );
    var str_to_sign = string_to_sign(
        algorithm,
        request_str,
        dt_str,
        scope
    );

    // Task 3: Calculate the Signature
    var signing_key = get_signing_key(
        access_info.secret_key,
        d_str,
        service_info
    ),
        signature = get_signature(signing_key, str_to_sign);

    // Task 4: Adding the Signing information to the Request
    var authorization_header = get_authorization_header(
        algorithm,
        access_info.access_key,
        scope,
        signed_headers(request.headers),
        signature
    );
    request.headers['Authorization'] = authorization_header;

    return request;
};

/**
* AWS request signer.
* Refer to {@link http://docs.aws.amazon.com/general/latest/gr/sigv4_signing.html|Signature Version 4}
*
* @class Signer
*/
class Signer {
    static sign = sign;
}

export default Signer;
export { Signer };
