#!/usr/bin/env node
/**
 * Der Nachweis fuer den INHALT: erfuellt das Rechnungs-XML die
 * Geschaeftsregeln der EN 16931?
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DIE ANDERE HAELFTE DES BEWEISES
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `npm run test:pdfa` prueft die HUELLE — ist das Dokument PDF/A-3u, steckt
 * das XML richtig darin? Es sagt nichts darueber, ob der INHALT eine gueltige
 * Rechnung ist. Das prueft nur ein Schematron-Lauf gegen das offizielle
 * CEN-Regelwerk: rund 800 Regeln (BR-*, BR-CO-*, BR-S-*, BR-AE-*), dazu die
 * XSD-Pruefung, die die Element-Reihenfolge erzwingt.
 *
 * Ein handgebauter Wohlgeformtheitspruefer kann das strukturell nicht: er
 * zaehlt Tags, aber er kennt die Norm nicht.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WAS DIESER LAUF AM 2026-08-29 GEFUNDEN HAT
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Beim ersten Einsatz sofort einen Produktionsdefekt, den kein bestehender
 * Test sehen konnte: die XRechnung trug die Kennung
 * `urn:xoev-de:kosit:standard:xrechnung_3.0` — den alten Namensraum aus der
 * 2.x-Zeit mit der neuen Versionsnummer. Diese Kombination gibt es nicht. Der
 * Validator meldete `noScenarioMatched`: es wurde KEINE einzige
 * Geschaeftsregel geprueft, und ein Empfaenger haette das Dokument nicht als
 * XRechnung erkannt.
 *
 * Danach blieben genau zwei Fehler (BR-DE-5, BR-DE-6): Kontaktstelle und
 * Telefonnummer der Rechnungsstelle. Die Kontaktspalte gab es laengst, die
 * Telefonspalte kam mit Migration 205 dazu.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WARUM NICHT AUF DEN EXITCODE GEGATET WIRD
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Die KoSIT-Berichtslogik setzt einen Pruefschritt schon bei einer WARNUNG auf
 * `valid="false"`, und das CII-Regelwerk fuehrt mehr Warn- als Fatal-Regeln.
 * Ein Gate am Exitcode waere bei einwandfreien Rechnungen rot — und ein Gate,
 * das immer rot ist, schaut nach zwei Wochen niemand mehr an. Massgeblich ist
 * deshalb `level="error"` im Bericht. Warnungen werden gezaehlt und genannt,
 * faerben das Gate aber nicht.
 *
 * Genau dieselbe Ueberlegung wie bei veraPDF, wo `compliant` zaehlt und nicht
 * der Rueckgabewert.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DIE GEGENPROBE
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Ein Gate, das immer gruen meldet, ist von einem kaputten Gate nicht zu
 * unterscheiden. Deshalb faehrt jeder Lauf zusaetzlich ein ABSICHTLICH
 * fehlerhaftes Dokument und besteht darauf, dass der Validator es ablehnt.
 * Meldet er es als konform, stimmt etwas mit dem Pruefstand nicht — und der
 * Lauf schlaegt fehl, obwohl die echten Rechnungen sauber waren.
 *
 * Das kostet zwei Sekunden und beantwortet die Frage, die sonst niemand
 * stellt: sieht das Ding ueberhaupt etwas?
 *
 * Aufruf:
 *   node scripts/schematron.mjs             beide Formate + Gegenprobe
 *   node scripts/schematron.mjs zugferd     nur CII
 *   node scripts/schematron.mjs xrechnung   nur UBL
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { erzeugeERechnung } from "../services/eRechnungService.js";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ABBILD = "tempconnect/en16931:1.6.3-2026-01-31";

/* Vollstaendige Stammdaten — auch die, die nur XRechnung verlangt.
   Ein Fixture, dem der Rechnungskontakt fehlt, faerbt das Gate rot und sagt
   nichts ueber den Code aus. */
