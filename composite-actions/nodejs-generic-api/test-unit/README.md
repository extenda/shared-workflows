# Run unit tests action

This is typical action, to run tests in nodejs api application.

### Example

```yaml
- uses: extenda/shared-workflows/composite-actions/nodejs-generic-api/test-unit@master
  with:
    SECRET_AUTH: ${{ secrets.SECRET_AUTH }}
```

### Requirements

- You have to have a ```test/example.env``` file, with all env variables needed to run tests.
- You have to have a ```npm run emulators:start``` script.
- You have to have a ```npm run lint:ci``` script.
- You have to have a ```npm run test:cov``` script.
- Your application have to be compatible with node 16.

## Optional
- ```npm run check-openapi-schema``` script, to test you openapi schema.
- ```npm run ts:check``` script, to check, whether your typescript code is valid.
- ```npm run db:migrate``` script, to prepere database before testing
