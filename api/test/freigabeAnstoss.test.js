/**
 * Der Anstoss an die Firma (M4.8, Owner-Vorgabe 2026-09-05).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WAS HIER BEWACHT WIRD
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Der Veroeffentlichungsweg ist seit langem fertig: `setzeMarktpraesenz` legt
 * SYNCHRON je Katalog-Faehigkeit einen anonymen Marktplatz-Eintrag an, und der
 * Endpunkt `POST /workers/:id/marktpraesenz` ist org-gebunden, rechte-geprueft
 * und auditiert. Der OK-Klick der Firma existiert.
 *
 * WAS FEHLTE, WAR DER ANSTOSS. Ein Mensch trug im Portal seine Faehigkeiten
 * ein — und danach passierte nichts. Kein Eintrag, keine Meldung, kein Hinweis
 * an die Zeitarbeitsfirma, bei der die Freigabe liegt. Gemessen: **30 von 33
 * Kraeften unsichtbar**.
 *
 * Das ist die unangenehmste Sorte Luecke, weil beide Haelften funktionieren und
 * niemand dazwischen etwas vermisst — dieselbe Klasse wie die Reset-Mail aus
 * M3.4, die funktionierte und ins Leere fuehrte.
 *
 * Abnahme aus dem Plan (M4.8): **Faehigkeit speichern → Firma sieht die
 * Freigabe → Klick → Eintrag steht im Feed, ohne auf den 15-Minuten-Takt zu
 * warten. Rueckmutation: Anstoss entfernen → Probe rot.**
 *
 * Run: node --test --test-force-exit test/freigabeAnstoss.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { setzeMarktpraesenz } from "../services/marktpraesenzService.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createWorkerPortalRouter } from "../routes/workerPortal.js";
import { getMatrix } from "../services/notificationMatrix.js";

/* Pfade IMMER relativ zur Testdatei — sonst haengt das Ergebnis am
   Startverzeichnis und der Test ueberspringt sich je nach cwd lautlos. */
const HIER = path.dirname(fileURLToPath(import.meta.url));
const API = path.resolve(HIER, "..");

const ARBEITER = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";
const PROFIL = "33333333-3333-4333-8333-333333333333";
const CHEF_A = "44444444-4444-4444-8444-444444444444";
const CHEF_B = "55555555-5555-4555-8555-555555555555";
/* Echte UUIDs: `putSkillsSchema` prueft `skill_id` als UUID — mit "s-0" endet
   der Aufruf bei 400 VALIDATION, und die Probe meldete eine Luecke, die es
   nicht gibt. (Beim Schreiben dieser Datei genau so passiert.) */
const FAEHIGKEIT = (i) => `6${i}666666-6666-4666-8666-666666666666`;

/* ── Vorrichtung ─────────────────────────────────────────────────────── */

function musterPool(regeln = []) {
  const abfragen = [];
  const antworte = async (sql, params = []) => {
    abfragen.push({ sql: String(sql), params });
    for (const r of regeln) {
      const treffer = r.match instanceof RegExp ? r.match.test(sql) : String(sql).includes(r.match);
      if (treffer) return typeof r.rows === "function" ? r.rows() : r.rows;
    }
    return { rows: [], rowCount: 0 };
  };
  /* `setWorkerSkills` laeuft in `withTransaction` — ohne `connect` scheitert der
     Aufruf, und die Probe meldete eine Luecke, die es nicht gibt. */
  return {
    abfragen,
    query: antworte,
    connect: async () => ({ query: antworte, release() {} })
  };
}

const PROFIL_ZEILE = {
  match: "FROM worker_profiles wp",
  rows: { rows: [{ id: PROFIL, user_id: ARBEITER, supplier_org_id: ORG,
                   first_name: "Mara", last_name: "Ines" }] }
};
/* `findOrgMembersWithPermission` liest die Mitgliedschaften der Org. */
const CHEFS = {
  match: "FROM org_memberships",
  rows: { rows: [{ user_id: CHEF_A }, { user_id: CHEF_B }] }
};

function mockRes() {
  return {
    _status: 200, _json: null, locals: {},
    status(c) { this._status = c; return this; },
    json(b) { this._json = b; return this; },
    setHeader() { return this; }
  };
}

function handler(router, methode, pfad) {
  for (const layer of router.stack) {
    if (!layer.route || layer.route.path !== pfad) continue;
    if (!layer.route.methods[methode]) continue;
    return layer.route.stack[layer.route.stack.length - 1].handle;
  }
  throw new Error(`Route ${methode} ${pfad} nicht gefunden`);
}

