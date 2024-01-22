# Deploy to Staging Composite Action

Takes an already built Docker image and deploys it to staging.

## Usage

### Inputs

- `secret-auth` (required): SECRET_AUTH value from secrets.
- `gcloud-auth-staging` (required): GCLOUD_AUTH_STAGING value from secrets.
- `gcr-image-name` (required): Google Container Registry Docker image name.

### Example

```yaml
on:
  push:
    branches:
      - main

jobs:
  deploy-to-staging:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Staging
        uses: extenda/shared-workflows/composite-actions/deploy-to-staging@master
        with:
          secret-auth: ${{ secrets.SECRET_AUTH }}
          gcloud-auth-staging: ${{ secrets.GCLOUD_AUTH_STAGING }}
          gcr-image-name: 'your-image-name'
