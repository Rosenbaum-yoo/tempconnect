/**
 * Buendel "zustand" — die Zustandsmaschine der Abo-Aenderungswuensche.
 *
 * WARUM ES DIESE DATEI GIBT
 * Der Mutationslauf vom 2026-09-01 hat `services/subscriptionRequestService.js`
 * bei 43,51 % Punktzahl gemessen; 548 von 970 Mutanten haben ueberlebt. Die
 * Owner-Vorgabe lautet 90 % je Bereich. Diese Datei nimmt sich die 40
 * ueberlebenden Mutanten des Buendels "zustand" vor:
 *   transitionStatus, isValidTransition, listAllowedNextStatuses,
 *   isTerminalStatus, isOpenStatus, STATUS, canBypassStaffApproval.
 *
 * WAS HIER AUF DEM SPIEL STEHT
 * Diese sieben Stellen entscheiden, WELCHER Wunsch WANN weiterlaufen darf — und
 * damit ueber den Tarif eines Kunden und ueber Geld. Ein stiller Logik-Flip
 * heisst hier konkret:
 *   1. Ein abgelehnter oder gekuendigter Wunsch laesst sich erneut genehmigen
 *      und aktivieren — der Kunde bekommt einen Tarif, den niemand freigegeben
 *      hat (isValidTransition, listAllowedNextStatuses).
 *   2. Ein Wunsch geht ohne Team-Freigabe durch, obwohl ein Individuell-Tarif
 *      im Spiel ist — der Preis wird nie verhandelt (canBypassStaffApproval).
 *   3. Der Sprung nach "offered" friert das Angebot NICHT ein und legt kein
 *      Dokument bei — spaetere Katalogaenderungen veraendern rueckwirkend ein
 *      bereits abgegebenes Angebot (transitionStatus, OFFERED-Zweig).
 *   4. Eine vertauschte oder leere Bindung in den beiden Abfragen von
 *      transitionStatus trifft die falsche Zeile oder gar keine — ein
 *      Statuswechsel ohne Nachweis, wer ihn ausgeloest hat.
 *
 * WAS HIER BEWUSST NICHT GEPRUEFT WIRD
 *   - Zeile 86/94: `String(status || "")` → StringLiteral "Stryker was here!".
 *     Weder das leere noch das Stryker-Wort steht in TERMINAL/OPEN; beide
 *     liefern false. Gleichwertiger Mutant, nicht toetbar.
 *   - Zeile 104: LogicalOperator (`!from && !to`) und ConditionalExpression
 *     (Bedingung → false). Der nachfolgende Schutz `Array.isArray(allowed)`
 *     faengt jeden leeren Ausgangsstatus ohnehin ab, und kein leerer Zielstatus
 *     steht in einer Uebergangsliste. Beide Mutanten sind gleichwertig. Der
 *     dritte Mutant derselben Zeile (Rueckgabe true) ist es NICHT — er wird
 *     unten getoetet.
 *   - Zeile 351/357: StringLiteral "" auf den Rueckfall-Codes
 *     ("QUOTE_SNAPSHOT_FAILED" / "DOCUMENT_GENERATION_FAILED"). Beide
 *     Vorgelagerten liefern im Fehlerfall IMMER ein gefuelltes `error`-Feld;
 *     der Rueckfall ist ueber den echten Code nicht erreichbar. Ohne
 *     Modul-Attrappe nicht toetbar — und eine Attrappe waere hier eine
 *     Zweitwahrheit, die das Projekt nicht will.
 *   - Protokolltexte auf Erfolgspfaden werden nicht festgenagelt; die
 *     Protokoll-Nutzlast bei Zustandswechseln dagegen schon (Wer + Was +
 *     Warum).
 *
 * DB-frei (Muster-Pool, gebaut wie in test/subscriptionRequestService.test.js).
 * Run: node --test --test-force-exit test/subscriptionMutanten.zustand.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { PLAN } from "../config/planFeatures.js";
import {
  REQUEST_TYPES,
  STATUS,
  isValidTransition,
  isTerminalStatus,
  isOpenStatus,
  listAllowedNextStatuses,
  canBypassStaffApproval,
  transitionStatus
} from "../services/subscriptionRequestService.js";

/* ── Muster-Pool: gleiche Bauart wie subscriptionRequestService.test.js ── */

