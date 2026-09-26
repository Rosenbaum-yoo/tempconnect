/**
 * Die Unsichtbarkeits-Zahl bekommt einen Verbraucher (2026-09-02).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DER BEFUND
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `sweepMarktpraesenz` misst bei JEDEM Lauf mit, wie viele aktive Kraefte gar
 * nicht materialisiert werden koennen — sie haben keine Katalog-Faehigkeit
 * oder keinen gepflegten Ort und sind am Markt unauffindbar. Gemessen am
 * 2026-09-02 gegen die laufende Datenbank: **30 von 33**.
 *
 * Diese Zahl ging an ihren Aufrufer, landete im Antwortkoerper von
 * `POST /internal/staffing-maintenance` und in einer Log-Zeile — und war mit
 * der naechsten Log-Rotation weg. Der M0-Bericht hat das als Punkt 29
 * festgehalten. Das Doku-Dokument der J-Welle behauptet, sie speise
 * "Aufsicht (J6) und Agentur-Hinweis (J2c)" — beide Verbraucher gibt es nicht.
 *
 * Ein Befund, den niemand sieht, ist derselbe stille Ausfall wie ein
 * Automatismus, der nie laeuft.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM DIE ERSTE PROBE DIE WICHTIGSTE IST
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Die Anzeige liest denselben Bestand wie der Sweep. Zwei Stellen, die
 * "unsichtbar" definieren, waeren genau die Doppelung, die M1.7 am selben Tag
 * geloescht hat — dort gewann die zweite Tabelle, weil sie im Schreibpfad
 * stand, und sperrte eine PRO-Agentur bei der 51. Anzeige. Deshalb steht die
 * Bedingung EINMAL, und beide Abfragen setzen dieselben Konstanten ein.
 *
 * Run: node --test --test-force-exit test/marktSichtbarkeit.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  marktSichtbarkeit, sweepMarktpraesenz,
  PRAESENT_SQL, OHNE_SKILL_SQL, OHNE_ORT_SQL, SICHTBARKEIT_HINWEIS
} from "../services/marktpraesenzService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = path.resolve(__dirname, "..");
const quelle = (rel) => fs.readFileSync(path.join(API, rel), "utf8");
const ohneKommentare = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function musterPool(fn) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql: String(sql || ""), params: params || [] });
      const r = fn ? await fn(String(sql || "")) : null;
      return r === undefined || r === null ? { rows: [], rowCount: 0 } : r;
    }
  };
}

/** Die echte Lage vom 2026-09-02: 33 aktive Kraefte, 30 ohne Faehigkeit. */
const ECHTE_LAGE = [
  { org_id: "o-demo", name: "Demo Zeitarbeit GmbH", aktive: 12, ohne_skill: 10, ohne_ort: 0 },
  { org_id: "o-za", name: "Zeitarbeit", aktive: 7, ohne_skill: 6, ohne_ort: 0 },
  { org_id: "o-el", name: "ElektroStaff GmbH", aktive: 3, ohne_skill: 3, ohne_ort: 0 },
  { org_id: "o-pk", name: "PilotPK4", aktive: 2, ohne_skill: 2, ohne_ort: 0 },
  { org_id: "o-tg", name: "topGo", aktive: 2, ohne_skill: 2, ohne_ort: 0 },
  { org_id: "o-e1", name: "E2E Zeitarbeit GmbH", aktive: 7, ohne_skill: 7, ohne_ort: 0 }
];

/* ── Eine Wahrheit ────────────────────────────────────────────────────── */

