/**
 * ═══════════════════════════════════════════════════════════════════════════
 * M4c.5 — NIEMAND FAELLT WORTLOS AUS DEM MARKT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * DER BERICHT EXISTIERTE UND HATTE KEINEN AUFRUFER.
 *
 * `GET /api/workers/marktpraesenz/unsichtbar` liefert seit N7.3 je Mensch,
 * welche der sieben Praesenz-Bedingungen fehlt — jede mit lesbarem Grund und
 * naechstem Schritt, seit M4c.9 mit der Zahl darin. Gemessen am 2026-09-26:
 * KEIN Treffer fuer den Pfad im ganzen Frontend. Die Antwort auf "warum ist
 * niemand im Markt" lag fertig da, und die Frage wurde nie gestellt.
 *
 * UND DIE BENACHRICHTIGUNG FUEHRTE INS LEERE. M4c.12 verschickt
 * `worker.skills_awaiting_release` mit `linkPath`
 * `/public/mitarbeiter.html?freigabe=offen`. Die Seite kannte den Parameter
 * nicht: wer klickte, landete auf der Gesamtliste und suchte selbst — genau die
 * Sackgasse, die CLAUDE.md unter "Deep-Links statt Sackgassen" verbietet.
 *
 * Zwei gerissene Glieder in EINER Kette: Meldung -> Seite -> Bericht -> Profil.
 * Diese Probe haelt jedes Glied fest. Sie liest Quelltext, weil die Kette aus
 * Quelltext besteht; die Alternative waere ein Browserlauf, den das Tor nicht hat.
 *
 * Run: node --test test/niemandFehltWortlos.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PRAESENZ_BEDINGUNGEN } from "../services/marktpraesenzService.js";
import { getMatrix } from "../services/notificationMatrix.js";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const lies = (...teile) => fs.readFileSync(path.join(HIER, "..", "..", ...teile), "utf8");

const SEITE = lies("frontend", "public", "mitarbeiter.html");
const SKRIPT = lies("frontend", "public", "js", "pages", "mitarbeiter.js");
const ROUTE = lies("api", "routes", "workers.js");

/** Der Rumpf von `ladeUnsichtbar` — ueber seine Form gefunden, nicht ueber eine
 *  Zeilennummer: die verschiebt sich beim naechsten Einschub. */
function ladeFunktion() {
  const i = SKRIPT.indexOf("function ladeUnsichtbar(");
  assert.ok(i > 0, "ladeUnsichtbar wurde nicht gefunden — der Bericht hat keinen Ladeweg");
  const j = SKRIPT.indexOf("\nfunction ", i + 10);
  return SKRIPT.slice(i, j > 0 ? j : i + 2000);
}

