/**
 * ═══════════════════════════════════════════════════════════════════════════
 * M4c.13 — JEDER TYP DER MATRIX MUSS IN DER POSITIVLISTE STEHEN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * DER BEFUND, DEN ES NICHT WIEDER GEBEN DARF.
 *
 * `notificationMatrix` fuehrt 54 Ereignisse mit 41 verschiedenen Typen. Genau
 * EINES bildete auf einen Typ ab, den der CHECK auf `notifications.type` nicht
 * kennt: `worker.skills_awaiting_release -> worker_marktpraesenz`. Der INSERT
 * scheiterte mit 23514, und der Aufrufer schluckt den Fehler bewusst (die
 * Faehigkeiten sind gespeichert, eine gescheiterte Meldung darf das nicht
 * gefaehrden). Ergebnis: der Arbeiter traegt ein, die Zeitarbeitsfirma erfaehrt
 * es NIE, niemand gibt frei — eine plausible Mitursache dafuer, dass nur 3 von
 * 33 Kraeften eine freigegebene Faehigkeit trugen.
 *
 * WARUM DIESE PROBE OHNE DATENBANK LAEUFT, und das ist der Kern:
 *
 * Beide Seiten sind STATISCH LESBAR. Die Matrix steht im Modul, die Positivliste
 * in den Migrationen. Eine Probe, die dafuer eine Datenbank braucht, laeuft im
 * Tor nicht — und ein Befund, den nur ein Container findet, wird beim naechsten
 * neuen Typ wieder niemandem auffallen. Genau diese Lehre hat M4c.15 gekostet:
 * eine Zusicherung, die nur mit Datenbank rot werden kann, ist im Tor keine.
 *
 * DIE POSITIVLISTE WIRD AUS DEN MIGRATIONEN REKONSTRUIERT: die Grundliste aus
 * dem CREATE/ALTER mit dem ersten CHECK, danach jede Erweiterung, die ein
 * `neu TEXT[] := ARRAY[...]` anhaengt. Das ist genau der Weg, den die
 * Migrationen selbst gehen — sie lesen die bestehende Liste und ergaenzen.
 *
 * Run: node --test test/meldungKommtAn.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getMatrix, dispatch } from "../services/notificationMatrix.js";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONEN = path.join(HIER, "..", "..", "sql", "migrations");

/**
 * Alle Typen, die `notifications.type` laut Migrationen erlaubt.
 *
 * Gelesen werden zwei Formen, weil beide vorkommen:
 *   - die Grundliste: ein CHECK mit `type IN ('a', 'b', …)` oder
 *     `type = ANY (ARRAY['a', …])`
 *   - jede Erweiterung: `neu TEXT[] := ARRAY['x','y']` in einem DO-Block, der
 *     den CHECK neu setzt
 */
function erlaubteTypen() {
  const dateien = fs.readdirSync(MIGRATIONEN).filter((f) => f.endsWith(".sql")).sort();
  const typen = new Set();
  const fundstellen = new Map();
  for (const datei of dateien) {
    const roh = fs.readFileSync(path.join(MIGRATIONEN, datei), "utf8");
    /* OHNE KOMMENTARE: die Ruecknahme-Anweisungen im Kopf jeder Migration nennen
       genau die Typen, die dort NICHT mehr stehen sollen. Eine Probe, die den
       Kommentar mitliest, haelt einen entfernten Typ fuer erlaubt. */
    const sql = roh.replace(/^\s*--.*$/gm, "");
    if (!/notifications_type_check|CREATE TABLE IF NOT EXISTS notifications|ALTER TABLE notifications/.test(sql)) continue;

    for (const m of sql.matchAll(/neu\s+TEXT\[\]\s*:=\s*ARRAY\[([^\]]+)\]/g)) {
      for (const t of m[1].matchAll(/'([a-z0-9_]+)'/g)) {
        if (!typen.has(t[1])) fundstellen.set(t[1], datei);
        typen.add(t[1]);
      }
    }
    for (const m of sql.matchAll(/type\s+IN\s*\(([^)]+)\)/gi)) {
      for (const t of m[1].matchAll(/'([a-z0-9_]+)'/g)) {
        if (!typen.has(t[1])) fundstellen.set(t[1], datei);
        typen.add(t[1]);
      }
    }
    for (const m of sql.matchAll(/type\s*=\s*ANY\s*\(\s*ARRAY\[([^\]]+)\]/gi)) {
      for (const t of m[1].matchAll(/'([a-z0-9_]+)'/g)) {
        if (!typen.has(t[1])) fundstellen.set(t[1], datei);
        typen.add(t[1]);
      }
    }
  }
  return { typen, fundstellen };
}

