# Overview

This is an example tutorial of building an offline and realtime enabled React application with the AWS AppSync SDK cache abstractions for the Apollo client. The tutorial takes you through a sample GraphQL schema for a "Todo" application in steps:
- Persisting queries offline for reads
- Mutations offline, with automatic optimistic UI and syncronization
- Subscribing to data and automatically updating UI
- Mutations with version checks and conflict resolution
- Mutations to update multiple UIs (e.g. queries) simultaneously

If you have never used AWS AppSync before it may be useful [follow the Quickstart Documentation](https://docs.aws.amazon.com/appsync/latest/devguide/quickstart.html).

## Schema

Before connecting your client you need a GraphQL API.

Navigate to the AWS AppSync console, create a new API selecting **Author from scratch**, click the **Create** button and navigate to the **Schema** page. Add the following schema:

```graphql
type Todo {
	id: ID!
	name: String
	description: String
	status: TodoStatus
}

enum TodoStatus {
	done
	pending
}

type Query {
	get:[Todo]
}
```

Press **Save Schema**, then click **Create Resources**, select the "Use existing type" button and under **Select a type** choose `Todo`. Under the table configuration section, add an Index by clicking **Additional Indexes**, then **Add Index** with the name **status-index** that has a Primary key of **status** and Sort key of **none**. Press **Create** at the bottom of the page.

Once the process completes edit the schema input types so that `CreateTodoInput` and `UpdateTodoInput` have a `status: TodoStatus` field:

```graphql
input CreateTodoInput {
	name: String
	description: String
	status: TodoStatus
}

input UpdateTodoInput {
	id: ID!
	name: String
	description: String
	status: TodoStatus
}
```

**Save** the schema again. On the navigation bar in the left of the console, click on `<your api name>`, scroll down and select the **Web** section then click **Download** and save the `AppSync.js` file somewhere for later.

## Imports and configuration

This tutorial assumes you have [Create React App](https://github.com/facebook/create-react-app) installed. For simplicity all editing will happen in the `App.js` file but you can modularize your directory and file structure as necessary. 

First import the AppSync client SDK dependencies after creating a new React application:

```
create-react-app todos && cd ./todos
yarn add aws-appsync aws-appsync-react graphql-tag react-apollo
```

Copy the `AppSync.js` file that you downloaded from the console into the `./todos/src` directory. Next add the following imports towards the top of the `App.js` file:


```javascript
import AWSAppSyncClient, { buildSubscription } from 'aws-appsync';
import { Rehydrated, graphqlMutation } from 'aws-appsync-react';
import AppSyncConfig from './AppSync';
import { ApolloProvider } from 'react-apollo';
```

Replace everything __after__ the definition of the `<App />` component with the following configuration:

```jsx
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

export default WithProvider;
```

Save the file and ensure everything runs in a browser by starting the app from your terminal:

`yarn start`

## Add offline reads

The first step is to ensure your Todos can be displayed when offline. Alter the  `<App />` component that simply renders a component called `<AllTodosWithData />` like so:

```jsx
class App extends Component {
  render() {
    return (
      <div className="App">
        <AllTodosWithData />
      </div>
    );
  }
}
```

Next, you will create a `<Todo />` component and wrap it with a HOC that we assign as `<AllTodosWithData />`. You first need to create a file inside the `src` directory called `GraphQLAllTodos.js`:

```javascript
import gql from 'graphql-tag';

export default gql`
query {
  listTodos {
    items {
      id
      name
      description
      status
    }
  }
}`
```

Then import it as well as the `graphql` HOC at the top of your main application file:


```javascript
import { graphql } from 'react-apollo';
import ListTodos from './GraphQLAllTodos';
```

You will pass this `ListTodos` query along with the return type `Todos` of the GraphQL schema, into the `graphql` HOC when you wrap your component like so:

```jsx
class Todos extends Component {
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
const AllTodosWithData = graphql(ListTodos)(Todos);
```

If you save your file and run this code the queries are automatically persisted offline by the AWS AppSync SDK. To run the code use:
`yarn start`

At this point you can test by adding Todos into your GraphQL backend from the console and refreshing your queries by pressing the **Refresh** button displayed in the screen. Go back into the AWS AppSync console and in your API select the **Queries** pane in the lefthand navigation. Enter the following into the text area:

```
mutation addTodo {
  createTodo(input:{
    name:"My TODO"
    description:"Testing from the console"
    status:pending
  }){
    id
    name
    description
    status
  }
}
```

Press the arrow at the top to run your query and then from the running client application press the **Refresh** button. Alter the mutation text for `name` and `description` a couple of times in the console and add more items then refresh the client again. If you keep the app running, or build as a PWA, but disable the network connection (which can be similated in browsers such as Google Chrome) the items will be persisted in the cache and visible on the screen.

## Add offline writes

Of course some applications will want to write from the client application as well and not just add Todos from the console. Writing data when offline with mutations is a little different. The AWS AppSync SDK has an interface that will automatically perform optimistic writes to the cache for immediate UI updates. 

The SDK will infer the type of operation by the name of your mutation - for example "createTodo" or "addTodo" are automatically mapped to new items in the cache, however you can provide an operation type override. Additionally the SDK will perform automatic versioning of objects if you choose to use the conflict resolution controls of AWS AppSync. We will show you how this is done later.

The main difference when using the AppSync SDK to perform offline mutations is that you must specify one or more queries (as opposed to mutations) which are updated. Since the Apollo cache is keyed by queries, this means that if you want one or more portions of your UI to update when offline you also pass them along with the mutation and response GraphQL type defined in your schema.

**Step 1: Create a mutation component**

Next, you will create a `<AddTodo />` component and wrap it with a HOC that we assign as `<AddTodoOffline />`. You first need to create a file called `GraphQLNewTodo.js`:

```javascript
import gql from 'graphql-tag';

export default gql`
mutation($name: String $description: String $status:TodoStatus) {
  createTodo(input : { name:$name description:$description status:$status}){
    id
    name
    description
    status
  }
}`
```

Note the mutation is called `createTodo`,  this will be what your prop is named in the when you add the mutation to the component below that will add Todos on the screen and invoke the operation.

Import the mutation by adding the following into the top of `App.js`:

```javascript
import NewTodo from './GraphQLNewTodo';
```

Now create the `<AddTodo />` component and wrap it with the `graphqlMutation()` function along with the `ListTodos` query which will be updated in the cache automatically, as well as the `Todo` response type (defined in your GraphQL schema):

```jsx
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

```

The way `graphqlMutation` works is it takes in 3 required arguments:
- The mutation to run
- One or more queries to update in the cache
- The GraphQL response signature of the mutation (`__typename`)

There are also 2 optional arguments:
- The name of the 'id' field, if you are not using id on the type
- An `operationType` override if you do not want to infer actions such as "add" or "update" from the mutation name

To invoke the mutation, you will need to call this function which is passed as a prop to the component. The prop will be named after the mutation defined in the GraphQL schema. In the above example, this is `createTodo` which you call when clicking a button. Arguments to a mutation can also be passed such as the `name`, `description`, and `status` above. Also note that you will need to pass any arguments which are in the selection set of the query in the second parameter of `graphqlMutation`.

Finally, update your `<App />` component to include the new `<AddTodoOffline />` component:

```jsx
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
```

## Add realtime subscriptions

Realtime subscriptions can also have the incoming payload merged into the Apollo cache automatically with the AppSync SDK. To do this you will use the `buildSubscription` utility as part of the `subscribeToMore` prop in your React component, along with two arguments: the subscription document and query in the cache that will be update. Start by creating a `GraphQLSubscribeTodos.js` file in your `src` directory with the following contents:

```javascript
import gql from 'graphql-tag';

export default gql`
subscription{
  onCreateTodo{
    id
    name
    description
    status
  }
}`
```

Import this into your `App.js` file:

```javascript
import SubscribeTodos from './GraphQLSubscribeTodos';
```

It is recommended to initiate the subscription inside of the `componentDidMount()` lifecyle method of the `<Todos />` component like so:

```javascript
class Todos extends Component {

  componentDidMount(){
    this.props.data.subscribeToMore(
      buildSubscription(SubscribeTodos, {}, ListTodos)
    );
  }
  //...More code
  ```

`buildSubscription` uses the `SubscribeTodos` document defining the subscription to create, the variables for the subscription (`{}` in this case since `SubscribeTodos` doesn't require them) and `ListTodos` defining what query in the cache to automatically update. It also accepts two additional optional parameters:
- `idField`, used if your GraphQL subscription response type uses something other than "id"
- `operationType` override if you do not want to infer actions such as "add" or "update" from the subscription name

Run the application again, and invoke a mutation from the AppSync console like so:

```
mutation addTodo {
  createTodo(input:{
    name:"Testing"
    description:"Console test"
    status:pending
  }){
    id
    name
    description
    status
  }
}
```

You should see the change automatically show up in your client application. Note that the `id`, `name`, `description`, and `status` are sent in the GraphQL "selection set". In AWS AppSync it is necessary for mutations that trigger subscriptions to specify all of the fields you want subscribers to recieve. 

## Version checks and conflict resolution

If you wanted to add capabilities to perform updates to your Todos you could use the generated `updateTodo` mutation and just create a new component. However if performing offline functions or shared data it is valuable to perform version checks against each individual object.

The SDK will automatically account for this, however you will need to modify the schema as well as your resolvers in order to do server validaton on the versions.   Edit your schema as following:

- Add a `version` field in the `Todo` type
- Add a required field of `expectedVersion` to `UpdateTodoInput`

```
type Todo {
	id: ID!
	name: String
	description: String
	status: TodoStatus
        version: Int
}

input UpdateTodoInput {
	id: ID!
	name: String
	description: String
	status: TodoStatus
        expectedVersion:Int!
}
```

Also, modify the resolver Request Mapping Template for `createTodo` so that it automatically creates objects with a version of `1` by default:

```
#set( $attribs = $util.dynamodb.toMapValues($ctx.args.input) )
#set( $attribs.version = { "N" : 1 } )
##set( $attribs.status = { "S" : "pending" } )
{
  "version": "2017-02-28",
  "operation": "PutItem",
  "key": {
    "id": $util.dynamodb.toDynamoDBJson($util.autoId()),
  },
  "attributeValues" : $util.toJson($attribs),
  "condition": {
    "expression": "attribute_not_exists(#id)",
    "expressionNames": {
      "#id": "id",
    },
  },
}
```

If you are unfamiliar with editing resolvers in AWS AppSync please [reference this section of the documentation](https://docs.aws.amazon.com/appsync/latest/devguide/configuring-resolvers.html).

Notice that we have commented out `set( $attribs.status = { "S" : "pending" } )`. If you wanted the resolver in AppSync to automatically set the status as `pending` for any new items created you can uncomment this line by removing the first `#`.

Now modify the resolver Request Mapping template attached to the `updateTodo` field and overwite it with the contents below:

```
{
    "version" : "2017-02-28",
    "operation" : "UpdateItem",
    "key" : {
        "id" : $util.dynamodb.toDynamoDBJson($ctx.args.input.id)
    },

    ## Set up some space to keep track of things we're updating **
    #set( $expNames  = {} )
    #set( $expValues = {} )
    #set( $expSet = {} )
    #set( $expAdd = {} )
    #set( $expRemove = [] )

    ## Increment "version" by 1 **
    $!{expAdd.put("version", ":one")}
    $!{expValues.put(":one", $util.dynamodb.toDynamoDB(1))}

    ## Iterate through each argument, skipping "id" and "expectedVersion" **
    #foreach( $entry in $util.map.copyAndRemoveAllKeys($ctx.args.input, ["id","expectedVersion"]).entrySet() )
        #if( $util.isNull($entry.value) )
            ## If the argument is set to "null", then remove that attribute from the item in DynamoDB **

            #set( $discard = ${expRemove.add("#${entry.key}")} )
            $!{expNames.put("#${entry.key}", "${entry.key}")}
        #else
            ## Otherwise set (or update) the attribute on the item in DynamoDB **

            $!{expSet.put("#${entry.key}", ":${entry.key}")}
            $!{expNames.put("#${entry.key}", "${entry.key}")}
            $!{expValues.put(":${entry.key}", $util.dynamodb.toDynamoDB($entry.value))}
        #end
    #end

    ## Start building the update expression, starting with attributes we're going to SET **
    #set( $expression = "" )
    #if( !${expSet.isEmpty()} )
        #set( $expression = "SET" )
        #foreach( $entry in $expSet.entrySet() )
            #set( $expression = "${expression} ${entry.key} = ${entry.value}" )
            #if ( $foreach.hasNext )
                #set( $expression = "${expression}," )
            #end
        #end
    #end

    ## Continue building the update expression, adding attributes we're going to ADD **
    #if( !${expAdd.isEmpty()} )
        #set( $expression = "${expression} ADD" )
        #foreach( $entry in $expAdd.entrySet() )
            #set( $expression = "${expression} ${entry.key} ${entry.value}" )
            #if ( $foreach.hasNext )
                #set( $expression = "${expression}," )
            #end
        #end
    #end

    ## Continue building the update expression, adding attributes we're going to REMOVE **
    #if( !${expRemove.isEmpty()} )
        #set( $expression = "${expression} REMOVE" )

        #foreach( $entry in $expRemove )
            #set( $expression = "${expression} ${entry}" )
            #if ( $foreach.hasNext )
                #set( $expression = "${expression}," )
            #end
        #end
    #end

    ## Finally, write the update expression into the document, along with any expressionNames and expressionValues **
    "update" : {
        "expression" : "${expression}",
        #if( !${expNames.isEmpty()} )
            "expressionNames" : $utils.toJson($expNames),
        #end
        #if( !${expValues.isEmpty()} )
            "expressionValues" : $utils.toJson($expValues),
        #end
    },

    "condition" : {
        "expression"       : "version = :expectedVersion",
        "expressionValues" : {
            ":expectedVersion" : $util.dynamodb.toDynamoDBJson($ctx.args.input.expectedVersion)
        }
    }
}
```

Without going into too much details, the above template will perform conditional checks on the version to ensure that the client is only able to perform an update if the version matches what is in the database. Additionally if the mutation does succeed then the version will be incremented, sent back to the client and updated in it's cache.

It's worth noting that if you have an application where many users or devices can be performing mutations on shared objects, then ideally you should have all of your clients setup a subscription to `onUpdateTodo` and `onDeleteTodo` which were automatically setup in the provisioning process to be invoked when `updateTodo` and `deleteTodo` run successfully. You can modify the `<Todos />` component to listen for more subscriptions by adding new subcriptions to the `./src/GraphQLSubscribeTodos.js` file like so:

```javascript
import gql from 'graphql-tag';

export default gql`
subscription{
  onCreateTodo{
    id
    name
    description
    status
    version
  }
  onUpdateTodo{
    id
    name
    description
    status
    version
  }
  onDeleteTodo{
    id
    name
    description
    status
    version
  }
}`
```

To make updates to items, you can use the AppSync console but the client SDK supports mutations on multiple items offline which are queued. To track this in a React component takes a little orchestration unrelated to AppSync or the SDK, so we have included a ready to use `App.js` file in the sample directory that you can use in this example (called `AppComplete.js`). The mutations for edits and deletes are similar to before.

Create the `./src/GraphQLUpdateTodo.js` file with the following content:

```javascript
import gql from 'graphql-tag';

export default gql`
mutation($id: ID! $name: String $description: String $status: TodoStatus $version: Int!) {
  updateTodo(input:{
    id: $id
    name: $name
    description: $description
    status: $status
    expectedVersion: $version
  }){
    id
    name
    description
    status
    version
  }
}`
```

Create the `./src/GraphQLDeleteTodo.js` file with the following content:

```javascript
import gql from 'graphql-tag';

export default gql`
mutation($id: ID!) {
  deleteTodo(input:{id: $id}){
    id
    name
    description
    status
    version
  }
}`
```
 
Import both of these into your application:

```javascript
import UpdateTodo from './GraphQLUpdateTodo';
import DeleteTodo from './GraphQLDeleteTodo';
```

 In `AppComplete.js` you'll notce that it is possible to `compose` multiple `graphql` and `graphqlMutation` HOCs into a single component to allow scenarios like a component that does one query and two mutations:

```javascript
import { graphql, compose } from 'react-apollo';
```

 ```javascript
 const AllTodosWithData = compose(
  graphql(ListTodos),
  graphqlMutation(UpdateTodo, ListTodos, 'Todo'),
  graphqlMutation(DeleteTodo, ListTodos, 'Todo')
)(Todos);
 ```

When you run this version of the app, each item in  `<AllTodosWithData />` can be edited and the appropriate mutation will take place. Even though the mutations are being composed, they are still invoked via a prop passed into your component from the GraphQL mutation name:

```javascript
  handleDeleteClick = (todoId, e) => {
    this.props.deleteTodo({ id: todoId });
  }

  handleSaveClick = (todoId) => {
    this.props.updateTodo({
      id,
      name,
      description,
      status,
    });
  }

```

## Updating multiple queries with a mutation

In a client applications, different parts of your UI correlate to one or more GraphQL queries. As such you may want to update different parts of the UI simultaneously when a single mutation runs.

For example, we have a `status` flag as a GraphQL `enum` in this schema. Your UI might show:
- All Todos in the system
- Pending Todos yet to be completed
- Done Todos that have been executed

With this layout you might want the following in your UI:
- When adding a Todo, update the "All Todos" and "Pending Todos" queries with a new item
- When marking a Todo completed, update the status for that Todo in the "All Todos" list, remove it from the "Pending Todos" cache results, and add it to the "Done Todos" cache

Of course for all of these not only do you want the cache management in the client but the mutations should flow through to eventually converge in your backend. The AppSync client supports this flow no matter if the client is online or offline. 

First, you'll need to make a slight change in your GraphQL schema. Find the query field `queryTodosByStatusIndex` and alter it to look like this:

```
queryTodosByStatusIndex(status: TodoStatus!, first: Int, after: String): TodoConnection
```

Next create `./src/GraphQLAllTodosByStatus.js` file with the following content:

```javascript
import gql from 'graphql-tag';

export default gql`
query($status: TodoStatus!) {
  queryTodosByStatusIndex(status: $status) {
    items {
      id
      name
      description
      status
      version
    }
  }
}`
```

Import both of this into your application:

```javascript
import ListTodosByStatus from './GraphQLAllTodosByStatus';
```

These changes will allow you to use the `status` enum in a query and properly update different parts of the Apollo cache reflected in your UI with a single mutation. The UI code for this is already included in the `AppComplete.js` file, and you will see how similar to the editing case earlier the `compose` function is used to wrap multiple operations in a single component. This time however, you can modify the `graphqlMutation` for `UpdateTodo` and `deleteTodo` so that it conditionally modifies the appropriate "Pending" and "Done" sections of your cache & UI:

```javascript
const AllTodosWithData = compose(
  graphql(ListTodos),
  graphqlMutation(UpdateTodo,
    ({ status }) => ({
      'auto': ListTodos,

      // When status is done, add to ListTodosByStatus(status: done), else add to ListTodosByStatus(status: pending)
      'add': status === 'done' ? { query: ListTodosByStatus, variables: { status: 'done' } } : { query: ListTodosByStatus, variables: { status: 'pending' } },

      // When status is done, remove from ListTodosByStatus(status: pending), else remove from ListTodosByStatus(status: done)
      'remove': status === 'done' ? { query: ListTodosByStatus, variables: { status: 'pending' } } : { query: ListTodosByStatus, variables: { status: 'done' } },
    }),
    'Todo'),
  graphqlMutation(DeleteTodo, {
    'auto': [
      ListTodos,
      { query: ListTodosByStatus, variables: { status: 'done' } },
      { query: ListTodosByStatus, variables: { status: 'pending' } }
    ]
  }, 'Todo')
)(Todos);
```
