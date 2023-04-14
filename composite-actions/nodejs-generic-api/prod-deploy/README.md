# Deploy prod action

This is typical action, to deploy nodejs api application to google cloud run.

### Example

```yaml
- uses: extenda/shared-workflows/composite-actions/nodejs-generic-api/prod-deploy@master
  with:
    SECRET_AUTH: ${{ secrets.SECRET_AUTH }}
    GCLOUD_AUTH: ${{ secrets.GCLOUD_AUTH_PROD }}
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    system: <system name in styra> # example - iam
    service-name: <name of the service in cloud run> # example - iam-api
    image: ${{ env.IMAGE_NAME }}
    slack-channel: <name of the slack channel>
    notify-slack-on-fail: <if true, sends an alert to slack channel>
    with-opa: <if true, deploys with opa>
```

### Requirements

- You have to have valid `Dockerfile`, in the root of your project.
- You have to have valid `cloud-run.yaml` file in the root of your project.
