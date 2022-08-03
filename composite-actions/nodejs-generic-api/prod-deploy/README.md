# Deploy prod action

This is tipical action, to deploy nodejs api application to google cloud run.

### Example

```yaml
- uses: extenda/shared-workflows/composite-actions/nodejs-generic-api/prod-deploy@master
  with: 
    SECRET_AUTH: ${{ secrets.SECRET_AUTH }}
    GCLOUD_AUTH: ${{ secrets.GCLOUD_AUTH_PROD }}
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    system: <system name in styra>
    service-name: <name of the service in cloud run>
    image: ${{ env.IMAGE_NAME }}
```

### Requirements

- You have to have valid ```Dockerfile```, in the root of your project.
- You have to have valid ```cloud-run.yaml``` file in the root of your project.
