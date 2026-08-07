/**
 * P8 Welle D — mehrstufige Bestaetigung.
 *
 * Der Test haelt vor allem Gate D fest: die Folge in Schritt 3 stammt aus den
 * ECHTEN Werten der Welle B, nicht aus festem Text. Ein Modal, das eine
 * Konsequenz androht, die es nicht gibt, ist schlimmer als keins — beim ersten
 * folgenlosen Storno lernt der Nutzer, dass die Warnung gelogen war.
 *
 * Run: node --test --test-force-exit test/dealCommitment.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as svc from "../services/dealCommitmentService.js";
import * as reliability from "../services/dealReliabilityService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const lies = (p) => fs.readFileSync(path.join(REPO_ROOT, p), "utf8");

/** Fester Bezugszeitpunkt — sonst wandert der Vorlauf mit der Uhr. */
const JETZT = new Date("2026-08-07T09:00:00Z");
/** 30 Stunden spaeter: sicher unter 48 h, also "kurzfristig". */
const BEGINN_KURZFRISTIG = "2026-08-08";
/** Gut zwei Monate spaeter: ueber 14 Tage, also "unkritisch". */
const BEGINN_ENTSPANNT = "2026-10-20";

function pool(routes = []) {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql, params });
    for (const [needle, resp] of routes) {
      if (sql.includes(needle)) {
        if (resp instanceof Error) throw resp;
        return typeof resp === "function" ? resp(sql, params) : resp;
      }
    }
    return { rows: [], rowCount: 0 };
  };
  return { query, calls, connect: async () => ({ query, release: () => {} }) };
}

const DEAL = {
  id: "off-1",
  supplier_company_id: "agentur-1",
  requester_company_id: "firma-1",
  agreement_ref: "EV-2026-000042",
  agreement_status: "confirmed",
  assignment_id: "asg-1",
  demand_title: "Lagerhelfer Nachtschicht",
  demand_role: "Lagerhelfer",
  demand_location: "Berlin",
  demand_headcount: 5,
  demand_start: BEGINN_KURZFRISTIG,
  demand_end: "2026-09-30",
  requester_company_name: "Muster Logistik GmbH",
  supplier_company_name: "Schnell Personal GmbH",
  offered_quantity: 5,
  offered_hourly_rate: 24.5,
  billing_unit: "hourly",
  replacement_sla_minutes: 120
};

function vollerPool({ deal = DEAL, quote = null, bounties = [], operativ = null } = {}) {
  return pool([
    ["AS demand_title", { rows: [deal] }],
    ["FROM deal_reliability", { rows: quote ? [quote] : [] }],
    ["FROM user_bounties ub", { rows: bounties }],
    ["worker_assignment_links", { rows: operativ ? [operativ] : [{ kraefte: 0, reservierungen: 0, einladungen: 0 }] }]
  ]);
}

/* ══════════════════════════════════════════════════════════════════════════
 * Seitenbestimmung — nie aus dem Rumpf
 * ══════════════════════════════════════════════════════════════════════════ */