const VERKAEUFER = {
  name: "Müller Zeitarbeit", legal_name: "Müller & Söhne Zeitarbeit GmbH",
  billing_street: "Große Straße 12", billing_postal_code: "44135", billing_city: "Dortmund",
  billing_country_code: "DE", vat_id: "DE123456789",
  iban: "DE02120300000000202051", bic: "BYLADEM1001",
  commercial_register: "HRB 12345 Dortmund",
  billing_email: "rechnung@mueller-zeitarbeit.de",
  billing_contact: "Buchhaltung Frau Schmidt",
  billing_phone: "+49 231 5551234",
};
const KAEUFER = {
  name: "Beispiel Logistik", legal_name: "Beispiel Logistik AG",
  billing_street: "Hafenstraße 3", billing_postal_code: "20457", billing_city: "Hamburg",
  billing_country_code: "DE", vat_id: "DE987654321",
  billing_email: "kreditoren@beispiel-logistik.de",
};
const POSITIONEN = [
  { worker_name: "Anna Świątek", week_start: "2026-08-03", week_end: "2026-08-09",
    quantity: 40, unit_amount_cents: 4800, total_cents: 192000 },
  { worker_name: "Jiří Novák – Nachtschicht", week_start: "2026-08-10", week_end: "2026-08-16",
    quantity: 40, unit_amount_cents: 4800, total_cents: 192000 },
];

/* Summen aus den Positionen rechnen, nicht danebenschreiben: von Hand gesetzte
   Betraege waren beim ersten Bau des veraPDF-Gates prompt falsch. */
const POSITIONSSUMME = POSITIONEN.reduce((s, p) => s + p.total_cents, 0);
const STEUERSATZ = 19;
const STEUER = Math.round((POSITIONSSUMME * STEUERSATZ) / 100);
const RECHNUNG = {
  id: "r1", invoice_number: "2026-0042", status: "issued",
  issued_at: "2026-08-20T10:00:00.000Z", due_at: "2026-09-03T10:00:00.000Z",
  gross_amount_cents: POSITIONSSUMME,   // BT-106, Positionssumme
  amount_cents: POSITIONSSUMME,         // BT-109, Netto
  tax_amount_cents: STEUER,             // BT-110
  total_cents: POSITIONSSUMME + STEUER, // BT-112/BT-115
  tax_rate_pct: STEUERSATZ,
  period_start: "2026-08-01", period_end: "2026-08-31",
};

const FORMATE = { zugferd: "cii", xrechnung: "ubl" };

/**
 * Die Faelle, die dieser Lauf belegt.
 *
 * Der Gutfall allein beweist wenig — er zeigt, dass eine saubere Rechnung
 * durchgeht. Der Wert des Gates liegt in den Faellen daneben: den drei
 * Defekten, die am 2026-08-29 gemessen und behoben wurden, und den
 * Ablehnungen, die der Generator seither ausspricht.
 *
 * Drei Erwartungshaltungen:
 *   (Standard)                der Validator muss das Dokument akzeptieren
 *   mussFehlerHaben           der Validator MUSS etwas finden — sonst ist der
 *                             Pruefstand selbst kaputt
 *   erwarteteAblehnung        es darf gar kein XML entstehen; der Generator
 *                             weigert sich, und genau das ist richtig
 */
const REVERSE_CHARGE_RECHNUNG = {
  ...RECHNUNG,
  /* § 13b UStG: der Empfaenger schuldet die Steuer. Der Beleg fuehrt deshalb
     0 % und 0 Cent, und Brutto = Netto. So MUSS die Zeile stromaufwaerts
     entstehen — der Generator rechnet sie nicht um. */
  tax_rate_pct: 0,
  tax_amount_cents: 0,
  total_cents: POSITIONSSUMME,
};

