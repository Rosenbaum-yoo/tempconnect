# Claude Code Hooks — Sicherheits-Schutzschicht

> Drei Pflicht-Hooks unter `.claude/hooks/`. Sie verhindern, dass Claude Code im SCC-/Hetzner-Kontext gefährliche Operationen ausführt — auch nicht versehentlich.

---

## Zweck

Claude Code ist Entwicklungsagent. Es darf:
- Code lesen
- Code schreiben
- Tests laufen lassen
- Dokumentation erzeugen
- PRs vorbereiten

Es darf **nicht**:
- `.env`-Dateien oder Secrets lesen
- Production-SSH ausführen
- Hetzner-Server direkt löschen/rebuild/reset
- Destruktive Git-Operationen ohne Owner-Freigabe

Diese drei Hooks setzen das **technisch durch** — nicht nur als Hoffnung.

---

## 1. PreToolUse-Hook: `block-dangerous-infra.sh`

**Zweck:** Blockt gefährliche Shell-/Infrastruktur-Kommandos vor der Ausführung.

**Lage:** `.claude/hooks/block-dangerous-infra.sh`

**Blockierte Patterns:**
```text
rm -rf /
rm -rf .git
curl https://api.hetzner.cloud
hcloud server delete
hcloud server rebuild
hcloud server reset-password
ssh prod
ssh root@
scp .env
sudo rm
chmod 777 .env
dd if=/dev/zero of=/
mkfs
fdisk
```

**Verhalten bei Treffer:**
- Kommando wird **nicht ausgeführt**
- Claude Code erhält klare Fehlermeldung
- Optional: Audit-Eintrag in `.claude/audit/blocked-commands.log` (lokal, nicht im Release)

**Skelett:**
```bash
#!/usr/bin/env bash
# .claude/hooks/block-dangerous-infra.sh
set -euo pipefail

CMD="$1"

PATTERNS=(
  "rm -rf /"
  "rm -rf .git"
  "curl https://api.hetzner.cloud"
  "hcloud server delete"
  "hcloud server rebuild"
  "hcloud server reset-password"
  "ssh prod"
  "ssh root@"
  "scp .env"
  "sudo rm"
  "chmod 777 .env"
)

for pattern in "${PATTERNS[@]}"; do
  if [[ "$CMD" == *"$pattern"* ]]; then
    echo "BLOCKED: Dangerous command pattern detected: $pattern" >&2
    echo "If this is intentional, run manually with Owner approval." >&2
    exit 1
  fi
done

exit 0
```

---

## 2. Secret-Read-Hook: `block-secret-read.sh`

**Zweck:** Verhindert, dass Claude Code Secrets liest oder ausgibt.

**Lage:** `.claude/hooks/block-secret-read.sh`

**Blockierte Datei-Patterns:**
```text
.env
.env.local
.env.production
.env.staging
deploy/.env
*.pem
*.key
id_rsa
id_ed25519
```

**Blockierte Variablennamen in Output:**
```text
HETZNER_CLOUD_TOKEN
DATABASE_URL  (mit echtem Passwort)
JWT_SECRET
SESSION_SECRET
STAFF_SESSION_SECRET
STRIPE_SECRET_KEY
SENTRY_DSN
SMTP_PASSWORD
GITHUB_TOKEN
VERCEL_TOKEN
```

**Verhalten bei Treffer:**
- Datei wird nicht gelesen ODER Inhalt redigiert (`***REDACTED***`)
- Claude Code erhält klare Meldung: "Secret access blocked — use .env.example pattern instead"

**Skelett:**
```bash
#!/usr/bin/env bash
# .claude/hooks/block-secret-read.sh
set -euo pipefail

FILE_PATH="$1"

SECRET_FILES=(
  ".env"
  ".env.local"
  ".env.production"
  ".env.staging"
  "deploy/.env"
)

for secret in "${SECRET_FILES[@]}"; do
  if [[ "$FILE_PATH" == *"$secret" && "$FILE_PATH" != *".env.example" ]]; then
    echo "BLOCKED: Secret file access: $FILE_PATH" >&2
    echo "Use .env.example for documentation purposes." >&2
    exit 1
  fi
done

# Block private key files
if [[ "$FILE_PATH" =~ \.(pem|key)$ || "$FILE_PATH" == *"id_rsa"* || "$FILE_PATH" == *"id_ed25519"* ]]; then
  echo "BLOCKED: Private key file: $FILE_PATH" >&2
  exit 1
fi

exit 0
```

