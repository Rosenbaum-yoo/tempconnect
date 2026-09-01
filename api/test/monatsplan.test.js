/**
 * Der Monat als Fenster — Welle K3.3 und K3.4.
 *
 * DAS LEITBILD, das diese Datei festhält: **der Monat ist die Ansicht, der
 * Einsatz ist die Sache.** Gemessen am 2026-08-31 überschreiten 91 % der
 * Einsätze mit Enddatum eine Monatsgrenze (41 von 45), 34 spannen drei Monate.
 * Ein Raster, das den Monat als Kasten behandelt, wäre für neun von zehn Zeilen
 * falsch.
 *
 * ZWEI DINGE, DIE HIER BESONDERS BEWACHT WERDEN:
 *
 *   (1) DIE MANDANTENGRENZE IM KONFLIKT. "Eine Person, zwei Orte" ist
 *       naturgemäß org-übergreifend — die Gegenzuordnung liegt bei einer
 *       anderen Firma. Die Zeitarbeitsfirma darf sie benennen (ihr eigener
 *       Bestand), das Einsatzunternehmen NICHT: das wäre der Kundenname eines
 *       Wettbewerbers, geliefert von uns.
 *
 *   (2) DIE WIRKSAME ZEITSPANNE. Beim Bauen gegen die echten Daten meldete die
 *       erste Fassung eine Doppelbelegung, die es nicht gab: drei Zuordnungen
 *       im Bestand haben `end_date IS NULL`, obwohl ihr Einsatz beendet ist —
 *       einer endete am 31.03.2025. Ein Konflikt, der IMMER da ist, wird
 *       weggeklickt, und danach übersieht man den echten.
 *
 * Run: node --test --test-force-exit test/monatsplan.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createWorkforceRouter } from "../routes/workforce.js";
import {
  monatsfenster, nachbarmonate, konfliktFuerSeite, offeneBedarfe,
  seiteFuerOrg,
  monatsplan, doppelbelegungen, abwesenheiten, ablaufendeNachweise,
  planungsVorschau, mitarbeiterMonat, freieSpannen, eintraege, bedarfe,
  randvermerk, RANDVERMERK,
  SEITEN, KONFLIKTARTEN
} from "../services/monatsplanService.js";

/* ── Werkzeug ─────────────────────────────────────────────────────────── */

function musterPool(fn) {
  const calls = [];
  const pool = {
    calls,
    query: async (sql, params) => {
      const s = String(sql || "");
      calls.push({ sql: s, params: params || [] });
      const r = fn ? await fn(s, params || []) : null;
      return r === undefined || r === null ? { rows: [], rowCount: 0 } : r;
    },
    find(teil) { return calls.filter((c) => c.sql.includes(teil)); }
  };
  return pool;
}

const KONFLIKT_DOPPEL = {
  art: "doppelbelegung", grad: "hart",
  worker_user_id: "w-1", kraft_name: "Lukas Bauer",
  einsatz_id: "a-1", von: "2026-04-01", bis: "2026-04-30",
  gegenseite_assignment_id: "a-2",
  gegenseite_org_id: "org-fremd",
  gegenseite_org_name: "Mustermann Logistik GmbH"
};

/* ══════════════════════════════════════════════════════════════════════════
 * Das Fenster
 * ══════════════════════════════════════════════════════════════════════════ */

