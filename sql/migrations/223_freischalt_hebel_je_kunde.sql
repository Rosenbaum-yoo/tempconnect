-- Migration 223: Der Freischalt-Hebel je Kunde — Nachtrag zu 059 (Welle Z, Z4)
-- =============================================================================
-- DIES IST EINE REPARATUR, KEINE NEUE TABELLE. Der Unterschied ist der ganze
-- Inhalt dieses Kopfes.
--
-- `059_feature_overrides.sql` LIEGT im Verzeichnis, legt `feature_overrides` an
-- und ist in `_migrations` ALS ANGEWANDT VERBUCHT. Die Tabelle existiert
-- trotzdem nicht (gemessen am 2026-09-27).
--
-- WIE DAS PASSIEREN KONNTE, ist bekannt und steht in `sql/migrate.sh`: VOR
-- `ON_ERROR_STOP=1` wurden fehlgeschlagene Migrationen faelschlich als
-- angewandt eingetragen. 059 ist also gelaufen, gescheitert — und trotzdem
-- abgehakt worden. Das Werkzeug ist laengst reparariert; die falsche Buchung
-- steht bis heute, und `migrate.sh` wird 059 deshalb nie wieder anfassen.
--
-- Eine gebuchte Migration ist ein Versprechen. Hier ist es gebrochen, und der
-- einzige Weg zurueck ist ein Nachtrag unter neuer Nummer: 059 selbst
-- umzuschreiben waere wirkungslos (die Buchung bleibt), und die Buchung von Hand
-- zu loeschen hiesse, in einem Protokoll zu radieren.
--
-- WAS DAS GEKOSTET HAT: `featureOverrideService` liest, schreibt und loescht die
-- Tabelle; die Admin-Flaeche fuehrt dazu eine fertige Liste mit Grund, Verfall
-- und Loeschknopf (`adminPanel.js`); drei Routen sind verdrahtet und auditiert.
-- Jeder Aufruf endete in einer 500 — die Flaeche zeigte "nicht verfuegbar".
--
-- UND DAS WAR NICHT DER SCHLIMMSTE TEIL. Der einzige Verbraucher,
-- `dealStaffingFastTrackService.isStaffingFastTrackEnabled`, fing den Wurf in
-- einem LEEREN catch und gab danach `true` zurueck. Ein Owner, der die Funktion
-- fuer EINEN Kunden abschaltete, hat nichts abgeschaltet, und nichts hat ihm
-- widersprochen. Ein Hebel, der sich bedienen laesst und nichts tut, ist
-- schlimmer als ein fehlender: man verlaesst sich auf ihn.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WARUM NACHTRAGEN UND NICHT ENTFERNEN — die Schichten sind gemessen
-- ═══════════════════════════════════════════════════════════════════════════
--
-- In derselben Welle ist zweimal das Gegenteil entschieden worden (Z2: die
-- Unterschrift am Stundenzettel wurde ENTFERNT, weil die Wahrheit anderswo
-- vollstaendiger stand). Hier traegt die Messung die andere Richtung. Die
-- Funktionsrechte dieses Projekts haben fuenf Schichten:
--
--   1. Code-Vorgabe je Plan            `config/planFeatures.js`          da
--   2. Abweichung je Org-TYP           `plan_grenze_je_orgtyp` (M1.8)    da
--   3. Gewaehrung je Kunde (gekauft)   `org_active_addons`               da
--   4. AUSNAHME je Kunde (entschieden) `feature_overrides`               FEHLTE
--   5. Notschalter plattformweit       `staff_control_feature_flags`     da
--
-- Schicht 5 ist ausdruecklich NICHT dasselbe: sie hat keinen `org_id`, ihr
-- Primaerschluessel ist `flag_key`, und ihre fuenf Zeilen schalten die GANZE
-- Plattform (read-only, Wartungsbanner, keine neuen Angebote, Notdienst
-- manuell, Registrierung aus). Schicht 3 kann nur GEBEN und beschreibt einen
-- Kauf. Schicht 4 beantwortet die Frage, die sonst niemand beantwortet: "dieser
-- eine Kunde bekommt es — oder bekommt es nicht — weil wir es entschieden haben,
-- mit Begruendung und Verfallsdatum." Das ist die Owner-Frage nach
-- `docs/FLAECHEN.md` und die Tier-3-Schicht der Config-Taxonomie (CLAUDE.md,
-- Erkenntnis 2026-06-03).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DER AUFBAU IST DER VON 059 — ABSICHTLICH, BIS AUF EINE ZEILE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Die erste Fassung dieses Nachtrags hatte `id UUID`, weil das die Bauart der
-- juengeren Tabellen ist. Das war FALSCH, und der Fehler ist lehrreich: 059
-- definiert `id SERIAL`, und der ganze vorhandene Code rechnet damit — die
-- Loeschroute liest `parseInt(req.params.id)`, die Proben reichen `id: 7`. Eine
-- abweichende Bauart haette nicht eine Tabelle nachgetragen, sondern eine ZWEITE
-- Definition derselben Tabelle geschaffen und den vorhandenen Code gebrochen.
-- Ein Nachtrag hat sich nach dem zu richten, was er nachtraegt.
--
-- DIE EINE ABWEICHUNG, MIT GRUND: `UNIQUE(org_id, feature_key)` aus 059 wird zu
-- einem eindeutigen Index MIT `NULLS NOT DISTINCT`.
--
--   `upsertOverride` schreibt `ON CONFLICT (org_id, feature_key)`. Ein GLOBALER
--   Eintrag hat `org_id IS NULL` — und in einem gewoehnlichen UNIQUE gelten zwei
--   NULL als VERSCHIEDEN. Der Konflikt waere also nie erkannt worden: jedes
--   Speichern eines globalen Hebels haette eine WEITERE Zeile angelegt, und
--   `checkOverride` nimmt mit `LIMIT 1` eine davon — welche, entscheidet der
--   Planer. Ein Hebel, der nach dem dritten Umstellen zufaellig antwortet.
--   059 traegt diesen Fehler; er ist nie aufgefallen, weil die Tabelle fehlte.
--
--   `NULLS NOT DISTINCT` gibt es ab PostgreSQL 15 (hier laeuft 16.12). Damit ist
--   NULL fuer die Eindeutigkeit ein Wert wie jeder andere, der Konflikt greift,
--   und ein globaler Hebel bleibt EINE Zeile, die man ueberschreibt.
--
-- DIE ZWEITE ABWEICHUNG, MIT GRUND: eine Regel gegen den leeren Schluessel.
-- 059 laesst `feature_key = '   '` zu (`VARCHAR(100) NOT NULL` prueft nur, dass
-- etwas dasteht). Die Route wies bisher nur `''` ab. Ein Hebel auf Leerzeichen
-- stuende in der Liste, sperrte den echten Schluessel nicht und waere nicht
-- wiederzufinden — und weil `checkOverride` am Schluessel sucht, wirkte er nie.
-- Die Regel steht in der Datenbank UND die Route trimmt: Schutz durch Struktur,
-- nicht durch Aufmerksamkeit (CLAUDE.md, "das Team ist eine Person").
--
-- `CREATE TABLE IF NOT EXISTS`: sollte die Tabelle in einer anderen Umgebung
-- doch stehen (059 lief dort), aendert dieser Nachtrag dort nur Index und Regel —
-- und genau die sind auch dort falsch.
--
-- ROLLBACK / RUECKNAHME:
--   DROP INDEX IF EXISTS feature_overrides_org_key_uidx;
--   -- und, NUR wenn die Tabelle auch vor 223 nicht existierte:
--   DROP TABLE IF EXISTS feature_overrides;
--   -- Ausnahmen verfallen damit; der Plan gilt wieder unveraendert fuer alle.
-- =============================================================================

