/**
 * subscriptionRequestService – Handlungen am Wunsch (approve/reject/activate/assignStaff).
 *
 * WARUM ES DIESE DATEI GIBT
 * Der Mutationslauf vom 2026-09-01 hat fuer services/subscriptionRequestService.js
 * eine Punktzahl von 43,51 % ergeben – 548 von 970 Mutanten ueberlebten. Die
 * Owner-Vorgabe lautet 90 % je Bereich. Ueberlebende Mutanten in genau diesem
 * Dienst sind teuer: er entscheidet ueber den PLAN und damit ueber GELD. Ein
 * stiller Logik-Flip heisst hier falscher Plan, uebersprungene Zustandsgrenze,
 * verlorener Preisstand oder ein Verlaufseintrag, der den Nachweis
 * "Wer + Was + Warum" nicht mehr traegt.
 *
 * WAS DIESE DATEI ABDECKT (Buendel "aktionen", 71 ueberlebende Mutanten)
 *   - approve      – Genehmigung inkl. Einfrieren des Preisstands
 *   - reject       – Ablehnung mit Pflicht-Begruendung
 *   - activate     – finale Scharfschaltung
 *   - assignStaff  – Zuweisung an einen Mitarbeiter
 * Geprueft werden dabei: Rueckgabe-GESTALT (deepEqual statt Feldprobe, damit auch
 * auffaellt, was NICHT da sein darf), die woertliche FORM jeder Abfrage und die
 * exakte Bindungsreihenfolge der Parameter (eine vertauschte Bindung ist kein
 * Formfehler, sondern schreibt fremde Werte in fremde Spalten), sowie die
 * Nutzlast jedes Verlaufseintrags.
 *
 * WAS DIESE DATEI BEWUSST NICHT PRUEFT
 *   - Die Zustandstabelle selbst (isValidTransition, listAllowedNextStatuses) –
 *     die liegt in test/subscriptionRequestService.test.js und ist dort abgedeckt.
 *   - Den Innenbau von freezeQuoteSnapshot, ensureDocumentForRequest und
 *     auditLog.writeAudit – fremde Dienste, eigene Testdateien. Hier wird nur
 *     festgehalten, DASS und in WELCHER Reihenfolge sie beteiligt sind.
 *   - Zwei Mutanten gelten als aequivalent und werden nicht erzwungen (Begruendung
 *     jeweils am Ort, siehe Kommentare "AEQUIVALENT").
 *
 * Lauf: node --test --test-force-exit test/subscriptionMutanten.aktionen.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { CATALOG_VERSION } from "../config/planCatalog.js";
import {
  approve,
  reject,
  activate,
  assignStaff
} from "../services/subscriptionRequestService.js";

/* ── Muster-Pool (gleiche Bauart wie test/subscriptionRequestService.test.js) ── */

function sequencePool(...responses) {
  let idx = 0;
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (idx >= responses.length) {
        throw new Error(`Unexpected query #${idx + 1}: ${String(sql).slice(0, 80)}`);
      }
      const resp = responses[idx++];
      if (resp instanceof Error) throw resp;
      return resp;
    }
  };
}

/** Vergleichbar machen, ohne die Aussage der Abfrage zu verlieren. */
function normSql(sql) {
  return String(sql).replace(/\s+/g, " ").trim();
}

/** Die Nutzlast des Verlaufseintrags liegt als JSON-Text in Bindung 6. */
function historyDetails(call) {
  return JSON.parse(call.params[5]);
}

const SELECT_CURRENT =
  "SELECT id, status, request_type FROM subscription_requests WHERE id = $1";

const HISTORY_INSERT =
  "INSERT INTO subscription_request_status_history " +
  "(request_id, from_status, to_status, changed_by, reason, details) " +
  "VALUES ($1, $2, $3, $4, $5, $6::jsonb)";

/* ── approve ─────────────────────────────────────────────────── */

