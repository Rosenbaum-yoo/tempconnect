/**
 * Das gemeinsame Katalog-Tor (M4b.1, 2026-09-05).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WAS HIER FALSCH WAR — GEMESSEN AN DREI STELLEN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   `proposeSkill` legt an mit    status = 'proposed'
 *   `platform_skills.is_active`   NOT NULL DEFAULT TRUE  (Mig 023)
 *
 * Ein frischer Vorschlag ist damit `is_active = TRUE, status = 'proposed'`. Und
 * die beiden Wege in den Marktplatz prueften VERSCHIEDENE Spalten:
 *
 *   marktpraesenzService (Automatik)      ... AND ps.is_active = TRUE
 *   capacityOfferGeneratorService (Hand)  ... AND ps.status = 'approved'
 *
 * Die Automatik nahm den unkuratierten Vorschlag also MIT — und sie ist der
 * Weg, der laeuft. Waehrend das Portal dem Menschen sagt "wir pruefen sie,
 * danach zaehlt sie", stand sie laengst oeffentlich im Markt. Der manuelle Weg
 * lehnte sie ab, und sein Kommentar begruendet ausdruecklich, warum das nicht
 * passieren darf. Beides gleichzeitig ist unwahr.
 *
 * Die Gegenrichtung war genauso offen: der manuelle Weg nahm eine
 * `approved`-Faehigkeit auch dann, wenn sie inzwischen DEAKTIVIERT wurde.
 *
 * Abnahme aus dem Plan (M4b.1): **Vorschlag anlegen → er steht nicht im Feed.
 * Rueckmutation JE SPALTE.**
 *
 * Run: node --test --test-force-exit test/katalogTor.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { katalogTorSql } from "../services/skillCatalogService.js";

/* Pfade IMMER relativ zur Testdatei — sonst haengt das Ergebnis am
   Startverzeichnis und der Test ueberspringt sich je nach cwd lautlos. */
const HIER = path.dirname(fileURLToPath(import.meta.url));
const API = path.resolve(HIER, "..");
const quelle = (rel) => fs.readFileSync(path.join(API, rel), "utf8");

/* ── 1. Das Tor selbst ───────────────────────────────────────────────── */

describe("M4b.1 · das Tor nennt BEIDE Spalten", () => {
  it("es prueft `is_active` UND `status`", () => {
    const sql = katalogTorSql("ps");
    assert.match(sql, /ps\.is_active = TRUE/,
      "die Aktiv-Spalte fehlt — eine deaktivierte Faehigkeit erzeugt wieder Angebote");
    assert.match(sql, /ps\.status = 'approved'/,
      "die Kuratier-Spalte fehlt — ein unkuratierter Vorschlag steht wieder im Markt");
    assert.match(sql, /AND/, "die beiden Bedingungen sind nicht verknuepft");
  });

  it("der Alias wird uebernommen, nicht fest verdrahtet", () => {
    /* Ohne das waere das Tor an genau eine Abfrageform gebunden — und die
       naechste Stelle schriebe wieder ihre eigene Bedingung. */
    assert.match(katalogTorSql("k"), /k\.is_active = TRUE AND k\.status = 'approved'/);
    assert.match(katalogTorSql(), /ps\.is_active/, "ohne Angabe fehlt der Vorgabe-Alias");
    assert.match(katalogTorSql("  ps  "), /^ps\./, "Leerzeichen zerlegen die Bedingung");
  });
});

/* ── 2. Jeder Veroeffentlichungsweg benutzt es ───────────────────────── */

