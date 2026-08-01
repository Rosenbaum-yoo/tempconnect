/**
 * capacityOfferMatchService — Deckungsvorschau im Angebotsformular (Multi-Skill Welle 6).
 *
 * Was hier festgehalten wird, ist die Zusage an den Disponenten: die Vorschau darf nie
 * mehr versprechen, als der spaetere Zuweisungs-Guard zulaesst. Zeigt sie "frei" und der
 * Guard antwortet danach 409, ist das Formular schlimmer als gar keine Vorschau.
 *
 * DB-frei; die Mock-Attrappe zaehlt zusaetzlich die Abfragen — die Belegschaft waechst mit
 * jedem Kunden, eine Abfrage pro Kraft waere bei 300 Kunden der teuerste Pfad im Formular.
 * Die Query-Form gegen das echte Schema deckt der DB-Smoke ab (siehe Wellen-Doku).
 *
 * Run: node --test --test-force-exit test/capacityOfferMatch.service.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkOfferCoverage, resolveSkillTags, ZUSTAND } from "../services/capacityOfferMatchService.js";
import { todayDE } from "../utils/dateDE.js";

const ORG = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const S_PFLEGE = "11111111-1111-1111-1111-111111111111";
const S_STAPLER = "22222222-2222-2222-2222-222222222222";

function inTagen(n) {
  const d = new Date(`${todayDE()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * @param katalog Zeilen der Skill-Aufloesung (id/name/category/suchbegriff)
 * @param kandidaten Zeilen der Belegschaftsabfrage
 */
function mockPool({ katalog = [], kandidaten = [] } = {}) {
  const calls = [];
  return {
    calls,
    query: async (sql, params = []) => {
      const s = String(sql);
      calls.push({ sql: s, params });
      if (/WITH forderung/i.test(s)) return { rows: kandidaten };
      if (/platform_skills/i.test(s)) return { rows: katalog };
      return { rows: [] };
    }
  };
}

function kandidat(over = {}) {
  return {
    worker_profile_id: "wp-1", first_name: "Anna", last_name: "Kraft", city: "Kiel",
    available_from: null, treffer: 1, treffer_namen: ["Altenpflege"],
    konflikt_anzahl: 0, konflikt_bis: null, konflikt_offen: false, konflikt_kunde: null,
    letztes_ende: null, unbefristet: false, abwesend_ab: null, abwesenheitsgrund: null,
    ...over
  };
}

describe("Faehigkeiten aufloesen", () => {
  it("meldet unauffindbare Begriffe, statt still 0 Treffer zu zeigen", async () => {
    const pool = mockPool({ katalog: [{ id: S_PFLEGE, name: "Altenpflege", category: "Pflege", suchbegriff: "altenpflege" }] });
    const out = await resolveSkillTags(pool, ["Altenpflege", "Einhornfluesterer"]);
    assert.deepEqual(out.skills.map((s) => s.name), ["Altenpflege"]);
    assert.deepEqual(out.unbekannte_faehigkeiten, ["Einhornfluesterer"],
      "Ein leeres Ergebnis sieht sonst wie ein Fehler aus statt wie eine Wissensluecke");
  });

  it("ordnet jeden Katalogtreffer seinem Suchbegriff zu", async () => {
    // Ein einziges 'stapler' loest mehrere Katalogeintraege auf. Ohne diese Zuordnung
    // wuerde 'alle Faehigkeiten' verlangen, dass eine Kraft ALLE davon hat — und niemanden finden.
    const pool = mockPool({ katalog: [
      { id: S_STAPLER, name: "Staplerfahrer:in", category: "Logistik", suchbegriff: "stapler" },
      { id: "33333333-3333-3333-3333-333333333333", name: "Staplerschein", category: "Logistik", suchbegriff: "stapler" }
    ] });
    const out = await resolveSkillTags(pool, ["stapler"]);
    assert.equal(out.skills.length, 2);
    assert.deepEqual([...new Set(out.zuordnung.map((z) => z.gruppe))], ["stapler"],
      "Beide Treffer erfuellen dieselbe eine Forderung");
  });

  it("maskiert LIKE-Sonderzeichen und behaelt dafuer ein echtes ESCAPE-Zeichen", async () => {
    // Regression: im Template-String stand `ESCAPE '\'` — JS loest `\'` zu `'` auf, in der DB
    // kam also `ESCAPE ''` an. Bei leerem Escape-Zeichen schaltet Postgres die Maskierung ganz
    // ab: die Zeile darueber war wirkungslos und ein getipptes "%" wieder eine Wildcard.
    // Geprueft wird deshalb beides — die Maskierung UND das Zeichen, das sie erst wirksam macht.
    const pool = mockPool({ katalog: [] });
    await resolveSkillTags(pool, ["100%"]);
    const abfrage = pool.calls.find((c) => /platform_skills/i.test(c.sql));

    assert.deepEqual(abfrage.params[0], ["100%"], "Der unmaskierte Begriff bleibt fuer den exakten Vergleich");
    assert.deepEqual(abfrage.params[1], ["100\\%"], "Fuer den Teiltreffer muss das getippte % maskiert ankommen");
    assert.match(abfrage.sql, /ESCAPE '\\'/,
      "Ohne echtes Escape-Zeichen ist die Maskierung eine Zeile ohne Wirkung");
    assert.doesNotMatch(abfrage.sql, /ESCAPE ''/,
      "Leeres ESCAPE deaktiviert die Maskierung in Postgres — dann liefert '%' den GESAMTEN Katalog");
  });
});

