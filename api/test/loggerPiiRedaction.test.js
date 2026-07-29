/**
 * Logger-Redaktion — personenbezogene Daten gehoeren nicht ins Log
 * (Audit-Backlog S-2, Owner-Freigabe 2026-07-26).
 *
 * Zwei Ebenen, absichtlich beide:
 *   1. **Sicherheitsnetz:** `config/index.js` redigiert `email` auf jeder Ebene. Wer die
 *      Regel kuenftig uebersieht, erzeugt `[REDACTED]` statt einer Adresse.
 *   2. **Quelle:** kein Aufrufer gibt ueberhaupt eine Adresse mit. Ein Netz, auf das man
 *      sich verlaesst, wird zum Ruhekissen — deshalb prueft der zweite Teil den Bestand.
 *
 * Der Bestandstest laeuft ueber die Quelldateien statt ueber einen Laufzeit-Logger:
 * Redaktion greift erst beim Serialisieren, ein `logger.warn({ email })` waere also
 * technisch "gruen" und trotzdem falsch. Geprueft wird die Absicht, nicht nur die Wirkung.
 *
 * Run: node --test --test-force-exit test/loggerPiiRedaction.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(__dirname, "..");

/** Alle .js-Dateien unterhalb der genannten Ordner. */
function collect(dirs) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith(".js")) out.push(full);
    }
  };
  for (const d of dirs) walk(path.join(API_ROOT, d));
  return out;
}

describe("Logger-Redaktion — Sicherheitsnetz", () => {
  const config = fs.readFileSync(path.join(API_ROOT, "config", "index.js"), "utf8");

  it("redigiert E-Mail-Adressen", () => {
    assert.match(config, /"\*\.email"/, "'*.email' fehlt in redact.paths");
    assert.match(config, /^\s*"email",/m, "'email' (oberste Ebene) fehlt in redact.paths");
  });

  it("laesst die bestehenden Zugangsdaten-Regeln unangetastet", () => {
    for (const p of ['"*.password"', '"*.token"', '"*.secret"', '"*.apiKey"',
                     '"req.headers.authorization"', '"req.headers.cookie"']) {
      assert.ok(config.includes(p), `Bestehende Redaktionsregel verschwunden: ${p}`);
    }
  });
});

describe("Logger-Redaktion — an der Quelle", () => {
  // Ein Logaufruf, der ein Feld `email` mitgibt. Bewusst eng gefasst: nur der
  // Objekt-Parameter direkt hinter `logger.<level>(`.
  const LOG_WITH_EMAIL = /logger\.(?:info|warn|error|debug|trace|fatal)\(\s*\{[^}]*\bemail\s*:/;

  it("kein Aufrufer gibt eine E-Mail-Adresse an den Logger", () => {
    const offenders = [];
    for (const file of collect(["routes", "services", "middleware", "jobs"])) {
      const text = fs.readFileSync(file, "utf8");
      text.split("\n").forEach((line, i) => {
        if (LOG_WITH_EMAIL.test(line)) {
          offenders.push(`${path.relative(API_ROOT, file).split(path.sep).join("/")}:${i + 1}`);
        }
      });
    }
    assert.deepEqual(
      offenders, [],
      "Diese Logaufrufe geben eine E-Mail-Adresse mit. Stattdessen eine unbedenkliche " +
      "Kennung mitgeben (z. B. `invite_id`, `user_id`) — die ist zum Nachverfolgen ohnehin " +
      `besser:\n  ${offenders.join("\n  ")}`
    );
  });
});
