# openapi-actions

Builds the deployable, country-scoped OpenAPI spec for a fiscal adapter, then re-seals the jar so
the running service serves it. In one pass it:

1. **Materializes** the engine's shared `openapi.yaml` out of the `fiscal-engine` dependency into
   the build output — the adapter ships no spec of its own.
2. **Stamps `info.version`** from the optional `version` input (the engine ships it as a literal
   `${project.version}` token so each adapter sets its own build version — see below).
3. **Country-filters** it in place: a Redocly decorator strips every other country's
   `x-country`-tagged `oneOf` branch, leaving only this country's `attributes` shape.
4. **Re-runs `jar:jar`** so the already-built jar picks up the overwritten resource.

The engine serves whatever classpath resource ends up at `/schemas/v1/openapi.yaml` verbatim, and
the adapter jar precedes `fiscal-engine.jar` on the classpath — so overwriting that path is enough
to make e.g. Belgium's live service serve a Belgium-only, correctly-versioned spec. **No engine
code change and no per-adapter `pom.xml` config needed.**

The engine ships one canonical spec whose response `attributes` are `Fiscalize-Attributes` and
`Cancel-Attributes` `oneOf`s — one `x-country`-tagged branch per country
(`src/main/resources/schemas/v1/openapi.yaml` in `hiiretail-fiscal-engine`).

This is a shared composite action
(`extenda/shared-workflows/composite-actions/fiscal/openapi-actions`), used by all country repos
that fiscalize via `fiscal-engine`.

## Usage

Run this any time **after** a normal `mvn package` — it re-seals the jar for you, so callers don't
need to reorder their own build around it. It does no checkout of its own (an `actions/checkout`
step here would run `git clean -ffdx` by default and wipe `target/`), so it must run later in the
same job as the checkout and package steps, not a separate job.

```yaml
- run: ./mvnw package -DskipTests
- uses: extenda/shared-workflows/composite-actions/fiscal/openapi-actions@v0
  with:
    country: belgium
    version: ${{ steps.semver.outputs.version }}   # optional; omit for local/acceptance runs
- run: docker build -t $IMAGE .  # picks up the re-jarred, versioned, Belgium-only target/*.jar
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `country` | yes | – | The lower-case api name from this action's `redocly.yaml` `apis:` map, e.g. `belgium`. |
| `version` | no | `''` | When set, replaces the engine spec's literal `${project.version}` token so the served `info.version` is the adapter's build version. When empty, the token is left as-is (fine for local/acceptance runs, where the version is cosmetic). |
| `schema-dir` | no | `target/classes/schemas/v1` | Directory (relative to the workspace root) the spec is materialized into and filtered in place. |

## Adding a country

One identifier throughout: the lower-case country name used as the `apis:` key (e.g. `belgium`) is
reused verbatim as both the decorator's `country` option and the `x-country` tag value — no
separate short code to keep in sync.

1. In the engine's `openapi.yaml`, add a `Fiscalize-Attributes-<Country>` branch to the
   `Fiscalize-Attributes` `oneOf` and a `Cancel-Attributes-<Country>` branch to the
   `Cancel-Attributes` `oneOf`, each tagged `x-country: <country>` (lower-case, e.g.
   `x-country: portugal`).
2. In this action's `redocly.yaml`, add a sibling `apis:` entry named `<country>` with
   `openapi/strip-other-countries: { country: <country> }`.

## Notes / validation status

- **Version is set by a decorator, not text substitution.** The action forwards the `version`
  input into the bundle container as `API_VERSION`; the `openapi/set-version` decorator reads it
  and overrides `info.version`, logging `openapi: set info.version = <v>`. Empty ⇒ no-op.
- **Decorators only run during `bundle`, not `lint`** — linting the pre-bundle source wouldn't
  exercise the transformation, so this action lints the *bundled* output instead.
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
- **Not yet validated against a real country pipeline in CI** — verified locally by running every
  step's command (materialize, stage, in-place bundle with `API_VERSION`, lint, `jar:jar`) against
  `hiiretail-fiscal-engine`'s freshly-built spec: confirmed the bundle ships both
  `Fiscalize-Attributes-BE`/`-EU` and `Cancel-Attributes-BE`/`-EU` before, and only the collapsed
  Belgium schemas plus the stamped `info.version` after. Confirm on a first real run in an actual
  country pipeline before relying on it for prod.
