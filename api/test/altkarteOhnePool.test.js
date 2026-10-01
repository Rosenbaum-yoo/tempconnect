/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BESTANDSSCHUTZ MIT SICHTBAREM HINWEIS (U6.2a)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Owner 2026-10-01: die Pool-Regel aus U6.2 gilt für **Schreibvorgänge**, nicht
 * rückwirkend. Gemessen beim Einschalten: 4 Konditionskarten, 1 mit Lieferant,
 * 0 Poolzeilen — diese eine Karte verletzt die Regel ab Sekunde eins. Sie wird
 * nicht migriert, nicht geleert, nicht rückwirkend geprüft. Sie bekommt einen
 * **Hinweis**.
 *
 * WARUM DER HINWEIS NICHT OPTIONAL IST: beim nächsten Ändern des Lieferanten
 * weist der Server ab. Ein Hinweis, der erst im Fehlerfall erscheint, ist eine
 * **Falle** statt einer Auskunft — der Mensch erfährt die Regel in dem Moment,
 * in dem sie ihm im Weg steht, und hält sie für einen Defekt.
 *
 * DIE WICHTIGSTE PROBE IN DIESER DATEI IST DIE LETZTE. U6.2a braucht die
 * Pool-Bedingung an einer **zweiten** Stelle. Sie dort von Hand hinzuschreiben
 * wäre die Fehlerklasse, mit der diese Woche angefangen hat — und sie ist in
 * **dieser** Welle schon zweimal gemessen worden:
 *
 *   - `assignmentService` prüft die Poolzugehörigkeit **ohne** `valid_from`,
 *     `istLieferantImPool` **mit**. Ein vordatierter Eintrag gilt dort schon
 *     heute als Partnerschaft.
 *   - `isInPool` steht unbenutzt daneben und prüft **weniger**: kein Fenster,
 *     keine Sperre.
 *
 * Also kommt der Text aus **einer** Funktion, und eine Probe hält fest, dass
 * niemand ihn nachbildet.
 *
 * Run: node --test --test-force-exit test/altkarteOhnePool.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { listRateCards } from "../services/rateCardService.js";
import {
  poolBedingungenSql, poolMitgliedschaftExistsSql,
  POOL_AKTIVER_STATUS, POOL_GESPERRTE_STUFE
} from "../services/poolMitgliedschaftSql.js";
/* Der Haus-Scanner, nicht ein eigener: er entfernt Kommentare und maskiert
   Interpolationen, und drei andere Wächter benutzen ihn schon. Ein zweiter
   Scanner neben ihm wäre dieselbe Doppelung, die diese Datei verhindert. */
import { quellDateien, jsLiterale, API_DIR } from "./lib/sqlScanner.mjs";

const HIER = dirname(fileURLToPath(import.meta.url));
const API = join(HIER, "..");
const WURZEL = join(API, "..");

const ORG = "aaaa1111-1111-4111-a111-111111111111";

function spion(zeilen = []) {
  return {
    calls: [],
    async query(sql, params) {
      this.calls.push({ sql, params });
      if (/COUNT\(\*\)::int AS total/i.test(sql)) return { rows: [{ total: zeilen.length }] };
      return { rows: zeilen };
    },
    liste() { return this.calls.find(c => /AS lieferant_im_pool/i.test(c.sql)) || null; }
  };
}

/* ── Das eine Wahrheitsmodul ─────────────────────────────────────────────── */

