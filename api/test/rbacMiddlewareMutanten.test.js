/**
 * M5 — der eine A-Fall aus `middleware/rbac.js`.
 *
 * 19 Mutanten haben in dieser Datei ueberlebt, 17 davon sind Protokolltexte und
 * Anzeigemeldungen (Kategorie B) — die Fehlercodes daneben sind laengst
 * getestet. Bleibt genau einer, der etwas verschieben kann.
 *
 * DER FALL
 * `requireRole` endet mit
 *     req.orgId = membership.org_id || orgId || null;
 * Wird das erste `||` zu `&&`, liefert der Ausdruck NULL, sobald `orgId` leer
 * ist — also auf dem Rueckfall-Pfad, auf dem die Anfrage keine Organisation
 * ausdruecklich nennt und der Kontext ueber die primaere Mitgliedschaft
 * aufgeloest wird (`X && undefined` ist undefined, danach `|| null`).
 *
 * ZUR REICHWEITE, ehrlich gesagt: Im laufenden Betrieb ist dieser Pfad die
 * AUSNAHME, nicht die Regel. `orgContextMiddleware` haengt global vor allen
 * Routern (app.js) und setzt `req.orgId` normalerweise schon vorher; dann
 * gewinnt `orgId` und der Mutant faellt nicht auf. Der Fall trifft die Luecken:
 * Sitzungen ohne aufloesbaren Kontext, Aufrufe ausserhalb der ueblichen Kette.
 * Das macht ihn nicht harmlos, aber es macht ihn selten — und selten ist genau
 * die Sorte Defekt, die im Betrieb niemandem auffaellt.
 *
 * Warum ein leeres `req.orgId` gefaehrlich ist: Die verbreitete Form
 *     if (req.orgId && ressource.org_id !== req.orgId) return 403;
 * SCHALTET SICH BEI `null` SELBST AB. Der Wachposten verschwindet also nicht mit
 * einem Fehler, sondern lautlos — hinter einer Middleware, deren Aufgabe das
 * Gegenteil ist.
 *
 * ZUR ZAHL, nachgezaehlt am 2026-08-15: `grep -rn "req.orgId &&" api/routes/`
 * liefert 45 Treffer in 13 Dateien; einer davon ist keine Grenzpruefung
 * (`profileVisibility.js:238` vergleicht mit `===` und antwortet 400). Es sind
 * also **44 Pruefstellen in 12 Route-Dateien**. Der Kommentar in
 * `middleware/orgContext.js` nennt 45 — die ungefilterte Trefferzahl; er bleibt
 * hier unangetastet, weil P12 Produktionscode nicht anfasst. Die versionierte
 * Erhebung in `docs/ORG_GRENZE_BEFUND.md` zaehlt eine andere Menge (80
 * ORG_BOUNDARY_VIOLATION-Fundstellen in 18 Dateien) und ist kein Widerspruch,
 * sondern eine andere Frage.
 *
 * Die Begruendung fuer die 17 B-Faelle und den einen C-Fall steht je Fall in
 * `docs/qualitaet/mutation/2026-08-14-rbac/triage.json`.
 * Diese Datei muss in `stryker.rbac.conf.json` unter `commandRunner` stehen.
 *
 * Run: node --test --test-force-exit test/rbacMiddlewareMutanten.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { requirePermission, requireRole } from "../middleware/rbac.js";

const USER = "user-1";
const ORG = "a0b1c2d3-e4f5-6789-abcd-ef0123456789";

const MITGLIED = { user_id: USER, org_id: ORG, role_key: "owner", org_name: "Test GmbH", is_active: true };

function pool(...antworten) {
  let i = 0;
  return { query: async () => (i < antworten.length ? antworten[i++] : { rows: [] }) };
}

const logger = { warn() {}, error() {}, info() {}, debug() {} };

function req(overrides = {}) {
  return { session: { userId: USER }, body: {}, query: {}, params: {}, ...overrides };
}

function res() {
  const r = { _status: null, _json: null };
  r.status = (c) => ((r._status = c), r);
  r.json = (d) => ((r._json = d), r);
  return r;
}

describe("M5 — nach requireRole traegt die Anfrage ihre Organisation", () => {
  it("nr 42: ohne ausdrueckliche Org gewinnt die Mitgliedschaft — nicht null", async () => {
    // Kein req.orgId, kein ?org_id, kein :org_id -> Rueckfall auf die primaere Org.
    const anfrage = req();
    const antwort = res();
    let weiter = false;

    await requireRole(["owner"], {
      pool: pool({ rows: [{ org_id: ORG }] }, { rows: [MITGLIED] }),
      logger,
    })(anfrage, antwort, () => {
      weiter = true;
    });

    assert.equal(weiter, true, "Der Eigentuemer muss durchgelassen werden");
    assert.equal(
      anfrage.orgId,
      ORG,
      "Bleibt req.orgId null, schalten sich die Grenzpruefungen der Form " +
        "'if (req.orgId && fremd) 403' selbst ab — lautlos und genau im Angriffsfall"
    );
    assert.equal(anfrage.orgMembership.org_id, ORG);
  });

  // KEINE Gegenprobe hier: dass eine nicht erlaubte Rolle mit 403/ROLE_DENIED
  // scheitert, prueft `test/rbac-middleware.test.js` bereits gruendlicher
  // (inkl. der SEC-003-Zusicherung, dass die Antwort keine internen Rollennamen
  // nennt). Eine zweite, schwaechere Fassung desselben Falls kostet in jedem
  // Mutations-Lauf Zeit und beweist nichts, was dort nicht schon steht.
});

// ─────────────────────────────────────────────────────────────────────────────
// Mutationslauf 2026-09-01 — die Verweigerung selbst wird festgehalten
//
// WARUM ES DIESEN BLOCK GIBT
// Die Owner-Vorgabe von 90 % je Bereich hat 15 Ueberlebende in dieser Datei
// stehen lassen. Der Lauf davor (2026-08-14) hat sie als "Kategorie B —
// Protokolltexte und Anzeigemeldungen" abgelegt und nicht angefasst. Diese
// Einordnung war fuer die ERFOLGSPFADE richtig und fuer die
// VERWEIGERUNGSPFADE falsch:
//
//   1. Antwort-Koerper sieht der Nutzer. Faellt `message` auf "" zurueck,
//      bekommt er eine 403 ohne jede Erklaerung — die Oberflaeche zeigt eine
//      leere Fehlerbox, der Support hoert "es geht einfach nicht" und niemand
//      erfaehrt, ob die Berechtigung, der Org-Kontext oder die fehlende
//      Mitgliedschaft der Grund war. Drei verschiedene Ursachen sehen dann
//      gleich aus. Die vorhandenen Proben in `rbac-middleware.test.js` pruefen
//      nur `assert.ok(res.body.message)` an ZWEI Stellen; die uebrigen vier
//      Meldungen (2x ORG_CONTEXT_MISMATCH, PERMISSION_DENIED im Rueckfall,
//      NO_ORG_MEMBERSHIP) waren gar nicht abgedeckt.
//
//   2. Die logger.warn-Nutzlast IST der Nachweis. CLAUDE.md verlangt "kein
//      Vorgang ohne Wer + Was + Warum". Bei einer ZUGRUECKGEWIESENEN Anfrage
//      ist dieses Protokoll die einzige Spur, die bleibt: eine 403 legt keinen
//      Datensatz an, es gibt keine Audit-Zeile, kein Ticket. Wird
//      `{ permission, userId, orgId, reason }` zu `{}`, protokolliert die
//      Plattform "irgendwer wurde irgendwo abgewiesen" — nach einem
//      Einbruchsversuch ist damit weder das Ziel noch der Angreifer
//      rekonstruierbar. Aus demselben Grund wird der Meldungstext geprueft: er
//      unterscheidet die vier Verweigerungsgruende voneinander, und genau
//      danach wird im Ernstfall gefiltert.
//
// Was hier NICHT geprueft wird: Erfolgs-Protokolle. Deren Wortlaut ist
// Rauschen — er beweist nichts und bindet nur den Text fest.
// ─────────────────────────────────────────────────────────────────────────────

const FREMD = "ffffffff-0000-4000-8000-ffffffffffff";
const BETRACHTER = { ...MITGLIED, role_key: "viewer" };

/**
 * Wie `logger`, merkt sich aber die Warnungen. Ohne Mitschrift laesst sich
 * nicht pruefen, WAS bei einer Verweigerung festgehalten wurde — und genau das
 * ist der Nachweis, um den es geht.
 */
