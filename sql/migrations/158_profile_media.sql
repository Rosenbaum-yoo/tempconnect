-- 158: Profil-Medien (P7b) — Worker-Profilfoto + Firmenfoto
--
-- worker_profiles.photo_file_ref/photo_mime: Profilfoto des Arbeitnehmers.
--   Personenbezogen — wird NIE statisch ausgeliefert (app.js blockt
--   /uploads/worker-photos), nur ueber die autorisierte Route
--   GET /api/worker/me/photo. Erscheint NICHT in anonymen Angeboten
--   (Leitplanke "anonym bis Deal", Multi-Skill-Doku §6).
-- company_profiles.photo_url: Firmen-/Standortfoto fuers oeffentliche
--   Firmenprofil (bewusst oeffentlich, statisch unter /uploads/company-media).
--
-- Additiv + idempotent. Rollback: die drei Spalten droppen; Dateien unter
-- uploads/worker-photos bzw. uploads/company-media manuell entfernen.

ALTER TABLE worker_profiles  ADD COLUMN IF NOT EXISTS photo_file_ref TEXT;
ALTER TABLE worker_profiles  ADD COLUMN IF NOT EXISTS photo_mime     TEXT;
ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS photo_url      TEXT;
