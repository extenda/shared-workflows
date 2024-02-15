# Acceptance Composite Action

Performs acceptance tests for lossprevention services using Postman tests.

## Usage

### Inputs

- `secret-auth` (required): SECRET_AUTH value from secrets.
- `gcloud-auth` (required): GCLOUD_AUTH_STAGING/GCLOUD_AUTH_PROD value from secrets based on the environment.
- `collection` (optional): path of the collection to use. Default collection path:  ```./slp/tests/acceptance/integration_test.postman_collection.json```
- `environment` (optional): path of the environment variable to use. Default collection path: ```./slp/tests/acceptance/integration_test.staging.postman_environment.json```

### Example
1. With default settings
```yaml
- name: Acceptance tests
        uses: extenda/shared-workflows/composite-actions/lossprevention/acceptance@master
        with: 
          secret-auth: ${{ secrets.SECRET_AUTH }}
          gcloud-auth: ${{ secrets.GCLOUD_AUTH_STAGING }}
```
2. With custom settings
```yaml
- name: Acceptance tests
        uses: extenda/shared-workflows/composite-actions/lossprevention/acceptance@master
        with: 
          secret-auth: ${{ secrets.SECRET_AUTH }}
          gcloud-auth: ${{ secrets.GCLOUD_AUTH_STAGING }}
          collection: './slp/tests/acceptance/integration_test.postman_collection.json'
          environment: './slp/tests/acceptance/integration_test.staging.postman_environment.json'
```

### Requirements

- You have to pass the required inputs.