---

## 3. Required-Test-Hook: `require-tests-for-scc.sh`

**Zweck:** Wenn Claude Code SCC-relevante Dateien ändert, müssen Tests laufen.

**Lage:** `.claude/hooks/require-tests-for-scc.sh`

**Trigger bei Änderungen an:**
```text
api/routes/staffControlCenter.js
api/services/staffHetznerService.js
api/services/staffRunbookService.js
api/services/staffControlService.js
api/services/staffAuditService.js
api/services/staffCombinedInboxService.js
api/services/staffCustomerRequestsService.js
api/services/staffSubscriptionRequestsService.js
api/services/staffClaudeWorkOrderService.js
api/middleware/staffControlAccess.js
frontend/src/staff/**
sql/migrations/*staff*
sql/migrations/*infra*
```

**Pflicht-Befehle:**
```bash
cd api && npm run test:staff
cd frontend && npm run build:scc
```

Optional zusätzlich:
```bash
cd api && npm run test:security
```

**Verhalten:**
- Vor PR-Erzeugung müssen diese Befehle grün gelaufen sein
- Bei Fehlschlag: Claude Code muss den Fehler benennen und Fix vorschlagen, nicht ignorieren
- Bei Skip: Begründung in Commit-Message erforderlich (z. B. "doc-only change")

**Skelett:**
```bash
#!/usr/bin/env bash
# .claude/hooks/require-tests-for-scc.sh
set -euo pipefail

CHANGED_FILES="$1"  # newline-separated list

SCC_PATTERNS=(
  "api/routes/staffControlCenter.js"
  "api/services/staff"
  "api/middleware/staffControlAccess.js"
  "frontend/src/staff/"
  "sql/migrations/.*staff"
  "sql/migrations/.*infra"
)

REQUIRES_TESTS=0
for pattern in "${SCC_PATTERNS[@]}"; do
  if echo "$CHANGED_FILES" | grep -qE "$pattern"; then
    REQUIRES_TESTS=1
    break
  fi
done

if [[ "$REQUIRES_TESTS" == "1" ]]; then
  echo "SCC-relevant files changed. Required tests:" >&2
  echo "  cd api && npm run test:staff" >&2
  echo "  cd frontend && npm run build:scc" >&2
  echo "Run these before committing or merging." >&2
  # Optional: actually run them here, or just remind
fi

exit 0
```

---

## Hook-Aktivierung

In `.claude/settings.json` (oder Äquivalent):

```json
{
  "hooks": {
    "PreToolUse": [".claude/hooks/block-dangerous-infra.sh"],
    "PreFileRead": [".claude/hooks/block-secret-read.sh"],
    "PostFileEdit": [".claude/hooks/require-tests-for-scc.sh"]
  }
}
```

> **Hinweis:** Genaue Hook-Konfiguration richtet sich nach der aktuellen Claude-Code-Version. In Track B WAVE H6 verifizieren.

---

## Release-Hygiene

`.claude/` darf **nicht** ins externe Release-Artefakt. Die Hooks helfen lokal/im CI, sind aber kein Produktbestandteil.

**Verifizierung:** Phase-2 WAVE 01 Release-Verifier hat `.claude` auf der Ausschlussliste. Sicherstellen, dass das auch nach Hook-Erstellung weiterhin gilt.

---

## Was Hooks NICHT ersetzen

Hooks sind **defense in depth**, nicht der einzige Schutz:
- Server-Guards in `staffControlAccess.js` bleiben Pflicht
- Migrations-Reviews bleiben Pflicht
- PR-Reviews bleiben Pflicht
- Audit-Logs bleiben Pflicht

Hooks fangen den **versehentlichen** Schaden ab. Den **absichtlichen** Schaden fangen Policy + Mensch.

---

## Tests für die Hooks

Pflicht-Tests in `.claude/hooks/test/`:
- `test_block_dangerous_infra.sh` — testet, dass jedes blockierte Pattern wirklich blockiert
- `test_block_secret_read.sh` — testet, dass `.env` blockiert, `.env.example` erlaubt ist
- `test_require_tests.sh` — testet, dass Trigger korrekt erkennt

**Befehl:**
```bash
bash .claude/hooks/test/run-all.sh
```

Tests werden in CI ausgeführt (siehe Phase-2 WAVE 04).
