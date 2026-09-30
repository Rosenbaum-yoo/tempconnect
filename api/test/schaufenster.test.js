/**
 * Das oeffentliche Schaufenster zeigt Mengen, keine Menschen (M1.6).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM DIE SCHWELLE DER KERN IST, NICHT DIE AGGREGATION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Der Plan sagt "aggregieren statt auflisten". Das genuegt nicht. Gemessen am
 * 2026-09-02 gegen die laufende Datenbank, gruppiert nach Rolle und Ort:
 *
 *     Altenpflege|Hamburg|2      Software|Hamburg|1        Elektriker|Koeln|1
 *     IT-Administrator|Koeln|1   Demenzbetreuung|Hamburg|1  ...
 *
 * JEDE Rollengruppe hat ein oder zwei Anzeigen. Ein "Aggregat" der Groesse
 * eins ist kein Aggregat, sondern der Datensatz mit anderer Beschriftung:
 * "1 Software-Kraft in Hamburg, 20 Koepfe" ist genau eine Anzeige genau einer
 * Firma. Ohne Mindestgruppengroesse waere das Schaufenster eine Personensuche
 * mit Zwischenschritt.
 *
 * Deshalb pruefen die Proben hier ZWEI Dinge, und die zweite ist die
 * wichtigere:
 *   1. die Zahlen stimmen,
 *   2. was unter der Schwelle liegt, verlaesst den Server nicht einzeln.
 *
 * Dazu eine ERLAUBNISLISTE der Felder: ein neues Feld ist per Vorgabe nicht
 * oeffentlich, bis jemand es eintraegt und dabei nachdenkt. Eine Verbotsliste
 * waere in vier Wochen unvollstaendig.
 *
 * Run: node --test --test-force-exit test/schaufenster.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  faltenNachSchwelle, schaufensterZahlen, MIND_GRUPPE, SONSTIGE, GRUPPEN_FELDER
} from "../services/schaufensterService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = path.resolve(__dirname, "..");
const quelle = (rel) => fs.readFileSync(path.join(API, rel), "utf8");
const ohneKommentare = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function musterPool(fn) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql: String(sql || ""), params: params || [] });
      const r = fn ? await fn(String(sql || "")) : null;
      return r === undefined || r === null ? { rows: [] } : r;
    }
  };
}

/* Die echte Verteilung vom 2026-09-02 — ueberwiegend Gruppen der Groesse 1. */
const ECHTE_LAGE = [
  { rolle: "Altenpflege", ort: "Hamburg", anzahl: 2, koepfe: 3 },
  { rolle: "IT-Administrator", ort: "Köln", anzahl: 1, koepfe: 2 },
  { rolle: "Pflegeassistenz", ort: "Hamburg", anzahl: 1, koepfe: 1 },
  { rolle: "Software", ort: "Hamburg", anzahl: 1, koepfe: 20 },
  { rolle: "Demenzbetreuung", ort: "Hamburg", anzahl: 1, koepfe: 1 },
  { rolle: "Ambulante Pflege", ort: "Hamburg", anzahl: 1, koepfe: 1 },
  { rolle: "Stationäre Pflege", ort: "Hamburg", anzahl: 1, koepfe: 1 },
  { rolle: "Elektriker", ort: "Köln", anzahl: 1, koepfe: 6 },
  { rolle: "Kinderbetreuung", ort: "Hamburg", anzahl: 1, koepfe: 1 },
  { rolle: "Industriemechaniker", ort: "Dortmund", anzahl: 1, koepfe: 3 },
  { rolle: "Schweißer", ort: "Dortmund", anzahl: 1, koepfe: 4 },
  { rolle: "Grundpflege", ort: "Hamburg", anzahl: 1, koepfe: 1 }
];

/* ── Die Schwelle ─────────────────────────────────────────────────────── */

