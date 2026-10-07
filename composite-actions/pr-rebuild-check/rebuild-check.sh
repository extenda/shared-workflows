#!/usr/bin/env bash
# Decides whether the changes between two commits require the container image to be rebuilt.
#
# Usage: rebuild-check.sh <base-sha> <head-sha>
#
# Prints a markdown report and the decisions. When run in GitHub Actions, also writes
# `rebuild=true|false` and `service-config-changed=true|false` to $GITHUB_OUTPUT and the
# report to $GITHUB_STEP_SUMMARY.
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
    *.md|docs/*|*/docs/*|.github/*|LICENSE|.gitignore|*.iml) return 0 ;;
    openspec/*|*/openspec/*|.pre-commit-config.yaml|*/.pre-commit-config.yaml|micronaut-cli.yml|*/micronaut-cli.yml) return 0 ;;
  esac
  return 1
}

print_files() {
  local title="$1" file
  shift
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

  local rebuild=false service_config_changed=false file report
  local -a triggering=() service_definitions=() skipped=()
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    if is_ignored_path "$file"; then
      skipped+=("$file")
    elif is_service_definition "$file"; then
      service_definitions+=("$file")
      service_config_changed=true
    else
      triggering+=("$file")
      rebuild=true
    fi
  done < <(git diff --name-only "$BASE_SHA...$HEAD_SHA")

  report=$(
    echo "### Image rebuild needed: \`$rebuild\`"
    echo "### Service config changed: \`$service_config_changed\`"
    echo
    print_files "Files triggering rebuild" "${triggering[@]}"
    print_files "Changed service definitions" "${service_definitions[@]}"
    print_files "Ignored files" "${skipped[@]}"
  )

  echo "$report"
  [ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "$report" >> "$GITHUB_STEP_SUMMARY"
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo "rebuild=$rebuild" >> "$GITHUB_OUTPUT"
    echo "service-config-changed=$service_config_changed" >> "$GITHUB_OUTPUT"
  fi
  echo "rebuild=$rebuild"
  echo "service-config-changed=$service_config_changed"
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  set -euo pipefail
  main "$@"
fi