describe("M4b.1 · beide Wege in den Markt gehen durch dasselbe Tor", () => {
  const AUTOMATIK = quelle("services/marktpraesenzService.js");
  const HAND = quelle("services/capacityOfferGeneratorService.js");

  it("die Automatik prueft nicht mehr allein auf `is_active`", () => {
    /*
     * Das war der Weg, der LAEUFT — alle 15 Minuten, und beim OK-Klick sofort.
     * Genau er nahm den Vorschlag mit.
     *
     * Fixture-Pflege 2026-09-25 (M4c.3b): hier stand 2 — der Sweep und der
     * Einzelnachzug im Praesenz-Schalter hatten je eine eigene, von Hand
     * abgeschriebene Einfuegeanweisung. Beide kommen jetzt aus EINEM Bauplan
     * (`materialisierenSql`), also gibt es das Tor nur noch einmal. Die Zusage
     * wird dadurch staerker, nicht schwaecher: ein Weg, der am Tor vorbeikommt,
     * ist nicht mehr bloss unwahrscheinlich, sondern nicht mehr baubar. Dass es
     * wirklich nur EINEN Weg gibt, sichert `marktSichtbarkeit.test.js` zu.
     */
    assert.equal(AUTOMATIK.match(/katalogTorSql\('ps'\)/g)?.length, 1,
      "der Einfuegeweg der Automatik geht nicht durch das Tor");
    assert.ok(!/AND ps\.is_active = TRUE\b(?!.*status)/.test(AUTOMATIK.replace(/\n/g, " ")),
      "es steht wieder eine eigene `is_active`-Bedingung im Veroeffentlichungsweg");
  });

  it("der manuelle Weg prueft nicht mehr allein auf `status`", () => {
    assert.ok(HAND.includes("katalogTorSql('ps')"),
      "der manuelle Erzeuger geht nicht durch das Tor");
    assert.ok(!/AND ps\.status = 'approved'/.test(HAND),
      "es steht wieder eine eigene `status`-Bedingung da — dann kann eine "
      + "deaktivierte Faehigkeit weiter Angebote erzeugen");
    assert.equal(HAND.match(/katalogTorSql\('ps'\)/g)?.length, 3,
      "nicht alle drei Erzeuger-Stellen (Einzelangebot, Pool-Vorschlag, Pool-Angebot) "
      + "gehen durch das Tor");
  });

  it("das Tor steht an EINER Stelle, nicht als Kopie", () => {
    /* Zwei Zeilen, die zufaellig dasselbe sagen, sind heute schon
       auseinandergelaufen — das ist der ganze Anlass dieser Phase. */
    const katalog = quelle("services/skillCatalogService.js");
    assert.equal(katalog.match(/export function katalogTorSql/g)?.length, 1);
    for (const [name, text] of [["Automatik", AUTOMATIK], ["Hand", HAND]]) {
      assert.match(text, /import \{ katalogTorSql \} from "\.\/skillCatalogService\.js"/,
        `${name} bindet das Tor nicht ein, sondern hat womoeglich eine eigene Fassung`);
    }
  });
});

/* ── 3. Das erzeugte SQL, nicht nur der Quelltext ────────────────────── */

describe("M4b.1 · im erzeugten SQL stehen beide Bedingungen", () => {
  /*
   * Die Quelltext-Proben oben wuerden auch dann gruen bleiben, wenn
   * `${katalogTorSql('ps')}` in einer NORMALEN Zeichenkette staende — dann
   * stuende die Einsetzung woertlich im SQL, und Postgres bekaeme Unsinn.
   * `node --check` bemerkt das nicht. Also wird die Abfrage wirklich erzeugt.
   */
  function spionPool() {
    const gesehen = [];
    const antworte = async (sql) => { gesehen.push(String(sql)); return { rows: [], rowCount: 0 }; };
    return { gesehen, query: antworte, connect: async () => ({ query: antworte, release() {} }) };
  }

  it("die Automatik erzeugt beide Bedingungen", async () => {
    const { sweepMarktpraesenz } = await import("../services/marktpraesenzService.js");
    const pool = spionPool();
    await sweepMarktpraesenz(pool).catch(() => {});
    const mit = pool.gesehen.filter((s) => /platform_skills/.test(s));
    assert.ok(mit.length >= 1, "die Automatik hat den Katalog gar nicht gefragt");
    for (const sql of mit) {
      assert.match(sql, /is_active = TRUE/, `Aktiv-Bedingung fehlt: ${sql.slice(0, 120)}`);
      assert.match(sql, /status = 'approved'/, `Kuratier-Bedingung fehlt: ${sql.slice(0, 120)}`);
      assert.ok(!sql.includes("${"),
        "die Einsetzung steht WOERTLICH im SQL — das Tor sitzt in einer normalen "
        + "Zeichenkette statt in einem Template-Literal");
    }
  });

  it("der Pool-Weg erzeugt beide Bedingungen", async () => {
    const { buildPoolSuggestion } = await import("../services/capacityOfferGeneratorService.js");
    const pool = spionPool();
    await buildPoolSuggestion(pool, {
      orgId: "11111111-1111-4111-8111-111111111111",
      skillIds: ["22222222-2222-4222-8222-222222222222"]
    }).catch(() => {});
    const mit = pool.gesehen.filter((s) => /platform_skills/.test(s));
    assert.ok(mit.length >= 1, "der Pool-Weg hat den Katalog gar nicht gefragt");
    assert.match(mit[0], /is_active = TRUE/);
    assert.match(mit[0], /status = 'approved'/);
    assert.ok(!mit[0].includes("${"));
  });
});

