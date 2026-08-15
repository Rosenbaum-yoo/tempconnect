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
import { requireRole } from "../middleware/rbac.js";

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
