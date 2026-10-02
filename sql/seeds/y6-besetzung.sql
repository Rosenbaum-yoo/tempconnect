-- =============================================================================
-- Y6 · DIE BESETZUNG IST VOLLSTÄNDIG — 22 LEGALE WERTE HATTEN KEIN BEISPIEL
-- =============================================================================
-- Welle Y, Abschnitt Y6.1 (docs/features/Y_PROBEBUEHNE.md).
--
-- GEMESSEN AM 2026-10-02 gegen die laufende Datenbank. Erst die große Zahl,
-- damit niemand diese Saat für mehr hält, als sie ist:
--
--   233 Aufzählungs-CHECKs auf 117 Tabellen
--   100 Spalten haben mindestens einen erlaubten Wert OHNE Beispiel
--
-- „Die Besetzung ist vollständig" kann also NICHT „jeder legale Wert im Schema"
-- heißen. Das wäre nicht ehrgeizig, sondern falsch: `platform_events.event_type`
-- (35 Werte), `requisition_events.event_type` (23) und `audit_log.action_type`
-- sind PROTOKOLLE — ihr Wert entsteht, wenn die Handlung passiert, und eine
-- Saat, die sie füllt, fälscht Geschichte. `invoices.currency = USD` widerspricht
-- DACH-first. `payment_sessions.method = stripe` behauptet einen Anbieter, der
-- nicht angebunden ist. `*.sla_status = BREACHED` rechnet der Sweep aus.
--
-- Diese Saat besetzt deshalb den GELTUNGSBEREICH, den die Registratur in
-- `api/test/probebuehneBesetzung.test.js` nennt — das, was die Bühne
-- BEANSPRUCHT. Was draußen bleibt, steht dort mit Begründung; die vollständige
-- Bestandsaufnahme steht im Plan.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DIE 22 LÜCKEN
-- ─────────────────────────────────────────────────────────────────────────────
--
--   org_memberships.role_key     7   program_manager, supplier_manager, finance,
--                                    supplier_user, platform_admin, recruiter, viewer
--   invoices.plan                4   DEMO, BASIS, PRO, INDIVIDUELL (nur PLUS war da)
--   worker_invites.status        3   expired, revoked — und accepted, siehe unten
--   worker_profile_documents     3   pending_review, rejected, archived
--   worker_absences.art          3   urlaub, termin, sonstiges (nur „krank" war da)
--   worker_absences.zustand      2   beantragt, abgelehnt
--   worker_status_events         2   montage, inaktiv (121 Zeilen gab es, zwei Werte nicht)
--
-- ZWEI DIESER ZEILEN STANDEN HIER ZUERST FALSCH, und die Korrektur gehört in die
-- Datei und nicht in eine Fußnote. Es ist derselbe Fehler zweimal: die
-- Textprüfung „kommt der Wert in einer Saat vor?" mit „gibt es den Zustand im
-- Bestand?" verwechselt.
--
--   * `worker_status_events` war NICHT leer. Gemessen: **121 Zeilen**, geschrieben
--     von der Plattform selbst. Es fehlten ZWEI Werte (`montage`, `inaktiv`) —
--     und es fehlte etwas anderes, das die Zahl nicht zeigt: **keine Saat** schrieb
--     in diese Tabelle, also hatte keine Kraft der Bühne eine Geschichte. Beides
--     ist ein Mangel, aber nicht derselbe.
--   * `accepted` GAB es bei den Einladungen — eine Zeile aus einer Migration
--     (`max.muster@worker-demo.de`). Sie ist allerdings UNVOLLSTÄNDIG: `status =
--     'accepted'`, aber `accepted_at` ist NULL und es gibt keinen Profilbezug. Die
--     Fläche zeigt dort „angenommen" und kann nicht sagen, von wem oder wann. Die
--     Zeile dieser Saat ist deshalb das erste VOLLSTÄNDIGE Beispiel; die fremde
--     bleibt unangetastet (eine Saat-Bremse, die Fremdbestand anklagt, macht die
--     Saat unladbar und behebt nichts).
--
-- Der schärfste Posten ist der erste. `rbacService.js` hat **63 Rechte auf 13
-- Rollen**, und `hasPermission()` erbt über `ROLE_HIERARCHY`. Gemessen, indem
-- die Entscheidungsfunktion selbst gefragt wurde (nicht die Liste gelesen):
--
--   owner / admin / platform_admin   63 von 63
--   program_manager                  47
--   hiring_manager                   28
--   finance                          21
--   supplier_manager                 20
--   dispatcher                       18
--   recruiter                        15
--   member / supplier_user / viewer   8
--   worker                            0   (gatet über arbeiterRiegel, nicht über Rechte)
--
-- **`platform_admin` hat 63 von 63 — die mächtigste Org-Rolle des Systems, und
-- sie hatte keinen einzigen Träger.** Eine Rolle ohne Träger ist eine Rolle, die
-- niemand geprüft hat. Dass sie owner-gleich ist, sieht man erst, wenn man die
-- Vererbung mitrechnet: direkt steht sie in **keiner** der 63 Rechtelisten.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WAS DIESE SAAT AUSDRÜCKLICH NICHT VERÄNDERN DARF
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Die Wellen davor haben Zahlen gemessen und festgenagelt: fünf automatische
-- Marktangebote (Y1.4), freie Kräfte je Pool (Y2.3), Marktpräsenz-Bedingung 4.
-- Eine Abwesenheit mit `zustand = 'wirksam'`, die HEUTE gilt, verdeckt eine
-- Kraft am Markt — und würde diese Zahlen ändern, ohne dass jemand es mit dieser
-- Saat in Verbindung bringt.
--
-- Deshalb liegen ALLE neuen wirksamen Abwesenheiten in der ZUKUNFT, und eine
-- Notbremse weist die Saat zurück, wenn eine davon `CURRENT_DATE` berührt. Das
-- ist nicht Vorsicht, das ist die Eigenschaft, die diese Saat von einer
-- Nebenwirkung trennt. Fachlich passt es ohnehin: Urlaub und Termine werden
-- VORHER erfasst, „beantragt" ist per Definition noch nicht wirksam.
--
-- Kennungen beginnen mit `be` (hex-gültig).
-- =============================================================================

BEGIN;

-- ── SPERRE (2026-10-02) ──────────────────────────────────────────────────────
DO $sperre_saat$
BEGIN
  IF current_setting('app.seed_demo_world', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION
      'y6-besetzung.sql: SEED_DEMO_WORLD nicht aktiv - Saat verweigert. Diese Saat legt anmeldbare Konten mit weitreichenden Org-Rollen an (darunter platform_admin, owner-gleich) und laeuft nur mit ausdruecklich gesetztem Schalter (prod-sicher).';
  END IF;
END $sperre_saat$;
-- ─────────────────────────────────────────────────────────────────────────────

DO $voraussetzungen$
BEGIN
  IF coalesce(current_setting('app.seed_passwort', true), '') = '' THEN
    RAISE EXCEPTION
      'y6-besetzung.sql: app.seed_passwort ist nicht gesetzt. Diese Saat traegt ABSICHTLICH kein Passwort im Repo (Y6.3) und kennt keine Vorgabe.';
  END IF;
  IF length(current_setting('app.seed_passwort', true)) < 12 THEN
    RAISE EXCEPTION
      'y6-besetzung.sql: app.seed_passwort ist kuerzer als 12 Zeichen.';
  END IF;
  /* Diese Saat haengt an Y1.2 (Nordlicht), Y1.4 (Hanse + Profile) und Y3 (der
     registrierte Arbeiter). Ohne sie waere jede Einfuegung unten ein stiller
     No-Op - und eine Saat, die nichts tut und nichts sagt, ist schlimmer als
     eine, die bricht. */
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = 'b0000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'y6-besetzung.sql: Nordlicht Logistik GmbH fehlt - erst y1-2-standorte.sql laden.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = 'b1000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'y6-besetzung.sql: Hanse Personal Service GmbH fehlt - erst y1-4-belegschaft.sql laden.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM worker_profiles WHERE user_id = 'b5000000-0000-4000-8000-00000000c001') THEN
    RAISE EXCEPTION 'y6-besetzung.sql: der registrierte Arbeiter aus y3-arbeiterstadien.sql fehlt.';
  END IF;
  /* Der Anker der Zustandskette (Abschnitt 6): das Anfangs-Ereignis, das die
     Plattform beim Anlegen des Profils schreibt. Ohne ihn waere `zeitpunkt`
     NULL und die Einfuegung braeche mit einer Meldung ueber eine NOT-NULL-Spalte
     - richtig, aber raetselhaft. Hier steht der Grund. */
  IF NOT EXISTS (SELECT 1 FROM worker_status_events
                  WHERE worker_profile_id = 'b1000000-0000-4000-8000-00000000d003'
                    AND id::text NOT LIKE 'be000000-0000-4000-8000-0000000010%') THEN
    RAISE EXCEPTION 'y6-besetzung.sql: HPS-003 hat kein Anfangs-Ereignis, an das die Zustandskette anschliessen koennte.';
  END IF;
END $voraussetzungen$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · SIEBEN ORG-ROLLEN, DIE NIE JEMAND GETRAGEN HAT
-- ─────────────────────────────────────────────────────────────────────────────
-- Sechs bei Nordlicht (dem Kunden), eine bei Hanse: `supplier_user` ist die
-- Rolle eines Menschen BEIM LIEFERANTEN, nicht beim Kunden. Sie dort anzulegen
-- waere eine Zuordnung, die der Name widerlegt.

INSERT INTO users (id, role, email, password_hash, company_name, contact_person, is_verified, org_id, is_demo)
SELECT
  ('be000000-0000-4000-8000-00000000a0' || o.nr)::uuid,
  o.art,
  o.mail,
  crypt(current_setting('app.seed_passwort'), gen_salt('bf', 10)),
  o.firma,
  o.person,
  TRUE,
  NULL,
  TRUE
FROM (VALUES
  ('01', 'company', 'rolle.programm@probebuehne.tempconnect.de',   'Nordlicht Logistik GmbH',     'Carolin Wendt'),
  ('02', 'company', 'rolle.lieferanten@probebuehne.tempconnect.de', 'Nordlicht Logistik GmbH',    'Ahmet Yildiz'),
  ('03', 'company', 'rolle.finanzen@probebuehne.tempconnect.de',   'Nordlicht Logistik GmbH',     'Beate Gruen'),
  ('04', 'company', 'rolle.recruiting@probebuehne.tempconnect.de', 'Nordlicht Logistik GmbH',     'Niklas Baum'),
  ('05', 'company', 'rolle.lesend@probebuehne.tempconnect.de',     'Nordlicht Logistik GmbH',     'Franka Seidel'),
  ('06', 'company', 'rolle.plattform@probebuehne.tempconnect.de',  'Nordlicht Logistik GmbH',     'Milan Kovac'),
  ('07', 'agency',  'rolle.lieferantenseite@probebuehne.tempconnect.de', 'Hanse Personal Service GmbH', 'Elif Arslan')
) AS o(nr, art, mail, firma, person)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  password_hash = EXCLUDED.password_hash,
  company_name = EXCLUDED.company_name,
  contact_person = EXCLUDED.contact_person,
  is_verified = TRUE,
  is_demo = TRUE;

INSERT INTO org_memberships (id, user_id, org_id, role_key, is_active)
SELECT
  ('be000000-0000-4000-8000-00000000b0' || m.nr)::uuid,
  ('be000000-0000-4000-8000-00000000a0' || m.nr)::uuid,
  m.org::uuid,
  m.rolle,
  TRUE
FROM (VALUES
  ('01', 'b0000000-0000-4000-8000-000000000001', 'program_manager'),
  ('02', 'b0000000-0000-4000-8000-000000000001', 'supplier_manager'),
  ('03', 'b0000000-0000-4000-8000-000000000001', 'finance'),
  ('04', 'b0000000-0000-4000-8000-000000000001', 'recruiter'),
  ('05', 'b0000000-0000-4000-8000-000000000001', 'viewer'),
  -- 63 von 63 Rechten durch Vererbung. Steht hier NICHT ohne Grund so weit
  -- oben in der Liste: wer diese Zeile liest, soll wissen, dass sie
  -- owner-gleich ist, und nicht annehmen, "plattform" sei etwas Technisches.
  ('06', 'b0000000-0000-4000-8000-000000000001', 'platform_admin'),
  ('07', 'b1000000-0000-4000-8000-000000000001', 'supplier_user')
) AS m(nr, org, rolle)
ON CONFLICT (user_id, org_id) DO UPDATE SET
  role_key = EXCLUDED.role_key,
  is_active = TRUE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · VIER RECHNUNGEN, VIER TARIFE
-- ─────────────────────────────────────────────────────────────────────────────
-- `invoices.plan` kannte nur PLUS. Eine DEMO-Rechnung sieht anders aus als eine
-- INDIVIDUELL-Rechnung — und die DEMO-Rechnung ist der interessanteste Fall:
-- **Betrag null**. Eine Rechnungsliste, die eine Nullrechnung nie gezeigt hat,
-- hat ihre Formatierung nie bewiesen.
--
-- Zusammen ergeben die vier eine TARIFWECHSEL-HISTORIE desselben Kunden, vier
-- aufeinanderfolgende Abrechnungszeiträume. Das ist nicht Deko: so sieht die
-- Liste bei einem Kunden aus, der gewachsen ist, und genau dort muss die
-- Oberfläche den Plan je Zeile zeigen statt den heutigen.
--
-- Beträge von Hand gerechnet, brutto - Rabatt = netto, Steuer 19 %:
--   DEMO          0 - 0    =     0  |     0 Steuer |      0 Summe
--   BASIS      4900 - 0    =  4900  |   931 Steuer |   5831 Summe
--   PRO       20000 - 2000 = 18000  |  3420 Steuer |  21420 Summe
--   INDIVIDUELL 49900 - 0  = 49900  |  9481 Steuer |  59381 Summe

INSERT INTO invoices (
  id, invoice_number, org_id, invoice_type,
  billing_period_start, billing_period_end, plan,
  gross_amount_cents, discount_pct, discount_amount_cents, amount_cents,
  tax_rate_pct, tax_amount_cents, total_cents, currency,
  status, issued_at, due_at, paid_at, dunning_level, notes
)
SELECT
  ('be000000-0000-4000-8000-00000000c0' || r.nr)::uuid,
  r.nummer,
  'b0000000-0000-4000-8000-000000000001',
  'subscription',
  (CURRENT_DATE - r.monate * 30)::date,
  (CURRENT_DATE - r.monate * 30 + 29)::date,
  r.plan,
  r.brutto, r.rabatt_pct, r.rabatt, r.netto,
  19.0, r.steuer, r.summe, 'EUR',
  'paid',
  (CURRENT_DATE - r.monate * 30 + 30)::timestamptz,
  (CURRENT_DATE - r.monate * 30 + 44)::timestamptz,
  (CURRENT_DATE - r.monate * 30 + 38)::timestamptz,
  0,
  r.notiz
FROM (VALUES
  ('01', 'TC-PB-0001', 4, 'DEMO',            0, 0.0,    0,     0,    0,     0, 'Testphase - Nullrechnung, damit die Liste eine Nullzeile kennt'),
  ('02', 'TC-PB-0002', 3, 'BASIS',        4900, 0.0,    0,  4900,  931,  5831, 'Erster bezahlter Monat nach der Testphase'),
  ('03', 'TC-PB-0003', 2, 'PRO',         20000, 10.0, 2000, 18000, 3420, 21420, 'Hochgestuft, 10 % Rabatt aus der Empfehlung'),
  ('04', 'TC-PB-0004', 1, 'INDIVIDUELL', 49900, 0.0,    0, 49900, 9481, 59381, 'Individuelles Niveau, Rabatt ausgelaufen')
) AS r(nr, nummer, monate, plan, brutto, rabatt_pct, rabatt, netto, steuer, summe, notiz)
ON CONFLICT (id) DO UPDATE SET
  plan = EXCLUDED.plan,
  gross_amount_cents = EXCLUDED.gross_amount_cents,
  discount_pct = EXCLUDED.discount_pct,
  discount_amount_cents = EXCLUDED.discount_amount_cents,
  amount_cents = EXCLUDED.amount_cents,
  tax_amount_cents = EXCLUDED.tax_amount_cents,
  total_cents = EXCLUDED.total_cents,
  status = EXCLUDED.status,
  notes = EXCLUDED.notes,
  updated_at = NOW();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3 · DREI EINLADUNGS-ZUSTÄNDE
-- ─────────────────────────────────────────────────────────────────────────────
-- Y3 hat „eingeladen, wartet" gebaut. `expired` und `revoked` fehlten im Bestand
-- ganz; `accepted` gab es einmal, aber unvollständig (siehe Kopf: ohne
-- `accepted_at`, ohne Profilbezug). Der ERFOLGSFALL war damit nie vollständig zu
-- sehen — und eine Einladungsfläche, die nicht sagen kann, WER angenommen hat,
-- hat ihren eigenen Zweck nicht gezeigt.
--
-- DIE ANGENOMMENE EINLADUNG TRÄGT IHRE VERKNÜPFUNG. Ein `accepted` ohne
-- `worker_user_id` wäre ein halber Zustand: die Fläche zeigt „angenommen" und
-- kann nicht sagen, von wem. Die Verknüpfung kommt deshalb aus einer Abfrage auf
-- den Arbeiter aus Y3 — findet sie ihn nicht, fügt die Zeile sich nicht ein, und
-- die Notbremse unten schlägt an. Kein stilles Halb-Ergebnis.
--
-- Die Marken (`token`) entstehen beim Laden aus `gen_random_bytes(32)` — wie in
-- Y3. Eine abgelaufene und eine zurückgezogene Einladung sind ohnehin nicht
-- einlösbar; dass ihre Marke trotzdem nicht im Repo steht, ist Gewohnheit, und
-- Gewohnheit ist hier genau richtig.

/* EINE MARKE JE ZEILE, und das war zweimal falsch, bevor es stimmte.
 *
 *   `CROSS JOIN (SELECT encode(gen_random_bytes(32),'hex'))` wertet EINMAL aus
 *   und gibt allen drei Zeilen dieselbe Marke -> Verstoss gegen
 *   `worker_invites_token_key`. In y3-arbeiterstadien.sql steht dieselbe Form
 *   und ist richtig, weil dort GENAU EINE Zeile entsteht: ein Muster, das beim
 *   Vervielfachen bricht.
 *
 *   `CROSS JOIN LATERAL (…)` half NICHT — die Unterabfrage ist nicht mit der
 *   linken Seite korreliert, also darf der Planer sie weiterhin einmal
 *   auswerten. Gemessen: gleiche Fehlermeldung, andere Marke.
 *
 * Eine CTE ueber die Zeilenliste erzwingt es: `gen_random_bytes` steht dort in
 * der Auswahlliste einer Abfrage mit drei Zeilen und ist VOLATILE, wird also je
 * Zeile gerufen. */
WITH marken AS (
  SELECT v.nr, encode(gen_random_bytes(32), 'hex') AS roh
  FROM (VALUES ('01'), ('02'), ('03')) AS v(nr)
)
INSERT INTO worker_invites
  (id, supplier_org_id, invited_by, email, first_name, last_name, personnel_number,
   token, token_hash, expires_at, accepted_at, worker_user_id, worker_profile_id,
   status, last_sent_at)
SELECT
  ('be000000-0000-4000-8000-00000000d0' || e.nr)::uuid,
  'b1000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-00000000c001',
  e.mail, e.vorname, e.nachname, e.nummer,
  m.roh,
  encode(digest(m.roh, 'sha256'), 'hex'),
  NOW() + (e.gueltig_tage || ' days')::interval,
  CASE WHEN e.zustand = 'accepted' THEN NOW() - interval '9 days' ELSE NULL END,
  CASE WHEN e.zustand = 'accepted' THEN wp.user_id ELSE NULL END,
  CASE WHEN e.zustand = 'accepted' THEN wp.id ELSE NULL END,
  e.zustand,
  NOW() - (e.gesendet_tage || ' days')::interval
FROM (VALUES
  ('01', 'angenommen@hanse.probebuehne.tempconnect.de',   'Ilja',   'Petrov',  'HPS-014', '-2',  '12', 'accepted'),
  ('02', 'verfallen@hanse.probebuehne.tempconnect.de',    'Marie',  'Lorenz',  'HPS-015', '-21', '35', 'expired'),
  ('03', 'zurueckgezogen@hanse.probebuehne.tempconnect.de', 'Ousmane', 'Diallo', 'HPS-016', '10', '4', 'revoked')
) AS e(nr, mail, vorname, nachname, nummer, gueltig_tage, gesendet_tage, zustand)
JOIN marken m ON m.nr = e.nr
LEFT JOIN worker_profiles wp ON wp.user_id = 'b5000000-0000-4000-8000-00000000c001'
ON CONFLICT (id) DO UPDATE SET
  -- Die Marke bleibt, die schon da ist: eine neue machte einen verschickten
  -- Link ungueltig (dieselbe Begruendung wie in y3-arbeiterstadien.sql).
  status = EXCLUDED.status,
  expires_at = EXCLUDED.expires_at,
  accepted_at = EXCLUDED.accepted_at,
  worker_user_id = EXCLUDED.worker_user_id,
  worker_profile_id = EXCLUDED.worker_profile_id,
  last_sent_at = EXCLUDED.last_sent_at;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4 · DREI NACHWEIS-ZUSTÄNDE
-- ─────────────────────────────────────────────────────────────────────────────
-- Y3 hat den geprüften Nachweis gebaut. Es fehlten der WARTENDE (den ein
-- Disponent abarbeiten muss), der ABGELEHNTE (der einzige, bei dem die Fläche
-- einen Grund zeigen MUSS) und der ARCHIVIERTE (der abgelöste Vorgänger).
--
-- Alle drei am selben Arbeiter wie der geprüfte aus Y3 — so liegen sie in EINER
-- Nachweisliste nebeneinander, und man sieht, ob die Oberfläche sie überhaupt
-- unterscheidet. Nebeneinander in einer Liste ist der Vergleich; verstreut auf
-- vier Arbeiter wäre es nur vier Listen mit je einer Zeile.

INSERT INTO worker_profile_documents
  (id, worker_user_id, supplier_org_id, category, title, qualification_name,
   issuer, valid_from, valid_until, status, uploaded_by, verified_by, verified_at, notes)
SELECT
  ('be000000-0000-4000-8000-00000000e0' || d.nr)::uuid,
  'b5000000-0000-4000-8000-00000000c001',
  'b1000000-0000-4000-8000-000000000001',
  d.kategorie, d.titel, d.qualifikation, d.aussteller,
  (CURRENT_DATE - d.ab_tagen)::date,
  (CURRENT_DATE + d.bis_tagen)::date,
  d.zustand,
  'b1000000-0000-4000-8000-00000000c001',
  CASE WHEN d.zustand IN ('rejected', 'archived') THEN 'b1000000-0000-4000-8000-00000000c001'::uuid ELSE NULL END,
  CASE WHEN d.zustand IN ('rejected', 'archived') THEN NOW() - interval '6 days' ELSE NULL END,
  d.notiz
FROM (VALUES
  ('01', 'training',  'Staplerschein (Kopie)',          'Gabelstaplerfahrer:in',
   'Fahrschule Nord',          40,  700, 'pending_review',
   'Wartet auf Pruefung durch die Disposition - seit zwei Tagen im Eingang.'),
  ('02', 'permit',    'Fahrerlaubnis C1 (unleserlich)', 'Gabelstaplerfahrer:in',
   'Landkreis Harburg',        60,  500, 'rejected',
   'Abgelehnt: Scan unleserlich, Ablaufdatum nicht erkennbar. Bitte als PDF neu einreichen.'),
  ('03', 'training',  'Staplerschein (alte Fassung)',   'Gabelstaplerfahrer:in',
   'Fahrschule Nord',         800,   30, 'archived',
   'Abgeloest durch den geprueften Nachweis - zur Historie archiviert.')
) AS d(nr, kategorie, titel, qualifikation, aussteller, ab_tagen, bis_tagen, zustand, notiz)
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  category = EXCLUDED.category,
  title = EXCLUDED.title,
  valid_from = EXCLUDED.valid_from,
  valid_until = EXCLUDED.valid_until,
  verified_by = EXCLUDED.verified_by,
  verified_at = EXCLUDED.verified_at,
  notes = EXCLUDED.notes;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5 · DREI ABWESENHEITS-ARTEN UND ZWEI ZUSTÄNDE — ALLE IN DER ZUKUNFT
-- ─────────────────────────────────────────────────────────────────────────────
-- Nur „krank" hatte ein Beispiel (Greta Olsen, aus Y1.4, und die liegt mit
-- Absicht auf HEUTE: sie beweist Marktpräsenz-Bedingung 4).
--
-- ALLE Zeilen hier liegen in der ZUKUNFT. Das ist die Eigenschaft, die diese
-- Saat von einer Nebenwirkung trennt — siehe den Kopf. Die Notbremse unten weist
-- sie zurück, wenn eine davon CURRENT_DATE berührt.
--
-- `abgelehnt` braucht laut CHECK der Tabelle `entschieden_am` UND
-- `entscheidung_grund`. Das ist die Tabelle, die darauf besteht, dass eine
-- Ablehnung begründet wird — und ohne ein Beispiel hat niemand je gesehen, wo
-- der Grund in der Oberfläche landet.

