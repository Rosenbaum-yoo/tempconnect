/**
 * Aktive Sitzungen: Zeitpunkt und grober Geraetetyp (8.1.2).
 *
 * DER BEFUND
 * Das Einsatzportal zeigt "2 aktive Sitzungen — davon 1 auf anderen Geraeten"
 * (`einsatzportal-profil.html`). Die zweite Zahl war schlicht `offen - 1`: die
 * Anwendung kannte ueberhaupt keine Geraete. Gemessen am 2026-08-21:
 *
 *   - `session` ist die reine `connect-pg-simple`-Tabelle: `sid`, `sess`, `expire`.
 *   - `bindSessionToDevice` setzt trotz seines Namens NUR die Cookie-Lebensdauer.
 *   - `sess.createdAt` gab es (Zeitpunkt) — ausgeliefert wurde er nie.
 *
 * Der Text versprach also eine Unterscheidung, die die Daten nicht hatten. Und
 * genau darauf soll jemand entscheiden, ob er sein Konto fernabmeldet.
 *
 * OWNER-ENTSCHEIDUNG 2026-08-21: "Zeitpunkt + grober Geraetetyp". Keine IP,
 * kein Standort, keine Geraetekennung — und auch nicht der rohe User-Agent, der
 * ein Wiedererkennungsmerkmal ist. Gespeichert wird nur das ERGEBNIS der
 * Einordnung, nicht ihre Grundlage. Die Proben unten halten beides fest: dass
 * die Einordnung stimmt UND dass nichts darueber hinaus gespeichert wird.
 *
 * Run: node --test --test-force-exit test/sitzungsUebersicht.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  ordneGeraetEin,
  vermerkeGeraet,
  listUserSessions,
} from "../services/sessionSecurityService.js";

/** Echte User-Agent-Zeichenketten — ausgedachte pruefen die Einordnung nicht. */
const ECHTE = {
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  androidHandy: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
  androidTablet: "Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  ipad: "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/604.1",
  windowsChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  windowsEdge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0",
  macFirefox: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:126.0) Gecko/20100101 Firefox/126.0",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
};

describe("Sitzungsuebersicht — die Geraete-Einordnung", () => {
  it("ordnet Handy, Tablet und Rechner an echten User-Agents ein", () => {
    assert.equal(ordneGeraetEin(ECHTE.iphone).art, "handy");
    assert.equal(ordneGeraetEin(ECHTE.androidHandy).art, "handy");
    assert.equal(ordneGeraetEin(ECHTE.ipad).art, "tablet");
    assert.equal(ordneGeraetEin(ECHTE.androidTablet).art, "tablet",
      "Android ohne 'Mobile' ist ein Tablet — genau diese Unterscheidung macht Android schwierig");
    assert.equal(ordneGeraetEin(ECHTE.windowsChrome).art, "rechner");
    assert.equal(ordneGeraetEin(ECHTE.macSafari).art, "rechner");
  });

  it("nennt den Browser richtig — auch wo sich mehrere gleich nennen", () => {
    /* Edge und Opera nennen sich zusaetzlich "Chrome", Chrome nennt sich
     * zusaetzlich "Safari". Wer in der falschen Reihenfolge prueft, meldet
     * jeden Edge als Chrome. */
    assert.equal(ordneGeraetEin(ECHTE.windowsEdge).browser, "Edge");
    assert.equal(ordneGeraetEin(ECHTE.windowsChrome).browser, "Chrome");
    assert.equal(ordneGeraetEin(ECHTE.macSafari).browser, "Safari");
    assert.equal(ordneGeraetEin(ECHTE.macFirefox).browser, "Firefox");
    assert.equal(ordneGeraetEin(ECHTE.iphone).browser, "Safari");
  });

  it("faellt sauber auf 'unbekannt' zurueck statt zu raten", () => {
    for (const eingabe of [undefined, null, "", "   ", "irgendwas"]) {
      const g = ordneGeraetEin(eingabe);
      assert.ok(["handy", "tablet", "rechner", "unbekannt"].includes(g.art));
      assert.equal(typeof g.browser, "string");
    }
    assert.deepEqual(ordneGeraetEin(""), { art: "unbekannt", browser: "unbekannt" });
  });

  it("DATENSPARSAMKEIT: speichert NUR die Einordnung, nie die Grundlage", () => {
    /*
     * Die eigentliche Zusicherung dieser Datei. Der rohe User-Agent ist ein
     * Wiedererkennungsmerkmal (Browser-Fingerabdruck) — er darf die Sitzung
     * nicht erreichen. Owner-Entscheidung: keine IP, kein Standort, keine
     * Geraetekennung.
     */
    const session = {};
    vermerkeGeraet(session, ECHTE.windowsEdge);

    assert.deepEqual(Object.keys(session), ["geraet"], "nur ein Feld darf dazukommen");
    assert.deepEqual(Object.keys(session.geraet).sort(), ["art", "browser"],
      "mehr als Art und Browser darf nicht gespeichert werden");

    const abgelegt = JSON.stringify(session);
    assert.ok(!abgelegt.includes("Mozilla"), "der rohe User-Agent darf nicht in der Sitzung landen");
    assert.ok(!abgelegt.includes("Windows NT"), "kein Betriebssystem-Detail");
    assert.ok(!/\d+\.\d+\.\d+/.test(abgelegt), "keine Versionsnummern — sie verfeinern den Fingerabdruck");
  });

  it("vermerkeGeraet vertraegt eine fehlende Sitzung", () => {
    assert.doesNotThrow(() => vermerkeGeraet(null, ECHTE.iphone));
    assert.doesNotThrow(() => vermerkeGeraet(undefined, undefined));
  });
});