describe("K3.3 · das Monatsfenster", () => {
  it("kennt die Länge jedes Monats — auch im Schaltjahr", () => {
    assert.deepEqual(monatsfenster("2026-02"), { monat: "2026-02", von: "2026-02-01", bis: "2026-02-28", tage: 28 });
    assert.deepEqual(monatsfenster("2024-02"), { monat: "2024-02", von: "2024-02-01", bis: "2024-02-29", tage: 29 });
    assert.deepEqual(monatsfenster("2026-12"), { monat: "2026-12", von: "2026-12-01", bis: "2026-12-31", tage: 31 });
  });

  it("ohne Angabe gilt der laufende Monat, nie ein leeres Fenster", () => {
    const f = monatsfenster();
    assert.match(f.monat, /^\d{4}-\d{2}$/);
    assert.equal(f.von, `${f.monat}-01`);
    assert.ok(f.tage >= 28 && f.tage <= 31);
  });

  it("Unsinn fällt auf den laufenden Monat zurück statt zu werfen", () => {
    for (const kaputt of ["kaputt", "2026-13-99", "", null, "2026"]) {
      const f = monatsfenster(kaputt);
      assert.match(f.monat, /^\d{4}-\d{2}$/, `${kaputt} ergab ${f.monat}`);
    }
  });

  it("das Blättern überspringt die Jahresgrenze nicht", () => {
    assert.deepEqual(nachbarmonate("2026-01"), { vorheriger: "2025-12", naechster: "2026-02" });
    assert.deepEqual(nachbarmonate("2026-12"), { vorheriger: "2026-11", naechster: "2027-01" });
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * K3.4 · die Mandantengrenze im Konflikt
 * ══════════════════════════════════════════════════════════════════════════ */

describe("K3.4 · die Zeitarbeitsfirma darf die Gegenseite benennen, der Kunde nicht", () => {
  it("die Agentur bekommt den Konflikt vollständig — es ist ihr eigener Bestand", () => {
    const k = konfliktFuerSeite(KONFLIKT_DOPPEL, "agentur");
    assert.equal(k.gegenseite_org_name, "Mustermann Logistik GmbH");
    assert.equal(k.gegenseite_org_id, "org-fremd");
    assert.equal(k.gegenseite_assignment_id, "a-2");
  });

  it("RÜCKMUTATION: dem Kunden fehlt jede Spur der anderen Firma", () => {
    /* Der Kundenname eines Wettbewerbers, geliefert von uns, wäre ein echter
     * Schaden — nicht bloß zu viel Information. Dieselbe Trennung wie in
     * Welle H1: die Kundenansicht zeigt den Ausfall, nie die Art. */
    const k = konfliktFuerSeite(KONFLIKT_DOPPEL, "kunde");
    assert.equal("gegenseite_org_name" in k, false, "der Firmenname der Gegenseite ist durchgerutscht");
    assert.equal("gegenseite_org_id" in k, false, "die Org-Kennung der Gegenseite ist durchgerutscht");
    assert.equal("gegenseite_assignment_id" in k, false, "über die Einsatz-Kennung wäre die Firma auffindbar");

    const alsText = JSON.stringify(k);
    assert.ok(!alsText.includes("Mustermann"), `der Name steckt noch irgendwo: ${alsText}`);
    assert.ok(!alsText.includes("org-fremd"), `die Kennung steckt noch irgendwo: ${alsText}`);
  });

  it("die AUSSAGE bleibt für den Kunden vollständig — nur der Name fehlt", () => {
    /* Weglassen ist kein Verschweigen: der Kunde muss den Konflikt handhaben
     * können, also braucht er Kraft, Zeitraum und Härtegrad. */
    const k = konfliktFuerSeite(KONFLIKT_DOPPEL, "kunde");
    assert.equal(k.grad, "hart");
    assert.equal(k.kraft_name, "Lukas Bauer");
    assert.equal(k.von, "2026-04-01");
    assert.equal(k.bis, "2026-04-30");
    assert.match(k.hinweis, /anderweitig gebunden/);
  });

  it("andere Konfliktarten werden nicht angefasst", () => {
    const weich = { art: "bedarf_offen", grad: "weich", bedarf_id: "b-1" };
    assert.deepEqual(konfliktFuerSeite(weich, "kunde"), weich);
    assert.deepEqual(konfliktFuerSeite(weich, "agentur"), weich);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * K3.4 · die wirksame Zeitspanne — der Fund gegen die echten Daten
 * ══════════════════════════════════════════════════════════════════════════ */

describe("K3.4 · eine Zuordnung bindet höchstens so lange wie ihr Einsatz", () => {
  it("die Doppelbelegung rechnet gegen das Einsatzende, nicht nur gegen den Link", async () => {
    /* DER FUND: drei Zuordnungen im Bestand haben `end_date IS NULL`, obwohl
     * ihr Einsatz beendet ist. Die erste Fassung las nur den Link und meldete
     * daraufhin eine Doppelbelegung für eine Kraft, deren einer Einsatz am
     * 31.03.2025 abgeschlossen wurde — ein Fehlalarm, der nie wieder weggeht. */
    const p = musterPool(() => ({ rows: [] }));
    await doppelbelegungen(p, { orgId: "org-1", seite: "agentur", fenster: monatsfenster("2026-04") });
    const [c] = p.find("worker_assignment_links a");

    assert.ok(c, "die Abfrage wurde nicht gestellt");
    assert.match(c.sql, /JOIN assignments ea ON ea\.id = a\.assignment_id/,
      "ohne den Einsatz kennt die Abfrage sein Ende nicht");
    assert.match(c.sql, /JOIN assignments eb ON eb\.id = b\.assignment_id/,
      "die Gegenseite braucht dieselbe Begrenzung");
    assert.match(c.sql, /actual_end_date/,
      "ein vorzeitig beendeter Einsatz bindet nicht bis zum geplanten Ende");
    assert.match(c.sql, /LEAST\(/, "das wirksame Ende ist das FRÜHESTE der drei Daten");
  });

  it("auch Abwesenheit und Nachweis rechnen gegen die wirksame Spanne", async () => {
    /* Dieselbe Falle, zweimal daneben: eine Abwesenheit auf einer nie
     * geschlossenen Zuordnung wäre ebenso ein Dauer-Fehlalarm. */
    for (const [fn, teil] of [[abwesenheiten, "worker_absences"], [ablaufendeNachweise, "worker_profile_documents"]]) {
      const p = musterPool(() => ({ rows: [] }));
      await fn(p, { orgId: "org-1", seite: "agentur", fenster: monatsfenster("2026-04") });
      const [c] = p.find(teil);
      assert.ok(c, `${teil} wurde nicht abgefragt`);
      assert.match(c.sql, /JOIN assignments e ON e\.id = l\.assignment_id/,
        `${teil}: der Einsatz begrenzt die Zuordnung nicht`);
      assert.match(c.sql, /LEAST\(/, `${teil}: kein wirksames Ende`);
    }
  });

  it("eine aufgehobene Abwesenheit ist kein Konflikt mehr", async () => {
    const p = musterPool(() => ({ rows: [] }));
    await abwesenheiten(p, { orgId: "org-1", seite: "agentur", fenster: monatsfenster("2026-04") });
    const [c] = p.find("worker_absences");
    assert.match(c.sql, /ab\.aufgehoben_am IS NULL/,
      "eine zurückgenommene Krankmeldung wäre sonst ein dauerhafter Konflikt");
    assert.match(c.sql, /ab\.zustand = 'wirksam'/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * K3.3 · der Rand wird angeschnitten, nicht gekürzt
 * ══════════════════════════════════════════════════════════════════════════ */

describe("K3.3 · was über den Rand läuft, wird als solches gezeigt", () => {
  function planPool({ zeilen = [], bedarfsZeilen = [] } = {}) {
    return musterPool((s) => {
      if (/FROM assignments a/.test(s)) return { rows: zeilen };
      if (/FROM demand_requests d/.test(s)) return { rows: bedarfsZeilen };
      return { rows: [] };
    });
  }

  it("die Auswahl nimmt jeden Einsatz, der das Fenster BERÜHRT", async () => {
    const p = planPool();
    await monatsplan(p, { orgId: "org-1", seite: "kunde", monat: "2026-04" });
    const [c] = p.find("FROM assignments a");
    assert.match(c.sql, /a\.start_date <= \$3::date/,
      "ein Einsatz, der im Fenster beginnt oder früher, gehört hinein");
    assert.match(c.sql, /COALESCE\(a\.actual_end_date, a\.planned_end_date, DATE '9999-12-31'\) >= \$2::date/,
      "ein Einsatz ohne Enddatum läuft weiter und darf nicht herausfallen");
  });

  it("`endet_spaeter` ist bei einem offenen Einsatz FALSE, nicht null", async () => {
    /* `NULL > date` ist in SQL NULL. Ohne COALESCE käme in der Fläche weder
     * ja noch nein an — und eine Kachel, die „vielleicht" bedeutet, ist keine. */
    const p = planPool();
    await monatsplan(p, { orgId: "org-1", monat: "2026-04" });
    const [c] = p.find("FROM assignments a");
    assert.match(c.sql, /COALESCE\(COALESCE\(a\.actual_end_date, a\.planned_end_date\) > \$3::date, FALSE\) AS endet_spaeter/);
  });

  it("die Zusammenfassung zählt, wie viele Zeilen über den Rand laufen", async () => {
    const p = planPool({
      zeilen: [
        { id: "a1", beginnt_vorher: true,  endet_spaeter: true,  offen: false },
        { id: "a2", beginnt_vorher: false, endet_spaeter: false, offen: true },
        { id: "a3", beginnt_vorher: false, endet_spaeter: false, offen: false }
      ]
    });
    const plan = await monatsplan(p, { orgId: "org-1", seite: "agentur", monat: "2026-04" });
    assert.equal(plan.zusammenfassung.eintraege, 3);
    assert.equal(plan.zusammenfassung.beginnt_vorher, 1);
    assert.equal(plan.zusammenfassung.endet_spaeter, 2, "der offene Einsatz zählt mit");
  });

  it("die Zahl der Abfragen wächst NICHT mit der Zahl der Einsätze", async () => {
    /* Die Skalierungsregel des Projekts: die Menge wächst unbegrenzt mit den
     * Einsätzen eines Kunden. Der einzige belastbare Nachweis ist deshalb der
     * Vergleich zweier Größen — eine feste Zahl zu erwarten misst nur, wie viele
     * Abfrage-ARTEN es gibt, und das ist nicht dasselbe.
     *
     * (Genau daran ist die erste Fassung dieser Probe gescheitert: sie zählte
     * `worker_assignment_links l` und fand drei — die Zuordnung im LATERAL plus
     * die beiden Konfliktabfragen. Kein N+1, nur drei verschiedene Fragen.) */
    const zeilen = (n) => Array.from({ length: n }, (_, i) => ({ id: `a${i}` }));

    const wenige = planPool({ zeilen: zeilen(3) });
    await monatsplan(wenige, { orgId: "org-1", seite: "agentur", monat: "2026-04" });

    const viele = planPool({ zeilen: zeilen(300) });
    await monatsplan(viele, { orgId: "org-1", seite: "agentur", monat: "2026-04" });

    assert.equal(viele.calls.length, wenige.calls.length,
      `3 Einsätze → ${wenige.calls.length} Abfragen, 300 Einsätze → ${viele.calls.length}. `
      + "Das ist das N+1, das die Skalierungsregel verbietet.");
    assert.equal(wenige.find("FROM assignments a").length, 1,
      "die Einsätze selbst kommen in genau einer Abfrage");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * Zwei Spuren, keine Vermischung
 * ══════════════════════════════════════════════════════════════════════════ */

describe("K3.3 · zwei Spuren — jede sieht ihre eigene", () => {
  function seitenPool() {
    return musterPool(() => ({ rows: [] }));
  }

  it("der Kunde wird über `org_id` gebunden, die Agentur über `supplier_org_id`", async () => {
    const kunde = seitenPool();
    await monatsplan(kunde, { orgId: "org-1", seite: "kunde", monat: "2026-04" });
    assert.match(kunde.find("FROM assignments a")[0].sql, /WHERE a\.org_id = \$1/);

    const agentur = seitenPool();
    await monatsplan(agentur, { orgId: "org-1", seite: "agentur", monat: "2026-04" });
    assert.match(agentur.find("FROM assignments a")[0].sql, /WHERE a\.supplier_org_id = \$1/);
  });

  it("nur die Kundenspur hat Bedarfe — das ist Bauart, kein Fehlen", async () => {
    const agentur = seitenPool();
    const plan = await monatsplan(agentur, { orgId: "org-1", seite: "agentur", monat: "2026-04" });
    assert.deepEqual(plan.bedarfe, []);
    assert.equal(agentur.find("FROM demand_requests d").length, 0,
      "die Agentur legt Besetzungen an, keine Bedarfe — die Abfrage darf gar nicht laufen");

    const kunde = seitenPool();
    await monatsplan(kunde, { orgId: "org-1", seite: "kunde", monat: "2026-04" });
    assert.equal(kunde.find("FROM demand_requests d").length, 1);
  });

  it("eine unbekannte Seite fällt auf die Kundenspur zurück statt zu werfen", async () => {
    const p = seitenPool();
    const plan = await monatsplan(p, { orgId: "org-1", seite: "erfunden", monat: "2026-04" });
    assert.equal(plan.seite, "kunde");
    assert.deepEqual(SEITEN, ["kunde", "agentur"]);
  });

  it("ohne Organisation gibt es keinen Monatsplan", async () => {
    await assert.rejects(
      () => monatsplan(musterPool(), { seite: "kunde", monat: "2026-04" }),
      /MONATSPLAN_ORG_ERFORDERLICH/,
      "ein Plan ohne Mandantenbindung wäre ein plattformweiter Read"
    );
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * W1 · Bedarf unbesetzt
 * ══════════════════════════════════════════════════════════════════════════ */

describe("K3.4 · ein unbesetzter Bedarf ist ein weicher Punkt, keine Warnung", () => {
  it("besetzt heißt: es gibt eine bestätigte Vereinbarung", () => {
    const offen = offeneBedarfe([
      { id: "b1", besetzt: false, status: "open", title: "Zwei Elektriker", headcount: 2, start_date: "2026-04-05", end_date: "2026-04-20" },
      { id: "b2", besetzt: true,  status: "open", title: "Ein Lagerist", headcount: 1 }
    ]);
    assert.equal(offen.length, 1);
    assert.equal(offen[0].bedarf_id, "b1");
    assert.equal(offen[0].grad, "weich", "ein offener Bedarf ist kein Alarm");
    assert.equal(offen[0].koepfe, 2);
  });

  it("ein zurückgezogener Bedarf ist kein offener Punkt mehr", () => {
    const offen = offeneBedarfe([
      { id: "b3", besetzt: false, status: "cancelled" },
      { id: "b4", besetzt: false, status: "closed" }
    ]);
    assert.deepEqual(offen, [], "sonst bliebe jeder je angelegte Bedarf ewig als Konflikt stehen");
  });

  it("die Besetzung wird gegen BESTÄTIGTE Angebote geprüft, nicht gegen bloße", async () => {
    const p = musterPool(() => ({ rows: [] }));
    await monatsplan(p, { orgId: "org-1", seite: "kunde", monat: "2026-04" });
    const [c] = p.find("FROM demand_requests d");
    assert.match(c.sql, /of\.confirmed_at IS NOT NULL/,
      "ein unbestätigtes Angebot besetzt nichts — die Sofort-Pfade setzen `accepted`, bevor eine Vereinbarung besteht");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * Was der Monat NICHT weiß
 * ══════════════════════════════════════════════════════════════════════════ */

describe("K3.4 · die AÜG-Frist wird geprüft (E-K3-1) — und sagt, was sie nicht weiß", () => {
  it("alle fünf Konfliktarten gelten als geprüft", () => {
    const ungeprueft = Object.entries(KONFLIKTARTEN).filter(([, v]) => !v.geprueft).map(([k]) => k);
    assert.deepEqual(ungeprueft, [],
      "seit E-K3-1 wird auch die Überlassungshöchstdauer gerechnet");
    assert.equal(Object.keys(KONFLIKTARTEN).length, 5);
  });

  it("`nicht_geprueft` bleibt als Feld bestehen, auch wenn es leer ist", async () => {
    /* Ein Konflikt, der stillschweigend fehlt, wäre genau die Fehlerklasse
     * dieser Spur. Das Feld bleibt, damit die nächste Art, die man nicht
     * rechnen kann, dort landet statt zu verschwinden. */
    const p = musterPool(() => ({ rows: [] }));
    const plan = await monatsplan(p, { orgId: "org-1", seite: "agentur", monat: "2026-04" });
    assert.ok(Array.isArray(plan.nicht_geprueft));
    assert.deepEqual(plan.nicht_geprueft, []);
  });

  it("die Grenze der AÜG-Datenlage steht in jeder Antwort", async () => {
    const p = musterPool(() => ({ rows: [] }));
    const plan = await monatsplan(p, { orgId: "org-1", seite: "kunde", monat: "2026-04" });
    assert.equal(plan.aueg_nur_plattformdaten, true,
      "Überlassungen über fremde Verleiher fehlen in der Rechnung — das muss dabeistehen");
  });

  it("die Paare für die AÜG-Prüfung kommen aus den sichtbaren Einträgen", async () => {
    /* Damit gelangt nichts in die Antwort, das der Abfragende nicht ohnehin
     * sehen darf — die Prüfung erweitert die Mandantengrenze nicht. */
    const p = musterPool((s) => {
      if (/FROM assignments a/.test(s)) {
        return { rows: [{
          id: "a-1", org_id: "org-1", beginnt_vorher: false, endet_spaeter: false, offen: false,
          kraefte: [{ worker_user_id: "w-1", name: "Meier" }]
        }] };
      }
      return { rows: [] };
    });
    await monatsplan(p, { orgId: "org-1", seite: "agentur", monat: "2026-04" });
    const aueg = p.calls.find((x) => /a\.status <> 'cancelled'/.test(x.sql));
    assert.ok(aueg, "die AÜG-Abfrage wurde nicht gestellt");
    assert.deepEqual(aueg.params[0], ["w-1"], "nur die Kraft aus dem sichtbaren Eintrag");
    assert.deepEqual(aueg.params[1], ["org-1"]);
  });

  it("ein AÜG-Befund landet WIRKLICH in den Konflikten des Monats", async () => {
    /* Beim Rückmutieren fiel auf, dass sich `...aueg.befunde` aus der
     * Konfliktliste entfernen ließ, ohne dass eine Probe rot wurde: alle
     * bisherigen liefen mit leeren Zeilen. Eine Verdrahtung, die niemand
     * durchläuft, ist genau die Fehlerklasse dieser Spur. */
    const p = musterPool((s) => {
      if (/FROM assignments a/.test(s)) {
        return { rows: [{
          id: "a-1", org_id: "org-1", beginnt_vorher: true, endet_spaeter: true, offen: false,
          kraefte: [{ worker_user_id: "w-1", name: "Meier" }]
        }] };
      }
      // Die Überlassungsgeschichte: eine Kette ab 2026-01-15, die bis in das
      // Fenster reicht und ihre Frist dort reißt.
      if (/a\.status <> 'cancelled'/.test(s)) {
        return { rows: [{
          worker_user_id: "w-1", org_id: "org-1",
          von: "2026-01-15", bis: "9999-12-31",
          assignment_id: "a-1", supplier_org_id: "lief-1"
        }] };
      }
      return { rows: [] };
    });

    const plan = await monatsplan(p, { orgId: "org-1", seite: "agentur", monat: "2027-08" });
    const aueg = plan.konflikte.filter((k) => k.art === "aueg_frist");
    assert.equal(aueg.length, 1, "der AÜG-Befund ist nicht in den Konflikten angekommen");
    assert.equal(aueg[0].grad, "hart");
    assert.equal(aueg[0].ueberschreitung_am, "2027-07-15");
    assert.equal(plan.zusammenfassung.konflikte_hart, 1,
      "die Zusammenfassung muss ihn mitzählen, sonst sieht die Fläche eine andere Zahl");
  });

  it("ohne Kräfte im Fenster wird die AÜG gar nicht erst abgefragt", async () => {
    const p = musterPool(() => ({ rows: [] }));
    await monatsplan(p, { orgId: "org-1", seite: "agentur", monat: "2026-04" });
    assert.equal(p.calls.filter((x) => /a\.status <> 'cancelled'/.test(x.sql)).length, 0);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * E-K3-3 · der Randvermerk
 * ══════════════════════════════════════════════════════════════════════════ */

describe("E-K3-3 · bis zum Monatsrand, mit Vermerk", () => {
  it("ein Einsatz ohne Enddatum trägt „läuft noch\"", () => {
    assert.equal(randvermerk({ offen: true, endet_spaeter: false }), RANDVERMERK.laeuft_noch);
    assert.equal(RANDVERMERK.laeuft_noch, "laeuft_noch");
  });

  it("ein bekanntes Ende hinter dem Fenster trägt einen anderen Vermerk", () => {
    /* Zwei verschiedene Aussagen: „wir wissen nicht, wann es endet" und „es
     * endet, aber später". Ein gemeinsamer Vermerk würde beides verwischen. */
    assert.equal(randvermerk({ offen: false, endet_spaeter: true }), RANDVERMERK.endet_spaeter);
  });

  it("ein Einsatz, der im Fenster endet, trägt keinen Vermerk", () => {
    assert.equal(randvermerk({ offen: false, endet_spaeter: false }), null);
    assert.equal(randvermerk(null), null);
  });

  it("der Vermerk kommt am Eintrag mit, nicht aus der Oberfläche", async () => {
    /* Sonst erfindet ihn jede Fläche neu, und die dritte heißt dann
     * „unbefristet". */
    const p = musterPool((s) => {
      if (/FROM assignments a/.test(s)) {
        return { rows: [
          { id: "a1", org_id: "o1", offen: true,  endet_spaeter: false, kraefte: [] },
          { id: "a2", org_id: "o1", offen: false, endet_spaeter: true,  kraefte: [] },
          { id: "a3", org_id: "o1", offen: false, endet_spaeter: false, kraefte: [] }
        ] };
      }
      return { rows: [] };
    });
    const plan = await monatsplan(p, { orgId: "o1", seite: "agentur", monat: "2026-04" });
    assert.deepEqual(plan.eintraege.map((e) => e.randvermerk),
      ["laeuft_noch", "endet_spaeter", null]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * Die Verdrahtung — am ECHTEN Handler, nicht nur am Dienst darunter
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Die Lehre aus K4: acht grüne Dienst-Proben, und der Rückfall hätte in der
 * Praxis nie gegriffen, weil `opts` mit `const` innerhalb des `try` stand.
 */

describe("K3.3 · die Spur wird abgeleitet, nicht erfragt", () => {
  it("eine `agency` bekommt die Agentur-Spur, alles andere die Kundenspur", async () => {
    for (const [typ, erwartet] of [["agency", "agentur"], ["company", "kunde"], [null, "kunde"]]) {
      const p = musterPool((s) => (/FROM organizations WHERE id/.test(s)
        ? { rows: typ ? [{ type: typ }] : [] } : { rows: [] }));
      assert.equal(await seiteFuerOrg(p, "org-1"), erwartet, `type=${typ}`);
    }
  });

  it("bei Großschreibung greift sie trotzdem", async () => {
    const p = musterPool(() => ({ rows: [{ type: "AGENCY" }] }));
    assert.equal(await seiteFuerOrg(p, "org-1"), "agentur");
  });

  it("ohne Auskunft gilt die ENGERE Sicht", async () => {
    /* Ein Ausfall darf nie die weitere Sicht öffnen — die Agentur-Spur zeigt
     * bei einer Doppelbelegung den Namen der Gegenseite. */
    const p = musterPool(() => { throw new Error("connection terminated"); });
    assert.equal(await seiteFuerOrg(p, "org-1"), "kunde");
  });
});

describe("K3.3 · GET /workforce/monatsplan am echten Handler", () => {
  function handler(router, pfad) {
    for (const layer of router.stack) {
      if (!layer.route || layer.route.path !== pfad) continue;
      if (!layer.route.methods.get) continue;
      return {
        handle: layer.route.stack[layer.route.stack.length - 1].handle,
        kette: layer.route.stack.map((l) => l.handle.name || "anonym")
      };
    }
    throw new Error(`Route GET ${pfad} nicht gefunden`);
  }

  const antwort = () => {
    const r = { _status: 200, _json: null };
    r.status = (c) => { r._status = c; return r; };
    r.json = (b) => { r._json = b; return r; };
    return r;
  };

  const deps = (p) => ({
    pool: p,
    requireAuth: (_req, _res, next) => next(),
    logger: { warn() {}, info() {}, error() {} }
  });

  it("liefert den Monat und leitet die Spur aus dem Organisationstyp ab", async () => {
    const p = musterPool((s) => {
      if (/FROM organizations WHERE id/.test(s)) return { rows: [{ type: "agency" }] };
      return { rows: [] };
    });
    const r = antwort();
    const h = handler(createWorkforceRouter(deps(p)), "/workforce/monatsplan");
    await h.handle({ orgId: "org-1", query: { monat: "2026-04" } }, r, () => {});

    assert.equal(r._status, 200);
    assert.equal(r._json.seite, "agentur", "der Typ der Organisation entscheidet");
    assert.equal(r._json.fenster.monat, "2026-04");
    assert.ok(Array.isArray(r._json.konflikte));
  });

  it("die Spur aus der Anfrage wird IGNORIERT", async () => {
    /* Käme sie aus dem Browser, könnte ein Einsatzunternehmen die Agentur-Sicht
     * anfordern — und die zeigt bei einer Doppelbelegung den Namen der
     * Gegenseite. */
    const p = musterPool((s) => {
      if (/FROM organizations WHERE id/.test(s)) return { rows: [{ type: "company" }] };
      return { rows: [] };
    });
    const r = antwort();
    const h = handler(createWorkforceRouter(deps(p)), "/workforce/monatsplan");
    await h.handle({ orgId: "org-1", query: { monat: "2026-04", seite: "agentur" } }, r, () => {});
    assert.equal(r._json.seite, "kunde", "die Spur aus der Anfrage darf nichts bewirken");
  });

  it("ohne Organisationskontext gibt es keinen Monat", async () => {
    const r = antwort();
    const h = handler(createWorkforceRouter(deps(musterPool())), "/workforce/monatsplan");
    await h.handle({ query: {} }, r, () => {});
    assert.equal(r._status, 400);
    assert.equal(r._json.error, "NO_ORG_CONTEXT");
  });

  it("ein unbrauchbarer Monat fällt auf den laufenden zurück statt zu werfen", async () => {
    /* E-K3-2 erlaubt ausdrücklich auch vergangene Monate — ein 400 wäre hier
     * die falsche Antwort. */
    const p = musterPool(() => ({ rows: [] }));
    const r = antwort();
    const h = handler(createWorkforceRouter(deps(p)), "/workforce/monatsplan");
    await h.handle({ orgId: "org-1", query: { monat: "kaputt" } }, r, () => {});
    assert.equal(r._status, 200);
    assert.match(r._json.fenster.monat, /^\d{4}-\d{2}$/);
  });

  it("ein vergangener Monat wird ausgeliefert — E-K3-2", async () => {
    const p = musterPool(() => ({ rows: [] }));
    const r = antwort();
    const h = handler(createWorkforceRouter(deps(p)), "/workforce/monatsplan");
    await h.handle({ orgId: "org-1", query: { monat: "2020-01" } }, r, () => {});
    assert.equal(r._json.fenster.monat, "2020-01",
      "Nachträge sind ein Viertel der Wirklichkeit — die Fläche muss dorthin blättern können");
  });

  it("die Route steht hinter Anmeldung und Berechtigung", () => {
    const h = handler(createWorkforceRouter(deps(musterPool())), "/workforce/monatsplan");
    assert.ok(h.kette.length >= 3,
      `zu kurze Kette: ${h.kette.join(" → ")} — Anmeldung und Berechtigung fehlen`);
  });
});


/* ═══════════════════════════════════════════════════════════════════════════
   Drei Defekte, am 2026-08-31 gegen den echten Bestand gemessen.

   Alle drei sind beim Vorbereiten von K3.5 aufgefallen — beim Nachsehen, wie
   die schreibende Fläche an die bestehenden Pfade andockt. Keiner davon war
   im Browser sichtbar, und genau das ist ihr gemeinsames Merkmal.
   ═══════════════════════════════════════════════════════════════════════════ */

describe("K3.5 · Vorarbeit — drei stille Defekte, gemessen statt vermutet", () => {
  /* (1) DER FILTER, DER NIE GREIFEN KONNTE.
   *
   * `demand_requests.requester_company_id` trägt eine NUTZER-Kennung: 40 von 40
   * Zeilen verbinden sich mit `users`, null mit `organizations`. Die erste
   * Fassung filterte mit der ORG-Kennung — gemessen fand dieser Filter im
   * gesamten Bestand NULL Zeilen.
   *
   * Die Folge war nicht nur eine leere Liste: `offeneBedarfe()` leitet den
   * weichen Konflikt AUS dieser Liste ab. Eine der fünf Konfliktarten konnte
   * strukturell nie feuern — während die Welle behauptete, alle fünf stünden. */
  it("Bedarfe werden über die NUTZER der Organisation gesucht, nicht über die Org-Kennung", async () => {
    const pool = musterPool();
    await monatsplan(pool, { orgId: "org-1", seite: "kunde", monat: "2026-09" });

    const [abfrage] = pool.find("FROM demand_requests");
    assert.ok(abfrage, "die Bedarfsabfrage muss überhaupt laufen");
    assert.ok(
      /FROM users u WHERE u\.org_id = \$1/.test(abfrage.sql),
      "der Bedarf hängt am Nutzer, die Organisation am Nutzer — beides muss verbunden werden"
    );
    assert.ok(
      !/requester_company_id = \$1/.test(abfrage.sql),
      "die Org-Kennung direkt gegen requester_company_id zu stellen findet garantiert nichts"
    );
  });

  it("die Kundenspur liefert Bedarfe UND den weichen Konflikt daraus", async () => {
    const pool = musterPool((sql) => {
      if (sql.includes("FROM demand_requests")) {
        return {
          rows: [{
            id: "b-1", title: "Zwei Staplerfahrer", role: "Stapler", headcount: 2,
            status: "open", start_date: "2026-09-10", end_date: "2026-09-20",
            beginnt_vorher: false, endet_spaeter: false, besetzt: false
          }]
        };
      }
      return null;
    });

    const plan = await monatsplan(pool, { orgId: "org-1", seite: "kunde", monat: "2026-09" });
    assert.equal(plan.bedarfe.length, 1);
    assert.equal(plan.zusammenfassung.bedarfe, 1);

    const offen = plan.konflikte.filter((k) => k.art === "bedarf_offen");
    assert.equal(offen.length, 1, "ein unbesetzter Bedarf ist der weiche Konflikt W1");
    assert.equal(offen[0].grad, "weich");
    assert.equal(offen[0].bedarf_id, "b-1");
    assert.equal(offen[0].von, "2026-09-10");
  });

  /* (2) EIN KALENDERTAG BLEIBT EIN KALENDERTAG — und zwar an EINER Stelle.
   *
   * Beim Messen fuer K3.5 lieferte der Dienst scheinbar Zeitstempel
   * ("2026-03-10T23:00:00.000Z" statt "2026-03-11"). Das war KEIN Produktfehler:
   * das Messskript hatte sich einen eigenen `pg.Pool` gebaut, ohne
   * `db/typeParsers.js` zu laden. Der echte Pool laedt ihn (`db/pool.js:7`), und
   * `pg` haelt Typparser modulweit — die Zusage steht also plattformweit.
   *
   * Die Lehre ging nicht ins Leere: dass ALLES daran haengt und NICHTS es
   * festhielt, war eine echte Luecke. Der Waechter dafuer steht jetzt in
   * `kalendertagDE.test.js`; hier waere er am falschen Ort. Ein zweiter
   * TO_CHAR-Riegel im Dienst waere eine zweite Mechanik fuer dieselbe Zusage —
   * und beim naechsten Umbau aendert jemand eine davon. */

  /* (3) EINE ZUORDNUNG, DIE NICHT MEHR GILT, BINDET NICHT MEHR.
   *
   * Gemessen: 9 von 24 Zuordnungen stehen auf `is_active = FALSE`, eine auf
   * `worker_unavailable`. Ohne Zustandsfilter meldet der Plan eine
   * Doppelbelegung für eine Absage und führt Abgesagte als besetzt.
   *
   * Wirkung im heutigen Bestand: null — es gibt derzeit keine einzige
   * Doppelbelegung. Der Defekt ist LATENT. Mit K3.5 wird er scharf, denn dann
   * ist der Plan die Fläche, aus der heraus jemand schreibt. */
  it("alle vier Abfragen über Zuordnungen prüfen deren Zustand — nicht drei von vier", async () => {
    const pool = musterPool();
    await monatsplan(pool, { orgId: "org-1", seite: "agentur", monat: "2026-04" });

    const mitZuordnung = pool.calls.filter((c) => c.sql.includes("worker_assignment_links"));
    assert.ok(mitZuordnung.length >= 4, "vier Abfragen fassen Zuordnungen an");

    for (const c of mitZuordnung) {
      assert.ok(
        /is_active = TRUE/.test(c.sql),
        "eine archivierte Zuordnung bindet niemanden:\n" + c.sql.slice(0, 220)
      );
      assert.ok(
        /worker_confirmation_status NOT IN \('worker_declined','worker_unavailable'\)/.test(c.sql),
        "wer abgesagt hat, ist nicht doppelt belegt:\n" + c.sql.slice(0, 220)
      );
    }
  });

  it("die Doppelbelegung prüft BEIDE Seiten des Paars, nicht nur die eigene", async () => {
    const pool = musterPool();
    await monatsplan(pool, { orgId: "org-1", seite: "agentur", monat: "2026-04" });

    const [doppel] = pool.find("FROM worker_assignment_links a");
    const aSeite = /a\.is_active = TRUE/.test(doppel.sql);
    const bSeite = /b\.is_active = TRUE/.test(doppel.sql);
    assert.ok(aSeite && bSeite,
      "eine Kollision mit einer archivierten Gegenzuordnung ist keine Kollision");
  });

  /* Die Grenze der Prüfung, ausgesprochen: das Lebenszyklus-Prädikat der
   * Domäne wird ABSICHTLICH nicht übernommen. `buildAssignmentActivePredicateSql`
   * misst gegen CURRENT_DATE und beantwortet "wer ist gerade im Einsatz". Der
   * Plan fragt "wer ist in DIESEM Fenster gebunden" — für einen Monat in der
   * Zukunft wäre die Heute-Frage die falsche und würde jede Vorausplanung
   * leerräumen. */
  it("das Heute-Prädikat der Domäne wird bewusst NICHT übernommen", async () => {
    const pool = musterPool();
    await monatsplan(pool, { orgId: "org-1", seite: "agentur", monat: "2027-09" });

    for (const c of pool.calls.filter((x) => x.sql.includes("worker_assignment_links"))) {
      assert.ok(
        !/CURRENT_DATE/.test(c.sql),
        "ein Monat in der Zukunft darf nicht gegen heute gefiltert werden:\n" + c.sql.slice(0, 220)
      );
    }
  });
});


/* ═══════════════════════════════════════════════════════════════════════════
   K3.5 · die Vorschau — was bricht, WENN ich so plane?

   Abschnitt 3b verspricht: die Doppelbelegung faellt BEIM PLANEN auf, nicht am
   Einsatztag. Beide Schreibwege gab es laengst; was fehlte, war die Antwort
   VORHER. Diese Proben halten fest, dass sie richtig ist — und dass sie nicht
   zum Auskunftsdienst ueber fremde Einsatzplaene wird.
   ═══════════════════════════════════════════════════════════════════════════ */

describe("K3.5 · die Konfliktvorschau vor dem Schreiben", () => {
  const EINSATZ = {
    id: "a-1", org_id: "kunde-1", supplier_org_id: "org-1", status: "active",
    von: "2026-04-01", bis: "2026-04-30",
    kunde_name: "Nordbau GmbH",
    kraft_org: "org-1", kraft_name: "Lukas Bauer"
  };

  /** Muster-Pool mit einem Zusammenhang, der beide Riegel passieren laesst. */
  function poolMit(kontext, weitere) {
    return musterPool((sql, params) => {
      if (/FROM assignments a\s*\n\s*LEFT JOIN organizations o/.test(sql)) {
        return { rows: kontext ? [kontext] : [] };
      }
      return weitere ? weitere(sql, params) : null;
    });
  }

  it("ein Einsatz einer FREMDEN Firma wird nicht beantwortet", async () => {
    const p = poolMit({ ...EINSATZ, supplier_org_id: "org-2" });
    const e = await planungsVorschau(p, {
      orgId: "org-1", seite: "agentur", workerUserId: "w-1", assignmentId: "a-1"
    });
    assert.equal(e.fehler, "FREMDER_EINSATZ");
    assert.ok(!e.konflikte, "im Fehlerfall gibt es keine Konfliktliste");
  });

  it("eine FREMDE Kraft wird nicht beantwortet — sonst waere es ein Auskunftsdienst", async () => {
    /* Ohne diesen Riegel koennte jemand eine beliebige Personenkennung
     * einsetzen und erfahren, wann sie gebucht ist — bei welcher Firma, in
     * welchem Zeitraum. */
    const p = poolMit({ ...EINSATZ, kraft_org: "org-2" });
    const e = await planungsVorschau(p, {
      orgId: "org-1", seite: "agentur", workerUserId: "fremd", assignmentId: "a-1"
    });
    assert.equal(e.fehler, "FREMDE_KRAFT");
  });

  it("die Kundenspur bekommt eine ANTWORT, keine leere Liste", async () => {
    /* Ein leeres Ergebnis waere von "keine Konflikte" nicht zu unterscheiden —
     * genau die Fehlerklasse, die diese Welle behandelt. */
    const e = await planungsVorschau(poolMit(EINSATZ), {
      orgId: "org-1", seite: "kunde", workerUserId: "w-1", assignmentId: "a-1"
    });
    assert.equal(e.fehler, "NUR_AGENTURSPUR");
  });

  it("fehlt eine Angabe, wird das gesagt statt geraten", async () => {
    const e = await planungsVorschau(poolMit(EINSATZ), {
      orgId: "org-1", seite: "agentur", assignmentId: "a-1"
    });
    assert.equal(e.fehler, "UNVOLLSTAENDIG");
  });

  it("meldet die Doppelbelegung MIT der Gegenseite — die Agentur darf sie kennen", async () => {
    const p = poolMit(EINSATZ, (sql) => {
      if (/FROM worker_assignment_links l\s*\n\s*JOIN assignments e/.test(sql)) {
        return { rows: [{
          assignment_id: "a-2", org_id: "kunde-2",
          gegenseite_org_name: "Suedbau AG",
          gegen_von: "2026-04-10", gegen_bis: "2026-04-20",
          ueberschneidung_von: "2026-04-10", ueberschneidung_bis: "2026-04-20"
        }] };
      }
      return null;
    });
    const e = await planungsVorschau(p, {
      orgId: "org-1", seite: "agentur", workerUserId: "w-1", assignmentId: "a-1"
    });
    const d = e.konflikte.filter((k) => k.art === "doppelbelegung");
    assert.equal(d.length, 1);
    assert.equal(d[0].grad, "hart");
    assert.equal(d[0].gegenseite_org_name, "Suedbau AG",
      "die eigene Belegung ist der eigene Bestand — die Agentur darf sie benennen");
    assert.equal(d[0].kraft_name, "Lukas Bauer");
    assert.equal(e.zusammenfassung.hart, 1);
  });

  it("prueft nur ZUORDNUNGEN, DIE GELTEN — eine Absage blockiert nicht", async () => {
    const p = poolMit(EINSATZ);
    await planungsVorschau(p, {
      orgId: "org-1", seite: "agentur", workerUserId: "w-1", assignmentId: "a-1"
    });
    const [kollision] = p.find("FROM worker_assignment_links l");
    assert.ok(kollision, "die Kollisionsabfrage muss laufen");
    assert.match(kollision.sql, /is_active = TRUE/);
    assert.match(kollision.sql,
      /worker_confirmation_status NOT IN \('worker_declined','worker_unavailable'\)/);
    assert.match(kollision.sql, /l\.assignment_id <> \$2/,
      "der eigene Einsatz ist keine Kollision mit sich selbst");
  });

  it("die Abwesenheit wird auf die EIGENE Firma begrenzt", async () => {
    const p = poolMit(EINSATZ);
    await planungsVorschau(p, {
      orgId: "org-1", seite: "agentur", workerUserId: "w-1", assignmentId: "a-1"
    });
    const [ab] = p.find("FROM worker_absences");
    assert.ok(ab, "die Abwesenheitsabfrage muss laufen");
    assert.match(ab.sql, /ab\.supplier_org_id = \$2/);
    assert.match(ab.sql, /ab\.aufgehoben_am IS NULL/,
      "eine zurueckgenommene Meldung ist kein Hindernis");
    assert.match(ab.sql, /ab\.zustand = 'wirksam'/);
  });

  it("DIE VORSCHAU SCHREIBT NICHTS", async () => {
    /* Eine Vorschau, die etwas anlegt, ist keine. Der Schreibweg bleibt der
     * bestehende `quick-assign` — mit dessen Rechten, CSRF und Audit. */
    const p = poolMit(EINSATZ);
    await planungsVorschau(p, {
      orgId: "org-1", seite: "agentur", workerUserId: "w-1", assignmentId: "a-1"
    });
    for (const c of p.calls) {
      assert.ok(
        !/\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i.test(c.sql),
        "die Vorschau darf ausschliesslich lesen:\n" + c.sql.slice(0, 200)
      );
    }
  });

  it("die AUEG-Frist wird MIT dem geplanten Zeitraum neu gerechnet", async () => {
    /* Die Kraft ist seit dem 01.01.2024 bei diesem Entleiher. Die 18 Monate
     * rissen am 01.07.2025 — lange vor dem geplanten April 2026. Die Vorschau
     * meldet das, unterscheidet aber: verursacht hat es diese Besetzung NICHT. */
    const p = poolMit(EINSATZ, (sql) => {
      if (/FROM worker_assignment_links l\s*\n\s*JOIN assignments a/.test(sql)) {
        return { rows: [{
          worker_user_id: "w-1", org_id: "kunde-1",
          von: "2024-01-01", bis: "2026-09-30",
          assignment_id: "a-alt", supplier_org_id: "org-1"
        }] };
      }
      return null;
    });
    const e = await planungsVorschau(p, {
      orgId: "org-1", seite: "agentur", workerUserId: "w-1", assignmentId: "a-1"
    });
    const a = e.konflikte.filter((k) => k.art === "aueg_hoechstdauer");
    assert.equal(a.length, 1, "die Frist ist im geplanten Zeitraum laengst gerissen");
    assert.equal(a[0].grad, "hart");
    assert.equal(a[0].ueberschreitung_am, "2025-07-01");
    assert.equal(a[0].durch_diese_besetzung, false,
      "die Ueberschreitung lag schon vorher — sie ist NICHT die Folge dieser Besetzung");
  });

  it("eine Frist, die ERST NACH der Besetzung reisst, meldet die Vorschau NICHT", async () => {
    /* EINE BEWUSSTE ABGRENZUNG, hier festgehalten, damit sie nicht versehentlich
     * kippt: Geschichte ab 01.01.2025, die Frist reisst am 01.07.2026. Der
     * geplante Einsatz laeuft vom 01.04. bis 30.04.2026 — er ist vorbei, bevor
     * etwas reisst.
     *
     * Die Vorschau beantwortet "was bricht durch DIESE Handlung". Dass die
     * laufende Kette spaeter reisst, ist wahr und wichtig — aber es ist eine
     * Aussage ueber den Bestand, und die steht im Monatsplan. Beides hier zu
     * melden hiesse, dieselbe Sache an zwei Stellen zu fuehren; wer sie einmal
     * als "kenne ich schon" wegklickt, klickt sie ueberall weg. */
    const p = poolMit(EINSATZ, (sql) => {
      if (/FROM worker_assignment_links l\s*\n\s*JOIN assignments a/.test(sql)) {
        return { rows: [{
          worker_user_id: "w-1", org_id: "kunde-1",
          von: "2025-01-01", bis: "2026-09-30",
          assignment_id: "a-alt", supplier_org_id: "org-1"
        }] };
      }
      return null;
    });
    const e = await planungsVorschau(p, {
      orgId: "org-1", seite: "agentur", workerUserId: "w-1", assignmentId: "a-1"
    });
    assert.deepEqual(e.konflikte.filter((k) => k.art === "aueg_hoechstdauer"), [],
      "der geplante Einsatz endet am 30.04.2026, die Frist reisst am 01.07.2026");
  });

  it("eine Frist, die es OHNE die Besetzung nicht gaebe, wird als deren Folge benannt", async () => {
    /* Ohne den geplanten Einsatz endet die Geschichte am 31.03.2026 — 15 Monate,
     * die Frist haelt. Der Einsatz bis zum 30.04.2026 haengt sich an und macht
     * daraus 16 Monate; erst mit ihm reisst sie am 01.07.2026 nicht. Der Fall
     * prueft die UNTERSCHEIDUNG, nicht die Zahl: verursacht diese Besetzung den
     * Befund oder nicht? */
    const p = poolMit({ ...EINSATZ, von: "2026-04-01", bis: "2026-08-31" }, (sql) => {
      if (/FROM worker_assignment_links l\s*\n\s*JOIN assignments a/.test(sql)) {
        return { rows: [{
          worker_user_id: "w-1", org_id: "kunde-1",
          von: "2025-01-01", bis: "2026-03-31",
          assignment_id: "a-alt", supplier_org_id: "org-1"
        }] };
      }
      return null;
    });
    const e = await planungsVorschau(p, {
      orgId: "org-1", seite: "agentur", workerUserId: "w-1", assignmentId: "a-1"
    });
    const a = e.konflikte.filter((k) => k.art === "aueg_hoechstdauer");
    assert.equal(a.length, 1);
    assert.equal(a[0].durch_diese_besetzung, true,
      "ohne diese Besetzung waere die Frist nicht gerissen — das ist der Unterschied, "
        + "der die Meldung handlungsleitend macht");
  });

  it("die Grenze der Datenlage steht in der Antwort", async () => {
    const e = await planungsVorschau(poolMit(EINSATZ), {
      orgId: "org-1", seite: "agentur", workerUserId: "w-1", assignmentId: "a-1"
    });
    assert.equal(e.nur_plattformdaten, true,
      "was ueber einen fremden Verleiher lief, steht hier nicht — auch wenn das "
        + "Gesetz es anrechnen wuerde");
  });
});

describe("K3.5 · GET /workforce/monatsplan/vorschau am echten Handler", () => {
  function handler(router, pfad) {
    for (const layer of router.stack) {
      if (!layer.route || layer.route.path !== pfad) continue;
      if (!layer.route.methods.get) continue;
      return layer.route.stack[layer.route.stack.length - 1].handle;
    }
    throw new Error(`Route GET ${pfad} nicht gefunden`);
  }
  const antwort = () => {
    const r = { _status: 200, _json: null };
    r.status = (c) => { r._status = c; return r; };
    r.json = (b) => { r._json = b; return r; };
    return r;
  };
  const deps = (p) => ({
    pool: p,
    requireAuth: (_req, _res, next) => next(),
    logger: { warn() {}, info() {}, error() {} }
  });

  const KONTEXT = {
    id: "a-1", org_id: "kunde-1", supplier_org_id: "org-1", status: "active",
    von: "2026-04-01", bis: "2026-04-30", kunde_name: "Nordbau GmbH",
    kraft_org: "org-1", kraft_name: "Lukas Bauer"
  };

  function pool(typ, kontext) {
    return musterPool((sql) => {
      if (/FROM organizations WHERE id/.test(sql)) return { rows: [{ type: typ }] };
      if (/FROM assignments a\s*\n\s*LEFT JOIN organizations o/.test(sql)) {
        return { rows: kontext ? [kontext] : [] };
      }
      return { rows: [] };
    });
  }

  it("antwortet der Agentur mit der Vorschau", async () => {
    const r = antwort();
    const h = handler(createWorkforceRouter(deps(pool("agency", KONTEXT))),
      "/workforce/monatsplan/vorschau");
    await h({ orgId: "org-1", query: { worker_user_id: "w-1", assignment_id: "a-1" } }, r, () => {});
    assert.equal(r._status, 200);
    assert.equal(r._json.kraft_name, "Lukas Bauer");
    assert.ok(Array.isArray(r._json.konflikte));
    assert.equal(r._json.nur_plattformdaten, true);
  });

  it("ein fremder Einsatz und eine fremde Kraft antworten BEIDE mit 403", async () => {
    /* Verschiedene Kodes waeren ein Auskunftsdienst darueber, welche Kennungen
     * es gibt: 404 hiesse "kenne ich nicht", 403 hiesse "kenne ich, gehoert dir
     * nur nicht". */
    for (const kontext of [
      { ...KONTEXT, supplier_org_id: "org-2" },
      { ...KONTEXT, kraft_org: "org-2" }
    ]) {
      const r = antwort();
      const h = handler(createWorkforceRouter(deps(pool("agency", kontext))),
        "/workforce/monatsplan/vorschau");
      await h({ orgId: "org-1", query: { worker_user_id: "w-1", assignment_id: "a-1" } }, r, () => {});
      assert.equal(r._status, 403);
    }
  });

  it("das Einsatzunternehmen bekommt 400 — nicht 200 mit leerer Liste", async () => {
    const r = antwort();
    const h = handler(createWorkforceRouter(deps(pool("company", KONTEXT))),
      "/workforce/monatsplan/vorschau");
    await h({ orgId: "org-1", query: { worker_user_id: "w-1", assignment_id: "a-1" } }, r, () => {});
    assert.equal(r._status, 400);
    assert.equal(r._json.error, "NUR_AGENTURSPUR");
  });

  it("ohne Organisationskontext wird nichts beantwortet", async () => {
    const r = antwort();
    const h = handler(createWorkforceRouter(deps(pool("agency", KONTEXT))),
      "/workforce/monatsplan/vorschau");
    await h({ orgId: null, query: {} }, r, () => {});
    assert.equal(r._status, 400);
    assert.equal(r._json.error, "NO_ORG_CONTEXT");
  });
});


/* ═══════════════════════════════════════════════════════════════════════════
   K3.7 · der Monat je Mitarbeiter

   DER BEFUND, DER DIESE ANSICHT AUSGELOEST HAT (gemessen 2026-08-31): das
   Einsatz-Raster hat Einsätze als Zeilen — wer in diesem Monat keinen Einsatz
   hat, kommt darin gar nicht vor.

     Demo Zeitarbeit GmbH …  12 Mitarbeiter, im April-Raster sichtbar:  4
     E2E Zeitarbeit GmbH  …   7 Mitarbeiter, sichtbar:                  0
     über alle Agenturen  …  31 Mitarbeiter, sichtbar:                  4

   87 % fehlen — und zwar genau die, die man verplanen will.
   ═══════════════════════════════════════════════════════════════════════════ */

describe("K3.7 · freieSpannen — die Rechnung, um die es geht", () => {
  const APRIL = { monat: "2026-04", von: "2026-04-01", bis: "2026-04-30", tage: 30 };

  it("ohne Belegung ist der ganze Monat frei", () => {
    assert.deepEqual(freieSpannen([], APRIL),
      [{ von: "2026-04-01", bis: "2026-04-30", tage: 30 }]);
  });

  it("eine Belegung in der Mitte lässt zwei Spannen übrig", () => {
    const frei = freieSpannen([{ von: "2026-04-10", bis: "2026-04-20" }], APRIL);
    assert.deepEqual(frei, [
      { von: "2026-04-01", bis: "2026-04-09", tage: 9 },
      { von: "2026-04-21", bis: "2026-04-30", tage: 10 }
    ]);
  });

  it("ÜBERLAPPENDE Belegungen erzeugen keine Phantom-Lücke", () => {
    /* Ohne Zusammenlegen entstünde zwischen zwei überlappenden Einsätzen eine
     * freie Spanne, die es nicht gibt — und ein Disponent besetzt Tage doppelt,
     * weil das Raster sie als frei anbot. */
    const frei = freieSpannen([
      { von: "2026-04-05", bis: "2026-04-15" },
      { von: "2026-04-10", bis: "2026-04-20" }
    ], APRIL);
    assert.deepEqual(frei, [
      { von: "2026-04-01", bis: "2026-04-04", tage: 4 },
      { von: "2026-04-21", bis: "2026-04-30", tage: 10 }
    ]);
  });

  it("zwei Belegungen, die direkt aneinander stoßen, lassen keine Lücke", () => {
    /* Der 15. endet, der 16. beginnt: dazwischen ist kein Tag. */
    const frei = freieSpannen([
      { von: "2026-04-01", bis: "2026-04-15" },
      { von: "2026-04-16", bis: "2026-04-30" }
    ], APRIL);
    assert.deepEqual(frei, []);
  });

  it("eine Belegung ohne Ende reicht bis zum Monatsrand (E-K3-3)", () => {
    assert.deepEqual(freieSpannen([{ von: "2026-04-20", bis: null }], APRIL),
      [{ von: "2026-04-01", bis: "2026-04-19", tage: 19 }]);
  });

  it("eine Belegung, die vor dem Monat begann, wird am Rand angeschnitten", () => {
    assert.deepEqual(freieSpannen([{ von: "2025-11-01", bis: "2026-04-10" }], APRIL),
      [{ von: "2026-04-11", bis: "2026-04-30", tage: 20 }]);
  });

  it("eine Belegung ausserhalb des Fensters lässt den Monat unberührt", () => {
    assert.deepEqual(freieSpannen([{ von: "2026-06-01", bis: "2026-06-30" }], APRIL),
      [{ von: "2026-04-01", bis: "2026-04-30", tage: 30 }]);
  });

  it("der ganze Monat belegt heisst: keine freie Spanne", () => {
    assert.deepEqual(freieSpannen([{ von: "2026-03-01", bis: "2026-05-31" }], APRIL), []);
  });
});

describe("K3.7 · der Monat je Mitarbeiter", () => {
  const LEUTE = [
    { profil_id: "p-1", user_id: "w-1", name: "Anna Berg", personnel_number: "A-1", is_active: true },
    { profil_id: "p-2", user_id: "w-2", name: "Bernd Cato", personnel_number: "A-2", is_active: true },
    { profil_id: "p-3", user_id: null,  name: "Clara Dorn", personnel_number: "A-3", is_active: true }
  ];

  function poolMit({ leute = LEUTE, belegungen = [], abwesend = [], nachweise = [] } = {}) {
    return musterPool((sql) => {
      if (/FROM worker_profiles wp\s*\n\s*WHERE wp\.supplier_org_id/.test(sql)) {
        return { rows: leute };
      }
      if (/FROM worker_assignment_links l\s*\n\s*JOIN assignments e/.test(sql)) {
        return { rows: belegungen };
      }
      if (/FROM worker_absences ab/.test(sql)) return { rows: abwesend };
      if (/FROM worker_profile_documents d/.test(sql)) return { rows: nachweise };
      return null;
    });
  }

  it("WER KEINEN EINSATZ HAT, STEHT TROTZDEM DA — der Anlass dieser Ansicht", async () => {
    const plan = await mitarbeiterMonat(poolMit(), {
      orgId: "org-1", seite: "agentur", monat: "2026-04"
    });
    assert.equal(plan.mitarbeiter.length, 3,
      "alle drei Mitarbeiter gehören in den Monat, auch die ohne Einsatz");
    assert.deepEqual(plan.mitarbeiter.map((m) => m.name),
      ["Anna Berg", "Bernd Cato", "Clara Dorn"]);
    assert.equal(plan.zusammenfassung.ganz_frei, 3);
    assert.equal(plan.zusammenfassung.ganz_belegt, 0);
    for (const m of plan.mitarbeiter) {
      assert.equal(m.freie_tage, 30, "ohne Belegung ist der ganze April frei");
      assert.equal(m.auslastung_prozent, 0);
    }
  });

  it("ein Mitarbeiter OHNE Konto ist trotzdem ein Mitarbeiter", async () => {
    /* `worker_profiles.user_id` ist seit Migration 175 nullbar: der Mensch
     * existiert, bevor er sich anmeldet. Ein Verbund über `users` verschluckte
     * genau die frisch importierte Belegschaft. */
    const plan = await mitarbeiterMonat(poolMit(), {
      orgId: "org-1", seite: "agentur", monat: "2026-04"
    });
    const clara = plan.mitarbeiter.find((m) => m.name === "Clara Dorn");
    assert.ok(clara, "die Kraft ohne Konto fehlt");
    assert.equal(clara.ohne_konto, true);
    assert.equal(clara.worker_user_id, null);
    assert.equal(clara.personalnummer, "A-3", "ohne Konto ist die Nummer der Schlüssel");
    assert.equal(plan.zusammenfassung.ohne_konto, 1);
  });

  it("Belegung und Abwesenheit zusammen ergeben die freie Spanne", async () => {
    const plan = await mitarbeiterMonat(poolMit({
      belegungen: [{
        worker_user_id: "w-1", assignment_id: "a-1", org_id: "kunde-1",
        entleiher_name: "Nordbau GmbH", status: "active",
        von: "2026-04-01", bis: "2026-04-10",
        beginnt_vorher: false, endet_spaeter: false
      }],
      abwesend: [{
        worker_profile_id: "p-1", id: "ab-1", art: "krank",
        von: "2026-04-20", bis: "2026-04-25", offen: false
      }]
    }), { orgId: "org-1", seite: "agentur", monat: "2026-04" });

    const anna = plan.mitarbeiter.find((m) => m.profil_id === "p-1");
    assert.deepEqual(anna.frei, [
      { von: "2026-04-11", bis: "2026-04-19", tage: 9 },
      { von: "2026-04-26", bis: "2026-04-30", tage: 5 }
    ], "für die Planung ist abwesend genauso wenig verfügbar wie im Einsatz");
    assert.equal(anna.freie_tage, 14);
    assert.equal(anna.auslastung_prozent, 53);
    assert.equal(plan.zusammenfassung.teilweise_frei, 1);
    assert.equal(plan.zusammenfassung.ganz_frei, 2);
  });

  it("die Kundenspur bekommt WEDER den Entleiher NOCH den Abwesenheitsgrund", async () => {
    /* Dieselbe Trennung wie im Einsatz-Raster: dass jemand fehlt, geht die
     * Gegenseite an; WARUM er fehlt, nicht. */
    const plan = await mitarbeiterMonat(poolMit({
      belegungen: [{
        worker_user_id: "w-1", assignment_id: "a-1", org_id: "kunde-1",
        entleiher_name: "Nordbau GmbH", status: "active",
        von: "2026-04-01", bis: "2026-04-10",
        beginnt_vorher: false, endet_spaeter: false
      }],
      abwesend: [{
        worker_profile_id: "p-1", id: "ab-1", art: "krank",
        von: "2026-04-20", bis: "2026-04-25", offen: false
      }]
    }), { orgId: "org-1", seite: "kunde", monat: "2026-04" });

    const anna = plan.mitarbeiter.find((m) => m.profil_id === "p-1");
    assert.equal(anna.belegungen[0].entleiher_name, null);
    assert.equal(anna.belegungen[0].entleiher_org_id, null);
    assert.equal(anna.abwesenheiten[0].art, null);
    assert.equal(anna.abwesenheiten[0].von, "2026-04-20",
      "DASS jemand fehlt, bleibt sichtbar — nur das Warum nicht");
  });

  it("der Randvermerk kommt vom Dienst, auch hier (E-K3-3)", async () => {
    const plan = await mitarbeiterMonat(poolMit({
      belegungen: [{
        worker_user_id: "w-1", assignment_id: "a-1", org_id: "kunde-1",
        entleiher_name: "Nordbau GmbH", status: "active",
        von: "2026-04-01", bis: null,
        beginnt_vorher: true, endet_spaeter: false
      }]
    }), { orgId: "org-1", seite: "agentur", monat: "2026-04" });

    const anna = plan.mitarbeiter.find((m) => m.profil_id === "p-1");
    assert.equal(anna.belegungen[0].randvermerk, RANDVERMERK.laeuft_noch);
    assert.deepEqual(anna.frei, [], "ein offener Einsatz belegt bis zum Monatsrand");
    assert.equal(anna.auslastung_prozent, 100);
  });

  it("VIER Abfragen für beliebig viele Mitarbeiter, nicht vier JE Mitarbeiter", async () => {
    /* Die Skalierungsregel des Projekts ("läuft bei 10, bricht bei 300"): die
     * Menge wächst mit der Belegschaft. `resolveAvailability()` beantwortet EINE
     * Kraft — darüber zu schleifen wären bei 300 Mitarbeitern 300 Abfragen je
     * Seitenaufruf. Gezählt wird deshalb der UNTERSCHIED zwischen 3 und 300. */
    const viele = Array.from({ length: 300 }, (_, i) => ({
      profil_id: `p-${i}`, user_id: `w-${i}`, name: `Kraft ${i}`,
      personnel_number: `N-${i}`, is_active: true
    }));

    const wenig = poolMit();
    await mitarbeiterMonat(wenig, { orgId: "org-1", seite: "agentur", monat: "2026-04" });

    const gross = poolMit({ leute: viele });
    const plan = await mitarbeiterMonat(gross, { orgId: "org-1", seite: "agentur", monat: "2026-04" });

    assert.equal(plan.mitarbeiter.length, 300);
    assert.equal(gross.calls.length, wenig.calls.length,
      `300 Mitarbeiter kosteten ${gross.calls.length} Abfragen, 3 kosteten `
        + `${wenig.calls.length} — die Zahl darf NICHT mit der Belegschaft wachsen`);
    assert.ok(gross.calls.length <= 4,
      `${gross.calls.length} Abfragen — erwartet werden höchstens vier`);
  });

  it("die Belegung zählt nur, wenn die Zuordnung GILT", async () => {
    const p = poolMit();
    await mitarbeiterMonat(p, { orgId: "org-1", seite: "agentur", monat: "2026-04" });
    const [belegung] = p.find("FROM worker_assignment_links l");
    assert.ok(belegung, "die Belegungsabfrage muss laufen");
    assert.match(belegung.sql, /is_active = TRUE/);
    assert.match(belegung.sql,
      /worker_confirmation_status NOT IN \('worker_declined','worker_unavailable'\)/);
  });

  it("Abwesenheiten hängen am PROFIL, nicht am Konto", async () => {
    /* Sonst hätte ein Mitarbeiter ohne Konto nie eine Abwesenheit — obwohl
     * gerade er sie am ehesten per Hand gemeldet bekommt. */
    const p = poolMit();
    await mitarbeiterMonat(p, { orgId: "org-1", seite: "agentur", monat: "2026-04" });
    const [ab] = p.find("FROM worker_absences ab");
    assert.ok(ab, "die Abwesenheitsabfrage muss laufen");
    assert.match(ab.sql, /ab\.worker_profile_id = ANY/);
    assert.match(ab.sql, /ab\.supplier_org_id = \$2/);
  });

  it("die Zusammenfassung stammt aus genau den gelieferten Zeilen", async () => {
    /* Keine zweite Rechenregel: eine Kennzahl, die anders rechnet als die Liste
     * darunter, ist eine Schattenwahrheit. */
    const plan = await mitarbeiterMonat(poolMit({
      belegungen: [{
        worker_user_id: "w-1", assignment_id: "a-1", org_id: "kunde-1",
        entleiher_name: "Nordbau", status: "active",
        von: "2026-03-01", bis: null, beginnt_vorher: true, endet_spaeter: false
      }, {
        worker_user_id: "w-2", assignment_id: "a-2", org_id: "kunde-2",
        entleiher_name: "Südbau", status: "active",
        von: "2026-04-05", bis: "2026-04-08", beginnt_vorher: false, endet_spaeter: false
      }]
    }), { orgId: "org-1", seite: "agentur", monat: "2026-04" });

    const z = plan.zusammenfassung;
    assert.equal(z.mitarbeiter, plan.mitarbeiter.length);
    assert.equal(z.ganz_belegt,
      plan.mitarbeiter.filter((m) => m.freie_tage === 0).length);
    assert.equal(z.ganz_frei,
      plan.mitarbeiter.filter((m) => m.freie_tage === m.tage_im_monat).length);
    assert.equal(z.teilweise_frei,
      plan.mitarbeiter.filter((m) => m.freie_tage > 0 && m.freie_tage < m.tage_im_monat).length);
    assert.equal(z.ganz_belegt + z.ganz_frei + z.teilweise_frei, z.mitarbeiter,
      "jeder Mitarbeiter fällt in genau eine der drei Klassen");
  });

  it("das Blättern trägt auch hier — Vor- und Folgemonat kommen mit", async () => {
    const plan = await mitarbeiterMonat(poolMit(), {
      orgId: "org-1", seite: "agentur", monat: "2026-01"
    });
    assert.equal(plan.fenster.monat, "2026-01");
    assert.equal(plan.vorheriger, "2025-12");
    assert.equal(plan.naechster, "2026-02");
  });
});

describe("K3.7 · GET /workforce/monatsplan/mitarbeiter am echten Handler", () => {
  function handler(router, pfad) {
    for (const layer of router.stack) {
      if (!layer.route || layer.route.path !== pfad) continue;
      if (!layer.route.methods.get) continue;
      return layer.route.stack[layer.route.stack.length - 1].handle;
    }
    throw new Error(`Route GET ${pfad} nicht gefunden`);
  }
  const antwort = () => {
    const r = { _status: 200, _json: null };
    r.status = (c) => { r._status = c; return r; };
    r.json = (b) => { r._json = b; return r; };
    return r;
  };
  const deps = (p) => ({
    pool: p,
    requireAuth: (_req, _res, next) => next(),
    logger: { warn() {}, info() {}, error() {} }
  });

  function pool(typ) {
    return musterPool((sql) => {
      if (/FROM organizations WHERE id/.test(sql)) return { rows: [{ type: typ }] };
      if (/FROM worker_profiles wp\s*\n\s*WHERE wp\.supplier_org_id/.test(sql)) {
        return { rows: [
          { profil_id: "p-1", user_id: "w-1", name: "Anna Berg", personnel_number: "A-1", is_active: true }
        ] };
      }
      return { rows: [] };
    });
  }

  it("liefert die Belegschaft des Monats", async () => {
    const r = antwort();
    const h = handler(createWorkforceRouter(deps(pool("agency"))),
      "/workforce/monatsplan/mitarbeiter");
    await h({ orgId: "org-1", query: { monat: "2026-04" } }, r, () => {});
    assert.equal(r._status, 200);
    assert.equal(r._json.fenster.monat, "2026-04");
    assert.equal(r._json.mitarbeiter.length, 1);
    assert.equal(r._json.zusammenfassung.ganz_frei, 1);
  });

  it("die Spur wird abgeleitet — ein Unternehmen bekommt den engeren Zuschnitt", async () => {
    const r = antwort();
    const h = handler(createWorkforceRouter(deps(pool("company"))),
      "/workforce/monatsplan/mitarbeiter");
    await h({ orgId: "org-1", query: {} }, r, () => {});
    assert.equal(r._status, 200);
    assert.equal(r._json.seite, "kunde");
  });

  it("ohne Organisationskontext wird nichts beantwortet", async () => {
    const r = antwort();
    const h = handler(createWorkforceRouter(deps(pool("agency"))),
      "/workforce/monatsplan/mitarbeiter");
    await h({ orgId: null, query: {} }, r, () => {});
    assert.equal(r._status, 400);
    assert.equal(r._json.error, "NO_ORG_CONTEXT");
  });
});


/* ═══════════════════════════════════════════════════════════════════════════
   K3.6 · was die Mutationsprobe aufgedeckt hat

   Stryker hat 957 Mutanten gegen `monatsplanService` und `auegService` gefahren.
   Die reine Punktzahl ist nicht der Maßstab — die Projektregel verlangt NULL
   Überlebende im ENTSCHEIDUNGS-Zweig, und dort saßen zwei Klassen, die keine
   Probe sah:

     (1) WELCHE SPALTE DIE MANDANTENGRENZE ZIEHT. Vier Abfragen wählen zwischen
         `supplier_org_id` (Agentur) und `org_id` (Kunde). Ein stiller Flip
         liefert die Einsätze einer FREMDEN Seite — die Suite blieb grün, weil
         die Proben nur prüften, DASS gefiltert wird, nicht WOMIT.

     (2) WAS DIE KUNDENSPUR NICHT ERFAHREN DARF. Der Abwesenheitsgrund und die
         Art des Nachweises gehören der Zeitarbeitsfirma. Ein Flip von
         `seite === "agentur" ? r.art : null` gibt beides an den Kunden weiter —
         ohne dass irgendetwas rot wird.

   Beides ist kein Schönheitsfehler: es ist die Grenze zwischen zwei Firmen.
   ═══════════════════════════════════════════════════════════════════════════ */

describe("K3.6 · die Mandantengrenze hängt an EINER Spalte je Abfrage", () => {
  const FENSTER = { monat: "2026-04", von: "2026-04-01", bis: "2026-04-30", tage: 30 };

  /* Je Abfrage: welche Spalte MUSS vorkommen, und welche darf es NICHT.
   * `eintraege` filtert auf `assignments`, die drei anderen auf der Zuordnung. */
  const FAELLE = [
    { name: "eintraege", fn: eintraege, marke: "FROM assignments a",
      agentur: "a.supplier_org_id = $1", kunde: "a.org_id = $1" },
    { name: "doppelbelegungen", fn: doppelbelegungen, marke: "FROM worker_assignment_links a",
      agentur: "a.supplier_org_id = $1", kunde: "a.org_id = $1" },
    { name: "abwesenheiten", fn: abwesenheiten, marke: "FROM worker_absences",
      agentur: "l.supplier_org_id = $1", kunde: "l.org_id = $1" },
    { name: "ablaufendeNachweise", fn: ablaufendeNachweise, marke: "FROM worker_profile_documents",
      agentur: "l.supplier_org_id = $1", kunde: "l.org_id = $1" }
  ];

  for (const f of FAELLE) {
    it(`${f.name}: die Agenturspur filtert auf den LIEFERANTEN, nie auf den Entleiher`, async () => {
      const p = musterPool();
      await f.fn(p, { orgId: "org-1", seite: "agentur", fenster: FENSTER });
      const [abfrage] = p.find(f.marke);
      assert.ok(abfrage, `die Abfrage ${f.name} muss laufen`);
      assert.ok(abfrage.sql.includes(f.agentur),
        `erwartet: ${f.agentur}\n` + abfrage.sql.slice(0, 320));
      assert.ok(!abfrage.sql.includes(f.kunde),
        `die Agentur darf NICHT auf ${f.kunde} filtern — das wären die Einsätze `
          + "einer fremden Seite");
    });

    it(`${f.name}: die Kundenspur filtert auf den ENTLEIHER, nie auf den Lieferanten`, async () => {
      const p = musterPool();
      await f.fn(p, { orgId: "org-1", seite: "kunde", fenster: FENSTER });
      const [abfrage] = p.find(f.marke);
      assert.ok(abfrage, `die Abfrage ${f.name} muss laufen`);
      assert.ok(abfrage.sql.includes(f.kunde),
        `erwartet: ${f.kunde}\n` + abfrage.sql.slice(0, 320));
      assert.ok(!abfrage.sql.includes(f.agentur),
        `der Kunde darf NICHT auf ${f.agentur} filtern`);
    });
  }
});

describe("K3.6 · was die Kundenspur nicht erfährt", () => {
  const FENSTER = { monat: "2026-04", von: "2026-04-01", bis: "2026-04-30", tage: 30 };

  const ABWESEND = [{
    id: "ab-1", art: "krank", von: "2026-04-10", bis: "2026-04-14",
    worker_user_id: "w-1", assignment_id: "a-1", kraft_name: "Lukas Bauer"
  }];
  const NACHWEIS = [{
    id: "d-1", title: "Staplerschein", category: "qualifikation",
    valid_until: "2026-04-20",
    worker_user_id: "w-1", assignment_id: "a-1", kraft_name: "Lukas Bauer"
  }];

  it("DASS jemand fehlt, sieht der Kunde — WARUM, nicht", async () => {
    const p = musterPool(() => ({ rows: ABWESEND }));

    const [fuerAgentur] = await abwesenheiten(p, { orgId: "org-1", seite: "agentur", fenster: FENSTER });
    assert.equal(fuerAgentur.abwesenheitsart, "krank",
      "die eigene Firma führt die Abwesenheit — sie darf den Grund sehen");

    const [fuerKunde] = await abwesenheiten(p, { orgId: "org-1", seite: "kunde", fenster: FENSTER });
    assert.equal(fuerKunde.abwesenheitsart, null,
      "der Grund einer Abwesenheit ist eine Personalangelegenheit der Zeitarbeitsfirma");
    assert.equal(fuerKunde.von, "2026-04-10",
      "DASS jemand fehlt, bleibt sichtbar — sonst könnte der Kunde nicht umplanen");
    assert.equal(fuerKunde.grad, "hart");
  });

  it("WELCHER Nachweis abläuft, sieht der Kunde nicht", async () => {
    const p = musterPool(() => ({ rows: NACHWEIS }));

    const [fuerAgentur] = await ablaufendeNachweise(p, { orgId: "org-1", seite: "agentur", fenster: FENSTER });
    assert.equal(fuerAgentur.nachweis, "Staplerschein");

    const [fuerKunde] = await ablaufendeNachweise(p, { orgId: "org-1", seite: "kunde", fenster: FENSTER });
    assert.equal(fuerKunde.nachweis, null,
      "welche Qualifikation jemand hat, ist Sache der Zeitarbeitsfirma");
    assert.equal(fuerKunde.von, "2026-04-20",
      "DASS etwas abläuft, bleibt sichtbar — der Einsatz hängt davon ab");
  });

  it("die Spur entscheidet, nicht die abfragende Organisation", async () => {
    /* Die Redaktion haengt am Wort "agentur", nicht daran, wem `orgId` gehoert.
     * Ein Flip auf "kunde" oder ein leerer Vergleich gaebe beides frei. */
    const p = musterPool(() => ({ rows: ABWESEND }));
    for (const seite of ["kunde", "", null, undefined, "AGENTUR"]) {
      const [z] = await abwesenheiten(p, { orgId: "org-1", seite, fenster: FENSTER });
      assert.equal(z.abwesenheitsart, null,
        `Spur ${JSON.stringify(seite)} ist nicht "agentur" und darf den Grund nicht sehen`);
    }
  });
});

describe("K3.6 · die Platzhalter-Unendlichkeit verlässt den Dienst nicht", () => {
  it("ein offenes Ende kommt aus der VORSCHAU als `null`, nicht als 9999-12-31", async () => {
    /* `DATE '9999-12-31'` ist die Rechenhilfe der Abfrage, kein Datum. Käme sie
     * durch, stünde auf der Fläche ein Konflikt "bis 31.12.9999" — und jede
     * Sortierung nach Enddatum wäre still verdreht.
     *
     * Nur die VORSCHAU braucht diese Umsetzung: die Monatsansicht kappt die
     * Überschneidung ohnehin am Fensterrand (`LEAST(…, $3::date)`), dort kann
     * die Unendlichkeit gar nicht entstehen. */
    const p = musterPool((sql) => {
      if (/FROM assignments a\s*\n\s*LEFT JOIN organizations o/.test(sql)) {
        return { rows: [{
          id: "a-1", org_id: "kunde-1", supplier_org_id: "org-1", status: "active",
          von: "2026-04-01", bis: null, kunde_name: "Nordbau GmbH",
          kraft_org: "org-1", kraft_name: "Lukas Bauer"
        }] };
      }
      if (/FROM worker_assignment_links l\s*\n\s*JOIN assignments e/.test(sql)) {
        return { rows: [{
          assignment_id: "a-2", org_id: "kunde-2", gegenseite_org_name: "Südbau AG",
          gegen_von: "2026-04-05", gegen_bis: "9999-12-31",
          ueberschneidung_von: "2026-04-05", ueberschneidung_bis: "9999-12-31"
        }] };
      }
      return null;
    });

    const e = await planungsVorschau(p, {
      orgId: "org-1", seite: "agentur", workerUserId: "w-1", assignmentId: "a-1"
    });
    const [k] = e.konflikte.filter((x) => x.art === "doppelbelegung");
    assert.ok(k, "die Kollision muss gemeldet werden");
    assert.equal(k.bis, null,
      "die Platzhalter-Unendlichkeit wird zu `offen`, nicht zu einem Datum");
    assert.equal(k.von, "2026-04-05");
  });

  it("die Monatsansicht kappt am Fensterrand, statt die Unendlichkeit zu melden", async () => {
    const p = musterPool(() => ({ rows: [] }));
    await doppelbelegungen(p, {
      orgId: "org-1", seite: "agentur",
      fenster: { monat: "2026-04", von: "2026-04-01", bis: "2026-04-30", tage: 30 }
    });
    const [abfrage] = p.find("FROM worker_assignment_links a");
    assert.match(abfrage.sql, /LEAST\([\s\S]*\$3::date\)\s+AS ueberschneidung_bis/,
      "ohne die Kappung am Fensterrand träte die Unendlichkeit auch hier aus");
  });
});

describe("K3.6 · die Spur fällt im Zweifel auf die ENGERE", () => {
  it("ohne Organisationstyp gilt die Kundenspur", async () => {
    /* Der Rückfall darf nie die weitere Sicht öffnen: die Agenturspur zeigt bei
     * einer Doppelbelegung den Namen der Gegenseite. */
    for (const zeile of [{}, { type: null }, { type: "" }, { type: "company" }, { type: "COMPANY" }]) {
      const p = musterPool(() => ({ rows: [zeile] }));
      assert.equal(await seiteFuerOrg(p, "org-1"), "kunde",
        `Typ ${JSON.stringify(zeile)} darf nicht zur Agentursicht führen`);
    }
  });

  it("gar keine Zeile — und ein Fehler — enden ebenfalls bei der Kundenspur", async () => {
    const leer = musterPool(() => ({ rows: [] }));
    assert.equal(await seiteFuerOrg(leer, "org-1"), "kunde");

    const kaputt = { query: async () => { throw new Error("DB weg"); } };
    assert.equal(await seiteFuerOrg(kaputt, "org-1"), "kunde",
      "eine Mandantengrenze, die sich beim Stolpern öffnet, ist keine");
  });

  it("nur `agency` öffnet die Agentursicht", async () => {
    const p = musterPool(() => ({ rows: [{ type: "agency" }] }));
    assert.equal(await seiteFuerOrg(p, "org-1"), "agentur");
  });
});