const FAELLE = [
  {
    name: "regelfall-cii", format: "zugferd",
    zweck: "eine gewoehnliche Rechnung, ZUGFeRD/Factur-X",
  },
  {
    name: "regelfall-ubl", format: "xrechnung",
    zweck: "dieselbe Rechnung als XRechnung, inklusive der deutschen CIUS-Regeln",
  },
  {
    name: "reverse-charge", format: "zugferd",
    invoice: REVERSE_CHARGE_RECHNUNG, optionen: { reverseCharge: true },
    zweck: "§ 13b UStG richtig gebaut: Kategorie AE mit Satz 0 und Steuer 0 (BR-AE-05/09)",
  },
  {
    name: "ohne-faelligkeit", format: "zugferd",
    invoice: { ...RECHNUNG, due_at: null },
    zweck: "ohne Faelligkeitsdatum traegt der Beleg eine Zahlungsbedingung (BR-CO-25)",
  },
  {
    name: "rc-unstimmig", format: "zugferd",
    invoice: RECHNUNG, optionen: { reverseCharge: true },
    erwarteteAblehnung: "REVERSE_CHARGE_UNSTIMMIG",
    zweck: "Reverse Charge auf einer 19-%-Rechnung: der Generator rechnet NICHT um, er lehnt ab",
  },
  {
    name: "ustid-ohne-praefix", format: "zugferd",
    verkaeufer: { ...VERKAEUFER, vat_id: "123456789" },
    erwarteteAblehnung: "PFLICHTFELDER_FEHLEN",
    zweck: "USt-IdNr. ohne Laenderkennzeichen wird gemeldet, nicht stillschweigend ergaenzt (BR-CO-09)",
  },
  {
    name: "gegenprobe", format: "zugferd", verfaelschen: true, mussFehlerHaben: true,
    zweck: "sieht der Pruefstand ueberhaupt etwas?",
  },
];

const gewuenscht = process.argv.slice(2).filter((a) => Object.keys(FORMATE).includes(a));
const zuPruefen = gewuenscht.length ? gewuenscht : Object.keys(FORMATE);

/** Liest ein Feld aus einem Attributstring, ohne XML-Parser. */
function attr(roh, name) {
  const m = new RegExp(`${name}="([^"]*)"`).exec(roh || "");
  return m ? m[1] : null;
}

/**
 * Wertet einen VARL-Bericht aus.
 *
 * Bewusst mit einem Tag-Scanner statt eines XML-Parsers: eine neue
 * Abhaengigkeit fuer drei regulaere Ausdruecke waere nicht zu rechtfertigen,
 * und das Berichtsformat ist flach.
 */
function leseBericht(text) {
  const kopf = /<rep:report([^>]*)>/.exec(text);
  const meldungen = [...text.matchAll(/<rep:message([^>]*)>([\s\S]*?)<\/rep:message>/g)].map((m) => ({
    stufe: attr(m[1], "level") || "unbekannt",
    code: attr(m[1], "code") || "",
    text: m[2].replace(/\s+/g, " ").trim(),
  }));
  const schritte = [...text.matchAll(/<rep:validationStepResult([^>]*)>/g)].map((m) => ({
    id: attr(m[1], "id") || "?",
    gueltig: attr(m[1], "valid") === "true",
  }));
  return {
    berichtGueltig: attr(kopf ? kopf[1] : "", "valid") === "true",
    /* Der teuerste Fehlalarm: trifft das Dokument keine Profil-Kennung, wird
       gar nichts geprueft — und der Bericht sieht aus wie ein Regelverstoss. */
    keinSzenario: text.includes("noScenarioMatched"),
    schritte,
    fehler: meldungen.filter((m) => m.stufe === "error"),
    warnungen: meldungen.filter((m) => m.stufe === "warning"),
  };
}

const arbeit = fs.mkdtempSync(path.join(os.tmpdir(), "schematron-"));
let exitcode = 0;

