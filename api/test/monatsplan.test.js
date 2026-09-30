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


/* ═══════════════════════════════════════════════════════════════════════════
   K3.8 · die Form der Abfrage, die Parameter und die Gestalt der Antwort

   Owner-Vorgabe 2026-09-01: 90 % Mutations-Punktzahl JE BEREICH.

   Die drei Klassen, die eine DB-freie Schicht bisher nicht abdeckte, sind KEINE
   Rauschklassen — sie sind der Vertrag der Abfrage:

     * DIE FORM. Eine Abfrage, der eine Bedingung fehlt, liefert zu viel; eine
       ohne Sortierung liefert Zufall. Der Muster-Pool führt nichts aus, also
       muss die Form WÖRTLICH festgehalten werden. (Dass sie auch gültiges
       Postgres ist, beweist der Container-Lauf — beide Schichten zusammen, nicht
       eine allein.)

     * DIE PARAMETER. `$1` ist die Mandantengrenze. Eine vertauschte oder
       fehlende Bindung ist kein Formfehler, sondern ein Datenleck.

     * DIE GESTALT DER ANTWORT. Jedes Feld, das die Fläche liest, muss da sein
       und heißen wie vereinbart. Ein weggefallenes Feld ist auf der Fläche ein
       leerer Platz — und leere Plätze sind in dieser Welle mehrfach als
       „kein Befund" missverstanden worden.
   ═══════════════════════════════════════════════════════════════════════════ */

describe("K3.8 · jede Abfrage hält ihre Form", () => {
  const F = { monat: "2026-04", von: "2026-04-01", bis: "2026-04-30", tage: 30 };

  /* Je Abfrage: die Bestandteile, ohne die sie etwas anderes bedeutet. */
  const FORMEN = [
    {
      name: "eintraege",
      lauf: (p) => eintraege(p, { orgId: "org-1", seite: "agentur", fenster: F }),
      marke: "FROM assignments a",
      muss: [
        "LEFT JOIN organizations o ON o.id = a.org_id",
        "LEFT JOIN organizations s ON s.id = a.supplier_org_id",
        "LEFT JOIN LATERAL",
        "FROM worker_assignment_links l",
        "json_agg(json_build_object(",
        "'worker_user_id', l.worker_user_id",
        "a.status = ANY($4::text[])",
        "a.start_date <= $3::date",
        "ORDER BY a.start_date ASC, a.id ASC"
      ],
      params: ["org-1", "2026-04-01", "2026-04-30", ["planned", "active", "completed"]]
    },
    {
      name: "bedarfe",
      lauf: (p) => bedarfe(p, { orgId: "org-1", seite: "kunde", fenster: F }),
      marke: "FROM demand_requests",
      muss: [
        "FROM offers of",
        "of.demand_request_id = d.id AND of.confirmed_at IS NOT NULL",
        "AS besetzt",
        "d.start_date <= $3::date",
        "COALESCE(d.end_date, DATE '9999-12-31') >= $2::date",
        "ORDER BY d.start_date ASC, d.id ASC"
      ],
      params: ["org-1", "2026-04-01", "2026-04-30"]
    },
    {
      name: "doppelbelegungen",
      lauf: (p) => doppelbelegungen(p, { orgId: "org-1", seite: "agentur", fenster: F }),
      marke: "FROM worker_assignment_links a",
      muss: [
        "SELECT DISTINCT ON (a.worker_user_id, b.assignment_id)",
        "JOIN assignments ea ON ea.id = a.assignment_id",
        "AND b.id <> a.id",
        "AND b.assignment_id <> a.assignment_id",
        "JOIN assignments eb ON eb.id = b.assignment_id",
        "LEFT JOIN worker_profiles wp ON wp.user_id = a.worker_user_id",
        "LEFT JOIN organizations og ON og.id = b.org_id",
        "AS ueberschneidung_von",
        "AS ueberschneidung_bis"
      ],
      params: ["org-1", "2026-04-01", "2026-04-30"]
    },
    {
      name: "abwesenheiten",
      lauf: (p) => abwesenheiten(p, { orgId: "org-1", seite: "agentur", fenster: F }),
      marke: "FROM worker_absences",
      muss: [
        "SELECT DISTINCT ON (ab.id, l.assignment_id)",
        "JOIN worker_profiles wp ON wp.id = ab.worker_profile_id",
        "JOIN worker_assignment_links l ON l.worker_user_id = wp.user_id",
        "JOIN assignments e ON e.id = l.assignment_id",
        "ab.zustand = 'wirksam'",
        "ORDER BY ab.id, l.assignment_id, ab.von"
      ],
      params: ["org-1", "2026-04-01", "2026-04-30"]
    },
    {
      name: "ablaufendeNachweise",
      lauf: (p) => ablaufendeNachweise(p, { orgId: "org-1", seite: "agentur", fenster: F }),
      marke: "FROM worker_profile_documents",
      muss: [
        "SELECT DISTINCT ON (d.id, l.assignment_id)",
        "JOIN worker_assignment_links l ON l.worker_user_id = d.worker_user_id",
        "d.valid_until BETWEEN $2::date AND $3::date",
        "ORDER BY d.id, l.assignment_id, d.valid_until"
      ],
      params: ["org-1", "2026-04-01", "2026-04-30"]
    },
    {
      name: "mitarbeiterDerFirma",
      lauf: (p) => mitarbeiterMonat(p, { orgId: "org-1", seite: "agentur", monat: "2026-04" }),
      marke: "FROM worker_profiles wp",
      muss: [
        "wp.supplier_org_id = $1",
        "wp.is_active = TRUE",
        "ORDER BY wp.last_name ASC NULLS LAST, wp.first_name ASC NULLS LAST, wp.id ASC"
      ],
      params: ["org-1"]
    }
  ];

  for (const f of FORMEN) {
    it(`${f.name}: alle Bestandteile stehen in der Abfrage`, async () => {
      const p = musterPool();
      await f.lauf(p);
      const [abfrage] = p.find(f.marke);
      assert.ok(abfrage, `${f.name}: die Abfrage muss laufen`);
      for (const teil of f.muss) {
        assert.ok(abfrage.sql.includes(teil),
          `${f.name}: es fehlt »${teil}«\n\n` + abfrage.sql);
      }
    });

    it(`${f.name}: die Bindungen stimmen — $1 ist die Mandantengrenze`, async () => {
      const p = musterPool();
      await f.lauf(p);
      const [abfrage] = p.find(f.marke);
      assert.deepEqual(abfrage.params, f.params,
        `${f.name}: eine vertauschte Bindung ist kein Formfehler, sondern ein Datenleck`);
    });
  }

  it("die Vorschau bindet Kraft und Einsatz, nicht die Organisation", async () => {
    /* Die Vorschau filtert NICHT nach `orgId` — sie prüft vorher, dass Einsatz
     * UND Kraft der Firma gehören, und fragt danach über die Kennungen. Diese
     * Trennung ist Absicht und wird hier festgehalten. */
    const p = musterPool((sql) => {
      if (/FROM assignments a\s*\n\s*LEFT JOIN organizations o/.test(sql)) {
        return { rows: [{
          id: "a-1", org_id: "kunde-1", supplier_org_id: "org-1", status: "active",
          von: "2026-04-01", bis: "2026-04-30", kunde_name: "Nordbau GmbH",
          kraft_org: "org-1", kraft_name: "Lukas Bauer"
        }] };
      }
      return null;
    });
    await planungsVorschau(p, {
      orgId: "org-1", seite: "agentur", workerUserId: "w-1", assignmentId: "a-1"
    });

    const [kontext] = p.find("LEFT JOIN worker_profiles wp ON wp.user_id = $2");
    assert.ok(kontext, "der Zusammenhang wird über EINE Abfrage geholt");
    assert.deepEqual(kontext.params, ["a-1", "w-1"]);

    const [kollision] = p.find("FROM worker_assignment_links l");
    assert.deepEqual(kollision.params, ["w-1", "a-1", "2026-04-01", "2026-04-30"]);

    const [ab] = p.find("FROM worker_absences ab");
    assert.deepEqual(ab.params, ["w-1", "org-1", "2026-04-01", "2026-04-30"]);

    const [nw] = p.find("FROM worker_profile_documents d");
    assert.deepEqual(nw.params, ["w-1", "org-1", "2026-04-01", "2026-04-30"]);
  });

  it("die Belegschafts-Abfragen binden die Kennungen als Feld, nicht einzeln", async () => {
    /* `= ANY($1::uuid[])` ist der Unterschied zwischen EINER Abfrage und
     * dreihundert. Ohne die Feld-Bindung wäre der Skalierungswächter zwar
     * grün — er zählt Abfragen —, aber die Form wäre eine andere. */
    const p = musterPool((sql) => {
      if (/FROM worker_profiles wp\s*\n\s*WHERE wp\.supplier_org_id/.test(sql)) {
        return { rows: [
          { profil_id: "p-1", user_id: "w-1", name: "Anna Berg", personnel_number: "A-1", is_active: true },
          { profil_id: "p-2", user_id: "w-2", name: "Bernd Cato", personnel_number: "A-2", is_active: true }
        ] };
      }
      return null;
    });
    await mitarbeiterMonat(p, { orgId: "org-1", seite: "agentur", monat: "2026-04" });

    const [belegung] = p.find("FROM worker_assignment_links l");
    assert.match(belegung.sql, /l\.worker_user_id = ANY\(\$1::uuid\[\]\)/);
    assert.deepEqual(belegung.params, [["w-1", "w-2"], "2026-04-01", "2026-04-30"]);

    const [ab] = p.find("FROM worker_absences ab");
    assert.match(ab.sql, /ab\.worker_profile_id = ANY\(\$1::uuid\[\]\)/);
    assert.deepEqual(ab.params, [["p-1", "p-2"], "org-1", "2026-04-01", "2026-04-30"]);

    const [nw] = p.find("FROM worker_profile_documents d");
    assert.match(nw.sql, /d\.worker_user_id = ANY\(\$1::uuid\[\]\)/);
    assert.deepEqual(nw.params, [["w-1", "w-2"], "org-1", "2026-04-01", "2026-04-30"]);
  });

  it("ohne Mitarbeiter läuft KEINE Folgeabfrage — leere Kennungslisten fragen nichts", async () => {
    /* `= ANY('{}')` fände nie etwas und kostete trotzdem drei Abfragen je
     * Seitenaufruf. Der frühe Ausstieg ist keine Feinoptimierung: er ist der
     * Unterschied zwischen „nichts zu tun" und „dreimal nichts fragen". */
    const p = musterPool(() => ({ rows: [] }));
    const plan = await mitarbeiterMonat(p, { orgId: "org-1", seite: "agentur", monat: "2026-04" });
    assert.deepEqual(plan.mitarbeiter, []);
    assert.equal(p.find("FROM worker_assignment_links l").length, 0);
    assert.equal(p.find("FROM worker_absences ab").length, 0);
    assert.equal(p.find("FROM worker_profile_documents d").length, 0);
    assert.equal(p.calls.length, 1, "genau eine Abfrage: die nach den Mitarbeitern");
  });
});


/* ═══════════════════════════════════════════════════════════════════════════
   K3.8 · die Gestalt der Antwort — vollständig, nicht stichprobenartig

   `deepEqual` auf das GANZE Objekt statt einzelner Felder. Der Unterschied ist
   nicht Gründlichkeit, sondern Richtung: eine Feldprobe sagt, was da sein muss;
   eine Gestaltprobe sagt zusätzlich, was NICHT da sein darf. Ein zusätzliches
   Feld ist auf einer Fläche unsichtbar — und in einer Antwort, die über die
   Mandantengrenze geht, ist genau das der Schaden.
   ═══════════════════════════════════════════════════════════════════════════ */

