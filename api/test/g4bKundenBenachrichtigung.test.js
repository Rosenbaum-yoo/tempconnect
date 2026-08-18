/**
 * Welle G4b — der Kunde erfaehrt, DASS jemand ausfaellt, nie WARUM.
 *
 * DAS GATE DIESER WELLE, WOERTLICH:
 *   "Ein Test weist nach, dass die Kunden-Benachrichtigung weder `art` noch
 *    `notiz` enthaelt, auch nicht in Zwischenfeldern; und dass die
 *    Ersatz-Meldung erst nach echter Neubesetzung geht."
 *
 * WARUM DER BESTEHENDE fuerKunde()-TEST DAFUER NICHT REICHT:
 * Er prueft die FUNKTION — dass sie eine Positivliste baut. Er prueft nicht,
 * dass der Zustellweg sie ueberhaupt benutzt. Genau diese Luecke hat in G4 drei
 * tote Stellen hinterlassen, die einzeln alle vollstaendig aussahen. Vor dieser
 * Welle hatte `fuerKunde()` repo-weit KEINEN Produktionsaufrufer: die Zusage war
 * reine Absicht.
 *
 * UND: `fuerKunde()` schuetzt das OBJEKT. Der Weg, auf dem die Art wirklich
 * entkaeme, ist der TEXT — `dispatch()` schreibt `context.message` in die
 * Tabelle, in die Mail und an Slack/Teams. Diese Datei prueft deshalb den
 * VOLLSTAENDIGEN Parametersatz jedes INSERTs, nicht einzelne Felder.
 *
 * Run: node --test --test-force-exit test/g4bKundenBenachrichtigung.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  benachrichtigeKunde,
  kundenNachricht,
  kundeIstEmpfangsberechtigt,
  kundenEreignis,
  kundenDeepLink,
  fuerKunde,
  KUNDE_PERMISSION,
  KUNDE_ANLAESSE,
} from "../services/workerAbsenceService.js";
import { getMatrix, ERLAUBTE_SEVERITY } from "../services/notificationMatrix.js";
import { surfaceForType } from "../services/notificationSurfaceMap.js";
import { EVENT_CATEGORY_MAP } from "../services/matchAlertService.js";
import * as rbacService from "../services/rbacService.js";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HIER, "..", "..");

const LIEFERANT = "11111111-1111-1111-1111-111111111111";
const KUNDE_ORG = "22222222-2222-2222-2222-222222222222";
const PROFIL = "33333333-3333-3333-3333-333333333333";
const EINSATZ = "44444444-4444-4444-4444-444444444444";
const DISPO = "55555555-5555-5555-5555-555555555555";

/** Die Angaben, die den Kunden NICHTS angehen — in jeder Schreibweise. */
const VERRAETERISCH = ["krank", "Grippe", "Fieber", "Hausarzt", "Krankschreibung", "Bandscheibe"];

function spionPool(regeln = {}) {
  const gesehen = [];
  const pool = {
    query: async (sql, params) => {
      gesehen.push({ sql, params });
      for (const [muster, antwort] of Object.entries(regeln)) {
        if (sql.includes(muster)) return typeof antwort === "function" ? await antwort(sql, params) : antwort;
      }
      return { rows: [], rowCount: 0 };
    },
  };
  return { pool, gesehen };
}

function standardRegeln(extra = {}) {
  return {
    "FROM worker_profiles WHERE id": { rows: [{ first_name: "Max", last_name: "Mustermann", personnel_number: "4711" }], rowCount: 1 },
    "FROM org_memberships": { rows: [{ user_id: DISPO }], rowCount: 1 },
    "FROM worker_profiles wp": {
      rows: [{
        assignment_id: EINSATZ, assignment_status: "active",
        kunde_org_id: KUNDE_ORG, verknuepfung_org_id: KUNDE_ORG,
        kunde: "Müller GmbH", beginnt: "2026-08-19", endet: null,
      }],
      rowCount: 1,
    },
    "FROM notification_preferences": { rows: [], rowCount: 0 },
    "INSERT INTO notifications": (sql, params) => ({
      rows: [{ id: "n-1", type: params[2], title: params[3], message: params[4], severity: params[7], link_path: params[8] }],
      rowCount: 1,
    }),
    ...extra,
  };
}

