# spanner-pgadapter-liquibase

Runs **standard Postgres Liquibase** against a **PostgreSQL-dialect Cloud Spanner**
database by fronting Spanner with [PGAdapter](https://github.com/GoogleCloudPlatform/pgadapter).

It is the PG-dialect counterpart to `extenda/shared-workflows/generic/cloud-sql-liquibase`
(which targets Cloud SQL via the Cloud SQL Auth Proxy) and a deliberate alternative to
`extenda/actions/liquibase-spanner` (which speaks Spanner's **GoogleSQL** dialect). The fiscal
engine standardised on one portable Postgres SQL codepath, so its changesets are applied with
plain Postgres Liquibase here too — see engine decisions #9/#10.

This is a shared composite action, consumed as
`extenda/shared-workflows/composite-actions/fiscal/spanner-pgadapter-liquibase@v0`.

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `service-account-key` | yes | – | GCP SA key (JSON) with access to the Spanner database. |
| `project` | yes | – | GCP project hosting the Spanner instance. |
| `instance` | no | `fiscal-signing` | Spanner instance id. |
| `database` | yes | – | Spanner database id (**must** be PostgreSQL dialect). |
| `search-path` | yes | – | Directory containing the changelog and its includes. |
| `changelog-file` | no | `changelog-master.yaml` | Changelog file, relative to `search-path`. |
| `pgadapter-image` | no | pinned in `action.yaml` | PGAdapter image (tag+digest). |
| `liquibase-version` | no | `5.0.3` | Liquibase version; tag of the base image the action builds from. |
| `postgres-driver-version` | no | `42.7.11` | PostgreSQL JDBC driver version installed with LPM. Set to `''` to take whatever the chosen Liquibase release offers. |

## Notes / validation status

- **Credentials** are handled by `extenda/actions/setup-gcloud@v0` (same as
  `cloud-sql-liquibase`): the action exports `GOOGLE_APPLICATION_CREDENTIALS`, and its
  job-scoped credential *directory* is mounted into the PGAdapter container at its original
  host path, which then uses Application Default Credentials. The directory (not just the one
  file) is mounted because under Workload Identity Federation the exported config references a
  second OIDC-token file in the same dir by absolute path. The key value is never interpolated
  into a shell command or written by hand.
- Sets `spanner.ddl_transaction_mode=AutocommitExplicitTransaction` on the connection so
  PGAdapter converts Liquibase's transactional DDL into Spanner DDL batches.
- The fiscal changesets ship on the `fiscal-engine` jar, so callers extract them first
  (e.g. `mvn dependency:unpack-dependencies`) and pass the directory as `search-path`.
- Liquibase runs as a **self-managed** `docker run --network host` (not the
  `liquibase-github-actions/update` container action). `--network host` is what lets the
  container reach PGAdapter on the runner's `localhost:5432`, and the `search-path` is
  bind-mounted and referenced by a container path — a containerised action would see neither
  the host `localhost` nor the host path. Linux-only semantics; correct on `ubuntu-latest`.
- The Liquibase image is **built by this action** from its `Dockerfile` rather than pulled.
  Liquibase 5.x Community images ship **no JDBC drivers** (only h2), so the stock image fails
  with `Cannot find database driver: org.postgresql.Driver`; the driver is installed on top
  with [LPM](https://docs.liquibase.com/community/integration-guide-5-0/connect-liquibase-with-postgresql)
  (`lpm add postgresql@<version> --global`). Both versions are `--build-arg`s fed from the
  `liquibase-version` / `postgres-driver-version` inputs, whose defaults are the pinned
  baseline — keep the Dockerfile `ARG` defaults in sync with the `action.yaml` defaults.
  Because the `FROM` tag is parameterised it is not Dependabot-scannable; bump the defaults by
  hand (check [Liquibase tags](https://hub.docker.com/r/liquibase/liquibase/tags)).
  Note the two versions are coupled: which driver versions exist is decided by the LPM index of
  the chosen Liquibase release (`42.7.11` resolves on 5.0.3 but not on 5.0.2), so when
  overriding `liquibase-version` either pick a driver that release ships or pass
  `postgres-driver-version: ''` to accept its default.
