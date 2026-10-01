#!/usr/bin/env bash
# =============================================================================
# cloud-stand-holen.sh — den Stand der Cloud-Sitzung sicher in diesen Ordner holen
# =============================================================================
# Owner-Vorgabe (2026-10-01, woertlich): „und auch mergen in gewissen Abständen
# immer wenn etwas neues im frontend zu sehen wäre automatisch, damit ich lokal
# auch gucken kann"
#
# WAS ES TUT
#   1. Holt den Branch der Cloud-Sitzung (Standard: claude/zen-goldberg-w1oxw3).
#   2. Fuehrt ihn zusammen — zuerst als reines Vorspulen (--ff-only), sonst als
#      normales Zusammenfuehren. Nie mit Umschreibung von Historie.
#   3. Sagt, was sich geaendert hat und was jetzt zu tun ist, und zeigt den
#      Abschnitt „Neu sichtbar im Frontend" aus docs/UEBERGABE.md.
#   4. Mit --bauen zusaetzlich: Migrationen einspielen, API neu bauen, Staff-App
#      bauen — jeweils nur, wenn sich dort etwas geaendert hat (Docker).
#
# WAS ES NIE TUT
#   * zusammenfuehren, wenn im Ordner ungesicherte Aenderungen liegen — dann
#     arbeitet K1 gerade. Ungetrackte Dateien (Geschaeftsunterlagen) zaehlen nicht.
#   * zusammenfuehren, waehrend ein Testlauf ueber den Baum geht. Jeder Lauf von
#     api/scripts/run-tests.js legt dafuer selbst eine Marke ab (Eiserne Regel
#     „Ein volles Tor ueber einen Baum, an dem zwei schreiben, beweist nichts";
#     Begruendung in api/scripts/lib/torMarke.mjs). Fuer andere lange Laeufe
#     (E2E, Mutation) legt man sie von Hand:
#       touch "$(git rev-parse --git-path tor-laeuft-hand)"   ... und danach rm
#   * einen Konflikt hinterlassen: kracht es, wird abgebrochen und alles bleibt,
#     wie es war. Das Zusammenfuehren macht dann K1 von Hand.
#   * pushen. Es holt nur.
#
# AUFRUF (unter Windows in „Git Bash" — oder per Doppelklick auf
# scripts/dev/cloud-stand-holen.cmd, siehe dort)
#   bash scripts/dev/cloud-stand-holen.sh                  einmal holen und anzeigen
#   bash scripts/dev/cloud-stand-holen.sh --bauen          dazu Migrationen/API/Staff-App
#   bash scripts/dev/cloud-stand-holen.sh --wiederholen 30 alle 30 Minuten (Fenster offen lassen)
# =============================================================================
set -uo pipefail

BRANCH="${CLOUD_BRANCH:-claude/zen-goldberg-w1oxw3}"
REMOTE="${CLOUD_REMOTE:-origin}"
TOR_VERFALL_MIN=120   # aelter = verwaiste Marke (Absturz); kein Lauf dauert so lang
BAUEN=0
WIEDERHOLEN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --bauen) BAUEN=1 ;;
    --wiederholen)
      if [ $# -gt 1 ] && [ "${2#-}" = "$2" ]; then shift; WIEDERHOLEN="$1"; else WIEDERHOLEN=30; fi
      case "$WIEDERHOLEN" in ''|*[!0-9]*|0) echo "--wiederholen braucht Minuten als Zahl, z. B. --wiederholen 30"; exit 2 ;; esac ;;
    -h|--help) sed -n '2,37p' "$0"; exit 0 ;;
    *) echo "Unbekannte Angabe: $1 (siehe --help)"; exit 2 ;;
  esac
  shift
done

# Vom eigenen Ort aus den Projektordner finden — so laeuft es auch aus der
# Windows-Aufgabenplanung oder per Doppelklick, egal wo das Fenster startet.
cd "$(dirname "$0")" 2>/dev/null || { echo "Skriptordner nicht erreichbar."; exit 2; }
WURZEL="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "Kein Git-Ordner — liegt das Skript im Projekt?"; exit 2; }
cd "$WURZEL" || exit 2

zeit() { date "+%d.%m.%Y %H:%M"; }

zeige_neu_sichtbar() {
  # Der Abschnitt aus der Uebergabe, ohne die Routine darunter. Faellt die
  # Routine-Zeile einmal weg, endet er an der naechsten Ueberschrift — nie
  # zweitausend Zeilen Uebergabe im Fenster.
  awk '/^### Neu sichtbar im Frontend/{an=1; print; next} an && (/^\*\*K1-Routine/ || /^#/){exit} an' docs/UEBERGABE.md 2>/dev/null
}

