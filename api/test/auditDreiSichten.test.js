/**
 * Die drei Audit-Sichten, hart getrennt (8.1.1 c).
 *
 * OWNER-VORGABE
 *   Audit Zeitarbeitsfirma  deren owner/admin sieht ausschliesslich die eigene Org
 *   Audit Unternehmen       dito
 *   Audit Plattform         Staff Control Center sieht alle Organisationen
 *
 * Die ersten beiden sind DIESELBE Grenze — der Unterschied ist der Mandant,
 * nicht die Rolle und nicht der Firmentyp. Eine Trennung nach `org_type` waere
 * hier falsch: sie wuerde dieselbe Regel zweimal formulieren, und Welle H2 hat
 * gezeigt, wohin das fuehrt (80 Kopien, und gefaehrlich waren die Stellen OHNE
 * Kopie).
 *
 * WAS DIESER WAECHTER FESTHAELT
 *   1. Kein `org_type`-Zweig in den Audit-Pfaden. Wer einen einbaut, wird rot —
 *      dann waere dieselbe Regel an zwei Stellen zu pflegen.
 *   2. Jede Kunden-Route zieht ihre Grenze FAIL-CLOSED. Die Form
 *      `if (req.orgId && ...)` schaltet sich bei `null` selbst ab und ist
 *      deshalb verboten (Audit-Backlog C-11).
 *   3. Die Plattformsicht liegt im Staff Center, nicht auf einer Kundenflaeche.
 *
 * ES SIND HEUTE ZWEI KUNDEN-ROUTEN, NICHT EINE
 *   `GET /org/audit-log`                (orgControlCenter.js) — benutzt von
 *                                        organization.html:587
 *   `GET /organizations/:id/audit-log`  (organizations.js)    — ohne Aufrufer
 * Die zweite ist die strukturell schwaechere (Org aus dem Pfad statt aus dem
 * gepruefen Kontext) und hat im ganzen Repo keinen Aufrufer. Ihr Entfernen ist
 * eine Owner-Entscheidung (die Ratsche in `orgGrenzen.json` faellt dabei von 256
 * auf 254, wie zuletzt bei P1-19). Solange sie steht, haelt dieser Waechter
 * BEIDE auf derselben Form — damit die zwei Kopien nicht auseinanderlaufen.
 *
 * WARUM JE ROUTE GESCHNITTEN WIRD, NICHT JE DATEI
 * Die erste Fassung las die ganze Datei und meldete prompt fuenf Nachbarrouten
 * in `organizations.js` mit — richtige Beobachtung, falscher Waechter. Ein
 * Waechter mit Fehlalarmen wird abgeschaltet. Er schneidet deshalb den
 * Abschnitt der jeweiligen Route heraus. (Die fuenf Nachbarn sind als eigener
 * Befund notiert, nicht hier miterschlagen.)
 *
 * Run: node --test --test-force-exit test/auditDreiSichten.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = path.resolve(__dirname, "..");

const lies = (rel) => fs.readFileSync(path.join(API, rel), "utf8");

/** Kommentarzeilen sind Belege, keine Befunde — sie zitieren oft das Verbotene. */
const istCode = ({ z }) => Boolean(z) && !z.startsWith("*") && !z.startsWith("//") && !z.startsWith("/*");

/**
 * Schneidet den Abschnitt EINER Route heraus — von ihrer Deklaration bis zur
 * naechsten Routen-Deklaration.
 */
