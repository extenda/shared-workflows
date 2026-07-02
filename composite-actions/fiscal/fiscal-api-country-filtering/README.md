# fiscal-api-country-filtering

Replaces the fiscal-engine's shared `openapi.yaml`, **in place**, with a country-scoped bundle
that strips every other country's `x-country`-tagged documentation via a Redocly decorator, then
re-runs `jar:jar` so the already-built jar picks up the change. The engine ships one canonical
spec with a `Fiscal-Attributes` `oneOf` — one branch per country's response `attributes` shape
(`src/main/resources/schemas/v1/openapi.yaml` in `hiiretail-fiscal-engine`). Because the engine
serves whatever classpath resource ends up at `/schemas/v1/openapi.yaml` verbatim, overwriting it
with the filtered content is enough to make e.g. Belgium's live service never document Portugal's
attribute keys — **no engine code change needed**.

This is a shared composite action
(`extenda/shared-workflows/composite-actions/fiscal/fiscal-api-country-filtering`), shared
across all country repos that fiscalize via `fiscal-engine`.

## Usage

Run this any time **after** a normal `mvn package` — it re-seals the jar for you, so callers don't
need to reorder their own build around it. (A full `mvn package` re-runs `resources:resources`
internally and would clobber a filtered file if this action ran *before* packaging, which is why
the re-jar happens inside the action rather than being left to every caller to get right.) It does
no checkout of its own (an `actions/checkout` step here would run `git clean -ffdx` by default and
wipe `target/`), so it must run later in the same job as the checkout and package steps, not a
separate job.

```yaml
- run: ./mvnw package -DskipTests
- uses: extenda/shared-workflows/composite-actions/fiscal/fiscal-api-country-filtering@v0
  with:
    country: belgium
- run: docker build -t $IMAGE .  # picks up the re-jarred, Belgium-only target/*.jar
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `country` | yes | – | The lower-case api name from this action's `redocly.yaml` `apis:` map, e.g. `belgium`. |
| `schema-dir` | no | `target/classes/schemas/v1` | Directory (relative to the workspace root) containing the built `openapi.yaml`. Overwritten in place. |

## Adding a country

One identifier throughout: the lower-case country name used as the `apis:` key (e.g. `belgium`)
is reused verbatim as both the decorator's `country` option and the `x-country` tag value — no
separate short code to keep in sync.

1. In the engine's `openapi.yaml`, add a `Fiscal-Attributes-<Country>` branch to the
   `Fiscal-Attributes` `oneOf`, tagged `x-country: <country>` (lower-case, e.g. `x-country: portugal`).
2. In this action's `redocly.yaml`, add a sibling `apis:` entry named `<country>` and point the
   decorator's `country` option at that same value.

## Notes / validation status

- **Decorators only run during `bundle`, not `lint`** — linting the pre-bundle source wouldn't
  exercise the country-filtering transformation, so this action lints the *bundled* output instead.
- `redocly.yaml` and `decorators/` live in this action's own repo, not the caller's checkout —
  `docker run -v $PWD:/spec` only mounts the caller's workspace, so they're staged (`cp`) into
  `schema-dir` via `${{ github.action_path }}` before bundling. The staging step clears any
  pre-existing `redocly.yaml`/`decorators/` at the destination first, so re-runs on a reused
  workspace can't leave a stale or nested `decorators/decorators/` copy behind.
- Bundling reads and writes `openapi.yaml` at the same path — safe because the bundler loads the
  whole document graph into memory before it writes any output.
- A single surviving `oneOf` branch (e.g. Belgium today, with only one real country onboarded) is
  collapsed by the decorator into the wrapper schema directly, rather than left as a `oneOf` of one.
- `jar:jar` only re-zips already-compiled `target/classes` — no recompile, no test run — so it's
  cheap to run as a dedicated step after packaging.
- **Not yet validated against a real country pipeline in CI** — verified locally by manually
  running every step's command (staging, in-place bundle, lint, and `jar:jar`) against
  `hiiretail-fiscal-engine`'s own freshly-built jar: confirmed the jar shipped both
  `Fiscal-Attributes-BE` and `Fiscal-Attributes-EU` before, and only the collapsed Belgium schema
  after. Confirm on a first real run in an actual country pipeline before relying on it for prod.
- `hiiretail-fiscal-engine` currently also keeps its own local copy of `redocly.yaml`/
  `decorators/country-filter.js` for local dev/testing — decide whether that should be removed now
  that this is the canonical CI-facing copy, or kept in sync by hand.
