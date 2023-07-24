# Instructions

This is recommended step-by-step instruction, to use this composite action.

- First you should run [test](./test/) for pull requests only.
- In deployment you should only run [deploy](./prod-deploy/).
- After deploy to prod, you should run [dora](../generic/dora).
  This run should depend on [prod-deploy](prod-deploy).

### Example

```yaml
name: Deploy
on: push
env:
  IMAGE_NAME: <image of the app>

jobs:
  test:
    runs-on: ubuntu-latest
    if: github.ref != 'refs/heads/master' # Only run on pull requests
    steps:
      - uses: extenda/shared-workflows/composite-actions/frontend-generic/test@master
        with:
          SECRET_AUTH: ${{ secrets.SECRET_AUTH }}
          BUILD_TOOL: 'yarn'

  prod:
    if: github.ref == 'refs/heads/master'
    runs-on: ubuntu-latest
    steps:
      - uses: extenda/shared-workflows/composite-actions/frontend-generic/prod-deploy@master
        with:
          SECRET_AUTH: ${{ secrets.SECRET_AUTH }}
          GCLOUD_AUTH_PROD: ${{ secrets.GCLOUD_AUTH_PROD }}
          GCLOUD_AUTH_STAGING: ${{ secrets.GCLOUD_AUTH_STAGING }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          IMAGE: ${{ env.IMAGE_NAME }}
          LD_CLIENT_ID: 'in-store-launchdarkly-client-id'

  dora:
    runs-on: ubuntu-latest
    needs: prod
    steps:
      - uses: extenda/shared-workflows/composite-actions/generic/dora@master
        with:
          product-name: <Name of the product, that this service belongs to in Jira> # example - IAM
          product-component: <Name of the product component, that this service belongs to in Jira> # example - IAM
          jira-project-key: <Key of the product, that this service belongs to in Jira> # example - HII
```
