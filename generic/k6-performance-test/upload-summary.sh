#!/bin/sh
#
# Uploads a k6 --summary-export file to the SRE API so results can be trended over time.
# Shared by entrypoint.sh (baked into the Cloud Run Job image) and the action's
# github-actions runtime, so the upload format only has to be fixed in one place.
#
# The caller mints the bearer token -- a Cloud Run Job mints it from the metadata server,
# a GitHub Actions runner mints it via extenda/actions/identity-token -- and passes it in
# as SRE_TOKEN. This script does not know or care how the token was minted.
#
# Never fatal: a flaky upload must not turn a healthy performance run red, and must not
# mask a k6 threshold breach.

set -u

SUMMARY_FILE="${SUMMARY_FILE:?SUMMARY_FILE is required}"
SRE_API_URL="${SRE_API_URL:?SRE_API_URL is required}"
SRE_TOKEN="${SRE_TOKEN:-}"

# Together with the test name these five values are the partition key behind
# GET /k6/trends, so they must stay stable across runs.
SERVICE_NAME="${SERVICE_NAME:?SERVICE_NAME is required}"
PROJECT_ID="${PROJECT_ID:?PROJECT_ID is required}"
TEST_NAME="${TEST_NAME:?TEST_NAME is required}"
ENVIRONMENT="${ENVIRONMENT:?ENVIRONMENT is required}"
CLAN="${CLAN:?CLAN is required}"

if [ ! -s "${SUMMARY_FILE}" ]; then
  echo "WARN: no summary at ${SUMMARY_FILE}, skipping upload"
  exit 0
fi

if [ -z "${SRE_TOKEN}" ]; then
  echo "WARN: no SRE API token, skipping upload"
  exit 0
fi

# No --retry: the SRE API has no idempotency key to dedupe on, so a retried POST that
# actually landed the first time (server processed it, response was lost) would double
# the summary for this run. A single failed attempt just warns below -- not worth trading
# a duplicate write for.
if curl --fail --silent --show-error --max-time 60 \
  -X POST "${SRE_API_URL}/api/v1/k6/summary" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SRE_TOKEN}" \
  -H "X-Service-Name: ${SERVICE_NAME}" \
  -H "X-Project-Id: ${PROJECT_ID}" \
  -H "X-Test-Name: ${TEST_NAME}" \
  -H "X-Environment: ${ENVIRONMENT}" \
  -H "X-Clan: ${CLAN}" \
  --data-binary "@${SUMMARY_FILE}"; then
  echo "Uploaded k6 summary for ${SERVICE_NAME}/${TEST_NAME} (${ENVIRONMENT})"
else
  echo "WARN: failed to upload k6 summary to ${SRE_API_URL}"
fi
