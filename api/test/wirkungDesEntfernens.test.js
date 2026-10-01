/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DAS ENTFERNEN ZEIGT VORHER SEINE WIRKUNG (U6.2b)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Owner 2026-10-01: das Entfernen aus dem Lieferantenpool wird **nicht
 * blockiert** — es nennt vorher seine Folge. Hausregel: „Wirkungsvorschau vor
 * der Handlung", und zwar weil in diesem Haus **eine** Person handelt: ein
 * zweites Augenpaar gibt es nicht, also ist das eigentliche Risiko das
 * Versehen, nicht der Vorsatz (CLAUDE.md, „Das Team ist eine Person").
 *
 * WARUM DIESE DATEI MEHR PRÜFT ALS EINE ZAHL. Der Owner nannte als Beispiel
 * „3 Konditionskarten verweisen auf diesen Lieferanten". Ich habe gemessen, wer
 * die Poolzugehörigkeit überhaupt als Bedingung liest, und **vier** Stellen
 * gefunden. Eine Vorschau, die nur die erste nennt, ist nicht unvollständig,
 * sondern *genauer falsch als keine* — sie lässt den Handelnden glauben, er
 * kenne die Folge.
 *
 * UND SIE HÄLT EINEN ERSTEN ENTWURF FEST, DER GELOGEN HÄTTE. Mein erster Satz
 * lautete: „die Karten lassen sich nach dem Entfernen nicht mehr ändern."
 * Gemessen ist das falsch — `updateRateCard` prüft den Pool **nur**, wenn
 * `supplier_org_id` mitgeschickt wird, und `findApplicableRateCard` fragt ihn
 * nie. Bestehende Karten gelten weiter. Der Satz war plausibel, in sich
 * stimmig und falsch; genau die Sorte Aussage, die eine Vorschau wertlos macht.
 * Darum nagelt `bestehende_karten_gelten_weiter` ihn als Zusicherung fest.
 *
 * DIE GEFÄHRLICHSTE STELLE IST `bleibt_partner`. Sie bildet den Partner-Riegel
 * aus `assignmentService` nach, **ohne ihn aufzurufen** — er sitzt mitten in
 * einem Validierungspfad und bräuchte einen ganzen Einsatz-Datensatz. Eine
 * nachgebildete Regel ist eine zweite Wahrheit, und zwei Wahrheiten über einem
 * Feld sind die Fehlerklasse, mit der diese Woche angefangen hat. Deshalb steht
 * hier eine Probe, die den Riegel selbst festnagelt: kommt dort ein vierter
 * ODER-Zweig hinzu, wird **diese** Datei rot — nicht irgendwann die Vorschau
 * still falsch.
 *
 * Datenbankfrei: Form und Bindung. Das Verhalten an echten Zeilen prüft
 * `test/integration/wirkungDesEntfernens.flow.test.js`.
 *
 * Run: node --test --test-force-exit test/wirkungDesEntfernens.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { wirkungDesEntfernens } from "../services/vendorPoolService.js";

/* Pfade relativ zur TESTDATEI, nie zu process.cwd() — sonst skippt die Probe
   lautlos, je nachdem aus welchem Verzeichnis der Läufer gestartet wurde. */
const HIER = dirname(fileURLToPath(import.meta.url));
const API = join(HIER, "..");

const KUNDE = "aaaa1111-1111-4111-a111-111111111111";
const LIEFERANT = "bbbb2222-2222-4222-a222-222222222222";

/** Pool, der jede Abfrage mitschreibt und eine Zählzeile liefert. */
function spion(zeile = {}) {
  return {
    calls: [],
    async query(sql, params) {
      this.calls.push({ sql, params });
      return { rows: [zeile] };
    }
  };
}

describe("U6.2b · die Wirkung des Entfernens", () => {
  it("fragt in EINER Abfrage und bindet Kunde und Lieferant", async () => {
    const pool = spion({ konditionskarten: 3 });
    await wirkungDesEntfernens(pool, KUNDE, LIEFERANT);

    assert.equal(pool.calls.length, 1, "die Vorschau darf nicht N Abfragen kosten");
    /* Drei Parameter seit U6.2a: der Stichtag kam hinzu, weil die
       Stufen-Teilabfrage ihre Bedingung jetzt aus `poolBedingungenSql` bezieht
       und damit AUCH das Gültigkeitsfenster prüft — vorher stand dort eine
       verkürzte Fassung von Hand. Kunde und Lieferant bleiben $1 und $2. */
    assert.deepEqual(
      pool.calls[0].params.slice(0, 2), [KUNDE, LIEFERANT],
      "BINDUNGS-PROBE: Kunde an $1, Lieferant an $2, in dieser Reihenfolge"
    );
    assert.equal(pool.calls[0].params.length, 3, "erwartet Kunde, Lieferant, Stichtag");
    assert.match(String(pool.calls[0].params[2]), /^\d{4}-\d{2}-\d{2}$/,
      "der dritte Parameter ist kein Datum");
  });

  it("jede Teilabfrage bindet die Org SELBST an $1", async () => {
    /*
     * Das ist die sicherheitsrelevante Zusicherung dieser Datei, und sie ist
     * nicht Kosmetik: fünf Teilabfragen lesen fünf verschiedene Tabellen.
     * Fehlt in EINER davon die Org-Bindung, zählt die Vorschau fremde
     * Rahmenverträge mit — und verrät damit Geschäftszahlen eines anderen
     * Mandanten, obwohl der Aufrufer nur einen Poolknopf angesehen hat.
     *
     * Geprüft wird je Tabelle, nicht pauschal: eine Sammelzusicherung
     * („$1 kommt fünfmal vor") wäre an jeder Rückmutation vorbeigekommen, die
     * eine Bindung durch eine andere ersetzt.
     */
    const pool = spion({});
    await wirkungDesEntfernens(pool, KUNDE, LIEFERANT);
    const sql = pool.calls[0].sql;

    assert.match(sql, /FROM rate_cards rc\s+WHERE rc\.org_id = \$1/i,
      "rate_cards ist nicht an die Org gebunden");
    assert.match(sql, /FROM contracts c\s+WHERE c\.buyer_org_id = \$1/i,
      "contracts ist nicht an die Org gebunden (und buyer_org_id, nicht org_id)");
    /* Die Stufen-Teilabfrage zuerst HERAUSSCHNEIDEN und dann prüfen. Ein
       Muster über das ganze SQL wäre hier zweimal gefährlich: es fände ein
       "r.org_id = $1" auch dann, wenn es in einer ANDEREN Teilabfrage steht —
       und mein erster Versuch suchte "FROM requisitions? r", was auf
       "requisition_distribution_stages" ansprang und die Probe grundlos rot
       machte. Erst den Gegenstand, dann die Zusicherung. */
    const stufen = sql.match(/FROM requisition_distribution_stages ds[\s\S]*?AS offene_verteilungen/i);
    assert.ok(stufen, "die Teilabfrage auf die Verteilstufen fehlt");
    assert.match(stufen[0], /JOIN requisitions r ON r\.id = ds\.requisition_id/i,
      "die Stufen werden nicht über ihre Anforderung aufgelöst");
    assert.match(stufen[0], /WHERE r\.org_id = \$1/i,
      "die Verteilstufen sind nicht an die Org gebunden");
    /* assignments steht zweimal drin — beide Vorkommen müssen gebunden sein. */
    const assignmentTeile = sql.split(/FROM assignments a/i).slice(1);
    assert.equal(assignmentTeile.length, 2, "es sollen GENAU zwei assignments-Teilabfragen sein");
    for (const [i, teil] of assignmentTeile.entries()) {
      assert.match(teil, /WHERE a\.org_id = \$1/i,
        "die " + (i + 1) + ". assignments-Teilabfrage ist nicht an die Org gebunden");
      assert.match(teil, /a\.supplier_org_id = \$2/i,
        "die " + (i + 1) + ". assignments-Teilabfrage bindet den Lieferanten nicht");
    }
  });

  it("zählt nur Karten, die es noch zu ändern gibt", async () => {
    /* draft und active. Eine abgelaufene oder archivierte Karte ist keine
       Folge, die jemand abwägen müsste — sie zu nennen bläht die Zahl auf und
       macht die Vorschau unglaubwürdig. Die vier erlaubten Werte sind gemessen:
       draft, active, expired, archived (CHECK auf rate_cards.status). */
    const pool = spion({});
    await wirkungDesEntfernens(pool, KUNDE, LIEFERANT);
    const sql = pool.calls[0].sql;

    assert.match(sql, /rc\.status IN \('draft', 'active'\)/i);
    assert.doesNotMatch(sql, /rc\.status IN \([^)]*archived/i,
      "archivierte Karten gehören nicht in die Zahl");
  });

  it("laufende Einsätze sind planned, active und extended", async () => {
    /* Gemessen am CHECK: planned, active, completed, cancelled, extended.
       'completed' und 'cancelled' sind vorbei und keine Folge. 'extended' ist
       die Falle — es klingt nach einem Nebenzustand und ist ein laufender
       Einsatz. */
    const pool = spion({});
    await wirkungDesEntfernens(pool, KUNDE, LIEFERANT);
    const sql = pool.calls[0].sql;

    assert.match(sql, /a\.status IN \('planned', 'active', 'extended'\)/i);
    assert.doesNotMatch(sql, /a\.status IN \([^)]*completed/i,
      "ein abgeschlossener Einsatz ist keine Folge des Entfernens");
  });

  it("die Verteilstufen zählen nicht doppelt, wenn der Lieferant mehrfach im Pool steht", async () => {
    /*
     * Das ist kein hypothetischer Fall, sondern der GEMESSENE Normalfall: das
     * vorhandene UNIQUE lautet (client_org_id, supplier_org_id, category,
     * location_id, department_id) — ein Lieferant DARF mehrfach im Pool stehen,
     * je Kategorie, Standort und Abteilung. Ein JOIN auf vendor_pool hätte die
     * Stufen mit der Anzahl seiner Pooleinträge multipliziert: „4 offene
     * Verteilungen" bei einer einzigen. Deshalb eine IN-Teilabfrage.
     */
    const pool = spion({});
    await wirkungDesEntfernens(pool, KUNDE, LIEFERANT);
    const sql = pool.calls[0].sql;

    assert.match(sql, /ds\.pool_tier IN \(\s*SELECT vp2\.tier FROM vendor_pool vp2/i,
      "die Stufe wird nicht über eine IN-Teilabfrage aufgelöst");
    assert.doesNotMatch(sql, /JOIN vendor_pool/i,
      "ein JOIN auf vendor_pool multipliziert die Stufen");
    /*
     * Und die Teilabfrage benutzt dieselbe Pool-Definition wie U6.2 — seit
     * U6.2a aus `poolBedingungenSql`, also GANZ, einschliesslich des
     * Gültigkeitsfensters. Vorher stand hier eine verkürzte Fassung von Hand
     * (nur Status und Sperre); gefunden hat sie der Wächter in
     * `test/altkarteOhnePool.test.js`, drei Stunden nachdem ich sie geschrieben
     * hatte. Deshalb wird jetzt auf ALLE vier Teile geprüft.
     */
    assert.match(sql, /vp2\.status = 'active'/i,
      "die Stufen-Teilabfrage prüft den Status nicht");
    assert.match(sql, /vp2\.tier <> 'BLOCKED'/i,
      "die Stufen-Teilabfrage prüft die Sperre nicht");
    assert.match(sql, /vp2\.valid_from IS NULL OR vp2\.valid_from <= \$3::date/i,
      "die Stufen-Teilabfrage prüft den Fensterbeginn nicht — eine noch nicht " +
      "gültige Zugehörigkeit würde eine Verteilstufe auflösen");
    assert.match(sql, /vp2\.valid_until IS NULL OR vp2\.valid_until >= \$3::date/i,
      "die Stufen-Teilabfrage prüft das Fensterende nicht");
  });

  it("bleibt_partner wird aus Rahmenvertrag ODER Abschluss-Einsatz abgeleitet", async () => {
    /* Verhaltensprobe über alle vier Kombinationen — eine Zählprobe auf den
       Quelltext hätte ein vertauschtes && nicht gefangen. */
    const faelle = [
      { rahmenvertraege: 0, einsaetze_aus_abschluss: 0, erwartet: false },
      { rahmenvertraege: 1, einsaetze_aus_abschluss: 0, erwartet: true },
      { rahmenvertraege: 0, einsaetze_aus_abschluss: 1, erwartet: true },
      { rahmenvertraege: 2, einsaetze_aus_abschluss: 3, erwartet: true }
    ];
    for (const f of faelle) {
      const ergebnis = await wirkungDesEntfernens(spion(f), KUNDE, LIEFERANT);
      assert.equal(
        ergebnis.bleibt_partner, f.erwartet,
        "bei " + f.rahmenvertraege + " Verträgen und " + f.einsaetze_aus_abschluss +
        " Abschluss-Einsätzen wurde bleibt_partner falsch abgeleitet"
      );
    }
  });

  it("bestehende Karten gelten weiter — der erste Entwurf behauptete das Gegenteil", async () => {
    const ergebnis = await wirkungDesEntfernens(spion({ konditionskarten: 3 }), KUNDE, LIEFERANT);
    assert.equal(ergebnis.bestehende_karten_gelten_weiter, true);
    assert.equal(ergebnis.konditionskarten, 3);
  });

  it("ohne Kunde oder Lieferant wird NICHT abgefragt", async () => {
    const a = spion();
    assert.equal(await wirkungDesEntfernens(a, null, LIEFERANT), null);
    const b = spion();
    assert.equal(await wirkungDesEntfernens(b, KUNDE, null), null);
    assert.equal(a.calls.length + b.calls.length, 0,
      "eine Vorschau ohne Gegenstand darf die Datenbank nicht anfassen");
  });

  it("jedes Feld ist eine Zahl, auch wenn die Datenbank nichts liefert", async () => {
    /* COUNT(*)::int kommt als Zahl, aber ein leeres rows[] darf nicht undefined
       durchlassen: das Frontend rechnet damit, und „undefined Konditionskarten"
       wäre eine Vorschau, die Vertrauen kostet statt es zu geben. */
    const leer = { calls: [], async query() { return { rows: [] }; } };
    const ergebnis = await wirkungDesEntfernens(leer, KUNDE, LIEFERANT);
    for (const feld of ["konditionskarten", "rahmenvertraege", "einsaetze_aus_abschluss",
      "laufende_einsaetze", "offene_verteilungen"]) {
      assert.equal(typeof ergebnis[feld], "number", feld + " ist keine Zahl");
      assert.equal(ergebnis[feld], 0, feld + " sollte bei leerer Antwort 0 sein");
    }
    assert.equal(ergebnis.bleibt_partner, false);
  });
});

describe("U6.2b · die Kopplung an den Partner-Riegel", () => {
  it("der Riegel in assignmentService hat GENAU die drei Zweige, die bleibt_partner nachbildet", () => {
    /*
     * DIE EIGENTLICHE SCHWACHSTELLE DIESER WELLE, als Probe.
     *
     * `bleibt_partner` ist eine Nachbildung: sie sagt „nach dem Entfernen
     * bleibst du Partner, weil ein Rahmenvertrag oder ein Abschluss-Einsatz da
     * ist". Das stimmt nur, solange der echte Riegel genau drei ODER-Zweige hat
     * — Pool, Vertrag, Abschluss-Einsatz. Kommt ein vierter hinzu (etwa „oder
     * eine angenommene Bewerbung"), nennt die Vorschau weiterhin eine Sperre,
     * die nicht eintritt. Das wäre eine Vorschau, die vom Handeln abhält, ohne
     * Grund — der Vertrauensschaden ist derselbe wie beim Verschweigen.
     *
     * Geprüft wird die ANZAHL der EXISTS-Zweige und jeder einzelne beim Namen.
     * Eine Teilzeichenketten-Suche über die ganze Datei wäre hier nutzlos: sie
     * könnte einen ENTFERNTEN Zweig melden, aber niemals einen HINZUGEFÜGTEN.
     */
    const quelle = readFileSync(join(API, "services", "assignmentService.js"), "utf8");
    const riegel = quelle.match(/SELECT \(\s*EXISTS[\s\S]*?\) AS partner/i);
    assert.ok(riegel, "der Partner-Riegel ist nicht mehr an seinem Platz — " +
      "entweder umgezogen oder umgebaut; bleibt_partner muss dann neu belegt werden");

    const zweige = riegel[0].match(/EXISTS \(SELECT 1 FROM (\w+)/gi) || [];
    assert.equal(zweige.length, 3,
      "der Partner-Riegel hat jetzt " + zweige.length + " Zweige statt 3. " +
      "wirkungDesEntfernens.bleibt_partner bildet ihn nach und ist damit falsch.");

    const tabellen = zweige.map(z => z.replace(/.*FROM /i, "").toLowerCase());
    assert.deepEqual(tabellen.sort(), ["assignments", "contracts", "vendor_pool"],
      "der Riegel liest andere Tabellen als die Vorschau nachbildet");

    /* und die beiden Zweige, die das Entfernen ÜBERLEBEN, in ihrer Form: */
    assert.match(riegel[0], /FROM contracts c\s+WHERE c\.buyer_org_id = \$1[\s\S]*?c\.status = 'active'/i,
      "der Vertrags-Zweig prüft nicht mehr auf einen AKTIVEN Vertrag des Käufers");
    assert.match(riegel[0], /FROM assignments a\s+WHERE a\.org_id = \$1[\s\S]*?a\.offer_id IS NOT NULL/i,
      "der Abschluss-Zweig prüft nicht mehr auf offer_id IS NOT NULL");
  });

  it("der Pool-Zweig des Riegels und die Pool-Definition aus U6.2 weichen VORSÄTZLICH ab", () => {
    /*
     * BEFUND, FESTGEHALTEN STATT STILL REPARIERT (Owner-Vorlage, nicht autonom).
     *
     * Gemessen: `istLieferantImPool` (U6.2) prüft `valid_from <= heute` UND
     * `valid_until >= heute`. Der Partner-Riegel in `assignmentService` prüft
     * **nur** `valid_until` — ein Pooleintrag mit einem valid_from in der
     * ZUKUNFT gilt dort schon heute als Partnerschaft.
     *
     * Das ist eine zweite Wahrheit über demselben Feld, also genau die
     * Fehlerklasse, die diese Woche geliefert hat. Ich habe sie NICHT
     * angeglichen: der Riegel entscheidet, wem ein Einsatz gegeben werden darf.
     * Ihn zu verengen ist die sichere Richtung, kostet aber eine 403 für jede
     * Firma, die einen Pooleintrag vordatiert hat — eine spürbare
     * Verhaltensänderung an einem Sicherheitsriegel, und die gehört dem Owner.
     *
     * Diese Probe hält den IST-Zustand fest, damit er nicht unbemerkt in die
     * eine oder andere Richtung wandert. Wird sie rot, ist die Frage
     * entschieden worden — dann gehört die Entscheidung hierher dokumentiert.
     */
    const quelle = readFileSync(join(API, "services", "assignmentService.js"), "utf8");
    const riegel = quelle.match(/SELECT \(\s*EXISTS[\s\S]*?\) AS partner/i);
    assert.ok(riegel, "der Partner-Riegel ist nicht mehr an seinem Platz");
    const poolZweig = riegel[0].match(/EXISTS \(SELECT 1 FROM vendor_pool vp[\s\S]*?\)\)/i);
    assert.ok(poolZweig, "der Pool-Zweig des Riegels ist nicht auffindbar");

    assert.match(poolZweig[0], /vp\.valid_until IS NULL OR vp\.valid_until >= CURRENT_DATE/i,
      "der Pool-Zweig prüft valid_until nicht mehr");
    assert.doesNotMatch(poolZweig[0], /valid_from/i,
      "der Pool-Zweig prüft jetzt AUCH valid_from — die Abweichung zu U6.2 ist also " +
      "geschlossen worden. Gut, aber: dann diese Probe und den Befund in " +
      "docs/features/U_STANDORTE_ROLLEN_SICHTBARKEIT.md nachziehen.");
  });
});
