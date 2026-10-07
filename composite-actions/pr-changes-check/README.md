# PR Changes Check Composite Action

Decides what the changes in a pull request require:

| `action`   | Meaning                                                                    | Example PR                         |
|------------|----------------------------------------------------------------------------|------------------------------------|
| `build`    | Rebuild the jar and container image, then deploy them                      | `src/`, `pom.xml`, `Dockerfile`    |
| `redeploy` | Redeploy the existing image with a changed autopilot/cloud-deploy service definition | `conf/autopilot/*.yaml` only |
| `none`     | Nothing that reaches the running service changed                           | README, docs, CODEOWNERS only      |

Skipping the build for `redeploy` and `none` PRs saves CI time, because the image would be
byte-for-byte the same.

| File                     | Purpose                    |
|--------------------------|----------------------------|
| `action.yml`             | Composite action           |
| `changes-check.sh`       | Decision logic             |
| `changes-check.test.sh`  | Test suite                 |

## Usage

### Inputs

- `base-sha` (optional): Base commit to compare against. Defaults to the pull request base.
- `head-sha` (optional): Head commit to compare. Defaults to the pull request head.

Both must be given explicitly outside `pull_request` events.

### Outputs

| Output     | Value                                                                                                |
|------------|------------------------------------------------------------------------------------------------------|
| `action`   | `build`, `redeploy` or `none`. `build` wins when both apply, since a build deploys the new image together with the current service definitions |
| `build`    | `true` when at least one changed file can affect the jar or image                                    |
| `redeploy` | `true` when at least one autopilot/cloud-deploy service definition was added, changed, deleted or renamed |

`build` and `redeploy` are independent: a PR changing both `src/` and `conf/autopilot/*.yaml`
sets both to `true` (and `action=build`). Use `action` to pick one path, and the booleans to gate
jobs that care about one kind of change only, e.g. validating service definitions.

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
      action: ${{ steps.check.outputs.action }}
      redeploy: ${{ steps.check.outputs.redeploy }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: PR changes check
        id: check
        uses: extenda/shared-workflows/composite-actions/pr-changes-check@master

  build:
    needs: changes
    if: needs.changes.outputs.action == 'build'
    uses: extenda/shared-workflows/.github/workflows/pnp-processor-build-image.yml@v0
    # ...

  redeploy:
    needs: changes
    if: needs.changes.outputs.action == 'redeploy'
    # redeploy the current image with the new service definition
    # ...

  validate-service-definition:
    needs: changes
    if: needs.changes.outputs.redeploy == 'true'
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
   - **service definition** (sets `redeploy=true`, does not affect the image)
   - **build** (sets `build=true`). A single such file is enough to require a build.
3. `action` is derived: `build` if `build=true`, else `redeploy` if `redeploy=true`, else `none`.
4. All outputs are written to the step outputs. The run's summary page gets a report with the
   decision, the reason, which stages run and the files in each group, and a notice shows the
   decision on the run page.

Each push re-evaluates the whole PR against the base branch, not just the latest commit. Once a
PR contains a source change it keeps `action=build`.

## What is checked

The rule is **build unless every changed file is known to be safe to skip**. Unknown file types
always require a build, so a new kind of file can never be silently skipped.

### Ignored by path

| Pattern                                                         | Why                              |
|-----------------------------------------------------------------|----------------------------------|
| `*.md`                                                          | Documentation                    |
| `docs/**`, `<module>/docs/**`                                   | Documentation, topology dumps    |
| `.github/**`, except `.github/workflows/**` and `.github/actions/**` | CODEOWNERS, dependabot, templates |
| `LICENSE`, `.gitignore`, `*.iml`                                | Repo / IDE metadata              |
| `openspec/**`, `<module>/openspec/**`                           | Spec tooling                     |
| `.pre-commit-config.yaml`, `micronaut-cli.yml` (any directory)  | Developer tooling                |

### Service definitions: autopilot and cloud-deploy (sets `redeploy`)

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

### Always requires a build

Everything else, including:

- source and resources under `src/` (including `application.yml`)
- `pom.xml`, `Dockerfile`, `entrypoint.sh`, `.mvn/**`, `settings.xml`
- `.github/workflows/**` and `.github/actions/**`: they define how the jar and image are built
  (`java-version`, `native-image`, the shared workflow version), so a change there must run the
  tests and build
- application config that happens to live under `conf/`, e.g.
  `change-detection-ks/conf/asmt-policy/asmt-policy.yml`. A blanket `conf/**` ignore would be
  unsafe for this reason.
- YAML that is not a full service definition, e.g. `openapi.yaml` or legacy `staging_kubernetes.yaml`

## Running locally

```bash
# From a service repo, with shared-workflows cloned next to it
# decide for the current branch against master
../shared-workflows/composite-actions/pr-changes-check/changes-check.sh origin/master HEAD

# From shared-workflows, run the test suite (needs only bash and git)
composite-actions/pr-changes-check/changes-check.test.sh
```

Example output:

```
## Changes check: `build`

**Decision:** Rebuild the jar and image, then release and deploy them.

**Why:** 1 of 4 changed files can affect the jar or image, e.g. src/main/resources/application.yml.

| Stage | Result |
|---|---|
| Tests and lint | runs |
| Jar and image build, release (master only) | runs |
| Staging deploy (master only) | runs, deploys the new release |

Outputs: `action=build`, `build=true`, `redeploy=true`. Compared `1a2b3c4...5d6e7f8`.

**Files requiring a build (1):**
- `src/main/resources/application.yml`

**Changed service definitions (1):**
- `conf/autopilot/item-identifier-inheritance-validate.yaml`

**Ignored files (2):**
- `.github/CODEOWNERS`
- `README.md`

action=build
build=true
redeploy=true
```

In GitHub Actions the report goes to the job summary, and the decision and reason are also shown
as a notice on the run page and in the pull request checks.
Empty groups are left out of the report.

## Tests

`changes-check.test.sh` builds a throwaway git repository for each case, commits a change on top
of a base commit and asserts all three outputs. It covers:

- **Build:** Java source, `pom.xml`, `Dockerfile`, `application.yml`, service-definition-like
  YAML under `src/`, app config under `conf/`, YAML missing the `security:` key,
  `.github/workflows/`, `.github/actions/`, mixed docs + source changes.
- **Redeploy:** every service-definition layout listed above, cloud-run definitions, deleted
  and renamed definitions, service definition + docs.
- **None:** README, `docs/` at root and in modules, `.github/` metadata, tooling files, empty diffs.
- **Both:** service definition + source (`action=build`, `build=true`, `redeploy=true`).
- **Merge base:** source changes that exist only on `master` are not counted.
- **Usage:** missing arguments exit non-zero.

## Changing the rules

1. Edit `is_ignored_path` (path rules) or `is_service_definition` (content rules) in
   `changes-check.sh`.
2. Add a test case to `changes-check.test.sh` for the new rule, covering both the skipped case
   and a case that must still build.
3. Run `composite-actions/pr-changes-check/changes-check.test.sh` locally. CI runs it again, together with
   ShellCheck, on the PR.

When in doubt, prefer requiring a build: a skipped build that should have run ships a stale
image, while an unnecessary build only costs a few minutes.
