/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIE WIRKUNGSVORSCHAU AN ECHTEN ZEILEN (U6.2b, DB-gebunden)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Die datenbankfreie Probe (`test/wirkungDesEntfernens.test.js`) nagelt Form
 * und Bindung der Abfrage fest. Was sie grundsätzlich nicht kann: belegen, dass
 * Postgres daraus die richtigen Zahlen rechnet. Ein Muster-Pool führt kein SQL
 * aus — ein Tippfehler in einem Spaltennamen, eine Teilabfrage, die an der
 * falschen Spalte hängt, ein `buyer_org_id`, das in Wahrheit `org_id` heißt:
 * alles das kommt dort grün durch.
 *
 * JEDE GRUPPE HOLT SICH IHREN GEGENSTAND SELBST — und das ist hier kein
 * Feinschliff, sondern der Grund, warum diese Datei so aussieht:
 *
 *   `requisition_distribution_stages` hat **0 Zeilen** (gemessen 2026-10-01).
 *   Eine Probe, die zusichert „nach dem Entfernen erreicht ihn keine
 *   Verteilstufe mehr", wäre damit wahr, ohne irgendetwas zu beweisen —
 *   wahr, weil es nie eine Stufe gab. Genau diese Sorte leer grüner Probe hat
 *   in dieser Woche schon zweimal einen toten Riegel gedeckt. Gruppe C legt
 *   ihre Stufe deshalb SELBST an.
 *
 * ALLES LÄUFT IN EINER TRANSAKTION UND WIRD ZURÜCKGEROLLT. Geschrieben wird
 * nur per UPDATE auf bestehende Zeilen bzw. per INSERT in `vendor_pool` und
 * `requisition_distribution_stages` — niemals werden Pflichtfelder geraten.
 * Zwei Anläufe in U6.1 sind genau daran gescheitert und haben VOR dem
 * eigentlichen Gegenstand abgebrochen.
 *
 * KEIN `org_id` WIRD UMGESCHRIEBEN. Seit Migration 226 hängt an
 * `assignments(location_id, org_id)` ein zusammengesetzter Fremdschlüssel; eine
 * Zeile in eine andere Org zu schieben verletzt ihn, und die Probe wäre an der
 * eigenen Grenze gescheitert statt am Gegenstand. Die Org-Grenze wird darum
 * LESEND geprüft: dieselbe Zeile, zwei verschiedene fragende Orgs.
 *
 * Run: node --test --test-force-exit test/integration/wirkungDesEntfernens.flow.test.js
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { wirkungDesEntfernens } from "../../services/vendorPoolService.js";
import { POOL_AKTIVER_STATUS, POOL_GESPERRTE_STUFE } from "../../services/poolMitgliedschaftSql.js";

const hasDb = !!(process.env.DATABASE_URL || (process.env.DB_HOST && process.env.POSTGRES_PASSWORD));
const createPool = () => new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT) || 5432,
        user: process.env.POSTGRES_USER || process.env.DB_USER,
        password: process.env.POSTGRES_PASSWORD,
        database: process.env.POSTGRES_DB || process.env.DB_NAME
      }
);

/* Eine Zusicherung, die IMMER läuft — sonst liefert die Datei ohne Datenbank
   `tests 0`, und das sieht im Tor aus wie Erfolg. */
describe("U6.2b — die Datei trägt auch ohne Datenbank eine Zahl", () => {
  it("die Vorschau ist importierbar", () => {
    assert.equal(typeof wirkungDesEntfernens, "function");
  });
});

