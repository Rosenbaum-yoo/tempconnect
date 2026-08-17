/**
 * G2b — die Zeitsperre der Selbstmeldung (Owner-Entscheidung G-E6).
 *
 * WAS HIER GEPRUEFT WIRD, UND WARUM OHNE UHR
 * Die Sperre haelt den Weiter-Knopf je Schritt eine Minute zu — drei Minuten bis
 * zur Meldung. Ein Test, der das nachstellt, indem er wartet, ist nach drei
 * Minuten fertig, danach langsam, dann flakig, dann abgeschaltet. Deshalb ist
 * die Regel eine REINE Funktion: die Zeit kommt als Parameter herein.
 *
 * DER FALL, AUF DEN ES ANKOMMT
 * Nicht "der Zaehler laeuft richtig" — das sieht man. Sondern: Was passiert,
 * wenn jemand die Oberflaeche UMGEHT? Ein per JavaScript gesperrter Knopf ist
 * ueber die Entwicklerkonsole in zehn Sekunden frei. Wer direkt abschickt, hat
 * nie einen Vorgang eroeffnet — und genau dieser Fall muss abgewiesen werden,
 * sonst ist die ganze Huerde Zierde.
 *
 * Run: node --test --test-force-exit test/abwesenheitZeitsperre.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  pruefeZeitsperre,
  SPERRE_SEKUNDEN_JE_SCHRITT,
  SPERRE_SCHRITTE,
} from "../services/workerAbsenceService.js";

const MINUTE = 60_000;
const JETZT = 1_800_000_000_000; // fester Zeitpunkt — kein Date.now() im Test
const KONFIG = { sekundenJeSchritt: 60, schritte: 3 };

describe("G2b — die Zeitsperre liegt hinten, nicht im Browser", () => {
  it("wer die Oberflaeche umgeht, hat keinen Vorgang — und wird abgewiesen", () => {
    const r = pruefeZeitsperre(null, JETZT, KONFIG);
    assert.equal(r.erlaubt, false);
    assert.equal(
      r.grund,
      "VORGANG_NICHT_EROEFFNET",
      "Das ist der eigentliche Angriffsfall: direkt abschicken, ohne den Ablauf zu durchlaufen"
    );
    assert.equal(r.status, 428, "428 sagt: es fehlt eine Vorbedingung — nicht 'zu viele Anfragen'");
    assert.equal(r.verbleibendSekunden, 180);
  });

  it("ein gefaelschter Zeitstempel aus der Zukunft hilft nicht", () => {
    const r = pruefeZeitsperre({ begonnenMs: JETZT + 10 * MINUTE }, JETZT, KONFIG);
    assert.equal(
      r.erlaubt,
      false,
      "Eine Uhr, die in der Zukunft startet, ist kein Vorgang, sondern ein Versuch — " +
        "und sie darf nicht als 'laengst abgelaufen' durchgehen"
    );
    assert.equal(r.verbleibendSekunden, 180);
  });

  it("zu frueh: abgewiesen, mit der Restzeit zum Anzeigen", () => {
    const r = pruefeZeitsperre({ begonnenMs: JETZT - MINUTE }, JETZT, KONFIG);
    assert.equal(r.erlaubt, false);
    assert.equal(r.status, 429);
    assert.equal(r.verbleibendSekunden, 120, "Der Browser soll den Zaehler zeigen koennen, nicht raten");
  });

  it("eine Sekunde zu frueh ist zu frueh — die Grenze ist scharf", () => {
    const knapp = pruefeZeitsperre({ begonnenMs: JETZT - (3 * MINUTE - 1000) }, JETZT, KONFIG);
    assert.equal(knapp.erlaubt, false);
    assert.equal(knapp.verbleibendSekunden, 1);

    const genau = pruefeZeitsperre({ begonnenMs: JETZT - 3 * MINUTE }, JETZT, KONFIG);
    assert.equal(genau.erlaubt, true, "Punktgenau muss durchgehen, sonst wartet der Mensch ewig auf eine Rundung");
  });

  it("nach Ablauf: erlaubt", () => {
    const r = pruefeZeitsperre({ begonnenMs: JETZT - 5 * MINUTE }, JETZT, KONFIG);
    assert.deepEqual(r, { erlaubt: true });
  });

  it("ein Vorgang ohne Zeitstempel zaehlt als keiner", () => {
    for (const kaputt of [{}, { begonnenMs: "vorhin" }, { begonnenMs: null }]) {
      const r = pruefeZeitsperre(kaputt, JETZT, KONFIG);
      assert.equal(r.erlaubt, false, `sollte abweisen: ${JSON.stringify(kaputt)}`);
      assert.equal(r.grund, "VORGANG_NICHT_EROEFFNET");
    }
  });

  it("die Dauer ist konfigurierbar — sie ist der erste Stellhebel, kein Codewert", () => {
    const kurz = pruefeZeitsperre({ begonnenMs: JETZT - 10_000 }, JETZT, { sekundenJeSchritt: 5, schritte: 2 });
    assert.equal(kurz.erlaubt, true, "10 Sekunden reichen bei 2x5 Sekunden");

    const lang = pruefeZeitsperre({ begonnenMs: JETZT - 10_000 }, JETZT, { sekundenJeSchritt: 300, schritte: 3 });
    assert.equal(lang.erlaubt, false);
    assert.equal(lang.verbleibendSekunden, 890);
  });

  it("die Vorgabe ist eine Minute je Schritt bei drei Schritten", () => {
    assert.equal(SPERRE_SEKUNDEN_JE_SCHRITT, 60);
    assert.equal(SPERRE_SCHRITTE, 3);
  });
});
