#!/usr/bin/env bash
INBOX=".claude/learning/insights_inbox.md"
if [[ -f "$INBOX" && -s "$INBOX" ]]; then
  COUNT=$(grep -c "^\- " "$INBOX" 2>/dev/null || echo "0")
  if [[ "$COUNT" -gt 0 ]]; then
    echo "HINWEIS: $COUNT Erkenntnisse in insights_inbox.md. Empfehlung: /scc-learn-distill"
  fi
fi
exit 0