function sequencePool(...responses) {
  let idx = 0;
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (idx >= responses.length) {
        throw new Error(`Unerwartete Abfrage #${idx + 1}: ${String(sql).slice(0, 80)}`);
      }
      const resp = responses[idx++];
      if (resp instanceof Error) throw resp;
      return resp;
    }
  };
}

/** Ein bereits eingefrorenes Angebot — freezeQuoteSnapshot steigt hier nach
 *  genau EINER Abfrage aus (idempotenter Zweig). */
const GEFRORENE_ZEILE = {
  id: "r1",
  quote_frozen_at: "2026-08-01T10:00:00.000Z",
  quote_snapshot: { catalog_version: "2026-01", plan: "PRO" }
};

/** Ein bereits ausgestelltes Angebotsdokument — ensureDocumentForRequest
 *  liefert es zurueck, statt ein neues zu erzeugen. */
const VORHANDENES_DOKUMENT = {
  id: "doc-1",
  document_type: "offer",
  document_number: "ANG-2026-0001",
  status: "issued",
  title: "Angebot ANG-2026-0001",
  format: "html",
  issued_at: "2026-08-01T10:05:00.000Z",
  download_count: 0,
  subscription_request_id: "r1"
};

/* ── Das Vokabular der Maschine ───────────────────────────────── */

describe("Statuswerte und ihre Einteilung", () => {
  // Gestaltprobe: sagt zusaetzlich, was NICHT dazugehoert. Ein stillschweigend
  // ergaenzter Status waere ein Zustand, den keine Uebergangsregel kennt.
  it("es gibt genau diese zehn Statuswerte", () => {
    assert.deepEqual({ ...STATUS }, {
      DRAFT: "draft",
      SUBMITTED: "submitted",
      UNDER_REVIEW: "under_review",
      NEEDS_CLARIFICATION: "needs_clarification",
      OFFERED: "offered",
      ACCEPTED: "accepted",
      ACTIVE: "active",
      REJECTED: "rejected",
      CANCELLED: "cancelled",
      EXPIRED: "expired"
    });
  });

  it("jeder Status ist entweder abgeschlossen oder offen — nie beides, nie keines", () => {
    for (const s of Object.values(STATUS)) {
      const abgeschlossen = isTerminalStatus(s);
      const offen = isOpenStatus(s);
      assert.notEqual(abgeschlossen, offen, `${s} muss genau einer Menge angehoeren`);
    }
  });

  it("abgeschlossen sind genau: rejected, cancelled, expired, active", () => {
    const abgeschlossen = Object.values(STATUS).filter(isTerminalStatus).sort();
    assert.deepEqual(abgeschlossen, ["active", "cancelled", "expired", "rejected"]);
  });

  it("offen sind genau die sechs Stufen bis zur Annahme", () => {
    const offen = Object.values(STATUS).filter(isOpenStatus).sort();
    assert.deepEqual(offen, [
      "accepted", "draft", "needs_clarification", "offered", "submitted", "under_review"
    ]);
  });

  it("ein unbekannter oder fehlender Status gilt weder als abgeschlossen noch als offen", () => {
    // Schaden sonst: ein Tippfehler im Status wuerde als "offen" durchgehen und
    // eine Sperre gegen Doppelanfragen aushebeln.
    for (const s of [null, undefined, "", 0, "xyz", "ACTIVE", "Stryker was here!"]) {
      assert.equal(isTerminalStatus(s), false, `isTerminalStatus(${JSON.stringify(s)})`);
      assert.equal(isOpenStatus(s), false, `isOpenStatus(${JSON.stringify(s)})`);
    }
  });
});

/* ── isValidTransition ────────────────────────────────────────── */

