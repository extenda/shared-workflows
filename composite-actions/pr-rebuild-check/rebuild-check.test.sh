#!/usr/bin/env bash
# Tests for rebuild-check.sh. Each case builds a throwaway git repo, commits a change on top
# of a base commit and asserts the rebuild and service-config-changed decisions.
#
# Usage: composite-actions/pr-rebuild-check/rebuild-check.test.sh
set -uo pipefail

SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/rebuild-check.sh"
WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

passed=0
failed=0

AUTOPILOT='kubernetes:
  service: pnp-item-ks
  type: StatefulSet
security: none
labels:
  product: pnp
environments:
  staging:
    min-instances: 1'

CLOUD_RUN='cloud-run:
  service: pnp-task-handler
security:
  permission-prefix: pnp
environments:
  prod:
    min-instances: 1'

APP_CONFIG='entity:
  name: assortment-policy
  security: none'

# Creates a fresh repo with a base commit containing the given files.
# Arguments: pairs of <path> <content>.
new_repo() {
  REPO="$WORK_DIR/repo-$RANDOM$RANDOM"
  mkdir -p "$REPO"
  git -C "$REPO" init -q -b master
  git -C "$REPO" config user.email test@example.com
  git -C "$REPO" config user.name test
  write_files "$@"
  echo base > "$REPO/.base"
  git -C "$REPO" add -A
  git -C "$REPO" commit -q -m base
  BASE=$(git -C "$REPO" rev-parse HEAD)
}

