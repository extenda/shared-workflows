#!/bin/sh
#
# Entrypoint for the k6 performance-test image built by the k6-cloud-run-job action.
#
# Runs the k6 script against the service under test, then pushes the end-of-test
# summary to the SRE API via upload-summary.sh, which lives alongside this script in
# the image.
#
# Nothing outside the container can retrieve the summary: a Cloud Run Job shares no
# volume with the pipeline that started it, and the job may not have been started by a
# pipeline at all. So the upload has to happen here, before we exit.
#
# Every setting is supplied as an environment variable on the job by the action.

set -u

# Reported to the SRE API. Together with the test name these five values are the
# partition key behind GET /k6/trends, so they must stay stable across runs.
SERVICE_NAME="${SERVICE_NAME:?SERVICE_NAME is required}"
PROJECT_ID="${PROJECT_ID:?PROJECT_ID is required}"
TEST_NAME="${TEST_NAME:?TEST_NAME is required}"
ENVIRONMENT="${ENVIRONMENT:?ENVIRONMENT is required}"
CLAN="${CLAN:?CLAN is required}"

K6_SCRIPT="${K6_SCRIPT:?K6_SCRIPT is required}"
SUMMARY_FILE="${SUMMARY_FILE:-/tmp/${TEST_NAME}-summary.json}"

# Service under test. TARGET_HOST is typically only resolvable from inside the VPC.
TARGET_HOST="${TARGET_HOST:?TARGET_HOST is required}"
TARGET_AUTHORITY="${TARGET_AUTHORITY:-}"
TARGET_AUDIENCE="${TARGET_AUDIENCE:-}"

SRE_API_URL="${SRE_API_URL:-https://sre-api.retailsvc.com}"
SRE_API_AUDIENCE="${SRE_API_AUDIENCE:-hiiretail-sre-api}"

METADATA_URL="http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity"

# Mint a Google-signed ID token for the given audience from the metadata server. Only
# works from inside GCP -- a GitHub-hosted runner has no metadata server to ask, which is
# why the github-actions runtime mints its tokens via extenda/actions/identity-token
# instead and hands the result straight to upload-summary.sh.
fetch_id_token() {
  curl --silent --fail --max-time 10 \
    -H "Metadata-Flavor: Google" \
    "${METADATA_URL}?audience=$1"
}

# The service under test is usually IAM-protected, so mint a token for it up front.
# Scripts that do not need one can leave TARGET_AUDIENCE empty.
target_token=''
if [ -n "${TARGET_AUDIENCE}" ]; then
  target_token=$(fetch_id_token "${TARGET_AUDIENCE}")
  if [ -z "${target_token}" ]; then
    echo "ERROR: could not mint an identity token for '${TARGET_AUDIENCE}'"
    exit 1
  fi
fi

k6 run \
  --summary-export="${SUMMARY_FILE}" \
  -e GRPC_HOST="${TARGET_HOST}" \
  -e TARGET_HOST="${TARGET_HOST}" \
  -e GRPC_AUTHORITY="${TARGET_AUTHORITY}" \
  -e AUTH_TOKEN="${target_token}" \
  "${K6_SCRIPT}"
k6_exit=$?

sre_token=$(fetch_id_token "${SRE_API_AUDIENCE}")
if [ -z "${sre_token}" ]; then
  echo "WARN: could not mint an identity token for '${SRE_API_AUDIENCE}', skipping upload"
else
  SUMMARY_FILE="${SUMMARY_FILE}" SRE_API_URL="${SRE_API_URL}" SRE_TOKEN="${sre_token}" \
  SERVICE_NAME="${SERVICE_NAME}" PROJECT_ID="${PROJECT_ID}" TEST_NAME="${TEST_NAME}" \
  ENVIRONMENT="${ENVIRONMENT}" CLAN="${CLAN}" \
    "$(dirname "$0")/upload-summary.sh"
fi

exit "${k6_exit}"
