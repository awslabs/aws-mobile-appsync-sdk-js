# Integration Testing Matrix

## Test Coverage Overview

| Test Type | Environment | Module Format | Bundler | Purpose |
|-----------|-------------|---------------|---------|---------|
| Node CJS | Node.js | CommonJS | - | Verify CJS loading and class instantiation |
| Node ESM | Node.js | ES Modules | - | Verify ESM imports and dynamic imports |
| Vite App | Browser | ESM | Vite 5 | Catch "Dynamic require of buffer" errors |
| Webpack App | Browser | UMD/ESM | Webpack 5 | Verify browser bundling compatibility |
| Bundle Analyzer | - | Both | - | Static analysis for Node.js built-ins |

## Issues Each Test Catches

### Node CJS Test (`node-cjs/test.cjs`)

**Catches:**
- ❌ `TypeError: Class constructor ApolloLink cannot be invoked without 'new'`
- ❌ Missing CJS exports
- ❌ Module resolution errors in CommonJS
- ❌ Incorrect package.json `main` field

**Validates:**
- ✅ `require('aws-appsync-auth-link')` works
- ✅ Classes can be instantiated with `new`
- ✅ `createAuthLink()` factory function works
- ✅ All exported APIs are accessible

### Node ESM Test (`node-esm/test.mjs`)

**Catches:**
- ❌ Missing ESM exports
- ❌ Named export errors
- ❌ Dynamic import failures
- ❌ Incorrect package.json `module` or `exports` field

**Validates:**
- ✅ `import { createAuthLink } from 'aws-appsync-auth-link'` works
- ✅ Dynamic imports work
- ✅ Tree-shaking compatibility
- ✅ Named exports are correct

### Vite Test (`vite-app/`)

**Catches:**
- ❌ `Dynamic require of "buffer" is not supported`
- ❌ `Dynamic require of "crypto" is not supported`
- ❌ Any Node.js built-in requires in browser code
- ❌ Vite-specific bundling issues

**Validates:**
- ✅ Packages work in TypeScript + React apps
- ✅ Vite can bundle without errors
- ✅ No Node.js built-ins in browser bundle
- ✅ Real-world browser compatibility

**Configuration:**
- Strict browser resolution (`conditions: ['browser', 'module', 'import']`)
- No polyfills for Node.js built-ins
- Minification disabled for clarity

### Webpack Test (`webpack-app/`)

**Catches:**
- ❌ Module resolution issues
- ❌ Incorrect browser field handling
- ❌ Unexpected polyfill inclusion
- ❌ Webpack-specific bundling problems

**Validates:**
- ✅ Webpack 5 compatibility
- ✅ Browser field is respected
- ✅ No Node.js built-ins in output
- ✅ Fallback configuration works

**Configuration:**
- Explicit `fallback: false` for Node.js built-ins
- `mainFields: ['browser', 'module', 'main']`
- No minification for clarity

### Bundle Analyzer (`scripts/analyze-bundles.mjs`)

**Catches:**
- ❌ `require('buffer')` in output
- ❌ `require('crypto')` in output
- ❌ `require('url')` in output
- ❌ Any Node.js built-in require/import
- ⚠️  Dynamic requires (risky)
- ℹ️  ES5 class patterns (informational)

**Validates:**
- ✅ No Node.js built-ins in browser builds
- ✅ Correct module format
- ✅ Expected code transformations

**Checks Both:**
- `lib/index.js` (CommonJS)
- `lib/index.mjs` (ES Module)

## Test Execution Flow

```
┌─────────────────────────────────────────────┐
│ npm run integration-test                     │
└─────────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
        ▼                       ▼
┌──────────────┐       ┌──────────────┐
│  Node Tests  │       │Browser Tests │
└──────────────┘       └──────────────┘
        │                       │
    ┌───┴───┐               ┌───┴────┐
    │       │               │        │
    ▼       ▼               ▼        ▼
  CJS     ESM            Vite    Webpack
    │       │               │        │
    └───┬───┘               └────┬───┘
        │                        │
        └────────┬───────────────┘
                 ▼
        ┌──────────────────┐
        │ Bundle Analyzer  │
        └──────────────────┘
                 │
                 ▼
        ┌──────────────────┐
        │ Success/Failure  │
        └──────────────────┘
```

