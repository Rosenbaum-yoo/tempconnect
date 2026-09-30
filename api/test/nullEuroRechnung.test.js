/**
 * Der Abrechnungsweg traegt eine 0-EUR-Rechnung — Gate K2.2 und Phase K2.3.
 *
 * WARUM DIESE DATEI EXISTIERT
 * Welle K2 verspricht einen Werbe-Cashback: 100 % Rabatt, die naechste Rechnung
 * ist frei. Der Arbeitsplan macht daraus ausdruecklich ein GATE — "vertraegt der
 * Abrechnungsweg das ueberhaupt?" musste VOR dem Bau feststehen, weil eine
 * negative Antwort den ganzen Entwurf geaendert haette (99 % plus Restbetrag,
 * oder ein Gutschriftsweg).
 *
 * Am 2026-08-30 gemessen. Die Rechenkette trug es auf Anhieb; DREI andere
 * Schichten nicht:
 *
 *   TIER-DECKELUNG   ein Diamant-Kunde bekam 25 % statt 100 %   (im Plan vorhergesagt)
 *   KATALOG-GRENZE   `discount_pct <= 20` — ein 100-%-Eintrag war nicht anlegbar
 *   LEBENSZYKLUS     Abo auf `past_due`, niemand zahlt 0 EUR, `applyRenewalPayment`
 *                    hat KEINEN Aufrufer → nach 14 Tagen Hard-Lock auf DEMO.
 *                    Der Kunde, dem die Rechnung geschenkt wurde, waere
 *                    AUSGESPERRT worden.
 *   MAHNLAUF         haette eine Zahlungserinnerung ueber 0,00 EUR verschickt
 *
 * Die letzten beiden treffen nicht nur den Cashback: JEDE Rechnung, die auf null
 * faellt, lief hinein — auch ein Eingriff nach K1.4, der die 100 % erreicht.
 *
 * Run: node --test --test-force-exit test/nullEuroRechnung.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { berechneRabatt } from "../services/invoiceService.js";
import { getUserDiscountDetail, getUserDiscount } from "../services/bountyService.js";
import { generateRecurringInvoices, runDunningSweep } from "../services/recurringBillingService.js";

/* ── Werkzeug ─────────────────────────────────────────────────────────── */

function musterPool(fn) {
  const calls = [];
  /* `imClient` unterscheidet den Transaktions-Client vom Pool. Ohne diese
   * Trennung sieht eine Anweisung, die AN der Transaktion vorbeilaeuft, in der
   * Aufrufliste genauso aus wie eine darin — und eine Probe, die das nicht
   * unterscheiden kann, ist still gruen. Beim Rueckmutieren ist genau das
   * passiert: `client.query` → `pool.query` blieb unbemerkt. */
  const merke = (imClient) => async (sql, params) => {
    const s = String(sql || "");
    calls.push({ sql: s, params: params || [], imClient });
    const r = fn ? await fn(s, params || []) : null;
    return r === undefined || r === null ? { rows: [], rowCount: 0 } : r;
  };
  const pool = {
    calls,
    query: merke(false),
    connect: async () => ({ query: merke(true), release() {} }),
    find(teil) { return calls.filter((c) => c.sql.includes(teil)); },
    reihenfolge(muster) {
      return calls.map((c) => c.sql).filter((s) => muster.test(s));
    }
  };
  return pool;
}

const stillerLogger = { info() {}, warn() {}, error() {}, debug() {} };

const ABO = {
  id: "sub-1", user_id: "u-1", plan: "BASIS",
  current_period_start: "2026-01-01T00:00:00Z",
  current_period_end: "2026-02-01T00:00:00Z"
};
const OWNER = {
  org_id: "org-1", org_name: "Acme GmbH",
  billing_mode: "standard_catalog", individual_contract_price_cents: null,
  user_email: "owner@acme.de"
};

/** Der Bounty-Pool: `gedeckelt` und `frei` bilden die beiden Summanden ab. */
function rabattPool({ gedeckelt = 0, frei = 0, deckel = 8 } = {}) {
  return musterPool((s) => {
    if (/SUM\(b\.discount_pct\)/.test(s)) {
      return { rows: [{ total: gedeckelt, deckel_frei_summe: frei }] };
    }
    if (/FROM user_bounty_tiers ubt/.test(s)) {
      return deckel == null ? { rows: [] }
        : { rows: [{ tier_key: "bronze", name_de: "Bronze", max_discount_pct: deckel }] };
    }
    return { rows: [] };
  });
}

