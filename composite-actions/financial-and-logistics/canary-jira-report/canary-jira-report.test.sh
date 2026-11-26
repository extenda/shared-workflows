#!/usr/bin/env bash
# Tests for canary-jira-report.sh. Each case sources the script, replaces the network, clock
# and git functions with stubs, runs main and asserts the outcome and the Jira writes.
#
# Usage: composite-actions/financial-and-logistics/canary-jira-report/canary-jira-report.test.sh
# Assertions are eval'd strings and each case runs in its own subshell on purpose.
# shellcheck disable=SC2016,SC2030,SC2031
set -uo pipefail

SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/canary-jira-report.sh"
WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

passed=0
failed=0

OURS='supplier-return-api-00042-abc'
PREVIOUS='supplier-return-api-00041-xyz'
NEWER='supplier-return-api-00043-def'

# Arguments: <revision> <status> [previous revision] [started_at]
row() {
  jq -cn --arg r "$1" --arg s "$2" --arg p "${3:-$PREVIOUS}" --arg t "${4:-2026-11-26T10:00:05.123Z}" '{
    id: 7, service: "supplier-return-api", project_id: "logistics-prod-92cd", region: "europe-west1",
    revision: $r, previous_revision: $p, steps: "[10,25,50,100]", step_index: 1, status: $s,
    slack_channel: "#clan-financial-and-logistics-failed-builds", started_at: $t,
    completed_at: (if $s == "in_progress" then null else "2026-11-26T10:50:00.000Z" end)
  }'
}

# Runs one case in a subshell. Responses are "<http status> <body>" lines, served in order;
# the last one repeats. Sets OUTPUT, EXIT_CODE, CALLS (Jira and platform calls) and SLEEPS.
run_case() {
  local case_dir="$WORK_DIR/case-$RANDOM$RANDOM"
  mkdir -p "$case_dir"
  printf '%s\n' "${RESPONSES[@]}" > "$case_dir/responses"
  echo 0 > "$case_dir/index"
  echo 1000000 > "$case_dir/clock"
  : > "$case_dir/calls"
  : > "$case_dir/sleeps"

  OUTPUT=$(
    export CASE_DIR="$case_dir"
    export SERVICE=supplier-return-api PROJECT=logistics-prod-92cd REVISION="$OURS"
    export REPOSITORY=extenda/hiiretail-supplier-return-api COMMIT_SHA=0123456789abcdef
    export RUN_URL=https://github.com/extenda/hiiretail-supplier-return-api/actions/runs/1
    export RELEASE_TAG=v1.2.3 JIRA_USERNAME=bot JIRA_PASSWORD=secret
    export DEPLOYED_AT=$((1000000 - 60)) GITHUB_OUTPUT='' GITHUB_STEP_SUMMARY=''
    export TIMEOUT_MINUTES=60 POLL_SECONDS=120 REGISTER_GRACE_MINUTES=10
    for assignment in ${ENV_OVERRIDES[@]+"${ENV_OVERRIDES[@]}"}; do
      export "${assignment?}"
    done
    # shellcheck source=canary-jira-report.sh
    source "$SCRIPT"

    now() { cat "$CASE_DIR/clock"; }
    sleep_for() {
      echo $(($(cat "$CASE_DIR/clock") + $1)) > "$CASE_DIR/clock"
      echo "$1" >> "$CASE_DIR/sleeps"
    }
    github_commit_pulls() { printf '%s' "$PULLS"; }
    commit_message() { printf '%s' "$MESSAGE"; }
    platform_get_canary() {
      local index line count
      index=$(cat "$CASE_DIR/index")
      count=$(wc -l < "$CASE_DIR/responses")
      [ "$index" -lt "$count" ] || index=$((count - 1))
      line=$(sed -n "$((index + 1))p" "$CASE_DIR/responses")
      echo $((index + 1)) > "$CASE_DIR/index"
      echo "platform GET" >> "$CASE_DIR/calls"
      printf '%s\n%s\n' "${line%% *}" "${line#* }"
    }
    jira_get_labels() {
      echo "jira GET $1" >> "$CASE_DIR/calls"
      [ "$LABELS_FAIL" = "true" ] && return 1
      printf '%s\n' "$LABELS"
    }
    jira_comment() { echo "jira COMMENT $1 $(head -n 1 <<< "$2")" >> "$CASE_DIR/calls"; }
    jira_labels() { echo "jira LABELS $1 $2" >> "$CASE_DIR/calls"; }

    main 2>&1
  )
  EXIT_CODE=$?
  CALLS=$(grep -v '^platform GET' "$case_dir/calls")
  PLATFORM_CALLS=$(grep -c '^platform GET' "$case_dir/calls")
  SLEEPS=$(wc -l < "$case_dir/sleeps" | tr -d ' ')
}