describe("Gueltigkeit eines Statusuebergangs", () => {
  // Toetet Zeile 104 BooleanLiteral (return true): ein fehlender Ausgangs- oder
  // Zielstatus wuerde sonst JEDEN Uebergang erlauben — der Aufrufer koennte mit
  // einem leeren Feld an der gesamten Maschine vorbei.
  it("ein fehlender Ausgangs- oder Zielstatus ist nie ein gueltiger Uebergang", () => {
    const faelle = [
      [null, "submitted"], [undefined, "submitted"], ["", "submitted"],
      ["draft", null], ["draft", undefined], ["draft", ""],
      [null, null], [undefined, undefined], ["", ""], [0, 0]
    ];
    for (const [from, to] of faelle) {
      assert.equal(
        isValidTransition(from, to),
        false,
        `isValidTransition(${JSON.stringify(from)}, ${JSON.stringify(to)})`
      );
    }
  });

  it("ein abgelehnter Wunsch laesst sich nicht mehr genehmigen", () => {
    for (const to of Object.values(STATUS)) {
      assert.equal(isValidTransition("rejected", to), false, `rejected -> ${to}`);
    }
  });

  it("ein zurueckgezogener oder abgelaufener Wunsch lebt nicht wieder auf", () => {
    for (const from of ["cancelled", "expired"]) {
      for (const to of Object.values(STATUS)) {
        assert.equal(isValidTransition(from, to), false, `${from} -> ${to}`);
      }
    }
  });

  it("ein aktiver Wunsch kann nur noch auslaufen — nicht nachtraeglich abgelehnt werden", () => {
    assert.equal(isValidTransition("active", "expired"), true);
    for (const to of ["rejected", "cancelled", "accepted", "offered", "submitted", "draft", "under_review", "needs_clarification"]) {
      assert.equal(isValidTransition("active", to), false, `active -> ${to}`);
    }
  });

  it("ein unbekannter Ausgangsstatus erlaubt gar nichts", () => {
    for (const to of Object.values(STATUS)) {
      assert.equal(isValidTransition("xyz", to), false, `xyz -> ${to}`);
      assert.equal(isValidTransition("toString", to), false, `toString -> ${to}`);
      assert.equal(isValidTransition("constructor", to), false, `constructor -> ${to}`);
    }
  });

  it("eine Kuendigung kennt kein Gegenangebot", () => {
    // Bei einer Kuendigung gibt es keinen Preis, ueber den man verhandeln
    // koennte. Ein Sprung nach 'offered' wuerde dem Kunden ein Angebot
    // unterschieben, das er nie angefragt hat.
    for (const from of ["submitted", "under_review", "needs_clarification"]) {
      assert.equal(isValidTransition(from, "offered", REQUEST_TYPES.CANCELLATION), false, `${from} -> offered (Kuendigung)`);
      assert.equal(isValidTransition(from, "offered", REQUEST_TYPES.UPGRADE), true, `${from} -> offered (Upgrade)`);
    }
  });
});

/* ── listAllowedNextStatuses ──────────────────────────────────── */

