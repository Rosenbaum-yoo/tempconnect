-- Migration 145: Multi-Skill Angebots-Management — Fundament (Welle 1)
-- =============================================================================
-- Aktiviert die seit Mig 023 schlafende platform_skills-Tabelle mit einem
-- branchenbreiten, kuratierten Skill-Katalog (Kategorie -> Skills), bindet
-- Worker-Skills strukturiert daran (worker_profile_skills als Quelle der
-- Wahrheit) und bereitet capacity_posts als per-Arbeiter-/Multi-Skill-
-- Angebotsanker vor (add-only, nullable = voll rueckwaertskompatibel).
--
-- Leitprinzip: Strukturierte Skills = echte Angebots-Multiplikation. Ein
-- Arbeiter mit N echten Skills ergibt N+1 eigenstaendige, echte Angebote —
-- dadurch fuehlt sich die Plattform fuer suchende Unternehmen voll an, ohne
-- eine einzige Fake-Zeile. Der bestehende skill_tags[]-Spiegel bleibt erhalten,
-- damit die vorhandene GIN-Suche (cp.skill_tags && ...) unberuehrt weiterlaeuft.
--
-- Rollback:
--   DROP INDEX IF EXISTS capacity_posts_single_skill_unique_idx;
--   DROP INDEX IF EXISTS capacity_posts_offer_kind_idx;
--   DROP INDEX IF EXISTS capacity_posts_worker_profile_idx;
--   ALTER TABLE capacity_posts
--     DROP COLUMN IF EXISTS worker_profile_id,
--     DROP COLUMN IF EXISTS primary_skill_id,
--     DROP COLUMN IF EXISTS offer_kind,
--     DROP COLUMN IF EXISTS is_anonymous;
--   DROP TABLE IF EXISTS worker_profile_skills;
--   -- platform_skills-Seeds sind harmlos und koennen bleiben.
-- =============================================================================

