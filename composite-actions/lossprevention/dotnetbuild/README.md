# DotnetBuild Composite Action

Build, test, analyze, and optionally publish Docker images and Pact contracts for lossprevention services using .NET.

## Usage

```yaml
- name: Dotnet Build
  uses: ./composite-actions/lossprevention/dotnetBuild
  with:
    secret-auth: ${{ secrets.SECRET_AUTH }}
    secret-push-attest-auth: ${{ secrets.GCLOUD_AUTH_STAGING }}
    dotnet-version: '8.0.x'
    application-name: 'my-service'
    dotnet-service-project: 'BasketAuditDeterminationService'
    # Optional:
    clan: 'lossprevention'
    sonar-host: 'https://sonarcloud.io'
    pact-directory: './pacts'
    pact-broker-baseuri: 'https://pact-broker.retailsvc.com'
```

## Inputs

| Name                      | Required | Default                        | Description                                                                                      |
|---------------------------|----------|--------------------------------|--------------------------------------------------------------------------------------------------|
| `secret-auth`             | Yes      |                                | SECRET_AUTH value from secrets.                                                                  |
| `secret-push-attest-auth` | Yes      |                                | Auth for pushing/attesting Docker image (e.g., `secrets.GCLOUD_AUTH_STAGING`).                  |
| `dotnet-version`          | Yes      |                                | Version of .NET to install (e.g., `8.0.x`).                                                     |
| `application-name`        | Yes      |                                | Name for the application (used for image name and Pact, if applicable).                         |
| `dotnet-service-project`  | Yes      |                                | Project/folder of the service entry point to build Docker image from.                            |
| `clan`                    | No       | `lossprevention`               | Name of the clan (used for image name).                                                         |
| `sonar-host`              | No       | `https://sonarcloud.io`        | Host to use for Sonar scanning.                                                                 |
| `pact-directory`          | No       |                                | Directory for Pact files. Leave out to disable consumer side Pact steps.                                       |
| `pact-broker-baseuri`     | No       | `https://pact-broker.retailsvc.com` | Base URI for the Pact broker (used to publish Pacts).                                           |

## Outputs

| Name      | Description                                                                 |
|-----------|-----------------------------------------------------------------------------|
| `version` | The version that was built and, if on master, pushed and attested.          |

## Features

- Checks out code and sets up .NET.
- Restores dependencies and builds the solution.
- Runs tests with coverage.
- Runs SonarCloud analysis.
- Optionally publishes Pact contracts and verifies deployability.
- Builds and pushes Docker images (on `master` branch).
- Attests Docker images (on `master` branch).

## Notes

- Only pushes and attests Docker images when running on the `master` branch.
- Pact steps are only executed if `pact-directory` is provided.
- Make sure required secrets are available in your workflow.

## Example Workflow

```yaml
name: Build and Publish

on:
  push:
    branches: [ master ]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Dotnet Build
        uses: ./composite-actions/lossprevention/dotnetBuild
        with:
          secret-auth: ${{ secrets.SECRET_AUTH }}
          secret-push-attest-auth: ${{ secrets.GCLOUD_AUTH_STAGING }}
          dotnet-version: '8.0.x'
          application-name: 'myservice'
          dotnet-service-project: 'src/MyService'