describe("Liste der noch moeglichen Folgestatus", () => {
  // Toetet Zeile 119 ArrayDeclaration: ein erfundener Eintrag in der
  // Rueckfall-Liste wuerde in der Oberflaeche als anklickbarer Folgestatus
  // erscheinen und einen Uebergang anbieten, den die Maschine nie erlaubt.
  it("ein unbekannter Ausgangsstatus bietet keinen einzigen Folgestatus an", () => {
    assert.deepEqual(listAllowedNextStatuses("unbekannt"), []);
    assert.deepEqual(listAllowedNextStatuses(undefined), []);
    assert.deepEqual(listAllowedNextStatuses(null), []);
    assert.deepEqual(listAllowedNextStatuses(""), []);
    assert.deepEqual(listAllowedNextStatuses("unbekannt", REQUEST_TYPES.CANCELLATION), []);
  });

  it("abgeschlossene Wuensche bieten keinen Folgestatus an — ausser dem Auslaufen aus 'active'", () => {
    assert.deepEqual(listAllowedNextStatuses("rejected"), []);
    assert.deepEqual(listAllowedNextStatuses("cancelled"), []);
    assert.deepEqual(listAllowedNextStatuses("expired"), []);
    assert.deepEqual(listAllowedNextStatuses("active"), ["expired"]);
  });

  it("die Liste je Ausgangsstatus steht woertlich fest", () => {
    assert.deepEqual(listAllowedNextStatuses("draft"), ["submitted", "cancelled"]);
    assert.deepEqual(listAllowedNextStatuses("submitted"),
      ["under_review", "needs_clarification", "offered", "accepted", "rejected", "cancelled"]);
    assert.deepEqual(listAllowedNextStatuses("under_review"),
      ["needs_clarification", "offered", "accepted", "rejected", "cancelled"]);
    assert.deepEqual(listAllowedNextStatuses("needs_clarification"),
      ["submitted", "under_review", "offered", "rejected", "cancelled"]);
    assert.deepEqual(listAllowedNextStatuses("offered"),
      ["accepted", "needs_clarification", "rejected", "cancelled", "expired"]);
    assert.deepEqual(listAllowedNextStatuses("accepted"), ["active", "expired"]);
  });

  // Toetet Zeile 121 ArrowFunction (() => undefined) und ConditionalExpression
  // (Filter → false): beide leeren die Liste vollstaendig. Schaden: eine
  // Kuendigung koennte danach GAR NICHT mehr bearbeitet werden — der Kunde
  // haengt in einem Wunsch fest, den niemand abschliessen kann.
  it("bei einer Kuendigung faellt genau 'offered' weg — der Rest bleibt vollstaendig", () => {
    assert.deepEqual(
      listAllowedNextStatuses("submitted", REQUEST_TYPES.CANCELLATION),
      ["under_review", "needs_clarification", "accepted", "rejected", "cancelled"]
    );
    assert.deepEqual(
      listAllowedNextStatuses("under_review", REQUEST_TYPES.CANCELLATION),
      ["needs_clarification", "accepted", "rejected", "cancelled"]
    );
    assert.deepEqual(
      listAllowedNextStatuses("needs_clarification", REQUEST_TYPES.CANCELLATION),
      ["submitted", "under_review", "rejected", "cancelled"]
    );
    // 'draft' und 'accepted' enthalten kein 'offered' — die Kuendigung aendert nichts.
    assert.deepEqual(listAllowedNextStatuses("draft", REQUEST_TYPES.CANCELLATION), ["submitted", "cancelled"]);
    assert.deepEqual(listAllowedNextStatuses("accepted", REQUEST_TYPES.CANCELLATION), ["active", "expired"]);
  });

  it("jeder angebotene Folgestatus ist auch ein gueltiger Uebergang — und umgekehrt", () => {
    const alle = Object.values(STATUS);
    for (const art of [undefined, REQUEST_TYPES.UPGRADE, REQUEST_TYPES.DOWNGRADE, REQUEST_TYPES.CANCELLATION]) {
      for (const from of alle) {
        const angeboten = listAllowedNextStatuses(from, art);
        for (const to of alle) {
          assert.equal(
            angeboten.includes(to),
            isValidTransition(from, to, art),
            `${from} -> ${to} (${String(art)}): Liste und Pruefung widersprechen sich`
          );
        }
      }
    }
  });

  it("die zurueckgegebene Liste ist eine Kopie — ein Aufrufer kann die Maschine nicht umschreiben", () => {
    const erste = listAllowedNextStatuses("draft");
    erste.push("active");
    assert.deepEqual(listAllowedNextStatuses("draft"), ["submitted", "cancelled"]);
  });
});

/* ── canBypassStaffApproval ───────────────────────────────────── */

describe("Wann ein Wunsch ohne Team-Freigabe durchgeht", () => {
  // Toetet Zeile 134 (ConditionalExpression → false stuerzt ab, BooleanLiteral
  // → true gibt frei). Schaden: ein leerer Datensatz waere self-service.
  it("ohne Datensatz gibt es keine Freigabe am Team vorbei", () => {
    assert.equal(canBypassStaffApproval(null), false);
    assert.equal(canBypassStaffApproval(undefined), false);
    assert.equal(canBypassStaffApproval(0), false);
    assert.equal(canBypassStaffApproval(""), false);
  });

  it("Neuanfrage und Pilot brauchen immer das Team", () => {
    assert.equal(canBypassStaffApproval({ request_type: REQUEST_TYPES.NEW_INDIVIDUAL, current_plan: PLAN.BASIS, desired_plan: PLAN.PLUS }), false);
    assert.equal(canBypassStaffApproval({ request_type: REQUEST_TYPES.PILOT, current_plan: PLAN.BASIS, desired_plan: PLAN.PLUS }), false);
  });

  // Toetet Zeile 138 ConditionalExpression → false und BlockStatement → {}:
  // ohne den Kuendigungszweig faellt der Datensatz in die Upgrade-Regel, und
  // eine Kuendigung OHNE bekannten Tarif gilt ploetzlich als self-service.
  // Schaden: ein Vertrag wird ohne Team beendet, obwohl niemand weiss, welcher.
  it("eine Kuendigung ohne bekannten Tarif geht nie ohne Team durch", () => {
    assert.equal(Boolean(canBypassStaffApproval({ request_type: REQUEST_TYPES.CANCELLATION })), false);
    assert.equal(Boolean(canBypassStaffApproval({ request_type: REQUEST_TYPES.CANCELLATION, current_plan: null })), false);
    assert.equal(Boolean(canBypassStaffApproval({ request_type: REQUEST_TYPES.CANCELLATION, current_plan: "" })), false);
  });

  it("bei einer Kuendigung zaehlt nur der laufende Tarif — ein Wunschtarif ist bedeutungslos", () => {
    // Der Kuendigungszweig steigt frueh aus. Waere er ausgehebelt, wuerde ein
    // (bei Kuendigung sinnloses) desired_plan=INDIVIDUELL die Freigabe kippen.
    assert.equal(canBypassStaffApproval({
      request_type: REQUEST_TYPES.CANCELLATION,
      current_plan: PLAN.BASIS,
      desired_plan: PLAN.INDIVIDUELL
    }), true);
    assert.equal(canBypassStaffApproval({
      request_type: REQUEST_TYPES.CANCELLATION,
      current_plan: PLAN.INDIVIDUELL,
      desired_plan: PLAN.BASIS
    }), false);
  });

  it("ein Individuell-Tarif auf einer der beiden Seiten zwingt zum Team", () => {
    for (const art of [REQUEST_TYPES.UPGRADE, REQUEST_TYPES.DOWNGRADE]) {
      assert.equal(canBypassStaffApproval({ request_type: art, current_plan: PLAN.INDIVIDUELL, desired_plan: PLAN.PRO }), false, `${art} von INDIVIDUELL`);
      assert.equal(canBypassStaffApproval({ request_type: art, current_plan: PLAN.PRO, desired_plan: PLAN.INDIVIDUELL }), false, `${art} nach INDIVIDUELL`);
      assert.equal(canBypassStaffApproval({ request_type: art, current_plan: PLAN.BASIS, desired_plan: PLAN.PLUS }), true, `${art} zwischen Standardtarifen`);
    }
  });
});

