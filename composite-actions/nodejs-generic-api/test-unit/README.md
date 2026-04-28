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
    # Optional
    # slack-channel: team-ci-alerts
    # notify-slack-on-fail: true
```

### Requirements

- You have to have a ```test/example.env``` file, with all env variables needed to run tests.
- You should have a ```npm run emulators:start``` script if you need to start any emulators before tests.
- You have to have a ```npm run lint:ci``` script.
- You have to have a ```npm run test:cov``` script.
- You must set Node.js version in `.nvmrc` file.
- You should have a ```npm run check-openapi-schema``` script, to test you openapi schema.
- You should have a ```npm run ts:check``` script, to check, whether your typescript code is valid.
- Set `IMAGE_NAME` in workflow `env`.
- The action builds one local image in the test job using `docker build --quiet -t "${IMAGE_NAME}:${GITHUB_SHA}" .`.
- Trivy scans this locally built image (`${IMAGE_NAME}:${GITHUB_SHA}`).
- The job fails if `IMAGE_NAME` is missing, `Dockerfile` is missing, or local image build fails.
