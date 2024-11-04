import path from "path";
import { fileURLToPath } from "url";
import ForkTsCheckerWebpackPlugin from "fork-ts-checker-webpack-plugin";

const dirname = path.dirname(fileURLToPath(import.meta.url));

const webpackConfig = {
  // Specify that we're building for Node.js
  target: "node",

  mode: "production",

  // Entry point of your application
  entry: "./src/index.ts",

  // Enable source maps for debugging
  // devtool: "source-map",

  // Output configuration
  output: {
    path: path.resolve(dirname, "dist"),
    filename: "index.js",
    // Specify ESM output
    module: true,
    library: {
      type: "module",
    },
  },

  // Enable ESM output
  experiments: {
    outputModule: true,
  },

  // Resolve extensions so imports don't need extensions
  resolve: {
    extensions: [".ts", ".js"],
  },

  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            // Babel configuration
            presets: [
              [
                "@babel/preset-env",
                {
                  targets: { node: "current" }, // Target current Node.js version
                  modules: false, // Keep ESM syntax
                },
              ],
              "@babel/preset-typescript",
            ],
            plugins: [
              [
                "@babel/plugin-syntax-import-attributes",
                {
                  importAttributesKeyword: "with",
                },
              ],
            ],
          },
        },
      },
    ],
  },

  plugins: [
    new ForkTsCheckerWebpackPlugin({
      async: false,
      typescript: {
        configFile: path.resolve(dirname, "tsconfig.json"),
      },
    }),
  ],

  experiments: {
    outputModule: true,
  },
};

export default webpackConfig;
