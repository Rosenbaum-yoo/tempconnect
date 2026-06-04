#!/usr/bin/env bash
FILE_PATH="${1:-}"
for secret in ".env" ".env.local" ".env.production" "deploy/.env"; do
  if [[ "$FILE_PATH" == *"$secret" && "$FILE_PATH" != *".env.example" ]]; then
    echo "BLOCKED: $FILE_PATH" >&2; exit 1
  fi
done
exit 0
