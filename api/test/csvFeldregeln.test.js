/**
 * P10 Spur D / Welle D4 — der Import versteht, was gemeint ist.
 *
 * DER DEFEKT
 * Ein Export aus einer Zeitarbeitsfirma liefert deutsche Schreibweisen. Das
 * Schema verlangte ISO: Geburtsdatum "12.03.1988" -> abgelehnt. Land
 * "Deutschland" -> abgelehnt. Personalnummer als Excel-Zahl -> abgelehnt, weil
 * `z.string()` keine Zahl ist. Kein einziger dieser Werte ist mehrdeutig. Der
 * Kunde bekam trotzdem eine Fehlerzeile und musste seine Datei umbauen.
 *
 * DIE GEGENREGEL, DIE HIER MITGEPRUEFT WIRD
 * Toleranz darf nicht in Raterei umschlagen. Was NICHT zweifelsfrei ist, wird
 * weiterhin abgelehnt (zweistelliges Jahr, unbekanntes Land) — und jede
 * Umwandlung, die den Wert veraendert, erscheint im Bericht. Eine stille
 * Korrektur waere schlimmer als eine Ablehnung: niemand soll raten muessen,
 * was mit seinen Daten passiert ist.
 *
 * Run: node --test --test-force-exit test/csvFeldregeln.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* Pfade IMMER relativ zur Testdatei — sonst haengt das Ergebnis am
   Startverzeichnis und der Test ueberspringt sich je nach cwd lautlos. */
const __dirname = path.dirname(fileURLToPath(import.meta.url));

import {
  normalisiereDatum, normalisiereLand, normalisiereEmail,
  normalisierePlz, normalisiereZeile, pruefeZeilen
} from "../routes/workers.js";

/** Kurzform: eine Zeile durch die echte Pruefkette schicken. */
const pruefe = (zeile) => pruefeZeilen([{ _row: 2, ...zeile }]);
const basis = { email: "a@b.de", first_name: "Anna", last_name: "Beck" };

describe("P10/D4 · Geburtsdatum", () => {
  it("wandelt TT.MM.JJJJ nach ISO", () => {
    assert.equal(normalisiereDatum("12.03.1988").wert, "1988-03-12");
    assert.equal(normalisiereDatum("1.3.1988").wert, "1988-03-01", "einstellige Tage/Monate auffuellen");
    assert.equal(normalisiereDatum("12/03/1988").wert, "1988-03-12");
    assert.equal(normalisiereDatum("12-03-1988").wert, "1988-03-12");
  });

  it("laesst ISO unveraendert und meldet dafuer nichts", () => {
    const r = normalisiereDatum("1988-03-12");
    assert.equal(r.wert, "1988-03-12");
    assert.equal(r.hinweis, null, "was schon richtig war, ist keine Meldung wert");
  });

  it("raet NICHT bei zweistelligem Jahr", () => {
    // "12.03.88" — 1988 oder 2088? Bei Geburtsdaten ist das kein Detail.
    const r = pruefe({ ...basis, date_of_birth: "12.03.88" });
    assert.equal(r.gueltig.length, 0, "mehrdeutig heisst ablehnen, nicht annehmen");
    assert.equal(r.fehler[0].field, "date_of_birth");
  });

  it("meldet jede Umwandlung mit alter und neuer Form", () => {
    const r = pruefe({ ...basis, date_of_birth: "12.03.1988" });
    assert.equal(r.gueltig.length, 1);
    assert.equal(r.gueltig[0].date_of_birth, "1988-03-12");
    assert.equal(r.hinweise.length, 1);
    assert.equal(r.hinweise[0].row, 2, "der Hinweis muss auf die echte CSV-Zeile zeigen");
    assert.match(r.hinweise[0].message, /12\.03\.1988/);
    assert.match(r.hinweise[0].message, /1988-03-12/);
  });
});

describe("P10/D4 · Land", () => {
  it("uebersetzt Klartext nach ISO-2", () => {
    assert.equal(normalisiereLand("Deutschland").wert, "DE");
    assert.equal(normalisiereLand("österreich").wert, "AT");
    assert.equal(normalisiereLand("Schweiz").wert, "CH");
    assert.equal(normalisiereLand("Poland").wert, "PL", "englische Schreibweise kommt auch vor");
  });

  it("nimmt ISO-2 in jeder Schreibweise", () => {
    assert.equal(normalisiereLand("de").wert, "DE");
    assert.equal(normalisiereLand(" AT ").wert, "AT");
  });

  it("erfindet kein Land, das es nicht kennt", () => {
    const r = pruefe({ ...basis, country: "Absurdistan" });
    assert.equal(r.gueltig.length, 0, "lieber eine ehrliche Ablehnung als ein falsches Land");
    assert.equal(r.fehler[0].field, "country");
  });
});