describe("M-Nachtrag · Sweep und Anzeige benutzen DIESELBE Bedingung", () => {
  it("die Bedingungen stehen einmal und werden exportiert", () => {
    for (const [name, wert] of [["PRAESENT_SQL", PRAESENT_SQL],
                                ["OHNE_SKILL_SQL", OHNE_SKILL_SQL],
                                ["OHNE_ORT_SQL", OHNE_ORT_SQL]]) {
      assert.equal(typeof wert, "string", `${name} fehlt`);
      assert.ok(wert.length > 20, `${name} ist verdaechtig kurz`);
    }
    assert.match(PRAESENT_SQL, /wp\.is_active = TRUE/);
    assert.match(PRAESENT_SQL, /wp\.marktpraesenz_deaktiviert = FALSE/);
  });

  it("KEINE der beiden Abfragen bringt ihre eigene Fassung mit", () => {
    /*
     * Die Kernprobe. Waere die Bedingung an zwei Stellen ausgeschrieben,
     * liefen sie beim naechsten Umbau auseinander — und die Anzeige zeigte
     * eine andere Wahrheit als der Sweep, ohne dass es jemand merkt.
     */
    const s = ohneKommentare(quelle("services/marktpraesenzService.js"));
    const ausgeschrieben = (s.match(/NOT EXISTS \(SELECT 1 FROM worker_profile_skills/g) || []);
    assert.equal(ausgeschrieben.length, 1,
      `die Faehigkeits-Bedingung steht ${ausgeschrieben.length}x ausgeschrieben — erlaubt ist genau die Konstante`);

    const praesent = (s.match(/wp\.is_active = TRUE AND wp\.marktpraesenz_deaktiviert = FALSE/g) || []);
    assert.equal(praesent.length, 1,
      `die Praesenz-Bedingung steht ${praesent.length}x ausgeschrieben`);
  });

  it("beide Abfragen setzen die Konstanten wirklich ein", async () => {
    const sweepPool = musterPool(() => ({ rows: [{ ohne_skill: 30, ohne_ort: 0 }], rowCount: 0 }));
    await sweepMarktpraesenz(sweepPool);
    const lueckenAbfrage = sweepPool.calls.find((c) => c.sql.includes("ohne_skill"));
    assert.ok(lueckenAbfrage, "die Lueckenabfrage des Sweeps fehlt");

    const lesePool = musterPool(() => ({ rows: [] }));
    await marktSichtbarkeit(lesePool);
    const leseAbfrage = lesePool.calls[0];
    assert.ok(leseAbfrage, "die Leseabfrage fehlt");

    for (const [name, teil] of [["Praesenz", PRAESENT_SQL],
                                ["ohne Faehigkeit", OHNE_SKILL_SQL],
                                ["ohne Ort", OHNE_ORT_SQL]]) {
      assert.ok(lueckenAbfrage.sql.includes(teil), `dem Sweep fehlt: ${name}`);
      assert.ok(leseAbfrage.sql.includes(teil), `der Anzeige fehlt: ${name}`);
    }
  });

  it("die beiden Gruende schliessen einander aus", () => {
    /* Sonst waere ihre Summe groesser als die Zahl der Kraefte, und
     * "unsichtbar" ueberzeichnete den Befund. */
    assert.match(OHNE_ORT_SQL, /EXISTS \(SELECT 1 FROM worker_profile_skills/,
      "ohne_ort muss die Faehigkeit voraussetzen, sonst zaehlt es doppelt");
    assert.ok(!OHNE_ORT_SQL.includes("NOT EXISTS"));
  });
});

/* ── Die Anrufliste ───────────────────────────────────────────────────── */

describe("M-Nachtrag · aus der Zahl wird eine Anrufliste", () => {
  it("AN DER ECHTEN LAGE: 33 aktive, 30 unsichtbar", async () => {
    const pool = musterPool(() => ({ rows: ECHTE_LAGE }));
    const stand = await marktSichtbarkeit(pool);
    assert.equal(stand.verfuegbar, true);
    assert.equal(stand.gesamt.aktive, 33);
    assert.equal(stand.gesamt.ohne_skill, 30);
    assert.equal(stand.gesamt.unsichtbar, 30);
  });

  it("die groesste Betroffenheit steht oben — das ist der erste Anruf", async () => {
    const pool = musterPool(() => ({ rows: ECHTE_LAGE }));
    const stand = await marktSichtbarkeit(pool);
    assert.equal(stand.je_agentur[0].name, "Demo Zeitarbeit GmbH");
    assert.equal(stand.je_agentur[0].unsichtbar, 10);
  });

  it("die Kopfzahl kommt aus den ZEILEN, nicht aus einer zweiten Abfrage", async () => {
    /* Eine Kennzahl, die ihrer eigenen Aufschluesselung widerspricht, ist
     * keine. Deshalb genau EINE Abfrage. */
    const pool = musterPool(() => ({ rows: ECHTE_LAGE }));
    const stand = await marktSichtbarkeit(pool);
    assert.equal(pool.calls.length, 1);
    const summe = stand.je_agentur.reduce((n, a) => n + a.unsichtbar, 0);
    assert.equal(summe, stand.gesamt.unsichtbar);

    /*
     * MIT ANDEREN ZAHLEN, und das ist keine Wiederholung: die erste Probe
     * laeuft auf der echten Lage, die zufaellig auf 33 summiert. Eine fest
     * verdrahtete 33 saehe dort richtig aus und ueberlebte die Rueckmutation
     * — genau das ist beim ersten Anlauf passiert. Eine Probe, deren
     * Erwartung mit dem Fehler uebereinstimmt, prueft nichts.
     */
    const andere = musterPool(() => ({
      rows: [
        { org_id: "a", name: "A", aktive: 4, ohne_skill: 1, ohne_ort: 2 },
        { org_id: "b", name: "B", aktive: 9, ohne_skill: 5, ohne_ort: 0 }
      ]
    }));
    const zweiter = await marktSichtbarkeit(andere);
    assert.equal(zweiter.gesamt.aktive, 13);
    assert.equal(zweiter.gesamt.ohne_skill, 6);
    assert.equal(zweiter.gesamt.ohne_ort, 2);
    assert.equal(zweiter.gesamt.unsichtbar, 8);
  });

  it("eine Agentur ohne Betroffene bleibt in der Liste, aber ohne Alarm", async () => {
    const pool = musterPool(() => ({
      rows: [{ org_id: "o-gut", name: "Sauber GmbH", aktive: 5, ohne_skill: 0, ohne_ort: 0 }]
    }));
    const stand = await marktSichtbarkeit(pool);
    assert.equal(stand.gesamt.unsichtbar, 0);
    assert.equal(stand.je_agentur[0].unsichtbar, 0);
  });

  it("OHNE ORGANISATION wird benannt, nicht verschwiegen", async () => {
    const pool = musterPool(() => ({
      rows: [{ org_id: null, name: null, aktive: 2, ohne_skill: 2, ohne_ort: 0 }]
    }));
    const stand = await marktSichtbarkeit(pool);
    assert.equal(stand.je_agentur[0].name, "ohne Organisation");
    assert.equal(stand.je_agentur[0].org_id, null);
  });

  it("DER LESER WIRFT NIE — eine Aufsichtszahl reisst die Seite nicht mit", async () => {
    const pool = musterPool(() => { throw new Error("relation does not exist"); });
    const stand = await marktSichtbarkeit(pool);
    assert.equal(stand.verfuegbar, false);
    assert.deepEqual(stand.je_agentur, []);
    assert.equal(stand.gesamt.unsichtbar, 0);
  });

  it("ohne Pool wird gar nicht erst gefragt", async () => {
    assert.equal((await marktSichtbarkeit(null)).verfuegbar, false);
  });

  it("er SCHREIBT nichts — auch nicht versehentlich", async () => {
    const pool = musterPool(() => ({ rows: ECHTE_LAGE }));
    await marktSichtbarkeit(pool);
    for (const c of pool.calls) {
      assert.ok(!/INSERT|UPDATE|DELETE|BEGIN/i.test(c.sql),
        `die Anzeige schreibt: ${c.sql.slice(0, 60)}`);
    }
  });
});

/* ── Der Vorbehalt ────────────────────────────────────────────────────── */

describe("M-Nachtrag · die Zahl behauptet nicht mehr, als sie weiss", () => {
  it("der Hinweis reist MIT der Antwort, nicht in der Oberflaeche", async () => {
    const pool = musterPool(() => ({ rows: ECHTE_LAGE }));
    const stand = await marktSichtbarkeit(pool);
    assert.equal(stand.hinweis, SICHTBARKEIT_HINWEIS);
    assert.match(stand.hinweis, /Abwesenheit/);
    assert.match(stand.hinweis, /Agentur-Nutzer/);
  });

  it("auch der Fehlerfall traegt ihn", async () => {
    const pool = musterPool(() => { throw new Error("weg"); });
    assert.equal((await marktSichtbarkeit(pool)).hinweis, SICHTBARKEIT_HINWEIS);
  });

  it("es wird KEIN Feld 'sichtbar' behauptet", () => {
    /*
     * Die Versuchung ist gross, `aktive - unsichtbar` als "sichtbar" zu
     * melden. Das waere falsch: die Materialisierung schliesst zusaetzlich
     * Abwesende aus und verlangt einen Agentur-Nutzer. Eine Zahl, die mehr
     * behauptet als sie misst, ist genau der Fehler dieser ganzen Welle.
     */
    const s = ohneKommentare(quelle("services/marktpraesenzService.js"));
    const stelle = s.slice(s.indexOf("export async function marktSichtbarkeit"));
    /*
     * Wortgrenze, sonst trifft das Muster auch `unsichtbar:` — beim ersten
     * Anlauf war die Probe genau daran rot. Ein zu grobes Muster prueft
     * etwas anderes als es meint.
     *
     * Und beim zweiten Anlauf stand hier ein echtes RUECKTASTE-Zeichen statt
     * der zwei Zeichen Backslash-b: das Muster traf nie, die Probe war gruen
     * und bewies nichts. Gefunden hat es `sitzungsUebersicht.test.js` — der
     * Waechter, den es fuer genau diesen Fall gibt. Muster als Literale
     * schreiben, nicht durch eine Werkzeugkette schicken.
     */
    assert.ok(!/\bsichtbar:/.test(stelle), "ein Feld 'sichtbar' waere eine Behauptung");
    assert.ok(/unsichtbar:/.test(stelle), "Selbstprobe: die Stelle wurde ueberhaupt gelesen");
  });
});

/* ── Die Erreichbarkeit ───────────────────────────────────────────────── */

describe("M-Nachtrag · die Zahl ist erreichbar, nicht nur berechnet", () => {
  it("die Route liegt im Staff CC und ist bewacht", () => {
    const s = ohneKommentare(quelle("routes/staffControlCenter.js"));
    assert.match(s, /router\.get\("\/markt-sichtbarkeit", requireStaff/,
      "ohne requireStaff waere eine Kundenliste offen");
    assert.match(s, /marktpraesenzService\.marktSichtbarkeit\(pool\)/);
  });

  it("und sie ist im Staff CC wirklich eingehaengt", () => {
    /* Eine Route ohne Modul ist derselbe Fall wie eine Zahl ohne Anzeige. */
    const W = path.resolve(API, "..", "frontend", "src", "staff");
    const shell = fs.readFileSync(path.join(W, "components", "shell", "AppShell.tsx"), "utf8");
    const side = fs.readFileSync(path.join(W, "components", "shell", "Sidebar.tsx"), "utf8");
    assert.ok(shell.includes('import("@scc/modules/markt-sichtbarkeit")'), "nicht importiert");
    assert.ok(shell.includes('active === "markt-sichtbarkeit"'), "nicht gerendert");
    assert.ok(side.includes('key: "markt-sichtbarkeit"'), "nicht in der Navigation");
    assert.ok(fs.existsSync(path.join(W, "modules", "markt-sichtbarkeit", "index.tsx")),
      "das Modul fehlt");
  });

  it("die Oberflaeche zeigt den Vorbehalt mit", () => {
    const W = path.resolve(API, "..", "frontend", "src", "staff");
    const m = fs.readFileSync(path.join(W, "modules", "markt-sichtbarkeit", "index.tsx"), "utf8");
    assert.ok(m.includes("{data.hinweis}"),
      "ohne den Hinweis liest sich die Zahl als Marktaussage");
    assert.ok(m.includes("verfuegbar === false"),
      "nicht lesbar muss anders aussehen als 'alles sichtbar'");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   M0/F27 · Was die Automatik erzeugt, hat sie auch bestaetigt
   ══════════════════════════════════════════════════════════════════════════ */

describe("M0/F27 · die Materialisierung setzt last_confirmed_at", () => {
  /*
   * `findStaleEntries` prueft `last_confirmed_at IS NULL OR ... < NOW() - 7 Tage`.
   * Die erste Haelfte trifft SOFORT — ein Eintrag ohne Bestaetigung ist
   * ueberfaellig, nicht erst nach sieben Tagen.
   *
   * Gemessen am 2026-09-03: zwoelf von dreizehn aktiven Eintraegen dauerhaft
   * ueberfaellig, darunter alle sechs, die diese Automatik erzeugt hat und die
   * niemand bestaetigen KANN, weil sie maschinell entstehen. Der taegliche Sweep
   * verschickte je Eintrag eine Meldung an einen echten Menschen (owner/admin der
   * Agentur), unbefristet.
   *
   * GEPRUEFT WIRD DIE FORM DER ABFRAGE, nicht ihr Ergebnis: die Suite laeuft ohne
   * Datenbank, ein Muster-Pool fuehrt kein SQL aus. Die Form ist der Vertrag.
   * Gegengeprueft wurde die Abfrage ausserdem von Postgres selbst — `EXPLAIN`
   * gegen die laufende Datenbank meldet "Insert on capacity_posts / Conflict
   * Resolution: UPDATE".
   */
  const HIER = path.dirname(fileURLToPath(import.meta.url));
  const dienst = quelle("services/marktpraesenzService.js");

  /** Der Einfuegeweg — seit M4c.3b gibt es nur noch einen. */
  const einfuegen = [...dienst.matchAll(/INSERT INTO capacity_posts \(([\s\S]*?)DO (NOTHING|UPDATE[\s\S]*?)`/g)];

  it("es gibt GENAU EINEN Einfuegeweg — sonst prueft der Rest nichts", () => {
    /*
     * Hier stand 2: der Sweep und das einzelne Nachziehen je Profil
     * (`setzeMarktpraesenz`) trugen je eine eigene, von Hand abgeschriebene
     * Anweisung. Die Abschrift war schon auseinandergelaufen — sie schrieb die
     * Praesenz-Bedingungen selbst hin, statt sie aus `PRAESENZ_BEDINGUNGEN` zu
     * bauen, und jeder Riegel, den der Cron bekam, fehlte ihr.
     *
     * Seit M4c.3b baut EIN Bauplan beide Reichweiten; der Unterschied ist ein
     * Zusatz-Ausdruck. Die Zusicherung kehrt sich damit um und wird schaerfer:
     * nicht mehr "beide Wege tun dasselbe", sondern "es gibt nur einen Weg, der
     * es tun koennte". Waechst die Zahl wieder auf 2, ist eine zweite Wahrheit
     * entstanden — und genau dann soll diese Probe rot werden.
     */
    assert.equal(einfuegen.length, 1,
      `${einfuegen.length} INSERT INTO capacity_posts gefunden, erwartet 1 `
      + "(der gemeinsame Bauplan). Sind es mehr, ist wieder eine Abschrift entstanden.");
  });

  it("beide setzen die Bestaetigung beim Anlegen", () => {
    einfuegen.forEach((m, i) => {
      assert.ok(/last_confirmed_at/.test(m[0]),
        `Einfuegeweg ${i + 1}: die Spalte last_confirmed_at fehlt — der Eintrag `
        + "waere ab der ersten Sekunde ueberfaellig");
      assert.ok(/NOW\(\)/.test(m[0]),
        `Einfuegeweg ${i + 1}: kein NOW() — die Spalte bliebe leer`);
    });
  });

  it("beide erneuern sie im Konfliktfall — sonst heilt kein Bestand", () => {
    /*
     * Der Teil, der die sechs vorhandenen Zeilen heilt. `DO NOTHING` liesse sie
     * fuer immer leer: der Dedup-Index verhindert das Neuanlegen, und niemand
     * ruehrt die alte Zeile an.
     */
    einfuegen.forEach((m, i) => {
      assert.ok(/DO UPDATE SET last_confirmed_at = NOW\(\)/.test(m[0]),
        `Einfuegeweg ${i + 1}: DO NOTHING statt DO UPDATE — die bestehenden `
        + "Zeilen blieben ohne Bestaetigung und melden weiter taeglich");
    });
    /*
     * OHNE KOMMENTARE. Der erste Anlauf pruefte den rohen Text und traf den
     * ERKLAERENDEN KOMMENTAR ueber der Aenderung, in dem "DO NOTHING" als das
     * beschrieben steht, was dort NICHT mehr stehen soll. Eine Probe, die ihre
     * eigene Begruendung liest, misst sich selbst.
     */
    assert.ok(!/DO NOTHING/.test(ohneKommentare(quelle("services/marktpraesenzService.js"))),
      "irgendwo steht noch DO NOTHING — dann heilt dieser Weg nichts");
  });

  it("aber NUR die eigenen Zeilen — ein Angebot von Hand bleibt bestaetigungspflichtig", () => {
    /*
     * Die Zusage im Quelltext lautet: "ein bereits vorhandenes Angebot (egal
     * welcher quelle) hat Vorrang". Ohne diese Bedingung wuerde die Maschine ein
     * von Hand angelegtes Angebot mitbestaetigen — und genau dort ist die
     * Bestaetigung durch einen Menschen gewollt.
     */
    einfuegen.forEach((m, i) => {
      assert.ok(/WHERE capacity_posts\.quelle = 'live_belegschaft'/.test(m[0]),
        `Einfuegeweg ${i + 1}: das Erneuern trifft auch manuelle Angebote`);
    });
  });
});
