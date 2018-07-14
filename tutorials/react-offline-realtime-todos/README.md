# Overview

This is an example tutorial of building an offline and realtime enabled React application with the AWS AppSync SDK cache abstractions for the Apollo client.


## Schema

Create a new AppSync API and navigate to the **Schema** page in the console. Select **Create Resources** and enter the following type:

```
type Todo {
  id: ID!
  name: String
  description: String
}
```

Press **Create** at the bottom and your GraphQL API will be connected to a new Amazon DynamoDB table along with resolvers.

In your schema page add an `enum` called `TodoStatus` and modify the `Todo` type to include this:

```
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

Save this schema, then click "Create Resources" and select the "Use existing type" button. Under the table configuration section, add an Index with the name **status-index** that has a Primary key of **status** and Sort key of **none**. Press **Create** at the bottom of the page.

//Add the following to CreateTodoInput and UpdateTodoInput:
  status: TodoStatus

## Imports and configuration

This tutorial assumes you are using Create React App. For simplicity all editing will happen in the `App.js` file. First import the AppSync client SDK dependencies after creating a new React application:

```
create-react-app todos && cd ./todos
yarn add aws-appsync aws-appsync-react graphql-tag react-apollo
```

Next add the following imports:


```javascript
import AWSAppSyncClient, { buildSubscription } from 'aws-appsync';
import { Rehydrated, graphqlMutation } from 'aws-appsync-react';
import AppSyncConfig from './AppSync';
```

Replace everything under the definition of the `<App />` component with the following configuration:

```javascript
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
```

## Add offline reads

Alter the  `<App />` component that simply renders a component called `<AllTodosWithData` like so:

```javascript
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
import { graphql, ApolloProvider } from 'react-apollo';
import listTodos from './GraphQLAllTodos';
```

You will pass this `listTodos` query along with the return type `Todos` of the GraphQL schema, into the `graphql` HOC when you wrap your component like so:

```javascript
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
const AllTodosWithData = graphql(listTodos)(Todos);
```

If you save your file and run this code the queries are automatically persisted offline by the AWS AppSync SDK. To run the code use:
`yarn start`

## Add offline writes

Writing data when offline with mutations is a little different. the AWS AppSync SDK has an interface that will automatically perform optimistic writes to the cache for immediate UI updates. 

The SDK will infer the type of operation by the name of your mutation - for example "createTodo" or "addTodo" are automatically mapped to new items in the cache, however you can provide an operation type override. Additionally the SDK will perform automatic versioning of objects if you choose to use the conflict resolution controls of AWS AppSync. We will show you how this is done later.

The main difference when using the AppSync SDK to perform offline mutations is that you must specify one or more queries (as opposed to mutations) which are updated. Since the Apollo cache is keyed by queries, this means that if you want one or more portions of your UI to update when offline you also pass them along with the mutation and response GraphQL type defined in your schema.

**Step 1: Create a mutation component**

Next, you will create a `<AddTodo />` component and wrap it with the same name using an HOC (you could also rename it as we did earlier). You first need to create a file called `GraphQLNewTodo.js`:

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

Note the mutation is called `createTodo` - this will be what your prop is named in the component below.

Import this into the top of your main application file:

```javascript
import NewTodo from './GraphQLNewTodo';
```

Now create the `<AddTodo />` component and wrap it with the `graphqlMutation()` function along with the `listTodos` query which will be updated in the cache automatically, as well as the `Todo` response type (defined in your GraphQL schema):

```javascript
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

```

The way `graphqlMutation` works is it takes in 3 required arguments:
- The mutation to run
- One or more queries to update in the cache
- The GraphQL response signature of the mutation (__typename)

There are also 2 optional arguments:
- The name of the 'id' field, if you are not using id on the type
- An `operationType` override if you do not want to infer actions such as "add" or "update" from the mutation name

To invoke the mutation, you will need to call this function which is passed as a prop to the component. The prop will be named after the mutation defined in the GraphQL schema. In the above example, this is `createTodo` which you call when clicking a button. Arguments to a mutation can also be passed such as the `name`, `description`, and `status` above. Also note that you will need to pass any arguments which are in the selection set of the query in the second parameter of `graphqlMutation`.

Finally, update your `<App />` component to include the new `<AddTodoOffline />` component:

```javascript
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
import NewTodoSubs from './GraphQLSubscribeTodos';
```


It is recommended to initiate the subscription inside of the `componentDidMount()` lifecyle method like so:

```javascript
class Todos extends Component {

  componentDidMount(){
    this.props.data.subscribeToMore(
      buildSubscription(NewTodoSubs, listTodos)
    );
  }
  //...More code
  ```

`buildSubscription` uses the `NewTodoSubs` document defining the subscription to create and `listTodos` defining what query in the cache to automatically update. It also accepts two additional optional parameters:
- idField, used if your GraphQL subscription response type uses something other than `id`
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

Now modify the resolver Request Mapping template attached to the `updateTodo` field like so:

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

