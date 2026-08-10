-- 174_csv_spaltentabelle.sql
-- P10 Spur D / Welle D3 — Spaltennamen sind Daten, kein Code
--
-- WARUM DIESE MIGRATION
-- Die Zuordnung "welche Spaltenueberschrift meint welches Feld" stand bisher
-- ausschliesslich im Browser, als hartkodierte Liste in CSV_FIELDS
-- (frontend/public/js/pages/mitarbeiter.js). Drei Folgen:
--
--   1. Jede neue Schreibweise eines Kunden brauchte einen Deploy. Eine
--      Zeitarbeitsfirma exportiert "MA-Nr", eine andere "Pers.-Nr" — beides
--      voellig normal, beides bisher ein Ticket.
--   2. Der Server kannte die Liste ueberhaupt nicht. Er bekam fertige Feldnamen
--      und konnte nie pruefen, ob die Zuordnung stimmt.
--   3. Es gab keinen Ort, an dem ein Kunde SEINE Schreibweisen hinterlegen kann.
--
-- ZWEI TABELLEN, WEIL ES ZWEI DINGE SIND
--   csv_import_fields         Was TempConnect ueberhaupt entgegennimmt. Aendert
--                             sich nur mit Code (Spalte, Schema, Dienst) — der
--                             Eintrag hier ist die gemeinsame Wahrheit dazu.
--   csv_import_field_aliases  Wie die Welt diese Felder nennt. Reine Daten.
--                             Eine neue Schreibweise ist ein INSERT.
--
-- DER SCHLUESSEL IST NORMALISIERT (alias_key)
-- Die heutige Erkennung im Browser war in sich widerspruechlich: sie entfernte
-- Punkte und Bindestriche, liess aber den Unterstrich stehen und die Umlaute
-- ungefaltet. Deshalb scheiterte ausgerechnet "Gebdatum" (der Alias hiess
-- "geb_datum") und "Strasse" traf "Strasse" nicht.
-- Ab jetzt gilt ueberall dieselbe Regel: klein schreiben, Umlaute falten
-- (ae/oe/ue/ss), alles ausser a-z und 0-9 entfernen. Die CHECK-Bedingung auf
-- alias_key erzwingt das in der Datenbank — ein nicht normalisierter Alias
-- laesst sich gar nicht erst einfuegen und koennte sonst nie treffen.
--
-- ORG-BEZUG: org_id IS NULL = plattformweit, gesetzt = nur fuer diesen Kunden.
-- Damit kann eine Zeitarbeitsfirma ihre eigenen Exportkoepfe hinterlegen, ohne
-- dass es alle anderen sieht. Kundeneigene Eintraege bekommen hoehere Prioritaet.
--
-- PRIORITAET entscheidet, wenn zwei Felder denselben Kopf beanspruchen:
-- "Name" ist mehrdeutig (Vor- oder Nachname?). Der Owner will ihn trotzdem
-- erkannt haben. Er zeigt deshalb mit NIEDRIGER Prioritaet auf den Nachnamen —
-- steht "Nachname" ebenfalls in der Datei, gewinnt die eindeutige Spalte.
--
-- ROLLBACK
--   DROP TABLE IF EXISTS csv_import_field_aliases;
--   DROP TABLE IF EXISTS csv_import_fields;

SET client_min_messages TO WARNING;

BEGIN;

/* ── Die Felder, die der Import kennt ─────────────────────────────────────── */

