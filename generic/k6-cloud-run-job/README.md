# k6 performance test

Runs a k6 performance test and reports the summary to the SRE API so results can be trended
over time, either as a Cloud Run Job **inside the VPC** or directly on the GitHub runner.
Which one to use is a single input: `runtime`.

## Choosing a runtime

This is about reachability, not test size or duration:

- **`runtime: github-actions`** (simpler) — the service under test is reachable from a
  GitHub-hosted runner: a public URL, a staging endpoint, anything that resolves outside
  the VPC. k6 runs directly on the runner.
- **`runtime: cloud-run-job`** (default) — it is not: an internal-only Cloud Run service, a
  service behind Cloud Armor, or anything that only resolves on the clan network. The test
  then has to run from inside the VPC, which means the runner cannot see the results
  either — the job shares no volume with the pipeline that started it, and may not have
  been started by a pipeline at all. So the container uploads its own summary before it
  exits.

A five-minute test against an internal-only service still needs `cloud-run-job` — a runner
cannot reach the target regardless of how long the test runs. A one-hour test against a
public staging URL can still use `github-actions`.

```
 cloud-run-job:
 GitHub runner                Cloud Run Job (in the VPC)              SRE API
 ─────────────                ──────────────────────────              ───────
 build + push image  ─────▶
 execute --wait      ─────▶   mint ID tokens (target + sre-api)
                              k6 run --summary-export
                              POST /api/v1/k6/summary       ─────▶    GCS + Postgres
                              exit with k6's exit code
        ◀──────────────────── exit code
 post pass/fail to Slack

 github-actions:
 GitHub runner                                                        SRE API
 ─────────────                                                        ───────
 mint ID token (target)
 k6 run --summary-export
 mint ID token (sre-api)
 POST /api/v1/k6/summary                                     ─────▶   GCS + Postgres
 post pass/fail to Slack
```

## Usage: cloud-run-job

Deploy the job on merge, execute it on demand — the common split, since a performance test
against production usually should not run on every push:

```yaml
  performance-job-build:
    if: github.ref == 'refs/heads/master'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5

      # Produce the k6 script and any data it opens, however your project does that.
      - run: ./scripts/generate-k6-assets.sh

      - uses: extenda/shared-workflows/generic/k6-cloud-run-job@v0
        with:
          mode: deploy
          service-account-key: ${{ secrets.GCLOUD_AUTH_PROD }}
          project-id: my-clan-prod-1234
          job-name: my-service-performance-test
          image: eu.gcr.io/extenda/my-service-performance
          script-path: target/k6/my-test.js
          job-service-account: my-service@my-clan-prod-1234.iam.gserviceaccount.com
          target-host: my-service.internal:80
          target-audience: my-service
          service-name: my-service
          test-name: my-test
          environment: production
          clan: my-clan
```

```yaml
# .github/workflows/run-performance-test.yaml
on: workflow_dispatch
jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: extenda/shared-workflows/generic/k6-cloud-run-job@v0
        with:
          mode: execute
          service-account-key: ${{ secrets.GCLOUD_AUTH_PROD }}
          project-id: my-clan-prod-1234
          job-name: my-service-performance-test
          service-name: my-service
          test-name: my-test
          environment: production
          clan: my-clan
```

`mode: both` builds, deploys and runs in one step, for a test cheap enough to run on
every merge. `mode` is ignored when `runtime` is `github-actions` — there is no job to
deploy, so every run does the equivalent of `both`.

## Usage: github-actions

One step, no deploy/execute split — the checkout and any asset generation happen in your
own job before this step, the same as `cloud-run-job`'s build step expects:

```yaml
on: workflow_dispatch
jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5

      - run: ./scripts/generate-k6-assets.sh

      - uses: extenda/shared-workflows/generic/k6-cloud-run-job@v0
        with:
          runtime: github-actions
          service-account-key: ${{ secrets.GCLOUD_AUTH_STAGING }}
          project-id: my-clan-staging-5678
          script-path: target/k6/my-test.js
          job-service-account: my-service@my-clan-staging-5678.iam.gserviceaccount.com
          target-host: my-service.retailsvc.dev
          target-audience: my-service
          service-name: my-service
          test-name: my-test
          environment: staging
          clan: my-clan
```

`job-service-account` means something slightly different here: with no Cloud Run Job to
run as, it is the account the action impersonates (via `extenda/actions/identity-token`)
to mint the identity tokens it needs — one for `target-audience`, one for the SRE API
upload.

## What your k6 script gets

Same env vars either way, so a script does not need to know which runtime ran it:

| k6 env var | From | Notes |
|---|---|---|
| `TARGET_HOST` | `target-host` | Same value as `GRPC_HOST`; use whichever fits your protocol. |
| `GRPC_HOST` | `target-host` | |
| `GRPC_AUTHORITY` | `target-authority` | Empty unless set. |
| `AUTH_TOKEN` | minted for `target-audience` | Empty if `target-audience` is not set. |

