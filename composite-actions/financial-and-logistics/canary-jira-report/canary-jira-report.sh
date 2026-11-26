#!/usr/bin/env bash
# Waits for the platform's automatic canary of one deployed Cloud Run revision to end,
# then writes the result to the Jira issue named by the deployed commit.
#
# Outcomes:
#   live            canary completed (100% traffic) -> AgentLive, AgentReadyToMerge removed
#   live_no_canary  the service has no traffic.canary -> AgentLive (the deploy served 100%)
#   rolled_back     the platform rolled back on an ERROR log line -> AgentStuck
#   cancelled       a manual traffic change or a newer deploy ended it -> AgentStuck
#   superseded      a newer revision replaced this canary -> AgentStuck
#   not_registered  no canary row for this revision after the grace period -> AgentStuck
#   timeout         no terminal state before the timeout -> AgentStuck
#   unreadable      platform-api refused the read (401/403) -> AgentStuck, step fails
#   skipped         no issue key, or the issue lacks the agent label -> no Jira write
#
# Configuration (environment):
#   SERVICE, PROJECT, REVISION            required; REVISION is the revision this deploy created
#   REGION                                default europe-west1
#   CANARY_CONFIGURED                     'true' when cloud-deploy.yaml enables traffic.canary
#   DEPLOYED_AT                           epoch seconds at or after the deploy; a row of another
#                                         revision that started later belongs to a newer deploy
#   COMMIT_SHA, REPOSITORY, RUN_URL, RELEASE_TAG   used for the issue key and the comment
#   ISSUE_KEY                             optional override of the issue key
#   JIRA_PROJECT_KEY                      default HII
#   AGENT_LABEL                           default agent-smoke; empty disables the label gate
#   JIRA_BASE_URL                         default https://extendaretail.atlassian.net
#   JIRA_USERNAME, JIRA_PASSWORD          Jira basic auth (API token)
#   GITHUB_TOKEN                          optional; used to read the PR of the commit
#   PLATFORM_API_URL                      default https://platform-api.retailsvc.com
#   TIMEOUT_MINUTES                       default 240
#   POLL_SECONDS                          default 120
#   REGISTER_GRACE_MINUTES                default 10
#   DRY_RUN                               'true' prints the Jira writes instead of sending them
set -euo pipefail

REGION="${REGION:-europe-west1}"
CANARY_CONFIGURED="${CANARY_CONFIGURED:-true}"
DEPLOYED_AT="${DEPLOYED_AT:-0}"
JIRA_PROJECT_KEY="${JIRA_PROJECT_KEY:-HII}"
AGENT_LABEL="${AGENT_LABEL-agent-smoke}"
JIRA_BASE_URL="${JIRA_BASE_URL:-https://extendaretail.atlassian.net}"
PLATFORM_API_URL="${PLATFORM_API_URL:-https://platform-api.retailsvc.com}"
TIMEOUT_MINUTES="${TIMEOUT_MINUTES:-240}"
POLL_SECONDS="${POLL_SECONDS:-120}"
REGISTER_GRACE_MINUTES="${REGISTER_GRACE_MINUTES:-10}"
DRY_RUN="${DRY_RUN:-false}"

LIVE_LABEL='AgentLive'
READY_LABEL='AgentReadyToMerge'
STUCK_LABEL='AgentStuck'

log() { echo "$*" >&2; }

now() { date +%s; }

sleep_for() { sleep "$1"; }

set_output() {
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo "$1=$2" >> "$GITHUB_OUTPUT"
  fi
  echo "$1=$2"
}

summary() {
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    echo "$*" >> "$GITHUB_STEP_SUMMARY"
  fi
}

# Prints the first issue key in the text on stdin, or nothing.
first_key() {
  grep -oE "\\b${JIRA_PROJECT_KEY}-[0-9]+\\b" | head -n 1 || true
}

# Prints the key from a branch named {type}/KEY or {type}/KEY-suffix, or nothing.
key_from_branch() {
  sed -nE "s#^[A-Za-z0-9_-]+/(${JIRA_PROJECT_KEY}-[0-9]+)([^0-9].*)?\$#\\1#p" <<< "$1" | head -n 1
}

