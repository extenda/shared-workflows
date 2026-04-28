# Run unit tests action

This is typical action, to run tests in nodejs api application.

### Example

```yaml
- uses: extenda/shared-workflows/composite-actions/nodejs-generic-api/test-unit@master
  env:
    IMAGE_NAME: eu.gcr.io/extenda/att-api
  with:
    GCLOUD_AUTH: ${{ secrets.GCLOUD_AUTH_STAGING }}
    SECRET_AUTH: ${{ secrets.SECRET_AUTH }}
    # Optional override if your image naming differs
    # vulnerability-scan-image: eu.gcr.io/extenda/att-api:${{ github.sha }}
```

### Requirements

- You have to have a ```test/example.env``` file, with all env variables needed to run tests.
- You should have a ```npm run emulators:start``` script if you need to start any emulators before tests.
- You have to have a ```npm run lint:ci``` script.
- You have to have a ```npm run test:cov``` script.
- You must set Node.js version in `.nvmrc` file.
- You should have a ```npm run check-openapi-schema``` script, to test you openapi schema.
- You should have a ```npm run ts:check``` script, to check, whether your typescript code is valid.
- Vulnerability scan image resolution order is:
  1) ``vulnerability-scan-image``
  2) ``${IMAGE_NAME}:${GITHUB_SHA}``
  3) ``eu.gcr.io/extenda/${GITHUB_REPOSITORY#*/}:${GITHUB_SHA}``
  4) ``eu.gcr.io/extenda/security:${GITHUB_SHA}``
- The action checks local Docker first, then tries to pull each candidate from registry.
- If no candidate image can be found, the job fails.
