/**
 * Mehrere Steuersaetze auf einer Rechnung.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DER FEHLER, DEN NIEMAND GESEHEN HAETTE
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Bis zum 2026-08-29 konnte eine Rechnung nur EINEN Steuersatz tragen: die
 * Zwischenstruktur fuehrte ein einzelnes Steuerobjekt, die Positionen hatten
 * kein eigenes Merkmal. Eine Rechnung mit 19 % Ueberlassung und 7 %
 * Nebenleistung waere mit einheitlichem Satz herausgegangen — und KEIN
 * Validator haette es bemerkt, weil alle Summen dann rechnerisch aufgehen.
 *
 * Das ist die gefaehrlichste Sorte Fehler: er ist unsichtbar, solange man ihn
 * nicht kennt, und er faellt erst beim Finanzamt auf.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ZWEI DINGE ENTSCHEIDEN, OB DIE RECHNUNG AUFGEHT
 * ────────────────────────────────────────────────────────────────────────────
 *
 * 1. GRUPPIERT wird nach dem PAAR (Kategorie, Satz), nicht nach dem Satz
 *    allein: 0 % kann "steuerfrei" oder "Reverse Charge" heissen, und das sind
 *    zwei verschiedene Aufschluesselungen mit verschiedenen Pflichtangaben.
 *
 * 2. GERUNDET wird je GRUPPE, nicht je Position. BR-CO-17 rechnet auf
 *    Gruppenebene; wer je Position rundet und summiert, weicht um Cent ab —
 *    und BR-CO-14 kennt keine Toleranz.
 *
 * Run: node --test --test-force-exit test/steuergruppen.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bildeSteuergruppen, erzeugeERechnung } from "../services/eRechnungService.js";

/** Kurzform: Positionen nur mit dem, was fuer die Gruppierung zaehlt. */
function pos(cents, satz, kategorie = "S") {
  return { zeilensummeCents: cents, steuersatzPct: satz, steuerkategorie: kategorie };
}

