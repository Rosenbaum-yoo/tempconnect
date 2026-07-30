#!/usr/bin/env bash
# secret-scan.sh — Sucht echte Geheimnisse im Arbeitsstand UND in der Versionsgeschichte.
#
# WARUM ES DIESES SKRIPT GIBT
# `docs/SECURITY-VERIFICATION.md` prueft mit ein paar grep-Befehlen den aktuellen Stand.
# Das ist die halbe Wahrheit: ein Geheimnis, das einmal committet war, bleibt in der
# Historie erreichbar, auch wenn die Datei laengst geaendert wurde. Genau das entscheidet
# darueber, ob ein Repository oeffentlich gemacht werden darf — Forks und Archive halten
# die Historie fest, sie ist nicht zurueckholbar.
#
# WAS ES UNTERSCHEIDET
# Der Bestand enthaelt rund fuenfzehn Platzhalter und Test-Fixtures wie
# `sk_live_DEIN_LIVE_SECRET_KEY` oder `SG.DEIN_API_KEY`. Wer nur auf das Praefix prueft,
# bekommt fuenfzehn Fehlalarme und schaltet das Skript ab. Deshalb wird das FORMAT
# geprueft: echte Schluessel dieser Anbieter enthalten Gross- UND Kleinbuchstaben und
# haben eine Mindestlaenge; die Platzhalter hier sind GROSSBUCHSTABEN mit Unterstrichen.
#
# Nutzung:
#   bash scripts/secret-scan.sh              # Arbeitsstand + Historie
#   SCOPE=worktree bash scripts/secret-scan.sh   # nur Arbeitsstand (schnell)
#
# Rueckgabewert: 0 = nichts gefunden. 1 = Fund, der Aufmerksamkeit braucht.

set -uo pipefail

SCOPE="${SCOPE:-all}"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

echo "Sammle Kandidaten ..."

# ── Arbeitsstand (getrackte Dateien; Untrackte gehen nie ins Repo) ───────────
#
# BEWUSST OHNE `HEAD`: mit Ref durchsucht `git grep` den *committeten* Stand. Ein
# Geheimnis, das gerade erst eingefuegt (und vielleicht schon vorgemerkt) ist, waere
# damit unsichtbar — genau der Moment, in dem man es noch verhindern kann. Ohne Ref
# liest `git grep` die Dateien auf der Platte und faengt beides.
# (Genau dieser Fehler steckte in der ersten Fassung; die Gegenprobe hat ihn gefunden.)
git grep -hoIE 'sk_(live|test)_[A-Za-z0-9]{8,}|whsec_[A-Za-z0-9]{8,}|SG\.[A-Za-z0-9_.-]{16,}|AKIA[A-Z0-9]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----' \
  2>/dev/null >> "$TMP" || true

# ── Historie (alle Refs, alle Diffs) ─────────────────────────────────────────
if [ "$SCOPE" != "worktree" ]; then
  echo "Durchsuche die Versionsgeschichte (kann eine Minute dauern) ..."
  for pat in 'sk_live_' 'sk_test_' 'whsec_' 'SG.' 'AKIA' 'PRIVATE KEY'; do
    git log --all -p -S"$pat" 2>/dev/null \
      | grep -hoIE 'sk_(live|test)_[A-Za-z0-9]{8,}|whsec_[A-Za-z0-9]{8,}|SG\.[A-Za-z0-9_.-]{16,}|AKIA[A-Z0-9]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----' \
      >> "$TMP" || true
  done
fi

# ── Bewertung ────────────────────────────────────────────────────────────────
sort -u "$TMP" | python -c '
import sys, re

def hat_beide_schreibweisen(s):
    return bool(re.search("[a-z]", s)) and bool(re.search("[A-Z]", s))

echt, platzhalter = [], []
# Eingabe defensiv lesen: Treffer koennen aus Dateien mit fremder Kodierung stammen und
# Bytes mitbringen, die eine Konsole (oder ein nachgeschaltetes grep) fuer binaer haelt.
# Ein Diagnosewerkzeug, dessen eigene Ausgabe unlesbar wird, hilft niemandem.
roh = sys.stdin.buffer.read().decode("utf-8", "replace")
for zeile in roh.splitlines():
    v = "".join(c for c in zeile if c.isprintable()).strip()
    if not v:
        continue

    if v.startswith("-----BEGIN"):
        echt.append((v, "privater Schluessel — gehoert NIE ins Repo"))
        continue

    if v.startswith(("sk_live_", "sk_test_")):
        rest = v.split("_", 2)[2]
        # Echte Stripe-Schluessel: 24+ Zeichen, gemischte Schreibweise.
        if len(rest) >= 24 and hat_beide_schreibweisen(rest):
            echt.append((v, "sieht wie ein echter Stripe-Schluessel aus"))
        else:
            platzhalter.append(v)
        continue

    if v.startswith("whsec_"):
        rest = v[len("whsec_"):]
        if len(rest) >= 24 and hat_beide_schreibweisen(rest):
            echt.append((v, "sieht wie ein echtes Stripe-Webhook-Secret aus"))
        else:
            platzhalter.append(v)
        continue

    if v.startswith("SG."):
        # Echtes SendGrid-Format: SG.<22>.<43>, gemischte Schreibweise.
        if v.count(".") >= 2 and len(v) >= 60 and hat_beide_schreibweisen(v):
            echt.append((v, "sieht wie ein echter SendGrid-Schluessel aus"))
        else:
            platzhalter.append(v)
        continue

    if v.startswith("AKIA"):
        rest = v[4:]
        if len(rest) == 16 and set(rest) != {"X"}:
            echt.append((v, "sieht wie ein echter AWS-Zugriffsschluessel aus"))
        else:
            platzhalter.append(v)
        continue

print("")
print("Platzhalter / Test-Fixtures (unbedenklich): %d" % len(platzhalter))
for v in sorted(platzhalter)[:20]:
    print("   %s" % v)

print("")
if echt:
    print("!! %d VERDACHT auf echte Geheimnisse:" % len(echt))
    for v, warum in echt:
        # Wert gekuerzt ausgeben: die Meldung soll das Geheimnis nicht erneut verbreiten.
        print("   %s...  (%s)" % (v[:12], warum))
    print("")
    print("ERGEBNIS: nicht in Ordnung. Jeden Treffer rotieren — aus der Historie ist er")
    print("          NICHT entfernbar. Hintergrund: docs/SECURITY-VERIFICATION.md")
    sys.exit(1)

print("ERGEBNIS: keine echten Anbieter-Geheimnisse gefunden.")
print("")
print("WICHTIG - was dieses Skript NICHT sieht:")
print("  * selbst erzeugte Secrets ohne erkennbares Format (SESSION_SECRET, JWT_SECRET,")
print("    ADMIN_SECRET, INTERNAL_CRON_SECRET). Die sehen aus wie Zufallsketten und sind")
print("    von Platzhaltern nicht unterscheidbar. Vor dem Oeffentlich-Schalten deshalb")
print("    ohnehin rotieren (P0.4 in docs/PILOT_GO_LIVE_TODOS.md).")
print("  * UUID-formatige Schluessel (z. B. Web3Forms). Ein Muster dafuer wuerde jede")
print("    Migrations-ID treffen. Der bekannte Fall ist in SECURITY-VERIFICATION.md notiert.")
'
