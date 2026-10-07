# PR Rebuild Check Composite Action

Decides whether the changes in a pull request require the container image to be rebuilt. If a PR
only touches files that never end up in the image (README, docs, autopilot/cloud-deploy service
definitions, CI config, ...), the image would be byte-for-byte the same, so the build can be
skipped to save CI time.

It also reports separately whether any autopilot/cloud-deploy service definition changed, so
jobs that only need to redeploy or validate service config can run without a full rebuild.

| File                     | Purpose                    |
|--------------------------|----------------------------|
| `action.yml`             | Composite action           |
| `rebuild-check.sh`       | Decision logic             |
| `rebuild-check.test.sh`  | Test suite                 |

## Usage

### Inputs

- `base-sha` (optional): Base commit to compare against. Defaults to the pull request base.
- `head-sha` (optional): Head commit to compare. Defaults to the pull request head.

Both must be given explicitly outside `pull_request` events.

### Outputs

| Output                   | `true` when                                                                                   |
|--------------------------|-----------------------------------------------------------------------------------------------|
| `rebuild`                | at least one changed file can affect the image                                                |
| `service-config-changed` | at least one autopilot/cloud-deploy service definition was added, changed, deleted or renamed |

The two outputs are independent: a PR changing both `src/` and `conf/autopilot/*.yaml` sets both
to `true`; a PR changing only an autopilot file sets `rebuild=false`, `service-config-changed=true`.

### Example

```yaml
on:
  pull_request:
    branches:
      - master

jobs:
  changes:
    runs-on: ubuntu-latest
    outputs:
      rebuild: ${{ steps.check.outputs.rebuild }}
      service-config-changed: ${{ steps.check.outputs.service-config-changed }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: PR rebuild check
        id: check
        uses: extenda/shared-workflows/composite-actions/pr-rebuild-check@master

  build:
    needs: changes
    if: needs.changes.outputs.rebuild == 'true'
    uses: extenda/shared-workflows/.github/workflows/pnp-processor-build-image.yml@v0
    # ...

  validate-service-definition:
    needs: changes
    if: needs.changes.outputs.service-config-changed == 'true'
    # ...
```

`fetch-depth: 0` is recommended. With a shallow checkout the action deepens the history itself,
since the merge base is needed for the diff.

A skipped job counts as passing for required status checks, so docs-only PRs are not blocked.
This is why gating a job with `if:` is preferred over `paths-ignore` on the workflow: a workflow
filtered out by paths never reports its checks.

## How it works

1. All changed files are listed with `git diff --name-only <base>...<head>`. The three-dot diff
   compares against the merge base, so commits that landed on the base branch after the PR
   branch was created are not counted.
2. Each file is put in one of three groups:
   - **ignored by path** (docs, CI config, tooling)
   - **service definition** (sets `service-config-changed=true`, does not affect the image)
   - **triggering** (sets `rebuild=true`). A single triggering file is enough to require a rebuild.
3. Both decisions are written to the step outputs and a report is added to the run's summary
   page, listing the files in each group.

Each push re-evaluates the whole PR against the base branch, not just the latest commit. Once a
PR contains a source change it keeps `rebuild=true`.

## What is checked

The rule is **rebuild unless every changed file is known to be safe to ignore**. Unknown file
types always trigger a rebuild, so a new kind of file can never be silently skipped.

### Ignored by path

| Pattern                                                         | Why                              |
|-----------------------------------------------------------------|----------------------------------|
| `*.md`                                                          | Documentation                    |
| `docs/**`, `<module>/docs/**`                                   | Documentation, topology dumps    |
| `.github/**`                                                    | CI config, CODEOWNERS, dependabot |
| `LICENSE`, `.gitignore`, `*.iml`                                | Repo / IDE metadata              |
| `openspec/**`, `<module>/openspec/**`                           | Spec tooling                     |
| `.pre-commit-config.yaml`, `micronaut-cli.yml` (any directory)  | Developer tooling                |

### Service definitions: autopilot and cloud-deploy (sets `service-config-changed`)

Service definitions use many different paths and names across repositories, so they are
recognised by **content** instead of path. A file is treated as a service definition when all of
these hold:

- it has a `.yaml` or `.yml` extension
- it is **not** under `src/` (at the root or in a module)
- it has a top-level `kubernetes:` **or** `cloud-run:` key
- it has a top-level `security:` key

