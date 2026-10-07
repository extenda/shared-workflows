#!/usr/bin/env bash
# Decides what the changes between two commits require:
#   build    - rebuild the jar and container image (and deploy it)
#   redeploy - redeploy the service with a changed autopilot/cloud-deploy service definition
#   none     - nothing that affects the running service changed
#
# Usage: changes-check.sh <base-sha> <head-sha>
#
# Prints a markdown report and the decisions. When run in GitHub Actions, also writes
# `action=build|redeploy|none`, `build=true|false` and `redeploy=true|false` to $GITHUB_OUTPUT
# and the report to $GITHUB_STEP_SUMMARY.
# The script can be sourced to test the individual functions.

# Autopilot / cloud-deploy service definitions are recognised by content rather than path,
# since repos use many layouts (conf/autopilot/*.yaml, <module>/*-autopilot.yaml,
# cloud-deploy.yaml, clusters-configs/*-cloud-deploy.yaml, ...). They all have a top-level
# `kubernetes:` or `cloud-run:` key together with a top-level `security:` key.
is_service_definition() {
  local file="$1" content
  case "$file" in
    *.yaml|*.yml) ;;
    *) return 1 ;;
  esac
  case "$file" in
    src/*|*/src/*) return 1 ;;
  esac
  # Read from head, or from base when the file was deleted.
  content=$(git show "$HEAD_SHA:$file" 2>/dev/null || git show "$BASE_SHA:$file" 2>/dev/null) || return 1
  grep -qE '^(kubernetes|cloud-run):' <<< "$content" && grep -qE '^security:' <<< "$content"
}

# Files that never end up in the image, recognised by path alone.
is_ignored_path() {
  case "$1" in
    # Workflows and local actions define how the jar and image are built (JDK version,
    # native image, shared workflow version), so they are not ignored.
    .github/workflows/*|.github/actions/*) return 1 ;;
    *.md|docs/*|*/docs/*|.github/*|LICENSE|.gitignore|*.iml) return 0 ;;
    openspec/*|*/openspec/*|.pre-commit-config.yaml|*/.pre-commit-config.yaml|micronaut-cli.yml|*/micronaut-cli.yml) return 0 ;;
  esac
  return 1
}

# Prints "<count> <word>", adding an "s" unless the count is 1.
plural() {
  if [ "$1" -eq 1 ]; then echo "1 $2"; else echo "$1 $2s"; fi
}

print_files() {
  local title="$1" file
  shift
  [ $# -eq 0 ] && return
  echo "**$title ($#):**"
  for file in "$@"; do echo "- \`$file\`"; done
  echo
}

main() {
  if [ $# -ne 2 ]; then
    echo "Usage: $0 <base-sha> <head-sha>" >&2
    return 2
  fi
  BASE_SHA="$1"
  HEAD_SHA="$2"

  local build=false redeploy=false action=none file report outputs
  local -a build_files=() service_definitions=() ignored=()
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    if is_ignored_path "$file"; then
      ignored+=("$file")
    elif is_service_definition "$file"; then
      service_definitions+=("$file")
      redeploy=true
    else
      build_files+=("$file")
      build=true
    fi
  done < <(git diff --name-only "$BASE_SHA...$HEAD_SHA")

  # A build deploys the new image together with the current service definitions,
  # so it also covers any service definition change.
  if [ "$build" = true ]; then
    action=build
  elif [ "$redeploy" = true ]; then
    action=redeploy
  fi

  local decision reason tests_row build_row deploy_row
  local changed=$((${#build_files[@]} + ${#service_definitions[@]} + ${#ignored[@]}))
  case "$action" in
    build)
      decision="Rebuild the jar and image, then release and deploy them."
      reason="${#build_files[@]} of $(plural "$changed" "changed file") can affect the jar or image, e.g. ${build_files[0]}."
      tests_row="runs"; build_row="runs"; deploy_row="runs, deploys the new release"
      ;;
    redeploy)
      decision="Redeploy the current release image with the changed service definitions. No build."
      reason="$(plural "${#service_definitions[@]}" "service definition") changed and no changed file can affect the jar or image."
      tests_row="skipped"; build_row="skipped"; deploy_row="runs, deploys the current release"
      ;;
    none)
      decision="Nothing to build or deploy."
      if [ "$changed" -eq 0 ]; then
        reason="No files changed."
      else
        reason="All changed files ($changed) are ignored: docs, repo metadata or tooling."
      fi
      tests_row="skipped"; build_row="skipped"; deploy_row="skipped"
      ;;
  esac

  report=$(
    echo "## Changes check: \`$action\`"
    echo
    echo "**Decision:** $decision"
    echo
    echo "**Why:** $reason"
    echo
    echo "| Stage | Result |"
    echo "|---|---|"
    echo "| Tests and lint | $tests_row |"
    echo "| Jar and image build, release (master only) | $build_row |"
    echo "| Staging deploy (master only) | $deploy_row |"
    echo
    echo "Outputs: \`action=$action\`, \`build=$build\`, \`redeploy=$redeploy\`." \
      "Compared \`${BASE_SHA:0:7}...${HEAD_SHA:0:7}\`."
    echo
    print_files "Files requiring a build" "${build_files[@]}"
    print_files "Changed service definitions" "${service_definitions[@]}"
    print_files "Ignored files" "${ignored[@]}"
  )

  outputs=$(printf 'action=%s\nbuild=%s\nredeploy=%s' "$action" "$build" "$redeploy")

  echo "$report"
  echo "$outputs"
  # The notice shows the decision on the run page and in the pull request checks.
  [ -n "${GITHUB_ACTIONS:-}" ] && echo "::notice title=Changes check: $action::$decision $reason"
  [ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "$report" >> "$GITHUB_STEP_SUMMARY"
  [ -n "${GITHUB_OUTPUT:-}" ] && echo "$outputs" >> "$GITHUB_OUTPUT"
  return 0
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  set -euo pipefail
  main "$@"
fi
