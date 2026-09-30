#!/usr/bin/env node
/**
 * Der Nachweis: ist der erzeugte Beleg wirklich PDF/A?
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WARUM DAS NICHT IN DER NORMALEN SUITE LAEUFT
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Es gibt keinen brauchbaren PDF/A-Validator als npm-Paket — die Treffer dort
 * sind Cloud-Dienste oder reine Betrachter. veraPDF ist das Referenzwerkzeug
 * der PDF Association und laeuft hier als Docker-Abbild. Das braucht Docker
 * und beim ersten Mal Netz; in jedem Testlauf waere es eine Zumutung.
 *
 * Deshalb: `npm run test:pdfa`. Der Strukturtest (test/pdfaHuelle.test.js)
 * laeuft dagegen immer mit und faengt die haeufigen Fehler in Sekunden. Beides
 * zusammen, nicht eines statt des anderen — der Strukturtest ist schnelles
 * Feedback, dieser hier ist der Nachweis.
 *
 * Nach JEDER Aenderung an der PDF-Huelle gehoert dieser Lauf wiederholt.
 * Ohne ihn ist "PDF/A" eine Behauptung.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DREI DINGE, DIE HIER NICHT OFFENSICHTLICH SIND
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   1. NICHT auf den Exitcode verlassen. Die veraPDF-CLI dokumentiert ihn
 *      nicht verlaesslich; ein nicht-konformes Dokument kann mit 0 enden.
 *      Massgeblich ist `compliant` im JSON-Bericht.
 *   2. `validationResult` ist ein ARRAY, kein Objekt. Wer es als Objekt liest,
 *      bekommt `undefined` und daraus "nicht konform" — genau dieser Irrtum
 *      hat beim Bau der Welle einmal einen gruenen Lauf als rot ausgewiesen.
 *   3. Unter Git Bash wandelt MSYS den Container-Pfad `/data/...` in einen
 *      Windows-Pfad um, und veraPDF sucht dann eine Datei, die es nicht gibt.
 *      `MSYS_NO_PATHCONV=1` unterbindet das.
 *
 * Aufruf:
 *   node scripts/verapdf.mjs            beide Stufen (3b und 3u)
 *   node scripts/verapdf.mjs 3b         nur eine Stufe
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { erzeugeOperativesRechnungsPdf } from "../services/operationalInvoicePdfService.js";
import { erzeugeERechnung } from "../services/eRechnungService.js";

/* Ein Beleg mit allem, was in der Praxis Aerger macht: Umlaute, ein
   kaufmaennisches Und im Firmennamen (zerlegt ein schlecht maskiertes XMP),
   polnische und tschechische Zeichen, ein Euro-Zeichen, ein Gedankenstrich. */
const VERKAEUFER = {
  id: "v1", name: "Müller Zeitarbeit", legal_name: "Müller & Söhne Zeitarbeit GmbH",
  billing_street: "Große Straße 12", billing_postal_code: "44135", billing_city: "Dortmund",
  billing_country_code: "DE", vat_id: "DE123456789", tax_id: "315/5711/0815",
  iban: "DE02120300000000202051", bic: "BYLADEM1001",
  commercial_register: "HRB 12345 Dortmund", billing_email: "rechnung@mueller-zeitarbeit.de",
};
const KAEUFER = {
  id: "k1", name: "Beispiel Logistik", legal_name: "Beispiel Logistik AG",
  billing_street: "Hafenstraße 3", billing_postal_code: "20457", billing_city: "Hamburg",
  billing_country_code: "DE", vat_id: "DE987654321",
};
/* Genug Positionen fuer einen Seitenumbruch: die zweite Seite ist der Ort, an
   dem ein Fehler im Seitenaufbau sichtbar wird. */
const POSITIONEN = Array.from({ length: 40 }, (_, i) => ({
  worker_name: i % 3 === 0 ? "Anna Świątek" : i % 3 === 1 ? "Jiří Novák – Nachtschicht" : "Björn Öztürk",
  week_start: "2026-08-03", week_end: "2026-08-09",
  quantity: 40, unit_amount_cents: 4800, total_cents: 192000,
}));

/* Die Summen AUS den Positionen rechnen, nicht danebenschreiben.
 *
 * Von Hand gesetzte Betraege waren beim ersten Lauf dieses Skripts prompt
 * falsch — die E-Rechnung prueft BR-CO-10, BR-13 und BR-CO-15 und wies das
 * Fixture zurueck, bevor veraPDF ueberhaupt an die Reihe kam. Das war die
 * Pruefung, die ihre Arbeit tat; hier ist die Konsequenz daraus.
 *
 * Feldbedeutung laut Migration 170: `gross_amount_cents` ist die Positionssumme
 * VOR Rabatt (BT-106), `amount_cents` das Netto NACH Rabatt (BT-109). Ohne
 * Rabatt sind beide gleich. */
const POSITIONSSUMME = POSITIONEN.reduce((s, p) => s + p.total_cents, 0);
const STEUERSATZ = 19;
const STEUER = Math.round((POSITIONSSUMME * STEUERSATZ) / 100);

