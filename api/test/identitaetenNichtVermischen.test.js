/**
 * ═══════════════════════════════════════════════════════════════════════════
 * IDENTITAETEN NICHT VERMISCHEN — Nutzer-Kennung gegen Org-Kennung
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WARUM ES DIESE WACHE GIBT, und warum der Schema-Waechter daneben nicht genuegt:
 *
 * `sqlSchemaWaechter.test.js` prueft, ob eine Spalte EXISTIERT. Das ist die
 * falsche Frage fuer die teuerste Fehlerklasse dieses Projekts. Bei ihr existieren
 * alle beteiligten Spalten — falsch ist, WORAUF sie zeigen:
 *
 *     LEFT JOIN supplier_reputation sr ON sr.supplier_id = vp.supplier_org_id
 *
 * `supplier_reputation.supplier_id` zeigt per Fremdschluessel auf `users`,
 * `vendor_pool.supplier_org_id` auf `organizations`. Ein Nutzer-Schluessel gegen
 * einen Org-Schluessel trifft NIE. Und weil es LEFT JOINs sind, gibt es keinen
 * Fehler, keine Warnung, keine leere Antwort — nur lauter NULL, die aussieht wie
 * "dazu gibt es nichts".
 *
 * WAS DAS GEKOSTET HAT, gemessen, nicht geschaetzt:
 *   - elf Stellen in `vendorPoolService`: die Lieferantenverwaltung zeigte KEINE
 *     Reputation, und die Liste der schwaechsten Lieferanten war dauerhaft leer
 *   - `getWorkforceCapacity`: Kapazitaet aller Vorzugslieferanten immer 0
 *   - "aktive Angebote" in der Vorzugsliste: immer 0
 *   - `instantMatchService`: kein Lieferantenname, keine Nachweise, keine
 *     Vorzugsstufe, kein Anbieter je "verifiziert"
 *   - `/matching/smart-explain/:supplierId`: eine erklaerbare KI-Bewertung, die
 *     NIE ein einziges Signal gefunden hat und trotzdem mit 200 antwortete
 *
 * Diese Wache stellt deshalb eine ANDERE Frage: passen die beiden Seiten eines
 * Vergleichs zur selben Identitaet? Sie beantwortet sie DB-frei, aus dem
 * Abschnitt `fremdschluessel` der Schema-Momentaufnahme (dort seit Z17).
 *
 * WARUM DER SPALTENNAME GENUEGT: gemessen am 2026-09-28 zeigen 86 Spaltennamen
 * auf `users` und 18 auf `organizations` — und KEIN Name zeigt je nach Tabelle
 * auf beides. Der Name bestimmt die Identitaetswelt projektweit eindeutig. Nur
 * `id` ist nichtssagend; dort wird der Alias ueber FROM/JOIN aufgeloest.
 *
 * DIE FALLE, die diese ganze Welle erklaert: Namen mit "company" darin zeigen auf
 * NUTZER. `supplier_company_id`, `owner_company_id`, `requester_company_id`,
 * `company_id` — alle vier Fremdschluessel auf `users(id)`. Wer nach dem Namen
 * geht, verbindet sie mit `organizations` und bekommt lautlos nichts.
 *
 * Run: node --test --test-force-exit test/identitaetenNichtVermischen.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  jsLiterale, normalisiere, quellDateien, SCHEMA_DATEI, API_DIR, aliasKarte
} from "./lib/sqlScanner.mjs";

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. DIE ZWEI WELTEN, aus der Momentaufnahme
 * ═══════════════════════════════════════════════════════════════════════════ */

const schemaVorhanden = fs.existsSync(SCHEMA_DATEI);
const schema = schemaVorhanden ? JSON.parse(fs.readFileSync(SCHEMA_DATEI, "utf8")) : null;
const FK = (schema && schema.fremdschluessel) || {};

