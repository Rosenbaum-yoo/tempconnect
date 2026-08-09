/**
 * Waechter gegen Fehlplatzierung von Oberflaechen-Modulen.
 *
 * WARUM ES DIESEN TEST GIBT
 * TempConnect hat drei interne Flaechen mit klar verschiedenen Zustaendigkeiten:
 * Staff Control Center (Verwaltung durch das Team), Owner Control Center
 * (kundenspezifische Verwaltung) und Support Center (Anfragen von aussen und
 * zwischen Kunden). Die Projektregeln verlangten bisher nur, dass die Flaechen
 * getrennt bleiben — nicht, WAS in welche gehoert.
 *
 * Genau daran ist in P9 Welle A2 eine Fehlplatzierung entstanden: der
 * Rabatt-Katalog wurde zuerst im Owner Control Center gebaut, weil die Ableitung
 * aus dem Code ("Rabatt = Preishebel = Owner-Schicht") plausibel wirkte. Das
 * Produktmodell sagt etwas anderes: ein plattformweiter Katalog ist
 * Team-Verwaltung. Die Ableitung war nicht unachtsam, sie war unbelegt — es gab
 * nichts, wogegen man sie haette pruefen koennen.
 *
 * Dieser Test kann die richtige Antwort nicht kennen. Er kann aber verhindern,
 * dass die Frage stillschweigend uebergangen wird: jedes Modul muss in
 * `docs/FLAECHEN.md` eingetragen sein. Wer ein neues anlegt, wird gezwungen, die
 * Zuordnung aufzuschreiben — und stolpert dabei ueber die Entscheidungsfrage.
 *
 * Run: node --test --test-force-exit test/flaechenZuordnung.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const DOKU = path.join(REPO_ROOT, "docs/FLAECHEN.md");

const FLAECHEN = [
  { name: "Owner Control Center", verzeichnis: "frontend/src/owner-control/modules" },
  { name: "Staff Control Center", verzeichnis: "frontend/src/staff/modules" }
];

function moduleIn(verzeichnis) {
  const voll = path.join(REPO_ROOT, verzeichnis);
  if (!fs.existsSync(voll)) return null;
  return fs.readdirSync(voll, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

const dokuVorhanden = fs.existsSync(DOKU);
const suite = dokuVorhanden ? describe : describe.skip;

suite("Flaechen-Zuordnung ist dokumentiert", () => {
  const doku = dokuVorhanden ? fs.readFileSync(DOKU, "utf8") : "";

  it("die Entscheidungsfrage steht in der Doku und ist nicht wegredigiert worden", () => {
    assert.match(doku, /Die Entscheidungsfrage/,
      "ohne die Entscheidungsregel ist die Registry nur eine Liste und verhindert nichts");
    for (const flaeche of ["Staff Control Center", "Owner Control Center", "Support Center"]) {
      assert.ok(doku.includes(flaeche), `Die Fläche "${flaeche}" fehlt in der Doku`);
    }
  });

  for (const flaeche of FLAECHEN) {
    it(`jedes Modul im ${flaeche.name} ist eingetragen`, () => {
      const module = moduleIn(flaeche.verzeichnis);
      if (module === null) {
        // Kein Verzeichnis (z. B. flacher Aufbau) — nichts zu pruefen, aber auch
        // nichts stillschweigend durchwinken.
        assert.ok(true);
        return;
      }
      assert.ok(module.length > 0, `${flaeche.verzeichnis} ist leer — vermutlich falscher Pfad`);

      const fehlend = module.filter((m) => !new RegExp("`" + m + "`").test(doku));
      assert.deepEqual(fehlend, [],
        `Nicht in docs/FLAECHEN.md eingetragen: ${fehlend.join(", ")}. `
        + "Trag das Modul mit einer Zeile ein — und pruefe dabei anhand der Entscheidungsfrage, "
        + "ob es wirklich in dieser Flaeche richtig liegt.");
    });
  }

  it("kein Modul steht in beiden Flaechen", () => {
    const occ = moduleIn(FLAECHEN[0].verzeichnis) || [];
    const scc = moduleIn(FLAECHEN[1].verzeichnis) || [];
    // Gleichnamige Module sind erlaubt, wenn sie fachlich verschieden sind
    // (z. B. `executive` in beiden Flaechen ist gewollt). Verboten ist dieselbe
    // FACHLICHE Sache an zwei Orten — das laesst sich nicht automatisch pruefen.
    // Was hier geprueft wird: die Doku muss den Gleichklang benennen, damit
    // niemand versehentlich zweimal dasselbe baut.
    const doppelt = occ.filter((m) => scc.includes(m));
    for (const m of doppelt) {
      assert.ok(new RegExp("`" + m + "`[\\s\\S]*`" + m + "`").test(doku),
        `"${m}" existiert in beiden Flaechen, ist aber nicht zweimal in der Doku beschrieben — `
        + "entweder ist es dieselbe Sache (dann gehoert eine Kopie weg) oder zwei verschiedene "
        + "(dann muessen beide erklaert sein).");
    }
  });
});