describe("M1.6 · was zu klein ist, erscheint nicht einzeln", () => {
  it("eine Gruppe UNTER der Schwelle wandert in den Sammelposten", () => {
    const r = faltenNachSchwelle([
      { name: "Pflege", anzahl: 5, koepfe: 9 },
      { name: "Schweißer", anzahl: 1, koepfe: 4 },
      { name: "Software", anzahl: 2, koepfe: 20 }
    ]);
    assert.deepEqual(r.map((g) => g.name), ["Pflege", SONSTIGE]);
    assert.equal(r[1].anzahl, 3, "1 + 2 landen zusammen im Sammelposten");
    assert.equal(r[1].koepfe, 24);
  });

  it("die Schwelle ist DREI, nicht zwei — bei zwei genuegt ein Mitwisser", () => {
    assert.equal(MIND_GRUPPE, 3);
    const zwei = faltenNachSchwelle([{ name: "X", anzahl: 2, koepfe: 2 }]);
    assert.deepEqual(zwei.map((g) => g.name), [SONSTIGE]);
    const drei = faltenNachSchwelle([{ name: "X", anzahl: 3, koepfe: 3 }]);
    assert.deepEqual(drei.map((g) => g.name), ["X"]);
  });

  it("ein LEERER Name ist selbst eine Auskunft und wird gefaltet", () => {
    /* "Ort nicht gepflegt" ist ein Merkmal, an dem sich filtern liesse. */
    const r = faltenNachSchwelle([
      { name: "", anzahl: 9, koepfe: 9 },
      { name: "Hamburg", anzahl: 4, koepfe: 4 }
    ]);
    assert.deepEqual(r.map((g) => g.name), ["Hamburg", SONSTIGE]);
    assert.equal(r[1].anzahl, 9);
  });

  it("die Summe bleibt erhalten — gefaltet wird die Zuordnung, nicht die Menge", () => {
    const ein = [
      { name: "A", anzahl: 5, koepfe: 5 },
      { name: "B", anzahl: 1, koepfe: 7 },
      { name: "C", anzahl: 2, koepfe: 3 }
    ];
    const raus = faltenNachSchwelle(ein);
    const summe = (xs, f) => xs.reduce((n, x) => n + x[f], 0);
    assert.equal(summe(raus, "anzahl"), summe(ein, "anzahl"));
    assert.equal(summe(raus, "koepfe"), summe(ein, "koepfe"));
  });

  it("AN DER ECHTEN LAGE: keine einzige Rolle uebersteht die Schwelle", () => {
    /*
     * Das ist die Probe, die den Sinn der Schwelle belegt. Mit dem Bestand
     * vom 2026-09-02 waere JEDE Rollengruppe eine Einzelanzeige gewesen —
     * "1 Software-Kraft in Hamburg, 20 Koepfe" ist genau eine Firma.
     */
    const nachRolle = faltenNachSchwelle(
      ECHTE_LAGE.map((z) => ({ name: z.rolle, anzahl: z.anzahl, koepfe: z.koepfe }))
    );
    assert.deepEqual(nachRolle.map((g) => g.name), [SONSTIGE],
      "eine Rolle waere einzeln sichtbar — und damit eine identifizierbare Anzeige");
    assert.equal(nachRolle[0].anzahl, 13);
  });

  it("AN DER ECHTEN LAGE: nur der grosse Ort bleibt stehen", () => {
    const m = new Map();
    for (const z of ECHTE_LAGE) {
      const e = m.get(z.ort) || { name: z.ort, anzahl: 0, koepfe: 0 };
      e.anzahl += z.anzahl; e.koepfe += z.koepfe;
      m.set(z.ort, e);
    }
    const nachOrt = faltenNachSchwelle([...m.values()]);
    assert.deepEqual(nachOrt.map((g) => g.name), ["Hamburg", SONSTIGE]);
    assert.equal(nachOrt[0].anzahl, 9);
    assert.equal(nachOrt[1].anzahl, 4, "Köln (2) und Dortmund (2) zusammen");
  });

  it("die Reihenfolge ist stabil: gross vor klein, Sammelposten zuletzt", () => {
    const r = faltenNachSchwelle([
      { name: "B", anzahl: 4, koepfe: 4 },
      { name: "A", anzahl: 4, koepfe: 4 },
      { name: "Z", anzahl: 9, koepfe: 9 },
      { name: "winzig", anzahl: 1, koepfe: 1 }
    ]);
    assert.deepEqual(r.map((g) => g.name), ["Z", "A", "B", SONSTIGE]);
  });
});

/* ── Die Zahlen ───────────────────────────────────────────────────────── */

