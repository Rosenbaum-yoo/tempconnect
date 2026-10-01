/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EINE KONDITIONSKARTE ZEIGT NUR AUF FIRMEN AUS DEM EIGENEN POOL (U6.2)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Owner-Entscheid 2026-10-01: "nur auf Firmen aus dem EIGENEN Lieferantenpool."
 * Damit ist der frühere Zwischenstand (das Feld im Ändern-Pfad einfach
 * zurückweisen) überholt — er war zu wenig beim Anlegen und zu viel beim Ändern.
 *
 * WARUM IM CODE UND NICHT IM SCHEMA, obwohl Migration 226 gerade das Gegenteil
 * getan hat: ein zusammengesetzter Fremdschlüssel bräuchte in `vendor_pool` ein
 * passendes `UNIQUE` — und es gibt keines. Der vorhandene lautet
 * `UNIQUE (client_org_id, supplier_org_id, category, location_id, department_id)`:
 * ein Lieferant **darf** mehrfach im Pool stehen, je Kategorie, Standort und
 * Abteilung. Ein zweispaltiges `UNIQUE` nachzurüsten wäre kein Fortschritt,
 * sondern würde genau diese legitime Mehrfachzugehörigkeit verbieten.
 *
 * DIESE DATEI IST DATENBANKFREI und prüft Form und Bindung der Abfrage. Das
 * Verhalten an echten Zeilen prüft
 * `test/integration/lieferantImPool.flow.test.js` — denn hier ist die
 * gefährlichste Lücke eine leer grüne Probe: `vendor_pool` hat **0 Zeilen**
 * (gemessen), und "wird abgewiesen, weil nicht im Pool" ist dann wahr, ohne
 * irgendetwas zu beweisen. Eine Probe muss ihren Gegenstand herstellen.
 *
 * Run: node --test --test-force-exit test/lieferantImPool.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { istLieferantImPool } from "../services/vendorPoolService.js";

const KUNDE = "aaaa1111-1111-4111-a111-111111111111";
const LIEFERANT = "bbbb2222-2222-4222-a222-222222222222";

/** Pool, der jede Abfrage mitschreibt und eine Trefferzeile liefert. */
function spion(treffer = true) {
  return {
    calls: [],
    async query(sql, params) {
      this.calls.push({ sql, params });
      return { rows: treffer ? [{ eins: 1 }] : [] };
    }
  };
}