# Liegt eine frische Tor-Marke? 0 = ein Testlauf geht ueber den Baum, 1 = frei,
# 2 = unklar. Unklar heisst nicht frei: erwischt die Suche einmal das falsche
# `find` (Windows' find.exe statt GNU), meldet sie einen Fehler statt eines
# leeren Ergebnisses — und das Skript haelt sich dann zurueck, statt mitten in
# einen Lauf hinein zusammenzufuehren.
tor_laeuft() {
  local ordner treffer
  ordner="$(dirname "$(git rev-parse --git-path tor-laeuft-x)")" || return 2
  treffer="$(find "$ordner" -maxdepth 1 -name 'tor-laeuft-*' -mmin "-$TOR_VERFALL_MIN" 2>/dev/null)" || return 2
  [ -n "$treffer" ]
}

# Bauen, was noetig ist — und was beim letzten Mal liegen blieb. Typischer Fall:
# beim Anmelden laeuft Docker Desktop noch nicht. Ohne Merkzettel wuerde der
# naechste Lauf „Nichts Neues" sagen, und die Oberflaeche liefe gegen eine alte
# API (neue Seiten, 404 auf neue Wege). Deshalb steht Offenes in
# .git/cloud-stand-offen und wird bei jedem Lauf mit --bauen nachgeholt.
# Gebaut wird nur ueber einen sauberen Baum (die Pruefungen in lauf_innen gehen
# voraus) — sonst landete K1s halbe Arbeit im API-Abbild.
bauen() {
  local gewuenscht="$1" datei schritte="" rest="" s
  datei="$(git rev-parse --git-path cloud-stand-offen)"
  [ -f "$datei" ] && gewuenscht="$gewuenscht $(cat "$datei")"
  for s in migrate api staff; do
    case " $gewuenscht " in *" $s "*) schritte="$schritte $s" ;; esac
  done
  [ -z "$schritte" ] && return 0
  if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
    echo "$schritte" > "$datei"
    echo "  Docker laeuft nicht — Bauen folgt beim naechsten Lauf:$schritte"
    return 0
  fi
  for s in $schritte; do
    case "$s" in
      migrate)
        echo "  Migrationen einspielen ..."
        docker compose run --rm migrate 2>&1 | tail -n 3 || rest="$rest migrate" ;;
      api)
        # Ohne die neuen Tabellen liefe die neue API ins Leere — dann wartet sie mit.
        case " $rest " in *" migrate "*) rest="$rest api"; continue ;; esac
        echo "  API neu bauen ..."
        docker compose up -d --build api 2>&1 | tail -n 3 || rest="$rest api" ;;
      staff)
        echo "  Staff-App bauen ..."
        docker compose run --rm frontend-build 2>&1 | tail -n 3 || rest="$rest staff" ;;
    esac
  done
  if [ -n "$rest" ]; then
    echo "$rest" > "$datei"
    echo "  Nicht geklappt:$rest — wird beim naechsten Lauf wiederholt."
  else
    rm -f "$datei"
    echo "  Gebaut:$schritte — Browser neu laden."
  fi
}

lauf() {
  echo "[$(zeit)] Cloud-Stand pruefen ($REMOTE/$BRANCH) ..."

  local sperre
  sperre="$(git rev-parse --git-path cloud-stand-sperre)"
  if ! sperre_nehmen "$sperre"; then
    echo "  Laeuft schon in einem anderen Fenster — nichts angefasst."
    return 0
  fi
  trap 'rm -rf "$sperre"; exit 130' INT TERM HUP PIPE
  lauf_innen
  local rc=$?
  rm -rf "$sperre"
  trap - INT TERM HUP PIPE
  return $rc
}

# Nie zweimal gleichzeitig (Schleife + Doppelklick). mkdir ist atomar; darin
# steht, wer die Sperre haelt. Lebt der nicht mehr (Fenster geschlossen), wird
# sie uebernommen — sonst hiesse es nach jedem Schliessen eine Stunde lang
# „laeuft schon".
sperre_nehmen() {
  local sperre="$1" halter
  [ -n "$sperre" ] || return 1
  if mkdir "$sperre" 2>/dev/null; then echo $$ > "$sperre/pid"; return 0; fi
  halter="$(cat "$sperre/pid" 2>/dev/null || true)"
  if [ -n "$halter" ]; then
    kill -0 "$halter" 2>/dev/null && return 1
  elif [ -z "$(find "$sperre" -maxdepth 0 -mmin +5 2>/dev/null)" ]; then
    return 1   # gerade erst angelegt, Halter schreibt noch
  fi
  rm -rf "$sperre"
  mkdir "$sperre" 2>/dev/null || return 1
  echo $$ > "$sperre/pid"
}

