# Deploy to Production Composite Action

Automates the process of creating a release, adding a new tag to an existing Docker image, deploying it to production, writing DORA metrics, and updating release notes in Jira.

## Usage

### Inputs

- `secret-auth` (required): SECRET_AUTH value from secrets.
- `gcloud-auth-prod` (required): GCLOUD_AUTH_PROD value from secrets.
- `gcr-image-name` (required): Google Container Registry Docker image name.
- `service-name` (required): Service name in GCP.
- `system-name` (optional, default: 'sng'): System name (sng/mcp).
- `release-name` (optional, default: 'Release'): The product name to include in the release title. This should not contain a version.
- `jira-project-key` (optional, default: 'MCPE'): Jira product key.
- `product-name` (optional, default: 'Scan & Go'): Product name.
- `product-component` (optional, default: 'scanngo'): Product component.

### Example

```yaml
on:
  push:
    branches:
      - main

jobs:
  deploy-to-production:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Production
        uses: extenda/shared-workflows/composite-actions/deploy-to-production@master
        with:
          secret-auth: ${{ secrets.SECRET_AUTH }}
          gcloud-auth-prod: ${{ secrets.GCLOUD_AUTH_PROD }}
          gcr-image-name: 'your-image-name'
          service-name: 'your-service-name'