SET client_min_messages TO WARNING;

BEGIN;

-- Wortlaut aus 059, damit beide Wege dieselbe Tabelle beschreiben.
CREATE TABLE IF NOT EXISTS feature_overrides (
  id            SERIAL PRIMARY KEY,
  -- NULL = gilt global (Rueckfall, wenn es keine Zeile fuer die Org gibt).
  org_id        UUID REFERENCES organizations(id) ON DELETE CASCADE,
  feature_key   VARCHAR(100) NOT NULL,
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  -- Der Grund ist nicht Zierde: eine Ausnahme ohne Begruendung ist in drei
  -- Monaten nicht mehr entscheidbar. Die Flaeche fragt ihn ab.
  reason        TEXT,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Verfall statt Dauerzustand (CLAUDE.md, "das Team ist eine Person").
  expires_at    TIMESTAMPTZ
);

-- Falls 059 in einer Umgebung gelaufen ist: dort steht der alte UNIQUE, und er
-- ist der Fehler. Er wird durch den NULLS-NOT-DISTINCT-Index ersetzt.
ALTER TABLE feature_overrides DROP CONSTRAINT IF EXISTS feature_overrides_org_id_feature_key_key;

-- Siehe Kopf: ohne NULLS NOT DISTINCT greift ON CONFLICT beim globalen Hebel
-- nicht und die Zeilen vermehren sich stumm.
CREATE UNIQUE INDEX IF NOT EXISTS feature_overrides_org_key_uidx
  ON feature_overrides (org_id, feature_key) NULLS NOT DISTINCT;

-- Aus 059 uebernommen: der Lesepfad sucht am Schluessel, nicht an der Org.
CREATE INDEX IF NOT EXISTS idx_feature_overrides_org ON feature_overrides(org_id);
CREATE INDEX IF NOT EXISTS idx_feature_overrides_key ON feature_overrides(feature_key);

-- Zweite Abweichung von 059, siehe Kopf: ein Schluessel aus Leerzeichen ist ein
-- Hebel, den niemand wiederfindet und der nie wirkt.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'feature_overrides'::regclass
       AND conname = 'feature_overrides_key_nicht_leer'
  ) THEN
    ALTER TABLE feature_overrides
      ADD CONSTRAINT feature_overrides_key_nicht_leer
      CHECK (length(btrim(feature_key)) > 0);
  END IF;
END $$;

COMMENT ON TABLE feature_overrides IS
  'Z4/059: Schicht 4 der Funktionsrechte - die entschiedene AUSNAHME je Kunde (mit Grund und Verfall). Nicht zu verwechseln mit staff_control_feature_flags (plattformweiter Notschalter) oder org_active_addons (gekaufte Gewaehrung).';
COMMENT ON COLUMN feature_overrides.org_id IS
  'NULL = global. Die Eindeutigkeit behandelt NULL als Wert (NULLS NOT DISTINCT), damit ON CONFLICT auch den globalen Hebel trifft - 059 hatte hier ein gewoehnliches UNIQUE und damit einen stummen Vermehrungsfehler.';

COMMIT;
