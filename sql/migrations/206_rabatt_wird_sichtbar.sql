-- Migration 206: Der Rabatt wird sichtbar — Ausfaelle und Eingriffe (Welle K1)
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WARUM
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Der Treue-Rabatt laeuft automatisch: `getUserDiscount()` summiert die aktiven
-- Bounties, die Stufe deckelt, `recurringBillingService` friert den Satz in die
-- Rechnung. 55 Kunden mit aktivem Abo haengen daran (gemessen 2026-08-29).
--
-- Faellt diese Kette aus, passiert heute NICHTS SICHTBARES:
--
--   (a) Wirft die Summen-Abfrage, faengt `recurringBillingService` den Fehler und
--       stellt die Rechnung OHNE Rabatt. Der einzige Zeuge ist eine `logger.warn`-
--       Zeile. Ein Kunde mit 8 % zahlt den vollen Preis, und niemand erfaehrt es.
--
--   (b) Wirft die Stufen-Abfrage, faengt `getUserTier` den Fehler SELBST ab und
--       liefert `null` zurueck. `getUserMaxDiscount` macht daraus die Voreinstellung
--       8 % — nicht zu unterscheiden von "hat noch keine Stufe". Ein Diamant-Kunde
--       (25 %) wird dadurch auf 8 % gedeckelt, ohne Log, ohne Spur. Der
--       Sicherheitsnetz-Wert 25 in `bountyService` ist deshalb unerreichbar; ein
--       bestehender Test haelt genau das fest.
--
-- Beides ist Geld auf einer Rechnung. Ein Log ist nicht sichtbar. Diese Tabelle
-- macht den Ausfall zu einem Befund, den die Staff-Flaeche zeigen kann.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WARUM KEINE MELDUNG, SONDERN EINE ZEILE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Es gibt heute keinen Kanal, der das Team erreicht (in der Uebergabe als
-- `K4-B1` gefuehrt): `notificationMatrix.dispatch()` kennt nur org- und
-- vorgangsbezogene Empfaenger und ueberspringt einen unbekannten Ereignis-
-- Schluessel wortlos (`sent: 0`, kein Fehler); `writeStaffAudit()` verlangt
-- zwingend eine handelnde Person und wirft ohne sie — ein Systemlauf hat keine.
--
-- Welle K4 hat daraus die Lehre gezogen und gezaehlt statt einen Kanal zu
-- erfinden. K1 macht dasselbe, nur vollstaendiger: der Ausfall wird mit Kunde,
-- Monat und Grund festgehalten und in der Staff-Flaeche gezeigt. Ein erfundener
-- Zustellweg waere genau die stille Fehlerklasse, gegen die diese Welle antritt.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WARUM EINE ZEILE JE KUNDE UND MONAT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Ein Ausfall der Datenbank trifft jeden Abrechnungslauf und jeden Seitenaufruf.
-- Eine Zeile je Vorfall waere bei 300 Kunden ein Protokoll, das mit dem Fehler
-- mitwaechst — und genau dann am groessten ist, wenn die Datenbank ohnehin
-- leidet. Der UPSERT auf (Kunde, Monat, Stelle) begrenzt die Tabelle auf
-- Kunden x Monate x 2 und zaehlt die Vorfaelle stattdessen hoch.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DER EINGRIFF (Plan-Abschnitt 3a)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Es gibt keine zweite Staff-Rolle. Ein Vier-Augen-Prinzip waere dauerhaft
-- blockiert, weil niemand gegenzeichnen kann. Der Schutz ist deshalb strukturell,
-- und die Tabelle traegt ihn mit:
--
--   * KEIN FREIES BETRAGSFELD — `bounty_key` statt Betrag. Der Satz kommt aus
--     dem Katalog; vergeben laesst sich nur, was der Katalog ohnehin hergaebe.
--   * WIRKUNGSVORSCHAU IN EURO — `erwartete_ersparnis_cents` ist die Zahl, die
--     im Dialog stand. Weicht der Lauf davon ab, ist das nachlesbar.
--   * VERFALL NACH EINEM LAUF — `verbraucht_am`. Der Teilindex laesst je Kunde
--     genau EINEN offenen Eingriff zu; danach entscheidet wieder die Automatik.
--   * NIE IN EIGENER SACHE — `angelegt_von <> user_id` als Datenbankregel, nicht
--     nur als Prüfung im Code.
--   * QUELLE AUF DER RECHNUNG — `rechnung_id` verbindet den Eingriff mit dem
--     Beleg; die Rechnung selbst traegt `discount_source = 'bounty_eingriff'`.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════════════
--   DROP TABLE IF EXISTS rabatt_eingriffe;
--   DROP TABLE IF EXISTS rabatt_ausfaelle;

