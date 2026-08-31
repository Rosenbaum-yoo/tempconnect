/**
 * Die Werbepraemie erreicht die Rechnung — Welle K2.4 bis K2.7.
 *
 * ANLASS: Gemessen am 2026-08-30 war die Werbe-Mechanik verdrahtet, nur nicht
 * ans Geld. `qualifyReferralReward` schreibt seit jeher eine
 * `referral_rewards`-Zeile — aber keine einzige Datei des Geldpfads erwaehnte
 * `referral` ueberhaupt. Die Praemie wurde gebucht und nie angewandt, dieselbe
 * Fehlerklasse wie der Treue-Rabatt vor Migration 170: ein Preisversprechen
 * ohne Wirkung.
 *
 * DIE VIER OWNER-ENTSCHEIDE (2026-08-27), jeder mit Probe UND Rueckmutation:
 *
 *   K2.4  der Geworbene muss 30 Tage Bestand haben
 *   K2.5  hoechstens 3 Monate insgesamt
 *   K2.6  Stapelung: nie ueber 100 %, der Treuerabatt geht nicht verloren
 *   K2.7  Eingriffspunkt — die Praemie laesst sich nicht von Hand herbeireden
 *
 * Run: node --test --test-force-exit test/werbepraemie.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import * as praemie from "../services/werbepraemieService.js";
import { qualifyReferralReward } from "../services/referralProgramService.js";
import { generateRecurringInvoices, vorschauRecurringInvoices } from "../services/recurringBillingService.js";
import { eingriffVorschau } from "../services/rabattEingriffService.js";
import { berechneRabatt } from "../services/invoiceService.js";

/* ── Werkzeug ─────────────────────────────────────────────────────────── */

