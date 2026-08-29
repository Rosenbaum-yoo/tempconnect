/**
 * Was ein gruener Lauf NICHT bewiesen hat — der Zaehler dahinter.
 *
 * Die Datei prueft eine Zahl, auf die sich jemand verlassen soll: "18 Tests
 * mangels Datenbank uebersprungen". Ist sie zu niedrig, wiegt sie in
 * Sicherheit; ist sie zu hoch, ruft sie Alarm ohne Anlass. Beide Richtungen
 * stehen hier.
 *
 * Run: node --test --test-force-exit test/uebersprungen.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { neuerSkipZaehler, formuliereSkips } from "../scripts/lib/uebersprungen.mjs";

/** Baut Ausgabe im Format des spec-Reporters. */
function ausgabe(...zeilen) {
  return zeilen.join("\n") + "\n";
}

/** Das fuehrende Zeichen ist U+FE63, nicht der gewoehnliche Bindestrich. */
const S = "﹣";

function zaehle(text) {
  const z = neuerSkipZaehler();
  z.aufnehmen(text);
  z.abschliessen();
  return z.beurteilen();
}

describe("neuerSkipZaehler — zaehlen, was ausgelassen wurde", () => {
  it("findet uebersprungene Tests und ihren Grund", () => {
    const b = zaehle(ausgabe(
      `${S} Retention — DB-Smoke (0.3ms) # SKIP`,
      `${S} Feed · Teil B (2.6ms) # Keine Datenbank konfiguriert`,
      `✔ ein bestandener Test (1.0ms)`,
    ));
    assert.equal(b.gesamt, 2, "ein bestandener Test darf nicht mitzaehlen");
  });

  it("erkennt die Datenbank am GRUND", () => {
    const b = zaehle(ausgabe(`${S} irgendein Test (1ms) # Keine Datenbank konfiguriert`));
    assert.equal(b.datenbankSkips, 1);
  });

  it("erkennt die Datenbank auch am NAMEN, wenn der Grund schweigt", () => {
    /* Der Fall aus dem echten Lauf: 28 von 40 Skips meldeten nur `# SKIP`.
       Nach dem Grund allein waeren sie alle als harmlos durchgegangen. */
    const b = zaehle(ausgabe(`${S} AUEG · Datenanbindung — echte Datenbank (0.2ms) # SKIP`));
    assert.equal(b.datenbankSkips, 1, "der Name war die einzige Spur — sie darf nicht verloren gehen");
  });

  it("zaehlt je Test, nicht je Grund-Gruppe", () => {
    /* Der teuerste Fehler, den dieses Modul machen koennte: unter "ohne
       angegebenen Grund" liegen viele verschiedene Tests. Haengt die
       Datenbank-Eigenschaft an der Gruppe, faerbt ein einziger Datenbanktest
       alle anderen mit ein — aus einer Luecke von 1 wuerde eine von 5. */
    const b = zaehle(ausgabe(
      `${S} echte Datenbank hier (1ms) # SKIP`,
      `${S} etwas voellig anderes (1ms) # SKIP`,
      `${S} noch etwas anderes (1ms) # SKIP`,
      `${S} und noch etwas (1ms) # SKIP`,
      `${S} und noch etwas mehr (1ms) # SKIP`,
    ));
    assert.equal(b.gesamt, 5);
    assert.equal(b.datenbankSkips, 1, "nur EIN Test war datenbankgebunden");
  });

  it("fuehrt '# SKIP' als fehlenden Grund, nicht als Grund", () => {
    const b = zaehle(ausgabe(`${S} irgendwas (1ms) # SKIP`));
    assert.equal(b.nachGrund[0].grund, "ohne angegebenen Grund",
      "'SKIP' als Grund auszuweisen sieht erklaert aus und ist es nicht");
  });

  it("merkt sich Namen, damit die Zahl handhabbar wird", () => {
    const b = zaehle(ausgabe(
      `${S} erster Test (1ms) # SKIP`,
      `${S} zweiter Test (1ms) # SKIP`,
      `${S} dritter Test (1ms) # SKIP`,
      `${S} vierter Test (1ms) # SKIP`,
    ));
    assert.equal(b.nachGrund[0].namen.length, 3, "drei Beispiele reichen, mehr waere Rauschen");
    assert.ok(b.nachGrund[0].namen.includes("erster Test"));
  });

  it("ueberlebt Zeilen, die ueber Chunk-Grenzen zerfallen", () => {
    /* Der Laeufer schiebt rund 2500 Chunks durch. Faellt eine Grenze mitten in
       eine Zeile, muss der Rest zusammengesetzt werden — sonst zaehlt der
       Melder je nach Puffergroesse etwas anderes. */
    const z = neuerSkipZaehler();
    z.aufnehmen(`${S} Feed · Teil B (2.6ms) # Keine Da`);
    z.aufnehmen("tenbank konfiguriert\n");
    z.abschliessen();
    const b = z.beurteilen();
    assert.equal(b.gesamt, 1);
    assert.equal(b.datenbankSkips, 1);
  });

  it("kommt mit eingefaerbter Ausgabe zurecht", () => {
    const esc = String.fromCharCode(27);
    const b = zaehle(`${esc}[90m${S} Test (1ms) # Keine Datenbank konfiguriert${esc}[39m\n`);
    assert.equal(b.datenbankSkips, 1, "Farbcodes duerfen kein Muster zerstoeren");
  });

  it("zaehlt einen Lauf ohne Skips als null", () => {
    const b = zaehle(ausgabe("✔ alles gut (1ms)", "ℹ pass 10259"));
    assert.equal(b.gesamt, 0);
    assert.equal(b.datenbankSkips, 0);
  });
});

