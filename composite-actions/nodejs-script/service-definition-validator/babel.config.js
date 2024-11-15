export default {
  presets: [["@babel/preset-env"], "@babel/preset-typescript"],
  plugins: [
    [
      "@babel/plugin-syntax-import-attributes",
      {
        importAttributesKeyword: "with",
      },
    ],
  ],
};