describe("P10/D4 · E-Mail", () => {
  it("nimmt Rand-Leerzeichen und Grossschreibung hin", () => {
    const r = pruefe({ ...basis, email: "  Anna.Beck@Firma.DE " });
    assert.equal(r.gueltig.length, 1);
    assert.equal(r.gueltig[0].email, "anna.beck@firma.de");
    assert.equal(r.hinweise.length, 0, "reine Kosmetik ueberflutet sonst den Bericht");
  });

  it("holt die Adresse aus dem Anzeigenamen", () => {
    // Outlook-Exporte schreiben "Anna Beck <anna@firma.de>" in eine Zelle.
    const r = pruefe({ ...basis, email: "Anna Beck <anna@firma.de>" });
    assert.equal(r.gueltig.length, 1, "der Wert ist eindeutig, nur verpackt");
    assert.equal(r.gueltig[0].email, "anna@firma.de");
    assert.equal(r.hinweise.length, 1, "das ist ein echter Umbau — er gehoert in den Bericht");
  });

  it("entfernt mailto:", () => {
    assert.equal(normalisiereEmail("mailto:anna@firma.de").wert, "anna@firma.de");
  });

  it("macht aus Unsinn keine gueltige Adresse", () => {
    const r = pruefe({ ...basis, email: "anna(at)firma.de" });
    assert.equal(r.gueltig.length, 0, "das @ bleibt Pflicht");
    assert.equal(r.fehler[0].field, "email");
  });
});

describe("P10/D4 · Postleitzahl", () => {
  it("repariert die von Excel verschluckte fuehrende Null", () => {
    // 01067 Dresden wird als Zahl gespeichert und kommt als 1067 zurueck.
    const r = pruefe({ ...basis, country: "Deutschland", postal_code: "1067" });
    assert.equal(r.gueltig[0].postal_code, "01067");
    assert.ok(r.hinweise.some((h) => /fuehrende Null/.test(h.message)),
      "eine stille Korrektur der Adresse waere nicht hinnehmbar");
  });

  it("fasst vierstellige PLZ ausserhalb Deutschlands nicht an", () => {
    // 1010 Wien und 8001 Zuerich sind vollstaendig — eine Null davor waere falsch.
    assert.equal(normalisierePlz("1010", "AT").wert, "1010");
    assert.equal(normalisierePlz("8001", "CH").wert, "8001");
    assert.equal(normalisierePlz("1067", null).wert, "1067", "ohne bekanntes Land wird nicht geraten");
  });

  it("laesst fuenfstellige PLZ in Ruhe", () => {
    const r = normalisierePlz("01067", "DE");
    assert.equal(r.wert, "01067");
    assert.equal(r.hinweis, null);
  });
});

describe("P10/D4 · Grundreinigung aus der Tabellenkalkulation", () => {
  it("nimmt Zahlen an, wo Text erwartet wird", () => {
    // Excel macht aus einer Personalnummer eine Zahl. Der Wert ist einwandfrei.
    const r = pruefe({ ...basis, personnel_number: 4711, phone: 4930123456 });
    assert.equal(r.gueltig.length, 1, "z.string() lehnte die Zahl ab, obwohl nichts fehlte");
    assert.equal(r.gueltig[0].personnel_number, "4711");
    assert.equal(r.gueltig[0].phone, "4930123456");
  });

  it("behandelt eine Zelle mit Leerzeichen als leer", () => {
    const r = pruefe({ ...basis, city: "   ", notes: "" });
    assert.equal(r.gueltig.length, 1);
    assert.equal(r.gueltig[0].city, null, "sonst steht spaeter ein Leerzeichen als Wohnort in der Akte");
  });

  it("schneidet Rand-Leerzeichen aus Namen", () => {
    const r = pruefe({ ...basis, first_name: " Anna ", last_name: "Beck  " });
    assert.equal(r.gueltig[0].first_name, "Anna");
    assert.equal(r.gueltig[0].last_name, "Beck");
  });

  it("laesst einen leeren Namen weiterhin scheitern", () => {
    const r = pruefe({ ...basis, first_name: "   " });
    assert.equal(r.gueltig.length, 0, "trimmen darf keine Pflichtpruefung aushebeln");
    assert.equal(r.fehler[0].field, "first_name");
  });

  it("veraendert die uebergebene Zeile nicht", () => {
    const roh = { ...basis, country: "Deutschland" };
    normalisiereZeile(roh);
    assert.equal(roh.country, "Deutschland", "der Aufrufer haelt sein Original in der Hand");
  });
});