write_files() {
  while [ $# -gt 0 ]; do
    mkdir -p "$(dirname "$REPO/$1")"
    printf '%s\n' "$2" > "$REPO/$1"
    shift 2
  done
}

commit() {
  git -C "$REPO" add -A
  git -C "$REPO" commit -q -m change
  HEAD=$(git -C "$REPO" rev-parse HEAD)
}

# Arguments: <test name> <expected rebuild> <expected service-config-changed>
assert_result() {
  local name="$1" expected_rebuild="$2" expected_service_config="$3" output rebuild service_config
  output=$(cd "$REPO" && GITHUB_OUTPUT= GITHUB_STEP_SUMMARY= bash "$SCRIPT" "$BASE" "$HEAD" 2>&1)
  rebuild=$(sed -n 's/^rebuild=//p' <<< "$output" | tail -1)
  service_config=$(sed -n 's/^service-config-changed=//p' <<< "$output" | tail -1)
  if [ "$rebuild" = "$expected_rebuild" ] && [ "$service_config" = "$expected_service_config" ]; then
    echo "PASS  $name"
    passed=$((passed + 1))
  else
    echo "FAIL  $name (expected rebuild=$expected_rebuild service-config-changed=$expected_service_config," \
      "got rebuild='$rebuild' service-config-changed='$service_config')"
    sed 's/^/      /' <<< "$output"
    failed=$((failed + 1))
  fi
}

# --- Changes that must trigger a rebuild -------------------------------------------------

new_repo src/main/java/App.java 'class App {}'
write_files src/main/java/App.java 'class App { int x; }'
commit
assert_result "java source change" true false

new_repo pom.xml '<project/>'
write_files pom.xml '<project><version>2</version></project>'
commit
assert_result "pom.xml change" true false

new_repo Dockerfile 'FROM eclipse-temurin:25'
write_files Dockerfile 'FROM eclipse-temurin:25-jre'
commit
assert_result "Dockerfile change" true false

new_repo src/main/resources/application.yml 'micronaut: {}'
write_files src/main/resources/application.yml 'micronaut: { application: { name: x } }'
commit
assert_result "application.yml change" true false

new_repo src/main/resources/fake.yaml "$AUTOPILOT"
write_files src/main/resources/fake.yaml "$AUTOPILOT
# changed"
commit
assert_result "service-definition-like yaml under src/ is not ignored" true false

new_repo change-detection-ks/conf/asmt-policy/asmt-policy.yml "$APP_CONFIG"
write_files change-detection-ks/conf/asmt-policy/asmt-policy.yml "$APP_CONFIG
  extra: true"
commit
assert_result "app config under conf/ is not ignored" true false

new_repo
write_files staging_kubernetes.yaml 'name: x
requests:
  cpu: 1'
commit
assert_result "yaml without kubernetes/cloud-run + security keys" true false

new_repo
write_files only-kubernetes.yaml 'kubernetes:
  service: x'
commit
assert_result "yaml with kubernetes key but no security key" true false

new_repo README.md '# Readme'
write_files README.md '# Readme v2' src/main/java/App.java 'class App {}'
commit
assert_result "docs and source change together" true false

# --- Changes that must not trigger a rebuild ---------------------------------------------

new_repo README.md '# Readme'
write_files README.md '# Readme v2'
commit
assert_result "README change" false false

new_repo docs/topology/Topology.txt 'a'
write_files docs/topology/Topology.txt 'b' module-ks/docs/notes.txt 'c'
commit
assert_result "docs/ change at root and in module" false false

new_repo .github/workflows/build.yml 'name: build'
write_files .github/workflows/build.yml 'name: build2'
commit
assert_result ".github change" false false

new_repo
write_files .pre-commit-config.yaml 'repos: []' micronaut-cli.yml 'applicationType: default' \
  openspec/config.yaml 'schema: x' module-ks/openspec/changes/a/.openspec.yaml 'x: 1'
commit
assert_result "tooling files (pre-commit, micronaut-cli, openspec)" false false

for path in \
  conf/autopilot/item-flat-fanout.yaml \
  pnp-price-sorting-ks/price-sorting-autopilot.yaml \
  change-detection-ks/conf/kubernetes/autopilot/item_autopilot.yaml \
  change-detection-ks/conf/asmt-policy/autopilot.yaml \
  print-autopilot.yaml \
  assortment-policy.yaml \
  pnp-item-pre-handler-ks/item-pre-handler.yaml \
  cloud-deploy/items-cloud-deploy.yaml \
  clusters-configs/prod-elastic-cloud-deploy.yaml \
  cloud-deploy.yaml \
  pnp-item-id-deduplication-ks/cloud-deploy.yaml; do
  new_repo "$path" "$AUTOPILOT"
  write_files "$path" "${AUTOPILOT/min-instances: 1/min-instances: 3}"
  commit
  assert_result "autopilot definition: $path" false true
done

new_repo
write_files pnp-task-handler-ks/cloud-deploy.yaml "$CLOUD_RUN"
commit
assert_result "new cloud-run definition" false true

new_repo conf/autopilot/item.yaml "$AUTOPILOT"
git -C "$REPO" rm -q conf/autopilot/item.yaml
commit
assert_result "deleted autopilot definition" false true

new_repo conf/autopilot/item.yaml "$AUTOPILOT"
git -C "$REPO" mv conf/autopilot/item.yaml conf/autopilot/item-renamed.yaml
commit
assert_result "renamed autopilot definition" false true

new_repo README.md '# Readme'
git -C "$REPO" commit -q --allow-empty -m empty
HEAD=$(git -C "$REPO" rev-parse HEAD)
assert_result "no file changes" false false

# --- Service config and source changes together ------------------------------------------

new_repo conf/autopilot/item.yaml "$AUTOPILOT" src/main/java/App.java 'class App {}'
write_files conf/autopilot/item.yaml "${AUTOPILOT/min-instances: 1/min-instances: 3}" \
  src/main/java/App.java 'class App { int x; }'
commit
assert_result "service definition and source change" true true

new_repo conf/autopilot/item.yaml "$AUTOPILOT" README.md '# Readme'
write_files conf/autopilot/item.yaml "${AUTOPILOT/min-instances: 1/min-instances: 3}" README.md '# Readme v2'
commit
assert_result "service definition and docs change" false true

# --- Diff is against the merge base, not the current base tip ----------------------------

new_repo README.md '# Readme'
git -C "$REPO" checkout -q -b feature
write_files README.md '# Readme v2'
commit
FEATURE_HEAD=$HEAD
git -C "$REPO" checkout -q master
write_files src/main/java/App.java 'class App {}'
commit
BASE=$HEAD
HEAD=$FEATURE_HEAD
assert_result "source changes on base branch only are not counted" false false

# --- Usage -------------------------------------------------------------------------------

if bash "$SCRIPT" >/dev/null 2>&1; then
  echo "FAIL  missing arguments should exit non-zero"
  failed=$((failed + 1))
else
  echo "PASS  missing arguments should exit non-zero"
  passed=$((passed + 1))
fi

echo
echo "$passed passed, $failed failed"
[ "$failed" -eq 0 ]
