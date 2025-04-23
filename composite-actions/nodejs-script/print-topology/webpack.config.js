import path from "path";
import { fileURLToPath } from "url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

const webpackConfig = {
  entry: "./src/index.js", // Replace with the actual entry point of your JS code
  mode: "production",
  output: {
    filename: "index.js", // The name of the bundled output file
    path: path.resolve(dirname, "dist"), // The output directory path
    libraryTarget: "module", // Output as ESM
    chunkFormat: "module", // Use ESM chunk format explicitly
  },
  experiments: {
    outputModule: true, // Enables ESM output
  },
  target: "node", // Bundle for Node.js environment
  // ...other webpack configuration options...
};

export default webpackConfig;
