/**
 * P9 Spur A / Welle A4 — der Bounty-Rabatt erreicht die Rechnung.
 *
 * WORUM ES GEHT
 * Die Plattform hat seit jeher einen Treue-Rabatt angezeigt und den vollen Betrag
 * in Rechnung gestellt: `getUserDiscount()` hatte ausschliesslich Anzeige-Aufrufer,
 * im gesamten Geldpfad kam das Wort `discount` nicht vor. Ein Preisversprechen
 * ohne Wirkung — und die Sorte Defekt, die nichts rot macht, weil eine
 * ausbleibende Wirkung keine Fehlermeldung hat.
 *
 * Die Pruefungen hier decken die drei Zusagen des Gates ab:
 *   1. Eine Rechnung weist den Rabatt GETRENNT aus (nicht als stillen Abzug).
 *   2. Ein spaeterer Bounty-Verlust aendert keine bereits gestellte Rechnung.
 *   3. Rueckwaertsprobe: ohne Rabatt ist der Betrag identisch zu vorher.
 *
 * Run: node --test --test-force-exit test/rechnungRabatt.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInvoice, berechneRabatt } from "../services/invoiceService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hasDb = Boolean(process.env.DATABASE_URL || (process.env.DB_HOST && process.env.POSTGRES_PASSWORD));

/* ── Attrappe ──────────────────────────────────────────────────────────── */