/** Warten, bis geantwortet ODER `next` gerufen wurde (siehe M3.4). */
async function fahre(h, req, res) {
  let fertig = false;
  const fehler = [];
  h(req, res, (e) => { fertig = true; if (e) fehler.push(e); });
  for (let i = 0; i < 300 && !fertig && res._json === null; i++) {
    await new Promise((r) => setImmediate(r));
  }
  return fehler;
}

const durch = (_q, _s, n) => n();

/** Faehrt `PUT /worker/me/skills` und gibt zurueck, was dabei geschah. */
async function speichereFaehigkeiten({ anzahl = 2, regeln = [], logger = null } = {}) {
  const pool = musterPool([
    PROFIL_ZEILE,
    CHEFS,
    /*
     * Die Zahl entsteht aus der KATALOG-Abfrage, nicht aus dem Einfuegen:
     * `setWorkerSkills` behaelt nur, was in `platform_skills` aktiv steht — ein
     * Vorschlag faellt heraus. Genau das macht `anzahl: 0` zur ehrlichen
     * Nachstellung eines reinen Vorschlags.
     */
    { match: /FROM platform_skills/i,
      rows: { rows: Array.from({ length: anzahl }, (_, i) => ({ id: FAEHIGKEIT(i), name: `F${i}` })) } },
    ...regeln
  ]);
  const router = createWorkerPortalRouter({
    pool, requireAuth: durch, logger: logger || { info() {}, warn() {}, error() {}, debug() {} }
  });
  const res = mockRes();
  const fehler = await fahre(
    handler(router, "put", "/worker/me/skills"),
    { session: { userId: ARBEITER },
      body: { skills: Array.from({ length: Math.max(anzahl, 1) },
                                 (_, i) => ({ skill_id: FAEHIGKEIT(i) })) },
      headers: {}, params: {}, query: {}, get: () => "" },
    res);
  const meldungen = pool.abfragen.filter((a) => /INSERT INTO notifications/i.test(a.sql));
  return { res, pool, meldungen, fehler };
}

/* ── 1. Das Ereignis selbst ──────────────────────────────────────────── */

describe("M4.8 · das Ereignis fuehrt irgendwohin", () => {
  it("es steht in der Matrix, mit Empfaengern und einem Ziel", () => {
    const e = getMatrix()["worker.skills_awaiting_release"];
    assert.ok(e, "das Ereignis fehlt — dann verwirft `dispatch` es mit einer Warnung");
    assert.equal(e.recipientStrategy, "org_worker_managers");
    assert.ok(e.title && e.title.length > 10, "ohne Titel steht in der Kachel nichts");
  });

  it("das Ziel ist ein DEEP-LINK, keine allgemeine Uebersicht", () => {
    /*
     * Projektregel: "Karten/Listen/Benachrichtigungen, die auf etwas verweisen,
     * muessen direkt zum konkreten Ziel fuehren." Eine Meldung "jemand wartet
     * auf Freigabe", die auf die volle Mitarbeiterliste zeigt, laesst den
     * Disponenten suchen — und bei 200 Kraeften hoert er damit auf.
     */
    const e = getMatrix()["worker.skills_awaiting_release"];
    assert.match(e.linkPath, /^\/public\/mitarbeiter\.html\?/,
      "das Ziel ist keine gefilterte Ansicht");
    assert.match(e.linkPath, /freigabe=offen/,
      "der Filter fehlt — die Meldung fuehrt auf die ungefilterte Liste");
  });
});

/* ── 2. Der Anstoss ──────────────────────────────────────────────────── */

