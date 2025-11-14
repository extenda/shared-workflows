# Acceptance Composite Action

Performs acceptance tests for MyScan services.

## Usage

### Inputs

- `secret-auth` (required): SECRET_AUTH value from secrets.
- `gcloud-auth-staging` (required): GCLOUD_AUTH_STAGING value from secrets.
- `acceptance-username` (required): Acceptance username (usually name of service).

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
        uses: actions/checkout@v5

      - name: Run Acceptance Tests
        uses: extenda/shared-workflows/composite-actions/mys/acceptance@master
        with:
          secret-auth: ${{ secrets.SECRET_AUTH }}
          gcloud-auth-staging: ${{ secrets.GCLOUD_AUTH_STAGING }}
          acceptance-username: 'myscan-coreservice'
