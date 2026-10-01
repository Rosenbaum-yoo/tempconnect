-- =============================================================================
-- Y3 · DIE VIER STADIEN EINES ARBEITERS — ZWEI HATTEN KEIN BEISPIEL
-- =============================================================================
-- Welle Y, Abschnitt Y3.1 und Y3.3 (docs/features/Y_PROBEBUEHNE.md).
--
-- GEMESSEN AM 2026-10-01, Stadium für Stadium:
--
--   1. eingeladen, aber nicht registriert   **0**  — sechs Einladungen existieren,
--                                                   ALLE abgelaufen
--   2. registriert ohne Fähigkeiten          34    — vorhanden (Y1.4 liefert vier
--                                                   davon absichtlich)
--   3. vollständig MIT Nachweis             **0**  — `worker_profile_documents`
--                                                   hat NULL Zeilen, im ganzen
--                                                   Bestand kein einziger Nachweis
--   4. im Einsatz                            15    — vorhanden
--
-- Zwei von vier Stadien sind nicht vorführbar. Das erste ist besonders
-- aufschlussreich: Einladungen GIBT es, sie sind nur alle verfallen. Der
-- Zustand „eingeladen, wartet" — der einzige, in dem die Einladungsfläche
-- überhaupt etwas zeigt — hat kein Beispiel. Dieselbe Klasse wie die zwölf
-- unbesetzten Zustände aus Y1.3: nicht fehlende Daten, sondern ein fehlender
-- ZUSTAND.
--
-- Und `worker_profile_documents` ist leer. Seit N8.1b muss ein Nachweis einen
-- KATALOGBEZUG tragen — geprüft wird das über `qualification_name` gegen
-- `platform_skills` (`assignmentStaffingService` liest
-- `LOWER(COALESCE(qualification_name, title))`). Ein Nachweis mit freiem Text
-- erfüllt die Pflicht nicht. Es gab bisher keinen einzigen Fall, an dem sich das
-- zeigen ließ.
--
-- -----------------------------------------------------------------------------
-- KEIN GEHEIMNIS IN DIESER DATEI, und beim Einladungs-Token ist das heikler als
-- beim Passwort: `worker_invites.token` ist der ROHE Token, mit dem jemand ein
-- Konto anlegen kann. Stünde er hier, wäre er in einem öffentlichen Repo ein
-- gültiger Zugangsschlüssel.
--
-- Deshalb entsteht er BEIM LADEN aus `gen_random_bytes(32)`, und `token_hash`
-- ist sein SHA-256 — genau die Form, die der Code erwartet
-- (`crypto.createHash("sha256")…digest("hex")`). Er wird nicht ausgegeben: die
-- Einladung ist damit als ZUSTAND vorführbar, aber von niemandem einlösbar. Wer
-- sie einlösen will, schickt sie über die Oberfläche neu — dafür ist der
-- Erneut-senden-Weg da.
--
-- Kennungen beginnen mit `b5` (hex-gültig).
-- =============================================================================

BEGIN;

