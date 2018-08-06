![AWS AppSync](https://s3.amazonaws.com/aws-mobile-hub-images/awsappsyncgithub.png)

## [AWS AppSync](https://aws.amazon.com/appsync/) JavaScript SDK

 This SDK can be used with the Apollo JavaScript client found [here](https://github.com/apollographql/apollo-client).

[![lerna](https://img.shields.io/badge/maintained%20with-lerna-cc00ff.svg)](https://lernajs.io/)
![npm](https://img.shields.io/npm/dm/aws-appsync.svg)


package | version
--- | ---
aws-appsync | ![npm](https://img.shields.io/npm/v/aws-appsync.svg)
aws-appsync-react | ![npm](https://img.shields.io/npm/v/aws-appsync-react.svg)


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

[React / React Native](https://github.com/awslabs/aws-mobile-appsync-sdk-js#react--react-native)   
- [Creating an AppSync client](https://github.com/awslabs/aws-mobile-appsync-sdk-js#creating-a-client)
- [queries](https://github.com/awslabs/aws-mobile-appsync-sdk-js#queries)
- [mutations](https://github.com/awslabs/aws-mobile-appsync-sdk-js#mutations--optimistic-ui-with-graphqlmutation-helper)
- [subscriptions](https://github.com/awslabs/aws-mobile-appsync-sdk-js#subscriptions-with-buildsubscription-helper)
- [offline helpers](https://github.com/awslabs/aws-mobile-appsync-sdk-js#offline-helpers)
- [Tutorial](https://github.com/awslabs/aws-mobile-appsync-sdk-js/tree/master/tutorials/react-offline-realtime-todos)

[Vue](https://github.com/awslabs/aws-mobile-appsync-sdk-js#vue)   
[Angular](https://github.com/awslabs/aws-mobile-appsync-sdk-js#angular--ionic-examples-coming-soon)   
[Creating a new AWS AppSync API](https://github.com/awslabs/aws-mobile-appsync-sdk-js#creating-an-appsync-project)   
[License](https://github.com/awslabs/aws-mobile-appsync-sdk-js#license)   

### React / React Native    

For more documentation on `graphql` operations performed by React Apollo click [here](https://www.apollographql.com/docs/react/api/react-apollo.html#graphql).

#### Creating a client

```js
import AWSAppSyncClient from 'aws-appsync'
import AppSyncConfig from './aws-exports'
import { ApolloProvider } from 'react-apollo'
import { Rehydrated } from 'aws-appsync-react' // this needs to also be installed when working with React

import App from './App'

const client = new AWSAppSyncClient({
  url: AppSyncConfig.graphqlEndpoint,
  region: AppSyncConfig.region,
  auth: {
    type: AppSyncConfig.authenticationType,
    apiKey: AppSyncConfig.apiKey,
    // jwtToken: async () => token, // Required when you use Cognito UserPools OR OpenID Connect. token object is obtained previously
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

#### Queries

```js
import gql from 'graphql-tag'
import { graphql } from 'react-apollo'

const listPosts = gql`
  query listPosts {
    listPosts {
      items {
        id
        name
      }
    }
  }
`
class App extends Component {
  render() {
    return (
      <div>
        {
          this.props.posts.map((post, index) => (
            <h2 key={index}>{post.name}</h2>
          ))
        }
      </div>
    )
  }
}

export default graphql(listPosts, {
  options: {
    fetchPolicy: 'cache-and-network'
  },
  props: props => ({
    posts: props.data.listPosts ? props.data.listPosts.items : []
  })
})(App)

```

#### Mutations & optimistic UI (with graphqlMutation helper)

```js
import gql from 'graphql-tag'
import { graphql, compose } from 'react-apollo'
import { graphqlMutation } from 'aws-appsync-react'

const CreatePost = gql`
  mutation createPost($name: String!) {
    createPost(input: {
      name: $name
    }) {
      name
    }
  }
`

class App extends Component {
  state = { name: '' }
  onChange = (e) => { this.setState({ name: e.target.value }) }
  addTodo = () => this.props.createPost({ name: this.state.name })
  render() {
    return (
      <div>
        <input onChange={this.onChange} placeholder='Todo name' />
        <button onClick={this.addTodo}>Add Todo</button>
        {
          this.props.posts.map((post, index) => (
            <h2 key={index}>{post.name}</h2>
          ))
        }
      </div>
    )
  }
}

export default compose(
  graphql(listPosts, {
    options: {
      fetchPolicy: 'cache-and-network'
    },
    props: props => ({
      posts: props.data.listPosts ? props.data.listPosts.items : []
    })
  }),
  graphqlMutation(CreatePost, listPosts, 'Post')
)(App)
```

#### Mutations & optimistic UI (without graphqlMutation helper)

```js
import gql from 'graphql-tag'
import uuidV4 from 'uuid/v4'
import { graphql, compose } from 'react-apollo'

const CreatePost = gql`
  mutation createPost($name: String!) {
    createPost(input: {
      name: $name
    }) {
      name
    }
  }
`

class App extends Component {
  state = { name: '' }
  onChange = (e) => { this.setState({ name: e.target.value }) }
  addTodo = () => this.props.onAdd({ id: uuidV4(), name: this.state.name })
  render() {
    return (
      <div>
        <input onChange={this.onChange} placeholder='Todo name' />
        <button onClick={this.addTodo}>Add Todo</button>
        {
          this.props.posts.map((post, index) => (
            <h2 key={index}>{post.name}</h2>
          ))
        }
      </div>
    )
  }
}

export default compose(
  graphql(listPosts, {
    options: {
      fetchPolicy: 'cache-and-network'
    },
    props: props => ({
      posts: props.data.listPosts ? props.data.listPosts.items : []
    })
  }),
  graphql(CreatePost, {
    options: {
      update: (dataProxy, { data: { createPost } }) => {
        const query = listPosts
        const data = dataProxy.readQuery({ query })
        data.listPosts.items.push(createPost)
        dataProxy.writeQuery({ query, data })
      }
    },
    props: (props) => ({
      onAdd: (post) => {
        props.mutate({
          variables: post,
          optimisticResponse: () => ({
            createPost: { ...post, __typename: 'Post' }
          }),
        })
      }
    }),
  })
)(App)
```
#### Subscriptions (with buildSubscription helper)

```js
import gql from 'graphql-tag'
import { graphql } from 'react-apollo'
import { buildSubscription } from 'aws-appsync'

const listPosts = gql`
  query listPosts {
    listPosts {
      items {
        id
        name
      }
    }
  }
`

const PostSubscription = gql`
  subscription postSubscription {
    onCreatePost {
      id
      name
    }
  } 
`

class App extends React.Component {
  componentDidMount() {
    this.props.data.subscribeToMore(
      buildSubscription(PostSubscription, listPosts)
    )
  }
  render() {
    return (
      <div>
        {
          this.props.posts.map((post, index) => (
            <h2 key={index}>{post.name}</h2>
          ))
        }
      </div>
    )
  }
}

export default graphql(listPosts, {
  options: {
    fetchPolicy: 'cache-and-network'
  },
  props: props => ({
    posts: props.data.listPosts ? props.data.listPosts.items : [],
    data: props.data
  })
})(App)
```

#### Subscriptions (without buildSubscription helper)

```js
import gql from 'graphql-tag'
import { graphql } from 'react-apollo'

const listPosts = gql`
  query listPosts {
    listPosts {
      items {
        id
        name
      }
    }
  }
`

const PostSubscription = gql`
  subscription postSubscription {
    onCreatePost {
      id
      name
    }
  } 
`

class App extends React.Component {
  componentDidMount() {
    this.props.subscribeToNewPosts()
  }
  render() {
    return (
      <div>
        {
          this.props.posts.map((post, index) => (
            <h2 key={index}>{post.name}</h2>
          ))
        }
      </div>
    )
  }
}

export default graphql(listPosts, {
  options: {
    fetchPolicy: 'cache-and-network'
  },
  props: props => ({
    posts: props.data.listPosts ? props.data.listPosts.items : [],
    subscribeToNewPosts: params => {
      props.data.subscribeToMore({
        document: PostSubscription,
        updateQuery: (prev, { subscriptionData: { data : { onCreatePost } } }) => ({
          ...prev,
          listPosts: { __typename: 'PostConnection', items: [onCreatePost, ...prev.listPosts.items.filter(post => post.id !== onCreatePost.id)] }
        })
      })
    },
  })
})(App)
```


#### Offline helpers

For detailed documentation about the offline helpers, look at the [API Definifion](OFFLINE_HELPERS.md).

### Vue    

For more documentation on Vue Apollo click [here](https://github.com/Akryum/vue-apolloql).

**main.js**
```js
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
```js
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
    await this.$apollo.provider.defaultClient.hydrated()
    this.hydrated = true
  },
}
</script>
```

**connected component**
```js
import gql from 'graphql-tag'
import uuidV4 from 'uuid/v4'

const CreateTask = gql`
  mutation createTask($id: ID!, $name: String!, $completed: Boolean!) {
    createTask(
      input: {
        id: $id, name: $name, completed: $completed
      }
    ) {
      id
      name
      completed
    }
  }
`

const DeleteTask = gql`
  mutation deleteTask($id: ID!) {
    deleteTask(
      input: {
        id: $id
      }
    ) {
      id
    }
  }
`

const ListTasks = gql`
  query listTasks {
    listTasks {
      items {
        id
        name
        completed
      }
    }
  }
`

const UpdateTask = gql`
  mutation updateTask($id: ID!, $name: String!, $completed: Boolean!) {
    updateTask(
      input: {
        id: $id
        name: $name
        completed: $completed
      }
    ) {
      id
      name
      completed
    }
  }
`

// In your component (Examples of queries & mutations)
export default {
  name: 'Tasks',
  methods: {
    toggleComplete(task) {
      const updatedTask = {
        ...task,
        completed: !task.completed
      }
      this.$apollo.mutate({
        mutation: UpdateTask,
        variables: updatedTask,
        update: (store, { data: { updateTask } }) => {
          const data = store.readQuery({ query: ListTasks })
          const index = data.listTasks.items.findIndex(item => item.id === updateTask.id)
          data.listTasks.items[index] = updateTask
          store.writeQuery({ query: ListTasks, data })
        },
        optimisticResponse: {
          __typename: 'Mutation',
          updateTask: {
            __typename: 'Task',
            ...updatedTask
          }
        },
      })
      .then(data => console.log(data))
      .catch(error => console.error(error))
    },
    deleteTask(task) {
      this.$apollo.mutate({
        mutation: DeleteTask,
        variables: {
          id: task.id
        },
        update: (store, { data: { deleteTask } }) => {
          const data = store.readQuery({ query: ListTasks })
          data.listTasks.items = data.listTasks.items.filter(task => task.id !== deleteTask.id)
          store.writeQuery({ query: ListTasks, data })
        },
        optimisticResponse: {
          __typename: 'Mutation',
          deleteTask: {
            __typename: 'Task',
            ...task
          }
        },
      })
      .then(data => console.log(data))
      .catch(error => console.error(error))
    },
    createTask() {
      const taskname = this.taskname
      if ((taskname) === '') {
        alert('please create a task')
        return
      }
      this.taskname = ''
      const id = uuidV4()
      const task = {
        name: taskname,
        id,
        completed: false
      }
      this.$apollo.mutate({
        mutation: CreateTask,
        variables: task,
        update: (store, { data: { createTask } }) => {
          const data = store.readQuery({ query: ListTasks })
          data.listTasks.items.push(createTask)
          store.writeQuery({ query: ListTasks, data })
        },
        optimisticResponse: {
          __typename: 'Mutation',
          createTask: {
            __typename: 'Task',
            ...task
          }
        },
      })
      .then(data => console.log(data))
      .catch(error => console.error("error!!!: ", error))
    },
  },
  data () {
    return {
      taskname: '',
      tasks: []
    }
  },
  apollo: {
    tasks: {
      query: () => ListTasks,
      update: data => data.listTasks.items
    }
  },
}
```

### Angular / Ionic examples coming soon

## Creating an AppSync Project    

To create a new AppSync project, go to https://aws.amazon.com/appsync/.

## License

This library is licensed under the Amazon Software License.