const NUTZER = new Set();
const ORG = new Set();
for (const spalten of Object.values(FK)) {
  for (const [spalte, ziel] of Object.entries(spalten)) {
    if (ziel === "users") NUTZER.add(spalte);
    else if (ziel === "organizations") ORG.add(spalte);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * WARUM NUR users GEGEN organizations — und nicht jedes Ziel gegen jedes
 *
 * Die naheliegende Verallgemeinerung waere: JEDES Fremdschluessel-Ziel gegen
 * jedes andere. 180 der 183 Spaltennamen mit Fremdschluessel haben genau ein
 * Ziel, die Daten waeren also da. Gemessen am 2026-09-28 ueber den ganzen
 * Bestand: 903 Vergleiche, EIN Befund — und der war ein Fehlalarm.
 *
 *     services/vendorPoolService.js:312   av.vendor_id = vp.supplier_org_id
 *
 * `av` ist dort eine ABGELEITETE Tabelle: `JOIN (SELECT DISTINCT vendor_id FROM
 * (SELECT rc.supplier_org_id AS vendor_id …)) av`. Ihre Spalte heisst zufaellig
 * wie eine, die anderswo auf `support_vendors` zeigt — traegt aber in Wahrheit
 * eine Org-Kennung. Ein Spaltenname aus einer abgeleiteten Relation hat keine
 * Fremdschluessel-Information; die Methode kann das nicht wissen.
 *
 * Also: null echte Funde, ein Fehlalarm, und ein dauerhaftes Fehlalarm-Risiko
 * genau dort, wo dieses Projekt viel mit Unterabfragen arbeitet. Die enge
 * Fassung (users gegen organizations) fand dagegen SECHS echte Fehler. Das
 * Ergebnis ist hier festgehalten, damit es niemand ein zweites Mal misst — und
 * damit klar ist, dass die Enge eine Entscheidung ist und kein Versaeumnis.
 * ═══════════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. BEGRUENDETE AUSNAHMEN
 *
 * Schluessel: "<datei>::<linke seite> = <rechte seite>". Jeder Eintrag braucht
 * einen Grund, der ERKLAERT, warum die Vermischung hier richtig ist — nicht
 * "ist halt so". Die Liste ist zurzeit leer, und das ist eine Aussage: der
 * gesamte Bestand ist sauber (gemessen am 2026-09-28, nach Welle Z).
 * ═══════════════════════════════════════════════════════════════════════════ */
const AUSNAHMEN = new Map([]);

/* Spaltennamen, die zwar in der Fremdschluessel-Liste stehen, aber in einer
   ANDEREN Tabelle ohne Fremdschluessel etwas anderes bedeuten koennen. Zurzeit
   keine bekannt; der Eintrag bliebe hier mit Begruendung stehen, statt den
   Namen still aus der Pruefung zu nehmen. */
const NAME_MEHRDEUTIG = new Set([]);

/* ═══════════════════════════════════════════════════════════════════════════
 * 3. DER SCANNER
 * ═══════════════════════════════════════════════════════════════════════════ */


export function welt(alias, spalte, karte) {
  const s = spalte.toLowerCase();
  if (NAME_MEHRDEUTIG.has(s)) return null;
  if (NUTZER.has(s)) return "nutzer";
  if (ORG.has(s)) return "org";
  if (s === "id") {
    const tab = karte.get(alias.toLowerCase());
    if (tab === "users") return "nutzer";
    if (tab === "organizations") return "org";
  }
  return null;
}

const VERGLEICH = /\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\s*=\s*([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)/gi;

export function pruefeQuelle(rel, src, zaehler) {
  const befunde = [];
  for (const lit of jsLiterale(src)) {
    const sql = normalisiere(lit.text);
    if (!/\b(SELECT|INSERT|UPDATE|DELETE|JOIN)\b/i.test(sql)) continue;
    zaehler.sqlLiterale++;
    const karte = aliasKarte(sql);
    VERGLEICH.lastIndex = 0;
    let m;
    while ((m = VERGLEICH.exec(sql))) {
      zaehler.vergleiche++;
      const links = welt(m[1], m[2], karte);
      const rechts = welt(m[3], m[4], karte);
      if (!links || !rechts || links === rechts) continue;
      befunde.push({
        rel,
        zeile: lit.zeile,
        vergleich: `${m[1]}.${m[2]} = ${m[3]}.${m[4]}`,
        links,
        rechts,
        schluessel: `${rel}::${m[1]}.${m[2]} = ${m[3]}.${m[4]}`
      });
    }
  }
  return befunde;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 4. LAUF
 * ═══════════════════════════════════════════════════════════════════════════ */

const zaehler = { dateien: 0, sqlLiterale: 0, vergleiche: 0 };
const alleBefunde = [];
if (schemaVorhanden) {
  for (const datei of quellDateien()) {
    zaehler.dateien++;
    const rel = path.relative(API_DIR, datei).replace(/\\/g, "/");
    alleBefunde.push(...pruefeQuelle(rel, fs.readFileSync(datei, "utf8"), zaehler));
  }
}
const offen = alleBefunde.filter((b) => !AUSNAHMEN.has(b.schluessel));

function zeige(b) {
  return `  ${b.rel}:${b.zeile}\n      ${b.vergleich}\n      links ist eine ${b.links.toUpperCase()}-Kennung, rechts eine ${b.rechts.toUpperCase()}-Kennung`;
}

describe("Identitaeten nicht vermischen — Nutzer-Kennung gegen Org-Kennung", () => {
  it("die Momentaufnahme traegt die Fremdschluessel — sonst waere alles hier leer gruen", () => {
    /*
     * DIE NOTBREMSE, und sie ist kein Formalismus.
     *
     * Ohne den Abschnitt `fremdschluessel` sind NUTZER und ORG leer, `welt()`
     * gibt fuer alles null zurueck, und diese ganze Datei meldet begeistert
     * "0 Befunde" — waehrend sie in Wahrheit nichts geprueft hat. Genau so
     * verschwinden Waechter: nicht durch Loeschen, sondern indem ihnen die
     * Grundlage unter den Fuessen wegrutscht und niemand es merkt.
     *
     * Die Zahlen sind die gemessenen vom 2026-09-28, mit Luft nach unten:
     * 86 Nutzer- und 18 Org-Spaltennamen. Wer eine Migration schreibt, die
     * Fremdschluessel entfernt, soll hier rot werden und es begruenden.
     */
    assert.ok(schemaVorhanden, `Momentaufnahme fehlt: ${SCHEMA_DATEI}`);
    assert.ok(Object.keys(FK).length >= 150,
      `nur ${Object.keys(FK).length} Tabellen mit Fremdschluesseln — npm run schema:snapshot laufen lassen`);
    assert.ok(NUTZER.size >= 80, `nur ${NUTZER.size} Nutzer-Spaltennamen (erwartet >= 80)`);
    assert.ok(ORG.size >= 15, `nur ${ORG.size} Org-Spaltennamen (erwartet >= 15)`);
    /* Die Voraussetzung der ganzen Methode: kein Name zeigt je nach Tabelle auf
       beides. Faellt sie, ist die Einstufung per Name falsch und der Name gehoert
       in NAME_MEHRDEUTIG — mit Begruendung. */
    const beides = [...NUTZER].filter((n) => ORG.has(n));
    assert.deepEqual(beides, [],
      `diese Spaltennamen zeigen je nach Tabelle auf users UND organizations: ${beides.join(", ")}`);
  });

  it("der Korpus wird wirklich gelesen", () => {
    /* Zweite Notbremse: ein Waechter, der keine Datei findet, ist auch leer
       gruen. Das ist hier real passiert — Pfade relativ zu process.cwd() statt
       zur Datei, und je nach Startverzeichnis las er nichts. */
    assert.ok(zaehler.dateien >= 100, `nur ${zaehler.dateien} Quelldateien gelesen`);
    assert.ok(zaehler.sqlLiterale >= 300, `nur ${zaehler.sqlLiterale} SQL-Literale gefunden`);
    assert.ok(zaehler.vergleiche >= 200, `nur ${zaehler.vergleiche} Spaltenvergleiche geprueft`);
  });

  it("kein Produktionscode vergleicht eine Nutzer-Kennung mit einer Org-Kennung", () => {
    assert.deepEqual(
      offen.map((b) => b.schluessel),
      [],
      `\n\n${offen.length} Stelle(n) vermischen zwei Identitaeten:\n\n${offen.map(zeige).join("\n\n")}\n\n` +
      `Ein solcher Join trifft NIE. Ist er LINKS, gibt es keinen Fehler — nur NULL,\n` +
      `die aussieht wie "dazu gibt es nichts". Der Weg ueber den Eigentuemer steht\n` +
      `in services/reputationSql.js (eigentuemerJoinSql / anbieterOrganisationSql).\n` +
      `Ist die Vermischung hier ausnahmsweise richtig, gehoert sie mit Begruendung\n` +
      `in AUSNAHMEN — nicht wegkommentiert.\n`
    );
  });

  it("jede Ausnahme ist noch ein echter Fund", () => {
    /* Eine Ausnahme, die niemand mehr ausloest, ist stille Faeulnis: sie
       suggeriert eine gepruefte Entscheidung, wo laengst nichts mehr steht. */
    const gesehen = new Set(alleBefunde.map((b) => b.schluessel));
    const verwaist = [...AUSNAHMEN.keys()].filter((k) => !gesehen.has(k));
    assert.deepEqual(verwaist, [],
      `diese Ausnahmen loest niemand mehr aus — streichen: ${verwaist.join(", ")}`);
  });

  it("erkennt die Funde dieser Welle in einer Nachbildung wieder", () => {
    /*
     * DIE SELBSTPROBE. Ohne sie ist "0 Befunde" wertlos — ein Waechter, der
     * nichts findet, weil er nichts finden KANN, sieht genauso aus wie einer,
     * der nichts findet, weil alles in Ordnung ist.
     *
     * Jeder Fall unten ist woertlich einer, der am 2026-09-28 im Bestand stand
     * und behoben wurde.
     */
    const faelle = [
      ["sr.supplier_id = vp.supplier_org_id",
       "FROM vendor_pool vp LEFT JOIN supplier_reputation sr ON sr.supplier_id = vp.supplier_org_id"],
      ["sm.agency_id = o.id",
       "FROM organizations o LEFT JOIN supplier_metrics sm ON sm.agency_id = o.id"],
      ["sm.agency_id = om.org_id",
       "FROM users u LEFT JOIN org_memberships om ON om.user_id = u.id LEFT JOIN supplier_metrics sm ON sm.agency_id = om.org_id"],
      ["o.id = cp.supplier_company_id",
       "SELECT cp.id FROM capacity_posts cp LEFT JOIN organizations o ON o.id = cp.supplier_company_id"],
      ["cp.supplier_company_id = vp.supplier_org_id",
       "SELECT 1 FROM vendor_pool vp LEFT JOIN capacity_posts cp ON cp.supplier_company_id = vp.supplier_org_id"],
      ["cd.org_id = cp.supplier_company_id",
       "SELECT 1 FROM compliance_documents cd JOIN capacity_posts cp ON cd.org_id = cp.supplier_company_id"]
    ];
    for (const [name, sql] of faelle) {
      const z = { dateien: 0, sqlLiterale: 0, vergleiche: 0 };
      const b = pruefeQuelle("nachbildung.js", "const q = `" + sql + "`;", z);
      assert.equal(b.length, 1, `nicht erkannt: ${name}`);
    }

    /* Und die Gegenprobe, die genauso wichtig ist: RICHTIGE Joins duerfen nicht
       melden. Ein Waechter, der alles anschlaegt, wird abgeschaltet. Der zweite
       Fall stand am 2026-09-28 wirklich so im Bestand (marketplaceService) und
       ist korrekt — beide Seiten sind Nutzer, obwohl eine "company" heisst. */
    const richtig = [
      "FROM organizations o LEFT JOIN org_memberships om ON om.org_id = o.id",
      "FROM capacity_posts cp LEFT JOIN supplier_reputation sr ON sr.supplier_id = cp.supplier_company_id",
      "FROM capacity_posts cp JOIN users u ON u.id = cp.supplier_company_id",
      "FROM vendor_pool vp JOIN organizations so ON so.id = vp.supplier_org_id",
      "FROM vendor_pool vp LEFT JOIN org_locations ol ON ol.id = vp.location_id"
    ];
    for (const sql of richtig) {
      const z = { dateien: 0, sqlLiterale: 0, vergleiche: 0 };
      const b = pruefeQuelle("nachbildung.js", "const q = `" + sql + "`;", z);
      assert.deepEqual(b.map((x) => x.vergleich), [], `Fehlalarm bei: ${sql}`);
    }
  });

  it("liest keine Kommentare — das Repo dokumentiert seine Gegenbeispiele", () => {
    /*
     * Diese Datei selbst ist der Beweis, warum das noetig ist: die Kommentare
     * oben zitieren mehrere falsche Joins woertlich. Wer Kommentare mitprueft,
     * meldet die Dokumentation als Fehler — und das ist schon einmal passiert
     * (Welle Z, `migrationenGegenBestand`, dieselbe Falle).
     */
    const z = { dateien: 0, sqlLiterale: 0, vergleiche: 0 };
    const quelle =
      "/* Falsch waere: sr.supplier_id = vp.supplier_org_id */\n" +
      "// auch falsch: sm.agency_id = o.id\n" +
      "const q = `SELECT 1 FROM organizations o`;";
    assert.deepEqual(pruefeQuelle("nachbildung.js", quelle, z), []);
  });
});
