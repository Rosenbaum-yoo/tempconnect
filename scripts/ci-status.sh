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
# Voraussetzung: `gh` installiert und angemeldet (`gh auth status`).
# Hinweis fuer den Fall, dass das Repo wieder auf privat gestellt wird: GitHub antwortet
# Nicht-Berechtigten dann mit 404, nicht mit "kein Zugriff" — ein Link, der nicht oeffnet,
# ist dann kein Fehler, sondern eine fehlende Anmeldung.
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
  echo "        (Ohne Anmeldung sieht man bei privaten Repos nichts, auch keinen Fehler.)" >&2
  exit 1
fi

# ── Zustand der Workflows ZUERST ─────────────────────────────────────────────
#
# LEHRE VOM 2026-07-26: `gh workflow list` verschweigt deaktivierte Workflows. Die Liste
# war leer, und ich habe daraus geschlossen, es sei keiner registriert — und danach lange
# im Dateiinhalt nach einem Fehler gesucht, der dort nicht war. Erst `--all` zeigte
# `CI  disabled_manually`. Ein deaktivierter Workflow erzeugt genau das verwirrende Bild:
# GitHub legt eine Lauf-Notiz an, fuehrt sie aber nie aus (startup_failure nach 0 s).
# Deshalb steht diese Pruefung jetzt an erster Stelle.
deaktiviert="$(gh workflow list --all 2>/dev/null | grep -iE 'disabled' || true)"
if [ -n "$deaktiviert" ]; then
  echo "!! BEFUND: Es gibt DEAKTIVIERTE Workflows — die fuehrt GitHub nie aus:"
  printf '   %s\n' "$deaktiviert"
  echo "   Einschalten: gh api -X PUT repos/<owner>/<repo>/actions/workflows/<ID>/enable"
  echo ""
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
        print("   startup_failure heisst: GitHub hat den Lauf angelegt, aber nie ausgefuehrt.")
        print("   Haeufigste Ursache: der Workflow ist DEAKTIVIERT (Pruefung oben) - dann gibt")
        print("   es gar keine Annotation, an der man etwas ablesen koennte.")
    print("   Naechster Schritt: gh run view <Lauf-ID>  -- fuehrt ein Lauf wirklich aus,")
    print("   steht der Grund unter ANNOTATIONS (etwa eine Kontosperre wegen Abrechnung).")
    print("   Bei 0-Sekunden-Laeufen fehlt diese Zeile.")
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