describe("M1.6 · die Zahlen des Schaufensters", () => {
  const antwort = (rows) => ({ rows });

  it("EINE Abfrage je Menge, nicht eine je Kategorie", async () => {
    const pool = musterPool(() => antwort([]));
    await schaufensterZahlen(pool);
    assert.equal(pool.calls.length, 2, "sonst waechst der Aufwand mit den Rollen");
    assert.ok(pool.calls[0].sql.includes("capacity_posts"));
    assert.ok(pool.calls[1].sql.includes("demand_requests"));
  });

  it("gezaehlt wird nur, was wirklich offen ist", () => {
    const s = ohneKommentare(quelle("services/schaufensterService.js"));
    assert.ok(s.includes("status = 'active'"), "archivierte Anzeigen sind kein Marktangebot");
    assert.ok(s.includes("status = 'open'"), "erfuellte Bedarfe sind keine offene Nachfrage");
  });

  it("die Gesamtzahl kommt aus den ROHZEILEN, nicht aus den gefalteten Gruppen", async () => {
    /* Sonst waere sie je nach Schwelle eine andere — und eine Kennzahl, die
     * sich mit ihrer Darstellung aendert, ist keine. */
    const rows = ECHTE_LAGE.map((z) => ({ ...z }));
    const pool = musterPool((sql) => antwort(sql.includes("capacity_posts") ? rows : []));
    const z = await schaufensterZahlen(pool);
    assert.equal(z.kapazitaet.anzeigen, 13);
    assert.equal(z.kapazitaet.koepfe, 44);
    /* und die gefaltete Sicht nennt dieselbe Menge */
    const gefaltet = z.kapazitaet.nach_ort.reduce((n, g) => n + g.anzahl, 0);
    assert.equal(gefaltet, 13);
  });

  it("OHNE TABELLE ist die Antwort 'nicht verfuegbar', nicht ein Fehler", async () => {
    const pool = musterPool(() => { throw new Error("relation does not exist"); });
    const z = await schaufensterZahlen(pool);
    assert.equal(z.verfuegbar, false);
    assert.deepEqual(z.kapazitaet.nach_rolle, []);
    assert.equal(z.kapazitaet.anzeigen, 0);
  });

  it("ohne Pool wird gar nicht erst gefragt", async () => {
    const z = await schaufensterZahlen(null);
    assert.equal(z.verfuegbar, false);
  });
});

/* ── Die Feldliste ────────────────────────────────────────────────────── */

describe("M1.6 · nichts verlaesst den Server, was eine Firma benennt", () => {
  /** Jeden Schluessel der Antwort einsammeln, beliebig tief. */
  function alleSchluessel(o, raus = new Set()) {
    if (Array.isArray(o)) { for (const x of o) alleSchluessel(x, raus); return raus; }
    if (o && typeof o === "object") {
      for (const [k, v] of Object.entries(o)) { raus.add(k); alleSchluessel(v, raus); }
    }
    return raus;
  }

  it("eine Gruppe traegt GENAU die erlaubten Felder", async () => {
    const rows = ECHTE_LAGE.map((z) => ({ ...z }));
    const pool = musterPool(() => ({ rows }));
    const z = await schaufensterZahlen(pool);
    for (const teil of [z.kapazitaet, z.bedarf]) {
      for (const gruppe of [...teil.nach_rolle, ...teil.nach_ort]) {
        assert.deepEqual(Object.keys(gruppe).sort(), [...GRUPPEN_FELDER].sort(),
          `unerwartetes Feld in einer Gruppe: ${JSON.stringify(gruppe)}`);
      }
    }
  });

  it("kein Schluessel der Antwort benennt eine Firma oder eine Anzeige", async () => {
    const rows = ECHTE_LAGE.map((z) => ({ ...z }));
    const pool = musterPool(() => ({ rows }));
    const z = await schaufensterZahlen(pool);
    const verboten = /(^|_)(id|ids|uuid|email|mail|phone|telefon|company|firma|supplier|user|title|titel|preis|price|created_at|updated_at)($|_)/i;
    for (const k of alleSchluessel(z)) {
      assert.ok(!verboten.test(k), `Schluessel "${k}" gehoert nicht ins Schaufenster`);
    }
  });

  it("die Abfrage holt gar nicht erst, was nicht heraus darf", () => {
    /* Zweite Verteidigung, eine Ebene tiefer: was nie gelesen wird, kann auch
     * kein spaeterer Umbau versehentlich durchreichen. */
    const s = ohneKommentare(quelle("services/schaufensterService.js"));
    for (const feld of ["supplier_company_id", "company_name", "title", "price_min", "price_max", "id"]) {
      assert.ok(!new RegExp(`SELECT[\\s\\S]{0,400}\\b${feld}\\b`).test(s),
        `${feld} wird abgefragt — es hat im Schaufenster nichts zu suchen`);
    }
  });
});

/* ── Die Erreichbarkeit ───────────────────────────────────────────────── */

