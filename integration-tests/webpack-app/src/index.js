/**
 * Webpack Browser Integration Test
 *
 * This test ensures that the packages can be bundled with Webpack
 * and work correctly in a browser environment.
 *
 * Common issues this catches:
 * - Node.js built-ins being bundled for browser
 * - Module resolution issues
 * - Class constructor issues with transpiled code
 */

import { createAuthLink, AUTH_TYPE } from 'aws-appsync-auth-link';
import { createSubscriptionHandshakeLink } from 'aws-appsync-subscription-link';
import { ApolloClient, InMemoryCache, ApolloLink } from '@apollo/client/core';

console.log('🧪 Testing Webpack build...');

// Test auth-link
const authLink = createAuthLink({
  url: 'https://example.appsync-api.us-east-1.amazonaws.com/graphql',
  region: 'us-east-1',
  auth: {
    type: AUTH_TYPE.API_KEY,
    apiKey: 'test-key'
  }
});

console.log('✓ createAuthLink works in Webpack');

// Test subscription-link
const subscriptionLink = createSubscriptionHandshakeLink({
  url: 'https://example.appsync-api.us-east-1.amazonaws.com/graphql',
  region: 'us-east-1',
  auth: {
    type: AUTH_TYPE.API_KEY,
    apiKey: 'test-key'
  }
});

console.log('✓ createSubscriptionHandshakeLink works in Webpack');

// Test creating Apollo Client (real-world usage)
const client = new ApolloClient({
  link: ApolloLink.from([authLink, subscriptionLink]),
  cache: new InMemoryCache(),
});

console.log('✓ Apollo Client created successfully');

// If we get here, the build succeeded
console.log('✅ Webpack build test passed!');

export { client };