CREATE TABLE IF NOT EXISTS csv_import_fields (
  field_key     TEXT PRIMARY KEY,
  label_key     TEXT        NOT NULL,
  is_required   BOOLEAN     NOT NULL DEFAULT FALSE,
  sort_order    INTEGER     NOT NULL DEFAULT 100,
  -- Erkennung am INHALT statt an der Ueberschrift. Der Owner nennt den Fall
  -- ausdruecklich: die E-Mail-Spalte ist die, deren Werte ein "@" enthalten —
  -- auch wenn die Ueberschrift "Kontakt" heisst oder ganz fehlt.
  value_pattern TEXT,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE csv_import_fields IS
  'Zielfelder des Mitarbeiter-CSV-Imports. Aendert sich nur mit Code — api/test/csvSpaltentabelle.test.js haelt fest, dass diese Liste und das Zod-Schema in api/routes/workers.js deckungsgleich sind.';
COMMENT ON COLUMN csv_import_fields.label_key IS
  'i18n-Schluessel, KEIN uebersetzter Text. Die Anzeige gehoert ins Woerterbuch, nicht in die Datenbank.';
COMMENT ON COLUMN csv_import_fields.value_pattern IS
  'Regulaerer Ausdruck zur Erkennung am Zelleninhalt, wenn die Ueberschrift nichts hergibt. NULL = nur ueber die Ueberschrift erkennbar.';

/* ── Wie die Welt diese Felder nennt ──────────────────────────────────────── */

CREATE TABLE IF NOT EXISTS csv_import_field_aliases (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  field_key   TEXT        NOT NULL REFERENCES csv_import_fields(field_key) ON DELETE CASCADE,
  alias_key   TEXT        NOT NULL CHECK (alias_key ~ '^[a-z0-9]+$'),
  alias_label TEXT        NOT NULL,
  language    TEXT        CHECK (language IS NULL OR language IN ('de', 'en')),
  priority    INTEGER     NOT NULL DEFAULT 100,
  org_id      UUID        REFERENCES organizations(id) ON DELETE CASCADE,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID        REFERENCES users(id) ON DELETE SET NULL
);

COMMENT ON TABLE csv_import_field_aliases IS
  'Spaltenueberschriften, die auf ein Zielfeld zeigen. Reine Daten: eine neue Schreibweise ist ein INSERT, kein Deploy. org_id IS NULL = plattformweit.';
COMMENT ON COLUMN csv_import_field_aliases.alias_key IS
  'Normalisierte Form: klein, Umlaute gefaltet (ae/oe/ue/ss), nur a-z0-9. Die CHECK-Bedingung erzwingt das — ein nicht normalisierter Eintrag koennte nie treffen und waere stiller Ballast.';
COMMENT ON COLUMN csv_import_field_aliases.alias_label IS
  'Die menschliche Schreibweise fuer die Anzeige ("Geb.-Datum"). Der Treffer laeuft ueber alias_key.';
COMMENT ON COLUMN csv_import_field_aliases.priority IS
  'Hoeher gewinnt, wenn zwei Felder dieselbe Ueberschrift beanspruchen. "Name" zeigt schwach auf den Nachnamen, damit ein vorhandenes "Nachname" sticht.';

-- Derselbe Alias darf auf mehrere Felder zeigen (mit unterschiedlicher
-- Prioritaet), aber nicht zweimal auf dasselbe. NULLS NOT DISTINCT, damit die
-- plattformweiten Eintraege (org_id IS NULL) sich gegenseitig ausschliessen —
-- ohne das waeren beliebig viele Dubletten moeglich (PostgreSQL 15+).
CREATE UNIQUE INDEX IF NOT EXISTS csv_import_field_aliases_eindeutig_idx
  ON csv_import_field_aliases (org_id, field_key, alias_key) NULLS NOT DISTINCT;

-- Der Lesepfad: alle aktiven Aliase fuer eine Org plus die plattformweiten.
CREATE INDEX IF NOT EXISTS csv_import_field_aliases_lesen_idx
  ON csv_import_field_aliases (org_id, field_key)
  WHERE is_active;

/* ── Bestand ──────────────────────────────────────────────────────────────── */

INSERT INTO csv_import_fields (field_key, label_key, is_required, sort_order, value_pattern) VALUES
  ('email',            'mit.field.emailReq',     TRUE,  10, '@'),
  ('first_name',       'mit.field.firstNameReq', TRUE,  20, NULL),
  ('last_name',        'mit.field.lastNameReq',  TRUE,  30, NULL),
  ('personnel_number', 'mit.field.personnelNr',  FALSE, 40, NULL),
  ('phone',            'mit.field.phone',        FALSE, 50, NULL),
  ('street',           'mit.field.street',       FALSE, 60, NULL),
  ('postal_code',      'mit.field.postal',       FALSE, 70, NULL),
  ('city',             'mit.field.city',         FALSE, 80, NULL),
  ('country',          'mit.field.country',      FALSE, 90, NULL),
  -- BEWUSST KEIN Muster fuer das Geburtsdatum: ein Datum ist nicht
  -- unterscheidbar. Eine Spalte "Eintrittsdatum" saehe genauso aus und wuerde
  -- als Geburtsdatum eingelesen. Inhaltserkennung nur, wo der Inhalt das Feld
  -- eindeutig verraet — das "@" tut es, ein Datum nicht.
  ('date_of_birth',    'mit.field.birthDate',    FALSE, 100, NULL),
  ('notes',            'mit.field.notes',        FALSE, 110, NULL)
ON CONFLICT (field_key) DO NOTHING;

-- Die Aliase. alias_label ist die Schreibweise, wie ein Mensch sie tippt;
-- alias_key ihre normalisierte Form. Beide stehen bewusst nebeneinander, damit
-- die Oberflaeche zeigen kann, WORAUF sie getroffen hat.
INSERT INTO csv_import_field_aliases (field_key, alias_key, alias_label, language, priority) VALUES
  -- E-Mail
  ('email', 'email', 'E-Mail', 'de', 120),
  ('email', 'emailadresse', 'E-Mail-Adresse', 'de', 120),
  ('email', 'mail', 'Mail', 'de', 110),
  ('email', 'mailadresse', 'Mailadresse', 'de', 110),
  ('email', 'emailaddress', 'Email address', 'en', 120),
  ('email', 'kontakt', 'Kontakt', 'de', 40),
  ('email', 'epost', 'E-Post', 'de', 60),
  -- Vorname
  ('first_name', 'vorname', 'Vorname', 'de', 120),
  ('first_name', 'firstname', 'First name', 'en', 120),
  ('first_name', 'givenname', 'Given name', 'en', 110),
  ('first_name', 'vname', 'VName', 'de', 90),
  ('first_name', 'rufname', 'Rufname', 'de', 80),
  -- Nachname. "Name" ist mehrdeutig und steht deshalb schwach.
  ('last_name', 'nachname', 'Nachname', 'de', 120),
  ('last_name', 'familienname', 'Familienname', 'de', 120),
  ('last_name', 'lastname', 'Last name', 'en', 120),
  ('last_name', 'surname', 'Surname', 'en', 110),
  ('last_name', 'familyname', 'Family name', 'en', 110),
  ('last_name', 'zuname', 'Zuname', 'de', 100),
  ('last_name', 'nname', 'NName', 'de', 90),
  ('last_name', 'name', 'Name', 'de', 40),
  -- Personalnummer
  ('personnel_number', 'personalnummer', 'Personalnummer', 'de', 120),
  ('personnel_number', 'personalnr', 'Personal-Nr.', 'de', 120),
  ('personnel_number', 'persnr', 'Pers.-Nr.', 'de', 110),
  ('personnel_number', 'pnr', 'P-Nr.', 'de', 100),
  ('personnel_number', 'mitarbeiternummer', 'Mitarbeiternummer', 'de', 120),
  ('personnel_number', 'mitarbeiternr', 'Mitarbeiter-Nr.', 'de', 120),
  ('personnel_number', 'manr', 'MA-Nr.', 'de', 100),
  ('personnel_number', 'ausweisnummer', 'Ausweisnummer', 'de', 80),
  ('personnel_number', 'employeeid', 'Employee ID', 'en', 120),
  ('personnel_number', 'employeenumber', 'Employee number', 'en', 120),
  ('personnel_number', 'staffnr', 'Staff no.', 'en', 100),
  ('personnel_number', 'personnelnumber', 'Personnel number', 'en', 120),
  -- Telefon
  ('phone', 'telefon', 'Telefon', 'de', 120),
  ('phone', 'telefonnummer', 'Telefonnummer', 'de', 120),
  ('phone', 'tel', 'Tel.', 'de', 110),
  ('phone', 'rufnummer', 'Rufnummer', 'de', 110),
  ('phone', 'festnetz', 'Festnetz', 'de', 90),
  ('phone', 'mobil', 'Mobil', 'de', 100),
  ('phone', 'mobilnummer', 'Mobilnummer', 'de', 100),
  ('phone', 'handy', 'Handy', 'de', 100),
  ('phone', 'handynummer', 'Handynummer', 'de', 100),
  ('phone', 'phone', 'Phone', 'en', 120),
  ('phone', 'phonenumber', 'Phone number', 'en', 120),
  ('phone', 'mobile', 'Mobile', 'en', 100),
  -- Strasse
  ('street', 'strasse', 'Straße', 'de', 120),
  ('street', 'str', 'Str.', 'de', 100),
  ('street', 'strassehausnummer', 'Straße/Hausnummer', 'de', 120),
  ('street', 'adresse', 'Adresse', 'de', 90),
  ('street', 'anschrift', 'Anschrift', 'de', 90),
  ('street', 'wohnadresse', 'Wohnadresse', 'de', 90),
  ('street', 'street', 'Street', 'en', 120),
  ('street', 'streetaddress', 'Street address', 'en', 120),
  ('street', 'address', 'Address', 'en', 90),
  -- Postleitzahl
  ('postal_code', 'plz', 'PLZ', 'de', 120),
  ('postal_code', 'postleitzahl', 'Postleitzahl', 'de', 120),
  ('postal_code', 'postalcode', 'Postal code', 'en', 120),
  ('postal_code', 'postcode', 'Postcode', 'en', 110),
  ('postal_code', 'zip', 'ZIP', 'en', 110),
  ('postal_code', 'zipcode', 'ZIP code', 'en', 110),
  -- Wohnort
  ('city', 'stadt', 'Stadt', 'de', 120),
  ('city', 'ort', 'Ort', 'de', 120),
  ('city', 'wohnort', 'Wohnort', 'de', 120),
  ('city', 'wohnsitz', 'Wohnsitz', 'de', 100),
  ('city', 'city', 'City', 'en', 120),
  ('city', 'town', 'Town', 'en', 100),
  -- Land
  ('country', 'land', 'Land', 'de', 120),
  ('country', 'laendercode', 'Ländercode', 'de', 120),
  ('country', 'laenderkuerzel', 'Länderkürzel', 'de', 120),
  ('country', 'staat', 'Staat', 'de', 90),
  ('country', 'nation', 'Nation', 'de', 80),
  ('country', 'country', 'Country', 'en', 120),
  ('country', 'countrycode', 'Country code', 'en', 120),
  -- Geburtsdatum. "Gebdatum" war der vom Owner gemeldete Fall.
  ('date_of_birth', 'geburtsdatum', 'Geburtsdatum', 'de', 120),
  ('date_of_birth', 'gebdatum', 'Gebdatum', 'de', 120),
  ('date_of_birth', 'geburtstag', 'Geburtstag', 'de', 110),
  ('date_of_birth', 'gebtag', 'Geb.-Tag', 'de', 110),
  ('date_of_birth', 'geburt', 'Geburt', 'de', 90),
  ('date_of_birth', 'geb', 'geb.', 'de', 90),
  ('date_of_birth', 'dob', 'DOB', 'en', 120),
  ('date_of_birth', 'dateofbirth', 'Date of birth', 'en', 120),
  ('date_of_birth', 'birthday', 'Birthday', 'en', 110),
  ('date_of_birth', 'birthdate', 'Birth date', 'en', 110),
  -- Notizen
  ('notes', 'notizen', 'Notizen', 'de', 120),
  ('notes', 'notiz', 'Notiz', 'de', 120),
  ('notes', 'bemerkung', 'Bemerkung', 'de', 110),
  ('notes', 'bemerkungen', 'Bemerkungen', 'de', 110),
  ('notes', 'anmerkung', 'Anmerkung', 'de', 100),
  ('notes', 'anmerkungen', 'Anmerkungen', 'de', 100),
  ('notes', 'kommentar', 'Kommentar', 'de', 100),
  ('notes', 'hinweis', 'Hinweis', 'de', 80),
  ('notes', 'info', 'Info', 'de', 60),
  ('notes', 'notes', 'Notes', 'en', 120),
  ('notes', 'note', 'Note', 'en', 110),
  ('notes', 'comment', 'Comment', 'en', 100),
  ('notes', 'comments', 'Comments', 'en', 100)
ON CONFLICT DO NOTHING;

COMMIT;
