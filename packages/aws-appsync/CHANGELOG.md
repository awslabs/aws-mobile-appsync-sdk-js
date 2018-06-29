# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

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
