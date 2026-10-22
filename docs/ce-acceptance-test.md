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
4. Installs the cucumber project and runs `npm run lint:js` (if the project has it) and `npm run test:ci`
   with `COUNTRY_CODE` set to the country. If the project has an `.npmrc`, it first authenticates npm to
   Artifact Registry, where `@hiiretail/cucumber-checkout-engine` is published.
5. Optionally builds, pushes and attests the engine image. Only the first country's job does this, after
   its tests pass. Gate releases on the whole calling workflow, so that every country must pass.

With `plugin-coverage`, it also measures which lines of the plugins the scenarios run, see
[Plugin coverage](#plugin-coverage).

## Repository requirements

- `.java-version` and `.nvmrc` in the repository root.
- A `docker-compose.yaml` that starts the engine on port 8080, with the country module from
  `COUNTRY_MODULE` (for example `COUNTRY_MODULE: ${COUNTRY_MODULE:-SE}`), and any stubs the engine needs.
- A cucumber project in `working-directory` with a `package-lock.json` and a `test:ci` script. With the
  shared steps, it also needs an `.npmrc` for the `@hiiretail` registry. A suite with a copied step library
  can move to this workflow first, and to the shared steps later. To run scenarios only for some countries, tag them and
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

A repository with one country lists only that country:

```yaml
    with:
      countries: '["NO"]'
```

`COUNTRY_CODE` overrides the `countryCode` world parameter in the cucumber configuration, so list the
country the engine runs with, also when `docker-compose.yaml` sets `COUNTRY_MODULE` to a fixed value.

The calling workflow needs these permissions:

```yaml
permissions:
  contents: read
  id-token: write
```

## Inputs

| Input                 | Default                                     | Description                                                                                      |
|-----------------------|---------------------------------------------|--------------------------------------------------------------------------------------------------|
| `countries`           | (required)                                  | A JSON array of the country modules to test, e.g. `["SE"]`. Each runs in its own job.            |
| `image-name`          |                                             | Push and attest the engine image as `<image-name>:<commit SHA>`. Empty skips it.                 |
| `cucumber-args`       |                                             | Extra arguments for the cucumber run, for example `--tags "not @staging"`.                       |
| `working-directory`   | `acceptance/cucumber`                       | The directory of the cucumber project.                                                           |
| `build-test-database` | `true`                                      | Build the test database image from the commit's test data. When `false`, docker compose pulls it. |
| `test-database-args`  | `test -Dtest=ITGeiTestData …ClassPathLoader` | The Maven arguments that build the test database image.                                          |
| `plugin-coverage`     | `false`                                     | Measure with JaCoCo which lines of the plugins the scenarios run, see [Plugin coverage](#plugin-coverage). |
| `plugin-modules`      | `plugins/*`                                 | A glob of the Maven modules with the plugins. Their classes are instrumented and reported.       |

## Secrets

Pass them with `secrets: inherit`.

| Secret                | Description                                                                                  |
|-----------------------|----------------------------------------------------------------------------------------------|
| `SECRET_AUTH`         | Service account key for Nexus.                                                               |
| `GCLOUD_AUTH_STAGING` | Service account key for the test database, the cucumber test users, GCR and image attestation. |

## Plugin coverage

```yaml
    with:
      countries: '["SE", "NO"]'
      plugin-coverage: true
```

Each country's job mounts the [JaCoCo](https://www.jacoco.org/jacoco/) agent into the engine container,
instrumenting only the packages of the classes in `plugin-modules`. After the scenarios, it collects which
lines ran. A `plugin coverage` job then merges the countries, since each country runs its own plugin code, and
writes the share of lines and branches that ran, per package and with the classes that miss most, to the
workflow summary. The line-by-line report is in the `plugin-coverage-report` artifact. Only classes compiled
from a module's `src/main/java` count, so code generated at build time, for example from a `.proto` file,
isn't part of the plugins' coverage.

Every customer engine should run at least 85% of its plugins' lines in the acceptance tests. Below that, the
summary and the comment show a warning, and the run gets a warning annotation. The build doesn't fail.
Percentages are rounded down, so a coverage below 85% never shows as 85.0%.

The coverage counts the data of every country whose scenarios ran, also when some of them failed, since those
lines did run. A country whose scenarios failed or didn't run, for example because lint failed, is named in a
warning, and the coverage isn't compared with 85%, since it's lower than with every scenario. Without any data,
the report says so instead of showing a number. The report names the commit it measured, and a warning names
classes whose coverage data doesn't match their class files, which happens when the countries' builds differ.

When the pushed commit is the head of an open pull request, the job also writes the result to the pull
request's coverage comment, next to the [customization coverage](ce-customization-coverage.md). That needs
`pull-requests: write` in the calling workflow; without it, the job warns and leaves the comment out:

```yaml
permissions:
  contents: read
  id-token: write
  pull-requests: write
```

The agent is added with a second compose file and `JDK_JAVA_OPTIONS`, which the `java` launcher reads on top of
the repository's own `JAVA_TOOL_OPTIONS`. The engine service must be called `checkout-api`. The image that's
pushed is built without the agent. Measured on Rusta, the agent made no noticeable difference to the run time.
The steps are in the [`ce-coverage`](../composite-actions/ce-coverage) composite action.

The JaCoCo jars come from Maven Central, and the Actions cache keeps them, so most runs don't download them.
When the agent can't be added, for example because Maven Central limits the rate, the country's scenarios still
run, without it, and the report names the country as incomplete. The coverage never stops the acceptance tests.

Plugin coverage tells which plugin code no scenario runs. For which configuration has no scenario, use
[`ce-customization-coverage.yml`](ce-customization-coverage.md).

## Moving from a copied test job

Replace the `test` job in the commit workflow with the caller above, and delete
`.github/actions/cucumber`. The `TEST_USER_PASSWORD` secret isn't needed: the shared cucumber steps read
the test users' passwords from Secret Manager.