describe("P10/D4 · Zusammenspiel", () => {
  it("traegt jede Umwandlung mit ihrer echten Zeilennummer aus", () => {
    const r = pruefeZeilen([
      { _row: 4, ...basis, email: "a@b.de", date_of_birth: "01.02.1990" },
      { _row: 9, ...basis, email: "c@d.de", country: "Schweiz" }
    ]);
    assert.equal(r.gueltig.length, 2);
    assert.deepEqual(r.hinweise.map((h) => h.row), [4, 9],
      "Hinweise ohne richtige Zeile sind wertlos");
  });

  it("mischt Umwandlung und Ablehnung in einer Datei", () => {
    const r = pruefeZeilen([
      { _row: 2, ...basis, country: "Deutschland" },
      { _row: 3, ...basis, email: "kaputt" },
      { _row: 4, ...basis, date_of_birth: "05.05.1975" }
    ]);
    assert.equal(r.gueltig.length, 2, "eine schlechte Zeile stoppt die guten nicht");
    assert.equal(r.fehler.length, 1);
    assert.equal(r.fehler[0].row, 3);
    assert.equal(r.hinweise.length, 2);
  });

  it("Schema und Datenmodell bleiben im Gleichschritt", () => {
    /*
     * VORHER stand hier: "E-Mail bleibt Pflicht, solange das Datenmodell sie
     * verlangt" — mit der ausdruecklichen Ansage, der Test werde rot, "sobald
     * jemand das Schema oeffnet, OHNE die Datenbank mitzuziehen. Genau dann muss
     * man hinschauen."
     *
     * Am 2026-09-03 ist er rot geworden, und beim Hinschauen war es umgekehrt:
     * die Datenbank war ZUERST dran. `Migration 175` hebt
     * `worker_profiles.user_id NOT NULL` auf, und `bulkImportWorkers` setzt die
     * Regel seit Welle D5 um ("kein E-Mail-Zwang mehr, aber auch kein Datensatz
     * ohne Identitaet"). Nur `importItemSchema` war stehen geblieben — mit einer
     * Begruendung, die genau dieses NOT NULL zitierte.
     *
     * Der Stolperdraht bleibt, er zeigt nur nicht mehr auf eine Momentaufnahme:
     * geprueft wird jetzt die BEZIEHUNG zwischen Migration und Schema. Faellt
     * eines von beiden zurueck, faellt dieser Test — in beide Richtungen.
     */
    const mig = [process.cwd(), path.resolve(__dirname, "..", "..")]
      .map((w) => path.join(w, "sql/migrations/175_mitarbeiter_ohne_konto.sql"))
      .find((p) => fs.existsSync(p));
    assert.ok(mig, "Migration 175 nicht gefunden — der Vergleich liefe ins Leere");
    const kontoOptional = /ALTER TABLE worker_profiles ALTER COLUMN user_id DROP NOT NULL/
      .test(fs.readFileSync(mig, "utf8"));
    assert.ok(kontoOptional,
      "Migration 175 haelt das Konto nicht mehr offen — dann gehoert die "
      + "E-Mail-Pflicht ins Schema zurueck");

    const r = pruefe({ first_name: "Anna", last_name: "Beck", personnel_number: "P-1" });
    assert.equal(r.gueltig.length, 1,
      `das Datenmodell laesst den Menschen ohne Konto zu, das Schema nicht: `
      + JSON.stringify(r.fehler));
    assert.equal(r.fehler.length, 0);
  });

  it("eine kaputte Adresse bleibt ein Fehler — das Tor ist offen, nicht weg", () => {
    /* Die Gegenprobe zur Oeffnung: `optional()` darf nicht heissen "beliebig". */
    const r = pruefe({ first_name: "Anna", last_name: "Beck",
      personnel_number: "P-1", email: "keine-adresse" });
    assert.equal(r.gueltig.length, 0);
    assert.equal(r.fehler[0].field, "email");
  });
});