INSERT INTO worker_absences
  (id, worker_profile_id, supplier_org_id, art, von, bis, notiz, erfasst_von, quelle,
   zustand, entschieden_von, entschieden_am, entscheidung_grund)
SELECT
  ('be000000-0000-4000-8000-00000000f0' || a.nr)::uuid,
  a.profil::uuid,
  'b1000000-0000-4000-8000-000000000001',
  a.art,
  (CURRENT_DATE + a.ab)::date,
  (CURRENT_DATE + a.bis)::date,
  a.notiz,
  'b1000000-0000-4000-8000-00000000c001',
  a.quelle,
  a.zustand,
  CASE WHEN a.zustand = 'abgelehnt' THEN 'b1000000-0000-4000-8000-00000000c001'::uuid ELSE NULL END,
  CASE WHEN a.zustand = 'abgelehnt' THEN NOW() - interval '1 day' ELSE NULL END,
  CASE WHEN a.zustand = 'abgelehnt' THEN a.grund ELSE NULL END
FROM (VALUES
  ('01', 'b1000000-0000-4000-8000-00000000d003', 'urlaub',    21, 32, 'Jahresurlaub, lange geplant',        'disponent',   'wirksam',   NULL),
  ('02', 'b1000000-0000-4000-8000-00000000d004', 'termin',    14, 14, 'Arzttermin, halber Tag',            'mitarbeiter', 'wirksam',   NULL),
  ('03', 'b1000000-0000-4000-8000-00000000d010', 'sonstiges', 28, 29, 'Fortbildung beim Hersteller',       'disponent',   'wirksam',   NULL),
  ('04', 'b1000000-0000-4000-8000-00000000d011', 'urlaub',    40, 54, 'Urlaubsantrag, noch offen',         'mitarbeiter', 'beantragt', NULL),
  ('05', 'b1000000-0000-4000-8000-00000000d009', 'urlaub',    17, 24, 'Urlaubsantrag in der Hochphase',    'mitarbeiter', 'abgelehnt',
   'In diesem Zeitraum laufen drei Einsaetze bei Nordlicht - bitte auf die Woche danach verschieben.')
) AS a(nr, profil, art, ab, bis, notiz, quelle, zustand, grund)
ON CONFLICT (id) DO UPDATE SET
  art = EXCLUDED.art,
  von = EXCLUDED.von,
  bis = EXCLUDED.bis,
  notiz = EXCLUDED.notiz,
  quelle = EXCLUDED.quelle,
  zustand = EXCLUDED.zustand,
  entschieden_von = EXCLUDED.entschieden_von,
  entschieden_am = EXCLUDED.entschieden_am,
  entscheidung_grund = EXCLUDED.entscheidung_grund;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6 · DIE ZUSTANDSGESCHICHTE EINER KRAFT — ZWEI WERTE, UND KEINE SAAT
