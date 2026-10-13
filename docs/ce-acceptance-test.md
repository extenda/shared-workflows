# Checkout Engine acceptance test

[`ce-acceptance-test.yml`](../.github/workflows/ce-acceptance-test.yml) runs a customer Checkout Engine's
cucumber acceptance tests against the engine in docker compose. Use it in the commit workflow of a
customer Checkout Engine repository whose suite uses the shared
[`@hiiretail/cucumber-checkout-engine`](https://github.com/extenda/hiiretail-checkout-engine) steps.

The workflow runs one job per country in `countries`. Each job:

1. Packages the repository with Maven.
2. Builds the test database image from the commit's test data (`ITGeiTestData`), so the tests use the
   test data of the commit and not the last one pushed from the default branch.
3. Starts the engine with `docker compose up --build`, with `COUNTRY_MODULE` set to the country.
4. Installs the cucumber project, after authenticating to Artifact Registry, and runs `npm run lint:js`
   (if the project has it) and `npm run test:ci` with `COUNTRY_CODE` set to the country.
5. Optionally builds, pushes and attests the engine image. Only the first country's job does this, after
   its tests pass. Gate releases on the whole calling workflow, so that every country must pass.

## Repository requirements

- `.java-version` and `.nvmrc` in the repository root.
- A `docker-compose.yaml` that starts the engine on port 8080, with the country module from
  `COUNTRY_MODULE` (for example `COUNTRY_MODULE: ${COUNTRY_MODULE:-SE}`), and any stubs the engine needs.
- A cucumber project in `working-directory` with a `package-lock.json`, an `.npmrc` for the
  `@hiiretail` registry, and a `test:ci` script. To run scenarios only for some countries, tag them and
  build a tag expression from `COUNTRY_CODE` in the cucumber configuration.
- An `ITGeiTestData` test that builds the test database image, unless `build-test-database` is `false`.

## Usage

```yaml
jobs:
  test:
    uses: extenda/shared-workflows/.github/workflows/ce-acceptance-test.yml@v0
    with:
      countries: '["SE", "NO", "FI", "DE"]'
      image-name: eu.gcr.io/extenda/my-checkout-engine
    secrets: inherit
```

The calling workflow needs these permissions:

```yaml
permissions:
  contents: read
  id-token: write
```

## Inputs

| Input                 | Default                                     | Description                                                                                      |
|-----------------------|---------------------------------------------|--------------------------------------------------------------------------------------------------|
| `countries`           | `["SE"]`                                    | A JSON array of the country modules to test. Each runs in its own job.                           |
| `image-name`          |                                             | Push and attest the engine image as `<image-name>:<commit SHA>`. Empty skips it.                 |
| `cucumber-args`       |                                             | Extra arguments for the cucumber run, for example `--tags "not @staging"`.                       |
| `working-directory`   | `acceptance/cucumber`                       | The directory of the cucumber project.                                                           |
| `build-test-database` | `true`                                      | Build the test database image from the commit's test data. When `false`, docker compose pulls it. |
| `test-database-args`  | `test -Dtest=ITGeiTestData …ClassPathLoader` | The Maven arguments that build the test database image.                                          |

## Secrets

Pass them with `secrets: inherit`.

| Secret                | Description                                                                                  |
|-----------------------|----------------------------------------------------------------------------------------------|
| `SECRET_AUTH`         | Service account key for Nexus.                                                               |
| `GCLOUD_AUTH_STAGING` | Service account key for the test database, the cucumber test users, GCR and image attestation. |

## Moving from a copied test job

Replace the `test` job in the commit workflow with the caller above, and delete
`.github/actions/cucumber`. The `TEST_USER_PASSWORD` secret isn't needed: the shared cucumber steps read
the test users' passwords from Secret Manager.