describe("M4.8 · speichert der Mensch, erfaehrt es die Firma", () => {
  it("jede Person mit `worker.edit` bekommt die Meldung", async () => {
    const { res, meldungen } = await speichereFaehigkeiten({ anzahl: 2 });

    assert.equal(res._json?.ok, true, "das Speichern selbst ist gescheitert");
    assert.equal(meldungen.length, 2,
      `${meldungen.length} Meldungen statt zwei — die Firma erfaehrt nicht, dass etwas `
      + "zur Freigabe liegt");
    const empfaenger = meldungen.map((m) => String(m.params[0])).sort();
    assert.deepEqual(empfaenger, [CHEF_A, CHEF_B].sort());
  });

  it("die Meldung nennt den Menschen und die Zahl", async () => {
    /* "Jemand hat etwas eingetragen" beantwortet die einzige Frage nicht, die
       der Disponent stellt: WER, und lohnt der Klick. */
    const { meldungen } = await speichereFaehigkeiten({ anzahl: 3 });
    const text = String(meldungen[0].params.find((p) => typeof p === "string" && p.includes("Mara")) || "");
    assert.ok(text.includes("Mara"), `der Name fehlt in der Meldung: ${text}`);
    assert.ok(text.includes("3"), `die Zahl fehlt in der Meldung: ${text}`);
  });

  it("die Empfaenger kommen aus der Org DES PROFILS, nicht aus der Sitzung", async () => {
    /*
     * Der Arbeiter ist regulaer Mitglied in der Org seiner Zeitarbeitsfirma —
     * `req.orgId` traegt also zufaellig dieselbe Kennung. Genau deshalb ist die
     * Verwechslung hier unsichtbar, bis sie es nicht mehr ist: die Bindung
     * gehoert an `profile.supplier_org_id`, das ist die Firma, die den Menschen
     * fuehrt.
     */
    const { pool } = await speichereFaehigkeiten({ anzahl: 1 });
    const mitglieder = pool.abfragen.find((a) => /FROM org_memberships/i.test(a.sql));
    assert.ok(mitglieder, "es wurde gar nicht nach Empfaengern gesucht");
    assert.equal(String(mitglieder.params[0]), ORG,
      "gesucht wurde in einer anderen Org als der des Profils");
  });

  it("OHNE Katalog-Faehigkeit gibt es keinen Anstoss", async () => {
    /*
     * Ein Vorschlag wartet auf Kuratierung und erzeugt keinen Marktplatz-
     * Eintrag. Die Firma zur Freigabe zu rufen waere eine Aufforderung zu einem
     * Klick, der nichts bewirkt — und der naechste wird dann ignoriert.
     */
    const { res, meldungen } = await speichereFaehigkeiten({ anzahl: 0 });
    assert.equal(res._json?.ok, true);
    assert.equal(res._json?.count, 0);
    assert.equal(meldungen.length, 0,
      "es wurde zur Freigabe gerufen, obwohl nichts freizugeben ist");
  });

  it("ein Fehlschlag der Meldung gefaehrdet das Speichern NICHT", async () => {
    /*
     * Die Faehigkeiten sind geschrieben. Eine Meldung, die daran scheitert,
     * waere der schlechteste Tausch: der Mensch verlaere seine Eingabe, damit
     * die Firma einen Hinweis bekommt.
     */
    const warnungen = [];
    const { res, pool } = await speichereFaehigkeiten({
      anzahl: 2,
      regeln: [{ match: /INSERT INTO notifications/i,
                 rows: () => { const e = new Error("Benachrichtigung kaputt"); e.code = "23514"; throw e; } }],
      logger: { info() {}, error() {}, debug() {}, warn: (a, b) => warnungen.push({ a, b }) }
    });
    assert.equal(res._json?.ok, true,
      "das Speichern ist an der Benachrichtigung gescheitert");
    assert.equal(res._status, 200);

    /*
     * M4c.14 — DIE SICHTBARKEIT IST UMGEZOGEN UND STAERKER GEWORDEN.
     *
     * Hier stand `warnungen.length >= 1`: der Fehler flog zum Aufrufer, der ihn
     * fing und eine Warnung protokollierte. Die Zusicherung war richtig und hat
     * trotzdem nichts verhindert — `worker.skills_awaiting_release` war drei
     * Wochen lang tot, und die Protokollzeile hat niemand gelesen (M4c.12).
     *
     * Seit M4c.14 faengt `dispatch` den Fehlschlag SELBST, zaehlt ihn und
     * schreibt eine Audit-Zeile. Der Aufrufer sieht deshalb keinen Fehler mehr —
     * seine Warnung entfaellt, und genau darum zeigt diese Probe jetzt auf die
     * Stelle, an der die Sichtbarkeit wirklich entsteht. Geprueft wird das
     * Audit, nicht das Protokoll: eine Zeile, die die Aufsicht ohnehin liest,
     * statt einer, die in der naechsten Rotation verschwindet.
     */
    const auditZeilen = pool.abfragen.filter((a) => /INSERT INTO audit_log/i.test(a.sql));
    assert.ok(auditZeilen.length >= 1,
      "der Fehlschlag wurde geschluckt UND verschwiegen — dann faellt nie auf, "
      + "dass die Firma seit Wochen keine Hinweise mehr bekommt");
    const params = auditZeilen[0].params || [];
    assert.ok(params.includes("notification.dispatch_failed"),
      "die Audit-Zeile nennt nicht den Fehlschlag der Meldung: " + JSON.stringify(params.slice(0, 4)));
    const details = params.find((x) => x && typeof x === "object" && "event_key" in x)
      || params.map((x) => { try { return JSON.parse(x); } catch { return null; } })
              .find((x) => x && x.event_key);
    assert.ok(details, "die Audit-Zeile traegt keine Details");
    assert.equal(details.event_key, "worker.skills_awaiting_release",
      "die Audit-Zeile nennt das falsche Ereignis");
    assert.equal(details.notification_type, "worker_marktpraesenz");
    assert.equal(details.error_code, "23514", "der Fehlercode fehlt — dann weiss niemand, WAS zu tun ist");
  });
});