# Prints JSON of the pull requests associated with COMMIT_SHA, or nothing.
github_commit_pulls() {
  [ -n "${GITHUB_TOKEN:-}" ] && [ -n "${REPOSITORY:-}" ] && [ -n "${COMMIT_SHA:-}" ] || return 0
  curl -sS --fail --max-time 30 \
    -K <(printf 'header = "Authorization: Bearer %s"\n' "$GITHUB_TOKEN") \
    -H 'Accept: application/vnd.github+json' \
    "${GITHUB_API_URL:-https://api.github.com}/repos/${REPOSITORY}/commits/${COMMIT_SHA}/pulls" 2>/dev/null || true
}

commit_message() {
  [ -n "${COMMIT_SHA:-}" ] || return 0
  git log -1 --format=%B "$COMMIT_SHA" 2>/dev/null || true
}

# The PR's {type}/KEY branch wins, then the PR title, then the commit message.
resolve_issue_key() {
  if [ -n "${ISSUE_KEY:-}" ]; then
    echo "$ISSUE_KEY"
    return
  fi
  local pulls ref title key
  pulls=$(github_commit_pulls)
  if [ -n "$pulls" ] && jq -e 'type == "array" and length > 0' <<< "$pulls" > /dev/null 2>&1; then
    ref=$(jq -r '.[0].head.ref // ""' <<< "$pulls")
    key=$(key_from_branch "$ref")
    if [ -n "$key" ]; then
      echo "$key"
      return
    fi
    title=$(jq -r '.[0].title // ""' <<< "$pulls")
    key=$(first_key <<< "$title")
    if [ -n "$key" ]; then
      echo "$key"
      return
    fi
  fi
  commit_message | first_key
}

jira_auth_config() {
  printf 'user = "%s:%s"\n' "$JIRA_USERNAME" "$JIRA_PASSWORD"
}

# Prints the issue's labels, one per line. Fails when the issue cannot be read.
jira_get_labels() {
  curl -sS --fail --max-time 30 -K <(jira_auth_config) \
    -H 'Accept: application/json' \
    "${JIRA_BASE_URL}/rest/api/2/issue/$1?fields=labels" | jq -r '.fields.labels[]?'
}

jira_comment() {
  local body
  body=$(jq -n --arg body "$2" '{body: $body}')
  if [ "$DRY_RUN" = "true" ]; then
    log "DRY RUN: POST /rest/api/2/issue/$1/comment $body"
    return
  fi
  curl -sS --fail --max-time 30 -K <(jira_auth_config) -o /dev/null \
    -H 'Content-Type: application/json' -X POST --data "$body" \
    "${JIRA_BASE_URL}/rest/api/2/issue/$1/comment"
}

# Arguments: <issue key> <JSON array of label operations, e.g. [{"add":"X"},{"remove":"Y"}]>
jira_labels() {
  local body
  body=$(jq -n --argjson ops "$2" '{update: {labels: $ops}}')
  if [ "$DRY_RUN" = "true" ]; then
    log "DRY RUN: PUT /rest/api/2/issue/$1 $body"
    return
  fi
  curl -sS --fail --max-time 30 -K <(jira_auth_config) -o /dev/null \
    -H 'Content-Type: application/json' -X PUT --data "$body" \
    "${JIRA_BASE_URL}/rest/api/2/issue/$1?notifyUsers=false"
}

# Prints an ID token for platform-api, minted fresh for every read (tokens live 1 h).
# Like extenda/actions setup-gcloud getIdToken: the exported access token is dropped, and
# workload identity credentials need impersonation of the service account.
platform_token() {
  if env -u CLOUDSDK_AUTH_ACCESS_TOKEN gcloud auth print-identity-token --audiences=platform 2>/dev/null; then
    return
  fi
  local account="${CLOUDSDK_CORE_ACCOUNT:-}"
  [ -n "$account" ] || account=$(env -u CLOUDSDK_AUTH_ACCESS_TOKEN gcloud config get account 2>/dev/null)
  env -u CLOUDSDK_AUTH_ACCESS_TOKEN gcloud auth print-identity-token --audiences=platform \
    --impersonate-service-account="$account" --include-email
}