-- ── SPERRE (2026-10-01) ──────────────────────────────────────────────────────
DO $sperre_saat$
BEGIN
  IF current_setting('app.seed_demo_world', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION
      'y3-arbeiterstadien.sql: SEED_DEMO_WORLD nicht aktiv - Saat verweigert. Anmeldbare Demo-Konten entstehen nur mit ausdruecklich gesetztem Schalter (prod-sicher).';
  END IF;
END $sperre_saat$;
-- ─────────────────────────────────────────────────────────────────────────────

DO $voraussetzungen$
BEGIN
  IF coalesce(current_setting('app.seed_passwort', true), '') = '' THEN
    RAISE EXCEPTION
      'y3-arbeiterstadien.sql: app.seed_passwort ist nicht gesetzt. Diese Saat traegt ABSICHTLICH kein Passwort im Repo (Y6.3) und kennt keine Vorgabe.';
  END IF;
  IF length(current_setting('app.seed_passwort', true)) < 12 THEN
    RAISE EXCEPTION
      'y3-arbeiterstadien.sql: app.seed_passwort ist kuerzer als 12 Zeichen.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
    RAISE EXCEPTION
      'y3-arbeiterstadien.sql: pgcrypto fehlt - ohne gen_random_bytes() muesste der Einladungs-Token in der Datei stehen, und das waere ein gueltiger Zugangsschluessel im Repo.';
  END IF;
  -- Die Belegschaft aus Y1.4 ist die Grundlage: Stadium 3 haengt an einer ihrer
  -- Kraefte, Stadium 1 an ihrer Organisation.
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = 'b1000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION
      'y3-arbeiterstadien.sql: Hanse Personal Service GmbH fehlt. Diese Saat baut auf der Belegschaft aus y1-4-belegschaft.sql (Y1.4) auf - bitte diese zuerst laden.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM worker_profiles WHERE id = 'b1000000-0000-4000-8000-00000000d001') THEN
    RAISE EXCEPTION
      'y3-arbeiterstadien.sql: die Kraft d001 (Jonas Harms) fehlt. Stadium 3 haengt an ihr - y1-4-belegschaft.sql zuerst laden.';
  END IF;
END $voraussetzungen$;

-- =============================================================================
-- STADIUM 1 · EINGELADEN, ABER NICHT REGISTRIERT
-- =============================================================================
-- Eine OFFENE Einladung mit Laufzeit in der Zukunft. Die sechs vorhandenen sind
-- alle verfallen; eine verfallene Einladung zeigt in der Oberfläche den
-- Verfall, nicht das Warten.
INSERT INTO worker_invites
  (id, supplier_org_id, invited_by, email, first_name, last_name, personnel_number,
   token, token_hash, expires_at, status, last_sent_at)
SELECT
  'b5000000-0000-4000-8000-00000000e001',
  'b1000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-00000000c001',          -- der Disponent lädt ein
  'neue.kraft@hanse.probebuehne.tempconnect.de',
  'Mirjam', 'Scholz', 'HPS-013',
  t.roh,
  encode(digest(t.roh, 'sha256'), 'hex'),
  now() + interval '14 days',
  'pending',
  now() - interval '2 days'
FROM (SELECT encode(gen_random_bytes(32), 'hex') AS roh) t
ON CONFLICT (id) DO UPDATE SET
  -- Beim Wiederholen bleibt der Token, der schon da ist: ein neuer wuerde einen
  -- etwaigen verschickten Link ungueltig machen. Nur die Laufzeit wird frisch,
  -- damit die Einladung nicht mit der Zeit verfaellt und das Stadium verliert.
  expires_at = now() + interval '14 days',
  status = 'pending',
  accepted_at = NULL,
  last_sent_at = now() - interval '2 days';

-- =============================================================================
-- STADIUM 3 · VOLLSTÄNDIG, MIT GEPRÜFTEM NACHWEIS UND KATALOGBEZUG
-- =============================================================================
-- Jonas Harms (d001) ist die Kraft, die im Markt sichtbar ist und die Fähigkeit
-- „Lagerhelfer:in" trägt. Sein Nachweis belegt GENAU DIESE Fähigkeit — das ist
-- der Katalogbezug: `qualification_name` entspricht dem Katalognamen, nicht
-- einem freien Text.
--
-- Er braucht dafür ein Konto: `worker_profile_documents.worker_user_id` ist
-- NOT NULL und zeigt auf `users`, nicht auf das Profil.
INSERT INTO users (id, role, email, password_hash, contact_person, is_verified, org_id, is_demo)
VALUES (
  'b5000000-0000-4000-8000-00000000c001', 'worker',
  'kraft01@hanse.probebuehne.tempconnect.de',
  crypt(current_setting('app.seed_passwort'), gen_salt('bf', 10)),
  'Jonas Harms', TRUE,
  'b1000000-0000-4000-8000-000000000001', TRUE
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  password_hash = EXCLUDED.password_hash,
  contact_person = EXCLUDED.contact_person,
  is_verified = EXCLUDED.is_verified,
  org_id = EXCLUDED.org_id,
  is_demo = EXCLUDED.is_demo;

INSERT INTO org_memberships (user_id, org_id, role_key, is_active)
VALUES ('b5000000-0000-4000-8000-00000000c001',
        'b1000000-0000-4000-8000-000000000001', 'worker', TRUE)
ON CONFLICT (user_id, org_id) DO UPDATE SET
  role_key = EXCLUDED.role_key, is_active = EXCLUDED.is_active;

-- Das Profil bekommt sein Konto. Die Personalnummer bleibt — eine
-- Zeitarbeitsfirma fuehrt ihre Leute mit Nummer, mit oder ohne Zugang.
UPDATE worker_profiles
   SET user_id = 'b5000000-0000-4000-8000-00000000c001',
       updated_at = now()
 WHERE id = 'b1000000-0000-4000-8000-00000000d001'
   AND (user_id IS NULL OR user_id = 'b5000000-0000-4000-8000-00000000c001');

-- Der Nachweis. `qualification_name` MUSS einem freigegebenen Katalognamen
-- entsprechen - deshalb wird er aus `platform_skills` gelesen und nicht
-- geschrieben. Ein Tippfehler wuerde sonst den Katalogbezug lautlos verlieren.
INSERT INTO worker_profile_documents
  (id, worker_user_id, supplier_org_id, category, title, qualification_name,
   issuer, valid_from, valid_until, status, uploaded_by, verified_by, verified_at, notes)
SELECT
  'b5000000-0000-4000-8000-00000000f001',
  'b5000000-0000-4000-8000-00000000c001',
  'b1000000-0000-4000-8000-000000000001',
  'qualification',
  'Qualifikationsnachweis ' || ps.name,
  ps.name,
  'Berufsgenossenschaft Handel und Warenlogistik',
  CURRENT_DATE - 400, CURRENT_DATE + 330,
  'verified',
  'b1000000-0000-4000-8000-00000000c001',
  'b1000000-0000-4000-8000-00000000c001',
  now() - interval '395 days',
  'Probebuehne Y3.3: Nachweis MIT Katalogbezug - qualification_name entspricht der Katalog-Faehigkeit, nicht freiem Text.'
  FROM platform_skills ps
 WHERE ps.name = 'Lagerhelfer:in' AND ps.is_active AND ps.status = 'approved'
ON CONFLICT (id) DO UPDATE SET
  qualification_name = EXCLUDED.qualification_name,
  status = EXCLUDED.status,
  valid_from = EXCLUDED.valid_from,
  valid_until = EXCLUDED.valid_until,
  verified_at = EXCLUDED.verified_at;

-- Notbremse: haben die zwei fehlenden Stadien jetzt wirklich ein Beispiel? Ohne
-- diese Pruefung koennte eine nicht gefundene Katalog-Faehigkeit die Saat
-- erfolgreich durchlaufen lassen - und Stadium 3 bliebe leer, waehrend der Lauf
-- gruen meldet.
DO $vollstaendig$
DECLARE fehlt text[] := '{}';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM worker_invites
     WHERE status = 'pending' AND accepted_at IS NULL AND expires_at > now()
  ) THEN fehlt := fehlt || 'Stadium 1: keine OFFENE, unverfallene Einladung'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM worker_profile_documents d
     WHERE d.status = 'verified'
       AND EXISTS (SELECT 1 FROM platform_skills ps
                    WHERE lower(ps.name) = lower(d.qualification_name)
                      AND ps.is_active AND ps.status = 'approved')
  ) THEN fehlt := fehlt || 'Stadium 3: kein geprueffter Nachweis MIT Katalogbezug'; END IF;

  IF array_length(fehlt, 1) > 0 THEN
    RAISE EXCEPTION
      'y3-arbeiterstadien.sql: nach der Saat fehlen weiter: %. Vermutlich wurde die Katalog-Faehigkeit "Lagerhelfer:in" nicht gefunden (umbenannt oder nicht freigegeben) - dann legt die INSERT..SELECT lautlos keine Zeile an.', array_to_string(fehlt, '; ');
  END IF;
END $vollstaendig$;

COMMIT;