SET client_min_messages TO WARNING;

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Der stille Ausfall wird eine Zeile
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rabatt_ausfaelle (
  id                BIGSERIAL PRIMARY KEY,

  -- Wer. ON DELETE CASCADE: ein geloeschter Kunde hinterlaesst keine
  -- verwaisten Befunde — die Anonymisierung aus Spur D raeumt mit.
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id            UUID REFERENCES organizations(id) ON DELETE SET NULL,

  -- Welcher Monat. Immer der erste Tag des Monats in Europe/Berlin — die
  -- DACH-first-Regel des Projekts. Ein roher UTC-Schnitt haette am Monatsersten
  -- um 00:30 den Vormonat getroffen.
  abrechnungsmonat  DATE NOT NULL,

  -- Wo es ausgefallen ist. Zwei Stellen, zwei sehr verschiedene Folgen:
  --   'rabattsatz'  die Summen-Abfrage warf  → Rechnung ohne jeden Rabatt
  --   'stufe'       die Stufen-Abfrage warf  → Deckel still auf 8 % gefallen
  stelle            TEXT NOT NULL
                    CHECK (stelle IN ('rabattsatz', 'stufe')),

  -- Warum. Die Fehlermeldung, gekuerzt auf das, was traegt.
  grund             TEXT NOT NULL,

  -- Was stattdessen angesetzt wurde. Bei 'rabattsatz' ist das 0, bei 'stufe'
  -- der Ersatz-Deckel. Ohne diese Zahl waere spaeter nicht mehr feststellbar,
  -- WIE teuer der Ausfall war.
  angesetzt_pct     NUMERIC(5,2) NOT NULL DEFAULT 0
                    CHECK (angesetzt_pct >= 0 AND angesetzt_pct <= 100),

  -- Der Nettobetrag, auf den der Rabatt gewirkt haette. NULL auf Anzeigepfaden,
  -- die keinen Betrag kennen.
  netto_cents       INTEGER CHECK (netto_cents IS NULL OR netto_cents >= 0),

  -- Die Rechnung, die trotz des Ausfalls entstanden ist. NULL heisst: es kam
  -- (noch) keine zustande — der Ausfall traf einen Anzeigepfad oder der Lauf
  -- ist an spaeterer Stelle gescheitert.
  rechnung_id       UUID REFERENCES invoices(id) ON DELETE SET NULL,

  vorfaelle         INTEGER NOT NULL DEFAULT 1 CHECK (vorfaelle > 0),
  zuerst_am         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  zuletzt_am        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Der UPSERT-Schluessel. Siehe "WARUM EINE ZEILE JE KUNDE UND MONAT".
  CONSTRAINT rabatt_ausfaelle_einmal_je_monat UNIQUE (user_id, abrechnungsmonat, stelle)
);

-- Die Flaeche fragt "was ist offen?" — also nach Monat absteigend.
CREATE INDEX IF NOT EXISTS idx_rabatt_ausfaelle_monat
  ON rabatt_ausfaelle (abrechnungsmonat DESC, zuletzt_am DESC);

COMMENT ON TABLE rabatt_ausfaelle IS
  'Welle K1: jeder Ausfall der Rabatt-Ermittlung mit Kunde, Monat und Grund. Ersetzt die logger.warn-Zeile, die niemand liest.';
COMMENT ON COLUMN rabatt_ausfaelle.stelle IS
  'rabattsatz = Summen-Abfrage warf (Rechnung ohne Rabatt); stufe = Stufen-Abfrage warf (Deckel still auf die Voreinstellung gefallen).';
