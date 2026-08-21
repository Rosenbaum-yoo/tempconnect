/**
 * Der Mandanten-Modell-Waechter (V-1 / P1-16).
 *
 * WAS HIER SCHIEFGING
 * `docs/security/TENANT_ISOLATION_MODEL.md` hat fuer 63 Tabellen eine
 * **Migration 117** als naechsten Haertungsschritt gefuehrt. Die gibt es nicht —
 * `sql/migrations/` springt von 116 auf 118. Das ist die gefaehrlichste Sorte
 * Doku-Fehler: **sie behauptet einen Schutz, den es nicht gibt.** Wer sie liest,
 * hoert auf zu suchen.
 *
 * Beim Nachmessen gegen die laufende Datenbank kam heraus, dass das Dokument in
 * BEIDE Richtungen falsch war:
 *   - 18 der genannten Tabellen haben die behauptete Spalte `org_id` nicht;
 *     ihre `*_company_id`-Spalten zeigen auf `users`, nicht auf `organizations`.
 *   - Der Abschnitt "RLS AKTIV" fuehrte `subscriptions` (von 116 ausdruecklich
 *     ausgenommen) und `vendor_pool_entries` (existiert nicht) als geschuetzt.
 *   - Umgekehrt fehlten 60 Tabellen, die sehr wohl einen Mandanten tragen.
 *
 * ZWEI SCHICHTEN, WIE IM REPO ETABLIERT
 *   1. OHNE Datenbank (laeuft immer): Dokument gegen Registry, Zeichen fuer
 *      Zeichen. Der Zustandsteil wird gerendert, nicht gepflegt — er kann damit
 *      nicht mehr von der Registry abweichen.
 *   2. MIT Datenbank (laeuft im Container): Registry gegen die Wirklichkeit.
 *      Ein Mock kann kein `WHERE` erzwingen und kennt keine Indizes; ob RLS
 *      wirklich greift, weiss nur Postgres.
 *
 * Schicht 2 ueberspringt sich ohne `DB_HOST` — aber LAUT: der Zaehler unten
 * meldet, was nicht geprueft wurde (CLAUDE.md §0.9, kein stiller Skip).
 *
 * Run: node --test --test-force-exit test/mandantenModellWaechter.test.js
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rendereModell, MARKER_START, MARKER_ENDE } from "./helpers/mandantenModell.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");
const REGISTRY_PFAD = path.join(__dirname, "fixtures", "mandantenTabellen.json");
const DOKUMENT_PFAD = path.join(REPO, "docs", "security", "TENANT_ISOLATION_MODEL.md");

const registry = JSON.parse(fs.readFileSync(REGISTRY_PFAD, "utf8"));
const dokument = fs.readFileSync(DOKUMENT_PFAD, "utf8");

const EINSTUFUNGEN = new Set([
  "geschuetzt", "bereit", "bereit_ohne_daten", "blockiert_daten", "kein_mandantentraeger",
]);

describe("Mandanten-Modell — Dokument gegen Registry", () => {
  it("die Registry ist vollstaendig, sortiert und doppelfrei", () => {
    assert.ok(registry.tabellen.length >= 70,
      `nur ${registry.tabellen.length} Tabellen — die Erhebung hat nicht gegriffen`);

    const namen = registry.tabellen.map((t) => t.tabelle);
    assert.deepEqual(namen, [...namen].sort(), "Eintraege alphabetisch sortieren");
    assert.equal(new Set(namen).size, namen.length, "doppelte Tabellen in der Registry");

    for (const t of registry.tabellen) {
      assert.ok(EINSTUFUNGEN.has(t.einstufung), `${t.tabelle}: unbekannte Einstufung "${t.einstufung}"`);
      assert.ok(t.begruendung && t.begruendung.length > 20,
        `${t.tabelle}: Einstufung ohne Begruendung — eine Ausnahme ohne Grund ist eine Hintertuer`);
      assert.ok(Array.isArray(t.orgSpalten) && t.orgSpalten.length > 0,
        `${t.tabelle}: keine Traegerspalte vermerkt`);
    }
  });

  it("keine Einstufung ohne Beschreibung — sonst raet der Leser", () => {
    for (const schluessel of EINSTUFUNGEN) {
      assert.ok(registry.einstufungen[schluessel],
        `Einstufung "${schluessel}" wird benutzt, ist aber nirgends erklaert`);
    }
  });

  it("die Einstufung stimmt mit den gemessenen Zahlen ueberein", () => {
    /* Die Ratsche gegen Schoenfaerberei: Eine Tabelle mit NULL-Traegerspalte
     * darf nicht als "bereit" gefuehrt werden, und eine lueckenlos gefuellte
     * nicht ohne Grund als blockiert. */
    const falsch = registry.tabellen.filter((t) => {
      if (t.einstufung === "bereit") return !(t.zeilen > 0 && t.ohneOrg === 0);
      if (t.einstufung === "bereit_ohne_daten") return t.zeilen !== 0;
      if (t.einstufung === "blockiert_daten") return !(t.zeilen > 0 && t.ohneOrg > 0);
      if (t.einstufung === "geschuetzt") return !t.rls;
      return false;
    });
    assert.deepEqual(falsch.map((t) => `${t.tabelle} (${t.einstufung}: ${t.ohneOrg}/${t.zeilen}, rls=${t.rls})`), []);
  });

  it("das Dokument entspricht der Registry — Zeichen fuer Zeichen", () => {
    const von = dokument.indexOf(MARKER_START);
    const bis = dokument.indexOf(MARKER_ENDE);
    assert.ok(von !== -1 && bis > von, `Marker fehlen in ${path.relative(REPO, DOKUMENT_PFAD)}`);
    const ist = dokument.slice(von + MARKER_START.length, bis);
    const soll = "\n" + rendereModell(registry) + "\n";
    assert.equal(ist, soll,
      "Der Zustandsteil des Modells weicht von der Registry ab. Er wird GENERIERT, " +
      "nicht gepflegt:\n  node scripts/render-mandanten-modell.js --write");
  });

  it("das Dokument verspricht keine Migration mehr, die es nicht gibt", () => {
    /*
     * Der eigentliche Befund P1-16. Diese Probe ist bewusst allgemein: sie faengt
     * nicht nur die 117, sondern JEDE im Modell genannte Migration, die es in
     * `sql/migrations/` nicht gibt. Eine behauptete Sicherung ist schlimmer als
     * eine fehlende — wer sie liest, hoert auf zu suchen.
     */
    const vorhanden = new Set(
      fs.readdirSync(path.join(REPO, "sql", "migrations"))
        .filter((f) => f.endsWith(".sql"))
        .map((f) => f.slice(0, 3))
    );
    assert.ok(vorhanden.size > 100, `nur ${vorhanden.size} Migrationen gefunden — stimmt der Pfad?`);

    const genannt = [...dokument.matchAll(/Migration\s+(\d{3})/g)].map((m) => m[1]);
    const erfunden = [...new Set(genannt)].filter((nr) => !vorhanden.has(nr)).sort();
    assert.deepEqual(erfunden, [],
      `Das Modell nennt Migration(en), die es in sql/migrations/ nicht gibt: ${erfunden.join(", ")}.\n` +
      "Genau so entstand P1-16: 63 Tabellen verwiesen auf eine 'Migration 117', die nie " +
      "geschrieben wurde. Entweder die Migration schreiben oder den Verweis entfernen.");
  });

  it("keine Stelle im Modell behauptet RLS fuer eine Tabelle, die keins hat", () => {
    /*
     * Die gefaehrlichere Haelfte des Befunds P1-16. Das Dokument fuehrte
     * `subscriptions` als "**JA** (Migration 116)" — 116 nimmt sie ausdruecklich
     * aus (nutzer-, nicht mandantenskaliert), und die Datenbank zeigt
     * `relrowsecurity = false`. Ebenso `vendor_pool_entries`, das es gar nicht
     * gibt. Wer eine behauptete Sicherung liest, hoert auf zu suchen.
     *
     * Geprueft wird das ganze Dokument, nicht nur der generierte Teil — die drei
     * falschen Behauptungen standen alle ausserhalb davon.
     */
    const geschuetzt = new Set(registry.rlsAktivLautDatenbank);
    assert.ok(geschuetzt.size >= 5, "die gemessene RLS-Liste fehlt in der Registry");

    const behauptet = [...dokument.matchAll(/^\|\s*`([a-z0-9_]+)`\s*\|[^|]*\*\*JA\*\*/gm)]
      .map((m) => m[1]);
    assert.ok(behauptet.length >= 3,
      `nur ${behauptet.length} RLS-Behauptungen erkannt — greift das Muster noch?`);

    const unbelegt = [...new Set(behauptet)].filter((t) => !geschuetzt.has(t)).sort();
    assert.deepEqual(unbelegt, [],
      `Das Modell behauptet RLS fuer: ${unbelegt.join(", ")} — die Datenbank sagt nein.
` +
      "Entweder RLS aktivieren oder die Behauptung zuruecknehmen. Eine Doku, die " +
      "Schutz verspricht, den es nicht gibt, ist schlimmer als gar keine.");
  });

  it("S: er wuerde eine erfundene Migration und eine geschoente Einstufung bemerken", () => {
    /* Rueckmutation ohne den Baum anzufassen — an kuenstlichen Eingaben, die
     * dieselben Pruefungen durchlaufen wie die echten. */
    const vorhanden = new Set(["116", "118"]);
    const erfunden = ["117", "116"].filter((nr) => !vorhanden.has(nr));
    assert.deepEqual(erfunden, ["117"], "die Migrations-Probe wuerde eine Erfindung durchlassen");

    const geschoent = [{ tabelle: "x", einstufung: "bereit", zeilen: 10, ohneOrg: 4, rls: false }]
      .filter((t) => t.einstufung === "bereit" && !(t.zeilen > 0 && t.ohneOrg === 0));
    assert.equal(geschoent.length, 1, "die Einstufungs-Probe wuerde Schoenfaerberei durchlassen");

    /* Und eine erfundene RLS-Behauptung faellt auf — an einer kuenstlichen Zeile
     * im echten Format, damit das Muster selbst mitgeprueft wird. */
    const probe = "| `gibt_es_nicht` | **JA** (Migration 116) | Attrappe |";
    const erkannt = [...probe.matchAll(/^\|\s*`([a-z0-9_]+)`\s*\|[^|]*\*\*JA\*\*/gm)].map((m) => m[1]);
    assert.deepEqual(erkannt, ["gibt_es_nicht"], "das Muster erkennt eine RLS-Behauptung nicht mehr");
    assert.ok(!new Set(registry.rlsAktivLautDatenbank).has("gibt_es_nicht"),
      "die Probe wuerde eine erfundene Behauptung durchlassen");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * Schicht 2 — Registry gegen die laufende Datenbank
 * ═══════════════════════════════════════════════════════════════════════════ */

const hatDb = Boolean(process.env.DB_HOST || process.env.DATABASE_URL);

describe("Mandanten-Modell — Registry gegen die Wirklichkeit", { skip: !hatDb }, () => {
  let pool = null;

  before(async () => {
    const { default: pg } = await import("pg");
    pool = new pg.Pool(
      process.env.DATABASE_URL
        ? { connectionString: process.env.DATABASE_URL }
        : {
            host: process.env.DB_HOST,
            port: Number(process.env.DB_PORT || 5432),
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
          }
    );
  });

  after(async () => { if (pool) await pool.end(); });

  it("jede Tabelle der Registry existiert wirklich", async () => {
    const { rows } = await pool.query(
      "SELECT t AS tabelle FROM unnest($1::text[]) t WHERE to_regclass('public.'||t) IS NULL",
      [registry.tabellen.map((t) => t.tabelle)]
    );
    assert.deepEqual(rows.map((r) => r.tabelle), [],
      "Die Registry nennt Tabellen, die es nicht gibt — dieselbe Richtung, die bei P1-16 fehlte.");
  });

  it("jede vermerkte Traegerspalte existiert und zeigt auf organizations", async () => {
    const erwartet = registry.tabellen.flatMap((t) => t.orgSpalten.map((s) => `${t.tabelle}.${s}`)).sort();
    const { rows } = await pool.query(`
      SELECT DISTINCT c.conrelid::regclass::text || '.' || a.attname AS ref
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE c.contype = 'f' AND c.confrelid = 'organizations'::regclass
      ORDER BY 1`);
    const ist = rows.map((r) => r.ref).sort();
    assert.deepEqual(ist, erwartet,
      "Registry und Datenbank sind auseinandergelaufen. Neu erheben und " +
      "`node scripts/render-mandanten-modell.js --write` ausfuehren.\n" +
      "GENAU DAS ist P1-16: das Modell nannte 18-mal `org_id`, wo die Spalte anders " +
      "heisst oder auf `users` zeigt — eine daraus geschriebene Migration waere " +
      "gescheitert und haette (wie 116) den ganzen Backstop mit in den Rollback gerissen.");
  });

  it("der RLS-Zustand der Registry stimmt mit der Datenbank ueberein", async () => {
    const { rows } = await pool.query(`
      SELECT c.relname AS tabelle, c.relrowsecurity AS rls, c.relforcerowsecurity AS force
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1::text[])`,
      [registry.tabellen.map((t) => t.tabelle)]);
    const ist = new Map(rows.map((r) => [r.tabelle, r]));
    const abweichungen = registry.tabellen
      .filter((t) => {
        const r = ist.get(t.tabelle);
        return !r || r.rls !== t.rls || r.force !== t.force;
      })
      .map((t) => {
        const r = ist.get(t.tabelle);
        return `${t.tabelle}: Registry rls=${t.rls}/force=${t.force}, DB rls=${r?.rls}/force=${r?.force}`;
      });
    assert.deepEqual(abweichungen, [],
      "Der behauptete Backstop stimmt nicht mit dem tatsaechlichen ueberein.");
  });

  it("keine Tabelle mit org-Fremdschluessel fehlt in der Registry", async () => {
    const { rows } = await pool.query(`
      SELECT DISTINCT c.conrelid::regclass::text AS tabelle
      FROM pg_constraint c
      WHERE c.contype = 'f' AND c.confrelid = 'organizations'::regclass
      ORDER BY 1`);
    const bekannt = new Set(registry.tabellen.map((t) => t.tabelle));
    const fehlend = rows.map((r) => r.tabelle).filter((t) => !bekannt.has(t));
    assert.deepEqual(fehlend, [],
      "Diese Tabellen tragen einen Mandanten und stehen in keinem Modell. Genau so " +
      "entsteht die naechste Luecke: was nicht im Modell steht, wird nicht abgesichert.");
  });
});

if (!hatDb) {
  describe("Mandanten-Modell — Hinweis", () => {
    it("Schicht 2 wurde NICHT geprueft (keine Datenbank)", () => {
      /* Kein stiller Skip: die Zahl steht im Protokoll, damit niemand die
       * gruene Suite fuer einen Nachweis der Trennung haelt. */
      console.log(
        `    ℹ ${registry.tabellen.length} Tabellen nur gegen die Registry geprueft, nicht gegen die ` +
        `Datenbank — DB_HOST ist nicht gesetzt. Im Container laeuft Schicht 2 mit.`
      );
      assert.ok(true);
    });
  });
}
