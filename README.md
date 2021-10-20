# AWS AppSync JavaScript SDK &middot; [![lerna](https://img.shields.io/badge/maintained%20with-lerna-cc00ff.svg)](https://lernajs.io/)

![AWS AppSync](https://s3.amazonaws.com/aws-mobile-hub-images/awsappsyncgithub.png)

[AWS AppSync](https://aws.amazon.com/appsync/) is a fully managed service that makes it easy to develop GraphQL APIs by handling the heavy lifting of securely connecting to data sources like AWS DynamoDB, Lambda, and more.

You can use any HTTP or GraphQL client to connect to a GraphQL API on AppSync.

For front-end web and mobile development, we recommend using the  [Amplify](https://aws-amplify.github.io/)  clients which are optimized to connect to the AppSync backend.

* For DynamoDB data sources, use the DataStore category in the Amplify client. It provides the best developer experience and built-in conflict detection and resolution.
* For non-DynamoDB data sources in scenarios where you have no offline requirements, use the API (GraphQL) category in the Amplify client.
* For use cases where you are utilizing the Apollo V3 client, use the Apollo Links in this repository to help with authorization and subscriptions.

## [AWS AppSync](https://aws.amazon.com/appsync/) Links for Apollo V3

If you would like to use the [Apollo JavaScript client version 3](https://www.apollographql.com/docs/react/) to connect to your AppSync GraphQL API, this repository (on the current stable branch) provides Apollo links to use the different AppSync authorization modes, and to setup subscriptions over web sockets. Please log questions for this client SDK in this repo and questions for the AppSync service in the  [official AWS AppSync forum](https://forums.aws.amazon.com/forum.jspa?forumID=280&start=0) .

![npm](https://img.shields.io/npm/dm/aws-appsync-auth-link.svg)
![npm](https://img.shields.io/npm/dm/aws-appsync-subscription-link.svg)

| package                       | version                                                                |
| ----------------------------- | ---------------------------------------------------------------------- |
| aws-appsync-auth-link         | ![npm](https://img.shields.io/npm/v/aws-appsync-auth-link.svg)         |
| aws-appsync-subscription-link | ![npm](https://img.shields.io/npm/v/aws-appsync-subscription-link.svg) |

[Example usage of Apollo V3 links](#using-authorization-and-subscription-links-with-apollo-client-v3-no-offline-support)

---

## [AWS AppSync](https://aws.amazon.com/appsync/) JavaScript SDK

The `aws-appsync` and `aws-appsync-react` packages work with the [Apollo client version 2](https://www.apollographql.com/docs/react/v2) and provide offline capabilities.

**Note:** if you do not have any offline requirements in your app, we recommend using the [Amplify libraries](https://aws-amplify.github.io/).

![npm](https://img.shields.io/npm/dm/aws-appsync.svg)

| package           | version                                                    |
| ----------------- | ---------------------------------------------------------- |
| aws-appsync       | ![npm](https://img.shields.io/npm/v/aws-appsync.svg)       |
| aws-appsync-react | ![npm](https://img.shields.io/npm/v/aws-appsync-react.svg) |

### Installation

#### npm

```sh
npm install --save aws-appsync
```

#### yarn

```sh
yarn add aws-appsync
```

#### React Native Compatibility

When using this library with React Native, you need to ensure you are using the correct version of the library based on your version of React Native. Take a look at the table below to determine what version to use.

| `aws-appsync` version | Required React Native Version |
| --------------------- | ----------------------------- |
| `2.x.x`               | `>= 0.60`                     |
| `1.x.x`               | `<= 0.59`                     |

If you are using React Native `0.60` and above, you also need to install `@react-native-community/netinfo` and `@react-native-community/async-storage`:

```sh
npm install --save @react-native-community/netinfo@5.9.4 @react-native-community/async-storage
```

or

```sh
yarn add @react-native-community/netinfo@5.9.4 @react-native-community/async-storage
```

If you are using React Native `0.60+` for iOS, run the following command as an additional step:

```sh
npx pod-install
```

---

## Usage

Please visit the [documentation with the Amplify Framework](https://aws-amplify.github.io/docs/js/api) for detailed instructions.

* [React / React Native](#react--react-native)
* [Using Authorization and Subscription links with Apollo Client V3 (No offline support)](#using-authorization-and-subscription-links-with-apollo-client-v3-no-offline-support)
  * [Queries and Subscriptions using Apollo V3](#queries-and-subscriptions-using-apollo-v3)
* [Creating a client (Apollo V2)](#creating-a-client-apollo-v2)
  * [Queries](#queries)
  * [Mutations & optimistic UI (with graphqlMutation helper)](#mutations--optimistic-ui-with-graphqlmutation-helper)
  * [Mutations & optimistic UI (without graphqlMutation helper)](#mutations--optimistic-ui-without-graphqlmutation-helper)
  * [Subscriptions (with buildSubscription helper)](#subscriptions-with-buildsubscription-helper)
  * [Subscriptions (without buildSubscription helper)](#subscriptions-without-buildsubscription-helper)
* [Offline configuration (Apollo V2)](#offline-configuration-apollo-v2)
  * [Error handling](#error-handling)
  * [Custom storage engine](#custom-storage-engine)
  * [Offline helpers](#offline-helpers)
* [Vue](#vue)
  * [main.js](#mainjs)
  * [App.vue](#appvue)
  * [connected component](#connected-component)

### React / React Native

For more documentation on `graphql` operations performed by React Apollo see their [documentation](https://www.apollographql.com/docs/react/).

### Using Authorization and Subscription links with Apollo Client V3 (No offline support)

For versions of the Apollo client newer than 2.4.6 you can use custom links for Authorization and Subscriptions. Offline support is not available for these newer versions. The packages available are
`aws-appsync-auth-link` and `aws-appsync-subscription-link`. Below is a sample code snippet that shows how to use it.

```javascript
import { createAuthLink } from "aws-appsync-auth-link";
import { createSubscriptionHandshakeLink } from "aws-appsync-subscription-link";

import { ApolloLink } from "apollo-link";
import { createHttpLink } from "apollo-link-http";
import ApolloClient from "apollo-client";
import { InMemoryCache } from "apollo-cache-inmemory";

import appSyncConfig from "./aws-exports";

const url = appSyncConfig.aws_appsync_graphqlEndpoint;
const region = appSyncConfig.aws_appsync_region;
const auth = {
  type: appSyncConfig.aws_appsync_authenticationType,
  apiKey: appSyncConfig.aws_appsync_apiKey,
  // jwtToken: async () => token, // Required when you use Cognito UserPools OR OpenID Connect. token object is obtained previously
  // credentials: async () => credentials, // Required when you use IAM-based auth.
};

const httpLink = createHttpLink({ uri: url });

const link = ApolloLink.from([
  createAuthLink({ url, region, auth }),
  createSubscriptionHandshakeLink({ url, region, auth }, httpLink),
]);

const client = new ApolloClient({
  link,
  cache: new InMemoryCache(),
});
```

#### Queries and Subscriptions using Apollo V3

```js
import React, { useState, useEffect } from "react";
import { gql, useSubscription } from "@apollo/client";
import { useMutation, useQuery } from "@apollo/client";
import { v4 as uuidv4 } from "uuid";

const initialState = { name: "", description: "" };

const App = () => {

  const LIST_TODOS = gql`
    query listTodos {
      listTodos {
        items {
          id
          name
          description
        }
      }
    }
  `;

  const {
    loading: listLoading,
    data: listData,
    error: listError,
  } = useQuery(LIST_TODOS);

  const CREATE_TODO = gql`
    mutation createTodo($input: CreateTodoInput!) {
      createTodo(input: $input) {
        id
        name
        description
      }
    }
  `;

  // https://www.apollographql.com/docs/react/data/mutations/
  const [addTodoMutateFunction, { error: createError }] =
    useMutation(CREATE_TODO);

  async function addTodo() {
    try {
      addTodoMutateFunction({ variables: { input: { todo } } });
    } catch (err) {
      console.log("error creating todo:", err);
    }
  }

  const DELETE_TODO = gql`
    mutation deleteTodo($input: DeleteTodoInput!) {
      deleteTodo(input: $input) {
        id
        name
        description
      }
    }
  `;

  const [deleteTodoMutateFunction] = useMutation(DELETE_TODO, {
    refetchQueries: [LIST_TODOS, "listTodos"],
  });

  async function removeTodo(id) {
    try {
      deleteTodoMutateFunction({ variables: { input: { id } } });
    } catch (err) {
      console.log("error deleting todo:", err);
    }
  }

  const CREATE_TODO_SUBSCRIPTION = gql`
    subscription OnCreateTodo {
      onCreateTodo {
        id
        name
        description
      }
    }
  `;

  const { data: createSubData, error: createSubError } = useSubscription(
    CREATE_TODO_SUBSCRIPTION
  );

  return (
    // Render TODOs
  );
};

export default App;
```

### Creating a client (Apollo V2)

```js
import AWSAppSyncClient from "aws-appsync";
import AppSyncConfig from "./aws-exports";
import { ApolloProvider } from "react-apollo";
import { Rehydrated } from "aws-appsync-react"; // this needs to also be installed when working with React

import App from "./App";

const client = new AWSAppSyncClient({
  url: AppSyncConfig.aws_appsync_graphqlEndpoint,
  region: AppSyncConfig.aws_appsync_region,
  auth: {
    type: AppSyncConfig.aws_appsync_authenticationType,
    apiKey: AppSyncConfig.aws_appsync_apiKey,
    // jwtToken: async () => token, // Required when you use Cognito UserPools OR OpenID Connect. Token object is obtained previously
    // credentials: async () => credentials, // Required when you use IAM-based auth.
  },
});

const WithProvider = () => (
  <ApolloProvider client={client}>
    <Rehydrated>
      <App />
    </Rehydrated>
  </ApolloProvider>
);

export default WithProvider;
```

#### Queries

```js
import gql from "graphql-tag";
import { graphql } from "react-apollo";

const listPosts = gql`
  query listPosts {
    listPosts {
      items {
        id
        name
      }
    }
  }
`;
class App extends Component {
  render() {
    return (
      <div>
        {this.props.posts.map((post, index) => (
          <h2 key={post.id ? post.id : index}>{post.name}</h2>
        ))}
      </div>
    );
  }
}

export default graphql(listPosts, {
  options: {
    fetchPolicy: "cache-and-network",
  },
  props: (props) => ({
    posts: props.data.listPosts ? props.data.listPosts.items : [],
  }),
})(App);
```

#### Mutations & optimistic UI (with graphqlMutation helper)

```js
import gql from "graphql-tag";
import { graphql, compose } from "react-apollo";
import { graphqlMutation } from "aws-appsync-react";

const CreatePost = gql`
  mutation createPost($name: String!) {
    createPost(input: { name: $name }) {
      name
    }
  }
`;

class App extends Component {
  state = { name: "" };
  onChange = (e) => {
    this.setState({ name: e.target.value });
  };
  addTodo = () => this.props.createPost({ name: this.state.name });
  render() {
    return (
      <div>
        <input onChange={this.onChange} placeholder="Todo name" />
        <button onClick={this.addTodo}>Add Todo</button>
        {this.props.posts.map((post, index) => (
          <h2 key={post.id ? post.id : index}>{post.name}</h2>
        ))}
      </div>
    );
  }
}

export default compose(
  graphql(listPosts, {
    options: {
      fetchPolicy: "cache-and-network",
    },
    props: (props) => ({
      posts: props.data.listPosts ? props.data.listPosts.items : [],
    }),
  }),
  graphqlMutation(CreatePost, listPosts, "Post")
)(App);
```

#### Mutations & optimistic UI (without graphqlMutation helper)

```js
import gql from "graphql-tag";
import uuidV4 from "uuid/v4";
import { graphql, compose } from "react-apollo";

const CreatePost = gql`
  mutation createPost($name: String!) {
    createPost(input: { name: $name }) {
      name
    }
  }
`;

class App extends Component {
  state = { name: "" };
  onChange = (e) => {
    this.setState({ name: e.target.value });
  };
  addTodo = () => this.props.onAdd({ id: uuidV4(), name: this.state.name });
  render() {
    return (
      <div>
        <input onChange={this.onChange} placeholder="Todo name" />
        <button onClick={this.addTodo}>Add Todo</button>
        {this.props.posts.map((post, index) => (
          <h2 key={post.id ? post.id : index}>{post.name}</h2>
        ))}
      </div>
    );
  }
}

export default compose(
  graphql(listPosts, {
    options: {
      fetchPolicy: "cache-and-network",
    },
    props: (props) => ({
      posts: props.data.listPosts ? props.data.listPosts.items : [],
    }),
  }),
  graphql(CreatePost, {
    options: {
      update: (dataProxy, { data: { createPost } }) => {
        const query = listPosts;
        const data = dataProxy.readQuery({ query });
        data.listPosts.items.push(createPost);
        dataProxy.writeQuery({ query, data });
      },
    },
    props: (props) => ({
      onAdd: (post) => {
        props.mutate({
          variables: post,
          optimisticResponse: () => ({
            createPost: { ...post, __typename: "Post" },
          }),
        });
      },
    }),
  })
)(App);
```

#### Subscriptions (with buildSubscription helper)

```js
import gql from "graphql-tag";
import { graphql } from "react-apollo";
import { buildSubscription } from "aws-appsync";

const listPosts = gql`
  query listPosts {
    listPosts {
      items {
        id
        name
      }
    }
  }
`;

const PostSubscription = gql`
  subscription postSubscription {
    onCreatePost {
      id
      name
    }
  }
`;

class App extends React.Component {
  componentDidMount() {
    this.props.data.subscribeToMore(
      buildSubscription(PostSubscription, listPosts)
    );
  }
  render() {
    return (
      <div>
        {this.props.posts.map((post, index) => (
          <h2 key={post.id ? post.id : index}>{post.name}</h2>
        ))}
      </div>
    );
  }
}

export default graphql(listPosts, {
  options: {
    fetchPolicy: "cache-and-network",
  },
  props: (props) => ({
    posts: props.data.listPosts ? props.data.listPosts.items : [],
    data: props.data,
  }),
})(App);
```

#### Subscriptions (without buildSubscription helper)

```js
import gql from "graphql-tag";
import { graphql } from "react-apollo";

const listPosts = gql`
  query listPosts {
    listPosts {
      items {
        id
        name
      }
    }
  }
`;

const PostSubscription = gql`
  subscription postSubscription {
    onCreatePost {
      id
      name
    }
  }
`;

class App extends React.Component {
  componentDidMount() {
    this.props.subscribeToNewPosts();
  }
  render() {
    return (
      <div>
        {this.props.posts.map((post, index) => (
          <h2 key={post.id ? post.id : index}>{post.name}</h2>
        ))}
      </div>
    );
  }
}

export default graphql(listPosts, {
  options: {
    fetchPolicy: "cache-and-network",
  },
  props: (props) => ({
    posts: props.data.listPosts ? props.data.listPosts.items : [],
    subscribeToNewPosts: (params) => {
      props.data.subscribeToMore({
        document: PostSubscription,
        updateQuery: (
          prev,
          {
            subscriptionData: {
              data: { onCreatePost },
            },
          }
        ) => ({
          ...prev,
          listPosts: {
            __typename: "PostConnection",
            items: [
              onCreatePost,
              ...prev.listPosts.items.filter(
                (post) => post.id !== onCreatePost.id
              ),
            ],
          },
        }),
      });
    },
  }),
})(App);
```

### Offline configuration (Apollo V2)

When using the AWS AppSync SDK offline capabilities (e.g. `disableOffline: false`), you can provide configurations for the following:

* Error handling
* Custom storage engine

#### Error handling

If a mutation is done while the app was offline, it gets persisted to the platform storage engine. When coming back online, it is sent to the GraphQL endpoint. When a response is returned by the API, the SDK will notify you of the success or error using the callback provided in the `offlineConfig` param as follows:

```javascript
const client = new AWSAppSyncClient({
  url: appSyncConfig.graphqlEndpoint,
  region: appSyncConfig.region,
  auth: {
    type: appSyncConfig.authenticationType,
    apiKey: appSyncConfig.apiKey,
  },
  offlineConfig: {
    callback: (err, succ) => {
      if (err) {
        const { mutation, variables } = err;

        console.warn(`ERROR for ${mutation}`, err);
      } else {
        const { mutation, variables } = succ;

        console.info(`SUCCESS for ${mutation}`, succ);
      }
    },
  },
});
```

#### Custom storage engine

You can use any custom storage engine from the [redux-persist supported engines](https://github.com/rt2zz/redux-persist#storage-engines) list.

Configuration is done as follows: (localForage shown in the example)

```javascript
import * as localForage from "localforage";

const client = new AWSAppSyncClient({
  url: appSyncConfig.graphqlEndpoint,
  region: appSyncConfig.region,
  auth: {
    type: appSyncConfig.authenticationType,
    apiKey: appSyncConfig.apiKey,
  },
  offlineConfig: {
    storage: localForage,
  },
});
```

#### Offline helpers

For detailed documentation about the offline helpers, look at the [API Definition](OFFLINE_HELPERS.md).

### Vue

For more documentation on Vue Apollo click [here](https://github.com/Akryum/vue-apollo).

#### main.js

```js
import Vue from "vue";
import App from "./App";
import router from "./router";

import AWSAppSyncClient from "aws-appsync";
import VueApollo from "vue-apollo";
import AppSyncConfig from "./aws-exports";

const config = {
  url: AppSyncConfig.graphqlEndpoint,
  region: AppSyncConfig.region,
  auth: {
    type: AppSyncConfig.authType,
    apiKey: AppSyncConfig.apiKey,
  },
};
const options = {
  defaultOptions: {
    watchQuery: {
      fetchPolicy: "cache-and-network",
    },
  },
};

const client = new AWSAppSyncClient(config, options);

const appsyncProvider = new VueApollo({
  defaultClient: client,
});

Vue.use(VueApollo);

new Vue({
  el: "#app",
  router,
  components: { App },
  provide: appsyncProvider.provide(),
  template: "<App/>",
});
```

#### App.vue

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

#### connected component

```js
import gql from "graphql-tag";
import uuidV4 from "uuid/v4";

const CreateTask = gql`
  mutation createTask($id: ID!, $name: String!, $completed: Boolean!) {
    createTask(input: { id: $id, name: $name, completed: $completed }) {
      id
      name
      completed
    }
  }
`;

const DeleteTask = gql`
  mutation deleteTask($id: ID!) {
    deleteTask(input: { id: $id }) {
      id
    }
  }
`;

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
`;

const UpdateTask = gql`
  mutation updateTask($id: ID!, $name: String!, $completed: Boolean!) {
    updateTask(input: { id: $id, name: $name, completed: $completed }) {
      id
      name
      completed
    }
  }
`;

// In your component (Examples of queries & mutations)
export default {
  name: "Tasks",
  methods: {
    toggleComplete(task) {
      const updatedTask = {
        ...task,
        completed: !task.completed,
      };
      this.$apollo
        .mutate({
          mutation: UpdateTask,
          variables: updatedTask,
          update: (store, { data: { updateTask } }) => {
            const data = store.readQuery({ query: ListTasks });
            const index = data.listTasks.items.findIndex(
              (item) => item.id === updateTask.id
            );
            data.listTasks.items[index] = updateTask;
            store.writeQuery({ query: ListTasks, data });
          },
          optimisticResponse: {
            __typename: "Mutation",
            updateTask: {
              __typename: "Task",
              ...updatedTask,
            },
          },
        })
        .then((data) => console.log(data))
        .catch((error) => console.error(error));
    },
    deleteTask(task) {
      this.$apollo
        .mutate({
          mutation: DeleteTask,
          variables: {
            id: task.id,
          },
          update: (store, { data: { deleteTask } }) => {
            const data = store.readQuery({ query: ListTasks });
            data.listTasks.items = data.listTasks.items.filter(
              (task) => task.id !== deleteTask.id
            );
            store.writeQuery({ query: ListTasks, data });
          },
          optimisticResponse: {
            __typename: "Mutation",
            deleteTask: {
              __typename: "Task",
              ...task,
            },
          },
        })
        .then((data) => console.log(data))
        .catch((error) => console.error(error));
    },
    createTask() {
      const taskname = this.taskname;
      if (taskname === "") {
        alert("please create a task");
        return;
      }
      this.taskname = "";
      const id = uuidV4();
      const task = {
        name: taskname,
        id,
        completed: false,
      };
      this.$apollo
        .mutate({
          mutation: CreateTask,
          variables: task,
          update: (store, { data: { createTask } }) => {
            const data = store.readQuery({ query: ListTasks });
            data.listTasks.items.push(createTask);
            store.writeQuery({ query: ListTasks, data });
          },
          optimisticResponse: {
            __typename: "Mutation",
            createTask: {
              __typename: "Task",
              ...task,
            },
          },
        })
        .then((data) => console.log(data))
        .catch((error) => console.error("error!!!: ", error));
    },
  },
  data() {
    return {
      taskname: "",
      tasks: [],
    };
  },
  apollo: {
    tasks: {
      query: () => ListTasks,
      update: (data) => data.listTasks.items,
    },
  },
};
```

## Creating an AppSync Project

To create a new AppSync project, go to <https://aws.amazon.com/appsync/>.

## License

This library is licensed under the Apache License 2.0.
