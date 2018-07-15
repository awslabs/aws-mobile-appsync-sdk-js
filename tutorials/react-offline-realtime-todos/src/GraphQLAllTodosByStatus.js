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