describe("M4c.5 · die Kette Meldung -> Seite -> Bericht -> Profil", () => {
  it("Glied 1: die Meldung zeigt auf die Seite, die den Bericht traegt", () => {
    const ziel = getMatrix()["worker.skills_awaiting_release"]?.linkPath || "";
    assert.match(ziel, /mitarbeiter\.html/, "die Meldung zeigt auf eine andere Seite");
    assert.match(ziel, /freigabe=offen/,
      "die Meldung zeigt auf die Seite, aber nicht auf den Bericht — der Nutzer sucht selbst");
  });

  it("Glied 2: die Seite kennt `?freigabe=offen` und schaltet um", () => {
    assert.match(SKRIPT, /such\.get\("freigabe"\) === "offen"/,
      "der Parameter wird nicht gelesen — der Deep-Link fuehrt auf die Gesamtliste");
    assert.match(SKRIPT, /showTab\("unsichtbar"\)/,
      "der Parameter wird gelesen, aber nichts umgeschaltet");
  });

  it("Glied 3: der Endpunkt hat einen AUFRUFER, nicht nur eine Adresse", () => {
    /*
     * Die wichtigste Zusicherung dieser Datei. Ein Feature, das nur seine URL
     * kennt, ist nicht geliefert — und genau so lag der Bericht monatelang da.
     */
    assert.match(SKRIPT, /api\("\/workers\/marktpraesenz\/unsichtbar/,
      "das Frontend ruft den Bericht nicht ab");
    assert.match(ROUTE, /router\.get\("\/workers\/marktpraesenz\/unsichtbar"/,
      "der Endpunkt heisst anders, als das Frontend ruft");
  });

  it("Glied 4: je Person fuehrt ein Weg in die Personalakte", () => {
    assert.match(SKRIPT, /function oeffneUnsichtbar\(/, "es gibt keinen Sprung in die Personalakte");
    assert.match(SKRIPT, /onclick="oeffneUnsichtbar\(/, "der Sprung ist nicht gebunden — ein toter Knopf");
    assert.match(SKRIPT, /_pendingHubWorker = String\(\(w && \(w\.user_id \|\| w\.id\)\) \|\| profileId\)/,
      "der Sprung benutzt nicht den vorhandenen Weg in die Personalakte");
  });
});

describe("M4c.5 · der Bericht ist im Markup verankert", () => {
  it("Reiter, Zaehler und Liste existieren", () => {
    assert.match(SEITE, /data-tab="unsichtbar"/, "der Reiter fehlt");
    assert.match(SEITE, /id="unsichtbarCount"/,
      "der Zaehler fehlt — die ZAHL ist das Signal, nicht die Liste");
    assert.match(SEITE, /id="panel-unsichtbar"/, "der Panel fehlt");
    assert.match(SEITE, /id="unsichtbarList"/, "die Liste fehlt");
  });

  it("showTab laedt den Bericht — sonst bleibt der Reiter leer", () => {
    assert.match(SKRIPT, /if \(name === "unsichtbar"\) ladeUnsichtbar\(\)/,
      "der Reiter ist da und laedt nichts");
  });

  it("alle drei Zustaende sind behandelt: laedt, leer, Fehler", () => {
    assert.match(SKRIPT, /mit\.unsichtbar\.loading/, "kein Ladezustand");
    assert.match(SKRIPT, /mit\.unsichtbar\.empty/, "kein Leerzustand");
    assert.match(SKRIPT, /mit\.unsichtbar\.error/, "kein Fehlerzustand");
    /*
     * Der Fehlerfall darf NICHT als leere Liste erscheinen: leer heisst "alle im
     * Markt", und das waere hier eine Luege.
     *
     * Geprueft wird IM RUMPF der ladenden Funktion, nicht am ersten Vorkommen des
     * Schluessels — das steht im Woerterbuch, und die erste Fassung dieser Probe
     * traf genau dort. Eine Probe, die an der ersten Fundstelle haengt, prueft
     * das Verzeichnis statt den Weg.
     */
    const rumpf = ladeFunktion();
    assert.match(rumpf, /\.catch\(/, "der Fehlerzustand haengt an keinem catch");
    assert.match(rumpf, /mit\.unsichtbar\.error/, "der Fehlerzustand steht nicht im Ladeweg");
    assert.match(rumpf, /setzeUnsichtbarZahl\(null\)/,
      "nach einem Fehler zeigt der Zaehler weiter eine Zahl, die nicht gemessen wurde");
  });

  it("jeder Wert aus der Antwort wird escapt", () => {
    /* Name, Grund und Hinweis kommen aus der Datenbank. CLAUDE.md: keine
       Nutzdaten in `innerHTML` ohne `esc()`. */
    for (const stueck of ["esc(e.name", "esc(g.grund)", "esc(g.hinweis)"]) {
      assert.ok(SKRIPT.includes(stueck), `nicht escapt: ${stueck}`);
    }
  });
});

describe("M4c.5 · jeder Grund ist lesbar und benennt seinen Adressaten", () => {
  it("die Oberflaeche kennt eine Bezeichnung fuer JEDE Zustaendigkeit", () => {
    /*
     * `wer` entscheidet, wer den Grund beheben kann. Fehlt die Bezeichnung,
     * zeigt die Karte den rohen Schluessel ("organisation") — verstaendlich fuer
     * uns, nicht fuer die Firma. Entdeckend: eine neue Zustaendigkeit in
     * `PRAESENZ_BEDINGUNGEN` macht diese Probe rot, bevor sie jemand sieht.
     */
    const vorhanden = [...new Set(PRAESENZ_BEDINGUNGEN.map((b) => b.wer))];
    assert.ok(vorhanden.length >= 3, `nur ${vorhanden.length} Zustaendigkeiten gefunden`);
    for (const wer of vorhanden) {
      assert.ok(SKRIPT.includes(`mit.unsichtbar.wer.${wer}`),
        `fuer die Zustaendigkeit '${wer}' fehlt die Bezeichnung — die Karte zeigt den rohen Schluessel`);
    }
  });

  it("jede Bezeichnung steht in BEIDEN Sprachen", () => {
    /* Eine halb uebersetzte Seite ist schlimmer als eine einsprachige: der
       Leser haelt das fehlende Stueck fuer einen Fehler in den Daten. */
    for (const wer of [...new Set(PRAESENZ_BEDINGUNGEN.map((b) => b.wer))]) {
      const treffer = SKRIPT.split(`'mit.unsichtbar.wer.${wer}':`).length - 1;
      assert.equal(treffer, 2,
        `'mit.unsichtbar.wer.${wer}' steht ${treffer}x in den Woerterbuechern, erwartet 2 (de + en)`);
    }
  });

  it("jede Bedingung traegt Grund UND naechsten Schritt — sonst bleibt der Leser ratlos", () => {
    for (const b of PRAESENZ_BEDINGUNGEN) {
      assert.ok((b.grund || "").length > 10, `${b.schluessel}: kein lesbarer Grund`);
      assert.ok((b.hinweis || "").length > 20, `${b.schluessel}: kein naechster Schritt`);
      assert.ok(!/[A-Za-z_]+\.[A-Za-z_]+/.test(b.grund),
        `${b.schluessel}: der Grund nennt einen Spalten- oder Tabellennamen — `
        + "die Firma liest, wie das System gebaut ist, statt was zu tun ist");
    }
  });

  it("der Text wird beim Sprachwechsel neu gezeichnet", () => {
    const stelle = SKRIPT.indexOf('addEventListener("tc:langchange"');
    assert.ok(stelle > 0, "die Seite hat keinen Sprachwechsel-Haken");
    const block = SKRIPT.slice(stelle, stelle + 1600);
    assert.match(block, /ladeUnsichtbar\(\)/,
      "beim Sprachwechsel bleibt der Bericht in der alten Sprache stehen");
  });
});
