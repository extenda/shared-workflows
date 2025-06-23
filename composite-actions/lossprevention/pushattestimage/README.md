# PushAttestImage Composite Action

Pushes and attests Docker images for lossprevention services.

## Usage

```yaml
- name: Push and Attest Docker Image
  uses: ./composite-actions/lossprevention/pushattestimage
  with:
    secret-auth: ${{ secrets.GCLOUD_AUTH_STAGING }}
    image: eu.gcr.io/extenda/lossprevention/my-service:1.2.3
```

## Inputs

| Name         | Required | Description                                                                                      |
|--------------|----------|--------------------------------------------------------------------------------------------------|
| `secret-auth`| Yes      | Auth for pushing and attesting the Docker image (e.g., `secrets.GCLOUD_AUTH_STAGING`).           |
| `image`      | Yes      | Full name/path of the image to push and attest (e.g., `eu.gcr.io/extenda/lossprevention/app:tag`).|

## Features

- Authenticates with Google Cloud for Docker registry access.
- Pushes the specified Docker image to the registry.
- Attests the pushed Docker image for binary authorization.

## Notes

- The image must be built and tagged before using this action.
- Required secrets must be available in your workflow.

## Example Workflow

```yaml
name: Build and Deploy

on:
  push:
    branches: [ master ]

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # ... build and tag your Docker image here ...
      - name: Push and Attest Docker Image
        uses: ./composite-actions/lossprevention/pushattestimage
        with:
          secret-auth: ${{ secrets.GCLOUD_AUTH_STAGING }}
          image: eu.gcr.io/extenda/lossprevention/my-service:${{ steps.semver.outputs.composed-version-string }}