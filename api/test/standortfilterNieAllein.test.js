/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EIN STANDORTFILTER STEHT NIE ALLEIN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * DER ANLASS, gemessen am 2026-10-02 beim Blick auf „was passiert bei fuenfzig
 * Standorten". Gefunden wurde dabei nicht ein Mengenproblem, sondern ein
 * DURCHLAESSIGER RIEGEL:
 *
 *   api/routes/reporting.js:31   (und spendAnalytics.js:43, wortgleich)
 *   async function validateLocationScope(req, res, locationId) {
 *     if (!locationId || !req.orgId) return true;          <-- HIER
 *     await assertLocationBelongsToOrg(pool, locationId, req.orgId);
 *
 * Fehlt die Organisation, gibt der Pruefer `true` zurueck — er LAESST DURCH,
 * statt zu sperren. Und der Dienst darunter baut seine Bedingungen einzeln:
 *
 *   api/services/reportingService.js:1029
 *   if (orgId)      { conditions.push(`r.org_id = $N`); }      <-- bedingt
 *   if (locationId) { conditions.push(`r.location_id = $N`); }  <-- unbedingt
 *
 * Zusammen ergibt das eine Abfrage, die NUR nach Standort filtert: ein
 * plattformweiter Lesezugriff auf eine fremde Organisation, und bei 300 Kunden
 * zugleich ein Durchlauf ueber alle Requisitions (auf `requisitions.location_id`
 * liegt kein Index; alle sieben brauchbaren Indizes fuehren mit `org_id`).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WARUM DAS HEUTE TROTZDEM ZU IST — UND WARUM GENAU DAS DAS PROBLEM IST
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Nachgerechnet: `requirePermission` (api/middleware/rbac.js) kann den Handler
 * nur auf zwei Wegen erreichen — mit bekannter Org, oder ueber die primaere
 * Mitgliedschaft. In BEIDEN Faellen setzt es danach `req.orgId`; ohne jede
 * Mitgliedschaft antwortet es `403 NO_ORG_MEMBERSHIP`. Gemessen: alle **16**
 * Routen in den beiden Dateien tragen `rperm(...)`. Der durchlaessige Zweig ist
 * damit unerreichbar.
 *
 * Die Schutzwirkung liegt also NICHT bei dem Pruefer, der so aussieht, als
 * leiste er sie, sondern zwei Schichten hoeher. Das ist dieselbe Gestalt wie
 * „ein falscher Riegel haelt laenger": wer `validateLocationScope` liest, haelt
 * die Grenze fuer geprueft. Wer eine dieser Routen ohne `rperm` montiert — oder
 * hinter einen Waechter, der `req.orgId` nicht setzt —, oeffnet sie lautlos.
 *
 * Deshalb werden hier ALLE DREI SCHICHTEN festgenagelt. Einzeln ist jede
 * wertlos: die Routenpruefung allein uebersieht, wenn `rperm` aufhoert,
 * `req.orgId` zu setzen; die Middleware-Pruefung allein uebersieht eine Route
 * ohne `rperm`. Beides zusammen ist die Zusage. (Lehre „Luecke zwischen zwei
 * Waechtern": an der Naht melden beide gruen.)
 *
 * WAS HIER NICHT GEMACHT WIRD: der Pruefer wird NICHT auf fail-closed
 * umgestellt. Das waere ein Sicherheitsriegel mit Verhaltensaenderung — ein
 * Aufruf mit Standort und ohne Org wuerde dann 403 statt einer Antwort
 * bekommen. Das gehoert dem Owner; der Befund steht mit dieser Begruendung in
 * `docs/UEBERGABE.md`.
 *
 * Run: node --test --test-force-exit test/standortfilterNieAllein.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import * as reporting from "../services/reportingService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findeWurzel(relPfad) {
  for (const start of [process.cwd(), __dirname]) {
    let dir = path.resolve(start);
    for (let i = 0; i < 8; i++) {
      if (fs.existsSync(path.join(dir, relPfad))) return dir;
      const eltern = path.dirname(dir);
      if (eltern === dir) break;
      dir = eltern;
    }
  }
  return null;
}

const ROOT = findeWurzel(path.join("api", "middleware", "rbac.js"));
const suite = ROOT ? describe : describe.skip;
const lies = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

/** Die Dateien, die den durchlaessigen Pruefer benutzen — gesucht, nicht geraten. */
function dateienMitPruefer() {
  const dir = path.join(ROOT, "api", "routes");
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".js"))
    .map((f) => ({ rel: "api/routes/" + f, text: fs.readFileSync(path.join(dir, f), "utf8") }))
    .filter((d) => d.text.includes("validateLocationScope"));
}