-- ─────────────────────────────────────────────────────────────────────────────
-- Gemessen: `worker_status_events` hatte **121 Zeilen**, geschrieben von der
-- Plattform. Zwei der fünf erlaubten Zustände kamen darin nie als Ziel vor —
-- `montage` und `inaktiv`. Und keine Saat schrieb je in diese Tabelle: die Kräfte
-- der Bühne hatten damit überhaupt keine Geschichte, egal wie viele Zeilen die
-- Tabelle insgesamt trug. Die Begründung dafür, warum eine Kraft heute nicht am
-- Markt ist, war für die Bühne nirgends nachlesbar.
--
-- DIE KETTE ENDET IM TATSÄCHLICHEN ZUSTAND. Piotr Lewandow (HPS-003) ist heute
-- frei — gemessen: keine wirksame Abwesenheit auf HEUTE, kein aktiver Einsatz.
-- Also endet seine Geschichte auf `verfuegbar`. Eine Historie, die auf
-- `im_einsatz` endet, während die Kraft frei ist, ist schlimmer als keine: sie
-- widerspricht der Fläche daneben, und der Leser glaubt eher der Historie.
--
-- Fachlich gelesen: war im Einsatz, wechselte auf Montage, fiel aus, wurde
-- stillgelegt, ist wieder verfügbar. Jeder der fünf Werte kommt als `nach_zustand`
-- genau einmal vor; `ausgeloest_durch` deckt alle drei erlaubten Auslöser ab.
-- Der CHECK verlangt `von_zustand <> nach_zustand`, also ist die Kette lückenlos
-- und ohne Selbstübergang.
--
-- (Die Abwesenheit, die Schritt 3 erklärt, liegt in der Vergangenheit und ist
-- nicht als Zeile nötig — die Geschichte erzählt sie, und eine erfundene
-- vergangene Abwesenheit hätte die Zahlen von Welle Y1.4 berührt.)

