/**
 * Die EINE Wahrheit fuer "aktiv" auf capacity_posts (Posten 5, Vorarbeit zu M4b.3).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WAS HIER FALSCH WAR — GEMESSEN, NICHT VERMUTET
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * "Aktiv" hatte mehrere Definitionen, und sie widersprachen sich in den Daten.
 * Gemessen an der Entwicklungsdatenbank am 2026-10-03, 52 Angebote:
 *
 *   status = 'active' UND is_active = TRUE    10
 *   status = 'active' ABER is_active = FALSE   2   <-- der Widerspruch
 *   is_active = TRUE  ABER status <> 'active'  0   <-- nie, in keiner Zeile
 *
 * Die dritte Zeile ist der Beweis, dass das Flag keine eigene Information
 * traegt. Und die Festlegung stand laengst im Code: `isEffectivelyActive` sagt
 * woertlich "for backward compatibility. Active capacity posts = status
 * 'active'." Die Leseseite hat sie nur nie benutzt.
 *
 * Der Schaden war groesser als "zwei Matching-Wege": unsichtbar waren die zwei
 * Angebote auch fuer die Preisfindung, zwei Zaehlungen im Lieferantenpool, den
 * Match-Anstoss und drei Kennzahlen. Und der Disponent verlor SECHS reservierte
 * Angebote, weil `status IN ('active','reserved')` und
 * `is_active IS DISTINCT FROM FALSE` sich gegenseitig aufhoben.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM DIE RATSCHE HIER STEHT UND NICHT NUR EIN "BENUTZT DAS MODUL"
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Eine Probe, die nur prueft, dass die Aufrufstellen das Modul einbinden, bleibt
 * gruen, wenn jemand DANEBEN eine neue eigene Abschrift schreibt. Genau so ist
 * dieser Defekt entstanden. Deshalb zaehlt Abschnitt 3 die verbliebenen rohen
 * Bedingungen gegen GEMESSENE Obergrenzen — und jede Ausnahme traegt ihren
 * Grund. Die Liste darf kuerzer werden, nie laenger (Gegenprobe wie bei U6.7).
 *
 * OHNE DATENBANK: alles hier ist statisch lesbar oder laeuft gegen einen
 * Spion-Pool.
 *
 * Run: node --test --test-force-exit test/eineWahrheitAktiv.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  angebotAktivSql,
  ANGEBOT_ZUSTAENDE,
  MARKT_AKTIV,
  MARKT_BESETZBAR
} from "../services/angebotAktivSql.js";
import { isEffectivelyActive, CAPACITY_POST_TRANSITIONS } from "../services/capacityWorkflow.js";

/* Pfade IMMER relativ zur Testdatei — sonst haengt das Ergebnis am
   Startverzeichnis und die Probe ueberspringt sich je nach cwd lautlos. */
const HIER = path.dirname(fileURLToPath(import.meta.url));
const API = path.resolve(HIER, "..");
const quelle = (rel) => fs.readFileSync(path.join(API, rel), "utf8");
const ohneKommentare = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function alleQuelldateien(rel, out = []) {
  for (const e of fs.readdirSync(path.join(API, rel), { withFileTypes: true })) {
    const unter = `${rel}/${e.name}`;
    if (e.isDirectory()) alleQuelldateien(unter, out);
    else if (e.name.endsWith(".js")) out.push(unter);
  }
  return out;
}
const QUELLEN = [...alleQuelldateien("services"), ...alleQuelldateien("routes")];

/* ── 1. Das Modul selbst ─────────────────────────────────────────────── */

