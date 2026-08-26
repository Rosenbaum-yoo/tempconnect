import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

/*
 * DAS GATE MUSS DURCHFALLEN KOENNEN.
 *
 * BEFUND 2026-08-26: Es konnte es nicht mehr. Beim Entfernen der
 * Stundenzettel-Vorlagen blieb in `test/security/coreFlowCrossTenant.test.js`
 * ein Import auf den geloeschten Dienst stehen. Die Datei liess sich nicht mehr
 * laden — der volle Lauf druckte einen lauten UNCAUGHT-EXCEPTION-Kasten und
 * meldete trotzdem:
 *
 *     9828 Tests, 0 Fehlschlaege, Rueckgabewert 0
 *
 * 55 echte Sicherheits-Zusicherungen waren aus dem Lauf verschwunden, ohne dass
 * eine Zahl es verraten haette.
 *
 * URSACHE: `scripts/unhandled-rejection-probe.mjs` — eine Diagnose-Sonde aus
 * Audit-Backlog B-2, die `run-tests.js` STANDARDMAESSIG anhaengt. Sie
 * registriert einen `uncaughtException`-Handler, der nur druckt. Einen solchen
 * Handler zu registrieren ERSETZT Nodes Standardverhalten (drucken UND mit 1
 * beenden). Die Sonde, die Fehler sichtbar machen sollte, hat sie unsichtbar
 * gemacht.
 *
 * Diese Datei haelt die Eigenschaft fest, die dabei verloren ging: eine
 * unbehandelte Ausnahme in einem Testprozess MUSS zu einem Rueckgabewert
 * ungleich 0 fuehren — mit Sonde wie ohne.
 */

const HIER = fileURLToPath(new URL(".", import.meta.url));
const SONDE = new URL("../scripts/unhandled-rejection-probe.mjs", import.meta.url);
const LAEUFER = new URL("../scripts/run-tests.js", import.meta.url);

const sondeDa = fs.existsSync(fileURLToPath(SONDE));
const laeuferDa = fs.existsSync(fileURLToPath(LAEUFER));

/** Startet Node mit einem Skript, das sofort wirft, und liefert den Rueckgabewert. */
function wirftUndBeendet({ mitSonde }) {
  const argv = [];
  if (mitSonde) argv.push("--import", pathToFileURL(fileURLToPath(SONDE)).href);
  argv.push("-e", "throw new Error('absichtlich');");
  const r = spawnSync(process.execPath, argv, { cwd: HIER, encoding: "utf8" });
  return r.status;
}

describe("Das Gate kann durchfallen — auch mit angehaengter Diagnose-Sonde", () => {
  it("die Sonde ist ueberhaupt da (sonst prueft diese Datei nichts)", { skip: !sondeDa && "Sonde fehlt" }, () => {
    const quelle = fs.readFileSync(fileURLToPath(SONDE), "utf8");
    assert.match(quelle, /process\.on\("uncaughtException"/,
      "der Handler wurde umbenannt oder entfernt — dann pruefen die Zusicherungen darunter das Falsche");
  });

  it("OHNE Sonde beendet eine unbehandelte Ausnahme den Prozess mit Fehler", () => {
    /* Nodes Standardverhalten. Die Vergleichsgroesse: was die Sonde NICHT
     * kaputtmachen darf. Faellt diese Probe, hat sich Node geaendert und die
     * Probe darunter misst etwas anderes, als sie glaubt. */
    assert.notEqual(wirftUndBeendet({ mitSonde: false }), 0);
  });

  it("MIT Sonde ebenfalls — die Diagnose darf den Befund nicht schlucken",
    { skip: !sondeDa && "Sonde fehlt" }, () => {
      const code = wirftUndBeendet({ mitSonde: true });
      assert.notEqual(code, 0,
        "Die Sonde registriert einen uncaughtException-Handler und ersetzt damit Nodes " +
        "Standardverhalten. Ohne ein eigenes `process.exitCode = 1` endet der Prozess mit 0 — " +
        "und eine Testdatei, die sich nicht laden laesst, faellt lautlos aus dem Gate: " +
        "null Tests, null Fehlschlaege, gruen.");
    });

  it("der Laeufer haengt die Sonde standardmaessig an — darum zaehlt das oben",
    { skip: !laeuferDa && "Laeufer fehlt" }, () => {
      /* Waere die Sonde ein Sonderfall, den nur jemand von Hand einschaltet,
       * waere der Befund halb so schwer. Sie ist der Normalfall: abschaltbar
       * ueber TC_TEST_PROBE=0, sonst immer dabei. */
      const quelle = fs.readFileSync(fileURLToPath(LAEUFER), "utf8");
      assert.match(quelle, /TC_TEST_PROBE\s*!==\s*"0"/,
        "der Laeufer haengt die Sonde nicht mehr per Vorgabe an — Begruendung dieser Datei pruefen");
      assert.match(quelle, /--import \$\{probeUrl\}|--import \$\{probeUrl\}/,
        "der Anhaenge-Weg hat sich geaendert");
    });
});
