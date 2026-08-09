-- 169_bounty_zeitfenster_ehrlich.sql
-- P9 Spur A / Welle A3 — Beschreibung und Messung sagen dasselbe
--
-- WARUM DIESE MIGRATION
-- Welle A1 hat fuenf Bedingungen gefunden, deren Text etwas anderes verspricht,
-- als sie messen. A3 loest das auf: entweder wird der versprochene Zeitraum bzw.
-- Kanal WIRKLICH gemessen, oder die Beschreibung wird korrigiert. Beides ist
-- zulaessig — nur Schweigen nicht.
--
-- Diese Migration traegt die Katalog-Seite: Texte und Schwellenwerte. Die
-- Mess-Seite liegt in `api/services/bountyService.js` (gatherUserData +
-- checkBountyCondition) und wird von `api/test/bountyZeitfenster.test.js`
-- gegen genau diese Texte gehalten.
--
-- GEMESSEN STATT UMGESCHRIEBEN (vier von fuenf):
--   reliability_seal  Der 6-Monats-Zeitraum wird jetzt gemessen. Zusaetzlich
--                     zaehlen nur freigegebene Bewertungen — bisher zaehlten auch
--                     `pending` und sogar als Faelschung ABGELEHNTE mit, weil
--                     `rejected` die Zeile in `ratings` nicht loescht. Die
--                     Mindestanzahl (5) stand bisher hartkodiert im Code und
--                     weder im Katalog noch in der Beschreibung.
--   power_user        Zaehlt jetzt beide Kanaele und beide Marktseiten. Bisher
--                     nur `requests.receiver_id` — der Marktplatz-Kanal fehlte
--                     ganz, der Statuswert 'COMPLETED' ist dort unerreichbar,
--                     und praemiert wurde nur die Anbieterseite, obwohl der
--                     Auftraggeber den Abschluss ausloest.
--   blitz_responder   Misst jetzt im Marktplatz-Kanal ab der Benachrichtigung
--                     (`matches`) bis zum Angebot. Bisher: AVG(updated_at -
--                     created_at) auf `requests` — `updated_at` wird dort aber
--                     von SLA-Scans und der DSGVO-Anonymisierung mitgeschrieben,
--                     und nie beantwortete Anfragen SENKTEN den Schnitt. Wer
--                     eine Anfrage ignorierte, verbesserte seine Antwortzeit.
--   emergency_deals   Misst jetzt `demand_requests.urgency = 'notdienst'`. Die
--                     alte Quelle (`requests.priority`) hat noch nie einen
--                     Treffer geliefert; der Notdienst laeuft ueber den
--                     Marktplatz-Kanal.
--
-- UMGESCHRIEBEN STATT GEMESSEN (eine):
--   marketplace_active  "5 aktive Kapazitaeten pro Monat ueber 6 Monate" ist
--                     nicht messbar: es gibt keine Status-Historie auf
--                     `capacity_posts` (keine Historientabelle, kein Trigger,
--                     Audit-Log deckt nur einen Teil der Uebergaenge ab — 17 von
--                     33 Posts haben gar keinen Eintrag). "War im Maerz aktiv"
--                     ist fuer keinen Bestandspost belegbar. Der aktuelle Bestand
--                     als Ersatz waere fremdbestimmt (Plan-Quote, zwei
--                     automatische Abschalter). Gemessen wird deshalb, was der
--                     Anbieter wirklich getan hat: eingestellt im Zeitraum.
--
-- SCHWELLENHOEHEN bleiben unveraendert. Sie sind eine Geschaeftsentscheidung des
-- Owners, keine Wahrheitsfrage. Hinweis fuer die Entscheidung: mit der neuen,
-- vollstaendigen Zaehlung liegt der hoechste Wert im Bestand bei 12 von 50
-- geforderten Abschluessen.
--
-- ROLLBACK: siehe Block am Ende dieser Datei (auskommentiert).

BEGIN;

-- 1. Zuverlaessigkeits-Siegel: Fenster + Mindestanzahl sichtbar machen
UPDATE bounties
   SET description_de = 'Ø 4.5+ Sterne bei Zuverlaessigkeit ueber die letzten 6 Monate, '
                     || 'mindestens 5 freigegebene Bewertungen.',
       threshold_value = '{"months": 6, "min_stars": 4.5, "min_ratings": 5}'::jsonb,
       updated_at = NOW()
 WHERE key = 'reliability_seal';