INSERT INTO worker_status_events
  (id, worker_profile_id, supplier_org_id, von_zustand, nach_zustand, ausgeloest_durch, zeitpunkt)
SELECT
  ('be000000-0000-4000-8000-0000000010' || w.nr)::uuid,
  'b1000000-0000-4000-8000-00000000d003',
  'b1000000-0000-4000-8000-000000000001',
  w.von, w.nach, w.durch,
  /* DIE KETTE HAENGT AM VORHANDENEN EREIGNIS, NICHT AN `NOW()`.
   *
   * Erster Entwurf rechnete `NOW() - 60/50/40/30/20 Tage`. Gemessen danach:
   * HPS-003 hatte BEREITS ein Ereignis der Plattform (`- -> verfuegbar`, der
   * Anfangszustand beim Anlegen des Profils) — und zwar vom 2026-10-01, also
   * JUENGER als die ganze erfundene Kette. Die Geschichte lief damit vor der
   * Entstehung des Profils: "angelegt gestern, aber Historie seit August".
   *
   * Zwei Dinge gingen dabei schief, und das zweite ist das schlimmere: die
   * Notbremse unten pruefte das juengste Ereignis — und das war das der
   * Plattform. Sie haette eine falsch endende Kette NICHT gefangen (gemessen:
   * Rueckmutation blieb gruen).
   *
   * Jetzt schliesst die Kette an: Anker ist das juengste Ereignis, das NICHT aus
   * dieser Saat stammt, plus eine Stunde je Schritt. Damit beginnt sie beim
   * Anfangszustand `verfuegbar` (= `von_zustand` des ersten Schritts, lueckenlos)
   * und endet vor jetzt. Der Ausschluss der eigenen Zeilen ist die Bedingung
   * fuer Wiederholbarkeit: ohne ihn wanderte die Kette bei jedem Lauf weiter. */
  (SELECT max(e2.zeitpunkt) FROM worker_status_events e2
    WHERE e2.worker_profile_id = 'b1000000-0000-4000-8000-00000000d003'
      AND e2.id::text NOT LIKE 'be000000-0000-4000-8000-0000000010%')
  + (w.stunden || ' hours')::interval
