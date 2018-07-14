import React, { Component } from 'react';
import logo from './logo.svg';
import './App.css';

import AWSAppSyncClient, { buildSubscription } from "aws-appsync";
import { Rehydrated, graphqlMutation } from 'aws-appsync-react';
import { graphql, ApolloProvider } from 'react-apollo';
import listTodos from './GraphQLAllTodos';
import NewTodo from './GraphQLNewTodo';
import NewTodoSubs from './GraphQLSubscribeTodos';
import AppSyncConfig from './AppSync';

class App extends Component {
  render() {
    return (
      <div className="App">
        <AllTodosWithData />
        <AddTodoOffline />
      </div>
    );
  }
}

class Todos extends Component {

  componentDidMount(){
    this.props.data.subscribeToMore(
      buildSubscription(NewTodoSubs, listTodos)
    );
  }

  render() {
    const { listTodos, refetch } = this.props.data;
    return (
      <div>
        <button onClick={() => refetch()}>Refresh</button>
        <ul>{listTodos && listTodos.items.map(todo => <li key={todo.id}>{todo.id + ' name: ' + todo.name}</li>)}</ul>
      </div>
    )
  }
}
const AllTodosWithData = graphql(listTodos)(Todos);

class AddTodo extends Component {
  state = { name: '', description: '' }

  onChange(event, type) {
    this.setState({
      [type]: event.target.value
    })
  }

  render() {
    return (
      <div>
        <input onChange={(event) => this.onChange(event, "name")} />
        <input onChange={(event) => this.onChange(event, "description")} />
        <button onClick={() => this.props.createTodo({
            name: this.state.name,
            description: this.state.description,
            status: 'pending'
          })}>
          Add
      </button>
      </div>
    );
  }
}
const AddTodoOffline = graphqlMutation(NewTodo, listTodos, 'Todo')(AddTodo);

const client = new AWSAppSyncClient({
  url: AppSyncConfig.graphqlEndpoint,
  region: AppSyncConfig.region,
  auth: {
    type: AppSyncConfig.authenticationType,
    apiKey: AppSyncConfig.apiKey
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
