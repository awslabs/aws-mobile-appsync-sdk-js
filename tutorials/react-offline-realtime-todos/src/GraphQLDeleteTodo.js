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