describe("Kein Steuerzeichen im Quelltext — die \b-Falle", () => {
  /*
   * WARUM DIESE PROBE HIER STEHT
   * Beim Bauen dieser Datei ist genau der Fehler passiert, den
   * `docs/UEBERGABE.md` seit dem 2026-08-19 dokumentiert: `\b` wurde zum
   * BACKSPACE-Zeichen (0x08) statt zur Wortgrenze. Die Muster in
   * `ordneGeraetEin` trafen dadurch fast nichts — ein iPhone galt als
   * "rechner", jeder Browser als "unbekannt".
   *
   * Damals traf es den Org-Grenzen-Waechter: `new RegExp(`\b${tabelle}\b`)`
   * traf NIE, meldete vier bewachte Routen als Luecke und haette umgekehrt eine
   * echte durchgelassen. Ein Pruefer, der leer laeuft, sieht aus wie einer, der
   * nichts findet.
   *
   * Der Merksatz stand seitdem in der Uebergabe — eine Regel in einer Doku ist
   * aber keine Sperre. Dies hier ist die Sperre: ein Steuerzeichen hat in
   * Quelltext nichts zu suchen, und im Diff sieht man es nicht.
   */
  const WURZEL = new URL("../", import.meta.url);

  /** Erlaubt sind Zeilenumbruch (0A), Wagenruecklauf (0D) und Tabulator (09). */
  const STEUERZEICHEN = /[\x00-\x08\x0B\x0C\x0E-\x1F]/;

  function sammleQuelltext(verzeichnis, treffer = []) {
    for (const eintrag of fs.readdirSync(verzeichnis, { withFileTypes: true })) {
      if (["node_modules", ".git", "coverage", ".stryker-tmp"].includes(eintrag.name)) continue;
      const pfad = new URL(eintrag.name + (eintrag.isDirectory() ? "/" : ""), verzeichnis);
      if (eintrag.isDirectory()) sammleQuelltext(pfad, treffer);
      else if (/\.(js|mjs|json)$/.test(eintrag.name)) treffer.push(pfad);
    }
    return treffer;
  }

  it("keine Quelldatei enthaelt ein Steuerzeichen", () => {
    const dateien = sammleQuelltext(WURZEL);
    assert.ok(dateien.length > 200, `nur ${dateien.length} Dateien geprueft — stimmt die Wurzel?`);

    const belastet = [];
    for (const datei of dateien) {
      const text = fs.readFileSync(datei, "utf8");
      const treffer = STEUERZEICHEN.exec(text);
      if (!treffer) continue;
      const zeile = text.slice(0, treffer.index).split("\n").length;
      const code = treffer[0].charCodeAt(0).toString(16).padStart(2, "0");
      belastet.push(`${datei.pathname.split("/api/")[1]}:${zeile}  0x${code}`);
    }
    assert.deepEqual(belastet, [],
      "Steuerzeichen im Quelltext. Fast immer ist es ein `\b`, das beim Erzeugen " +
      "des Codes zum Backspace wurde — der haeufigste Weg zu einem regulaeren " +
      "Ausdruck, der NIE trifft und trotzdem gruen aussieht.\n" +
      "Muster als Literale schreiben, nicht zusammensetzen.");
  });

  it("S: die Probe wuerde ein Backspace bemerken", () => {
    /* Rueckmutation ohne Datei: ohne diese Zusicherung koennte das Muster leer
     * laufen und die Probe darueber waere still gruen. */
    assert.ok(STEUERZEICHEN.test("harmlos" + String.fromCharCode(8) + "text"),
      "ein Backspace wuerde durchrutschen");
    assert.ok(!STEUERZEICHEN.test("normaler Text\n\tmit Umbruch und Tabulator\r\n"),
      "Umbruch und Tabulator duerfen kein Fehlalarm sein");
    assert.ok(!STEUERZEICHEN.test("Umlaute und \u2014 Gedankenstriche sind erlaubt"));
  });
});