const RECHNUNG = {
  id: "r1", invoice_number: "2026-0042", status: "issued",
  issued_at: "2026-08-20T10:00:00.000Z", due_at: "2026-09-03T10:00:00.000Z",
  gross_amount_cents: POSITIONSSUMME,
  amount_cents: POSITIONSSUMME,
  net_amount_cents: POSITIONSSUMME,
  tax_amount_cents: STEUER,
  /* BT-112/BT-115: `total_cents` fuehrt den Brutto- und Zahlbetrag. Nicht
     dasselbe wie `gross_amount_cents` — das ist die Positionssumme VOR
     Rabatt. Zwei Felder mit "gross" im Namen, zwei verschiedene Betraege. */
  total_cents: POSITIONSSUMME + STEUER,
  tax_rate_pct: STEUERSATZ,
  period_start: "2026-08-01", period_end: "2026-08-31",
};

const STUFEN = process.argv.slice(2).filter((a) => /^3[abu]$/.test(a));
const zuPruefen = STUFEN.length ? STUFEN : ["3b", "3u"];

const arbeit = fs.mkdtempSync(path.join(os.tmpdir(), "verapdf-"));
let exitcode = 0;

try {
  const eRech = erzeugeERechnung({
    format: "zugferd", invoice: RECHNUNG, items: POSITIONEN,
    verkaeufer: VERKAEUFER, kaeufer: KAEUFER,
  });
  if (!eRech.ok) {
    console.error("[verapdf] Das Fixture erzeugt keine gueltige E-Rechnung:", JSON.stringify(eRech));
    process.exit(1);
  }

  const beleg = await erzeugeOperativesRechnungsPdf({
    invoice: RECHNUNG, items: POSITIONEN,
    verkaeufer: VERKAEUFER, kaeufer: KAEUFER, xmlAnhang: eRech.xml,
  });
  if (!beleg.ok) {
    console.error("[verapdf] Das Fixture erzeugt kein PDF:", JSON.stringify(beleg));
    process.exit(1);
  }

  const datei = path.join(arbeit, "beleg.pdf");
  fs.writeFileSync(datei, Buffer.from(beleg.pdf));
  console.log(`[verapdf] Beleg erzeugt: ${beleg.pdf.length} Bytes, ${POSITIONEN.length} Positionen, deklariert als PDF/A-${beleg.pdfa}`);

  for (const stufe of zuPruefen) {
    const lauf = spawnSync(
      "docker",
      ["run", "--rm", "-v", `${arbeit}:/data`, "verapdf/cli", "--format", "json", "--flavour", stufe, "/data/beleg.pdf"],
      { encoding: "utf8", env: { ...process.env, MSYS_NO_PATHCONV: "1" }, maxBuffer: 64 * 1024 * 1024 },
    );

    if (lauf.error) {
      console.error(`[verapdf] Docker liess sich nicht starten: ${lauf.error.message}`);
      console.error("[verapdf] Ohne Docker gibt es keinen Nachweis — der Strukturtest allein genuegt nicht.");
      process.exit(1);
    }

    let bericht;
    try {
      bericht = JSON.parse(lauf.stdout);
    } catch {
      console.error(`[verapdf] Der Bericht liess sich nicht lesen. Ausgabe:\n${(lauf.stdout || lauf.stderr || "").slice(0, 800)}`);
      process.exit(1);
    }

    /* `validationResult` ist ein Array. Als Objekt gelesen ergaebe es
       undefined — und daraus faelschlich "nicht konform". */
    const job = bericht?.report?.jobs?.[0];
    const ergebnis = Array.isArray(job?.validationResult) ? job.validationResult[0] : job?.validationResult;
    if (!ergebnis) {
      console.error(`[verapdf] Kein Pruefergebnis im Bericht fuer ${stufe}.`);
      exitcode = 1;
      continue;
    }

    const d = ergebnis.details || {};
    const konform = ergebnis.compliant === true;
    console.log(
      `[verapdf] ${ergebnis.profileName}: ${konform ? "KONFORM" : "NICHT KONFORM"} ` +
      `(${d.passedRules ?? "?"} Regeln, ${d.passedChecks ?? "?"} Pruefungen, ${d.failedChecks ?? "?"} Fehler)`,
    );

    if (!konform) {
      exitcode = 1;
      const verletzt = (d.ruleSummaries || []).filter((r) => r.ruleStatus !== "PASSED");
      for (const r of verletzt.slice(0, 15)) {
        console.error(`  VERSTOSS ${r.specification || ""} ${r.clause}-${r.testNumber} (${r.failedChecks}x)`);
        console.error(`    ${(r.description || "").slice(0, 200)}`);
        for (const c of (r.checks || []).slice(0, 2)) {
          if (c.context) console.error(`    bei: ${c.context}`);
        }
      }
      if (verletzt.length > 15) console.error(`  … und ${verletzt.length - 15} weitere`);
    }
  }
} finally {
  /* Aufraeumen auch nach einem Fehler: sonst sammeln sich Belege im
     Temp-Verzeichnis, und in einem davon steht eine Bankverbindung. */
  try { fs.rmSync(arbeit, { recursive: true, force: true }); } catch { /* egal */ }
}

if (exitcode === 0) {
  console.log("[verapdf] Nachweis erbracht. Diesen Lauf nach jeder Aenderung an der PDF-Huelle wiederholen.");
}
process.exit(exitcode);