/**
 * Der Abrechnungslauf. `steuerPct` bildet die 19 % nach, damit `total_cents`
 * dieselbe Form hat wie die echte Rechnung.
 */
function laufPool({ gedeckelt = 0, frei = 0, deckel = 8, flipGelingt = true } = {}) {
  return musterPool((s) => {
    if (/FROM subscriptions/.test(s) && /trial_mode = FALSE/.test(s)) return { rows: [ABO] };
    if (/FROM org_memberships/.test(s)) return { rows: [OWNER] };
    if (/SUM\(b\.discount_pct\)/.test(s)) return { rows: [{ total: gedeckelt, deckel_frei_summe: frei }] };
    if (/FROM user_bounty_tiers ubt/.test(s)) {
      return { rows: [{ tier_key: "bronze", name_de: "Bronze", max_discount_pct: deckel }] };
    }
    if (/UPDATE subscriptions/.test(s)) return { rowCount: flipGelingt ? 1 : 0, rows: [] };
    return { rows: [], rowCount: 0 };
  });
}

/** Rechnet wie `createInvoice`, damit `total_cents` echt ist. */
function rechnungsSpion() {
  const aufrufe = [];
  const createInvoice = async (_client, opts) => {
    aufrufe.push(opts);
    const brutto = Number(opts.amountCents);
    const rabatt = berechneRabatt(brutto, opts.discountPct).betragCents;
    const netto = brutto - rabatt;
    const steuer = Math.round(netto * 19 / 100);
    return {
      id: "inv-1", invoice_number: "TC-2026-000001",
      amount_cents: netto, tax_amount_cents: steuer, total_cents: netto + steuer
    };
  };
  return { aufrufe, createInvoice };
}

/* ══════════════════════════════════════════════════════════════════════════
 * Die Rechenkette — sie trug es auf Anhieb
 * ══════════════════════════════════════════════════════════════════════════ */

