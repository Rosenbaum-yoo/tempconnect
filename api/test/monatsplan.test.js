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
