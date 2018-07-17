import React, { Component } from 'react';
import logo from './logo.svg';
import './App.css';

import AWSAppSyncClient, { buildSubscription } from 'aws-appsync';
import { Rehydrated, graphqlMutation } from 'aws-appsync-react';
import { graphql, ApolloProvider, compose } from 'react-apollo';

import ListTodos from './GraphQLAllTodos';
import NewTodo from './GraphQLNewTodo';
import NewTodoSubs from './GraphQLSubscribeTodos';
import UpdateTodo from './GraphQLUpdateTodo';
import DeleteTodo from './GraphQLDeleteTodo';

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

const client = new AWSAppSyncClient({
  url: AppSyncConfig.graphqlEndpoint,
  region: AppSyncConfig.region,
  auth: {
    type: AppSyncConfig.authenticationType,
    apiKey: AppSyncConfig.apiKey
  }
});

class Todos extends Component {
  state = {
    editing: {},
    edits: {}
  };

  componentDidMount() {
    this.props.data.subscribeToMore(
      buildSubscription(NewTodoSubs, ListTodos)
    );
  }

  handleEditClick = (todo, e) => {
    const { editing, edits } = this.state;

    editing[todo.id] = true;
    edits[todo.id] = { ...todo };

    this.setState({ editing, edits });
  }

  handleCancelClick = (id, e) => {
    const { editing } = this.state;

    delete editing[id];

    this.setState({ editing });
  }

  handleSaveClick = (todoId) => {
    const { edits: { [todoId]: data }, editing } = this.state;

    const { id, name, description, status } = data;

    this.props.updateTodo({
      id,
      name,
      description,
      status,
    });

    delete editing[todoId];

    this.setState({ editing });
  }

  handleDeleteClick = (todoId, e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!global.confirm('Are you sure?')) {
      return;
    }

    this.props.deleteTodo({ id: todoId });
  }

  onChange(todo, field, event) {
    const { edits } = this.state;

    edits[todo.id] = edits[todo.id] || {};

    let value;

    switch (field) {
      case 'status':
        value = event.target.checked ? 'done' : 'pending';
        break;
      default:
        value = event.target.value;
        break;
    }

    edits[todo.id][field] = value;

    this.setState({ edits });
  }

  renderTodo = (todo) => {
    const { editing, edits } = this.state;

    const isEditing = editing[todo.id];
    const currValues = edits[todo.id];

    return (
      isEditing ?
        <li key={todo.id}>
          <input type="text" value={currValues.name || ''} onChange={this.onChange.bind(this, todo, 'name')} placeholder="Name" />
          <input type="text" value={currValues.description || ''} onChange={this.onChange.bind(this, todo, 'description')} placeholder="Description" />
          <input type="checkbox" checked={currValues.status === 'done'} onChange={this.onChange.bind(this, todo, 'status')} />
          <button onClick={this.handleSaveClick.bind(this, todo.id)}>Save</button>
          <button onClick={this.handleCancelClick.bind(this, todo.id)}>Cancel</button>
        </li>
        :
        <li key={todo.id} onClick={this.handleEditClick.bind(this, todo)}>
          {todo.id + ' name: ' + todo.name}
          <input type="checkbox" checked={todo.status === 'done'} disabled={true} />
          <button onClick={this.handleDeleteClick.bind(this, todo.id)}>Delete</button>
        </li>);
  }

  render() {
    const { listTodos, refetch } = this.props.data;

    return (
      <div>
        <button onClick={() => refetch()}>Refresh</button>
        <ul>{listTodos && [...listTodos.items].sort((a, b) => a.name.localeCompare(b.name)).map(this.renderTodo)}</ul>
      </div>
    );
  }
}
const AllTodosWithData = compose(
  graphql(ListTodos),
  graphqlMutation(UpdateTodo, ListTodos, 'Todo'),
  graphqlMutation(DeleteTodo, ListTodos, 'Todo')
)(Todos);

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
const AddTodoOffline = graphqlMutation(NewTodo, ListTodos, 'Todo')(AddTodo);

const WithProvider = () => (
  <ApolloProvider client={client}>
    <Rehydrated>
      <App />
    </Rehydrated>
  </ApolloProvider>
)

export default WithProvider;
