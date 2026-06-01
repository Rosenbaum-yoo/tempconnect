#!/usr/bin/env bash
# install_claude_folder.sh
# Legt die .claude/ Ordner-Struktur für TempConnect im aktuellen Repo an.
# Aufruf: bash install_claude_folder.sh
# Voraussetzung: du stehst im Repo-Root (wo CLAUDE.md liegt)

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

echo -e "${YELLOW}TempConnect — .claude/ Setup${NC}"
echo "Läuft in: $(pwd)"
echo ""

# Prüfen ob wir im richtigen Verzeichnis sind
if [[ ! -f "CLAUDE.md" ]]; then
  echo -e "${RED}FEHLER: Keine CLAUDE.md gefunden.${NC}"
  echo "Bitte ins Repo-Root wechseln (cd /pfad/zu/tempconnect) und erneut ausführen."
  exit 1
fi

# --- .claude/ Struktur anlegen ---

mkdir -p .claude/learning
mkdir -p .claude/commands
mkdir -p .claude/hooks/test

echo -e "${GREEN}✓ Ordner angelegt${NC}"

# --- Learning-Dateien ---

cat > .claude/learning/config.md << 'EOF'
# Lern-Konfiguration

## Auto-Approve-Kategorien
# Diese Kategorien werden ohne Owner-Review in CLAUDE.md übernommen
# (nur wenn kein KONFLIKT markiert ist):

- EFFIZIENZ: ja    (reine Performance-/Token-Hinweise sind risikoarm)
- TECHNIK: nein    (technische Regeln brauchen Review — können falsch sein)
- WIRTSCHAFTLICHKEIT: nein  (ökonomische Annahmen brauchen Owner-Bestätigung)

## Token-Budget für CLAUDE.md Lernabschnitte
- Abschnitt 10 (Erkenntnisse): max 100 Zeilen
- Abschnitt 11 (Bereiche & Status): max 60 Zeilen
- Bei Überschreitung: /scc-learn-consolidate ausführen

## Konsolidierungs-Takt
- Empfehlung: nach jeweils 5 abgeschlossenen Phasen ODER monatlich
EOF

cat > .claude/learning/insights_inbox.md << 'EOF'
# Insights Inbox — Erkenntnisse während der Arbeit

# Format: - [KATEGORIE] <Erkenntnis> (Quelle: <Datei>, <Datum>)
# Kategorien: EFFIZIENZ / WIRTSCHAFTLICHKEIT / TECHNIK
#
# Beispiel:
# - [EFFIZIENZ] vendorPoolService Scorecard-Query braucht JOIN über 4 Tabellen — Index auf vendor_org_id ergänzt (Quelle: WAVE_04C, 2026-06-10)
# - [WIRTSCHAFTLICHKEIT] Spend-Analytics-Query kostet bei 300 Kunden 3s ohne Cache (Quelle: spendAnalyticsService.js, 2026-06-12)
# - [TECHNIK] Plan-Keys sind DEMO/BASIS/PLUS/PRO/INDIVIDUELL — NOTDIENST ist Legacy via normalizePlanKey() (Quelle: WAVE_02, 2026-06-05)

EOF

cat > .claude/learning/proposals.md << 'EOF'
# CLAUDE.md Vorschläge

# Wird von /scc-learn-distill befüllt.
# Format: [KATEGORIE] <Erkenntnis> (Quelle: <Datei>) — Status: NEU / KONFLIKT / AUTO-APPROVED

EOF

cat > .claude/learning/applied_log.md << 'EOF'
# Applied Log — übernommene Erkenntnisse

# Audit-Trail: was wurde wann in CLAUDE.md übernommen.
# Datum | Erkenntnis | Ziel-Abschnitt | übernommen von

EOF

echo -e "${GREEN}✓ Learning-Dateien erstellt${NC}"

# --- Command-Dateien ---

cat > .claude/commands/scc-learn-distill.md << 'EOF'
---
description: Destilliert gesammelte Erkenntnisse am Session-Ende zu CLAUDE.md-Vorschlägen
---

Lies .claude/learning/insights_inbox.md.

Für jede Erkenntnis:
1. Klassifiziere: EFFIZIENZ / WIRTSCHAFTLICHKEIT / TECHNIK
2. Prüfe gegen bestehende CLAUDE.md (Abschnitt 10 Erkenntnisse, Abschnitt 11 Bereiche):
   - Schon vorhanden? → verwerfen
   - Widerspricht Bestehendem? → als KONFLIKT markieren, nicht auto-übernehmen
   - Neu und wertvoll? → als Vorschlag formulieren