/* ── 3. Die Verdrahtung bleibt bestehen ──────────────────────────────── */

describe("M4.8 · der Weg ist im Quelltext verankert", () => {
  const PORTAL = fs.readFileSync(path.join(API, "routes", "workerPortal.js"), "utf8");

  it("der Anstoss haengt am Speichern der Faehigkeiten", () => {
    const block = /router\.put\("\/worker\/me\/skills"[\s\S]*?\n  \}\);/.exec(PORTAL);
    assert.ok(block, "die Route wurde nicht gefunden");
    assert.ok(block[0].includes("worker.skills_awaiting_release"),
      "das Ereignis wird an dieser Route nicht mehr ausgeloest");
    assert.ok(block[0].includes("findOrgMembersWithPermission"),
      "die Empfaenger werden nicht mehr ueber die Berechtigung ermittelt");
    assert.ok(block[0].includes('"worker.edit"'),
      "es wird eine andere Berechtigung gefragt — dann bekommt womoeglich niemand "
      + "die Meldung, der freigeben darf");
  });

  it("der Veroeffentlichungsweg ist SYNCHRON — kein Warten auf den Takt", async () => {
    /*
     * Die Abnahme verlangt ausdruecklich "ohne auf den 15-Minuten-Takt zu
     * warten". Waere `setzeMarktpraesenz` nur eine Markierung und der Eintrag
     * entstuende erst im Sweep, waere der OK-Klick eine Absichtserklaerung.
     */
    /*
     * M4c.3b — DIESE PROBE HING AM QUELLTEXT UND HAENGT JETZT AN DER WIRKUNG.
     *
     * Hier wurde der Rumpf von `setzeMarktpraesenz` gelesen und nach
     * `INSERT INTO capacity_posts (` durchsucht. Das war richtig, solange die
     * Funktion ihre Anweisung selbst hinschrieb — und genau das war das
     * Problem: sie trug eine von Hand abgeschriebene Zweitfassung des ganzen
     * Sweeps, inklusive eigener Praesenz-Bedingungen. Seit die Anweisung aus
     * dem gemeinsamen Bauplan kommt, steht im Rumpf kein INSERT mehr — die
     * Probe waere rot geworden, obwohl der Klick MEHR tut als vorher.
     *
     * Gemessen wird deshalb, was die Funktion TUT: sie wird mit einem
     * Muster-Pool aufgerufen, und unter ihren Anweisungen muss ein Einfuegen in
     * `capacity_posts` sein. Das ueberlebt jeden Umbau, der die Wirkung
     * erhaelt, und faellt bei jedem, der sie wegnimmt.
     *
     * `\s*\(` gehoert weiterhin dazu, und zwar nach einer ueberlebenden
     * Rueckmutation: ohne die Klammer passt das Muster auch auf
     * `capacity_posts_X` — der Tabellenname liesse sich austauschen, und die
     * Probe bliebe gruen.
     */
    const anweisungen = [];
    const musterPool = {
      query: async (sql) => {
        anweisungen.push(sql);
        return /UPDATE worker_profiles/.test(sql)
          ? { rows: [{ id: "wp-1", marktpraesenz_deaktiviert: false }], rowCount: 1 }
          : { rows: [{ aufgehalten: 0 }], rowCount: 0 };
      }
    };
    await setzeMarktpraesenz(musterPool, "org-1", "wp-1", false);
    assert.ok(anweisungen.some((s) => /INSERT INTO capacity_posts\s*\(/i.test(s)),
      "der Klick legt keinen Eintrag mehr an — dann wartet der Mensch auf den Sweep");
  });
});
