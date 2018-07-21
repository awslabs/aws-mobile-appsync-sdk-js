# Offline Helpers

The SDK provides the following helpers:
- `graphqlMutation`
- `buildSubscription`

By default, the helpers look at the GraphQL operation name of the subscription/mutation and modify the cached results of the queries provided by either **adding**, **removing** or **updating** items in the result.

---

## `graphqlMutation`
### Import
```javascript
import { buildSubscription } from "aws-appsync";
```

### Signature
```typescript
graphqlMutation(
    mutation: DocumentNode,
    cacheUpdateQuery: CacheUpdatesOptions,
    typename: string,
    idField?: string,
    operationType?: CacheOperationTypes
): React.Component
```

### Parameters
- `subscriptionQuery: CacheUpdateQuery` - The GraphQL subscription DocumentNode or CacheUpdateQuery
- `cacheUpdateQuery: CacheUpdateQuery` - The query for which the result needs to be updated
- (Optional) `idField: string`
- (Optional) `operationType: CacheOperationTypes` - One of `'auto'`, `'add'`, `'remove'`, `'update'`.
- Returns `React.Component` - A react HOC with a prop named after the graphql mutation (e.g. `this.props.addTodo`) 

---

## `buildSubscription`

Builds a SubscribeToMoreOptions object ready to be used by Apollo's `subscribeToMore()` to automatically update the query result in the cache according to the `cacheUpdateQuery` parameter

### Import
```javascript
import { graphqlMutation } from 'aws-appsync-react';
```

### Signature
```typescript
buildSubscription(
    subscriptionQuery: CacheUpdateQuery,
    cacheUpdateQuery: CacheUpdateQuery,
    idField?: string,
    operationType?: CacheOperationTypes
): SubscribeToMoreOptions
```

### Parameters
- `subscriptionQuery: CacheUpdateQuery` - The GraphQL subscription DocumentNode or CacheUpdateQuery
- `cacheUpdateQuery: CacheUpdateQuery` - The query for which the result needs to be updated
- (Optional) `idField: string`
- (Optional) `operationType: CacheOperationTypes` - One of `'auto'`, `'add'`, `'remove'`, `'update'`.
- Returns `SubscribeToMoreOptions` - Object expected by `subscribeToMore()`

---

## Actions and their list of prefixes when using `CacheOperationTypes.AUTO`
| | add | remove | update |
| --- | ---- | ---- | ---- |
| | update | delete | create
| | updated | deleted | created
| | upsert | discard | put
| | upserted | discarded | set
| | edit | erase | add
| | edited | erased | added
| | modify | remove | new
| | modified | removed | insert
| | | | inserted

---

## Examples

## Different ways `CacheUpdatesOptions` can be provided
\* (All lines are equivalent)

```javascript
// Passing a DocumentNode
graphqlMutation(NewTodo, ListTodos)

// Passing a QueryWithVariables
graphqlMutation(NewTodo, { query: ListTodos })

// Passing an array of DocumentNode
graphqlMutation(NewTodo, [ ListTodos ])

// Passing an array of QueryWithVariables
graphqlMutation(NewTodo, [ { query: ListTodos, variables: {} } ])

// Passing an object
graphqlMutation(NewTodo, { 'auto': [ ListTodos ] })

// Passing a function that returns an object
graphqlMutation(NewTodo, (vars) => {
    return { 'auto': [ ListTodos ] };
})
```

---

## Types reference
```typescript
enum CacheOperationTypes {
    AUTO = 'auto',
    ADD = 'add',
    REMOVE = 'remove',
    UPDATE = 'update',
};

type CacheUpdatesOptions = (variables?: object) => CacheUpdatesDefinitions | CacheUpdatesDefinitions;

type CacheUpdatesDefinitions = {
    [key in CacheOperationTypes]?: CacheUpdateQuery | CacheUpdateQuery[]
};

type CacheUpdateQuery = QueryWithVariables | DocumentNode; // DocumentNode is an object return by the gql`` function

type QueryWithVariables = {
    query: DocumentNode,
    variables?: object,
};
```
