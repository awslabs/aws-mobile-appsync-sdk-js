/**
 * Vite Browser Integration Test
 *
 * This test ensures that the packages can be bundled with Vite
 * and work correctly in a browser environment (TypeScript React app scenario).
 *
 * Common issues this catches:
 * - "Dynamic require of 'buffer' is not supported"
 * - Node.js built-ins in browser bundles
 * - Class constructor issues with transpiled code
 */

import { createAuthLink, AUTH_TYPE } from 'aws-appsync-auth-link';
import { createSubscriptionHandshakeLink } from 'aws-appsync-subscription-link';
import { ApolloClient, InMemoryCache, ApolloLink } from '@apollo/client/core';

console.log('🧪 Testing Vite build...');

// Test auth-link
const authLink = createAuthLink({
  url: 'https://example.appsync-api.us-east-1.amazonaws.com/graphql',
  region: 'us-east-1',
  auth: {
    type: AUTH_TYPE.API_KEY,
    apiKey: 'test-key'
  }
});

console.log('✓ createAuthLink works in Vite');

// Test subscription-link
const subscriptionLink = createSubscriptionHandshakeLink({
  url: 'https://example.appsync-api.us-east-1.amazonaws.com/graphql',
  region: 'us-east-1',
  auth: {
    type: AUTH_TYPE.API_KEY,
    apiKey: 'test-key'
  }
});

console.log('✓ createSubscriptionHandshakeLink works in Vite');

// Test creating Apollo Client (real-world usage)
const client = new ApolloClient({
  link: ApolloLink.from([authLink, subscriptionLink]),
  cache: new InMemoryCache(),
});

console.log('✓ Apollo Client created successfully');

// If we get here, the build succeeded
console.log('✅ Vite build test passed!');

export { client };
