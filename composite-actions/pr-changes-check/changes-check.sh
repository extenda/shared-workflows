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
    *.md|docs/*|*/docs/*|.github/*|LICENSE|.gitignore|*.iml) return 0 ;;
    openspec/*|*/openspec/*|.pre-commit-config.yaml|*/.pre-commit-config.yaml|micronaut-cli.yml|*/micronaut-cli.yml) return 0 ;;
  esac
  return 1
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

  report=$(
    case "$action" in
      build) echo "### Action: \`build\` - rebuild the jar and image, then deploy" ;;
      redeploy) echo "### Action: \`redeploy\` - redeploy the existing image with the new service definition" ;;
      none) echo "### Action: \`none\` - no build or deploy needed" ;;
    esac
    echo
    echo "| Output | Value |"
    echo "|---|---|"
    echo "| \`build\` | \`$build\` |"
    echo "| \`redeploy\` | \`$redeploy\` |"
    echo
    print_files "Files requiring a build" "${build_files[@]}"
    print_files "Changed service definitions" "${service_definitions[@]}"
    print_files "Ignored files" "${ignored[@]}"
  )

  outputs=$(printf 'action=%s\nbuild=%s\nredeploy=%s' "$action" "$build" "$redeploy")

  echo "$report"
  echo "$outputs"
  [ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "$report" >> "$GITHUB_STEP_SUMMARY"
  [ -n "${GITHUB_OUTPUT:-}" ] && echo "$outputs" >> "$GITHUB_OUTPUT"
  return 0
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  set -euo pipefail
  main "$@"
fi
