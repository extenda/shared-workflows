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

## Notes / validation status

- **Credentials** are handled by `extenda/actions/setup-gcloud@v0` (same as
  `cloud-sql-liquibase`): the action exports `GOOGLE_APPLICATION_CREDENTIALS`, and only that
  file *path* is mounted into the PGAdapter container, which then uses Application Default
  Credentials. The key value is never interpolated into a shell command or written by hand.
- Sets `spanner.ddl_transaction_mode=AutocommitExplicitTransaction` on the connection so
  PGAdapter converts Liquibase's transactional DDL into Spanner DDL batches.
- The fiscal changesets ship on the `fiscal-engine` jar, so callers extract them first
  (e.g. `mvn dependency:unpack-dependencies`) and pass the directory as `search-path`.
- **Not yet validated in CI against a real Spanner instance.** The PGAdapter flags and the
  `liquibase-github-actions/update` input names should be confirmed on a first run before
  relying on it for prod.
