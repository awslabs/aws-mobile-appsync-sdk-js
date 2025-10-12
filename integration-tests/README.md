# AWS AppSync Integration Tests

This directory contains comprehensive integration tests to ensure the AWS AppSync packages work correctly across different environments and bundlers.

## Purpose

These tests are designed to catch issues that unit tests might miss, specifically:

1. **Node.js compatibility issues**
   - Class constructor errors (e.g., "Class constructor ApolloLink cannot be invoked without 'new'")
   - Module resolution problems between CJS and ESM

2. **Browser bundler issues**
   - Dynamic require errors in Vite (e.g., "Dynamic require of 'buffer' is not supported")
   - Node.js built-ins leaking into browser bundles
   - Webpack resolution and polyfill issues

3. **Build output problems**
   - Missing exports
   - Incorrect module formats
   - Platform-specific code in wrong builds

## Test Structure

```
integration-tests/
├── node-cjs/          # Node.js CommonJS tests
├── node-esm/          # Node.js ES Module tests
├── vite-app/          # Vite bundler test (simulates TypeScript + React)
├── webpack-app/       # Webpack bundler test
└── scripts/           # Analysis and helper scripts
```

## Running Tests

### All Tests
```bash
cd integration-tests
npm install
npm test
```

### Individual Test Suites

**Node.js CJS:**
```bash
npm run test:node:cjs
```

**Node.js ESM:**
```bash
npm run test:node:esm
```

**Vite (Browser):**
```bash
npm run test:vite
```

**Webpack (Browser):**
```bash
npm run test:webpack
```

**Bundle Analysis:**
```bash
npm run analyze
```

## Bundle Analysis

The bundle analyzer checks for common issues:

- ❌ **Errors** - Will fail the build
  - Node.js built-in modules in browser code
  - Buffer polyfills that fail in browsers

- ⚠️ **Warnings** - Should be reviewed
  - Dynamic requires

- ℹ️ **Info** - Informational only
  - ES5 class transformations

## CI Integration

Add to your CI pipeline to run after building packages:

```yaml
- name: Build packages
  run: npm run bootstrap && lerna run build

- name: Run integration tests
  run: cd integration-tests && npm install && npm test

- name: Analyze bundles
  run: cd integration-tests && npm run analyze
```

## What Each Test Validates

### Node.js CJS Test
- ✓ Packages load in CommonJS environment
- ✓ Classes can be instantiated
- ✓ No "cannot be invoked without 'new'" errors

### Node.js ESM Test
- ✓ Packages load in ES Module environment
- ✓ Dynamic imports work correctly
- ✓ Named exports are accessible

### Vite Test
- ✓ No "Dynamic require of 'buffer'" errors
- ✓ No Node.js built-ins in browser bundle
- ✓ React/TypeScript compatibility
- ✓ Tree-shaking works correctly

### Webpack Test
- ✓ Webpack can bundle the packages
- ✓ Module resolution works
- ✓ No unexpected polyfills

## Common Issues Detected

### 1. Buffer Require in Browser Code
**Error:** `Dynamic require of "buffer" is not supported`

**Cause:** Code like `global.Buffer = require("buffer").Buffer;` in source files

**Fix:** Use conditional imports or separate platform builds

### 2. Class Constructor Issues
**Error:** `Class constructor ApolloLink cannot be invoked without 'new'`

**Cause:** Mixing ES5 and ES6 class definitions, incorrect tsup/babel configuration

**Fix:** Ensure consistent module format and class syntax

### 3. Node.js Built-ins in Browser
**Error:** Build warnings about `url`, `crypto`, `buffer` polyfills

**Cause:** Importing Node.js modules in code that gets bundled for browsers

**Fix:** Use browser-compatible alternatives or conditional exports

## Adding New Tests

To add a new integration test:

1. Create a new directory under `integration-tests/`
2. Add a `package.json` with test dependencies
3. Create test files that import and use the packages
4. Add a script to `integration-tests/package.json`
5. Update this README

## Troubleshooting

**Tests fail with "package not found":**
- Run `lerna bootstrap` and `lerna run build` first
- Ensure packages are built before running integration tests

**Vite test fails:**
- Check for dynamic requires in source code
- Verify no Node.js built-ins are imported without conditions

**Node tests fail:**
- Check package.json exports field is correct
- Verify both CJS and ESM builds exist