describe("Genehmigung eines Abo-Wunsches", () => {
  it("ein unbekannter Wunsch wird nicht genehmigt", async () => {
    // Schaden bei Fehler: eine Genehmigung ohne existierende Anfrage — der
    // Preisstand wuerde fuer eine Geisterzeile eingefroren.
    const pool = sequencePool({ rows: [] });
    const r = await approve(pool, { requestId: "req-unbekannt", actorUserId: "staff-1" });

    assert.deepEqual(r, { ok: false, error: "REQUEST_NOT_FOUND" });
    assert.equal(pool.calls.length, 1, "nach dem Fehlschlag darf nichts mehr geschrieben werden");
    assert.equal(normSql(pool.calls[0].sql), SELECT_CURRENT);
    assert.deepEqual(pool.calls[0].params, ["req-unbekannt"]);
  });

  it("die Genehmigung friert den Preisstand ein und haelt Wer, Was und Warum fest", async () => {
    const updateRow = { id: "r1", status: "accepted", approved_by: "staff-1" };
    const pool = sequencePool(
      { rows: [{ id: "r1", status: "offered", request_type: "upgrade" }] },   // aktueller Stand
      { rows: [updateRow] },                                                  // UPDATE
      { rows: [{ id: "r1", status: "accepted", request_type: "upgrade", desired_plan: "PRO", desired_addons: [] }] }, // freeze: SELECT *
      { rows: [{ id: "r1" }] },                                               // freeze: UPDATE
      { rows: [] },                                                           // freeze: audit_log
      { rows: [] }                                                            // Verlaufseintrag
    );

    const r = await approve(pool, {
      requestId: "r1",
      actorUserId: "staff-1",
      reason: "Konditionen geprueft",
      details: { ticket: "T-77" }
    });

    // Gestalt der Antwort: genau diese vier Felder, keines mehr, keines weniger.
    assert.deepEqual(Object.keys(r).sort(), ["ok", "quote_already_frozen", "quote_snapshot", "row"]);
    assert.equal(r.ok, true);
    assert.deepEqual(r.row, updateRow);
    assert.equal(r.quote_already_frozen, false, "frisch eingefroren, also nicht 'bereits gefroren'");
    assert.equal(r.quote_snapshot.catalog_version, CATALOG_VERSION);
    assert.equal(r.quote_snapshot.plan, "PRO");

    assert.equal(pool.calls.length, 6);

    // Die schreibende Abfrage woertlich: wer genehmigt hat ($3) landet in zwei
    // Spalten, der Status ($2) in einer — eine vertauschte Bindung waere hier
    // ein falscher Genehmigender im Audit.
    assert.equal(
      normSql(pool.calls[1].sql),
      "UPDATE subscription_requests SET status = $2, approved_by = $3, approved_at = NOW(), " +
      "status_updated_at = NOW(), status_updated_by = $3, updated_at = NOW() " +
      "WHERE id = $1 RETURNING *"
    );
    assert.deepEqual(pool.calls[1].params, ["r1", "accepted", "staff-1"]);

    // Der Preisstand wird innerhalb derselben Transaktion eingefroren.
    assert.equal(normSql(pool.calls[2].sql), "SELECT * FROM subscription_requests WHERE id = $1");

    // Der Verlaufseintrag ist der Nachweis der Handlung.
    assert.equal(normSql(pool.calls[5].sql), HISTORY_INSERT);
    assert.deepEqual(pool.calls[5].params.slice(0, 5), [
      "r1", "offered", "accepted", "staff-1", "Konditionen geprueft"
    ]);
    assert.deepEqual(historyDetails(pool.calls[5]), {
      ticket: "T-77",
      approved: true,
      quote_snapshot_already_frozen: false,
      quote_catalog_version: CATALOG_VERSION
    });
  });

  it("ein bereits eingefrorener Preisstand wird bei der Genehmigung nicht neu berechnet", async () => {
    // Schaden bei Fehler: ein zweites Einfrieren wuerde den zugesagten Preis
    // gegen den heutigen Katalog austauschen — der Kunde bekaeme eine andere
    // Rechnung als das Angebot versprochen hat.
    const frozen = { catalog_version: "kat-2026-01", plan: "PRO", plan_monthly_price_cents: 19900 };
    const updateRow = { id: "r1", status: "accepted", approved_by: "staff-1" };
    const pool = sequencePool(
      { rows: [{ id: "r1", status: "offered", request_type: "upgrade" }] },
      { rows: [updateRow] },
      { rows: [{ id: "r1", quote_frozen_at: "2026-01-05T10:00:00.000Z", quote_snapshot: frozen }] },
      { rows: [] } // Verlaufseintrag
    );

    const r = await approve(pool, { requestId: "r1", actorUserId: "staff-1", reason: null, details: null });

    assert.equal(pool.calls.length, 4, "kein erneutes UPDATE des Preisstands, kein zweiter Audit-Satz");
    assert.equal(r.quote_already_frozen, true);
    assert.deepEqual(r.quote_snapshot, frozen, "der ALTE Stand bleibt gueltig");

    // Ohne uebergebene Begruendung steht 'approve' im Verlauf — nie leer.
    assert.deepEqual(pool.calls[3].params.slice(0, 5), [
      "r1", "offered", "accepted", "staff-1", "approve"
    ]);
    assert.deepEqual(historyDetails(pool.calls[3]), {
      approved: true,
      quote_snapshot_already_frozen: true,
      quote_catalog_version: "kat-2026-01"
    });
  });

  it("scheitert das Einfrieren des Preisstands, bricht die Genehmigung mit genau diesem Fehler ab", async () => {
    // Schaden bei Fehler: eine genehmigte Anfrage ohne Preiswahrheit — jede
    // spaetere Rechnung haette keine vertragliche Grundlage.
    const pool = sequencePool(
      { rows: [{ id: "r1", status: "offered", request_type: "upgrade" }] },
      { rows: [{ id: "r1", status: "accepted" }] },
      { rows: [] } // freeze findet die Zeile nicht
    );

    await assert.rejects(
      () => approve(pool, { requestId: "r1", actorUserId: "staff-1" }),
      (e) => {
        // Der URSPRUNGSfehler muss durchgereicht werden, nicht ein Sammelbegriff.
        assert.equal(e.code, "REQUEST_NOT_FOUND");
        assert.equal(e.message, "REQUEST_NOT_FOUND");
        return true;
      }
    );
    assert.equal(pool.calls.length, 3, "nach dem Abbruch darf kein Verlaufseintrag folgen");
  });

  // AEQUIVALENT (nicht erzwungen): der Ersatztext "QUOTE_SNAPSHOT_FAILED" in
  // Zeile 406 ist unerreichbar — freezeQuoteSnapshot liefert bei ok:false immer
  // einen gesetzten error. Ebenso die optionale Kette in Zeile 418: wenn ok true
  // ist, existiert snapshot in beiden Pfaden zwingend.
});

