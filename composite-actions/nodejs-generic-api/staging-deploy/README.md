# Deploy staging action

This is typical action, to deploy nodejs api application to google cloud run staging.

### Example

```yaml
  - uses: extenda/shared-workflows/composite-actions/nodejs-generic-api/staging-deploy@master
    with:
      SECRET_AUTH: ${{ secrets.SECRET_AUTH }}
      GCLOUD_AUTH: ${{ secrets.GCLOUD_AUTH_STAGING }}
      image: ${{ env.IMAGE_NAME }}
      test-user-tenant-id: <id of staging tenant> # example - testrunner-3z05y
      service-url: <url of service in staging> # example - https://iam-api.retailsvc.dev
      api-key-name: <name of the google identity api key in secret manager> # default - iam-test-api-key
      user-email-name: <name of the user email in secret manager> # default - iam-test-token-email
      user-password-name: <name of the user password in secret manager> # default - iam-test-token-password
```

### Requirements

- You have to have valid ```Dockerfile```, in the root of your project.
- You have to have valid ```cloud-run.yaml``` file in the root of your project.\
- You have to have valid [component tests](https://github.com/extenda/actions/tree/master/component-tests) in ```./test/component-tests/tests.yml``` file.
