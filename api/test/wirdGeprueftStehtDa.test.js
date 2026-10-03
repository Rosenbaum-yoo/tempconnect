/**
 * ═══════════════════════════════════════════════════════════════════════════
 * M4b.3 — "WIRD GEPRUEFT" IST ETWAS ANDERES ALS "NICHTS DA"
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Die Abnahme aus dem Plan, woertlich: *„wer nur einen Vorschlag hat, kann sein
 * Profil abschliessen und liest: 'wird geprueft — danach erscheinst du im
 * Markt'."* Und M4.9: *„Kein Mensch faellt mehr WORTLOS aus dem Markt."*
 *
 * DREI ZUSTAENDE, DIE VORHER ZWEI WAREN. Wer gar keine Faehigkeit eingetragen
 * hat, muss etwas TUN. Wer eine eingetragen hat, die auf Kuratierung wartet, hat
 * alles getan, was er tun kann, und wartet auf UNS. Beide lasen denselben Satz —
 * der Wartende zu Recht als Vorwurf; im Aufnahme-Fortschritt las er sogar GAR
 * KEINEN, weil der Schritt als erledigt galt und `hinweis` auf null stand. Genau
 * das nennt M4b.3 die „stille Abwesenheit".
 *
 * WARUM `erledigt` TROTZDEM TRUE BLEIBT: ein Vorschlag zaehlt fuer das
 * Pflichtfeld. Wer das umstellte, machte daraus eine Falle ohne Ausgang — der
 * Mensch mit einem neuen Gewerk koennte seine Aufnahme nie abschliessen. Gemessen
 * am 2026-10-03: 34 von 45 Profilen haben keine freigegebene Faehigkeit, 9 davon
 * haben nicht einmal ein eigenes Konto und koennten ein Portal-Pflichtfeld
 * grundsaetzlich nicht erfuellen.
 *
 * UND EIN ZWEITER BEFUND, den diese Welle mitnimmt: das Abzeichen „Profil x %"
 * zaehlte den denormalisierten Spiegel `skill_tags` statt der Beziehung. Der
 * Spiegel ist NICHT tot — `setWorkerSkills` schreibt ihn bei jedem Speichern —
 * aber er luegt: 8 von 45 Profilen tragen Faehigkeiten in der Beziehung und einen
 * LEEREN Spiegel (umgekehrt: 0). Diese acht sahen dauerhaft einen zu niedrigen
 * Prozentsatz, und einer, der ohne Grund nicht steigt, wird ignoriert.
 *
 * OHNE DATENBANK: alles hier ist statisch lesbar oder laeuft gegen Attrappen.
 *
 * Run: node --test --test-force-exit test/wirdGeprueftStehtDa.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PRAESENZ_BEDINGUNGEN } from "../services/marktpraesenzService.js";
import { katalogTorSql } from "../services/skillCatalogService.js";
import { getWorkerHub } from "../services/workerService.js";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const API = path.resolve(HIER, "..");
const quelle = (rel) => fs.readFileSync(path.join(API, rel), "utf8");
const ohneKommentare = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const VORSCHLAG = PRAESENZ_BEDINGUNGEN.find((b) => b.schluessel === "nur_vorschlag");
const RIEGEL = PRAESENZ_BEDINGUNGEN.find((b) => b.schluessel === "entwurf_blockiert");

/* ── 1. Die achte Bedingung ──────────────────────────────────────────── */

