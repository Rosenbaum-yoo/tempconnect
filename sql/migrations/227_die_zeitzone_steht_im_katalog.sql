-- Migration 227: Die Zeitzone steht im Katalog, nicht auf dem Host (U6.7a)
-- =============================================================================
-- Lueckenschluss gegen eine BESTEHENDE Owner-Direktive, nicht neue Entscheidung:
-- "Living-Platform-Direktiven (Owner 2026-07-22): DACH-first Zeit. Alle Datums-/
--  Zeitwerte in Europe/Berlin, nie roher UTC-Slice ... zentrale todayDE()-Utility
--  (Server + Client) + TZ=Europe/Berlin im Container."
--
-- Der db-Dienst erfuellt diese Direktive heute NICHT.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- RUECKNAHME / ROLLBACK (zuerst, weil sie zur Zusage gehoert)
-- ═══════════════════════════════════════════════════════════════════════════
--
--   ALTER DATABASE tempconnect RESET timezone;
--
-- Danach erbt die Datenbank wieder die Zeitzone des Prozesses, also des Hosts -
-- der Zustand von vor dieser Migration. Nichts baut auf der Einstellung auf; sie
-- aendert nur, WAS CURRENT_DATE bedeutet. Eine Ruecknahme ist deshalb gefahrlos
-- und wirkt ab der naechsten Verbindung.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DER BEFUND, GEMESSEN AM 2026-10-01
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Ich wollte im Partner-Riegel (assignmentService, U6.7) CURRENT_DATE BEHALTEN,
-- mit der Begruendung: "die Direktive verlangt TZ=Europe/Berlin im Container,
-- also ist CURRENT_DATE das deutsche Datum". Dann nachgemessen statt geglaubt:
--
--   Laufende Datenbank   current_setting('TimeZone') = 'Europe/Berlin'   ✔
--   docker-compose.yml   TZ steht NUR am api-Dienst (Zeile 106), NICHT am db
--   sql/init.sql         nichts zur Zeitzone (80 Zeilen, geprueft)
--   alle Migrationen     keine SET timezone, kein ALTER DATABASE ... timezone
--
-- Das Europe/Berlin kommt also vom HOST: der Postgres-Container erbt die Zone der
-- Docker-VM, und die steht auf diesem Rechner auf Berlin. NICHTS IM REPO PINNT SIE.
--
-- Auf einem Hetzner-Server mit UTC - dem Standard, und das Ziel fuer den Livegang
-- im Dezember - liegt CURRENT_DATE nach 22 Uhr deutscher Zeit (23 Uhr im Sommer)
-- einen Tag zurueck. Der Fehler tritt nur abends auf: die unangenehmste Form,
-- weil er in jedem Tagtest gruen ist.
--
-- REICHWEITE, mit dem Haus-Scanner ueber den ganzen Korpus gemessen:
-- 57 Vorkommen in 18 Dateien, davon 0 mit ausdruecklicher Zone. Die dicksten:
-- workforceService (14), workerService (10), companyBlocklistService (6),
-- marktpraesenzService (4). Darunter zwei, die besonders wehtun:
-- assignmentService (der Partner-Riegel) und bindungSql (ein Wahrheitsmodul).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DIE MESSUNG HAT MEINEN BEFUND ZWEIMAL VERKLEINERT - beides gehoert hierher,
-- weil ein zu grosser Befund genauso teuer ist wie ein verschwiegener
-- ═══════════════════════════════════════════════════════════════════════════
--
-- (1) ICH HIELT DIE JS-SEITE FUER MITBETROFFEN. Ist sie nicht: todayDE() in
--     api/utils/dateDE.js baut sein Intl.DateTimeFormat mit
--     { timeZone: "Europe/Berlin" }, nennt die Zone also SELBST. Der eigene
--     Kommentar sagt es ausdruecklich: "unabhaengig von der Container-Zeitzone".
--     Das TZ am api-Dienst ist fuer Datumsrichtigkeit folglich gar nicht noetig.
--     Die Luecke ist AUSSCHLIESSLICH die SQL-Seite - dort gibt es kein todayDE(),
--     dort steht CURRENT_DATE, und das hat keinen solchen Schutz.
--
-- (2) ICH HIELT 'TZ FEHLT' IN DEN PROD-DATEIEN FUER EINE LUECKE. Ist keine:
--     docker-compose.prod.yml, .demo.yml, .prod.managed.yml, .managed.yml und
--     .ports-internal.yml sind OVERLAYS - sie ergaenzen Bruchstuecke (profiles,
--     ports, depends_on) zur Basisdatei. compose MISCHT environment-Abschnitte,
--     also traegt der api-Dienst sein TZ auch in Produktion. Es gibt genau EINE
--     echte db-Definition und EINE echte api-Definition, beide in
--     docker-compose.yml.
--
-- Bleibt als echter Befund: der db-Dienst in docker-compose.yml hat kein TZ, und
-- nichts pinnt die Zeitzone der DATENBANK. Genau das schliesst diese Migration.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WARUM AN DER WURZEL UND NICHT AN 57 AUFRUFSTELLEN
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 57 Stellen auf einen gebundenen todayDE()-Parameter umzuschreiben waere ein
-- Eingriff in 18 Dienste, jeder mit eigener Parameterliste und eigenen Proben -
-- viel Bewegung fuer einen Fehler, der EINE Ursache hat. Die Zone zu pinnen macht
-- alle 57 in einem Zug richtig und laesst den Code, wie er ist.
--
-- UND WARUM IM KATALOG, NICHT NUR ALS UMGEBUNGSVARIABLE: ein TZ am Dienst gilt
-- fuer den PROZESS. Wird der Container ohne compose gestartet, mit anderem
-- compose-Overlay, oder zeigt jemand die Anwendung auf eine Datenbank, die nicht
-- aus diesem compose kommt, ist die Variable weg. ALTER DATABASE schreibt die
-- Einstellung in pg_db_role_setting - sie ueberlebt Neustart, Neuaufsetzen des
-- Containers und jeden Verbindungsweg, weil sie an der DATENBANK haengt.
--
-- Beides wird gemacht, aber NICHT gleichwertig: diese Migration ist der Fix
-- (pg_db_role_setting wird beim Verbindungsaufbau angewandt und gewinnt damit
-- gegen die Prozess-Zeitzone), das TZ am db-Dienst ist Beiwerk - es richtet die
-- Containeruhr und die Zeitstempel der Logzeilen. Wer nur das TZ setzte, haette
-- die Zusage an eine compose-Datei gehaengt; wer nur migriert, haette deutsche
-- Daten im SQL und UTC in den Logs.
--
-- WAS DIESE MIGRATION NICHT TUT: sie aendert keine gespeicherten Werte. Spalten
-- vom Typ timestamptz speichern ohnehin absolut; betroffen ist nur, wie sie
-- ANGEZEIGT und wie CURRENT_DATE/localtime BERECHNET werden. Spalten vom Typ
-- timestamp (ohne Zone) tragen weiter, was hineingeschrieben wurde.
--
-- ZUSAETZLICH, NICHT STATTDESSEN: der Partner-Riegel bindet in U6.7 trotzdem
-- todayDE() als Parameter. Ein Riegel, der entscheidet, wem ein Einsatz gegeben
-- werden darf, soll nicht an einer Einstellung haengen, die jemand zuruecksetzen
-- kann. Dieselbe Haltung wie bei der Org-Grenze, die zweimal steht: in der Route
-- und im SQL.

BEGIN;

-- Die laufende Verbindung sofort, damit noch in dieser Transaktion gilt, was
-- danach dauerhaft gilt. SET LOCAL endet mit der Transaktion - genau richtig,
-- die Dauerhaftigkeit kommt aus dem ALTER DATABASE darunter.
SET LOCAL timezone = 'Europe/Berlin';

-- Dauerhaft an der Datenbank. current_database() statt eines festen Namens: der
-- Name kommt aus POSTGRES_DB und ist nicht ueberall 'tempconnect'.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone = %L', current_database(), 'Europe/Berlin');
END
$$;

COMMIT;

-- Nachweis fuer den Lesenden (wirkt ab der naechsten Verbindung):
--   docker exec tempconnect_db psql -U tempconnect -d tempconnect -tAc "SHOW TimeZone"
--     -> Europe/Berlin
--   SELECT CURRENT_DATE = (now() AT TIME ZONE 'Europe/Berlin')::date;   -> t
