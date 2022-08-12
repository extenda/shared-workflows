# Instructions

This is recommended step by step instruction, to use this composite actions.
- First you should run [test-unit](test-unit) and [test-opa](test-opa) in parallel,
because this two actions, do not depend on any other action.
- After all tests, you should run [staging-deploy](staging-deploy). This run
should depend on [test-unit](test-unit) and [test-opa](test-opa).
- After deploy to staging, you should run [prod-deploy](prod-deploy).
This run should depend on [staging-deploy](staging-deploy).
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
          system: <system name>
          service-name: <service name>

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
          test-user-tenant-id: extenda-ygt4u # staging extenda
          service-url: <url of service, should end with .dev>

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
          system: <system name>
          service-name: <service name>
          image: ${{ env.IMAGE_NAME }}

  dora:
    runs-on: ubuntu-latest
    needs: prod
    steps:
      - uses: extenda/shared-workflows/composite-actions/generic/dora@master
        with: 
          SECRET_AUTH: ${{ secrets.SECRET_AUTH }}
          GCLOUD_AUTH: ${{ secrets.GCLOUD_AUTH_PROD }}
          product-name: <system name in styra>
          product-component: <name of the service in cloud run>
          jira-project-key: ${{ env.IMAGE_NAME }}
```