/* ── transitionStatus: Bindungen und Abfrageform ──────────────── */

describe("Statuswechsel — Abfragen, Bindungen, Nachweis", () => {
  // Toetet Zeile 308 und 335 ArrayDeclaration → []. Eine leere oder vertauschte
  // Bindung trifft die falsche Zeile: fremder Mandant, fremder Wunsch. Das ist
  // kein Formfehler, sondern ein Datenleck.
  it("beide Abfragen binden genau die Werte des Aufrufs", async () => {
    const pool = sequencePool(
      { rows: [{ id: "r1", status: "submitted", request_type: "upgrade" }] },
      { rows: [{ id: "r1", status: "under_review" }] },
      { rows: [] }
    );
    const r = await transitionStatus(pool, {
      requestId: "r1",
      toStatus: "under_review",
      actorUserId: "staff-1",
      reason: "Pruefung gestartet",
      details: { ticket: "T-1" }
    });
    assert.equal(r.ok, true);
    assert.equal(pool.calls.length, 3);

    assert.deepEqual(pool.calls[0].params, ["r1"]);
    assert.deepEqual(pool.calls[1].params, ["r1", "under_review", "staff-1"]);
  });

  // Form woertlich festhalten: der Muster-Pool fuehrt nichts aus, also ist die
  // Abfrageform selbst die Zusage. Ein SELECT * waere hier ein unnoetiger
  // Vollzugriff auf Vertrags- und Kontaktdaten.
  it("die Abfrageform steht fest — gezieltes Lesen, gezieltes Schreiben mit Rueckgabe", async () => {
    const pool = sequencePool(
      { rows: [{ id: "r1", status: "submitted", request_type: "upgrade" }] },
      { rows: [{ id: "r1", status: "under_review" }] },
      { rows: [] }
    );
    await transitionStatus(pool, { requestId: "r1", toStatus: "under_review", actorUserId: "staff-1" });

    assert.match(pool.calls[0].sql, /SELECT\s+id,\s*status,\s*request_type\s+FROM subscription_requests\s+WHERE id = \$1/);
    assert.doesNotMatch(pool.calls[0].sql, /SELECT \*/);

    const upd = pool.calls[1].sql;
    assert.match(upd, /UPDATE subscription_requests/);
    assert.match(upd, /SET status = \$2/);
    assert.match(upd, /status_updated_at = NOW\(\)/);
    assert.match(upd, /status_updated_by = \$3/);
    assert.match(upd, /updated_at = NOW\(\)/);
    assert.match(upd, /WHERE id = \$1/);
    assert.match(upd, /RETURNING \*/);
  });

  it("der Verlaufseintrag haelt Wer, Was und Warum fest", async () => {
    // Ohne diesen Eintrag ist ein Statuswechsel nicht mehr nachweisbar —
    // genau das verlangt das Projekt bei jeder mutierenden Aktion.
    const pool = sequencePool(
      { rows: [{ id: "r1", status: "submitted", request_type: "upgrade" }] },
      { rows: [{ id: "r1", status: "under_review" }] },
      { rows: [] }
    );
    await transitionStatus(pool, {
      requestId: "r1",
      toStatus: "under_review",
      actorUserId: "staff-1",
      reason: "Pruefung gestartet",
      details: { ticket: "T-1" }
    });
    assert.match(pool.calls[2].sql, /INSERT INTO subscription_request_status_history/);
    assert.deepEqual(pool.calls[2].params, [
      "r1", "submitted", "under_review", "staff-1", "Pruefung gestartet", JSON.stringify({ ticket: "T-1" })
    ]);
  });

  it("ein Wechsel ohne bekannten Urheber und ohne Begruendung schreibt null statt Leerwerten", async () => {
    const pool = sequencePool(
      { rows: [{ id: "r1", status: "submitted", request_type: "upgrade" }] },
      { rows: [{ id: "r1", status: "cancelled" }] },
      { rows: [] }
    );
    await transitionStatus(pool, { requestId: "r1", toStatus: "cancelled" });
    assert.deepEqual(pool.calls[1].params, ["r1", "cancelled", null]);
    assert.deepEqual(pool.calls[2].params, ["r1", "submitted", "cancelled", null, null, "{}"]);
  });
});

