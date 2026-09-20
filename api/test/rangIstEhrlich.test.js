/**
 * ═══════════════════════════════════════════════════════════════════════════
 * N3.4 / N3.5 / N3.6 — DER RANG IST EHRLICH
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Drei Befunde, an derselben Stelle gemessen (2026-09-19):
 *
 * 1. DER RANG GALT NUR FUER DIE SEITE. `browseFeed` holte 25 Zeilen nach
 *    DATUM und rangierte DANACH — also innerhalb einer Zufallsauswahl. Der
 *    beste Treffer des Marktes stand auf Seite 3 und kam dort nie weg, weil er
 *    nur gegen die anderen 24 Zeilen von Seite 3 antrat.
 *
 * 2. BEZAHLUNG SORTIERTE MIT. Tarif (12), Platzierung (8) und
 *    Premium-Anzeige (15) wurden mit Passung und Reputation in EINE Summe
 *    geworfen: bis zu 35 kaufbare Punkte, genug fuer eine deutlich schlechtere
 *    Passung. Regel O-L1 sagt das Gegenteil — bezahlte Hebung bricht
 *    hoechstens Gleichstand und ist gekennzeichnet.
 *
 * 3. DIE PROFIL-RANGLISTE EXISTIERTE NICHT. `runDailySnapshotBatch` und
 *    `updateRankPositions` hatten KEINEN Aufrufer. "Ihre Position: #N" im
 *    Anbieterprofil war dauerhaft leer — fuer eine Faehigkeit, die ab PRO
 *    verkauft wird.
 *
 * WARUM DER MUSTER-POOL HIER LIMIT UND OFFSET BEACHTET: ohne das waere die
 * Fenster-Probe leer gruen. Ein Pool, der jede Abfrage mit allen Zeilen
 * beantwortet, liefert auch dem ALTEN Code alle 60 Eintraege — und dann steht
 * der beste Treffer auch ohne Fenster oben. Die Probe muss die Blaetterung
 * nachstellen, sonst prueft sie ihren Gegenstand nicht.
 *
 * Lauf: node --test --test-force-exit test/rangIstEhrlich.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { browseFeed } from "../services/capacityExchangeService.js";
import { updateRankPositions, getPublicRanking } from "../services/profileRankingService.js";
import { LAEUFE, profilRangliste } from "../services/betriebsTaktLaeufe.js";
import { TAKTE } from "../services/betriebsTaktService.js";

/* Pfade IMMER relativ zur Testdatei — sonst haengt das Ergebnis am
   Startverzeichnis und die Probe ueberspringt sich je nach cwd lautlos. */
const HIER = path.dirname(fileURLToPath(import.meta.url));
const API = path.resolve(HIER, "..");
const lies = (...teile) => fs.readFileSync(path.join(API, ...teile), "utf8");

/* Kommentare weg, bevor ueber Quelltext geurteilt wird. Eine Begruendung NENNT
   das, was nicht zurueckkommen darf ("der UTC-Tagesschnitt ist zurueck") — ein
   Waechter, der sie mitliest, ist rot wegen der Erklaerung und wird gruen,
   sobald jemand die Erklaerung loescht. Genau verkehrt herum. */
const ohneJsKommentare = (quelle) => quelle
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^[ 	]*\/\/.*$/gm, " ");

/* Die Rangrechnung vergleicht gegen die ECHTE Uhr (`Date.now()`): Aktualitaet
   und die Frist der Hervorhebung. Ein fest verdrahteter Zeitpunkt haette eine
   "aktive" Hervorhebung in der Vergangenheit erzeugt — die Probe waere
   lautlos an ihrem eigenen Gegenstand vorbeigelaufen. */
const JETZT = Date.now();
const tage = (n) => new Date(JETZT - n * 86400000).toISOString();
const inEinerStunde = () => new Date(Date.now() + 3600000).toISOString();

function angebot(over = {}) {
  return {
    feed_type: "supply",
    role: "Lagerhelfer",
    skill_tags: [],
    location_city: "Berlin",
    location_lat: null,
    location_lng: null,
    radius_km: 25,
    availability_from: "2026-10-01",
    availability_to: null,
    priority_level: "normal",
    headcount: 5,
    placement_boost_level: 0,
    featured_until: null,
    ...over
  };
}

