# Upload source maps action

This is a shared action for a frontend application: uploading source maps to Elasticsearch.

### Inputs

This action accepts the following inputs:

| Key Name            | Description                                                                  |
| ------------------- | ---------------------------------------------------------------------------- |
| SERVICE_NAME        | Service name for the apm service.                                            |
| SERVICE_VERSION     | Service version for the apm service.                                         |
| BUILD_DIR           | Build directory containing source maps. Example: dist/assets, dist/, /, etc. |
| PREFIX              | Prefix for source maps. Example: /recon/, /console-ui/, /, etc.              |
| SECRET_AUTH         | Service account key for authentication .                                     |
| GCLOUD_AUTH_STAGING | GCP Auth for staging .                                                       |

### Example

```yaml
- name: Upload source maps
  uses: extenda/shared-workflows/composite-actions/frontend-generic/upload-source-maps@master
  with:
    SERVICE_NAME: "your-service-name"
    SERVICE_VERSION: "your-service-version"
    BUILD_DIR: "dist"
    PREFIX: "your-prefix"
    SECRET_AUTH: ${{ secrets.SECRET_AUTH }}
    GCLOUD_AUTH_STAGING: ${{ secrets.GCLOUD_AUTH_STAGING }}
```

### Requirements

- You have to have valid `Dockerfile`, in the root of your project.
- You have to have valid `cloud-run.yaml` file in the root of your project.