describe("M4b.3 · die achte Bedingung trennt Warten von Fehlen", () => {
  it("sie existiert, und zwar als Diagnose — nicht als zweite Huerde", () => {
    assert.ok(VORSCHLAG, "die Bedingung `nur_vorschlag` fehlt — dann liest der "
      + "Wartende denselben Satz wie der, der nichts eingetragen hat");
    assert.equal(VORSCHLAG.nurDiagnose, true,
      "sie steht als echte Praesenz-Bedingung drin: dann ist derselbe Mensch ZWEIMAL "
      + "ausgeschlossen (sie UND keine_freigegebene_faehigkeit), und die "
      + "Materialisierung muesste zwei Bedingungen erfuellen, wo eine gilt");
    assert.equal(VORSCHLAG.wer, "mensch",
      "die Zustaendigkeit entscheidet, wo der Hinweis erscheint");
  });

  it("ihr Hinweis sagt ausdruecklich, dass NICHTS zu tun ist", () => {
    /* Ein Hinweis, der nach Arbeit klingt, ist hier falsch: der Mensch hat seine
       Arbeit getan. Wer ihn zum Handeln auffordert, schickt ihn in eine Schleife. */
    assert.match(VORSCHLAG.hinweis, /nichts weiter zu tun/i,
      "der Hinweis fordert zum Handeln auf, obwohl der Mensch nichts tun kann");
    assert.match(VORSCHLAG.hinweis, /Markt/,
      "der Hinweis nennt nicht die Folge — ohne sie ist er eine Floskel");
  });

  it("sie liest 'freigegeben' aus dem gemeinsamen Katalog-Tor, nicht als Abschrift", () => {
    /* Eine eigene Fassung waere die zweite Definition von "freigegeben" — und
       die erste Abweichung waere ein Satz, der dem Menschen etwas Falsches sagt.
       Dieselbe Falle wie bei den beiden Katalog-Toren aus M4b.1. */
    const tor = katalogTorSql("psv");
    assert.ok(VORSCHLAG.sql.includes(tor),
      `die Bedingung traegt das Tor nicht woertlich: erwartet ${tor}`);
    assert.ok(VORSCHLAG.zahlSql.includes(katalogTorSql("psz")),
      "die Zahl zaehlt mit einer eigenen Fassung von 'freigegeben'");
  });

  it("sie trifft genau den Zustand 'hat etwas, aber nichts freigegebenes'", () => {
    const sql = VORSCHLAG.sql.replace(/\s+/g, " ");
    assert.match(sql, /^NOT \(/, "ohne die aeussere Negation meldet sie die Erfuellung als Grund");
    assert.match(sql, /EXISTS \( SELECT 1 FROM worker_profile_skills/,
      "sie prueft nicht, OB etwas eingetragen ist — dann trifft sie auch den, der nichts hat");
    assert.match(sql, /AND NOT EXISTS/,
      "sie prueft nicht die Abwesenheit einer FREIGEGEBENEN — dann trifft sie jeden");
    assert.ok(sql.includes("wp.id"), "sie ist nicht an DIESEN Menschen gebunden");
  });
});

/* ── 2. Der Wortlaut gehoert der Bedingung ───────────────────────────── */

describe("M4b.3 · jede Bedingung mit Zahl traegt ihren eigenen Satz", () => {
  it("die Zusammenbau-Schleife verdrahtet kein Wort mehr fest", () => {
    /*
     * Hier lag der Defekt, den die achte Bedingung freigelegt haette: der Satz
     * "N Entwuerfe blockieren N Angebote" stand in der Schleife und galt fuer
     * JEDE Bedingung mit `zahlSql`. Die zweite haette ihn ueber
     * Faehigkeits-Vorschlaege geschrieben — eine Zahl mit dem falschen Wort.
     */
    const code = ohneKommentare(quelle("services/marktpraesenzService.js"));
    const schleife = code.slice(code.indexOf("const zahl = b.zahlSql"));
    assert.ok(schleife.includes("b.grundMitZahl"),
      "die Schleife ruft den Wortlaut der Bedingung nicht auf");
    assert.ok(!/Entwuerfe|Entwurf/.test(schleife.slice(0, 600)),
      "in der Schleife steht wieder ein fest verdrahtetes Wort — dann bekommt die "
      + "naechste Bedingung mit Zahl den Satz einer anderen");
  });

  it("der Entwurfs-Riegel sagt WORTGLEICH, was er vorher sagte", () => {
    /* Die Umstellung darf den bestehenden Satz nicht verschieben — er ist in
       `entwurfsRiegel.test.js` auf die Zeichenkette festgenagelt. */
    assert.equal(RIEGEL.grundMitZahl(6), "6 Entwuerfe blockieren 6 Angebote.");
    assert.equal(RIEGEL.grundMitZahl(1), "1 Entwurf blockiert 1 Angebot.");
  });

  it("die achte Bedingung beugt richtig — eine Zahl mit falschem Wort liest sich wie eine Maschine", () => {
    assert.equal(VORSCHLAG.grundMitZahl(1), "1 Faehigkeit wartet auf Freigabe.");
    assert.equal(VORSCHLAG.grundMitZahl(3), "3 Faehigkeiten warten auf Freigabe.");
    assert.ok(!VORSCHLAG.grundMitZahl(3).includes("Faehigkeits"),
      "die Mehrzahl ist durch Anhaengen gebildet worden");
  });

  it("jede Bedingung mit zahlSql hat auch einen Wortlaut dafuer", () => {
    /* Sonst bleibt die Zahl im Zusatzfeld liegen und der Grund nennt sie nicht —
       der Bericht zeigt den Grund, nicht das Zusatzfeld. */
    for (const b of PRAESENZ_BEDINGUNGEN) {
      if (!b.zahlSql) continue;
      assert.equal(typeof b.grundMitZahl, "function",
        `${b.schluessel} bringt eine Zahl mit, aber keinen Satz dafuer`);
    }
  });
});

/* ── 2b. Der Bericht traegt den Satz wirklich — mit Zahl und Beugung ──── */

describe("M4b.3 · der Bericht der Firma nennt das Warten beim Namen", () => {
  /**
   * WARUM DIESE PROBE SEIN MUSS, obwohl die Abfrage gegen die echte Datenbank
   * laeuft: gemessen am 2026-10-03 ist KEIN Profil im Zustand "nur ein
   * Vorschlag" (0 von 45). Postgres wertet die Bedingung also aus, aber sie
   * feuert nie — der Zweig, der den Satz baut, blieb unbelegt. Hier wird er
   * ueber die Zusammenbau-Schleife angetrieben, genau wie beim Entwurfs-Riegel.
   */
  const INDEX = PRAESENZ_BEDINGUNGEN.findIndex((b) => b.schluessel === "nur_vorschlag");

  function zeile(extra) {
    /* Jede Bedingung erfuellt (true), ausser der einen, die der Fall meint.
       Eine Muster-Zeile, die eine Spalte NICHT nennt, laesst die Bedingung
       stillschweigend als "nicht erfuellt" gelten und erzeugt Gruende, die
       niemand gemeint hat. */
    const z = { worker_profile_id: "wp-1", name: "Probe" };
    PRAESENZ_BEDINGUNGEN.forEach((_, i) => { z[`b${i}`] = true; });
    return { ...z, ...extra };
  }

  it("Mehrzahl: zwei wartende Faehigkeiten stehen mit Zahl im Grund", async () => {
    const { unsichtbareKraefte } = await import("../services/marktpraesenzService.js");
    const pool = { query: async () => ({ rows: [zeile({ [`b${INDEX}`]: false, [`z${INDEX}`]: 2 })] }) };
    const [eintrag] = await unsichtbareKraefte(pool, "org-1");
    const grund = eintrag.gruende.find((g) => g.schluessel === "nur_vorschlag");
    assert.ok(grund, "der Grund erscheint nicht im Bericht");
    assert.equal(grund.anzahl, 2);
    assert.equal(grund.grund, "2 Faehigkeiten warten auf Freigabe.");
    assert.match(grund.hinweis, /nichts weiter zu tun/i);
    assert.equal(grund.wer, "mensch");
  });

  it("Einzahl: eine wartende Faehigkeit beugt richtig", async () => {
    const { unsichtbareKraefte } = await import("../services/marktpraesenzService.js");
    const pool = { query: async () => ({ rows: [zeile({ [`b${INDEX}`]: false, [`z${INDEX}`]: 1 })] }) };
    const [eintrag] = await unsichtbareKraefte(pool, "org-1");
    const grund = eintrag.gruende.find((g) => g.schluessel === "nur_vorschlag");
    assert.equal(grund.grund, "1 Faehigkeit wartet auf Freigabe.");
  });

  it("und wer freigegeben ist, bekommt den Satz NICHT", async () => {
    /* Sonst waere die Probe darueber leer gruen: sie wuerde auch gelten, wenn
       der Grund IMMER erscheint. */
    const { unsichtbareKraefte } = await import("../services/marktpraesenzService.js");
    const pool = { query: async () => ({ rows: [zeile({})] }) };
    const treffer = await unsichtbareKraefte(pool, "org-1");
    assert.deepEqual(treffer, [],
      "wer alle Bedingungen erfuellt, erscheint im Bericht — dann meldet er jeden");
  });
});

/* ── 3. Der Aufnahme-Fortschritt: drei Zustaende, drei Antworten ─────── */

describe("M4b.3 · der Mensch liest, warum der Markt noch wartet", () => {
  it("der Fortschritt kennt beide Zahlen, nicht nur ob etwas da ist", () => {
    const code = ohneKommentare(quelle("services/workerOnboardingService.js"));
    assert.match(code, /import \{ katalogTorSql \} from "\.\/skillCatalogService\.js"/,
      "der Fortschritt hat eine eigene Fassung von 'freigegeben'");
    assert.ok(code.includes("skillFreigegeben"),
      "der Fortschritt unterscheidet freigegeben nicht von eingetragen");
    assert.ok(!/SELECT 1 FROM worker_profile_skills/.test(code),
      "die alte Abfrage steht wieder da — sie weiss nur OB, nicht WAS");
    assert.ok(code.includes("LEFT JOIN platform_skills"),
      "ohne LEFT JOIN verschwindet eine Zeile, deren Katalogeintrag weg ist — "
      + "dann waere der Schritt ploetzlich offen, obwohl der Mensch nichts tat");
  });

  it("erledigt haengt an `gesamt`, nicht an `freigegeben` — sonst ist es eine Falle", () => {
    const code = ohneKommentare(quelle("services/workerOnboardingService.js"));
    const block = code.slice(code.indexOf("erledigt: skillGesamt"), code.indexOf("erledigt: skillGesamt") + 420);
    assert.ok(block.startsWith("erledigt: skillGesamt > 0"),
      "der Schritt verlangt eine FREIGEGEBENE Faehigkeit — damit kann niemand mit "
      + "einem neuen Gewerk seine Aufnahme abschliessen");
    assert.ok(!/erledigt: skillFreigegeben/.test(code),
      "die Erledigung haengt an der Kuratierung — das ist die Falle ohne Ausgang");
  });
});

/* ── 3b. Und der Satz erreicht den Menschen wirklich ─────────────────── */

describe("M4b.3 · der Hinweis steht auf der Seite, nicht nur in der Antwort", () => {
  /*
   * DER BEFUND, DER DIESE WELLE FAST UNSICHTBAR GEMACHT HAETTE.
   * `getOnboardingProgress` liefert je Schritt ein `hinweis`-Feld — und
   * `einsatzportal-profil.html` hat es NIE gerendert. Der bestehende Satz "Ohne
   * Faehigkeit entstehen keine Angebote." war seit seiner Einfuehrung berechnet
   * und unsichtbar. Derselbe Weg haette den neuen Satz geschluckt: der Server
   * rechnet, die Flaeche sieht nicht hin — dieselbe Naht wie bei M4b.2.
   *
   * Quelltext-Pruefung, wie in `niemandFehltWortlos.test.js` begruendet: die
   * Kette besteht aus Quelltext, und das Tor hat keinen Browserlauf.
   */
  const SEITE = fs.readFileSync(
    path.resolve(API, "..", "frontend", "public", "einsatzportal-profil.html"), "utf8");

  it("die Seite hat einen Platz fuer die Hinweise", () => {
    assert.match(SEITE, /id="progressHints"/,
      "der Block fehlt — dann hat der Hinweis keinen Ort");
    assert.match(SEITE, /\.profil-hint\s*\{/,
      "die Klasse `profil-hint` fehlt im Stilblock");
  });

  it("sie rendert `hinweis`, und zwar escaped", () => {
    const i = SEITE.indexOf("progressHints');");
    assert.ok(i > 0, "der Block wird nicht geholt");
    const block = SEITE.slice(i, i + 700);
    assert.ok(/s\.hinweis/.test(block), "der Hinweis wird nicht gelesen");
    assert.ok(/esc\(s\.hinweis\)/.test(block),
      "der Hinweis landet unescaped in innerHTML — er kommt aus der Antwort, "
      + "und CLAUDE.md verlangt `esc()` fuer jeden Wert in innerHTML");
    assert.ok(/esc\(s\.titel\)/.test(block), "der Schrittname landet unescaped");
  });

  it("ERLEDIGTE Schritte zeigen ihren Hinweis AUCH — darin liegt der ganze Fall", () => {
    /*
     * Wer nur einen Vorschlag hat, ist mit dem Schritt FERTIG (sonst waere das
     * Pflichtfeld eine Falle ohne Ausgang) und muss trotzdem erfahren, warum er
     * nicht im Markt steht. Eine Filterung auf offene Schritte liesse genau
     * diesen Menschen wortlos — also genau den, fuer den M4b.3 gebaut ist.
     */
    const i = SEITE.indexOf("progressHints');");
    const block = SEITE.slice(i, i + 700);
    assert.ok(!/!s\.erledigt/.test(block),
      "die Hinweise sind auf offene Schritte gefiltert — dann liest der Wartende "
      + "nichts, und das ist der Fall, um den es in M4b.3 geht");
    assert.ok(/filter\(function \(s\) \{ return s\.hinweis; \}\)/.test(block),
      "gefiltert wird nach etwas anderem als dem Vorhandensein des Hinweises");
  });
});

/* ── 3c. M4b.4: die Zeile ist handlungsfaehig, nicht nur lesbar ──────── */

describe("M4b.4 · die Firma sieht WELCHE Faehigkeit wartet — und kommt hin", () => {
  const SKRIPT = fs.readFileSync(
    path.resolve(API, "..", "frontend", "public", "js", "pages", "mitarbeiter.js"), "utf8");

  it("der Bericht traegt Nutzerkennung und die wartenden Bezeichnungen", async () => {
    /* Ohne beides ist die Zeile eine Sackgasse: Grund lesbar, Handlung
       unmoeglich — genau das, was CLAUDE.md unter "Deep-Links statt
       Sackgassen" verbietet. */
    const { unsichtbareKraefte } = await import("../services/marktpraesenzService.js");
    const zeile = { worker_profile_id: "wp-1", user_id: "u-9", name: "Probe",
      wartende_faehigkeiten: [{ skill_id: "s-1", name: "Staplerfahrer" }] };
    PRAESENZ_BEDINGUNGEN.forEach((_, i) => { zeile[`b${i}`] = true; });
    const idx = PRAESENZ_BEDINGUNGEN.findIndex((b) => b.schluessel === "nur_vorschlag");
    zeile[`b${idx}`] = false;
    zeile[`z${idx}`] = 1;
    const [eintrag] = await unsichtbareKraefte({ query: async () => ({ rows: [zeile] }) }, "org-1");
    assert.equal(eintrag.user_id, "u-9", "die Nutzerkennung fehlt — der Hebel haengt am Ladezustand");
    assert.deepEqual(eintrag.wartende_faehigkeiten, [{ skill_id: "s-1", name: "Staplerfahrer" }],
      "die Bezeichnungen fehlen — die Firma muss raten, WELCHE Faehigkeit wartet");
  });

  it("ohne eigenes Konto bleibt die Zeile gueltig — gemessen 9 von 45", async () => {
    /* `user_id` ist nullable. Eine Flaeche, die das nicht traegt, verliert genau
       die Menschen, die ihr Profil selbst gar nicht erfuellen koennen. */
    const { unsichtbareKraefte } = await import("../services/marktpraesenzService.js");
    const zeile = { worker_profile_id: "wp-2", user_id: null, name: "Ohne Konto",
      wartende_faehigkeiten: null };
    PRAESENZ_BEDINGUNGEN.forEach((_, i) => { zeile[`b${i}`] = true; });
    zeile.b2 = false;   // irgendein Grund, damit die Zeile im Bericht erscheint
    const [eintrag] = await unsichtbareKraefte({ query: async () => ({ rows: [zeile] }) }, "org-1");
    assert.equal(eintrag.user_id, null);
    assert.deepEqual(eintrag.wartende_faehigkeiten, [],
      "null wird nicht zu einer leeren Liste — dann wirft die Flaeche beim .map");
  });

  it("die Abfrage liest 'wartend' aus dem gemeinsamen Tor, nicht als Abschrift", () => {
    const dienst = ohneKommentare(quelle("services/marktpraesenzService.js"));
    const i = dienst.indexOf("wartende_faehigkeiten");
    assert.ok(i > 0, "die Spalte fehlt in der Abfrage");
    const block = dienst.slice(Math.max(0, i - 900), i + 60);
    /* DER AUFRUF, NICHT SEIN ERGEBNIS. Die erste Fassung dieser Zeile verglich
       den Quelltext mit `katalogTorSql("pw")` — also mit dem ERZEUGTEN SQL. Im
       Quelltext steht die Einsetzung, nicht ihr Ergebnis; die Probe war rot,
       obwohl der Code richtig war. Dass das Tor wirklich die Aktiv- UND die
       Kuratier-Spalte liefert, prueft `katalogTor.test.js`. */
    assert.ok(block.includes('katalogTorSql("pw")'),
      "die wartenden Faehigkeiten werden mit einer eigenen Fassung von 'freigegeben' bestimmt");
    assert.ok(/NOT \(/.test(block),
      "ohne Negation listet die Spalte die FREIGEGEBENEN — genau umgekehrt");
  });

  it("die Seite nennt die Bezeichnungen, escaped, und nur wenn es welche gibt", () => {
    const i = SKRIPT.indexOf("wartende_faehigkeiten");
    assert.ok(i > 0, "die Seite liest die wartenden Faehigkeiten nicht");
    const block = SKRIPT.slice(i, i + 700);
    assert.ok(/esc\(wartend\.join/.test(block),
      "die Bezeichnungen landen unescaped in innerHTML");
    assert.ok(/wartend\.length\s*\?/.test(block),
      "die Zeile erscheint auch ohne wartende Faehigkeit — eine Ueberschrift ohne Inhalt");
    assert.ok(/mit\.unsichtbar\.wartend/.test(block), "kein uebersetzter Text");
  });

  it("der Hebel nimmt die Kennung aus dem Bericht und behaelt den Rueckfall", () => {
    const i = SKRIPT.indexOf("function oeffneUnsichtbar(");
    assert.ok(i > 0, "der Hebel fehlt");
    const fn = SKRIPT.slice(i, i + 800);
    assert.match(fn, /function oeffneUnsichtbar\(profileId, userIdAusBericht\)/,
      "der Hebel nimmt die Kennung aus dem Bericht nicht an");
    assert.ok(/if \(userIdAusBericht\)/.test(fn),
      "die Kennung aus dem Bericht hat keinen Vorrang — dann haengt der Hebel weiter "
      + "am Ladezustand der Liste");
    assert.ok(/_workers \|\| \[\]/.test(fn),
      "der Rueckfall ist weg — Profile ohne eigenes Konto verlieren ihren Hebel");
  });

  it("der Text steht in BEIDEN Sprachen", () => {
    const treffer = SKRIPT.match(/'mit\.unsichtbar\.wartend':/g) || [];
    assert.equal(treffer.length, 2,
      "der Schluessel fehlt in einer Sprache — dann steht dort der Schluessel selbst");
  });
});

/* ── 4. Das Abzeichen rechnet mit der Beziehung, nicht mit dem Spiegel ─ */

describe("M4b.3 · 'Profil x %' liest die Wahrheit", () => {
  /** Attrappe: antwortet je Abfrage nach ihrem Text. */
  function pool({ skillAnzahl, spiegel }) {
    const gesehen = [];
    const query = async (sql, params) => {
      const s = String(sql);
      gesehen.push(s);
      if (/FROM worker_profile_skills/i.test(s) && /count\(\*\)/i.test(s)) {
        return { rows: [{ anzahl: skillAnzahl }] };
      }
      if (/FROM worker_profiles/i.test(s)) {
        return { rows: [{
          id: "wp-1", user_id: params?.[0] || "u-1", supplier_org_id: "org-1",
          first_name: "Ann", last_name: "Berg", email: "a@b.de", phone: "+4915112345",
          city: "Berlin", skill_tags: spiegel, qualifications: [], profile_text: "Text",
          public_profile_fields: [], profile_public: false
        }] };
      }
      if (/FROM organizations/i.test(s)) return { rows: [{ supplier_org_name: "Agentur" }] };
      return { rows: [] };
    };
    return { gesehen, query, connect: async () => ({ query, release() {} }) };
  }

  it("Faehigkeiten in der Beziehung zaehlen, auch wenn der Spiegel leer ist", async () => {
    /*
     * DER GEMESSENE FALL: 8 von 45 Profilen genau so — Beziehung gefuellt,
     * Spiegel leer. Vorher fehlte diesen acht ein Haken von acht, dauerhaft.
     */
    const mitSpiegel = pool({ skillAnzahl: 2, spiegel: ["Pflege"] });
    const ohneSpiegel = pool({ skillAnzahl: 2, spiegel: [] });
    const a = await getWorkerHub(mitSpiegel, "u-1");
    const b = await getWorkerHub(ohneSpiegel, "u-1");
    assert.ok(a, "der Hub hat nichts geliefert — die Attrappe passt nicht mehr");
    assert.equal(b.profile_completion_percent, a.profile_completion_percent,
      "der leere Spiegel senkt den Prozentsatz weiter — dann zaehlt das Abzeichen "
      + "den Spiegel statt der Beziehung");
  });

  it("ohne Faehigkeit sinkt er wirklich — sonst prueft die Zusicherung oben nichts", () => {
    /* Eine Gleichheits-Zusicherung ist leer gruen, wenn der Wert sich NIE
       aendert. Also der Gegenbeweis: 0 Faehigkeiten muessen weniger ergeben. */
    return Promise.all([
      getWorkerHub(pool({ skillAnzahl: 2, spiegel: [] }), "u-1"),
      getWorkerHub(pool({ skillAnzahl: 0, spiegel: [] }), "u-1")
    ]).then(([mit, ohne]) => {
      assert.ok(ohne.profile_completion_percent < mit.profile_completion_percent,
        "die Faehigkeit wirkt gar nicht auf den Prozentsatz — dann sagt die Probe "
        + "darueber nichts aus");
    });
  });

  it("der Hub fragt die Zahl wirklich ab und gibt sie weiter", () => {
    const code = ohneKommentare(quelle("services/workerService.js"));
    const hub = code.slice(code.indexOf("export async function getWorkerHub"));
    assert.ok(hub.includes("FROM worker_profile_skills WHERE worker_profile_id"),
      "der Hub zaehlt die Beziehung nicht");
    assert.ok(/skillAnzahl:/.test(hub),
      "die Zahl wird gezaehlt, aber nicht weitergegeben — genau so sah der "
      + "Befund aus, bei dem eine Zahl in einer Log-Zeile landete und weg war");
  });
});