describe("K2.2 · berechneRabatt bei 100 %", () => {
  it("laesst genau null uebrig — bei jedem Betrag", () => {
    for (const netto of [15000, 49900, 79900, 1]) {
      const r = berechneRabatt(netto, 100);
      assert.equal(r.satz, 100);
      assert.equal(r.betragCents, netto, `Abzug muss der ganze Betrag sein (netto ${netto})`);
      assert.equal(netto - r.betragCents, 0);
    }
  });

  it("mehr als 100 % gibt es nicht — und der Abzug uebersteigt nie den Betrag", () => {
    const r = berechneRabatt(15000, 250);
    assert.equal(r.satz, 100, "der Satz wird bei 100 abgeschnitten");
    assert.equal(r.betragCents, 15000, "sonst entstuende eine Rechnung unter null");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * K2.3 — die eine Ausnahme von der Deckelung
 * ══════════════════════════════════════════════════════════════════════════ */

describe("K2.3 · ein deckel-freies Bounty steht NEBEN der Stufen-Obergrenze", () => {
  it("100 % ueberleben eine Bronze-Stufe (8 %)", async () => {
    /* Ohne diese Ausnahme schrumpfte die Praemie lautlos auf ein Zwoelftel —
     * genau die Vorhersage aus Plan-Abschnitt 2.3. */
    const d = await getUserDiscountDetail(rabattPool({ gedeckelt: 0, frei: 100, deckel: 8 }), "u-1");
    assert.equal(d.satz, 100);
    assert.equal(d.deckel_frei_pct, 100);
  });

  it("RUECKMUTATION: dasselbe Bounty OHNE die Kennzeichnung wird gedeckelt", async () => {
    /* Der Gegenbeweis: `deckel_frei` ist es, was wirkt — nicht die Hoehe. */
    const d = await getUserDiscountDetail(rabattPool({ gedeckelt: 100, frei: 0, deckel: 8 }), "u-1");
    assert.equal(d.satz, 8, "ein normales Bounty bleibt unter der Obergrenze seiner Stufe");
    assert.equal(d.deckel_frei_pct, 0);
  });

  it("Treue und Praemie zaehlen zusammen — die Deckelung wirkt nur auf die Treue", async () => {
    /* 30 % Treue bei Deckel 8 → 8. Plus 100 % Praemie → 100 (bei 100 gekappt).
     * Der Treuerabatt geht dabei nicht verloren: er steht weiter im Katalog und
     * wirkt im Folgemonat, sobald die Praemie verbraucht ist. */
    const d = await getUserDiscountDetail(rabattPool({ gedeckelt: 30, frei: 100, deckel: 8 }), "u-1");
    assert.equal(d.satz, 100, "die Summe wird bei 100 abgeschnitten");
    assert.equal(d.roh, 30, "die Rohsumme der gedeckelten Bounties bleibt ablesbar");
    assert.equal(d.gedeckelt, true);
  });

  it("kleinere deckel-freie Betraege addieren sich sauber", async () => {
    const d = await getUserDiscountDetail(rabattPool({ gedeckelt: 3, frei: 5, deckel: 8 }), "u-1");
    assert.equal(d.satz, 8, "3 (gedeckelt) + 5 (frei)");
  });

  it("ohne deckel-freies Bounty rechnet alles wie vorher", async () => {
    /* Die Rueckwaertsprobe: wer keine Praemie hat, bekommt Zeichen fuer Zeichen
     * dasselbe wie vor dieser Welle. */
    for (const [roh, deckel, erwartet] of [[3, 8, 3], [30, 8, 8], [0, 8, 0], [12, 25, 12]]) {
      const satz = await getUserDiscount(rabattPool({ gedeckelt: roh, frei: 0, deckel }), "u-1");
      assert.equal(satz, erwartet, `roh ${roh}, Deckel ${deckel}`);
    }
  });

  it("die Abfrage trennt beide Summen — und nennt sie getrennt", async () => {
    const p = rabattPool({ gedeckelt: 3, frei: 100 });
    await getUserDiscountDetail(p, "u-1");
    const [c] = p.find("SUM(b.discount_pct)");
    assert.match(c.sql, /FILTER \(WHERE NOT b\.deckel_frei\)/,
      "ohne den Filter wuerde die Praemie mitgedeckelt");
    assert.match(c.sql, /FILTER \(WHERE b\.deckel_frei\)/);
    assert.match(c.sql, /AS total/,
      "der Alias `total` muss bleiben: jeder bestehende Aufrufer und jede bestehende Probe rechnet damit");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * Gate K2.2 — der Lebenszyklus. Der schwerste Befund.
 * ══════════════════════════════════════════════════════════════════════════ */

describe("K2.2 · eine 0-EUR-Rechnung ist mit ihrer Ausstellung beglichen", () => {
  it("der Freimonat fuehrt NICHT in die Sperre", async () => {
    const p = laufPool({ gedeckelt: 0, frei: 100 });
    const spion = rechnungsSpion();
    const r = await generateRecurringInvoices(p, {
      now: "2026-02-02T00:00:00Z", logger: stillerLogger, createInvoice: spion.createInvoice
    });

    assert.equal(spion.aufrufe[0].discountPct, 100, "die Praemie muss ungedeckelt ankommen");
    assert.equal(r.invoiced, 1);
    assert.equal(r.ohne_forderung, 1,
      "ein Lauf, der Freimonate ausgibt, ohne das zu berichten, waere wieder still");

    const bezahlt = p.find("UPDATE invoices SET status = 'paid'");
    assert.equal(bezahlt.length, 1, "eine Forderung ueber null ist mit ihrer Entstehung erfuellt");

    const flips = p.reihenfolge(/UPDATE\s+subscriptions/);
    assert.equal(flips.length, 2, "erst der bewachte Flip, dann der Ausgleich");
    assert.match(flips[0], /status = 'past_due'/, "der Flip bleibt der Idempotenz-Riegel");
    assert.match(flips[1], /status = 'active'/, "und wird danach zurueckgenommen");
    assert.match(flips[1], /INTERVAL '1 month'/, "die Periode muss weiterrollen, sonst ist naechsten Monat wieder Stichtag");
  });

  it("RUECKMUTATION: eine Rechnung MIT Betrag bleibt past_due und wird nicht bezahlt", async () => {
    const p = laufPool({ gedeckelt: 3, frei: 0 });
    const spion = rechnungsSpion();
    const r = await generateRecurringInvoices(p, {
      now: "2026-02-02T00:00:00Z", logger: stillerLogger, createInvoice: spion.createInvoice
    });

    assert.equal(r.ohne_forderung, 0);
    assert.equal(p.find("UPDATE invoices SET status = 'paid'").length, 0,
      "eine echte Forderung darf sich nicht selbst begleichen");
    const flips = p.reihenfolge(/UPDATE\s+subscriptions/);
    assert.equal(flips.length, 1, "nur der Flip — der normale Weg bleibt unveraendert");
    assert.match(flips[0], /status = 'past_due'/);
  });

  it("der Ausgleich laeuft IN derselben Transaktion wie der Flip", async () => {
    /* Sonst gaebe es ein Fenster, in dem das Abo `past_due` ist und der
     * Haerte-Riegel zuschlagen koennte. */
    const p = laufPool({ gedeckelt: 0, frei: 100 });
    const spion = rechnungsSpion();
    await generateRecurringInvoices(p, {
      now: "2026-02-02T00:00:00Z", logger: stillerLogger, createInvoice: spion.createInvoice
    });

    const folge = p.calls.map((c) => c.sql);
    const begin = folge.findIndex((s) => /^\s*BEGIN\s*$/.test(s));
    const commit = folge.findIndex((s) => /^\s*COMMIT\s*$/.test(s));
    const bezahlt = folge.findIndex((s) => /UPDATE invoices SET status = 'paid'/.test(s));
    const aktiv = folge.findIndex((s) => /UPDATE\s+subscriptions[\s\S]*status = 'active'/.test(s));

    assert.ok(begin >= 0 && commit > begin, "keine Transaktion erkannt");
    assert.ok(bezahlt > begin && bezahlt < commit, "die Bezahlung liegt ausserhalb der Transaktion");
    assert.ok(aktiv > begin && aktiv < commit, "die Periode rollt ausserhalb der Transaktion weiter");

    /* Die Reihenfolge allein genuegt NICHT: sie sieht identisch aus, wenn die
     * Anweisung am Transaktions-Client vorbei direkt auf den Pool geht. Erst
     * dieser Nachweis macht die Probe wirksam — beim Rueckmutieren
     * (`client.query` → `pool.query`) blieb sie vorher gruen. */
    const amClient = (muster) => p.calls.filter((c) => muster.test(c.sql)).every((c) => c.imClient === true);
    assert.ok(amClient(/UPDATE invoices SET status = 'paid'/),
      "die Bezahlung lief am Transaktions-Client vorbei — bei einem Rollback bliebe sie stehen");
    assert.ok(amClient(/UPDATE\s+subscriptions[\s\S]*status = 'active'/),
      "die Periode rollte am Transaktions-Client vorbei weiter");
  });

  it("gewinnt ein Parallellauf den Flip, passiert gar nichts", async () => {
    const p = laufPool({ gedeckelt: 0, frei: 100, flipGelingt: false });
    const spion = rechnungsSpion();
    const r = await generateRecurringInvoices(p, {
      now: "2026-02-02T00:00:00Z", logger: stillerLogger, createInvoice: spion.createInvoice
    });

    assert.equal(r.invoiced, 0);
    assert.equal(r.ohne_forderung, 0);
    assert.equal(spion.aufrufe.length, 0, "ohne Flip keine Rechnung");
    assert.equal(p.find("UPDATE invoices SET status = 'paid'").length, 0);
  });

  it("nur eine WIRKLICH ausgestellte Rechnung wird ausgeglichen", async () => {
    /* Der Riegel steht auf `status = 'issued'`: eine bereits stornierte oder
     * bezahlte Zeile wird nicht noch einmal angefasst. */
    const p = laufPool({ gedeckelt: 0, frei: 100 });
    const spion = rechnungsSpion();
    await generateRecurringInvoices(p, {
      now: "2026-02-02T00:00:00Z", logger: stillerLogger, createInvoice: spion.createInvoice
    });
    const [c] = p.find("UPDATE invoices SET status = 'paid'");
    assert.match(c.sql, /status = 'issued'/,
      "ohne diese Bedingung koennte der Lauf eine stornierte Rechnung wiederbeleben");
  });
});

describe("K2.2 · der Mahnlauf ruehrt eine 0-EUR-Rechnung nicht an", () => {
  it("die Auswahl filtert auf den Betrag", async () => {
    let auswahl = null;
    const p = musterPool((s) => {
      if (/FROM invoices i/.test(s) && /dunning_level/.test(s)) { auswahl = s; return { rows: [] }; }
      return { rows: [] };
    });
    await runDunningSweep(p, { sendMail: async () => {}, now: "2026-03-01T00:00:00Z" });

    assert.ok(auswahl, "der Mahnlauf hat nicht ausgewaehlt");
    assert.match(auswahl, /i\.total_cents\s*>\s*0/,
      "ohne diese Bedingung bekaeme der Kunde eine Zahlungserinnerung ueber 0,00 EUR");
  });

  it("ohne Mailer wird nichts markiert — die Erinnerung darf nicht verlorengehen", async () => {
    const r = await runDunningSweep(musterPool(), { now: "2026-03-01T00:00:00Z" });
    assert.equal(r.note, "NO_MAILER");
    assert.equal(r.reminded, 0);
  });
});
