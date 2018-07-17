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

