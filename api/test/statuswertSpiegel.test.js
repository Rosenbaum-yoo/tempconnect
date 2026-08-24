/**
 * Waechter gegen Drift beim Bestaetigungsstatus einer Zuweisung.
 *
 * WARUM ES DIESEN TEST GIBT
 * Fuer Benachrichtigungstypen haelt `benachrichtigungsSpiegel` seit G4b Code,
 * Datenbank-CHECK und Oberflaeche gegeneinander. Fuer
 * `worker_assignment_links.worker_confirmation_status` gab es nichts
 * Vergleichbares — und das hat sich beim sechsten Wert (`expired`,
 * Migration 193/195) an einem Dutzend Stellen geraecht, ohne dass ein Test rot
 * wurde. Drei Fehlerarten sind damals aufgetreten, und genau die drei prueft
 * dieser Waechter:
 *
 *   1. ANZEIGE VERGISST DEN WERT. Eine Status-Zuordnung faellt auf '' oder auf
 *      "aktiv" zurueck. Der Nutzer sieht dann gar kein Abzeichen — oder ein
 *      gruenes, wo nichts zustande kam.
 *   2. SPERRE OHNE `is_active`. Eine Abfrage schliesst einzelne Statuswerte
 *      aus, prueft aber nicht `is_active`. Jeder neue "erledigt"-Wert wird
 *      dadurch faelschlich als lebend gezaehlt.
 *   3. INSERT OHNE `ON CONFLICT`. Die Tabelle traegt
 *      UNIQUE (worker_user_id, assignment_id) (Migration 029). Wer eine Person
 *      einem Einsatz erneut zuweist, dem sie schon einmal zugeordnet war,
 *      loest ohne ON CONFLICT einen 23505 aus — an der laufenden Datenbank
 *      nachgestellt: HTTP 500, sowohl nach Verfall als auch nach Absage.
 *
 * Run: node --test test/statuswertSpiegel.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");
const API = path.join(REPO, "api");
const hasDb = Boolean(process.env.DATABASE_URL || (process.env.DB_HOST && process.env.POSTGRES_PASSWORD));

/** Die sechs Werte, wie sie in Migration 034 + 073 + 193 entstanden sind. */
const ERWARTETE_WERTE = [
  "auto_confirmed", "pending_confirmation", "worker_confirmed",
  "worker_declined", "worker_unavailable", "expired",
];

/** Werte, die KEINE lebende Besetzung sind — sie muessen ueberall auftauchen,
 *  wo Zustaende benannt werden, sonst sieht der Nutzer nichts oder Falsches. */
const ERLEDIGT = ["worker_declined", "worker_unavailable", "expired"];

function lies(relativ) {
  const p = path.join(REPO, relativ);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

/** Alle .js unter einem Verzeichnis, ohne node_modules und ohne Tests. */
function jsDateien(wurzel) {
  const treffer = [];
  const lauf = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === "test" || e.name.startsWith(".")) continue;
      const voll = path.join(dir, e.name);
      if (e.isDirectory()) lauf(voll);
      else if (e.name.endsWith(".js")) treffer.push(voll);
    }
  };
  lauf(wurzel);
  return treffer;
}

