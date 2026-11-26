# Canary Jira report

Waits for the platform's automatic canary of one deployed Cloud Run revision to end, then writes
the result to the Jira issue of the deployed commit. Used by the reusable workflow
`.github/workflows/fnl-canary-report.yml`, which a repo's `commit.yml` calls after its prod deploy.

## How it works

1. Finds the issue key: the PR branch `{type}/HII-nnnnn`, then the PR title, then the commit message.
2. Reads the issue's labels. Issues without `agent-label` (default `agent-smoke`) are skipped.
3. Reads `GET https://platform-api.retailsvc.com/canary/automatic/{service}` every `poll-seconds`
   with an ID token (audience `platform`) of the authenticated deploy service account, until the
   row for `revision` reaches a terminal state or `timeout-minutes` passes.
4. Posts a comment and updates labels:

| Outcome | When | Labels |
|---|---|---|
| `live` | canary `completed` (100% traffic) | add `AgentLive`, remove `AgentReadyToMerge` |
| `live_no_canary` | `traffic.canary` is not set; the deploy served 100% | add `AgentLive`, remove `AgentReadyToMerge` |
| `rolled_back` | canary `rolled_back` (or `failed`) | add `AgentStuck` |
| `cancelled` | canary `cancelled` (manual traffic change or a newer deploy) | add `AgentStuck` |
| `superseded` | a newer revision's canary replaced this one | add `AgentStuck` |
| `not_registered` | no row for `revision` after `register-grace-minutes` | add `AgentStuck` |
| `timeout` | still `in_progress` after `timeout-minutes` | add `AgentStuck` |
| `unreadable` | platform-api answered 401/403; the step fails | add `AgentStuck` |
| `skipped` | no issue key, or the issue lacks `agent-label` | none |

The comment mentions no one. Jira rules that react to `AgentStuck` decide who is notified.

## Example

```yaml
- uses: extenda/actions/setup-gcloud@v0
  with:
    service-account-key: ${{ secrets.GCLOUD_AUTH_PROD }}
- uses: extenda/actions/gcp-secret-manager@v0
  with:
    service-account-key: ${{ secrets.SECRET_AUTH }}
    secrets: |
      JIRA_USERNAME: jira-username
      JIRA_PASSWORD: jira-password
- uses: extenda/shared-workflows/composite-actions/financial-and-logistics/canary-jira-report@master
  with:
    service: my-service
    project: my-prod-project
    revision: my-service-00042-abc
    jira-username: ${{ env.JIRA_USERNAME }}
    jira-password: ${{ env.JIRA_PASSWORD }}
```

`dry-run: 'true'` logs the Jira writes instead of sending them.

## Tests

```bash
composite-actions/financial-and-logistics/canary-jira-report/canary-jira-report.test.sh
```