describe("Die Gruppierung", () => {
  it("fasst gleiche Saetze zu EINER Aufschluesselung zusammen", () => {
    /* BR-S-08 vergleicht die Basis EINER Gruppe mit der Summe ALLER passenden
       Positionen. Zwei Gruppen mit demselben Paar scheitern deshalb beide. */
    const g = bildeSteuergruppen({
      positionen: [pos(100000, 19), pos(50000, 19), pos(25000, 19)],
      kategorie: "S", satzPct: 19, nettoCents: 175000, steuerCentsGesamt: 33250, optionen: {},
    });
    assert.equal(g.length, 1, "drei Positionen mit 19 % ergeben EINE Aufschluesselung");
    assert.equal(g[0].grundlageCents, 175000);
  });

  it("trennt verschiedene Saetze", () => {
    const g = bildeSteuergruppen({
      positionen: [pos(192000, 19), pos(10000, 7)],
      kategorie: "S", satzPct: 19, nettoCents: 202000, steuerCentsGesamt: 37180, optionen: {},
    });
    assert.equal(g.length, 2);
    const neunzehn = g.find((x) => x.satzPct === 19);
    const sieben = g.find((x) => x.satzPct === 7);
    assert.equal(neunzehn.grundlageCents, 192000);
    assert.equal(sieben.grundlageCents, 10000);
  });

  it("trennt gleiche Saetze mit VERSCHIEDENER Kategorie", () => {
    /* 0 % steuerfrei und 0 % Reverse Charge sind zwei Aufschluesselungen: die
       eine verlangt einen Befreiungsgrund (BR-E-10), die andere den
       Reverse-Charge-Hinweis (BR-AE-10). Nach dem Satz allein gruppiert waeren
       sie eine — und der Beleg truege den falschen Grund. */
    const g = bildeSteuergruppen({
      positionen: [pos(100000, 0, "E"), pos(50000, 0, "AE")],
      kategorie: "E", satzPct: 0, nettoCents: 150000, steuerCentsGesamt: 0, optionen: {},
    });
    assert.equal(g.length, 2, "E und AE sind zwei Aufschluesselungen, auch bei gleichem Satz");
    assert.ok(g.some((x) => x.kategorie === "E"));
    assert.ok(g.some((x) => x.kategorie === "AE"));
  });

  it("unterscheidet 19 und 19.0 NICHT", () => {
    /* Sonst entstuenden zwei Gruppen mit demselben Paar — und die scheitern
       nach BR-S-08 beide. */
    const g = bildeSteuergruppen({
      positionen: [pos(100000, 19), pos(50000, 19.0), pos(25000, 19.00)],
      kategorie: "S", satzPct: 19, nettoCents: 175000, steuerCentsGesamt: 33250, optionen: {},
    });
    assert.equal(g.length, 1);
  });

  it("rundet je GRUPPE, nicht je Position", () => {
    /* Der Rundungsunterschied ist der Punkt. Drei Positionen zu je 3,33 EUR:
       je Position gerundet ergaebe 3 x round(333 * 7 / 100) = 3 x 23 = 69,
       auf der Gruppe gerechnet round(999 * 7 / 100) = 70. BR-CO-14 kennt
       keine Toleranz — der eine Cent macht den Unterschied. */
    const g = bildeSteuergruppen({
      positionen: [pos(333, 7), pos(333, 7), pos(333, 7)],
      kategorie: "S", satzPct: 19, nettoCents: 999, steuerCentsGesamt: 70, optionen: {},
    });
    assert.equal(g.length, 1);
    assert.equal(g[0].grundlageCents, 999);
    /* Bei genau einer Gruppe bleibt die ausgewiesene Gesamtsteuer stehen —
       der Wert kommt aus der Datenbank und wird nicht neu erfunden. */
    assert.equal(g[0].betragCents, 70);

    const zwei = bildeSteuergruppen({
      positionen: [pos(333, 7), pos(333, 7), pos(333, 7), pos(100000, 19)],
      kategorie: "S", satzPct: 19, nettoCents: 100999, steuerCentsGesamt: 19070, optionen: {},
    });
    const sieben = zwei.find((x) => x.satzPct === 7);
    assert.equal(sieben.betragCents, 70,
      "auf der Gruppe gerechnet sind es 70 Cent, je Position waeren es 69");
  });

  it("liefert eine feste Reihenfolge", () => {
    /* Ohne sie haengt die Reihenfolge an der Positionsfolge, und zwei
       Erzeugungen derselben Rechnung ergaeben verschiedene Dateien. */
    const a = bildeSteuergruppen({
      positionen: [pos(10000, 7), pos(192000, 19)],
      kategorie: "S", satzPct: 19, nettoCents: 202000, steuerCentsGesamt: 37180, optionen: {},
    });
    const b = bildeSteuergruppen({
      positionen: [pos(192000, 19), pos(10000, 7)],
      kategorie: "S", satzPct: 19, nettoCents: 202000, steuerCentsGesamt: 37180, optionen: {},
    });
    assert.deepEqual(a.map((x) => x.satzPct), b.map((x) => x.satzPct));
    assert.equal(a[0].satzPct, 19, "der hoechste Satz steht zuerst");
  });

  it("ohne Positionen bleibt der Rechnungskopf die Quelle", () => {
    /* Etwa bei einer Rechnung, die nur aus Korrekturposten besteht. */
    const g = bildeSteuergruppen({
      positionen: [], kategorie: "S", satzPct: 19,
      nettoCents: 100000, steuerCentsGesamt: 19000, optionen: {},
    });
    assert.equal(g.length, 1);
    assert.equal(g[0].grundlageCents, 100000);
    assert.equal(g[0].betragCents, 19000);
  });

  it("bei EINEM Satz bleibt die ausgewiesene Steuer unangetastet", () => {
    /* Das haelt jede heutige Rechnung byte-identisch — und respektiert, dass
       der Betrag aus der Datenbank kommt. Wer ihn hier neu rechnete, saehe bei
       einer Bestandsrechnung mit Cent-Abweichung ploetzlich einen anderen
       Wert im XML als auf dem gedruckten Beleg. */
    const g = bildeSteuergruppen({
      positionen: [pos(100000, 19)],
      kategorie: "S", satzPct: 19, nettoCents: 100000,
      steuerCentsGesamt: 18999, optionen: {},   // absichtlich ein Cent daneben
    });
    assert.equal(g[0].betragCents, 18999, "der ausgewiesene Wert bleibt stehen");
  });

  it("die Bemessungsgrundlage ist bei einem Satz das Netto, nicht die Zeilensumme", () => {
    /* Mit Rabatt gehen die auseinander (BT-106 gegen BT-109). */
    const g = bildeSteuergruppen({
      positionen: [pos(200000, 19)],
      kategorie: "S", satzPct: 19, nettoCents: 192000, steuerCentsGesamt: 36480, optionen: {},
    });
    assert.equal(g[0].grundlageCents, 192000, "die Grundlage ist das Netto nach Abzuegen");
  });

  it("der Befreiungsgrund haengt an der Kategorie", () => {
    const g = bildeSteuergruppen({
      positionen: [pos(100000, 0, "AE")],
      kategorie: "AE", satzPct: 0, nettoCents: 100000, steuerCentsGesamt: 0, optionen: {},
    });
    assert.match(g[0].befreiungsgrund, /Steuerschuldnerschaft/);

    const frei = bildeSteuergruppen({
      positionen: [pos(100000, 0, "E")],
      kategorie: "E", satzPct: 0, nettoCents: 100000, steuerCentsGesamt: 0, optionen: {},
    });
    assert.match(frei.befreiungsgrund ?? frei[0].befreiungsgrund, /[Ss]teuerfrei/);

    const normal = bildeSteuergruppen({
      positionen: [pos(100000, 19)],
      kategorie: "S", satzPct: 19, nettoCents: 100000, steuerCentsGesamt: 19000, optionen: {},
    });
    assert.equal(normal[0].befreiungsgrund, null,
      "bei Normalsatz ist der Befreiungsgrund nach BR-S-10 VERBOTEN");
  });
});