For `cloud-run-job`, the action generates the Dockerfile, so you do not write one — your
directory holding `script-path` is copied to `/k6-tests` and the script runs from
there, so `open('./requests.json')` and similar relative reads work as they do locally.
For `github-actions`, the script runs directly against `script-path` in the runner's own
workspace — same relative-read behavior, no build step.

## Slack reporting

Opt in with `slack-notify`. The action posts whether the execution succeeded or failed
through `extenda/actions/slack-notify` — it does not read the summary back from the SRE API,
so it needs only `slack-service-account-key`, not a service account to mint an SRE API token.

```yaml
      - uses: extenda/shared-workflows/generic/k6-cloud-run-job@v0
        with:
          mode: execute
          # ...
          slack-notify: always                 # never (default) | on-failure | always
          slack-channel: '#my-clan-alerts'     # empty = clan monitoring channel
          slack-service-account-key: ${{ secrets.SECRET_AUTH }}
```

Two outcomes, taken directly from the run's exit code — `gcloud run jobs execute --wait`
for `cloud-run-job`, k6's own exit code for `github-actions`:

| Outcome | Meaning |
|---|---|
| ✅ succeeded | exit 0 — k6 ran and every threshold held |
| 🔴 failed | non-zero exit — a threshold breach, or k6 never produced a result |

`on-failure` posts only for the failed case. Neither case includes a metrics breakdown; check
the execution logs or `GET /k6/trends` for the numbers.

The notification never fails the workflow on its own: a broken Slack post must not mask or
manufacture a verdict. The action still fails the step afterward if the run itself failed.

## Inputs

See [`action.yaml`](action.yaml) for the full list and defaults. The ones worth thinking
about:

| Input | Notes |
|---|---|
| `runtime` | `cloud-run-job` (default) or `github-actions`. See "Choosing a runtime" above. |
| `mode` | `cloud-run-job` only: `deploy`, `execute`, or `both`. Default `both`. Ignored for `github-actions`. |
| `service-name`, `test-name`, `environment`, `clan`, `project-id` | The **partition key** behind `GET /k6/trends`. Changing any of them starts a new series, so pick them once and keep them stable. |
| `script-path` | Must exist when the action runs. Generate it in an earlier step, for either runtime. Its directory travels with it -- anything the script opens by relative path must live alongside it. |
| `job-service-account` | `cloud-run-job`: the account the job runs as. `github-actions`: the account impersonated to mint identity tokens. Either way it needs access to the service under test, and its project must be one the SRE API accepts. |
| `target-audience` | Leave empty if the service under test needs no identity token. |
| `max-retries` | `cloud-run-job` only. Keep at `0`. A retry replays the whole load and uploads a second summary. |
| `extra-dockerfile-lines` | `cloud-run-job` only. Escape hatch for an image that needs more than `curl`. |
| `k6-version` | `cloud-run-job` only. The `grafana/k6` base image tag. **Not dependabot-visible** — the Dockerfile is generated, so there is no `FROM` line for it to find. Bump by hand. |
| `k6-flags` | Extra `k6 run` flags, e.g. `--vus 5 --duration 60s --rps 10`. Needed unless your script already sets its own load shape via `options.scenarios` — without it (or that), k6 defaults to 1 VU / 1 iteration and finishes almost instantly. |

## Reading the results

```bash
curl "https://sre-api.retailsvc.com/api/v1/k6/trends?serviceName=my-service&testName=my-test&environment=production&statistic=p95"
```

## Notes and known gaps

- **No load shape, no load.** If neither `k6-flags` nor the script's own
  `options.scenarios` sets VUs/duration/iterations, k6 defaults to 1 VU and 1 iteration and
  finishes in about a second -- a "successful" run that tested nothing. This is the most
  common way a migration from a bespoke k6 step silently stops load-testing: the old step
  usually passed `--vus`/`--duration` as CLI flags (e.g. `k6io/action`'s `flags:` input),
  which does not carry over automatically -- move it to `k6-flags`.
- **A threshold breach fails the workflow**, on either runtime. `cloud-run-job`'s entrypoint
  exits with k6's own exit code and `execute` uses `--wait`; `github-actions` runs k6
  directly, so its own exit code (99 on a crossed threshold) is the step's exit code.
- **An upload failure does not.** It logs a `WARN` and leaves the exit code alone: a flaky
  SRE API must not turn a healthy run red, nor mask a threshold breach.
- **`duration_ms` is currently null.** The SRE API reads `state.testRunDurationMs`, which
  `--summary-export` does not emit. Emitting the richer `handleSummary` format instead would
  fix it, at the cost of changing the JSON shape any existing consumer parses.
- **Only `p90` and `p95` become queryable columns.** Other percentiles survive in the stored
  JSON and as threshold pass/fail, but not as trendable numbers.