describe("U6.2b — die Vorschau an echten Zeilen", { skip: !hasDb && "keine Datenbank (DATABASE_URL / DB_HOST fehlt) — läuft im Container und in CI" }, () => {
  let pool;
  let client;
  /* Gruppe A/B: ein Paar, das in `assignments` WIRKLICH vorkommt. */
  let kunde, lieferant, einsatzId;
  /* Eine dritte Org, die mit beidem nichts zu tun hat. */
  let fremd;

  before(async () => {
    if (!hasDb) return;
    pool = createPool();
    client = await pool.connect();
    const { rows } = await client.query(
      `SELECT a.id, a.org_id, a.supplier_org_id
         FROM assignments a
        WHERE a.supplier_org_id IS NOT NULL AND a.org_id IS NOT NULL
        ORDER BY a.id
        LIMIT 1`
    );
    if (rows[0]) {
      einsatzId = rows[0].id;
      kunde = rows[0].org_id;
      lieferant = rows[0].supplier_org_id;
      const { rows: f } = await client.query(
        "SELECT id FROM organizations WHERE id <> $1 AND id <> $2 ORDER BY id LIMIT 1",
        [kunde, lieferant]
      );
      fremd = f[0]?.id || null;
    }
  });

  after(async () => {
    if (client) client.release();
    if (pool) await pool.end();
  });

  it("der Gegenstand ist da — sonst beweist diese Datei nichts", () => {
    /* Diese Probe ist die Notbremse. Ohne sie wären alle folgenden „0 === 0"
       und die Datei wäre grün, obwohl sie leer gelaufen ist. */
    assert.ok(einsatzId, "kein Einsatz mit Org UND Lieferant gefunden — " +
      "die folgenden Proben könnten leer grün werden");
    assert.ok(fremd, "keine dritte Organisation gefunden — die Org-Grenze wäre nicht prüfbar");
    assert.notEqual(kunde, lieferant, "Kunde und Lieferant müssen verschieden sein");
  });

  it("A · laufende Einsätze werden gezählt, abgeschlossene nicht", async () => {
    /*
     * Die Zusicherung, die ein Muster-Pool nie geben kann: dass Postgres den
     * Status-Filter wirklich anwendet. Gemessen wird als DIFFERENZ an
     * derselben Zeile — ein absoluter Wert hinge an allen anderen Einsätzen
     * dieses Paares und wäre je nach Datenstand eine andere Zahl.
     */
    await client.query("BEGIN");
    try {
      await client.query("UPDATE assignments SET status = 'active' WHERE id = $1", [einsatzId]);
      const mit = await wirkungDesEntfernens(client, kunde, lieferant);

      await client.query("UPDATE assignments SET status = 'completed' WHERE id = $1", [einsatzId]);
      const ohne = await wirkungDesEntfernens(client, kunde, lieferant);

      assert.equal(mit.laufende_einsaetze, ohne.laufende_einsaetze + 1,
        "der Status-Filter auf laufende Einsätze greift nicht");

      /* und 'extended' zählt wie 'active' — die Falle, die nach Nebenzustand klingt */
      await client.query("UPDATE assignments SET status = 'extended' WHERE id = $1", [einsatzId]);
      const verlaengert = await wirkungDesEntfernens(client, kunde, lieferant);
      assert.equal(verlaengert.laufende_einsaetze, mit.laufende_einsaetze,
        "ein verlängerter Einsatz läuft und muss mitgezählt werden");
    } finally {
      await client.query("ROLLBACK");
    }
  });

  it("A · die Org-Grenze: dieselbe Zeile, eine fremde fragende Org, Antwort 0", async () => {
    /*
     * DIE sicherheitsrelevante Probe dieser Datei. Die Vorschau nennt Zahlen zu
     * Rahmenverträgen und laufenden Einsätzen. Fehlte in einer Teilabfrage die
     * Org-Bindung, bekäme eine fremde Firma Geschäftszahlen zu sehen, nur weil
     * sie einen Poolknopf angesehen hat.
     *
     * Geprüft wird in BEIDE Richtungen — ein „fremd sieht 0" allein wäre auch
     * wahr, wenn die Abfrage grundsätzlich nichts findet.
     */
    await client.query("BEGIN");
    try {
      await client.query("UPDATE assignments SET status = 'active' WHERE id = $1", [einsatzId]);
      const eigen = await wirkungDesEntfernens(client, kunde, lieferant);
      const fremde = await wirkungDesEntfernens(client, fremd, lieferant);

      assert.ok(eigen.laufende_einsaetze >= 1,
        "die eigene Org sieht ihren eigenen laufenden Einsatz nicht — " +
        "ohne diese Hälfte wäre die 0 unten bedeutungslos");
      assert.equal(fremde.laufende_einsaetze, 0,
        "ORG-GRENZE VERLETZT: eine fremde Org sieht die Einsätze dieses Kunden");
    } finally {
      await client.query("ROLLBACK");
    }
  });

  it("B · Konditionskarten werden gezählt — genau die des eigenen Kunden", async () => {
    await client.query("BEGIN");
    try {
      /* Alle Karten aus dem Weg räumen, damit die Zahl EXAKT prüfbar ist und
         nicht „mindestens 1". Danach genau eine auf das Paar zeigen lassen. */
      await client.query("UPDATE rate_cards SET status = 'archived'");
      const { rows: karte } = await client.query("SELECT id FROM rate_cards ORDER BY id LIMIT 1");
      assert.ok(karte[0], "keine Konditionskarte in den Daten — Gruppe B wäre leer grün");

      await client.query(
        `UPDATE rate_cards SET org_id = $2, supplier_org_id = $3, status = 'active'
          WHERE id = $1`,
        [karte[0].id, kunde, lieferant]
      );

      const eigen = await wirkungDesEntfernens(client, kunde, lieferant);
      assert.equal(eigen.konditionskarten, 1, "die eigene Karte wird nicht gezählt");

      const fremde = await wirkungDesEntfernens(client, fremd, lieferant);
      assert.equal(fremde.konditionskarten, 0,
        "ORG-GRENZE VERLETZT: eine fremde Org sieht die Konditionskarten dieses Kunden");

      /* archiviert zählt nicht — der Status-Filter, an echtem SQL */
      await client.query("UPDATE rate_cards SET status = 'archived' WHERE id = $1", [karte[0].id]);
      const archiviert = await wirkungDesEntfernens(client, kunde, lieferant);
      assert.equal(archiviert.konditionskarten, 0,
        "eine archivierte Karte wird mitgezählt und bläht die Vorschau auf");
    } finally {
      await client.query("ROLLBACK");
    }
  });

  it("B · bleibt_partner folgt einem AKTIVEN Rahmenvertrag", async () => {
    await client.query("BEGIN");
    try {
      await client.query("UPDATE contracts SET status = 'draft'");
      const { rows: v } = await client.query("SELECT id FROM contracts ORDER BY id LIMIT 1");
      assert.ok(v[0], "kein Vertrag in den Daten — diese Probe wäre leer grün");

      await client.query(
        `UPDATE contracts SET buyer_org_id = $2, supplier_org_id = $3, status = 'active'
          WHERE id = $1`,
        [v[0].id, kunde, lieferant]
      );
      const aktiv = await wirkungDesEntfernens(client, kunde, lieferant);
      assert.equal(aktiv.rahmenvertraege, 1, "der aktive Rahmenvertrag wird nicht gezählt");
      assert.equal(aktiv.bleibt_partner, true,
        "mit aktivem Rahmenvertrag bleibt die Partnerschaft bestehen");

      await client.query("UPDATE contracts SET status = 'terminated' WHERE id = $1", [v[0].id]);
      const beendet = await wirkungDesEntfernens(client, kunde, lieferant);
      assert.equal(beendet.rahmenvertraege, 0, "ein beendeter Vertrag zählt weiter mit");
      /* bleibt_partner darf jetzt nur noch an Abschluss-Einsätzen hängen — das
         ist die Invariante, nicht ein fester Wert: dieses Paar kann durchaus
         einen Einsatz mit offer_id haben. */
      assert.equal(beendet.bleibt_partner, beendet.einsaetze_aus_abschluss > 0,
        "bleibt_partner hängt an etwas anderem als Vertrag ODER Abschluss-Einsatz");

      const fremde = await wirkungDesEntfernens(client, fremd, lieferant);
      assert.equal(fremde.rahmenvertraege, 0,
        "ORG-GRENZE VERLETZT: eine fremde Org sieht die Rahmenverträge dieses Kunden");
    } finally {
      await client.query("ROLLBACK");
    }
  });

  it("C · eine laufende Verteilstufe auf seine Stufe wird gezählt", async () => {
    /*
     * GEGENSTAND SELBST HERGESTELLT: `requisition_distribution_stages` hat 0
     * Zeilen. Ohne diesen INSERT wäre jede Zusicherung über Verteilstufen
     * wahr und wertlos.
     *
     * Die Anforderung wird NICHT umgeschrieben — der Kunde dieser Gruppe ist
     * die Org der Anforderung, die hier gefunden wird. Damit bleibt
     * Migration 226 unangetastet.
     */
    await client.query("BEGIN");
    try {
      const { rows: anf } = await client.query(
        "SELECT id, org_id FROM requisitions WHERE org_id IS NOT NULL ORDER BY id LIMIT 1"
      );
      assert.ok(anf[0], "keine Anforderung in den Daten — Gruppe C wäre leer grün");
      const kundeC = anf[0].org_id;

      /* Ein Lieferant, der nicht der Kunde selbst ist. */
      const { rows: l } = await client.query(
        "SELECT id FROM organizations WHERE id <> $1 ORDER BY id LIMIT 1", [kundeC]
      );
      const lieferantC = l[0].id;

      await client.query(
        `INSERT INTO vendor_pool (client_org_id, supplier_org_id, status, tier)
         VALUES ($1, $2, 'active', 'PREFERRED')`,
        [kundeC, lieferantC]
      );
      await client.query(
        `INSERT INTO requisition_distribution_stages
           (requisition_id, stage_number, pool_tier, status)
         VALUES ($1, 1, 'PREFERRED', 'active')`,
        [anf[0].id]
      );

      const treffer = await wirkungDesEntfernens(client, kundeC, lieferantC);
      assert.equal(treffer.offene_verteilungen, 1,
        "die laufende Verteilstufe auf seine Stufe wird nicht gezählt");

      /* Gegenprobe EINS: eine andere Stufe erreicht ihn nicht. */
      await client.query("UPDATE requisition_distribution_stages SET pool_tier = 'TRIAL'");
      const andereStufe = await wirkungDesEntfernens(client, kundeC, lieferantC);
      assert.equal(andereStufe.offene_verteilungen, 0,
        "eine Stufe auf eine ANDERE Poolstufe wird fälschlich gezählt");

      /* Gegenprobe ZWEI: eine abgeschlossene Stufe ist keine Folge. */
      await client.query(
        "UPDATE requisition_distribution_stages SET pool_tier = 'PREFERRED', status = 'completed'"
      );
      const fertig = await wirkungDesEntfernens(client, kundeC, lieferantC);
      assert.equal(fertig.offene_verteilungen, 0,
        "eine abgeschlossene Verteilstufe wird mitgezählt");
    } finally {
      await client.query("ROLLBACK");
    }
  });

  it("jeder erlaubte status- und tier-Wert ist von der Regel ERFASST", async () => {
    /*
     * VORSCHLAG DER GEGENPRÜFENDEN SITZUNG, und er schließt eine Lücke, die
     * keine Probe über dem heutigen Code sehen kann.
     *
     * `vendor_pool` hat zwei CHECK-Listen. Die Pool-Regel nennt zwei Werte
     * daraus: `status = 'active'` und `tier <> 'BLOCKED'`. Kommt später ein
     * dritter Status hinzu (etwa `paused`), fällt er **stillschweigend** in
     * „nicht im Pool" — eine Entscheidung, die niemand getroffen hat, und zwar
     * in beide Richtungen: ein pausierter Lieferant bekäme keine neue
     * Konditionskarte mehr, ohne dass jemand das so wollte.
     *
     * Diese Probe vergleicht die Mengen und verlangt, dass jeder Wert
     * **benannt** ist. Wer einen Status hinzufügt, muss also sagen, auf welcher
     * Seite er steht. Das ist der Unterschied zwischen einer Regel und einem
     * Zufall.
     *
     * DB-GEBUNDEN, weil die Momentaufnahme (`test/fixtures/schema.json`) die
     * CHECK-Listen heute nicht führt — sie trägt Spalten, NOT-NULL, Fremd-
     * schlüssel, Sichten, Funktionen und Enums. Die Listen dort aufzunehmen
     * wäre der bessere Weg und ist als Posten benannt; bis dahin fragt diese
     * Probe die laufende Datenbank, und sie läuft damit im Abbild-Tor.
     */
    const { rows } = await client.query(
      `SELECT conname, pg_get_constraintdef(oid) AS regel
         FROM pg_constraint
        WHERE conrelid = 'vendor_pool'::regclass AND contype = 'c'`
    );
    const werte = (name) => {
      const r = rows.find(z => new RegExp("\\b" + name + "\\b").test(z.regel));
      if (!r) return null;
      return [...r.regel.matchAll(/'([^']+)'::text/g)].map(m => m[1]).sort();
    };

    /* Was die Regel kennt — wörtlich aus dem Wahrheitsmodul, nicht nachgetippt. */
    const STATUS_IM_POOL = [POOL_AKTIVER_STATUS];
    const STATUS_NICHT_IM_POOL = ["suspended", "removed"];
    const STUFEN_IM_POOL = ["PREFERRED", "SECONDARY", "TRIAL", "RESTRICTED"];
    const STUFEN_NICHT_IM_POOL = [POOL_GESPERRTE_STUFE];

    const status = werte("status");
    assert.ok(status, "die CHECK-Liste für status ist nicht auffindbar");
    assert.deepEqual(
      status, [...STATUS_IM_POOL, ...STATUS_NICHT_IM_POOL].sort(),
      "die Datenbank erlaubt status-Werte, die die Pool-Regel nicht benennt: " +
      JSON.stringify(status) + ". Ein unbenannter Wert fällt still in " +
      "'nicht im Pool' — sag, auf welcher Seite er steht, in " +
      "services/poolMitgliedschaftSql.js und hier."
    );

    const tier = werte("tier");
    assert.ok(tier, "die CHECK-Liste für tier ist nicht auffindbar");
    assert.deepEqual(
      tier, [...STUFEN_IM_POOL, ...STUFEN_NICHT_IM_POOL].sort(),
      "die Datenbank erlaubt tier-Werte, die die Pool-Regel nicht benennt: " +
      JSON.stringify(tier) + ". Eine neue Stufe gilt sonst automatisch als " +
      "'im Pool' — auch wenn sie als Sperre gedacht war."
    );

    /* Und die beiden Mengen dürfen sich nicht überschneiden: ein Wert, der auf
       beiden Listen steht, macht die Zusicherung oben wahr und bedeutungslos. */
    for (const w of STATUS_IM_POOL) {
      assert.ok(!STATUS_NICHT_IM_POOL.includes(w), "status '" + w + "' steht auf beiden Listen");
    }
    for (const w of STUFEN_IM_POOL) {
      assert.ok(!STUFEN_NICHT_IM_POOL.includes(w), "tier '" + w + "' steht auf beiden Listen");
    }
  });

  it("C · ein gesperrter Pooleintrag löst keine Stufe auf", async () => {
    /*
     * Dieselbe Pool-Definition wie U6.2: tier <> 'BLOCKED'. Ein gesperrter
     * Lieferant STEHT im Pool, aber keine Verteilung erreicht ihn — also darf
     * das Entfernen auch keine Verteilung als Folge nennen.
     *
     * ERSTER AUFBAU WAR UNMÖGLICH, und das ist ein Befund: ich hatte die Stufe
     * selbst auf pool_tier 'BLOCKED' gesetzt, und Postgres hat sie abgewiesen —
     * `requisition_distribution_stages_pool_tier_check` erlaubt das nicht. Eine
     * Verteilstufe KANN gar nicht auf Gesperrte zielen. Die Probe baut deshalb
     * den Fall, der wirklich vorkommt: eine Stufe mit erlaubter Stufe
     * ('PREFERRED'), und der Lieferant steht dort ausschliesslich GESPERRT im
     * Pool. Zählt die Vorschau diese Stufe, hat sie `tier <> 'BLOCKED'`
     * vergessen.
     *
     * Hätte ich den Fehler als „Probe geht nicht" abgetan und die Zusicherung
     * gestrichen, wäre der einzige Nachweis für die Sperr-Bedingung in der
     * Stufen-Teilabfrage verschwunden — und zwar mit einem plausiblen Grund.
     */
    await client.query("BEGIN");
    try {
      const { rows: anf } = await client.query(
        "SELECT id, org_id FROM requisitions WHERE org_id IS NOT NULL ORDER BY id LIMIT 1"
      );
      assert.ok(anf[0], "keine Anforderung in den Daten");
      const kundeC = anf[0].org_id;
      const { rows: l } = await client.query(
        "SELECT id FROM organizations WHERE id <> $1 ORDER BY id LIMIT 1", [kundeC]
      );
      const lieferantC = l[0].id;

      await client.query(
        `INSERT INTO vendor_pool (client_org_id, supplier_org_id, status, tier)
         VALUES ($1, $2, 'active', 'BLOCKED')`,
        [kundeC, lieferantC]
      );
      await client.query(
        `INSERT INTO requisition_distribution_stages
           (requisition_id, stage_number, pool_tier, status)
         VALUES ($1, 1, 'PREFERRED', 'active')`,
        [anf[0].id]
      );

      const ergebnis = await wirkungDesEntfernens(client, kundeC, lieferantC);
      assert.equal(ergebnis.offene_verteilungen, 0,
        "ein gesperrter Pooleintrag löst eine Verteilstufe auf — " +
        "die Vorschau weicht damit von der Pool-Definition aus U6.2 ab");

      /* GEGENPROBE, ohne die die 0 oben auch von einem kaputten Aufbau käme:
         dieselbe Stufe, derselbe Lieferant, nur die Sperre weg -> 1. */
      await client.query(
        "UPDATE vendor_pool SET tier = 'PREFERRED' WHERE client_org_id = $1 AND supplier_org_id = $2",
        [kundeC, lieferantC]
      );
      const entsperrt = await wirkungDesEntfernens(client, kundeC, lieferantC);
      assert.equal(entsperrt.offene_verteilungen, 1,
        "ohne Sperre müsste dieselbe Stufe gezählt werden — die 0 oben belegt " +
        "sonst nur einen fehlerhaften Aufbau, nicht die Sperr-Bedingung");
    } finally {
      await client.query("ROLLBACK");
    }
  });
});
