-- Migration 229: Einsatzportal-Sitzungen — von wann bis wann (Owner-Vorgabe 2026-10-01)
-- =============================================================================
-- OWNER-VORGABE (2026-10-01, woertlich): „unten soll man dann auch nachweisen
-- können im audit log von wann welcher mitarbeiter das einsatzportal nutzt bis
-- wann welche aktion ausgeführt wurde"
--
-- GEMESSEN AM LAUFENDEN SYSTEM (2026-10-01, Einladung -> Konto -> Anmeldung ->
-- Aktion -> Abmeldung eines echten Mitarbeiter-Kontos):
--   * Anmeldung (`auth.login`): mit Person und Firma — im Protokoll sichtbar.
--   * Aktionen im Portal (`worker.*`): mit Person und Firma — sichtbar.
--   * Abmeldung (`auth.logout`): OHNE Person und OHNE Firma — die Sitzung wird
--     zerstoert, bevor das Protokoll schreibt. In keinem Firmenprotokoll sichtbar.
--   * Ende OHNE Abmeldung: gar nicht erfasst. Und das ist beim Einsatzportal der
--     Normalfall: gewerbliche Kraefte arbeiten am geteilten Rechner (Lagerbuero,
--     Pfoertnerloge) ohne „angemeldet bleiben" — die Sitzung endet mit dem Fenster.
--
-- DIESE TABELLE HAELT JE PORTAL-SITZUNG FEST: Beginn (Anmeldung), zuletzt aktiv
-- (hoechstens alle 5 Minuten fortgeschrieben, bei jeder Anfrage der Sitzung) und
-- Ende (Abmeldung). Eine Sitzung ohne Ende, die laenger als die Leerlauf-Frist
-- (8 Stunden) still ist, gilt beim Lesen als „abgelaufen" um „zuletzt aktiv".
--
-- WAS BEWUSST NICHT ERFASST WIRD: welche Seiten jemand ansieht. Festgehalten
-- werden Anwesenheit (von/bis) und — wie bisher im Protokoll — Aktionen.
--
-- NUR FUER MITARBEITER IM EINSATZPORTAL (Sitzungsrolle `worker`). Fuer das Buero
-- der Firmen aendert sich nichts.
--
-- KEINE Sitzungskennung im Klartext: gespeichert wird ein SHA-256 ueber die
-- Kennung. Damit laesst sich eine Sitzung beim Abmelden wiederfinden, aber aus der
-- Tabelle keine Sitzung uebernehmen.
--
-- AUFBEWAHRUNG: 12 Monate ab Beginn — dieselbe Frist, die der Owner am selben Tag
-- fuer die Empfaengerlisten der Produkt-Mails gesetzt hat. Die Regel steht als
-- Funktion hier (wie Migration 179/228), der Takt `einsatzportal-aufbewahrung`
-- ruft sie taeglich; ohne Redis von Hand:
--   SELECT einsatzportal_sitzungen_aufraeumen();
--
-- ROLLBACK / RUECKNAHME:
--   DROP FUNCTION IF EXISTS einsatzportal_sitzungen_aufraeumen();
--   DROP TABLE IF EXISTS einsatzportal_sitzungen;
-- und den Code auf den Stand vor dieser Migration. Das Protokoll (audit_log) ist
-- davon unberuehrt; verloren gehen nur die Zeitraeume der Sitzungen.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS einsatzportal_sitzungen (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sitzung_hash     CHAR(64) NOT NULL,
  user_id          UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  org_id           UUID REFERENCES organizations (id) ON DELETE CASCADE,
  begonnen_am      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  zuletzt_aktiv_am TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  beendet_am       TIMESTAMPTZ,
  ende             VARCHAR(20) CHECK (ende IN ('abgemeldet', 'alle_abgemeldet')),
  CONSTRAINT einsatzportal_sitzungen_hash_key UNIQUE (sitzung_hash),
  CONSTRAINT einsatzportal_sitzungen_ende_passt CHECK ((beendet_am IS NULL) = (ende IS NULL))
);

-- Die Verwaltung liest je Firma, neueste zuerst; der Abmeldeweg je Nutzer.
CREATE INDEX IF NOT EXISTS idx_einsatzportal_sitzungen_org_beginn
  ON einsatzportal_sitzungen (org_id, begonnen_am DESC);
CREATE INDEX IF NOT EXISTS idx_einsatzportal_sitzungen_user_offen
  ON einsatzportal_sitzungen (user_id) WHERE beendet_am IS NULL;

COMMENT ON TABLE einsatzportal_sitzungen IS
  'Einsatzportal-Sitzungen (Migration 229): Beginn, zuletzt aktiv (hoechstens alle 5 Minuten), Ende. Nur Sitzungsrolle worker; keine Seitenaufrufe; Sitzungskennung nur als SHA-256. Aufbewahrung 12 Monate (einsatzportal_sitzungen_aufraeumen).';

CREATE OR REPLACE FUNCTION einsatzportal_sitzungen_aufraeumen()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_geloescht INTEGER;
BEGIN
  DELETE FROM einsatzportal_sitzungen
   WHERE begonnen_am < NOW() - INTERVAL '12 months';
  GET DIAGNOSTICS v_geloescht = ROW_COUNT;
  RETURN v_geloescht;
END $$;

COMMENT ON FUNCTION einsatzportal_sitzungen_aufraeumen() IS
  'Loescht Einsatzportal-Sitzungen 12 Monate nach ihrem Beginn. Taeglich ausgeloest vom Betriebstakt einsatzportal-aufbewahrung; liefert die Zahl der geloeschten Zeilen.';

COMMIT;