If the file was deleted in the PR, its content is read from the base commit.

This covers every layout currently in use, for example:

| Layout                                                       | Example                                              |
|--------------------------------------------------------------|------------------------------------------------------|
| `<module>-ks/<name>-autopilot.yaml`                          | `pnp-price-sorting-ks/price-sorting-autopilot.yaml`  |
| `[<module>/]conf/autopilot/<entity>[-<role>].yaml`           | `conf/autopilot/item-flat-fanout.yaml`               |
| `<module>/conf/kubernetes/autopilot/<entity>_autopilot.yaml` | `change-detection-ks/conf/kubernetes/autopilot/item_autopilot.yaml` |
| `<module>/conf/<entity>/autopilot.yaml`                      | `change-detection-ks/conf/asmt-policy/autopilot.yaml` |
| `<name>-autopilot.yaml` / `<name>.yaml` at repo root         | `print-autopilot.yaml`, `assortment-policy.yaml`     |
| `<module>/<name>.yaml`                                       | `pnp-item-pre-handler-ks/item-pre-handler.yaml`      |
| `cloud-deploy/*-cloud-deploy.yaml`                           | `cloud-deploy/items-cloud-deploy.yaml`               |
| `clusters-configs/<env>-*-cloud-deploy.yaml`                 | `clusters-configs/prod-elastic-cloud-deploy.yaml`    |
| `[<module>/]cloud-deploy.yaml`                               | `pnp-item-id-deduplication-ks/cloud-deploy.yaml`     |

### Always triggers a rebuild

Everything else, including:

- source and resources under `src/` (including `application.yml`)
- `pom.xml`, `Dockerfile`, `entrypoint.sh`, `.mvn/**`, `settings.xml`
- application config that happens to live under `conf/`, e.g.
  `change-detection-ks/conf/asmt-policy/asmt-policy.yml`. A blanket `conf/**` ignore would be
  unsafe for this reason.
- YAML that is not a full service definition, e.g. `openapi.yaml` or legacy `staging_kubernetes.yaml`

## Running locally

```bash
# From a service repo, with shared-workflows cloned next to it
# decide for the current branch against master
../shared-workflows/composite-actions/pr-rebuild-check/rebuild-check.sh origin/master HEAD

# From shared-workflows, run the test suite (needs only bash and git)
composite-actions/pr-rebuild-check/rebuild-check.test.sh
```

Example output:

```
### Image rebuild needed: `true`
### Service config changed: `true`

**Files triggering rebuild (1):**
- `src/main/resources/application.yml`

**Changed service definitions (1):**
- `conf/autopilot/item-identifier-inheritance-validate.yaml`

**Ignored files (2):**
- `.github/workflows/pr-rebuild-check.yml`
- `README.md`

rebuild=true
service-config-changed=true
```

## Tests

`rebuild-check.test.sh` builds a throwaway git repository for each case, commits a change on top
of a base commit and asserts both outputs. It covers:

- **Rebuild:** Java source, `pom.xml`, `Dockerfile`, `application.yml`, service-definition-like
  YAML under `src/`, app config under `conf/`, YAML missing the `security:` key, mixed
  docs + source changes.
- **No rebuild:** README, `docs/` at root and in modules, `.github/`, tooling files, every
  service-definition layout listed above, cloud-run definitions, deleted and renamed
  definitions, empty diffs.
- **Service config changed:** every service-definition case above, plus service definition +
  source (`rebuild=true`, `service-config-changed=true`) and service definition + docs
  (`rebuild=false`, `service-config-changed=true`).
- **Merge base:** source changes that exist only on `master` are not counted.
- **Usage:** missing arguments exit non-zero.

## Changing the rules

1. Edit `is_ignored_path` (path rules) or `is_service_definition` (content rules) in
   `rebuild-check.sh`.
2. Add a test case to `rebuild-check.test.sh` for the new rule, covering both the ignored case
   and a case that must still rebuild.
3. Run `composite-actions/pr-rebuild-check/rebuild-check.test.sh` locally. CI runs it again, together with
   ShellCheck, on the PR.

When in doubt, prefer triggering a rebuild: a skipped build that should have run ships a stale
image, while an unnecessary build only costs a few minutes.