describe("Posten 5 · das Modul nennt status, nicht das Flag", () => {
  it("eine Zustandsmenge wird zu einem Vergleich, mehrere zu IN", () => {
    assert.equal(angebotAktivSql("cp"), "cp.status = 'active'");
    assert.equal(angebotAktivSql("cp", MARKT_BESETZBAR), "cp.status IN ('active', 'reserved')");
  });

  it("es nennt das Flag NICHT — sonst waere der Widerspruch nur umgezogen", () => {
    for (const menge of [MARKT_AKTIV, MARKT_BESETZBAR]) {
      assert.ok(!/is_active/.test(angebotAktivSql("cp", menge)),
        "das Modul liest wieder is_active — dann traegt es den Widerspruch weiter");
    }
  });

  it("der Alias wird uebernommen, nicht fest verdrahtet", () => {
    /* Ohne das waere das Modul an eine Abfrageform gebunden, und die naechste
       Stelle schriebe wieder ihre eigene Bedingung. Ein reiner Tabellenname
       muss gehen: nicht jede Abfrage setzt einen Alias. */
    assert.match(angebotAktivSql("x"), /^x\.status/);
    assert.match(angebotAktivSql("capacity_posts"), /^capacity_posts\.status/);
    assert.match(angebotAktivSql(), /^cp\.status/, "ohne Angabe fehlt der Vorgabe-Alias");
  });

  it("die Notbremsen greifen — ein Tippfehler darf nicht lautlos nichts treffen", () => {
    /* Eine Liste, die nichts trifft, sieht wie eine leere Datenbank aus. Genau
       daran ist dieser Defekt monatelang unbemerkt geblieben. */
    assert.throws(() => angebotAktivSql("cp; DROP TABLE"), /ANGEBOT_ALIAS_UNGUELTIG/);
    assert.throws(() => angebotAktivSql("cp", []), /ANGEBOT_ZUSTAENDE_LEER/);
    assert.throws(() => angebotAktivSql("cp", ["aktiv"]), /ANGEBOT_ZUSTAND_UNBEKANNT/);
  });

  it("die Listen sind eingefroren", () => {
    assert.ok(Object.isFrozen(ANGEBOT_ZUSTAENDE));
    assert.ok(Object.isFrozen(MARKT_AKTIV));
    assert.ok(Object.isFrozen(MARKT_BESETZBAR));
  });
});

/* ── 2. Die Paar-Invariante mit der BESTEHENDEN Wahrheit ─────────────── */

describe("Posten 5 · das Modul und capacityWorkflow sagen dasselbe", () => {
  it("MARKT_AKTIV ist genau das, was isEffectivelyActive meint", () => {
    /*
     * DIE WICHTIGSTE ZUSICHERUNG DIESER DATEI. Das Modul erfindet keine neue
     * Definition, es setzt die vorhandene durch. Laufen die beiden
     * auseinander, ist der Widerspruch zurueck — nur eine Ebene hoeher und
     * schwerer zu bemerken, weil beide Seiten fuer sich plausibel aussehen.
     */
    for (const z of ANGEBOT_ZUSTAENDE) {
      assert.equal(isEffectivelyActive(z), MARKT_AKTIV.includes(z),
        `Zustand ${z}: Modul und capacityWorkflow widersprechen sich`);
    }
  });

  it("die Zustandsliste ist die der Uebergangstabelle — nicht eine zweite Abschrift", () => {
    assert.deepEqual(
      [...ANGEBOT_ZUSTAENDE].sort(),
      Object.keys(CAPACITY_POST_TRANSITIONS).sort(),
      "ANGEBOT_ZUSTAENDE und CAPACITY_POST_TRANSITIONS sind auseinandergelaufen"
    );
  });

  it("die breitere Menge ist durch die Uebergangstabelle gedeckt", () => {
    /* 'reserved' darf nur mitzaehlen, wenn es auch zurueck nach 'active' kann —
       sonst waere es ein Endzustand und der Disponent wartete auf nichts. */
    assert.ok(MARKT_BESETZBAR.includes("reserved"));
    assert.ok(CAPACITY_POST_TRANSITIONS.reserved.includes("active"),
      "'reserved' kann nicht zurueck nach 'active' — dann gehoert es nicht in MARKT_BESETZBAR");
    for (const z of MARKT_AKTIV) {
      assert.ok(MARKT_BESETZBAR.includes(z), "die breitere Menge enthaelt die engere nicht");
    }
  });
});

/* ── 3. Jede Lesestelle benutzt es — mit Ratsche ─────────────────────── */

