/**
 * Die Rechnungsstammdaten sind pflegbar (Welle J7).
 *
 * DER BEFUND (gemessen 2026-08-28): Migration 187 hat Anschrift, USt-IdNr. und
 * Bankverbindung auf `organizations` gelegt, weil die E-Rechnung sie fuer die
 * RECHTSPERSON verlangt. Es fuehrte nur kein Weg hinein — die Update-Whitelist
 * in `organizationService.updateOrganization` kannte die Felder nicht, und das
 * Zod-Schema der Route hat sie verworfen. Ergebnis: **0 von 2240**
 * Organisationen hatten eine Anschrift, und `pruefeFirmenstammdaten` meldete
 * dauerhaft Fehlanzeige. Ohne diese Daten ist keine Rechnung gueltig
 * (§ 14 UStG) — die ganze Abrechnungskette endete im Entwurf.
 *
 * Verwechslungsgefahr, die den Befund erklaert: `slaProfil.js` pflegt Strasse,
 * Ort und USt-IdNr. — aber auf `users`. Das ist genau NICHT der
 * Rechnungssteller. Deshalb sah die Plattform gepflegt aus und war es nicht.
 *
 * WAS HIER GESCHUETZT WIRD
 *   1. Die Whitelist kennt jedes Feld der Norm — sonst faellt eines lautlos weg.
 *   2. Das Zod-Schema laesst sie durch (inkl. Grossschreibung des Laendercodes).
 *   3. Der ganze Weg traegt: eine Org ohne Stammdaten ist NICHT bereit, nach
 *      dem Pflegen IST sie es. Das ist die Zusage, auf die es ankommt.
 *   4. Fremde Felder kommen weiterhin nicht durch (die Whitelist bleibt eine).
 *
 * Run: DATABASE_URL=… node --test --test-force-exit test/rechnungsstammdatenPflege.test.js
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { updateOrganization } from "../services/organizationService.js";
import { pruefeERechnungBereitschaft } from "../services/operationalInvoiceService.js";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const hasDb = !!process.env.DATABASE_URL;

/** Die Felder, ohne die keine Rechnung gueltig ist (§ 14 UStG / EN 16931). */
const PFLICHTFELDER = [
  "billing_street", "billing_postal_code", "billing_city",
  "billing_country_code", "vat_id"
];
/** Zusaetzlich gepflegt, fuer die Zahlung. */
const WEITERE = ["billing_address_2", "iban", "bic"];

describe("Rechnungsstammdaten · die Wege hinein", () => {
  const dienst = fs.readFileSync(path.join(HIER, "../services/organizationService.js"), "utf8");
  const route = fs.readFileSync(path.join(HIER, "../routes/organizations.js"), "utf8");

  it("die Update-Whitelist kennt jedes Feld", () => {
    /* Der Ausschnitt zwischen `const allowed = [` und `]` — ein Feld, das nur
     * im Kommentar steht, zaehlt nicht. */
    const m = /const allowed = \[([\s\S]*?)\];/.exec(dienst);
    assert.ok(m, "die Whitelist wurde nicht gefunden");
    const liste = m[1];
    for (const feld of [...PFLICHTFELDER, ...WEITERE]) {
      assert.ok(new RegExp(`'${feld}'`).test(liste),
        `"${feld}" fehlt in der Update-Whitelist — es liesse sich nicht pflegen, ` +
        "und die Rechnung waere ohne es ungueltig");
    }
  });

  it("das Zod-Schema laesst die Felder durch", () => {
    const m = /const createOrgSchema = z\.object\(\{([\s\S]*?)\n\}\);/.exec(route);
    assert.ok(m, "das Schema wurde nicht gefunden");
    for (const feld of [...PFLICHTFELDER, ...WEITERE]) {
      assert.ok(new RegExp(`${feld}\\s*:`).test(m[1]),
        `"${feld}" fehlt im Zod-Schema — die Route verwuerfe es vor dem Dienst`);
    }
  });

  it("der Laendercode wird grossgeschrieben angenommen", () => {
    /* Die Norm verlangt ISO 3166-1 alpha-2 in Grossbuchstaben (BT-40/BT-55).
     * Wer "de" eintippt, soll nicht an einer Formalie scheitern. */
    assert.match(route, /billing_country_code[\s\S]{0,160}toUpperCase\(\)/,
      "der Laendercode wird nicht normalisiert");
  });
});

