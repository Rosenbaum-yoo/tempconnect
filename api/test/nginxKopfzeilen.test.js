/**
 * Kopfzeilen-Waechter fuer nginx — Befund N-1.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WAS PASSIERT IST
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `nginx/nginx.conf` schrieb die Content-Security-Policy ueber elf Zeilen —
 * lesbar, ordentlich eingerueckt, und falsch. nginx gibt den Wert VERBATIM aus.
 * Was ueber die Leitung ging, war eine GEFALTETE Kopfzeile (obs-fold):
 *
 *     Content-Security-Policy: \n        default-src 'self';\n        …
 *
 * RFC 7230 §3.2.4 hat diese Faltung abgeschafft: Sender duerfen sie nicht
 * erzeugen, Empfaenger MUESSEN die Nachricht ablehnen.
 *
 * Gemessen: Nodes Standard-HTTP-Parser bricht mit "Parse Error: Invalid header
 * value char" ab — er kann damit KEINE EINZIGE Antwort dieses Servers lesen.
 * Browser und curl sind nachsichtig und verdecken es vollstaendig. Aufgefallen
 * ist es erst, als ein Node-Prozess die API sprechen sollte.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM EIN TEST UND KEIN KOMMENTAR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Der Fehler sieht wie guter Stil aus. Wer die CSP das naechste Mal erweitert,
 * bricht sie mit hoher Wahrscheinlichkeit wieder um — und merkt nichts, weil
 * der Browser weiterlaeuft. Ein Kommentar an der Stelle haette genau so lange
 * gehalten wie die Aufmerksamkeit des naechsten Lesers.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const WURZEL = path.resolve(import.meta.dirname ?? ".", "..", "..");
const KONFIG = path.join(WURZEL, "nginx", "nginx.conf");

describe("N-1 · nginx sendet keine gefalteten Kopfzeilen", () => {
  const vorhanden = fs.existsSync(KONFIG);

  it("die Konfiguration ist auffindbar", () => {
    /* Kein stiller Skip: laege die Datei woanders, pruefte dieser Test nichts
       und niemand wuesste es. */
    assert.ok(vorhanden, `nginx/nginx.conf nicht gefunden unter ${KONFIG}`);
  });

  it("kein `add_header` erstreckt sich ueber mehrere Zeilen", { skip: !vorhanden && "keine Konfiguration" }, () => {
    const text = fs.readFileSync(KONFIG, "utf8");
    const zeilen = text.split(/\r?\n/);
    const gefunden = [];

    zeilen.forEach((zeile, i) => {
      const roh = zeile.trim();
      if (!roh.startsWith("add_header")) return;
      // Eine vollstaendige Anweisung endet auf dem Semikolon. Fehlt es, laeuft
      // der Wert in die naechste Zeile — und damit in die Faltung.
      if (!roh.endsWith(";")) {
        gefunden.push(`nginx.conf:${i + 1}  ${roh.slice(0, 70)}…`);
      }
    });

    assert.deepStrictEqual(
      gefunden, [],
      "Diese add_header-Anweisungen laufen ueber mehrere Zeilen. nginx gibt den " +
      "Wert VERBATIM aus — daraus wird eine gefaltete Kopfzeile (obs-fold), die " +
      "RFC 7230 abgeschafft hat. Strenge Clients (u. a. Nodes Standard-Parser) " +
      "lehnen dann JEDE Antwort dieses Servers ab; Browser verdecken es. " +
      "Den Wert in EINE Zeile schreiben."
    );
  });

  it("die Content-Security-Policy steht vollstaendig in einer Zeile", { skip: !vorhanden && "keine Konfiguration" }, () => {
    /* Die CSP ist der laengste Wert und deshalb der wahrscheinlichste
       Rueckfall. Sie bekommt eine eigene Zusicherung, damit die Meldung beim
       naechsten Mal sofort auf die richtige Stelle zeigt. */
    const text = fs.readFileSync(KONFIG, "utf8");
    const zeile = text.split(/\r?\n/).find((z) => z.trim().startsWith("add_header Content-Security-Policy"));
    assert.ok(zeile, "kein add_header fuer die Content-Security-Policy gefunden");
    assert.ok(
      zeile.trim().endsWith("always;") || zeile.trim().endsWith(";"),
      "Die CSP-Anweisung endet nicht in derselben Zeile — der Wert ist gefaltet."
    );
    assert.ok(
      /default-src/.test(zeile) && /form-action/.test(zeile),
      "Die CSP-Zeile enthaelt nicht mehr die ganze Richtlinie — vermutlich wieder umgebrochen."
    );
  });
});