lauf_innen() {
  local gitdir
  gitdir="$(git rev-parse --git-dir)"
  if [ -f "$gitdir/MERGE_HEAD" ] || [ -d "$gitdir/rebase-merge" ] || [ -d "$gitdir/rebase-apply" ]; then
    echo "  Hier laeuft gerade ein Zusammenfuehren oder Umbasieren — nichts angefasst."
    return 0
  fi
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    echo "  Ungesicherte Aenderungen im Ordner — K1 arbeitet gerade. Nichts angefasst."
    return 0
  fi
  tor_laeuft
  case $? in
    0) echo "  Ein Testlauf geht gerade ueber den Baum — nichts angefasst, naechster Lauf."; return 0 ;;
    2) echo "  Kann nicht pruefen, ob ein Testlauf laeuft — sicherheitshalber nichts angefasst."; return 1 ;;
  esac

  if ! git fetch --quiet "$REMOTE" "$BRANCH"; then
    echo "  Holen fehlgeschlagen (Netz?). Naechster Versuch beim naechsten Lauf."
    return 1
  fi
  local neu alt
  neu="$(git rev-parse FETCH_HEAD)"
  alt="$(git rev-parse HEAD)"
  if git merge-base --is-ancestor "$neu" HEAD; then
    echo "  Nichts Neues — dieser Ordner hat den Cloud-Stand schon."
    [ "$BAUEN" = "1" ] && bauen ""
    return 0
  fi

  local meldung
  if git merge --ff-only --quiet "$neu" 2>/dev/null; then
    echo "  Vorgespult auf $(git rev-parse --short HEAD)."
  elif meldung="$(git merge --no-edit --quiet -m "Merge Cloud-Stand $REMOTE/$BRANCH ($(git rev-parse --short "$neu"))" "$neu" 2>&1)"; then
    echo "  Zusammengefuehrt (eigene Commits hier + Cloud-Stand): $(git rev-parse --short HEAD)."
  elif [ -f "$gitdir/MERGE_HEAD" ]; then
    git merge --abort >/dev/null 2>&1
    echo "  KONFLIKT — abgebrochen, alles ist wie vorher. Das Zusammenfuehren macht K1 von Hand."
    return 1
  else
    # Kein Konflikt: Git hat gar nicht erst angefangen (z. B. laege eine
    # ungetrackte Datei im Weg, oder K1 committet genau in diesem Augenblick).
    echo "  Zusammenfuehren nicht begonnen — nichts veraendert. Git sagt:"
    printf '%s\n' "$meldung" | head -n 5 | sed 's/^/    /'
    return 1
  fi

  local geaendert
  geaendert="$(git diff --name-only "$alt" HEAD)"
  local seiten staff migr api
  seiten="$(printf '%s\n' "$geaendert" | grep -c '^frontend/public/' || true)"
  staff="$(printf '%s\n' "$geaendert" | grep -c '^frontend/src/' || true)"
  migr="$(printf '%s\n' "$geaendert" | grep '^sql/migrations/[0-9].*\.sql$' || true)"
  api="$(printf '%s\n' "$geaendert" | grep -c '^api/' || true)"

  echo "  Geaendert: $(printf '%s\n' "$geaendert" | grep -c . || true) Dateien."
  [ "$seiten" -gt 0 ] && echo "  - Oberflaeche ($seiten Dateien): sofort sichtbar, Browser neu laden."
  [ "$staff" -gt 0 ]  && echo "  - Staff Control Center / OCC ($staff Dateien): Bau noetig (npm run build:scc bzw. --bauen)."
  [ -n "$migr" ]      && echo "  - Neue Migrationen:" && printf '      %s\n' $migr && echo "    einspielen: docker compose run --rm migrate  (bzw. --bauen)"
  [ "$api" -gt 0 ]    && echo "  - Server ($api Dateien): API neu bauen: docker compose up -d --build api  (bzw. --bauen)"

  if [ "$BAUEN" = "1" ]; then
    local noetig=""
    [ -n "$migr" ]     && noetig="$noetig migrate"
    [ "$api" -gt 0 ]   && noetig="$noetig api"
    [ "$staff" -gt 0 ] && noetig="$noetig staff"
    bauen "$noetig"
  fi

  echo
  zeige_neu_sichtbar
  return 0
}

if [ "$WIEDERHOLEN" != "0" ]; then
  echo "Laeuft alle $WIEDERHOLEN Minuten. Beenden mit Strg+C oder Fenster schliessen."
  while true; do
    lauf
    sleep "$((WIEDERHOLEN * 60))"
  done
else
  lauf
fi