describe("P8/D · Welche Seite ist der Nutzer", () => {
  it("erkennt Agentur und Unternehmen", () => {
    assert.equal(svc.seiteVon(DEAL, "agentur-1"), "agency");
    assert.equal(svc.seiteVon(DEAL, "firma-1"), "company");
  });

  it("liefert null fuer Unbeteiligte — daraus wird spaeter 403", () => {
    assert.equal(svc.seiteVon(DEAL, "fremder"), null);
    assert.equal(svc.seiteVon(DEAL, null), null);
    assert.equal(svc.seiteVon(null, "agentur-1"), null);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * Gate D — die Folge ist gerechnet, nicht getextet
 * ══════════════════════════════════════════════════════════════════════════ */

describe("P8/D · Storno-Folgen", () => {
  it("nennt jeden Grund mit seinem echten Gewicht", async () => {
    const p = vollerPool({ quote: { binding_deals: 10, weighted_cancellations: "0", reliability_rate: "100.00" } });
    const f = await svc.berechneStornoFolgen(p, {
      partyUserId: "agentur-1", side: "agency", startDatum: BEGINN_KURZFRISTIG, jetzt: JETZT
    });

    assert.equal(f.vorlauf_klasse, "kurzfristig");
    const byCode = Object.fromEntries(f.gruende.map((g) => [g.reason_code, g]));
    assert.equal(byCode.worker_quit.gewicht, 2, "kurzfristig zaehlt doppelt");
    assert.equal(byCode.customer_cancelled.gewicht, 0, "E2 entlastet die Agentur");
    assert.equal(byCode.worker_sick.gewicht, 0);
    assert.equal(byCode.mistake.gewicht, 2);
  });

  it("rechnet die Quote DANACH je Grund aus — kein fester Text", async () => {
    const p = vollerPool({ quote: { binding_deals: 10, weighted_cancellations: "0", reliability_rate: "100.00" } });
    const f = await svc.berechneStornoFolgen(p, {
      partyUserId: "agentur-1", side: "agency", startDatum: BEGINN_KURZFRISTIG, jetzt: JETZT
    });
    const byCode = Object.fromEntries(f.gruende.map((g) => [g.reason_code, g]));
    assert.equal(f.quote_aktuell, 100);
    assert.equal(byCode.worker_quit.quote_danach, 80, "10 Deals, Gewicht 2 -> 80 %");
    assert.equal(byCode.customer_cancelled.quote_danach, 100, "entschuldigt aendert nichts");
  });

  it("dreht das Vorzeichen fuer das Unternehmen — E2 gilt dort nicht", async () => {
    const p = vollerPool({ quote: { binding_deals: 10, weighted_cancellations: "0", reliability_rate: "100.00" } });
    const f = await svc.berechneStornoFolgen(p, {
      partyUserId: "firma-1", side: "company", startDatum: BEGINN_KURZFRISTIG, jetzt: JETZT
    });
    const byCode = Object.fromEntries(f.gruende.map((g) => [g.reason_code, g]));
    assert.equal(byCode.customer_cancelled.gewicht, 2,
      "die eigene Kundenabsage ist das Risiko des Unternehmens");
  });

  it("erlaesst rechtzeitige Stornos vollstaendig", async () => {
    const p = vollerPool({ quote: { binding_deals: 10, weighted_cancellations: "0", reliability_rate: "100.00" } });
    const f = await svc.berechneStornoFolgen(p, {
      partyUserId: "agentur-1", side: "agency", startDatum: BEGINN_ENTSPANNT, jetzt: JETZT
    });
    assert.equal(f.vorlauf_klasse, "unkritisch");
    for (const g of f.gruende) assert.equal(g.gewicht, 0, g.reason_code);
  });

  it("sagt ehrlich, wenn es noch keine Quote gibt — statt 0 % zu behaupten", async () => {
    const p = vollerPool({ quote: null });
    const f = await svc.berechneStornoFolgen(p, {
      partyUserId: "neu", side: "agency", startDatum: BEGINN_KURZFRISTIG, jetzt: JETZT
    });
    assert.equal(f.quote_hat_aussage, false);
    assert.equal(f.quote_aktuell, null);
    assert.equal(f.quote_sichtbar_ab, reliability.MINDEST_DEALS);
  });

  it("beziffert den Rabatt, der am Streak haengt, und wann er wiederkommt", async () => {
    const p = vollerPool({
      quote: { binding_deals: 8, weighted_cancellations: "0", reliability_rate: "100.00" },
      bounties: [{ key: "zuverlaessiger_partner", name_de: "Zuverlaessiger Partner", discount_pct: "3.0", threshold_value: { days: 90 } }]
    });
    const f = await svc.berechneStornoFolgen(p, {
      partyUserId: "agentur-1", side: "agency", startDatum: BEGINN_KURZFRISTIG, jetzt: JETZT
    });
    assert.equal(f.bounties_in_gefahr.length, 1);
    assert.equal(f.bounties_in_gefahr[0].discount_pct, 3);
    assert.equal(f.bounties_in_gefahr[0].wieder_ab, "2026-11-05", "90 Tage nach dem 07.08.");
    assert.equal(f.rabatt_in_gefahr_pct, 3);
  });

  it("droht mit nichts, wenn kein Streak-Bounty aktiv ist", async () => {
    const p = vollerPool({ bounties: [] });
    const f = await svc.berechneStornoFolgen(p, {
      partyUserId: "agentur-1", side: "agency", startDatum: BEGINN_KURZFRISTIG, jetzt: JETZT
    });
    assert.deepEqual(f.bounties_in_gefahr, []);
    assert.equal(f.rabatt_in_gefahr_pct, 0);
  });

  it("ueberlebt fehlende Bounty-Tabellen", async () => {
    const p = pool([
      ["FROM deal_reliability", { rows: [] }],
      ["FROM user_bounties ub", new Error('relation "user_bounties" does not exist')]
    ]);
    const f = await svc.berechneStornoFolgen(p, {
      partyUserId: "a", side: "agency", startDatum: BEGINN_KURZFRISTIG, jetzt: JETZT
    });
    assert.deepEqual(f.bounties_in_gefahr, []);
  });

  // Beim Lauf gegen echte Daten aufgefallen: ein eigener pg-Pool (ohne
  // db/typeParsers.js) liefert DATE-Spalten als Date-Objekt. `String(date)`
  // ergibt "Sat Jun 11 2026 …", der Tages-Regex verwarf das, und E1 fiel
  // lautlos auf Gewicht 1 zurueck. In der App latent, weil db/pool.js den
  // Parser laedt — aber genau die Art stiller Degradierung, die diese Welle
  // abstellen soll.
  it("versteht auch ein Date-Objekt als Einsatzbeginn", async () => {
    const p = vollerPool({ quote: { binding_deals: 10, weighted_cancellations: "0", reliability_rate: "100.00" } });
    const f = await svc.berechneStornoFolgen(p, {
      partyUserId: "agentur-1", side: "agency",
      startDatum: new Date("2026-08-08T00:00:00Z"), jetzt: JETZT
    });
    assert.equal(f.vorlauf_klasse, "kurzfristig",
      "als Zeichenkette waere das kurzfristig — als Date-Objekt darf es nicht 'unbekannt' werden");
    const byCode = Object.fromEntries(f.gruende.map((g) => [g.reason_code, g]));
    assert.equal(byCode.worker_quit.gewicht, 2);
  });

  it("behandelt einen fehlenden Einsatzbeginn als unbekannt, nicht als harmlos", async () => {
    const p = vollerPool({ quote: { binding_deals: 10, weighted_cancellations: "0", reliability_rate: "100.00" } });
    const f = await svc.berechneStornoFolgen(p, {
      partyUserId: "agentur-1", side: "agency", startDatum: null, jetzt: JETZT
    });
    assert.equal(f.vorlauf_klasse, "unbekannt");
    assert.equal(f.vorlauf_stunden, null);
    const byCode = Object.fromEntries(f.gruende.map((g) => [g.reason_code, g]));
    assert.equal(byCode.worker_quit.gewicht, 1, "einfach — weder Freispruch noch Verschaerfung");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * Die beiden Vorschauen
 * ══════════════════════════════════════════════════════════════════════════ */

describe("P8/D · Abschluss-Vorschau (3 Schritte)", () => {
  it("liefert alle drei Schritte mit Inhalt", async () => {
    const p = vollerPool({
      quote: { binding_deals: 12, weighted_cancellations: "1.00", reliability_rate: "91.67" },
      operativ: { kraefte: 3, reservierungen: 1, einladungen: 2 }
    });
    const out = await svc.buildCommitmentPreview(p, "off-1", "agentur-1", { jetzt: JETZT });

    assert.equal(out.side, "agency");
    assert.equal(out.schritt1_was.leistung, "Lagerhelfer Nachtschicht");
    assert.equal(out.schritt1_was.ort, "Berlin");
    assert.equal(out.schritt1_was.menge, 5);
    assert.equal(out.schritt1_was.preis.wert, 24.5);
    assert.equal(out.schritt2_wer_wie.benoetigt, 5);
    assert.equal(out.schritt2_wer_wie.bereits_zugewiesen, 3);
    assert.equal(out.schritt2_wer_wie.besetzung_messbar, true);
    assert.equal(out.schritt2_wer_wie.ansprechpartner.agentur, "Schnell Personal GmbH");
    assert.equal(out.schritt3_verbindlichkeit.quote_aktuell, 91.67);
    assert.ok(out.schritt3_verbindlichkeit.gruende.length > 0);
  });

  it("blockt Unbeteiligte mit FORBIDDEN und Unbekanntes mit NOT_FOUND", async () => {
    const p = vollerPool({});
    assert.equal((await svc.buildCommitmentPreview(p, "off-1", "fremder")).error, "FORBIDDEN");
    const leer = pool([["AS demand_title", { rows: [] }]]);
    assert.equal((await svc.buildCommitmentPreview(leer, "off-x", "agentur-1")).error, "NOT_FOUND");
  });

  it("bleibt ohne Staffing-Tabellen benutzbar (Besetzung dann nicht messbar)", async () => {
    const p = pool([
      ["AS demand_title", { rows: [DEAL] }],
      ["FROM deal_reliability", { rows: [] }],
      ["worker_assignment_links", new Error("relation does not exist")]
    ]);
    const out = await svc.buildCommitmentPreview(p, "off-1", "agentur-1", { jetzt: JETZT });
    assert.equal(out.schritt2_wer_wie.besetzung_messbar, false);
    assert.equal(out.schritt2_wer_wie.benoetigt, 5, "der Bedarf steht trotzdem");
  });
});

describe("P8/D · Storno-Auswirkung (2 Schritte)", () => {
  it("nennt Betroffene und Gegenseite", async () => {
    const p = vollerPool({
      quote: { binding_deals: 9, weighted_cancellations: "0", reliability_rate: "100.00" },
      operativ: { kraefte: 3, reservierungen: 2, einladungen: 1 }
    });
    const out = await svc.buildCancellationImpact(p, "off-1", "agentur-1", { jetzt: JETZT });
    assert.equal(out.side, "agency");
    assert.equal(out.gegenseite, "Muster Logistik GmbH");
    assert.equal(out.operativ.zugewiesene_kraefte, 3);
    assert.equal(out.operativ.reservierungen, 2);
    assert.equal(out.operativ.einladungen, 1);
    assert.equal(out.operativ.einsatz_beginn, BEGINN_KURZFRISTIG);
    assert.ok(out.folgen.gruende.length === svc.STORNO_GRUENDE.length);
  });

  it("zeigt dem Unternehmen die Agentur als Gegenseite", async () => {
    const p = vollerPool({});
    const out = await svc.buildCancellationImpact(p, "off-1", "firma-1", { jetzt: JETZT });
    assert.equal(out.gegenseite, "Schnell Personal GmbH");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * Verdrahtung
 * ══════════════════════════════════════════════════════════════════════════ */

describe("P8/D · Verdrahtung", () => {
  it("jeder Storno-Grund hat eine Beschriftung", () => {
    for (const code of svc.STORNO_GRUENDE) {
      assert.ok(svc.GRUND_LABELS[code], `Beschriftung fehlt: ${code}`);
    }
    assert.equal(Object.keys(svc.GRUND_LABELS).length, svc.STORNO_GRUENDE.length,
      "keine verwaisten Beschriftungen");
  });

  it("beide Vorschau-Routen existieren und sind lesend", () => {
    const src = lies("api/routes/marketplace.js");
    assert.match(src, /router\.get\("\/marketplace\/offers\/:id\/commitment-preview"/);
    assert.match(src, /router\.get\("\/marketplace\/offers\/:id\/cancellation-impact"/);
    assert.ok(!/commitment-preview[\s\S]{0,400}res\.locals\.audit/.test(src),
      "eine Vorschau ist keine Handlung und schreibt kein Audit");
  });

  it("der tote window.prompt-Pfad ist weg", () => {
    const html = lies("frontend/public/offer_detail.html");
    assert.ok(!/window\.prompt\(/.test(html),
      "der Prompt schickte Freitext als `reason` — die Route verlangt seit Welle A `reason_code`");
    assert.ok(!/body\.reason\s*=/.test(html),
      "der Freitext-Pfad ist entfernt, nicht nur umgangen");
    assert.match(html, /openCancelWizard/, "der Storno laeuft jetzt ueber den Assistenten");
  });

  it("beide Aktionen laufen ueber den Assistenten und schicken den Pflicht-Grund", () => {
    const html = lies("frontend/public/offer_detail.html");
    assert.match(html, /if \(action === 'confirm-agreement'\) return window\.openCommitWizard\(\)/);
    assert.match(html, /if \(action === 'cancel-agreement'\) return window\.openCancelWizard\(\)/);
    assert.match(html, /reason_code: wiz\.auswahl\.reason_code/);
  });

  it("kein Schritt laesst sich ueberspringen (Gate D)", () => {
    const html = lies("frontend/public/offer_detail.html");
    assert.match(html, /if \(schritt\.pruefen && !schritt\.pruefen\(\)\) return;/,
      "die Pruefung steht vor dem Weiter");
    assert.match(html, /if \(!wiz\.auswahl\.reason_code\)[\s\S]{0,160}return false;/,
      "ohne Grund kein zweiter Schritt");
  });

  it("die Folgen kommen aus der Antwort, nicht aus festem Text (Gate D)", () => {
    const html = lies("frontend/public/offer_detail.html");
    assert.match(html, /function wizFolgen\(f, gewaehlterGrund\)/);
    assert.match(html, /f\.quote_aktuell/);
    assert.match(html, /f\.bounties_in_gefahr/);
    assert.match(html, /grund\.quote_danach/);
  });

  it("Abbruch aendert nichts am Zustand (Gate D)", () => {
    const html = lies("frontend/public/offer_detail.html");
    const block = html.slice(html.indexOf("function wizSchliessen"), html.indexOf("async function wizOeffnen"));
    assert.ok(!/apiPost|fetch\(/.test(block), "Schliessen darf nichts senden");
    assert.match(block, /wiz\.auswahl = \{ reason_code: null, note: '' \}/);
  });
});
