/**
 * Doku-Konsistenz — CLAUDE.md §0.12 ("Dokumentation muss jederzeit einer echten,
 * zeitgenauen Pruefung standhalten, automatisiert wo moeglich").
 *
 * Prueft zwei Dinge:
 *
 *   1. TOTE LINKS — strikt, ohne Ausnahmeliste.
 *      Jeder relative Markdown-Link muss auf etwas zeigen, das im Repo liegt.
 *      Der Bestand war bei Einfuehrung sauber (2 Treffer, beide sofort behoben:
 *      `docs/README.md` verlinkte `api/docs/…` statt `../api/docs/…`). Wo nichts
 *      aufzuraeumen ist, braucht es keine Allowlist — jeder neue tote Link ist rot.
 *
 *   2. VERWAISTE DOKUMENTE — Ratsche gegen eine Bestandsliste.
 *      Eine Datei unter `docs/`, auf die keine andere Markdown-Datei verweist,
 *      findet niemand mehr; sie veraltet unbemerkt und widerspricht spaeter dem,
 *      was gilt. 177 davon gab es bei Einfuehrung — die auf einen Schlag zu
 *      verlinken waere Beschaeftigung, kein Nutzen. Deshalb eine Ratsche:
 *        - NEUE Verwaiste  -> rot (die Zahl darf nicht wachsen)
 *        - Verwaiste, die inzwischen verlinkt sind -> rot mit der Aufforderung,
 *          sie aus der Bestandsliste zu streichen (sonst verrottet die Liste und
 *          die Ratsche zieht nie an)
 *      Die Liste kann damit nur kleiner werden.
 *
 * Bestandsliste: `docs/.docs-consistency-baseline.json`
 *
 * ── 2026-08-21, P2-W1: geprueft wird der INDEX, nicht der Dateibaum ──────────
 * Dieser Waechter las frueher das Verzeichnis. Damit hing sein Urteil daran, an
 * welchem Arbeitsplatz er lief: der Haupt-Checkout traegt git-ignorierte Dateien
 * (`.agents/`, `docs/launch/*`), ein Worktree und ein frischer Klon tragen sie
 * nicht. Ergebnis: im Worktree dauerhaft rot, ohne dass irgendetwas kaputt war.
 *
 * Der Fehler war nicht die Ratsche, sondern die Eingangsmenge. Er wirkte in
 * beide Richtungen — die ignorierte `docs/launch/C_HETZNER-DEPLOY-RUNBOOK.md`
 * hat im Haupt-Checkout vier echte Dokumente als "verlinkt" erscheinen lassen,
 * die im Repo selbst in keinem Index standen, darunter
 * `docs/security/TENANT_ISOLATION_MODEL.md`. Falsch rot hier, falsch gruen dort.
 *
 * Seitdem stammt die Eingangsmenge aus `git ls-files`, und Link-Ziele werden
 * gegen den Index aufgeloest statt gegen die Festplatte. Was git ignoriert, wird
 * nicht bewertet, sondern benannt und gezaehlt (Test "Deckung"). Begruendung im
 * Detail: `test/helpers/repoBestand.js`.
 *
 * Pfadaufloesung bewusst ueber `import.meta.url` statt `process.cwd()`: sonst
 * findet der Test seine Dateien je nach Startverzeichnis nicht und ueberspringt
 * sich lautlos — die "gruene" Suite pruefte dann weniger, als sie behauptet
 * (CLAUDE.md §0.9).
 *
 * Run: node --test --test-force-exit test/docsConsistency.test.js
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getrackteDateien, ignoriertePfade, nichtImRepo, bestandMitVerzeichnissen } from "./helpers/repoBestand.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const BASELINE_PATH = path.join(REPO_ROOT, "docs", ".docs-consistency-baseline.json");

/** Wurzeln, in denen nach Markdown gesucht wird (zusaetzlich zur Repo-Wurzel selbst). */
const SCAN_ROOTS = ["docs", ".agents"];

const LINK_RE = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const EXTERNAL_PREFIXES = ["http://", "https://", "mailto:", "tel:", "data:", "#"];

