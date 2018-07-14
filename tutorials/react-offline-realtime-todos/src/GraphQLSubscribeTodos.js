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