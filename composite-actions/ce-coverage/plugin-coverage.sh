#!/usr/bin/env bash
# Measures which lines of a customer Checkout Engine's plugins its acceptance tests run, with JaCoCo.
#
#   plugin-coverage.sh prepare   Before docker compose: adds the agent to the engine, for the plugins' packages
#   plugin-coverage.sh collect   After cucumber: saves the country's data, outcome, classes and sources
#   plugin-coverage.sh report    With every country's artifact in coverage/: writes plugin-coverage.md
#   plugin-coverage.sh version   Prints the pinned JaCoCo version, the key of the jars' cache
#
# Reads MODULES (a glob of the plugin modules), COUNTRY, OUTCOME (of the cucumber step), COUNTRIES (a JSON
# array), SHA and RUN_URL from the environment, as the step needs them.
set -euo pipefail
shopt -s nullglob

JACOCO_VERSION=0.8.15
JACOCO_AGENT_SHA256=fb5b0036a0899ea97edfa0fc2c7985b55f3f7c5695028163e5e60d4f3cf6075d
JACOCO_CLI_SHA256=d2b74b20b415163c1f53261e7c5ef4445b788327094208ff821e0c2baf9bc8f1
DIR="$RUNNER_TEMP/jacoco"
# The action restores this directory from the Actions cache, so most runs don't download the jars
JARS="$RUNNER_TEMP/jacoco-jars"
HERE=$(cd "$(dirname "$0")" && pwd)

# Copies a checked JaCoCo jar from the cache, or downloads it from Maven Central first.
# Arguments: <artifact> <classifier> <sha256> <file>
download() {
  local jar="$JARS/org.jacoco.$1-$JACOCO_VERSION-$2.jar"
  if ! echo "$3  $jar" | sha256sum --check --strict --status > /dev/null 2>&1; then
    mkdir -p "$JARS"
    # --retry also retries a 429 when Maven Central limits the rate, after its Retry-After
    curl -sSf --retry 5 --retry-max-time 120 -o "$jar" \
      "https://repo1.maven.org/maven2/org/jacoco/org.jacoco.$1/$JACOCO_VERSION/org.jacoco.$1-$JACOCO_VERSION-$2.jar"
    echo "$3  $jar" | sha256sum --check --strict --quiet
  fi
  cp "$jar" "$4"
}

version() {
  echo "$JACOCO_VERSION"
}

prepare() {
  mkdir -p "$DIR/coverage"
  download agent runtime "$JACOCO_AGENT_SHA256" "$DIR/jacocoagent.jar"
  download cli nodeps "$JACOCO_CLI_SHA256" "$DIR/jacococli.jar"
  # Only the packages of the plugins' classes are instrumented
  local packages
  # shellcheck disable=SC2086 # MODULES is a glob
  packages=$(for classes in $MODULES/target/classes; do (cd "$classes" && find . -name '*.class' -printf '%h\n'); done \
    | sed 's|^\./||; s|/|.|g' | { grep -v '^\.$' || true; } | sort -u | sed 's/$/.*/' | paste -sd: -)
  if [ -z "$packages" ]; then
    echo "::error::No classes in $MODULES/target/classes"
    exit 1
  fi
  # The agent serves its data on port 6300. JDK_JAVA_OPTIONS is read by the java launcher on top of the
  # JAVA_TOOL_OPTIONS the repositories set themselves.
  cat > "$DIR/docker-compose.coverage.yaml" <<EOF
services:
  checkout-api:
    volumes:
      - $DIR:/jacoco:ro
    ports:
      - '6300:6300'
    environment:
      JDK_JAVA_OPTIONS: -javaagent:/jacoco/jacocoagent.jar=output=tcpserver,address=*,port=6300,includes=$packages
EOF
  # docker compose reads both files in the later steps
  echo "COMPOSE_FILE=docker-compose.yaml:$DIR/docker-compose.coverage.yaml" >> "$GITHUB_ENV"
}