SET client_min_messages TO WARNING;

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- A) capacity_posts: per-Arbeiter- + Multi-Skill-Angebotsanker (add-only)
--    worker_profile_id NULL bleibt gueltig = firmenweite "pauschal N Helfer"-
--    Sammelangebote ohne konkreten Arbeiter funktionieren unveraendert weiter.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE capacity_posts
  ADD COLUMN IF NOT EXISTS worker_profile_id UUID REFERENCES worker_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS primary_skill_id  UUID REFERENCES platform_skills(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS offer_kind        TEXT NOT NULL DEFAULT 'legacy'
    CHECK (offer_kind IN ('legacy','single_skill','bundle','pool_single_skill','pool_multi_skill')),
  ADD COLUMN IF NOT EXISTS is_anonymous      BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS capacity_posts_worker_profile_idx
  ON capacity_posts(worker_profile_id) WHERE worker_profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS capacity_posts_offer_kind_idx
  ON capacity_posts(offer_kind, status);

-- Dedup-Rueckgrat (Owner-Regel): kein zweites AKTIVES Einzelskill-Angebot pro
-- Arbeiter+Skill. Sammel-/Gesamtangebote (bundle/pool_*) sind bewusst
-- ausgenommen — ein Arbeiter darf gezielt einzeln UND im Buendel angeboten werden.
CREATE UNIQUE INDEX IF NOT EXISTS capacity_posts_single_skill_unique_idx
  ON capacity_posts(worker_profile_id, primary_skill_id)
  WHERE offer_kind = 'single_skill'
    AND worker_profile_id IS NOT NULL
    AND primary_skill_id IS NOT NULL
    AND status IN ('draft','active','paused');

-- ─────────────────────────────────────────────────────────────────────────────
-- B) worker_profile_skills: strukturierte Bindung Arbeiter <-> Katalog-Skill
--    (Quelle der Wahrheit; skill_tags[] bleibt als denormalisierter Spiegel)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS worker_profile_skills (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_profile_id  UUID NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  skill_id           UUID NOT NULL REFERENCES platform_skills(id) ON DELETE CASCADE,
  proficiency        TEXT NOT NULL DEFAULT 'intermediate'
    CHECK (proficiency IN ('beginner','intermediate','advanced','expert')),
  years_experience   NUMERIC(4,1),
  is_primary         BOOLEAN NOT NULL DEFAULT FALSE,
  certified          BOOLEAN NOT NULL DEFAULT FALSE,
  certificate_ref    TEXT,
  source             TEXT NOT NULL DEFAULT 'worker'
    CHECK (source IN ('worker','agency','import','onboarding')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (worker_profile_id, skill_id)
);

CREATE INDEX IF NOT EXISTS worker_profile_skills_worker_idx
  ON worker_profile_skills(worker_profile_id);
CREATE INDEX IF NOT EXISTS worker_profile_skills_skill_idx
  ON worker_profile_skills(skill_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- C) platform_skills: schlafenden Katalog befuellen — branchenbreit, kuratiert.
--    ON CONFLICT (name) idempotent: Re-Seed reaktiviert + aktualisiert Kategorie.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO platform_skills (name, category, aliases) VALUES
  -- Pflege & Betreuung
  ('Altenpflege', 'Pflege & Betreuung', '{"Seniorenpflege"}'),
  ('Gesundheits- und Krankenpflege', 'Pflege & Betreuung', '{"Krankenpflege","Krankenschwester","Krankenpfleger"}'),
  ('Pflegefachkraft', 'Pflege & Betreuung', '{"examinierte Pflegekraft"}'),
  ('Pflegehelfer:in', 'Pflege & Betreuung', '{"Pflegehilfskraft"}'),
  ('Pflegeassistenz', 'Pflege & Betreuung', '{}'),
  ('Intensivpflege', 'Pflege & Betreuung', '{"ITS","Intensivstation"}'),
  ('Ambulante Pflege', 'Pflege & Betreuung', '{}'),
  ('Stationäre Pflege', 'Pflege & Betreuung', '{}'),
  ('Betreuungskraft (§43b)', 'Pflege & Betreuung', '{"Alltagsbegleiter","Betreuungsassistenz"}'),
  ('Behindertenbetreuung', 'Pflege & Betreuung', '{"Heilerziehungspflege"}'),
  ('Kinderbetreuung', 'Pflege & Betreuung', '{"Erzieher","Kinderpflege"}'),
  ('Demenzbetreuung', 'Pflege & Betreuung', '{}'),
  ('Palliativpflege', 'Pflege & Betreuung', '{}'),
  ('Wundmanagement', 'Pflege & Betreuung', '{"Wundversorgung"}'),
  ('Behandlungspflege', 'Pflege & Betreuung', '{}'),
  ('Grundpflege', 'Pflege & Betreuung', '{}'),
  -- Medizin & Gesundheit
  ('Medizinische:r Fachangestellte:r (MFA)', 'Medizin & Gesundheit', '{"Arzthelfer","Arzthelferin","MFA"}'),
  ('Notfallsanitäter:in', 'Medizin & Gesundheit', '{"NotSan"}'),
  ('Rettungssanitäter:in', 'Medizin & Gesundheit', '{"RettSan"}'),
  ('OP-Assistenz', 'Medizin & Gesundheit', '{"OTA","OP-Pflege"}'),
  ('Anästhesie-Assistenz', 'Medizin & Gesundheit', '{"ATA"}'),
  ('Laborassistenz (MTLA)', 'Medizin & Gesundheit', '{"MTLA","Laborant"}'),
  ('Physiotherapie', 'Medizin & Gesundheit', '{"Physiotherapeut","Krankengymnastik"}'),
  ('Ergotherapie', 'Medizin & Gesundheit', '{}'),
  ('Logopädie', 'Medizin & Gesundheit', '{}'),
  ('Zahnmedizinische:r Fachangestellte:r (ZFA)', 'Medizin & Gesundheit', '{"ZFA","Zahnarzthelferin"}'),
  ('Pharmazeutisch-technische:r Assistent:in (PTA)', 'Medizin & Gesundheit', '{"PTA","Apothekenhelfer"}'),
  ('Hebamme', 'Medizin & Gesundheit', '{"Entbindungspfleger"}'),
  -- Logistik & Lager
  ('Lagerhelfer:in', 'Logistik & Lager', '{"Lagerarbeiter","Lagerhilfe"}'),
  ('Kommissionierer:in', 'Logistik & Lager', '{"Kommissionierung","Picken"}'),
  ('Fachkraft für Lagerlogistik', 'Logistik & Lager', '{}'),
  ('Fachlagerist:in', 'Logistik & Lager', '{}'),
  ('Staplerfahrer:in', 'Logistik & Lager', '{"Gabelstaplerfahrer","Frontstapler"}'),
  ('Staplerschein', 'Logistik & Lager', '{"Flurförderschein"}'),
  ('Hochregalstaplerfahrer:in', 'Logistik & Lager', '{"Schubmaststapler"}'),
  ('Wareneingang', 'Logistik & Lager', '{}'),
  ('Warenausgang', 'Logistik & Lager', '{}'),
  ('Versandmitarbeiter:in', 'Logistik & Lager', '{"Versand"}'),
  ('Verpackung (Lager)', 'Logistik & Lager', '{}'),
  ('Inventur', 'Logistik & Lager', '{}'),
  ('Ladungssicherung', 'Logistik & Lager', '{}'),
  ('Handhubwagen / Ameise', 'Logistik & Lager', '{"Ameise","Hubwagen"}'),
  ('Scanner- / RFID-Erfassung', 'Logistik & Lager', '{"MDE","Barcode-Scanner"}'),
  -- Transport & Fahrdienst
  ('Berufskraftfahrer:in (LKW CE)', 'Transport & Fahrdienst', '{"LKW-Fahrer CE","Kraftfahrer"}'),
  ('LKW-Fahrer:in (C1)', 'Transport & Fahrdienst', '{}'),
  ('Auslieferungsfahrer:in', 'Transport & Fahrdienst', '{"Auslieferung"}'),
  ('Kurierfahrer:in', 'Transport & Fahrdienst', '{"Kurier","Paketzusteller"}'),
  ('Personenbeförderung (P-Schein)', 'Transport & Fahrdienst', '{"Personenbeförderungsschein"}'),
  ('Busfahrer:in (Klasse D)', 'Transport & Fahrdienst', '{"Omnibusfahrer"}'),
  ('ADR-Gefahrgut', 'Transport & Fahrdienst', '{"Gefahrgutfahrer","ADR-Schein"}'),
  ('Fahrerkarte', 'Transport & Fahrdienst', '{}'),
  ('Umzugsfahrer:in', 'Transport & Fahrdienst', '{}'),
  ('Möbelmontage', 'Transport & Fahrdienst', '{"Möbelmonteur"}'),
  -- Bau & Handwerk
  ('Maurer:in', 'Bau & Handwerk', '{}'),
  ('Trockenbauer:in', 'Bau & Handwerk', '{"Trockenbau"}'),
  ('Maler:in und Lackierer:in', 'Bau & Handwerk', '{"Maler","Lackierer"}'),
  ('Fliesenleger:in', 'Bau & Handwerk', '{}'),
  ('Tischler:in / Schreiner:in', 'Bau & Handwerk', '{"Schreiner","Tischler"}'),
  ('Elektroniker:in', 'Bau & Handwerk', '{"Elektriker","Elektroinstallateur"}'),
  ('Anlagenmechaniker:in SHK', 'Bau & Handwerk', '{"SHK","Sanitär Heizung Klima","Installateur"}'),
  ('Zimmerer / Zimmerin', 'Bau & Handwerk', '{"Zimmermann"}'),
  ('Dachdecker:in', 'Bau & Handwerk', '{}'),
  ('Gerüstbauer:in', 'Bau & Handwerk', '{"Gerüstbau"}'),
  ('Bauhelfer:in', 'Bau & Handwerk', '{"Baustellenhelfer"}'),
  ('Betonbauer:in', 'Bau & Handwerk', '{"Beton"}'),
  ('Straßenbauer:in', 'Bau & Handwerk', '{"Straßenbau"}'),
  ('Schweißer:in (MAG/MIG/WIG)', 'Bau & Handwerk', '{"Schweißer","Schweissen"}'),
  ('Metallbauer:in / Schlosser:in', 'Bau & Handwerk', '{"Schlosser"}'),
  ('Industriemechaniker:in', 'Bau & Handwerk', '{}'),
  ('Landschaftsgärtner:in (GaLaBau)', 'Bau & Handwerk', '{"GaLaBau","Gartenbau"}'),
  -- Produktion & Industrie
  ('Produktionshelfer:in', 'Produktion & Industrie', '{"Produktionsmitarbeiter"}'),
  ('Maschinenbediener:in', 'Produktion & Industrie', '{"Maschinenführer"}'),
  ('Anlagenführer:in', 'Produktion & Industrie', '{}'),
  ('Montagehelfer:in', 'Produktion & Industrie', '{"Montage"}'),
  ('Fließbandarbeit', 'Produktion & Industrie', '{"Bandarbeit"}'),
  ('Qualitätskontrolle', 'Produktion & Industrie', '{"Qualitätsprüfung","QS"}'),
  ('CNC-Fachkraft', 'Produktion & Industrie', '{"CNC","CNC-Dreher","CNC-Fräser"}'),
  ('Zerspanungsmechaniker:in', 'Produktion & Industrie', '{"Zerspaner"}'),
  ('Verpacker:in (Industrie)', 'Produktion & Industrie', '{}'),
  ('Fertigungsmitarbeiter:in', 'Produktion & Industrie', '{}'),
  ('Werker:in', 'Produktion & Industrie', '{}'),
  ('Elektronikfertigung', 'Produktion & Industrie', '{}'),
  -- Gastronomie & Hotel
  ('Koch / Köchin', 'Gastronomie & Hotel', '{"Koch","Köchin"}'),
  ('Küchenhilfe', 'Gastronomie & Hotel', '{"Beikoch","Küchenkraft"}'),
  ('Servicekraft', 'Gastronomie & Hotel', '{"Service","Kellner"}'),
  ('Kellner:in', 'Gastronomie & Hotel', '{}'),
  ('Barkeeper:in', 'Gastronomie & Hotel', '{"Barkeeper","Barmann"}'),
  ('Barista', 'Gastronomie & Hotel', '{}'),
  ('Hotelfachkraft', 'Gastronomie & Hotel', '{}'),
  ('Rezeptionist:in (Hotel)', 'Gastronomie & Hotel', '{"Empfang Hotel","Front Office"}'),
  ('Housekeeping', 'Gastronomie & Hotel', '{"Zimmermädchen","Etagenservice"}'),
  ('Spülkraft', 'Gastronomie & Hotel', '{"Spüler","Abwasch"}'),
  ('Bankettservice', 'Gastronomie & Hotel', '{"Bankett"}'),
  ('Restaurantfachkraft', 'Gastronomie & Hotel', '{}'),
  ('Systemgastronomie', 'Gastronomie & Hotel', '{}'),
  -- Reinigung & Facility
  ('Gebäudereiniger:in', 'Reinigung & Facility', '{"Gebäudereinigung"}'),
  ('Unterhaltsreinigung', 'Reinigung & Facility', '{}'),
  ('Glas- und Fensterreinigung', 'Reinigung & Facility', '{"Glasreinigung","Fensterreinigung"}'),
  ('Grundreinigung', 'Reinigung & Facility', '{}'),
  ('Industriereinigung', 'Reinigung & Facility', '{}'),
  ('Reinigungskraft', 'Reinigung & Facility', '{"Putzkraft","Raumpflege"}'),
  ('Hausmeister:in', 'Reinigung & Facility', '{"Facility","Haustechnik","Objektbetreuung"}'),
  ('Wäscherei', 'Reinigung & Facility', '{}'),
  ('Desinfektion / Hygiene', 'Reinigung & Facility', '{"Hygiene"}'),
  -- Sicherheit
  ('Sicherheitsmitarbeiter:in (§34a)', 'Sicherheit', '{"Security","Wachmann","Sicherheitsdienst"}'),
  ('Sachkundeprüfung §34a', 'Sicherheit', '{"34a"}'),
  ('Objektschutz', 'Sicherheit', '{}'),
  ('Werkschutz', 'Sicherheit', '{}'),
  ('Empfangs- / Pförtnerdienst', 'Sicherheit', '{"Pförtner"}'),
  ('Veranstaltungsschutz', 'Sicherheit', '{"Eventsecurity"}'),
  ('Türsteher:in', 'Sicherheit', '{"Doorman"}'),
  ('Ladendetektiv:in', 'Sicherheit', '{"Detektiv","Kaufhausdetektiv"}'),
  ('Brandsicherheitswache', 'Sicherheit', '{}'),
  ('Revier- und Streifendienst', 'Sicherheit', '{"Revierdienst"}'),
  -- Büro & Verwaltung
  ('Bürokraft', 'Büro & Verwaltung', '{"Bürohilfe"}'),
  ('Sachbearbeitung', 'Büro & Verwaltung', '{"Sachbearbeiter"}'),
  ('Kaufmännische Assistenz', 'Büro & Verwaltung', '{}'),
  ('Empfang / Rezeption (Büro)', 'Büro & Verwaltung', '{"Rezeption"}'),
  ('Datenerfassung', 'Büro & Verwaltung', '{"Data Entry"}'),
  ('Buchhaltung', 'Büro & Verwaltung', '{"Finanzbuchhaltung","Fibu"}'),
  ('Lohn- und Gehaltsbuchhaltung', 'Büro & Verwaltung', '{"Lohnbuchhaltung"}'),
  ('Personalsachbearbeitung', 'Büro & Verwaltung', '{"HR-Sachbearbeitung"}'),
  ('Sekretariat / Assistenz', 'Büro & Verwaltung', '{"Sekretär","Assistenz"}'),
  ('Auftragsabwicklung', 'Büro & Verwaltung', '{}'),
  ('MS Office', 'Büro & Verwaltung', '{"Word","Excel","Outlook"}'),
  ('SAP-Kenntnisse', 'Büro & Verwaltung', '{"SAP"}'),
  ('DATEV-Kenntnisse', 'Büro & Verwaltung', '{"DATEV"}'),
  -- Handel & Verkauf
  ('Verkäufer:in', 'Handel & Verkauf', '{"Verkauf"}'),
  ('Kassierer:in', 'Handel & Verkauf', '{"Kasse","Kassenkraft"}'),
  ('Kaufmann/-frau im Einzelhandel', 'Handel & Verkauf', '{"Einzelhandelskaufmann"}'),
  ('Warenverräumung', 'Handel & Verkauf', '{"Regalauffüllung"}'),
  ('Merchandising / Regalservice', 'Handel & Verkauf', '{"Merchandiser"}'),
  ('Kundenberatung (Verkauf)', 'Handel & Verkauf', '{}'),
  ('Filialaushilfe', 'Handel & Verkauf', '{}'),
  ('Bäckereifachverkauf', 'Handel & Verkauf', '{"Bäckereiverkauf"}'),
  ('Fleischereifachverkauf', 'Handel & Verkauf', '{"Fleischerei"}'),
  -- Kundenservice & Callcenter
  ('Call-Center-Agent:in (Inbound)', 'Kundenservice & Callcenter', '{"Inbound"}'),
  ('Call-Center-Agent:in (Outbound)', 'Kundenservice & Callcenter', '{"Outbound","Telesales"}'),
  ('Kundenberatung / Hotline', 'Kundenservice & Callcenter', '{}'),
  ('Telefonist:in', 'Kundenservice & Callcenter', '{"Telefondienst"}'),
  ('Reklamationsbearbeitung', 'Kundenservice & Callcenter', '{"Beschwerdemanagement"}'),
  ('Chat- und E-Mail-Support', 'Kundenservice & Callcenter', '{"E-Mail-Support"}'),
  ('Terminvereinbarung', 'Kundenservice & Callcenter', '{}'),
  -- IT & Fachkräfte
  ('IT-Support / Helpdesk', 'IT & Fachkräfte', '{"Helpdesk","1st Level Support"}'),
  ('Systemadministration', 'IT & Fachkräfte', '{"Sysadmin"}'),
  ('Softwareentwicklung', 'IT & Fachkräfte', '{"Programmierung","Entwickler"}'),
  ('Frontend-Entwicklung', 'IT & Fachkräfte', '{"Frontend","React","JavaScript"}'),
  ('Backend-Entwicklung', 'IT & Fachkräfte', '{"Backend","Node.js","API"}'),
  ('Netzwerktechnik', 'IT & Fachkräfte', '{"Netzwerk"}'),
  ('Datenbankadministration', 'IT & Fachkräfte', '{"DBA","SQL"}'),
  ('IT-Sicherheit', 'IT & Fachkräfte', '{"Cybersecurity","Informationssicherheit"}'),
  ('Cloud (AWS / Azure)', 'IT & Fachkräfte', '{"AWS","Azure","Cloud"}'),
  ('DevOps', 'IT & Fachkräfte', '{"CI/CD","Kubernetes"}'),
  ('QA / Softwaretest', 'IT & Fachkräfte', '{"Testing","QA"}'),
  ('Datenanalyse', 'IT & Fachkräfte', '{"Data Analyst","Business Intelligence"}'),
  -- Helfer & Allgemein
  ('Allrounder / Aushilfe', 'Helfer & Allgemein', '{"Aushilfe"}'),
  ('Ungelernte Hilfskraft', 'Helfer & Allgemein', '{"Hilfsarbeiter"}'),
  ('Umzugshelfer:in', 'Helfer & Allgemein', '{"Umzug"}'),
  ('Gartenhelfer:in', 'Helfer & Allgemein', '{"Gartenhilfe"}'),
  ('Saison- / Erntehelfer:in', 'Helfer & Allgemein', '{"Erntehelfer","Saisonarbeit"}'),
  ('Messehelfer:in', 'Helfer & Allgemein', '{"Messeauf- und -abbau"}'),
  ('Haushaltshilfe', 'Helfer & Allgemein', '{}')
ON CONFLICT (name) DO UPDATE
  SET category = EXCLUDED.category,
      aliases  = EXCLUDED.aliases,
      is_active = TRUE,
      updated_at = NOW();

-- Hinweis: Die Registrierung in _migrations uebernimmt der Runner (sql/migrate.sh)
-- nach erfolgreichem Apply. KEIN Self-Insert hier — sonst kollidiert der Runner-Insert
-- (ohne ON CONFLICT) auf frischen Installationen mit dem bereits gesetzten Eintrag.

COMMIT;
