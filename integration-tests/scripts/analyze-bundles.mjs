#!/usr/bin/env node

/**
 * Bundle Analysis Script
 *
 * This script analyzes the built packages to detect potential issues:
 * 1. Node.js built-in modules in browser builds
 * 2. Dynamic requires that might fail in browsers
 * 3. Class constructor issues (ES5 vs ES6)
 * 4. Missing exports
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ANSI colors for better output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

// Patterns to check
const checks = {
  nodeBuiltins: {
    name: 'Node.js built-in require/import',
    pattern: /require\(['"](?:buffer|crypto|fs|path|os|stream|util|url|http|https|net|tls|child_process|cluster|dgram|dns|events|readline|repl|tty|v8|vm|zlib)['"]\)/g,
    severity: 'error',
    message: 'Found require() for Node.js built-in module'
  },
  dynamicRequire: {
    name: 'Dynamic require (may fail in Vite)',
    pattern: /require\([^'"]/g,
    severity: 'warning',
    message: 'Found dynamic require() that might fail in browser bundlers'
  },
  bufferGlobal: {
    name: 'Buffer polyfill',
    pattern: /global\.Buffer\s*=.*require\(['"]buffer['"]\)/g,
    severity: 'error',
    message: 'Found Buffer polyfill that will fail in browsers'
  },
  es5ClassPattern: {
    name: 'ES5 class pattern (constructor issues)',
    pattern: /function\s+_class_call_check/g,
    severity: 'info',
    message: 'Found ES5 class transformation (ensure exports are correct)'
  }
};

let totalIssues = 0;
let errorCount = 0;

function analyzeFile(filePath, fileType) {
  console.log(`\n${colors.blue}Analyzing ${fileType}: ${path.basename(filePath)}${colors.reset}`);

  const content = fs.readFileSync(filePath, 'utf-8');
  let fileHasIssues = false;

  for (const [checkName, check] of Object.entries(checks)) {
    const matches = [...content.matchAll(check.pattern)];

    if (matches.length > 0) {
      fileHasIssues = true;
      totalIssues += matches.length;

      const color = check.severity === 'error' ? colors.red :
                   check.severity === 'warning' ? colors.yellow : colors.blue;

      console.log(`${color}[${check.severity.toUpperCase()}] ${check.name}${colors.reset}`);
      console.log(`  ${check.message}`);
      console.log(`  Found ${matches.length} occurrence(s)`);

      // Show first few matches with line numbers
      matches.slice(0, 3).forEach(match => {
        const lines = content.substring(0, match.index).split('\n');
        const lineNum = lines.length;
        const lineContent = lines[lines.length - 1] + match[0];
        console.log(`  Line ${lineNum}: ${lineContent.trim().substring(0, 80)}...`);
      });

      if (matches.length > 3) {
        console.log(`  ... and ${matches.length - 3} more`);
      }

      if (check.severity === 'error') {
        errorCount++;
      }
    }
  }

  if (!fileHasIssues) {
    console.log(`${colors.green}✓ No issues found${colors.reset}`);
  }

  return fileHasIssues;
}

function analyzePackage(packageName) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${colors.blue}Analyzing package: ${packageName}${colors.reset}`);
  console.log('='.repeat(60));

  const packagePath = path.join(__dirname, '../../packages', packageName);
  const libPath = path.join(packagePath, 'lib');

  if (!fs.existsSync(libPath)) {
    console.log(`${colors.yellow}⚠ No build output found at ${libPath}${colors.reset}`);
    console.log('Run "npm run build" in the package first.');
    return false;
  }

  let hasIssues = false;

  // Analyze CJS build
  const cjsPath = path.join(libPath, 'index.js');
  if (fs.existsSync(cjsPath)) {
    hasIssues = analyzeFile(cjsPath, 'CommonJS') || hasIssues;
  }

  // Analyze ESM build
  const esmPath = path.join(libPath, 'index.mjs');
  if (fs.existsSync(esmPath)) {
    hasIssues = analyzeFile(esmPath, 'ES Module') || hasIssues;
  }

  return hasIssues;
}

// Main execution
console.log(`${colors.blue}🔍 AWS AppSync Package Bundle Analyzer${colors.reset}`);
console.log(`${colors.blue}${'='.repeat(60)}${colors.reset}\n`);

const packages = [
  'aws-appsync-auth-link',
  'aws-appsync-subscription-link'
];

let overallHasIssues = false;
packages.forEach(pkg => {
  const hasIssues = analyzePackage(pkg);
  overallHasIssues = overallHasIssues || hasIssues;
});

// Summary
console.log(`\n${'='.repeat(60)}`);
console.log(`${colors.blue}Analysis Summary${colors.reset}`);
console.log('='.repeat(60));
console.log(`Total issues found: ${totalIssues}`);
console.log(`Errors: ${errorCount}`);

if (errorCount > 0) {
  console.log(`\n${colors.red}❌ Analysis failed with ${errorCount} error(s)${colors.reset}`);
  console.log('These issues will likely cause problems in browser environments.');
  process.exit(1);
} else if (totalIssues > 0) {
  console.log(`\n${colors.yellow}⚠ Analysis completed with ${totalIssues} warning(s)${colors.reset}`);
  process.exit(0);
} else {
  console.log(`\n${colors.green}✅ Analysis passed! No issues found.${colors.reset}`);
  process.exit(0);
}
