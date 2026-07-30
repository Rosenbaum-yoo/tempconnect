#!/usr/bin/env bash
# ci-status.sh — Beantwortet in fuenf Sekunden: laeuft die CI ueberhaupt?
#
# WARUM ES DIESES SKRIPT GIBT
# Am 2026-07-26 stellte sich heraus: von 62 Laeufen der gesamten Repo-Historie waren
# ALLE 62 `startup_failure`. Es gab nie einen erfolgreichen Lauf — und niemand hatte es
# gemerkt, weil man dafuer in der GitHub-Weboberflaeche haette nachsehen muessen. Die
# Dokumentation sprach die ganze Zeit von "6-Job-CI" und "CI gruen".
#
# Eine Blindstelle, die man nur durch Hinsehen findet, findet man nicht. Also ein Befehl.
#
# Nutzung:
#   bash scripts/ci-status.sh
#
# Voraussetzung: `gh` installiert und angemeldet (`gh auth status`). Das Repo ist privat —
# ohne Anmeldung antwortet GitHub mit 404, nicht mit "kein Zugriff".
#
# Rueckgabewert: 0 = es gibt mindestens einen erfolgreichen Lauf UND der letzte Lauf ist
# juenger als MAX_AGE_DAYS. Sonst 1 — damit das Skript auch als Gate taugt.

set -uo pipefail

MAX_AGE_DAYS="${MAX_AGE_DAYS:-14}"
LIMIT="${LIMIT:-100}"
export MAX_AGE_DAYS

if ! command -v gh >/dev/null 2>&1; then
  echo "FEHLER: 'gh' ist nicht installiert. https://cli.github.com/" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "FEHLER: 'gh' ist nicht angemeldet. 'gh auth login' ausfuehren." >&2
  echo "        (Das Repo ist privat — ohne Anmeldung sieht man nichts, auch keinen Fehler.)" >&2
  exit 1
fi

runs="$(gh run list --limit "$LIMIT" --json conclusion,createdAt,event,headBranch 2>/dev/null)"
if [ -z "$runs" ] || [ "$runs" = "[]" ]; then
  echo "BEFUND: Es existiert KEIN einziger CI-Lauf."
  echo "        Entweder wurde noch nie einer ausgeloest, oder GitHub erzeugt keine."
  echo "        Naechster Schritt: Actions-Tab in der Weboberflaeche + Settings -> Billing."
  exit 1
fi

# Auswertung in Python: jq ist nicht ueberall vorhanden, und Datumsrechnung in Bash ist
# unter Git-Bash/Windows unzuverlaessig.
printf '%s' "$runs" | python -c '
import json, sys, os, collections, datetime

runs = json.load(sys.stdin)
counts = collections.Counter(r["conclusion"] or "laeuft noch" for r in runs)
newest = max(runs, key=lambda r: r["createdAt"])
erfolge = [r["createdAt"] for r in runs if r["conclusion"] == "success"]

stand = newest["createdAt"]
event = newest["event"]
branch = newest["headBranch"]

print("Betrachtete Laeufe : %d" % len(runs))
print("Ergebnisse         : " + ", ".join("%s=%d" % kv for kv in counts.most_common()))
print("Letzter Lauf       : %s  (%s auf %s)" % (stand, event, branch))

jetzt = datetime.datetime.now(datetime.timezone.utc)
alter = (jetzt - datetime.datetime.fromisoformat(stand.replace("Z", "+00:00"))).days
grenze = int(os.environ.get("MAX_AGE_DAYS", "14"))
probleme = []

if not erfolge:
    print("")
    print("!! BEFUND: In den betrachteten Laeufen ist KEIN EINZIGER erfolgreich.")
    if counts.get("startup_failure"):
        print("   Alle/viele enden mit startup_failure - GitHub konnte den Workflow nicht")
        print("   einmal aufbauen. Die Ursache steht NUR in der Weboberflaeche, nicht in der API.")
        print("   Pruefen: Actions-Tab -> Lauf oeffnen; dann Settings -> Billing (aufgebrauchte")
        print("   Minuten bei privaten Repos erzeugen genau dieses Bild).")
    probleme.append("kein erfolgreicher Lauf")
else:
    print("Letzter Erfolg     : %s" % max(erfolge))

if alter > grenze:
    print("")
    print("!! BEFUND: Der letzte Lauf ist %d Tage alt (Grenze: %d)." % (alter, grenze))
    print("   Es wurde seither gepusht, ohne dass die CI etwas geprueft hat.")
    probleme.append("letzter Lauf %d Tage alt" % alter)

print("")
if probleme:
    print("ERGEBNIS: nicht in Ordnung - " + "; ".join(probleme))
    print("Hintergrund und Owner-Schritte: docs/PILOT_GO_LIVE_TODOS.md, Abschnitt 1.")
    sys.exit(1)
print("ERGEBNIS: in Ordnung.")
'
