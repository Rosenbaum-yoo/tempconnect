/**
 * Die Pflegemaske fuer Rechnungsstammdaten (Welle J7).
 *
 * Vorgeschichte: Migration 187 schuf die Spalten, die E-Rechnung braucht sie,
 * und die Bereitschaftspruefung meldete brav, welche fehlen — mit dem Hinweis
 * "Nachzutragen in den Firmenstammdaten Ihrer Organisation". Diesen Ort gab es
 * nicht. `slaProfil.js` pflegt Strasse, PLZ und Ort auf `users`, also am
 * Nutzer, waehrend die Norm sie auf der Rechtsperson verlangt. Gemessen am
 * 2026-08-28: keine einzige von 2240 Organisationen hatte eine Anschrift.
 *
 * Diese Datei haelt drei Dinge fest, die zusammen aus der Meldung einen Weg
 * machen: der Schluessel, der Meldung und Eingabefeld verbindet; die Werte,
 * ohne die ein Formular nur leer sein koennte; und die Trennung von Sehen
 * (org.billing) und Aendern (org.settings).
 *
 * Run: node --test --test-force-exit test/rechnungsstammdatenMaske.test.js
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pruefeFirmenstammdaten } from "../services/eRechnungService.js";
import { pruefeERechnungBereitschaft } from "../services/operationalInvoiceService.js";

const HIER = path.dirname(fileURLToPath(import.meta.url));

function findeWurzel() {
  for (const start of [HIER, process.cwd()]) {
    let dir = path.resolve(start);
    for (let i = 0; i < 8; i++) {
      if (fs.existsSync(path.join(dir, "frontend/public/integrations.html"))) return dir;
      const eltern = path.dirname(dir);
      if (eltern === dir) break;
      dir = eltern;
    }
  }
  return null;
}

const ROOT = findeWurzel();

describe("Teil A — der Schluessel verbindet Meldung und Eingabefeld", () => {
  it("jede fehlende Angabe traegt einen maschinenlesbaren Schluessel", () => {
    /* Ohne ihn koennte die Oberflaeche nur den deutschen Klartext auswerten —
       und der bricht, sobald jemand eine Formulierung glaettet. */
    const fehlend = pruefeFirmenstammdaten({}, "verkaeufer");
    assert.ok(fehlend.length >= 5);
    for (const f of fehlend) {
      assert.ok(f.schluessel, `"${f.feld}" hat keinen Schluessel`);
      assert.match(f.schluessel, /^[a-z]+$/, "der Schluessel muss stabil und schlicht sein");
    }
  });

  it("die Schluessel decken alle Pflichtangaben ab", () => {
    const s = pruefeFirmenstammdaten({}, "verkaeufer").map((f) => f.schluessel);
    for (const erwartet of ["name", "strasse", "ort", "plz", "land", "steuerkennung"]) {
      assert.ok(s.includes(erwartet), `Schluessel "${erwartet}" fehlt`);
    }
  });

  it("USt-IdNr. und Steuernummer teilen sich EINEN Schluessel", () => {
    /* Die Norm verlangt eines von beiden. Zwei getrennte Schluessel wuerden die
       Oberflaeche zwingen, sich fuer eines zu entscheiden — und ein
       Kleinunternehmer ohne USt-IdNr. saehe dann dauerhaft ein rotes Feld, das
       er nie ausfuellen wird. */
    const nurUst = pruefeFirmenstammdaten({ name: "A", strasse: "B", ort: "C", plz: "1", land: "DE", ustId: "DE1" });
    assert.equal(nurUst.length, 0, "die USt-IdNr. allein genuegt");
    const nurSteuer = pruefeFirmenstammdaten({ name: "A", strasse: "B", ort: "C", plz: "1", land: "DE", steuernummer: "12/345" });
    assert.equal(nurSteuer.length, 0, "die Steuernummer allein genuegt ebenfalls");
  });

  it("vollstaendige Stammdaten melden nichts", () => {
    const fehlend = pruefeFirmenstammdaten(
      { name: "Firma", strasse: "Weg 1", ort: "Berlin", plz: "10115", land: "DE", ustId: "DE123456789" },
      "verkaeufer",
    );
    assert.deepEqual(fehlend, []);
  });
});

