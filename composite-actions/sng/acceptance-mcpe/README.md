# Acceptance for MCPE Composite Action

Performs acceptance tests for MCPE services.

## Usage

### Inputs

- `gcloud-auth-staging` (required): GCLOUD_AUTH_STAGING value from secrets.
- `acceptance-mcpe-base-url` (required): Base URL of the service against which to run acceptance tests.
- `acceptance-mcpe-postman-collection-path` (required): Path to the Postman collection.
- `acceptance-mcpe-postman-environment-path` (required): Path to the Postman environment variables.
- `acceptance-mcpe-globals-path` (required): Path to the globals.json file.

### Example

```yaml
on:
  push:
    branches:
      - main

jobs:
  acceptance-tests:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v2

      - name: Run MCPE Acceptance Tests
        uses: extenda/shared-workflows/composite-actions/sng/acceptance-mcpe@master
        with:
          gcloud-auth-staging: ${{ secrets.GCLOUD_AUTH_STAGING }}
          acceptance-mcpe-base-url: 'https://your-mcpe-service-url'
          acceptance-mcpe-postman-collection-path: 'path/to/your/postman_collection.json'
          acceptance-mcpe-postman-environment-path: 'path/to/your/postman_environment.json'
          acceptance-mcpe-globals-path: 'path/to/your/globals.json'
