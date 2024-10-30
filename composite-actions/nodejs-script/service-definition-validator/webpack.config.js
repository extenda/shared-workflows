import path from "path";
import { fileURLToPath } from "url";
import nodeBuiltIns from 'builtin-modules';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  entry: './src/index.ts',
  target: 'node',
  mode: 'production',
  output: {
    path: path.resolve(dirname, 'dist'),
    filename: 'index.js',
    libraryTarget: 'module', // For ESM output
    chunkFormat: 'module'
  },
  experiments: {
    outputModule: true,
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  externals: nodeBuiltIns, // Exclude Node.js built-in modules
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  optimization: {
    minimize: true,
  },
};