/* ─────────────────────────────────────────────────────────────────────────── */

const VERKAEUFER = {
  legal_name: "Muster GmbH", billing_street: "Weg 12", billing_postal_code: "44135",
  billing_city: "Dortmund", billing_country_code: "DE", vat_id: "DE123456789",
  billing_contact: "Buchhaltung", billing_phone: "+49 231 555", billing_email: "r@m.de",
};
const KAEUFER = {
  legal_name: "Beispiel AG", billing_street: "Str 3", billing_postal_code: "20457",
  billing_city: "Hamburg", billing_country_code: "DE", vat_id: "DE987654321",
  billing_email: "k@b.de",
};

describe("Im erzeugten XML", () => {
  const POSITIONEN = [
    { worker_name: "A. Kraft", quantity: 40, unit_amount_cents: 4800, total_cents: 192000,
      tax_rate_pct: 19, tax_category: "S", week_start: "2026-08-03" },
    { description: "Schulung", quantity: 1, unit_amount_cents: 10000, total_cents: 10000,
      tax_rate_pct: 7, tax_category: "S" },
  ];
  const NETTO = 202000;
  const STEUER = Math.round(192000 * 19 / 100) + Math.round(10000 * 7 / 100);
  const RECHNUNG = {
    invoice_number: "2026-0043", issued_at: "2026-08-20T10:00:00.000Z",
    due_at: "2026-09-03T10:00:00.000Z",
    gross_amount_cents: NETTO, amount_cents: NETTO,
    tax_amount_cents: STEUER, total_cents: NETTO + STEUER, tax_rate_pct: 19,
  };

  it("CII traegt zwei Aufschluesselungen", () => {
    const e = erzeugeERechnung({
      format: "zugferd", invoice: RECHNUNG, items: POSITIONEN,
      verkaeufer: VERKAEUFER, kaeufer: KAEUFER,
    });
    assert.equal(e.ok, true, JSON.stringify(e.fehlend || e.hinweis || ""));
    const grundlagen = [...e.xml.matchAll(/<ram:BasisAmount>([\d.]+)</g)].map((m) => m[1]);
    assert.deepEqual(grundlagen.sort(), ["100.00", "1920.00"]);
  });

  it("UBL traegt zwei TaxSubtotal in EINEM TaxTotal", () => {
    /* PEPPOL-EN16931-R053 laesst nur ein cac:TaxTotal zu. */
    const e = erzeugeERechnung({
      format: "xrechnung", invoice: RECHNUNG, items: POSITIONEN,
      verkaeufer: VERKAEUFER, kaeufer: KAEUFER,
    });
    assert.equal(e.ok, true, JSON.stringify(e.fehlend || ""));
    assert.equal((e.xml.match(/<cac:TaxTotal>/g) || []).length, 1);
    assert.equal((e.xml.match(/<cac:TaxSubtotal>/g) || []).length, 2);
  });

  it("jede Position traegt ihren eigenen Satz (BT-152)", () => {
    const e = erzeugeERechnung({
      format: "zugferd", invoice: RECHNUNG, items: POSITIONEN,
      verkaeufer: VERKAEUFER, kaeufer: KAEUFER,
    });
    const zeilen = e.xml.match(/<ram:SpecifiedLineTradeSettlement>[\s\S]*?<\/ram:SpecifiedLineTradeSettlement>/g) || [];
    assert.equal(zeilen.length, 2);
    assert.ok(zeilen.some((z) => /RateApplicablePercent>19</.test(z)));
    assert.ok(zeilen.some((z) => /RateApplicablePercent>7</.test(z)));
  });

  it("eine Rechnung mit EINEM Satz bleibt unveraendert", () => {
    /* Die wichtigste Zusicherung der Umstellung: der Normalfall darf sich
       nicht bewegen. */
    const e = erzeugeERechnung({
      format: "zugferd",
      invoice: { ...RECHNUNG, amount_cents: 192000, gross_amount_cents: 192000,
                 tax_amount_cents: 36480, total_cents: 228480 },
      items: [POSITIONEN[0]], verkaeufer: VERKAEUFER, kaeufer: KAEUFER,
    });
    assert.equal(e.ok, true, JSON.stringify(e.fehlend || ""));
    assert.equal((e.xml.match(/<ram:BasisAmount>/g) || []).length, 1,
      "eine Rechnung mit einem Satz hat genau eine Aufschluesselung");
  });
});

