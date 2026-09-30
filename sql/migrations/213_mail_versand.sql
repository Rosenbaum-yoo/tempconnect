-- Migration 213: Versandprotokoll je Zweck (M1.3)
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WARUM ES DIESE TABELLE GIBT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Gemessen am 2026-09-02: `sendMail` meldet ohne Versandweg Erfolg. Beide
-- Wege tun das — `app.js` gibt `true` zurueck, `emailService.js` liefert ein
-- Objekt mit `accepted: [to]`. Von 42 Aufrufern pruefen 6 die Rueckgabe.
--
-- Die Masseneinladung ist der teuerste Fall: sie umschliesst den Versand mit
-- `try/catch` und fuehrt eine Liste `failed`. Nur wirft `app.js`s `sendMail`
-- NIE — es faengt selbst und gibt `false` zurueck. Der `catch` ist toter Code,
-- `failed` bleibt immer leer, und der Disponent liest "alle eingeladen",
-- waehrend keine einzige Mail das Haus verlassen hat.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WARUM AGGREGIERT UND NICHT EINE ZEILE JE MAIL
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Drei Gruende, und jeder allein wuerde reichen:
--
--   1. MENGE. Eine Zeile je Mail waechst unbegrenzt mit Kunden und Zeit.
--      Dieselbe Ueberlegung wie bei `betriebs_takt` (Migration 212): eine
--      Zeile je AUFGABE, kein Laufprotokoll.
--   2. PERSONENBEZUG. Eine Zeile je Mail traegt die Empfaengeradresse und
--      damit eine Aufbewahrungs- und Loeschpflicht. Diese Tabelle traegt
--      KEINE Adresse und kein Betreff — nur Zweck, Tag und Zaehler.
--   3. DIE FRAGE. Gefragt wird nicht "ging Mail 4711 raus?", sondern
--      "kommen Einladungen ueberhaupt an?". Das beantwortet ein Zaehler je
--      Zweck und Tag besser als eine Million Einzelzeilen.
--
-- Der Einzelfall bleibt trotzdem verfolgbar: die Masseneinladung meldet
-- `failed[]` mit `invite_id` an den Aufrufer zurueck, und der Fehlertext des
-- letzten Fehlschlags steht hier je Zweck.
--
-- Beschraenkt auf Zwecke x Tage — bei 30 Zwecken und drei Jahren rund 33 000
-- Zeilen. Eine Aufraeumung ist dennoch vorgesehen (siehe Kommentar an `tag`).

SET client_min_messages TO WARNING;

BEGIN;

CREATE TABLE IF NOT EXISTS mail_versand (
  -- Wofuer die Mail geschickt wurde: 'worker-einladung', 'zahlungserinnerung',
  -- 'registrierung'. Freitext mit Laengengrenze statt CHECK-Liste: die Liste
  -- der Zwecke waechst mit jedem Feature, und ein CHECK, der bei jedem neuen
  -- Zweck eine Migration verlangt, wird umgangen statt gepflegt.
  --
  -- 'unbenannt' ist der ehrliche Sammelposten fuer Aufrufer, die noch keinen
  -- Zweck angeben. Er steht ABSICHTLICH in derselben Uebersicht: eine wachsende
  -- Zahl unter 'unbenannt' ist der sichtbare Rest der Arbeit.
  zweck          TEXT        NOT NULL,

  -- Kalendertag in Europe/Berlin, nicht UTC. Ein UTC-Schnitt legt den Versand
  -- von 23:30 deutscher Zeit auf den Vortag — dieselbe Falle, die in diesem
  -- Repo schon mehrfach zugeschlagen hat (todayDE()).
  tag            DATE        NOT NULL,

  versucht       BIGINT      NOT NULL DEFAULT 0,
  zugestellt     BIGINT      NOT NULL DEFAULT 0,
  fehlgeschlagen BIGINT      NOT NULL DEFAULT 0,

  -- 'kein_versandweg' zaehlt getrennt von 'fehlgeschlagen': eine Mail, die
  -- mangels Transport nie versucht wurde, ist etwas anderes als eine, die der
  -- Server abgelehnt hat. Das erste ist ein Konfigurationsfehler, das zweite
  -- ein Betriebsvorfall — und sie brauchen verschiedene Antworten.
  ohne_versandweg BIGINT     NOT NULL DEFAULT 0,

  -- Welcher Weg zuletzt aktiv war: smtp | sendgrid | console | disabled.
  -- Beantwortet die Frage "war ueberhaupt ein Versandweg da?" rueckwirkend.
  letzter_weg    TEXT,

  -- Nur die Meldung, nie die Adresse. Auf 500 Zeichen gekuerzt vom Dienst.
  letzter_fehler TEXT,
  letzter_fehler_um TIMESTAMPTZ,

  letzte_um      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  erstellt_am    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (zweck, tag),

  CONSTRAINT mail_versand_zweck_chk CHECK (zweck <> '' AND length(zweck) <= 64)
);

-- Die Uebersicht liest "die letzten N Tage, alle Zwecke" — also nach Tag
-- absteigend. BRIN waere hier falsch: die Tabelle ist klein und wird
-- aktualisiert, nicht nur angehaengt.
CREATE INDEX IF NOT EXISTS mail_versand_tag_idx
  ON mail_versand (tag DESC);

COMMENT ON TABLE mail_versand IS
  'Versandprotokoll je Zweck und Kalendertag (M1.3). Beantwortet: kommen die '
  'Mails dieses Zwecks ueberhaupt an? Bewusst OHNE Empfaengeradresse und '
  'Betreff — kein Personenbezug, keine Loeschpflicht.';

COMMENT ON COLUMN mail_versand.tag IS
  'Kalendertag in Europe/Berlin. Aufraeumung: Zeilen aelter als drei Jahre '
  'koennen entfallen; sie beantworten keine Frage mehr, die jemand stellt.';

COMMENT ON COLUMN mail_versand.ohne_versandweg IS
  'Mails, die mangels Transport nie versucht wurden. In Produktion darf diese '
  'Zahl nicht wachsen — dort lehnt sendMail hart ab, statt still Erfolg zu '
  'melden. Waechst sie doch, laeuft eine Produktion ohne Versandweg.';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════════════
--   DROP TABLE IF EXISTS mail_versand;
--
-- Gefahrlos: reine Beobachtung. Kein Fachdatensatz haengt daran, kein
-- Fremdschluessel zeigt darauf, kein Personenbezug geht verloren. Was
-- verschwindet, ist die Antwort auf "kommen die Einladungen an?" — und die
-- war vor dieser Migration nirgends zu haben.
--
-- Die Verdrahtung im Code (`services/mailProtokollService.js`, `app.js`,
-- `services/emailService.js`) darf stehen bleiben: `mailNotieren` wirft nie
-- und protokolliert eine fehlende Tabelle als Warnung. Der harte Riegel gegen
-- den Versand ohne Versandweg haengt NICHT an dieser Tabelle, sondern an
-- `resolveEmailProvider` — ein Rollback nimmt die Sicht, nicht den Schutz.