describe("Teil B — die Bereitschaft liefert, was ein Formular braucht", () => {
  /** Mock-Pool: eine Organisation mit den uebergebenen Feldern. */
  function pool(org) {
    return { query: async () => ({ rows: org ? [org] : [] }) };
  }

  it("gibt die aktuellen Werte zurueck, nicht nur die Luecken", () => {
    /* Ein Formular ohne Werte ist ein leeres Formular ueber vorhandenen Daten —
       also die Einladung, sie beim Speichern zu ueberschreiben. */
    return pruefeERechnungBereitschaft(
      pool({ id: "o1", name: "Firma", billing_street: "Weg 1", billing_city: "Berlin", vat_id: "DE1" }),
      "o1",
    ).then((r) => {
      assert.ok(r.werte, "werte fehlt");
      assert.equal(r.werte.billing_street, "Weg 1");
      assert.equal(r.werte.billing_city, "Berlin");
      assert.equal(r.werte.vat_id, "DE1");
    });
  });

  it("leere Felder kommen als null, nicht als Leerstring", () => {
    /* Der Unterschied entscheidet im Formular: null zeigt ein leeres Feld,
       "" saehe fuer die Pruefung spaeter aus wie ein gesetzter Wert. */
    return pruefeERechnungBereitschaft(pool({ id: "o1", name: "Firma" }), "o1").then((r) => {
      assert.equal(r.werte.billing_street, null);
      assert.equal(r.werte.iban, null);
    });
  });

  it("liefert genau die Felder, die auch pflegbar sind", () => {
    return pruefeERechnungBereitschaft(pool({ id: "o1", name: "Firma" }), "o1").then((r) => {
      const erwartet = [
        "legal_name", "billing_street", "billing_address_2", "billing_postal_code",
        "billing_city", "billing_country_code", "vat_id", "tax_id", "iban", "bic",
      ].sort();
      assert.deepEqual(Object.keys(r.werte).sort(), erwartet,
        "werte und die Whitelist in updateOrganization muessen dasselbe abdecken");
    });
  });

  it("ohne Organisation gibt es keine Werte, sondern null", () => {
    return pruefeERechnungBereitschaft(pool(null), "o1").then((r) => {
      assert.equal(r, null);
    });
  });
});

