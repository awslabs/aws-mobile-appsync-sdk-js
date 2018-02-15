# AWS Mobile [AppSync](https://aws.amazon.com/appsync/) SDK JavaScript

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

```
import AWSAppSyncClient from 'aws-appsync'
import VueApollo from 'vue-apollo'

import AppSyncConfig from './aws-exports'

const client = new AWSAppSyncClient({
  disableOffline: true,
  url: AppSyncConfig.graphqlEndpoint,
  region: AppSyncConfig.region,
  auth: {
    type: AppSyncConfig.authType,
    apiKey: AppSyncConfig.apiKey,
  }
})

const appsyncProvider = new VueApollo({
  defaultClient: client
})

Vue.use(VueApollo)

client.hydrated().then(() => {
  new Vue({
    el: '#app',
    router,
    components: { App },
    provide: appsyncProvider.provide(),
    template: '<App/>'
  })
});
```

#### Angular / Ionic examples coming soon

## Creating an AppSync Project    

To create a new AppSync project, go to https://aws.amazon.com/appsync/.

For a video walkthrough of how to create a new AppSync project, check out [this](https://www.youtube.com/watch?v=3DhaBaUeiXQ) video.

## License

This library is licensed under the Amazon Software License.