function musterPool(fn) {
  const calls = [];
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
    find(teil) { return calls.filter((c) => c.sql.includes(teil)); }
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
const OFFENE_PRAEMIE = {
  id: "rr-1", user_id: "u-1", referral_id: "ref-1", reward_type: "free_month",
  month_label: "2026-01", faellig_ab: "2026-01-15", applied_at: "2025-12-16"
};

/**
 * Der Abrechnungslauf mit allen Stellschrauben dieser Welle.
 * `praemieDa` bildet ab, was `offeneWerbepraemieLesen` FINDET — die Bedingungen
 * (Karenz, Geworbener noch da) stehen im WHERE und werden separat geprueft.
 */
function laufPool({
  gedeckelt = 0, deckel = 8, praemieDa = null, praemiensatz = 100,
  programmAktiv = true, verbraucht = 0, praemieVerbrauchbar = true,
  eingriff = null, eingriffVerbrauchbar = true
} = {}) {
  return musterPool((s) => {
    if (/FROM subscriptions/.test(s) && /trial_mode = FALSE/.test(s)) return { rows: [ABO] };
    if (/FROM org_memberships/.test(s)) return { rows: [OWNER] };
    if (/SUM\(b\.discount_pct\)/.test(s)) return { rows: [{ total: gedeckelt, deckel_frei_summe: 0 }] };
    if (/FROM user_bounty_tiers ubt/.test(s)) {
      return { rows: [{ tier_key: "bronze", name_de: "Bronze", max_discount_pct: deckel }] };
    }
    if (/FROM bounties WHERE key = \$1/.test(s)) {
      return { rows: [{ discount_pct: praemiensatz, deckel_frei: true, is_active: programmAktiv }] };
    }
    if (/COUNT\(\*\)::int AS anzahl/.test(s) && /angewandt_am IS NOT NULL/.test(s)) {
      return { rows: [{ anzahl: verbraucht }] };
    }
    if (/FROM referral_rewards rr/.test(s)) return { rows: praemieDa ? [praemieDa] : [] };
    if (/UPDATE referral_rewards SET angewandt_am/.test(s)) {
      return { rowCount: praemieVerbrauchbar ? 1 : 0, rows: [] };
    }
    if (/UPDATE referral_rewards SET rechnung_id/.test(s)) return { rowCount: 1, rows: [] };
    if (/FROM rabatt_eingriffe/.test(s) && /verbraucht_am IS NULL/.test(s)) {
      return { rows: eingriff ? [eingriff] : [] };
    }
    if (/UPDATE rabatt_eingriffe/.test(s) && /SET verbraucht_am/.test(s)) {
      return { rowCount: eingriffVerbrauchbar ? 1 : 0, rows: [] };
    }
    if (/UPDATE rabatt_eingriffe/.test(s)) return { rowCount: 1, rows: [] };
    if (/UPDATE subscriptions/.test(s)) return { rowCount: 1, rows: [] };
    return { rows: [], rowCount: 0 };
  });
}

function rechnungsSpion() {
  const aufrufe = [];
  const createInvoice = async (_client, opts) => {
    aufrufe.push(opts);
    const brutto = Number(opts.amountCents);
    const netto = brutto - berechneRabatt(brutto, opts.discountPct).betragCents;
    return {
      id: "inv-1", invoice_number: "TC-2026-000001",
      amount_cents: netto, total_cents: netto + Math.round(netto * 19 / 100)
    };
  };
  return { aufrufe, createInvoice };
}

/* ══════════════════════════════════════════════════════════════════════════
 * K2.4 — die Karenz-Uhr
 * ══════════════════════════════════════════════════════════════════════════ */

describe("K2.4 · die Karenz sind 30 Tage, gerechnet in Europe/Berlin", () => {
  it("faelligAb zaehlt genau 30 Tage weiter", () => {
    assert.equal(praemie.faelligAb("2026-01-01"), "2026-01-31");
    assert.equal(praemie.faelligAb("2026-08-31"), "2026-09-30");
    assert.equal(praemie.KARENZ_TAGE, 30, "Owner-Entscheid 2026-08-27");
  });

  it("die Zeitumstellung verschiebt die Frist nicht", () => {
    /* Ende Maerz und Ende Oktober wechselt DACH die Zeitzone. Wer mit lokalen
     * Zeitstempeln rechnet, verliert oder gewinnt dort eine Stunde — und bei
     * Mitternacht einen ganzen Tag. */
    assert.equal(praemie.faelligAb("2026-03-20"), "2026-04-19");
    assert.equal(praemie.faelligAb("2026-10-20"), "2026-11-19");
  });

  it("die Auswahl verlangt die Faelligkeit IM WHERE, nicht in einer Nachpruefung", async () => {
    const p = musterPool(() => ({ rows: [] }));
    await praemie.offeneWerbepraemieLesen(p, "u-1", { heute: "2026-02-01" });
    const [c] = p.find("FROM referral_rewards rr");
    assert.match(c.sql, /rr\.angewandt_am IS NULL/, "sonst wird dieselbe Praemie zweimal eingeloest");
    assert.match(c.sql, /rr\.faellig_ab <= \$3::date/, "ohne die Frist zaehlt die Karenz nicht");
    assert.equal(c.params[2], "2026-02-01");
  });

  it("K2.4 · KUENDIGUNG AN TAG 29 → KEINE PRAEMIE: die Auswahl verlangt ein bestehendes Abo", async () => {
    /* Der Nachweis, den der Plan fordert. Er haengt NICHT an einem
     * Widerrufs-Job: die Bedingung steht im WHERE und wird in dem Moment
     * geprueft, in dem die Praemie eingeloest werden soll. Kuendigt der
     * Geworbene, findet die Abfrage sie nie. */
    const p = musterPool(() => ({ rows: [] }));
    await praemie.offeneWerbepraemieLesen(p, "u-1");
    const [c] = p.find("FROM referral_rewards rr");
    assert.match(c.sql, /EXISTS \(\s*SELECT 1 FROM subscriptions s/,
      "ohne diese Bedingung braeuchte es einen Widerrufs-Job — und der lief in diesem Repo schon einmal nie");
    assert.match(c.sql, /s\.user_id = r\.referred_user_id/,
      "geprueft werden muss der GEWORBENE, nicht der Werber");
    assert.match(c.sql, /s\.plan <> 'DEMO'/, "ein DEMO-Abo ist kein Bestand");
    assert.deepEqual(c.params[3], ["active", "past_due"]);
  });

  it("nur echte Werbepraemien zaehlen — der Pilotmonat nicht", async () => {
    const p = musterPool(() => ({ rows: [] }));
    await praemie.offeneWerbepraemieLesen(p, "u-1");
    const [c] = p.find("FROM referral_rewards rr");
    assert.deepEqual(c.params[1], ["free_month", "cashback"],
      "`pilot_base` ist der Pilotmonat, keine Werbepraemie — er darf keine Rechnung frei machen");
  });

  it("die aelteste faellige Praemie zuerst", async () => {
    const p = musterPool(() => ({ rows: [] }));
    await praemie.offeneWerbepraemieLesen(p, "u-1");
    const [c] = p.find("FROM referral_rewards rr");
    assert.match(c.sql, /ORDER BY rr\.faellig_ab ASC/,
      "sonst verfiele bei einer Aenderung die aelteste zuerst — die, die am laengsten zugesagt war");
  });

  it("beim Buchen wird die Karenz mitgeschrieben", async () => {
    const p = musterPool((s) => {
      if (/FROM referrals r\b/.test(s)) {
        return { rows: [{ id: "ref-1", referrer_id: "werber", referred_email: "neu@x.de", reward_type: "free_month" }] };
      }
      if (/SELECT plan FROM subscriptions/.test(s)) return { rows: [{ plan: "PLUS" }] };
      if (/COUNT\(\*\)::int AS total/.test(s)) return { rows: [{ total: 0 }] };
      if (/COUNT\(\*\)::int AS cnt/.test(s)) return { rows: [{ cnt: 0 }] };
      return { rows: [], rowCount: 1 };
    });
    const r = await qualifyReferralReward(p, "geworbener");
    assert.equal(r.ok, true, r.reason);
    assert.equal(r.karenz_tage, 30);

    const [ins] = p.find("INSERT INTO referral_rewards");
    assert.ok(ins, "es wurde keine Praemie gebucht");
    assert.match(ins.sql, /faellig_ab/,
      "ohne die Frist waere die Praemie sofort einloesbar — der Owner-Entscheid verlangt 30 Tage");
    assert.match(String(ins.params[5]), /^\d{4}-\d{2}-\d{2}$/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * K2.5 — der Deckel bei drei
 * ══════════════════════════════════════════════════════════════════════════ */

describe("K2.5 · hoechstens drei geschenkte Monate", () => {
  it("der Deckel steht auf 3 — der Owner-Entscheid, nicht die alten 6", () => {
    assert.equal(praemie.MAX_PRAEMIEN, 3);
  });

  it("beim vierten ist Schluss", async () => {
    const p = laufPool({ praemieDa: OFFENE_PRAEMIE, verbraucht: 3 });
    const r = await praemie.werbepraemieFuerLauf(p, "u-1");
    assert.equal(r.praemie, null);
    assert.equal(r.satz, 0);
    assert.equal(r.grund, "DECKEL_ERREICHT",
      "eine Ablehnung ohne Grund waere in der Flaeche nicht von 'nichts da' zu unterscheiden");
  });

  it("RUECKMUTATION: beim dritten wird noch gewaehrt", async () => {
    const p = laufPool({ praemieDa: OFFENE_PRAEMIE, verbraucht: 2 });
    const r = await praemie.werbepraemieFuerLauf(p, "u-1");
    assert.ok(r.praemie, "der dritte Monat steht dem Kunden zu");
    assert.equal(r.satz, 100);
  });

  it("gezaehlt werden die ANGEWANDTEN, nicht die gebuchten", async () => {
    /* "Hoechstens 3 Monate" heisst drei geschenkte Rechnungen. Wer vier Kunden
     * wirbt, von denen einer kuendigt, hat drei Monate gut — nicht zwei. */
    const p = musterPool(() => ({ rows: [{ anzahl: 0 }] }));
    await praemie.angewandtePraemien(p, "u-1");
    const [c] = p.find("COUNT(*)::int AS anzahl");
    assert.match(c.sql, /angewandt_am IS NOT NULL/);
  });

  it("der Not-Aus im Katalog stoppt das Programm sofort", async () => {
    const p = laufPool({ praemieDa: OFFENE_PRAEMIE, programmAktiv: false });
    const r = await praemie.werbepraemieFuerLauf(p, "u-1");
    assert.equal(r.praemie, null);
    assert.equal(r.grund, "PROGRAMM_AUS");
  });

  it("der Satz kommt aus dem Katalog, nicht aus einer Konstante", async () => {
    const p = laufPool({ praemieDa: OFFENE_PRAEMIE, praemiensatz: 90 });
    const r = await praemie.werbepraemieFuerLauf(p, "u-1");
    assert.equal(r.satz, 90, "wer den Satz im Staff Center senkt, muss ihn gesenkt bekommen");
  });

  it("WIRFT NIE — eine Stoerung im Praemienweg haelt die Rechnung nicht an", async () => {
    const p = musterPool(() => { throw new Error("connection terminated"); });
    const r = await praemie.werbepraemieFuerLauf(p, "u-1");
    assert.equal(r.praemie, null);
    assert.match(r.grund, /NICHT_ERMITTELBAR/,
      "der Fehler muss benannt werden — sonst ist es wieder ein stiller Ausfall");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * K2.6 — die Stapelung
 * ══════════════════════════════════════════════════════════════════════════ */

describe("K2.6 · Stapelung: nie ueber 100 %, der Treuerabatt bleibt", () => {
  it("die Praemie macht die Rechnung frei — und die Quelle steht darauf", async () => {
    const p = laufPool({ gedeckelt: 0, praemieDa: OFFENE_PRAEMIE });
    const spion = rechnungsSpion();
    const r = await generateRecurringInvoices(p, {
      now: "2026-02-02T00:00:00Z", logger: stillerLogger, createInvoice: spion.createInvoice
    });

    assert.equal(spion.aufrufe[0].discountPct, 100);
    assert.equal(spion.aufrufe[0].discountSource, "bounty_werbepraemie");
    assert.match(spion.aufrufe[0].notes, /Werbepraemie/);
    assert.equal(r.werbepraemien, 1, "ein Lauf, der Praemien einloest, ohne das zu berichten, waere still");
    assert.equal(r.ohne_forderung, 1, "die Rechnung ist frei — und muss sich selbst begleichen (Gate K2.2)");
  });

  it("Treuerabatt PLUS Praemie: gedeckelt bei 100, der Treuerabatt bleibt bestehen", async () => {
    /* 30 % Treue bei Deckel 8 → 8. Plus 100 % Praemie → 108, gekappt auf 100.
     * Verbraucht wird NUR die Praemie: die Treue-Bounties bleiben aktiv und
     * wirken im Folgemonat weiter. */
    const p = laufPool({ gedeckelt: 30, deckel: 8, praemieDa: OFFENE_PRAEMIE });
    const spion = rechnungsSpion();
    await generateRecurringInvoices(p, {
      now: "2026-02-02T00:00:00Z", logger: stillerLogger, createInvoice: spion.createInvoice
    });

    assert.equal(spion.aufrufe[0].discountPct, 100, "108 muss auf 100 gekappt werden");
    assert.equal(p.find("UPDATE referral_rewards SET angewandt_am").length, 1);
    assert.equal(p.find("UPDATE user_bounties").length, 0,
      "der Treuerabatt darf NICHT verbraucht werden — er wirkt naechsten Monat weiter");
  });

  it("Automatik + Eingriff + Praemie: alle drei zaehlen, der Beleg nennt beide Zusaetze", async () => {
    const p = laufPool({
      gedeckelt: 3, deckel: 8, praemieDa: OFFENE_PRAEMIE, praemiensatz: 50,
      eingriff: { id: "e-1", user_id: "u-1", bounty_key: "power_user", zusatz_pct: 2 }
    });
    const spion = rechnungsSpion();
    const r = await generateRecurringInvoices(p, {
      now: "2026-02-02T00:00:00Z", logger: stillerLogger, createInvoice: spion.createInvoice
    });

    assert.equal(spion.aufrufe[0].discountPct, 55, "3 Automatik + 2 Eingriff + 50 Praemie");
    assert.equal(spion.aufrufe[0].discountSource, "bounty_werbepraemie",
      "die Praemie ist die groessere Zusage und benennt die Quelle");
    assert.match(spion.aufrufe[0].notes, /Werbepraemie/);
    assert.match(spion.aufrufe[0].notes, /Eingriff des TempConnect-Teams/,
      "beide Teile muessen auf dem Beleg stehen, sonst verschwindet einer");
    assert.equal(r.werbepraemien, 1);
    assert.equal(r.eingriffe_angewandt, 1);
  });

  it("RUECKMUTATION: gewinnt ein Parallellauf die Praemie, gilt nur der Eingriff", async () => {
    /* Die Zuschlaege werden EINZELN angesetzt. Eine vorgerechnete Summe waere
     * hier falsch: der Eingriff ist verbraucht und muss gelten, auch wenn die
     * Praemie weg ist. */
    const p = laufPool({
      gedeckelt: 3, deckel: 8, praemieDa: OFFENE_PRAEMIE, praemiensatz: 50,
      praemieVerbrauchbar: false,
      eingriff: { id: "e-1", user_id: "u-1", bounty_key: "power_user", zusatz_pct: 2 }
    });
    const spion = rechnungsSpion();
    const r = await generateRecurringInvoices(p, {
      now: "2026-02-02T00:00:00Z", logger: stillerLogger, createInvoice: spion.createInvoice
    });

    assert.equal(spion.aufrufe[0].discountPct, 5, "3 Automatik + 2 Eingriff, ohne Praemie");
    assert.equal(spion.aufrufe[0].discountSource, "bounty_eingriff");
    assert.equal(r.werbepraemien, 0);
    assert.equal(p.find("UPDATE referral_rewards SET rechnung_id").length, 0,
      "ohne Verbrauch darf kein Beleg entstehen");
  });

  it("ohne faellige Praemie bleibt alles beim Alten", async () => {
    const p = laufPool({ gedeckelt: 3, deckel: 8, praemieDa: null });
    const spion = rechnungsSpion();
    const r = await generateRecurringInvoices(p, {
      now: "2026-02-02T00:00:00Z", logger: stillerLogger, createInvoice: spion.createInvoice
    });
    assert.equal(spion.aufrufe[0].discountPct, 3);
    assert.equal(spion.aufrufe[0].discountSource, "bounty");
    assert.match(spion.aufrufe[0].notes, /Treue-Rabatt 3 %/);
    assert.equal(r.werbepraemien, 0);
  });

  it("verbraucht und belegt wird IN der Transaktion", async () => {
    /* Sonst bliebe bei einem Rollback eine verbrauchte Praemie ohne Rechnung
     * stehen — ein geschenkter Monat, den niemand bekommen hat. */
    const p = laufPool({ praemieDa: OFFENE_PRAEMIE });
    const spion = rechnungsSpion();
    await generateRecurringInvoices(p, {
      now: "2026-02-02T00:00:00Z", logger: stillerLogger, createInvoice: spion.createInvoice
    });
    for (const teil of ["UPDATE referral_rewards SET angewandt_am", "UPDATE referral_rewards SET rechnung_id"]) {
      const treffer = p.find(teil);
      assert.equal(treffer.length, 1, `${teil} fehlt`);
      assert.equal(treffer[0].imClient, true,
        `${teil} lief am Transaktions-Client vorbei — bei einem Rollback bliebe es stehen`);
    }
  });

  it("der Verbrauch traegt den Parallellauf-Riegel im WHERE", async () => {
    const p = laufPool({ praemieDa: OFFENE_PRAEMIE });
    const spion = rechnungsSpion();
    await generateRecurringInvoices(p, {
      now: "2026-02-02T00:00:00Z", logger: stillerLogger, createInvoice: spion.createInvoice
    });
    const [c] = p.find("UPDATE referral_rewards SET angewandt_am");
    assert.match(c.sql, /angewandt_am IS NULL/,
      "ohne diese Bedingung koennte dieselbe Praemie zwei Rechnungen frei machen");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * K2.7 — der Eingriffspunkt
 * ══════════════════════════════════════════════════════════════════════════ */

describe("K2.7 · die Praemie laesst sich nicht von Hand herbeireden", () => {
  it("der Eingriff aus K1.4 kann den Werbe-Cashback NICHT vergeben", async () => {
    /* Der Eingriff vergibt nur, was der Katalog ohnehin hergaebe — und die
     * Werbepraemie haengt an einer echten Werbung, nicht an einer Schwelle, die
     * ein Mensch beurteilen koennte. Sie muss deshalb abprallen, mit einem
     * Grund, der das erklaert. */
    const p = musterPool((s) => {
      if (/FROM bounties WHERE is_active/.test(s)) {
        return { rows: [{
          id: 1, key: praemie.WERBE_CASHBACK_KEY, name_de: "Werbe-Praemie",
          discount_pct: 100, deckel_frei: true,
          threshold_type: "referral_cashback",
          threshold_value: { karenz_tage: 30, max_praemien: 3 },
          available_from: null, available_until: null, is_active: true
        }] };
      }
      return { rows: [] };
    });
    const v = await eingriffVorschau(p, {
      userId: "u-1", bountyKey: praemie.WERBE_CASHBACK_KEY, nettoCents: 15000
    });
    assert.equal(v.ok, false);
    assert.equal(v.code, "BEDINGUNG_NICHT_ERFUELLT");
    assert.match(v.grund, /Rechnung/,
      "die Ablehnung muss erklaeren, wo die Praemie stattdessen herkommt");
    assert.equal(p.calls.filter((c) => /INSERT INTO/i.test(c.sql)).length, 0,
      "eine Pruefung, die dabei etwas vergibt, waere die Umgehung");
  });

  it("die Kachel erklaert sich, statt als 'gesperrt, 0 %' dazustehen", async () => {
    const { pruefeBountyBedingung } = await import("../services/bountyService.js");
    const p = musterPool((s) => {
      if (/FROM bounties WHERE is_active/.test(s)) {
        return { rows: [{
          id: 1, key: praemie.WERBE_CASHBACK_KEY, name_de: "Werbe-Praemie",
          discount_pct: 100, threshold_type: "referral_cashback",
          threshold_value: { karenz_tage: 30, max_praemien: 3 },
          available_from: null, available_until: null, is_active: true
        }] };
      }
      if (/COUNT\(\*\)/.test(s)) return { rows: [{ active: 2 }] };
      return { rows: [] };
    });
    const r = await pruefeBountyBedingung(p, "u-1", praemie.WERBE_CASHBACK_KEY);
    assert.equal(r.gefunden, true);
    assert.equal(r.earned, false,
      "waere das `true`, saehe getUserDiscount die 100 % ein ZWEITES Mal — der Rabatt waere doppelt");
    assert.match(r.note, /30 Tage/);
    assert.match(r.note, /3-mal/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * Die Vorschau zeigt die Praemie — und sagt, warum keine faellig ist
 * ══════════════════════════════════════════════════════════════════════════ */

describe("K2 · die Vorschau auf den naechsten Lauf kennt die Praemie", () => {
  it("eine faellige Praemie steht im Posten", async () => {
    const p = laufPool({ gedeckelt: 0, praemieDa: OFFENE_PRAEMIE });
    const v = await vorschauRecurringInvoices(p, { now: "2026-02-02T00:00:00Z", logger: stillerLogger });

    assert.equal(v.mit_werbepraemie, 1);
    assert.equal(v.posten[0].rabatt_pct, 100);
    assert.equal(v.posten[0].rabatt_quelle, "bounty_werbepraemie");
    assert.equal(v.posten[0].werbepraemie.satz_pct, 100);
  });

  it("ohne faellige Praemie nennt die Vorschau den GRUND", async () => {
    /* Schweigen liesse offen, ob geprueft wurde oder nichts da war — genau die
     * Verwechslung, gegen die diese Spur seit K1.1 antritt. */
    const p = laufPool({ gedeckelt: 3, praemieDa: null });
    const v = await vorschauRecurringInvoices(p, { now: "2026-02-02T00:00:00Z", logger: stillerLogger });
    assert.equal(v.posten[0].werbepraemie, null);
    assert.equal(v.posten[0].werbepraemie_grund, "KEINE_FAELLIGE_PRAEMIE");
  });

  it("die Vorschau verbraucht KEINE Praemie", async () => {
    const p = laufPool({ praemieDa: OFFENE_PRAEMIE });
    await vorschauRecurringInvoices(p, { now: "2026-02-02T00:00:00Z", logger: stillerLogger });
    assert.equal(p.find("UPDATE referral_rewards").length, 0,
      "eine Vorschau, die einen geschenkten Monat aufbraucht, ist keine Vorschau");
  });
});
