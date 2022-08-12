# Instructions

This is recommended step by step instruction, to use this composite actions.
- First you should run [test-unit](test-unit) and [test-opa](test-opa) in parallel,
because this two actions, do not depend on any other action.
- After all tests, you should run [staging-deploy](staging-deploy). This run
should depend on [test-unit](test-unit) and [test-opa](test-opa) and run only on you master branch.
- After deploy to staging, you should run [prod-deploy](prod-deploy).
This run should depend on [staging-deploy](staging-deploy) and run only on you master branch.
- After deploy to prod, you should run [dora](../generic/dora).
This run should depend on [prod-deploy](prod-deploy).

### Example

```yaml
name: Deploy
on:
  push:
    paths-ignore:
      - '**/README.md'
      - docker-compose.yml
      - test/example.env
env:
  IMAGE_NAME: <image of the app>

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: extenda/shared-workflows/composite-actions/nodejs-generic-api/test-unit@master
        with:
          SECRET_AUTH: ${{ secrets.SECRET_AUTH }}

  test-opa:
    runs-on: ubuntu-latest
    steps:
      - uses: extenda/shared-workflows/composite-actions/nodejs-generic-api/test-opa@master
        with:
          SECRET_AUTH: ${{ secrets.SECRET_AUTH }}
          system: <system name> # example - iam
          service-name: <service name> # example - iam-api

  staging:
    if: github.ref == 'refs/heads/master'
    runs-on: ubuntu-latest
    needs:
      - test
      - test-opa
    steps:
      - uses: extenda/shared-workflows/composite-actions/nodejs-generic-api/staging-deploy@master
        with: 
          SECRET_AUTH: ${{ secrets.SECRET_AUTH }}
          GCLOUD_AUTH: ${{ secrets.GCLOUD_AUTH_STAGING }}
          image: ${{ env.IMAGE_NAME }}
          test-user-tenant-id: testrunner-3z05y # staging testrunner
          service-url: <url of service, should end with .dev> # example - https://iam-api.retailsvc.dev

  prod:
    if: github.ref == 'refs/heads/master'
    runs-on: ubuntu-latest
    needs: staging
    steps:
      - uses: extenda/shared-workflows/composite-actions/nodejs-generic-api/prod-deploy@master
        with: 
          SECRET_AUTH: ${{ secrets.SECRET_AUTH }}
          GCLOUD_AUTH: ${{ secrets.GCLOUD_AUTH_PROD }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          system: <system name in styra> # example - iam
          service-name: <name of the service in cloud run> # example - iam-api
          image: ${{ env.IMAGE_NAME }}

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
