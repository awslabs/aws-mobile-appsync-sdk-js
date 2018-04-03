# AWS Mobile [AppSync](https://aws.amazon.com/appsync/) SDK JavaScript

[![lerna](https://img.shields.io/badge/maintained%20with-lerna-cc00ff.svg)](https://lernajs.io/)

## Installation    
#### npm    

```
npm install --save aws-appsync
```

#### yarn    
    
```
yarn add aws-appsync
```

## Usage

### React / React Native    

```
import AWSAppSyncClient from 'aws-appsync'
import AppSyncConfig from './aws-exports'
import { ApolloProvider } from 'react-apollo'
import { Rehydrated } from 'aws-appsync-react' // this is included with aws-appsync

import App from './App'

const client = new AWSAppSyncClient({
  url: AppSyncConfig.graphqlEndpoint,
  region: AppSyncConfig.region,
  auth: {
    type: AppSyncConfig.authType,
    apiKey: AppSyncConfig.apiKey,
  }
})

const WithProvider = () => (
  <ApolloProvider client={client}>
    <Rehydrated>
      <App />
    </Rehydrated>
  </ApolloProvider>
)

export default WithProvider
```

### Vue    

**main.js**
```
import Vue from 'vue'
import App from './App'
import router from './router'

import AWSAppSyncClient from 'aws-appsync'
import VueApollo from 'vue-apollo'
import AppSyncConfig from './aws-exports'

const config = {
  url: AppSyncConfig.graphqlEndpoint,
  region: AppSyncConfig.region,
  auth: {
    type: AppSyncConfig.authType,
    apiKey: AppSyncConfig.apiKey,
  }
}
const options = {
  defaultOptions: {
    watchQuery: {
      fetchPolicy: 'cache-and-network',
    }
  }
}

const client = new AWSAppSyncClient(config, options)

const appsyncProvider = new VueApollo({
  defaultClient: client
})

Vue.use(VueApollo)

new Vue({
  el: '#app',
  router,
  components: { App },
  provide: appsyncProvider.provide(),
  template: '<App/>'
})
```

**App.vue**
```
<template>
  <div id="app" v-if="hydrated">
    <router-view/>
  </div>
</template>

<script>
export default {
  name: 'App',
  data: () => ({ hydrated: false }),
  async mounted() {
    await this.$apollo.provider.defaultClient.hydrated();
    this.hydrated = true;
  },
}
</script>

```

#### Angular / Ionic examples coming soon

## Creating an AppSync Project    

To create a new AppSync project, go to https://aws.amazon.com/appsync/.

For a video walkthrough of how to create a new AppSync project, check out [this](https://www.youtube.com/watch?v=0Xbt7VqkJNc) video.

## License

This library is licensed under the Amazon Software License.
