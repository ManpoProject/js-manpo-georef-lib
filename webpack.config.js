import path from 'path';
import { fileURLToPath } from 'url';

// Replicate __dirname functionality for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  entry: './index.js',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname),
    library: {
      name: 'ManpoGeorefLib', // The name of the global variable
      type: 'umd',               // Universal Module Definition
      // export: 'default',         // Export the default export from index.js
    },
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
        },
      },
    ],
  },
  mode: 'production',
};