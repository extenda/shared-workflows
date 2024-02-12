# Cloud SQL Liquibase composite Action

Sets up a proxy to be able to connect to Cloud SQL (Postgres) instance,
then call Liquibase to update the database through the proxy.

## Usage

```yaml
jobs:
  ...
  liquibase-staging:
    if: github.ref == 'refs/heads/master'
    needs:
      - ...
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Apply changesets
        uses: extenda/shared-workflows/generic/cloud-sql-liquibase@v0
        with:
          GCLOUD_AUTH: ${{ secrets.GCLOUD_AUTH_STAGING }}
          DB_INST_SECRET_NAME: ...
          DB_NAME_SECRET_NAME: ...
          DB_USER_SECRET_NAME: ...
          DB_PASS_SECRET_NAME: ...