reset_case() {
  RESPONSES=('404 {}')
  PULLS='[{"number": 12, "head": {"ref": "feat/HII-14590"}, "title": "feat(HII-14590): Report the canary"}]'
  MESSAGE='feat(HII-14590): Report the canary (#12)'
  LABELS=$'agent-smoke\nAgentReadyToMerge'
  LABELS_FAIL=false
  ENV_OVERRIDES=()
}

check() {
  local name="$1" condition="$2"
  if eval "$condition"; then
    echo "PASS  $name"
    passed=$((passed + 1))
  else
    echo "FAIL  $name ($condition)"
    echo "      exit=$EXIT_CODE sleeps=$SLEEPS platform_calls=$PLATFORM_CALLS"
    echo "      ${OUTPUT//$'\n'/$'\n'      }"
    echo "      calls: ${CALLS//$'\n'/$'\n'      calls: }"
    failed=$((failed + 1))
  fi
}

has_output() { grep -qxF "$1" <<< "$OUTPUT"; }
has_call() { grep -qF "$1" <<< "$CALLS"; }

# --- issue key resolution ---

reset_case
RESPONSES=("200 $(row "$OURS" completed)")
run_case
check 'key from the PR branch' 'has_output "issue-key=HII-14590"'

reset_case
PULLS='[{"number": 12, "head": {"ref": "agent-smoke/HII-14586-20261117104129"}, "title": "[agent-smoke] pipeline test"}]'
RESPONSES=("200 $(row "$OURS" completed)")
run_case
check 'key from a branch with a suffix' 'has_output "issue-key=HII-14586"'

reset_case
PULLS='[{"number": 12, "head": {"ref": "renovate/lodash"}, "title": "docs(HII-14935): add a smoke file"}]'
RESPONSES=("200 $(row "$OURS" completed)")
run_case
check 'key from the PR title when the branch has none' 'has_output "issue-key=HII-14935"'

reset_case
PULLS=''
MESSAGE=$'Merge pull request #12 from extenda/fix/HII-14001\n\nfix: something'
RESPONSES=("200 $(row "$OURS" completed)")
run_case
check 'key from the commit message without PR data' 'has_output "issue-key=HII-14001"'

reset_case
PULLS='{"message": "Resource not accessible by integration"}'
MESSAGE='docs(HII-14935): add a smoke file (#9)'
RESPONSES=("200 $(row "$OURS" completed)")
run_case
check 'key from the commit message when the PR read is refused' 'has_output "issue-key=HII-14935"'

reset_case
PULLS=''
MESSAGE='chore: bump deps (#13)'
ENV_OVERRIDES=('JIRA_PROJECT_KEY=HII')
run_case
check 'no key: skipped' 'has_output "outcome=skipped" && [ "$EXIT_CODE" -eq 0 ]'
check 'no key: no Jira calls' '[ -z "$CALLS" ] && [ "$PLATFORM_CALLS" -eq 0 ]'

reset_case
PULLS=''
MESSAGE='chore: bump deps for XHII-99 (#13)'
run_case
check 'no partial key match' 'has_output "outcome=skipped"'