describe("U6.2 · steht der Lieferant im Pool", () => {
  it("die Abfrage prüft alle vier Bedingungen", async () => {
    /*
     * FORM-PROBE. Ein Mock-Pool führt kein SQL aus, also kann nur der Text
     * belegen, dass die Bedingungen da sind. Jede einzeln, damit eine
     * Rückmutation nicht an einer Sammelzusicherung vorbeikommt.
     */
    const pool = spion();
    await istLieferantImPool(pool, KUNDE, LIEFERANT, { datum: "2026-10-01" });
    assert.equal(pool.calls.length, 1, "es wurde nicht abgefragt");
    const { sql } = pool.calls[0];

    assert.match(sql, /FROM vendor_pool/i);
    assert.match(sql, /client_org_id = \$1/, "der KUNDE wird nicht gebunden");
    assert.match(sql, /supplier_org_id = \$2/, "der LIEFERANT wird nicht gebunden");
    assert.match(sql, /status = 'active'/,
      "eine stillgelegte oder entfernte Zugehoerigkeit wuerde zaehlen");
    assert.match(sql, /tier <> 'BLOCKED'/,
      "ein GESPERRTER Lieferant wuerde zaehlen — dann ist die Sperre ein Vermerk ohne Wirkung");
    assert.match(sql, /valid_from IS NULL OR valid_from <= \$3/,
      "eine noch nicht gueltige Zugehoerigkeit wuerde zaehlen");
    assert.match(sql, /valid_until IS NULL OR valid_until >= \$3/,
      "eine ABGELAUFENE Zugehoerigkeit wuerde zaehlen");
  });

  it("die Reihenfolge der Kennungen ist nicht vertauscht", async () => {
    /*
     * DIE SPALTE, DIE HIER LÜGT. `vendor_pool` trägt BEIDE Seiten:
     * `client_org_id` ist die eigene Organisation, `supplier_org_id` die fremde.
     * Wer sie tauscht, baut eine Prüfung, die grün ist und nichts bewacht —
     * dieselbe Klasse wie `vendor_pool.location_id` an `supplier_org_id` in
     * Migration 226. Deshalb wird die BINDUNG geprüft, nicht nur der Text.
     */
    const pool = spion();
    await istLieferantImPool(pool, KUNDE, LIEFERANT, { datum: "2026-10-01" });
    assert.deepEqual(pool.calls[0].params, [KUNDE, LIEFERANT, "2026-10-01"],
      "Kunde und Lieferant sind vertauscht oder das Datum fehlt");
  });

  it("ohne Kennung wird abgewiesen, nicht abgefragt", async () => {
    /* Fail-closed, und ohne Abfrage: eine fehlende Kennung ist kein Treffer,
       und ein `WHERE x = NULL` fände sowieso nichts — nur stiller. */
    const pool = spion();
    assert.equal(await istLieferantImPool(pool, null, LIEFERANT), false);
    assert.equal(await istLieferantImPool(pool, KUNDE, null), false);
    assert.deepEqual(pool.calls, [], "es wurde trotz fehlender Kennung abgefragt");
  });

  it("das Datum kommt aus todayDE, nicht aus einem UTC-Schnitt", async () => {
    /*
     * Die Direktive "DACH-first Zeit" gilt: ein roher UTC-Schnitt liegt am
     * Randtag einen Tag falsch, und dann weist ein Gueltigkeitsfenster am
     * falschen Tag ab. Geprueft wird, dass OHNE ausdrueckliches Datum ein
     * Tagesdatum gebunden wird — und zwar das von heute in Europe/Berlin.
     */
    const pool = spion();
    await istLieferantImPool(pool, KUNDE, LIEFERANT);
    const datum = pool.calls[0].params[2];
    assert.match(String(datum), /^\d{4}-\d{2}-\d{2}$/,
      `gebunden wurde ${datum} — erwartet ein Tagesdatum JJJJ-MM-TT`);

    /* Und es ist das deutsche Heute, nicht das von UTC: beide stimmen meistens
       ueberein, deshalb wird gegen die Projekt-Utility verglichen und nicht
       gegen eine eigene Rechnung. */
    const { todayDE } = await import("../utils/dateDE.js");
    assert.equal(datum, todayDE());

    /*
     * UND DER QUELLTEXT, weil das Ergebnis es NICHT zeigt.
     *
     * `new Date().toISOString().slice(0, 10)` und `todayDE()` liefern an den
     * meisten Tagen denselben Wert - die Zusicherung darueber ist dann
     * tautologisch. Eine Rueckmutation, die die Quelle austauschte, blieb
     * deshalb gruen (gemessen 2026-10-01). Dieselbe Klasse wie
     * EIGENTUEMER_ROLLE in reputationSql: wenn zwei Wege dasselbe Ergebnis
     * liefern, ist der Gegenstand der Quelltext.
     *
     * Was auf dem Spiel steht: ein UTC-Schnitt liegt nach 22 Uhr deutscher Zeit
     * einen Tag zurueck. Ein Gueltigkeitsfenster weist dann am Randtag das
     * Richtige ab - und niemand kann es nachstellen, weil es tagsueber stimmt.
     */
    const fs2 = await import("node:fs");
    const path2 = await import("node:path");
    const { fileURLToPath: f2 } = await import("node:url");
    const { jsLiterale } = await import("./lib/sqlScanner.mjs");
    const dienst = fs2.readFileSync(
      path2.resolve(path2.dirname(f2(import.meta.url)), "..", "services", "vendorPoolService.js"), "utf8");

    assert.match(dienst, /todayDE\(\)/, "todayDE wird nicht benutzt");
    /*
     * DIE DATUMSZEILE SELBST, nicht die ganze Datei und nicht die Literale.
     *
     * Eine erste Fassung suchte toISOString in den STRING-LITERALEN - und
     * toISOString ist Code, kein Literal. Die Rueckmutation blieb deshalb gruen:
     * die Probe sah an der falschen Stelle hin. Eine Suche ueber die ganze Datei
     * waere ebenso falsch, weil die Kommentare toISOString absichtlich als
     * Gegenbeispiel nennen. Geprueft wird deshalb die Zeile, die das Datum
     * bestimmt.
     */
    const datumszeile = dienst.split(String.fromCharCode(10))
      .map((z) => z.replace(String.fromCharCode(13), ""))
      .find((z) => z.includes("opts.datum"));
    assert.ok(datumszeile, "der Datumspfad wurde nicht gefunden - ist er umgezogen?");
    assert.match(datumszeile, /todayDE\(\)/,
      `die Datumsquelle ist nicht todayDE: ${datumszeile.trim()}`);
    assert.equal(/toISOString/.test(datumszeile), false,
      `roher UTC-Schnitt in der Datumszeile: ${datumszeile.trim()}`);
  });

  it("ein Treffer heisst true, kein Treffer false", async () => {
    /* Die Gegenprobe zur Form: ohne sie koennte die Funktion immer dasselbe
       zurueckgeben und alle Zusicherungen oben bestehen. */
    assert.equal(await istLieferantImPool(spion(true), KUNDE, LIEFERANT), true);
    assert.equal(await istLieferantImPool(spion(false), KUNDE, LIEFERANT), false);
  });

  it("beide Schreibwege der Konditionskarte benutzen die Pruefung", async () => {
    /*
     * DIE VERDRAHTUNG. Eine Pruefung, die niemand ruft, ist keine — und der
     * Anlegen-Pfad war hier genauso offen wie der Aendern-Pfad (fuenfter Fall
     * des Paar-Musters in dieser Woche).
     */
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const hier = path.dirname(fileURLToPath(import.meta.url));
    const quelle = fs.readFileSync(path.resolve(hier, "..", "services", "rateCardService.js"), "utf8");

    const rufe = (quelle.match(/istLieferantImPool\(/g) || []).length;
    assert.ok(rufe >= 2,
      `istLieferantImPool wird ${rufe}x gerufen — erwartet mindestens zweimal (anlegen UND aendern)`);

    /* Und der alte Zwischenstand darf nicht daneben stehenbleiben: zwei Regeln
       ueber einem Feld sind die Klasse Fehler, die diese Woche angefangen hat. */
    assert.equal(/kann nicht nachtraeglich geaendert werden/.test(quelle), false,
      "der ueberholte Zwischenstand steht noch im Code — er wurde ergaenzt statt ersetzt");
  });

  it("beide Schreibwege weisen einen Lieferanten ausserhalb des Pools ab", async () => {
    /*
     * AM VERHALTEN, nicht am Vorkommen.
     *
     * Die Probe darueber zaehlt, wie oft istLieferantImPool im Quelltext steht -
     * und eine Rueckmutation, die den Aufruf UNERREICHBAR macht, liess sie gruen.
     * Der Aufruf stand ja noch da. Zaehlen ist kein Nachweis fuer Erreichbarkeit.
     */
    const { createRateCard, updateRateCard } = await import("../services/rateCardService.js");
    const { OrgBoundaryError } = await import("../utils/orgBoundary.js");
    const pool = {
      async query(sql) {
        if (/FROM vendor_pool/i.test(sql)) return { rows: [] };
        if (/FROM (org_locations|org_departments|contracts)/i.test(sql)) return { rows: [{ eins: 1 }] };
        return { rows: [{ id: "neu", org_id: KUNDE, status: "draft" }] };
      }
    };

    await assert.rejects(
      () => createRateCard(pool, {
        orgId: KUNDE, supplierOrgId: LIEFERANT, roleCategory: "Lager",
        targetRateCents: 2000, maxRateCents: 3000, validFrom: "2026-01-01"
      }),
      (err) => err instanceof OrgBoundaryError && /Lieferantenpool/.test(err.message),
      "der ANLEGEN-Pfad nimmt einen Lieferanten ausserhalb des Pools an");

    await assert.rejects(
      () => updateRateCard(pool, "77777777-7777-4777-a777-777777777777",
        { supplier_org_id: LIEFERANT }, "actor", KUNDE),
      (err) => err instanceof OrgBoundaryError && /Lieferantenpool/.test(err.message),
      "der AENDERN-Pfad nimmt einen Lieferanten ausserhalb des Pools an");
  });

  it("GEGENPROBE: ein Lieferant IM Pool kommt durch", async () => {
    /* Ohne sie bestuende die Probe darueber auch dann, wenn beide Wege
       grundsaetzlich ablehnen - und das waere kaputt, nicht sicher. */
    const { createRateCard } = await import("../services/rateCardService.js");
    const pool = { async query() { return { rows: [{ eins: 1, id: "neu" }] }; } };
    const karte = await createRateCard(pool, {
      orgId: KUNDE, supplierOrgId: LIEFERANT, roleCategory: "Lager",
      targetRateCents: 2000, maxRateCents: 3000, validFrom: "2026-01-01"
    });
    assert.ok(karte, "ein Lieferant IM Pool wurde abgewiesen");
  });
});