/**
 * Muster-Pool fuer den Feed. Beachtet LIMIT und OFFSET aus den Parametern —
 * genau wie Postgres, und genau deshalb kann er den Unterschied zwischen
 * "Rang ueber die Seite" und "Rang ueber das Fenster" ueberhaupt zeigen.
 */
function feedPool({ supplyRows = [], plans = [], reputations = [] } = {}) {
  const gesehen = [];
  return {
    gesehen,
    query: async (sql, params = []) => {
      gesehen.push({ sql, params });
      if (sql.includes("COUNT(*)::int AS cnt") && sql.includes("capacity_posts")) {
        return { rows: [{ cnt: supplyRows.length }] };
      }
      if (sql.includes("COUNT(*)::int AS cnt") && sql.includes("demand_requests")) {
        return { rows: [{ cnt: 0 }] };
      }
      if (sql.includes("cp.id AS capacity_post_id")) {
        return {
          rows: supplyRows.map((row) => ({
            capacity_post_id: row.id,
            committed_headcount: 0,
            active_offer_count: 0,
            assigned_headcount: 0,
            staffing_reserved_headcount: 0,
            counterparty_user_ids: []
          }))
        };
      }
      if (sql.includes("FROM capacity_posts cp") && sql.includes("ORDER BY sort_date DESC")) {
        /* Die Angebotsabfrage bindet LIMIT und OFFSET als die BEIDEN LETZTEN
           Parameter (`[...params, fenster, versatz]`). */
        const grenze = Number(params[params.length - 2]);
        const versatz = Number(params[params.length - 1]);
        const sortiert = [...supplyRows].sort((a, b) => {
          const z = new Date(b.sort_date || b.created_at).getTime() - new Date(a.sort_date || a.created_at).getTime();
          return z !== 0 ? z : (String(a.id) < String(b.id) ? 1 : String(a.id) > String(b.id) ? -1 : 0);
        });
        return {
          rows: sortiert.slice(versatz, versatz + grenze).map((row) => ({
            status: "active",
            visibility_status: "public",
            sort_date: row.created_at,
            updated_at: row.created_at,
            ...row
          }))
        };
      }
      if (sql.includes("FROM demand_requests dr")) return { rows: [] };
      if (sql.includes("FROM capacity_interactions")) return { rows: [] };
      if (sql.includes("FROM supplier_reputation")) return { rows: reputations };
      if (sql.includes("FROM subscriptions")) return { rows: plans };
      return { rows: [] };
    }
  };
}

const ruf = (supplierId, reputation, quote) => ({
  supplier_id: supplierId, grade: "GOLD",
  reputation_score: reputation, deal_success_rate: quote, ranking_score: null
});
const GOLD = (supplierId) => ruf(supplierId, 100, 100);

/* ═══════════════════════════════════════════════════════════════════════════
   A) DAS KANDIDATENFENSTER (N3.4)
   ═══════════════════════════════════════════════════════════════════════════ */

