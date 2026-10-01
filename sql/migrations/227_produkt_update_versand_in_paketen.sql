-- Migration 227: Produkt-Mitteilungen gehen in Paketen raus (Owner-Entscheid 2026-10-01)
-- =============================================================================
-- OWNER-VORGABE (2026-10-01, woertlich): „ok mach weiter mit dem Versand in Paketen"
--
-- BEFUND VORHER (gemessen am Code, `productReleaseService.dispatchReleaseEmails`):
--   * Versand in EINER Anfrage, Mail fuer Mail, waehrend der Browser wartet —
--     hoechstens 400 Mails, der Rest bekam nie eine und wurde nirgends gezaehlt.
--   * `email_sent_at` wurde erst NACH der Schleife gesetzt. Brach der Prozess
--     mittendrin ab, war die Mitteilung „nicht gemailt" — der naechste Klick
--     schickte allen erneut, auch denen, die sie schon hatten.
--   * Zwei gleichzeitige Klicks lasen beide `email_sent_at IS NULL` und
--     versandten beide.
--
-- DIESE TABELLE IST DIE EMPFAENGERLISTE JE MITTEILUNG. Sie wird beim Start
-- EINMAL eingefroren und dann in Paketen abgearbeitet (Betriebstakt
-- `produkt-update-pakete`, jede Minute ein Paket; Handkurbel im Staff Control
-- Center). Damit gilt strukturell, nicht per Absprache:
--   * Kein Doppelversand: Primaerschluessel (release_id, user_id) — ein Mensch
--     steht hoechstens einmal auf der Liste einer Mitteilung. Ein Empfaenger
--     wird nur aus `offen` heraus beansprucht (bedingtes UPDATE); zwei Laeufe
--     koennen ihn nicht beide nehmen.
--   * Fortsetzbar: was `offen` ist, geht im naechsten Paket raus — nach einem
--     Absturz, einem Neustart oder einem Redis-Ausfall genauso.
--   * Hoechstens einmal: wer `in_arbeit` haengen bleibt (Absturz WAEHREND der
--     Zustellung), wird NICHT erneut beschickt. Er zaehlt nach 15 Minuten als
--     „unklar" — lieber eine Mail zu wenig als dieselbe zweimal.
--
-- KEINE E-Mail-Adresse in dieser Tabelle (Datensparsamkeit): die Adresse wird
-- erst beim Versand aus `users` gelesen. Wer seine Adresse aendert, bekommt die
-- Mail an die neue; wer inzwischen abbestellt hat, bekommt sie gar nicht.
--
-- `fehler` traegt nur einen kurzen Code (`zustellung`, `abgemeldet`,
-- `ohne_adresse`, `angehalten`) — nie eine Serverantwort, die eine Adresse
-- enthalten koennte.
--
-- ROLLBACK / RUECKNAHME:
--   DROP TABLE IF EXISTS product_release_mail_empfaenger;
-- und den Code auf den Stand vor dieser Migration setzen. Die Tabelle ist reine
-- Versandbuchhaltung; Mitteilungen, Abmeldungen und Lesestaende liegen woanders
-- und bleiben unberuehrt. Ohne die Tabelle weiss man danach nur nicht mehr, WER
-- eine bereits versandte Mitteilung bekommen hat.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS product_release_mail_empfaenger (
  release_id     UUID NOT NULL REFERENCES product_release_entries (id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status         VARCHAR(20) NOT NULL DEFAULT 'offen'
                 CHECK (status IN ('offen', 'in_arbeit', 'gesendet', 'fehlgeschlagen', 'entfallen')),
  versuche       SMALLINT NOT NULL DEFAULT 0 CHECK (versuche >= 0),
  fehler         VARCHAR(40),
  beansprucht_am TIMESTAMPTZ,
  gesendet_am    TIMESTAMPTZ,
  angelegt_am    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT product_release_mail_empfaenger_pkey PRIMARY KEY (release_id, user_id)
);

-- Der Takt fragt jede Minute: „wer ist noch offen?" — nur diese Zeilen indizieren.
CREATE INDEX IF NOT EXISTS idx_product_release_mail_empfaenger_offen
  ON product_release_mail_empfaenger (release_id, angelegt_am)
  WHERE status = 'offen';

-- Loeschen eines Kontos kaskadiert; der Fremdschluessel braucht dafuer einen Index.
CREATE INDEX IF NOT EXISTS idx_product_release_mail_empfaenger_user
  ON product_release_mail_empfaenger (user_id);

COMMENT ON TABLE product_release_mail_empfaenger IS
  'Empfaengerliste je Produkt-Mitteilung (Migration 227): beim Start eingefroren, in Paketen abgearbeitet. PK (release_id, user_id) schliesst Doppelversand aus; keine E-Mail-Adresse gespeichert.';
COMMENT ON COLUMN product_release_mail_empfaenger.status IS
  'offen -> in_arbeit -> gesendet | fehlgeschlagen (nach 3 Versuchen) | entfallen (abgemeldet, ohne Adresse, angehalten). in_arbeit aelter als 15 Minuten gilt als unklar und wird nicht erneut beschickt.';

COMMIT;
