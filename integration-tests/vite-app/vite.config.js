import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: './src/main.js',
      output: {
        dir: 'dist'
      }
    },
    // More strict checking to catch issues
    minify: false,
    sourcemap: true
  },
  // Ensure we're testing browser environment
  resolve: {
    conditions: ['browser', 'module', 'import']
  }
});