suite("Ein Standortfilter steht nie allein — drei Schichten, einzeln wertlos", () => {

  it("die Suche findet den Pruefer wirklich", () => {
    /* Ohne diese Zusicherung ist alles darunter still gruen, sobald der Pruefer
     * umbenannt wird oder umzieht. */
    const dateien = dateienMitPruefer();
    assert.ok(dateien.length >= 2,
      `nur ${dateien.length} Datei(en) mit validateLocationScope gefunden, erwartet mindestens 2 `
      + "(reporting, spendAnalytics) — wurde der Pruefer umbenannt? Dann gilt diese ganze "
      + "Probe nicht mehr und muss nachziehen.");
    for (const d of dateien) {
      /* SEIT PUNKT 18 IST DER ZWEIG LAUT, ABER NOCH OFFEN. Vorher stand hier
       * `if (!locationId || !req.orgId) return true;` in einer Zeile; jetzt ist
       * der Org-Fall ausgeklappt, protokolliert und gibt DANACH `true` zurueck.
       * Beides muss die Probe erkennen, sonst prueft sie eine Form, die es nicht
       * mehr gibt. */
      assert.match(d.text, /if \(!locationId\) return true;/,
        `${d.rel}: der fruehe Ausstieg fuer "kein Standort angefragt" fehlt`);
      assert.match(d.text, /if \(!req\.orgId\) \{[\s\S]{0,600}?return true;\s*\}/,
        `${d.rel}: der durchlaessige Zweig sieht anders aus als beim Schreiben dieser Probe. `
        + "Wurde er auf fail-closed umgestellt (dann darf dieser Waechter weg, siehe "
        + "Ablose-Bedingung im Code) oder nur umformuliert (dann muss das Muster nachziehen)?");
    }
  });

  it("PUNKT 18 · der durchlaessige Zweig PROTOKOLLIERT, bevor er durchlaesst", () => {
    /* Der billige Zwischenschritt vor fail-closed (Owner-Freigabe 2026-10-02):
     * nicht abweisen, sondern laut sein. Der Wert liegt in der ABLOESE-BEDINGUNG —
     * feuert die Zeile ueber den vereinbarten Zeitraum nie, ist die Verengung
     * gratis; feuert sie doch, ist der Aufrufer gefunden, von dem niemand wusste.
     *
     * Ohne diese Zusicherung ist der Zwischenschritt ein Kommentar: jemand
     * entfernt das `logger.warn`, der Zweig laesst weiter durch, und die
     * Entscheidungsgrundlage fuer fail-closed entsteht nie. */
    for (const d of dateienMitPruefer()) {
      const i = d.text.indexOf("if (!req.orgId) {");
      assert.ok(i > 0, `${d.rel}: kein ausgeklappter Org-Zweig`);
      /* DER ZWEIG, UND NUR DER ZWEIG. Erster Entwurf nahm ein Fenster von 700
       * Zeichen — und das reicht ueber das schliessende `}` hinaus bis in
       * `assertLocationBelongsToOrg(pool, locationId, req.orgId)`. Die Zusicherung
       * „die Meldung nennt locationId" war damit schon durch den Code DANACH
       * erfuellt: eine Rueckmutation, die `locationId` aus der Meldung entfernte,
       * blieb gruen. Geschnitten wird deshalb bis zum `return true;` des Zweigs. */
      const roh = d.text.slice(i);
      const ende = roh.indexOf("return true;");
      assert.ok(ende > 0, `${d.rel}: der Org-Zweig endet nicht mit return true;`);
      const zweig = roh.slice(0, ende + "return true;".length);
      /* DAS PROTOKOLL MUSS DIE ERSTE ANWEISUNG DES ZWEIGS SEIN.
       *
       * Erster Entwurf suchte nur den Text `logger?.warn?.(` irgendwo im Zweig —
       * und blieb gruen, als die Rueckmutation ihn mit `if (false)` davorsetzte.
       * Der Aufruf stand noch da und lief nicht mehr. Dieselbe Lehre wie „Zaehlen
       * ist kein Nachweis": die Anwesenheit eines Aufrufs ist nicht seine
       * Ausfuehrung. Steht er als erste Anweisung, kann ihn kein Vorsatz
       * ueberspringen, ohne die Form zu brechen. */
      assert.match(zweig, /if \(!req\.orgId\) \{\s*logger\?\.warn\?\.\(/,
        `${d.rel}: das Protokoll ist nicht die erste Anweisung des durchlaessigen `
        + "Zweigs. Steht etwas davor — und sei es nur ein `if (false)` —, entsteht die "
        + "Entscheidungsgrundlage fuer fail-closed nie, und der Zwischenschritt ist "
        + "nur ein Kommentar.");
      assert.match(zweig, /ORG_CONTEXT_MISSING/,
        `${d.rel}: die Meldung traegt keine durchsuchbare Kennung. Ein Protokolleintrag, `
        + "den man nicht filtern kann, ist fuer die Abloese-Bedingung wertlos.");
      assert.match(zweig, /locationId/,
        `${d.rel}: die Meldung nennt die angefragte Standort-Kennung nicht — dann weiss `
        + "niemand, WAS der Aufrufer wollte");
    }
  });

  it("die beiden Kopien des Pruefers bleiben gleich", () => {
    /* Zwei wortgleiche Kopien in zwei Routern sind Absicht (eine gemeinsame
     * Hilfsfunktion wuerde `pool` und `logger` zweier Router zusammenfuehren und
     * mehr aendern als dieser Schritt will) — und ein Risiko: die eine wird
     * verengt, die andere vergessen. Also wird die Gleichheit geprueft, statt
     * gehofft. */
    const bloecke = dateienMitPruefer().map((d) => {
      const i = d.text.indexOf("async function validateLocationScope");
      const j = d.text.indexOf("\n  }", i);
      return {
        rel: d.rel,
        /* Kommentare raus: die eine Kopie traegt die lange Begruendung, die
         * andere den Verweis darauf. Verglichen wird der CODE. */
        code: d.text.slice(i, j).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\s+/g, " ").trim()
      };
    });
    assert.ok(bloecke.length >= 2, "weniger als zwei Kopien gefunden");
    for (const b of bloecke.slice(1)) {
      assert.equal(b.code, bloecke[0].code,
        `${b.rel} und ${bloecke[0].rel} sind auseinandergelaufen. Wird eine Kopie `
        + "verengt und die andere nicht, steht die Luecke weiter offen — und sie faellt "
        + "niemandem auf, weil die verengte Kopie beweist, dass man es wusste.");
    }
  });

  it("SCHICHT 1 · jede Route mit Standort-Pruefer traegt rperm", () => {
    /* `rperm` ist die Schicht, die `req.orgId` setzt. Eine Route ohne sie
     * erreicht den Handler mit leerer Org — und dann laesst der Pruefer durch. */
    const ohne = [];
    let gezaehlt = 0;
    for (const d of dateienMitPruefer()) {
      for (const [i, zeile] of d.text.split(/\r?\n/).entries()) {
        if (!/^\s*router\.(get|post|put|patch|delete)\(/.test(zeile)) continue;
        gezaehlt++;
        /* Die Middleware-Kette darf sich ueber mehrere Zeilen ziehen — bis zur
         * Handler-Eröffnung lesen, nicht nur die erste Zeile. Eine zeilenweise
         * Pruefung haette hier zuverlaessig das Falsche gemessen. */
        const rest = d.text.split(/\r?\n/).slice(i, i + 6).join(" ");
        if (!/\brperm\(|requirePermission\(/.test(rest)) {
          ohne.push(`${d.rel}:${i + 1}  ${zeile.trim().slice(0, 90)}`);
        }
      }
    }
    assert.ok(gezaehlt >= 12,
      `nur ${gezaehlt} Routen gefunden, erwartet mindestens 12 — die Routen-Erkennung greift nicht`);
    assert.deepEqual(ohne, [],
      `${ohne.length} Route(n) ohne rperm in einer Datei, die validateLocationScope benutzt:\n  `
      + ohne.join("\n  ")
      + "\n\nDiese Routen sind der einzige Grund, warum der durchlaessige Zweig in "
      + "validateLocationScope heute niemandem schadet: rperm setzt req.orgId. Ohne rperm "
      + "laesst der Pruefer eine fremde Standort-Kennung ungeprueft durch, und der Dienst "
      + "baut eine Abfrage, die NUR nach Standort filtert.");
  });

  it("SCHICHT 2 · rperm setzt req.orgId und weist ohne Mitgliedschaft ab", () => {
    /* Die andere Haelfte derselben Zusage. Faellt sie weg, bleibt Schicht 1
     * gruen und schuetzt nichts mehr — genau die Naht, an der zwei Waechter
     * einander fuer zustaendig halten. */
    const rbac = lies("api/middleware/rbac.js");

    /* NUR DER RUMPF VON `requirePermission`, und das ist kein Detail: die
     * Kennung `NO_ORG_MEMBERSHIP` steht ZWEIMAL in dieser Datei — einmal hier
     * und einmal in `requireRole`. Eine Prüfung über die ganze Datei war damit
     * von der falschen Funktion erfüllt: eine Rückmutation, die den Code in
     * `requirePermission` umbenannte, blieb grün. Dieselbe Lehre wie „Zusicherung
     * trifft die falsche Stelle": den Gegenstand herausschneiden, dann prüfen. */
    const ab = rbac.indexOf("export function requirePermission");
    assert.ok(ab > 0, "requirePermission gibt es nicht mehr unter diesem Namen");
    const bis = rbac.indexOf("export function", ab + 10);
    const rumpf = bis > 0 ? rbac.slice(ab, bis) : rbac.slice(ab);
    assert.ok(rumpf.length > 500 && rumpf.length < rbac.length,
      "der Rumpf von requirePermission wurde nicht sauber herausgeschnitten");

    assert.match(rumpf, /req\.orgId\s*=\s*membership\?\.org_id\s*\|\|\s*orgId\s*\|\|\s*null;/,
      "requirePermission setzt req.orgId nicht mehr. Damit erreichen Handler die "
      + "Reporting-Routen mit leerer Org, und validateLocationScope laesst jede "
      + "Standort-Kennung ungeprueft durch.");
    assert.match(rumpf, /NO_ORG_MEMBERSHIP/,
      "requirePermission weist einen Aufrufer ohne Org-Mitgliedschaft nicht mehr ab");
    /* Und die Abweisung muss ein Abbruch sein, keine Warnung: der 403 steht im
     * selben Zweig wie die Meldung. */
    const zweig = rumpf.slice(Math.max(0, rumpf.indexOf("NO_ORG_MEMBERSHIP") - 400),
      rumpf.indexOf("NO_ORG_MEMBERSHIP") + 200);
    assert.match(zweig, /res\.status\(403\)/,
      "die fehlende Mitgliedschaft wird protokolliert, aber nicht abgewiesen");
  });

  it("SCHICHT 3 · wo beides gegeben ist, steht beides auch im SQL", () => {
    /* Die dritte Schicht liegt im Dienst. Sie laesst sich OHNE Datenbank
     * pruefen, weil der Mock-Pool die Abfrage einfach mitschreibt — und sie ist
     * die Schicht, die ein kuenftiger Umbau am leichtesten verliert: `org_id`
     * steht in einer Bedingung, die an `if (orgId)` haengt.
     *
     * Geprueft wird die WAHRE Aussage: sind Org UND Standort gegeben, muessen
     * BEIDE Bedingungen in der Abfrage landen. Dass eine Abfrage mit Standort
     * OHNE Org heute keine Org-Bedingung traegt, ist der gemeldete Befund — und
     * wird hier nicht als Soll festgeschrieben. */
    const gesehen = [];
    const pool = { query: (sql) => { gesehen.push(sql); return { rows: [{}] }; } };
    return (async () => {
      gesehen.length = 0;
      await reporting.requisitionKpis(pool, "org-1", "loc-1");
      assert.ok(gesehen.length >= 1, "requisitionKpis hat keine Abfrage gestellt");
      const sql = gesehen.join("\n");
      assert.match(sql, /r\.org_id\s*=\s*\$\d/,
        "requisitionKpis filtert nicht nach org_id, obwohl eine Org uebergeben wurde — "
        + "dann liest die Abfrage ueber Mandantengrenzen hinweg");
      assert.match(sql, /r\.location_id\s*=\s*\$\d/,
        "requisitionKpis filtert nicht nach location_id, obwohl ein Standort uebergeben wurde");

      gesehen.length = 0;
      await reporting.requisitionsByPeriod(pool, "org-1", 30, "loc-1");
      const sql2 = gesehen.join("\n");
      assert.match(sql2, /r\.org_id\s*=\s*\$\d/,
        "requisitionsByPeriod filtert nicht nach org_id, obwohl eine Org uebergeben wurde");
      assert.match(sql2, /r\.location_id\s*=\s*\$\d/,
        "requisitionsByPeriod filtert nicht nach location_id, obwohl ein Standort uebergeben wurde");
    })();
  });

  it("die Mengen-Seite: auf requisitions fuehrt jeder brauchbare Index mit org_id", () => {
    /* Die Skalierungsfrage zu 300 Kunden, strukturell statt per EXPLAIN. Ein
     * EXPLAIN beweist hier NICHTS: bei 73 Zeilen waehlt Postgres immer einen
     * Durchlauf, mit Index oder ohne (gemessen).
     *
     * Was man beweisen kann: `requisitions.location_id` hat keinen eigenen
     * Index, und die Abfragen bleiben nur deshalb klein, weil sie org-gebunden
     * sind — die Indizes fuehren mit `org_id`. Faellt die Org-Bindung weg (siehe
     * Schicht 3), faellt damit auch die Mengen-Grenze. Beides haengt an
     * derselben Bedingung, und das ist der Grund, es hier zusammen zu pruefen.
     *
     * Geprueft wird gegen die MIGRATIONEN, nicht gegen eine laufende Datenbank:
     * so laeuft die Probe im Tor und beschreibt, was ausgeliefert wird. */
    const dir = path.join(ROOT, "sql", "migrations");
    const alle = fs.readdirSync(dir).filter((f) => f.endsWith(".sql"))
      .map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");
    assert.ok(alle.length > 100000, `nur ${alle.length} Zeichen Migrationen gelesen`);

    const orgFuehrend = [...alle.matchAll(/CREATE\s+INDEX[^;]*?ON\s+(?:public\.)?requisitions\s*(?:USING\s+\w+\s*)?\(\s*org_id/gi)];
    assert.ok(orgFuehrend.length >= 3,
      `nur ${orgFuehrend.length} Index(e) auf requisitions fuehren mit org_id, erwartet mindestens 3. `
      + "Diese Indizes sind die Mengen-Grenze bei 300 Kunden: sie binden den Durchlauf an EINEN "
      + "Mandanten. Verschwinden sie, wird jede Standort-Auswertung ein Durchlauf ueber alle "
      + "Requisitions der Plattform.");
  });
});