function protokoll() {
  const warnungen = [];
  return {
    warnungen,
    warn: (nutzlast, text) => warnungen.push({ nutzlast, text }),
    error() {},
    info() {},
    debug() {},
  };
}

describe("Mutationslauf 2026-09-01 — requirePermission verweigert nachvollziehbar", () => {
  it("ein fremdes org_id in der Anfrage wird mit benanntem Grund abgewiesen", async () => {
    // Der Nutzer handelt in ORG, adressiert aber FREMD. Ohne Meldungstext
    // sieht diese Abweisung fuer ihn genauso aus wie eine fehlende
    // Berechtigung — er sucht den Fehler bei seiner Rolle statt beim
    // Standort-/Org-Wechsler, der ihn hierher gebracht hat.
    const anfrage = req({ orgId: ORG, query: { org_id: FREMD } });
    const antwort = res();
    const log = protokoll();

    await requirePermission("requisition.create", { pool: pool(), logger: log })(
      anfrage,
      antwort,
      () => assert.fail("next() darf bei Kontext-Konflikt nicht laufen")
    );

    assert.equal(antwort._status, 403);
    assert.deepEqual(antwort._json, {
      error: "ORG_CONTEXT_MISMATCH",
      message: "Organisations-Kontext passt nicht zur Anfrage.",
    });
  });

  it("bei fehlender Berechtigung in genannter Org steht Wer, Was, Wo und Warum im Protokoll", async () => {
    // Ein Betrachter versucht eine Anforderung anzulegen. Bleibt von der
    // Nutzlast nur {} uebrig, weiss nach einem Vorfall niemand mehr, welcher
    // Nutzer welche Berechtigung in welcher Org versucht hat.
    const anfrage = req({ query: { org_id: ORG } });
    const antwort = res();
    const log = protokoll();

    await requirePermission("requisition.create", {
      pool: pool({ rows: [BETRACHTER] }),
      logger: log,
    })(anfrage, antwort, () => assert.fail("next() darf ohne Berechtigung nicht laufen"));

    assert.equal(antwort._status, 403);
    assert.equal(antwort._json.error, "PERMISSION_DENIED");
    assert.equal(log.warnungen.length, 1, "Eine Verweigerung, ein Protokolleintrag");
    assert.deepEqual(log.warnungen[0].nutzlast, {
      permission: "requisition.create",
      userId: USER,
      orgId: ORG,
      reason: "PERMISSION_DENIED",
    });
    assert.equal(log.warnungen[0].text, "RBAC permission denied");
  });

  it("die Verweigerung ueber die primaere Org ist im Protokoll von der ueber die genannte Org unterscheidbar", async () => {
    // Kein org_id in Anfrage oder Kontext -> Rueckfall auf die primaere Org.
    // Dieser Zweig protokolliert `role` statt `reason` und traegt einen
    // eigenen Text. Verschwimmen beide, laesst sich hinterher nicht mehr
    // sagen, gegen WELCHE Org geprueft wurde — die genannte oder die
    // geratene.
    const anfrage = req();
    const antwort = res();
    const log = protokoll();

    await requirePermission("requisition.create", {
      pool: pool({ rows: [{ org_id: ORG }] }, { rows: [BETRACHTER] }),
      logger: log,
    })(anfrage, antwort, () => assert.fail("next() darf ohne Berechtigung nicht laufen"));

    assert.equal(antwort._status, 403);
    assert.deepEqual(antwort._json, {
      error: "PERMISSION_DENIED",
      message: "Keine Berechtigung fuer diese Aktion.",
    });
    assert.deepEqual(log.warnungen[0].nutzlast, {
      permission: "requisition.create",
      userId: USER,
      orgId: ORG,
      role: "viewer",
    });
    assert.equal(log.warnungen[0].text, "RBAC permission denied (primary org)");
  });

  it("ohne jede Mitgliedschaft nennt die Antwort den Grund und das Protokoll den Nutzer", async () => {
    // Weder users.org_id noch eine aktive Mitgliedschaft. Der Nutzer muss
    // erfahren, dass ihm die ORGANISATION fehlt und nicht die Rolle —
    // sonst bittet er seinen Administrator um Rechte, die ihm ohne
    // Mitgliedschaft niemand geben kann.
    const anfrage = req();
    const antwort = res();
    const log = protokoll();

    await requirePermission("requisition.create", { pool: pool(), logger: log })(
      anfrage,
      antwort,
      () => assert.fail("next() darf ohne Mitgliedschaft nicht laufen")
    );

    assert.equal(antwort._status, 403);
    assert.deepEqual(antwort._json, {
      error: "NO_ORG_MEMBERSHIP",
      message: "Organisations-Mitgliedschaft erforderlich.",
    });
    assert.deepEqual(log.warnungen[0].nutzlast, {
      permission: "requisition.create",
      userId: USER,
    });
    assert.equal(log.warnungen[0].text, "RBAC denied: no org membership");
  });
});