/* ── reject ──────────────────────────────────────────────────── */

describe("Ablehnung eines Abo-Wunsches", () => {
  it("ohne Begruendung wird nicht abgelehnt", async () => {
    // Schaden bei Fehler: eine Ablehnung ohne Grund ist gegenueber dem Kunden
    // nicht belegbar und verletzt die Nachweispflicht "Wer + Was + Warum".
    for (const reason of [null, undefined, "", "   ", "\t\n "]) {
      const pool = sequencePool(); // jede Abfrage waere hier bereits ein Fehler
      const r = await reject(pool, { requestId: "r1", actorUserId: "staff-1", reason });
      assert.deepEqual(r, { ok: false, error: "REASON_REQUIRED" }, `Begruendung ${JSON.stringify(reason)}`);
      assert.equal(pool.calls.length, 0);
    }
  });

  it("ein unbekannter Wunsch wird nicht abgelehnt", async () => {
    const pool = sequencePool({ rows: [] });
    const r = await reject(pool, { requestId: "req-unbekannt", actorUserId: "staff-1", reason: "passt nicht" });

    assert.deepEqual(r, { ok: false, error: "REQUEST_NOT_FOUND" });
    assert.equal(pool.calls.length, 1);
    assert.equal(normSql(pool.calls[0].sql), SELECT_CURRENT);
    assert.deepEqual(pool.calls[0].params, ["req-unbekannt"]);
  });

  it("ein bereits scharfgeschalteter Wunsch laesst sich nicht nachtraeglich ablehnen", async () => {
    // Schaden bei Fehler: ein laufendes Abo wuerde rueckwirkend als abgelehnt
    // gefuehrt — Rechnungsstellung und Anfragestand widersprechen sich.
    const pool = sequencePool({ rows: [{ id: "r1", status: "active", request_type: "upgrade" }] });
    const r = await reject(pool, { requestId: "r1", actorUserId: "staff-1", reason: "doch nicht" });

    assert.deepEqual(r, {
      ok: false,
      error: "INVALID_TRANSITION",
      from: "active",
      to: "rejected",
      allowed: ["expired"]
    });
    assert.equal(pool.calls.length, 1, "keine Schreibabfrage nach verweigertem Uebergang");
  });

  it("die Ablehnung schreibt Grund, Ablehnenden und Zeitpunkt fort", async () => {
    const updateRow = { id: "r1", status: "rejected", rejection_reason: "Budget nicht freigegeben" };
    const pool = sequencePool(
      { rows: [{ id: "r1", status: "submitted", request_type: "upgrade" }] },
      { rows: [updateRow] },
      { rows: [] }
    );

    const r = await reject(pool, {
      requestId: "r1",
      actorUserId: "staff-1",
      reason: "Budget nicht freigegeben"
    });

    assert.deepEqual(r, { ok: true, row: updateRow });
    assert.equal(pool.calls.length, 3);

    assert.equal(
      normSql(pool.calls[1].sql),
      "UPDATE subscription_requests SET status = $2, rejected_by = $3, rejected_at = NOW(), " +
      "rejection_reason = $4, status_updated_at = NOW(), status_updated_by = $3, updated_at = NOW() " +
      "WHERE id = $1 RETURNING *"
    );
    assert.deepEqual(pool.calls[1].params, ["r1", "rejected", "staff-1", "Budget nicht freigegeben"]);

    assert.equal(normSql(pool.calls[2].sql), HISTORY_INSERT);
    assert.deepEqual(pool.calls[2].params.slice(0, 5), [
      "r1", "submitted", "rejected", "staff-1", "Budget nicht freigegeben"
    ]);
    assert.deepEqual(historyDetails(pool.calls[2]), { rejected: true });
  });

  it("die Begruendung wird beschnitten gespeichert, nicht mit Leerraum", async () => {
    const pool = sequencePool(
      { rows: [{ id: "r1", status: "submitted", request_type: "upgrade" }] },
      { rows: [{ id: "r1", status: "rejected" }] },
      { rows: [] }
    );
    await reject(pool, { requestId: "r1", actorUserId: "staff-1", reason: "  Budget fehlt  " });

    assert.equal(pool.calls[1].params[3], "Budget fehlt");
    assert.equal(pool.calls[2].params[4], "Budget fehlt");
  });
});