describe("Was der Generator ablehnt", () => {
  const POSITIONEN = [
    { total_cents: 192000, quantity: 40, unit_amount_cents: 4800, tax_rate_pct: 19, tax_category: "S", worker_name: "A" },
    { total_cents: 10000, quantity: 1, unit_amount_cents: 10000, tax_rate_pct: 7, tax_category: "S", description: "B" },
  ];
  const NETTO = 202000;

  it("eine Gesamtsteuer, die nicht zur Aufteilung passt (BR-CO-14)", () => {
    const falsch = Math.round(192000 * 19 / 100) + Math.round(10000 * 7 / 100) + 100;
    const e = erzeugeERechnung({
      format: "zugferd",
      invoice: { invoice_number: "1", issued_at: "2026-08-20T10:00:00Z", due_at: "2026-09-03T10:00:00Z",
                 gross_amount_cents: NETTO, amount_cents: NETTO,
                 tax_amount_cents: falsch, total_cents: NETTO + falsch, tax_rate_pct: 19 },
      items: POSITIONEN, verkaeufer: VERKAEUFER, kaeufer: KAEUFER,
    });
    assert.equal(e.ok, false);
    assert.ok(e.fehlend.some((f) => f.bt === "BR-CO-14"),
      "die Summe der Gruppen weicht ab und muss gemeldet werden");
  });

  it("einen Nachlass bei mehreren Saetzen", () => {
    /* BT-95/96 verlangen genau eine Kategorie fuer den Nachlass. Welchem Satz
       er zugerechnet wird, entscheidet ueber die Steuerbetraege — das darf der
       Generator nicht raten. */
    const STEUER = Math.round(192000 * 19 / 100) + Math.round(10000 * 7 / 100);
    const e = erzeugeERechnung({
      format: "zugferd",
      invoice: { invoice_number: "1", issued_at: "2026-08-20T10:00:00Z", due_at: "2026-09-03T10:00:00Z",
                 gross_amount_cents: NETTO + 5000, amount_cents: NETTO,
                 discount_amount_cents: 5000,
                 tax_amount_cents: STEUER, total_cents: NETTO + STEUER, tax_rate_pct: 19 },
      items: POSITIONEN, verkaeufer: VERKAEUFER, kaeufer: KAEUFER,
    });
    assert.equal(e.ok, false);
    assert.ok(e.fehlend.some((f) => /Nachlass/.test(f.feld)),
      "der Nachlass bei mehreren Saetzen muss abgelehnt werden");
  });
});
