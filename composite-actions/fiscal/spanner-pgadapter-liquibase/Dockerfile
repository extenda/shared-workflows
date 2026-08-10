# Liquibase image used by this action. Built here rather than pulled directly because
# Liquibase 5.x Community images ship NO JDBC drivers (only h2) — running `update` against
# Postgres with the stock image fails with "Cannot find database driver: org.postgresql.Driver".
# The driver is installed with LPM (the Liquibase Package Manager).
#
# Both versions are build args so callers can override them via the action's
# liquibase-version / postgres-driver-version inputs; the defaults below are the pinned
# baseline and must be kept in sync with the defaults in action.yaml.
ARG LIQUIBASE_VERSION=5.0.3
FROM liquibase/liquibase:${LIQUIBASE_VERSION}

# Pinned to an exact driver version so a rebuild is reproducible (LPM would otherwise resolve
# the latest available driver at build time). Which driver versions exist is decided by the
# LPM index of the Liquibase version above — e.g. 42.7.11 is available on 5.0.3 but not on
# 5.0.2 — so passing an empty POSTGRES_DRIVER_VERSION falls back to whatever that release
# offers, letting a liquibase-version override work without also hunting for a matching driver.
ARG POSTGRES_DRIVER_VERSION=42.7.11
RUN if [ -n "${POSTGRES_DRIVER_VERSION}" ]; then \
      lpm add "postgresql@${POSTGRES_DRIVER_VERSION}" --global; \
    else \
      lpm add postgresql --global; \
    fi