/**
 * Wer `capacity_posts` nach Aktivitaet filtert, bindet das Modul ein. Die Zahl
 * ist die GEMESSENE Zahl der Aufrufe je Datei (2026-10-03); sie steht hier,
 * damit ein entfernter Aufruf rot wird und nicht nur ein entfernter Import.
 */
const LESER = Object.freeze({
  "services/instantMatchService.js": 1,
  "services/matchingEngine.js": 1,
  "services/matchTriggerService.js": 1,
  "services/marketplaceService.js": 2,
  "services/capacityDiscoveryService.js": 5,
  "services/searchService.js": 3,
  "services/smartPricingService.js": 1,
  "services/vendorPoolService.js": 2,
  "services/entitlementService.js": 1,
  "services/usageMeteringService.js": 1,
  "services/workerOfferReservationService.js": 2,
  "services/workerService.js": 1,
  "services/capacityExchangeService.js": 11,
  "services/adminControlCenterService.js": 1,
  "services/reportingService.js": 1,
  "routes/admin.js": 1
});

describe("Posten 5 · jede Lesestelle geht durch das Modul", () => {
  for (const [datei, anzahl] of Object.entries(LESER)) {
    it(`${datei} bindet es ein und ruft es ${anzahl}-mal`, () => {
      const code = ohneKommentare(quelle(datei));
      assert.match(code, /import \{[^}]*angebotAktivSql[^}]*\} from "[^"]*angebotAktivSql\.js"/,
        "die Datei hat womoeglich eine eigene Fassung der Bedingung");
      assert.equal((code.match(/angebotAktivSql\(/g) || []).length, anzahl,
        "die Zahl der Aufrufe hat sich geaendert — eine Stelle ist zurueckgefallen oder neu dazugekommen");
    });
  }

  it("das Modul steht an EINER Stelle, nicht als Kopie", () => {
    const modul = quelle("services/angebotAktivSql.js");
    assert.equal((modul.match(/export function angebotAktivSql/g) || []).length, 1);
    let erzeuger = 0;
    for (const f of QUELLEN) {
      if (f.endsWith("angebotAktivSql.js")) continue;
      if (/export function angebotAktivSql/.test(quelle(f))) erzeuger++;
    }
    assert.equal(erzeuger, 0, "es gibt eine zweite Fassung des Moduls");
  });
});