const { typen: ERLAUBT, fundstellen: WOHER } = erlaubteTypen();

/** Ereignis -> Typ, wie die Matrix es fuehrt. */
function matrixTypen() {
  const paare = [];
  for (const [ereignis, cfg] of Object.entries(getMatrix())) {
    if (cfg && typeof cfg.type === "string") paare.push([ereignis, cfg.type]);
  }
  return paare;
}

describe("M4c.13 · die Probe prueft zuerst ihren eigenen Gegenstand", () => {
  it("die Positivliste ist ueberhaupt lesbar — sonst ist die Probe leer gruen", () => {
    /*
     * DIESE ZEILE IST DER WICHTIGSTE TEIL DER DATEI.
     *
     * Beim Messen ist der Fehlalarm ZWEIMAL passiert, mir und der Nachbarsitzung:
     * ein Muster, das die Liste nicht traf, meldete "0 Typen erlaubt, 54
     * abgewiesen". Ohne diese Schranke waere die Probe danach LEER GRUEN gewesen,
     * sobald jemand das Muster kaputtmacht — sie haette nichts mehr zu
     * vergleichen und keinen Verstoss mehr finden koennen.
     */
    assert.ok(ERLAUBT.size >= 80,
      `nur ${ERLAUBT.size} erlaubte Typen aus den Migrationen gelesen — das Muster trifft die Liste nicht mehr`);
  });

  it("die Matrix ist ueberhaupt lesbar", () => {
    const paare = matrixTypen();
    assert.ok(paare.length >= 50, `nur ${paare.length} Ereignisse mit Typ in der Matrix`);
    assert.ok(new Set(paare.map(([, t]) => t)).size >= 35, "zu wenige verschiedene Typen — Matrix nicht gelesen?");
  });

  it("die Grundliste kommt aus einer Migration, nicht aus einem Kommentar", () => {
    /* Gegenprobe zur Kommentar-Falle: ein Typ, der nur in einer
       Ruecknahme-Anweisung steht, darf nicht als erlaubt gelten. */
    for (const t of ERLAUBT) {
      assert.ok(WOHER.has(t), `Typ ${t} hat keine Fundstelle`);
    }
  });
});

describe("M4c.13 · jeder Typ der Matrix steht in der Positivliste", () => {
  it("kein Ereignis bildet auf einen Typ ab, den die Datenbank abweist", () => {
    /*
     * Der entdeckende Waechter. Kein Ausnahmeverzeichnis: ein Typ, den die
     * Datenbank nicht kennt, ist kein Sonderfall, sondern eine Meldung, die
     * nicht entsteht — und der Aufrufer schluckt den Fehler.
     */
    const fehlend = matrixTypen().filter(([, t]) => !ERLAUBT.has(t));
    assert.deepEqual(fehlend, [],
      "Diese Ereignisse bilden auf einen Typ ab, den der CHECK auf notifications.type "
      + "nicht erlaubt. Der INSERT scheitert mit 23514, der Aufrufer schluckt es, und "
      + "die Meldung entsteht NIE:\n  "
      + fehlend.map(([e, t]) => `${e} -> ${t}`).join("\n  ")
      + "\n\nBeheben: eine Migration nach dem Muster von 184/221, die die bestehende "
      + "Liste AUS DEM CONSTRAINT liest und ergaenzt — nie neu hinschreibt.");
  });

  it("der Typ aus M4c.12 ist dabei — der Befund selbst", () => {
    /* Namentlich, damit die Probe nicht gruen wird, wenn jemand das Ereignis aus
       der Matrix entfernt statt den Typ zu ergaenzen. Der Anstoss zur Freigabe
       ist die Leitung, an der 30 von 33 unsichtbaren Kraeften haengen. */
    const paare = matrixTypen();
    const eintrag = paare.find(([e]) => e === "worker.skills_awaiting_release");
    assert.ok(eintrag, "das Ereignis worker.skills_awaiting_release fehlt in der Matrix");
    assert.equal(eintrag[1], "worker_marktpraesenz", "das Ereignis traegt einen anderen Typ");
    assert.ok(ERLAUBT.has("worker_marktpraesenz"),
      "worker_marktpraesenz steht nicht in der Positivliste — Migration 221 fehlt oder greift nicht");
  });
});