/* ── transitionStatus: Zustandsgrenzen ────────────────────────── */

describe("Statuswechsel — die Grenzen der Maschine", () => {
  it("ein unbekannter Wunsch wird abgewiesen, bevor irgendetwas geschrieben wird", async () => {
    const pool = sequencePool({ rows: [] });
    const r = await transitionStatus(pool, { requestId: "nope", toStatus: "under_review" });
    assert.deepEqual(r, { ok: false, error: "REQUEST_NOT_FOUND" });
    assert.equal(pool.calls.length, 1, "keine Schreibabfrage nach einem Treffer ins Leere");
  });

  // Gestaltprobe: sagt zusaetzlich, dass KEINE Zeile zurueckkommt und kein
  // Angebot eingefroren wurde. Schaden sonst: der Aufrufer haelt eine
  // abgewiesene Antwort faelschlich fuer einen Erfolg.
  it("ein abgelehnter Wunsch laesst sich nicht mehr genehmigen — mit leerer Folgeliste", async () => {
    const pool = sequencePool({ rows: [{ id: "r1", status: "rejected", request_type: "upgrade" }] });
    const r = await transitionStatus(pool, { requestId: "r1", toStatus: "accepted", actorUserId: "staff-1" });
    assert.deepEqual(r, {
      ok: false,
      error: "INVALID_TRANSITION",
      from: "rejected",
      to: "accepted",
      allowed: []
    });
    assert.equal(pool.calls.length, 1);
  });

  it("ein Wunsch kann nicht direkt aus 'submitted' aktiviert werden", async () => {
    const pool = sequencePool({ rows: [{ id: "r1", status: "submitted", request_type: "upgrade" }] });
    const r = await transitionStatus(pool, { requestId: "r1", toStatus: "active", actorUserId: "staff-1" });
    assert.deepEqual(r, {
      ok: false,
      error: "INVALID_TRANSITION",
      from: "submitted",
      to: "active",
      allowed: ["under_review", "needs_clarification", "offered", "accepted", "rejected", "cancelled"]
    });
    assert.equal(pool.calls.length, 1);
  });

  it("ein Wechsel auf denselben Status wird als NO_CHANGE abgewiesen und nennt die echten Alternativen", async () => {
    const pool = sequencePool({ rows: [{ id: "r1", status: "submitted", request_type: "cancellation" }] });
    const r = await transitionStatus(pool, { requestId: "r1", toStatus: "submitted", actorUserId: "staff-1" });
    // Bei einer Kuendigung fehlt 'offered' auch hier — die Liste ist die
    // Vorlage fuer die Schaltflaechen in der Oberflaeche.
    assert.deepEqual(r, {
      ok: false,
      error: "NO_CHANGE",
      allowed: ["under_review", "needs_clarification", "accepted", "rejected", "cancelled"]
    });
    assert.equal(pool.calls.length, 1);
  });

  it("die Art des Wunsches entscheidet mit — eine Kuendigung kommt nicht nach 'offered'", async () => {
    const pool = sequencePool({ rows: [{ id: "r1", status: "under_review", request_type: "cancellation" }] });
    const r = await transitionStatus(pool, { requestId: "r1", toStatus: "offered", actorUserId: "staff-1" });
    assert.equal(r.ok, false);
    assert.equal(r.error, "INVALID_TRANSITION");
    assert.ok(!r.allowed.includes("offered"), "'offered' darf bei einer Kuendigung nicht angeboten werden");
    assert.equal(pool.calls.length, 1, "kein Schreibzugriff bei verweigertem Uebergang");
  });
});