describe("Deckung", () => {
  it("rechnet die Luecke aus geforderter und wirklich freier Kopfzahl", async () => {
    const pool = mockPool({
      katalog: [{ id: S_PFLEGE, name: "Altenpflege", category: "Pflege", suchbegriff: "altenpflege" }],
      kandidaten: [kandidat(), kandidat({ worker_profile_id: "wp-2", first_name: "Max", konflikt_anzahl: 1, konflikt_kunde: "Nordklinik" })]
    });
    const out = await checkOfferCoverage(pool, { orgId: ORG, skillTags: ["altenpflege"], headcount: 3 });
    assert.equal(out.frei, 1);
    assert.equal(out.gefordert, 3);
    assert.equal(out.luecke, 2, "Zwei Kraefte fehlen — genau das soll der Disponent VOR dem Absenden sehen");
  });

  it("nennt bei einer verplanten Kraft den Kunden und den Tag der Rueckkehr", async () => {
    const ende = inTagen(20);
    const pool = mockPool({
      katalog: [{ id: S_PFLEGE, name: "Altenpflege", category: "Pflege", suchbegriff: "altenpflege" }],
      kandidaten: [kandidat({ konflikt_anzahl: 1, konflikt_bis: ende, konflikt_kunde: "Nordklinik" })]
    });
    const out = await checkOfferCoverage(pool, { orgId: ORG, skillTags: ["altenpflege"], headcount: 1 });
    assert.equal(out.kandidaten[0].zustand, ZUSTAND.VERPLANT);
    assert.equal(out.kandidaten[0].grund, "Nordklinik");
    assert.equal(out.kandidaten[0].frei_ab, inTagen(21), "Am Endtag selbst ist die Kraft noch gebunden");
  });

  it("raet NICHT bei einem Einsatz ohne Enddatum", async () => {
    // Dieselbe Regel wie im Verfuegbarkeits-Dienst: ein erfundenes 'ab morgen' erzeugt
    // Angebote, die die Agentur nicht halten kann.
    const pool = mockPool({
      katalog: [{ id: S_PFLEGE, name: "Altenpflege", category: "Pflege", suchbegriff: "altenpflege" }],
      kandidaten: [kandidat({ konflikt_anzahl: 1, konflikt_offen: true, konflikt_bis: null })]
    });
    const out = await checkOfferCoverage(pool, { orgId: ORG, skillTags: ["altenpflege"], headcount: 1 });
    assert.equal(out.kandidaten[0].zustand, ZUSTAND.VERPLANT);
    assert.equal(out.kandidaten[0].frei_ab, null);
  });

  it("respektiert die ausdrueckliche Angabe der Kraft vor jeder Herleitung", async () => {
    const spaeter = inTagen(30);
    const pool = mockPool({
      katalog: [{ id: S_PFLEGE, name: "Altenpflege", category: "Pflege", suchbegriff: "altenpflege" }],
      kandidaten: [kandidat({ available_from: spaeter })]
    });
    const out = await checkOfferCoverage(pool, { orgId: ORG, skillTags: ["altenpflege"], headcount: 1, from: todayDE() });
    assert.equal(out.kandidaten[0].zustand, ZUSTAND.SPAETER_FREI);
    assert.equal(out.kandidaten[0].frei_ab, spaeter);
    assert.equal(out.frei, 0, "Wer erst in 30 Tagen kann, deckt ein Angebot ab heute nicht");
  });

  it("meldet eine gemeldete Abwesenheit getrennt von einer Verplanung", async () => {
    const pool = mockPool({
      katalog: [{ id: S_PFLEGE, name: "Altenpflege", category: "Pflege", suchbegriff: "altenpflege" }],
      kandidaten: [kandidat({ abwesend_ab: inTagen(2), abwesenheitsgrund: "krank" })]
    });
    const out = await checkOfferCoverage(pool, { orgId: ORG, skillTags: ["altenpflege"], headcount: 1, to: inTagen(10) });
    assert.equal(out.kandidaten[0].zustand, ZUSTAND.ABWESEND);
    assert.equal(out.kandidaten[0].grund, "krank");
  });

  it("bleibt ruhig, solange keine Faehigkeit eingetippt ist", async () => {
    const out = await checkOfferCoverage(mockPool(), { orgId: ORG, skillTags: [], headcount: 4 });
    assert.equal(out.auswertbar, false, "Ein halb ausgefuelltes Formular ist kein Fehlerfall");
    assert.deepEqual(out.kandidaten, []);
  });

  it("besteht auf der Org-Grenze", async () => {
    await assert.rejects(
      () => checkOfferCoverage(mockPool(), { orgId: null, skillTags: ["altenpflege"] }),
      /ORG_REQUIRED/
    );
  });
});