describe("K3.8 · die Gestalt der Konflikte", () => {
  const F = { monat: "2026-04", von: "2026-04-01", bis: "2026-04-30", tage: 30 };

  it("Doppelbelegung: jedes Feld, und kein Feld zu viel", async () => {
    const p = musterPool(() => ({ rows: [{
      worker_user_id: "w-1", kraft_name: "Lukas Bauer",
      eigener_einsatz: "a-1", eigener_von: "2026-04-01", eigener_bis: "2026-04-30",
      gegenseite_assignment_id: "a-2", gegenseite_org_id: "kunde-2",
      gegenseite_org_name: "Südbau AG",
      gegen_von: "2026-04-05", gegen_bis: "2026-04-20",
      ueberschneidung_von: "2026-04-05", ueberschneidung_bis: "2026-04-20"
    }] }));

    assert.deepEqual(
      await doppelbelegungen(p, { orgId: "org-1", seite: "agentur", fenster: F }),
      [{
        art: "doppelbelegung", grad: "hart",
        worker_user_id: "w-1", kraft_name: "Lukas Bauer",
        einsatz_id: "a-1", von: "2026-04-05", bis: "2026-04-20",
        gegenseite_assignment_id: "a-2", gegenseite_org_id: "kunde-2",
        gegenseite_org_name: "Südbau AG"
      }]
    );
  });

  it("Doppelbelegung ohne Namen: die Felder bleiben, die Werte werden null", async () => {
    /* Der Rückfall `x || null` hat zwei Seiten. Nur eine zu prüfen lässt offen,
     * ob der Rückfall überhaupt greift — oder ob dort `undefined` steht, was
     * `JSON.stringify` still weglässt. */
    const p = musterPool(() => ({ rows: [{
      worker_user_id: "w-1", kraft_name: null,
      eigener_einsatz: "a-1",
      gegenseite_assignment_id: "a-2", gegenseite_org_id: "kunde-2",
      gegenseite_org_name: null,
      ueberschneidung_von: "2026-04-05", ueberschneidung_bis: "2026-04-20"
    }] }));

    const [k] = await doppelbelegungen(p, { orgId: "org-1", seite: "agentur", fenster: F });
    assert.equal(k.kraft_name, null);
    assert.equal(k.gegenseite_org_name, null);
    assert.ok("kraft_name" in k && "gegenseite_org_name" in k,
      "die Felder verschwinden nicht — `undefined` würde aus der Antwort fallen");
  });

  it("Abwesenheit: jedes Feld, und kein Feld zu viel", async () => {
    const p = musterPool(() => ({ rows: [{
      id: "ab-1", art: "krank", von: "2026-04-10", bis: "2026-04-14",
      worker_user_id: "w-1", assignment_id: "a-1", kraft_name: "Lukas Bauer"
    }] }));

    assert.deepEqual(
      await abwesenheiten(p, { orgId: "org-1", seite: "agentur", fenster: F }),
      [{
        art: "abwesenheit", grad: "hart",
        worker_user_id: "w-1", kraft_name: "Lukas Bauer", einsatz_id: "a-1",
        von: "2026-04-10", bis: "2026-04-14", abwesenheitsart: "krank"
      }]
    );
  });

  it("ablaufender Nachweis: jedes Feld, und der Zeitraum ist EIN Tag", async () => {
    /* `von` und `bis` sind derselbe Tag: ein Nachweis läuft an einem Datum ab,
     * er dauert nicht. Fiele eines der beiden weg, zeichnete das Raster einen
     * Balken bis zum Monatsrand. */
    const p = musterPool(() => ({ rows: [{
      id: "d-1", title: "Staplerschein", category: "qualifikation",
      valid_until: "2026-04-20",
      worker_user_id: "w-1", assignment_id: "a-1", kraft_name: "Lukas Bauer"
    }] }));

    assert.deepEqual(
      await ablaufendeNachweise(p, { orgId: "org-1", seite: "agentur", fenster: F }),
      [{
        art: "nachweis_laeuft_ab", grad: "weich",
        worker_user_id: "w-1", kraft_name: "Lukas Bauer", einsatz_id: "a-1",
        von: "2026-04-20", bis: "2026-04-20", nachweis: "Staplerschein"
      }]
    );
  });

  it("ohne Titel tritt die Kategorie an seine Stelle", async () => {
    const p = musterPool(() => ({ rows: [{
      id: "d-1", title: null, category: "qualifikation", valid_until: "2026-04-20",
      worker_user_id: "w-1", assignment_id: "a-1", kraft_name: null
    }] }));
    const [n] = await ablaufendeNachweise(p, { orgId: "org-1", seite: "agentur", fenster: F });
    assert.equal(n.nachweis, "qualifikation");
  });

  it("offener Bedarf: jedes Feld, und die geschlossenen fallen raus", async () => {
    const zeilen = [
      { id: "b-1", title: "Zwei Staplerfahrer", role: "Stapler", headcount: 2,
        status: "open", start_date: "2026-04-10", end_date: "2026-04-20", besetzt: false },
      { id: "b-2", title: "Besetzt", role: "Lager", headcount: 1,
        status: "open", start_date: "2026-04-01", end_date: null, besetzt: true },
      { id: "b-3", title: "Storniert", role: "Lager", headcount: 1,
        status: "cancelled", start_date: "2026-04-01", end_date: null, besetzt: false },
      { id: "b-4", title: "Geschlossen", role: "Lager", headcount: 1,
        status: "closed", start_date: "2026-04-01", end_date: null, besetzt: false }
    ];
    assert.deepEqual(offeneBedarfe(zeilen), [{
      art: "bedarf_offen", grad: "weich", bedarf_id: "b-1",
      titel: "Zwei Staplerfahrer", koepfe: 2,
      von: "2026-04-10", bis: "2026-04-20"
    }]);
  });

  it("ohne Titel trägt der Bedarf seine Rolle, ohne Kopfzahl steht null", async () => {
    assert.deepEqual(offeneBedarfe([
      { id: "b-1", title: null, role: "Stapler", headcount: null,
        status: "open", start_date: "2026-04-10", end_date: null, besetzt: false }
    ]), [{
      art: "bedarf_offen", grad: "weich", bedarf_id: "b-1",
      titel: "Stapler", koepfe: null, von: "2026-04-10", bis: null
    }]);
  });
});

describe("K3.8 · die Gestalt des Monats", () => {
  it("der Monat trägt genau die vereinbarten Felder", async () => {
    const p = musterPool(() => ({ rows: [] }));
    const plan = await monatsplan(p, { orgId: "org-1", seite: "agentur", monat: "2026-04" });

    assert.deepEqual(Object.keys(plan).sort(), [
      "aueg_nur_plattformdaten", "bedarfe", "eintraege", "fenster", "konflikte",
      "naechster", "nicht_geprueft", "org_id", "seite", "vorheriger", "zusammenfassung"
    ], "ein zusätzliches Feld ist auf der Fläche unsichtbar — in der Antwort nicht");

    assert.deepEqual(plan.fenster,
      { monat: "2026-04", von: "2026-04-01", bis: "2026-04-30", tage: 30 });
    assert.deepEqual(plan.zusammenfassung, {
      eintraege: 0, beginnt_vorher: 0, endet_spaeter: 0,
      bedarfe: 0, konflikte_hart: 0, konflikte_weich: 0
    });
    assert.deepEqual(plan.nicht_geprueft, [],
      "alle fünf Konfliktarten werden geprüft — die Liste bleibt leer, aber sie ist da");
    assert.equal(plan.aueg_nur_plattformdaten, true);
    assert.equal(plan.org_id, "org-1");
  });

  it("die Zusammenfassung zählt die gelieferten Zeilen, nicht die Datenbank", async () => {
    const p = musterPool((sql) => {
      if (/FROM assignments a/.test(sql)) {
        return { rows: [
          { id: "a-1", org_id: "k-1", status: "active", kraefte: [],
            beginnt_vorher: true, offen: false, endet_spaeter: false,
            start_date: "2026-03-01", planned_end_date: "2026-04-10" },
          { id: "a-2", org_id: "k-1", status: "active", kraefte: [],
            beginnt_vorher: false, offen: true, endet_spaeter: false,
            start_date: "2026-04-05", planned_end_date: null }
        ] };
      }
      return { rows: [] };
    });
    const plan = await monatsplan(p, { orgId: "org-1", seite: "agentur", monat: "2026-04" });
    assert.equal(plan.zusammenfassung.eintraege, 2);
    assert.equal(plan.zusammenfassung.beginnt_vorher, 1);
    assert.equal(plan.zusammenfassung.endet_spaeter, 1, "`offen` zählt als »läuft weiter«");
    assert.deepEqual(plan.eintraege.map((z) => z.randvermerk),
      [null, RANDVERMERK.laeuft_noch]);
  });

  it("die Belegschaft trägt genau die vereinbarten Felder", async () => {
    const p = musterPool((sql) => {
      if (/FROM worker_profiles wp\s*\n\s*WHERE wp\.supplier_org_id/.test(sql)) {
        return { rows: [{ profil_id: "p-1", user_id: "w-1", name: "Anna Berg",
          personnel_number: "A-1", is_active: true }] };
      }
      if (/FROM worker_assignment_links l\s*\n\s*JOIN assignments e/.test(sql)) {
        return { rows: [{
          worker_user_id: "w-1", assignment_id: "a-1", org_id: "kunde-1",
          entleiher_name: "Nordbau GmbH", status: "active",
          von: "2026-04-01", bis: "2026-04-10",
          beginnt_vorher: false, endet_spaeter: false
        }] };
      }
      return { rows: [] };
    });
    const plan = await mitarbeiterMonat(p, { orgId: "org-1", seite: "agentur", monat: "2026-04" });

    assert.deepEqual(Object.keys(plan).sort(), [
      "fenster", "mitarbeiter", "naechster", "org_id", "seite", "vorheriger", "zusammenfassung"
    ]);
    assert.deepEqual(plan.mitarbeiter, [{
      profil_id: "p-1", worker_user_id: "w-1", name: "Anna Berg",
      personalnummer: "A-1", ohne_konto: false,
      belegungen: [{
        assignment_id: "a-1", entleiher_org_id: "kunde-1", entleiher_name: "Nordbau GmbH",
        status: "active", von: "2026-04-01", bis: "2026-04-10",
        beginnt_vorher: false, randvermerk: null
      }],
      abwesenheiten: [], nachweise: [],
      frei: [{ von: "2026-04-11", bis: "2026-04-30", tage: 20 }],
      freie_tage: 20, tage_im_monat: 30, auslastung_prozent: 33
    }]);
    assert.deepEqual(plan.zusammenfassung, {
      mitarbeiter: 1, ganz_frei: 0, teilweise_frei: 1, ganz_belegt: 0, ohne_konto: 0
    });
  });

  it("die Vorschau trägt genau die vereinbarten Felder", async () => {
    const p = musterPool((sql) => {
      if (/FROM assignments a\s*\n\s*LEFT JOIN organizations o/.test(sql)) {
        return { rows: [{
          id: "a-1", org_id: "kunde-1", supplier_org_id: "org-1", status: "active",
          von: "2026-04-01", bis: "2026-04-30", kunde_name: "Nordbau GmbH",
          kraft_org: "org-1", kraft_name: "Lukas Bauer"
        }] };
      }
      return { rows: [] };
    });
    const e = await planungsVorschau(p, {
      orgId: "org-1", seite: "agentur", workerUserId: "w-1", assignmentId: "a-1"
    });
    assert.deepEqual(e, {
      einsatz_id: "a-1", worker_user_id: "w-1", kraft_name: "Lukas Bauer",
      von: "2026-04-01", bis: "2026-04-30",
      konflikte: [], zusammenfassung: { hart: 0, weich: 0 },
      nur_plattformdaten: true
    });
  });

  it("ein Einsatz ohne Ende: die Vorschau liefert `bis: null`, nicht das Fensterende", async () => {
    const p = musterPool((sql) => {
      if (/FROM assignments a\s*\n\s*LEFT JOIN organizations o/.test(sql)) {
        return { rows: [{
          id: "a-1", org_id: "kunde-1", supplier_org_id: "org-1", status: "active",
          von: "2026-04-01", bis: null, kunde_name: "Nordbau GmbH",
          kraft_org: "org-1", kraft_name: null
        }] };
      }
      return { rows: [] };
    });
    const e = await planungsVorschau(p, {
      orgId: "org-1", seite: "agentur", workerUserId: "w-1", assignmentId: "a-1"
    });
    assert.equal(e.bis, null);
    assert.equal(e.kraft_name, null);
  });
});

