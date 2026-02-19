import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
  },
  mode: 'production',
  resolve: {
    extensions: ['.js', '.mjs'],
    // Ensure browser field is respected
    mainFields: ['browser', 'module', 'main'],
    fallback: {
      // Make sure Node.js built-ins fail explicitly in browser builds
      buffer: false,
      crypto: false,
      stream: false,
      url: false,
    }
  },
  // Don't minify so we can see issues more clearly
  optimization: {
    minimize: false
  }
};
