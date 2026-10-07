# Checkout Engine dependency lift

[`ce-dependency-lift.yml`](../.github/workflows/ce-dependency-lift.yml) opens a pull request that lifts a
Checkout Engine dependency to a new version. Use it in a customer Checkout Engine repository when the
standard Checkout Engine, or a plugin, releases a new version.

The workflow:

1. Sets a Maven property to the new version with `versions:set-property`.
2. Optionally updates the `checkout-engine:vX.Y.Z` image tag in the `Dockerfile`.
3. Opens a GPG-signed pull request on `chore/update-<dependency-name>-version-<X-Y-Z>` with the given label.
4. Closes every other open pull request with the same label, and deletes their branches.
5. Optionally posts the pull request link to a Slack channel. This step is disabled for now, and `slack-channel` is ignored.

The pull request is created with the org token (Secret Manager key `github-token`), not `GITHUB_TOKEN`.
GitHub doesn't start `push` or `pull_request` workflows for events caused by `GITHUB_TOKEN`, so with
the org token the repository's CI and required checks run on the lift pull request.

## Usage

```yaml
name: upstream-lift
on:
  repository_dispatch:
    types: [downstream]
  workflow_dispatch:
    inputs:
      version:
        description: The version to lift to, e.g. 48.7.0
        required: true
        type: string

permissions:
  contents: read
  id-token: write

jobs:
  lift:
    uses: extenda/shared-workflows/.github/workflows/ce-dependency-lift.yml@v0
    with:
      version: ${{ github.event.client_payload.version || inputs.version }}
      slack-channel: my-builds-channel
    secrets: inherit
```

To lift a plugin that has no Docker image, set the property and POM, turn off the `Dockerfile` update,
and give it its own name and label so the two lifts don't close each other's pull requests:

```yaml
    with:
      version: ${{ github.event.client_payload.version || inputs.version }}
      property: myplugin.version
      pom-file: plugins/pom.xml
      update-dockerfile-tag: false
      dependency-name: myplugin
      label: myplugin-lift
```

## Inputs

| Input                   | Default                       | Description                                                                         |
|-------------------------|-------------------------------|-------------------------------------------------------------------------------------|
| `version`               | (required)                    | The version to lift to, `X.Y.Z`.                                                    |
| `property`              | `std.checkout-engine.version` | The Maven property that holds the version.                                          |
| `pom-file`              | `pom.xml`                     | The POM file that defines the property.                                             |
| `update-dockerfile-tag` | `true`                        | Also update the `checkout-engine:vX.Y.Z` image tag in the `Dockerfile`.             |
| `dependency-name`       | `CE`                          | The name used in the pull request title and branch.                                 |
| `label`                 | `std-lift`                    | The pull request label. Older open pull requests with this label are closed.        |
| `slack-channel`         |                               | A Slack channel to notify when the pull request is created. Ignored for now.        |
| `base`                  | `master`                      | The branch to lift and open the pull request against.                              |

## Secrets

Pass them with `secrets: inherit`.

| Secret            | Description                                                                         |
|-------------------|-------------------------------------------------------------------------------------|
| `SECRET_AUTH`     | Service account key for Secret Manager (`nexus-*`, `github-token`) and Slack.       |
| `GPG_PRIVATE_KEY` | The key that signs the lift commit.                                                 |
| `GPG_PASSPHRASE`  | The passphrase for `GPG_PRIVATE_KEY`.                                               |

## Outputs

| Output                | Description                                                                 |
|-----------------------|-----------------------------------------------------------------------------|
| `pull-request-number` | The number of the lift pull request. Empty if the base already has the version. |
| `pull-request-url`    | The URL of the lift pull request. Empty if the base already has the version.    |

## Moving from a copied workflow

The close step only sees pull requests with the new label. Close any lift pull requests still open
under the old label (for example `automated pr`) when you switch to this workflow.