3. Formuliere jeden Vorschlag in EINER Zeile, maximal prägnant:
   Format: `[KATEGORIE] <Erkenntnis> (Quelle: <Datei/Welle>)`

Schreibe alle Vorschläge nach .claude/learning/proposals.md mit Datum.
Leere danach insights_inbox.md (Inhalt nach applied_log.md archivieren).

Gib NUR eine kompakte Zusammenfassung aus:
"X Erkenntnisse destilliert: Y Effizienz, Z Wirtschaftlichkeit, W Technik. K Konflikte markiert. Review mit /scc-learn-apply."

KEINE langen Erklärungen. Token sparen.
EOF

cat > .claude/commands/scc-learn-apply.md << 'EOF'
---
description: Übernimmt bestätigte Lern-Vorschläge in CLAUDE.md (kontrolliert)
---

Lies .claude/learning/proposals.md und .claude/learning/config.md.

Für jeden Vorschlag:
1. Wenn Kategorie in config.md als auto_approve markiert UND kein KONFLIKT:
   → direkt in CLAUDE.md übernehmen
2. Sonst:
   → dem Owner zeigen und auf explizite Bestätigung warten
   → NUR bei "ja"/"übernehmen" schreiben

Übernahme-Ziel in CLAUDE.md:
- EFFIZIENZ + TECHNIK → Abschnitt 10 (Erkenntnisse)
- WIRTSCHAFTLICHKEIT → Abschnitt 10 + Verweis in Abschnitt 5 (Wirtschaftlichkeitsregeln)
- Bereichs-spezifisch → Abschnitt 11 (Bekannte Bereiche & Status)

Regeln:
- Jede übernommene Zeile MUSS prägnant bleiben (max 1-2 Zeilen)
- Kein Duplikat erzeugen
- Bei KONFLIKT: Owner entscheidet, alte Regel ersetzen oder Vorschlag verwerfen
- Nach Übernahme: Eintrag in .claude/learning/applied_log.md (Datum, Erkenntnis, Ziel-Abschnitt)
- proposals.md nach Übernahme leeren

Gib kompakte Zusammenfassung: "X übernommen, Y verworfen, Z auf Owner-Entscheidung wartend."
EOF

cat > .claude/commands/scc-learn-consolidate.md << 'EOF'
---
description: Konsolidiert CLAUDE.md monatlich, hält sie schlank
---

Lies CLAUDE.md Abschnitt 10 (Erkenntnisse) und 11 (Bereiche).

Aufgaben:
1. Ähnliche Erkenntnisse zusammenfassen (z.B. 3 Performance-Hinweise zu Spend-Queries → 1 Regel)
2. Veraltete entfernen (z.B. "Stripe noch nicht live" wenn Stripe inzwischen live ist)
3. Widersprüche auflösen (Owner fragen bei Unklarheit)
4. Token-Budget prüfen: CLAUDE.md Abschnitt 10+11 sollte zusammen unter ~150 Zeilen bleiben
   - Wenn drüber: am wenigsten wertvolle/spezifische Erkenntnisse in
     docs/finalization/claude_learnings_archive.md auslagern

Zeige dem Owner ein Vorher/Nachher-Diff der konsolidierten Abschnitte.
NUR nach Bestätigung schreiben.

Gib aus: "CLAUDE.md konsolidiert: vorher X Zeilen, nachher Y Zeilen. Z archiviert."
EOF

echo -e "${GREEN}✓ Command-Dateien erstellt${NC}"

# --- Hook-Dateien ---

cat > .claude/hooks/session-end-distill.sh << 'EOF'
#!/usr/bin/env bash
# Stop-Hook: erinnert an Destillation am Session-Ende
# Registrieren in .claude/settings.json unter "hooks" -> "Stop"
set -euo pipefail

INBOX=".claude/learning/insights_inbox.md"

if [[ -f "$INBOX" && -s "$INBOX" ]]; then
  COUNT=$(grep -c "^\- " "$INBOX" 2>/dev/null || echo "0")
  if [[ "$COUNT" -gt 0 ]]; then
    echo "HINWEIS: $COUNT ungenutzte Erkenntnisse in insights_inbox.md."
    echo "Empfehlung: /scc-learn-distill ausführen, um CLAUDE.md-Vorschläge zu erzeugen."
  fi
