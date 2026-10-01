/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EINE WAHRHEIT ÜBER DAS GÜLTIGKEITSFENSTER (U6.8)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Owner-Freigabe 2026-10-01, Punkt 12 der Entscheidungsliste: *„Gilt ein
 * abgelaufener Vertrag noch als Vertrag?"* — Nein. Der Vertrags-Zweig des
 * Partner-Riegels prüfte nur `status = 'active'`, obwohl `contracts` **beide**
 * Fenstergrenzen trägt.
 *
 * WARUM DARAUS EIN MODUL WURDE UND KEIN ZWEITER ZWEIZEILER. Damit wäre die
 * Bedingung „heute liegt im Fenster" zum zweiten Mal von Hand geschrieben
 * gewesen — und diese Phase hat dreimal gezeigt, wohin das führt: die Pool-Regel
 * stand am Ende **vierfach** im Baum, zwei Fassungen davon aus einer einzigen
 * Welle. Eine Breitenmessung am 2026-10-01 hat zudem **vier weitere** Stellen
 * derselben Klasse gefunden (`supplierPoolService` ohne jedes Fenster,
 * `marketplaceService` mit zwei Wahrheiten über `availability_to`,
 * `assignmentStaffingService`, `workerService`). Sie sind owner-gebunden und
 * nicht gebaut — aber wenn sie kommen, kommen sie hierher.
 *
 * DIE DRITTE RÜCKMUTATION IST DIE WICHTIGE, und die gegenprüfende Sitzung hat
 * sie ausdrücklich verlangt: nicht nur „Grenze weg", sondern **Grenze
 * VERENGT**. „Wird abgewiesen" besteht auch, wenn der Riegel ALLES abweist —
 * dann fällt der gültige Fall unauffällig mit heraus. Jede Prüfung unten hat
 * deshalb ihren Zwilling: zu jedem abgewiesenen Fall einen, der durchkommt.
 *
 * Run: node --test --test-force-exit test/gueltigkeitsfenster.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { gueltigkeitsfensterSql } from "../services/gueltigkeitsfensterSql.js";
import { poolBedingungenSql } from "../services/poolMitgliedschaftSql.js";

const HIER = dirname(fileURLToPath(import.meta.url));
const API = join(HIER, "..");