/* ── activate ────────────────────────────────────────────────── */

describe("Scharfschaltung eines Abo-Wunsches", () => {
  it("ein unbekannter Wunsch wird nicht scharfgeschaltet", async () => {
    const pool = sequencePool({ rows: [] });
    const r = await activate(pool, { requestId: "req-unbekannt", actorUserId: "staff-1" });

    assert.deepEqual(r, { ok: false, error: "REQUEST_NOT_FOUND" });
    assert.equal(pool.calls.length, 1);
    assert.equal(normSql(pool.calls[0].sql), SELECT_CURRENT);
    assert.deepEqual(pool.calls[0].params, ["req-unbekannt"]);
  });

  it("aus 'accepted' wird scharfgeschaltet und der Vorgang protokolliert", async () => {
    const updateRow = { id: "r1", status: "active", activated_at: "2026-09-01T08:00:00.000Z" };
    const pool = sequencePool(
      { rows: [{ id: "r1", status: "accepted", request_type: "upgrade" }] },
      { rows: [updateRow] },
      { rows: [] }
    );

    const r = await activate(pool, {
      requestId: "r1",
      actorUserId: "staff-1",
      reason: "Umstellung ausgefuehrt",
      details: { applied_plan: "PRO" }
    });

    assert.deepEqual(r, { ok: true, row: updateRow });
    assert.equal(pool.calls.length, 3);

    // 'activate' setzt bewusst KEIN approved_by/rejected_by — die Spaltenliste
    // ist die Zusicherung, dass die Scharfschaltung keine Genehmigung faelscht.
    assert.equal(
      normSql(pool.calls[1].sql),
      "UPDATE subscription_requests SET status = $2, activated_at = NOW(), " +
      "status_updated_at = NOW(), status_updated_by = $3, updated_at = NOW() " +
      "WHERE id = $1 RETURNING *"
    );
    assert.deepEqual(pool.calls[1].params, ["r1", "active", "staff-1"]);

    assert.equal(normSql(pool.calls[2].sql), HISTORY_INSERT);
    assert.deepEqual(pool.calls[2].params.slice(0, 5), [
      "r1", "accepted", "active", "staff-1", "Umstellung ausgefuehrt"
    ]);
    assert.deepEqual(historyDetails(pool.calls[2]), { applied_plan: "PRO", activated: true });
  });

  it("ohne uebergebene Begruendung steht 'activate' im Verlauf", async () => {
    // Schaden bei Fehler: ein Verlaufseintrag ohne Grund ist im Audit wertlos.
    const pool = sequencePool(
      { rows: [{ id: "r1", status: "accepted", request_type: "cancellation" }] },
      { rows: [{ id: "r1", status: "active" }] },
      { rows: [] }
    );
    await activate(pool, { requestId: "r1", actorUserId: "staff-1" });

    assert.equal(pool.calls[2].params[4], "activate");
    assert.deepEqual(historyDetails(pool.calls[2]), { activated: true });
  });

  it("aus 'submitted' fuehrt kein direkter Weg nach 'active'", async () => {
    // Schaden bei Fehler: ein Plan waere live, ohne je genehmigt worden zu sein.
    const pool = sequencePool({ rows: [{ id: "r1", status: "submitted", request_type: "upgrade" }] });
    const r = await activate(pool, { requestId: "r1", actorUserId: "staff-1" });

    assert.deepEqual(r, {
      ok: false,
      error: "INVALID_TRANSITION",
      from: "submitted",
      to: "active",
      allowed: ["under_review", "needs_clarification", "offered", "accepted", "rejected", "cancelled"]
    });
    assert.equal(pool.calls.length, 1);
  });
});