describe("Mutationslauf 2026-09-01 — requireRole verweigert nachvollziehbar", () => {
  it("ein fremdes org_id in der Anfrage wird mit benanntem Grund abgewiesen", async () => {
    // Gleicher Wachposten wie in requirePermission, eigene Kopie im Code —
    // deshalb eine eigene Probe. Faellt nur eine der beiden Meldungen weg,
    // merkt es sonst niemand.
    const anfrage = req({ orgId: ORG, query: { org_id: FREMD } });
    const antwort = res();
    const log = protokoll();

    await requireRole(["owner"], { pool: pool(), logger: log })(anfrage, antwort, () =>
      assert.fail("next() darf bei Kontext-Konflikt nicht laufen")
    );

    assert.equal(antwort._status, 403);
    assert.deepEqual(antwort._json, {
      error: "ORG_CONTEXT_MISMATCH",
      message: "Organisations-Kontext passt nicht zur Anfrage.",
    });
  });

  it("ohne Mitgliedschaft und ohne genannte Org steht die Organisation als null im Protokoll", async () => {
    // `orgId || null`: Auf dem Rueckfall-Pfad ist keine Org bekannt. Der
    // Eintrag muss das ausdruecklich als null festhalten — ein fehlender
    // oder auf `true`/`false` verkuerzter Wert liest sich hinterher wie eine
    // Angabe und schickt die Auswertung in die falsche Organisation.
    const anfrage = req();
    const antwort = res();
    const log = protokoll();

    await requireRole(["owner"], { pool: pool(), logger: log })(anfrage, antwort, () =>
      assert.fail("next() darf ohne Mitgliedschaft nicht laufen")
    );

    assert.equal(antwort._status, 403);
    assert.deepEqual(antwort._json, {
      error: "NO_ORG_MEMBERSHIP",
      message: "Organisations-Mitgliedschaft erforderlich.",
    });
    assert.deepEqual(log.warnungen[0].nutzlast, {
      allowedRoles: ["owner"],
      userId: USER,
      orgId: null,
    });
    assert.equal(log.warnungen[0].text, "RBAC denied: no org membership");
  });

  it("ohne Mitgliedschaft in einer GENANNTEN Org steht genau diese Org im Protokoll", async () => {
    // Der Gegenfall zur Probe darueber: Hier ist die Org bekannt, und sie
    // ist der wertvollste Teil des Eintrags — ein Zugriffsversuch auf eine
    // fremde Organisation ist ohne die Ziel-Org nicht erkennbar.
    const anfrage = req({ query: { org_id: ORG } });
    const antwort = res();
    const log = protokoll();

    await requireRole(["owner"], { pool: pool({ rows: [] }), logger: log })(
      anfrage,
      antwort,
      () => assert.fail("next() darf ohne Mitgliedschaft nicht laufen")
    );

    assert.equal(antwort._status, 403);
    assert.deepEqual(log.warnungen[0].nutzlast, {
      allowedRoles: ["owner"],
      userId: USER,
      orgId: ORG,
    });
  });

  it("bei falscher Rolle nennt das Protokoll die verlangten Rollen und die tatsaechliche", async () => {
    // Die Antwort an den Nutzer bleibt bewusst ohne Rollennamen (SEC-003).
    // Damit ist das Protokoll die EINZIGE Stelle, an der steht, was verlangt
    // war und was der Nutzer hatte. Ohne diese Nutzlast ist eine falsch
    // vergebene Rolle nicht mehr von einem Angriff zu unterscheiden.
    const anfrage = req({ query: { org_id: ORG } });
    const antwort = res();
    const log = protokoll();

    await requireRole(["owner", "admin"], {
      pool: pool({ rows: [BETRACHTER] }),
      logger: log,
    })(anfrage, antwort, () => assert.fail("next() darf bei falscher Rolle nicht laufen"));

    assert.equal(antwort._status, 403);
    assert.equal(antwort._json.error, "ROLE_DENIED");
    assert.deepEqual(log.warnungen[0].nutzlast, {
      allowedRoles: ["owner", "admin"],
      userId: USER,
      orgId: ORG,
      role: "viewer",
    });
    assert.equal(log.warnungen[0].text, "RBAC role denied");
  });
});