## Real-World Scenario Coverage

| Scenario | Test Coverage |
|----------|---------------|
| React + TypeScript + Vite | ✅ Vite test |
| React + Webpack | ✅ Webpack test |
| Next.js (Node.js SSR) | ✅ Node CJS/ESM tests |
| Vue + Vite | ✅ Vite test |
| Angular (Webpack) | ✅ Webpack test |
| Node.js script | ✅ Node CJS/ESM tests |
| Serverless function | ✅ Node ESM test |
| Create React App | ✅ Webpack test |

## Performance

| Test | Duration | Dependencies |
|------|----------|--------------|
| Bundle Analyzer | ~1s | None (reads files) |
| Node CJS | ~0.5s | Built packages |
| Node ESM | ~0.5s | Built packages |
| Vite | ~5-10s | npm install |
| Webpack | ~5-10s | npm install |
| **Total** | **~15-25s** | All of above |

*Note: First run takes longer due to npm install. Subsequent runs are faster.*

## Exit Codes

| Test | Success | Failure |
|------|---------|---------|
| Node CJS | 0 | 1 |
| Node ESM | 0 | 1 |
| Vite | 0 | Non-zero |
| Webpack | 0 | Non-zero |
| Bundle Analyzer | 0 (no errors) | 1 (has errors) |

## CI/CD Integration

### GitHub Actions Matrix

```yaml
strategy:
  matrix:
    node-version: [18.x, 20.x]
    test: [node:cjs, node:esm, vite, webpack, analyze]
```

Runs **10 tests total** (2 Node versions × 5 test types)

### Failure Handling

- Unit tests fail → CI fails (don't run integration tests)
- Integration tests fail → CI fails (don't publish)
- Bundle analyzer errors → CI fails (don't publish)
- Bundle analyzer warnings → CI passes (but logs warnings)

## Maintenance

### When to Update Tests

**Package structure changes:**
- Update integration test imports
- Verify package.json paths
- Re-test all scenarios

**New dependencies:**
- Add to integration test package.json
- Verify bundler exclusions
- Check bundle analyzer patterns

**Apollo Client upgrade:**
- Update all package.json files
- Test with new version
- Verify breaking changes handled

### Adding New Test Scenarios

1. Create new directory under `integration-tests/`
2. Add package.json with dependencies
3. Create test file
4. Add to main package.json scripts
5. Update this matrix
6. Update CI workflow

## Known Limitations

### What We DON'T Test

- ❌ Actual GraphQL queries (no backend)
- ❌ Real-time subscriptions (no WebSocket server)
- ❌ Authentication flows (no AWS credentials)
- ❌ Production minification edge cases
- ❌ Internet Explorer compatibility
- ❌ React Native (separate environment needed)

### Why These Limitations Are OK

The integration tests focus on **module loading and bundling issues**, which is what caused the beta tester problems. Functional testing (actual GraphQL operations) is covered by unit tests.

## Troubleshooting

### All Tests Fail

**Likely cause:** Packages not built
**Fix:** `cd .. && npm run build`

### Only Bundler Tests Fail

**Likely cause:** Node.js built-ins in source code
**Fix:** Run analyzer to find location, then fix source

### Only Node Tests Fail

**Likely cause:** Class constructor or export issues
**Fix:** Check tsup config and package.json exports

### Analyzer Passes But Vite Fails

**Likely cause:** Issue not covered by patterns
**Fix:** Update analyzer patterns, then re-test

## Success Criteria

All tests passing means:
- ✅ Packages load in Node.js CJS
- ✅ Packages load in Node.js ESM
- ✅ Packages bundle with Vite (no browser errors)
- ✅ Packages bundle with Webpack
- ✅ No Node.js built-ins in browser code
- ✅ Classes can be instantiated correctly
- ✅ Exports are accessible

**Result:** Beta testers won't find module loading or bundling issues! 🎉
