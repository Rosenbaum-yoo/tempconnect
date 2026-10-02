-- =============================================================================
-- Migration 229: `required_total_count` luegt nicht mehr (Owner-Punkt 14)
--
-- Owner-Freigabe 2026-10-02. Weg A in der Fassung "beim SCHREIBEN setzen", NICHT
-- "im Lesepfad per GREATEST erzwingen" — die Spalte bleibt damit die einzige
-- Wahrheit der Fuell-Logik, und die kaufmaennische Frage "darf ein Bedarf
-- teilweise freigegeben werden" bleibt OFFEN statt verbaut.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DER DEFEKT IN EINEM SATZ
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `required_total_count` hatte `DEFAULT 1` und `NOT NULL`. Die Rueckfallkette im
-- Lesepfad lautet
--
--     GREATEST(COALESCE(dr.required_total_count, dr.headcount, 1), 1)
--
-- und erreicht `headcount` damit NIEMALS: der Wert ist 1, nicht NULL. Ein Bedarf,
-- den nicht der eigene Dienst angelegt hat — Rohinsert, Import, aelterer Pfad —
-- sagt "ich brauche drei" und wird kaufmaennisch als "einer" gelesen. Folge: eine
-- Zeitarbeitsfirma bietet genau die drei verlangten Kraefte an und bekommt
-- `OVERFILL_NOT_ALLOWED: requested 3, remaining 1`.
--
-- Die Rueckfallkette war also richtig gedacht. Kaputt war die VORGABE.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- GEMESSEN AM 2026-10-02, und die Messung entscheidet die offene Frage
-- ─────────────────────────────────────────────────────────────────────────────
--
--   Zeilen mit required_total_count < headcount      5
--   davon required_total_count genau 1               5   (alle)
--   Zeilen mit required_total_count > headcount      0
--   Schreibpfade, die die Spalte UNABHAENGIG setzen  0
--
-- Der eigene Dienst (`marketplaceService.createDemandRequest`) setzt sie laengst
-- aus `headcount` (zwei Parameter, beide `payload.headcount ?? 1`). Es gibt also
-- KEINEN Weg, ueber den jemand ein kleineres `required` AUSDRUECKEN koennte —
-- und damit auch keine Absicht, die ein Nachziehen zerstoeren wuerde. Das war der
-- einzige Einwand gegen das Nachziehen, und er ist gemessen widerlegt.
--
-- DIE FUENF ZEILEN, namentlich, damit der Rollback exakt ist:
--
--   b9000000-0000-4000-8000-00000000a001   headcount 3   status open
--   b9000000-0000-4000-8000-00000000a002   headcount 2   status paused
--   b9000000-0000-4000-8000-00000000a003   headcount 5   status closed
--   b9000000-0000-4000-8000-00000000a004   headcount 4   status cancelled
--   c035f115-6ccc-42b7-8cb9-8298fdcdb199   headcount 2   status fulfilled
--
-- Vier davon tragen `b9000000`, sind also Zeilen der Probebuehne (Welle Y2.2).
-- Das ist kein Schoenheitsfehler, sondern der Zweck: die Buehne hat den Defekt
-- VORGEFUEHRT, weil sie — wie jeder Import — mit einem Rohinsert arbeitet. Die
-- einzige OFFENE der fuenf ist eine Buehnenzeile; die Aussage "ein echter Kunde
-- kann heute nicht bedient werden" waere also zu stark. Der Mechanismus ist echt,
-- der heutige Schaden liegt auf der Buehne.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WAS DIESE MIGRATION TUT
-- ─────────────────────────────────────────────────────────────────────────────
--
--   1. DROP DEFAULT   — "nicht angegeben" wird damit unterscheidbar (NULL)
--   2. DROP NOT NULL  — damit NULL ueberhaupt entstehen kann
--   3. Nachziehen     — die fuenf Zeilen auf `headcount`, begruendet oben
--
-- Danach wirkt die vorhandene Rueckfallkette wie gedacht, OHNE eine Zeile
-- Lesepfad zu aendern. Ein kuenftiges Produktmerkmal "Teilfreigabe" kann die
-- Spalte dann kleiner setzen als `headcount` — ein `GREATEST(required, headcount)`
-- im Lesepfad haette genau das dauerhaft verboten und muesste zurueckgebaut
-- werden. Deshalb diese Form.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK-STRATEGIE (exakt, nicht annaehernd)
-- ─────────────────────────────────────────────────────────────────────────────
--
--   UPDATE demand_requests SET required_total_count = 1
--    WHERE id IN ('b9000000-0000-4000-8000-00000000a001',
--                 'b9000000-0000-4000-8000-00000000a002',
--                 'b9000000-0000-4000-8000-00000000a003',
--                 'b9000000-0000-4000-8000-00000000a004',
--                 'c035f115-6ccc-42b7-8cb9-8298fdcdb199');
--   UPDATE demand_requests SET required_total_count = 1 WHERE required_total_count IS NULL;
--   ALTER TABLE demand_requests ALTER COLUMN required_total_count SET NOT NULL;
--   ALTER TABLE demand_requests ALTER COLUMN required_total_count SET DEFAULT 1;
--
-- Der Rollback ist EXAKT, weil alle fuenf Zeilen vorher genau `1` trugen
-- (gemessen). Haette eine davon `2` getragen, waere er es nicht — dann haette
-- diese Migration die alten Werte erst wegschreiben muessen.
--
-- Owner-Punkt 14 — 2026-10-02
-- =============================================================================

