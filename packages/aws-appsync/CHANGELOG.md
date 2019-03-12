# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

<a name="1.7.2"></a>
## [1.7.2](https://github.com/awslabs/aws-mobile-appsync-sdk-js/compare/aws-appsync@1.7.1...aws-appsync@1.7.2) (2019-03-12)


### Bug Fixes

* **auth:** Remove temporary variables (starting with '@@') before signing ([#347](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/347)) ([920b47d](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/920b47d)), closes [#354](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/354)
* **deltaSync:** Make sure query manager is initialized ([13a2dec](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/13a2dec)), closes [#893237](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/893237)




<a name="1.7.1"></a>
## [1.7.1](https://github.com/awslabs/aws-mobile-appsync-sdk-js/compare/aws-appsync@1.7.0...aws-appsync@1.7.1) (2019-01-11)


### Bug Fixes

* **deltasync:** Fix error when baseQuery is not specified ([#320](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/320)) ([8dbe01d](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/8dbe01d))
* **offline-helpers:** Offline helpers types and fix issue with different options ([#329](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/329)) ([42ac50a](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/42ac50a))
* **offline-helpers:** Preserve order of elements in update cache operation type ([#325](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/325)) ([5b49946](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/5b49946))
* **subscriptions:** Do not retry mqtt disconnections ([#319](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/319)) ([b933379](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/b933379))
* **subscriptions:** Guard against errors: null response in subscription handshake ([#337](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/337)) ([a2035d0](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/a2035d0))




<a name="1.7.0"></a>
# [1.7.0](https://github.com/awslabs/aws-mobile-appsync-sdk-js/compare/aws-appsync@1.6.0...aws-appsync@1.7.0) (2018-12-12)


### Features

* **logging:** Add logging ([#316](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/316)) ([04015ee](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/04015ee))




<a name="1.6.0"></a>
# [1.6.0](https://github.com/awslabs/aws-mobile-appsync-sdk-js/compare/aws-appsync@1.5.2...aws-appsync@1.6.0) (2018-12-07)


### Bug Fixes

* **offline:** Do not write mutations to cache if fetchPolicy = no-cache ([#312](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/312)) ([e5f66a9](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/e5f66a9))


### Features

* **offline-cache:** Add option to prevent storing the ROOT_MUTATION ([#313](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/313)) ([20e387a](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/20e387a))




<a name="1.5.2"></a>
## [1.5.2](https://github.com/awslabs/aws-mobile-appsync-sdk-js/compare/aws-appsync@1.5.1...aws-appsync@1.5.2) (2018-12-04)


### Bug Fixes

* **retry-link:** RetryLink keeps retrying even if 401 is thrown ([#311](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/311)) ([1d0b904](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/1d0b904)), closes [#308](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/308)




<a name="1.5.1"></a>
## [1.5.1](https://github.com/awslabs/aws-mobile-appsync-sdk-js/compare/aws-appsync@1.5.0...aws-appsync@1.5.1) (2018-11-21)


### Bug Fixes

* **delta-sync:** Helper. Preserve deltaRecords changes when applying update functions ([#304](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/304)) ([7f39810](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/7f39810))




<a name="1.5.0"></a>
# [1.5.0](https://github.com/awslabs/aws-mobile-appsync-sdk-js/compare/aws-appsync@1.4.0...aws-appsync@1.5.0) (2018-11-20)


### Bug Fixes

* **delta-sync:** Change baseQuery fetch policy ([#303](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/303)) ([cef6dce](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/cef6dce))
* **delta-sync:** Rename refreshIntervalInSeconds to  baseRefreshIntervalInSeconds ([#301](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/301)) ([73870bd](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/73870bd))
* **delta-sync:** Wait for client hydration ([#302](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/302)) ([8c519f8](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/8c519f8))
* **offline-helpers:** Support input types for mutations ([#292](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/292)) ([c4cfe8f](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/c4cfe8f))
* **subscriptions:** Fix NPE when unsubscribing ([#289](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/289)) ([dbdf603](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/dbdf603))


### Features

* **delta-sync:** Add DeltaSync support ([#293](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/293)) ([3b1af06](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/3b1af06))
* **link:** Retry logic for query, mutation and subscription (incl. mqtt disconnects) ([#274](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/274)) ([7a3f5ce](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/7a3f5ce))




<a name="1.4.0"></a>
# [1.4.0](https://github.com/awslabs/aws-mobile-appsync-sdk-js/compare/aws-appsync@1.3.4...aws-appsync@1.4.0) (2018-10-16)


### Bug Fixes

* **complex-objects:** Mutation error with arrays ([#244](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/244)) ([ad9dc3c](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/ad9dc3c)), closes [#237](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/237)
* **link:** Remove check for terminating link ([#235](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/235)) ([655efe8](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/655efe8))
* **subscriptions:** Do not disconnect active mqtt connections when establishing new ones. ([#252](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/252)) ([3184d71](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/3184d71))
* fixing aws-sdk version to 2.329.0 ([#266](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/266)) ([edf31dd](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/edf31dd))


### Features

* **offline:** Provide global callback for error handling ([#268](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/268)) ([619997f](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/619997f))




<a name="1.3.4"></a>
## [1.3.4](https://github.com/awslabs/aws-mobile-appsync-sdk-js/compare/aws-appsync@1.3.3...aws-appsync@1.3.4) (2018-08-20)


### Bug Fixes

* **link:** Create and use generic non terminating link ([4d91751](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/4d91751))
* **offline:** Fix handling of objects when getting ids for local mapping ([#231](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/231)) ([29c4ff4](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/29c4ff4))
* **react-native:** Discrepancy in JavaScriptCore iOS vs Android ([#222](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/222)) ([7c3a86c](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/7c3a86c))
* **typescript:** Make all fields in ApolloClientOptions optional ([#226](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/226)) ([332e912](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/332e912))
* **typescript:** Make client.mutate use the same types as Apollo's ([#224](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/224)) ([7fe7087](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/7fe7087))




<a name="1.3.3"></a>
## [1.3.3](https://github.com/awslabs/aws-mobile-appsync-sdk-js/compare/aws-appsync@1.3.2...aws-appsync@1.3.3) (2018-08-06)


### Bug Fixes

* **helpers:** Implement `isObject` function: check for `null` and `object` type ([#211](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/211)) ([61bd155](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/61bd155))
* **typescript:** Fix types for apiKey and jwtToken ([#213](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/213)) ([eae3112](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/eae3112))




<a name="1.3.2"></a>
## [1.3.2](https://github.com/awslabs/aws-mobile-appsync-sdk-js/compare/aws-appsync@1.3.1...aws-appsync@1.3.2) (2018-07-20)


### Bug Fixes

* **typescript:** Typescript improvements ([#191](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/191)) ([712d089](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/712d089))




<a name="1.3.1"></a>
## [1.3.1](https://github.com/awslabs/aws-mobile-appsync-sdk-js/compare/aws-appsync@1.3.0...aws-appsync@1.3.1) (2018-07-18)


### Bug Fixes

* **typescript:** Add types info ([#187](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/187)) ([739470e](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/739470e))




<a name="1.3.0"></a>
# [1.3.0](https://github.com/awslabs/aws-mobile-appsync-sdk-js/compare/aws-appsync@1.2.1...aws-appsync@1.3.0) (2018-07-17)


### Features

* **offline:** Offline helpers ([#184](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/184)) ([0c0fe82](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/0c0fe82))




<a name="1.2.1"></a>
## [1.2.1](https://github.com/awslabs/aws-mobile-appsync-sdk-js/compare/aws-appsync@1.2.0...aws-appsync@1.2.1) (2018-07-10)


### Bug Fixes

* **offline:** Check if client is available before disabling broadcastQueries ([#177](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/177)) ([92a7baa](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/92a7baa))




<a name="1.2.0"></a>
# [1.2.0](https://github.com/awslabs/aws-mobile-appsync-sdk-js/compare/aws-appsync@1.1.4...aws-appsync@1.2.0) (2018-07-10)


### Bug Fixes

* **offline:** Enqueue mutation even if no optimisticResponse is provided ([#173](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/173)) ([73e48b4](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/73e48b4)), closes [#170](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/170) [#158](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/158)
* **typescript:** client.mutate - remove JSDoc in favor of TypeScript ([#174](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/174)) ([39891f4](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/39891f4))


### Features

* **signer:** Export SigV4 Signer ([#165](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/165)) ([7a016cb](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/7a016cb)), closes [#153](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/153)




<a name="1.1.4"></a>
## [1.1.4](https://github.com/awslabs/aws-mobile-appsync-sdk-js/compare/aws-appsync@1.1.3...aws-appsync@1.1.4) (2018-06-29)


### Bug Fixes

* **auth:** replacing utf-8 with UTF-8 ([#162](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/162)) ([e95c5ae](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/e95c5ae))




<a name="1.1.3"></a>
## [1.1.3](https://github.com/awslabs/aws-mobile-appsync-sdk-js/compare/aws-appsync@1.1.1...aws-appsync@1.1.3) (2018-06-28)


### Bug Fixes

* **client:** Always pass refetchQueries when offline is disabled. ([#164](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/164)) ([baee768](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/baee768)), closes [#159](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/159)
* **typescript:** Options parameter in AppSyncClient constructor made optional ([#156](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/156)) ([79aaaff](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/79aaaff))




<a name="1.1.1"></a>
## [1.1.1](https://github.com/awslabs/aws-mobile-appsync-sdk-js/compare/aws-appsync@1.1.0...aws-appsync@1.1.1) (2018-06-21)


### Bug Fixes

* **build:** Copy vendor files to lib/ ([5d4a240](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/5d4a240))




<a name="1.1.0"></a>
# [1.1.0](https://github.com/awslabs/aws-mobile-appsync-sdk-js/compare/aws-appsync@1.0.23...aws-appsync@1.1.0) (2018-06-21)


### Features

* **subscriptions:** Detect if we should use ssl via the mqtt url ([#151](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/151)) ([8cef83a](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/8cef83a))
* Start incremental move to TypeScript ([#155](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues/155)) ([5897091](https://github.com/awslabs/aws-mobile-appsync-sdk-js/commit/5897091))




<a name="1.0.23"></a>
## [1.0.23](https://github.com/awslabs/aws-mobile-appsync-sdk-js/compare/aws-appsync@1.0.22...aws-appsync@1.0.23) (2018-06-06)




**Note:** Version bump only for package aws-appsync

<a name="1.0.22"></a>
## [1.0.22](https://github.com/awslabs/aws-mobile-appsync-sdk-js/compare/aws-appsync@1.0.21...aws-appsync@1.0.22) (2018-05-26)




**Note:** Version bump only for package aws-appsync

<a name="1.0.21"></a>
## [1.0.21](https://github.com/awslabs/aws-mobile-appsync-sdk-js/compare/aws-appsync@1.0.20...aws-appsync@1.0.21) (2018-05-24)




**Note:** Version bump only for package aws-appsync

# Changelog

### 1.0.14
- Fix apollo-client version to 2.2.6 [PR#71](https://github.com/awslabs/aws-mobile-appsync-sdk-js/pull/71) 

### 1.0.13
- Update complex-object-link.js to handle 'null' values [PR#67](https://github.com/awslabs/aws-mobile-appsync-sdk-js/pull/67)

### 1.0.12
- Inconsistent store [PR#43](https://github.com/awslabs/aws-mobile-appsync-sdk-js/pull/43)
- Delete observer associated with a topic when cleanup function is called [PR#60](https://github.com/awslabs/aws-mobile-appsync-sdk-js/pull/60)

### 1.0.11
- Add setimmediate as a dependency [PR#47](https://github.com/awslabs/aws-mobile-appsync-sdk-js/pull/47)

### 1.0.10
- Update x-amz-user-agent header [PR#40](https://github.com/awslabs/aws-mobile-appsync-sdk-js/pull/40)

### 1.0.9
- Fix AWS_IAM credentials fetching [PR#38](https://github.com/awslabs/aws-mobile-appsync-sdk-js/pull/38)
- Preserve the observer associated with an existing topic [PR#37](https://github.com/awslabs/aws-mobile-appsync-sdk-js/pull/37)

### 1.0.8
- Handle missing optimisticResponse [PR#34](https://github.com/awslabs/aws-mobile-appsync-sdk-js/pull/34)

### 1.0.7 
- Make offline support optional [PR#33](https://github.com/awslabs/aws-mobile-appsync-sdk-js/pull/33)
