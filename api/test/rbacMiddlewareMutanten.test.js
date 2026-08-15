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
 * Wird das erste `||` zu `&&`, liefert der Ausdruck im haeufigsten Fall NULL:
 * naemlich immer dann, wenn die Anfrage keine Organisation ausdruecklich nennt
 * und der Kontext ueber die primaere Mitgliedschaft aufgeloest wurde
 * (`orgId` ist dann undefined, und `X && undefined` ist undefined -> null).
 *
 * Warum das gefaehrlich ist, steht in `docs/ORG_GRENZE_BEFUND.md`: 45 Routen
 * pruefen die Mandantengrenze als
 *     if (req.orgId && ressource.org_id !== req.orgId) return 403;
 * — eine Pruefung, die sich bei `null` SELBST ABSCHALTET. Der Wachposten
 * verschwindet also nicht mit einem Fehler, sondern lautlos, und ausgerechnet
 * hinter einer Middleware, deren Aufgabe das Gegenteil ist.
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
      "Bleibt req.orgId null, schalten sich 45 Grenzpruefungen der Form " +
        "'if (req.orgId && fremd) 403' selbst ab — lautlos und genau im Angriffsfall"
    );
    assert.equal(anfrage.orgMembership.org_id, ORG);
  });

  it("die Gegenprobe: eine fremde Rolle kommt nicht durch", async () => {
    const anfrage = req();
    const antwort = res();
    let weiter = false;

    await requireRole(["admin"], {
      pool: pool({ rows: [{ org_id: ORG }] }, { rows: [{ ...MITGLIED, role_key: "member" }] }),
      logger,
    })(anfrage, antwort, () => {
      weiter = true;
    });

    assert.equal(weiter, false);
    assert.equal(antwort._status, 403);
    assert.equal(antwort._json.error, "ROLE_DENIED");
  });
});
