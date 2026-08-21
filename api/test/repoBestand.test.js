/**
 * Selbstprobe fuer `test/helpers/repoBestand.js` (P2-W1).
 *
 * WARUM DIESER TEST EXISTIERT
 * Der Helfer entscheidet, wann ein fehlender Pfad ein BEFUND ist und wann er nur
 * NICHT PRUEFBAR ist. Das ist eine Ausnahme-Entscheidung, und Ausnahmen sind die
 * Stelle, an der Waechter still stumpf werden. Wer eine Zeile von einer
 * Ausnahmeliste streicht, muss zurueckmutieren koennen — hier ist die
 * Ausnahme keine Liste, sondern eine Regel, also wird die Regel selbst geprueft:
 * an echten Pfaden dieses Repos, mit echtem git, in beide Richtungen.
 *
 * DIE FALLE, DIE HIER FESTGENAGELT WIRD
 * Der naheliegende Weg, ein VERZEICHNIS auf "ignoriert?" zu pruefen, ist ein
 * abschliessender Schraegstrich (`.agents/`). Er ist falsch: der Schraegstrich
 * hebelt den Index-Abgleich von `git check-ignore` aus, und git meldet daraufhin
 * fuer JEDEN Pfad einen Treffer — auf eine LEERE Zeile der `.gitignore`.
 * `docs/README.md/` gilt damit als ignoriert, obwohl die Datei getrackt ist.
 * Ein Waechter, der so sondiert, entschuldigt am Ende alles.
 *
 * Deshalb sondiert `nichtImRepo` ueber einen KINDPFAD und nur fuer Pfade ohne
 * getrackten Inhalt. Der Test unten laesst sich nicht gruen halten, wenn jemand
 * das spaeter "vereinfacht".
 *
 * Run: node --test --test-force-exit test/repoBestand.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getrackteDateien,
  ignoriertePfade,
  nichtImRepo,
  bestandMitVerzeichnissen,
} from "./helpers/repoBestand.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

describe("repoBestand — der Helfer, der Befund von Nicht-Pruefbar trennt", () => {
  const getrackt = getrackteDateien(REPO_ROOT);

  it("liest einen echten Index — sonst prueft alles Folgende nichts", () => {
    assert.ok(getrackt.length > 500, `nur ${getrackt.length} getrackte Dateien in ${REPO_ROOT}`);
    assert.ok(getrackt.includes("docs/README.md"), "docs/README.md fehlt im Index");
    assert.ok(getrackt.every((p) => !p.includes("\\")), "Pfade muessen posix-normalisiert sein");
  });

  it("ignoriertePfade trifft ignorierte Dateien und laesst getrackte in Ruhe", () => {
    const treffer = ignoriertePfade(REPO_ROOT, [
      ".agents/skills/tempconnect-project/SKILL.md",   // .gitignore: .agents/
      "docs/launch/A_FIRMENDATEN-SLOTS.md",            // .gitignore: docs/launch/*
      "docs/README.md",                                // getrackt
      "api/app.js",                                    // getrackt
      "docs/launch/G_DEMO-CLOUDFLARE-TUNNEL.md",       // getrackt trotz docs/launch/*
    ]);
    assert.deepEqual(
      [...treffer].sort(),
      [".agents/skills/tempconnect-project/SKILL.md", "docs/launch/A_FIRMENDATEN-SLOTS.md"],
      "Die Trennung ignoriert/getrackt stimmt nicht mehr"
    );
  });

  it("eine GETRACKTE Datei gilt nie als ignoriert — auch wenn eine Regel auf sie passt", () => {
    /*
     * Das ist die Zusicherung, die verhindert, dass jemand einen Befund
     * loswird, indem er den Pfad in `.gitignore` eintraegt.
     * `docs/launch/G_DEMO-CLOUDFLARE-TUNNEL.md` passt auf `docs/launch/*` und
     * ist trotzdem versioniert (ueber eine `!`-Ausnahme). Faellt diese Datei
     * weg, muss der Waechter rot werden, nicht schweigen.
     */
    const kandidat = "docs/launch/G_DEMO-CLOUDFLARE-TUNNEL.md";
    assert.ok(getrackt.includes(kandidat), `${kandidat} ist nicht mehr getrackt — Test anpassen`);
    assert.equal(ignoriertePfade(REPO_ROOT, [kandidat]).size, 0);
    assert.equal(nichtImRepo(REPO_ROOT, [kandidat], getrackt).size, 0);
  });

  it("nichtImRepo erkennt ignorierte VERZEICHNISSE, die es hier gar nicht gibt", () => {
    /*
     * Der eigentliche Zweck: im Worktree existieren `.agents/` und
     * `frontend/support-ops/` nicht. Ein Waechter muss trotzdem beantworten
     * koennen, dass ihr Fehlen kein Befund ist.
     */
    const treffer = nichtImRepo(REPO_ROOT, [".agents", "frontend/support-ops"], getrackt);
    assert.deepEqual([...treffer].sort(), [".agents", "frontend/support-ops"]);
  });

  it("nichtImRepo entschuldigt NICHT, was einfach fehlt — der Waechter beisst weiter", () => {
    /* Rueckmutation: erfundene Pfade duerfen nicht durchrutschen, sonst waere
     * die Ausnahme eine Hintertuer statt einer Unterscheidung. */
    const erfunden = [
      "docs/gibt-es-nicht",
      "docs/gibt-es-nicht/datei.md",
      "api/routes/erfunden.js",
      "frontend/public/gibt-es-nicht.html",
      "sql/migrations/999_erfunden.sql",
    ];
    assert.deepEqual([...nichtImRepo(REPO_ROOT, erfunden, getrackt)], []);
  });

  it("ein Verzeichnis MIT getracktem Inhalt gilt nie als 'nicht im Repo'", () => {
    /* Die Sperre gegen die Kindpfad-Sonde: `docs/security` enthaelt versionierte
     * Dateien, sein Fehlen waere also ein echter Befund. */
    assert.deepEqual([...nichtImRepo(REPO_ROOT, ["docs", "docs/security", "api/routes"], getrackt)], []);
  });

  it("bestandMitVerzeichnissen loest Dateien UND ihre Vorfahren auf", () => {
    const bestand = bestandMitVerzeichnissen(getrackt);
    assert.ok(bestand.has("docs/readme.md"), "Datei fehlt");
    assert.ok(bestand.has("docs/security"), "Vorfahren-Verzeichnis fehlt");
    assert.ok(bestand.has("api/routes"), "Vorfahren-Verzeichnis fehlt");
    assert.ok(!bestand.has(".agents"), "ignoriertes Verzeichnis darf nicht im Bestand sein");
    assert.ok(!bestand.has("docs/launch/a_firmendaten-slots.md"), "ignorierte Datei darf nicht im Bestand sein");
  });

  it("bricht laut ab, statt sich still zu ueberspringen, wenn die Wurzel keine ist", () => {
    /* CLAUDE.md §0.9: ein Waechter, der sich selbst ueberspringt, ist schlimmer
     * als keiner — die Suite sieht trotzdem gruen aus. */
    assert.throws(
      () => getrackteDateien(path.join(REPO_ROOT, "docs")),
      /nicht die Repo-Wurzel|keine Repo-Wurzel|fehlgeschlagen/,
      "Ein Aufruf ausserhalb einer Repo-Wurzel muss werfen"
    );
  });
});