/* ── 4. Was das Tor bewusst NICHT bewacht ────────────────────────────── */

describe("M4b.1 · zuordnen ist nicht veroeffentlichen", () => {
  /*
   * Die Grenze gehoert festgehalten, sonst "repariert" jemand die drei Stellen
   * unten mit — und sperrt damit genau die Menschen aus, um die es geht.
   *
   * M4b.3 sagt: Pflicht ist MINDESTENS EINE Faehigkeit, und ein Vorschlag
   * zaehlt dafuer. Veroeffentlicht wird nur mit einer freigegebenen. Wer das
   * Tor auch vor das Zuordnen haengt, macht aus dem Pflichtfeld eine Falle
   * ohne Ausgang.
   */
  it("ein Vorschlag darf an ein Profil geheftet werden", () => {
    const w = quelle("services/workerService.js");
    const fn = /export async function setWorkerSkills[\s\S]*?\n\}/.exec(w);
    assert.ok(fn, "setWorkerSkills wurde nicht gefunden");
    assert.match(fn[0], /FROM platform_skills WHERE id = ANY\(\$1::uuid\[\]\) AND is_active = TRUE/,
      "die Zuordnungspruefung hat sich geaendert");
    assert.ok(!fn[0].includes("katalogTorSql"),
      "das Veroeffentlichungs-Tor haengt jetzt vor dem ZUORDNEN — dann kann ein "
      + "Mensch mit einem neuen Gewerk sein Profil nicht mehr abschliessen, und "
      + "das Pflichtfeld aus M4b.3 wird eine Falle ohne Ausgang");
  });

  it("die Namensaufloesung sieht Vorschlaege weiterhin", () => {
    /* Sonst entstuende bei jeder Schreibweise ein NEUER Vorschlag, statt auf
       den bestehenden zu treffen — und die Kuratierliste liefe voll. */
    const n = quelle("services/skillNormalizationService.js");
    const abfrage = /SELECT id, name, aliases FROM platform_skills[^`]*/.exec(n);
    assert.ok(abfrage, "die Aufloesungs-Abfrage wurde nicht gefunden");
    assert.match(abfrage[0], /WHERE is_active = TRUE/,
      "die Aufloesung filtert nicht mehr auf aktive Eintraege");
    /*
     * DIE ENTSCHEIDENDE ZUSICHERUNG, und sie muss NEGATIV sein: eine
     * Praefix-Probe blieb gruen, als der Mutant `AND status = 'approved'`
     * ANHAENGTE. Fuenfter Fall dieser Falle in zwei Tagen — ein Muster, das
     * einen Anfang trifft, sagt nichts ueber das, was dahinter steht.
     */
    assert.ok(!/status/.test(abfrage[0]),
      "die Aufloesung geht jetzt durch das Veroeffentlichungs-Tor — dann entsteht "
      + "bei jeder Schreibweise ein NEUER Vorschlag statt eines Treffers auf den "
      + "bestehenden, und die Kuratierliste laeuft voll");
  });
});
