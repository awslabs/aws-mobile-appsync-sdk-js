import gql from 'graphql-tag';

export default gql`
mutation($name: String $description: String $status:TodoStatus) {
  createTodo(input : { name:$name description:$description status:$status}){
    id
    name
    description
    status
    version
  }
}`

