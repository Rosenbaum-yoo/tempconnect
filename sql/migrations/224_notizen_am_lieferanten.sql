-- Migration 224: Notizen am Lieferanten (Welle Z, Z6)
-- =============================================================================
-- `vendorPoolService.addNote` und `listNotes` schreiben und lesen
-- `vendor_pool_notes`. Die Tabelle wurde nie angelegt (gemessen am 2026-09-27:
-- es gibt nur `vendor_pool`). Beide Wege werfen, und die Routen
-- `GET/POST /suppliers/:vpId/notes` fangen den Wurf nicht — wer eine Notiz zu
-- einem Lieferanten schreiben oder lesen wollte, bekam eine 500.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WARUM DIESE TABELLE ANGELEGT WIRD, DIE VERLAUFSTABELLE ABER NICHT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Dieselbe Welle behebt `vendor_pool_history` durch ENTFERNEN: die Aenderungen
-- stehen schon im Audit-Log (`vendor_pool.tier_change`/`status_change` mit
-- Akteur, altem und neuem Wert und Grund), eine zweite Verlaufstabelle daneben
-- waere die Parallelstruktur, die dieses Projekt verbietet.
--
-- Bei Notizen ist es umgekehrt, und die Unterscheidung ist nicht Geschmack:
--
--   Das Audit-Log ist ein PROTOKOLL VON HANDLUNGEN. Es haelt fest, DASS jemand
--   etwas getan hat. Eine Notiz ist INHALT — sie ist der Gegenstand selbst, kein
--   Vermerk darueber. Der Audit-Eintrag `vendor_pool.note_added` schneidet den
--   Text ausserdem bei 200 Zeichen ab; er ist als Beleg gedacht, nicht als
--   Speicher. Inhalt im Protokoll zu halten hiesse, ein Protokoll aenderbar zu
--   machen (Notizen werden korrigiert, Protokolle nicht).
--
-- `vendor_pool.notes` (eine Textspalte, existiert) ist ebenfalls kein Ersatz: sie
-- traegt EINEN Text ohne Verfasser und ohne Reihenfolge. Was die Routen und die
-- Doku beschreiben, ist ein chronologischer Verlauf mit Autor
-- (api/docs/PREFERRED_VENDOR.md: "Notes: vendor_pool_notes (chronologische
-- Kommentare)"). Das ist die Zusammenarbeit zweier Menschen an einem
-- Lieferantenverhaeltnis, nicht ein Feld.
--
-- ZUM AUFBAU: uuid als Schluessel wie in allen juengeren Tabellen dieses
-- Projekts. Anders als bei `feature_overrides` in Z4 gibt es hier keine aeltere
-- Migration, nach der sich der Nachtrag richten muesste — `vendor_pool_notes`
-- wird von KEINER Migration deklariert, also ist die junge Bauart die richtige.
-- Der Code stellt keine Anforderung an den Typ (er liest `RETURNING *`).
--
-- Der Verfasser darf verschwinden (ON DELETE SET NULL): die Notiz bleibt
-- nachvollziehbar, auch wenn das Konto geloescht wird. Der Lieferanteneintrag
-- dagegen nimmt seine Notizen mit (ON DELETE CASCADE) — ohne ihn beschreiben sie
-- nichts mehr.
--
-- ROLLBACK / RUECKNAHME:
--   DROP TABLE IF EXISTS vendor_pool_notes;
--   -- Notizen sind damit fort. Der Audit-Eintrag `vendor_pool.note_added`
--   -- belegt weiterhin, DASS es sie gab (mit den ersten 200 Zeichen).
-- =============================================================================

SET client_min_messages TO WARNING;

BEGIN;

CREATE TABLE IF NOT EXISTS vendor_pool_notes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_pool_id UUID NOT NULL REFERENCES vendor_pool(id) ON DELETE CASCADE,
  -- Das Konto darf gehen, die Notiz bleibt lesbar.
  author_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  note_text      TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- `addNote` weist leeren Text an der Eingangsgrenze ab; die Datenbank haelt
  -- dieselbe Regel, damit kein anderer Weg sie umgeht (Schutz durch Struktur).
  CONSTRAINT vendor_pool_notes_text_nicht_leer CHECK (length(btrim(note_text)) > 0)
);

-- `listNotes` liest nach Eintrag, absteigend nach Zeit. Genau so der Index:
-- bei 300 Kunden mit je einem Dutzend Lieferanten und Notizen ueber Jahre ist
-- das der Unterschied zwischen einem Griff und einem vollen Durchlauf.
CREATE INDEX IF NOT EXISTS vendor_pool_notes_eintrag_zeit_idx
  ON vendor_pool_notes (vendor_pool_id, created_at DESC);

COMMENT ON TABLE vendor_pool_notes IS
  'Z6: chronologische Notizen zu einem Lieferanteneintrag, mit Verfasser. INHALT - nicht zu verwechseln mit dem Audit-Log, das nur festhaelt, DASS eine Notiz angelegt wurde (und den Text bei 200 Zeichen abschneidet).';

COMMIT;
