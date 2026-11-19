# Checkout Engine lift status

[`ce-lift-status.yml`](../.github/workflows/ce-lift-status.yml) posts the build result of a lift pull
request from [`ce-dependency-lift.yml`](ce-dependency-lift.md) to Slack, once all checks on the pull
request have finished:

- 🟢 `CE version 51.18.3 is available, build passed, ready to merge: <pull request>`
- 🔴 `CE version 51.18.3 is available, build failed, needs attention: <pull request>`

Call it as the last job of the workflow that builds the lift branch, with `needs` on the build jobs and
`if: ${{ !cancelled() }}`, so it runs whether the build passes or fails. It reads every check on the pull
request, including the ones from other workflows. Because it starts when the build is done, it normally
takes a few seconds. If other checks are still running, it waits for them for up to two minutes.

The message is red, and says so, in these cases too:

- A check is still running after two minutes (`build not finished`).
- The checks can't be read (`the build status could not be read`).

Nothing is posted when the pull request is no longer open, for example when a newer lift closed it.

The message replaces the one from `ce-dependency-lift`, so leave its `slack-channel` empty. Each build of
the lift branch posts one message: a fix commit pushed to the branch, or a re-run of the build, posts the
new result.

## Usage

Add a job to the end of the build workflow, for example `commit.yaml`:

```yaml
jobs:
  lint:
    # ...
  test:
    # ...

  lift-status:
    if: ${{ !cancelled() && startsWith(github.ref_name, 'chore/update-ce-version-') }}
    needs: [lint, test]
    permissions:
      checks: read
      contents: read
      pull-requests: read
      statuses: read
    uses: extenda/shared-workflows/.github/workflows/ce-lift-status.yml@v0
    with:
      slack-channel: my-builds-channel
    secrets: inherit
```

The `if` keeps the job to lift branches; on other branches it is skipped and no runner starts.

> [!IMPORTANT]
> The calling job must grant the `permissions` shown. Without them, GitHub rejects the whole build
> workflow when it starts, on every branch, not just this job.

For a plugin lift with its own `dependency-name`, match its branch and pass the same name:

```yaml
    if: ${{ !cancelled() && startsWith(github.ref_name, 'chore/update-myplugin-version-') }}
    # ...
    with:
      slack-channel: my-builds-channel
      dependency-name: myplugin
```

## Inputs

| Input             | Default    | Description                                                               |
|-------------------|------------|---------------------------------------------------------------------------|
| `slack-channel`   | (required) | The Slack channel to post the result to.                                  |
| `dependency-name` | `CE`       | The dependency name in the message, the same as in `ce-dependency-lift`.  |

## Secrets

Pass them with `secrets: inherit`.

| Secret        | Description                           |
|---------------|---------------------------------------|
| `SECRET_AUTH` | Service account key used for Slack.   |

## Troubleshooting

`extenda/actions/slack-notify` doesn't fail the job when Slack rejects a message. If the job is green but
nothing shows up, check the step log, and that the Slack bot is a member of the channel.
