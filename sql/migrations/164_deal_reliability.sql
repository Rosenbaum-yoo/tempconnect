-- Migration 164: Zuverlaessigkeitsquote (P8 Welle B)
-- =============================================================================
-- WARUM ES DIESE MIGRATION GIBT
-- `supplier_reputation.deal_success_rate` steuert seit Mig 044 das Feed-Ranking
-- (capacityExchangeService: `deal_success_rate / 30`) und wird an sechs Stellen
-- ANGEZEIGT — geschrieben hat sie nie jemand. Die einzige Schreibstelle
-- (`reputationService.recomputeReputation`) hat bis heute KEINEN produktiven
-- Aufrufer; die Spalte ist in Produktion durchgehend NULL. Ein Storno kostet
-- deshalb exakt nichts. Welle A hat die Rohdaten erfasst (`offer_cancellations`),
-- diese Migration schafft den Platz fuer die daraus gerechnete Kennzahl.
--
-- WARUM from_status AN offer_cancellations NACHGEZOGEN WIRD
-- Ein Rueckzug VOR der beidseitigen Bestaetigung ist legitimes Verhandeln, kein
-- Wortbruch. Nur wer nach `confirmed`/`activated` storniert, bricht eine Zusage.
-- Welle A hat diese Unterscheidung nicht mitgeschrieben: der Vorzustand steht
-- ausschliesslich im Audit-Log (`state_machine.transition`, details.from als
-- JSONB) und ist dort nicht sinnvoll aggregierbar. Eine Kennzahl, die aus einem
-- Log-Detailfeld gerechnet wird, ist keine Kennzahl, sondern eine Vermutung.
-- Deshalb wird der Vorzustand hier zu einer echten Spalte.
--   NULL = Altbestand (vor dieser Migration) und zaehlt bewusst NICHT gegen die
--   Quote: unbekannte Herkunft darf niemandem angelastet werden. Produktiv ist
--   die Tabelle beim Einspielen leer, der Fall ist also rein theoretisch.
--
-- WARUM EINE EIGENE TABELLE UND NICHT NUR DIE SPALTE IN supplier_reputation
-- Drei Gruende:
--   1. BEIDE SEITEN. `supplier_reputation` ist per Name und Semantik
--      anbieterseitig (JOIN auf users als "supplier"). Auch Unternehmen
--      stornieren — Welle A erfasst `cancelled_by_side` genau deswegen. Eine
--      Quote nur fuer Agenturen waere ein einseitig gebautes Feature.
--   2. NACHVOLLZIEHBARKEIT. `deal_success_rate` ist eine nackte Prozentzahl.
--      Wer sie einem Kunden erklaeren muss ("warum 82 %?"), braucht Zaehler,
--      Nenner, Fenster und die Zahl der entschuldigten Faelle. Genau das steht
--      hier — und genau das speist spaeter Welle D (Schritt 3 des Abschlusses
--      muss die Folge mit ECHTEN Werten benennen, nicht mit festem Text).
--   3. NEURECHENBARKEIT. Die Gewichtung (E1/E2) wird sich einspielen. Steht nur
--      das Ergebnis in einer fremden Tabelle, ist jede Regelaenderung ein
--      Backfill-Projekt. Hier wird jederzeit aus `offer_cancellations` neu
--      gerechnet.
--
-- `supplier_reputation.deal_success_rate` bleibt als DENORMALISIERTER SPIEGEL
-- der Agentur-Zeile bestehen — dasselbe Muster wie `worker_profiles.skill_tags[]`
-- gegenueber `worker_profile_skills`: eine Quelle der Wahrheit, ein Spiegel fuer
-- den heissen Lesepfad. So wirkt die Quote im Ranking und in allen sechs
-- bestehenden Anzeigen, ohne dass eine davon angefasst werden muss.
--
-- Rollback:
--   DROP TABLE IF EXISTS deal_reliability;
--   ALTER TABLE offer_cancellations DROP COLUMN IF EXISTS from_status;
--   -- Der Spiegel bleibt bestehen; er wird ohne Cron einfach nicht mehr frisch.
-- =============================================================================

SET client_min_messages TO WARNING;

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Vorzustand der stornierten Vereinbarung (siehe Kopf)
-- ---------------------------------------------------------------------------
ALTER TABLE offer_cancellations
  ADD COLUMN IF NOT EXISTS from_status TEXT;