COMMENT ON COLUMN rabatt_ausfaelle.angesetzt_pct IS
  'Der Satz bzw. Deckel, der ersatzweise gegolten hat. Ohne ihn ist die Tragweite des Ausfalls spaeter nicht mehr ablesbar.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2) Der Eingriff — ein Grund, aus dem das System rechnet
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rabatt_eingriffe (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id            UUID REFERENCES organizations(id) ON DELETE SET NULL,

  -- KEIN freies Betragsfeld: der Grund ist ein Katalogeintrag, der Satz kommt
  -- aus ihm. Kein Fremdschluessel auf `bounties(key)`, weil ein spaeter
  -- geloeschter Katalogeintrag den Beleg nicht mitreissen darf — was gerechnet
  -- wurde, bleibt nachlesbar.
  bounty_key        TEXT NOT NULL,
  zusatz_pct        NUMERIC(5,2) NOT NULL
                    CHECK (zusatz_pct > 0 AND zusatz_pct <= 100),

  -- Die Zahl aus der Wirkungsvorschau. Bestaetigt wird DIESE Zahl, nicht eine
  -- abstrakte Handlung — das Versehen ist das eigentliche Risiko, nicht der
  -- Vorsatz.
  erwartete_ersparnis_cents INTEGER NOT NULL CHECK (erwartete_ersparnis_cents >= 0),

  grund             TEXT NOT NULL,

  angelegt_von      UUID NOT NULL REFERENCES users(id),
  angelegt_am       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Verfall: gesetzt vom Abrechnungslauf, der ihn angewandt hat.
  verbraucht_am     TIMESTAMPTZ,
  rechnung_id       UUID REFERENCES invoices(id) ON DELETE SET NULL,
  tatsaechliche_ersparnis_cents INTEGER
                    CHECK (tatsaechliche_ersparnis_cents IS NULL OR tatsaechliche_ersparnis_cents >= 0),

  -- Nie in eigener Sache. Als Datenbankregel, nicht nur als Pruefung im Code:
  -- die Route kann man vergessen, die Tabelle nicht. Greift heute nicht (es gibt
  -- nur eine Person) und kostet deshalb nichts — sie greift ab der zweiten
  -- automatisch.
  CONSTRAINT rabatt_eingriffe_nicht_in_eigener_sache CHECK (angelegt_von <> user_id),

  -- Ein verbrauchter Eingriff traegt immer beides: wann und auf welcher Rechnung.
  CONSTRAINT rabatt_eingriffe_verbrauch_vollstaendig CHECK (
    (verbraucht_am IS NULL AND rechnung_id IS NULL AND tatsaechliche_ersparnis_cents IS NULL)
    OR (verbraucht_am IS NOT NULL)
  )
);

-- Hoechstens EIN offener Eingriff je Kunde. Ohne diese Regel koennten sich
-- mehrere Eingriffe auf derselben Rechnung stapeln — der Verfall "nach genau
-- einem Abrechnungslauf" waere dann keiner mehr.
CREATE UNIQUE INDEX IF NOT EXISTS idx_rabatt_eingriffe_einer_offen
  ON rabatt_eingriffe (user_id) WHERE verbraucht_am IS NULL;

-- Die Monatsuebersicht (K1.5) liest nach Anlagemonat.
CREATE INDEX IF NOT EXISTS idx_rabatt_eingriffe_angelegt
  ON rabatt_eingriffe (angelegt_am DESC);

COMMENT ON TABLE rabatt_eingriffe IS
  'Welle K1: der Eingriffspunkt in die Rabatt-Automatik. Kein Betrag, sondern ein Katalog-Grund, aus dem das System rechnet. Verfaellt nach genau einem Abrechnungslauf.';
COMMENT ON COLUMN rabatt_eingriffe.bounty_key IS
  'Der Katalogeintrag, der haette zaehlen muessen. Die Schwelle wird gegen die echten Daten geprueft; ist sie nicht erfuellt, entsteht kein Eingriff.';
COMMENT ON COLUMN rabatt_eingriffe.erwartete_ersparnis_cents IS
  'Die Zahl aus der Wirkungsvorschau, die bestaetigt wurde. Der Vergleich mit tatsaechliche_ersparnis_cents zeigt, ob der Lauf tat, was angekuendigt war.';
COMMENT ON COLUMN rabatt_eingriffe.verbraucht_am IS
  'Gesetzt vom Abrechnungslauf. Ein Eingriff wirkt genau einmal; danach entscheidet wieder die Automatik.';

COMMIT;
