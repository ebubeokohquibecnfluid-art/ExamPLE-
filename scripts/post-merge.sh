#!/bin/bash
set -e

npm install --legacy-peer-deps

LOG_FILE="logs/github-sync.log"
mkdir -p logs

echo "Pushing to GitHub (origin/main)..."

set +e
PUSH_OUTPUT=$(git push origin main 2>&1)
PUSH_EXIT=$?
set -e

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

redact_sensitive() {
  echo "$1" | sed -E 's|https://[^@]+@|https://***@|g'
}

if [ $PUSH_EXIT -ne 0 ]; then
  SAFE_OUTPUT=$(redact_sensitive "$PUSH_OUTPUT")

  echo "ERROR: GitHub push failed (exit code $PUSH_EXIT)"
  echo "$SAFE_OUTPUT"

  {
    echo "[$TIMESTAMP] FAILURE — git push origin main failed (exit $PUSH_EXIT)"
    echo "$SAFE_OUTPUT"
    echo "---"
  } >> "$LOG_FILE"

  if [ -n "$SLACK_WEBHOOK_URL" ]; then
    PAYLOAD=$(jq -Rn \
      --arg txt "[ExamPLE] GitHub sync FAILED after deploy (exit ${PUSH_EXIT}): ${SAFE_OUTPUT}" \
      '{"text": $txt}')
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
      -X POST -H 'Content-type: application/json' \
      --data "$PAYLOAD" "$SLACK_WEBHOOK_URL")
    if [[ "$HTTP_STATUS" =~ ^2 ]]; then
      echo "Slack alert sent (HTTP $HTTP_STATUS)."
    else
      echo "WARNING: Slack alert may have failed (HTTP $HTTP_STATUS)." >&2
    fi
  else
    echo "NOTICE: Set SLACK_WEBHOOK_URL secret to receive Slack alerts on push failures."
  fi

  exit $PUSH_EXIT
fi

{
  echo "[$TIMESTAMP] SUCCESS — git push origin main"
  echo "---"
} >> "$LOG_FILE"
echo "Push to GitHub succeeded."