function routenAbschnitt(quelle, route) {
  const zeilen = quelle.split("\n");
  const start = zeilen.findIndex((z) => z.includes(`"${route}"`));
  if (start === -1) return null;
  let ende = zeilen.length;
  for (let i = start + 1; i < zeilen.length; i++) {
    if (/^\s*router\.(get|post|patch|put|delete)\(/.test(zeilen[i])) { ende = i; break; }
  }
  return zeilen.slice(start, ende).map((z, i) => ({ z: z.trim(), nr: start + i + 1 }));
}

/** Die Pfade, die eine Kunden-Audit-Sicht bedienen. */
const KUNDEN_PFADE = [
  { datei: "routes/organizations.js", route: "/organizations/:id/audit-log" },
  { datei: "routes/orgControlCenter.js", route: "/org/audit-log" },
];

const TYP_ZWEIG = /\borg_type\b|\borgType\b|requireCompanyOrg|requireAgencyOrg/;
const SELBSTABSCHALTEND = /if\s*\(\s*req\.orgId\s*&&[^)]*req\.params\.id\s*!==\s*req\.orgId/;
const ROHES_ORG_ID = /org_id:\s*req\.query\.org_id\s*\|\|\s*null/;

describe("Audit — drei Sichten, hart getrennt", () => {
  it("die Kundensicht kennt keinen org_type-Zweig — der Mandant ist der Unterschied", () => {
    for (const { datei, route } of KUNDEN_PFADE) {
      const abschnitt = routenAbschnitt(lies(datei), route);
      assert.ok(abschnitt, `${datei}: Route ${route} nicht gefunden — hat sie sich verschoben?`);
      const treffer = abschnitt.filter(istCode).filter(({ z }) => TYP_ZWEIG.test(z));
      assert.deepEqual(
        treffer.map((t) => `${datei}:${t.nr}  ${t.z}`),
        [],
        `${datei} unterscheidet in der Audit-Route nach Firmentyp. Das darf sie nicht: ` +
        "Zeitarbeitsfirma und Unternehmen teilen dieselbe Grenze, nur der Mandant unterscheidet."
      );
    }
  });

  it("auch der Dienst darunter unterscheidet nur nach Mandant", () => {
    const quelle = lies("services/auditLog.js");
    assert.ok(!TYP_ZWEIG.test(quelle),
      "services/auditLog.js kennt einen Firmentyp — dann sitzt die Trennung an der falschen Stelle");
    assert.match(quelle, /al\.org_id = \$/,
      "der Mandantenfilter im SQL fehlt — dann filtert die Route gar nicht");
  });

  it("keine Kunden-Audit-Route zieht ihre Grenze mit dem selbstabschaltenden Muster", () => {
    /*
     * `if (req.orgId && ressource !== req.orgId)` sieht wie eine Pruefung aus und
     * IST bei `req.orgId === null` keine: sie faellt genau im Angriffsfall aus.
     */
    for (const { datei, route } of KUNDEN_PFADE) {
      const abschnitt = routenAbschnitt(lies(datei), route);
      assert.ok(abschnitt, `${datei}: Route ${route} nicht gefunden`);
      const treffer = abschnitt.filter(istCode).filter(({ z }) => SELBSTABSCHALTEND.test(z));
      assert.deepEqual(
        treffer.map((t) => `${datei}:${t.nr}  ${t.z}`),
        [],
        `${datei} prueft die Org-Grenze in der Form, die sich bei null selbst abschaltet. ` +
        "Richtig ist `if (!req.orgId || ...)` — fail-closed."
      );
    }
  });

  it("jede Kunden-Route filtert wirklich auf eine Organisation", () => {
    /* Ohne diese Probe koennte jemand die Grenze ganz entfernen und die Probe
     * darueber bliebe gruen — sie verbietet eine Form, sie verlangt keine. */
    const orgCC = lies("routes/orgControlCenter.js");
    assert.match(orgCC, /queryOrgAuditLog\(pool,\s*req\.orgId/,
      "/org/audit-log muss gegen req.orgId filtern — den gepruefen Kontext, nicht den Pfad");

    const orgs = lies("routes/organizations.js");
    assert.match(orgs, /if\s*\(!req\.orgId\s*\|\|\s*req\.params\.id\s*!==\s*req\.orgId\)/,
      "/organizations/:id/audit-log muss fail-closed gegen den Pfad-Parameter pruefen");
    assert.match(orgs, /queryOrgAuditLog\(pool,\s*req\.params\.id/,
      "und danach genau diese geprueffte Kennung benutzen");
  });

  it("die Plattformsicht liegt im Staff Center, nicht auf einer Kundenflaeche", () => {
    const scc = lies("routes/staffControlCenter.js");
    assert.match(scc, /router\.get\("\/platform-audit", requireStaff/,
      "die Plattformsicht fehlt im Staff Center oder steht nicht hinter dem Flaechen-Tor");
    assert.match(scc, /queryAuditLog\(pool,\s*\{/,
      "sie muss denselben Dienst benutzen wie die Kundensicht — sonst zwei Abfragen, zwei Grenzen");
  });

  it("die Audit-Abfragen auf der Kundenflaeche admin.js sind begrenzt", () => {
    /* `routes/admin.js` bleibt fuer Kunden-Admins erreichbar (hubVisibility.js:
     * company und agency). Dort darf keine unbegrenzte Audit-Abfrage stehen. */
    const admin = lies("routes/admin.js");
    assert.match(admin, /function bestimmeAdminUmfang/,
      "der Umfangs-Helfer fehlt — dann raet admin.js wieder");
    const roh = admin
      .split("\n")
      .map((z, i) => ({ z: z.trim(), nr: i + 1 }))
      .filter(istCode)
      .filter(({ z }) => ROHES_ORG_ID.test(z));
    assert.deepEqual(
      roh.map((t) => `routes/admin.js:${t.nr}  ${t.z}`),
      [],
      "Eine Audit-Abfrage nimmt org_id wieder roh aus der Anfrage. Ohne Angabe heisst " +
      "das plattformweit — fuer 201 Kundenkonten (Befund 8.1.1 d)."
    );
  });

  it("S: die drei Muster greifen — und Kommentare zaehlen nicht als Befund", () => {
    /* Rueckmutation an kuenstlichen Zeilen im echten Format, ohne den Baum
     * anzufassen. Ohne diese Probe koennte ein Muster leer laufen und der
     * Waechter waere still gruen. */
    assert.ok(TYP_ZWEIG.test("if (membership.org_type === 'agency') { return anderes(); }"),
      "der Firmentyp-Test wuerde einen Zweig durchlassen");
    assert.ok(SELBSTABSCHALTEND.test("if (req.orgId && req.params.id !== req.orgId) {"),
      "der Fail-closed-Test wuerde das selbstabschaltende Muster durchlassen");
    assert.ok(ROHES_ORG_ID.test("org_id:      req.query.org_id      || null,"),
      "der Umfangs-Test wuerde eine unbegrenzte Abfrage durchlassen");

    /* Und die Gegenrichtung: die korrigierte Form darf NICHT mehr treffen. */
    assert.ok(!SELBSTABSCHALTEND.test("if (!req.orgId || req.params.id !== req.orgId) {"),
      "der Fail-closed-Test meldet die richtige Form als Fehler — dann ist er ein Fehlalarm");

    /* Kommentarzeilen sind Belege, keine Befunde. */
    assert.ok(!istCode({ z: "* `org_id: req.query.org_id || null` — ohne Angabe plattformweit" }),
      "eine Kommentarzeile wuerde als Befund gezaehlt");
    assert.ok(istCode({ z: "org_id: req.query.org_id || null," }),
      "eine echte Codezeile wuerde uebersehen");
  });
});