describe("K3.8 · die Konfliktarten sind eine feste Tafel", () => {
  it("fünf Arten, jede mit Grad und Prüfstand", () => {
    /* Die Tafel ist die einzige Stelle, an der steht, WAS es überhaupt an
     * Konflikten gibt. Fiele ein Grad von "hart" auf "weich", wäre eine
     * Doppelbelegung plötzlich ein offener Punkt — physisch unmöglich, aber
     * optisch harmlos. */
    assert.deepEqual(KONFLIKTARTEN, {
      doppelbelegung: { grad: "hart", geprueft: true },
      abwesenheit: { grad: "hart", geprueft: true },
      aueg_frist: { grad: "hart", geprueft: true },
      bedarf_offen: { grad: "weich", geprueft: true },
      nachweis_laeuft_ab: { grad: "weich", geprueft: true }
    });
    assert.ok(Object.isFrozen(KONFLIKTARTEN), "die Tafel wird nicht zur Laufzeit ergänzt");
  });

  it("die beiden Spuren sind genau zwei, und die engere steht zuerst", () => {
    assert.deepEqual(SEITEN, ["kunde", "agentur"]);
    assert.ok(Object.isFrozen(SEITEN));
  });

  it("die Randvermerke heißen so, wie die Fläche sie nachschlägt", () => {
    /* `t('mp.rand.' + z.randvermerk)` — ein umbenannter Vermerk fände auf der
     * Fläche keinen Text und bliebe leer. */
    assert.deepEqual(RANDVERMERK, { laeuft_noch: "laeuft_noch", endet_spaeter: "endet_spaeter" });
    assert.ok(Object.isFrozen(RANDVERMERK));
  });
});


/* ═══════════════════════════════════════════════════════════════════════════
   K3.8 · die reine Rechnung, vollständig

   `freieSpannen` hat keine Datenbank, keine Zeit, keinen Zufall — sie ist damit
   die einzige Stelle der Monatsplanung, die sich ERSCHÖPFEND prüfen lässt. Dass
   dort 24 Mutanten überlebten, war kein Messfehler, sondern eine Lücke: acht
   Beispiele decken keine Funktion ab, deren Ergebnis ein Disponent für bare
   Münze nimmt.

   Die Proben pinnen deshalb EIGENSCHAFTEN, nicht nur Beispiele: dass die Spannen
   im Fenster liegen, dass sie sich nicht berühren, dass die Tageszahl zum Datum
   passt, und dass keine Reihenfolge der Eingabe das Ergebnis ändert.
   ═══════════════════════════════════════════════════════════════════════════ */

describe("K3.8 · freieSpannen — die Eigenschaften, nicht nur Beispiele", () => {
  const APRIL = { monat: "2026-04", von: "2026-04-01", bis: "2026-04-30", tage: 30 };
  const FEB = { monat: "2028-02", von: "2028-02-01", bis: "2028-02-29", tage: 29 };

  /** Tage zwischen zwei Kalendertagen, einschliesslich beider. */
  function tageEinschliesslich(von, bis) {
    const a = Date.UTC(+von.slice(0, 4), +von.slice(5, 7) - 1, +von.slice(8, 10));
    const b = Date.UTC(+bis.slice(0, 4), +bis.slice(5, 7) - 1, +bis.slice(8, 10));
    return Math.round((b - a) / 86400000) + 1;
  }

  function pruefeEigenschaften(frei, fenster) {
    let vorher = null;
    for (const f of frei) {
      assert.ok(f.von >= fenster.von, `${f.von} liegt vor dem Fenster`);
      assert.ok(f.bis <= fenster.bis, `${f.bis} liegt hinter dem Fenster`);
      assert.ok(f.von <= f.bis, `${f.von}–${f.bis} ist verdreht`);
      assert.equal(f.tage, tageEinschliesslich(f.von, f.bis),
        `die Tageszahl von ${f.von}–${f.bis} passt nicht zum Datum`);
      if (vorher) {
        assert.ok(f.von > vorher.bis, "zwei freie Spannen dürfen sich nicht berühren");
      }
      vorher = f;
    }
  }

  it("die Tageszahl passt IMMER zum Datum — über alle Beispiele", () => {
    /* Ein Mutant, der `+ 1` weglässt oder `tageZwischen` verdreht, überlebt
     * jedes Einzelbeispiel, bei dem man die Zahl nicht nachrechnet. */
    const beispiele = [
      [],
      [{ von: "2026-04-10", bis: "2026-04-20" }],
      [{ von: "2026-04-01", bis: "2026-04-01" }],
      [{ von: "2026-04-30", bis: "2026-04-30" }],
      [{ von: "2026-04-05", bis: "2026-04-15" }, { von: "2026-04-10", bis: "2026-04-20" }],
      [{ von: "2026-04-02", bis: null }],
      [{ von: "2025-01-01", bis: "2026-04-15" }]
    ];
    for (const b of beispiele) pruefeEigenschaften(freieSpannen(b, APRIL), APRIL);
  });

  it("ein einzelner freier Tag am Monatsanfang zählt als EIN Tag", () => {
    assert.deepEqual(freieSpannen([{ von: "2026-04-02", bis: "2026-04-30" }], APRIL),
      [{ von: "2026-04-01", bis: "2026-04-01", tage: 1 }]);
  });

  it("ein einzelner freier Tag am Monatsende zählt als EIN Tag", () => {
    assert.deepEqual(freieSpannen([{ von: "2026-04-01", bis: "2026-04-29" }], APRIL),
      [{ von: "2026-04-30", bis: "2026-04-30", tage: 1 }]);
  });

  it("ein Schaltjahr-Februar hat 29 freie Tage", () => {
    /* Die Tageszahl kommt aus dem Datum, nicht aus einer festen 30. */
    assert.deepEqual(freieSpannen([], FEB),
      [{ von: "2028-02-01", bis: "2028-02-29", tage: 29 }]);
  });

  it("die Reihenfolge der Eingabe ändert das Ergebnis NICHT", () => {
    /* Ohne Sortierung entstünden je nach Eingabereihenfolge andere Lücken —
     * derselbe Monat sähe zweimal verschieden aus. */
    const vorwaerts = [
      { von: "2026-04-03", bis: "2026-04-05" },
      { von: "2026-04-10", bis: "2026-04-12" },
      { von: "2026-04-20", bis: "2026-04-22" }
    ];
    const rueckwaerts = [...vorwaerts].reverse();
    const gemischt = [vorwaerts[1], vorwaerts[2], vorwaerts[0]];

    const erwartet = freieSpannen(vorwaerts, APRIL);
    assert.deepEqual(freieSpannen(rueckwaerts, APRIL), erwartet);
    assert.deepEqual(freieSpannen(gemischt, APRIL), erwartet);
    assert.equal(erwartet.length, 4, "drei Belegungen mitten im Monat lassen vier Lücken");
    pruefeEigenschaften(erwartet, APRIL);
  });

  it("eine Belegung, die vollständig in einer anderen liegt, erzeugt keine Lücke", () => {
    /* Der Zeiger darf nicht zurückspringen. Täte er es, entstünde hinter der
     * enthaltenen Spanne eine freie Zeit, die es nicht gibt — und ein Disponent
     * besetzte einen Tag doppelt. */
    const frei = freieSpannen([
      { von: "2026-04-05", bis: "2026-04-25" },
      { von: "2026-04-10", bis: "2026-04-15" }
    ], APRIL);
    assert.deepEqual(frei, [
      { von: "2026-04-01", bis: "2026-04-04", tage: 4 },
      { von: "2026-04-26", bis: "2026-04-30", tage: 5 }
    ]);
    pruefeEigenschaften(frei, APRIL);
  });

  it("eine Belegung ohne Beginn wird an den Monatsanfang geklemmt", () => {
    assert.deepEqual(freieSpannen([{ von: null, bis: "2026-04-10" }], APRIL),
      [{ von: "2026-04-11", bis: "2026-04-30", tage: 20 }]);
  });

  it("eine verdrehte Belegung (Ende vor Beginn) wird verworfen, nicht gerechnet", () => {
    assert.deepEqual(freieSpannen([{ von: "2026-04-20", bis: "2026-04-10" }], APRIL),
      [{ von: "2026-04-01", bis: "2026-04-30", tage: 30 }]);
  });

  it("eine Belegung, die komplett VOR dem Monat endet, lässt ihn ganz frei", () => {
    assert.deepEqual(freieSpannen([{ von: "2026-01-01", bis: "2026-02-28" }], APRIL),
      [{ von: "2026-04-01", bis: "2026-04-30", tage: 30 }]);
  });

  it("weder `null` noch `undefined` als Liste bringen die Rechnung durcheinander", () => {
    for (const eingabe of [null, undefined, []]) {
      assert.deepEqual(freieSpannen(eingabe, APRIL),
        [{ von: "2026-04-01", bis: "2026-04-30", tage: 30 }]);
    }
  });

  it("die Summe aus belegten und freien Tagen ergibt den Monat", () => {
    /* Die Probe, die alles zusammenhält: was nicht frei ist, muss belegt sein.
     * Ein Off-by-one an irgendeiner Kante verletzt sie sofort. */
    const faelle = [
      [{ von: "2026-04-10", bis: "2026-04-20" }],
      [{ von: "2026-04-01", bis: "2026-04-05" }, { von: "2026-04-25", bis: "2026-04-30" }],
      [{ von: "2026-03-20", bis: "2026-04-02" }, { von: "2026-04-28", bis: "2026-05-10" }]
    ];
    for (const belegt of faelle) {
      const frei = freieSpannen(belegt, APRIL);
      const freieTage = frei.reduce((n, f) => n + f.tage, 0);

      const belegteTage = new Set();
      for (const b of belegt) {
        for (let d = 1; d <= 30; d++) {
          const tag = "2026-04-" + String(d).padStart(2, "0");
          if (tag >= (b.von || APRIL.von) && tag <= (b.bis || APRIL.bis)) belegteTage.add(tag);
        }
      }
      assert.equal(freieTage + belegteTage.size, 30,
        `frei ${freieTage} + belegt ${belegteTage.size} ≠ 30`);
    }
  });
});

describe("K3.8 · der Randvermerk und das Fenster", () => {
  it("der Vermerk kennt genau drei Antworten", () => {
    assert.equal(randvermerk({ offen: true, endet_spaeter: false }), RANDVERMERK.laeuft_noch);
    assert.equal(randvermerk({ offen: true, endet_spaeter: true }), RANDVERMERK.laeuft_noch,
      "»läuft noch« schlägt »endet später« — ohne Ende gibt es kein Später");
    assert.equal(randvermerk({ offen: false, endet_spaeter: true }), RANDVERMERK.endet_spaeter);
    assert.equal(randvermerk({ offen: false, endet_spaeter: false }), null);
    assert.equal(randvermerk(null), null, "ohne Zeile kein Vermerk");
    assert.equal(randvermerk(undefined), null);
  });

  it("das Fenster stimmt für jeden Monatstyp", () => {
    assert.deepEqual(monatsfenster("2026-02"),
      { monat: "2026-02", von: "2026-02-01", bis: "2026-02-28", tage: 28 });
    assert.deepEqual(monatsfenster("2028-02"),
      { monat: "2028-02", von: "2028-02-01", bis: "2028-02-29", tage: 29 });
    assert.deepEqual(monatsfenster("2026-04"),
      { monat: "2026-04", von: "2026-04-01", bis: "2026-04-30", tage: 30 });
    assert.deepEqual(monatsfenster("2026-12"),
      { monat: "2026-12", von: "2026-12-01", bis: "2026-12-31", tage: 31 });
  });

  it("eine unbrauchbare Monatsangabe fällt auf den laufenden Monat zurück", () => {
    for (const roh of ["", "kaputt", "2026", "2026-1", "2026-13-01", null, undefined, 42]) {
      const f = monatsfenster(roh);
      assert.match(f.monat, /^\d{4}-\d{2}$/, `»${roh}« ergab ${f.monat}`);
      assert.equal(f.von, f.monat + "-01");
    }
  });

  it("das Blättern springt über Jahresgrenzen", () => {
    assert.deepEqual(nachbarmonate("2026-01"), { vorheriger: "2025-12", naechster: "2026-02" });
    assert.deepEqual(nachbarmonate("2026-12"), { vorheriger: "2026-11", naechster: "2027-01" });
    assert.deepEqual(nachbarmonate("2026-06"), { vorheriger: "2026-05", naechster: "2026-07" });
  });
});


