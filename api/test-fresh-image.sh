#!/bin/sh
# =============================================================================
# TempConnect — Frisch-Abbild-Test: traegt das Abbild, was es zum Starten braucht?
# =============================================================================
#
# DAS GEGENSTUECK ZU sql/test-fresh-install.sh, UND ES FEHLTE.
#
# Der Frisch-Installationslauf beweist den DATENBANKweg ab null: 231 Migrationen
# auf eine leere Postgres-Instanz, Schema-Pruefungen, PASS. Fuer das ABBILD gab
# es nichts Vergleichbares — und genau dort entstand am 2026-10-01 ein Befund:
# ein laufender Container brach mit
#
#   Cannot find package '/app/node_modules/express'
#
# ab, als er gegen das VORHANDENE Abbild neu erzeugt wurde (ohne --build). Da
# kein Mount ueber /app oder node_modules existiert, kann das nur heissen: jenes
# Abbild enthielt sie nicht.
#
# WAS DARAUS FOLGT - UND WAS NICHT. Es folgt KEIN Livegang-Blocker: auf einem
# frischen Host BAUT compose aus api/Dockerfile, und das Dockerfile installiert
# die Abhaengigkeiten beim Bauen (`RUN npm ci --omit=dev`, kein Install beim
# Start). Der Defekt war lokale ABDRIFT zwischen einem laufenden Abbild und dem
# Dockerfile, aus dem es einmal entstand.
#
# Es folgt aber: NICHTS PRUEFTE, OB DAS BENUTZTE ABBILD SEINEM DOCKERFILE
# ENTSPRICHT. Zwei Sitzungen haben an derselben Frage je eine halbe Antwort
# gemessen - eine am Container (der driftete), eine am Repo (das in Ordnung war) -
# und beide haetten die andere Haelfte fuer die ganze genommen. Dieses Skript
# beantwortet sie in einem Lauf.
#
# WAS ES TUT: es baut das Abbild FRISCH aus dem Dockerfile, unter einem
# Wegwerf-Namen, und prueft daran - nicht am laufenden Container. Ein `docker run
# --rm` legt eine frische Schicht auf das Abbild; was dort fehlt, fehlt wirklich
# im Abbild.
#
# WAS ES NICHT TUT: es startet keinen Server und braucht keine Datenbank. Die
# Frage ist allein, ob der Modul-Ladepfad traegt. Alles weitere beweist der
# Gesundheitspfad des echten Containers.
#
# Aufruf:  sh api/test-fresh-image.sh
# Erfolg:  Rueckgabewert 0 und "=== PASS ==="
#
# LAUFZEIT, gemessen am 2026-10-01: der Bau braucht auf Docker Desktop unter
# Windows UEBER ZEHN MINUTEN (npm ci), auch mit warmem Zwischenspeicher. Das ist
# kein Mangel des Skripts, sondern der Grund, warum es NICHT im Tor laeuft: ein
# Tor, das zehn Minuten kostet, wird uebersprungen. Vor einem Release ist es die
# zehn Minuten wert; bei jedem Commit prueft
# test/abbildIstSelbstgenuegsam.test.js die Eigenschaften des Dockerfiles in
# Millisekunden.
#
# ERSTER LAUF (2026-10-01): PASS. 242 Pakete, express/pg/ioredis/zod/pino laden
# aus dem Abbild, server.js loest alle Importe auf, test/ und scripts/ und docs/
# fehlen wie vorgesehen, Start-Skript ohne Installation.
# =============================================================================
set -e
export MSYS_NO_PATHCONV=1

ROT='\033[0;31m'; GRUEN='\033[0;32m'; BLAU='\033[0;36m'; AUS='\033[0m'
ok()    { printf "  ${GRUEN}[OK]${AUS}  %s\n" "$1"; }
tun()   { printf "  ${BLAU}[..]${AUS}  %s\n" "$1"; }
fehl()  { printf "  ${ROT}[FEHLER]${AUS}  %s\n" "$1"; MANGEL=$((MANGEL+1)); }

MANGEL=0
MARKE="tc_fresh_image_test:$$"

# WINDOWS / GIT BASH: `pwd` liefert hier /c/Users/… — ein Pfad, den der
# Docker-Dienst nicht aufloesen kann. Beim Bau-KONTEXT hilft MSYS_NO_PATHCONV=1
# NICHT: die Variable verhindert das Umschreiben von Argumenten, erzeugt aber
# keinen Windows-Pfad. Der erste Lauf dieses Skripts scheiterte genau daran
# ("unable to prepare context: path /c/... not found") — dieselbe Klasse, die am
# 2026-09-28 schon einen der vier Werkzeugfehler im Frisch-Installations-Tor
# ausmachte. `pwd -W` gibt in Git Bash C:/Users/…; auf Linux gibt es den Schalter
# nicht, dort ist `pwd` schon richtig.
HIER=$(cd "$(dirname "$0")" && { pwd -W 2>/dev/null || pwd; })

printf "${BLAU}=== TempConnect Frisch-Abbild-Test ===${AUS}\n\n"

if ! docker info >/dev/null 2>&1; then
  printf "${ROT}Docker ist nicht erreichbar — der Test kann nichts beweisen.${AUS}\n"
  printf "Ein uebersprungener Test, der wie Erfolg aussieht, ist schlimmer als keiner.\n"
  exit 2
fi

aufraeumen() { docker image rm -f "$MARKE" >/dev/null 2>&1 || true; }
trap aufraeumen EXIT INT TERM

# --- 1. Bauen, ausschliesslich aus dem Dockerfile -----------------------------
tun "Baue das Abbild frisch aus $HIER/Dockerfile (Wegwerf-Marke $MARKE) …"
if docker build -q -t "$MARKE" -f "$HIER/Dockerfile" "$HIER" >/dev/null; then
  ok "Bau erfolgreich."