describe("M4c.13 · die Dringlichkeitsstufen ebenso", () => {
  it("jede Stufe der Matrix ist eine, die der CHECK auf severity erlaubt", () => {
    /*
     * Dieselbe Klasse, und sie ist hier schon einmal eingetreten: vier
     * Notdienst-Eintraege trugen 'urgent', und ausgerechnet der dringlichste
     * Fall der Plattform kam nie an (Welle G4b). Der Kopf des Matrix-Moduls
     * erzaehlt das — eine Probe daraus gab es bisher nicht.
     */
    const ERLAUBTE_STUFEN = ["info", "warning", "error", "success"];
    const falsch = Object.entries(getMatrix())
      .filter(([, cfg]) => cfg && cfg.severity && !ERLAUBTE_STUFEN.includes(cfg.severity))
      .map(([e, cfg]) => `${e} -> ${cfg.severity}`);
    assert.deepEqual(falsch, [],
      "Diese Ereignisse tragen eine Dringlichkeit, die der CHECK auf "
      + "notifications.severity (Mig 019) nicht erlaubt — der INSERT scheitert still:\n  "
      + falsch.join("\n  "));
  });
});

describe("M4c.14 · der geschluckte Fehlschlag wird gezaehlt", () => {
  /** Ein Muster-Zugang, der das Schreiben von Benachrichtigungen scheitern laesst. */
  function pool({ scheitertBei = () => true } = {}) {
    const abfragen = [];
    return {
      abfragen,
      query: async (sql, params) => {
        abfragen.push({ sql, params });
        if (/INSERT INTO notifications/i.test(sql)) {
          if (scheitertBei(params?.[0])) {
            const e = new Error("CHECK"); e.code = "23514"; throw e;
          }
          return { rows: [{ id: "n1", type: "x", title: "t", created_at: new Date(0) }] };
        }
        return { rows: [] };
      }
    };
  }

  const KONTEXT = {
    recipientUserIds: ["u1"],
    orgId: "o1",
    entityType: "worker_profile",
    entityId: "wp1",
    _skipPreferenceCheck: true
  };

  it("erreicht NIEMAND eine Meldung, erfaehrt der Aufrufer es — mit Zahlen", async () => {
    /*
     * Zwei Dinge auf einmal, und beide sind an einer ueberlebenden Rueckmutation
     * entstanden:
     *
     * `failed++` entfernt blieb gruen, weil die Audit-Zeile weiter entstand. Ein
     * Aufrufer, der wissen WILL, ob seine Meldung ankam, bekam eine Null und
     * haette sie fuer Erfolg gelesen.
     *
     * Und geschluckt werden darf der Fall NICHT: `stupseNutzerAn` nimmt im
     * Fehlerfall seinen Wochen-Vermerk zurueck. Ohne Fehler stuende die
     * Wochensperre, obwohl nichts zugestellt wurde.
     */
    const p = pool();
    await assert.rejects(
      () => dispatch(p, "worker.skills_awaiting_release", KONTEXT),
      (err) => {
        assert.equal(err.code, "NOTIFICATION_DISPATCH_FAILED", "ein anderer Fehler als erwartet");
        assert.equal(err.failed, 1, "der Fehler traegt die Zahl der Fehlschlaege nicht");
        assert.equal(err.sent, 0, "ein gescheiterter Versuch zaehlt als gesendet");
        assert.equal(err.eventKey, "worker.skills_awaiting_release", "das Ereignis fehlt am Fehler");
        return true;
      });
  });

  it("ein Fehlschlag bricht die ANDEREN Empfaenger nicht ab", async () => {
    /*
     * Die zweite Rueckmutation, die ueberlebte: `continue` zu `break`. Dann
     * bekaeme von fuenf Berechtigten nur der erste eine Meldung, sobald bei ihm
     * etwas schiefgeht — und die Zahlen sagten trotzdem "einer gescheitert".
     * Der zweite Berechtigte erfaehrt von der Freigabe nie.
     */
    const p = pool({ scheitertBei: (userId) => userId === "u1" });
    const e = await dispatch(p, "worker.skills_awaiting_release",
      { ...KONTEXT, recipientUserIds: ["u1", "u2", "u3"] });
    assert.equal(e.failed, 1, "der eine Fehlschlag wird nicht gezaehlt");
    assert.equal(e.sent, 2,
      "nach dem ersten Fehlschlag wurde abgebrochen — die uebrigen Berechtigten "
      + "erfahren von der Freigabe nie");
    /* Und der TEILweise Fehlschlag fliegt NICHT hinaus: zwei Menschen haben ihre
       Meldung, und niemandem ist geholfen, wenn der Aufrufer sie zurueckrollt. */
  });

  it("der Fehlschlag wird als Audit-Zeile sichtbar, mit Ereignis und Fehlercode", async () => {
    const p = pool();
    await assert.rejects(() => dispatch(p, "worker.skills_awaiting_release", KONTEXT));
    const audit = p.abfragen.filter((a) => /INSERT INTO audit_log/i.test(a.sql));
    assert.equal(audit.length, 1, `${audit.length} Audit-Zeilen, erwartet 1`);
    const params = audit[0].params || [];
    assert.ok(params.includes("notification.dispatch_failed"), "die Aktion fehlt");
    /* Beide Formen: `writeAudit` reicht die Details als Objekt weiter, und je
       nach Aufbereitung kommt sie als JSON-Zeichenkette an. Eine Probe, die nur
       eine Form kennt, waere leer gruen, sobald die andere greift. */
    const details = params.find((x) => x && typeof x === "object" && "event_key" in x)
      || params.map((x) => { try { return JSON.parse(x); } catch { return null; } })
              .find((x) => x && x.event_key);
    assert.ok(details, "die Details fehlen: " + JSON.stringify(params).slice(0, 200));
    assert.equal(details.event_key, "worker.skills_awaiting_release");
    assert.equal(details.notification_type, "worker_marktpraesenz");
    assert.equal(details.error_code, "23514", "ohne Fehlercode weiss niemand, WAS zu tun ist");
    assert.ok(!JSON.stringify(details).includes("CHECK"),
      "der Fehlertext steht in den Details — er kann Nutzdaten der Zeile tragen");
  });

  it("ein Fehlschlag beim Audit gefaehrdet den Rest nicht", async () => {
    /* Die Sichtbarkeit darf das Beobachtete nie mitreissen. */
    const abfragen = [];
    const p = {
      abfragen,
      query: async (sql, params) => {
        abfragen.push({ sql, params });
        if (/INSERT INTO notifications/i.test(sql)) { const e = new Error("x"); e.code = "23514"; throw e; }
        if (/INSERT INTO audit_log/i.test(sql)) throw new Error("Audit kaputt");
        return { rows: [] };
      }
    };
    await assert.rejects(
      () => dispatch(p, "worker.skills_awaiting_release", { ...KONTEXT, recipientUserIds: ["u1", "u2"] }),
      (err) => {
        assert.equal(err.failed, 2, "nach einem Audit-Fehler wird nicht weitergezaehlt");
        return true;
      });
  });
});