reset_case
ENV_OVERRIDES=('ISSUE_KEY=HII-1')
RESPONSES=("200 $(row "$OURS" completed)")
run_case
check 'ISSUE_KEY override wins' 'has_output "issue-key=HII-1"'

# --- agent label gate ---

reset_case
LABELS='backend'
run_case
check 'non-agent issue: skipped' 'has_output "outcome=skipped" && [ "$EXIT_CODE" -eq 0 ]'
check 'non-agent issue: no writes, no polling' '! has_call COMMENT && ! has_call LABELS && [ "$PLATFORM_CALLS" -eq 0 ]'

reset_case
LABELS_FAIL=true
run_case
check 'issue unreadable: step fails without writes' '[ "$EXIT_CODE" -ne 0 ] && ! has_call COMMENT && ! has_call LABELS'

reset_case
LABELS='backend'
ENV_OVERRIDES=('AGENT_LABEL=')
RESPONSES=("200 $(row "$OURS" completed)")
run_case
check 'empty AGENT_LABEL disables the gate' 'has_output "outcome=live" && ! has_call "jira GET"'

# --- canary outcomes ---

reset_case
RESPONSES=("200 $(row "$OURS" in_progress)" "200 $(row "$OURS" in_progress)" "200 $(row "$OURS" completed)")
run_case
check 'completed: outcome live' 'has_output "outcome=live" && [ "$EXIT_CODE" -eq 0 ]'
check 'completed: polled until terminal' '[ "$SLEEPS" -eq 2 ] && [ "$PLATFORM_CALLS" -eq 3 ]'
check 'completed: comment' 'has_call "jira COMMENT HII-14590 Canary completed: $OURS serves 100% of traffic."'
check 'completed: AgentLive added, AgentReadyToMerge removed' 'has_call "jira LABELS HII-14590 [{\"add\":\"AgentLive\"},{\"remove\":\"AgentReadyToMerge\"}]"'

reset_case
RESPONSES=("200 $(row "$OURS" in_progress)" "200 $(row "$OURS" rolled_back)")
run_case
check 'rolled back: AgentStuck' 'has_output "outcome=rolled_back" && has_call "jira LABELS HII-14590 [{\"add\":\"AgentStuck\"}]" && [ "$EXIT_CODE" -eq 0 ]'
check 'rolled back: no AgentLive' '! has_call AgentLive'

reset_case
RESPONSES=("200 $(row "$OURS" cancelled)")
run_case
check 'cancelled: AgentStuck' 'has_output "outcome=cancelled" && has_call "[{\"add\":\"AgentStuck\"}]"'

reset_case
RESPONSES=("200 $(row "$OURS" failed)")
run_case
check 'failed: treated as rolled back' 'has_output "outcome=rolled_back"'

reset_case
RESPONSES=('404 {"statusCode":404}' '404 {"statusCode":404}' "200 $(row "$OURS" in_progress)" "200 $(row "$OURS" completed)")
run_case
check 'registers late within the grace: live' 'has_output "outcome=live"'

reset_case
RESPONSES=('404 {"statusCode":404}')
run_case
check '404 past the grace: not_registered' 'has_output "outcome=not_registered" && has_call "[{\"add\":\"AgentStuck\"}]"'
check '404 past the grace: stops at the grace' '[ "$SLEEPS" -eq 5 ]'

reset_case
RESPONSES=("200 $(row "$PREVIOUS" completed supplier-return-api-00040-old 2026-11-25T08:00:00Z)")
ENV_OVERRIDES=("DEPLOYED_AT=$(jq -rn '"2026-11-26T09:59:00Z" | fromdateiso8601')")
run_case
check 'older row past the grace: not_registered' 'has_output "outcome=not_registered"'

reset_case
RESPONSES=("200 $(row "$OURS" in_progress)" "200 $(row "$NEWER" in_progress "$OURS")")
run_case
check 'newer revision on top of ours: superseded' 'has_output "outcome=superseded" && has_call "[{\"add\":\"AgentStuck\"}]"'

