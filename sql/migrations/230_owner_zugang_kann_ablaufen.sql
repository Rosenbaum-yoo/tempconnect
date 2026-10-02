-- =============================================================================
-- Migration 230: der Owner-Zugang kann ablaufen (Owner-Punkt 17)
--
-- Owner-Freigabe 2026-10-02: `expires_at` mit 90 Tagen und auditierter
-- Verlaengerung — "lang genug, dass sich niemand taeglich selbst freischaltet,
-- kurz genug, dass ein vergessener Zugang von selbst endet."
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DER BEFUND
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `tempconnect_staff` traegt `expires_at`, und die Middleware prueft es seit
-- 2026-08-22 wirklich — in BEIDEN Toren und im `WHERE`. `occ_owner_access` kannte
-- nur `revoked_at`. Damit war die PRIVILEGIERTESTE Flaeche des Systems die
-- einzige, deren Zugaenge nicht von selbst enden: wer einmal drin ist, bleibt
-- drin, bis jemand aktiv widerruft.
--
-- Gemessen am 2026-10-02: zwei wirksame Zugaenge (die echte Owner-Adresse und die
-- Buehnen-Zweitsicht aus Y4.1), beide unbefristet, weil es das Feld nicht gab.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DIE STOP-REGEL GEGEN DIE EIGENE HAERTUNG
-- ─────────────────────────────────────────────────────────────────────────────
--
-- "Kein Enforce ohne Break-Glass" gilt hier gegen uns selbst: ein Ablauf, der
-- ALLE Zugaenge trifft, sperrt die Eigentuemer aus ihrer eigenen Flaeche aus — und
-- niemand kann die Sperre dann noch aufheben, weil das Aufheben in dieser Flaeche
-- passiert. Vorbild ist `assertNotLastOwner` (rbacService): es verweigert die
-- Herabstufung des letzten Owners mit `409 LAST_OWNER`.
--
-- Die Invariante lautet deshalb, und sie deckt beide Richtungen in einem Satz:
--
--   **Die Menge der wirksamen OCC-Zugaenge enthaelt immer mindestens einen OHNE
--   Ablaufdatum.**
--
-- Daraus folgt automatisch: der letzte unbefristete Zugang kann nicht widerrufen
-- werden, und dem einzigen Zugang kann kein Ablauf gegeben werden. Eine Regel
-- statt zweier, und man kann sie an einer Zeile pruefen.
--
-- DIESE MIGRATION SETZT DESHALB KEINEN ABLAUF auf bestehende Zeilen. Das waere
-- genau der Fall, den die Stop-Regel verbietet: beide heutigen Zugaenge sind
-- unbefristet, ein pauschales "ab jetzt 90 Tage" haette die Flaeche in 90 Tagen
-- geschlossen. Neue Zugaenge bekommen die 90 Tage ueber
-- `api/scripts/owner-access-cli.js`; die Spalte entsteht hier leer.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK-STRATEGIE
-- ─────────────────────────────────────────────────────────────────────────────
--
--   ALTER TABLE occ_owner_access DROP COLUMN IF EXISTS expires_at;
--
-- Verlustfrei, solange kein Zugang auf den Ablauf angewiesen ist: ein Drop macht
-- jeden befristeten Zugang unbefristet. Das ist die RICHTIGE Richtung fuer einen
-- Rollback (niemand wird ausgesperrt) und zugleich der Grund, ihn nicht
-- leichtfertig zu ziehen — nach einem Drop sind befristete Zugaenge still
-- unbefristet, und das faellt niemandem auf. Der Waechter
-- `api/test/ownerZugangLaeuftAb.test.js` wird nach einem Drop rot.
--
-- Owner-Punkt 17 — 2026-10-02
-- =============================================================================

BEGIN;

SET client_min_messages TO WARNING;

ALTER TABLE occ_owner_access
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