try {
  /* Das Abbild einmal sicherstellen. `docker build` ist bei unveraendertem
     Dockerfile ein Cache-Treffer und kostet nichts. */
  const bau = spawnSync("docker", ["build", "-q", "-t", ABBILD, path.join(HIER, "schematron")], {
    encoding: "utf8", env: { ...process.env, MSYS_NO_PATHCONV: "1" },
  });
  if (bau.status !== 0) {
    console.error("[schematron] Das Pruefabbild liess sich nicht bauen:");
    console.error((bau.stderr || bau.stdout || "").slice(0, 1200));
    console.error("[schematron] Ohne den Validator gibt es keinen Nachweis fuer den Rechnungsinhalt.");
    process.exit(1);
  }

  const dateien = [];
  for (const fall of FAELLE.filter((f) => zuPruefen.includes(f.format))) {
    const e = erzeugeERechnung({
      format: fall.format,
      invoice: fall.invoice || RECHNUNG,
      items: fall.items || POSITIONEN,
      verkaeufer: fall.verkaeufer || VERKAEUFER,
      kaeufer: fall.kaeufer || KAEUFER,
      optionen: fall.optionen,
    });

    if (fall.erwarteteAblehnung) {
      /* Hier ist die Ablehnung das gewuenschte Ergebnis. Entstuende ein XML,
         waere der Schutz weg — und der Beleg ginge falsch hinaus. */
      if (e.ok) {
        console.error(`[schematron] ${fall.name}: der Generator hat ein XML erzeugt, obwohl er`);
        console.error(`[schematron] ablehnen muesste (${fall.erwarteteAblehnung}). ${fall.zweck}`);
        exitcode = 1;
      } else if (e.fehler !== fall.erwarteteAblehnung) {
        console.error(`[schematron] ${fall.name}: abgelehnt, aber mit "${e.fehler}" statt`);
        console.error(`[schematron] "${fall.erwarteteAblehnung}". Der Grund muss stimmen, nicht nur das Ergebnis.`);
        exitcode = 1;
      } else {
        console.log(`[schematron] ${fall.name}: richtig abgelehnt (${e.fehler}) — ${fall.zweck}`);
      }
      continue;
    }

    if (!e.ok) {
      console.error(`[schematron] ${fall.name}: kein XML — ${e.fehler} ${JSON.stringify(e.fehlend || e.hinweis || "").slice(0, 300)}`);
      exitcode = 1;
      continue;
    }

    /* Die Gegenprobe verfaelscht den Steuerbetrag AM FERTIGEN XML. Ueber den
       Generator ginge es nicht: dessen eigene Betragspruefung faenge es ab —
       hier soll aber der VALIDATOR zeigen, dass er sieht. */
    const inhalt = fall.verfaelschen
      ? e.xml.replace(/(<ram:CalculatedAmount>)[\d.]+(<\/ram:CalculatedAmount>)/, "$199999.99$2")
      : e.xml;

    const name = `${fall.name}.xml`;
    fs.writeFileSync(path.join(arbeit, name), inhalt, "utf8");
    dateien.push({ format: fall.name, name, mussFehlerHaben: fall.mussFehlerHaben, zweck: fall.zweck });
    console.log(`[schematron] ${fall.name}: ${inhalt.length} Zeichen — ${fall.zweck}`);
  }
  if (!dateien.length) process.exit(1);

  const lauf = spawnSync(
    "docker",
    ["run", "--rm", "-v", `${arbeit}:/data`, ABBILD, "-o", "/data", ...dateien.map((d) => `/data/${d.name}`)],
    { encoding: "utf8", env: { ...process.env, MSYS_NO_PATHCONV: "1" }, maxBuffer: 64 * 1024 * 1024 },
  );
  if (lauf.error) {
    console.error(`[schematron] Docker liess sich nicht starten: ${lauf.error.message}`);
    process.exit(1);
  }

  for (const d of dateien) {
    const berichtDatei = path.join(arbeit, d.name.replace(/\.xml$/, "-report.xml"));
    if (!fs.existsSync(berichtDatei)) {
      console.error(`[schematron] ${d.format}: kein Bericht entstanden. Ausgabe:`);
      console.error((lauf.stdout || lauf.stderr || "").slice(0, 800));
      exitcode = 1;
      continue;
    }
    const b = leseBericht(fs.readFileSync(berichtDatei, "utf8"));

    if (b.keinSzenario) {
      /* Eigene Meldung, weil es KEIN Regelverstoss ist: es wurde ueberhaupt
         nichts geprueft. Wer das mit "Fehler gefunden" verwechselt, sucht an
         der falschen Stelle. */
      console.error(`[schematron] ${d.format}: KEIN PRUEFSZENARIO GETROFFEN.`);
      console.error("[schematron] Das heisst NICHT 'keine Fehler' — es heisst, dass keine einzige");
      console.error("[schematron] Regel geprueft wurde. Die Profil-Kennung des Dokuments passt zu");
      console.error("[schematron] keinem bekannten Szenario. Genau dieser Fall lag am 2026-08-29 vor:");
      console.error("[schematron] die XRechnung trug einen Namensraum, den es nicht gibt.");
      exitcode = 1;
      continue;
    }

    const schritte = b.schritte.map((s) => `${s.id}=${s.gueltig ? "ok" : "FEHLER"}`).join(", ");

    if (d.mussFehlerHaben) {
      /* Umgekehrte Erwartung: hier MUSS etwas gefunden werden. */
      if (b.fehler.length) {
        console.log(
          `[schematron] Gegenprobe: der Validator hat den eingebauten Fehler gefunden ` +
          `(${b.fehler.length} Meldung(en), z. B. ${b.fehler[0].code || "ohne Code"}). Der Pruefstand sieht.`,
        );
      } else {
        console.error("[schematron] GEGENPROBE FEHLGESCHLAGEN: ein absichtlich falscher");
        console.error("[schematron] Steuerbetrag wurde NICHT beanstandet. Damit ist auch das");
        console.error("[schematron] gruene Ergebnis der echten Rechnungen wertlos — der Pruefstand");
        console.error("[schematron] prueft offenbar nicht, was er zu pruefen vorgibt.");
        exitcode = 1;
      }
      continue;
    }

    console.log(
      `[schematron] ${d.format}: ${b.fehler.length === 0 ? "KONFORM" : "NICHT KONFORM"} ` +
      `(${b.fehler.length} Fehler, ${b.warnungen.length} Warnungen) [${schritte}]`,
    );

    for (const f of b.fehler.slice(0, 20)) {
      console.error(`  FEHLER ${f.code ? "[" + f.code + "] " : ""}${f.text.slice(0, 220)}`);
    }
    if (b.fehler.length > 20) console.error(`  … und ${b.fehler.length - 20} weitere`);
    /* Warnungen nennen, aber nicht gaten — sonst ist das Gate dauerhaft rot. */
    for (const w of b.warnungen.slice(0, 5)) {
      console.log(`  Hinweis ${w.code ? "[" + w.code + "] " : ""}${w.text.slice(0, 160)}`);
    }
    if (b.warnungen.length > 5) console.log(`  … und ${b.warnungen.length - 5} weitere Hinweise`);

    if (b.fehler.length) exitcode = 1;
  }
} finally {
  /* Aufraeumen auch nach einem Fehler: in den Fixtures stehen Bankverbindungen,
     und sie haben im Temp-Verzeichnis nichts verloren. */
  try { fs.rmSync(arbeit, { recursive: true, force: true }); } catch { /* egal */ }
}

if (exitcode === 0) {
  console.log("[schematron] Nachweis erbracht: der Rechnungsinhalt erfuellt die EN-16931-Geschaeftsregeln.");
  console.log("[schematron] Diesen Lauf nach jeder Aenderung am XML-Aufbau wiederholen.");
}
process.exit(exitcode);