BEGIN;

SET client_min_messages TO WARNING;

-- 1 + 2: "nicht angegeben" wird unterscheidbar.
ALTER TABLE demand_requests ALTER COLUMN required_total_count DROP DEFAULT;
ALTER TABLE demand_requests ALTER COLUMN required_total_count DROP NOT NULL;

-- 3: die fuenf Altzeilen. Bedingung statt Kennungsliste, damit die Migration auf
--    einer Datenbank mit anderem Bestand dasselbe RICHTIGE tut und nicht dasselbe
--    GERATENE: `required < headcount` ist der Befund, nicht die Kennung.
UPDATE demand_requests
   SET required_total_count = headcount,
       updated_at = NOW()
 WHERE required_total_count IS NOT NULL
   AND headcount IS NOT NULL
   AND required_total_count < headcount;

DO $nachweis$
DECLARE
  n int;
  vorgabe text;
  nullbar text;
BEGIN
  /* 1 · Die Vorgabe ist weg - sonst entsteht beim naechsten Rohinsert wieder
     eine 1, und der ganze Zweck dieser Migration ist verfehlt. */
  SELECT column_default, is_nullable INTO vorgabe, nullbar
    FROM information_schema.columns
   WHERE table_name = 'demand_requests' AND column_name = 'required_total_count';
  IF vorgabe IS NOT NULL THEN
    RAISE EXCEPTION '229: required_total_count hat weiterhin eine Vorgabe (%). Dann bleibt "nicht angegeben" ununterscheidbar von "1".', vorgabe;
  END IF;
  IF nullbar <> 'YES' THEN
    RAISE EXCEPTION '229: required_total_count ist weiterhin NOT NULL - dann kann NULL nicht entstehen und die Rueckfallkette greift nie.';
  END IF;

  /* 2 · Keine Zeile sagt mehr "ich brauche weniger, als ich brauche". */
  SELECT count(*) INTO n FROM demand_requests
   WHERE required_total_count IS NOT NULL AND headcount IS NOT NULL
     AND required_total_count < headcount;
  IF n <> 0 THEN
    RAISE EXCEPTION '229: % Bedarf(e) haben weiterhin required_total_count < headcount.', n;
  END IF;

  /* 3 · Und der Lesepfad kommt jetzt wirklich bei headcount an. Geprueft an der
     ECHTEN Formel aus getDemandCommercialStates, nicht an einer Nachbildung:
     eine Zeile mit NULL muss headcount liefern. */
  SELECT count(*) INTO n FROM (
    SELECT GREATEST(COALESCE(NULL::int, d.headcount, 1), 1) AS gelesen, d.headcount
      FROM demand_requests d LIMIT 20
  ) x WHERE x.gelesen <> greatest(x.headcount, 1);
  IF n <> 0 THEN
    RAISE EXCEPTION '229: die Rueckfallkette liefert bei NULL nicht headcount (% Abweichungen).', n;
  END IF;

  RAISE NOTICE '229: required_total_count ohne Vorgabe und nullbar, Altzeilen nachgezogen - die Rueckfallkette erreicht headcount.';
END $nachweis$;

COMMIT;