ALTER TABLE offer_cancellations
  DROP CONSTRAINT IF EXISTS offer_cancellations_from_status_check;

ALTER TABLE offer_cancellations
  ADD CONSTRAINT offer_cancellations_from_status_check
  CHECK (from_status IS NULL OR from_status IN (
    'none', 'agreement_created', 'pending_confirmation', 'confirmed', 'activated'
  ));

COMMENT ON COLUMN offer_cancellations.from_status
  IS 'Agreement-Status VOR dem Storno. Nur confirmed/activated zaehlen gegen die Zuverlaessigkeitsquote — davor ist ein Rueckzug legitimes Verhandeln. NULL = Altbestand vor Mig 164, zaehlt nicht.';

-- ---------------------------------------------------------------------------
-- 2. Zuverlaessigkeitsquote je Partei UND Marktseite
-- ---------------------------------------------------------------------------
-- Der Schluessel ist (Partei, Seite) und nicht nur die Partei: dieselbe
-- Organisation kann grundsaetzlich auf beiden Seiten auftreten (eine Agentur,
-- die selbst Personal einkauft). Ihre Zuverlaessigkeit als Anbieter sagt nichts
-- ueber ihre Zuverlaessigkeit als Auftraggeber — zwei Zeilen, zwei Wahrheiten.
CREATE TABLE IF NOT EXISTS deal_reliability (
  party_user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  party_side             TEXT NOT NULL CHECK (party_side IN ('company', 'agency')),

  -- Betrachtungsfenster in Tagen. Mitgespeichert, damit eine spaetere Aenderung
  -- (365 -> 180) an den Altzeilen sofort sichtbar ist, statt still zu wirken.
  window_days            INT NOT NULL,

  -- Nenner: verbindlich gewordene Deals (Agreement erreichte `confirmed`).
  binding_deals          INT NOT NULL DEFAULT 0,
  -- Alle Stornos im Fenster, auch die entschuldigten und die vor der Zusage.
  cancellations_total    INT NOT NULL DEFAULT 0,
  -- Davon die, die nach E2 nicht gegen die Partei zaehlen. Getrennt gefuehrt,
  -- weil "3 Stornos, davon 3 Kundenabsagen" etwas voellig anderes erzaehlt als
  -- "3 Stornos" — und der Nutzer diese Erklaerung sehen koennen muss.
  cancellations_excused  INT NOT NULL DEFAULT 0,
  -- Gewichtete Summe nach E1 (Vorlauf): <48 h doppelt, >=14 Tage gar nicht.
  weighted_cancellations NUMERIC(7,2) NOT NULL DEFAULT 0,

  -- NULL heisst ausdruecklich "keine Aussage", NICHT "schlecht". Unter der
  -- Mindestzahl an Deals (E4: 5) wuerde die Quote Neulinge bestrafen: wer einen
  -- einzigen Deal hatte und ihn stornieren musste, staende bei 0 %.
  reliability_rate       NUMERIC(5,2),

  computed_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (party_user_id, party_side)
);

-- Traegt Bestenlisten und den Cron-Nachlauf ("wer wurde am laengsten nicht
-- gerechnet"). NULLS LAST, weil "keine Aussage" nie oben stehen soll.
CREATE INDEX IF NOT EXISTS deal_reliability_side_rate_idx
  ON deal_reliability(party_side, reliability_rate DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS deal_reliability_computed_idx
  ON deal_reliability(computed_at);

COMMENT ON TABLE deal_reliability
  IS 'P8 Welle B: Zuverlaessigkeitsquote je Partei und Marktseite, gerechnet aus offer_cancellations. Quelle der Wahrheit; supplier_reputation.deal_success_rate ist nur der Spiegel fuer den Feed-Lesepfad.';

-- ---------------------------------------------------------------------------
-- 3. Stuetz-Index fuer den Nenner
-- ---------------------------------------------------------------------------
-- `binding_deals` scannt `offers` nach `confirmed_at` im Fenster. Diese Menge
-- waechst unbegrenzt mit dem Geschaeft (Diskriminator "laeuft bei 10, bricht bei
-- 300" trifft zu), der Cron laeuft taeglich ueber alles. Partial-Index, weil
-- unbestaetigte Angebote fuer diese Frage bedeutungslos sind.
CREATE INDEX IF NOT EXISTS offers_confirmed_at_idx
  ON offers(confirmed_at DESC)
  WHERE confirmed_at IS NOT NULL;

COMMIT;
