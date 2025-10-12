# Migration Guide: Upgrading from v3 to v4

This guide will help you upgrade your application from `aws-appsync-auth-link` v3.x and `aws-appsync-subscription-link` v3.x to v4.x.

## Overview

Version 4 of the AWS AppSync Apollo links brings compatibility with **Apollo Client v4** and includes several important updates:

- ✅ Apollo Client v4 support
- ✅ GraphQL v16 support
- ✅ Dual module format (ESM + CommonJS)
- ✅ Browser environment compatibility improvements
- ✅ RxJS v7+ peer dependency

## Breaking Changes

### 1. Apollo Client v4 Required

**v3:**
```json
{
  "dependencies": {
    "@apollo/client": "^3.2.0"
  }
}
```

**v4:**
```json
{
  "dependencies": {
    "@apollo/client": "^4.0.0"
  }
}
```

You must upgrade to Apollo Client v4. Follow the [official Apollo Client v4 migration guide](https://www.apollographql.com/docs/react/migrating/apollo-client-4-migration) for details on Apollo-specific changes.

### 2. GraphQL v16 Required

v4 requires GraphQL v16 (previously v15 was supported).

**Update your dependencies:**
```bash
npm install graphql@^16.0.0
# or
yarn add graphql@^16.0.0
```

### 3. RxJS v7+ Peer Dependency Added

Both packages now have RxJS as a peer dependency. If you don't already have it installed:

```bash
npm install rxjs@^7.0.0
# or
yarn add rxjs@^7.0.0
```

### 4. Minimum Node.js Version

Due to Apollo Client v4 requirements, ensure you're using:
- **Node.js 14.16+** or higher

## Step-by-Step Migration

### Step 1: Update Package Dependencies

Update your `package.json`:

```json
{
  "dependencies": {
    "@apollo/client": "^4.0.0",
    "aws-appsync-auth-link": "^4.0.0",
    "aws-appsync-subscription-link": "^4.0.0",
    "graphql": "^16.0.0",
    "rxjs": "^7.0.0"
  }
}
```

Then install:

```bash
npm install
# or
yarn install
```

### Step 2: Update Apollo Client Imports

Apollo Client v4 has some import changes. The most common:

**Before (v3):**
```javascript
import { ApolloClient, InMemoryCache, HttpLink } from '@apollo/client';
```

**After (v4):**
```javascript
// Same imports work, but check Apollo's migration guide for any
// specific features you're using
import { ApolloClient, InMemoryCache, HttpLink } from '@apollo/client';
```

### Step 3: Update Your Client Setup

Your client setup remains largely the same:

```javascript
import { createAuthLink } from 'aws-appsync-auth-link';
import { createSubscriptionHandshakeLink } from 'aws-appsync-subscription-link';
import {
  ApolloClient,
  InMemoryCache,
  HttpLink,
  ApolloLink,
} from '@apollo/client';

const url = 'https://xxxxx.appsync-api.us-east-1.amazonaws.com/graphql';
const region = 'us-east-1';

const auth = {
  type: 'API_KEY', // or 'AWS_IAM' | 'AMAZON_COGNITO_USER_POOLS' | 'OPENID_CONNECT' | 'AWS_LAMBDA'
  apiKey: 'da2-xxxxxxxxxxxxxxxxxxxxxxxxxx',
  // For Cognito or OIDC:
  // jwtToken: async () => 'your-jwt-token',
  // For IAM:
  // credentials: async () => credentials,
};

const httpLink = new HttpLink({ uri: url });

const link = ApolloLink.from([
  createAuthLink({ url, region, auth }),
  createSubscriptionHandshakeLink({ url, region, auth }, httpLink),
]);

const client = new ApolloClient({
  link,
  cache: new InMemoryCache(),
});
```

## Common Issues & Solutions

### Issue: "Dynamic require of 'buffer' is not supported"

**Solution:** This issue has been fixed in v4. If you're still seeing it, ensure you've:
1. Installed v4.0.0 or higher
2. Cleared your `node_modules` and reinstalled
3. Rebuilt your application

### Issue: Import errors with Vite or other ESM bundlers

**Solution:** v4 now properly supports ESM. Ensure you're using the latest version and that your bundler is configured to resolve the `exports` field in `package.json`.

### Issue: TypeScript errors after upgrade

**Solution:**
1. Update `@types/graphql` if you have it installed
2. Ensure your `tsconfig.json` has proper module resolution:
```json
{
  "compilerOptions": {
    "moduleResolution": "node",
    "esModuleInterop": true
  }
}
```

## Apollo Client v4 Specific Changes

When migrating to Apollo Client v4, be aware of these key changes:

### 1. Observable Implementation

Apollo Client v4 uses RxJS instead of zen-observable:

```javascript
// v3 - zen-observable
import { Observable } from 'zen-observable-ts';

// v4 - RxJS (usually not needed in user code)
import { Observable } from 'rxjs';
```

### 2. Cache API Changes

Some cache methods have changed. Refer to the [Apollo Client v4 migration guide](https://www.apollographql.com/docs/react/migrating/apollo-client-4-migration) for details.

## Testing Your Migration

After upgrading, test these key areas:

### 1. Authentication

Test all auth types you're using:

```javascript
// API Key
const auth = {
  type: 'API_KEY',
  apiKey: 'your-api-key',
};

// IAM
const auth = {
  type: 'AWS_IAM',
  credentials: async () => ({
    accessKeyId: 'xxx',
    secretAccessKey: 'xxx',
    sessionToken: 'xxx',
  }),
};

// Cognito User Pools
const auth = {
  type: 'AMAZON_COGNITO_USER_POOLS',
  jwtToken: async () => 'your-jwt-token',
};

// OIDC
const auth = {
  type: 'OPENID_CONNECT',
  jwtToken: async () => 'your-jwt-token',
};

// Lambda
const auth = {
  type: 'AWS_LAMBDA',
  token: async () => 'your-token',
};
```

### 2. Queries

```javascript
import { gql, useQuery } from '@apollo/client';

const GET_ITEMS = gql`
  query GetItems {
    listItems {
      items {
        id
        name
      }
    }
  }
`;

function MyComponent() {
  const { loading, error, data } = useQuery(GET_ITEMS);

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;

  return <div>{/* Render your data */}</div>;
}
```

### 3. Mutations

```javascript
import { gql, useMutation } from '@apollo/client';

const CREATE_ITEM = gql`
  mutation CreateItem($input: CreateItemInput!) {
    createItem(input: $input) {
      id
      name
    }
  }
`;

function MyComponent() {
  const [createItem, { data, loading, error }] = useMutation(CREATE_ITEM);

  const handleCreate = () => {
    createItem({ variables: { input: { name: 'New Item' } } });
  };

  return <button onClick={handleCreate}>Create</button>;
}
```

### 4. Subscriptions

```javascript
import { gql, useSubscription } from '@apollo/client';

const ON_CREATE_ITEM = gql`
  subscription OnCreateItem {
    onCreateItem {
      id
      name
    }
  }
`;

function MyComponent() {
  const { data, loading, error } = useSubscription(ON_CREATE_ITEM);

  if (loading) return <p>Listening...</p>;
  if (error) return <p>Error: {error.message}</p>;

  return <div>{/* Render subscription data */}</div>;
}
```

## React Native Considerations

If you're using React Native:

1. Ensure you have the proper polyfills for `fetch` and WebSocket
2. Apollo Client v4 may have additional React Native requirements - check the [Apollo docs](https://www.apollographql.com/docs/react/integrations/react-native/)

## Rollback Strategy

If you encounter issues, you can rollback to v3:

```bash
npm install @apollo/client@^3.2.0 aws-appsync-auth-link@^3.0.0 aws-appsync-subscription-link@^3.0.0 graphql@^15.0.0
# or
yarn add @apollo/client@^3.2.0 aws-appsync-auth-link@^3.0.0 aws-appsync-subscription-link@^3.0.0 graphql@^15.0.0
```

## Additional Resources

- [Apollo Client v4 Migration Guide](https://www.apollographql.com/docs/react/migrating/apollo-client-4-migration)
- [GraphQL v16 Release Notes](https://github.com/graphql/graphql-js/releases/tag/v16.0.0)
- [AWS AppSync Documentation](https://docs.aws.amazon.com/appsync/)
- [GitHub Issues](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues)

## Need Help?

If you encounter issues during migration:

1. Check the [GitHub Issues](https://github.com/awslabs/aws-mobile-appsync-sdk-js/issues)
2. Review the [AWS AppSync Forum](https://forums.aws.amazon.com/forum.jspa?forumID=280)
3. Open a new issue with:
   - Your package versions
   - Error messages
   - Minimal reproduction code

## What's New in v4?

Beyond the breaking changes, v4 includes:

- **Better Bundle Size**: Proper externalization of dependencies reduces bundle size
- **Improved Browser Compatibility**: No more Node.js polyfills in browser bundles
- **Modern Module Format**: Full ESM support with backwards-compatible CommonJS
- **Updated Dependencies**: Latest security patches and improvements

---

**Last Updated:** 2025-10-12