function rechnungsPool({ premiumCents = 0 } = {}) {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes("nextval('invoice_number_seq')")) return { rows: [{ seq: 42 }], rowCount: 1 };
    // lockPendingCharges prueft ERST, ob es die Tabelle gibt (to_regclass), und
    // fragt danach die Posten ab. Beides traegt denselben Tabellennamen — wer nur
    // darauf routet, beantwortet die Existenzfrage mit einer Postenliste, und die
    // Einmalgebuehren fallen still unter den Tisch.
    if (sql.includes("to_regclass")) {
      return { rows: [{ t: premiumCents ? "premium_listing_charges" : null }], rowCount: 1 };
    }
    if (sql.includes("FROM premium_listing_charges")) {
      return { rows: premiumCents ? [{ id: "c1", amount_cents: premiumCents }] : [], rowCount: premiumCents ? 1 : 0 };
    }
    if (sql.includes("INSERT INTO invoices")) {
      // Die Attrappe spiegelt die Parameter zurueck, damit der Test die
      // GESCHRIEBENEN Werte prueft und nicht seine eigene Erwartung.
      return { rows: [{ id: "inv1", geschrieben: params }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  };
  return { calls, query, connect: async () => ({ query, release: () => {} }) };
}

/**
 * Liest die geschriebenen Rechnungswerte aus der aufgezeichneten INSERT-Query.
 *
 * Spalten und Parameter lassen sich NICHT einfach der Reihe nach paaren: die
 * Query enthaelt Literale ('issued', NOW()), die keinen Platzhalter belegen.
 * Deshalb wird ueber die $n-Nummern zugeordnet — sonst verschiebt sich ab dem
 * ersten Literal alles um eins, und der Test prueft froehlich die falschen Werte.
 */
function geschriebeneRechnung(pool) {
  const ins = pool.calls.find((c) => c.sql.includes("INSERT INTO invoices"));
  assert.ok(ins, "es wurde keine Rechnung geschrieben");
  const spalten = ins.sql
    .slice(ins.sql.indexOf("(") + 1, ins.sql.indexOf(") VALUES"))
    .split(",").map((s) => s.trim()).filter(Boolean);
  // Die Werteliste endet NICHT bei der ersten Klammer — `NOW()` bringt eine
  // eigene mit. Deshalb bis zur passenden schliessenden Klammer zaehlen.
  const nachValues = ins.sql.slice(ins.sql.indexOf(") VALUES") + ") VALUES".length);
  const start = nachValues.indexOf("(");
  let tiefe = 0, ende = -1;
  for (let i = start; i < nachValues.length; i++) {
    if (nachValues[i] === "(") tiefe++;
    else if (nachValues[i] === ")" && --tiefe === 0) { ende = i; break; }
  }
  const platzhalter = nachValues.slice(start + 1, ende)
    .replace(/NOW\(\)/g, "NOW")   // Klammern raus, damit das Komma-Trennen stimmt
    .split(",").map((s) => s.trim());
  assert.equal(spalten.length, platzhalter.length,
    "Spaltenliste und Werteliste der INSERT-Query passen nicht zusammen");

  const werte = {};
  spalten.forEach((name, i) => {
    const m = /^\$(\d+)$/.exec(platzhalter[i]);
    werte[name] = m ? ins.params[Number(m[1]) - 1] : platzhalter[i];
  });
  return werte;
}

const BASIS = { orgId: "org1", userId: "u1", plan: "PRO" };

/* ── 1. Die Rechenregel ────────────────────────────────────────────────── */

describe("P9/A4 · Rabattberechnung", () => {
  it("ohne Rabatt wird nichts abgezogen", () => {
    for (const wert of [0, null, undefined, "", NaN, -5]) {
      assert.deepEqual(berechneRabatt(79900, wert), { satz: 0, betragCents: 0 },
        `${JSON.stringify(wert)} darf keinen Abzug erzeugen`);
    }
  });

  it("rechnet kaufmaennisch und in Cent", () => {
    assert.deepEqual(berechneRabatt(79900, 6), { satz: 6, betragCents: 4794 });
    assert.deepEqual(berechneRabatt(10000, 2.5), { satz: 2.5, betragCents: 250 });
    // 3 % von 33 Cent = 0,99 -> 1 Cent
    assert.equal(berechneRabatt(33, 3).betragCents, 1);
  });

  it("kann nie mehr abziehen als den Planbetrag", () => {
    assert.equal(berechneRabatt(5000, 150).betragCents, 5000,
      "eine Fehlkonfiguration ueber 100 % darf keine negative Rechnung erzeugen");
    assert.equal(berechneRabatt(5000, 150).satz, 100);
  });
});

/* ── 2. Was in der Rechnung landet ─────────────────────────────────────── */

describe("P9/A4 · Die Rechnung weist den Rabatt getrennt aus", () => {
  it("Rueckwaertsprobe: ohne Rabatt ist der Betrag unveraendert", async () => {
    const pool = rechnungsPool();
    await createInvoice(pool, { ...BASIS, amountCents: 79900 });
    const r = geschriebeneRechnung(pool);

    assert.equal(Number(r.amount_cents), 79900, "der Nettobetrag muss der alte sein");
    assert.equal(Number(r.tax_amount_cents), 15181, "19 % von 79900");
    assert.equal(Number(r.total_cents), 95081);
    assert.equal(Number(r.discount_pct), 0);
    assert.equal(Number(r.discount_amount_cents), 0);
    assert.equal(Number(r.gross_amount_cents), 79900, "ohne Rabatt ist brutto gleich netto");
    assert.equal(r.discount_source, null, "ohne Rabatt darf keine Quelle behauptet werden");
  });

  it("mit 6 % steht Brutto, Satz, Abzug und Netto einzeln in der Zeile", async () => {
    const pool = rechnungsPool();
    await createInvoice(pool, { ...BASIS, amountCents: 79900, discountPct: 6 });
    const r = geschriebeneRechnung(pool);

    assert.equal(Number(r.gross_amount_cents), 79900);
    assert.equal(Number(r.discount_pct), 6);
    assert.equal(Number(r.discount_amount_cents), 4794);
    assert.equal(Number(r.amount_cents), 75106, "79900 - 4794");
    assert.equal(r.discount_source, "bounty");

    // Die Steuer folgt dem ermaessigten Betrag — sonst zahlt der Kunde Steuer
    // auf Geld, das er nicht schuldet.
    assert.equal(Number(r.tax_amount_cents), 14270, "19 % von 75106");
    assert.equal(Number(r.total_cents), 89376);
  });

  it("die Rechnung geht in sich auf", async () => {
    const pool = rechnungsPool();
    await createInvoice(pool, { ...BASIS, amountCents: 79900, discountPct: 6 });
    const r = geschriebeneRechnung(pool);
    assert.equal(
      Number(r.gross_amount_cents) - Number(r.discount_amount_cents),
      Number(r.amount_cents),
      "genau diese Gleichung erzwingt auch die Datenbank (invoices_rabatt_stimmig)"
    );
  });

  it("der Rabatt gilt auf den Plan, nicht auf Einmalgebuehren", async () => {
    const pool = rechnungsPool({ premiumCents: 5000 });
    await createInvoice(pool, { ...BASIS, amountCents: 79900, discountPct: 10 });
    const r = geschriebeneRechnung(pool);

    assert.equal(Number(r.discount_amount_cents), 7990,
      "10 % von 79900 — nicht von 84900. Ein Treuerabatt bezieht sich auf das Abo, "
      + "nicht auf eine gebuchte Premium-Anzeige.");
    assert.equal(Number(r.gross_amount_cents), 84900, "Brutto enthaelt die Einmalgebuehr");
    assert.equal(Number(r.amount_cents), 76910, "84900 - 7990");
  });

  it("ein unsinniger Satz kann die Rechnung nicht ins Minus drehen", async () => {
    const pool = rechnungsPool();
    await createInvoice(pool, { ...BASIS, amountCents: 79900, discountPct: 999 });
    const r = geschriebeneRechnung(pool);
    assert.equal(Number(r.amount_cents), 0);
    assert.ok(Number(r.total_cents) >= 0);
  });

  it("die Abo-Position zeigt weiter den Listenpreis", async () => {
    // Bewusst so: der Rabatt steht in eigenen Spalten. `invoice_items` verbietet
    // negative Betraege (CHECK >= 0) — eine Minus-Position haette verlangt, eine
    // Geld-Schutzregel aufzuweichen, nur um eine Darstellung zu ermoeglichen.
    const pool = rechnungsPool();
    await createInvoice(pool, { ...BASIS, amountCents: 79900, discountPct: 6 });
    const pos = pool.calls.find((c) => c.sql.includes("INSERT INTO invoice_items"));
    assert.ok(pos);
    assert.equal(pos.params[2], 79900, "die Position ist der Planpreis, der Abzug steht daneben");
  });
});

/* ── 3. Eingefroren ────────────────────────────────────────────────────── */

describe("P9/A4 · Der Satz ist eingefroren", () => {
  const dienst = fs.readFileSync(path.join(__dirname, "..", "services", "invoiceService.js"), "utf8");
  const wiederkehrend = fs.readFileSync(
    path.join(__dirname, "..", "services", "recurringBillingService.js"), "utf8"
  );

  it("keine Stelle schreibt discount_pct auf einer bestehenden Rechnung um", () => {
    // Eine gestellte Rechnung ist ein Beleg, kein Ausblick: verliert der Kunde
    // das Bounty im Juni, bleibt die Mai-Rechnung, wie sie war.
    const codeOhneKommentare = dienst
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
    assert.ok(!/UPDATE invoices[\s\S]{0,200}discount_pct/.test(codeOhneKommentare),
      "ein nachtraeglicher Eingriff wuerde einen Beleg veraendern");
  });

  it("die Folgerechnung reicht den aktuellen Satz durch — am echten Pfad gemessen", async () => {
    // `generateRecurringInvoices` erlaubt das Einschleusen von createInvoice.
    // Damit laeuft der ECHTE Pfad inklusive Rabattermittlung, statt nur den
    // Quelltext zu lesen.
    const { generateRecurringInvoices } = await import("../services/recurringBillingService.js");

    const faellig = {
      id: "sub1", user_id: "u1", plan: "PRO",
      current_period_start: "2026-07-01", current_period_end: "2026-08-01"
    };
    const uebergeben = [];
    const query = async (sql) => {
      if (sql.includes("FROM subscriptions") && sql.includes("current_period_end <= $1")) {
        return { rows: [faellig], rowCount: 1 };
      }
      // Ohne aufloesbaren Owner-Org-Kontext wird bewusst NICHT abgerechnet.
      if (sql.includes("FROM org_memberships om")) {
        return { rows: [{ org_id: "org1", org_name: "Kunde", billing_mode: null, individual_contract_price_cents: null, user_email: "k@example.de" }], rowCount: 1 };
      }
      // getUserDiscount: Summe der aktiven Bounties
      if (sql.includes("SUM(b.discount_pct)")) return { rows: [{ total: 6 }], rowCount: 1 };
      if (sql.includes("UPDATE subscriptions")) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    };
    const pool = { query, connect: async () => ({ query, release: () => {} }) };

    await generateRecurringInvoices(pool, {
      createInvoice: async (_client, o) => { uebergeben.push(o); return { id: "inv1", invoice_number: "TC-X" }; }
    });

    assert.equal(uebergeben.length, 1, "es wurde keine Folgerechnung erzeugt");
    assert.equal(uebergeben[0].discountPct, 6,
      "ohne diesen Wert bleibt der Rabatt weiter reine Anzeige — genau der Ausgangsbefund");
    assert.equal(uebergeben[0].discountSource, "bounty");
    assert.match(uebergeben[0].notes, /Treue-Rabatt 6 %/,
      "der Beleg soll auch im Klartext sagen, warum er niedriger ist");
  });

  it("ohne Bounty wird kein Rabatt behauptet", async () => {
    const { generateRecurringInvoices } = await import("../services/recurringBillingService.js");
    const uebergeben = [];
    const query = async (sql) => {
      if (sql.includes("FROM subscriptions") && sql.includes("current_period_end <= $1")) {
        return { rows: [{ id: "s", user_id: "u", plan: "PRO", current_period_end: "2026-08-01" }], rowCount: 1 };
      }
      if (sql.includes("FROM org_memberships om")) {
        return { rows: [{ org_id: "org1", org_name: "Kunde", billing_mode: null, individual_contract_price_cents: null, user_email: "k@example.de" }], rowCount: 1 };
      }
      if (sql.includes("SUM(b.discount_pct)")) return { rows: [{ total: 0 }], rowCount: 1 };
      if (sql.includes("UPDATE subscriptions")) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    };
    const pool = { query, connect: async () => ({ query, release: () => {} }) };

    await generateRecurringInvoices(pool, {
      createInvoice: async (_c, o) => { uebergeben.push(o); return { id: "i", invoice_number: "TC-Y" }; }
    });
    assert.equal(uebergeben[0].discountPct, 0);
    assert.equal(uebergeben[0].discountSource, null);
    assert.ok(!/Treue-Rabatt/.test(uebergeben[0].notes));
  });

  it("faellt die Rabattermittlung aus, wird trotzdem abgerechnet — aber sichtbar", () => {
    assert.match(wiederkehrend, /logger\?\.warn\?\.\([\s\S]{0,160}Rabattsatz nicht ermittelbar/,
      "ein stummes catch waere hier dieselbe Falle wie im Referral-Pfad");
  });

  it("der Stripe-Checkout rechnet bewusst KEINEN Rabatt ein", () => {
    // Stripe laeuft im Abo-Modus mit festem Preis: ein dort eingerechneter Rabatt
    // waere dauerhaft eingefroren und wuerde der Entscheidung "monatlich neu"
    // widersprechen. Die Begruendung muss im Code stehen bleiben, sonst
    // "repariert" es jemand falsch.
    const zahlung = fs.readFileSync(path.join(__dirname, "..", "routes", "payment.js"), "utf8");
    assert.match(zahlung, /WARUM HIER KEIN BOUNTY-RABATT EINGERECHNET WIRD/);
    const checkout = zahlung.slice(zahlung.indexOf("mode: \"subscription\""), zahlung.indexOf("customer_email"));
    assert.ok(!/discount|rabatt/i.test(checkout),
      "der Abo-Preis bei Stripe darf nicht rabattiert werden — sonst gilt der Rabatt ewig");
  });
});

/* ── 4. An der echten Datenbank ────────────────────────────────────────── */

describe("P9/A4 · Die Datenbank haelt die Rechnung zusammen",
  { skip: !hasDb && "Keine Datenbank konfiguriert" }, () => {

  it("fremde Schreibpfade bleiben stimmig, unstimmige Zeilen werden abgewiesen", async () => {
    const { default: pg } = await import("pg");
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL
        || `postgres://${process.env.DB_USER || "tempconnect"}:${process.env.POSTGRES_PASSWORD}`
           + `@${process.env.DB_HOST}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || "tempconnect"}`
    });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: [u] } = await client.query("SELECT id FROM users LIMIT 1");
      if (!u) { await client.query("ROLLBACK"); return; }

      // Ein Schreiber, der die neuen Spalten gar nicht kennt (operative Rechnung).
      await client.query(
        `INSERT INTO invoices (invoice_number, invoice_type, user_id, billing_period_start,
           billing_period_end, plan, amount_cents, tax_rate_pct, tax_amount_cents, total_cents,
           currency, status, issued_at, due_at)
         VALUES ('TC-TEST-OP', 'operational', $1, CURRENT_DATE, CURRENT_DATE, 'PRO',
                 50000, 19, 9500, 59500, 'EUR', 'issued', NOW(), NOW())`, [u.id]
      );
      const { rows: [op] } = await client.query(
        "SELECT gross_amount_cents, amount_cents FROM invoices WHERE invoice_number = 'TC-TEST-OP'"
      );
      assert.equal(Number(op.gross_amount_cents), Number(op.amount_cents),
        "ohne Rabatt muss die Datenbank den Bruttobetrag selbst setzen — sonst braeche "
        + "jeder Schreibpfad, der die neuen Spalten nicht kennt");

      // Ein Korrekturlauf, der amount_cents aus den Positionen neu rechnet.
      await client.query(
        "UPDATE invoices SET amount_cents = 62000 WHERE invoice_number = 'TC-TEST-OP'"
      );
      const { rows: [korr] } = await client.query(
        "SELECT gross_amount_cents, amount_cents FROM invoices WHERE invoice_number = 'TC-TEST-OP'"
      );
      assert.equal(Number(korr.gross_amount_cents), 62000, "der Bruttobetrag muss folgen");

      // Eine Zeile, die einen Rabatt behauptet, ohne ihn abzuziehen.
      await assert.rejects(
        () => client.query(
          `INSERT INTO invoices (invoice_number, user_id, billing_period_start, billing_period_end,
             plan, amount_cents, gross_amount_cents, discount_pct, discount_amount_cents,
             tax_rate_pct, tax_amount_cents, total_cents, currency, status, issued_at, due_at)
           VALUES ('TC-TEST-LUEGE', $1, CURRENT_DATE, CURRENT_DATE, 'PRO',
                   10000, 10000, 6, 600, 19, 1900, 11900, 'EUR', 'issued', NOW(), NOW())`, [u.id]
        ),
        /invoices_rabatt_stimmig/,
        "eine Rechnung, die Rabatt ausweist und ihn nicht abzieht, saehe korrekt aus und waere es nicht"
      );

      await client.query("ROLLBACK");
    } finally {
      client.release();
      await pool.end();
    }
  });
});