describe("formuliereSkips — die Nachricht", () => {
  const mitDb = zaehle(ausgabe(`${S} Feed · Teil B (2ms) # Keine Datenbank konfiguriert`));
  const ohneDb = zaehle(ausgabe(`${S} nur lokal vorhanden (1ms) # per .gitignore nicht im Repo`));

  it("schweigt, wenn es nichts zu melden gibt", () => {
    assert.equal(formuliereSkips(zaehle("✔ ok (1ms)\n"), { datenbankGesetzt: true }), "");
  });

  it("schweigt bei harmlosen Skips, wenn die Datenbank da war", () => {
    /* Sonst waere die Meldung Dauerrauschen — und eine Warnung, die immer da
       ist, liest nach zwei Tagen niemand mehr. */
    assert.equal(formuliereSkips(ohneDb, { datenbankGesetzt: true }), "");
  });

  it("meldet fehlende Datenbanktests deutlich", () => {
    const t = formuliereSkips(mitDb, { datenbankGesetzt: false });
    assert.match(t, /BEWEIST WENIGER/);
    assert.match(t, /DATABASE_URL/, "ohne den Befehl weiss niemand, was zu tun ist");
  });

  it("nennt den Weg NICHT, wenn die Datenbank ohnehin gesetzt war", () => {
    const t = formuliereSkips(mitDb, { datenbankGesetzt: true });
    assert.match(t, /BEWEIST WENIGER/, "die Luecke bleibt eine Luecke");
    assert.ok(!/DATABASE_URL=/.test(t),
      "der Rat 'setze DATABASE_URL' waere hier falsch — sie war gesetzt");
  });

  it("sagt bei --verlange-datenbank, dass der Lauf rot ist", () => {
    const t = formuliereSkips(mitDb, { datenbankGesetzt: false, verlangt: true });
    assert.match(t, /gilt damit als ROT/);
  });

  it("enthaelt keine Steuerzeichen", () => {
    const t = formuliereSkips(mitDb, { datenbankGesetzt: false });
    const steuerzeichen = new RegExp(
      "[" + String.fromCharCode(0) + "-" + String.fromCharCode(8) +
      String.fromCharCode(11) + String.fromCharCode(12) +
      String.fromCharCode(14) + "-" + String.fromCharCode(31) + "]",
    );
    assert.ok(!steuerzeichen.test(t));
  });
});