describe("U6.2a · poolMitgliedschaftSql — eine Wahrheit", () => {
  it("die Bedingungen nennen Status, Sperre und BEIDE Fensterseiten", () => {
    const sql = poolBedingungenSql({ kunde: "$1", lieferant: "$2", datum: "$3" });
    assert.match(sql, /vp\.client_org_id = \$1/);
    assert.match(sql, /vp\.supplier_org_id = \$2/);
    assert.match(sql, /vp\.status = 'active'/);
    assert.match(sql, /vp\.tier <> 'BLOCKED'/);
    assert.match(sql, /vp\.valid_from IS NULL OR vp\.valid_from <= \$3::date/);
    assert.match(sql, /vp\.valid_until IS NULL OR vp\.valid_until >= \$3::date/);
  });

  it("die beiden Werte sind benannt, nicht im Text verstreut", () => {
    /* Wer 'active' oder 'BLOCKED' an einer zweiten Stelle als nackte
       Zeichenkette schreibt, kann sie an einer dritten anders schreiben. */
    assert.equal(POOL_AKTIVER_STATUS, "active");
    assert.equal(POOL_GESPERRTE_STUFE, "BLOCKED");
  });

  it("Spalten dürfen qualifiziert sein — dafür ist das Modul da", () => {
    const sql = poolBedingungenSql({
      kunde: "rc.org_id", lieferant: "rc.supplier_org_id",
      datum: "$7", alias: "vpm"
    });
    assert.match(sql, /vpm\.client_org_id = rc\.org_id/);
    assert.match(sql, /vpm\.supplier_org_id = rc\.supplier_org_id/);
    assert.match(sql, /vpm\.valid_from <= \$7::date/);
  });

  it("CURRENT_DATE bekommt KEIN ::date angehängt", () => {
    const sql = poolBedingungenSql({ kunde: "$1", lieferant: "$2", datum: "CURRENT_DATE" });
    assert.match(sql, /valid_from <= CURRENT_DATE/);
    assert.doesNotMatch(sql, /CURRENT_DATE::date/);
  });

  it("alles, was kein Bezeichner, Platzhalter oder CURRENT_DATE ist, wird abgewiesen", () => {
    /*
     * Die Bezeichner schreiben wir heute selbst — aber ein Modul, das SQL-Text
     * baut, muss das annehmen, was der nächste Aufrufer hineingibt. Dieselbe
     * Haltung wie in `reputationSql.js`.
     */
    const boese = [
      "1; DROP TABLE vendor_pool",
      "rc.org_id OR 1=1",
      "'x'",
      "",
      null,
      "rc.a.b.c"
    ];
    for (const w of boese) {
      assert.throws(
        () => poolBedingungenSql({ kunde: w, lieferant: "$2", datum: "$3" }),
        /POOL_SQL_UNGUELTIG/,
        "durchgelassen: " + JSON.stringify(w)
      );
    }
    assert.throws(
      () => poolBedingungenSql({ kunde: "$1", lieferant: "$2", datum: "$3", alias: "vp; --" }),
      /POOL_SQL_UNGUELTIG/
    );
  });

  it("die EXISTS-Form liest dieselbe Tabelle und dieselben Bedingungen", () => {
    const sql = poolMitgliedschaftExistsSql({ kunde: "$1", lieferant: "$2", datum: "$3" });
    assert.match(sql, /^EXISTS \(/);
    assert.match(sql, /FROM vendor_pool vp/);
    assert.match(sql, /vp\.tier <> 'BLOCKED'/);
  });
});

/* ── Die Liste beantwortet die Frage ─────────────────────────────────────── */

describe("U6.2a · die Liste der Konditionskarten sagt es je Zeile", () => {
  it("lieferant_im_pool wird mitgelesen und ist an die Org DER KARTE gebunden", async () => {
    const pool = spion([{ id: "rc1" }]);
    await listRateCards(pool, ORG, {});
    const l = pool.liste();
    assert.ok(l, "das Feld wird nicht mitgelesen");
    assert.match(l.sql, /vpm\.client_org_id = rc\.org_id/,
      "die Poolprüfung hängt nicht an der Org DER KARTE — eine fremde Org könnte " +
      "die Zugehörigkeit bestimmen");
    assert.match(l.sql, /vpm\.supplier_org_id = rc\.supplier_org_id/);
  });

  it("eine Karte OHNE Lieferant bekommt null, nicht false", async () => {
    /*
     * DREI WERTE, NICHT ZWEI. Ein `false` an einer org-weiten Karte liest sich
     * als „der Lieferant steht nicht im Pool", wo es gar keinen gibt — und die
     * Oberfläche würde an JEDER org-weiten Karte warnen. Ein Hinweis, der
     * falsch oft erscheint, wird weggesehen; dann nützt er auch da nichts, wo
     * er stimmt.
     */
    const pool = spion([{ id: "rc1" }]);
    await listRateCards(pool, ORG, {});
    assert.match(pool.liste().sql, /CASE WHEN rc\.supplier_org_id IS NULL THEN NULL ELSE/i,
      "eine Karte ohne Lieferant bekommt kein null — die Oberfläche warnt dann überall");
  });

  it("das Datum ist gebunden, nicht eingesetzt — und kommt aus todayDE", async () => {
    const pool = spion([{ id: "rc1" }]);
    await listRateCards(pool, ORG, {});
    const l = pool.liste();
    const stelle = l.sql.match(/valid_from <= \$(\d+)::date/);
    assert.ok(stelle, "der Stichtag ist nicht als Platzhalter gebunden");
    const wert = l.params[Number(stelle[1]) - 1];
    assert.match(String(wert), /^\d{4}-\d{2}-\d{2}$/,
      "an der gebundenen Stelle steht kein Datum: " + JSON.stringify(wert));

    /* Die Quelle, nicht der Wert: todayDE() und ein UTC-Schnitt liefern an den
       meisten Tagen dasselbe — eine Zusicherung auf den Wert wäre tautologisch. */
    const quelle = readFileSync(join(API, "services", "rateCardService.js"), "utf8");
    const zeile = quelle.split(/\r?\n/).find(z => /params\.push\(.*todayDE\(\)/.test(z));
    assert.ok(zeile, "der Stichtag der Liste kommt nicht aus todayDE() — " +
      "ein UTC-Schnitt liegt nach 22 Uhr deutscher Zeit einen Tag zurück und " +
      "würde am Randtag an einer gültigen Karte warnen");
  });

  it("die Zählabfrage bekommt den Stichtag NICHT — sonst stimmen die Platzhalter nicht", async () => {
    /* Die Zählung wird aus einer Kopie der Parameter vor dem Stichtag gebaut.
       Wer das vertauscht, bekommt entweder einen Platzhalter zu viel oder die
       Zählung zählt mit dem Datum als Org. */
    const pool = spion([{ id: "rc1" }]);
    await listRateCards(pool, ORG, {});
    const zaehlung = pool.calls.find(c => /COUNT\(\*\)::int AS total/i.test(c.sql));
    assert.ok(zaehlung, "die Zählabfrage fehlt");
    assert.equal(zaehlung.params.length, 1, "die Zählung bekommt zu viele Parameter");
    assert.equal(zaehlung.params[0], ORG);
  });

  it("Grenze und Begrenzung bleiben korrekt gebunden", async () => {
    /* Der Stichtag schiebt LIMIT und OFFSET um eine Stelle. Ein falscher Index
       würde die Liste mit dem DATUM begrenzen — und das fällt ohne Probe erst
       auf, wenn eine Seite leer bleibt. */
    const pool = spion([{ id: "rc1" }]);
    await listRateCards(pool, ORG, { limit: 25, offset: 50 });
    const l = pool.liste();
    const lim = l.sql.match(/LIMIT \$(\d+) OFFSET \$(\d+)/);
    assert.ok(lim, "LIMIT/OFFSET sind nicht gebunden");
    assert.equal(l.params[Number(lim[1]) - 1], 25, "LIMIT zeigt auf den falschen Parameter");
    assert.equal(l.params[Number(lim[2]) - 1], 50, "OFFSET zeigt auf den falschen Parameter");
  });
});

/* ── Der Hinweis in der Oberfläche ───────────────────────────────────────── */

describe("U6.2a · der sichtbare Hinweis", () => {
  const seite = readFileSync(join(WURZEL, "frontend", "public", "rate-cards.html"), "utf8");

  it("der Hinweis prüft streng auf === false", () => {
    assert.match(seite, /if \(rc\.lieferant_im_pool === false\) \{/,
      "ein `!rc.lieferant_im_pool` würde auch bei null und bei einer alten " +
      "API-Antwort ohne das Feld warnen — also an jeder org-weiten Karte");
  });

  it("der Hinweis hat eine Klasse, die es wirklich gibt", () => {
    /* Ein Abzeichen ohne CSS-Regel ist kein Hinweis, sondern unsichtbarer Text.
       Geprüft wird, dass die benutzte Klasse auch definiert ist. */
    const benutzt = seite.match(/class="badge (badge-[a-z-]+)"/g) || [];
    assert.ok(benutzt.length > 0, "keine Abzeichen-Klasse im Markup gefunden");
    assert.match(seite, /\.badge-pool-warn \{/, "die Klasse badge-pool-warn ist nicht definiert");
    assert.match(seite, /class="badge badge-pool-warn"/, "die Klasse wird nicht benutzt");
  });

  it("die Farben kommen aus dem Design-System, nicht aus dem Text", () => {
    const regel = seite.match(/\.badge-pool-warn \{[^}]*\}/);
    assert.ok(regel, "die Regel fehlt");
    assert.doesNotMatch(regel[0], /#[0-9a-f]{3,8}\b/i,
      "harte Farbwerte auf einer Enterprise-Fläche: " + regel[0]);
    assert.doesNotMatch(regel[0], /\brgba?\(/i, "harte Farbwerte: " + regel[0]);
    assert.match(regel[0], /var\(--/, "die Regel benutzt keine Token");
  });

  it("der Hinweis ist escaped und trägt eine Erklärung", () => {
    const stelle = seite.match(/if \(rc\.lieferant_im_pool === false\) \{[\s\S]*?\n        \}/);
    assert.ok(stelle, "der Hinweis-Block ist nicht auffindbar");
    assert.match(stelle[0], /esc\(t\('sc\.b\.cell\.notInPool'\)\)/,
      "der Hinweistext geht ungeescaped ins innerHTML");
    assert.match(stelle[0], /title="' \+ esc\(t\('sc\.b\.cell\.notInPoolHint'\)\)/,
      "ohne Erklärung ist 'nicht im Pool' eine Behauptung ohne Folge");
  });

  it("der Hinweis sagt, dass die Karte GÜLTIG bleibt", () => {
    /*
     * Der Satz muss die Folge nennen, nicht nur den Zustand. Ein „nicht im
     * Pool" allein liest sich wie „diese Karte gilt nicht" — und das wäre
     * falsch: gemessen prüft `findApplicableRateCard` den Pool NIE.
     */
    const de = seite.match(/'sc\.b\.cell\.notInPoolHint':\s*'([^']*)'/);
    assert.ok(de, "der deutsche Erklärungstext fehlt");
    assert.match(de[1], /bleibt gueltig|bleibt gültig/i,
      "der Hinweis sagt nicht, dass die Karte weiter gilt — dann liest er sich " +
      "als Entwertung bestehender Daten");
  });

  it("beide Schlüssel stehen in DE UND EN", () => {
    for (const k of ["sc.b.cell.notInPool", "sc.b.cell.notInPoolHint"]) {
      const treffer = seite.match(new RegExp("'" + k.replace(/\./g, "\\.") + "':", "g")) || [];
      assert.equal(treffer.length, 2,
        k + " steht " + treffer.length + "-mal im Markup, erwartet 2 (DE und EN) — " +
        "ein fehlender englischer Schlüssel fällt stumm auf Deutsch zurück");
    }
  });
});

/* ── Niemand baut die Regel ein drittes Mal nach ──────────────────────────── */

describe("U6.2a · die Pool-Regel steht an EINER Stelle", () => {
  it("kein Produktionspfad schreibt die Sperr-Bedingung von Hand", () => {
    /*
     * DER WÄCHTER DIESER WELLE — und sein Suchmuster ist zweimal korrigiert
     * worden, was genauso wichtig ist wie der Wächter selbst.
     *
     * ERSTER VERSUCH: „`vendor_pool` **und** `tier` **und** `status` im selben
     * Abfragetext". Das meldete `instantMatchService` und `reportingService` —
     * und beide waren **Fehlalarme**. Gemessen: der eine baut eine
     * **Stufen-Karte** (`SELECT vp.tier`, der Wert ist das Ergebnis), der andere
     * zählt Lieferanten für Kennzahlen (`GROUP BY vp.tier`). Keiner von beiden
     * fragt „steht er im Pool". Hätte ich sie einfach in die Ausnahmeliste
     * geschrieben, wäre aus einer Messung eine Ausrede geworden.
     *
     * ZWEITER VERSUCH, und das ist der Fingerabdruck der Regel: ein
     * Abfragetext, der `vendor_pool` liest **und** die Sperre selbst
     * hinschreibt (`tier <> 'BLOCKED'`). Die Sperre ist der unterscheidende
     * Teil — wer sie tippt, bildet die Zugehörigkeitsprüfung nach.
     *
     * DABEI HAT DAS SCHÄRFERE MUSTER EINEN DRITTEN FALL GEFUNDEN, und zwar
     * meinen eigenen aus derselben Welle: die Stufen-Teilabfrage in
     * `wirkungDesEntfernens` schrieb Status und Sperre von Hand — **ohne**
     * Gültigkeitsfenster. Das war keine Ausnahme, sondern eine dritte Fassung,
     * drei Stunden alt. Sie benutzt jetzt das Modul.
     *
     * WAS DIESER WÄCHTER NICHT KANN, offen gesagt: eine **verkürzte**
     * Nachbildung (nur `status = 'active'`, Sperre vergessen) sieht im Text wie
     * eine gewöhnliche Pool-Abfrage aus und ist nicht unterscheidbar. Genau
     * deshalb gibt es das Modul — der Wächter fängt die auffällige Hälfte, das
     * Modul verhindert beide.
     *
     * Gescannt wird der ganze KORPUS (services, routes, middleware, workers …)
     * mit dem Haus-Scanner, nicht nur `services/`: ein Riegel in einer Route
     * wäre derselbe Fehler. Der Scanner entfernt Kommentare — ohne das liest
     * eine Probe ihre eigene Begründung als Befund, viermal passiert in dieser
     * Woche.
     */
    /*
     * SEIT U6.7 IST DIESE LISTE LEER — und das ist das Ergebnis, nicht ein
     * Versehen. Sie trug genau einen Eintrag: `assignmentService`, dessen
     * Partner-Riegel die Sperre selbst hinschrieb und dabei `valid_from`
     * ausliess. Der Owner hat die Zusammenführung am 2026-10-01 freigegeben; der
     * Riegel benutzt jetzt `poolBedingungenSql`, und damit gibt es im ganzen
     * Korpus KEINE Stelle mehr, die die Sperre von Hand schreibt.
     *
     * Eine leere Ausnahmeliste ist der Zustand, auf den ein Waechter hinarbeitet.
     * Sie ist aber auch der Zustand, in dem er am leichtesten leer gruen wird —
     * dagegen steht die Notbremse in der naechsten Probe.
     */
    const BESTAND = new Map();

    const neue = [];
    for (const pfad of quellDateien()) {
      const rel = pfad.slice(API_DIR.length + 1).replace(/\\/g, "/");
      const trifft = jsLiterale(readFileSync(pfad, "utf8")).some(l =>
        /\bvendor_pool\b/.test(l.text) && /\btier\s*(<>|!=)\s*'BLOCKED'/i.test(l.text));
      if (!trifft) continue;
      /* Das Wahrheitsmodul selbst ist der Ort, an dem die Bedingung stehen DARF. */
      if (rel === "services/poolMitgliedschaftSql.js") continue;
      if (!BESTAND.has(rel)) neue.push(rel);
    }

    assert.deepEqual(neue, [],
      "NEUE Stelle(n) schreiben die Pool-Sperre von Hand: " + neue.join(", ") +
      "\nDie Regel steht in services/poolMitgliedschaftSql.js — poolBedingungenSql() " +
      "oder poolMitgliedschaftExistsSql() benutzen. Zwei Wahrheiten über einem Feld " +
      "sind die Fehlerklasse, die in dieser Welle dreimal gemessen wurde.");

    /* Gegenrichtung: der Bestand darf nicht verwaisen. Eine Ausnahme für eine
       Stelle, die es nicht mehr gibt, ist eine Ausrede, die mitwächst. */
    for (const rel of BESTAND.keys()) {
      const trifft = jsLiterale(readFileSync(join(API_DIR, rel), "utf8")).some(l =>
        /\bvendor_pool\b/.test(l.text) && /\btier\s*(<>|!=)\s*'BLOCKED'/i.test(l.text));
      assert.ok(trifft, rel + " steht im BESTAND, schreibt die Sperre aber nicht " +
        "mehr selbst — Ausnahme entfernen, sonst wächst die Liste mit Altlasten.");
    }
  });

  it("niemand fragt die PAAR-Frage an vendor_pool von Hand", () => {
    /*
     * DER ZWEITE SCHNITT, und er schließt die Lücke, die der erste offen lässt.
     *
     * Die gegenprüfende Sitzung hat zu Recht eingewandt: eine **verkürzte**
     * Nachbildung (nur `status = 'active'`, Sperre vergessen) trägt den
     * Fingerabdruck `tier <> 'BLOCKED'` nicht — und genau die wird der Fünfte
     * schreiben, weil er die Regel aus dem Kopf tippt statt sie zu importieren.
     * Ihr Vorschlag: **jeden** Zugriff auf `vendor_pool` außerhalb des Moduls rot
     * machen, die Ausnahmeliste sei „zwei Einträge".
     *
     * NACHGERECHNET, UND DIE ZAHL WAR ANDERS: **19 Dateien** lesen
     * `vendor_pool` (services, routes, config, utils). Die genannten zwei waren
     * die **Fehlalarme meines ersten Musters**, nicht die Gesamtmenge. Eine
     * 19-zeilige Ausnahmeliste ist nach unserem eigenen Maßstab eine Ausrede mit
     * Zahlen.
     *
     * Der Einwand stimmt trotzdem — also die richtige Invariante gesucht statt
     * die falsche Liste gepflegt: **die Regel ist eine Frage nach einem PAAR.**
     * „Steht DIESER Lieferant im Pool DIESES Kunden" heißt, beide Seiten in
     * Vergleichsstellung zu binden. Eine Zählung für Kennzahlen bindet nur eine
     * Seite; eine Stufen-Karte bindet die Gegenseite über eine Brücke. Gemessen:
     * dieser Schnitt trifft **4 Dateien** statt 19 — und eine verkürzte Kopie
     * kann ihm nicht entgehen, weil sie die Paar-Frage stellen MUSS, um die
     * Regel zu sein.
     */
    const BESTAND = new Map([
      ["services/vendorPoolService.js",
       "Der Dienst der Tabelle selbst: addToPool (ON CONFLICT), blockVendor und " +
       "die drei Stellen, die jetzt das Modul benutzen. Hier IST das Paar der " +
       "Gegenstand, nicht eine Nachbildung."],
      /* `services/assignmentService.js` STAND HIER und ist seit U6.7 heraus: der
         Partner-Riegel benutzt jetzt `poolBedingungenSql`, stellt die Paar-Frage
         also nicht mehr selbst. Dass diese Liste durch eine Zusammenführung
         KÜRZER wird und nicht länger, ist der Beleg, dass wirklich zusammengeführt
         und nicht bloss ergänzt wurde — so von der gegenprüfenden Sitzung
         verlangt. */
      ["services/supplierManagementService.js",
       "Sucht den Pooleintrag eines Paares, um ihn zu ÄNDERN " +
       "(status != 'removed'), nicht um Zugehörigkeit zu entscheiden. Ein " +
       "Schreibpfad braucht die Zeile, nicht die Regel."],
      ["services/reportingService.js",
       "Kennzahlen: verknüpft vendor_pool mit requisition_candidates über BEIDE " +
       "Seiten (r.org_id = vp.client_org_id, rc.supplier_org_id = " +
       "vp.supplier_org_id). Das ist ein JOIN zweier Mengen, keine Frage nach " +
       "einem bestimmten Paar — und er filtert bewusst nur auf status = 'active', " +
       "weil eine Kennzahl die Sperre mitzählen soll."]
    ]);

    const paarFrage = (t) => /\bvendor_pool\b/.test(t)
      && /\bclient_org_id\s*=/.test(t) && /\bsupplier_org_id\s*=/.test(t);

    const neue = [];
    for (const pfad of quellDateien()) {
      const rel = pfad.slice(API_DIR.length + 1).replace(/\\/g, "/");
      if (rel === "services/poolMitgliedschaftSql.js") continue;
      if (!jsLiterale(readFileSync(pfad, "utf8")).some(l => paarFrage(l.text))) continue;
      if (!BESTAND.has(rel)) neue.push(rel);
    }

    assert.deepEqual(neue, [],
      "NEUE Stelle(n) fragen von Hand, ob ein bestimmtes Paar im Pool steht: " +
      neue.join(", ") +
      "\nGenau das ist die Frage, die services/poolMitgliedschaftSql.js besitzt — " +
      "poolBedingungenSql() oder poolMitgliedschaftExistsSql() benutzen. " +
      "Eine eigene Fassung lässt beim nächsten Mal das Gültigkeitsfenster weg; " +
      "dreimal gemessen in dieser Welle.");

    for (const rel of BESTAND.keys()) {
      const trifft = jsLiterale(readFileSync(join(API_DIR, rel), "utf8")).some(l => paarFrage(l.text));
      assert.ok(trifft, rel + " steht im BESTAND, stellt die Paar-Frage aber nicht " +
        "mehr — Ausnahme entfernen.");
    }
  });

  it("das Modul ist wirklich erreicht — der Wächter oben wäre sonst leer grün", () => {
    /*
     * NOTBREMSE, und sie ist seit U6.7 WICHTIGER als vorher: die Ausnahmeliste
     * des Sperr-Wächters ist jetzt LEER. Fände `jsLiterale` gar nichts (falscher
     * Pfad, Scanner umgebaut, Korpus leer), wäre `neue` ebenfalls leer — und ein
     * Wächter, der nichts liest, meldet dasselbe wie einer, der alles in Ordnung
     * findet.
     *
     * DER ANKER MUSSTE ZWEIMAL WECHSELN, und der zweite Wechsel ist lehrreich.
     *
     * Vorher sicherte die Probe zu, dass `assignmentService` gefunden wird — die
     * Stelle ist in U6.7 verschwunden, die Probe wurde zu Recht rot. Mein erster
     * Ersatz war das Wahrheitsmodul selbst: „es enthält die Sperre, also muss der
     * Scan es finden." **Fand er nicht.** Grund: das Modul schreibt
     * `'${POOL_GESPERRTE_STUFE}'`, der Wert ist also **interpoliert**, und der
     * Haus-Scanner maskiert `${…}` ausdrücklich. Im gescannten Text steht nicht
     * `'BLOCKED'`, sondern ein Maskenzeichen.
     *
     * Das heisst zugleich: der `continue` für das Modul im Wächter oben war
     * **toter Code** — die Datei wurde nie gefunden, also auch nie übersprungen.
     * Er bleibt als Absicht stehen (schreibt jemand den Wert dort einmal
     * wörtlich, soll es keine Meldung geben), ist aber keine Zusicherung.
     *
     * JETZT EINE ECHTE POSITIVKONTROLLE: der Scan muss den Korpus überhaupt
     * lesen. Gesucht wird `vendor_pool` — 19 Dateien nennen es (gemessen). Findet
     * der Scan davon keine, ist die Maschinerie kaputt (falscher Pfad, leeres
     * Mount-Verzeichnis, Scanner umgebaut), und die leere Fundliste des Wächters
     * oben bedeutet nichts.
     */
    const liest = [];
    for (const pfad of quellDateien()) {
      const rel = pfad.slice(API_DIR.length + 1).replace(/\\/g, "/");
      if (jsLiterale(readFileSync(pfad, "utf8")).some(l => /\bvendor_pool\b/.test(l.text))) {
        liest.push(rel);
      }
    }
    assert.ok(liest.length >= 10,
      "der Scan findet nur " + liest.length + " Dateien, die `vendor_pool` nennen — " +
      "gemessen am 2026-10-01 waren es 19. So wenige deuten auf eine kaputte " +
      "Dateisuche, nicht auf ein aufgeräumtes Projekt. Damit ist auch die leere " +
      "Fundliste des Wächters oben bedeutungslos.");
    assert.ok(liest.includes("services/vendorPoolService.js"),
      "selbst der Dienst der Tabelle wird nicht gefunden — der Scan greift nicht. " +
      "Gefunden wurde: " + liest.slice(0, 5).join(", "));

    /* Und das Modul trägt die Sperre wirklich — direkt gelesen, nicht über den
       Scanner, weil der den interpolierten Wert nicht sehen kann. */
    const modul = readFileSync(join(API_DIR, "services", "poolMitgliedschaftSql.js"), "utf8");
    assert.match(modul, /POOL_GESPERRTE_STUFE\s*=\s*"BLOCKED"/,
      "das Wahrheitsmodul benennt die gesperrte Stufe nicht mehr");
    assert.match(modul, /\$\{alias\}\.tier <> '\$\{POOL_GESPERRTE_STUFE\}'/,
      "das Wahrheitsmodul baut die Sperre nicht mehr in die Bedingung ein — " +
      "dann ist die Regel weg, und der Wächter oben bewacht eine leere Zusage");
  });

  it("istLieferantImPool benutzt das Modul, statt den Text zu wiederholen", () => {
    const quelle = readFileSync(join(API, "services", "vendorPoolService.js"), "utf8");
    const funktion = quelle.match(/export async function istLieferantImPool[\s\S]*?\n\}/);
    assert.ok(funktion, "istLieferantImPool ist nicht auffindbar");
    assert.match(funktion[0], /poolBedingungenSql\(/,
      "istLieferantImPool schreibt die Bedingung wieder selbst — dann driftet sie " +
      "gegen die Liste der Konditionskarten");
    assert.doesNotMatch(funktion[0], /tier <> 'BLOCKED'/,
      "die Sperre steht als nackter Text in der Funktion statt im Modul");
  });
});