describe("Rechnungsstammdaten · der Weg traegt", { skip: !hasDb }, () => {
  let pool;
  const angelegt = [];

  before(() => { pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 }); });
  after(async () => {
    for (const id of angelegt) {
      await pool.query("DELETE FROM organizations WHERE id = $1", [id]).catch(() => {});
    }
    await pool.end();
  });

  async function neueOrg() {
    const s = Math.random().toString(36).slice(2, 10);
    const { rows } = await pool.query(
      "INSERT INTO organizations (name, slug, type) VALUES ($1, $2, 'agency') RETURNING id",
      ["Stammdaten-Probe", `stammdaten-probe-${s}`]
    );
    angelegt.push(rows[0].id);
    return rows[0].id;
  }

  it("ohne Stammdaten ist eine Firma NICHT versandfaehig — mit ist sie es", async () => {
    const id = await neueOrg();

    const vorher = await pruefeERechnungBereitschaft(pool, id);
    assert.equal(vorher.bereit, false, "eine leere Org galt als versandfaehig");
    assert.ok(vorher.fehlend.length >= 4,
      `zu wenige Meldungen: ${JSON.stringify(vorher.fehlend)}`);
    /* Die Meldung nennt das Feld im Klartext, nicht die Regelnummer der Norm —
     * damit im Buero jemand etwas damit anfangen kann. */
    assert.ok(vorher.fehlend.every((f) => f.feld && f.hinweis),
      "eine Meldung ohne Klartext-Feld oder Hinweis");

    const gepflegt = await updateOrganization(pool, id, {
      billing_street: "Musterweg 1",
      billing_postal_code: "20095",
      billing_city: "Hamburg",
      billing_country_code: "DE",
      vat_id: "DE123456789",
      iban: "DE02120300000000202051"
    });
    assert.ok(gepflegt, "das Pflegen hat nichts zurueckgegeben");
    assert.equal(gepflegt.billing_city, "Hamburg");
    assert.equal(gepflegt.vat_id, "DE123456789");

    const nachher = await pruefeERechnungBereitschaft(pool, id);
    assert.equal(nachher.bereit, true,
      `trotz gepflegter Daten nicht bereit: ${JSON.stringify(nachher.fehlend)}`);
    assert.deepEqual(nachher.fehlend, []);
  });

  it("eine Steuernummer genuegt statt der USt-IdNr.", async () => {
    /* Die Norm verlangt EINE steuerliche Kennung, nicht beide. */
    const id = await neueOrg();
    await updateOrganization(pool, id, {
      billing_street: "Musterweg 2", billing_postal_code: "10115",
      billing_city: "Berlin", billing_country_code: "DE", tax_id: "12/345/67890"
    });
    const r = await pruefeERechnungBereitschaft(pool, id);
    assert.equal(r.bereit, true, `Steuernummer allein genuegte nicht: ${JSON.stringify(r.fehlend)}`);
  });

  it("die Whitelist bleibt eine Whitelist — Fremdfelder kommen nicht durch", async () => {
    const id = await neueOrg();
    /* `type` und `slug` sind Identitaet, nicht Stammdaten. Kaeme das durch,
     * koennte eine Agentur sich per Rechnungspflege in ein Unternehmen
     * verwandeln. */
    await updateOrganization(pool, id, { billing_city: "Koeln", type: "company", slug: "gekapert" });
    const { rows } = await pool.query("SELECT type, slug, billing_city FROM organizations WHERE id = $1", [id]);
    assert.equal(rows[0].billing_city, "Koeln", "das erlaubte Feld wurde nicht geschrieben");
    assert.equal(rows[0].type, "agency", "der Org-Typ liess sich ueber die Stammdatenpflege aendern");
    assert.notEqual(rows[0].slug, "gekapert", "die Kennung liess sich ueberschreiben");
  });
});