-- 2. Kommunikations-Profi: kein Zeitraum versprochen, aber "Bewertung" praezisieren
UPDATE bounties
   SET description_de = 'Ø 4.8+ bei Kommunikation ueber 20+ freigegebene Bewertungen.',
       threshold_value = '{"min_stars": 4.8, "min_ratings": 20}'::jsonb,
       updated_at = NOW()
 WHERE key = 'communication_pro';

-- 3. Marktplatz-Aktiv: auf das umgeschrieben, was belegbar ist
UPDATE bounties
   SET description_de = 'Mind. 5 Kapazitaeten in den letzten 6 Monaten eingestellt.',
       threshold_value = '{"months": 6, "min_listings": 5}'::jsonb,
       updated_at = NOW()
 WHERE key = 'marketplace_active';

-- 4. Power User: beide Kanaele, beide Marktseiten
UPDATE bounties
   SET description_de = '50+ erfolgreiche Abschluesse — Marktplatz-Vereinbarungen und '
                     || 'Anfragen zusammen, als Auftraggeber wie als Anbieter.',
       threshold_value = '{"min_deals": 50}'::jsonb,
       updated_at = NOW()
 WHERE key = 'power_user';

-- 5. Blitz-Responder: Nenner benennen, Mindestmenge sichtbar machen
UPDATE bounties
   SET description_de = 'Ø Antwortzeit unter 30 Min auf 90%+ der Bedarfe, ueber die du '
                     || 'benachrichtigt wurdest (letzte 3 Monate, ab 5 Bedarfen).',
       threshold_value = '{"months": 3, "min_rate": 90, "max_minutes": 30, "min_volume": 5}'::jsonb,
       updated_at = NOW()
 WHERE key = 'blitz_responder';

-- 6. Notdienst-Held: Begriff an den echten Kanal angleichen
UPDATE bounties
   SET description_de = '10+ erfolgreich besetzte Notdienst-Bedarfe.',
       threshold_value = '{"min_deals": 10}'::jsonb,
       updated_at = NOW()
 WHERE key = 'emergency_hero';

-- 7. Top-Supplier: der versprochene Verlauf wird nicht gemessen
--
-- Der Text sagte "12 Monate durchgehend im Top 10% des Leaderboards". Gemessen
-- wird eine Momentaufnahme des aktuellen Rankings — kein Verlauf, und schon gar
-- kein durchgehender. Das Bounty ist seit Migration 166 abgeschaltet (die Quelle
-- wird nie berechnet), aber ein falscher Text bleibt falsch: beim
-- Wiedereinschalten wuerde er erneut etwas versprechen, das niemand prueft.
-- Gefunden vom Waechter in api/test/bountyZeitfenster.test.js.
UPDATE bounties
   SET description_de = 'Aktuell im Top 10% des Leaderboards.',
       threshold_value = '{"percentile": 10}'::jsonb,
       updated_at = NOW()
 WHERE key = 'top_supplier';

COMMIT;

-- ROLLBACK (Stand vor dieser Migration, aus 053_bounty_system.sql):
--   UPDATE bounties SET description_de = '12 Monate durchgehend im Top 10% des Leaderboards',
--          threshold_value = '{"months": 12, "percentile": 10}'::jsonb WHERE key = 'top_supplier';
--   UPDATE bounties SET description_de = '6 Monate durchgehend Ø 4.5+ Sterne bei Zuverlaessigkeit',
--          threshold_value = '{"months": 6, "min_stars": 4.5}'::jsonb WHERE key = 'reliability_seal';
--   UPDATE bounties SET description_de = 'Ø 4.8+ bei Communication-Rating ueber 20+ Bewertungen',
--          threshold_value = '{"min_stars": 4.8, "min_ratings": 20}'::jsonb WHERE key = 'communication_pro';
--   UPDATE bounties SET description_de = 'Mind. 5 aktive Kapazitaeten pro Monat ueber 6 Monate',
--          threshold_value = '{"months": 6, "min_listings": 5}'::jsonb WHERE key = 'marketplace_active';
--   UPDATE bounties SET description_de = '50+ erfolgreiche Matches auf der Plattform',
--          threshold_value = '{"min_deals": 50}'::jsonb WHERE key = 'power_user';
--   UPDATE bounties SET description_de = 'Ø Antwortzeit unter 30 Min bei 90%+ der Anfragen (3 Monate)',
--          threshold_value = '{"months": 3, "min_rate": 90, "max_minutes": 30}'::jsonb WHERE key = 'blitz_responder';
--   UPDATE bounties SET description_de = '10+ erfolgreich besetzte Emergency-Anfragen',
--          threshold_value = '{"min_deals": 10}'::jsonb WHERE key = 'emergency_hero';
