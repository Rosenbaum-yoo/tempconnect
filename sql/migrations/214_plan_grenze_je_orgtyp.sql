-- Migration 214: Grenzen je Org-Typ (M1.8)
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WARUM ES DIESE TABELLE GIBT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Owner-Entscheid M-E5: eigene Tarifgrenzen je Org-Typ — Struktur jetzt,
-- Werte spaeter. Das Abnahmekriterium lautet:
--
--     "ein geaenderter Wert wirkt ohne Neubau"
--
-- Und genau das schliesst eine JS-Konstante aus. Eine Zahl im Quelltext
-- verlangt ein neues Abbild und einen Neustart. Nach der Config-Taxonomie
-- (CLAUDE.md, Erkenntnis 2026-06-03) ist eine Grenze je Plan ohnehin
-- **Tier 3 — Entitlement** und gehoert damit in die Datenbank.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- SIE HAELT NUR ABWEICHUNGEN, NICHT DIE VOLLEN WERTE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Das ist die wichtigste Entscheidung an dieser Migration, und sie kommt aus
-- einem Fehler von heute frueh: M1.7 hat eine zweite Tabelle GELOESCHT, die
-- dieselben Grenzen ein zweites Mal behauptete — `PRO: 50` neben
-- `listings: -1`. Sie gewann, weil sie im Schreibpfad stand, und eine
-- PRO-Agentur wurde bei der 51. Anzeige gesperrt.
--
-- Wuerde diese Tabelle hier mit den heutigen Werten befuellt, waere dieselbe
-- Doppelung sofort wieder da. Deshalb: **leer heisst "beide Seiten teilen den
-- Code-Wert"**. Das IST die sinnvolle Vorgabe — heute gilt fuer beide
-- dasselbe. Der Owner traegt eine ABWEICHUNG ein, und nur die steht hier.
--
-- Es gibt damit weiterhin genau eine Wahrheit je (org_type, plan, metrik):
-- die Zeile, wenn es sie gibt, sonst der Code.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DIE SCHICHTUNG
-- ═══════════════════════════════════════════════════════════════════════════
--
--     Code-Vorgabe (userService.PLAN_LIMITS)
--       -> DIESE TABELLE (je Org-Typ)
--         -> organizations.custom_limit_* (je Org, sticht beides)
--
-- Die dritte Schicht gibt es bereits (`coalesceLimit` in
-- `entitlementService.js`); neu ist nur die mittlere.

SET client_min_messages TO WARNING;

BEGIN;

CREATE TABLE IF NOT EXISTS plan_grenze_je_orgtyp (
  -- Dieselben zwei Werte wie `organizations.type` (Migration 019). Gemessen
  -- am 2026-09-02: 1872 company, 694 agency — ein dritter Typ existiert nicht.
  org_type    TEXT NOT NULL,

  -- Kanonische Plaene aus `planCatalog.js`. Bewusst OHNE Fremdschluessel:
  -- Plaene leben im Code, nicht in einer Tabelle.
  plan        TEXT NOT NULL,

  -- Welche Grenze gemeint ist: listings | users | sites | suppliers |
  -- multi_org_slots. Freitext mit Laengengrenze statt CHECK-Liste — eine
  -- neue Metrik soll keine Migration verlangen, sonst wird die Tabelle
  -- umgangen statt gepflegt.
  metrik      TEXT NOT NULL,

  -- -1 = unbegrenzt. DIESELBE Schreibweise wie in `PLAN_LIMITS`; eine zweite
  -- Konvention waere genau der Fehler, den M1.7 beseitigt hat. 0 = gar nichts.
  wert        INTEGER NOT NULL,

  -- Warum diese Seite anders behandelt wird. Pflichtfeld mit Mindestlaenge:
  -- eine Abweichung ohne Begruendung ist in einem halben Jahr eine Zahl, die
  -- niemand mehr erklaeren kann — und die deshalb niemand zurueckzunehmen wagt.
  grund       TEXT NOT NULL,

  gesetzt_von UUID REFERENCES users(id) ON DELETE SET NULL,
  gesetzt_am  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (org_type, plan, metrik),

  CONSTRAINT plan_grenze_orgtyp_chk   CHECK (org_type IN ('company', 'agency')),
  CONSTRAINT plan_grenze_metrik_chk   CHECK (metrik <> '' AND length(metrik) <= 40),
  CONSTRAINT plan_grenze_wert_chk     CHECK (wert >= -1),
  CONSTRAINT plan_grenze_grund_chk    CHECK (length(btrim(grund)) >= 10)
);

COMMENT ON TABLE plan_grenze_je_orgtyp IS
  'Abweichende Tarifgrenzen je Org-Typ (M1.8). LEER heisst: beide Seiten '
  'teilen den Wert aus userService.PLAN_LIMITS. Nur Abweichungen stehen hier '
  '— sonst entstuende eine zweite Wahrheit, wie sie M1.7 geloescht hat.';

COMMENT ON COLUMN plan_grenze_je_orgtyp.wert IS
  '-1 = unbegrenzt, 0 = nicht erlaubt. Gleiche Schreibweise wie PLAN_LIMITS.';

COMMENT ON COLUMN plan_grenze_je_orgtyp.grund IS
  'Warum diese Seite anders behandelt wird. Mindestens 10 Zeichen: eine '
  'Abweichung ohne Begruendung nimmt spaeter niemand mehr zurueck.';

-- BEWUSST KEINE ZEILEN. Der Auslieferungszustand ist "beide Seiten gleich",
-- und den beschreibt die leere Tabelle genauer als jede Befuellung.

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════════════
--   DROP TABLE IF EXISTS plan_grenze_je_orgtyp;
--
-- Gefahrlos, solange die Tabelle leer ist — dann aendert der Rueckbau nichts,
-- weil ohne Zeilen ohnehin die Code-Vorgabe gilt. Stehen Abweichungen darin,
-- fallen die betroffenen Plaene auf den gemeinsamen Wert zurueck; das ist
-- eine fachliche Aenderung und gehoert vorher besprochen.
--
-- Die Verdrahtung im Code (`services/orgTypGrenzenService.js`) darf stehen
-- bleiben: sie faengt eine fehlende Tabelle ab und liefert dann eine leere
-- Uebersteuerungsliste — also genau den Auslieferungszustand.