/* ═══════════════════════════════════════════════════════════════════════════
   K3.8 · die wirksame Spanne, Tabellenkürzel für Tabellenkürzel

   `wirksamesEnde("a", "ea")` baut ein SQL-Stück aus zwei Kürzeln. Vertauscht
   man sie oder lässt eines leer, entsteht immer noch gültiges SQL — es zählt
   dann nur die falsche Tabelle. Acht Aufrufstellen, und keine einzige Probe sah
   hin: was herauskommt, steht mitten in einer Abfrage, die der Muster-Pool nie
   ausführt.

   Die wirksame Spanne ist der Kern der ganzen Welle (sie hat in K3.4 die
   Phantom-Doppelbelegung erledigt). Ein falsches Kürzel darin heißt: der Plan
   rechnet mit dem Ende eines fremden Einsatzes.
   ═══════════════════════════════════════════════════════════════════════════ */

describe("K3.8 · die wirksame Spanne steht mit den richtigen Kürzeln in der Abfrage", () => {
  const F = { monat: "2026-04", von: "2026-04-01", bis: "2026-04-30", tage: 30 };

  /** Das erwartete SQL-Stück für ein Paar (Zuordnung, Einsatz). */
  function ende(l, a) {
    return "LEAST(\n  COALESCE(" + l + ".end_date,          DATE '9999-12-31'),\n"
      + "  COALESCE(" + a + ".actual_end_date,   DATE '9999-12-31'),\n"
      + "  COALESCE(" + a + ".planned_end_date,  DATE '9999-12-31')\n)";
  }
  const beginn = (l, a) => `GREATEST(${l}.start_date, ${a}.start_date)`;

  const FAELLE = [
    { name: "doppelbelegungen · eigene Seite",
      lauf: (p) => doppelbelegungen(p, { orgId: "org-1", seite: "agentur", fenster: F }),
      marke: "FROM worker_assignment_links a", link: "a", einsatz: "ea" },
    { name: "doppelbelegungen · Gegenseite",
      lauf: (p) => doppelbelegungen(p, { orgId: "org-1", seite: "agentur", fenster: F }),
      marke: "FROM worker_assignment_links a", link: "b", einsatz: "eb" },
    { name: "abwesenheiten",
      lauf: (p) => abwesenheiten(p, { orgId: "org-1", seite: "agentur", fenster: F }),
      marke: "FROM worker_absences", link: "l", einsatz: "e" },
    { name: "ablaufendeNachweise",
      lauf: (p) => ablaufendeNachweise(p, { orgId: "org-1", seite: "agentur", fenster: F }),
      marke: "FROM worker_profile_documents", link: "l", einsatz: "e" },
    { name: "belegungenImFenster",
      lauf: (p) => mitarbeiterMonat(p, { orgId: "org-1", seite: "agentur", monat: "2026-04" }),
      marke: "FROM worker_assignment_links l", link: "l", einsatz: "e",
      vorbereiten: (sql) => /FROM worker_profiles wp\s*\n\s*WHERE wp\.supplier_org_id/.test(sql)
        ? { rows: [{ profil_id: "p-1", user_id: "w-1", name: "A", personnel_number: "1", is_active: true }] }
        : null }
  ];

  for (const f of FAELLE) {
    it(`${f.name}: das wirksame Ende zählt ${f.link} gegen ${f.einsatz}`, async () => {
      const p = musterPool(f.vorbereiten);
      await f.lauf(p);
      const [abfrage] = p.find(f.marke);
      assert.ok(abfrage, `${f.name}: die Abfrage muss laufen`);
      assert.ok(abfrage.sql.includes(ende(f.link, f.einsatz)),
        `${f.name}: erwartet wurde\n${ende(f.link, f.einsatz)}\n\nin:\n` + abfrage.sql);
      assert.ok(abfrage.sql.includes(beginn(f.link, f.einsatz)),
        `${f.name}: erwartet wurde »${beginn(f.link, f.einsatz)}«`);
    });

    it(`${f.name}: der Zustandsfilter nennt die Zuordnung beim Kürzel`, async () => {
      const p = musterPool(f.vorbereiten);
      await f.lauf(p);
      const [abfrage] = p.find(f.marke);
      const kuerzel = f.name.includes("Gegenseite") ? "b" : f.link;
      assert.ok(abfrage.sql.includes(`${kuerzel}.is_active = TRUE`),
        `${f.name}: »${kuerzel}.is_active = TRUE« fehlt — ein leeres Kürzel filtert `
          + "die falsche Tabelle");
      assert.ok(abfrage.sql.includes(
        `${kuerzel}.worker_confirmation_status NOT IN ('worker_declined','worker_unavailable')`),
        `${f.name}: der Zusagestatus wird nicht an ${kuerzel} geprüft`);
    });
  }

  it("die Vorschau rechnet mit denselben Kürzeln", async () => {
    const p = musterPool((sql) => {
      if (/FROM assignments a\s*\n\s*LEFT JOIN organizations o/.test(sql)) {
        return { rows: [{ id: "a-1", org_id: "k-1", supplier_org_id: "org-1", status: "active",
          von: "2026-04-01", bis: "2026-04-30", kunde_name: "N", kraft_org: "org-1",
          kraft_name: "Lukas Bauer" }] };
      }
      return null;
    });
    await planungsVorschau(p, {
      orgId: "org-1", seite: "agentur", workerUserId: "w-1", assignmentId: "a-1"
    });
    const [kollision] = p.find("FROM worker_assignment_links l");
    assert.ok(kollision.sql.includes(ende("l", "e")));
    assert.ok(kollision.sql.includes(beginn("l", "e")));
    assert.ok(kollision.sql.includes("l.is_active = TRUE"));
  });

  it("die Spur-Abfrage liest den Typ der Organisation, nicht irgendetwas", async () => {
    const p = musterPool(() => ({ rows: [{ type: "agency" }] }));
    await seiteFuerOrg(p, "org-1");
    assert.equal(p.calls.length, 1);
    assert.match(p.calls[0].sql, /SELECT type FROM organizations WHERE id = \$1/);
    assert.deepEqual(p.calls[0].params, ["org-1"]);
  });

  it("die Monatsangabe wird gegen ein Muster geprüft, nicht geraten", async () => {
    /* Ohne das Muster käme jede Zeichenkette als Monat durch — und `2026-1`
     * ergäbe ein Fenster, das es nicht gibt. */
    assert.equal(monatsfenster("2026-04").monat, "2026-04");
    assert.notEqual(monatsfenster("2026-4").monat, "2026-4");
    assert.notEqual(monatsfenster("26-04").monat, "26-04");
    assert.notEqual(monatsfenster("2026-04-01").monat, "2026-04-01");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   K3.8 · die AÜG-Vorschau: welche Kette betroffen ist

   `kettenMit.find(k => k.von <= von && (k.bis == null || k.bis >= von))` sucht
   die Kette, in die der geplante Einsatz fällt. Acht Mutanten sassen allein in
   dieser Zeile, und noch einmal acht in ihrem Gegenstück für den Zustand OHNE
   die Besetzung. Beide entscheiden, ob überhaupt gemeldet wird — und ob die
   Meldung dieser Besetzung zugeschrieben wird.
   ═══════════════════════════════════════════════════════════════════════════ */

describe("K3.8 · die AÜG-Vorschau findet die richtige Kette", () => {
  function poolMit(kontext, geschichte) {
    return musterPool((sql) => {
      if (/FROM assignments a\s*\n\s*LEFT JOIN organizations o/.test(sql)) {
        return { rows: [kontext] };
      }
      if (/FROM worker_assignment_links l\s*\n\s*JOIN assignments a/.test(sql)) {
        return { rows: geschichte || [] };
      }
      return null;
    });
  }
  const KONTEXT = (von, bis) => ({
    id: "a-1", org_id: "kunde-1", supplier_org_id: "org-1", status: "active",
    von, bis, kunde_name: "Nordbau GmbH", kraft_org: "org-1", kraft_name: "Lukas Bauer"
  });
  const GESCHICHTE = (von, bis) => [{
    worker_user_id: "w-1", org_id: "kunde-1", von, bis,
    assignment_id: "a-alt", supplier_org_id: "org-1"
  }];

  async function vorschau(kontext, geschichte) {
    return planungsVorschau(poolMit(kontext, geschichte), {
      orgId: "org-1", seite: "agentur", workerUserId: "w-1", assignmentId: "a-1"
    });
  }

  it("ohne jede Vorgeschichte entsteht die Kette allein aus der geplanten Besetzung", async () => {
    /* Sie beginnt am 01.04.2026 und läuft offen — die Frist reisst am
     * 01.10.2027, also weit nach dem geplanten Beginn. Gemeldet wird sie, und
     * zwar als Folge DIESER Besetzung: ohne sie gäbe es die Kette nicht. */
    const e = await vorschau(KONTEXT("2026-04-01", null), []);
    const [a] = e.konflikte.filter((k) => k.art === "aueg_hoechstdauer");
    assert.ok(a, "auch ohne Vorgeschichte kann eine offene Besetzung die Frist reissen");
    assert.equal(a.ueberschreitung_am, "2027-10-01");
    assert.equal(a.durch_diese_besetzung, true);
    assert.equal(a.kette_von, "2026-04-01");
    assert.equal(a.kette_offen, true);
  });

  it("eine Kette, die VOR dem geplanten Beginn endet, ist nicht die betroffene", async () => {
    /* Vorgeschichte 2024, geplante Besetzung 2026 — mehr als drei Monate
     * dazwischen, also zwei getrennte Ketten. Gefunden werden muss die ZWEITE.
     * Nähme die Suche die erste, stünde als Kettenbeginn 2024 und die Frist
     * wäre längst gerissen: ein Falschalarm mit Ansage. */
    const e = await vorschau(KONTEXT("2026-04-01", "2026-04-30"),
      GESCHICHTE("2024-01-01", "2024-06-30"));
    assert.deepEqual(e.konflikte.filter((k) => k.art === "aueg_hoechstdauer"), [],
      "die alte Kette ist abgeschlossen, die neue dauert einen Monat");
  });

  it("eine OFFENE Vorgeschichte umschließt den geplanten Einsatz", async () => {
    /* `k.bis == null` ist der Zweig für die offene Kette. Ohne ihn fände die
     * Suche nichts, und eine Überschreitung bliebe unbemerkt. */
    const e = await vorschau(KONTEXT("2026-04-01", "2026-04-30"),
      GESCHICHTE("2024-06-01", null));
    const [a] = e.konflikte.filter((k) => k.art === "aueg_hoechstdauer");
    assert.ok(a, "die offene Kette von 2024 reicht bis in den geplanten Einsatz");
    assert.equal(a.kette_von, "2024-06-01");
    assert.equal(a.ueberschreitung_am, "2025-12-01");
    assert.equal(a.durch_diese_besetzung, false,
      "diese Kette war längst zu lang — nicht wegen der neuen Besetzung");
  });

  it("eine Vorgeschichte, die den Beginn GENAU trifft, gehört noch dazu", async () => {
    /* `k.bis >= von`: endet die alte Kette am selben Tag, an dem die neue
     * beginnt, ist es dieselbe Kette. Ein `>` statt `>=` schnitte sie ab. */
    const e = await vorschau(KONTEXT("2026-04-01", "2026-04-30"),
      GESCHICHTE("2024-06-01", "2026-04-01"));
    const [a] = e.konflikte.filter((k) => k.art === "aueg_hoechstdauer");
    assert.ok(a, "die alte Kette endet am Tag des neuen Beginns — sie gehoert dazu");
    assert.equal(a.kette_von, "2024-06-01", "eine Kette, kein Neuanfang");
    assert.equal(a.ueberschreitung_am, "2025-12-01");

    /* Die Gegenprobe zur GRENZE: endet die alte Kette EINEN TAG frueher, ist sie
     * immer noch dieselbe Kette (drei Monate Pause sind erlaubt) — erst ein
     * groesserer Abstand trennt sie. Ohne diese zweite Haelfte liesse die Probe
     * offen, ob `>=` ueberhaupt etwas anderes bedeutet als `>`. */
    const knapp = await vorschau(KONTEXT("2026-04-01", "2026-04-30"),
      GESCHICHTE("2024-06-01", "2026-03-31"));
    const [b] = knapp.konflikte.filter((k) => k.art === "aueg_hoechstdauer");
    assert.equal(b.kette_von, "2024-06-01");
  });

  it("ohne Konfiguration gilt die gesetzliche Frist, nicht »keine«", async () => {
    const e = await vorschau(KONTEXT("2026-04-01", null), []);
    const [a] = e.konflikte.filter((k) => k.art === "aueg_hoechstdauer");
    assert.equal(a.hoechstdauer_monate, 18);
  });

  it("die Zusammenfassung trennt hart von weich", async () => {
    /* Beide Zähler filtern dieselbe Liste nach verschiedenen Werten. Ein
     * vertauschter Vergleich ergäbe zwei gleiche Zahlen — und auf der Fläche
     * eine Kachel »2 harte Konflikte«, wo einer weich ist. */
    const p = musterPool((sql) => {
      if (/FROM assignments a\s*\n\s*LEFT JOIN organizations o/.test(sql)) {
        return { rows: [KONTEXT("2026-04-01", "2026-04-30")] };
      }
      if (/FROM worker_assignment_links l\s*\n\s*JOIN assignments e/.test(sql)) {
        return { rows: [{ assignment_id: "a-2", org_id: "k-2", gegenseite_org_name: "Süd",
          gegen_von: "2026-04-05", gegen_bis: "2026-04-10",
          ueberschneidung_von: "2026-04-05", ueberschneidung_bis: "2026-04-10" }] };
      }
      if (/FROM worker_profile_documents d/.test(sql)) {
        return { rows: [{ id: "d-1", title: "Staplerschein", category: "q",
          valid_until: "2026-04-15" }] };
      }
      return null;
    });
    const e = await planungsVorschau(p, {
      orgId: "org-1", seite: "agentur", workerUserId: "w-1", assignmentId: "a-1"
    });
    assert.deepEqual(e.zusammenfassung, { hart: 1, weich: 1 });
    assert.deepEqual(e.konflikte.map((k) => k.art),
      ["doppelbelegung", "nachweis_laeuft_ab"], "hart steht vor weich");
  });

  it("ohne Organisation wirft die Vorschau — sie rät nicht", async () => {
    await assert.rejects(
      () => planungsVorschau(musterPool(), { workerUserId: "w-1", assignmentId: "a-1" }),
      /MONATSPLAN_ORG_ERFORDERLICH/);
    await assert.rejects(
      () => mitarbeiterMonat(musterPool(), { monat: "2026-04" }),
      /MONATSPLAN_ORG_ERFORDERLICH/);
    await assert.rejects(
      () => monatsplan(musterPool(), { monat: "2026-04" }),
      /MONATSPLAN_ORG_ERFORDERLICH/);
  });

  it("ein unbekannter Einsatz wird benannt, nicht als »keine Konflikte« ausgegeben", async () => {
    const p = musterPool(() => ({ rows: [] }));
    const e = await planungsVorschau(p, {
      orgId: "org-1", seite: "agentur", workerUserId: "w-1", assignmentId: "gibt-es-nicht"
    });
    assert.deepEqual(e, { fehler: "EINSATZ_NICHT_GEFUNDEN" });
    assert.equal(p.calls.length, 1, "ohne Zusammenhang laufen die vier Folgeabfragen nicht");
  });

  it("eine unbekannte Spur fällt auf die engere zurück, statt zu raten", async () => {
    const plan = await mitarbeiterMonat(musterPool(() => ({ rows: [] })), {
      orgId: "org-1", seite: "erfunden", monat: "2026-04"
    });
    assert.equal(plan.seite, "kunde");
  });
});


/* ═══════════════════════════════════════════════════════════════════════════
   K3.8 · freieSpannen gegen eine unabhängig gerechnete Referenz

   Einzelbeispiele prüfen, was man sich ausgedacht hat. Diese Probe prüft, was
   HERAUSKOMMEN MUSS: sie rechnet dieselbe Frage ein zweites Mal, auf dem
   dümmsten denkbaren Weg — Tag für Tag, mit einer Menge — und vergleicht.

   Der zweite Weg ist absichtlich naiv: er kennt kein Zusammenlegen, keine
   Sortierung, keine Zeiger. Genau deshalb kann er nicht denselben Fehler machen
   wie der erste. Jede Abweichung an jeder Kante fällt auf, ohne dass jemand
   vorher wissen muss, wo die Kanten liegen.
   ═══════════════════════════════════════════════════════════════════════════ */

describe("K3.8 · freieSpannen — gegen eine zweite, naive Rechnung", () => {
  const APRIL = { monat: "2026-04", von: "2026-04-01", bis: "2026-04-30", tage: 30 };

  const tagVon = (n) => "2026-04-" + String(n).padStart(2, "0");

  /** Der naive Weg: welche Tage des Monats sind belegt? */
  function belegteTage(belegt, fenster) {
    const menge = new Set();
    for (const b of belegt || []) {
      const von = b.von && b.von > fenster.von ? b.von : fenster.von;
      const bis = b.bis == null || b.bis > fenster.bis ? fenster.bis : b.bis;
      if (von > bis) continue;                       // verdreht: zählt nicht
      for (let n = 1; n <= fenster.tage; n++) {
        const tag = tagVon(n);
        if (tag >= von && tag <= bis) menge.add(tag);
      }
    }
    return menge;
  }

  /** Und daraus: welche Tage sind frei? */
  function freieTageNaiv(belegt, fenster) {
    const busy = belegteTage(belegt, fenster);
    const frei = [];
    for (let n = 1; n <= fenster.tage; n++) {
      const tag = tagVon(n);
      if (!busy.has(tag)) frei.push(tag);
    }
    return frei;
  }

  /** Die Spannen der Funktion, zurück in einzelne Tage aufgelöst. */
  function tageAusSpannen(spannen) {
    const tage = [];
    for (const sp of spannen) {
      for (let n = 1; n <= 30; n++) {
        const tag = tagVon(n);
        if (tag >= sp.von && tag <= sp.bis) tage.push(tag);
      }
    }
    return tage;
  }

  it("beide Wege kommen für JEDE Ein-Spannen-Belegung auf dasselbe", () => {
    /* Alle 30 × 30 Kombinationen aus Beginn und Ende, dazu die offenen und die
     * verdrehten. Das sind 900 Fälle — keiner davon ausgedacht. */
    let geprueft = 0;
    for (let a = 1; a <= 30; a++) {
      for (let b = 1; b <= 30; b++) {
        const belegt = [{ von: tagVon(a), bis: tagVon(b) }];
        assert.deepEqual(tageAusSpannen(freieSpannen(belegt, APRIL)),
          freieTageNaiv(belegt, APRIL),
          `Belegung ${tagVon(a)}–${tagVon(b)}`);
        geprueft++;
      }
    }
    assert.equal(geprueft, 900, "alle Kombinationen wurden wirklich gefahren");
  });

  it("beide Wege kommen auch bei ZWEI Belegungen auf dasselbe", () => {
    /* Zwei Spannen decken die interessanten Lagen ab: getrennt, angrenzend,
     * überlappend, ineinander. Alle Kombinationen aus einem groben Raster. */
    const kanten = [1, 2, 5, 6, 10, 11, 15, 20, 29, 30];
    let geprueft = 0;
    for (const a1 of kanten) for (const b1 of kanten) {
      for (const a2 of kanten) for (const b2 of kanten) {
        const belegt = [
          { von: tagVon(a1), bis: tagVon(b1) },
          { von: tagVon(a2), bis: tagVon(b2) }
        ];
        assert.deepEqual(tageAusSpannen(freieSpannen(belegt, APRIL)),
          freieTageNaiv(belegt, APRIL),
          `${tagVon(a1)}–${tagVon(b1)} und ${tagVon(a2)}–${tagVon(b2)}`);
        geprueft++;
      }
    }
    assert.equal(geprueft, 10000);
  });

  it("beide Wege kommen bei offenen und angeschnittenen Belegungen auf dasselbe", () => {
    const faelle = [
      [{ von: null, bis: null }],
      [{ von: "2026-04-10", bis: null }],
      [{ von: null, bis: "2026-04-10" }],
      [{ von: "2025-01-01", bis: "2026-04-10" }],
      [{ von: "2026-04-20", bis: "2027-01-01" }],
      [{ von: "2025-01-01", bis: "2027-01-01" }],
      [{ von: "2026-05-01", bis: "2026-05-31" }],
      [{ von: "2026-01-01", bis: "2026-02-01" }],
      [{ von: "2026-04-10", bis: null }, { von: "2026-04-01", bis: "2026-04-05" }],
      [{ von: "2025-01-01", bis: "2026-04-05" }, { von: "2026-04-25", bis: null }]
    ];
    for (const belegt of faelle) {
      assert.deepEqual(tageAusSpannen(freieSpannen(belegt, APRIL)),
        freieTageNaiv(belegt, APRIL), JSON.stringify(belegt));
    }
  });

  it("die gemeldeten Spannen sind zusammenhängend und aufsteigend", () => {
    /* Der naive Weg liefert nur Tage — er sagt nichts über die BÜNDELUNG. Diese
     * Eigenschaft prüft die andere Hälfte: dass aus 14 freien Tagen nicht 14
     * Spannen werden, und dass sie in der Reihenfolge stehen, in der die Fläche
     * sie zeichnet. */
    const belegt = [
      { von: "2026-04-06", bis: "2026-04-10" },
      { von: "2026-04-16", bis: "2026-04-20" }
    ];
    assert.deepEqual(freieSpannen(belegt, APRIL), [
      { von: "2026-04-01", bis: "2026-04-05", tage: 5 },
      { von: "2026-04-11", bis: "2026-04-15", tage: 5 },
      { von: "2026-04-21", bis: "2026-04-30", tage: 10 }
    ]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   K3.8 · der Monat als Ganzes: was zusammengetragen wird
   ═══════════════════════════════════════════════════════════════════════════ */

describe("K3.8 · der Monat trägt alle fünf Konfliktarten zusammen", () => {
  function poolMitAllem() {
    return musterPool((sql) => {
      if (/FROM assignments a/.test(sql) && /LEFT JOIN LATERAL/.test(sql)) {
        return { rows: [{
          id: "a-1", org_id: "kunde-1", supplier_org_id: "org-1", status: "active",
          start_date: "2026-04-01", planned_end_date: "2026-04-30", actual_end_date: null,
          kunde_name: "Nordbau GmbH", lieferant_name: "Demo Zeitarbeit",
          kraefte: [{ worker_user_id: "w-1", name: "Lukas Bauer", rolle: "Stapler",
            von: "2026-04-01", bis: "2026-04-30" }],
          beginnt_vorher: false, offen: false, endet_spaeter: false
        }] };
      }
      if (/FROM demand_requests/.test(sql)) {
        return { rows: [{ id: "b-1", title: "Zwei Stapler", role: "Stapler", headcount: 2,
          status: "open", start_date: "2026-04-10", end_date: "2026-04-20",
          beginnt_vorher: false, endet_spaeter: false, besetzt: false }] };
      }
      if (/FROM worker_assignment_links a/.test(sql)) {
        return { rows: [{ worker_user_id: "w-1", kraft_name: "Lukas Bauer",
          eigener_einsatz: "a-1", gegenseite_assignment_id: "a-2",
          gegenseite_org_id: "kunde-2", gegenseite_org_name: "Südbau AG",
          ueberschneidung_von: "2026-04-05", ueberschneidung_bis: "2026-04-08" }] };
      }
      if (/FROM worker_absences/.test(sql)) {
        return { rows: [{ id: "ab-1", art: "krank", von: "2026-04-12", bis: "2026-04-14",
          worker_user_id: "w-1", assignment_id: "a-1", kraft_name: "Lukas Bauer" }] };
      }
      if (/FROM worker_profile_documents/.test(sql)) {
        return { rows: [{ id: "d-1", title: "Staplerschein", category: "q",
          valid_until: "2026-04-25", worker_user_id: "w-1", assignment_id: "a-1",
          kraft_name: "Lukas Bauer" }] };
      }
      if (/FROM worker_assignment_links l\s*\n\s*JOIN assignments a/.test(sql)) {
        return { rows: [{ worker_user_id: "w-1", org_id: "kunde-1",
          von: "2024-01-01", bis: null, assignment_id: "a-1", supplier_org_id: "org-1" }] };
      }
      return { rows: [] };
    });
  }

  it("alle fünf Arten stehen in der Antwort — hart vor weich", async () => {
    const plan = await monatsplan(poolMitAllem(), {
      orgId: "org-1", seite: "kunde", monat: "2026-04"
    });
    const arten = plan.konflikte.map((k) => k.art);
    for (const art of ["doppelbelegung", "abwesenheit", "aueg_frist",
      "bedarf_offen", "nachweis_laeuft_ab"]) {
      assert.ok(arten.includes(art), `die Art ${art} fehlt: ${arten.join(", ")}`);
    }
    assert.deepEqual(plan.zusammenfassung, {
      eintraege: 1, beginnt_vorher: 0, endet_spaeter: 0,
      bedarfe: 1, konflikte_hart: 3, konflikte_weich: 2
    });
  });

  it("die AÜG-Paare entstehen aus den KRÄFTEN der sichtbaren Einsätze", async () => {
    /* Nur was ohnehin sichtbar ist, geht in die AÜG-Rechnung — sonst gelangte
     * über den Umweg der Frist etwas in die Antwort, das der Abfragende gar
     * nicht sehen darf. */
    const p = poolMitAllem();
    await monatsplan(p, { orgId: "org-1", seite: "kunde", monat: "2026-04" });
    /* Eindeutiges Merkmal: nur die Ueberlassungs-Abfrage bindet den Entleiher
     * als Feld. `FROM worker_assignment_links l` allein traefe auch die
     * LATERAL-Abfrage in `eintraege` — dieselben Kuerzel, andere Frage. */
    const [ueberlassung] = p.find("l.org_id = ANY($2::uuid[])");
    assert.ok(ueberlassung, "die Ueberlassungs-Abfrage muss laufen");
    assert.deepEqual(ueberlassung.params, [["w-1"], ["kunde-1"]],
      "die Kraft aus dem Eintrag, der Entleiher aus dem Eintrag — nichts sonst");
  });

  it("ohne Kräfte im Monat wird die AÜG-Frist gar nicht erst gefragt", async () => {
    const p = musterPool(() => ({ rows: [] }));
    const plan = await monatsplan(p, { orgId: "org-1", seite: "agentur", monat: "2026-04" });
    assert.deepEqual(plan.konflikte, []);
    assert.equal(p.find("l.org_id = ANY($2::uuid[])").length, 0,
      "keine Paare, keine Abfrage");
    assert.equal(plan.aueg_nur_plattformdaten, true,
      "die Grenze steht trotzdem in der Antwort");
  });

  it("die Kundenspur bekommt in KEINEM der fünf Konflikte einen fremden Firmennamen", async () => {
    const plan = await monatsplan(poolMitAllem(), {
      orgId: "org-1", seite: "kunde", monat: "2026-04"
    });
    const text = JSON.stringify(plan.konflikte);
    assert.ok(!text.includes("Südbau"),
      "der Kundenname eines Wettbewerbers, geliefert von uns — genau das nicht");
    assert.ok(!text.includes("krank"), "der Grund der Abwesenheit bleibt bei der Agentur");
    assert.ok(!text.includes("Staplerschein"), "welcher Nachweis, bleibt bei der Agentur");
  });

  it("die Agenturspur bekommt sie sehr wohl — es ist ihr eigener Bestand", async () => {
    const plan = await monatsplan(poolMitAllem(), {
      orgId: "org-1", seite: "agentur", monat: "2026-04"
    });
    const text = JSON.stringify(plan.konflikte);
    assert.ok(text.includes("Südbau"));
    assert.ok(text.includes("krank"));
    assert.ok(text.includes("Staplerschein"));
  });
});


/* ═══════════════════════════════════════════════════════════════════════════
   K3.8 · die letzten Ecken

   Was nach den Form-, Bindungs-, Gestalt- und Referenzproben noch übrig blieb:
   die Reihenfolge-Unabhängigkeit der Rechnung, die Redaktion in der
   Belegschaftsansicht, und die Rückfälle, die nur auf einer ihrer beiden Seiten
   geprüft waren.
   ═══════════════════════════════════════════════════════════════════════════ */

describe("K3.8 · die Reihenfolge der Belegungen ist gleichgültig", () => {
  const APRIL = { monat: "2026-04", von: "2026-04-01", bis: "2026-04-30", tage: 30 };

  /** Alle Anordnungen einer kleinen Liste. */
  function anordnungen(liste) {
    if (liste.length <= 1) return [liste];
    const alle = [];
    for (let i = 0; i < liste.length; i++) {
      const rest = liste.slice(0, i).concat(liste.slice(i + 1));
      for (const a of anordnungen(rest)) alle.push([liste[i], ...a]);
    }
    return alle;
  }

  it("drei Belegungen ergeben in JEDER der sechs Anordnungen dasselbe", () => {
    /* Die Sortierung ist der Schritt, den man beim Lesen überspringt — und sie
     * entscheidet alles: das Zusammenlegen läuft von links nach rechts und
     * erwartet aufsteigende Spannen. Eine verdrehte Vergleichsrichtung fällt
     * erst bei drei Elementen auf, weil zwei immer irgendwie passen. */
    const spannen = [
      { von: "2026-04-20", bis: "2026-04-22" },
      { von: "2026-04-03", bis: "2026-04-05" },
      { von: "2026-04-11", bis: "2026-04-13" }
    ];
    const erwartet = [
      { von: "2026-04-01", bis: "2026-04-02", tage: 2 },
      { von: "2026-04-06", bis: "2026-04-10", tage: 5 },
      { von: "2026-04-14", bis: "2026-04-19", tage: 6 },
      { von: "2026-04-23", bis: "2026-04-30", tage: 8 }
    ];
    const varianten = anordnungen(spannen);
    assert.equal(varianten.length, 6);
    for (const v of varianten) {
      assert.deepEqual(freieSpannen(v, APRIL), erwartet,
        "Anordnung " + v.map((x) => x.von.slice(8)).join(","));
    }
  });

  it("auch mit gleichem Beginn und verschiedenem Ende bleibt es gleich", () => {
    /* Der Fall, in dem der Vergleich `a.von < b.von` weder das eine noch das
     * andere ergibt: zwei Spannen beginnen am selben Tag. Dann entscheidet der
     * dritte Zweig (»0«), und das Zusammenlegen muss trotzdem das längere Ende
     * behalten. */
    const a = { von: "2026-04-10", bis: "2026-04-12" };
    const b = { von: "2026-04-10", bis: "2026-04-20" };
    const erwartet = [
      { von: "2026-04-01", bis: "2026-04-09", tage: 9 },
      { von: "2026-04-21", bis: "2026-04-30", tage: 10 }
    ];
    assert.deepEqual(freieSpannen([a, b], APRIL), erwartet);
    assert.deepEqual(freieSpannen([b, a], APRIL), erwartet);
  });

  it("eine offene Belegung schluckt alles Spätere, egal wo sie in der Liste steht", () => {
    const offen = { von: "2026-04-05", bis: null };
    const spaeter = { von: "2026-04-20", bis: "2026-04-25" };
    const erwartet = [{ von: "2026-04-01", bis: "2026-04-04", tage: 4 }];
    assert.deepEqual(freieSpannen([offen, spaeter], APRIL), erwartet);
    assert.deepEqual(freieSpannen([spaeter, offen], APRIL), erwartet);
  });
});

describe("K3.8 · die Redaktion gilt auch in der Belegschaftsansicht", () => {
  function pool(mitNachweis, mitAbwesenheit) {
    return musterPool((sql) => {
      if (/FROM worker_profiles wp\s*\n\s*WHERE wp\.supplier_org_id/.test(sql)) {
        return { rows: [{ profil_id: "p-1", user_id: "w-1", name: "Anna Berg",
          personnel_number: "A-1", is_active: true }] };
      }
      if (/FROM worker_absences ab/.test(sql)) {
        return { rows: mitAbwesenheit
          ? [{ worker_profile_id: "p-1", id: "ab-1", art: "krank",
              von: "2026-04-10", bis: "2026-04-12", offen: false }]
          : [] };
      }
      if (/FROM worker_profile_documents d/.test(sql)) {
        return { rows: mitNachweis
          ? [{ worker_user_id: "w-1", id: "d-1", title: "Staplerschein",
              category: "qualifikation", valid_until: "2026-04-20" }]
          : [] };
      }
      return { rows: [] };
    });
  }

  it("die Agentur sieht Nachweis und Abwesenheitsgrund", async () => {
    const plan = await mitarbeiterMonat(pool(true, true), {
      orgId: "org-1", seite: "agentur", monat: "2026-04"
    });
    const [m] = plan.mitarbeiter;
    assert.deepEqual(m.nachweise, [{ laeuft_ab_am: "2026-04-20", nachweis: "Staplerschein" }]);
    assert.deepEqual(m.abwesenheiten,
      [{ von: "2026-04-10", bis: "2026-04-12", offen: false, art: "krank" }]);
  });

  it("das Einsatzunternehmen sieht DASS, nicht WAS", async () => {
    const plan = await mitarbeiterMonat(pool(true, true), {
      orgId: "org-1", seite: "kunde", monat: "2026-04"
    });
    const [m] = plan.mitarbeiter;
    assert.deepEqual(m.nachweise, [{ laeuft_ab_am: "2026-04-20", nachweis: null }],
      "der Termin bleibt sichtbar — welche Qualifikation, nicht");
    assert.deepEqual(m.abwesenheiten,
      [{ von: "2026-04-10", bis: "2026-04-12", offen: false, art: null }]);
  });

  it("ohne Titel tritt auch hier die Kategorie an seine Stelle", async () => {
    const p = musterPool((sql) => {
      if (/FROM worker_profiles wp\s*\n\s*WHERE wp\.supplier_org_id/.test(sql)) {
        return { rows: [{ profil_id: "p-1", user_id: "w-1", name: "Anna Berg",
          personnel_number: "A-1", is_active: true }] };
      }
      if (/FROM worker_profile_documents d/.test(sql)) {
        return { rows: [{ worker_user_id: "w-1", id: "d-1", title: null,
          category: "qualifikation", valid_until: "2026-04-20" }] };
      }
      return { rows: [] };
    });
    const plan = await mitarbeiterMonat(p, { orgId: "org-1", seite: "agentur", monat: "2026-04" });
    assert.equal(plan.mitarbeiter[0].nachweise[0].nachweis, "qualifikation");
  });

  it("eine offene Abwesenheit belegt bis zum Monatsrand und ist als offen gekennzeichnet", async () => {
    const p = musterPool((sql) => {
      if (/FROM worker_profiles wp\s*\n\s*WHERE wp\.supplier_org_id/.test(sql)) {
        return { rows: [{ profil_id: "p-1", user_id: "w-1", name: "Anna Berg",
          personnel_number: "A-1", is_active: true }] };
      }
      if (/FROM worker_absences ab/.test(sql)) {
        return { rows: [{ worker_profile_id: "p-1", id: "ab-1", art: "krank",
          von: "2026-04-20", bis: "2026-04-30", offen: true }] };
      }
      return { rows: [] };
    });
    const plan = await mitarbeiterMonat(p, { orgId: "org-1", seite: "agentur", monat: "2026-04" });
    const [m] = plan.mitarbeiter;
    assert.equal(m.abwesenheiten[0].offen, true);
    assert.deepEqual(m.frei, [{ von: "2026-04-01", bis: "2026-04-19", tage: 19 }]);
    assert.equal(m.auslastung_prozent, 37);
  });

  it("die Auslastung rundet und bleibt zwischen 0 und 100", async () => {
    /* Die eine Zahl, nach der eine Disposition sortiert. `Math.round` statt
     * Abschneiden: 11 von 30 Tagen sind 37 %, nicht 36 %. */
    const faelle = [
      { belegt: null, erwartet: 0 },
      { belegt: { von: "2026-04-01", bis: "2026-04-30" }, erwartet: 100 },
      { belegt: { von: "2026-04-01", bis: "2026-04-11" }, erwartet: 37 },
      { belegt: { von: "2026-04-01", bis: "2026-04-15" }, erwartet: 50 }
    ];
    for (const f of faelle) {
      const p = musterPool((sql) => {
        if (/FROM worker_profiles wp\s*\n\s*WHERE wp\.supplier_org_id/.test(sql)) {
          return { rows: [{ profil_id: "p-1", user_id: "w-1", name: "A",
            personnel_number: "1", is_active: true }] };
        }
        if (/FROM worker_assignment_links l\s*\n\s*JOIN assignments e/.test(sql)) {
          return { rows: f.belegt ? [{ worker_user_id: "w-1", assignment_id: "a-1",
            org_id: "k-1", entleiher_name: "N", status: "active",
            von: f.belegt.von, bis: f.belegt.bis,
            beginnt_vorher: false, endet_spaeter: false }] : [] };
        }
        return { rows: [] };
      });
      const plan = await mitarbeiterMonat(p, { orgId: "org-1", seite: "agentur", monat: "2026-04" });
      assert.equal(plan.mitarbeiter[0].auslastung_prozent, f.erwartet,
        JSON.stringify(f.belegt));
    }
  });

  it("eine Kraft OHNE Konto bekommt keine Belegung und keinen Nachweis zugeordnet", async () => {
    /* Beides haengt an der Nutzerkennung. Ohne Konto darf die Zuordnung nicht
     * versehentlich bei einer anderen Kraft landen — die Zeile bleibt leer, und
     * das ist richtig so. */
    const p = musterPool((sql) => {
      if (/FROM worker_profiles wp\s*\n\s*WHERE wp\.supplier_org_id/.test(sql)) {
        return { rows: [
          { profil_id: "p-1", user_id: "w-1", name: "Mit Konto", personnel_number: "1", is_active: true },
          { profil_id: "p-2", user_id: null, name: "Ohne Konto", personnel_number: "2", is_active: true }
        ] };
      }
      if (/FROM worker_assignment_links l\s*\n\s*JOIN assignments e/.test(sql)) {
        return { rows: [{ worker_user_id: "w-1", assignment_id: "a-1", org_id: "k-1",
          entleiher_name: "N", status: "active", von: "2026-04-01", bis: "2026-04-10",
          beginnt_vorher: false, endet_spaeter: false }] };
      }
      if (/FROM worker_absences ab/.test(sql)) {
        // Abwesenheiten haengen am PROFIL — die kommen auch ohne Konto an.
        return { rows: [{ worker_profile_id: "p-2", id: "ab-1", art: "urlaub",
          von: "2026-04-05", bis: "2026-04-09", offen: false }] };
      }
      return { rows: [] };
    });
    const plan = await mitarbeiterMonat(p, { orgId: "org-1", seite: "agentur", monat: "2026-04" });
    const ohne = plan.mitarbeiter.find((m) => m.ohne_konto);
    assert.deepEqual(ohne.belegungen, [], "ohne Konto keine Zuordnung");
    assert.deepEqual(ohne.nachweise, []);
    assert.equal(ohne.abwesenheiten.length, 1, "die Abwesenheit haengt am Profil und kommt an");
    assert.deepEqual(plan.mitarbeiter.find((m) => !m.ohne_konto).belegungen.length, 1);
  });

  it("eine Belegung einer FREMDEN Kraft wird keiner Zeile zugeordnet", async () => {
    const p = musterPool((sql) => {
      if (/FROM worker_profiles wp\s*\n\s*WHERE wp\.supplier_org_id/.test(sql)) {
        return { rows: [{ profil_id: "p-1", user_id: "w-1", name: "A",
          personnel_number: "1", is_active: true }] };
      }
      if (/FROM worker_assignment_links l\s*\n\s*JOIN assignments e/.test(sql)) {
        return { rows: [{ worker_user_id: "fremd", assignment_id: "a-9", org_id: "k-9",
          entleiher_name: "Fremd", status: "active", von: "2026-04-01", bis: "2026-04-10",
          beginnt_vorher: false, endet_spaeter: false }] };
      }
      return { rows: [] };
    });
    const plan = await mitarbeiterMonat(p, { orgId: "org-1", seite: "agentur", monat: "2026-04" });
    assert.deepEqual(plan.mitarbeiter[0].belegungen, []);
    assert.equal(plan.mitarbeiter[0].freie_tage, 30);
  });
});

describe("K3.8 · die Rückfälle, beide Seiten", () => {
  it("die Vorschau nimmt ein übergebenes Datum, sonst heute", async () => {
    /* `heute || todayDE()`: ohne den Rückfall rechnete jede Probe gegen den
     * echten Kalender und wäre morgen eine andere. Mit dem falschen Zweig
     * ignorierte der Dienst die Vorgabe — und in der Fläche stünde eine Frist,
     * die von der Uhrzeit des Aufrufs abhängt. */
    const p = musterPool((sql) => {
      if (/FROM assignments a\s*\n\s*LEFT JOIN organizations o/.test(sql)) {
        return { rows: [{ id: "a-1", org_id: "kunde-1", supplier_org_id: "org-1",
          status: "active", von: "2026-04-01", bis: null, kunde_name: "N",
          kraft_org: "org-1", kraft_name: "L" }] };
      }
      if (/FROM worker_assignment_links l\s*\n\s*JOIN assignments a/.test(sql)) {
        return { rows: [{ worker_user_id: "w-1", org_id: "kunde-1",
          von: "2024-01-01", bis: null, assignment_id: "a-0", supplier_org_id: "org-1" }] };
      }
      return { rows: [] };
    });

    const mitVorgabe = await planungsVorschau(p, {
      orgId: "org-1", seite: "agentur", workerUserId: "w-1", assignmentId: "a-1",
      heute: "2025-01-01"
    });
    const [a] = mitVorgabe.konflikte.filter((k) => k.art === "aueg_hoechstdauer");
    assert.equal(a.ueberschreitung_am, "2025-07-01",
      "die Frist hängt am Kettenbeginn, nicht am Aufrufzeitpunkt");

    const ohneVorgabe = await planungsVorschau(p, {
      orgId: "org-1", seite: "agentur", workerUserId: "w-1", assignmentId: "a-1"
    });
    assert.equal(ohneVorgabe.konflikte.filter((k) => k.art === "aueg_hoechstdauer").length, 1,
      "auch ohne Vorgabe wird gerechnet");
  });

  it("ohne Eintrag in der Konfiguration gilt die gesetzliche Regel, nicht »keine«", async () => {
    /* `konfig.get(...) || {}`: ohne den Rückfall führe `bewerteKette` mit
     * `undefined` und fiele auf `undefined.hoechstdauerMonate` — ein
     * TypeError statt einer Frist. */
    const p = musterPool((sql) => {
      if (/FROM assignments a\s*\n\s*LEFT JOIN organizations o/.test(sql)) {
        return { rows: [{ id: "a-1", org_id: "unbekannt", supplier_org_id: "org-1",
          status: "active", von: "2026-04-01", bis: null, kunde_name: "N",
          kraft_org: "org-1", kraft_name: "L" }] };
      }
      if (/FROM worker_assignment_links l\s*\n\s*JOIN assignments a/.test(sql)) {
        return { rows: [{ worker_user_id: "w-1", org_id: "unbekannt",
          von: "2024-01-01", bis: null, assignment_id: "a-0", supplier_org_id: "org-1" }] };
      }
      return { rows: [] };
    });
    const e = await planungsVorschau(p, {
      orgId: "org-1", seite: "agentur", workerUserId: "w-1", assignmentId: "a-1",
      heute: "2026-04-01"
    });
    const [a] = e.konflikte.filter((k) => k.art === "aueg_hoechstdauer");
    assert.equal(a.hoechstdauer_monate, 18);
  });

  it("ohne Vorgeschichte zu diesem Paar wird mit der leeren Liste gerechnet", async () => {
    const p = musterPool((sql) => {
      if (/FROM assignments a\s*\n\s*LEFT JOIN organizations o/.test(sql)) {
        return { rows: [{ id: "a-1", org_id: "kunde-1", supplier_org_id: "org-1",
          status: "active", von: "2026-04-01", bis: "2026-04-30", kunde_name: "N",
          kraft_org: "org-1", kraft_name: "L" }] };
      }
      return { rows: [] };
    });
    const e = await planungsVorschau(p, {
      orgId: "org-1", seite: "agentur", workerUserId: "w-1", assignmentId: "a-1",
      heute: "2026-04-01"
    });
    assert.deepEqual(e.konflikte, [], "ein Monat Einsatz reisst keine 18-Monats-Frist");
  });

  it("eine Organisation ohne Typ-Zeile öffnet die Agentursicht NICHT", async () => {
    /* `rows[0]?.type || ""` — beide Rückfälle zusammen. Fiele einer weg, wäre
     * `undefined.toLowerCase()` ein TypeError, und der Fehlerzweig führte
     * ebenfalls zur Kundenspur. Geprüft wird, dass es gar nicht erst wirft. */
    for (const rows of [[{}], [{ type: undefined }], [{ type: null }]]) {
      const p = musterPool(() => ({ rows }));
      assert.equal(await seiteFuerOrg(p, "org-1"), "kunde");
    }
  });
});


/* ═══════════════════════════════════════════════════════════════════════════
   K3.8 · zwei Ketten, und nur eine ist gemeint

   `vorschauAueg` sucht zweimal: einmal in den Ketten MIT der geplanten
   Besetzung, einmal in denen OHNE. Aus der ersten kommt die Frist, aus der
   zweiten die Antwort auf »verursacht diese Besetzung sie?«. Beide Suchen haben
   dasselbe Prädikat, und beide waren nur mit EINER Kette geprüft — dann trifft
   jede Suche zwangsläufig die richtige.

   Erst mit zwei Ketten trennt sich das: eine alte, längst gerissene, und die
   neue. Greift eine der Suchen daneben, meldet die Fläche die Frist der falschen
   Kette — oder schreibt eine alte Überschreitung der neuen Besetzung zu.
   ═══════════════════════════════════════════════════════════════════════════ */

describe("K3.8 · die Vorschau trennt die alte Kette von der neuen", () => {
  function vorschauMit(kontextBis, geschichte) {
    const p = musterPool((sql) => {
      if (/FROM assignments a\s*\n\s*LEFT JOIN organizations o/.test(sql)) {
        return { rows: [{ id: "a-1", org_id: "kunde-1", supplier_org_id: "org-1",
          status: "active", von: "2026-04-01", bis: kontextBis, kunde_name: "Nordbau",
          kraft_org: "org-1", kraft_name: "Lukas Bauer" }] };
      }
      if (/FROM worker_assignment_links l\s*\n\s*JOIN assignments a/.test(sql)) {
        return { rows: geschichte.map((g, i) => ({
          worker_user_id: "w-1", org_id: "kunde-1", von: g.von, bis: g.bis,
          assignment_id: "alt-" + i, supplier_org_id: "org-1"
        })) };
      }
      return { rows: [] };
    });
    return planungsVorschau(p, {
      orgId: "org-1", seite: "agentur", workerUserId: "w-1", assignmentId: "a-1",
      heute: "2026-04-01"
    });
  }

  it("eine ALTE, abgeschlossene Überschreitung wird nicht der neuen Besetzung angelastet", async () => {
    /* Die Kraft war 2020–2023 bei diesem Entleiher — drei Jahre, die Frist riss
     * 2021. Diese Kette ist abgeschlossen und durch eine jahrelange Pause von
     * der neuen getrennt.
     *
     * Die geplante Besetzung ab 2026-04-01, offen: ihre eigene Frist reisst am
     * 2027-10-01. GENAU DAS muss gemeldet werden — und als Folge DIESER
     * Besetzung, denn ohne sie gäbe es die neue Kette nicht.
     *
     * Greift die erste Suche daneben, steht 2021 in der Meldung. Greift die
     * zweite daneben, heisst es »lag schon vorher« — und niemand ändert etwas. */
    const e = await vorschauMit(null, [{ von: "2020-01-01", bis: "2023-01-01" }]);
    const [a] = e.konflikte.filter((k) => k.art === "aueg_hoechstdauer");
    assert.ok(a, "die neue Kette reisst");
    assert.equal(a.kette_von, "2026-04-01",
      "die gemeldete Kette ist die NEUE — nicht die von 2020");
    assert.equal(a.ueberschreitung_am, "2027-10-01");
    assert.equal(a.durch_diese_besetzung, true,
      "ohne diese Besetzung gäbe es die neue Kette nicht");
  });

  it("dieselbe alte Kette, aber die neue Besetzung reisst NICHT — dann schweigt die Vorschau", async () => {
    /* Gegenprobe: derselbe Bestand, aber die geplante Besetzung dauert nur einen
     * Monat. Meldete die Suche trotzdem die alte Kette, stünde hier ein harter
     * Konflikt für eine Handlung, die nichts damit zu tun hat. */
    const e = await vorschauMit("2026-04-30", [{ von: "2020-01-01", bis: "2023-01-01" }]);
    assert.deepEqual(e.konflikte.filter((k) => k.art === "aueg_hoechstdauer"), []);
  });

  it("eine alte Kette, die BIS an die neue heranreicht, gehört zu ihr", async () => {
    /* Nur zwei Monate Pause — unter der zulässigen Unterbrechung. Es ist EINE
     * Kette, und ihr Beginn von 2025 trägt die Frist. */
    const e = await vorschauMit("2026-12-31", [{ von: "2025-03-01", bis: "2026-02-01" }]);
    const [a] = e.konflikte.filter((k) => k.art === "aueg_hoechstdauer");
    assert.ok(a);
    assert.equal(a.kette_von, "2025-03-01");
    assert.equal(a.ueberschreitung_am, "2026-09-01");
    assert.equal(a.durch_diese_besetzung, true,
      "ohne die Verlängerung endete die Kette im Februar — vor der Frist");
  });

  it("war die Kette schon OHNE die neue Besetzung zu lang, wird das gesagt", async () => {
    /* Die alte Kette läuft offen seit 2024 und ist längst gerissen. Die neue
     * Besetzung ändert daran nichts — sie verursacht die Überschreitung nicht.
     * Die Unterscheidung ist der ganze Wert der Meldung: »ist ohnehin gerissen«
     * verlangt etwas anderes als »wird durch Ihre Besetzung reissen«. */
    const e = await vorschauMit("2026-12-31", [{ von: "2024-01-01", bis: null }]);
    const [a] = e.konflikte.filter((k) => k.art === "aueg_hoechstdauer");
    assert.ok(a);
    assert.equal(a.kette_von, "2024-01-01");
    assert.equal(a.ueberschreitung_am, "2025-07-01");
    assert.equal(a.durch_diese_besetzung, false);
  });

  it("zwei alte Ketten: die NÄHERE gehört zur neuen Besetzung", async () => {
    const e = await vorschauMit("2026-12-31", [
      { von: "2020-01-01", bis: "2021-06-30" },
      { von: "2025-06-01", bis: "2026-02-28" }
    ]);
    const [a] = e.konflikte.filter((k) => k.art === "aueg_hoechstdauer");
    assert.ok(a);
    assert.equal(a.kette_von, "2025-06-01", "nicht 2020 — dazwischen liegen Jahre");
    assert.equal(a.ueberschreitung_am, "2026-12-01");
  });
});

describe("K3.8 · welche Paare in die AÜG-Rechnung gehen", () => {
  function planMit(eintraege) {
    return musterPool((sql) => {
      if (/FROM assignments a/.test(sql) && /LEFT JOIN LATERAL/.test(sql)) {
        return { rows: eintraege };
      }
      return { rows: [] };
    });
  }

  it("ein Eintrag ohne Entleiher und eine Kraft ohne Kennung fallen raus", async () => {
    /* Beides ergäbe ein Paar aus `undefined` — die Abfrage suchte dann nach
     * einer Kennung, die es nicht gibt, und die Rechnung liefe über Nichts.
     * Schlimmer: `ANY(ARRAY[null])` fände in Postgres nie etwas, und die Frist
     * bliebe still ungeprüft. */
    const p = planMit([
      { id: "a-1", org_id: null, status: "active", start_date: "2026-04-01",
        planned_end_date: "2026-04-30", actual_end_date: null,
        kraefte: [{ worker_user_id: "w-1", name: "Ohne Entleiher" }],
        beginnt_vorher: false, offen: false, endet_spaeter: false },
      { id: "a-2", org_id: "kunde-2", status: "active", start_date: "2026-04-01",
        planned_end_date: "2026-04-30", actual_end_date: null,
        kraefte: [{ worker_user_id: null, name: "Ohne Kennung" }],
        beginnt_vorher: false, offen: false, endet_spaeter: false },
      { id: "a-3", org_id: "kunde-3", status: "active", start_date: "2026-04-01",
        planned_end_date: "2026-04-30", actual_end_date: null,
        kraefte: [{ worker_user_id: "w-3", name: "Vollstaendig" }],
        beginnt_vorher: false, offen: false, endet_spaeter: false }
    ]);
    await monatsplan(p, { orgId: "org-1", seite: "agentur", monat: "2026-04" });

    const [ueberlassung] = p.find("l.org_id = ANY($2::uuid[])");
    assert.ok(ueberlassung, "für das vollständige Paar wird gefragt");
    assert.deepEqual(ueberlassung.params, [["w-3"], ["kunde-3"]],
      "nur das Paar, bei dem beide Kennungen da sind");
  });

  it("ein Eintrag ganz ohne Kräfte erzeugt kein Paar", async () => {
    const p = planMit([{ id: "a-1", org_id: "kunde-1", status: "active",
      start_date: "2026-04-01", planned_end_date: "2026-04-30", actual_end_date: null,
      kraefte: [], beginnt_vorher: false, offen: false, endet_spaeter: false }]);
    await monatsplan(p, { orgId: "org-1", seite: "agentur", monat: "2026-04" });
    assert.equal(p.find("l.org_id = ANY($2::uuid[])").length, 0);
  });

  it("fehlt die Kräfteliste ganz, wird das nicht zum Absturz", async () => {
    const p = planMit([{ id: "a-1", org_id: "kunde-1", status: "active",
      start_date: "2026-04-01", planned_end_date: "2026-04-30", actual_end_date: null,
      beginnt_vorher: false, offen: false, endet_spaeter: false }]);
    const plan = await monatsplan(p, { orgId: "org-1", seite: "agentur", monat: "2026-04" });
    assert.equal(plan.zusammenfassung.eintraege, 1);
    assert.deepEqual(plan.konflikte, []);
  });

  it("eine Kraft ohne Namen geht mit `null` in die Rechnung, nicht mit `undefined`", async () => {
    /* `undefined` fiele aus der Antwort — die Fläche zeigte dann gar kein Feld
     * statt eines leeren. */
    const p = musterPool((sql) => {
      if (/FROM assignments a/.test(sql) && /LEFT JOIN LATERAL/.test(sql)) {
        return { rows: [{ id: "a-1", org_id: "kunde-1", status: "active",
          start_date: "2026-04-01", planned_end_date: null, actual_end_date: null,
          kraefte: [{ worker_user_id: "w-1", name: null }],
          beginnt_vorher: false, offen: true, endet_spaeter: false }] };
      }
      if (/l\.org_id = ANY\(\$2::uuid\[\]\)/.test(sql)) {
        return { rows: [{ worker_user_id: "w-1", org_id: "kunde-1",
          von: "2024-01-01", bis: null, assignment_id: "a-1", supplier_org_id: "org-1" }] };
      }
      return { rows: [] };
    });
    const plan = await monatsplan(p, { orgId: "org-1", seite: "agentur", monat: "2026-04" });
    const [a] = plan.konflikte.filter((k) => k.art === "aueg_frist");
    assert.ok(a, "die Frist wird gerechnet");
    assert.equal(a.kraft_name, null);
    assert.ok("kraft_name" in a);
  });
});

describe("K3.8 · der Nachweis-Rückfall, alle drei Fälle", () => {
  const F = { monat: "2026-04", von: "2026-04-01", bis: "2026-04-30", tage: 30 };

  it("Titel, sonst Kategorie, sonst nichts", async () => {
    const faelle = [
      { title: "Staplerschein", category: "q", erwartet: "Staplerschein" },
      { title: null, category: "qualifikation", erwartet: "qualifikation" },
      { title: "", category: "qualifikation", erwartet: "qualifikation" },
      { title: null, category: null, erwartet: null }
    ];
    for (const f of faelle) {
      const p = musterPool(() => ({ rows: [{ id: "d-1", title: f.title,
        category: f.category, valid_until: "2026-04-20",
        worker_user_id: "w-1", assignment_id: "a-1", kraft_name: "L" }] }));
      const [n] = await ablaufendeNachweise(p, { orgId: "org-1", seite: "agentur", fenster: F });
      assert.equal(n.nachweis, f.erwartet, JSON.stringify(f));
    }
  });
});


describe("K3.8 · was die AÜG-Vorschau NICHT rechnen kann", () => {
  it("ein Einsatz ohne Startdatum ergibt keine Kette — und keinen erfundenen Befund", async () => {
    /* Ohne Beginn gibt es keinen Punkt, ab dem die 18 Monate laufen. Die Suche
     * nach der betroffenen Kette findet dann nichts, und die Vorschau schweigt
     * zur Frist — statt eine Kette zu erfinden, deren Beginn sie nicht kennt.
     *
     * Der Fall ist nicht theoretisch: `assignments.start_date` ist die einzige
     * Datumsspalte, die der Einsatz zwingend braucht — aber die Vorschau bekommt
     * ihren Zusammenhang aus einer Abfrage, und eine Abfrage kann NULL liefern. */
    const p = musterPool((sql) => {
      if (/FROM assignments a\s*\n\s*LEFT JOIN organizations o/.test(sql)) {
        return { rows: [{ id: "a-1", org_id: "kunde-1", supplier_org_id: "org-1",
          status: "active", von: null, bis: null, kunde_name: "Nordbau",
          kraft_org: "org-1", kraft_name: "Lukas Bauer" }] };
      }
      if (/FROM worker_assignment_links l\s*\n\s*JOIN assignments a/.test(sql)) {
        return { rows: [{ worker_user_id: "w-1", org_id: "kunde-1",
          von: "2020-01-01", bis: null, assignment_id: "alt", supplier_org_id: "org-1" }] };
      }
      return { rows: [] };
    });
    const e = await planungsVorschau(p, {
      orgId: "org-1", seite: "agentur", workerUserId: "w-1", assignmentId: "a-1",
      heute: "2026-04-01"
    });
    assert.ok(!e.fehler, "die uebrigen Pruefungen laufen weiter");
    assert.equal(e.von, null);
    assert.deepEqual(e.konflikte.filter((k) => k.art === "aueg_hoechstdauer"), [],
      "ohne Beginn keine Frist — und keine geratene");
  });

  it("die Abwesenheit ist und bleibt ein HARTER Konflikt", async () => {
    /* Der Grad steht als Wort im Dienst. Faellt er weg, wird aus »eine Person
     * kann nicht arbeiten« ein offener Punkt, den man wegklickt. */
    const F = { monat: "2026-04", von: "2026-04-01", bis: "2026-04-30", tage: 30 };
    const p = musterPool(() => ({ rows: [
      { id: "ab-1", art: "krank", von: "2026-04-10", bis: "2026-04-14",
        worker_user_id: "w-1", assignment_id: "a-1", kraft_name: "L" },
      { id: "ab-2", art: "urlaub", von: "2026-04-20", bis: "2026-04-22",
        worker_user_id: "w-2", assignment_id: "a-2", kraft_name: "M" }
    ] }));
    const zeilen = await abwesenheiten(p, { orgId: "org-1", seite: "agentur", fenster: F });
    assert.equal(zeilen.length, 2, "jede gemeldete Zeile wird uebersetzt, nicht nur die erste");
    for (const z of zeilen) {
      assert.equal(z.art, "abwesenheit", "die KONFLIKTART, nicht die Abwesenheitsart");
      assert.equal(z.grad, "hart");
    }
    assert.deepEqual(zeilen.map((z) => z.abwesenheitsart), ["krank", "urlaub"],
      "die Abwesenheitsart steht in ihrem eigenen Feld");
  });

  it("der ablaufende Nachweis ist und bleibt WEICH", async () => {
    const F = { monat: "2026-04", von: "2026-04-01", bis: "2026-04-30", tage: 30 };
    const p = musterPool(() => ({ rows: [
      { id: "d-1", title: "Stapler", category: "q", valid_until: "2026-04-20",
        worker_user_id: "w-1", assignment_id: "a-1", kraft_name: "L" },
      { id: "d-2", title: "Ersthelfer", category: "q", valid_until: "2026-04-25",
        worker_user_id: "w-2", assignment_id: "a-2", kraft_name: "M" }
    ] }));
    const zeilen = await ablaufendeNachweise(p, { orgId: "org-1", seite: "agentur", fenster: F });
    assert.equal(zeilen.length, 2);
    for (const z of zeilen) {
      assert.equal(z.art, "nachweis_laeuft_ab");
      assert.equal(z.grad, "weich", "ein Nachweis, der abläuft, ist ein offener Punkt");
    }
  });
});
