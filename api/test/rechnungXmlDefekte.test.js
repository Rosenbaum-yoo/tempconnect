/**
 * Die drei Defekte, die das Schematron-Gate am 2026-08-29 belegt hat.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WARUM DIESE DATEI ZUSAETZLICH ZUM GATE EXISTIERT
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `npm run test:schematron` beweist sie am fertigen Dokument — aber es braucht
 * Docker und laeuft deshalb nicht in jedem Testlauf. Zwei Dinge kann es
 * ausserdem gar nicht zeigen:
 *
 *   · Eine Ablehnung durch den Generator sieht das Gate nur als Abwesenheit
 *     einer Datei. WARUM abgelehnt wurde, steht hier.
 *   · Ein toleriertes Element beim Empfaenger (BT-32) meldet der Validator
 *     moeglicherweise gar nicht — die Norm kennt es dort schlicht nicht.
 *
 * Diese Datei kostet Millisekunden und haelt die Entscheidungen fest.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DIE LEITENTSCHEIDUNG: ABLEHNEN STATT GLAETTEN
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Bei zwei der drei Defekte waere der bequeme Fix gewesen, den Beleg still
 * zurechtzurechnen — Steuersatz auf 0, Laenderkennzeichen davorsetzen. Beides
 * ist verworfen: an einem Steuerbeleg waere das eine stille Faelschung, und die
 * Projektregel vom 2026-08-03 sagt es allgemein — Fehlerpfade eskalieren, nie
 * degradieren.
 *
 * Run: node --test --test-force-exit test/rechnungXmlDefekte.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { erzeugeERechnung } from "../services/eRechnungService.js";

const VERKAEUFER = {
  name: "Müller Zeitarbeit", legal_name: "Müller Zeitarbeit GmbH",
  billing_street: "Weg 12", billing_postal_code: "44135", billing_city: "Dortmund",
  billing_country_code: "DE", vat_id: "DE123456789",
  iban: "DE02120300000000202051", bic: "BYLADEM1001",
  commercial_register: "HRB 12345", billing_email: "rechnung@mueller.de",
  billing_contact: "Buchhaltung", billing_phone: "+49 231 5551234",
};
const KAEUFER = {
  legal_name: "Beispiel AG", billing_street: "Strasse 3", billing_postal_code: "20457",
  billing_city: "Hamburg", billing_country_code: "DE", vat_id: "DE987654321",
};
const POSITIONEN = [
  { worker_name: "A. Kraft", quantity: 40, unit_amount_cents: 4800, total_cents: 192000,
    week_start: "2026-08-03", week_end: "2026-08-09" },
];
const RECHNUNG = {
  invoice_number: "2026-0042", issued_at: "2026-08-20T10:00:00.000Z",
  due_at: "2026-09-03T10:00:00.000Z",
  gross_amount_cents: 192000, amount_cents: 192000,
  tax_amount_cents: 36480, total_cents: 228480, tax_rate_pct: 19,
  period_start: "2026-08-01", period_end: "2026-08-31",
};

/** Kurzform: eine Rechnung erzeugen, mit gezielt geaenderten Bestandteilen. */
function baue(aenderung = {}) {
  return erzeugeERechnung({
    format: aenderung.format || "zugferd",
    invoice: { ...RECHNUNG, ...(aenderung.invoice || {}) },
    items: POSITIONEN,
    verkaeufer: { ...VERKAEUFER, ...(aenderung.verkaeufer || {}) },
    kaeufer: { ...KAEUFER, ...(aenderung.kaeufer || {}) },
    optionen: aenderung.optionen,
  });
}

