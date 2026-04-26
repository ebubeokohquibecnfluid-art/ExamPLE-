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

send_webhook_alert() {
  local webhook_url="$1"
  local message="$2"
  local PAYLOAD
  PAYLOAD=$(jq -Rn --arg txt "$message" '{"text": $txt}')
  local HTTP_STATUS
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST -H 'Content-type: application/json' \
    --data "$PAYLOAD" "$webhook_url" 2>/dev/null) || HTTP_STATUS="000"
  echo "${HTTP_STATUS:-000}"
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

  ALERT_MESSAGE="[ExamPLE] GitHub sync FAILED after deploy (exit ${PUSH_EXIT}): ${SAFE_OUTPUT}"

  ALERT_SENT=false

  if [ -n "$ALERT_WEBHOOK_URL" ]; then
    HTTP_STATUS=$(send_webhook_alert "$ALERT_WEBHOOK_URL" "$ALERT_MESSAGE")
    if [[ "$HTTP_STATUS" =~ ^2 ]]; then
      echo "Alert sent via webhook (HTTP $HTTP_STATUS)."
      ALERT_SENT=true
    else
      echo "WARNING: Webhook alert may have failed (HTTP $HTTP_STATUS)." >&2
    fi
  fi

  if [ "$ALERT_SENT" = false ] && [ -n "$SLACK_WEBHOOK_URL" ]; then
    HTTP_STATUS=$(send_webhook_alert "$SLACK_WEBHOOK_URL" "$ALERT_MESSAGE")
    if [[ "$HTTP_STATUS" =~ ^2 ]]; then
      echo "Slack alert sent (HTTP $HTTP_STATUS)."
      ALERT_SENT=true
    else
      echo "WARNING: Slack alert may have failed (HTTP $HTTP_STATUS)." >&2
    fi
  fi

  if [ "$ALERT_SENT" = false ]; then
    echo "NOTICE: Set ALERT_WEBHOOK_URL (or SLACK_WEBHOOK_URL) secret to receive push-failure alerts."
  fi

  exit $PUSH_EXIT
fi

{
  echo "[$TIMESTAMP] SUCCESS — git push origin main"
  echo "---"
} >> "$LOG_FILE"
echo "Push to GitHub succeeded."