/* ── transitionStatus: der OFFERED-Zweig ──────────────────────── */

describe("Statuswechsel — das Angebot wird eingefroren", () => {
  // Gestaltprobe auf die ganze Antwort. Toetet Zeile 349 (Zweig faellt weg),
  // 350/352/353 (ObjectLiteral/StringLiteral), 363 und 364.
  it("ein Wechsel nach 'offered' liefert Angebot und Dokument mit — bereits eingefroren", async () => {
    const pool = sequencePool(
      { rows: [{ id: "r1", status: "under_review", request_type: "upgrade" }] },
      { rows: [{ id: "r1", status: "offered" }] },
      { rows: [] },
      { rows: [GEFRORENE_ZEILE] },
      { rows: [VORHANDENES_DOKUMENT] }
    );
    const r = await transitionStatus(pool, {
      requestId: "r1", toStatus: "offered", actorUserId: "staff-1", reason: "Angebot erstellt"
    });
    assert.deepEqual(r, {
      ok: true,
      row: { id: "r1", status: "offered" },
      quote_snapshot: { catalog_version: "2026-01", plan: "PRO" },
      quote_already_frozen: true,
      document: {
        id: "doc-1",
        document_type: "offer",
        document_number: "ANG-2026-0001",
        status: "issued",
        title: "Angebot ANG-2026-0001",
        issued_at: "2026-08-01T10:05:00.000Z",
        download_available: true,
        created: false,
        already_exists: true
      }
    });
    assert.equal(pool.calls.length, 5);
  });

  it("das Dokument wird als Angebot zum richtigen Wunsch gesucht", async () => {
    // Toetet die leere Uebergabe und den geleerten Dokumenttyp: mit falschem
    // Typ oder falscher Kennung entstuende ein zweites Angebot neben dem
    // bestehenden — zwei Preise fuer denselben Vorgang.
    const pool = sequencePool(
      { rows: [{ id: "r1", status: "under_review", request_type: "upgrade" }] },
      { rows: [{ id: "r1", status: "offered" }] },
      { rows: [] },
      { rows: [GEFRORENE_ZEILE] },
      { rows: [VORHANDENES_DOKUMENT] }
    );
    await transitionStatus(pool, { requestId: "r1", toStatus: "offered", actorUserId: "staff-1" });

    assert.deepEqual(pool.calls[3].params, ["r1"], "das Angebot wird zum aufgerufenen Wunsch eingefroren");
    assert.match(pool.calls[3].sql, /SELECT \* FROM subscription_requests WHERE id = \$1/);

    assert.deepEqual(pool.calls[4].params, ["r1", "offer"]);
    const dok = pool.calls[4].sql;
    assert.match(dok, /FROM subscription_documents/);
    assert.match(dok, /WHERE subscription_request_id = \$1/);
    assert.match(dok, /AND document_type = \$2/);
    assert.match(dok, /AND status = 'issued'/);
    assert.match(dok, /ORDER BY issued_at DESC/);
  });

  it("ein frisch eingefrorenes Angebot wird als frisch gemeldet, nicht als bereits vorhanden", async () => {
    // Der Unterschied ist vertragsrelevant: 'bereits eingefroren' heisst, dass
    // ein aelterer Preis weiter gilt. Wird das verwechselt, glaubt das Team,
    // der Kunde habe einen anderen Preis gesehen als er tatsaechlich sah.
    const pool = sequencePool(
      { rows: [{ id: "r1", status: "under_review", request_type: "upgrade" }] },
      { rows: [{ id: "r1", status: "offered" }] },
      { rows: [] },
      { rows: [{ id: "r1", desired_plan: "PRO", desired_addons: [], quote_frozen_at: null, quote_snapshot: null, offer_expires_at: null }] },
      { rows: [{ id: "r1", quote_snapshot: {} }] },
      { rows: [] },
      { rows: [VORHANDENES_DOKUMENT] }
    );
    const r = await transitionStatus(pool, { requestId: "r1", toStatus: "offered", actorUserId: "staff-1" });

    assert.equal(r.ok, true);
    assert.equal(r.quote_already_frozen, false);
    assert.equal(typeof r.quote_snapshot, "object");
    assert.notEqual(r.quote_snapshot, null);
    assert.ok(r.quote_snapshot.catalog_version, "der eingefrorene Stand nennt seine Katalogfassung");
    assert.equal(r.document.already_exists, true);
    assert.equal(pool.calls.length, 7, "Lesen, Schreiben, Verlauf, Angebot lesen/schreiben/protokollieren, Dokument");
    assert.match(pool.calls[5].sql, /INSERT INTO audit_log/);
  });

  it("scheitert das Einfrieren, bricht der ganze Wechsel mit dem echten Fehlercode ab", async () => {
    // Toetet Zeile 351: ohne die Pruefung liefe der Wechsel weiter und der
    // Kunde saehe ein Angebot ohne festgeschriebenen Preis. Der durchgereichte
    // Code muss der echte sein — ein pauschaler Ersatzcode verschleiert, woran
    // es lag.
    const pool = sequencePool(
      { rows: [{ id: "r1", status: "under_review", request_type: "upgrade" }] },
      { rows: [{ id: "r1", status: "offered" }] },
      { rows: [] },
      { rows: [] } // freezeQuoteSnapshot findet den Wunsch nicht
    );
    await assert.rejects(
      () => transitionStatus(pool, { requestId: "r1", toStatus: "offered", actorUserId: "staff-1" }),
      (e) => {
        assert.equal(e.code, "REQUEST_NOT_FOUND");
        assert.equal(e.message, "REQUEST_NOT_FOUND");
        return true;
      }
    );
    assert.equal(pool.calls.length, 4, "nach dem Abbruch wird kein Dokument mehr erzeugt");
  });

  it("scheitert das Dokument, bricht der ganze Wechsel mit dem echten Fehlercode ab", async () => {
    // Toetet Zeile 357: ohne die Pruefung entstuende ein Angebotsstatus ohne
    // Angebotsdokument — der Kunde bekaeme nichts in die Hand, das System
    // meldete Erfolg.
    const pool = sequencePool(
      { rows: [{ id: "r1", status: "under_review", request_type: "upgrade" }] },
      { rows: [{ id: "r1", status: "offered" }] },
      { rows: [] },
      { rows: [GEFRORENE_ZEILE] },
      { rows: [] }, // kein bestehendes Dokument
      { rows: [] }  // und die Erzeugung findet den Wunsch nicht
    );
    await assert.rejects(
      () => transitionStatus(pool, { requestId: "r1", toStatus: "offered", actorUserId: "staff-1" }),
      (e) => {
        assert.equal(e.code, "REQUEST_NOT_FOUND");
        assert.notEqual(e.code, "DOCUMENT_GENERATION_FAILED");
        return true;
      }
    );
    assert.equal(pool.calls.length, 6);
  });

  // Gegenstueck zur Gestaltprobe oben: bei jedem anderen Ziel darf NICHTS
  // eingefroren und kein Dokument erzeugt werden. Toetet die Umkehrung von
  // Zeile 349 und die stets-wahr-Varianten von 351/357.
  it("jeder andere Zielstatus friert nichts ein und erzeugt kein Dokument", async () => {
    for (const ziel of ["under_review", "needs_clarification", "accepted", "rejected", "cancelled"]) {
      const pool = sequencePool(
        { rows: [{ id: "r1", status: "submitted", request_type: "upgrade" }] },
        { rows: [{ id: "r1", status: ziel }] },
        { rows: [] }
      );
      const r = await transitionStatus(pool, { requestId: "r1", toStatus: ziel, actorUserId: "staff-1" });
      assert.deepEqual(r, {
        ok: true,
        row: { id: "r1", status: ziel },
        quote_snapshot: null,
        quote_already_frozen: false,
        document: null
      }, `Zielstatus ${ziel}`);
      assert.equal(pool.calls.length, 3, `Zielstatus ${ziel}: genau drei Abfragen`);
    }
  });
});
