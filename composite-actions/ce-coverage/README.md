# Checkout Engine coverage composite action

The coverage reports of a customer Checkout Engine, in the job summary and one pull request comment. Customer
repositories don't use the action themselves: they call the two workflows that use it.

| Workflow | Step | Reports |
|---|---|---|
| [`ce-customization-coverage.yml`](../../.github/workflows/ce-customization-coverage.yml) | `customization` | Which customizations a pull request changes, and whether scenarios test them ([docs](../../docs/ce-customization-coverage.md)) |
| [`ce-acceptance-test.yml`](../../.github/workflows/ce-acceptance-test.yml) with `plugin-coverage` | `prepare`, `collect`, `report` | Which lines of the plugins the acceptance tests run, with JaCoCo ([docs](../../docs/ce-acceptance-test.md#plugin-coverage)) |

The plugin coverage takes three steps because it happens at three points: before the engine starts, after each
country's scenarios, and in a job after every country. Each report is one section of the pull request comment,
and each workflow replaces only its own.

| File | Purpose |
|---|---|
| `action.yml` | Runs the step, its artifacts and its section of the comment |
| `customization-coverage.mjs` | Classifies a pull request's changes and writes the customization report |
| `plugin-coverage.sh` | The `prepare`, `collect` and `report` steps of the plugin coverage, and the pinned JaCoCo |
| `plugin_report.py` | Writes the plugin coverage report |
| `comment.mjs` | Finds the pull request and its comment, and writes one section |
| `*.test.sh`, `*.test.mjs`, `*_test.py` | Tests |

## Usage

```yaml
# ce-customization-coverage.yml, on pull_request, after actions/checkout with fetch-depth: 0
- uses: extenda/shared-workflows/composite-actions/ce-coverage@v0
  with:
    step: customization

# ce-acceptance-test.yml, in each country's job: before docker compose, and after cucumber
- uses: extenda/shared-workflows/composite-actions/ce-coverage@v0
  with:
    step: prepare
- uses: extenda/shared-workflows/composite-actions/ce-coverage@v0
  if: ${{ !cancelled() }}
  with:
    step: collect
    country: ${{ matrix.country }}
    outcome: ${{ steps.cucumber.outcome || 'skipped' }}

# ce-acceptance-test.yml, in a job that needs every country
- uses: extenda/shared-workflows/composite-actions/ce-coverage@v0
  with:
    step: report
    countries: '["SE", "NO"]'
```

The comment needs `pull-requests: write`, and showing the plugin coverage of acceptance tests that ran before the
pull request was opened needs `actions: read`. Without them, the action warns and doesn't fail.

### Inputs

- `step` (required): `customization`, `prepare`, `collect` or `report`.
- `fail-on` (`customization`): `none` (default), `unmapped` or `untested`. When it fails the action, the report
  and the comment are written first.
- `modules` (`prepare`, `collect`): A glob of the Maven modules with the plugins. Defaults to `plugins/*`.
- `country` (`collect`): The country module the scenarios ran for.
- `outcome` (`collect`): The outcome of the cucumber step. Without a run, no data is collected.
- `countries` (`report`): A JSON array of every country module that was tested.

### Outputs

- `report` (`customization`, `report`): Path to the Markdown report.

## Running locally

```bash
cd composite-actions/ce-coverage
npm ci
node customization-coverage.mjs --repo ../../../my-checkout-engine --base origin/master
./customization-coverage.test.sh
node --test comment.test.mjs
python3 -m unittest plugin_report_test
```