# Prints "<http status>\n<body>" for GET /canary/automatic/{service}.
platform_get_canary() {
  local token response
  if ! token=$(platform_token) || [ -z "$token" ]; then
    log "::error::Could not mint an ID token with audience platform for the active gcloud account"
    token=''
  fi
  response=$(curl -sS --max-time 30 -w '\n%{http_code}' \
    -K <(printf 'header = "Authorization: Bearer %s"\n' "$token") \
    "${PLATFORM_API_URL}/canary/automatic/${SERVICE}?project=${PROJECT}&region=${REGION}" || printf '\n000')
  printf '%s\n%s\n' "${response##*$'\n'}" "${response%$'\n'*}"
}

iso_to_epoch() {
  jq -rn --arg t "$1" '$t | sub("\\.[0-9]+"; "") | sub("\\+00:00$"; "Z") | fromdateiso8601' 2>/dev/null || echo 0
}

# Polls until the canary of REVISION ends. Prints "<outcome>\n<canary JSON or empty>".
wait_for_canary() {
  local start deadline grace_end status body row_revision row_status row_started elapsed
  start=$(now)
  deadline=$((start + TIMEOUT_MINUTES * 60))
  grace_end=$((start + REGISTER_GRACE_MINUTES * 60))
  while true; do
    { read -r status; body=$(cat); } < <(platform_get_canary)
    case "$status" in
      200)
        row_revision=$(jq -r '.revision // ""' <<< "$body")
        row_status=$(jq -r '.status // ""' <<< "$body")
        if [ "$row_revision" = "$REVISION" ]; then
          case "$row_status" in
            completed) printf 'live\n%s\n' "$body"; return ;;
            rolled_back) printf 'rolled_back\n%s\n' "$body"; return ;;
            cancelled) printf 'cancelled\n%s\n' "$body"; return ;;
            failed) printf 'rolled_back\n%s\n' "$body"; return ;;
            in_progress) log "Canary $REVISION in progress (step $(jq -r '.step_index' <<< "$body"), steps $(jq -r '.steps' <<< "$body"))" ;;
            *) log "Canary $REVISION has unknown status '$row_status'" ;;
          esac
        else
          row_started=$(iso_to_epoch "$(jq -r '.started_at // ""' <<< "$body")")
          if [ "$(jq -r '.previous_revision // ""' <<< "$body")" = "$REVISION" ] \
            || { [ "$DEPLOYED_AT" -gt 0 ] && [ "$row_started" -gt "$DEPLOYED_AT" ]; }; then
            printf 'superseded\n%s\n' "$body"
            return
          fi
          log "Canary row is for $row_revision, waiting for $REVISION to register"
          if [ "$(now)" -ge "$grace_end" ]; then
            printf 'not_registered\n%s\n' "$body"
            return
          fi
        fi
        ;;
      404)
        log "No canary row for $SERVICE yet"
        if [ "$(now)" -ge "$grace_end" ]; then
          printf 'not_registered\n\n'
          return
        fi
        ;;
      401 | 403)
        log "::error::platform-api refused GET /canary/automatic/$SERVICE with HTTP $status"
        printf 'unreadable\n\n'
        return
        ;;
      *)
        log "::warning::platform-api answered HTTP $status, retrying"
        ;;
    esac
    elapsed=$(($(now) - start))
    if [ "$(now)" -ge "$deadline" ]; then
      log "No canary result after $((elapsed / 60)) minutes"
      printf 'timeout\n%s\n' "$body"
      return
    fi
    sleep_for "$POLL_SECONDS"
  done
}

headline() {
  case "$1" in
    live) echo "Canary completed: ${REVISION} serves 100% of traffic." ;;
    live_no_canary) echo "Deployed without a canary (traffic.canary is not set): ${REVISION} serves 100% of traffic." ;;
    rolled_back) echo "Canary rolled back: the platform found an ERROR log line on ${REVISION} and moved traffic back to the previous revision. A human decides whether the change is at fault (sidecar noise also triggers it)." ;;
    cancelled) echo "Canary cancelled: a manual traffic change or a newer deploy ended the canary of ${REVISION}. The change is not confirmed live." ;;
    superseded) echo "Canary superseded: a newer revision replaced the canary of ${REVISION} before it reached 100%. The change is not confirmed live." ;;
    not_registered) echo "No canary was registered for ${REVISION} within ${REGISTER_GRACE_MINUTES} min (first deploy, or the registration failed). The change is not confirmed live." ;;
    timeout) echo "No canary result for ${REVISION} after ${TIMEOUT_MINUTES} min. The change is not confirmed live." ;;
    unreadable) echo "The deploy job could not read the canary state of ${REVISION} from platform-api. The change is not confirmed live." ;;
  esac
}

