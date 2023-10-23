# Cloud deploy prod action

This is typical action, to deploy a frontend application to google cloud run.

### Example

```yaml
- uses: extenda/shared-workflows/composite-actions/frontend-generic/prod-deploy@master
  with:
    SECRET_AUTH: ${{ secrets.SECRET_AUTH }}
    GCLOUD_AUTH_PROD: ${{ secrets.GCLOUD_AUTH_PROD }}
    GCLOUD_AUTH_STAGING: ${{ secrets.GCLOUD_AUTH_STAGING }}
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    IMAGE: ${{ env.IMAGE_NAME }}
    LD_CLIENT_ID: 'in-store-launchdarkly-client-id'
```

### Requirements

- You have to have valid `Dockerfile`, in the root of your project.
- You have to have valid `cloud-deploy.yaml` file in the root of your project.
