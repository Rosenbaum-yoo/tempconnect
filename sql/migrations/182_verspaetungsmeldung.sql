-- =============================================================================
-- 182 — Verspätung ist keine Abwesenheit
--
-- WELLE G3 der Spur G (docs/features/G_ABWESENHEIT_SELBSTERFASSUNG.md)
--
-- WARUM EINE EIGENE TABELLE UND KEINE FUENFTE ABWESENHEITSART
-- Die Abwesenheitsmeldung ist absichtlich schwer: drei Schritte, eine Minute
-- Sperre je Schritt, mindestens 30 Woerter (G-E5, G-E6, G-E8). Das soll sie
-- sein — sie gibt Einsaetze frei und loest Umdisposition aus.
--
-- Genau deshalb braucht der kleine Anlass einen eigenen, leichten Weg. Gibt es
-- nur die schwere Tuer, wird sie fuer alles benutzt: wer sich um zwanzig Minuten
-- verspaetet und keinen anderen Weg findet, meldet sich krank. Dann steht ein
-- Mensch als abwesend im System, obwohl er kommt, seine Einsaetze werden
-- freigegeben und das Buero disponiert um. Der Schaden waere groesser als der,
-- den die Huerde verhindern soll.
--
-- Eine fuenfte Art in `worker_absences` waere der falsche Ort gewesen: dort
-- haengt an jeder Zeile ein Zeitraum, ein Ausschluss gegen Ueberlappung und die
-- Wirkung auf die Belegschaftstafel. Eine Verspaetung hat nichts davon. Sie ist
-- ein EREIGNIS des heutigen Tages, kein Zustand.
--
-- DIE OBERGRENZE IST DER EIGENTLICHE ENTWURF
-- `minuten` ist auf 240 begrenzt. Wer laenger fehlt, hat keine Verspaetung,
-- sondern eine Abwesenheit — und muss durch die schwere Tuer. Ohne diese Grenze
-- waere der leichte Weg genau die Umgehung, gegen die er gebaut wurde: "ich
-- verspaete mich um 480 Minuten" ist ein freier Tag ohne Begruendung.
-- =============================================================================

CREATE TABLE IF NOT EXISTS worker_delays (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_profile_id UUID        NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  supplier_org_id   UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Der Tag, um den es geht. Eine Verspaetung von gestern interessiert niemanden
  -- mehr; sie bleibt als Vorgang stehen, faellt aber aus der Tagesansicht.
  gilt_fuer         DATE        NOT NULL,
  minuten           INT         NOT NULL,
  notiz             TEXT,

  gemeldet_von      UUID        REFERENCES users(id) ON DELETE SET NULL,
  gemeldet_am       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT worker_delays_minuten_chk
    CHECK (minuten >= 1 AND minuten <= 240)
);

COMMENT ON TABLE worker_delays IS
  'Verspaetungsmeldung (G3): der leichte Weg fuer den kleinen Anlass. Erzeugt KEINE Abwesenheit und gibt keinen Einsatz frei — der Mensch kommt ja. Ohne diesen Weg wuerde die schwere Abwesenheitsmeldung fuer Verspaetungen missbraucht.';
COMMENT ON COLUMN worker_delays.minuten IS
  'Hoechstens 240. Wer laenger fehlt, hat eine Abwesenheit und muss durch den mehrstufigen Ablauf — sonst waere dieser Weg die Umgehung, gegen die er gebaut wurde.';

-- Das Buero fragt: "Wer kommt heute spaeter?" — genau diese Frage, nichts sonst.
CREATE INDEX IF NOT EXISTS worker_delays_heute_idx
  ON worker_delays (supplier_org_id, gilt_fuer DESC, gemeldet_am DESC);

-- Zweimal dieselbe Meldung am selben Tag ist eine Korrektur, kein zweiter
-- Vorgang: der spaetere Wert gilt. Ohne diese Regel sammeln sich Dubletten, und
-- das Buero weiss nicht, welche Zahl stimmt.
CREATE UNIQUE INDEX IF NOT EXISTS worker_delays_eine_je_tag_idx
  ON worker_delays (worker_profile_id, gilt_fuer);

-- =============================================================================
-- ROLLBACK
--
-- Gefahrlos: eigene Tabelle, keine bestehende beruehrt. Wer zurueck muss,
-- verliert die Verspaetungsmeldungen; Abwesenheiten und Einsaetze bleiben
-- unberuehrt, weil dieser Weg sie nie angefasst hat — genau das ist sein Zweck.
--
-- DROP TABLE IF EXISTS worker_delays;
-- =============================================================================