COMMENT ON COLUMN occ_owner_access.expires_at IS
  'Optionales Ablaufdatum. NULL = kein Ablauf (fuer die Eigentuemer selbst). '
  'Geprueft im WHERE von requireOwnerControlAccess — nicht in einer '
  'JS-Nachpruefung, damit die Bedingung beim naechsten Aufrufer derselben '
  'Abfrage nicht fehlt. Neue Zugaenge erhalten 90 Tage (owner-access-cli). '
  'STOP-REGEL: die Menge der wirksamen Zugaenge enthaelt immer mindestens einen '
  'ohne Ablauf — sonst sperrt der Verfall die Eigentuemer aus ihrer eigenen '
  'Flaeche aus, und das Aufheben passiert in genau dieser Flaeche. Owner-Punkt 17.';

DO $nachweis$
DECLARE
  n int;
  ohne_ablauf int;
BEGIN
  /* 1 · Die Spalte ist da und NULLBAR. Ein NOT NULL haette hier bedeutet:
     jeder Zugang MUSS ablaufen - und damit waere die Stop-Regel unerfuellbar. */
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name = 'occ_owner_access' AND column_name = 'expires_at' AND is_nullable = 'YES';
  IF n <> 1 THEN
    RAISE EXCEPTION '230: expires_at fehlt oder ist NOT NULL. Ein Pflichtfeld hiesse: jeder Zugang MUSS ablaufen - dann ist die Stop-Regel unerfuellbar.';
  END IF;

  /* 2 · Diese Migration hat KEINEN Ablauf gesetzt. Haette sie es getan, waere
     die Flaeche in 90 Tagen zu, ohne dass jemand es entschieden hat. */
  SELECT count(*) INTO n FROM occ_owner_access WHERE expires_at IS NOT NULL;
  IF n <> 0 THEN
    RAISE EXCEPTION '230: % Zugang/Zugaenge haben bereits ein Ablaufdatum. Diese Migration darf keines setzen - das waere der Fall, den die Stop-Regel verbietet.', n;
  END IF;

  /* 3 · DIE STOP-REGEL selbst, als Zustand geprueft.
     ───────────────────────────────────────────────────────────────────────────
     KORRIGIERT am 2026-10-02, und der Fehler gehoert benannt: hier stand
     `IF n < 1 THEN RAISE EXCEPTION` auf der Zahl der unbefristeten Zugaenge,
     ohne zu fragen, ob es UEBERHAUPT Zugaenge gibt. Auf einem FRISCHINSTALL ist
     occ_owner_access leer - die Bedingung schlug zu, und die Migrationskette
     brach bei 230 ab. Ein Frischinstall war damit unmoeglich. Gefunden hat es
     kein Test, sondern ein echter Wegwerf-Frischinstall mit Demo-Welt.

     Der Denkfehler war feiner als ein Tippfehler: die Stop-Regel lautet "die
     Menge der wirksamen Zugaenge enthaelt immer mindestens einen OHNE Ablauf".
     Bei LEERER Menge ist das erfuellt, nicht verletzt - aus einer Flaeche, zu
     der niemand Zugang hat, kann niemand ausgesperrt werden. Die Regel schuetzt
     den LETZTEN Zugang, nicht die Existenz eines ersten. Den legt der erste
     `owner-access-cli.js grant` an, und ab da bewacht ihn die CLI. */
  SELECT count(*) INTO n FROM occ_owner_access WHERE revoked_at IS NULL;
  IF n > 0 THEN
    SELECT count(*) INTO ohne_ablauf FROM occ_owner_access
     WHERE revoked_at IS NULL AND expires_at IS NULL;
    IF ohne_ablauf < 1 THEN
      RAISE EXCEPTION '230: % wirksame Owner-Zugaenge, aber keiner ohne Ablaufdatum. Der Verfall wuerde die Eigentuemer aus ihrer eigenen Flaeche aussperren, und das Aufheben passiert dort.', n;
    END IF;
    RAISE NOTICE '230: occ_owner_access.expires_at angelegt (leer), Stop-Regel erfuellt - % von % wirksamen Zugaengen ohne Ablauf.', ohne_ablauf, n;
  ELSE
    RAISE NOTICE '230: occ_owner_access.expires_at angelegt (leer). Noch kein Owner-Zugang vorhanden (Frischinstall) - die Stop-Regel ist leer erfuellt; der erste `grant` legt einen unbefristeten an.';
  END IF;
END $nachweis$;

COMMIT;