else
  fehl "Der Bau schlaegt fehl. Dann kann kein frischer Host die API starten."
  printf "\n${ROT}=== FAIL ===${AUS}\n"; exit 1
fi

im_abbild() { docker run --rm --entrypoint sh "$MARKE" -c "$1" 2>/dev/null; }

# --- 2. Die Abhaengigkeiten liegen IM Abbild ----------------------------------
printf "\n${BLAU}--- Abhaengigkeiten${AUS}\n"
ANZ=$(im_abbild 'ls /app/node_modules 2>/dev/null | wc -l' || echo 0)
ANZ=$(printf '%s' "$ANZ" | tr -d ' \r\n')
if [ "${ANZ:-0}" -gt 50 ]; then
  ok "node_modules im Abbild: $ANZ Pakete."
else
  fehl "node_modules im Abbild: ${ANZ:-0} Pakete. Das Abbild bringt seine Abhaengigkeiten nicht mit."
fi

# --- 3. Der Ladepfad traegt wirklich -----------------------------------------
# Die Zahl allein genuegt nicht: ein halb entpacktes node_modules zaehlt auch.
# Geprueft werden die Pakete, ohne die server.js nicht laedt.
printf "\n${BLAU}--- Modul-Ladepfad${AUS}\n"
for PAKET in express pg ioredis zod pino; do
  if im_abbild "cd /app && node -e 'import(\"$PAKET\").then(()=>process.exit(0)).catch(()=>process.exit(1))'"; then
    ok "$PAKET laedt aus dem Abbild."
  else
    fehl "$PAKET laedt NICHT — genau der Fehler, der am 2026-10-01 auftrat."
  fi
done

# --- 4. Der Einstiegspunkt loest seine Importe auf ----------------------------
# KEIN Serverstart: server.js wird nur so weit geladen, dass alle statischen
# Importe aufgeloest sein muessen. Ein fehlendes Paket faellt hier auf, eine
# fehlende Datenbank nicht.
printf "\n${BLAU}--- Einstiegspunkt${AUS}\n"
if im_abbild 'test -f /app/server.js'; then
  ok "server.js liegt im Abbild."
else
  fehl "server.js fehlt im Abbild."
fi
PRUEF='cd /app && node --input-type=module -e "
  import(\"node:module\").then(async () => {
    try { await import(\"./server.js\"); process.exit(0); }
    catch (e) {
      const c = e && e.code;
      /* ERR_MODULE_NOT_FOUND und MODULE_NOT_FOUND heissen: ein Paket fehlt.
         Alles andere (Datenbank, Port, fehlende Umgebung) ist hier erlaubt —
         wir pruefen den Ladepfad, nicht den Betrieb. */
      if (c === \"ERR_MODULE_NOT_FOUND\" || c === \"MODULE_NOT_FOUND\") {
        console.error(\"FEHLENDES PAKET: \" + e.message);
        process.exit(3);
      }
      process.exit(0);
    }
  });
"'
set +e
im_abbild "$PRUEF" >/dev/null 2>&1
RC=$?
set -e
if [ "$RC" -eq 3 ]; then
  fehl "server.js findet beim Laden ein Paket nicht — das Abbild ist unvollstaendig."
else
  ok "server.js loest alle Importe auf (Rueckgabewert $RC; nur ein fehlendes Paket gilt als Mangel)."
fi

# --- 5. Was ABSICHTLICH nicht im Abbild liegt --------------------------------
# Ein benannter Nicht-Treffer: wer hier etwas "nachtraegt", traegt Testcode in
# die Produktion. Zugleich die Fundstelle fuer Punkt 13 beim Owner: weil
# scripts/ fehlt, kann `docker exec … npm run test:image` NICHT laufen.
printf "\n${BLAU}--- Absichtlich NICHT im Abbild (Produktionsabbild bleibt schlank)${AUS}\n"
for WEG in test scripts docs; do
  if im_abbild "test -d /app/$WEG"; then
    fehl "/app/$WEG liegt im Abbild — das Produktionsabbild traegt dann $WEG mit."
  else
    ok "/app/$WEG fehlt — so vorgesehen (api/.dockerignore)."
  fi
done
printf "         ${BLAU}Hinweis:${AUS} weil scripts/ fehlt, laeuft 'npm run test:image' NICHT im\n"
printf "         Container. Die Abbild-Suite gehoert auf den Host:\n"
printf "           cd api && node scripts/run-tests.js --suite=image\n"

# --- 6. Kein Install beim Start ----------------------------------------------
printf "\n${BLAU}--- Kein Install zur Laufzeit${AUS}\n"
START=$(im_abbild 'cd /app && node -e "console.log(require(\"./package.json\").scripts.start)"' || echo "")
case "$START" in
  *"npm install"*|*"npm ci"*|*"yarn"*|*"pnpm"*)
    fehl "Das Start-Skript installiert zur Laufzeit ($START). Dann haengt der Start am Netz." ;;
  "")
    fehl "Das Start-Skript ist im Abbild nicht lesbar." ;;
  *)
    ok "Start-Skript ohne Installation: $START" ;;
esac

# --- Ergebnis ----------------------------------------------------------------
printf "\n"
if [ "$MANGEL" -eq 0 ]; then
  printf "${GRUEN}=== PASS: Das Abbild traegt, was es zum Starten braucht. ===${AUS}\n"
  exit 0
fi
printf "${ROT}=== FAIL: %s Mangel/Maengel. ===${AUS}\n" "$MANGEL"
printf "Ein Abbild, das seine Abhaengigkeiten nicht mitbringt, startet auf einem\n"
printf "frischen Host nicht — und der Fehler erscheint erst dort.\n"
exit 1
