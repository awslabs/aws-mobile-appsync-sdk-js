/**
 * Node.js CommonJS Integration Test
 *
 * This test ensures that the packages can be loaded in a Node.js CommonJS environment
 * and that classes like ApolloLink can be instantiated properly.
 */

console.log('🧪 Testing Node.js CommonJS...');

try {
  // Test auth-link
  const { createAuthLink, AuthLink, AUTH_TYPE } = require('aws-appsync-auth-link');

  console.log('✓ aws-appsync-auth-link loaded');

  // Verify AuthLink is a constructor
  if (typeof AuthLink !== 'function') {
    throw new Error('AuthLink is not a constructor function');
  }

  // Test instantiation using createAuthLink
  const authLink = createAuthLink({
    url: 'https://example.appsync-api.us-east-1.amazonaws.com/graphql',
    region: 'us-east-1',
    auth: {
      type: AUTH_TYPE.API_KEY,
      apiKey: 'test-key'
    }
  });

  console.log('✓ createAuthLink works');

  // Verify it's an ApolloLink instance
  if (!(authLink instanceof AuthLink)) {
    throw new Error('createAuthLink did not return an AuthLink instance');
  }

  console.log('✓ AuthLink can be instantiated');

  // Test subscription-link
  const { createSubscriptionHandshakeLink } = require('aws-appsync-subscription-link');

  console.log('✓ aws-appsync-subscription-link loaded');

  // Test creating subscription link
  const subscriptionLink = createSubscriptionHandshakeLink({
    url: 'https://example.appsync-api.us-east-1.amazonaws.com/graphql',
    region: 'us-east-1',
    auth: {
      type: AUTH_TYPE.API_KEY,
      apiKey: 'test-key'
    }
  });

  console.log('✓ createSubscriptionHandshakeLink works');

  // Verify it returns an ApolloLink (check for request method)
  if (typeof subscriptionLink.request !== 'function') {
    throw new Error('subscriptionLink is not an ApolloLink');
  }

  console.log('✓ Subscription link is an ApolloLink');

  console.log('\n✅ All Node.js CommonJS tests passed!\n');
  process.exit(0);
} catch (error) {
  console.error('\n❌ Node.js CommonJS test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}
