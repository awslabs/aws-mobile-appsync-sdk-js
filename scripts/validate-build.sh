#!/bin/bash

# Validate Build Script
# This script validates the build output before committing or publishing

set -e  # Exit on error

echo "🔍 Validating AWS AppSync package builds..."
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

# Function to check if a file exists
check_file() {
  local file=$1
  local description=$2

  if [ ! -f "$file" ]; then
    echo -e "${RED}✗ MISSING: $description${NC}"
    echo "  Expected: $file"
    ((ERRORS++))
    return 1
  else
    echo -e "${GREEN}✓${NC} $description"
    return 0
  fi
}

# Function to check file content
check_content() {
  local file=$1
  local pattern=$2
  local description=$3
  local severity=${4:-error}  # error or warning

  if [ ! -f "$file" ]; then
    return 1
  fi

  if grep -q "$pattern" "$file"; then
    if [ "$severity" = "error" ]; then
      echo -e "${RED}✗ ERROR: $description${NC}"
      echo "  Found in: $file"
      ((ERRORS++))
    else
      echo -e "${YELLOW}⚠ WARNING: $description${NC}"
      echo "  Found in: $file"
      ((WARNINGS++))
    fi
    return 1
  fi
  return 0
}

# Check each package
for package in packages/aws-appsync-auth-link packages/aws-appsync-subscription-link; do
  package_name=$(basename "$package")
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Checking: $package_name"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Check build outputs exist
  check_file "$package/lib/index.js" "CommonJS build (index.js)"
  check_file "$package/lib/index.mjs" "ES Module build (index.mjs)"
  check_file "$package/lib/index.d.ts" "TypeScript declarations (index.d.ts)"
  check_file "$package/package.json" "package.json"

  # Check package.json configuration
  if [ -f "$package/package.json" ]; then
    echo ""
    echo "Checking package.json configuration..."

    if ! grep -q '"main".*"lib/index.js"' "$package/package.json"; then
      echo -e "${RED}✗ ERROR: package.json missing or incorrect 'main' field${NC}"
      ((ERRORS++))
    else
      echo -e "${GREEN}✓${NC} Correct 'main' field"
    fi

    if ! grep -q '"module".*"lib/index.mjs"' "$package/package.json"; then
      echo -e "${RED}✗ ERROR: package.json missing or incorrect 'module' field${NC}"
      ((ERRORS++))
    else
      echo -e "${GREEN}✓${NC} Correct 'module' field"
    fi

    if ! grep -q '"types".*"lib/index.d.ts"' "$package/package.json"; then
      echo -e "${RED}✗ ERROR: package.json missing or incorrect 'types' field${NC}"
      ((ERRORS++))
    else
      echo -e "${GREEN}✓${NC} Correct 'types' field"
    fi

    if ! grep -q '"exports"' "$package/package.json"; then
      echo -e "${RED}✗ ERROR: package.json missing 'exports' field${NC}"
      ((ERRORS++))
    else
      echo -e "${GREEN}✓${NC} Has 'exports' field"
    fi
  fi

  # Check for problematic patterns in builds
  echo ""
  echo "Checking for problematic code patterns..."

  if [ -f "$package/lib/index.js" ]; then
    check_content "$package/lib/index.js" \
      'require(['\''"]buffer['\''"])' \
      "Buffer require in CJS build (will fail in browsers)" \
      "error"

    check_content "$package/lib/index.js" \
      'require(['\''"]crypto['\''"])' \
      "Crypto require in CJS build (may fail in browsers)" \
      "warning"
  fi

  if [ -f "$package/lib/index.mjs" ]; then
    check_content "$package/lib/index.mjs" \
      '__require(['\''"]buffer['\''"])' \
      "Buffer require in ESM build (will fail in browsers)" \
      "error"

    check_content "$package/lib/index.mjs" \
      'from ['\''"]buffer['\''"]' \
      "Buffer import in ESM build (will fail in browsers)" \
      "error"
  fi

  # Check for TypeScript exports
  if [ -f "$package/lib/index.d.ts" ]; then
    if ! grep -q "export" "$package/lib/index.d.ts"; then
      echo -e "${YELLOW}⚠ WARNING: TypeScript declarations may be missing exports${NC}"
      ((WARNINGS++))
    else
      echo -e "${GREEN}✓${NC} TypeScript declarations have exports"
    fi
  fi

  # Check for accidental inclusions
  if [ -d "$package/lib/node_modules" ]; then
    echo -e "${RED}✗ ERROR: Found node_modules in build output${NC}"
    ((ERRORS++))
  else
    echo -e "${GREEN}✓${NC} No node_modules in build output"
  fi
done

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Validation Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
  echo -e "${GREEN}✅ All checks passed!${NC}"
  echo ""
  exit 0
elif [ $ERRORS -eq 0 ]; then
  echo -e "${YELLOW}⚠ Validation completed with $WARNINGS warning(s)${NC}"
  echo ""
  exit 0
else
  echo -e "${RED}❌ Validation failed with $ERRORS error(s) and $WARNINGS warning(s)${NC}"
  echo ""
  echo "Please fix the errors before publishing."
  exit 1
fi