describe("Defekt 1 — Reverse Charge (BR-AE-05, BR-AE-09)", () => {
  it("eine 19-%-Rechnung mit reverseCharge wird ABGELEHNT, nicht umgerechnet", () => {
    /* Der Kern der Entscheidung. Satz und Betrag im Generator auf 0 zu zwingen
       haette die Regeln gruen gemacht — und aus einer 19-%-Rechnung im
       maschinenlesbaren Teil eine 0-%-Rechnung, waehrend das PDF weiter 19 %
       zeigt. Bei /AFRelationship /Alternative ist das der gebrochene
       Zusagefall, und an einem Steuerbeleg eine Faelschung. */
    const e = baue({ optionen: { reverseCharge: true } });
    assert.equal(e.ok, false, "eine unstimmige Reverse-Charge-Rechnung darf kein XML ergeben");
    assert.equal(e.fehler, "REVERSE_CHARGE_UNSTIMMIG");
    assert.match(e.hinweis, /NICHT umgerechnet/, "die Meldung muss sagen, warum nichts korrigiert wird");
    assert.match(e.hinweis, /19 %/, "sie muss die vorgefundenen Werte nennen");
  });

  it("technisch waere das Umrechnen ohnehin nicht genug gewesen", () => {
    /* Nachweis der zweiten Begruendung: `total_cents` traegt die Steuer weiter.
       Mit genulltem Steuerbetrag waere BR-CO-15 (Brutto = Netto + Steuer)
       gebrochen — der Beleg ist in sich widerspruechlich und auf der
       Serialisierungsebene nicht reparierbar. */
    assert.equal(RECHNUNG.total_cents, RECHNUNG.amount_cents + RECHNUNG.tax_amount_cents,
      "das Fixture selbst muss rechnerisch stimmen, sonst prueft dieser Test nichts");
    assert.notEqual(RECHNUNG.total_cents, RECHNUNG.amount_cents,
      "bei genullter Steuer bliebe der Bruttobetrag falsch — genau der Punkt");
  });

  it("eine RICHTIG gebaute Reverse-Charge-Rechnung geht durch", () => {
    const e = baue({
      invoice: { tax_rate_pct: 0, tax_amount_cents: 0, total_cents: 192000 },
      optionen: { reverseCharge: true },
    });
    assert.equal(e.ok, true, JSON.stringify(e.fehlend || e.hinweis || ""));
    assert.ok(e.xml.includes("<ram:CategoryCode>AE</ram:CategoryCode>"), "die Kategorie fehlt");
    assert.ok(e.xml.includes("<ram:RateApplicablePercent>0</ram:RateApplicablePercent>"),
      "BR-AE-05 verlangt Satz 0");
    assert.ok(e.xml.includes("<ram:CalculatedAmount>0.00</ram:CalculatedAmount>"),
      "BR-AE-09 verlangt Steuerbetrag 0");
  });

  it("und traegt den vorgeschriebenen Hinweistext (BT-120)", () => {
    const e = baue({
      invoice: { tax_rate_pct: 0, tax_amount_cents: 0, total_cents: 192000 },
      optionen: { reverseCharge: true },
    });
    assert.match(e.xml, /Steuerschuldnerschaft des Leistungsempfaengers/,
      "ohne den Grund weiss der Empfaenger nicht, warum keine Steuer ausgewiesen ist");
  });

  it("bei Reverse Charge braucht auch der EMPFAENGER eine Kennung (BR-AE-01/02)", () => {
    /* Bedingte Pflicht — deshalb hier und nicht in der allgemeinen
       Stammdatenpruefung, wo sie jede gewoehnliche Rechnung blockieren wuerde. */
    const e = baue({
      invoice: { tax_rate_pct: 0, tax_amount_cents: 0, total_cents: 192000 },
      kaeufer: { vat_id: null, commercial_register: null },
      optionen: { reverseCharge: true },
    });
    assert.equal(e.ok, false);
    assert.equal(e.fehler, "REVERSE_CHARGE_KAEUFERKENNUNG_FEHLT");
  });

  it("ohne Reverse Charge bleibt alles wie bisher", () => {
    const e = baue({});
    assert.equal(e.ok, true, JSON.stringify(e.fehlend || []));
    assert.ok(e.xml.includes("<ram:CategoryCode>S</ram:CategoryCode>"));
    assert.ok(!/Steuerschuldnerschaft/.test(e.xml), "der AE-Hinweis gehoert nicht auf eine Normalrechnung");
  });
});

describe("Defekt 2 — Zahlungsbedingung (BR-CO-25)", () => {
  it("ohne Faelligkeitsdatum traegt der Beleg eine Zahlungsbedingung", () => {
    /* Beide Angaben kamen bisher aus derselben Quelle: fehlte `due_at`,
       verschwanden BT-9 und BT-20 gemeinsam, und der Validator wies die
       Rechnung ab. */
    const e = baue({ invoice: { due_at: null } });
    assert.equal(e.ok, true, JSON.stringify(e.fehlend || []));
    assert.match(e.xml, /Zahlbar sofort nach Erhalt ohne Abzug/,
      "ohne BT-9 muss BT-20 stehen, sonst greift BR-CO-25");
  });

  it("es wird KEINE Frist erfunden", () => {
    /* Ein ausgedachtes "14 Tage" waere eine Vertragsaussage auf einem
       Steuerbeleg. Ohne Vereinbarung gilt der gesetzliche Normalfall
       (§ 271 BGB, sofort faellig) — das ist keine Erfindung, sondern die
       Rechtslage. */
    const e = baue({ invoice: { due_at: null } });
    assert.ok(!/\d+\s*Tage/.test(e.xml), "im Beleg steht eine ausgedachte Zahlungsfrist");
    assert.ok(!/DueDateDateTime/.test(e.xml), "ohne Vereinbarung darf kein Faelligkeitsdatum erscheinen");
  });

  it("mit Faelligkeitsdatum steht dieses im Text — in deutscher Schreibweise", () => {
    const e = baue({});
    assert.match(e.xml, /Zahlbar ohne Abzug bis 03\.09\.2026\./,
      "BT-20 liest ein Mensch; ein ISO-Datum im Fliesstext gehoert dort nicht hin");
    assert.ok(e.xml.includes("20260903"), "das maschinenlesbare BT-9 bleibt im Normformat");
  });

  it("bei Zahlbetrag 0 entsteht keine Zahlungsbedingung", () => {
    /* BR-CO-25 greift nur bei positivem Zahlbetrag. Eine Nullrechnung braucht
       keinen Zahlungshinweis, und einer waere sinnlos. */
    const e = baue({
      invoice: { due_at: null, total_cents: 0, amount_cents: 0, gross_amount_cents: 0, tax_amount_cents: 0, tax_rate_pct: 0 },
    });
    if (e.ok) {
      assert.ok(!/Zahlbar sofort/.test(e.xml), "eine Nullrechnung braucht keinen Zahlungshinweis");
    }
  });
});