describe("Teil C — Sehen und Aendern sind zwei Rechte", () => {
  let quelle;
  before(() => {
    quelle = fs.readFileSync(path.join(ROOT, "api/routes/invoices.js"), "utf8");
  });

  it("die Route entscheidet ueber darf_pflegen, nicht der Browser", () => {
    const abschnitt = quelle.slice(quelle.indexOf("e-rechnung/bereitschaft"));
    assert.match(abschnitt.slice(0, 1500), /darf_pflegen/,
      "ohne dieses Feld muesste das Frontend die Berechtigung selbst erraten");
    assert.match(abschnitt.slice(0, 1500), /hasPermission\(req\.orgRole, "org\.settings"\)/,
      "org.billing genuegt zum Sehen, aber nicht zum Aendern");
  });

  it("die Bereitschaft haengt weiterhin an org.billing", () => {
    assert.match(quelle, /router\.get\("\/invoices\/e-rechnung\/bereitschaft", requireAuth, rperm\("org\.billing"\)/,
      "das Leserecht darf sich durch die Pflegemaske nicht gelockert haben");
  });
});

describe("Teil D — die Oberflaeche", () => {
  let html;
  before(() => {
    html = fs.readFileSync(path.join(ROOT, "frontend/public/integrations.html"), "utf8");
  });

  it("die Maske steht in der Karte, die die Luecke meldet", () => {
    assert.match(html, /id="eRechnungPflege"/,
      "ohne Behaelter kann das Formular nirgends erscheinen");
    const iStatus = html.indexOf('id="eRechnungStatus"');
    const iPflege = html.indexOf('id="eRechnungPflege"');
    assert.ok(iStatus > 0 && iPflege > iStatus,
      "das Formular gehoert unter die Meldung, nicht an eine andere Stelle der Seite");
  });

  it("das Formular erscheint nur, wenn das Backend es erlaubt", () => {
    /* Ein Knopf, der beim Speichern 403 liefert, ist ein toter Knopf — und die
       Projektregeln verbieten genau das. */
    assert.match(html, /if \(d\.darf_pflegen\)/,
      "der Knopf muss an darf_pflegen haengen");
    assert.match(html, /!stammStand\.darf_pflegen.*innerHTML = ''/s,
      "auch das Formular selbst muss ohne die Berechtigung leer bleiben");
  });

  it("gespeichert wird mit CSRF-Kopf", () => {
    const i = html.indexOf("async function stammSpeichern");
    assert.ok(i > 0, "die Speicherfunktion fehlt");
    const abschnitt = html.slice(i, i + 2500);
    assert.match(abschnitt, /X-CSRF-Token/, "ohne Kopf endet jede Mutation in 403");
    assert.match(abschnitt, /credentials: 'include'/);
    assert.match(abschnitt, /method: 'PATCH'/);
  });

  it("nur geaenderte Felder werden gesendet", () => {
    /* Sonst meldet das Audit bei jeder Korrektur einer Postleitzahl zehn
       geaenderte Felder, und `changed_fields` ist als Spur wertlos. */
    const i = html.indexOf("async function stammSpeichern");
    const abschnitt = html.slice(i, i + 2500);
    assert.match(abschnitt, /if \(neu !== alt\)/,
      "ein Vollschreiben aller Felder macht den Audit-Eintrag unbrauchbar");
  });

  it("ein geleertes Feld wird null, nicht Leerstring", () => {
    const i = html.indexOf("async function stammSpeichern");
    const abschnitt = html.slice(i, i + 2500);
    assert.match(abschnitt, /neu === '' \? null : neu/,
      "ein Leerstring saehe fuer die Pruefung wie ein gesetzter Wert aus");
  });

  it("nach dem Speichern wird die Pruefung neu gefahren", () => {
    const i = html.indexOf("async function stammSpeichern");
    const abschnitt = html.slice(i, i + 3000);
    assert.match(abschnitt, /await ladeERechnungBereitschaft\(\)/,
      "der Nutzer muss sofort sehen, ob die Luecke wirklich zu ist");
  });

  it("jede Eingabe traegt eine Beschriftung mit for-Bezug", () => {
    assert.match(html, /<label for="stamm-/,
      "ohne for-Bezug ist das Formular fuer Screenreader nicht bedienbar");
  });

  it("alle Werte laufen durch esc()", () => {
    const i = html.indexOf("function renderStammFormular");
    const abschnitt = html.slice(i, html.indexOf("async function stammSpeichern"));
    const roheEinsetzungen = abschnitt.match(/\+ (?!esc\()(werte|v|f\.key)\b/g) || [];
    assert.deepEqual(roheEinsetzungen, [],
      "unmaskierte Werte in innerHTML sind auf dieser Seite nicht erlaubt");
  });

  it("jeder Text steht in DE und EN", () => {
    const iEn = html.indexOf("TCi18n.register('en'");
    const de = html.slice(0, iEn), en = html.slice(iEn);
    const keys = [...new Set([...de.matchAll(/'(sp\.b\.stamm\.[a-zA-Z0-9]+)'\s*:/g)].map((m) => m[1]))];
    assert.ok(keys.length >= 20, `zu wenige Schluessel: ${keys.length}`);
    assert.deepEqual(keys.filter((k) => !en.includes(`'${k}'`)), [],
      "diese Schluessel fehlen auf Englisch");
  });

  it("jede Feldbezeichnung der Liste hat einen Text", () => {
    const labels = [...html.matchAll(/label:\s*'(sp\.b\.stamm\.[a-zA-Z0-9]+)'/g)].map((m) => m[1]);
    assert.ok(labels.length >= 10, "die Feldliste ist unerwartet kurz");
    const iEn = html.indexOf("TCi18n.register('en'");
    for (const l of labels) {
      assert.ok(html.slice(0, iEn).includes(`'${l}':`), `${l} hat keinen deutschen Text`);
      assert.ok(html.slice(iEn).includes(`'${l}':`), `${l} hat keinen englischen Text`);
    }
  });
});
