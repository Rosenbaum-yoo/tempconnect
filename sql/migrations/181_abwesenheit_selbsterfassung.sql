-- =============================================================================
-- 181 — Abwesenheit: wer hat gemeldet, und gilt sie schon?
--
-- WELLE G1 der Spur G (docs/features/G_ABWESENHEIT_SELBSTERFASSUNG.md)
--
-- WARUM DIESE MIGRATION
-- `worker_absences` (Mig 177) kennt bisher nur `erfasst_von` — eine Nutzer-ID.
-- Damit laesst sich NICHT beantworten, was ab jetzt taeglich zaehlt: Hat der
-- Disponent das eingetragen, oder hat der Mensch sich selbst gemeldet? Die
-- Nutzer-ID allein sagt es nicht: derselbe Mensch kann beide Rollen haben, und
-- bei Profilen ohne Konto ist sie leer.
--
-- Das ist kein Schoenheitsfehler. An dieser Unterscheidung haengen drei Dinge:
--   * Die Oberflaeche im Buero muss Selbstmeldungen hervorheben — sie sind neu
--     und verlangen eine Entscheidung.
--   * Der Kunde wird nur bei Ausfaellen benachrichtigt, nicht bei jeder
--     nachtraeglichen Korrektur des Disponenten.
--   * Die Antragspflicht (unten) gilt NUR fuer Selbstmeldungen.
--
-- OWNER-ENTSCHEIDUNGEN, DIE HIER LANDEN (G-E1, G-E2)
--   G-E1: Eine Selbstmeldung ist SOFORT WIRKSAM, nicht erst nach Freigabe. Wer
--         krank ist, ist krank; der Disponent korrigiert, er genehmigt nicht.
--   G-E2: Es muss trotzdem umstellbar sein — je Zeitarbeitsfirma, ohne dass
--         jemand Code aendert. Deshalb ein Schalter in org_settings und ein
--         Zustand an der Abwesenheit, nicht ein zweiter Ablauf im Code.
--
-- WARUM DER ZUSTAND AN DER ZEILE HAENGT UND NICHT AM SCHALTER
-- Der Schalter kann sich aendern, waehrend Meldungen offen sind. Eine Abwesenheit
-- muss sagen koennen, ob SIE gilt — unabhaengig davon, wie die Firma heute
-- eingestellt ist. Sonst wuerde das Umlegen des Schalters rueckwirkend Meldungen
-- gueltig oder ungueltig machen, die laengst disponiert sind.
-- =============================================================================

-- ── A) Wer hat gemeldet ──────────────────────────────────────────────────────

ALTER TABLE worker_absences
  ADD COLUMN IF NOT EXISTS quelle TEXT NOT NULL DEFAULT 'disponent';

-- Bestand ist per Definition vom Disponenten: vor dieser Migration gab es keinen
-- anderen Weg. Der DEFAULT bildet das ab und bleibt danach die sichere Annahme.
ALTER TABLE worker_absences
  DROP CONSTRAINT IF EXISTS worker_absences_quelle_chk;
ALTER TABLE worker_absences
  ADD CONSTRAINT worker_absences_quelle_chk
    CHECK (quelle IN ('disponent', 'mitarbeiter'));

-- ── B) Gilt sie schon? ───────────────────────────────────────────────────────

ALTER TABLE worker_absences
  ADD COLUMN IF NOT EXISTS zustand TEXT NOT NULL DEFAULT 'wirksam';

ALTER TABLE worker_absences
  DROP CONSTRAINT IF EXISTS worker_absences_zustand_chk;
ALTER TABLE worker_absences
  ADD CONSTRAINT worker_absences_zustand_chk
    CHECK (zustand IN ('wirksam', 'beantragt', 'abgelehnt'));

-- Eine ABGELEHNTE Meldung darf die Belegschaftstafel nicht mehr beeinflussen,
-- ist aber kein geloeschter Datensatz — sie bleibt als Vorgang nachvollziehbar.
-- Wer sie ablehnt und warum, gehoert festgehalten.
ALTER TABLE worker_absences
  ADD COLUMN IF NOT EXISTS entschieden_von UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE worker_absences
  ADD COLUMN IF NOT EXISTS entschieden_am TIMESTAMPTZ;
ALTER TABLE worker_absences
  ADD COLUMN IF NOT EXISTS entscheidung_grund TEXT;

-- Eine Entscheidung ohne Entscheider ist keine. Die DB haelt das fest, damit es
-- nicht davon abhaengt, welcher Codepfad gerade schreibt.
ALTER TABLE worker_absences
  DROP CONSTRAINT IF EXISTS worker_absences_entscheidung_chk;
