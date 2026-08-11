-- 176_einladung_kennt_das_profil.sql
-- P10 Spur D / Welle D5 — die Einladung weiss, wen sie meint
--
-- WARUM DIESE MIGRATION
-- Seit Migration 175 kann ein Mitarbeiter erfasst sein, ohne ein Konto zu haben.
-- Damit faellt die einzige Klammer weg, die Einladung und Profil bisher
-- zusammenhielt: die E-Mail-Adresse.
--
-- `worker_invites` trug nie einen Profilbezug. `acceptInvite` legt beim Annehmen
-- ein Profil an:
--
--   INSERT INTO worker_profiles (user_id, ...) VALUES (<frisches Konto>, ...)
--   ON CONFLICT (user_id) DO UPDATE ...
--
-- Der Konflikt greift nur, wenn schon ein Profil mit GENAU dieser user_id
-- existiert. Bei einem frisch erzeugten Konto ist das nie der Fall. Fuer einen
-- Menschen, der bereits als kontoloses Profil in der Datenbank steht, entstuende
-- also ein ZWEITES Profil — und das erste bliebe verwaist zurueck: mit seiner
-- Personalnummer, seiner Anschrift, seinen Notizen, aber ohne Verbindung zu dem
-- Konto, das gerade fuer ihn angelegt wurde.
--
-- Zwei Datensaetze fuer denselben Menschen sind in einer Personalakte kein
-- Schoenheitsfehler. Sie fallen erst auf, wenn jemand sich wundert, warum die
-- Qualifikationsnachweise fehlen.
--
-- WAS DIESE SPALTE TUT
-- Sie haelt fest, WEN eine Einladung meint — unabhaengig von der Adresse, an die
-- sie geschickt wird. Beim Annehmen wird das vorhandene Profil mit dem neuen
-- Konto verbunden, statt ein neues anzulegen.
--
-- NULLBAR, weil die grosse Mehrheit der Einladungen weiterhin ohne Profilbezug
-- entsteht (jemand wird eingeladen, den es noch gar nicht gibt). Der Bezug ist
-- eine Praezisierung, keine neue Pflicht.
--
-- ON DELETE CASCADE: verschwindet das Profil, ist die Einladung darauf
-- gegenstandslos. Eine Einladung, die auf ein geloeschtes Profil zeigt, waere
-- eine Falle — sie wuerde beim Annehmen ins Leere greifen.
--
-- ROLLBACK
--   DROP INDEX IF EXISTS worker_invites_profil_idx;
--   ALTER TABLE worker_invites DROP COLUMN IF EXISTS worker_profile_id;

SET client_min_messages TO WARNING;

BEGIN;

ALTER TABLE worker_invites
  ADD COLUMN IF NOT EXISTS worker_profile_id UUID
  REFERENCES worker_profiles(id) ON DELETE CASCADE;

COMMENT ON COLUMN worker_invites.worker_profile_id IS
  'Das gemeinte Profil, falls die Einladung an einen bereits erfassten Mitarbeiter geht (P10/D5). Beim Annehmen wird dieses Profil mit dem neuen Konto verbunden, statt ein zweites anzulegen. NULL = Einladung an jemanden, der noch nicht erfasst ist.';

-- Lesepfad: der Einladungsstatus in der Mitarbeiterliste haengt daran.
CREATE INDEX IF NOT EXISTS worker_invites_profil_idx
  ON worker_invites (worker_profile_id)
  WHERE worker_profile_id IS NOT NULL;

/*
 * Hoechstens eine OFFENE Einladung je Profil. Ohne diese Sicherung koennte ein
 * Disponent denselben Mitarbeiter mehrfach einladen; nimmt er zwei davon an,
 * entstuenden zwei Konten, von denen nur eines verbunden werden kann — und
 * welches, entschiede der Zufall der Reihenfolge.
 */
CREATE UNIQUE INDEX IF NOT EXISTS worker_invites_ein_offener_je_profil_idx
  ON worker_invites (worker_profile_id)
  WHERE worker_profile_id IS NOT NULL AND status = 'pending';

COMMENT ON INDEX worker_invites_ein_offener_je_profil_idx IS
  'Hoechstens eine offene Einladung je Profil — zwei angenommene Einladungen ergaeben zwei Konten fuer denselben Menschen, und nur eines liesse sich verbinden.';

COMMIT;