FROM (VALUES
  ('01', 'verfuegbar', 'im_einsatz', 'einsatz',      '1'),
  ('02', 'im_einsatz', 'montage',    'einsatz',      '2'),
  ('03', 'montage',    'abwesend',   'abwesenheit',  '3'),
  ('04', 'abwesend',   'inaktiv',    'profil',       '4'),
  ('05', 'inaktiv',    'verfuegbar', 'profil',       '5')
) AS w(nr, von, nach, durch, stunden)
ON CONFLICT (id) DO UPDATE SET
  von_zustand = EXCLUDED.von_zustand,
  nach_zustand = EXCLUDED.nach_zustand,
  ausgeloest_durch = EXCLUDED.ausgeloest_durch,
  zeitpunkt = EXCLUDED.zeitpunkt;

-- ─────────────────────────────────────────────────────────────────────────────
-- NOTBREMSEN
-- ─────────────────────────────────────────────────────────────────────────────

DO $vollstaendig$
DECLARE
  n int;
  fehlend text[];
BEGIN
  /* 1 · Die sieben Org-Rollen sind besetzt und aktiv — gegen die Liste, nicht
     gegen die Zahl: „sieben Zeilen" waere auch mit siebenmal derselben Rolle
     erfuellt. */
  SELECT array_agg(r ORDER BY r) INTO fehlend
    FROM unnest(ARRAY['program_manager','supplier_manager','finance','supplier_user',
                      'platform_admin','recruiter','viewer']) r
   WHERE NOT EXISTS (SELECT 1 FROM org_memberships m WHERE m.role_key = r AND m.is_active);
  IF fehlend IS NOT NULL THEN
    RAISE EXCEPTION 'y6-besetzung.sql: diese Org-Rollen haben keinen aktiven Traeger: %', fehlend;
  END IF;

  /* 2 · Vier Rechnungen, VIER VERSCHIEDENE Tarife, und jede rechnet auf. */
  SELECT count(DISTINCT plan) INTO n FROM invoices
   WHERE id::text LIKE 'be000000-0000-4000-8000-00000000c0%';
  IF n <> 4 THEN
    RAISE EXCEPTION 'y6-besetzung.sql: % verschiedene Tarife auf den Buehnen-Rechnungen, erwartet 4.', n;
  END IF;
  SELECT count(*) INTO n FROM invoices
   WHERE id::text LIKE 'be000000-0000-4000-8000-00000000c0%'
     AND (gross_amount_cents - discount_amount_cents <> amount_cents
          OR amount_cents + tax_amount_cents <> total_cents);
  IF n <> 0 THEN
    RAISE EXCEPTION 'y6-besetzung.sql: % Buehnen-Rechnung(en) rechnen nicht auf (brutto - Rabatt = netto, netto + Steuer = Summe).', n;
  END IF;
  /* Und der Tarif der Rechnung muss ein KANONISCHER sein. Der CHECK der Tabelle
     sagt das auch - hier steht es trotzdem, weil die Saat damit beweist, dass
     sie alle fuenf kennt und nicht nur vier davon trifft. */
  SELECT count(DISTINCT plan) INTO n FROM invoices;
  IF n < 5 THEN
    RAISE EXCEPTION 'y6-besetzung.sql: im GESAMTBESTAND nur % Tarife auf Rechnungen, erwartet alle 5.', n;
  END IF;

  /* 3 · Drei Einladungs-Zustaende, und die angenommene TRAEGT ihre Verknuepfung. */
  SELECT array_agg(z ORDER BY z) INTO fehlend
    FROM unnest(ARRAY['accepted','expired','revoked']) z
   WHERE NOT EXISTS (SELECT 1 FROM worker_invites i WHERE i.status = z);
  IF fehlend IS NOT NULL THEN
    RAISE EXCEPTION 'y6-besetzung.sql: diese Einladungs-Zustaende fehlen: %', fehlend;
  END IF;
  /* NUR DIE EIGENEN ZEILEN. Erster Entwurf prüfte ALLE angenommenen
     Einladungen und brach ab — zu Recht, aber an einer FREMDEN Zeile:
     `max.muster@worker-demo.de` (aus einer Migration, nicht aus einer Saat)
     trägt `status = 'accepted'` mit `accepted_at = NULL` und ohne Profilbezug.
     Eine Saat-Bremse, die Fremdbestand anklagt, macht die Saat unladbar und
     behebt nichts: sie kann die fremde Zeile nicht reparieren. Der Befund
     gehört in die Bestandsaufnahme, der Geltungsbereich hierher. Die Zeile
     dieser Saat ist dafür das VOLLSTÄNDIGE Beispiel — mit Zeitpunkt und
     Verknüpfung. */
  SELECT count(*) INTO n FROM worker_invites
   WHERE id::text LIKE 'be000000-0000-4000-8000-00000000d0%'
     AND status = 'accepted' AND (worker_user_id IS NULL OR accepted_at IS NULL);
  IF n <> 0 THEN
    RAISE EXCEPTION 'y6-besetzung.sql: % angenommene Einladung(en) ohne Verknuepfung oder ohne Zeitpunkt - die Flaeche zeigt dann "angenommen" und kann nicht sagen, von wem.', n;
  END IF;

  /* 4 · Drei Nachweis-Zustaende, und der abgelehnte NENNT EINEN GRUND. */
  SELECT array_agg(z ORDER BY z) INTO fehlend
    FROM unnest(ARRAY['pending_review','rejected','archived']) z
   WHERE NOT EXISTS (SELECT 1 FROM worker_profile_documents d WHERE d.status = z);
  IF fehlend IS NOT NULL THEN
    RAISE EXCEPTION 'y6-besetzung.sql: diese Nachweis-Zustaende fehlen: %', fehlend;
  END IF;
  SELECT count(*) INTO n FROM worker_profile_documents
   WHERE id::text LIKE 'be000000-0000-4000-8000-00000000e0%'
     AND status = 'rejected' AND coalesce(notes, '') = '';
  IF n <> 0 THEN
    RAISE EXCEPTION 'y6-besetzung.sql: % abgelehnte(r) Nachweis(e) ohne Begruendung. Ablehnen ohne Grund ist der Fall, den die Flaeche nicht erklaeren kann.', n;
  END IF;

  /* 5 · DIE WICHTIGSTE BREMSE DIESER SAAT: keine neue Abwesenheit beruehrt
     HEUTE. Sonst verdeckt sie eine Kraft am Markt und verschiebt die Zahlen,
     die die Wellen Y1.4 und Y2.3 gemessen und festgenagelt haben - und niemand
     braechte das mit dieser Saat in Verbindung. */
  SELECT count(*) INTO n FROM worker_absences
   WHERE id::text LIKE 'be000000-0000-4000-8000-00000000f0%'
     AND von <= CURRENT_DATE
     AND (bis IS NULL OR bis >= CURRENT_DATE);
  IF n <> 0 THEN
    RAISE EXCEPTION 'y6-besetzung.sql: % neue Abwesenheit(en) beruehren HEUTE. Sie wuerden Kraefte am Markt verdecken und die Messungen von Y1.4/Y2.3 verschieben.', n;
  END IF;
  SELECT array_agg(a ORDER BY a) INTO fehlend
    FROM unnest(ARRAY['krank','urlaub','termin','sonstiges']) a
   WHERE NOT EXISTS (SELECT 1 FROM worker_absences x WHERE x.art = a);
  IF fehlend IS NOT NULL THEN
    RAISE EXCEPTION 'y6-besetzung.sql: diese Abwesenheits-Arten fehlen: %', fehlend;
  END IF;
  SELECT array_agg(z ORDER BY z) INTO fehlend
    FROM unnest(ARRAY['wirksam','beantragt','abgelehnt']) z
   WHERE NOT EXISTS (SELECT 1 FROM worker_absences x WHERE x.zustand = z);
  IF fehlend IS NOT NULL THEN
    RAISE EXCEPTION 'y6-besetzung.sql: diese Abwesenheits-Zustaende fehlen: %', fehlend;
  END IF;

  /* 6 · Alle fuenf Arbeiter-Zustaende kommen als Ziel eines Wechsels vor UND die
     Kette endet im TATSAECHLICHEN Zustand der Kraft. Eine Historie, die der
     Flaeche daneben widerspricht, ist schlimmer als keine. */
  SELECT array_agg(z ORDER BY z) INTO fehlend
    FROM unnest(ARRAY['verfuegbar','im_einsatz','montage','abwesend','inaktiv']) z
   WHERE NOT EXISTS (SELECT 1 FROM worker_status_events e WHERE e.nach_zustand = z);
  IF fehlend IS NOT NULL THEN
    RAISE EXCEPTION 'y6-besetzung.sql: diese Arbeiter-Zustaende kommen in keinem Wechsel vor: %', fehlend;
  END IF;
  /* Das juengste Ereignis von HPS-003 muss die LETZTE ZEILE DIESER SAAT sein und
     auf `verfuegbar` enden. Beide Haelften sind noetig, und die erste ist die,
     die gefehlt hat: ohne sie prueft die Bremse irgendein Ereignis — gemessen
     war es das der Plattform, und eine falsch endende Saat-Kette blieb damit
     unentdeckt (Rueckmutation blieb gruen). */
  DECLARE
    letzte_id text;
    letzter_zustand text;
  BEGIN
    SELECT id::text, nach_zustand INTO letzte_id, letzter_zustand
      FROM worker_status_events
     WHERE worker_profile_id = 'b1000000-0000-4000-8000-00000000d003'
     ORDER BY zeitpunkt DESC, id DESC LIMIT 1;
    IF letzte_id IS NULL THEN
      RAISE EXCEPTION 'y6-besetzung.sql: HPS-003 hat kein einziges Zustandsereignis - die Kette ist nicht angekommen.';
    END IF;
    IF letzte_id NOT LIKE 'be000000-0000-4000-8000-0000000010%' THEN
      RAISE EXCEPTION 'y6-besetzung.sql: das juengste Ereignis von HPS-003 stammt NICHT aus dieser Saat (%). Dann beschreibt die Kette nicht den heutigen Zustand, und diese Bremse prueft die falsche Zeile.', letzte_id;
    END IF;
    IF letzter_zustand <> 'verfuegbar' THEN
      RAISE EXCEPTION 'y6-besetzung.sql: die Zustandsgeschichte von HPS-003 endet auf "%", die Kraft ist aber frei. Eine Historie, die der Flaeche widerspricht, ist schlimmer als keine.', letzter_zustand;
    END IF;
  END;
  IF EXISTS (SELECT 1 FROM worker_absences a
              WHERE a.worker_profile_id = 'b1000000-0000-4000-8000-00000000d003'
                AND a.zustand = 'wirksam' AND a.aufgehoben_am IS NULL
                AND a.von <= CURRENT_DATE AND (a.bis IS NULL OR a.bis >= CURRENT_DATE)) THEN
    RAISE EXCEPTION 'y6-besetzung.sql: HPS-003 ist heute doch abwesend - dann darf die Zustandsgeschichte nicht auf "verfuegbar" enden.';
  END IF;

  RAISE NOTICE 'y6-besetzung.sql: 7 Org-Rollen, 4 Tarife auf Rechnungen, 3 Einladungs- und 3 Nachweis-Zustaende, 3 Abwesenheits-Arten + 2 Zustaende, 5 Arbeiter-Zustandswechsel.';
END $vollstaendig$;

COMMIT;