describe("N3.4 · erst das Fenster, dann der Rang, dann die Seite", () => {

  it("der beste Treffer steht auf Seite 1, auch wenn er der aelteste Eintrag ist", async () => {
    /*
     * 60 Angebote, eines davon das aelteste — und das einzige mit Reputation.
     * Nach Datum steht es auf Seite 3. Rangiert der Code erst die Seite, kann
     * es dort nicht weg; rangiert er das Fenster, steht es oben.
     *
     * Die Reputation traegt hier den Unterschied (bis 25 Punkte) und nicht die
     * Passung: sie ist rechenbar und haengt nicht an der Bewertungsformel der
     * Passung, die sich aendern darf, ohne diese Probe zu entwerten. Der
     * Aktualitaets-Vorsprung der anderen liegt bei hoechstens 10 Punkten.
     */
    const supplyRows = Array.from({ length: 60 }, (_, i) => angebot({
      id: `s-${String(i).padStart(2, "0")}`,
      supplier_company_id: i === 59 ? "sup-gold" : `sup-${i}`,
      created_at: tage(i)
    }));
    const pool = feedPool({ supplyRows, reputations: [GOLD("sup-gold")] });

    const seite = await browseFeed(pool, { viewer_role: "company", limit: 25, page: 1 });

    assert.equal(seite.total, 60, "die Trefferzahl zaehlt weiter den ganzen Markt");
    assert.equal(seite.items.length, 25, "die Seite bleibt eine Seite");
    assert.equal(seite.items[0].id, "s-59",
      "der beste Treffer steht nicht oben — der Rang gilt wieder nur fuer die Seite");
    assert.ok(seite.items[0].rank_score > seite.items[1].rank_score,
      "oben steht nicht die hoehere verdiente Zahl");
  });

  it("die zweite Seite zeigt die naechsten 25 des RANGS, nicht des Datums", async () => {
    const supplyRows = Array.from({ length: 60 }, (_, i) => angebot({
      id: `s-${String(i).padStart(2, "0")}`,
      supplier_company_id: i === 59 ? "sup-gold" : `sup-${i}`,
      created_at: tage(i)
    }));
    const pool = feedPool({ supplyRows, reputations: [GOLD("sup-gold")] });

    const eins = await browseFeed(pool, { viewer_role: "company", limit: 25, page: 1 });
    const zwei = await browseFeed(pool, { viewer_role: "company", limit: 25, page: 2 });

    const a = new Set(eins.items.map((i) => i.id));
    const b = zwei.items.map((i) => i.id);
    assert.equal(b.length, 25);
    assert.ok(b.every((id) => !a.has(id)), "Seite 2 wiederholt Zeilen von Seite 1");
    assert.ok(!b.includes("s-59"), "der Spitzenreiter steht auf beiden Seiten");
  });

  it("das Fenster nennt sich selbst — Groesse, Kandidaten, Vollstaendigkeit", async () => {
    const supplyRows = Array.from({ length: 3 }, (_, i) => angebot({
      id: `s-${i}`, supplier_company_id: `sup-${i}`, created_at: tage(i)
    }));
    const pool = feedPool({ supplyRows });

    const seite = await browseFeed(pool, { viewer_role: "company", limit: 25, page: 1 });
    const f = seite.feed_context.rang_fenster;
    assert.ok(f, "das Fenster wird nicht benannt — eine stille Kuerzung");
    assert.equal(f.aktiv, true);
    assert.equal(f.groesse, 500);
    assert.equal(f.kandidaten, 3);
    assert.equal(f.vollstaendig, true, "3 von 3 Kandidaten sind vollstaendig");
  });

  it("jenseits des Fensters sagt die Antwort, dass der Rang nicht gilt", async () => {
    const supplyRows = [angebot({ id: "s-0", supplier_company_id: "sup-0", created_at: tage(0) })];
    const pool = feedPool({ supplyRows });

    /* Seite 21 bei 25 je Seite: Versatz 500 — das Fenster ist zu Ende. */
    const tief = await browseFeed(pool, { viewer_role: "company", limit: 25, page: 21 });
    assert.equal(tief.feed_context.rang_fenster.aktiv, false,
      "jenseits des Fensters wird ein Rang behauptet, den es nicht gibt");
  });

  it("eine ausdrueckliche Sortierung schaltet das Fenster ab", async () => {
    const supplyRows = Array.from({ length: 3 }, (_, i) => angebot({
      id: `s-${i}`, supplier_company_id: `sup-${i}`, created_at: tage(i)
    }));
    const pool = feedPool({ supplyRows });
    const seite = await browseFeed(pool, { viewer_role: "company", limit: 25, page: 1, sort: "newest" });
    assert.equal(seite.feed_context.rang_fenster.aktiv, false,
      "wer nach Datum sortiert, bekommt trotzdem die Rangordnung untergeschoben");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   B) O-L1 — BEZAHLTE HEBUNG BRICHT NUR GLEICHSTAND (N3.5)
   ═══════════════════════════════════════════════════════════════════════════ */

describe("N3.5 · bezahlte Hebung bricht nur Gleichstand", () => {

  /*
   * Die Zahlen sind mit Absicht so gewaehlt, dass die bezahlte Hebung den
   * verdienten Vorsprung UEBERHOLEN wuerde — sonst koennte die Probe den
   * Verstoss gar nicht sehen (die erste Zusicherung prueft genau das):
   *
   *   b-viel-bezahlt   Ruf 40      ->  7 verdient
   *                    Tarif PRO   ->  6 bezahlt
   *                    Hervorhebung-> 15 bezahlt
   *                    Platzierung ->  2-8 bezahlt
   *   a-gut-verdient   Ruf 60/60   -> 15 verdient
   *
   * Verdienter Vorsprung 8, bezahlte Hebung ueber 20.
   */
  function zweiAnbieter() {
    const supplyRows = [
      angebot({ id: "b-viel-bezahlt", supplier_company_id: "sup-arm", created_at: tage(1),
        placement_boost_level: 3, featured_until: inEinerStunde() }),
      angebot({ id: "a-gut-verdient", supplier_company_id: "sup-gold", created_at: tage(1) })
    ];
    return feedPool({
      supplyRows,
      reputations: [ruf("sup-gold", 60, 60), ruf("sup-arm", 40, 0)],
      plans: [{ user_id: "sup-arm", plan: "PRO" }]
    });
  }

  it("die bessere verdiente Zahl steht oben, obwohl die andere Seite zahlt", async () => {
    const seite = await browseFeed(zweiAnbieter(), { viewer_role: "company", limit: 25, page: 1 });
    const gut = seite.items.find((i) => i.id === "a-gut-verdient");
    const bezahlt = seite.items.find((i) => i.id === "b-viel-bezahlt");

    /* Zuerst: tritt der Gegenstand der Probe ueberhaupt ein? Eine bezahlte
       Hebung, die kleiner ist als der verdiente Vorsprung, wuerde die alte
       Summe gar nicht umdrehen — die Probe waere leer gruen. */
    assert.ok(bezahlt.rank_boost_paid > gut.rank_score - bezahlt.rank_score,
      "die bezahlte Hebung ist zu klein, um den Vorsprung zu ueberholen — "
      + "diese Probe koennte den Verstoss gar nicht sehen");

    assert.equal(seite.items[0].id, "a-gut-verdient",
      "bezahlte Hebung hat eine bessere Passung ueberholt (O-L1 verletzt)");
    assert.ok(gut.rank_score > bezahlt.rank_score);
  });

  it("bei GLEICHER verdienter Zahl entscheidet die bezahlte Hebung", async () => {
    /*
     * Beide Eintraege sind in jedem verdienten Bestandteil gleich: gleicher
     * Anbieter (also gleiche Reputation und gleicher Tarif), gleiches Datum,
     * gleiche Passung. Der Unterschied ist die Hervorhebung.
     *
     * Die Kennungen sind mit Absicht so gewaehlt, dass die Ordnung OHNE den
     * bezahlten Schritt umgekehrt waere: bei Gleichstand entscheidet die
     * Kennung absteigend, also stuende "z-ohne" oben.
     */
    const supplyRows = [
      angebot({ id: "a-mit", supplier_company_id: "sup-1", created_at: tage(2),
        featured_until: inEinerStunde() }),
      angebot({ id: "z-ohne", supplier_company_id: "sup-1", created_at: tage(2) })
    ];
    const seite = await browseFeed(feedPool({ supplyRows }), { viewer_role: "company", limit: 25, page: 1 });
    const mit = seite.items.find((i) => i.id === "a-mit");
    const ohne = seite.items.find((i) => i.id === "z-ohne");

    assert.equal(mit.rank_score, ohne.rank_score,
      "die verdiente Zahl unterscheidet sich — dann prueft diese Probe keinen Gleichstand");
    assert.ok(mit.rank_boost_paid > 0 && ohne.rank_boost_paid === 0);
    assert.equal(seite.items[0].id, "a-mit",
      "bei Gleichstand wirkt die bezahlte Hebung nicht — dann ist sie wertlos");
  });

  it("was gehoben ist, ist gekennzeichnet", async () => {
    const seite = await browseFeed(zweiAnbieter(), { viewer_role: "company", limit: 25, page: 1 });
    const gut = seite.items.find((i) => i.id === "a-gut-verdient");
    const bezahlt = seite.items.find((i) => i.id === "b-viel-bezahlt");

    assert.ok(bezahlt.rank_labels.includes("Bezahlt hervorgehoben"),
      "eine bezahlte Hebung ohne Kennzeichnung ist genau das, was O-L1 verbietet");
    assert.ok(!gut.rank_labels.includes("Bezahlt hervorgehoben"),
      "ein Eintrag ohne Hebung wird als bezahlt ausgewiesen");
  });

  it("jede Position nennt ihren Grund — und die Gruende sind vollstaendig", async () => {
    const seite = await browseFeed(zweiAnbieter(), { viewer_role: "company", limit: 25, page: 1 });
    const bezahlt = seite.items.find((i) => i.id === "b-viel-bezahlt");

    assert.ok(Array.isArray(bezahlt.rank_erklaerung) && bezahlt.rank_erklaerung.length > 0);
    const verdient = bezahlt.rank_erklaerung.filter((t) => t.art === "verdient")
      .reduce((s, t) => s + t.punkte, 0);
    const gezahlt = bezahlt.rank_erklaerung.filter((t) => t.art === "bezahlt")
      .reduce((s, t) => s + t.punkte, 0);

    assert.equal(verdient, bezahlt.rank_score,
      "die Erklaerung summiert sich nicht zur verdienten Zahl — dann erklaert sie etwas anderes");
    assert.equal(gezahlt, bezahlt.rank_boost_paid,
      "die Erklaerung summiert sich nicht zur bezahlten Hebung");
    assert.equal(bezahlt.rank_score_total, bezahlt.rank_score + bezahlt.rank_boost_paid);

    /* N3.4: kein Bestandteil ohne Begruendung. Wer einen neuen Bestandteil
       einbaut, muss ihn hier benennen — sonst faellt die Probe. */
    const ERLAUBT = new Set(["Passung", "Marktseite", "Reputation", "Dringlichkeit",
      "Aktualitaet", "Tarif", "Platzierung", "Hervorhebung"]);
    for (const teil of bezahlt.rank_erklaerung) {
      assert.ok(ERLAUBT.has(teil.grund), `unbenannter Rang-Bestandteil: ${teil.grund}`);
      assert.ok(teil.punkte > 0, "ein Bestandteil ohne Wirkung erklaert nichts");
    }
  });

  it("bei voelligem Gleichstand entscheidet die Kennung — absteigend, wie in SQL", async () => {
    /*
     * N3.5 "stabil": gleiche Eingaben, gleiche Reihenfolge. Drei Eintraege, in
     * jedem Bestandteil gleich — die Reihenfolge muss dann BENANNT sein und
     * nicht dem Zufall gehoeren. Benannt ist: Kennung absteigend, dieselbe
     * Ordnung, nach der schon SQL sortiert (`cp.id DESC`).
     *
     * EHRLICH DAZU: der Vergleicher traegt diesen Schritt als letzte Stufe,
     * aber er ist hier nicht allein tragend — die Zeilen kommen bereits in
     * einer totalen Ordnung an (SQL sortiert nach Kennung, die
     * Zusammenfuehrung beider Marktseiten ebenfalls), und `Array#sort` ist in
     * V8 stabil. Die Stufe im Vergleicher ist die Zusicherung fuer den Fall,
     * dass sich die eingehende Ordnung einmal aendert. Eine Rueckmutation
     * dieser einen Zeile faellt deshalb NICHT auf; das ist gemessen und
     * benannt, nicht uebersehen (Welle N3.4, Rueckmutation R6).
     */
    const bauen = (ids) => feedPool({
      supplyRows: ids.map((id) => angebot({ id, supplier_company_id: "sup-1", created_at: tage(2) }))
    });
    const vor = await browseFeed(bauen(["m-1", "m-2", "m-3"]), { viewer_role: "company", limit: 25, page: 1 });
    const zurueck = await browseFeed(bauen(["m-3", "m-2", "m-1"]), { viewer_role: "company", limit: 25, page: 1 });

    const rang = vor.items.map((i) => i.rank_score);
    assert.ok(rang.every((r) => r === rang[0]),
      "die drei Eintraege sind nicht gleichauf — dann prueft diese Probe keinen Gleichstand");
    assert.deepEqual(vor.items.map((i) => i.id), ["m-3", "m-2", "m-1"],
      "bei Gleichstand gilt nicht mehr die Kennung absteigend");
    assert.deepEqual(vor.items.map((i) => i.id), zurueck.items.map((i) => i.id),
      "gleiche Eingaben ergeben eine andere Reihenfolge");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   C) N3.6 — VERFUEGBARKEIT ZAEHLT, KRANKHEIT NICHT
   ═══════════════════════════════════════════════════════════════════════════ */

describe("N3.6 · Gesundheitsdaten fliessen nirgends in den Rang", () => {

  /** Der Block, der die Rangzahl bildet — von der O-L1-Ueberschrift bis zu den Kennzeichen. */
  function rangBlock() {
    const quelle = lies("services", "capacityExchangeService.js");
    const anfang = quelle.indexOf("N3.5 / O-L1");
    const ende = quelle.indexOf("item.rank_labels = rankLabels;");
    assert.ok(anfang > 0 && ende > anfang, "die Rangrechnung ist nicht mehr auffindbar");
    return quelle.slice(anfang, ende);
  }

  it("die Rangrechnung liest keine Abwesenheit", () => {
    const block = rangBlock();
    for (const wort of ["worker_absences", "abwesen", "krank", "sick"]) {
      assert.ok(!new RegExp(wort, "i").test(block),
        `die Rangrechnung nennt "${wort}" — Q1.1: Gesundheitsdaten werden nicht bewertet`);
    }
  });

  it("auch die Profil-Rangliste bewertet keine Abwesenheit", () => {
    const quelle = lies("services", "profileRankingService.js");
    for (const wort of ["worker_absences", "krank", "sick"]) {
      assert.ok(!new RegExp(wort, "i").test(quelle),
        `die Profil-Rangliste nennt "${wort}"`);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   D) DIE PROFIL-RANGLISTE — O-L1 UND DACH-ZEIT
   ═══════════════════════════════════════════════════════════════════════════ */

function protokollPool(antworten = {}) {
  const gesehen = [];
  return {
    gesehen,
    query: async (sql, params = []) => {
      gesehen.push({ sql, params });
      for (const [marke, rows] of Object.entries(antworten)) {
        if (sql.includes(marke)) return { rows, rowCount: rows.length };
      }
      return { rows: [], rowCount: 0 };
    }
  };
}

const berlinHeute = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit"
}).format(new Date());

/* Kommentare raus, bevor ueber den Abfragetext geurteilt wird: die Begruendung
   NENNT den Ausdruck, der nicht mehr sortieren darf. Eine Probe, die den
   Kommentar mitliest, wird rot, weil die Begruendung ihren Gegenstand beim
   Namen nennt — und gruen, sobald jemand die Begruendung loescht. */
const ohneKommentare = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, " ");

describe("N3.5 · die Profil-Rangliste ordnet nach der verdienten Zahl", () => {

  it("die Positionen entstehen nach ranking_score, nicht nach der Summe mit Hebung", async () => {
    const pool = protokollPool();
    await updateRankPositions(pool);
    const { params } = pool.gesehen[0];
    const sql = ohneKommentare(pool.gesehen[0].sql);

    assert.ok(/ORDER BY COALESCE\(ranking_score, 0\) DESC/.test(sql),
      "die Position ordnet nicht nach der verdienten Zahl");
    assert.ok(sql.indexOf("COALESCE(ranking_score, 0) DESC")
      < sql.indexOf("COALESCE(premium_boost, 0) DESC"),
      "die bezahlte Hebung steht vor der verdienten Zahl");
    assert.ok(!/ORDER BY COALESCE\(effective_rank_score/.test(sql),
      "die Position ordnet wieder nach Basis PLUS Hebung — O-L1 verletzt");
    assert.equal(params[0], berlinHeute(),
      "die Momentaufnahme traegt ein UTC-Datum — nachts ist das der Vortag");
  });

  it("das Datum kommt aus Europe/Berlin — an der Quelle geprueft", () => {
    /*
     * Die Zusicherung darueber (`params[0] === berlinHeute()`) ist die meiste
     * Zeit des Tages LEER GRUEN: UTC und Berlin tragen dasselbe Kalenderdatum,
     * ausser zwischen Mitternacht Ortszeit und Mitternacht UTC. Eine Probe, die
     * nur in einem Zwei-Stunden-Fenster etwas sehen kann, ist keine.
     *
     * Deshalb zusaetzlich am Quelltext: der Dienst schreibt Tagesdaten ueber
     * `todayDE()`, und der UTC-Schnitt kommt nicht zurueck.
     */
    const quelle = ohneJsKommentare(lies("services", "profileRankingService.js"));
    assert.ok(/import \{ todayDE \} from '\.\.\/utils\/dateDE\.js'/.test(quelle),
      "die DACH-Zeit-Utility ist nicht mehr eingebunden");
    assert.ok(!/toISOString\(\)\.slice\(0,\s*10\)/.test(quelle),
      "der UTC-Tagesschnitt ist zurueck — der klassische Off-by-one im DACH-Markt");
    assert.equal((quelle.match(/todayDE\(\)/g) || []).length, 3,
      "es gibt drei Tagesdaten im Dienst — Momentaufnahme, Positionen, oeffentliche Liste. "
      + "Eine Abweichung heisst: eine Stelle wurde vergessen oder eine kam ungeprueft dazu");
  });

  it("die oeffentliche Liste faellt nicht auf die Hebung zurueck", async () => {
    const pool = protokollPool();
    await getPublicRanking(pool, { limit: 10 });
    const { params } = pool.gesehen[0];
    const sql = ohneKommentare(pool.gesehen[0].sql);

    assert.ok(sql.includes("prs.premium_boost"),
      "ohne die Hebung in der Projektion kann die Oberflaeche sie nicht kennzeichnen");
    assert.ok(sql.indexOf("COALESCE(prs.ranking_score, 0) DESC")
      < sql.indexOf("COALESCE(prs.premium_boost, 0) DESC"),
      "im Rueckfall ordnet wieder die bezahlte Hebung");
    assert.ok(!/ORDER BY[\s\S]*effective_rank_score/.test(sql),
      "der Rueckfall ordnet nach Basis PLUS Hebung");
    assert.equal(params[0], berlinHeute());
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   E) DER TAKT, DEN ES NICHT GAB
   ═══════════════════════════════════════════════════════════════════════════ */

describe("N3.5 · die Rangliste wird ueberhaupt geschrieben", () => {

  it("der Lauf steht in der Registratur und in der Laufliste", () => {
    assert.equal(typeof LAEUFE["profil-rangliste"], "function",
      "ohne Eintrag in der Laufliste kann der Arbeiter den Takt nicht fahren");
    assert.ok(TAKTE["profil-rangliste"], "der Takt fehlt in der Registratur");
    assert.equal(TAKTE["profil-rangliste"].intervall_min, 1440);
  });

  it("der Takt ist eingeplant und hat eine Handkurbel", () => {
    const worker = lies("workers", "index.js");
    assert.ok(/upsertJobScheduler\(\s*"profil-rangliste-daily"[\s\S]{0,120}name:\s*"profil-rangliste"/.test(worker),
      "der Takt steht in der Registratur, wird aber nie eingeplant — genau die Luecke von vorher");
    const intern = lies("routes", "internal.js");
    assert.ok(intern.includes('router.post("/internal/profil-rangliste"'),
      "ohne internen Endpunkt laesst sich der Lauf nicht von Hand ausloesen");
  });

  it("erst die Momentaufnahmen, dann die Positionen", async () => {
    /*
     * Umgekehrt gereiht nummeriert der Lauf den Stand von gestern. Der Pool
     * protokolliert die Reihenfolge der Abfragen.
     */
    const pool = protokollPool({
      "FROM profile_visibility_settings": [{ org_id: "org-1" }],
      "FROM organizations o": [{ reputation_score: 80, activity_score: 10, response_time_score: 90,
        deal_success_rate: 70, org_plan: "PRO" }],
      "INSERT INTO profile_ranking_snapshots": [{ id: "snap-1" }]
    });

    const ergebnis = await profilRangliste(pool);
    assert.equal(ergebnis.processed, 1, "die Momentaufnahme wurde nicht geschrieben");

    const einfuegen = pool.gesehen.findIndex((a) => a.sql.includes("INSERT INTO profile_ranking_snapshots"));
    const position = pool.gesehen.findIndex((a) => a.sql.includes("SET rank_position"));
    assert.ok(einfuegen >= 0, "es wird gar keine Momentaufnahme geschrieben");
    assert.ok(position > einfuegen,
      "die Positionen werden vor den Momentaufnahmen vergeben — sie nummerieren dann gestern");
  });
});
