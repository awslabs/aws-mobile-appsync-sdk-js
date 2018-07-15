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