describe("U6.8 · das Gültigkeitsfenster, als eine Wahrheit", () => {
  it("beide Grenzen werden geprüft, und NULL heißt unbegrenzt", () => {
    const sql = gueltigkeitsfensterSql({ alias: "c", datum: "$3" });
    /* Jede Grenze einzeln, damit eine Rückmutation nicht an einer
       Sammelzusicherung vorbeikommt. */
    assert.match(sql, /\(c\.valid_from IS NULL OR c\.valid_from <= \$3::date\)/,
      "der Fensterbeginn fehlt oder behandelt NULL nicht als unbegrenzt");
    assert.match(sql, /\(c\.valid_until IS NULL OR c\.valid_until >= \$3::date\)/,
      "das Fensterende fehlt oder behandelt NULL nicht als unbegrenzt");
  });

  it("beide Grenzen SCHLIESSEN EIN — <= und >=, nicht < und >", () => {
    /*
     * DIE VERENGUNGS-PROBE. Ein `<` statt `<=` wirft genau einen Tag weg: den
     * Tag, an dem das Fenster beginnt. Eine Probe, die nur „ausserhalb wird
     * abgewiesen" prüft, bleibt dabei grün — die Verengung weist ja auch ab,
     * nur zu viel.
     */
    const sql = gueltigkeitsfensterSql({ alias: "vp", datum: "$7" });
    assert.match(sql, /valid_from <= \$7::date/, "der Beginn ist verengt (< statt <=)");
    assert.match(sql, /valid_until >= \$7::date/, "das Ende ist verengt (> statt >=)");
    assert.doesNotMatch(sql, /valid_from\s+<\s+\$/, "strikt kleiner am Beginn");
    assert.doesNotMatch(sql, /valid_until\s+>\s+\$(?!\d+::date)/, "strikt grösser am Ende");
  });

  it("der Stichtag ist gebunden; CURRENT_DATE bekommt KEIN ::date", () => {
    assert.match(gueltigkeitsfensterSql({ alias: "c", datum: "$3" }), /\$3::date/,
      "ein Platzhalter braucht die Typangabe");
    const mitJetzt = gueltigkeitsfensterSql({ alias: "c", datum: "CURRENT_DATE" });
    assert.match(mitJetzt, /valid_from <= CURRENT_DATE/);
    assert.doesNotMatch(mitJetzt, /CURRENT_DATE::date/, "unnötiger Cast");
  });

  it("andere Spaltennamen sind möglich — dafür ist das Modul da", () => {
    /* Die vier noch nicht gebauten Stellen tragen andere Namen
       (`availability_from`/`availability_to`). Ohne diese Freiheit müsste die
       nächste Welle wieder von Hand schreiben. */
    const sql = gueltigkeitsfensterSql({
      alias: "cp", von: "availability_from", bis: "availability_to", datum: "$2"
    });
    assert.match(sql, /cp\.availability_from IS NULL OR cp\.availability_from <= \$2::date/);
    assert.match(sql, /cp\.availability_to IS NULL OR cp\.availability_to >= \$2::date/);
  });

  it("alles, was kein Bezeichner, Platzhalter oder CURRENT_DATE ist, wird abgewiesen", () => {
    /*
     * NULL IST KEIN FEHLWERT, sondern „nimm die Vorgabe" — `alias`, `von` und
     * `bis` haben eine (`?? "t"`, `?? "valid_from"`, `?? "valid_until"`). Mein
     * erster Entwurf verlangte auch dort einen Wurf und wurde zu Recht rot: die
     * Probe hatte das Modul falsch beschrieben, nicht umgekehrt.
     *
     * `datum` hat KEINE Vorgabe — ein Fenster ohne Stichtag ist keine Frage, und
     * dort muss auch null werfen.
     */
    for (const w of ["1; DROP TABLE contracts", "c.x OR 1=1", "'x'", "", null, "a.b.c"]) {
      assert.throws(() => gueltigkeitsfensterSql({ alias: "c", datum: w }),
        /FENSTER_SQL_UNGUELTIG/, "durchgelassen als datum: " + JSON.stringify(w));
    }
    for (const w of ["1; DROP TABLE contracts", "c.x OR 1=1", "'x'", "", "a.b", "x; --"]) {
      assert.throws(() => gueltigkeitsfensterSql({ alias: w, datum: "$1" }),
        /FENSTER_SQL_UNGUELTIG/, "durchgelassen als alias: " + JSON.stringify(w));
      assert.throws(() => gueltigkeitsfensterSql({ alias: "c", von: w, datum: "$1" }),
        /FENSTER_SQL_UNGUELTIG/, "durchgelassen als von: " + JSON.stringify(w));
      assert.throws(() => gueltigkeitsfensterSql({ alias: "c", bis: w, datum: "$1" }),
        /FENSTER_SQL_UNGUELTIG/, "durchgelassen als bis: " + JSON.stringify(w));
    }
    /* Und die Vorgaben greifen wirklich, sonst wäre der Satz oben eine Behauptung. */
    const mitVorgaben = gueltigkeitsfensterSql({ datum: "$1" });
    assert.match(mitVorgaben, /t\.valid_from IS NULL/, "die Vorgaben greifen nicht");
  });

  /* ── Die Benutzer: eine Wahrheit, nicht zwei Handschriften ──────────────── */

  it("die Pool-Regel bezieht ihr Fenster aus diesem Modul", () => {
    /* Erreichbarkeit, nicht Anwesenheit: geprüft wird, dass der erzeugte Text
       identisch ist — nicht, dass der Name irgendwo im Quelltext steht. */
    const pool = poolBedingungenSql({ kunde: "$1", lieferant: "$2", datum: "$3", alias: "vp" });
    const fenster = gueltigkeitsfensterSql({ alias: "vp", datum: "$3" });
    assert.ok(pool.includes(fenster),
      "die Pool-Bedingung enthält nicht wörtlich das Fenster dieses Moduls — " +
      "dann gibt es zwei Fassungen, und sie driften");
  });

  it("der Partner-Riegel benutzt es in BEIDEN Zweigen, mit demselben Stichtag", () => {
    /*
     * Die Zusicherung, die U6.8 belegt. Zwei Stichtage in einem Riegel wären an
     * der Tagesgrenze zwei verschiedene Antworten auf dieselbe Frage — und die
     * Begründung dafür stünde in keinem Protokoll.
     */
    const quelle = readFileSync(join(API, "services", "assignmentService.js"), "utf8");
    const riegel = quelle.match(/SELECT \(\s*EXISTS[\s\S]*?\) AS partner/i);
    assert.ok(riegel, "der Partner-Riegel ist nicht mehr an seinem Platz");

    assert.match(riegel[0], /poolBedingungenSql\(/, "der Pool-Zweig benutzt das Pool-Modul nicht");
    assert.match(riegel[0], /gueltigkeitsfensterSql\(\{ alias: "c", datum: "\$3" \}\)/,
      "der VERTRAGS-Zweig prüft das Fenster nicht über das gemeinsame Modul — " +
      "genau die Lücke aus Punkt 12 der Owner-Liste");
    assert.doesNotMatch(riegel[0], /c\.valid_until\s*>=/,
      "das Fenster des Vertrags steht als nackter Text im Riegel statt im Modul");

    /* Und der Stichtag ist EINER: $3 in beiden Zweigen, nirgends $4. */
    assert.doesNotMatch(riegel[0], /\$4/,
      "ein zweiter Stichtag im Riegel — an der Tagesgrenze zwei Antworten");
  });

  it("niemand schreibt die Fensterbedingung noch von Hand", () => {
    /*
     * Derselbe Zuschnitt wie beim Pool-Wächter, und mit derselben Begründung:
     * der Fingerabdruck ist `valid_until >= ` neben `valid_from <= ` in EINEM
     * Abfragetext. Wer beides zusammen tippt, baut das Fenster nach.
     *
     * BESTAND ist LEER, und das ist das Ergebnis: seit U6.8 gibt es im ganzen
     * Korpus keine Stelle mehr, die beide Grenzen selbst schreibt. Das Modul ist
     * ausgenommen — es IST der Ort.
     *
     * WAS ER NICHT FÄNGT, offen gesagt: eine Stelle, die nur EINE Grenze prüft.
     * Genau das war die Lücke in U6.7 und U6.8, und sie ist im Text nicht von
     * einer absichtlich einseitigen Prüfung zu unterscheiden — `bountyService`
     * hat solche, und sie sind richtig. Deshalb fängt dieser Wächter die
     * auffällige Hälfte, und das Modul verhindert beide.
     */
    const BESTAND = new Map();
    const fingerabdruck = (t) =>
      /\bvalid_from\s*<=\s*/.test(t) && /\bvalid_until\s*>=\s*/.test(t);

    const neue = [];
    for (const pfad of quellDateien()) {
      const rel = pfad.slice(API_DIR.length + 1).replace(/\\/g, "/");
      if (rel === "services/gueltigkeitsfensterSql.js") continue;
      if (!jsLiterale(readFileSync(pfad, "utf8")).some((l) => fingerabdruck(l.text))) continue;
      if (!BESTAND.has(rel)) neue.push(rel);
    }
    assert.deepEqual(neue, [],
      "diese Stelle(n) schreiben das Fenster von Hand: " + neue.join(", ") +
      "\nservices/gueltigkeitsfensterSql.js benutzen — gueltigkeitsfensterSql({ alias, datum }).");

    /* NOTBREMSE: der Scan muss den Korpus überhaupt lesen. Ohne sie wäre `neue`
       auch bei kaputter Dateisuche leer, und die Zusicherung oben bedeutungslos. */
    const liest = quellDateien().filter((p) =>
      jsLiterale(readFileSync(p, "utf8")).some((l) => /\bvalid_until\b/.test(l.text)));
    assert.ok(liest.length >= 3,
      "der Scan findet nur " + liest.length + " Dateien, die `valid_until` nennen — " +
      "das deutet auf eine kaputte Dateisuche, und damit ist die leere Fundliste " +
      "oben bedeutungslos");
  });
});

/* Unten, damit der Kopf der Datei von der Regel handelt und nicht vom Werkzeug. */
import { quellDateien, jsLiterale, API_DIR } from "./lib/sqlScanner.mjs";
