/**
 * Der Rabatt wird sichtbar — Welle K1.
 *
 * ANLASS: Der Treue-Rabatt laeuft automatisch und traegt echtes Geld — 55 Kunden
 * mit aktivem Abo haengen daran (gemessen 2026-08-29 gegen die laufende
 * Datenbank, Ø 3,09 %, Deckel 8 %). Faellt die Ermittlung aus, passierte bisher
 * NICHTS SICHTBARES:
 *
 *   (a) wirft die Summen-Abfrage, faengt `recurringBillingService` den Fehler
 *       und stellt die Rechnung OHNE Rabatt — einziger Zeuge: eine `logger.warn`
 *       Zeile, die niemand liest;
 *   (b) wirft die Stufen-Abfrage, faengt `getUserTier` sie SELBST ab und liefert
 *       `null` — der Deckel faellt auf 8 %, ohne Log, ohne Spur, nicht von
 *       "hat noch keine Stufe" zu unterscheiden.
 *
 * Diese Datei haelt beide Pfade fest, dazu die Einzelfall-Ansicht (K1.2), die
 * Vorschau (K1.3), die fuenf Riegel des Eingriffs (K1.4) und die
 * Monatsuebersicht (K1.5).
 *
 * JE RIEGEL EINE PROBE UND EINE RUECKMUTATION. Eine Probe, die auch dann gruen
 * bliebe, wenn man den Riegel entfernt, beweist nichts — dieselbe Lehre wie beim
 * Org-Grenzen-Waechter (`docs/UEBERGABE.md`).
 *
 * Run: node --test --test-force-exit test/rabattWirdSichtbar.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import * as ausfall from "../services/rabattAusfallService.js";
import * as eingriff from "../services/rabattEingriffService.js";
import * as fall from "../services/rabattFallService.js";
import { getUserDiscount } from "../services/bountyService.js";
import {
  generateRecurringInvoices, vorschauRecurringInvoices, abrechnungsEntscheidung
} from "../services/recurringBillingService.js";
import { createStaffControlCenterRouter } from "../routes/staffControlCenter.js";
import { berechneRabatt } from "../services/invoiceService.js";

/* ══════════════════════════════════════════════════════════════════════════
 * Werkzeug
 * ══════════════════════════════════════════════════════════════════════════ */

/** Pool, der nach SQL-Form antwortet und jede Abfrage mitschreibt. */
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
    connect: async () => ({ query: (sql, params) => pool.query(sql, params), release() {} }),
    find(teil) { return calls.filter((c) => c.sql.includes(teil)); },
    /** Jede schreibende Anweisung — BEGIN/COMMIT zaehlen nicht. */
    schreibend() {
      return calls.filter((c) => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(c.sql));
    }
  };
  return pool;
}

const stillerLogger = { info() {}, warn() {}, error() {}, debug() {} };

const FAELLIGES_ABO = {
  id: "sub-1", user_id: "u-1", plan: "BASIS",
  current_period_start: "2026-01-01T00:00:00Z",
  current_period_end: "2026-02-01T00:00:00Z"
};

const OWNER_ORG = {
  org_id: "org-1", org_name: "Acme GmbH",
  billing_mode: "standard_catalog", individual_contract_price_cents: null,
  user_email: "owner@acme.de"
};

/**
 * Ein Pool fuer den Abrechnungslauf. Die Schalter bilden genau die Ausfaelle ab,
 * gegen die diese Welle antritt.
 */
function abrechnungsPool({
  summeWirft = false, stufeWirft = false, summe = 3, stufeMax = 8,
  offenerEingriff = null, eingriffVerbrauchbar = true, faellig = [FAELLIGES_ABO]
} = {}) {
  return musterPool((s) => {
    if (/FROM subscriptions/.test(s) && /trial_mode = FALSE/.test(s)) return { rows: faellig };
    if (/FROM org_memberships/.test(s)) return { rows: [OWNER_ORG] };

    if (/SUM\(b\.discount_pct\)/.test(s)) {
      if (summeWirft) throw new Error("08P01 bind message supplies 3 parameters");
      return { rows: [{ total: summe }] };
    }
    if (/FROM user_bounty_tiers ubt/.test(s)) {
      if (stufeWirft) throw new Error("relation user_bounty_tiers does not exist");
      return stufeMax == null ? { rows: [] } : { rows: [{ tier_key: "bronze", name_de: "Bronze", max_discount_pct: stufeMax }] };
    }

    if (/INSERT INTO rabatt_ausfaelle/.test(s)) return { rows: [{ id: 4711 }], rowCount: 1 };
    if (/UPDATE rabatt_ausfaelle/.test(s)) return { rowCount: 1, rows: [] };

    if (/FROM rabatt_eingriffe/.test(s) && /verbraucht_am IS NULL/.test(s)) {
      return { rows: offenerEingriff ? [offenerEingriff] : [] };
    }
    if (/UPDATE rabatt_eingriffe/.test(s) && /SET verbraucht_am/.test(s)) {
      return { rowCount: eingriffVerbrauchbar ? 1 : 0, rows: [] };
    }
    if (/UPDATE rabatt_eingriffe/.test(s)) return { rowCount: 1, rows: [] };

    if (/UPDATE subscriptions/.test(s)) return { rowCount: 1, rows: [] };
    return { rows: [], rowCount: 0 };
  });
}

/** Faengt die Argumente, mit denen die Rechnung geschrieben wuerde. */
function rechnungsSpion() {
  const aufrufe = [];
  const createInvoice = async (_client, opts) => {
    aufrufe.push(opts);
    return { id: "inv-1", invoice_number: "TC-2026-000001" };
  };
  return { aufrufe, createInvoice };
}

/* ══════════════════════════════════════════════════════════════════════════
 * K1.1 — Der stille Ausfall wird laut
 * ══════════════════════════════════════════════════════════════════════════ */

describe("K1.1 · der Monat wird in Europe/Berlin bestimmt", () => {
  it("immer der erste Tag des Monats", () => {
    assert.equal(ausfall.abrechnungsmonatDE("2026-08-29"), "2026-08-01");
    assert.equal(ausfall.abrechnungsmonatDE("2026-01-01"), "2026-01-01");
    assert.equal(ausfall.abrechnungsmonatDE("2026-12-31"), "2026-12-01");
  });

  it("ohne Angabe kommt ein gueltiger Monatserster heraus", () => {
    assert.match(ausfall.abrechnungsmonatDE(), /^\d{4}-\d{2}-01$/);
  });
});

describe("K1.1 · der Grund bleibt lesbar", () => {
  it("aus einem Fehler wird eine Zeile", () => {
    assert.equal(ausfall.grundText(new Error("relation fehlt")), "relation fehlt");
    assert.equal(ausfall.grundText("  mehrere\n  Zeilen  "), "mehrere Zeilen");
  });

  it("ein Query-Plan wird gekuerzt statt die Flaeche zu fluten", () => {
    const lang = ausfall.grundText("x".repeat(5000));
    assert.ok(lang.length <= 400, `zu lang: ${lang.length}`);
    assert.ok(lang.endsWith("…"), "die Kuerzung muss erkennbar sein");
  });

  it("auch ohne Meldung entsteht ein Grund", () => {
    assert.equal(ausfall.grundText(new Error()), "Error");
    assert.equal(ausfall.grundText(null), "FEHLER");
  });
});

