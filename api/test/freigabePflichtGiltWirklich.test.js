import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertTransition,
  REQUISITION_TRANSITIONS,
  RequisitionTransitionError,
} from "../services/requisitionService.js";

/*
 * "FREIGABE ERFORDERLICH" WAR EIN ETIKETT, KEINE REGEL.
 *
 * BEFUND (2026-08-24, gezaehlt und gemessen):
 *   `org_settings.approval_required` ist in DREI Masken einstellbar
 *   (orgControlCenter.js:71, settings.js:12, requisitions.js:39) und wird als
 *   `approval_workflow: true` zurueckgemeldet (orgControlCenter.js:497).
 *   GELESEN hat sie niemand: `settingsService.requiresApproval()` stand seit
 *   jeher ohne Aufrufer da, und `requisitions.approval_required` wurde
 *   geschrieben, aber nie geprueft.
 *
 *   Und die Tabelle liess `DRAFT -> OPEN` immer zu. Die Freigabe war damit
 *   vollstaendig freiwillig — wer sie umgehen wollte, musste nichts umgehen.
 *
 * Eine Einstellung, die sich als aktiv meldet und nichts bewirkt, ist
 * schlimmer als gar keine: der Kunde glaubt, seine Anforderungen brauchen eine
 * Freigabe. Fuer einen Enterprise-Einkauf ist das ein Versprechen.
 *
 * WIRKUNG HEUTE: keine. Gemessen — 0 von 18 Organisationen haben die
 * Einstellung an, 0 von 73 Anforderungen tragen die Fahne. Es wird niemandem
 * etwas verboten; es kann kuenftig nur niemand mehr daran vorbei.
 */

describe("Freigabepflicht — die Abkuerzung ist zu", () => {
  it("ohne Pflicht bleibt DRAFT -> OPEN erlaubt", () => {
    /* Der Normalfall darf nicht schwerer werden: wer keine Freigabe braucht,
     * soll nicht durch sie hindurch. */
    assert.doesNotThrow(() => assertTransition("DRAFT", "OPEN"));
    assert.doesNotThrow(() => assertTransition("DRAFT", "OPEN", { approvalRequired: false }));
  });

  it("mit Pflicht ist genau dieser eine Uebergang gesperrt", () => {
    assert.throws(
      () => assertTransition("DRAFT", "OPEN", { approvalRequired: true }),
      (e) => e instanceof RequisitionTransitionError && e.code === "APPROVAL_REQUIRED");
  });

  it("und der Weg DURCH die Freigabe bleibt offen — keine Sackgasse", () => {
    /* Das ist die eigentliche Zusicherung. Eine Sperre, die keinen Ausweg
     * laesst, waere schlimmer als das Schlupfloch: die Anforderung haenge fuer
     * immer im Entwurf. */
    for (const [von, nach] of [["DRAFT", "PENDING_APPROVAL"],
                               ["PENDING_APPROVAL", "APPROVED"],
                               ["APPROVED", "OPEN"]]) {
      assert.doesNotThrow(() => assertTransition(von, nach, { approvalRequired: true }),
        `${von} -> ${nach} muss auch mit Freigabepflicht gehen`);
    }
  });

  it("abbrechen geht immer — auch mit Freigabepflicht", () => {
    assert.doesNotThrow(() => assertTransition("DRAFT", "CANCELLED", { approvalRequired: true }));
  });

  it("die Sperre erfindet keinen neuen Uebergang", () => {
    /* Sie darf NUR verbieten, nie erlauben: ein Uebergang, den die Tabelle
     * nicht kennt, bleibt verboten. */
    assert.throws(() => assertTransition("CLOSED", "OPEN", { approvalRequired: true }),
      RequisitionTransitionError);
    assert.throws(() => assertTransition("DRAFT", "FILLED", { approvalRequired: true }),
      RequisitionTransitionError);
  });

  it("S: die Probe wuerde die alte, immer-offene Fassung bemerken", () => {
    /* Rueckmutation: die alte `assertTransition` kannte den zweiten Parameter
     * gar nicht und haette `DRAFT -> OPEN` auch mit Pflicht durchgelassen. */
    assert.ok(REQUISITION_TRANSITIONS.DRAFT.includes("OPEN"),
      "der Uebergang steht weiterhin in der Tabelle — die Sperre haengt an der " +
      "Fahne, nicht daran, dass man ihn aus der Tabelle nimmt. Naehme man ihn " +
      "heraus, koennte AUCH der Normalfall nicht mehr oeffnen.");
  });
});

describe("Freigabepflicht — die Org-Einstellung wird zum Vorgabewert", () => {
  it("createRequisition liest die Einstellung, wenn der Aufrufer schweigt", async () => {
    const fs = await import("node:fs");
    const quelle = fs.readFileSync(
      new URL("../services/requisitionService.js", import.meta.url), "utf8");
    assert.match(quelle, /settingsService\.requiresApproval\(pool, data\.org_id\)/,
      "`requiresApproval()` hatte keinen Aufrufer — jetzt hat sie einen");
    assert.match(quelle, /data\.approval_required\s*\n?\s*\?\?/,
      "`??` und nicht `||`: ein ausdrueckliches `false` des Aufrufers muss gelten, " +
      "sonst waere die Org-Einstellung eine Zwangsjacke statt eines Vorgabewerts");
  });

  it("die Fahne der ANFORDERUNG entscheidet beim Uebergang, nicht die der Sitzung", async () => {
    const fs = await import("node:fs");
    const quelle = fs.readFileSync(
      new URL("../services/requisitionService.js", import.meta.url), "utf8");
    assert.match(quelle, /assertTransition\(req\.status, newStatus, \{ approvalRequired: req\.approval_required === true \}\)/,
      "Ohne die Fahne am Aufrufer waere die Sperre tot — ihr Vorgabewert ist false. " +
      "Und sie muss aus der ANFORDERUNG kommen: die Org-Einstellung kann sich " +
      "aendern, nachdem die Anforderung angelegt wurde.");
  });
});
