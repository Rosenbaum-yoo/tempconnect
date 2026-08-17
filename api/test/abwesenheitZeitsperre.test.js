/**
 * G2b + G2c — die beiden Huerden der Selbstmeldung, beide SERVERSEITIG:
 * die Zeitsperre (G-E6) und die Mindestbeschreibung (G-E8) — dazu die Grenze,
 * an der die Beschreibung haengenbleibt (G-E7: der Kunde erfaehrt sie nie).
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
  pruefeBeschreibung,
  fuerKunde,
  BESCHREIBUNG_FRAGEN,
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

/* ═══════════════════════════════════════════════════════════════════════════
 *  G2c — die Mindestbeschreibung (G-E8) und die Grenze zum Kunden (G-E7)
 * ═══════════════════════════════════════════════════════════════════════════ */


const VOLLSTAENDIG = {
  seit_wann: "Seit heute Nacht gegen drei Uhr, mit Fieber und starken Gliederschmerzen",
  voraussichtlich_bis: "Voraussichtlich bis Freitag, danach melde ich mich wieder",
  arzt: "War heute Morgen beim Hausarzt, Krankschreibung kommt per Post",
  eingeschraenkt_einsetzbar: "Diese Woche gar nicht, ab Montag vermutlich wieder voll",
};

describe("G2c — die Beschreibung, die das Buero lesen soll", () => {
  it("vier ausgefuellte Antworten ergeben zusammen genug", () => {
    const r = pruefeBeschreibung(VOLLSTAENDIG);
    assert.equal(r.ausreichend, true);
    assert.ok(r.woerter >= 30, `nur ${r.woerter} Woerter`);
  });

  it("der zusammengesetzte Text traegt die FRAGEN mit — er wird am Stueck gelesen", () => {
    const r = pruefeBeschreibung(VOLLSTAENDIG);
    for (const { frage } of BESCHREIBUNG_FRAGEN) {
      assert.ok(r.text.includes(frage), `Frage fehlt im Text: ${frage}`);
    }
  });

  it("die Fragen zaehlen NICHT zur Laenge — sonst waeren leere Antworten fast genug", () => {
    const leer = pruefeBeschreibung({ seit_wann: "gestern" });
    assert.equal(leer.ausreichend, false);
    assert.equal(
      leer.woerter,
      1,
      "Gezaehlt wird die Antwort, nicht die Frage. Sonst haette der Ablauf sich selbst erfuellt"
    );
  });

  it("zu kurz: abgewiesen, und es steht da, wie viel fehlt", () => {
    const r = pruefeBeschreibung({ seit_wann: "heute frueh", arzt: "nein" });
    assert.equal(r.ausreichend, false);
    assert.equal(r.error, "BESCHREIBUNG_ZU_KURZ");
    assert.equal(r.woerter, 3);
    assert.equal(r.fehlend, 27, "Eine Ablehnung ohne Zahl laesst den Menschen raten");
  });

  it("Satzzeichen sind keine Woerter", () => {
    const r = pruefeBeschreibung({ freitext: ". . . - - - ! ? ... ;;; ,,, ... . . . . . . . . . . . . . . ." });
    assert.equal(r.ausreichend, false);
    assert.equal(r.woerter, 0, "Sonst genuegte eine Reihe Punkte, und die Huerde waere ein Witz");
  });

  it("ein reiner Freitext geht auch — die Fragen sind ein Weg, keine Fessel", () => {
    const r = pruefeBeschreibung({
      freitext:
        "Ich bin heute Nacht mit hohem Fieber aufgewacht und konnte nicht mehr aufstehen. " +
        "Der Hausarzt hat mich krankgeschrieben, voraussichtlich bis zum Ende der Woche. " +
        "Ich melde mich, sobald es mir besser geht und ich wieder einsatzfaehig bin.",
    });
    assert.equal(r.ausreichend, true);
  });

  it("die Mindestzahl ist konfigurierbar", () => {
    const r = pruefeBeschreibung({ seit_wann: "heute" }, { mindestwoerter: 1 });
    assert.equal(r.ausreichend, true);
  });
});

describe("G-E7 — was der Kunde erfaehrt, und was nicht", () => {
  const meldung = {
    id: "abs-1",
    von: "2026-10-01",
    bis: "2026-10-03",
    zustand: "wirksam",
    aufgehoben_am: null,
    art: "krank",
    notiz: "Grippe",
    beschreibung: "Seit heute Nacht Fieber, Hausarzt hat krankgeschrieben.",
    quelle: "mitarbeiter",
  };

  it("der Kunde sieht den Ausfall und den Zeitraum", () => {
    const k = fuerKunde(meldung);
    assert.equal(k.faellt_aus, true);
    assert.equal(k.von, "2026-10-01");
    assert.equal(k.bis, "2026-10-03");
  });

  it("der Kunde sieht WEDER Art NOCH Notiz NOCH Beschreibung", () => {
    const k = fuerKunde(meldung);
    const verraten = ["art", "notiz", "beschreibung", "quelle"].filter((f) => f in k);
    assert.deepEqual(
      verraten,
      [],
      "'krank' ist ein Gesundheitsdatum nach Art. 9 DSGVO. Das Einsatzunternehmen ist ein " +
        "Dritter — fuer seine Planung genuegt, DASS jemand ausfaellt und bis wann"
    );
  });

  it("kein Feld der Meldung rutscht ungeprueft durch — die Abbildung ist eine Positivliste", () => {
    const k = fuerKunde({ ...meldung, geheim: "etwas Neues, das jemand spaeter ergaenzt" });
    assert.equal(
      "geheim" in k,
      false,
      "Wer ein Feld ergaenzt, darf es nicht versehentlich an den Kunden schicken. " +
        "Deshalb baut fuerKunde() ein neues Objekt, statt Felder zu entfernen"
    );
  });

  it("eine zurueckgenommene Meldung faellt nicht mehr aus", () => {
    assert.equal(fuerKunde({ ...meldung, aufgehoben_am: new Date().toISOString() }).faellt_aus, false);
    assert.equal(fuerKunde({ ...meldung, zustand: "beantragt" }).faellt_aus, false,
      "Eine erst beantragte Meldung darf beim Kunden keinen Ausfall ausloesen");
  });
});
