const path = require('path');

module.exports = {
    entry: './src/index.js', // Replace with the actual entry point of your JS code
    output: {
        filename: 'index.js', // The name of the bundled output file
        path: path.resolve(__dirname, 'dist') // The output directory path
    },
    target: 'node', // Bundle for Node.js environment
    externals: {
        // Exclude any browser-specific dependencies from being bundled
        // For example, if you want to exclude the 'fs' module:
        fs: 'commonjs fs',
        // Add other exclusions if needed
    },
    // ...other webpack configuration options...
};