describe("Posten 5 · die Ratsche: keine neue eigene Abschrift", () => {
  /**
   * Die Ausnahmen, je mit Grund. GEMESSEN am 2026-10-03. Diese Liste darf
   * kuerzer werden, NIE laenger — wie bei U6.7.
   */
  const FLAG_PROJEKTIONEN = Object.freeze([
    /* Beide geben `is_active` nur AUS, sie filtern nicht danach. Das Feld aus
       der Antwort zu nehmen waere eine Formataenderung an der Schnittstelle und
       gehoert nicht in diese Welle — benannt, damit es nicht als Rest aussieht. */
    "services/searchService.js",
    "routes/profileVisibility.js"
  ]);

  it("das Flag wird nur noch AUSGEGEBEN, nirgends mehr gefiltert", () => {
    const gefunden = [];
    for (const f of QUELLEN) {
      const code = ohneKommentare(quelle(f));
      for (const _ of code.matchAll(/\b(cp|cpe|cpz)\.is_active\b/g)) gefunden.push(f);
    }
    assert.deepEqual(gefunden.sort(), [...FLAG_PROJEKTIONEN].sort(),
      "es liest wieder jemand capacity_posts.is_active — gemessen waren es genau die "
      + "zwei Projektionen. Eine neue Lesestelle bringt den Widerspruch zurueck");
  });

  it("die JS-Seite des Matchings benutzt isEffectivelyActive statt eines Handvergleichs", () => {
    /*
     * `matchingEngine` widersprach sich SELBST: die Auswahl las `is_active` im
     * SQL, die Sichtbarkeitspruefung verglich `status` von Hand. Zwei
     * Definitionen in EINER Datei — und nur eine davon war die dokumentierte.
     * Fuer SQL gibt es dieses Modul, fuer JavaScript `isEffectivelyActive`:
     * zwei Formen, EINE Wahrheit, beide benannt statt abgeschrieben.
     */
    const code = ohneKommentare(quelle("services/matchingEngine.js"));
    assert.match(code, /import \{ isEffectivelyActive \} from "\.\/capacityWorkflow\.js"/,
      "die JS-Seite bindet die kanonische Ableitung nicht ein");
    assert.match(code, /isEffectivelyActive\(String\(cp\.status\)\)/,
      "die Sichtbarkeitspruefung benutzt die Ableitung nicht");
    assert.ok(!/cp\.status\)?\s*===?\s*["']active["']/.test(code),
      "es steht wieder ein Handvergleich auf cp.status im Code");
  });

  it("die Begruendung der Ratsche steht im Modul — sonst entfernt sie der naechste Umbau", () => {
    /*
     * ABSICHTLICH OHNE Kommentar-Entfernung: hier IST der Kommentar der
     * Gegenstand. Ein Riegel ohne nachlesbaren Grund wird beim naechsten Umbau
     * als Ballast entfernt — das ist in diesem Projekt schon passiert.
     */
    const modul = quelle("services/angebotAktivSql.js");
    for (const beleg of [
      "RESERVE_SQL",                              /* woher die Gegenrichtung kommt */
      "Doppelbuchung",                            /* was sie anrichtet */
      "replaces simple is_active boolean",        /* der Beleg aus Migration 021 */
      "isEffectivelyActive"                       /* die kanonische Ableitung */
    ]) {
      assert.ok(modul.includes(beleg),
        `die Begruendung "${beleg}" fehlt im Modulkopf — ohne sie sieht die `
        + "Zusammenfuehrung wie Geschmack aus statt wie ein Befund");
    }
  });

  it("die Belegungs-Mengen der Automatik sind WEITER als MARKT_AKTIV — und bleiben es", async () => {
    /*
     * BEGRUENDETER NICHT-TREFFER, damit niemand ihn "mitvereinheitlicht".
     * `marktpraesenzService` fragt per NOT EXISTS, ob fuer diese Faehigkeit
     * schon ein Eintrag den Platz BESETZT — und benutzt dafuer eigene, benannte
     * Mengen (`OFFENE_ZUSTAENDE`, `BELEGENDE_ZUSTAENDE`). Das ist KEINE
     * Aktivitaetsfrage: ein Entwurf ist im Markt unsichtbar und besetzt den
     * Platz trotzdem — genau der Entwurfs-Riegel aus M4c.8/M4c.9. Wer diese
     * Mengen durch MARKT_AKTIV ersetzt, laesst die Automatik Zwillinge zu
     * bestehenden Entwuerfen anlegen.
     *
     * Geprueft wird die MENGEN-INVARIANTE, nicht der Wortlaut des SQL: ein
     * Textvergleich waere beim naechsten Umformatieren rot, ohne dass sich etwas
     * geaendert haette.
     */
    const mp = await import("../services/marktpraesenzService.js");
    for (const [name, menge] of [["OFFENE_ZUSTAENDE", mp.OFFENE_ZUSTAENDE],
                                 ["BELEGENDE_ZUSTAENDE", mp.BELEGENDE_ZUSTAENDE]]) {
      assert.ok(Array.isArray(menge) && menge.length > 0, `${name} fehlt`);
      assert.ok(Object.isFrozen(menge), `${name} ist nicht eingefroren`);
      for (const z of menge) {
        assert.ok(ANGEBOT_ZUSTAENDE.includes(z),
          `${name} nennt den Zustand ${z}, den der Lebenszyklus nicht kennt — Tippfehler`);
      }
      for (const z of MARKT_AKTIV) {
        assert.ok(menge.includes(z),
          `${name} enthaelt ${z} nicht — dann legt die Automatik Zwillinge zu bestehenden Angeboten an`);
      }
      assert.ok(menge.includes("draft"),
        `${name} kennt 'draft' nicht mehr — der Entwurfs-Riegel aus M4c.9 faellt weg, `
        + "und die Automatik doppelt jeden Entwurf");
      assert.ok(menge.length > MARKT_AKTIV.length,
        `${name} ist auf die Aktiv-Menge verengt worden — Belegung ist eine ANDERE Frage`);
    }
    assert.ok(mp.BELEGENDE_ZUSTAENDE.length > mp.OFFENE_ZUSTAENDE.length,
      "BELEGENDE_ZUSTAENDE ist nicht mehr weiter als OFFENE_ZUSTAENDE — dann zaehlt "
      + "ein gebuchtes Angebot nicht mehr als belegt");
  });

  it("ein Datenwaechter auf 'null Abweichung' waere FALSCH — und das gehoert festgehalten", () => {
    /*
     * DER NAHELIEGENDE NAECHSTE SCHRITT IST EINE FALLE, deshalb steht er hier
     * als Zusicherung und nicht als Idee.
     *
     * Verlockend: eine datenbankgebundene Probe, die `0` Zeilen mit
     * `is_active IS DISTINCT FROM (status = 'active')` verlangt. Sie waere ein
     * Fehlalarm-Erzeuger: RESERVE_SQL setzt `status = 'paused'` und laesst das
     * Flag auf TRUE — nach JEDER Reservierung waere sie rot, ohne dass etwas
     * kaputt ist. Denn seit dieser Welle liest niemand das Flag mehr.
     *
     * Die haltbare Behauptung ist deshalb "KEINE LESER", nicht "keine
     * Abweichung" — und genau die erzwingen die Proben oben. Diese Begruendung
     * steht im Modulkopf; hier wird nur sichergestellt, dass sie dort bleibt.
     */
    const modul = quelle("services/angebotAktivSql.js");
    assert.ok(modul.includes("RESERVE_SQL"),
      "der Modulkopf nennt die Quelle der Gegenrichtung nicht mehr — dann baut die "
      + "naechste Sitzung einen Datenwaechter, der bei jeder Reservierung rot wird");
  });

  it("die oeffentliche Spaltenliste gibt das Flag weiter — benannt, nicht verschwiegen", () => {
    /*
     * DAMIT NIEMAND DIESE DATEI SO LIEST, ALS HAETTE DAS FLAG KEINE LESER MEHR.
     * `capacityPostOeffentlicheSpalten` fuehrt `is_active` in der Spaltenliste,
     * also bekommt jeder Aufrufer der Schnittstelle es weiter geliefert — als
     * Ausgabe, nicht als Filter. Die Spalte aus der Antwort zu nehmen ist eine
     * Formataenderung an der Schnittstelle und gehoert nicht in diese Welle.
     *
     * Sie steht hier festgenagelt, damit ihre Entfernung eine ABSICHTLICHE
     * Handlung ist und nicht aus Versehen passiert — und damit sichtbar bleibt,
     * dass der Spiegel noch existiert, auch wenn ihn keine Bedingung mehr liest.
     */
    const spalten = quelle("services/capacityPostOeffentlicheSpalten.js");
    assert.match(spalten, /"is_active"/,
      "die Spalte ist aus der oeffentlichen Liste verschwunden — das aendert die "
      + "Antwort der Schnittstelle und braucht eine eigene Entscheidung");
    assert.match(spalten, /"status"/,
      "die Wahrheitsspalte fehlt in der oeffentlichen Liste");
  });

  it("niemand schreibt die Aktiv-Bedingung mit Alias mehr von Hand", () => {
    const gefunden = [];
    for (const f of QUELLEN) {
      const code = ohneKommentare(quelle(f));
      for (const m of code.matchAll(/\b(cp|cpe|cpz)\.status\s*=\s*'active'/g)) {
        gefunden.push(`${f} :: ${m[0]}`);
      }
    }
    assert.deepEqual(gefunden, [],
      "eine alias-gebundene Aktiv-Bedingung steht wieder von Hand im SQL");
  });

  it("das Flag wird nur an der EINEN bekannten Stelle geschrieben", () => {
    /* `workerService` haelt bei Teilbesetzung das Flag nach, damit die
       Matching-Sichtbarkeit erhalten bleibt. Genau diese Reparaturschreibung
       war der Beweis, dass das Flag ein Spiegel ist und keine eigene
       Bedeutung hat. Sie ist jetzt wirkungslos, aber harmlos. */
    const gefunden = [];
    for (const f of QUELLEN) {
      for (const z of ohneKommentare(quelle(f)).split("\n")) {
        if (/capacity_posts/.test(z) && /is_active\s*=\s*TRUE/i.test(z)) gefunden.push(f);
      }
    }
    assert.deepEqual(gefunden, ["services/workerService.js"],
      "eine neue Stelle setzt capacity_posts.is_active auf TRUE — damit kann das "
      + "Flag wieder von status abweichen");
  });

  it("die Zustands-Aufschluesselungen bleiben roh, und es sind genau sechs", () => {
    /* `FILTER (WHERE status = 'active')` neben 'expired'/'filled'/'reserved'
       fragt nicht "ist das aktiv?", sondern zaehlt je Zustand. Das Modul
       daneben waere unleserlicher statt sauberer — aber die ZAHL steht fest,
       damit hier keine echte Filterbedingung einsickert. */
    const code = ohneKommentare(quelle("services/capacityExchangeService.js"));
    const roh = code.match(/(?<![.\w])status\s*=\s*'active'/g) || [];
    assert.equal(roh.length, 6,
      "die Zahl der rohen Aktiv-Bedingungen in capacityExchangeService hat sich geaendert");
    for (const m of code.matchAll(/(?<![.\w])status\s*=\s*'active'/g)) {
      const vorher = code.slice(Math.max(0, m.index - 60), m.index);
      assert.match(vorher, /FILTER \(WHERE $/,
        "eine rohe Aktiv-Bedingung steht AUSSERHALB einer Zustands-Aufschluesselung");
    }
  });
});

/* ── 4. Das erzeugte SQL, nicht nur der Quelltext ────────────────────── */

describe("Posten 5 · die Einsetzung landet im SQL, nicht woertlich darin", () => {
  it("keine Einsetzung steht in einer normalen Zeichenkette", () => {
    /*
     * Die Quelltext-Proben oben blieben auch dann gruen, wenn die Einsetzung in
     * einer Zeichenkette mit Anfuehrungszeichen staende — dann bekaeme Postgres
     * die Zeichen woertlich, und `node --check` bemerkt es nicht.
     *
     * Eine Zeichenkette mit " oder ' kann keine Zeile umspannen. Also MUSS ihr
     * oeffnendes Anfuehrungszeichen auf derselben Zeile stehen — eine
     * Zeilenpruefung ist hier vollstaendig, nicht nur eine Stichprobe.
     *
     * ERSTE FASSUNG WAR SPROEDE, und das ist der lehrreiche Teil. Sie suchte
     * ein Anfuehrungszeichen IRGENDWO vor der Einsetzung. Das traf in
     * `matchingEngine.js` das SCHLIESSENDE Zeichen eines Aufrufs
     * (`cpSpaltenSql("capacity_posts")`) und meldete ein Template-Literal als
     * normale Zeichenkette. Eine Pruefung, die oeffnende und schliessende
     * Zeichen nicht unterscheidet, kann die Frage nicht beantworten.
     *
     * Jetzt wird die PARITAET gezaehlt: eine ungerade Zahl gleicher
     * Anfuehrungszeichen vor der Einsetzung heisst "eine Zeichenkette ist offen".
     * In SQL stehen Apostrophe immer paarweise ('active'), deshalb traegt das.
     * Den belastbaren Beweis liefert ohnehin der Spion-Pool darunter — diese
     * Probe deckt die Stellen ab, die sich nicht billig antreiben lassen.
     */
    const schlecht = [];
    for (const f of QUELLEN) {
      for (const z of ohneKommentare(quelle(f)).split("\n")) {
        const stelle = z.indexOf("${angebotAktivSql");
        if (stelle < 0) continue;
        const vor = z.slice(0, stelle);
        const offen = (s) => ((vor.match(s) || []).length % 2) === 1;
        if (offen(/"/g) || offen(/'/g)) schlecht.push(`${f} :: ${z.trim().slice(0, 80)}`);
      }
    }
    assert.deepEqual(schlecht, [],
      "die Einsetzung sitzt in einer normalen Zeichenkette statt in einem Template-Literal");
  });

  function spionPool() {
    const gesehen = [];
    const antworte = async (sql) => { gesehen.push(String(sql)); return { rows: [], rowCount: 0 }; };
    return { gesehen, query: antworte, connect: async () => ({ query: antworte, release() {} }) };
  }

  const ORG = "11111111-1111-4111-8111-111111111111";

  /** Stellen, die sich billig und ohne Datenbank antreiben lassen. */
  const ANTRIEBE = [
    ["Disponenten-Sicht", async (pool) => {
      const m = await import("../services/workerService.js");
      return m.getUnassignedCapacityPosts(pool, ORG);
    }],
    ["Preisfindung", async (pool) => {
      const m = await import("../services/smartPricingService.js");
      return m.getSupplyRateStats(pool, "Lagerhelfer", "Berlin");
    }],
    ["ueberfaellige Eintraege", async (pool) => {
      const m = await import("../services/capacityExchangeService.js");
      return m.findStaleEntries(pool, 7, 10);
    }]
  ];

  for (const [name, antrieb] of ANTRIEBE) {
    it(`${name}: das erzeugte SQL nennt status und kein Dollarzeichen-Geruest`, async () => {
      const pool = spionPool();
      await antrieb(pool).catch(() => {});
      const mit = pool.gesehen.filter((s) => /capacity_posts/.test(s));
      assert.ok(mit.length >= 1, "die Stelle hat capacity_posts gar nicht gefragt");
      for (const sql of mit) {
        assert.ok(!sql.includes("${"),
          `die Einsetzung steht woertlich im SQL: ${sql.slice(0, 160)}`);
      }
      assert.ok(mit.some((s) => /status (=|IN)/.test(s)),
        "im erzeugten SQL steht keine status-Bedingung");
    });
  }

  it("die Disponenten-Sicht fragt nach BEIDEN Zustaenden — der tote Zweig lebt", async () => {
    /*
     * Der eigentliche Defekt: `status IN ('active','reserved')` stand da, und
     * `AND cp.is_active IS DISTINCT FROM FALSE` loeschte die reservierten
     * Zeilen wieder weg, weil isEffectivelyActive('reserved') falsch ist.
     * Gemessen: 6 reservierte Angebote, alle mit is_active = FALSE — das
     * 'reserved' war toter Code.
     */
    const pool = spionPool();
    const m = await import("../services/workerService.js");
    await m.getUnassignedCapacityPosts(pool, ORG).catch(() => {});
    const sql = pool.gesehen.find((s) => /capacity_posts/.test(s) && /status IN/.test(s));
    assert.ok(sql, "die Disponenten-Sicht fragt nicht mehr nach mehreren Zustaenden");
    assert.match(sql, /status IN \('active', 'reserved'\)/);
    /*
     * NUR cp.is_active, nicht irgendein is_active: dieselbe Abfrage liest
     * voellig zu Recht `wal.is_active` auf `worker_assignment_links` — nur
     * LEBENDE Verknuepfungen halten einen Posten belegt. Die erste Fassung
     * dieser Zusicherung verbot jedes `is_active` und wurde dadurch rot, obwohl
     * der Code richtig war: sie traf den falschen Gegenstand.
     */
    assert.ok(!/cp\.is_active/.test(sql),
      "das Flag steht wieder in der Abfrage — dann sind die reservierten Angebote "
      + "erneut unsichtbar und das 'reserved' erneut toter Code");
    assert.ok(!/IS DISTINCT FROM FALSE/.test(sql),
      "die Bedingung, die das 'reserved' aufgehoben hat, ist zurueck");
    assert.match(sql, /wal\.is_active = TRUE/,
      "die Verknuepfungs-Bedingung ist mit verschwunden — dann halten auch "
      + "verfallene Zeilen den Posten aus der Liste heraus");
  });
});