describe("Abfrageform", () => {
  it("bindet die Belegschaftsabfrage an die eigene Org", async () => {
    const pool = mockPool({
      katalog: [{ id: S_PFLEGE, name: "Altenpflege", category: "Pflege", suchbegriff: "altenpflege" }],
      kandidaten: [kandidat()]
    });
    await checkOfferCoverage(pool, { orgId: ORG, skillTags: ["altenpflege"], headcount: 1 });
    const belegschaft = pool.calls.find((c) => /WITH forderung/i.test(c.sql));
    assert.ok(belegschaft.sql.includes("wp.supplier_org_id = $2"), "Org-Grenze gehoert in die Abfrage, nicht in den Filter danach");
    assert.equal(belegschaft.params[1], ORG);
  });

  it("verwendet dieselbe Ueberlappungsregel wie der Zuweisungs-Guard", async () => {
    // Laufen Vorschau und findWorkerScheduleConflicts auseinander, zeigt das Formular
    // 'frei' und die spaetere Zuweisung antwortet 409.
    const pool = mockPool({
      katalog: [{ id: S_PFLEGE, name: "Altenpflege", category: "Pflege", suchbegriff: "altenpflege" }],
      kandidaten: [kandidat()]
    });
    await checkOfferCoverage(pool, { orgId: ORG, skillTags: ["altenpflege"], headcount: 1 });
    const sql = pool.calls.find((c) => /WITH forderung/i.test(c.sql)).sql;
    assert.match(sql, /wal\.start_date <= \$4 AND \(wal\.end_date IS NULL OR wal\.end_date >= \$3\)/);
    assert.match(sql, /worker_confirmation_status NOT IN \('worker_declined','worker_unavailable'\)/);
  });

  it("braucht eine feste Zahl Abfragen, nicht eine pro Kraft", async () => {
    const viele = Array.from({ length: 40 }, (_, i) => kandidat({ worker_profile_id: `wp-${i}` }));
    const pool = mockPool({
      katalog: [{ id: S_PFLEGE, name: "Altenpflege", category: "Pflege", suchbegriff: "altenpflege" }],
      kandidaten: viele
    });
    const out = await checkOfferCoverage(pool, { orgId: ORG, skillTags: ["altenpflege"], headcount: 10 });
    assert.equal(out.kandidaten.length, 40);
    assert.equal(pool.calls.length, 2, "Eine Abfrage fuer den Katalog, eine fuer die Belegschaft — unabhaengig von deren Groesse");
  });
});