/* ── assignStaff ─────────────────────────────────────────────── */

describe("Zuweisung eines Abo-Wunsches an einen Mitarbeiter", () => {
  it("ohne Mitarbeiter-Kennung wird nicht zugewiesen", async () => {
    for (const staffUserId of [null, undefined, ""]) {
      const pool = sequencePool();
      const r = await assignStaff(pool, { requestId: "r1", staffUserId });
      assert.deepEqual(r, { ok: false, error: "STAFF_USER_ID_REQUIRED" });
      assert.equal(pool.calls.length, 0);
    }
  });

  it("ein unbekannter Wunsch laesst sich niemandem zuweisen", async () => {
    // Schaden bei Fehler: ein Verlaufseintrag zu einer Anfrage, die es nicht
    // gibt — bzw. ein Absturz statt einer sauberen Antwort.
    const pool = sequencePool({ rows: [] });
    const r = await assignStaff(pool, { requestId: "req-unbekannt", staffUserId: "staff-2", actorUserId: "owner-1" });

    assert.deepEqual(r, { ok: false, error: "REQUEST_NOT_FOUND" });
    assert.equal(pool.calls.length, 1, "ohne getroffene Zeile darf kein Verlaufseintrag entstehen");
  });

  it("die Zuweisung haelt fest, wer wem zugewiesen wurde", async () => {
    const row = { id: "r1", status: "under_review", assigned_staff_id: "staff-2" };
    const pool = sequencePool({ rows: [row] }, { rows: [] });

    const r = await assignStaff(pool, { requestId: "r1", staffUserId: "staff-2", actorUserId: "owner-1" });

    assert.deepEqual(r, { ok: true, row });
    assert.equal(pool.calls.length, 2);

    // Die Zuweisung darf den Status NICHT anfassen — sie ist keine Entscheidung.
    assert.equal(
      normSql(pool.calls[0].sql),
      "UPDATE subscription_requests SET assigned_staff_id = $2, assigned_at = NOW(), " +
      "updated_at = NOW() WHERE id = $1 RETURNING *"
    );
    assert.deepEqual(pool.calls[0].params, ["r1", "staff-2"]);

    // Zugewiesener und Handelnder sind zwei verschiedene Personen: staff-2 wird
    // zugewiesen, owner-1 hat zugewiesen. Ein Tausch waere eine falsche
    // Verantwortungszuschreibung im Audit.
    assert.equal(normSql(pool.calls[1].sql), HISTORY_INSERT);
    assert.deepEqual(pool.calls[1].params.slice(0, 5), [
      "r1", "under_review", "under_review", "owner-1", "assign_staff"
    ]);
    assert.deepEqual(historyDetails(pool.calls[1]), { assigned_staff_id: "staff-2" });
  });

  it("ohne handelnden Nutzer bleibt der Handelnde leer statt undefiniert", async () => {
    const pool = sequencePool(
      { rows: [{ id: "r1", status: "submitted", assigned_staff_id: "staff-2" }] },
      { rows: [] }
    );
    await assignStaff(pool, { requestId: "r1", staffUserId: "staff-2" });

    assert.equal(pool.calls[1].params[3], null);
  });
});
