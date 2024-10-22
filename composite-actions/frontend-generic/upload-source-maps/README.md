# Deploy upload-source-maps action

This is a shared action for a frontend application: uploading source maps to Elasticsearch.

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