ALTER TABLE worker_absences
  ADD CONSTRAINT worker_absences_entscheidung_chk
    CHECK (
      zustand <> 'abgelehnt'
      OR (entschieden_am IS NOT NULL AND entscheidung_grund IS NOT NULL)
    );

-- ── C) Die Beschreibung, die das Buero lesen soll (G-E8) ─────────────────────
--
-- Der Mensch beschreibt, was vorgefallen ist. Die Mindestlaenge (30 Woerter)
-- prueft der Endpunkt, nicht die Datenbank: sie ist eine Produktregel, die sich
-- je Firma aendern koennen soll, keine Integritaetsregel.
--
-- WICHTIG — DIESER TEXT VERLAESST DIE ZEITARBEITSFIRMA NICHT. Er steht neben
-- `art` und `notiz` auf der Arbeitgeberseite. Der Kunde erfaehrt nur, DASS jemand
-- ausfaellt und bis wann voraussichtlich (G-E7): "krank" ist ein Gesundheitsdatum
-- nach Art. 9 DSGVO, und das Einsatzunternehmen ist ein Dritter.
ALTER TABLE worker_absences
  ADD COLUMN IF NOT EXISTS beschreibung TEXT;

-- ── D) Der Schalter je Zeitarbeitsfirma (G-E2) ───────────────────────────────

ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS abwesenheit_selbstmeldung_freigabepflicht BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN org_settings.abwesenheit_selbstmeldung_freigabepflicht IS
  'FALSE (Standard, G-E1): eine Selbstmeldung ist sofort wirksam. TRUE (G-E2): sie ist zunaechst beantragt und wirkt erst nach Freigabe. Gilt NUR fuer quelle=mitarbeiter; der Disponent traegt immer sofort wirksam ein.';

-- ── E) Zugriffspfade ─────────────────────────────────────────────────────────

-- Das Buero fragt taeglich: "Was ist neu und noch nicht entschieden?" Ohne Index
-- ist das ein Scan ueber alle Abwesenheiten der Firma — heute billig, bei 300
-- Kunden nicht mehr.
CREATE INDEX IF NOT EXISTS worker_absences_offene_selbstmeldungen_idx
  ON worker_absences (supplier_org_id, erfasst_am DESC)
  WHERE quelle = 'mitarbeiter' AND zustand = 'beantragt' AND aufgehoben_am IS NULL;

COMMENT ON COLUMN worker_absences.quelle IS
  'disponent | mitarbeiter — WER gemeldet hat. Nicht aus erfasst_von ableitbar: dieselbe Person kann beide Rollen haben, und bei Profilen ohne Konto ist erfasst_von leer.';
COMMENT ON COLUMN worker_absences.zustand IS
  'wirksam | beantragt | abgelehnt. Haengt an der ZEILE, nicht am Schalter der Firma: sonst wuerde das Umlegen des Schalters rueckwirkend laengst disponierte Meldungen umwerten.';
COMMENT ON COLUMN worker_absences.beschreibung IS
  'Was vorgefallen ist, vom Menschen selbst (G-E8). Bleibt beim Arbeitgeber — geht NIE an das Einsatzunternehmen (Art. 9 DSGVO).';

-- =============================================================================
-- ROLLBACK
--
-- Gefahrlos: die Migration fuegt nur hinzu. Nichts wird umgeschrieben, keine
-- bestehende Zeile veraendert. Wer zurueck muss, verliert die Herkunft und den
-- Zustand der Meldungen — die Abwesenheiten selbst bleiben unangetastet.
--
-- ACHTUNG bei Daten: Sind bereits Selbstmeldungen eingegangen (quelle =
-- 'mitarbeiter'), sind sie nach dem Rueckweg nicht mehr von Disponenten-
-- Eintraegen unterscheidbar. Vorher pruefen:
--   SELECT count(*) FROM worker_absences WHERE quelle = 'mitarbeiter';
--
-- DROP INDEX IF EXISTS worker_absences_offene_selbstmeldungen_idx;
-- ALTER TABLE worker_absences
--   DROP CONSTRAINT IF EXISTS worker_absences_entscheidung_chk,
--   DROP CONSTRAINT IF EXISTS worker_absences_zustand_chk,
--   DROP CONSTRAINT IF EXISTS worker_absences_quelle_chk,
--   DROP COLUMN IF EXISTS entscheidung_grund,
--   DROP COLUMN IF EXISTS entschieden_am,
--   DROP COLUMN IF EXISTS entschieden_von,
--   DROP COLUMN IF EXISTS beschreibung,
--   DROP COLUMN IF EXISTS zustand,
--   DROP COLUMN IF EXISTS quelle;
-- ALTER TABLE org_settings
--   DROP COLUMN IF EXISTS abwesenheit_selbstmeldung_freigabepflicht;
-- =============================================================================
