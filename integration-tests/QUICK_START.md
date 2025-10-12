# Integration Tests - Quick Start

## TL;DR

```bash
# From repo root
npm run build                 # Build packages
npm run integration-test      # Run all integration tests
npm run validate             # Quick validation

# Or from integration-tests/
cd integration-tests
npm install
npm test                      # Run everything
npm run analyze              # Just analyze bundles
```

## What Gets Tested

- ✅ Node.js CommonJS (class instantiation issues)
- ✅ Node.js ESM (module import issues)
- ✅ Vite bundler (dynamic require errors)
- ✅ Webpack bundler (polyfill issues)
- ✅ Static analysis (Node.js built-ins in browser code)

## Run Individual Tests

```bash
cd integration-tests

npm run test:node:cjs      # Node.js CommonJS
npm run test:node:esm      # Node.js ESM
npm run test:vite          # Vite (React/TypeScript scenario)
npm run test:webpack       # Webpack
npm run analyze            # Bundle analyzer
```

## Understanding Output

### ✅ Success
```
✅ All Node.js CommonJS tests passed!
✅ All Node.js ESM tests passed!
✅ Vite build test passed!
✅ Analysis passed! No issues found.
```

### ❌ Failure Examples

**Class Constructor Issue:**
```
❌ Node.js CommonJS test failed:
TypeError: Class constructor ApolloLink cannot be invoked without 'new'
```
→ Check tsup config and class exports

**Buffer Require:**
```
[ERROR] Buffer polyfill
  Found Buffer polyfill that will fail in browsers
  Line 1448: global.Buffer = require("buffer")...
```
→ Remove or conditionally import buffer

**Vite Build Fail:**
```
Error: Dynamic require of "buffer" is not supported
```
→ Check bundle analyzer output for exact location

## Common Issues & Fixes

### 1. "Cannot find module 'aws-appsync-auth-link'"
**Fix:** Run `npm run build` in repo root first

### 2. Bundle analyzer shows errors
**Fix:**
1. Note the file and line number
2. Update source code to avoid Node.js built-ins
3. Rebuild: `npm run build`
4. Re-test: `npm run analyze`

### 3. Vite test fails
**Fix:**
1. Check analyzer output: `npm run analyze`
2. Fix issues in source code
3. Rebuild packages
4. Re-run: `npm run test:vite`

## When to Run

**Before every publish:** ✅
**Before every commit:** Recommended
**In CI/CD:** Automatic (if workflows enabled)

## CI/CD

Integration tests run automatically in GitHub Actions when:
- You push to `master` or feature branches
- You create a pull request
- You manually trigger pre-publish workflow

See `.github/workflows/integration-tests.yml`

## Need More Help?

- Full docs: `integration-tests/README.md`
- Testing guide: `INTEGRATION_TESTING.md` (in root)
- Summary: `AUTOMATION_SUMMARY.md` (in root)