reset_case
RESPONSES=("200 $(row "$NEWER" in_progress "$PREVIOUS" 2026-11-26T11:00:00Z)")
ENV_OVERRIDES=("DEPLOYED_AT=$(jq -rn '"2026-11-26T10:00:00Z" | fromdateiso8601')")
run_case
check 'newer row started after the deploy: superseded' 'has_output "outcome=superseded"'

reset_case
RESPONSES=('403 {"message":"forbidden"}')
run_case
check '403: unreadable, AgentStuck, step fails' 'has_output "outcome=unreadable" && has_call "[{\"add\":\"AgentStuck\"}]" && [ "$EXIT_CODE" -ne 0 ]'

reset_case
RESPONSES=('503 upstream' '000 ' "200 $(row "$OURS" completed)")
run_case
check '5xx and network errors are retried' 'has_output "outcome=live" && [ "$PLATFORM_CALLS" -eq 3 ]'

reset_case
RESPONSES=("200 $(row "$OURS" in_progress)")
ENV_OVERRIDES=('TIMEOUT_MINUTES=30' 'POLL_SECONDS=300')
run_case
check 'in_progress forever: timeout' 'has_output "outcome=timeout" && has_call "[{\"add\":\"AgentStuck\"}]" && [ "$EXIT_CODE" -eq 0 ]'
check 'in_progress forever: stops at the timeout' '[ "$SLEEPS" -eq 6 ]'

reset_case
ENV_OVERRIDES=('CANARY_CONFIGURED=false')
run_case
check 'no canary configured: live_no_canary without polling' 'has_output "outcome=live_no_canary" && [ "$PLATFORM_CALLS" -eq 0 ] && has_call AgentLive'

# --- real Jira functions in dry run ---

DRY_OUTPUT=$(
  export DRY_RUN=true JIRA_USERNAME=bot JIRA_PASSWORD=secret
  # shellcheck source=canary-jira-report.sh
  source "$SCRIPT"
  curl() { echo "curl called"; }
  jira_comment HII-1 'text' 2>&1
  jira_labels HII-1 '[{"add":"AgentLive"}]' 2>&1
)
OUTPUT="$DRY_OUTPUT" CALLS='' EXIT_CODE=0 SLEEPS=0 PLATFORM_CALLS=0
check 'dry run: no curl' '! grep -q "curl called" <<< "$OUTPUT"'
check 'dry run: prints the comment' 'grep -qF "DRY RUN: POST /rest/api/2/issue/HII-1/comment" <<< "$OUTPUT"'
check 'dry run: prints the label update' 'grep -qF "\"labels\":[{\"add\":\"AgentLive\"}]" <<< "$(tr -d " \n" <<< "$OUTPUT")"'

# --- comment text ---

COMMENT=$(
  export SERVICE=supplier-return-api PROJECT=logistics-prod-92cd REVISION="$OURS"
  export REPOSITORY=extenda/hiiretail-supplier-return-api COMMIT_SHA=0123456789abcdef RUN_URL=https://run RELEASE_TAG=v1.2.3
  # shellcheck source=canary-jira-report.sh
  source "$SCRIPT"
  comment_text rolled_back "$(row "$OURS" rolled_back)"
)
OUTPUT="$COMMENT"
check 'comment: rollback names the Slack channel' 'grep -qF "Rollback reason: see the canary thread in #clan-financial-and-logistics-failed-builds" <<< "$OUTPUT"'
check 'comment: links the commit and the run' 'grep -qF "Commit: https://github.com/extenda/hiiretail-supplier-return-api/commit/0123456789abcdef" <<< "$OUTPUT" && grep -qF "Deploy run: https://run" <<< "$OUTPUT"'
check 'comment: no mentions' '! grep -qE "\[~|@" <<< "$OUTPUT"'

echo
echo "$passed passed, $failed failed"
[ "$failed" -eq 0 ]
