import gql from 'graphql-tag';

export default gql`
query {
  listTodos {
    items {
      id
      name
      description
      status
      version
    }
  }
}`