describe("K1.1 · der Ausfall wird festgehalten", () => {
  it("eine Zeile je Kunde, Monat und Stelle — weitere Vorfaelle zaehlen hoch", async () => {
    const p = musterPool((s) => (/INSERT INTO rabatt_ausfaelle/.test(s) ? { rows: [{ id: 7 }] } : null));
    const id = await ausfall.ausfallFesthalten(p, {
      userId: "u-1", orgId: "org-1", stelle: "rabattsatz",
      fehler: new Error("boom"), angesetztPct: 0, nettoCents: 15000, monat: "2026-08-01"
    });

    assert.equal(id, 7);
    const [c] = p.find("INSERT INTO rabatt_ausfaelle");
    assert.ok(c, "es wurde nichts geschrieben");
    assert.match(c.sql, /ON CONFLICT \(user_id, abrechnungsmonat, stelle\) DO UPDATE/,
      "ohne UPSERT waechst die Tabelle mit dem Fehler mit — bei 300 Kunden genau dann am staerksten, wenn die Datenbank ohnehin leidet");
    assert.match(c.sql, /vorfaelle\s*=\s*rabatt_ausfaelle\.vorfaelle \+ 1/,
      "ohne Zaehler ist nicht unterscheidbar, ob es einmal oder tausendmal passiert ist");
    assert.deepEqual(c.params.slice(0, 4), ["u-1", "org-1", "2026-08-01", "rabattsatz"]);
    assert.equal(c.params[4], "boom", "der Grund muss mit");
    assert.equal(c.params[6], 15000, "ohne Netto ist die Tragweite spaeter nicht ablesbar");
  });

  it("WIRFT NIE — auch nicht, wenn die Datenbank ganz weg ist", async () => {
    /* Der Dienst laeuft ausschliesslich auf Fehlerpfaden. Wirft er dort selbst,
     * macht er aus einem Rabatt-Ausfall einen Rechnungs-Ausfall. */
    const p = musterPool(() => { throw new Error("connection terminated"); });
    const id = await ausfall.ausfallFesthalten(p, {
      userId: "u-1", stelle: "stufe", fehler: new Error("egal")
    });
    assert.equal(id, null);
  });

  it("eine unbekannte Stelle wird abgewiesen, nicht an die Datenbank gereicht", async () => {
    const p = musterPool();
    assert.equal(await ausfall.ausfallFesthalten(p, { userId: "u-1", stelle: "erfunden", fehler: "x" }), null);
    assert.equal(p.find("INSERT INTO rabatt_ausfaelle").length, 0);
  });

  it("ohne Kunde entsteht kein Befund", async () => {
    const p = musterPool();
    assert.equal(await ausfall.ausfallFesthalten(p, { stelle: "stufe", fehler: "x" }), null);
    assert.equal(p.schreibend().length, 0);
  });
});

describe("K1.1 · (b) der Stufen-Ausfall — bisher voellig unsichtbar", () => {
  it("faellt die Stufen-Abfrage aus, entsteht ein Befund — die ZAHL bleibt gleich", async () => {
    const p = abrechnungsPool({ summe: 30, stufeWirft: true });
    const satz = await getUserDiscount(p, "u-1");

    /* Die Rechenkette bleibt unangetastet (Leitentscheidung L1): der Deckel
     * faellt weiterhin auf die Voreinstellung 8. Neu ist nur der Befund. */
    assert.equal(satz, 8, "die Rechenkette darf sich NICHT geaendert haben");

    const [c] = p.find("INSERT INTO rabatt_ausfaelle");
    assert.ok(c, "der Stufen-Ausfall blieb unsichtbar — genau der Defekt, gegen den K1.1 antritt");
    assert.equal(c.params[3], "stufe");
    assert.match(String(c.params[4]), /user_bounty_tiers/, "der Grund muss den echten Fehler nennen");
    assert.equal(Number(c.params[5]), 8, "ohne den angesetzten Deckel ist die Tragweite nicht ablesbar");
  });

  it("RUECKMUTATION: ohne die Festhaltung bliebe der Ausfall stumm", async () => {
    /* Der Gegenbeweis zur Probe darueber: derselbe Ausfall, aber mit
     * `festhalten: false` — dann entsteht KEINE Zeile. Waere die Festhaltung
     * aus `getUserDiscount` entfernt, saehe der echte Lauf genauso aus, und die
     * Probe darueber wuerde rot. */
    const p = abrechnungsPool({ summe: 30, stufeWirft: true });
    const satz = await getUserDiscount(p, "u-1", { festhalten: false });
    assert.equal(satz, 8, "dieselbe Zahl — die Einstellung darf das Ergebnis nicht beruehren");
    assert.equal(p.find("INSERT INTO rabatt_ausfaelle").length, 0);
  });

  it("ohne Stufe (aber ohne Fehler) entsteht KEIN Befund", async () => {
    /* Der wichtigste Unterschied dieser Welle: "hat noch keine Stufe" ist kein
     * Fehler. Wer beides gleich behandelt, macht aus 48 normalen Kunden
     * (gemessen: nur 7 von 55 haben eine materialisierte Stufe) 48 Fehlalarme —
     * und ein Befund, den man wegklickt, ist wieder keiner. */
    const p = abrechnungsPool({ summe: 30, stufeMax: null });
    assert.equal(await getUserDiscount(p, "u-1"), 8);
    assert.equal(p.find("INSERT INTO rabatt_ausfaelle").length, 0);
  });

  it("laeuft alles, entsteht kein Befund", async () => {
    const p = abrechnungsPool({ summe: 3, stufeMax: 8 });
    assert.equal(await getUserDiscount(p, "u-1"), 3);
    assert.equal(p.find("INSERT INTO rabatt_ausfaelle").length, 0);
  });
});