comment_text() {
  local outcome="$1" canary="$2" text
  text="$(headline "$outcome")"$'\n\n'
  text+="Service: ${SERVICE} (${PROJECT}, ${REGION})"$'\n'
  text+="Revision: ${REVISION}"$'\n'
  [ -n "${RELEASE_TAG:-}" ] && text+="Release: ${RELEASE_TAG}"$'\n'
  [ -n "${COMMIT_SHA:-}" ] && text+="Commit: https://github.com/${REPOSITORY}/commit/${COMMIT_SHA}"$'\n'
  if [ -n "$canary" ]; then
    text+="Canary: status $(jq -r '.status' <<< "$canary"), steps $(jq -r '.steps' <<< "$canary"), started $(jq -r '.started_at' <<< "$canary"), ended $(jq -r '.completed_at // "-"' <<< "$canary")"$'\n'
    if [ "$outcome" = "rolled_back" ]; then
      text+="Rollback reason: see the canary thread in $(jq -r '.slack_channel // "the clan Slack channel"' <<< "$canary")"$'\n'
    fi
  fi
  [ -n "${RUN_URL:-}" ] && text+="Deploy run: ${RUN_URL}"$'\n'
  text+="Outcome: ${outcome} (written by the fnl-deploy-to-prod canary report)"
  printf '%s' "$text"
}

label_ops() {
  case "$1" in
    live | live_no_canary) jq -cn --arg a "$LIVE_LABEL" --arg r "$READY_LABEL" '[{add: $a}, {remove: $r}]' ;;
    *) jq -cn --arg a "$STUCK_LABEL" '[{add: $a}]' ;;
  esac
}

main() {
  : "${SERVICE:?SERVICE is required}" "${PROJECT:?PROJECT is required}" "${REVISION:?REVISION is required}"

  local key labels outcome canary result
  key=$(resolve_issue_key)
  set_output issue-key "$key"
  if [ -z "$key" ]; then
    log "No ${JIRA_PROJECT_KEY} issue key in the PR branch, PR title or commit message of ${COMMIT_SHA:-?}; nothing to report"
    set_output outcome skipped
    summary "Canary report: skipped, no ${JIRA_PROJECT_KEY} issue key"
    return 0
  fi

  : "${JIRA_USERNAME:?JIRA_USERNAME is required}" "${JIRA_PASSWORD:?JIRA_PASSWORD is required}"
  if [ -n "$AGENT_LABEL" ]; then
    if ! labels=$(jira_get_labels "$key"); then
      log "::error::Could not read ${key} from Jira"
      return 1
    fi
    if ! grep -qxF "$AGENT_LABEL" <<< "$labels"; then
      log "${key} has no '${AGENT_LABEL}' label; nothing to report"
      set_output outcome skipped
      summary "Canary report: skipped, ${key} is not an agent issue"
      return 0
    fi
  fi

  if [ "$CANARY_CONFIGURED" != "true" ]; then
    outcome=live_no_canary
    canary=''
  else
    result=$(wait_for_canary)
    outcome=$(head -n 1 <<< "$result")
    canary=$(tail -n +2 <<< "$result")
  fi

  log "Outcome for ${key}: ${outcome}"
  jira_comment "$key" "$(comment_text "$outcome" "$canary")"
  jira_labels "$key" "$(label_ops "$outcome")"
  set_output outcome "$outcome"
  summary "Canary report: ${outcome} for ${key} (${REVISION})"

  if [ "$outcome" = "unreadable" ]; then
    return 1
  fi
  case "$outcome" in
    live | live_no_canary) ;;
    *) log "::warning::${key}: ${outcome}, labelled ${STUCK_LABEL}" ;;
  esac
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main
fi
