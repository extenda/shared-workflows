# Docker Build Composite Action

Builds Docker image, pushes it to Google Container Registry, and performs attestation using Binary Authorization.

## Usage

### Inputs

- `gcloud-auth-staging` (required): GCLOUD_AUTH_STAGING value from secrets.
- `dockerfile-path` (required): Path to the Dockerfile.
- `gcr-image-name` (required): Google Container Registry Docker image name.

### Example

```yaml
on:
  push:
    branches:
      - main

jobs:
  docker-build:
    runs-on: ubuntu-latest
    steps:
      - name: Build and Push Docker Image
        uses: extenda/shared-workflows/composite-actions/docker-build@master
        with:
          gcloud-auth-staging: ${{ secrets.GCLOUD_AUTH_STAGING }}
          dockerfile-path: 'path/to/your/Dockerfile'
          gcr-image-name: 'your-image-name'