describe("Doku-Konsistenz", () => {
  /** @type {string[]} geprueftes Markdown, repo-relativ */ let dateien = [];
  /** @type {{file: string, target: string}[]} */ const toteLinks = [];
  /** @type {Set<string>} repo-relative Ziele, kleingeschrieben */ const verlinkt = new Set();
  /** @type {Set<string>} Wurzeln, die dieser Checkout bewusst nicht traegt */ let ungepruefteWurzeln = new Set();
  /** @type {string[]} Wurzeln ohne Inhalt UND ohne Erklaerung */ let unerklaerlicheWurzeln = [];
  /** @type {string[]} alle getrackten Dateien des Repos */ let getrackt = [];
  /** @type {{orphans: string[]}} */ let baseline = { orphans: [] };

  before(() => {
    getrackt = getrackteDateien(REPO_ROOT);
    const bestand = bestandMitVerzeichnissen(getrackt);

    /* Root-Markdown (nicht rekursiv) + die Scan-Wurzeln — alles aus dem Index. */
    dateien = getrackt.filter(
      (p) =>
        p.toLowerCase().endsWith(".md") &&
        (!p.includes("/") || SCAN_ROOTS.some((r) => p.startsWith(`${r}/`)))
    );

    /* Welche Scan-Wurzel traegt dieser Checkout gar nicht? Nicht als Befund —
     * als Deckungsluecke, die der Bericht unten ausweist. `nichtImRepo` statt
     * `ignoriertePfade`, weil Scan-Wurzeln Verzeichnisse sind (siehe dort). */
    const fehlend = SCAN_ROOTS.filter((r) => !dateien.some((p) => p.startsWith(`${r}/`)));
    ungepruefteWurzeln = nichtImRepo(REPO_ROOT, fehlend, getrackt);

    /* Eine Wurzel, die WEDER getracktes Markdown enthaelt NOCH ignoriert ist,
     * ist ein echter Befund: entweder wurde sie umbenannt, oder SCAN_ROOTS
     * nennt etwas, das es nicht gibt. Still ueberspringen waere hier genau der
     * Fehler, den dieser Umbau abstellt — nur andersherum. */
    unerklaerlicheWurzeln = fehlend.filter((r) => !ungepruefteWurzeln.has(r));

    for (const datei of dateien) {
      const text = fs.readFileSync(path.join(REPO_ROOT, datei), "utf8");
      LINK_RE.lastIndex = 0;
      let match;
      while ((match = LINK_RE.exec(text)) !== null) {
        const raw = match[2];
        if (EXTERNAL_PREFIXES.some((p) => raw.startsWith(p))) continue;
        const target = raw.split("#")[0];
        if (!target) continue; // reiner Anker
        const ziel = path.posix
          .normalize(path.posix.join(path.posix.dirname(datei), decodeURIComponent(target)))
          .replace(/\/+$/, "");
        /* Ein Link, der ueber die Repo-Wurzel hinausfuehrt, zeigt auf nichts,
         * was mitgeliefert wird — fuer den Leser eines Klons ist er tot. */
        if (ziel.startsWith("..")) {
          toteLinks.push({ file: datei, target: `${raw}  [fuehrt aus dem Repo heraus]` });
          continue;
        }
        if (bestand.has(ziel.toLowerCase())) verlinkt.add(ziel.toLowerCase());
        else toteLinks.push({ file: datei, target: raw });
      }
    }

    baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
  });

  it("findet ueberhaupt Dokumente — sonst prueft der Test nichts und wirkt trotzdem gruen", () => {
    assert.ok(
      dateien.length > 50,
      `Nur ${dateien.length} getrackte Markdown-Dateien gefunden — stimmt REPO_ROOT (${REPO_ROOT})?`
    );
  });

  it("Deckung: benennt, was dieser Checkout nicht traegt — statt daraus einen Befund zu machen", () => {
    const geprueft = SCAN_ROOTS.filter((r) => !ungepruefteWurzeln.has(r));
    const bericht =
      `${geprueft.length} von ${SCAN_ROOTS.length} Wurzeln geprueft (${geprueft.join(", ")}), ` +
      `${dateien.length} getrackte Markdown-Dateien.` +
      (ungepruefteWurzeln.size
        ? ` Nicht geprueft, weil nicht Teil des Repos: ${[...ungepruefteWurzeln].join(", ")}.`
        : "");
    console.log(`    ℹ ${bericht}`);

    assert.deepEqual(
      unerklaerlicheWurzeln,
      [],
      "Diese Scan-Wurzel enthaelt kein getracktes Markdown und ist auch nicht git-ignoriert — " +
        "sie wurde also umbenannt oder geloescht. SCAN_ROOTS anpassen."
    );

    /* Die zweite Zusicherung: keine gepruefte Datei darf ignoriert sein.
     * Sonst haengt das Urteil wieder am Arbeitsplatz. */
    const versehentlich = ignoriertePfade(REPO_ROOT, dateien);
    assert.deepEqual(
      [...versehentlich],
      [],
      "Diese Dateien sind git-ignoriert und wurden trotzdem geprueft. Damit haengt das " +
        "Urteil davon ab, an welchem Arbeitsplatz der Test laeuft — genau der Fehler, den " +
        "P2-W1 behoben hat."
    );
  });

  it("kein Markdown-Link zeigt ins Leere", () => {
    const report = toteLinks.map((d) => `  ${d.file}  ->  ${d.target}`).join("\n");
    assert.equal(
      toteLinks.length, 0,
      `${toteLinks.length} tote(r) Link(s). Ziel korrigieren oder Link entfernen — ` +
      `es gibt bewusst keine Ausnahmeliste. Geprueft wird gegen den git-Index: ein Link auf ` +
      `eine ignorierte Datei ist tot, weil sie in keinem Klon ankommt:\n${report}`
    );
  });

  describe("verwaiste Dokumente (Ratsche — die Liste darf nur schrumpfen)", () => {
    /** @returns {string[]} repo-relative Pfade unter docs/, auf die nichts verweist */
    function aktuellVerwaist() {
      return dateien.filter((p) => p.startsWith("docs/") && !verlinkt.has(p.toLowerCase())).sort();
    }

    it("keine NEUEN verwaisten Dokumente", () => {
      const bekannt = new Set(baseline.orphans);
      const frisch = aktuellVerwaist().filter((f) => !bekannt.has(f));
      assert.deepEqual(
        frisch, [],
        `${frisch.length} neue verwaiste Datei(en) unter docs/. Jede Datei, auf die niemand ` +
        `verweist, veraltet unbemerkt: entweder aus einem Index verlinken (z. B. docs/README.md) ` +
        `oder loeschen. Nur wenn beides bewusst nicht gilt, in docs/.docs-consistency-baseline.json eintragen:\n` +
        frisch.map((f) => `  ${f}`).join("\n")
      );
    });

    it("die Bestandsliste enthaelt nichts, was inzwischen verlinkt oder geloescht ist", () => {
      const verwaist = new Set(aktuellVerwaist());
      const veraltet = baseline.orphans.filter((f) => !verwaist.has(f));
      assert.deepEqual(
        veraltet, [],
        `${veraltet.length} Eintrag/Eintraege in docs/.docs-consistency-baseline.json sind erledigt ` +
        `(verlinkt oder geloescht). Bitte dort streichen — sonst zieht die Ratsche nie an:\n` +
        veraltet.map((f) => `  ${f}`).join("\n")
      );
    });

    it("die Bestandsliste ist sortiert und doppelfrei — sonst wird jeder Diff unlesbar", () => {
      const sortiert = [...baseline.orphans].sort();
      assert.deepEqual(baseline.orphans, sortiert, "Eintraege in der Bestandsliste alphabetisch sortieren");
      assert.equal(new Set(baseline.orphans).size, baseline.orphans.length, "Doppelte Eintraege in der Bestandsliste");
    });

    it("die Bestandsliste nennt nur getrackte Dateien — sonst wandert der Checkout-Fehler in die Liste", () => {
      /* Genau so entstand P2-W1: acht `docs/launch/*`-Eintraege standen in der
       * Liste, weil sie im Haupt-Checkout auf der Platte lagen. In jedem anderen
       * Checkout waren sie "erledigt" und der Test rot. */
      const getracktesSet = new Set(dateien);
      const fremd = baseline.orphans.filter((f) => !getracktesSet.has(f));
      assert.deepEqual(
        fremd, [],
        `${fremd.length} Eintrag/Eintraege der Bestandsliste sind nicht getrackt. Ein Eintrag, den ` +
        `nur ein bestimmter Arbeitsplatz kennt, macht den Waechter anderswo rot:\n` +
        fremd.map((f) => `  ${f}`).join("\n")
      );
    });
  });
});