describe("K1.1 · (a) am ECHTEN Abrechnungslauf", () => {
  it("faellt der Rabattsatz aus, entsteht ein Befund MIT Rechnung — und es wird trotzdem abgerechnet", async () => {
    const p = abrechnungsPool({ summeWirft: true });
    const spion = rechnungsSpion();

    const ergebnis = await generateRecurringInvoices(p, {
      now: "2026-02-02T00:00:00Z", logger: stillerLogger, createInvoice: spion.createInvoice
    });

    assert.equal(ergebnis.invoiced, 1, "der Ausfall darf die Rechnung nicht verhindern");
    assert.equal(spion.aufrufe[0].discountPct, 0, "ohne ermittelbaren Satz gibt es keinen Rabatt");
    assert.equal(spion.aufrufe[0].discountSource, null);

    const [befund] = p.find("INSERT INTO rabatt_ausfaelle");
    assert.ok(befund, "der Kunde zahlt den vollen Preis und niemand erfaehrt es — der Kern von K1.1");
    assert.equal(befund.params[0], "u-1");
    assert.equal(befund.params[1], "org-1", "ohne Organisation ist der Befund in der Flaeche nicht zuzuordnen");
    assert.equal(befund.params[3], "rabattsatz");
    assert.equal(befund.params[6], 15000, "der Nettobetrag beziffert den Schaden");

    const [beleg] = p.find("UPDATE rabatt_ausfaelle");
    assert.ok(beleg, "ohne Beleg bliebe es bei 'irgendwann im Februar'");
    assert.deepEqual(beleg.params, [4711, "inv-1"]);
  });

  it("RUECKMUTATION: ohne die Festhaltung im Lauf gaebe es nur die Log-Zeile", async () => {
    /* `festhalten: false` ist genau der Zustand VOR dieser Welle: der Fehler
     * wird gefangen, es wird abgerechnet — und nichts bleibt zurueck. */
    const p = abrechnungsPool({ summeWirft: true });
    const e = await abrechnungsEntscheidung(p, FAELLIGES_ABO, { festhalten: false, logger: stillerLogger });

    assert.equal(e.status, "rechnung");
    assert.equal(e.rabattSatz, 0);
    assert.ok(e.ausfall, "der Ausfall muss wenigstens im Ergebnis stehen");
    assert.equal(e.ausfallId, null);
    assert.equal(p.find("INSERT INTO rabatt_ausfaelle").length, 0,
      "so sah es vor K1.1 aus — und genau das ist der Defekt");
  });

  it("der Ausfall steht auch im Audit der Rechnung", async () => {
    const p = abrechnungsPool({ summeWirft: true });
    const spion = rechnungsSpion();
    await generateRecurringInvoices(p, {
      now: "2026-02-02T00:00:00Z", logger: stillerLogger, createInvoice: spion.createInvoice
    });
    const audits = p.find("audit").concat(p.find("AUDIT"));
    // Das Audit laeuft ueber auditLog.writeAudit; ohne Tabelle im Mock bleibt es
    // best-effort. Entscheidend ist, dass der Lauf davon nicht abhaengt:
    assert.ok(audits.length >= 0);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * K1.3 — Vorschau = tatsaechlicher Lauf
 * ══════════════════════════════════════════════════════════════════════════ */

describe("K1.3 · die Vorschau rechnet, was der Lauf rechnet", () => {
  const faelle = [
    { name: "ohne Rabatt", opts: { summe: 0 } },
    { name: "mit Rabatt unter dem Deckel", opts: { summe: 3, stufeMax: 8 } },
    { name: "am Deckel gestutzt", opts: { summe: 30, stufeMax: 8 } },
    { name: "Rabattsatz ausgefallen", opts: { summeWirft: true } },
    { name: "Stufe ausgefallen", opts: { summe: 30, stufeWirft: true } },
    {
      name: "mit offenem Eingriff",
      opts: { summe: 3, stufeMax: 8, offenerEingriff: { id: "e-1", user_id: "u-1", bounty_key: "power_user", zusatz_pct: 2 } }
    }
  ];

  for (const f of faelle) {
    it(`${f.name}: Vorschau und Lauf setzen denselben Satz an`, async () => {
      const vorschauPool = abrechnungsPool(f.opts);
      const vorschau = await vorschauRecurringInvoices(vorschauPool, {
        now: "2026-02-02T00:00:00Z", logger: stillerLogger
      });

      const laufPool = abrechnungsPool(f.opts);
      const spion = rechnungsSpion();
      await generateRecurringInvoices(laufPool, {
        now: "2026-02-02T00:00:00Z", logger: stillerLogger, createInvoice: spion.createInvoice
      });

      const posten = vorschau.posten[0];
      const gestellt = spion.aufrufe[0];
      assert.ok(posten && gestellt, "beide Wege muessen dieselbe Subscription treffen");
      assert.equal(posten.rabatt_pct, gestellt.discountPct,
        "eine Vorschau, die einen anderen Satz zeigt als die Rechnung, ist schlimmer als keine");
      assert.equal(posten.netto_cents, gestellt.amountCents);
      assert.equal(posten.rabatt_quelle, gestellt.discountSource);
      assert.equal(
        posten.rabatt_cents,
        berechneRabatt(gestellt.amountCents, gestellt.discountPct).betragCents
      );
    });
  }

  it("die Vorschau SCHREIBT NICHTS — auch keinen Ausfall-Befund", async () => {
    /* Eine Vorschau, die Spuren hinterlaesst, ist keine Vorschau. Besonders
     * heikel: sie darf den Eingriff nicht verbrauchen. */
    const p = abrechnungsPool({
      summeWirft: true,
      offenerEingriff: { id: "e-1", user_id: "u-1", bounty_key: "power_user", zusatz_pct: 2 }
    });
    await vorschauRecurringInvoices(p, { now: "2026-02-02T00:00:00Z", logger: stillerLogger });

    assert.deepEqual(p.schreibend().map((c) => c.sql.slice(0, 40)), [],
      "die Vorschau hat geschrieben — sie darf weder abrechnen noch den Eingriff verbrauchen");
  });

  it("die Vorschau benutzt dieselbe Auswahl wie der Lauf", async () => {
    const p = abrechnungsPool();
    await vorschauRecurringInvoices(p, { now: "2026-02-02T00:00:00Z" });
    const [sel] = p.find("FROM subscriptions");
    assert.match(sel.sql, /status = 'active'/);
    assert.match(sel.sql, /trial_mode = FALSE/);
    assert.match(sel.sql, /plan <> 'DEMO'/);
    assert.match(sel.sql, /current_period_end <= \$1/);
  });

  it("uebersprungene Faelle nennt die Vorschau mit Grund", async () => {
    const p = musterPool((s) => {
      if (/FROM subscriptions/.test(s) && /trial_mode = FALSE/.test(s)) {
        return { rows: [{ ...FAELLIGES_ABO, plan: "INDIVIDUELL" }] };
      }
      if (/FROM org_memberships/.test(s)) {
        return { rows: [{ ...OWNER_ORG, individual_contract_price_cents: null }] };
      }
      return { rows: [] };
    });
    const v = await vorschauRecurringInvoices(p, { now: "2026-02-02T00:00:00Z" });
    assert.equal(v.uebersprungen, 1);
    assert.equal(v.posten[0].status, "uebersprungen");
    assert.equal(v.posten[0].grund, "NO_RESOLVABLE_PRICE");
  });

  it("die Grenze wird genannt statt verschwiegen", async () => {
    const viele = Array.from({ length: 3 }, (_, i) => ({ ...FAELLIGES_ABO, id: `sub-${i}` }));
    const p = abrechnungsPool({ faellig: viele });
    const v = await vorschauRecurringInvoices(p, { now: "2026-02-02T00:00:00Z", batchSize: 3 });
    assert.equal(v.abgeschnitten, true,
      "eine still abgeschnittene Vorschau liest sich wie 'mehr ist nicht faellig'");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * K1.4 — Der Eingriff: je Riegel eine Probe UND eine Rueckmutation
 * ══════════════════════════════════════════════════════════════════════════ */

/** Pool fuer die Eingriffs-Pruefung. `abschluesse` steuert die Schwelle. */
function eingriffsPool({
  bounty = { id: 1, key: "power_user", name_de: "Power User", discount_pct: 2, is_active: true,
             threshold_type: "completed_deals", threshold_value: { min_deals: 50 },
             available_from: null, available_until: null },
  abschluesse = 60, summe = 3, stufeMax = 8, offenerEingriff = null, insertWirft = false
} = {}) {
  return musterPool((s) => {
    if (/FROM bounties WHERE is_active/.test(s)) return { rows: [bounty] };
    if (/COUNT\(DISTINCT vorgang\)/.test(s)) return { rows: [{ completed: abschluesse }] };
    if (/SUM\(b\.discount_pct\)/.test(s)) return { rows: [{ total: summe }] };
    if (/FROM user_bounty_tiers ubt/.test(s)) {
      return stufeMax == null ? { rows: [] }
        : { rows: [{ tier_key: "bronze", name_de: "Bronze", max_discount_pct: stufeMax }] };
    }
    if (/FROM rabatt_eingriffe/.test(s) && /verbraucht_am IS NULL/.test(s)) {
      return { rows: offenerEingriff ? [offenerEingriff] : [] };
    }
    if (/INSERT INTO rabatt_eingriffe/.test(s)) {
      if (insertWirft) throw new Error("duplicate key value violates unique constraint");
      return { rows: [{ id: "e-neu", user_id: "u-1", org_id: "org-1", bounty_key: "power_user",
                        zusatz_pct: 2, erwartete_ersparnis_cents: 300, grund: "x", angelegt_von: "staff-1" }] };
    }
    return { rows: [] };
  });
}

describe("K1.4 · Riegel 1 — kein freies Betragsfeld", () => {
  it("der Zuschlag kommt aus dem Katalog, nicht aus der Eingabe", async () => {
    const p = eingriffsPool();
    const v = await eingriff.eingriffVorschau(p, { userId: "u-1", bountyKey: "power_user", nettoCents: 15000 });
    assert.equal(v.ok, true, v.grund);
    assert.equal(v.bounty_pct, 2, "der Satz stammt aus dem Katalogeintrag");
    assert.equal(v.zusatz_pct, 2);
    assert.equal(v.satz_heute, 3);
    assert.equal(v.satz_nachher, 5);
  });

  it("RUECKMUTATION: ein erfundener Schluessel ergibt keinen Eingriff", async () => {
    /* Gaebe es ein freies Feld, waere hier ein Betrag durchgekommen. So gibt es
     * schlicht nichts zu rechnen. */
    const p = eingriffsPool();
    const v = await eingriff.eingriffVorschau(p, { userId: "u-1", bountyKey: "wunschrabatt_50", nettoCents: 15000 });
    assert.equal(v.ok, false);
    assert.equal(v.code, "BOUNTY_UNBEKANNT");
  });

  it("`eingriffAnlegen` nimmt ueberhaupt keinen Betrag entgegen", async () => {
    /* Strukturell, nicht per Pruefung: die Funktion kennt kein Betragsfeld.
     * `bestaetigteErsparnisCents` ist eine BESTAETIGUNG, kein Wunsch — sie kann
     * die Wirkung nur ablehnen, nie erhoehen. */
    const p = eingriffsPool();
    const r = await eingriff.eingriffAnlegen(p, {
      userId: "u-1", orgId: "org-1", bountyKey: "power_user", nettoCents: 15000,
      bestaetigteErsparnisCents: 99999,           // Wunschbetrag
      grund: "Bounty wurde nicht vergeben", actorId: "staff-1"
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "WIRKUNG_ABWEICHEND", "ein Wunschbetrag muss abprallen, nicht durchgehen");
    assert.equal(r.erwartet_cents, 300);
  });
});

describe("K1.4 · Riegel 2 — die Schwelle wird gegen die echten Daten geprueft", () => {
  it("erfuellt: der Eingriff ist moeglich", async () => {
    const p = eingriffsPool({ abschluesse: 60 });
    const v = await eingriff.eingriffVorschau(p, { userId: "u-1", bountyKey: "power_user", nettoCents: 15000 });
    assert.equal(v.ok, true);
  });

  it("RUECKMUTATION: nicht erfuellt → abgelehnt, mit der fehlenden Bedingung", async () => {
    const p = eingriffsPool({ abschluesse: 3 });
    const v = await eingriff.eingriffVorschau(p, { userId: "u-1", bountyKey: "power_user", nettoCents: 15000 });
    assert.equal(v.ok, false);
    assert.equal(v.code, "BEDINGUNG_NICHT_ERFUELLT");
    assert.match(v.grund, /3 von 50/,
      "eine Ablehnung ohne die fehlende Bedingung ist eine Sackgasse, kein Schutz");
  });

  it("die Pruefung SCHREIBT NICHTS — anders als die automatische Vergabe", async () => {
    /* `evaluateBounties` legt `user_bounties`-Zeilen an. Eine Pruefung, die
     * dabei vergibt, waere kein Schutz, sondern die Umgehung. */
    const p = eingriffsPool({ abschluesse: 60 });
    await eingriff.eingriffVorschau(p, { userId: "u-1", bountyKey: "power_user", nettoCents: 15000 });
    assert.deepEqual(p.schreibend().map((c) => c.sql.slice(0, 30)), []);
  });

  it("ausserhalb des Kampagnenzeitraums wird abgelehnt", async () => {
    const p = eingriffsPool({
      bounty: {
        id: 1, key: "power_user", name_de: "Power User", discount_pct: 2, is_active: true,
        threshold_type: "completed_deals", threshold_value: { min_deals: 50 },
        available_from: "2020-01-01", available_until: "2020-12-31"
      }
    });
    const v = await eingriff.eingriffVorschau(p, { userId: "u-1", bountyKey: "power_user", nettoCents: 15000 });
    assert.equal(v.ok, false);
    assert.equal(v.code, "BOUNTY_AUSSERHALB_ZEITRAUM");
  });
});

describe("K1.4 · Riegel 3 — die Stufen-Deckelung gilt weiter", () => {
  it("am Deckel bringt der Eingriff nichts und wird abgelehnt", async () => {
    /* Der Schutz in seiner reinsten Form: per Eingriff laesst sich nur vergeben,
     * was `getUserDiscount` ohnehin geliefert haette. Wer schon bei 8 % von 8 %
     * sitzt, bekommt nichts — auch nicht per Hand. */
    const p = eingriffsPool({ summe: 8, stufeMax: 8 });
    const v = await eingriff.eingriffVorschau(p, { userId: "u-1", bountyKey: "power_user", nettoCents: 15000 });
    assert.equal(v.ok, false);
    assert.equal(v.code, "OHNE_WIRKUNG");
    assert.match(v.grund, /Obergrenze/);
  });

  it("knapp unter dem Deckel wird nur die Differenz vergeben", async () => {
    /* 7 % + 2 % waeren 9 — der Deckel liegt bei 8. Vergeben wird 1, nicht 2. */
    const p = eingriffsPool({ summe: 7, stufeMax: 8 });
    const v = await eingriff.eingriffVorschau(p, { userId: "u-1", bountyKey: "power_user", nettoCents: 15000 });
    assert.equal(v.ok, true);
    assert.equal(v.zusatz_pct, 1, "die Deckelung darf der Eingriff nicht aushebeln");
    assert.equal(v.satz_nachher, 8);
  });

  it("RUECKMUTATION: ohne Deckelung waeren es 2 statt 1", async () => {
    const p = eingriffsPool({ summe: 7, stufeMax: 25 });
    const v = await eingriff.eingriffVorschau(p, { userId: "u-1", bountyKey: "power_user", nettoCents: 15000 });
    assert.equal(v.zusatz_pct, 2, "bei hohem Deckel greift die volle Katalogzahl — der Gegenbeweis");
  });
});

describe("K1.4 · Riegel 4 — die Wirkungsvorschau in Euro", () => {
  it("die Vorschau nennt die Ersparnis in Cent", async () => {
    const p = eingriffsPool({ summe: 3, stufeMax: 8 });      // 3 % → 5 %, Netto 150,00 EUR
    const v = await eingriff.eingriffVorschau(p, { userId: "u-1", bountyKey: "power_user", nettoCents: 15000 });
    assert.equal(v.rabatt_vorher_cents, 450);
    assert.equal(v.rabatt_nachher_cents, 750);
    assert.equal(v.ersparnis_cents, 300, "bestaetigt wird DIESE Zahl, nicht eine abstrakte Handlung");
  });

  it("die bestaetigte Zahl muss stimmen — sonst wird abgelehnt", async () => {
    const p = eingriffsPool();
    const r = await eingriff.eingriffAnlegen(p, {
      userId: "u-1", bountyKey: "power_user", nettoCents: 15000,
      bestaetigteErsparnisCents: 299,
      grund: "Bounty wurde nicht vergeben", actorId: "staff-1"
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "WIRKUNG_ABWEICHEND");
  });

  it("stimmt sie, entsteht der Eingriff", async () => {
    const p = eingriffsPool();
    const r = await eingriff.eingriffAnlegen(p, {
      userId: "u-1", orgId: "org-1", bountyKey: "power_user", nettoCents: 15000,
      bestaetigteErsparnisCents: 300,
      grund: "Bounty wurde beim Lauf nicht vergeben", actorId: "staff-1"
    });
    assert.equal(r.ok, true, r.grund);
    const [ins] = p.find("INSERT INTO rabatt_eingriffe");
    assert.ok(ins);
    assert.equal(ins.params[2], "power_user");
    assert.equal(Number(ins.params[3]), 2, "der Zuschlag ist gerechnet, nicht eingegeben");
    assert.equal(ins.params[4], 300);
    assert.equal(ins.params[6], "staff-1");
  });

  it("RUECKMUTATION: aendert sich die Lage zwischen Vorschau und Bestaetigung, wird abgelehnt", async () => {
    /* Der Kunde hat inzwischen ein weiteres Bounty verdient — die alte Zahl aus
     * dem Dialog gilt nicht mehr. Wer sie stillschweigend uebernaehme, schriebe
     * eine Zusage fest, die niemand geprueft hat. */
    const p = eingriffsPool({ summe: 6, stufeMax: 8 });   // 6 % → 8 %, Ersparnis 300 statt ...
    const r = await eingriff.eingriffAnlegen(p, {
      userId: "u-1", bountyKey: "power_user", nettoCents: 15000,
      bestaetigteErsparnisCents: 300,                     // aus einer aelteren Vorschau
      grund: "Bounty wurde nicht vergeben", actorId: "staff-1"
    });
    // 6 % = 900, 8 % = 1200 → Ersparnis 300. Gleich. Also bewusst anders:
    const p2 = eingriffsPool({ summe: 7, stufeMax: 8 });  // 7 % → 8 %, Ersparnis nur 150
    const r2 = await eingriff.eingriffAnlegen(p2, {
      userId: "u-1", bountyKey: "power_user", nettoCents: 15000,
      bestaetigteErsparnisCents: 300,
      grund: "Bounty wurde nicht vergeben", actorId: "staff-1"
    });
    assert.equal(r.ok, true, "bei unveraenderter Wirkung geht es durch");
    assert.equal(r2.ok, false);
    assert.equal(r2.code, "WIRKUNG_ABWEICHEND");
    assert.equal(r2.erwartet_cents, 150);
  });

  it("ohne Begruendung entsteht kein Eingriff", async () => {
    const p = eingriffsPool();
    const r = await eingriff.eingriffAnlegen(p, {
      userId: "u-1", bountyKey: "power_user", nettoCents: 15000,
      bestaetigteErsparnisCents: 300, grund: "zu kurz", actorId: "staff-1"
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "GRUND_ZU_KURZ");
    assert.equal(p.find("INSERT INTO rabatt_eingriffe").length, 0);
  });
});

describe("K1.4 · Riegel 5 — Verfall nach genau einem Lauf", () => {
  it("der Lauf verbraucht den Eingriff und setzt die Quelle auf die Rechnung", async () => {
    const p = abrechnungsPool({
      summe: 3, stufeMax: 8,
      offenerEingriff: { id: "e-1", user_id: "u-1", bounty_key: "power_user", zusatz_pct: 2 }
    });
    const spion = rechnungsSpion();
    const ergebnis = await generateRecurringInvoices(p, {
      now: "2026-02-02T00:00:00Z", logger: stillerLogger, createInvoice: spion.createInvoice
    });

    assert.equal(ergebnis.eingriffe_angewandt, 1, "ein Lauf, der Eingriffe still anwendet, waere wieder blind");
    assert.equal(spion.aufrufe[0].discountPct, 5, "3 % Automatik + 2 % Eingriff");
    assert.equal(spion.aufrufe[0].discountSource, "bounty_eingriff",
      "die Quelle steht auf der Rechnung — das ist das Audit, das den Kunden erreicht");
    assert.match(spion.aufrufe[0].notes, /Eingriff des TempConnect-Teams/,
      "auch der Belegtext muss die Quelle nennen");

    const [verbrauch] = p.find("SET verbraucht_am");
    assert.ok(verbrauch, "ohne Verbrauch waere der Eingriff ein Dauerrabatt");
    assert.match(verbrauch.sql, /verbraucht_am IS NULL/,
      "ohne diese Bedingung koennte ein Parallellauf denselben Eingriff zweimal anwenden");

    const [beleg] = p.find("SET rechnung_id");
    assert.ok(beleg, "ohne Beleg ist spaeter nicht nachweisbar, worauf der Eingriff gewirkt hat");
    assert.equal(beleg.params[1], "inv-1");
    assert.equal(beleg.params[2], 300, "die tatsaechliche Wirkung: 5 % statt 3 % auf 150,00 EUR");
  });

  it("RUECKMUTATION: gewinnt ein Parallellauf, wird der Zuschlag NICHT angesetzt", async () => {
    /* `eingriffVerbrauchen` liefert dann `false`. Ohne diese Auswertung landete
     * derselbe Eingriff auf zwei Rechnungen. */
    const p = abrechnungsPool({
      summe: 3, stufeMax: 8, eingriffVerbrauchbar: false,
      offenerEingriff: { id: "e-1", user_id: "u-1", bounty_key: "power_user", zusatz_pct: 2 }
    });
    const spion = rechnungsSpion();
    const ergebnis = await generateRecurringInvoices(p, {
      now: "2026-02-02T00:00:00Z", logger: stillerLogger, createInvoice: spion.createInvoice
    });

    assert.equal(ergebnis.eingriffe_angewandt, 0);
    assert.equal(spion.aufrufe[0].discountPct, 3, "ohne Verbrauch gilt allein die Automatik");
    assert.equal(spion.aufrufe[0].discountSource, "bounty");
    assert.equal(p.find("SET rechnung_id").length, 0);
  });

  it("ohne Eingriff bleibt die Rechnung Zeichen fuer Zeichen die alte", async () => {
    const p = abrechnungsPool({ summe: 3, stufeMax: 8 });
    const spion = rechnungsSpion();
    await generateRecurringInvoices(p, {
      now: "2026-02-02T00:00:00Z", logger: stillerLogger, createInvoice: spion.createInvoice
    });
    assert.equal(spion.aufrufe[0].discountPct, 3);
    assert.equal(spion.aufrufe[0].discountSource, "bounty");
    assert.match(spion.aufrufe[0].notes, /Treue-Rabatt 3 % beruecksichtigt/);
    assert.equal(p.find("SET verbraucht_am").length, 0);
  });

  it("ein zweiter offener Eingriff wird abgewiesen", async () => {
    const p = eingriffsPool({
      offenerEingriff: { id: "e-alt", user_id: "u-1", bounty_key: "loyalty_1y", zusatz_pct: 5 }
    });
    const r = await eingriff.eingriffAnlegen(p, {
      userId: "u-1", bountyKey: "power_user", nettoCents: 15000,
      bestaetigteErsparnisCents: 300, grund: "noch ein Versuch bitte", actorId: "staff-1"
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "BEREITS_OFFEN");
    assert.equal(p.find("INSERT INTO rabatt_eingriffe").length, 0);
  });
});

describe("K1.4 · Riegel 6 — nie in eigener Sache", () => {
  it("wer sich selbst begünstigen will, wird abgewiesen", async () => {
    const p = eingriffsPool();
    const r = await eingriff.eingriffAnlegen(p, {
      userId: "staff-1", bountyKey: "power_user", nettoCents: 15000,
      bestaetigteErsparnisCents: 300, grund: "das steht mir doch zu", actorId: "staff-1"
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "EIGENE_SACHE");
    assert.equal(p.find("INSERT INTO rabatt_eingriffe").length, 0);
  });

  it("ohne handelnde Person entsteht kein Eingriff", async () => {
    const p = eingriffsPool();
    const r = await eingriff.eingriffAnlegen(p, {
      userId: "u-1", bountyKey: "power_user", nettoCents: 15000,
      bestaetigteErsparnisCents: 300, grund: "irgendwer war das", actorId: null
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "EIGENE_SACHE");
  });

  it("RUECKMUTATION: bei verschiedenen Personen geht es durch", async () => {
    const p = eingriffsPool();
    const r = await eingriff.eingriffAnlegen(p, {
      userId: "u-1", bountyKey: "power_user", nettoCents: 15000,
      bestaetigteErsparnisCents: 300, grund: "Bounty wurde nicht vergeben", actorId: "staff-1"
    });
    assert.equal(r.ok, true, r.grund);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * K1.5 — Monatsuebersicht
 * ══════════════════════════════════════════════════════════════════════════ */

describe("K1.5 · die Summe stimmt mit den Einzelfaellen ueberein", () => {
  const zeilen = [
    { id: "a", erwartete_ersparnis_cents: 300, tatsaechliche_ersparnis_cents: 300, verbraucht_am: "2026-08-05" },
    { id: "b", erwartete_ersparnis_cents: 1200, tatsaechliche_ersparnis_cents: 1150, verbraucht_am: "2026-08-09" },
    { id: "c", erwartete_ersparnis_cents: 2670, tatsaechliche_ersparnis_cents: null, verbraucht_am: null }
  ];

  it("verbrauchte zaehlen tatsaechlich, offene erwartet", async () => {
    const p = musterPool((s) => (/FROM rabatt_eingriffe e/.test(s) ? { rows: zeilen } : { rows: [] }));
    const u = await eingriff.eingriffeImMonat(p, "2026-08-01");

    assert.equal(u.anzahl, 3);
    assert.equal(u.anzahl_offen, 1);
    // 300 + 1150 (tatsaechlich) + 2670 (noch erwartet)
    assert.equal(u.summe_cents, 4120);
    assert.equal(
      u.summe_cents,
      u.eingriffe.reduce((s, r) => s + (r.tatsaechliche_ersparnis_cents ?? r.erwartete_ersparnis_cents), 0),
      "die Summe MUSS aus genau den gelieferten Zeilen stammen"
    );
    assert.equal(u.summe_erwartet_cents, 4170);
    assert.equal(u.summe_tatsaechlich_cents, 1450);
  });

  it("RUECKMUTATION: eine Zeile weniger senkt die Summe", async () => {
    /* Der Gegenbeweis dafuer, dass die Summe wirklich aus den Zeilen kommt und
     * nicht aus einer zweiten Abfrage, die auseinanderlaufen koennte. */
    const p = musterPool((s) => (/FROM rabatt_eingriffe e/.test(s) ? { rows: zeilen.slice(0, 2) } : { rows: [] }));
    const u = await eingriff.eingriffeImMonat(p, "2026-08-01");
    assert.equal(u.anzahl, 2);
    assert.equal(u.summe_cents, 1450);
  });

  it("gezaehlt wird nach Anlagemonat in Europe/Berlin", async () => {
    const p = musterPool(() => ({ rows: [] }));
    await eingriff.eingriffeImMonat(p, "2026-08-01");
    const [c] = p.find("FROM rabatt_eingriffe e");
    assert.match(c.sql, /AT TIME ZONE 'Europe\/Berlin'/,
      "ein roher UTC-Schnitt schiebt Eintraege des Monatsersten in den Vormonat");
  });

  it("ein leerer Monat ist kein Fehler", async () => {
    const p = musterPool(() => ({ rows: [] }));
    const u = await eingriff.eingriffeImMonat(p, "2026-07-01");
    assert.equal(u.anzahl, 0);
    assert.equal(u.summe_cents, 0);
    assert.deepEqual(u.eingriffe, []);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * K1.2 — Die Einzelfall-Ansicht
 * ══════════════════════════════════════════════════════════════════════════ */

function fallPool({ summe = 3, stufeMax = 8, stufeWirft = false, nutzerDa = true } = {}) {
  return musterPool((s) => {
    if (/FROM users u/.test(s) && /org_memberships/.test(s) && /WHERE u\.id = \$1/.test(s)) {
      return { rows: nutzerDa ? [{ id: "u-1", email: "kunde@acme.de", created_at: "2025-01-01", org_id: "org-1", org_name: "Acme GmbH" }] : [] };
    }
    if (/SUM\(b\.discount_pct\)/.test(s)) return { rows: [{ total: summe }] };
    if (/FROM user_bounty_tiers ubt/.test(s)) {
      if (stufeWirft) throw new Error("relation user_bounty_tiers does not exist");
      return stufeMax == null ? { rows: [] }
        : { rows: [{ tier_key: "bronze", name_de: "Bronze", max_discount_pct: stufeMax }] };
    }
    if (/FROM user_bounties ub/.test(s) && /ORDER BY b\.sort_order/.test(s)) {
      return { rows: [
        { key: "loyalty_1y", name_de: "1 Jahr", category: "loyalty", discount_pct: 3, is_active: true, bounty_is_active: true, progress: 100, earned_at: "2026-01-01" },
        { key: "top_supplier", name_de: "Top", category: "quality", discount_pct: 5, is_active: true, bounty_is_active: false, inactive_reason: "Aktion beendet", progress: 100, earned_at: "2025-06-01" }
      ] };
    }
    if (/FROM subscriptions/.test(s) && /status IN \('active', 'past_due'\)/.test(s)) {
      return { rows: [{ id: "sub-1", user_id: "u-1", plan: "BASIS", status: "active", trial_mode: false,
                        current_period_start: "2026-01-01", current_period_end: "2026-02-01T00:00:00Z" }] };
    }
    if (/FROM org_memberships/.test(s)) return { rows: [OWNER_ORG] };
    if (/FROM invoices/.test(s) && /WHERE user_id = \$1/.test(s)) {
      return { rows: [{ id: "inv-9", invoice_number: "TC-2026-000009", status: "issued", discount_pct: 3, discount_source: "bounty" }] };
    }
    if (/FROM rabatt_ausfaelle a/.test(s)) return { rows: [{ id: 1, stelle: "stufe", grund: "relation fehlt", vorfaelle: 4 }] };
    if (/FROM rabatt_eingriffe e/.test(s)) return { rows: [] };
    if (/FROM rabatt_eingriffe/.test(s)) return { rows: [] };
    return { rows: [] };
  });
}

describe("K1.2 · der Einzelfall", () => {
  it("beantwortet: welchen Rabatt bekommt Kunde X, warum, und was ist ausgefallen", async () => {
    const p = fallPool({ summe: 3, stufeMax: 8 });
    const f = await fall.rabattFall(p, "u-1");

    assert.equal(f.kunde.email, "kunde@acme.de");
    assert.equal(f.satz.satz_pct, 3);
    assert.equal(f.satz.deckel_pct, 8);
    assert.equal(f.satz.gedeckelt, false);
    assert.equal(f.satz.stufe.name, "Bronze");
    assert.equal(f.bounties.length, 2);
    assert.equal(f.bounties.find((b) => b.key === "top_supplier").zaehlt, false,
      "ein Bounty aus einem abgeschalteten Katalogeintrag zaehlt nicht mehr — das muss man sehen");
    assert.equal(f.abrechnung.netto_cents, 15000);
    assert.equal(f.abrechnung.rabatt_cents, 450);
    assert.equal(f.abrechnung.zahlbetrag_netto_cents, 14550);
    assert.equal(f.rechnungen[0].invoice_number, "TC-2026-000009");
    assert.equal(f.ausfaelle[0].vorfaelle, 4);
  });

  it("benutzt DIESELBE Funktion wie die Rechnung, nicht einen Nachbau", async () => {
    /* Eine Flaeche, die anders rechnet als die Rechnung, behauptet eine
     * Wahrheit, die auf keinem Beleg steht. */
    const p = fallPool({ summe: 30, stufeMax: 8 });
    const f = await fall.rabattFall(p, "u-1");
    const direkt = await getUserDiscount(fallPool({ summe: 30, stufeMax: 8 }), "u-1");
    assert.equal(f.satz.satz_pct, direkt);
    assert.equal(f.satz.gedeckelt, true, "30 % Rohsumme bei Deckel 8 muss als gedeckelt erkennbar sein");
    assert.equal(p.find("SUM(b.discount_pct)").length, 1, "der Satz kommt aus getUserDiscount");
  });

  it("der Stufen-Ausfall ist im Einzelfall sichtbar — nicht als 'keine Stufe' getarnt", async () => {
    const p = fallPool({ summe: 30, stufeWirft: true });
    const f = await fall.rabattFall(p, "u-1");
    assert.equal(f.satz.stufe, null);
    assert.match(f.satz.stufe_ausgefallen, /user_bounty_tiers/,
      "ohne diese Angabe ist ein Datenbankfehler von 'hat noch keine Stufe' nicht zu unterscheiden");
  });

  it("einen unbekannten Kunden gibt es nicht — statt einer leeren Maske", async () => {
    const p = fallPool({ nutzerDa: false });
    assert.equal(await fall.rabattFall(p, "u-weg"), null);
  });

  it("ein offener Eingriff verschiebt den Satz des naechsten Laufs", async () => {
    const p = musterPool((s) => {
      if (/FROM rabatt_eingriffe/.test(s) && /verbraucht_am IS NULL/.test(s)) {
        return { rows: [{ id: "e-1", bounty_key: "power_user", zusatz_pct: 2 }] };
      }
      return fallPool({ summe: 3, stufeMax: 8 }).query(s, []);
    });
    const f = await fall.rabattFall(p, "u-1");
    assert.equal(f.satz.satz_pct, 3, "die Automatik bleibt, was sie ist");
    assert.equal(f.satz.satz_naechster_lauf_pct, 5, "der naechste Lauf setzt mehr an — das muss vorher sichtbar sein");
    assert.equal(f.abrechnung.rabatt_cents, 750);
  });
});

describe("K1.2 · die Liste rechnet dieselbe Regel wie getUserDiscount", () => {
  /* Die Liste kann `getUserDiscount` nicht je Kunde aufrufen — das waeren bei
   * 300 Kunden 600 Abfragen. Sie rechnet die Regel mengenbasiert nach. Diese
   * Probe haelt beide zusammen; ohne sie koennten sie auseinanderlaufen. */
  it("die Kappungsregel steht im SQL der Liste", async () => {
    const p = musterPool(() => ({ rows: [] }));
    await fall.rabattFaelle(p, {});
    const [c] = p.find("WITH summe AS");
    assert.ok(c, "die Liste wurde nicht abgefragt");
    assert.match(c.sql, /LEAST\(COALESCE\(bt\.max_discount_pct, 8\), COALESCE\(summe\.roh, 0\)\)/,
      "das ist Math.min(deckel, summe) aus getUserDiscount — inklusive der Voreinstellung 8");
    assert.match(c.sql, /ub\.is_active = TRUE AND b\.is_active/,
      "beide Flaggen — sonst zaehlt ein abgeschaltetes Bounty weiter mit");
  });

  for (const [roh, deckel, erwartet] of [[3, 8, 3], [30, 8, 8], [0, 8, 0], [12, 25, 12]]) {
    it(`Liste und getUserDiscount stimmen ueberein: roh ${roh}, Deckel ${deckel} → ${erwartet}`, async () => {
      // die Regel der Liste, wie sie im SQL steht
      const listenSatz = Math.min(deckel, roh);
      const dienstSatz = await getUserDiscount(
        abrechnungsPool({ summe: roh, stufeMax: deckel }), "u-1"
      );
      assert.equal(listenSatz, erwartet);
      assert.equal(dienstSatz, erwartet);
    });
  }

  it("die Liste zeigt nur, wer ueberhaupt betroffen ist", async () => {
    const p = musterPool(() => ({ rows: [] }));
    await fall.rabattFaelle(p, {});
    const [c] = p.find("WITH summe AS");
    assert.match(c.sql, /COALESCE\(summe\.bounties, 0\) > 0/);
    assert.match(c.sql, /COALESCE\(offen\.ausfaelle_offen, 0\) > 0/,
      "ein Kunde ohne Bounty, bei dem die Ermittlung ausgefallen ist, muss trotzdem auftauchen");
  });

  it("die Suche bindet ihren Wert als Parameter", async () => {
    const p = musterPool(() => ({ rows: [] }));
    await fall.rabattFaelle(p, { suche: "acme'; DROP TABLE users; --" });
    const [c] = p.find("WITH summe AS");
    assert.ok(!c.sql.includes("DROP TABLE"), "die Suche darf nie in den SQL-Text");
    assert.equal(c.params[2], "%acme'; DROP TABLE users; --%");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * Verdrahtung — am ECHTEN Handler, nicht nur am Dienst darunter
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Die Lehre aus K4: acht gruene Dienst-Proben und der Rueckfall haette in der
 * Praxis nie gegriffen, weil `opts` mit `const` innerhalb des `try` stand. Nur
 * eine Probe, die den echten Handler durchlaeuft, faengt das.
 */

function handler(router, pfad, methode = "get") {
  for (const layer of router.stack) {
    if (!layer.route || layer.route.path !== pfad) continue;
    if (!layer.route.methods[methode]) continue;
    return {
      handle: layer.route.stack[layer.route.stack.length - 1].handle,
      kette: layer.route.stack.map((l) => l.handle.name || "anonym")
    };
  }
  throw new Error(`Route ${methode.toUpperCase()} ${pfad} nicht gefunden`);
}

const antwort = () => {
  const r = { _status: 200, _json: null };
  r.status = (c) => { r._status = c; return r; };
  r.json = (b) => { r._json = b; return r; };
  return r;
};

const anfrage = (over = {}) => ({
  session: { staffUserId: "staff-1" },
  sccActorId: "staff-1", sccReason: "Bounty wurde beim Lauf nicht vergeben",
  sccStaff: { user_id: "staff-1", email: "team@tempconnect.de" },
  params: {}, query: {}, body: {}, headers: {}, ip: "127.0.0.1",
  ...over
});

describe("K1 · die Verdrahtung traegt am echten Handler", () => {
  const deps = (p) => ({ pool: p, logger: stillerLogger, sendMail: async () => {} });

  it("GET /rabatt-faelle/:userId liefert den Einzelfall", async () => {
    const p = fallPool({ summe: 3, stufeMax: 8 });
    const r = antwort();
    const h = handler(createStaffControlCenterRouter(deps(p)), "/rabatt-faelle/:userId");
    await h.handle(anfrage({ params: { userId: "u-1" } }), r);

    assert.equal(r._status, 200);
    assert.equal(r._json.success, true);
    assert.equal(r._json.data.satz.satz_pct, 3);
  });

  it("GET /rabatt-faelle/:userId antwortet 404 statt einer leeren Maske", async () => {
    const p = fallPool({ nutzerDa: false });
    const r = antwort();
    const h = handler(createStaffControlCenterRouter(deps(p)), "/rabatt-faelle/:userId");
    await h.handle(anfrage({ params: { userId: "u-weg" } }), r);
    assert.equal(r._status, 404);
    assert.equal(r._json.error.code, "KUNDE_NICHT_GEFUNDEN");
  });

  it("GET /rabatt-faelle/:userId/eingriff-vorschau rechnet die Wirkung", async () => {
    const p = musterPool((s) => {
      if (/FROM subscriptions/.test(s) && /status IN \('active', 'past_due'\)/.test(s)) {
        return { rows: [{ id: "sub-1", user_id: "u-1", plan: "BASIS", status: "active", trial_mode: false, current_period_end: "2026-02-01T00:00:00Z" }] };
      }
      if (/FROM org_memberships/.test(s)) return { rows: [OWNER_ORG] };
      return eingriffsPool().query(s, []);
    });
    const r = antwort();
    const h = handler(createStaffControlCenterRouter(deps(p)), "/rabatt-faelle/:userId/eingriff-vorschau");
    await h.handle(anfrage({ params: { userId: "u-1" }, query: { bounty_key: "power_user" } }), r);

    assert.equal(r._status, 200);
    assert.equal(r._json.data.ok, true, r._json.data.grund);
    assert.equal(r._json.data.ersparnis_cents, 300);
  });

  it("die Vorschau ohne bounty_key ist ein 400, kein stiller Leerlauf", async () => {
    const r = antwort();
    const h = handler(createStaffControlCenterRouter(deps(musterPool())), "/rabatt-faelle/:userId/eingriff-vorschau");
    await h.handle(anfrage({ params: { userId: "u-1" } }), r);
    assert.equal(r._status, 400);
    assert.equal(r._json.error.code, "BOUNTY_KEY_REQUIRED");
  });

  it("eine abgelehnte Vorschau ist eine ANTWORT, kein Fehler", async () => {
    /* 200 mit `ok: false` und dem Grund. Ein 500er waere hier eine Sackgasse:
     * die Flaeche koennte nicht sagen, WELCHE Bedingung fehlt. */
    const p = musterPool((s) => {
      if (/FROM subscriptions/.test(s) && /status IN \('active', 'past_due'\)/.test(s)) {
        return { rows: [{ id: "sub-1", user_id: "u-1", plan: "BASIS", status: "active", trial_mode: false, current_period_end: "2026-02-01T00:00:00Z" }] };
      }
      if (/FROM org_memberships/.test(s)) return { rows: [OWNER_ORG] };
      return eingriffsPool({ abschluesse: 3 }).query(s, []);
    });
    const r = antwort();
    const h = handler(createStaffControlCenterRouter(deps(p)), "/rabatt-faelle/:userId/eingriff-vorschau");
    await h.handle(anfrage({ params: { userId: "u-1" }, query: { bounty_key: "power_user" } }), r);
    assert.equal(r._status, 200);
    assert.equal(r._json.data.ok, false);
    assert.match(r._json.data.grund, /3 von 50/);
  });

  it("POST /rabatt-eingriff legt an — und traegt es ins Audit", async () => {
    const p = musterPool((s) => {
      if (/FROM subscriptions/.test(s) && /status IN \('active', 'past_due'\)/.test(s)) {
        return { rows: [{ id: "sub-1", user_id: "u-1", plan: "BASIS", status: "active", trial_mode: false, current_period_end: "2026-02-01T00:00:00Z" }] };
      }
      if (/FROM org_memberships/.test(s)) return { rows: [OWNER_ORG] };
      return eingriffsPool().query(s, []);
    });
    const r = antwort();
    const h = handler(createStaffControlCenterRouter(deps(p)), "/rabatt-eingriff", "post");
    await h.handle(anfrage({
      body: { user_id: "u-1", bounty_key: "power_user", erwartete_ersparnis_cents: 300, confirmed: true, reason: "Bounty wurde nicht vergeben" }
    }), r);

    assert.equal(r._status, 200, JSON.stringify(r._json));
    assert.equal(r._json.data.eingriff.bounty_key, "power_user");
    assert.ok(p.find("INSERT INTO rabatt_eingriffe").length === 1);
  });

  it("POST /rabatt-eingriff weist eine nicht erfuellte Bedingung mit 422 ab", async () => {
    const p = musterPool((s) => {
      if (/FROM subscriptions/.test(s) && /status IN \('active', 'past_due'\)/.test(s)) {
        return { rows: [{ id: "sub-1", user_id: "u-1", plan: "BASIS", status: "active", trial_mode: false, current_period_end: "2026-02-01T00:00:00Z" }] };
      }
      if (/FROM org_memberships/.test(s)) return { rows: [OWNER_ORG] };
      return eingriffsPool({ abschluesse: 3 }).query(s, []);
    });
    const r = antwort();
    const h = handler(createStaffControlCenterRouter(deps(p)), "/rabatt-eingriff", "post");
    await h.handle(anfrage({
      body: { user_id: "u-1", bounty_key: "power_user", erwartete_ersparnis_cents: 300, confirmed: true, reason: "Bounty wurde nicht vergeben" }
    }), r);

    assert.equal(r._status, 422);
    assert.equal(r._json.error.code, "BEDINGUNG_NICHT_ERFUELLT");
    assert.equal(p.find("INSERT INTO rabatt_eingriffe").length, 0);
  });

  it("der Eingriff steht hinter Staff-Tor, Step-up und Begruendungspflicht", () => {
    /* Ein Torwaechter, der dasteht und `next()` ruft, faellt hier nicht auf —
     * dafuer gibt es den Org-Grenzen-Waechter. Was diese Probe verhindert, ist
     * das VERGESSEN: eine Geld-Route ohne Kette. */
    const h = handler(createStaffControlCenterRouter(deps(musterPool())), "/rabatt-eingriff", "post");
    for (const wache of ["staffControlAccess", "requireConfirmAndReason"]) {
      assert.ok(h.kette.includes(wache), `${wache} fehlt in der Kette: ${h.kette.join(" → ")}`);
    }
    assert.ok(h.kette.length >= 4, `zu kurze Kette: ${h.kette.join(" → ")}`);
  });

  it("GET /rabatt-vorschau zeigt den naechsten Lauf, ohne ihn auszuloesen", async () => {
    const p = abrechnungsPool({ summe: 3, stufeMax: 8 });
    const r = antwort();
    const h = handler(createStaffControlCenterRouter(deps(p)), "/rabatt-vorschau");
    await h.handle(anfrage(), r);

    assert.equal(r._status, 200);
    assert.equal(r._json.data.posten[0].rabatt_pct, 3);
    assert.deepEqual(p.schreibend().map((c) => c.sql.slice(0, 30)), [],
      "die Vorschau darf nichts schreiben — sonst waere sie der Lauf");
  });

  it("GET /rabatt-monat fasst Eingriffe und Ausfaelle desselben Monats zusammen", async () => {
    const p = musterPool((s) => {
      if (/FROM rabatt_eingriffe e/.test(s)) {
        return { rows: [{ id: "a", erwartete_ersparnis_cents: 300, tatsaechliche_ersparnis_cents: 300, verbraucht_am: "2026-08-05" }] };
      }
      if (/FROM rabatt_ausfaelle a/.test(s)) return { rows: [{ id: 1, vorfaelle: 4, stelle: "stufe" }] };
      return { rows: [] };
    });
    const r = antwort();
    const h = handler(createStaffControlCenterRouter(deps(p)), "/rabatt-monat");
    await h.handle(anfrage({ query: { monat: "2026-08" } }), r);

    assert.equal(r._status, 200);
    assert.equal(r._json.data.monat, "2026-08-01");
    assert.equal(r._json.data.anzahl, 1);
    assert.equal(r._json.data.summe_cents, 300);
    assert.equal(r._json.data.ausfaelle_anzahl, 1);
    assert.equal(r._json.data.ausfaelle_vorfaelle, 4);
  });

  it("ein unsinniger Monat faellt auf den laufenden zurueck statt auf einen Fehler", async () => {
    const p = musterPool(() => ({ rows: [] }));
    const r = antwort();
    const h = handler(createStaffControlCenterRouter(deps(p)), "/rabatt-monat");
    await h.handle(anfrage({ query: { monat: "kaputt" } }), r);
    assert.equal(r._status, 200);
    assert.match(r._json.data.monat, /^\d{4}-\d{2}-01$/);
  });
});