# Without a cucumber run the data would only hold the engine's startup, so it isn't collected. The outcome is
# saved next to the data, so the report knows when a country is incomplete. When prepare failed, the
# scenarios ran without the agent, and there's no data to collect.
collect() {
  mkdir -p "$DIR/coverage"
  local result=$OUTCOME
  if [ "$result" != skipped ] && [ ! -f "$DIR/docker-compose.coverage.yaml" ]; then
    echo "::warning::The engine in $COUNTRY ran without the JaCoCo agent, because preparing the plugin coverage failed"
    result=no-agent
  elif [ "$result" != skipped ] &&
    ! java -jar "$DIR/jacococli.jar" dump --address localhost --port 6300 --destfile "$DIR/coverage/$COUNTRY.exec" --quiet; then
    echo "::warning::No plugin coverage data from the engine in $COUNTRY"
    result=no-data
  fi
  echo "$result" > "$DIR/coverage/$COUNTRY.outcome"
  # The classes and sources for the report
  local classes=() sources=() module
  # shellcheck disable=SC2206 # MODULES is a glob
  classes=($MODULES/target/classes)
  for module in $MODULES; do
    if [ -d "$module/src/main/java" ]; then sources+=("$module/src/main/java"); fi
  done
  if [ ${#classes[@]} -gt 0 ]; then tar -czf "$DIR/coverage/plugins.tgz" "${classes[@]}" "${sources[@]}"; fi
}

# Copies a module's classes that are compiled from its src/main/java into target/own-classes. Generated code,
# e.g. from protobuf, isn't the customer's to test, and would hide the plugins' own coverage.
# Arguments: <module>
own() {
  local file outer
  while IFS= read -r file; do
    outer=${file%.class}
    outer=${outer%%\$*}
    if [ -f "$1/src/main/java/$outer.java" ]; then
      mkdir -p "$1/target/own-classes/$(dirname "$file")"
      cp "$1/target/classes/$file" "$1/target/own-classes/$file"
    fi
  done < <(cd "$1/target/classes" && find . -name '*.class' | sed 's#^\./##')
}

# Merges the countries, since each runs its own plugin code. Always writes a report, also without data, so a
# pull request comment never keeps an old number.
report() {
  # download-artifact extracts a lone artifact straight into coverage/, so a single country's files get the
  # directory they have when there are more
  local lone code
  for lone in coverage/*.outcome; do
    code=$(basename "$lone" .outcome)
    mkdir -p "coverage/plugin-coverage-$code"
    mv coverage/"$code".* "coverage/plugin-coverage-$code/"
    if [ -f coverage/plugins.tgz ]; then mv coverage/plugins.tgz "coverage/plugin-coverage-$code/"; fi
  done
  local execs=(coverage/*/*.exec) archives=(coverage/*/plugins.tgz)
  : > coverage.csv
  if [ ${#execs[@]} -gt 0 ] && [ ${#archives[@]} -gt 0 ]; then
    download cli nodeps "$JACOCO_CLI_SHA256" jacococli.jar
    mkdir -p plugins
    tar -xzf "${archives[0]}" -C plugins
    local args=() classes module
    while IFS= read -r classes; do
      module=${classes%/target/classes}
      if [ -d "$module/src/main/java" ]; then
        own "$module"
        args+=(--classfiles "$module/target/own-classes" --sourcefiles "$module/src/main/java")
      else
        args+=(--classfiles "$classes")
      fi
    done < <(find plugins -type d -path '*/target/classes')
    # Not --quiet: plugin_report.py warns when a country's data doesn't match the classes
    if ! java -jar jacococli.jar report "${execs[@]}" "${args[@]}" --csv coverage.csv --html report --name "Plugin coverage" > jacoco.log 2>&1; then
      cat jacoco.log
      exit 1
    fi
  fi
  if ! python3 "$HERE/plugin_report.py" "$COUNTRIES" "$SHA" "$RUN_URL" > plugin-coverage.md 2> warnings.txt; then
    cat warnings.txt
    exit 1
  fi
  local warning
  while IFS= read -r warning; do echo "::warning::$warning, see the workflow summary"; done < warnings.txt
  cat plugin-coverage.md >> "$GITHUB_STEP_SUMMARY"
}

"$1"