/** Die volle Meldung, wie sie aus createSelbstmeldung kommt — mit allem Drum. */
const ABSENCE = Object.freeze({
  id: "abw-1",
  art: "krank",
  von: "2026-08-19",
  bis: "2026-08-25",
  zustand: "wirksam",
  aufgehoben_am: null,
  notiz: "Grippe mit Fieber",
  beschreibung: "Seit gestern Abend Fieber, war beim Hausarzt, Krankschreibung bis Freitag erwartet.",
  quelle: "mitarbeiter",
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. Die Zusage: nichts ueber das WARUM verlaesst den Betrieb
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("G4b — der Kunde erfaehrt nicht, warum", () => {
  it("KEIN Parameter des INSERTs traegt Art, Notiz oder Beschreibung", async () => {
    const { pool, gesehen } = spionPool(standardRegeln());
    const r = await benachrichtigeKunde(pool, LIEFERANT, {
      anlass: "ausfall", absence: ABSENCE, workerProfileId: PROFIL,
    });
    assert.equal(r.benachrichtigt, 1);

    const insert = gesehen.find((g) => g.sql.includes("INSERT INTO notifications"));
    assert.ok(insert, "es wurde gar nichts geschrieben");

    /* Ueber den GANZEN Parametersatz, nicht ueber die message allein: Ein
     * Zwischenfeld, in das jemand die Art spaeter "nur zur Info" mitgibt, waere
     * sonst unsichtbar. Genau so ist die Vorlage aus G4 gebaut — sie schreibt
     * die Art woertlich in ihren Text. */
    const alles = JSON.stringify(insert.params).toLowerCase();
    for (const wort of VERRAETERISCH) {
      assert.ok(!alles.includes(wort.toLowerCase()),
        `"${wort}" ist in die Kundenmeldung gerutscht — das ist ein Gesundheitsdatum ` +
        "nach Art. 9 DSGVO, und der Kunde ist ein Dritter");
    }
  });

  it("auch ein NEUES Feld an der Abwesenheit rutscht nicht durch", async () => {
    const { pool, gesehen } = spionPool(standardRegeln());
    await benachrichtigeKunde(pool, LIEFERANT, {
      anlass: "ausfall",
      absence: { ...ABSENCE, diagnose_code: "J11.1", zusatz: "Attest liegt vor" },
      workerProfileId: PROFIL,
    });
    const insert = gesehen.find((g) => g.sql.includes("INSERT INTO notifications"));
    const alles = JSON.stringify(insert.params);
    assert.ok(!alles.includes("J11.1"), "ein spaeter ergaenztes Feld ist mitgefahren");
    assert.ok(!alles.includes("Attest"), "ein spaeter ergaenztes Feld ist mitgefahren");
  });

  it("kundenNachricht nimmt gar kein Abwesenheits-Objekt entgegen", () => {
    /* Die staerkere Fassung der Zusage: `fuerKunde()` REDUZIERT ein Objekt —
     * `kundenNachricht()` bekommt keines. Was nicht uebergeben werden kann,
     * kann auch nicht durchrutschen. Dieser Test haelt die Signatur fest. */
    const text = kundenNachricht({
      anlass: "ausfall", name: "Max Mustermann", kunde: "Müller GmbH",
      von: "2026-08-19", bis: "2026-08-25",
      // absichtlich untergeschoben — die Funktion kennt diese Namen nicht:
      art: "krank", notiz: "Grippe", beschreibung: "Fieber",
    });
    for (const wort of VERRAETERISCH) {
      assert.ok(!text.toLowerCase().includes(wort.toLowerCase()),
        `"${wort}" steht im Text, obwohl die Funktion den Parameter nicht kennt`);
    }
    assert.match(text, /Mustermann/);
    assert.match(text, /Müller GmbH/);
    assert.match(text, /2026-08-19/);
  });

  it("die Nachricht sagt trotzdem, was der Kunde zum Planen braucht", async () => {
    const { pool, gesehen } = spionPool(standardRegeln());
    await benachrichtigeKunde(pool, LIEFERANT, { anlass: "ausfall", absence: ABSENCE, workerProfileId: PROFIL });
    const msg = gesehen.find((g) => g.sql.includes("INSERT INTO notifications")).params[4];
    assert.match(msg, /Mustermann/, "ohne Namen weiss der Kunde nicht, wer fehlt");
    assert.match(msg, /f(ae|ä)llt aus/i);
    assert.match(msg, /2026-08-25/, "ohne Enddatum kann der Kunde nicht planen");
  });

  it("ohne Enddatum steht 'Dauer noch offen' statt einer Luecke", () => {
    const text = kundenNachricht({ anlass: "ausfall", name: "Max", von: "2026-08-19", bis: null });
    assert.match(text, /offen/i, "eine fehlende Angabe muss benannt werden, nicht weggelassen");
  });

  it("auch der TITEL verraet nichts — er steht in Vorschau und Betreffzeile", () => {
    const m = getMatrix();
    for (const e of ["assignment.worker_unavailable", "assignment.worker_replaced"]) {
      const titel = m[e].title.toLowerCase();
      for (const wort of [...VERRAETERISCH, "abwesenheit", "krankmeldung"]) {
        assert.ok(!titel.includes(wort.toLowerCase()),
          `der Titel "${m[e].title}" nennt "${wort}" — Titel erscheinen in Push-Bannern ` +
          "und Betreffzeilen, wo der Empfaengerkreis ein anderer sein kann");
      }
    }
  });

  it("auch der TYPNAME zeigt auf den Einsatz, nicht auf die Person", () => {
    const m = getMatrix();
    for (const e of ["assignment.worker_unavailable", "assignment.worker_replaced"]) {
      assert.ok(m[e].type.startsWith("assignment_"),
        `${m[e].type} sollte mit assignment_ beginnen — der Typ steht in Filtern, ` +
        "Exporten und der Integrations-Konfiguration und ist selbst eine Aussage");
      assert.ok(!m[e].type.includes("absence"),
        `${m[e].type} enthaelt "absence" — ein Wort zu viel Richtung Person`);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. Wer ueberhaupt etwas bekommt — und wer nicht
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("G4b — der Empfaenger ist der Kunde, nicht der Lieferant", () => {
  it("der Empfaengerkreis kommt aus der Rechte-Matrix der KUNDEN-Org", async () => {
    const { pool, gesehen } = spionPool(standardRegeln());
    await benachrichtigeKunde(pool, LIEFERANT, { anlass: "ausfall", absence: ABSENCE, workerProfileId: PROFIL });

    const mitglieder = gesehen.find((g) => g.sql.includes("FROM org_memberships"));
    assert.equal(mitglieder.params[0], KUNDE_ORG,
      "die Empfaenger wurden in der falschen Organisation gesucht — die Ausfallmeldung " +
      "ginge an den Arbeitgeber statt an den Kunden, und beides sieht im Ergebnis gleich aus");
    assert.notEqual(mitglieder.params[0], LIEFERANT);
    assert.deepEqual(mitglieder.params[1], rbacService.PERMISSIONS[KUNDE_PERMISSION]);
  });

  it("org_id der Benachrichtigung ist die EMPFAENGER-Org", async () => {
    const { pool, gesehen } = spionPool(standardRegeln());
    await benachrichtigeKunde(pool, LIEFERANT, { anlass: "ausfall", absence: ABSENCE, workerProfileId: PROFIL });
    const insert = gesehen.find((g) => g.sql.includes("INSERT INTO notifications"));
    assert.equal(insert.params[1], KUNDE_ORG,
      "stuende hier der Lieferant, laege die Meldung in der Ablage einer fremden Organisation");
  });

  it("kein Kunde am Einsatz — keine Meldung", () => {
    const r = kundeIstEmpfangsberechtigt({ kunde_org_id: null }, LIEFERANT);
    assert.equal(r.erlaubt, false);
    assert.equal(r.grund, "KEIN_KUNDE");
  });

  it("Kunde IST der Lieferant — keine Meldung (im Bestand ein Viertel der Faelle)", () => {
    const r = kundeIstEmpfangsberechtigt({ kunde_org_id: LIEFERANT }, LIEFERANT);
    assert.equal(r.erlaubt, false);
    assert.equal(r.grund, "KUNDE_IST_LIEFERANT");
  });

  it("weichen Einsatz und Verknuepfung ab, wird NICHT gesendet", () => {
    /* worker_assignment_links.org_id kommt ungeprueft aus dem Anfrage-Rumpf.
     * Bei Abweichung ist unklar, wer der Kunde ist — und man benachrichtigte
     * Menschen, die den Einsatz in ihrer eigenen Ansicht gar nicht sehen. */
    const r = kundeIstEmpfangsberechtigt(
      { kunde_org_id: KUNDE_ORG, verknuepfung_org_id: "99999999-9999-9999-9999-999999999999" },
      LIEFERANT
    );
    assert.equal(r.erlaubt, false);
    assert.equal(r.grund, "ORG_DIVERGENZ");
  });

  it("ein interner Einsatz wird uebersprungen, ohne den Rest aufzuhalten", async () => {
    const { pool, gesehen } = spionPool(standardRegeln({
      "FROM worker_profiles wp": {
        rows: [
          { assignment_id: "a-intern", assignment_status: "active", kunde_org_id: LIEFERANT, verknuepfung_org_id: LIEFERANT, kunde: "Eigenbetrieb" },
          { assignment_id: EINSATZ, assignment_status: "active", kunde_org_id: KUNDE_ORG, verknuepfung_org_id: KUNDE_ORG, kunde: "Müller GmbH" },
        ],
        rowCount: 2,
      },
    }));
    const r = await benachrichtigeKunde(pool, LIEFERANT, { anlass: "ausfall", absence: ABSENCE, workerProfileId: PROFIL });
    assert.equal(r.benachrichtigt, 1, "der echte Kunde haette trotzdem eine Meldung bekommen muessen");
    assert.ok(r.uebersprungen.includes("KUNDE_IST_LIEFERANT"));
    const inserts = gesehen.filter((g) => g.sql.includes("INSERT INTO notifications"));
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0].params[6], EINSATZ, "der Anker zeigt auf den falschen Einsatz");
  });

  it("ein abgeschlossener Einsatz bekommt keine Meldung mehr", async () => {
    const { pool, gesehen } = spionPool(standardRegeln({
      "FROM worker_profiles wp": {
        rows: [{ assignment_id: EINSATZ, assignment_status: "completed", kunde_org_id: KUNDE_ORG, verknuepfung_org_id: KUNDE_ORG, kunde: "Müller GmbH" }],
        rowCount: 1,
      },
    }));
    const r = await benachrichtigeKunde(pool, LIEFERANT, { anlass: "ausfall", absence: ABSENCE, workerProfileId: PROFIL });
    assert.equal(r.benachrichtigt, 0);
    assert.ok(r.uebersprungen.includes("EINSATZ_ERLEDIGT"));
    assert.equal(gesehen.filter((g) => g.sql.includes("INSERT INTO notifications")).length, 0);
  });

  it("der Name wird org-gebunden geholt — ein fremdes Profil liefert nichts", async () => {
    const { pool } = spionPool(standardRegeln({ "FROM worker_profiles WHERE id": { rows: [], rowCount: 0 } }));
    const r = await benachrichtigeKunde(pool, LIEFERANT, { anlass: "ausfall", absence: ABSENCE, workerProfileId: PROFIL });
    assert.equal(r.benachrichtigt, 0);
    assert.equal(r.grund, "WORKER_NOT_IN_ORG");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 3. Die Freigabepflicht ist eine Grenze nach AUSSEN
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("G4b — eine beantragte Meldung verlaesst den Betrieb nicht", () => {
  it("zustand 'beantragt' loest KEINE Kundenmeldung aus", async () => {
    const { pool, gesehen } = spionPool(standardRegeln());
    const r = await benachrichtigeKunde(pool, LIEFERANT, {
      anlass: "ausfall",
      absence: { ...ABSENCE, zustand: "beantragt" },
      workerProfileId: PROFIL,
    });
    assert.equal(r.benachrichtigt, 0);
    assert.equal(r.grund, "NICHT_WIRKSAM",
      "die Firma hat noch nicht entschieden — das nach aussen zu tragen hiesse, " +
      "eine Entscheidung zu melden, die drinnen aussteht");
    assert.equal(gesehen.length, 0, "es wurde trotzdem etwas abgefragt");
  });

  it("eine bereits aufgehobene Meldung loest keinen Ausfall aus", async () => {
    const { pool } = spionPool(standardRegeln());
    const r = await benachrichtigeKunde(pool, LIEFERANT, {
      anlass: "ausfall",
      absence: { ...ABSENCE, aufgehoben_am: "2026-08-20T08:00:00Z" },
      workerProfileId: PROFIL,
    });
    assert.equal(r.grund, "NICHT_WIRKSAM");
  });

  it("die Absendebedingung ist genau fuerKunde().faellt_aus", () => {
    assert.equal(fuerKunde(ABSENCE).faellt_aus, true);
    assert.equal(fuerKunde({ ...ABSENCE, zustand: "beantragt" }).faellt_aus, false);
    assert.equal(fuerKunde({ ...ABSENCE, aufgehoben_am: "x" }).faellt_aus, false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 4. Entwarnung und Ersatz
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("G4b — Entwarnung und Ersatz", () => {
  it("die Entwarnung sagt, dass es doch keinen Ausfall gibt", async () => {
    const { pool, gesehen } = spionPool(standardRegeln());
    const r = await benachrichtigeKunde(pool, LIEFERANT, {
      anlass: "entwarnung",
      absence: { ...ABSENCE, aufgehoben_am: "2026-08-20T08:00:00Z" },
      workerProfileId: PROFIL,
    });
    assert.equal(r.benachrichtigt, 1, "eine zurueckgenommene Meldung muss den Kunden erreichen");
    const msg = gesehen.find((g) => g.sql.includes("INSERT INTO notifications")).params[4];
    assert.match(msg, /doch nicht|zur(ue|ü)ckgenommen/i);
    const alles = JSON.stringify(gesehen.find((g) => g.sql.includes("INSERT INTO notifications")).params).toLowerCase();
    for (const w of VERRAETERISCH) assert.ok(!alles.includes(w.toLowerCase()), `${w} in der Entwarnung`);
  });

  it("die Ersatz-Meldung nennt den Nachfolger und teilt den Typ NICHT mit dem Ausfall", async () => {
    const { pool, gesehen } = spionPool(standardRegeln());
    const r = await benachrichtigeKunde(pool, LIEFERANT, {
      anlass: "ersatz",
      workerProfileId: PROFIL,
      einsaetze: [{ assignment_id: EINSATZ, assignment_status: "active", kunde_org_id: KUNDE_ORG, verknuepfung_org_id: KUNDE_ORG, kunde: "Müller GmbH" }],
      ersatzName: "Erika Ersatz",
    });
    assert.equal(r.benachrichtigt, 1);
    const insert = gesehen.find((g) => g.sql.includes("INSERT INTO notifications"));
    assert.match(insert.params[4], /Erika Ersatz/);
    assert.equal(insert.params[2], "assignment_worker_replaced");
    assert.equal(insert.params[7], "success", "der Ersatz ist die gute Nachricht");
  });

  it("Ausfall und Entwarnung teilen sich den Typ, der Ersatz hat einen eigenen", () => {
    assert.equal(kundenEreignis("ausfall"), kundenEreignis("entwarnung"),
      "ein eigener Entwarnungs-Typ wuerde die beiden in Liste und Filter auseinanderreissen");
    assert.notEqual(kundenEreignis("ersatz"), kundenEreignis("ausfall"));
  });

  it("ohne Namen des Ersatzes bleibt die Meldung trotzdem verstaendlich", () => {
    const text = kundenNachricht({ anlass: "ersatz", name: "Max", kunde: "Müller GmbH", ersatzName: null });
    assert.match(text, /Ersatz/);
    assert.ok(!text.includes("null") && !text.includes("undefined"));
  });

  it("der Ersatz-Pfad fragt die Folgen-Vorschau NICHT ab — er kennt seinen Einsatz", async () => {
    const { pool, gesehen } = spionPool(standardRegeln());
    await benachrichtigeKunde(pool, LIEFERANT, {
      anlass: "ersatz", workerProfileId: PROFIL, ersatzName: "Erika",
      einsaetze: [{ assignment_id: EINSATZ, assignment_status: "active", kunde_org_id: KUNDE_ORG, verknuepfung_org_id: KUNDE_ORG }],
    });
    assert.equal(gesehen.find((g) => g.sql.includes("daterange")), undefined,
      "ein Zeitfenster wuerde fremde Einsaetze desselben Menschen einfangen");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 5. Der Verweis und der Anker
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("G4b — der Verweis fuehrt zum Einsatz", () => {
  it("der Anker ist der EINSATZ, nicht die Abwesenheit", async () => {
    const { pool, gesehen } = spionPool(standardRegeln());
    await benachrichtigeKunde(pool, LIEFERANT, { anlass: "ausfall", absence: ABSENCE, workerProfileId: PROFIL });
    const insert = gesehen.find((g) => g.sql.includes("INSERT INTO notifications"));
    assert.equal(insert.params[5], "assignment");
    assert.equal(insert.params[6], EINSATZ);
    assert.notEqual(insert.params[6], ABSENCE.id,
      "die Abwesenheits-ID als Anker waere eine Kennung, auf die der Kunde keinen Zugriff hat — " +
      "und die Dedupe-Klausel soll je EINSATZ einmal zustellen, nicht je Meldung einmal");
  });

  it("der Link traegt den Einsatz und zeigt auf eine Seite, die es gibt", () => {
    const link = kundenDeepLink(EINSATZ);
    assert.ok(link.includes("einsatz=" + EINSATZ));
    const ziel = link.split("#")[0].split("?")[0].replace(/^\//, "").replace(/^public\//, "");
    assert.ok(fs.existsSync(path.join(REPO, "frontend", "public", ziel)),
      `der Verweis zeigt auf ${ziel} — diese Seite gibt es nicht, nginx antwortet 404`);
  });

  it("eine Einsatz-ID mit Sonderzeichen wird kodiert", () => {
    assert.ok(!kundenDeepLink('a"b&c').includes('"'));
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 6. Fehler bleiben folgenlos
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("G4b — der Zustellweg nimmt die Meldung nie zurueck", () => {
  it("eine kaputte Datenbank wirft nicht", async () => {
    const pool = { query: async () => { throw new Error("Verbindung weg"); } };
    const r = await benachrichtigeKunde(pool, LIEFERANT, { anlass: "ausfall", absence: ABSENCE, workerProfileId: PROFIL });
    assert.equal(r.benachrichtigt, 0);
    assert.equal(r.grund, "Verbindung weg");
  });

  it("unbekannter Anlass und fehlende Angaben werden abgewiesen, nicht geraten", async () => {
    const { pool, gesehen } = spionPool(standardRegeln());
    assert.equal((await benachrichtigeKunde(pool, LIEFERANT, { anlass: "kuendigung", workerProfileId: PROFIL })).grund, "UNBEKANNTER_ANLASS");
    assert.equal((await benachrichtigeKunde(pool, null, { anlass: "ausfall", workerProfileId: PROFIL })).grund, "MISSING_PARAMS");
    assert.equal(gesehen.length, 0);
  });

  it("kein betroffener Einsatz — keine Meldung, aber auch kein Fehler", async () => {
    const { pool } = spionPool(standardRegeln({ "FROM worker_profiles wp": { rows: [], rowCount: 0 } }));
    const r = await benachrichtigeKunde(pool, LIEFERANT, { anlass: "ausfall", absence: ABSENCE, workerProfileId: PROFIL });
    assert.equal(r.grund, "KEIN_EINSATZ");
  });

  it("KUNDE_ANLAESSE und kundenEreignis bleiben deckungsgleich", () => {
    for (const a of KUNDE_ANLAESSE) {
      assert.ok(getMatrix()[kundenEreignis(a)], `Anlass "${a}" zeigt auf ein Ereignis, das die Matrix nicht kennt`);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 7. Die Register — und ein Waechter, der einen Bestandsfehler aufdeckt
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("G4b — kein Typ ohne seine Eintraege", () => {
  const EVENTS = ["assignment.worker_unavailable", "assignment.worker_replaced"];

  it("jeder Typ steht in Matrix, Surface-Map und Kategorie-Zuordnung", () => {
    const m = getMatrix();
    for (const e of EVENTS) {
      assert.ok(m[e], `${e} fehlt in der Matrix`);
      assert.equal(surfaceForType(m[e].type), "assignments", `${m[e].type} hat keine Hub-Karte`);
      assert.equal(EVENT_CATEGORY_MAP[e], "client_assignment_updates",
        `${e} faellt auf eine fremde Kategorie zurueck — der Kunde haette dann EINEN ` +
        "Schalter fuer seine eigene Belegschaft und fuer fremde Einsatzkraefte");
    }
  });

  it("jeder Typ steht im CHECK der Migration 184", () => {
    const datei = path.join(REPO, "sql", "migrations", "184_der_kunde_erfaehrt_dass_nicht_warum.sql");
    assert.ok(fs.existsSync(datei), "Migration 184 fehlt");
    const sql = fs.readFileSync(datei, "utf8");
    const m = getMatrix();
    for (const e of EVENTS) {
      assert.ok(sql.includes(`'${m[e].type}'`),
        `${m[e].type} fehlt im CHECK — der INSERT scheitert STILL, wie bei Migration 139`);
    }
    assert.ok(sql.includes("waere geschrumpft"), "die Migration schuetzt die Typliste nicht");
  });

  it("die Oberflaechen-Kopie der Surface-Map kennt beide Typen", () => {
    const datei = path.join(REPO, "frontend", "public", "js", "hubCardBadges.js");
    const js = fs.readFileSync(datei, "utf8");
    const m = getMatrix();
    for (const e of EVENTS) {
      assert.ok(js.includes(`"${m[e].type}"`),
        `${m[e].type} fehlt in hubCardBadges.js — die Karte zaehlt die Meldung nicht mit`);
    }
  });

  it("die Aktivitaetsliste kennt jeden Typ — sonst zeigt sie den rohen Schluessel", () => {
    /* Die Stelle, die G4 uebersehen hat. Ohne Eintrag erscheint der
     * Schluesselname als Beschriftung, und unter jedem Kategoriefilter
     * verschwindet die Meldung ganz. */
    const js = fs.readFileSync(path.join(REPO, "frontend", "public", "js", "pages", "activity.js"), "utf8");
    const m = getMatrix();
    const fehlend = [];
    for (const e of EVENTS) if (!js.includes(m[e].type)) fehlend.push(m[e].type);
    for (const t of ["worker_absence_reported", "worker_delay_reported"]) if (!js.includes(t)) fehlend.push(t);
    assert.deepEqual(fehlend, [],
      "in frontend/public/js/pages/activity.js nachtragen (TYPE_GROUPS + CAT_TYPES + Woerterbuecher)");
  });

  it("JEDE severity der Matrix ist ein Wert, den die Datenbank erlaubt", () => {
    /* DIESER WAECHTER DECKT EINEN BESTANDSFEHLER AUF, den G4b beim Bauen fand:
     * Der CHECK auf notifications.severity (Migration 019) erlaubt nur
     * info/warning/error/success. Vier Notdienst-Eintraege der Matrix fuehren
     * 'urgent' — ihre INSERTs werden von der Datenbank abgewiesen, und zwar
     * still. Ausgerechnet der dringlichste Fall der Plattform kommt nie an.
     *
     * Der Test ist absichtlich als BEFUND formuliert und nicht abgeschwaecht:
     * Er bleibt rot, bis jemand entscheidet, ob die Matrix oder der CHECK
     * nachgibt. Ein Waechter, der den Fehler kennt und trotzdem gruen ist,
     * waere derselbe stille Ausfall eine Ebene hoeher. */
    /* Die Liste wird IMPORTIERT, nicht wiederholt: Eine zweite Kopie hier
     * waere genau die Drift, gegen die der Test antritt. Erweitert jemand den
     * CHECK per Migration, aendert er die Konstante mit — und dieser Test
     * folgt, ohne dass ihn jemand anfassen muss. */
    const ERLAUBT = ERLAUBTE_SEVERITY;
    const m = getMatrix();
    const verstoesse = Object.entries(m)
      .filter(([, cfg]) => !ERLAUBT.includes(cfg.severity))
      .map(([k, cfg]) => `${k} = '${cfg.severity}'`);

    assert.deepEqual(verstoesse, [],
      "diese Ereignisse tragen eine Dringlichkeit, die notifications_severity_check " +
      "(Migration 019) nicht kennt — ihre Benachrichtigungen entstehen NIE:\n  " +
      verstoesse.join("\n  "));
  });
});
