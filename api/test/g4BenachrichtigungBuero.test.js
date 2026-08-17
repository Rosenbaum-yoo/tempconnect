/**
 * Welle G4 — die Meldung erreicht das Buero, sofort.
 *
 * DAS GATE DIESER WELLE, WOERTLICH:
 *   "Der Disponent sieht die Meldung ohne Neuladen, und die Benachrichtigung
 *    fuehrt zum betroffenen Einsatz, nicht auf eine Uebersicht."
 *
 * Beide Haelften waren vor dieser Welle tot, und zwar unabhaengig voneinander:
 *   1. `pushToUser` (routes/notificationStream.js) hatte KEINEN AUFRUFER. Der
 *      SSE-Strom lief, der Browser hing daran, gesendet wurde nie etwas.
 *   2. `pageShell.js` rief `TC.toast(...)` als Funktion auf — `TC.toast` ist ein
 *      Objekt. Der TypeError landete in einem leeren catch. Selbst ein Push
 *      waere unsichtbar geblieben.
 * Ein Test, der nur "es wurde eine Zeile geschrieben" prueft, haette beide
 * Luecken bestaetigt. Deshalb prueft diese Datei den WEG, nicht das Ergebnis.
 *
 * Run: node --test --test-force-exit test/g4BenachrichtigungBuero.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  benachrichtigeBuero,
  bueroDeepLink,
  BUERO_PERMISSION,
} from "../services/workerAbsenceService.js";
import { getMatrix, dispatch } from "../services/notificationMatrix.js";
import { surfaceForType } from "../services/notificationSurfaceMap.js";
import { EVENT_CATEGORY_MAP } from "../services/matchAlertService.js";
import { pushToUser, createNotificationStreamRouter } from "../routes/notificationStream.js";
import * as rbacService from "../services/rbacService.js";

/* Pfade IMMER relativ zur Testdatei aufloesen, nie ueber process.cwd() —
 * sonst skippt die Datei je nach Startverzeichnis lautlos (CLAUDE.md §0.9). */
const HIER = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HIER, "..", "..");

const ORG = "11111111-1111-1111-1111-111111111111";
const PROFIL = "33333333-3333-3333-3333-333333333333";
const MELDER = "44444444-4444-4444-4444-444444444444";
const DISPO_A = "55555555-5555-5555-5555-555555555555";
const DISPO_B = "66666666-6666-6666-6666-666666666666";
const ABW = "77777777-7777-7777-7777-777777777777";
const EINSATZ = "88888888-8888-8888-8888-888888888888";

/**
 * Kommentare aus einer JS-Datei entfernen, bevor darin nach Code gesucht wird.
 *
 * Blockkommentare vollstaendig; von den Zeilenkommentaren nur die, die eine
 * ganze Zeile ausmachen. Das ist Absicht: ein `//` mitten in einer Zeile steckt
 * haeufig in einer URL ("https://"), und die abzuschneiden waere schlimmer als
 * der Kommentar, den es zu entfernen gaelte.
 */
