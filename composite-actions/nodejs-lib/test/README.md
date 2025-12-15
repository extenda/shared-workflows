# Publish nodejs library to Artifact Registry

This is typical action, to deploy nodejs api application to google cloud run.

### Example

```yaml
- uses: extenda/shared-workflows/composite-actions/nodejs-lib/test@master
  with:
    SECRET_AUTH: ${{ secrets.SECRET_AUTH }}
```

### Requirements

- `lint:ci` script in `package.json` that lints the code
- `test` script in `package.json` that produces a coverage report
- sonar configured in the project