describe("Statuswert-Spiegel · die Datenbank kennt genau die erwarteten Werte",
  { skip: !hasDb && "Keine Datenbank konfiguriert" }, () => {

  it("der CHECK auf worker_confirmation_status fuehrt keine unbekannten Werte", async () => {
    const { default: pg } = await import("pg");
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL
        || `postgres://${process.env.DB_USER || "tempconnect"}:${process.env.POSTGRES_PASSWORD}`
           + `@${process.env.DB_HOST}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || "tempconnect"}`
    });
    try {
      const { rows } = await pool.query(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
          WHERE conrelid = 'worker_assignment_links'::regclass
            AND conname = 'worker_assignment_links_worker_confirmation_status_check'`
      );
      assert.ok(rows[0], "der CHECK existiert nicht — dann kann jeder Tippfehler in die Spalte");
      const def = rows[0].def;

      /* Zwei Darstellungen, dieselbe Lehre wie in benachrichtigungsSpiegel:
       * ARRAY['a'::text,…] zitiert jeden Wert, '{a,b,c}'::text[] nach einem
       * format(%L) laesst die Anfuehrungszeichen weg. */
      const literal = def.match(/'(\{[^}]*\})'::text\[\]/);
      const inDb = literal
        ? literal[1].slice(1, -1).split(",").map((w) => w.replace(/^"|"$/g, "").trim())
        : [...def.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

      const neu = inDb.filter((w) => !ERWARTETE_WERTE.includes(w));
      assert.deepEqual(neu, [],
        "Die Datenbank kennt Statuswerte, die dieser Waechter nicht kennt:\n" + neu.join("\n")
        + "\n\nWer einen Wert ergaenzt, traegt ihn hier UND in jeder Anzeige nach — "
        + "sonst faellt er in der Oberflaeche stumm durch.");

      const fehlend = ERWARTETE_WERTE.filter((w) => !inDb.includes(w));
      assert.deepEqual(fehlend, [],
        "Diese Werte erwartet der Code, der CHECK verbietet sie:\n" + fehlend.join("\n"));
    } finally {
      await pool.end();
    }
  });

  it("UNIQUE (worker_user_id, assignment_id) besteht — die Annahme hinter Pruefung 3", async () => {
    const { default: pg } = await import("pg");
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL
        || `postgres://${process.env.DB_USER || "tempconnect"}:${process.env.POSTGRES_PASSWORD}`
           + `@${process.env.DB_HOST}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || "tempconnect"}`
    });
    try {
      const { rows } = await pool.query(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
          WHERE conrelid = 'worker_assignment_links'::regclass AND contype = 'u'`
      );
      const treffer = rows.map((r) => r.def.replace(/\s+/g, " "));
      assert.ok(treffer.some((d) => /\(worker_user_id, assignment_id\)/.test(d)),
        "Der UNIQUE ist weg. Dann ist die ON-CONFLICT-Pflicht unten gegenstandslos — "
        + "dieser Waechter gehoert dann angepasst, nicht ignoriert. Gefunden: "
        + (treffer.join(" | ") || "keiner"));
    } finally {
      await pool.end();
    }
  });
});

describe("Statuswert-Spiegel · jede Anzeige kennt die erledigten Zustaende", () => {
  /* Namentliche Liste statt Heuristik: Wo ein Zustand in Worte gefasst wird,
   * ist eine bewusste Entscheidung — und genau diese Stellen sind beim
   * sechsten Wert durchgefallen. Kommt eine Flaeche dazu, gehoert sie hierher. */
  const FLAECHEN = [
    ["frontend/public/einsatzportal-einsaetze.html", "confBadge", "Einsatzliste des Arbeiters"],
    ["frontend/public/js/pages/workerSubmissionsReview.js", "function confBadge", "Disponenten-Karte"],
    ["frontend/public/js/pages/mitarbeiter.js", "worker_confirmation_status", "Mitarbeiterliste"],
    ["api/services/workforceSchedulePdfService.js", "ZUSATZ", "Monats-Einsatzplan (PDF, abrechnungsrelevant)"],
  ];

  for (const [datei, anker, was] of FLAECHEN) {
    it(`${was} benennt jeden erledigten Zustand`, () => {
      const text = lies(datei);
      if (text === null) return; // Checkout ohne frontend/ (API-Container)
      assert.ok(text.includes(anker), `Anker "${anker}" nicht gefunden — wurde ${datei} umgebaut?`);
      const fehlend = ERLEDIGT.filter((w) => !text.includes(w));
      assert.deepEqual(fehlend, [],
        `${datei} kennt diese Zustaende nicht:\n${fehlend.join("\n")}\n\n`
        + "Ohne Eintrag faellt die Anzeige auf ihren Rueckfall zurueck — leeres "
        + "Abzeichen oder, schlimmer, \"aktiv\" fuer etwas, das nie zustande kam.");
    });
  }
});

describe("Statuswert-Spiegel · Sperren pruefen is_active", () => {
  it("keine Statusliste ohne is_active in derselben Abfrage", () => {
    /* Der Verfall setzt Status UND is_active zugleich. Deshalb ist `is_active`
     * die belastbare Bedingung, und eine Statusliste ohne sie zaehlt jeden
     * kuenftigen erledigt-Wert faelschlich als lebend. */
    const verstoesse = [];
    for (const datei of jsDateien(path.join(API, "services")).concat(jsDateien(path.join(API, "routes")))) {
      const text = fs.readFileSync(datei, "utf8");
      const rel = path.relative(REPO, datei).replace(/\\/g, "/");
      // Jede SQL-Zeichenkette, die den Status filtert, im Fenster ihrer Abfrage betrachten
      const re = /worker_confirmation_status\s*(NOT\s+IN|!=|<>)/gi;
      let m;
      while ((m = re.exec(text)) !== null) {
        const start = Math.max(0, m.index - 700);
        const fenster = text.slice(start, m.index + 300);
        if (!/is_active/i.test(fenster)) {
          const zeile = text.slice(0, m.index).split("\n").length;
          verstoesse.push(`${rel}:${zeile}`);
        }
      }
    }
    assert.deepEqual(verstoesse, [],
      "Diese Abfragen schliessen Statuswerte aus, pruefen aber kein is_active:\n"
      + verstoesse.join("\n")
      + "\n\nJeder neue erledigt-Zustand zaehlt dort als lebend. Beispiel aus der "
      + "Vergangenheit: getUnassignedCapacityPosts hielt einen Kapazitaets-Posten "
      + "nach dem Verfall dauerhaft aus dem Dispatcher-Drawer heraus.");
  });
});

describe("Statuswert-Spiegel · jeder INSERT vertraegt eine Wiederverwendung", () => {
  it("kein INSERT INTO worker_assignment_links ohne ON CONFLICT", () => {
    /* UNIQUE (worker_user_id, assignment_id): Wer dieselbe Person demselben
     * Einsatz erneut zuweist — nach Absage, Freistellung oder Verfall —, trifft
     * ohne ON CONFLICT auf 23505. Kein Handler mappt den Code, das Ergebnis ist
     * ein HTTP 500 mitten in einem voellig normalen Ablauf. */
    const ohne = [];
    for (const datei of jsDateien(path.join(API, "services")).concat(jsDateien(path.join(API, "routes")))) {
      const text = fs.readFileSync(datei, "utf8");
      const rel = path.relative(REPO, datei).replace(/\\/g, "/");
      const re = /INSERT\s+INTO\s+worker_assignment_links/gi;
      let m;
      while ((m = re.exec(text)) !== null) {
        // Bis zum Ende des SQL-Literals schauen (grosszuegiges Fenster)
        const fenster = text.slice(m.index, m.index + 2600);
        if (/ON\s+CONFLICT/i.test(fenster)) continue;

        /* EINE Ausnahme, und sie prueft sich selbst: Wird der Einsatz
         * unmittelbar davor frisch angelegt (`INSERT INTO assignments …
         * RETURNING`), ist die assignment_id neu und ein Konflikt unmoeglich —
         * ein ON CONFLICT waere toter Code fuer einen Fall, den es nicht gibt.
         * Keine Namensliste: Baut jemand die Funktion so um, dass sie einen
         * BESTEHENDEN Einsatz verwendet, verschwindet dieser INSERT und der
         * Waechter schlaegt wieder an. Genau so soll es sein. */
        const davor = text.slice(Math.max(0, m.index - 1400), m.index);
        if (/INSERT\s+INTO\s+assignments[\s\S]*RETURNING/i.test(davor)) continue;

        const zeile = text.slice(0, m.index).split("\n").length;
        ohne.push(`${rel}:${zeile}`);
      }
    }
    assert.deepEqual(ohne, [],
      "Diese INSERTs haben kein ON CONFLICT:\n" + ohne.join("\n")
      + "\n\nDie Tabelle traegt UNIQUE (worker_user_id, assignment_id). Der zweite "
      + "Anlauf auf dasselbe Paar endet damit in 23505 und HTTP 500. Vorbild: "
      + "replaceAssignmentWorker recycelt die Zeile und stellt die Uhr neu.");
  });

  it("die Waechter-Suche findet ueberhaupt INSERTs — sonst prueft sie nichts", () => {
    let gefunden = 0;
    for (const datei of jsDateien(path.join(API, "services"))) {
      gefunden += (fs.readFileSync(datei, "utf8").match(/INSERT\s+INTO\s+worker_assignment_links/gi) || []).length;
    }
    assert.ok(gefunden >= 3,
      `nur ${gefunden} INSERTs gefunden — greift das Suchmuster noch?`);
  });
});
