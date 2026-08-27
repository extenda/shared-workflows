# k6 Cloud Run Job

Runs a k6 performance test as a Cloud Run Job **inside the VPC**, and reports the summary to
the SRE API so results can be trended over time.

## When to use this instead of `k6-performance-test`

Use `generic/k6-performance-test` when the service under test is
reachable from a GitHub runner. It runs k6 on the runner itself and is much simpler.

Use this action when it is not: an internal-only Cloud Run service, a service behind
Cloud Armor, or anything that only resolves on the clan network. The test then has to run
from inside the VPC, which means the runner cannot see the results either — the job shares
no volume with the pipeline that started it, and may not have been started by a pipeline at
all. So the container uploads its own summary before it exits. There is nothing to fetch.

```
 GitHub runner                Cloud Run Job (in the VPC)              SRE API
 ─────────────                ──────────────────────────              ───────
 build + push image  ─────▶
 execute --wait      ─────▶   mint ID tokens (target + sre-api)
                              k6 run --summary-export
                              POST /api/v1/k6/summary       ─────▶    GCS + Postgres
                              exit with k6's exit code
        ◀──────────────────── exit code
```

## Usage

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
          assets-path: target/k6
          script: my-test.js
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
every merge.

## What your k6 script gets

The action generates the Dockerfile, so you do not write one. Your `assets-path` directory
is copied to `/k6-tests` and the script is run from there — `open('./requests.json')` and
similar relative reads work as they do locally.

These are set by the entrypoint:

| k6 env var | From | Notes |
|---|---|---|
| `TARGET_HOST` | `target-host` | Same value as `GRPC_HOST`; use whichever fits your protocol. |
| `GRPC_HOST` | `target-host` | |
| `GRPC_AUTHORITY` | `target-authority` | Empty unless set. |
| `AUTH_TOKEN` | minted for `target-audience` | Empty if `target-audience` is not set. |

## Slack reporting

Opt in with `slack-notify`. The action reads the run back from the SRE API — the same record
it just uploaded — and posts through `extenda/actions/slack-notify`.

```yaml
      - uses: extenda/shared-workflows/generic/k6-cloud-run-job@v0
        with:
          mode: execute
          # ...
          slack-notify: always                 # never (default) | on-failure | always
          slack-channel: '#my-clan-alerts'     # empty = clan monitoring channel
          slack-service-account-key: ${{ secrets.SECRET_AUTH }}
          sre-api-service-account: my-service@my-clan-prod-1234.iam.gserviceaccount.com
```

Three outcomes, distinguished from the stored thresholds rather than from an exit code —
Cloud Run doesn't surface the container's exit code conveniently, and the summary already
carries the answer:

| Outcome | Meaning | Message |
|---|---|---|
| ✅ passed | summary present, every threshold `ok` | metrics table |
| ⚠️ crossed a threshold | summary present, a threshold failed | which thresholds, then the metrics table |
| 🔴 no result | nothing reached the SRE API | pointer to the Cloud Run execution logs |

The 🔴 case is the one worth having: it means k6 never ran or never finished — a bad image,
a missing token, an unreachable service — which is a different problem from missing an SLO.

`on-failure` posts only for the last two.

### Choosing metrics

`slack-metrics` takes one `name:statistic` per line. It defaults to metrics **every** k6 test
emits, so a caller gets something useful before knowing its own metric names:

```
iterations:count
iteration_duration:avg
iteration_duration:p95
checks:rate
```

Add whatever else your test records — `http_req_duration:p95`, `grpc_req_duration:avg`, or a
custom `Trend`. A metric this run didn't emit is skipped, so the defaults stay safe for both
HTTP and gRPC tests.

Two constraints come from how the SRE API stores summaries:

- **Statistics are limited to** `avg`, `min`, `med`, `max`, `count`, `rate`, `value`,
  `passes`, `fails`, `p90`, `p95`. Anything else your test computes is kept in the stored
  JSON but is not addressable here.
- **Write `p95`, not k6's `p(95)`** — the SRE API renames them on ingest.

The notification never fails the workflow: the execute step already carries the verdict, and
a broken Slack post must not change it. A run that can't be read back is reported as 🔴
rather than silently skipped.

## Inputs

See [`action.yaml`](action.yaml) for the full list and defaults. The ones worth thinking
about:

| Input | Notes |
|---|---|
| `mode` | `deploy`, `execute`, or `both`. Default `both`. |
| `service-name`, `test-name`, `environment`, `clan`, `project-id` | The **partition key** behind `GET /k6/trends`. Changing any of them starts a new series, so pick them once and keep them stable. |
| `assets-path` | Must exist when the action runs. Generate it in an earlier step. |
| `job-service-account` | Needs access to the service under test. Its project must be one the SRE API accepts. |
| `target-audience` | Leave empty if the service under test needs no identity token. |
| `max-retries` | Keep at `0`. A retry replays the whole load and uploads a second summary. |
| `extra-dockerfile-lines` | Escape hatch for an image that needs more than `curl`. |

## Reading the results

```bash
curl "https://sre-api.retailsvc.com/api/v1/k6/trends?serviceName=my-service&testName=my-test&environment=production&statistic=p95"
```

## Notes and known gaps

- **A threshold breach fails the workflow.** The entrypoint exits with k6's own exit code
  and `execute` uses `--wait`, so a crossed threshold (exit 99) surfaces as a red step.
- **An upload failure does not.** It logs a `WARN` and leaves the exit code alone: a flaky
  SRE API must not turn a healthy run red, nor mask a threshold breach.
- **`duration_ms` is currently null.** The SRE API reads `state.testRunDurationMs`, which
  `--summary-export` does not emit. Emitting the richer `handleSummary` format instead would
  fix it, at the cost of changing the JSON shape any existing consumer parses.
- **Only `p90` and `p95` become queryable columns.** Other percentiles survive in the stored
  JSON and as threshold pass/fail, but not as trendable numbers.