describe("Defekt 3 — USt-IdNr. ohne Laenderkennzeichen (BR-CO-09)", () => {
  it("eine Kennung ohne Praefix wird gemeldet, nicht ergaenzt", () => {
    /* "DE" davorzusetzen haette nahegelegen. Aber im Feld steht
       erfahrungsgemaess auch mal eine STEUERNUMMER — daraus eine USt-IdNr. zu
       bauen schriebe eine Kennung auf den Beleg, die es nicht gibt, und
       niemand wuerde es merken, weil das Ergebnis richtig aussieht. */
    const e = baue({ verkaeufer: { vat_id: "123456789" } });
    assert.equal(e.ok, false, "eine USt-IdNr. ohne Praefix darf kein XML ergeben");
    assert.equal(e.fehler, "PFLICHTFELDER_FEHLEN");
    const treffer = e.fehlend.find((f) => /Laenderkennzeichen/.test(f.feld));
    assert.ok(treffer, "der Befund fehlt in der Liste");
    assert.equal(treffer.bt, "BT-31");
    assert.match(treffer.hinweis, /Steuernummer/,
      "die Meldung muss den haeufigsten Grund nennen: die Steuernummer im falschen Feld");
  });

  it("gilt fuer BEIDE Seiten — auch den Empfaenger (BT-48)", () => {
    const e = baue({ kaeufer: { vat_id: "987654321" } });
    assert.equal(e.ok, false);
    const treffer = e.fehlend.find((f) => /Laenderkennzeichen/.test(f.feld));
    assert.ok(treffer);
    assert.equal(treffer.bt, "BT-48");
  });

  it("die normativen Ausnahmen sind in der Meldung genannt", () => {
    /* Griechenland fuehrt EL statt GR, Nordirland XI. Wer das nicht weiss,
       haelt eine gueltige Kennung fuer falsch. */
    const e = baue({ verkaeufer: { vat_id: "123456789" } });
    const treffer = e.fehlend.find((f) => /Laenderkennzeichen/.test(f.feld));
    assert.match(treffer.hinweis, /EL/);
    assert.match(treffer.hinweis, /XI/);
  });

  it("eine Kennung MIT Praefix geht durch — auch die Ausnahmen", () => {
    for (const kennung of ["DE123456789", "ATU12345678", "EL123456789", "XI123456789"]) {
      const e = baue({ verkaeufer: { vat_id: kennung } });
      assert.equal(e.ok, true, `${kennung} wurde faelschlich abgewiesen: ${JSON.stringify(e.fehlend || [])}`);
    }
  });

  it("wer gar keine USt-IdNr. fuehrt, wird davon nicht getroffen", () => {
    /* Ein Kleinunternehmer mit Steuernummer soll weiterhin Rechnungen
       schreiben koennen — die Praefixregel gilt nur fuer eine VORHANDENE
       Kennung. */
    const e = baue({ verkaeufer: { vat_id: null, tax_id: "315/5711/0815" } });
    assert.equal(e.ok, true, JSON.stringify(e.fehlend || []));
  });
});

describe("Nebenbefund — die Steuernummer gehoert dem Verkaeufer", () => {
  it("die Steuernummer des EMPFAENGERS steht nicht im Beleg", () => {
    /* BT-32 ist in EN 16931 ein reiner Verkaeufer-Begriff; die Kaeuferpartei
       kennt nur BT-48. Der Zweig war rollenblind und schrieb sie trotzdem —
       ein Element, das die Norm dort nicht kennt. */
    for (const format of ["zugferd", "xrechnung"]) {
      const e = baue({ format, kaeufer: { vat_id: null, tax_id: "315/5711/0815" } });
      assert.equal(e.ok, true, JSON.stringify(e.fehlend || []));
      assert.ok(!e.xml.includes("315/5711/0815"),
        `${format}: die Steuernummer des Empfaengers steht im Beleg`);
    }
  });

  it("die des Verkaeufers dagegen schon", () => {
    for (const format of ["zugferd", "xrechnung"]) {
      const e = baue({ format, verkaeufer: { vat_id: null, tax_id: "111/2222/3333" } });
      assert.equal(e.ok, true, JSON.stringify(e.fehlend || []));
      assert.ok(e.xml.includes("111/2222/3333"),
        `${format}: die Steuernummer des Ausstellers fehlt`);
    }
  });
});
