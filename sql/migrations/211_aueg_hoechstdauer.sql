-- Migration 211: Die AUEG-Ueberlassungshoechstdauer bekommt eine Grundlage
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WARUM
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Owner-Entscheid 2026-08-31 (E-K3-1): "ja hoechstdauer pruefen und darstellen".
--
-- § 1 Abs. 1b AUEG: Der Verleiher darf denselben Leiharbeitnehmer nicht laenger
-- als **18 aufeinander folgende Monate** demselben Entleiher ueberlassen.
-- Vorherige Ueberlassungen an DENSELBEN ENTLEIHER — auch durch einen ANDEREN
-- Verleiher — werden **vollstaendig angerechnet**, wenn dazwischen nicht mehr
-- als **drei Monate** liegen.
--
-- Die Rechtsfolge einer Ueberschreitung ist erheblich: der Arbeitsvertrag mit
-- dem Verleiher wird unwirksam, es entsteht ein fingiertes Arbeitsverhaeltnis
-- mit dem Entleiher (§ 9 Abs. 1 Nr. 1b, § 10 Abs. 1 AUEG), dazu ein Bussgeld.
-- Genau deshalb wurde die Pruefung in K3.4 zunaechst NICHT gebaut: eine
-- geratene gesetzliche Frist waere schlimmer als gar keine.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WARUM EINE TABELLE UND KEINE KONSTANTE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- § 1 Abs. 1b Saetze 3 bis 6 lassen ABWEICHENDE Hoechstdauern zu — durch
-- Tarifvertrag der Einsatzbranche, und in dessen Rahmen durch
-- Betriebsvereinbarung. In der Metall- und Elektroindustrie sind je nach
-- Tarifgebiet 24, 36 oder 48 Monate ueblich; im Bauhauptgewerbe gilt die
-- Ueberlassung teils gar nicht.
--
-- Eine fest verdrahtete 18 waere damit fuer einen Teil der Kunden schlicht
-- FALSCH — und zwar in der gefaehrlichen Richtung: sie meldete eine
-- Ueberschreitung, wo keine ist, und wer den Alarm einmal als falsch erlebt,
-- glaubt ihm beim naechsten Mal nicht.
--
-- Die Abweichung haengt am ENTLEIHER (dem Einsatzunternehmen), nicht am
-- Verleiher: massgeblich ist der Tarifvertrag der Einsatzbranche.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WAS DIESE PRUEFUNG NICHT WISSEN KANN
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Sie sieht nur Ueberlassungen, die AUF DIESER PLATTFORM stehen. Hat dieselbe
-- Kraft denselben Entleiher zuvor ueber einen Verleiher beliefert, der
-- TempConnect nicht benutzt, fehlt diese Zeit in der Rechnung — obwohl das
-- Gesetz sie anrechnen wuerde.
--
-- Das ist keine Nachlaessigkeit, sondern eine Grenze der Datenlage, und sie
-- steht deshalb in JEDER Antwort des Dienstes (`nur_plattformdaten: true`).
-- Eine Frist, die sich sicherer gibt, als sie ist, waere die schlechtere
-- Variante von gar keiner.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════════════
--   DROP TABLE IF EXISTS aueg_konfiguration;

SET client_min_messages TO WARNING;

BEGIN;

CREATE TABLE IF NOT EXISTS aueg_konfiguration (
  -- Der ENTLEIHER. Massgeblich ist der Tarifvertrag der Einsatzbranche, nicht
  -- der des Verleihers.
  org_id                UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,

  -- § 1 Abs. 1b Satz 1: 18 Monate. Abweichend durch Tarifvertrag der
  -- Einsatzbranche (Saetze 3 ff.). Die Obergrenze ist bewusst weit: es gibt
  -- Tarifgebiete mit 48 Monaten, und eine zu enge Pruefregel waere hier
  -- dasselbe Problem wie eine fest verdrahtete 18.
  hoechstdauer_monate   INTEGER NOT NULL DEFAULT 18
                        CHECK (hoechstdauer_monate BETWEEN 1 AND 120),

  -- § 1 Abs. 1b Satz 2: Unterbrechung von mehr als drei Monaten setzt die
  -- Anrechnung zurueck. Konfigurierbar, weil auch dieser Wert tariflich
  -- abweichen kann — aber mit derselben Vorsicht.
  unterbrechung_monate  INTEGER NOT NULL DEFAULT 3
                        CHECK (unterbrechung_monate BETWEEN 0 AND 24),

  -- WORAUF sich die Abweichung stuetzt. Pflicht, sobald jemand von den 18
  -- Monaten abweicht: eine laengere Frist ohne benannte Grundlage ist eine
  -- Behauptung, und im Streitfall traegt sie niemand.
  grundlage             TEXT,

  hinterlegt_von        UUID REFERENCES users(id),
  hinterlegt_am         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  aktualisiert_am       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT aueg_abweichung_braucht_grundlage CHECK (
    hoechstdauer_monate = 18 OR (grundlage IS NOT NULL AND length(trim(grundlage)) >= 10)
  )
);

COMMENT ON TABLE aueg_konfiguration IS
  'Abweichende Ueberlassungshoechstdauer je Entleiher (§ 1 Abs. 1b Saetze 3 ff. AUEG). Ohne Eintrag gelten 18 Monate und 3 Monate Unterbrechung.';
COMMENT ON COLUMN aueg_konfiguration.org_id IS
  'Der ENTLEIHER. Massgeblich ist der Tarifvertrag der Einsatzbranche, nicht der des Verleihers.';
COMMENT ON COLUMN aueg_konfiguration.grundlage IS
  'Der Tarifvertrag oder die Betriebsvereinbarung, auf der die Abweichung beruht. Pflicht, sobald von 18 Monaten abgewichen wird.';

COMMIT;