fi

exit 0
EOF

cat > .claude/hooks/capture-insight.sh << 'EOF'
#!/usr/bin/env bash
# Fügt eine Erkenntnis zur Inbox hinzu (wird von Claude Code aufgerufen)
# Usage: bash .claude/hooks/capture-insight.sh "EFFIZIENZ" "Erkenntnis hier" "Quelldatei.js"
set -euo pipefail

CATEGORY="${1:?Kategorie fehlt (EFFIZIENZ/WIRTSCHAFTLICHKEIT/TECHNIK)}"
INSIGHT="${2:?Erkenntnis fehlt}"
SOURCE="${3:-unbekannt}"
INBOX=".claude/learning/insights_inbox.md"
DATE=$(date +%Y-%m-%d)

mkdir -p .claude/learning
echo "- [$CATEGORY] $INSIGHT (Quelle: $SOURCE, $DATE)" >> "$INBOX"
echo "✓ Erkenntnis erfasst: [$CATEGORY] $INSIGHT"
EOF

cat > .claude/hooks/block-dangerous-infra.sh << 'EOF'
#!/usr/bin/env bash
# PreToolUse-Hook: Blockt gefährliche Shell-/Infrastruktur-Kommandos
set -euo pipefail

CMD="${1:-}"

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
    echo "If intentional, run manually with Owner approval." >&2
    exit 1
  fi
done

exit 0
EOF

cat > .claude/hooks/block-secret-read.sh << 'EOF'
#!/usr/bin/env bash
# PreFileRead-Hook: Verhindert dass Claude Code Secrets liest
set -euo pipefail

FILE_PATH="${1:-}"

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

if [[ "$FILE_PATH" =~ \.(pem|key)$ || "$FILE_PATH" == *"id_rsa"* || "$FILE_PATH" == *"id_ed25519"* ]]; then
  echo "BLOCKED: Private key file: $FILE_PATH" >&2
  exit 1
fi

exit 0
EOF

chmod +x .claude/hooks/*.sh

echo -e "${GREEN}✓ Hook-Dateien erstellt und ausführbar gemacht${NC}"

# --- settings.json ---

if [[ ! -f ".claude/settings.json" ]]; then
  cat > .claude/settings.json << 'EOF'
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/hooks/session-end-distill.sh"
          }
        ]
      }
    ]
  }
}
EOF
  echo -e "${GREEN}✓ .claude/settings.json erstellt${NC}"
else
  echo -e "${YELLOW}! .claude/settings.json existiert bereits — nicht überschrieben${NC}"
  echo "  Füge den session-end-distill Hook manuell hinzu (siehe SELF_UPDATING_CLAUDE_MD.md)"
fi

# --- .gitignore Hinweis ---

echo ""
echo -e "${YELLOW}Hinweis .gitignore:${NC}"
if grep -q "\.claude" .gitignore 2>/dev/null; then
  echo -e "${GREEN}✓ .claude/ ist bereits in .gitignore${NC}"
else
  echo "  .claude/ ist NICHT in .gitignore."
  echo "  Empfehlung: füge folgendes zu .gitignore hinzu:"
  echo ""
  echo "  # Claude Code lokale Dateien (nicht ins Repo)"
  echo "  .claude/learning/"
  echo "  # ABER: .claude/commands/ und .claude/hooks/ können committet werden"
fi

# --- Abschluss ---

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  .claude/ Setup abgeschlossen!               ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo "Nächste Schritte:"
echo "  1. Lies INSTALL.md für die vollständige Anleitung"
echo "  2. Kopiere finalization/ ins Repo-Root (falls noch nicht erledigt)"
echo "  3. Ergänze CLAUDE.md (lies finalization/phase5_scale/CLAUDE_MD_ADDENDUM.md)"
echo "  4. Commit: git add .claude/ && git commit -m 'feat: add claude learning loop'"
echo "  5. Starte Claude Code und gib: 'Lies CLAUDE.md und finalization/PHASES.md'"
echo ""
echo "Claude Code Start-Befehl Beispiel:"
echo "  'Lies CLAUDE.md und finalization/PHASES.md. Starte mit finalization/WAVE_00_baseline.md.'"
EOF