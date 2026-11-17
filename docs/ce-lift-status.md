# Checkout Engine lift status

[`ce-lift-status.yml`](../.github/workflows/ce-lift-status.yml) posts the build result of a lift pull
request from [`ce-dependency-lift.yml`](ce-dependency-lift.md) to Slack, once all checks on the pull
request have finished:

- 🟢 `CE version 51.18.3 is available, build passed, ready to merge: <pull request>`
- 🔴 `CE version 51.18.3 is available, build failed, needs attention: <pull request> (failed: test)`

Call it as the last job of the workflow that builds the lift branch, with `needs` on the build jobs and
`if: always()`, so it runs whether the build passes or fails. It reads every check on the pull request,
including other workflows, and waits up to two minutes for any that are still running. Because it starts
when the build is done, it adds only a few seconds of runner time.

This message replaces the one from `ce-dependency-lift`, so leave its `slack-channel` empty to post one
message per release.

## Usage

Add a job to the end of the build workflow, for example `commit.yaml`:

```yaml
jobs:
  lint:
    # ...
  test:
    # ...

  lift-status:
    if: always() && startsWith(github.ref_name, 'chore/update-ce-version-')
    needs: [lint, test]
    permissions:
      checks: read
      contents: read
      pull-requests: read
    uses: extenda/shared-workflows/.github/workflows/ce-lift-status.yml@v0
    with:
      slack-channel: my-builds-channel
    secrets: inherit
```

The `if` keeps the job to lift branches; on other branches it is skipped and no runner starts. The
calling job must grant the permissions shown, so the workflow can read the pull request and its checks.

For a plugin lift with its own `dependency-name`, match its branch and pass the same name:

```yaml
    if: always() && startsWith(github.ref_name, 'chore/update-myplugin-version-')
    # ...
    with:
      slack-channel: my-builds-channel
      dependency-name: myplugin
```

## Inputs

| Input             | Default    | Description                                                         |
|-------------------|------------|---------------------------------------------------------------------|
| `slack-channel`   | (required) | The Slack channel to post the result to.                            |
| `dependency-name` | `CE`       | The dependency name in the message, the same as in `ce-dependency-lift`. |

## Secrets

Pass them with `secrets: inherit`.

| Secret        | Description                           |
|---------------|---------------------------------------|
| `SECRET_AUTH` | Service account key used for Slack.   |
