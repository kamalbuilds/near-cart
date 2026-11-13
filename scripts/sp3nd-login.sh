#!/usr/bin/env bash
set -euo pipefail
umask 077

auth=https://happy-dragon-88.authkit.app
session_file="$(cd "$(dirname "$0")/.." && pwd)/.sp3nd-session.json"
client_file="$(dirname "$session_file")/.sp3nd-client.json"
owner_file=/Volumes/AgentData/near/.progress/SP3ND-LOGIN.txt
tmp="$(mktemp)"
trap 'rm -f "$tmp" "$owner_file.tmp"' EXIT

if [[ -s "$session_file" ]]; then
  expires_at=$(jq -r '.expires_at // 0' "$session_file")
  if (( expires_at > $(date +%s) + 60 )); then
    echo "SP3ND session already valid until $(date -r "$expires_at" '+%Y-%m-%d %H:%M:%S %Z')"
    exit 0
  fi
  refresh_token=$(jq -r '.refresh_token // empty' "$session_file")
  if [[ -n "$refresh_token" ]]; then
    client_id=$(jq -r '.client_id' "$session_file")
    status=$(curl -sS -o "$tmp" -w '%{http_code}' "$auth/oauth2/token" -H 'Content-Type: application/x-www-form-urlencoded' \
      --data-urlencode 'grant_type=refresh_token' --data-urlencode "refresh_token=$refresh_token" \
      --data-urlencode "client_id=$client_id")
    if [[ "$status" == 200 ]] && jq -e '.access_token and .token_type' "$tmp" >/dev/null; then
      jq --arg client_id "$client_id" --argjson expires_at "$(($(date +%s) + $(jq -r '.expires_in // 3600' "$tmp")))" \
        '. + {client_id:$client_id, expires_at:$expires_at}' "$tmp" >"$session_file.new"
      chmod 600 "$session_file.new"
      mv "$session_file.new" "$session_file"
      echo "SP3ND session refreshed"
      exit 0
    fi
  fi
fi

if [[ ! -s "$client_file" ]]; then
  curl -fsS "$auth/oauth2/register" -H 'Content-Type: application/json' \
    -d '{"client_name":"Cart local checkout","grant_types":["urn:ietf:params:oauth:grant-type:device_code","refresh_token"],"response_types":["code"],"redirect_uris":["http://127.0.0.1"],"token_endpoint_auth_method":"none"}' >"$tmp"
  jq -e '.client_id' "$tmp" >/dev/null
  cp "$tmp" "$client_file"
  chmod 600 "$client_file"
fi

client_id=$(jq -r '.client_id' "$client_file")
deadline=$(( $(date +%s) + 900 ))
mkdir -p "$(dirname "$owner_file")"
while (( $(date +%s) < deadline )); do
  curl -fsS "$auth/oauth2/device_authorization" -H 'Content-Type: application/x-www-form-urlencoded' \
    --data-urlencode "client_id=$client_id" \
    --data-urlencode 'scope=openid profile offline_access' \
    --data-urlencode 'resource=https://mcp.sp3nd.shop/mcp' >"$tmp"
  jq -e '.device_code and .user_code and (.verification_uri or .verification_uri_complete)' "$tmp" >/dev/null
  device_code=$(jq -r '.device_code' "$tmp")
  user_code=$(jq -r '.user_code' "$tmp")
  verification_uri=$(jq -r '.verification_uri // .verification_uri_complete' "$tmp")
  interval=$(jq -r '.interval // 5' "$tmp")
  expires_at=$(( $(date +%s) + $(jq -r '.expires_in // 600' "$tmp") ))
  {
    printf 'Verification URL: %s\nCode: %s\nExpires: %s\n' "$verification_uri" "$user_code" "$(date -r "$expires_at" '+%Y-%m-%d %H:%M:%S %Z')"
  } >"$owner_file.tmp"
  chmod 600 "$owner_file.tmp"
  mv "$owner_file.tmp" "$owner_file"
  echo "Owner authorization details written to $owner_file"
  echo "Waiting for owner authorization. Tokens will not be printed."

  while (( $(date +%s) < expires_at && $(date +%s) < deadline )); do
    sleep "$interval"
    status=$(curl -sS -o "$tmp" -w '%{http_code}' "$auth/oauth2/token" \
      -H 'Content-Type: application/x-www-form-urlencoded' \
      --data-urlencode 'grant_type=urn:ietf:params:oauth:grant-type:device_code' \
      --data-urlencode "device_code=$device_code" --data-urlencode "client_id=$client_id")
    if [[ "$status" == 200 ]]; then
      jq -e '.access_token and .token_type' "$tmp" >/dev/null
      jq --arg client_id "$client_id" --argjson expires_at "$(($(date +%s) + $(jq -r '.expires_in // 3600' "$tmp")))" \
        '. + {client_id:$client_id, expires_at:$expires_at}' "$tmp" >"$session_file.new"
      chmod 600 "$session_file.new"
      mv "$session_file.new" "$session_file"
      rm -f "$owner_file"
      echo "SP3ND session stored at $session_file"
      exit 0
    fi
    error=$(jq -r '.error // empty' "$tmp" 2>/dev/null || true)
    case "$error" in
      authorization_pending) ;;
      slow_down) interval=$((interval + 5)) ;;
      expired_token) break ;;
      access_denied)
        echo "SP3ND authorization ended: $error" >&2
        exit 1
        ;;
      *)
        echo "SP3ND token endpoint returned HTTP $status" >&2
        exit 1
        ;;
    esac
  done
  echo "SP3ND device code expired; issuing a fresh code."
done

echo 'SP3ND authorization was not completed within 15 minutes.' >&2
exit 1