describe("M1.6 · ohne Konto lesbar — das ist der ganze Zweck", () => {
  it("die Route traegt KEIN requireAuth", () => {
    const s = ohneKommentare(quelle("routes/schaufenster.js"));
    assert.ok(s.includes('router.get("/public/schaufenster"'), "die Route fehlt");
    assert.ok(!s.includes("requireAuth"),
      "mit Anmeldezwang waere es kein Schaufenster, sondern der Marktplatz");
  });

  it("sie ist in app.js wirklich eingehaengt", () => {
    /* Ein Router, den niemand registriert, ist die teuerste Sorte Datei:
     * er sieht fertig aus und antwortet mit 404. */
    const s = ohneKommentare(quelle("app.js"));
    assert.ok(s.includes('from "./routes/schaufenster.js"'), "nicht importiert");
    assert.ok(s.includes("v1.use(createSchaufensterRouter(deps))"), "nicht eingehaengt");
  });

  it("sie darf zwischengespeichert werden — eine Suchmaschine holt sie oft", () => {
    const s = ohneKommentare(quelle("routes/schaufenster.js"));
    assert.match(s, /Cache-Control["']\s*,\s*["']public, max-age=\d+/);
  });

  it("auch der Fehlerzweig antwortet 200 mit verfuegbar:false, nicht 500", () => {
    /* Eine Startseite, die wegen einer Kennzahl kaputtgeht, ist schlimmer als
     * eine ohne Kennzahl. */
    const s = ohneKommentare(quelle("routes/schaufenster.js"));
    assert.ok(!s.includes("status(500)"), "ein 500 auf der oeffentlichen Seite");
    assert.ok(s.includes("verfuegbar: false"));
  });
});

/* ── Die Seite ────────────────────────────────────────────────────────── */

describe("M1.6 · die Seite zeigt drei Zustaende und keinen davon still", () => {
  const PUB = path.resolve(API, "..", "frontend", "public");
  const da = fs.existsSync(path.join(PUB, "schaufenster.html"));
  const wenn = da ? it : it.skip;
  const seite = () => fs.readFileSync(path.join(PUB, "schaufenster.html"), "utf8");
  const skript = () => fs.readFileSync(path.join(PUB, "js", "pages", "schaufenster.js"), "utf8");

  wenn("LAEDT, FEHLER und INHALT haben je einen eigenen Platz", () => {
    const h = seite();
    for (const id of ["sfLaden", "sfFehler", "sfInhalt"]) {
      assert.ok(h.includes(`id="${id}"`), `${id} fehlt — ein Zustand waere unsichtbar`);
    }
  });

  wenn("ein NICHT VERFUEGBARES Protokoll landet im Fehlerzweig, nicht im leeren Inhalt", () => {
    /* Sonst saehe der Leser eine Null und hielte sie fuer eine Aussage ueber
     * den Markt statt ueber die Technik. */
    const j = skript();
    assert.match(j, /if \(!d \|\| d\.verfuegbar === false\) return fehler\(\)/);
  });

  wenn("die Namen aus der Datenbank gehen ueber textContent, nie ueber innerHTML", () => {
    /* Kommentare RAUS. Beim ersten Anlauf schlug diese Probe an der eigenen
       Erklaerung an ("nie mit innerHTML") — dieselbe Falle wie bei den
       Waechtern in M1.1 und M1.3. Eine Probe, die Prosa liest, prueft Prosa. */
    const j = ohneKommentare(skript());
    assert.ok(!j.includes("innerHTML"), "innerHTML mit Datenbankwerten ist eine XSS-Luecke");
    assert.ok(j.includes("textContent = g.name"));
  });

  wenn("der Aufruf schickt KEINE Sitzung mit", () => {
    /* Ein Aufruf mit Sitzung waere ein anderer Fall als der, den eine
     * Suchmaschine sieht — und die Probe waere blind fuer den echten. */
    const j = ohneKommentare(skript());
    assert.ok(!j.includes("credentials"), "das Schaufenster braucht keine Anmeldung");
    assert.ok(j.includes('fetch("/api/public/schaufenster"'));
  });

  wenn("die Mindestgruppe wird dem Leser GENANNT", () => {
    /* Eine Zahl, deren Zustandekommen der Leser nicht kennt, ist keine offene
     * Zahl. Ohne den Hinweis wirkt "Sonstige" wie eine Restkategorie statt
     * wie ein Schutz. */
    const j = skript();
    assert.match(j, /Gruppen mit weniger als/);
    assert.match(j, /d\.mindestgruppe/);
  });

  wenn("die Seite ist fuer Suchmaschinen gebaut", () => {
    const h = seite();
    assert.match(h, /<meta name="robots" content="index, follow"/);
    assert.match(h, /<link rel="canonical"/);
    assert.match(h, /<meta name="description" content="[^"]{40,}"/);
    assert.match(h, /<title>[^<]+<\/title>/);
  });

  wenn("sie ist aus dem Seitenfuss verlinkt — also von jeder Seite erreichbar", () => {
    const f = fs.readFileSync(path.join(PUB, "js", "footer.js"), "utf8");
    assert.ok(f.includes('href="/public/schaufenster.html"'),
      "eine Seite, die nur ihre URL kennt, ist nicht geliefert");
  });
});