function ohneJsKommentare(quelle) {
  return String(quelle)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

/** Mock-Pool, der jedes Statement mitschreibt und nach SQL-Form antwortet. */
function spionPool(regeln = {}) {
  const gesehen = [];
  const pool = {
    query: async (sql, params) => {
      gesehen.push({ sql, params });
      for (const [muster, antwort] of Object.entries(regeln)) {
        if (sql.includes(muster)) {
          return typeof antwort === "function" ? await antwort(sql, params) : antwort;
        }
      }
      return { rows: [], rowCount: 0 };
    },
  };
  return { pool, gesehen };
}

/** Die Standard-Antworten fuer einen vollstaendigen, erfolgreichen Durchlauf. */
function standardRegeln(extra = {}) {
  return {
    // Name des Menschen
    "FROM worker_profiles WHERE id": { rows: [{ first_name: "Max", last_name: "Mustermann", personnel_number: "4711" }], rowCount: 1 },
    // Empfaenger aus der Rechte-Matrix
    "FROM org_memberships": { rows: [{ user_id: DISPO_A }, { user_id: DISPO_B }], rowCount: 2 },
    // Betroffene Einsaetze (folgenVorschau)
    "FROM worker_profiles wp": {
      rows: [{ assignment_id: EINSATZ, kunde: "Müller GmbH", beginnt: "2026-08-18", endet: null }],
      rowCount: 1,
    },
    // Nutzereinstellung — keine Zeile = Standard (in-app an, Mail aus)
    "FROM notification_preferences": { rows: [], rowCount: 0 },
    // Der eigentliche Einschub
    "INSERT INTO notifications": (sql, params) => ({
      rows: [{ id: "n-1", type: params[2], title: params[3], message: params[4], severity: params[7], link_path: params[8] }],
      rowCount: 1,
    }),
    ...extra,
  };
}

const ABSENCE = { id: ABW, art: "krank", von: "2026-08-18", bis: null, zustand: "wirksam" };

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. Der Weg nach hinten: wer wird benachrichtigt, und womit
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("G4 — die Meldung erreicht das Buero", () => {
  it("Empfaenger kommen aus der RECHTE-MATRIX, nicht aus einer Rollenliste im Code", async () => {
    const { pool, gesehen } = spionPool(standardRegeln());
    const res = await benachrichtigeBuero(pool, ORG, {
      anlass: "abwesenheit", absence: ABSENCE, workerProfileId: PROFIL, melderUserId: MELDER,
    });

    assert.equal(res.benachrichtigt, 2);

    const mitglieder = gesehen.find((g) => g.sql.includes("FROM org_memberships"));
    assert.ok(mitglieder, "der Empfaengerkreis wurde nie aufgeloest");

    /* DER KERN DIESER PRUEFUNG: die Rollen im Parameter muessen DIESELBEN sein,
     * die rbacService fuer 'worker.manage' fuehrt. Waere die Liste im Service
     * abgeschrieben, liefe dieser Test weiter gruen, bis jemand die Matrix
     * aendert — und ab da bekaeme der neue Rollenname still keine Meldung mehr.
     * Genau deshalb wird hier gegen die QUELLE verglichen, nicht gegen ein
     * erwartetes Literal. */
    assert.deepEqual(mitglieder.params[1], rbacService.PERMISSIONS[BUERO_PERMISSION]);
    assert.equal(mitglieder.params[0], ORG, "der Empfaengerkreis war nicht org-gebunden");
  });

  it("der Melder bekommt seine eigene Krankmeldung nicht zugestellt", async () => {
    const { pool, gesehen } = spionPool(standardRegeln({
      // Der Melder steht diesmal SELBST im Kreis der Disponenten.
      "FROM org_memberships": { rows: [{ user_id: DISPO_A }, { user_id: MELDER }], rowCount: 2 },
    }));
    const res = await benachrichtigeBuero(pool, ORG, {
      anlass: "abwesenheit", absence: ABSENCE, workerProfileId: PROFIL, melderUserId: MELDER,
    });

    assert.equal(res.empfaenger, 1, "der Melder wurde nicht herausgefiltert");
    const inserts = gesehen.filter((g) => g.sql.includes("INSERT INTO notifications"));
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0].params[0], DISPO_A);
  });

  it("der Name des Menschen wird org-gebunden geholt — ein fremdes Profil liefert nichts", async () => {
    const { pool } = spionPool(standardRegeln({
      "FROM worker_profiles WHERE id": { rows: [], rowCount: 0 },
    }));
    const res = await benachrichtigeBuero(pool, ORG, {
      anlass: "abwesenheit", absence: ABSENCE, workerProfileId: PROFIL, melderUserId: MELDER,
    });
    assert.equal(res.benachrichtigt, 0);
    assert.equal(res.grund, "WORKER_NOT_IN_ORG");
  });

  it("die Mandantengrenze steht IM Statement, das den Namen holt", async () => {
    const { pool, gesehen } = spionPool(standardRegeln());
    await benachrichtigeBuero(pool, ORG, {
      anlass: "abwesenheit", absence: ABSENCE, workerProfileId: PROFIL, melderUserId: MELDER,
    });
    const namensAbfrage = gesehen.find((g) => g.sql.includes("FROM worker_profiles WHERE id"));
    assert.match(namensAbfrage.sql, /supplier_org_id\s*=\s*\$2/,
      "ohne Org-Bedingung im Statement traegt eine fremde Profil-ID ihren Namen " +
      "in eine Benachrichtigung dieses Betriebs");
    assert.deepEqual(namensAbfrage.params, [PROFIL, ORG]);
  });

  it("ohne Empfaenger wird nichts geschrieben — und das wird ehrlich gemeldet", async () => {
    const { pool, gesehen } = spionPool(standardRegeln({
      "FROM org_memberships": { rows: [], rowCount: 0 },
    }));
    const res = await benachrichtigeBuero(pool, ORG, {
      anlass: "abwesenheit", absence: ABSENCE, workerProfileId: PROFIL, melderUserId: MELDER,
    });
    assert.equal(res.benachrichtigt, 0);
    assert.equal(res.grund, "KEIN_EMPFAENGER");
    assert.equal(gesehen.filter((g) => g.sql.includes("INSERT INTO notifications")).length, 0);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. Der Verweis fuehrt zum Menschen, nicht auf eine Uebersicht  (Gate, 2. Haelfte)
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("G4 — der Verweis ist konkret", () => {
  it("der Link traegt die Profil-ID UND den Filter", () => {
    const link = bueroDeepLink(PROFIL, "abwesend");
    assert.ok(link.includes("person=" + PROFIL), "ohne Person ist der Link eine Uebersicht");
    assert.ok(link.endsWith("#live-abwesend"), "ohne Filter landet der Disponent auf der Gesamtliste");
  });

  it("eine Profil-ID mit Sonderzeichen wird kodiert, nicht eingebaut", () => {
    const link = bueroDeepLink('a"b&c', "abwesend");
    assert.ok(!link.includes('"'), "roh eingebaute Anfuehrungszeichen brechen die Adresse");
    assert.ok(link.includes("%22"), "erwartet wird eine kodierte Form");
  });

  it("der Link steht wirklich in der geschriebenen Zeile", async () => {
    const { pool, gesehen } = spionPool(standardRegeln());
    await benachrichtigeBuero(pool, ORG, {
      anlass: "abwesenheit", absence: ABSENCE, workerProfileId: PROFIL, melderUserId: MELDER,
    });
    const insert = gesehen.find((g) => g.sql.includes("INSERT INTO notifications"));
    // params[8] ist link_path
    assert.equal(insert.params[8], bueroDeepLink(PROFIL, "abwesend"));
    // params[5]/[6] sind entity_type/entity_id — der Anker auf die Meldung
    assert.equal(insert.params[5], "worker_absence");
    assert.equal(insert.params[6], ABW);
  });

  it("das Ziel des Links existiert als Datei — sonst ist er eine Sackgasse", () => {
    const ziel = bueroDeepLink(PROFIL).split("#")[0].split("?")[0].replace(/^\//, "").replace(/^public\//, "");
    const datei = path.join(REPO, "frontend", "public", ziel);
    assert.ok(fs.existsSync(datei),
      `der Verweis zeigt auf ${ziel} — diese Seite gibt es nicht, nginx antwortet 404`);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 3. Was NICHT mitfaehrt  (G-E8 / Art. 9 DSGVO)
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("G4 — die Beschreibung bleibt in der Akte", () => {
  it("die 30-Woerter-Beschreibung taucht in KEINEM Feld der Benachrichtigung auf", async () => {
    const geheim = "Seit gestern Abend hohes Fieber, war beim Hausarzt, Krankschreibung bis Freitag erwartet";
    const { pool, gesehen } = spionPool(standardRegeln());
    await benachrichtigeBuero(pool, ORG, {
      anlass: "abwesenheit",
      absence: { ...ABSENCE, beschreibung: geheim, notiz: geheim },
      workerProfileId: PROFIL,
      melderUserId: MELDER,
    });

    const insert = gesehen.find((g) => g.sql.includes("INSERT INTO notifications"));
    /* Ueber ALLE Parameter, nicht nur ueber die message: ein Zwischenfeld, in
     * das jemand die Beschreibung spaeter "nur zur Info" mitgibt, waere sonst
     * unsichtbar. Derselbe Gedanke wie bei `fuerKunde()`. */
    const alles = JSON.stringify(insert.params);
    assert.ok(!alles.includes("Fieber"), "die Beschreibung ist in die Benachrichtigung gerutscht");
    assert.ok(!alles.includes("Hausarzt"), "die Beschreibung ist in die Benachrichtigung gerutscht");
  });

  it("die Nachricht sagt trotzdem, was zum Umdisponieren noetig ist", async () => {
    const { pool, gesehen } = spionPool(standardRegeln());
    await benachrichtigeBuero(pool, ORG, {
      anlass: "abwesenheit", absence: ABSENCE, workerProfileId: PROFIL, melderUserId: MELDER,
    });
    const insert = gesehen.find((g) => g.sql.includes("INSERT INTO notifications"));
    const nachricht = insert.params[4];
    assert.match(nachricht, /Mustermann/, "ohne Namen weiss der Disponent nicht, wer fehlt");
    assert.match(nachricht, /krank/, "die Art gehoert in die Meldung an den ARBEITGEBER");
    assert.match(nachricht, /Müller GmbH/, "der betroffene Einsatz wird namentlich genannt");
  });

  it("'wartet auf Freigabe' steht drin, wenn die Firma Antragspflicht eingeschaltet hat", async () => {
    const { pool, gesehen } = spionPool(standardRegeln());
    await benachrichtigeBuero(pool, ORG, {
      anlass: "abwesenheit",
      absence: { ...ABSENCE, zustand: "beantragt" },
      workerProfileId: PROFIL, melderUserId: MELDER,
    });
    const insert = gesehen.find((g) => g.sql.includes("INSERT INTO notifications"));
    assert.match(insert.params[4], /Freigabe/,
      "ohne diesen Hinweis wartet der Disponent auf niemanden und der Mensch auf ihn");
  });

  it("kein betroffener Einsatz ist eine Antwort, kein Weglassen", async () => {
    const { pool, gesehen } = spionPool(standardRegeln({
      "FROM worker_profiles wp": { rows: [], rowCount: 0 },
    }));
    await benachrichtigeBuero(pool, ORG, {
      anlass: "abwesenheit", absence: ABSENCE, workerProfileId: PROFIL, melderUserId: MELDER,
    });
    const insert = gesehen.find((g) => g.sql.includes("INSERT INTO notifications"));
    assert.match(insert.params[4], /Kein laufender Einsatz/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 4. Der leichte Weg bleibt leicht  (Gate G3 darf nicht kippen)
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("G4 — die Verspaetung meldet sich anders", () => {
  it("die Verspaetung fragt die Folgen GAR NICHT ab — sie gibt keinen Einsatz frei", async () => {
    const { pool, gesehen } = spionPool(standardRegeln());
    await benachrichtigeBuero(pool, ORG, {
      anlass: "verspaetung",
      verspaetung: { id: "d-1", minuten: 45, notiz: null },
      workerProfileId: PROFIL, melderUserId: MELDER,
    });

    /* Die Folgen-Abfrage joint worker_assignment_links. Laeuft sie hier, hat
     * jemand den leichten Weg an den schweren gehaengt — und bezahlt eine
     * Abfrage fuer eine Zahl, die immer 0 bedeutet. */
    const folgen = gesehen.find((g) => g.sql.includes("worker_assignment_links"));
    assert.equal(folgen, undefined, "die Verspaetung hat die Folgen-Vorschau ausgeloest");
  });

  it("Verspaetung ist 'info', Abwesenheit ist 'warning' — zwei Dringlichkeiten", async () => {
    const m = getMatrix();
    assert.equal(m["worker.delay_reported"].severity, "info");
    assert.equal(m["worker.absence_reported"].severity, "warning");
    assert.notEqual(m["worker.delay_reported"].type, m["worker.absence_reported"].type,
      "ein gemeinsamer Typ zwaenge den Disponenten, jede Meldung zu oeffnen");
  });

  it("die Verspaetung nennt die Minuten und zeigt auf den laufenden Einsatz", async () => {
    const { pool, gesehen } = spionPool(standardRegeln());
    await benachrichtigeBuero(pool, ORG, {
      anlass: "verspaetung",
      verspaetung: { id: "d-1", minuten: 45, notiz: null },
      workerProfileId: PROFIL, melderUserId: MELDER,
    });
    const insert = gesehen.find((g) => g.sql.includes("INSERT INTO notifications"));
    assert.match(insert.params[4], /45 Minuten/);
    assert.equal(insert.params[5], "worker_delay");
    assert.ok(insert.params[8].endsWith("#live-im_einsatz"));
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 5. Der Zustellweg darf die Meldung nie zuruecknehmen
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("G4 — Fehler bleiben folgenlos", () => {
  it("eine kaputte Datenbank wirft nicht, sondern meldet den Grund zurueck", async () => {
    const pool = { query: async () => { throw new Error("Verbindung weg"); } };
    const res = await benachrichtigeBuero(pool, ORG, {
      anlass: "abwesenheit", absence: ABSENCE, workerProfileId: PROFIL, melderUserId: MELDER,
    });
    assert.equal(res.benachrichtigt, 0);
    assert.equal(res.grund, "Verbindung weg");
  });

  it("ein unbekannter Anlass schreibt nichts", async () => {
    const { pool, gesehen } = spionPool(standardRegeln());
    const res = await benachrichtigeBuero(pool, ORG, {
      anlass: "kuendigung", workerProfileId: PROFIL, melderUserId: MELDER,
    });
    assert.equal(res.grund, "UNBEKANNTER_ANLASS");
    assert.equal(gesehen.length, 0, "es wurde trotzdem etwas abgefragt");
  });

  it("fehlende Pflichtangaben werden abgewiesen, nicht geraten", async () => {
    const { pool } = spionPool(standardRegeln());
    for (const fall of [
      { supplier: null, profil: PROFIL },
      { supplier: ORG, profil: null },
    ]) {
      const res = await benachrichtigeBuero(pool, fall.supplier, {
        anlass: "abwesenheit", absence: ABSENCE, workerProfileId: fall.profil,
      });
      assert.equal(res.grund, "MISSING_PARAMS");
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 6. "Ohne Neuladen" — der Live-Weg, an beiden Enden  (Gate, 1. Haelfte)
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("G4 — die Meldung erscheint ohne Neuladen", () => {
  it("dispatch() liest die erzeugte Zeile zurueck — ohne RETURNING gibt es nichts zu pushen", async () => {
    const { pool, gesehen } = spionPool(standardRegeln());
    await benachrichtigeBuero(pool, ORG, {
      anlass: "abwesenheit", absence: ABSENCE, workerProfileId: PROFIL, melderUserId: MELDER,
    });
    const insert = gesehen.find((g) => g.sql.includes("INSERT INTO notifications"));
    assert.match(insert.sql, /RETURNING/,
      "ohne RETURNING kennt dispatch() die Zeile nicht und kann sie nicht live zustellen");
    for (const feld of ["title", "message", "severity", "link_path"]) {
      assert.ok(insert.sql.includes(feld),
        `${feld} fehlt im RETURNING — der Toast kaeme ohne diesen Teil an`);
    }
  });

  it("pushToUser stellt an eine offene Verbindung zu — im SSE-Format", async () => {
    /* Der Verbindungsspeicher ist modul-privat und genau deshalb nur ueber den
     * echten Router zu fuellen. Ein nachgebauter Speicher wuerde beweisen, dass
     * der Nachbau funktioniert. */
    const geschrieben = [];
    const res = {
      setHeader() {}, flushHeaders() {},
      write(chunk) { geschrieben.push(String(chunk)); },
      status() { return this; }, end() {},
    };
    const req = { session: { userId: DISPO_A }, on(ereignis, cb) { this._zu = ereignis === "close" ? cb : this._zu; } };

    const router = createNotificationStreamRouter({ pool: { query: async () => ({ rows: [] }) }, requireAuth: (q, s, n) => n(), logger: null });
    const schicht = router.stack.find((s) => s.route && s.route.path === "/notifications/stream");
    assert.ok(schicht, "die Strom-Route heisst nicht mehr /notifications/stream");

    // Alle Handler der Route der Reihe nach — requireAuth ist einer davon.
    for (const h of schicht.route.stack) await h.handle(req, res, () => {});

    geschrieben.length = 0;
    pushToUser(DISPO_A, { id: "n-1", title: "Abwesenheit gemeldet", link_path: "/public/mitarbeiter.html?person=x#live-abwesend" });

    assert.equal(geschrieben.length, 1, "an die offene Verbindung wurde nichts zugestellt");
    assert.match(geschrieben[0], /^event: notification\n/, "das SSE-Ereignis heisst anders als der Browser erwartet");
    assert.match(geschrieben[0], /\n\n$/, "ein SSE-Rahmen endet auf eine Leerzeile — sonst haelt der Browser ihn zurueck");
    const nutzlast = JSON.parse(geschrieben[0].split("data: ")[1]);
    assert.equal(nutzlast.link_path, "/public/mitarbeiter.html?person=x#live-abwesend",
      "ohne link_path im Rahmen ist der Toast nicht klickbar");

    // Aufraeumen: die Verbindung wieder abmelden, sonst haelt sie den Speicher.
    if (req._zu) req._zu();
    geschrieben.length = 0;
    pushToUser(DISPO_A, { id: "n-2" });
    assert.equal(geschrieben.length, 0, "nach dem Schliessen wurde weiter geschrieben");
  });

  it("der Browser ruft TC.toast.show — nicht TC.toast als Funktion", () => {
    /* Der Fehler, der hier drinstand: TC.toast(...) auf einem Objekt. Der
     * TypeError verschwand in einem leeren catch, und der Live-Weg war stumm.
     *
     * KOMMENTARE MUESSEN RAUS, bevor gesucht wird: Die reparierte Stelle
     * ZITIERT den alten Aufruf in ihrer Begruendung, und ohne diesen Schritt
     * schlaegt der Test auf seiner eigenen Dokumentation an. Ein Waechter, der
     * Prosa nicht von Code unterscheidet, zwingt dazu, den Fehler
     * unbeschreibbar zu machen — und dann steht nirgends mehr, warum es die
     * Regel gibt. */
    const shell = ohneJsKommentare(fs.readFileSync(path.join(REPO, "frontend", "public", "js", "pageShell.js"), "utf8"));
    assert.ok(!/\bTC\.toast\s*\(/.test(shell),
      "TC.toast wird wieder als Funktion aufgerufen — es ist ein Objekt, das wirft");
    assert.ok(shell.includes("TC.toast.show("),
      "die Meldung wird nicht ueber TC.toast.show angezeigt");
    assert.ok(shell.includes("link_path"),
      "der Toast wertet link_path nicht aus — die Meldung fuehrt dann nirgendwohin");
  });

  it("der Toast kann ein Ziel tragen und baut dafuer einen echten Link", () => {
    const toast = fs.readFileSync(path.join(REPO, "frontend", "public", "js", "toast.js"), "utf8");
    assert.ok(toast.includes('createElement(opts.href ? "a" : "div")'),
      "der klickbare Toast ist kein <a> — dann fehlen Fokusring und Tastaturbedienung");
    assert.ok(toast.includes("focus-visible"),
      "ohne sichtbaren Fokus ist der Toast fuer Tastaturnutzer eine Falle");
  });

  it("toast.js wird auch WIRKLICH GELADEN — sonst ist die Meldung unsichtbar", () => {
    /* DIE DRITTE TOTE STELLE IM SELBEN WEG, gefunden erst im Browser:
     * `js/toast.js` war eine vollstaendige Toast-Schicht, die KEINE einzige
     * Seite eingebunden hat. Drei Module riefen `TC.toast` auf — alle drei mit
     * einer Wenn-vorhanden-Pruefung davor, die immer falsch war. Auch der
     * reparierte Aufruf in pageShell.js waere damit wirkungslos geblieben:
     * `TC.toast` existierte schlicht nicht.
     *
     * Warum dieser Test die Quelle prueft und nicht nur die Datei: Ein Waechter,
     * der nur "steht `TC.toast.show` im Code" prueft, haette die Reparatur
     * bestaetigt, waehrend im Browser weiterhin nichts erschien. Die Frage
     * "WER LAEDT DAS EIGENTLICH?" ist die, die alle drei Luecken aufgedeckt hat. */
    const pub = path.join(REPO, "frontend", "public");
    const shell = fs.readFileSync(path.join(pub, "js", "pageShell.js"), "utf8");

    const seitenMitToast = fs.readdirSync(pub)
      .filter((f) => f.endsWith(".html"))
      .filter((f) => /<script[^>]+js\/toast\.js/.test(fs.readFileSync(path.join(pub, f), "utf8")));

    const shellLaedtNach = /src\s*=\s*["']\/public\/js\/toast\.js["']/.test(shell);

    assert.ok(shellLaedtNach || seitenMitToast.length > 0,
      "toast.js wird von niemandem geladen — weder von einer Seite per <script>, " +
      "noch von der Shell nachgeholt. Jeder TC.toast-Aufruf laeuft dann ins Leere, " +
      "und die Live-Meldung erscheint nie.");

    if (shellLaedtNach) {
      assert.ok(shell.includes("_wartende"),
        "die Shell laedt toast.js nach, puffert aber keine Meldung, die vorher " +
        "eintrifft — dann geht genau die erste verloren");
    }
  });

  it("die Live-Belegschaft nimmt den Verweis an: Reiter, Filter und Zeile", () => {
    const seite = fs.readFileSync(path.join(REPO, "frontend", "public", "js", "pages", "mitarbeiter.js"), "utf8");
    assert.ok(seite.includes('showTab("live")') && seite.includes("leseFokusAusAdresse"),
      "der Reiter wird beim Laden nicht umgeschaltet — der Link landet auf der Mitarbeiterliste");
    assert.ok(seite.includes('data-person="'),
      "die Zeile traegt keine Profil-ID — der Fokus findet sie nicht");
    assert.ok(seite.includes("scrollIntoView"),
      "die gefundene Zeile wird nicht in den Blick geholt");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 7. Die drei Register, die zusammenpassen muessen
 *
 * Der Kommentar in notificationMatrix.js warnt ausdruecklich: ein neuer Typ
 * braucht einen Eintrag im CHECK der Migration UND in der Surface-Map. Fehlt
 * eines, scheitert der INSERT still. Diese Gruppe macht das Vergessen laut.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("G4 — kein Typ ohne seine drei Eintraege", () => {
  const EVENTS = ["worker.absence_reported", "worker.delay_reported"];

  it("jeder neue Typ steht in der Matrix", () => {
    const m = getMatrix();
    for (const e of EVENTS) assert.ok(m[e], `${e} fehlt in der Matrix`);
  });

  it("jeder neue Typ hat eine Hub-Karte", () => {
    const m = getMatrix();
    for (const e of EVENTS) {
      assert.equal(surfaceForType(m[e].type), "assignments",
        `${m[e].type} hat keine Karte — die Meldung bliebe glockenintern`);
    }
  });

  it("jeder neue Typ steht im CHECK der Migration 183", () => {
    const datei = path.join(REPO, "sql", "migrations", "183_meldung_erreicht_das_buero.sql");
    assert.ok(fs.existsSync(datei), "Migration 183 fehlt");
    const sql = fs.readFileSync(datei, "utf8");
    const m = getMatrix();
    for (const e of EVENTS) {
      assert.ok(sql.includes(`'${m[e].type}'`),
        `${m[e].type} fehlt im CHECK — der INSERT scheitert STILL, wie 2026 bei Migration 139`);
    }
    /* Die Migration darf die Typliste nur ERWEITERN. Wer sie abschreibt,
     * loescht die seither hinzugekommenen Werte wieder. */
    assert.ok(sql.includes("waere geschrumpft"),
      "die Migration prueft nicht, dass die Typliste nicht schrumpft");
  });

  it("jeder neue Typ hat eine eigene Einstellungs-Kategorie, keinen Rueckfall", () => {
    for (const e of EVENTS) {
      assert.equal(EVENT_CATEGORY_MAP[e], "workforce_updates",
        `${e} faellt auf 'match_alerts' zurueck — wer Marktplatz-Meldungen ` +
        "abstellt, bekaeme dann keine Krankmeldungen mehr und erfuehre es nie");
    }
  });

  it("dispatch() weist einen unbekannten Schluessel ab, statt still zu schreiben", async () => {
    const { pool, gesehen } = spionPool(standardRegeln());
    const res = await dispatch(pool, "worker.absence_reportet" /* Tippfehler */, {
      recipientUserIds: [DISPO_A], orgId: ORG,
    });
    assert.equal(res.sent, 0);
    assert.equal(gesehen.length, 0);
  });
});
