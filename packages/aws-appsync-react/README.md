# aws-appsync-react

This package provides the following helpers which are needed when working with the SDK on a React project.

- `Rehydrated`
- `graphqlMutation`

----
## `Rehydrated`

A React component that you need to wrap your app with, when working with Apollo, React & a custom client created with `aws-appsync`. It makes sure
to wait for a client hydration in an offline environment.

### Import
```
import { Rehydrated } from 'aws-appsync-react'
```

### Props

| Prop name     | Required      | Details |
| ------------- |:-------------:| :-------|
| children      | false         | The React Element(s) to show when the client is fully hydrated |
| loading       | false         | The React Element to show while the client is hydrating. Defaults to the text element `Loading...` |
| render        | false         | A render-props function that has a single object parameter containing a boolean `rehydrated` and should return a React node. It's signature is: `({ rehydrated: boolean }) => React.ReactNode` |

 Although the props `children` and `render` are mutually exclusive, **at least** one of them should be defined.


### Example
```
import { ApolloProvider } from 'react-apollo';
import { Rehydrated } from 'aws-appsync-react'; 
import App from './App';

const client = /* ... */

const WithProvider = () => (
  <ApolloProvider client={client}>
    <Rehydrated>
      <App />
    </Rehydrated>
  </ApolloProvider>
)

export default WithProvider
```

## `graphqlMutation`

Full documentation for this helper can be found in the [Offline Helpers API page](https://github.com/awslabs/aws-mobile-appsync-sdk-js/blob/master/OFFLINE_HELPERS.md).
