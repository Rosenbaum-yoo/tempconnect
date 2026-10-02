-- =============================================================================
-- Y4 · DIE DREI GETRENNTEN FLÄCHEN — ALLE DREI ZUGÄNGE LIEGEN AUF EINEM KONTO
-- =============================================================================
-- Welle Y, Abschnitt Y4.1 (docs/features/Y_PROBEBUEHNE.md).
--
-- GEMESSEN AM 2026-10-02 gegen die laufende Datenbank:
--
--   tempconnect_staff    1 Zeile    dennisstegemann04@gmail.com
--   occ_owner_access     1 Zeile    dennisstegemann04@gmail.com
--   support_agents       2 Zeilen   dennisstegemann04@gmail.com  +  demo@firma.de
--
-- Das ist nicht „wenig Daten". Das ist EIN KONTO. Wer das Staff Control Center
-- durchspielen will, meldet sich mit der echten Owner-Adresse an — und hält im
-- selben Atemzug das Owner Control Center UND das Support Center. Der Plan
-- verlangt das Gegenteil, wörtlich: „Die drei Flächen sind EINZELN
-- durchspielbar." Einzeln heißt: ein Zugang zeigt eine Fläche und beweist durch
-- sein Scheitern, dass die beiden anderen zu sind. Mit einem Konto, das alle
-- drei hält, ist genau dieser Beweis nicht führbar — man sieht überall alles und
-- erfährt nie, ob das an der Berechtigung liegt oder an deren Abwesenheit.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DER SCHÄRFERE BEFUND: FÜNF VON SECHS STAFF-ROLLEN HABEN KEIN BEISPIEL
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `api/config/staffRollen.js` trennt sechs Rollen scharf und nachlesbar:
--
--   staff_admin        alles, einschließlich der Staff-Verwaltung selbst
--   staff_member       alles AUSSER staff-access / staff-members
--   staff_commercial   commercial, pilots, preregistrations, audit
--   staff_ops          operations, hetzner, automation, platform, audit
--   staff_support      support, moderation, audit
--   staff_audit        sieht alles, schreibt nichts (NUR_LESEND)
--
-- Besetzt ist davon heute: `staff_member`, einmal. Die anderen fünf sind
-- dokumentiert, indiziert, von `darfStaffBereich()` ausgewertet — und nie
-- vorgeführt. Das ist dieselbe Fehlerklasse wie die zwölf unbesetzten Zustände
-- aus Y1.3: nicht fehlende Daten, sondern ein fehlender ZUSTAND. Eine
-- Einschränkung, die nie jemand getragen hat, ist eine Behauptung.
--
-- Der Kommentar in `staffRollen.js` benennt den Vorgänger dieses Befunds und ist
-- der Grund, hier nicht nur drei Zugänge anzulegen: Migration 118 legte die
-- Spalte an, dokumentierte sechs Werte — „und niemand liest die Spalte". Gelesen
-- wird sie seit 2026-08-24. GETRAGEN wurde sie bis heute von einem einzigen
-- Wert. Deshalb legt diese Saat je Rolle ein Konto an: danach ist jede
-- Einschränkung durchspielbar, und Y6.1 („die Besetzung ist vollständig") hat
-- für die Staff-Rollen eine Grundlage.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WAS DIESE SAAT BEWUSST NICHT ANFASST
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 1. `demo@firma.de` ist ein KUNDENKONTO (`users.role = 'company'`, eine
--    Org-Mitgliedschaft) und hält gleichzeitig einen externen Support-Zugang
--    (`external_support_agent`, Lieferant „India Support BPO"). Das ist kein
--    Link von der Plattform ins Support Center — es ist ein MENSCH in zwei
--    Welten, und der Wächter für Y4.2 prüft Links, nicht Konten. Befund
--    gemeldet in `docs/UEBERGABE.md`; geändert wird er hier nicht, weil er einen
--    bestehenden Demo-Weg betrifft.
--
-- 2. Die Owner-Zeile hat `requires_step_up = FALSE`. Das eine Konto, das im
--    Staff Control Center alles darf, ist damit auch das einzige, das vor einer
--    schreibenden Aktion nichts erneut bestätigt. Die Bühnen-Konten hier tragen
--    `TRUE` — die Vorgabe der Spalte, nicht die Ausnahme des Owners. Ob die
--    Owner-Zeile nachzieht, ist eine Entscheidung über den eigenen Anmeldeweg
--    und gehört dem Owner.
--
-- 3. `occ_owner_access` kennt kein Ablaufdatum, nur `revoked_at`. Für
--    `tempconnect_staff` prüft die Middleware seit 2026-08-22 wirklich
--    `expires_at` — diese Saat nutzt das (siehe unten). Für die Owner-Fläche
--    gibt es nichts zu nutzen. Auch das steht in `docs/UEBERGABE.md`: eine
--    Spalte nachzurüsten wäre eine Migration am privilegiertesten Tor des
--    Systems.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DIE SICHERHEITSEIGENSCHAFT DIESER SAAT
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Eine Saat, die Staff-Zugänge anlegt, ist gefährlicher als eine, die Rechnungen
-- anlegt. Drei Dinge halten sie klein:
--
--   * Die SPERRE unten — ohne `app.seed_demo_world = true` läuft nichts.
--   * Das PASSWORT kommt aus `app.seed_passwort` und steht nirgends im Repo
--     (Y6.3). Ohne gesetzten Wert verweigert die Saat.
--   * Jeder Staff-Zugang LÄUFT AB: `expires_at = NOW() + INTERVAL '180 days'`.
--     Relativ, also Y6.2-konform — und vor allem: ein Bühnen-Zugang, der
--     vergessen wird, wird von selbst wertlos. Die Middleware prüft das im
--     `WHERE`, beide Tore (Anmeldung und Zugriff). Wer die Bühne weiter braucht,
--     lädt die Saat erneut; das ist die Verlängerung.
--
-- Und die Trennung selbst ist eine EIGENSCHAFT DER DATEN, nicht eine Absicht:
-- die Notbremse am Ende weist die Saat zurück, wenn irgendein Bühnen-Konto zwei
-- der drei Flächen hält. Ein Konto, das man „nur kurz" für zwei Flächen nutzt,
-- kann hier nicht entstehen.
--
-- `users.role` kennt übrigens KEINEN internen Wert — erlaubt sind nur
-- `company`, `agency`, `worker`. Intern wird man nicht durch die Rolle, sondern
-- durch die Nebentabelle. Die Owner-Zeile ist aus demselben Grund
-- `role = 'company'`. Die Bühnen-Konten hier sind deshalb `company` OHNE
-- Organisation und OHNE Mitgliedschaft — genau das unterscheidet sie von einem
-- Kunden, und genau das prüft die Notbremse.
--
-- Kennungen beginnen mit `bd` (hex-gültig).
-- =============================================================================

BEGIN;

-- ── SPERRE (2026-10-02) ──────────────────────────────────────────────────────
DO $sperre_saat$
BEGIN
  IF current_setting('app.seed_demo_world', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION
      'y4-flaechen.sql: SEED_DEMO_WORLD nicht aktiv - Saat verweigert. Diese Saat legt INTERNE Zugaenge an (Staff Control Center, Support Center, Owner Control Center) und laeuft nur mit ausdruecklich gesetztem Schalter (prod-sicher).';
  END IF;
END $sperre_saat$;
-- ─────────────────────────────────────────────────────────────────────────────

DO $voraussetzungen$
BEGIN
  IF coalesce(current_setting('app.seed_passwort', true), '') = '' THEN
    RAISE EXCEPTION
      'y4-flaechen.sql: app.seed_passwort ist nicht gesetzt. Diese Saat traegt ABSICHTLICH kein Passwort im Repo (Y6.3) und kennt keine Vorgabe.';
  END IF;
  IF length(current_setting('app.seed_passwort', true)) < 12 THEN
    RAISE EXCEPTION
      'y4-flaechen.sql: app.seed_passwort ist kuerzer als 12 Zeichen.';
  END IF;
END $voraussetzungen$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · DIE NEUN KONTEN
-- ─────────────────────────────────────────────────────────────────────────────
-- Der Zweck steht vor dem Klammeraffen. `staff.` ist das Staff Control Center,
-- `support.` das Support Center, `owner.` die Owner-Sicht — wer die Adresse
-- liest, weiss, welche Flaeche er oeffnet.
--
-- KEINE Organisation, KEINE Mitgliedschaft, KEIN customer_stage: diese Menschen
-- sind nicht Kunden. Das ist nicht Kosmetik, sondern die Pruefbarkeit von Y4.2
-- auf der Datenseite.

INSERT INTO users (id, role, email, password_hash, company_name, contact_person, is_verified, org_id, is_demo)
SELECT
  ('bd000000-0000-4000-8000-00000000f0' || o.nr)::uuid,
  'company',
  o.mail,
  crypt(current_setting('app.seed_passwort'), gen_salt('bf', 10)),
  'TempConnect (intern)',
  o.person,
  TRUE,
  NULL,
  TRUE
FROM (VALUES
  ('01', 'staff.admin@probebuehne.tempconnect.de',     'Katrin Lohse'),
  ('02', 'staff.team@probebuehne.tempconnect.de',      'Jens Marquardt'),
  ('03', 'staff.kommerz@probebuehne.tempconnect.de',   'Svenja Bartels'),
  ('04', 'staff.betrieb@probebuehne.tempconnect.de',   'Tarek Nasser'),
  ('05', 'staff.support@probebuehne.tempconnect.de',   'Lena Vogt'),
  ('06', 'staff.aufsicht@probebuehne.tempconnect.de',  'Hartmut Eilers'),
  ('07', 'support.leitung@probebuehne.tempconnect.de', 'Ruben Feldt'),
  ('08', 'support.fall@probebuehne.tempconnect.de',    'Mira Osei'),
  ('09', 'owner.sicht@probebuehne.tempconnect.de',     'Antonia Reeb')
) AS o(nr, mail, person)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  password_hash = EXCLUDED.password_hash,
  company_name = EXCLUDED.company_name,
  contact_person = EXCLUDED.contact_person,
  is_verified = TRUE,
  org_id = NULL,
  is_demo = TRUE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · STAFF CONTROL CENTER — SECHS ROLLEN, SECHS KONTEN
-- ─────────────────────────────────────────────────────────────────────────────
-- Anmeldung: POST /staff/api/auth/login (eigene Sitzung, eigenes Cookie
-- `tc.staff.sid`) mit Mailadresse + dem Saat-Passwort. Danach /staff/.
--
-- `requires_step_up = TRUE` ist die Vorgabe der Spalte und bleibt stehen. Das
-- kostet die Buehne NICHTS: der Step-up ist eine PASSWORT-Wiedereingabe
-- (staffControlCenter.js, `bcrypt.compare` gegen `users.password_hash`), kein
-- TOTP. Ein TOTP-Geheimnis duerfte in keiner Saat stehen; ein Passwort, das der
-- Lader kennt, schon. Die Buehne ist damit vollstaendig durchspielbar UND
-- traegt die scharfe Einstellung.
--
-- `expires_at` ist der eigentliche Schutz dieser Saat — siehe Kopf.

-- DIE SAAT IST MASSGEBLICH, UND ZWAR IN BEIDE RICHTUNGEN.
--
-- BEFUND 2026-10-02, gefunden durch eine Rueckmutation, die NICHT ansprang:
-- Nimmt man ein Konto aus dieser Datei heraus, VERLIERT ES SEINEN ZUGANG NICHT.
-- Der Einfuege-Befehl legt an und aendert; er raeumt nicht auf. Eine Zeile, die
-- niemand mehr haben will, bleibt stehen — bei einer Saat fuer Rechnungen ist
-- das Datenmuell, bei einer Saat fuer STAFF-ZUGAENGE ist es eine Hintertuer.
--
-- Deshalb widerruft der folgende Befehl jeden Buehnen-Zugang, den DIESE Datei
-- nicht (mehr) nennt. Die Menge der gewollten Kennungen kommt aus dem
-- `RETURNING` des Einfuege-Befehls selbst — nicht aus einer zweiten Liste
-- daneben, denn eine zweite Liste ist genau die Drift, die hier behoben wird.
--
-- WIDERRUFEN UND NICHT GELOESCHT, aus zwei Gruenden. Erstens traegt die Tabelle
-- `revoked_at`, und die Middleware prueft es im WHERE — ein Widerruf ist also
-- wirksam. Zweitens hinterlaesst er eine Spur: der Zustand „Staff-Zugang
-- widerrufen" hatte im ganzen Bestand kein Beispiel (gemessen: die einzige
-- Zeile ist nicht widerrufen). Ein Aufraeumen, das nebenbei einen fehlenden
-- Zustand besetzt, ist mehr wert als ein DELETE.
--
-- Der Geltungsbereich ist der Kennungs-Praefix der Buehne. Eine echte
-- Staff-Zeile kann dieser Befehl nicht erreichen.
WITH gewollt AS (
INSERT INTO tempconnect_staff (user_id, email, display_name, role, is_active, requires_step_up, expires_at, access_reason, notes)
SELECT
  u.id,
  u.email,
  r.anzeige,
  r.rolle,
  TRUE,
  TRUE,
  NOW() + INTERVAL '180 days',
  'Probebuehne Welle Y4.1 - je ein Zugang pro Staff-Rolle, damit die Einschraenkungen aus staffRollen.js vorfuehrbar sind',
  r.zweck
FROM (VALUES
  ('01', 'staff_admin',      'Bühne · Staff-Admin',   'Die EINZIGE Rolle, die Staff-Zugaenge vergeben darf (NUR_ADMIN: staff-access, staff-members).'),
  ('02', 'staff_member',     'Bühne · Teammitglied',  'Vollwertiges Teammitglied - alles ausser der Staff-Verwaltung. Die heute einzige besetzte Rolle.'),
  ('03', 'staff_commercial', 'Bühne · Kommerz',       'Geld, Vertraege, Kunden, Piloten. Darf den Betrieb NICHT sehen - das ist der Beweis.'),
  ('04', 'staff_ops',        'Bühne · Betrieb',       'Betrieb, Hetzner, Automation, Plattform. Darf Kommerz NICHT sehen.'),
  ('05', 'staff_support',    'Bühne · Support',       'Support und Moderation. Nicht zu verwechseln mit dem Support CENTER - das ist eine andere Flaeche.'),
  ('06', 'staff_audit',      'Bühne · Aufsicht',      'Sieht alles, schreibt nichts. Jeder POST endet mit NUR_LESEND.')
) AS r(nr, rolle, anzeige, zweck)
JOIN users u ON u.id = ('bd000000-0000-4000-8000-00000000f0' || r.nr)::uuid
ON CONFLICT (user_id) DO UPDATE SET
  email = EXCLUDED.email,
  display_name = EXCLUDED.display_name,
  role = EXCLUDED.role,
  is_active = TRUE,
  requires_step_up = TRUE,
  revoked_at = NULL,
  expires_at = EXCLUDED.expires_at,
  access_reason = EXCLUDED.access_reason,
  notes = EXCLUDED.notes
RETURNING user_id
)
UPDATE tempconnect_staff s
   SET is_active = FALSE,
       revoked_at = NOW(),
       notes = coalesce(s.notes, '') || ' | widerrufen: steht nicht mehr in y4-flaechen.sql'
 WHERE s.user_id::text LIKE 'bd000000-0000-4000-8000-00000000f0%'
   AND s.revoked_at IS NULL
   AND s.user_id NOT IN (SELECT user_id FROM gewollt);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3 · SUPPORT CENTER — ZWEI DATENREICHWEITEN
-- ─────────────────────────────────────────────────────────────────────────────
-- Zwei Konten und nicht eines, weil `data_scope` die eigentliche Zusage des
-- Support Centers ist: `full_internal` sieht alle Faelle, `assigned_only` nur
-- die zugewiesenen. Mit EINEM Zugang ist nicht pruefbar, ob die Verengung
-- verengt — man sieht eine Liste und hat keinen Vergleich. Mit zwei Zugaengen
-- ist der Vergleich der Beweis.
--
-- `allowed_queues` / `allowed_case_types` / `allowed_actions` bleiben leer: der
-- Code liest leer als „die Vorgaben der Rolle" (`supportAccess.js`:
-- `actions.length > 0 ? actions : defaultSupportActions(role)`). Eine
-- ausgeschriebene Liste waere hier eine Abschrift, die beim naechsten
-- Rollen-Umbau still falsch wird.
--
-- `scope = 'internal'`, also KEIN Lieferant - der CHECK verlangt einen nur bei
-- `external`. Der externe Weg hat heute einen Halter (demo@firma.de); dass das
-- ein KUNDENKONTO ist, steht im Kopf und in docs/UEBERGABE.md.
--
-- `support_agents` hat keine Eindeutigkeit auf `user_id` - deshalb feste
-- Kennungen und ON CONFLICT (id). Ohne das legt jeder zweite Lauf Doppel an.

-- Auch hier gilt die Massgeblichkeit (siehe den langen Absatz beim Staff-Block).
-- ABER NICHT MIT DELETE, und das ist hier keine Stilfrage: SECHS Tabellen zeigen
-- auf `support_agents.id`, alle mit `ON DELETE SET NULL` —
-- `support_cases.assigned_to_agent_id`, `support_case_notes.author_agent_id`,
-- `support_case_events.actor_agent_id`, beide Spalten von
-- `support_escalations` und `support_audit_log.agent_id`. Ein DELETE wuerde
-- also still den AKTEUR EINES AUDIT-EINTRAGS auf NULL setzen. Ein Aufraeumen,
-- das ein Protokoll anonymisiert, ist schlimmer als die Zeile, die es aufraeumt.
-- `support_agents` hat kein `revoked_at`; der Widerruf ist `is_active = FALSE`,
-- und genau das prueft `supportAccess.js` (`AND sa.is_active = TRUE`).
WITH gewollt AS (
INSERT INTO support_agents (id, user_id, role, scope, vendor_id, data_scope, is_active)
SELECT
  ('bd000000-0000-4000-8000-00000000e0' || a.nr)::uuid,
  u.id,
  a.rolle,
  'internal',
  NULL,
  a.reichweite,
  TRUE
FROM (VALUES
  ('07', 'internal_support_lead',  'full_internal'),
  ('08', 'internal_support_agent', 'assigned_only')
) AS a(nr, rolle, reichweite)
JOIN users u ON u.id = ('bd000000-0000-4000-8000-00000000f0' || a.nr)::uuid
ON CONFLICT (id) DO UPDATE SET
  user_id = EXCLUDED.user_id,
  role = EXCLUDED.role,
  scope = 'internal',
  vendor_id = NULL,
  data_scope = EXCLUDED.data_scope,
  is_active = TRUE,
  updated_at = NOW()
RETURNING id
)
UPDATE support_agents sa
   SET is_active = FALSE, updated_at = NOW()
 WHERE sa.user_id::text LIKE 'bd000000-0000-4000-8000-00000000f0%'
   AND sa.is_active = TRUE
   AND sa.id NOT IN (SELECT id FROM gewollt);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4 · OWNER CONTROL CENTER — EINE ZWEITE SICHT, ABSICHTLICH NICHT „owner"
-- ─────────────────────────────────────────────────────────────────────────────
-- `occ_role` erlaubt `owner` und `co-owner`; das Tor
-- (`requireOwnerControlAccess`) unterscheidet sie NICHT — beide kommen gleich
-- weit. Die Buehne traegt trotzdem `co-owner`, denn die Zeile ist auch ein
-- Protokoll: wer sie in einem halben Jahr liest, soll nicht glauben, es habe
-- einen zweiten Eigentuemer gegeben.
--
-- Die Owner-Flaeche laeuft auf der NORMALEN Sitzung (`req.session.userId`), nicht
-- auf der Staff-Sitzung. Das ist beim Durchspielen der wichtigste Unterschied:
-- man meldet sich wie ein Kunde an und oeffnet /owner-control/.

-- Massgeblich wie die beiden Blöcke darueber. `occ_owner_access` traegt
-- `revoked_at`, und das Tor prueft es — hier ist der Widerruf also dasselbe
-- Mittel wie beim Staff-Zugang.
WITH gewollt AS (
INSERT INTO occ_owner_access (id, user_id, occ_role, notes)
SELECT
  'bd000000-0000-4000-8000-00000000d009'::uuid,
  u.id,
  'co-owner',
  'Probebuehne Welle Y4.1 - zweite Owner-Sicht, damit die Flaeche ohne die echte Owner-Adresse durchspielbar ist'
FROM users u WHERE u.id = 'bd000000-0000-4000-8000-00000000f009'::uuid
ON CONFLICT (user_id) DO UPDATE SET
  occ_role = 'co-owner',
  revoked_at = NULL,
  notes = EXCLUDED.notes
RETURNING user_id
)
UPDATE occ_owner_access o
   SET revoked_at = NOW(),
       notes = coalesce(o.notes, '') || ' | widerrufen: steht nicht mehr in y4-flaechen.sql'
 WHERE o.user_id::text LIKE 'bd000000-0000-4000-8000-00000000f0%'
   AND o.revoked_at IS NULL
   AND o.user_id NOT IN (SELECT user_id FROM gewollt);

-- ─────────────────────────────────────────────────────────────────────────────
-- NOTBREMSEN
-- ─────────────────────────────────────────────────────────────────────────────
-- Jede prueft eine ZUSAGE dieser Saat, nicht ihren eigenen Text. Eine Bremse,
-- die nur zaehlt, was die Zeile ueber ihr geschrieben hat, ist eine Quittung.

DO $vollstaendig$
DECLARE
  n int;
  rollen text[];
BEGIN
  /* 1 · Alle neun Konten sind anmeldbar. `$2` ist das bcrypt-Praefix; ohne
     diese Pruefung waere ein leeres `password_hash` ein stiller Ausfall, der
     erst beim Durchspielen auffaellt. */
  SELECT count(*) INTO n
    FROM users
   WHERE id::text LIKE 'bd000000-0000-4000-8000-00000000f0%'
     AND password_hash LIKE '$2%'
     AND is_verified = TRUE;
  IF n <> 9 THEN
    RAISE EXCEPTION 'y4-flaechen.sql: % von 9 Buehnen-Konten sind anmeldbar.', n;
  END IF;

  /* 2 · Keines dieser Konten ist Kunde. Das ist die Datenseite von Y4.2:
     interne Flaechen gehoeren nicht an ein Konto, das auch in der
     Kundenplattform zuhause ist. */
  SELECT count(*) INTO n
    FROM users u
   WHERE u.id::text LIKE 'bd000000-0000-4000-8000-00000000f0%'
     AND (u.org_id IS NOT NULL
          OR EXISTS (SELECT 1 FROM org_memberships m WHERE m.user_id = u.id));
  IF n <> 0 THEN
    RAISE EXCEPTION 'y4-flaechen.sql: % interne Buehnen-Konten haengen an einer Organisation. Ein interner Zugang gehoert nicht an ein Kundenkonto.', n;
  END IF;

  /* 3 · Alle sechs Staff-Rollen sind besetzt — gegen die Liste aus
     staffRollen.js, nicht gegen die VALUES-Liste oben. Faellt eine Rolle dort
     weg oder kommt eine hinzu, muss diese Saat nachziehen; genau dafuer ist
     die Bremse da. */
  SELECT array_agg(DISTINCT s.role ORDER BY s.role) INTO rollen
    FROM tempconnect_staff s
   WHERE s.user_id::text LIKE 'bd000000-0000-4000-8000-00000000f0%'
     AND s.revoked_at IS NULL AND s.is_active;
  IF rollen IS DISTINCT FROM ARRAY['staff_admin','staff_audit','staff_commercial','staff_member','staff_ops','staff_support']::text[] THEN
    RAISE EXCEPTION 'y4-flaechen.sql: die sechs Staff-Rollen sind nicht vollstaendig besetzt, gefunden: %', rollen;
  END IF;

  /* 4 · Jeder Staff-Zugang der Buehne laeuft ab, und zwar in der Zukunft.
     Ein Buehnen-Zugang ohne Ablauf ist eine Hintertuer, die niemand mehr
     schliesst. */
  SELECT count(*) INTO n
    FROM tempconnect_staff s
   WHERE s.user_id::text LIKE 'bd000000-0000-4000-8000-00000000f0%'
     AND s.revoked_at IS NULL AND s.is_active
     AND (s.expires_at IS NULL OR s.expires_at <= NOW());
  IF n <> 0 THEN
    RAISE EXCEPTION 'y4-flaechen.sql: % Buehnen-Staff-Zugaenge ohne wirksames Ablaufdatum.', n;
  END IF;

  /* 5 · Der Step-up bleibt scharf. Die Buehne darf die Einstellung des Owners
     (FALSE) nicht erben. */
  SELECT count(*) INTO n
    FROM tempconnect_staff s
   WHERE s.user_id::text LIKE 'bd000000-0000-4000-8000-00000000f0%'
     AND s.revoked_at IS NULL AND s.is_active
     AND s.requires_step_up IS NOT TRUE;
  IF n <> 0 THEN
    RAISE EXCEPTION 'y4-flaechen.sql: % Buehnen-Staff-Zugaenge ohne Step-up-Pflicht.', n;
  END IF;

  /* 6 · Zwei Support-Reichweiten, und zwar VERSCHIEDENE. Zwei Zugaenge mit
     derselben Reichweite beweisen nichts. */
  SELECT count(DISTINCT sa.data_scope) INTO n
    FROM support_agents sa
   WHERE sa.user_id::text LIKE 'bd000000-0000-4000-8000-00000000f0%'
     AND sa.is_active = TRUE;
  IF n <> 2 THEN
    RAISE EXCEPTION 'y4-flaechen.sql: % verschiedene Support-Datenreichweiten, erwartet 2 (full_internal und assigned_only).', n;
  END IF;

  /* 7 · Eine Owner-Sicht, nicht widerrufen. */
  SELECT count(*) INTO n
    FROM occ_owner_access o
   WHERE o.user_id::text LIKE 'bd000000-0000-4000-8000-00000000f0%'
     AND o.revoked_at IS NULL;
  IF n <> 1 THEN
    RAISE EXCEPTION 'y4-flaechen.sql: % Owner-Sichten auf der Buehne, erwartet 1.', n;
  END IF;

  /* 8 · DIE KERNZUSAGE VON Y4.1: kein Buehnen-Konto haelt zwei der drei
     Flaechen. Das ist der Zustand, den der heutige Bestand verletzt — ein
     Konto mit allen drei Zugaengen. Entsteht er hier wieder, bricht die Saat
     ab, und zwar BEVOR sie committet. */
  SELECT count(*) INTO n
    FROM users u
   WHERE u.id::text LIKE 'bd000000-0000-4000-8000-00000000f0%'
     AND ((CASE WHEN EXISTS (SELECT 1 FROM tempconnect_staff s WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.is_active) THEN 1 ELSE 0 END)
        + (CASE WHEN EXISTS (SELECT 1 FROM support_agents sa WHERE sa.user_id = u.id AND sa.is_active) THEN 1 ELSE 0 END)
        + (CASE WHEN EXISTS (SELECT 1 FROM occ_owner_access o WHERE o.user_id = u.id AND o.revoked_at IS NULL) THEN 1 ELSE 0 END)) > 1;
  IF n <> 0 THEN
    RAISE EXCEPTION 'y4-flaechen.sql: % Buehnen-Konten halten mehr als eine der drei Flaechen. Je ein Zugang je Flaeche - sonst ist keine davon EINZELN durchspielbar.', n;
  END IF;

  /* 9 · Und jedes Konto haelt WENIGSTENS eine. Ein Konto ohne Flaeche ist ein
     Kundenkonto ohne Organisation — also Muell, der aussieht wie Buehne.
     ─────────────────────────────────────────────────────────────────────────
     DIESE BREMSE IST HEUTE NICHT ALLEIN AUSLOESBAR, und das gehoert
     hingeschrieben statt weggelassen. Gemessen am 2026-10-02: ich habe vier
     Wege probiert, sie zum Ansprechen zu bringen, und JEDER lief vorher in eine
     andere Bremse.

       Support-Zuteilung entfernt  -> Bremse 6 (nur eine Reichweite)
       Owner-Zuteilung entfernt    -> Bremse 7 (keine Owner-Sicht)
       Staff-Rolle entfernt        -> Bremse 3 (Rolle unbesetzt)
       zehntes Konto ergaenzt      -> Bremse 1 (nicht 9 Konten)

     Der Grund ist ein Schubfachschluss: 6 Staff + 2 Support + 1 Owner = NEUN
     Zuteilungen, und Bremse 1 nagelt die Zahl der Konten auf neun. Haelt eines
     keine, muss ein anderes zwei halten — und das faengt Bremse 8, die direkt
     darueber steht.

     Sie bleibt trotzdem stehen. Nicht aus Bequemlichkeit, sondern weil sie
     genau dann aufhoert redundant zu sein, wenn jemand Bremse 1 oder 8
     lockert — zum Beispiel, um ein zehntes Konto zuzulassen. Dann ist sie die
     einzige, die ein Konto ohne Flaeche noch sieht. Eine Zusicherung, die man
     heute nicht rot machen kann, ist Deko; eine, die den Schubfachschluss
     schliesst, ist die Versicherung gegen dessen Aufloesung. Der Unterschied
     steht hier, damit niemand sie fuer das Erste haelt und aufraeumt. */
  SELECT count(*) INTO n
    FROM users u
   WHERE u.id::text LIKE 'bd000000-0000-4000-8000-00000000f0%'
     AND NOT EXISTS (SELECT 1 FROM tempconnect_staff s WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.is_active)
     AND NOT EXISTS (SELECT 1 FROM support_agents sa WHERE sa.user_id = u.id AND sa.is_active)
     AND NOT EXISTS (SELECT 1 FROM occ_owner_access o WHERE o.user_id = u.id AND o.revoked_at IS NULL);
  IF n <> 0 THEN
    RAISE EXCEPTION 'y4-flaechen.sql: % Buehnen-Konten ohne jede Flaeche.', n;
  END IF;

  RAISE NOTICE 'y4-flaechen.sql: 9 Konten - 6 Staff-Rollen, 2 Support-Reichweiten, 1 Owner-Sicht. Jedes haelt genau eine Flaeche.';
END $vollstaendig$;

COMMIT;