describe("Sitzungsuebersicht — die Liste", () => {
  function poolMit(rows) {
    const calls = [];
    return {
      calls,
      query: async (sql, params) => { calls.push({ sql, params }); return { rows }; },
    };
  }

  const JETZT = 1787000000000;

  it("liefert Zeitpunkt und Geraet je Sitzung und markiert die aktuelle", async () => {
    const pool = poolMit([
      { sid: "sid-hier", sess: { userId: "u1", createdAt: JETZT, geraet: { art: "rechner", browser: "Firefox" } }, expire: new Date(JETZT + 3600000) },
      { sid: "sid-handy", sess: { userId: "u1", createdAt: JETZT - 86400000, geraet: { art: "handy", browser: "Safari" } }, expire: new Date(JETZT + 7200000) },
    ]);
    const liste = await listUserSessions(pool, "u1", "sid-hier");

    assert.equal(liste.length, 2);
    assert.equal(liste[0].aktuell, true, "die eigene Sitzung muss erkennbar sein");
    assert.equal(liste[1].aktuell, false);
    assert.equal(liste[0].geraet.art, "rechner");
    assert.equal(liste[1].geraet.browser, "Safari");
    assert.equal(liste[0].seit, new Date(JETZT).toISOString());
  });

  it("liefert die Sitzungskennung NICHT aus — sie ist das Anmeldegeheimnis", async () => {
    const pool = poolMit([
      { sid: "sid-geheim", sess: { userId: "u1", createdAt: JETZT }, expire: new Date(JETZT + 1000) },
    ]);
    const liste = await listUserSessions(pool, "u1", "sid-geheim");
    assert.ok(!JSON.stringify(liste).includes("sid-geheim"),
      "wer die Kennung kennt, ist angemeldet — sie gehoert nicht in eine Antwort");
  });

  it("fragt ausschliesslich nach dem eigenen Konto und nur nach offenen Sitzungen", async () => {
    const pool = poolMit([]);
    await listUserSessions(pool, "u1", "sid-hier");
    const { sql, params } = pool.calls[0];
    assert.match(sql, /sess->>'userId' = \$1/,
      "der Feldvergleich muss gezielt sein — `sess::text LIKE` traefe auch Erwaehnungen");
    assert.match(sql, /expire > NOW\(\)/, "abgelaufene Sitzungen sind keine aktiven");
    assert.deepEqual(params, ["u1"], "es darf keine fremde Kennung in die Abfrage gelangen");
  });

  it("vertraegt Sitzungen ohne Zeitpunkt und ohne Geraet", async () => {
    /* Bestandssitzungen aus der Zeit vor dieser Aenderung tragen beides nicht.
     * Sie duerfen nicht verschwinden und nicht werfen — sonst waere die
     * Uebersicht nach dem Einspielen bis zur naechsten Anmeldung leer. */
    const pool = poolMit([{ sid: "alt", sess: { userId: "u1" }, expire: new Date(JETZT) }]);
    const liste = await listUserSessions(pool, "u1", "alt");
    assert.equal(liste.length, 1);
    assert.equal(liste[0].seit, null);
    assert.deepEqual(liste[0].geraet, { art: "unbekannt", browser: "unbekannt" });
  });

  it("liest die Sitzung auch als Zeichenkette", async () => {
    /* `pg` liefert `json` als Objekt, `text` als Zeichenkette — je nach
     * Spaltentyp der Bestandsdatenbank. Beides muss gehen. */
    const pool = poolMit([
      { sid: "s", sess: JSON.stringify({ userId: "u1", createdAt: JETZT, geraet: { art: "handy", browser: "Chrome" } }), expire: new Date(JETZT) },
    ]);
    const liste = await listUserSessions(pool, "u1", "s");
    assert.equal(liste[0].geraet.art, "handy");
  });

  it("ohne Nutzerkennung gibt es keine Liste und keine Abfrage", async () => {
    const pool = poolMit([]);
    assert.deepEqual(await listUserSessions(pool, null, "s"), []);
    assert.equal(pool.calls.length, 0, "ohne Kennung darf nichts abgefragt werden");
  });
});
