/**
 * subscriptionRequestService.applyApprovedChange — Mutations-Haertung "anwenden".
 *
 * WARUM ES DIESE DATEI GIBT
 * Der Mutationslauf vom 2026-09-01 hat fuer subscriptionRequestService.js eine
 * Punktzahl von 43,51 % gemessen; 548 von 970 Mutanten haben ueberlebt. Die
 * Owner-Vorgabe (CLAUDE.md, Mutation-Testing-Direktive) ist 90 % je Bereich.
 * Diese Datei nimmt sich das Buendel "anwenden" vor: 111 ueberlebende Mutanten
 * in `applyApprovedChange` — dem Pfad, der einen genehmigten Wunsch in echte
 * Wirklichkeit uebersetzt (organizations.plan, subscriptions, Zusatzleistungen,
 * Wirksamkeitsdatum, Dokument, Verlauf, Audit).
 *
 * Das ist der GELDPFAD. Ein stiller Logik-Flip bedeutet hier: die Organisation
 * bekommt den falschen Plan, eine Kuendigung schreibt den Wunschplan statt des
 * laufenden, bezahlte Zusatzleistungen werden nicht aktiviert (oder fremde
 * bleiben aktiv), oder der Nachweis "Wer + Was + Warum" fehlt im Verlauf.
 *
 * WAS DIESE DATEI ABDECKT
 *   - Die Eingangswaechter: unbekannter Wunsch, falscher Status, offene
 *     Stripe-Sitzung bei new_individual.
 *   - Die Plan-Auswahl (Zeilen 781-785): Kuendigung behaelt den LAUFENDEN Plan,
 *     alle uebrigen Typen nehmen den GEWUENSCHTEN.
 *   - Die vier Abbruchgruende (Angebotsstand, Organisation, Abo, Statuszeile,
 *     Dokument) inklusive des Fehlercodes, den der Aufrufer sieht.
 *   - Die exakten Bindungen JEDER Abfrage (assert.deepEqual auf params) und die
 *     FORM der Abfragen — der Muster-Pool fuehrt nichts aus, also ist die Form
 *     das Einzige, was eine vertauschte Bedingung noch auffangen kann.
 *   - Die vollstaendige Gestalt der Verlaufs-Nutzlast (`historyDetails`) und der
 *     Audit-Nutzlast, per deepEqual auf das ganze Objekt: eine Feldprobe sagt,
 *     was da sein MUSS; die Gestaltprobe sagt zusaetzlich, was NICHT da sein darf.
 *
 * WAS DIESE DATEI BEWUSST NICHT PRUEFT
 *   - Den Inhalt erzeugter Dokumente (HTML-Rendering, Nummernkreis-Format):
 *     das ist Gegenstand von test/subscriptionDocuments.test.js.
 *   - Protokolltexte auf Erfolgspfaden.
 *   - Mutanten, die kein beobachtbares Verhalten aendern. Sie sind am Ende
 *     dieser Datei einzeln benannt und begruendet (Abschnitt "Aequivalente
 *     Mutanten") — sie werden NICHT kuenstlich erzwungen.
 *
 * Run: node --test --test-force-exit api/test/subscriptionMutanten.anwenden.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { CATALOG_VERSION } from "../config/planCatalog.js";
import {
  REQUEST_TYPES,
  applyApprovedChange
} from "../services/subscriptionRequestService.js";

/* ── Muster-Pool (gleiche Bauart wie test/subscriptionRequests.routes.test.js) ── */

function transactionPool(...responses) {
  let idx = 0;
  const calls = [];
  let released = false;
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (/^(BEGIN|COMMIT|ROLLBACK)$/i.test(String(sql).trim())) {
        return { rows: [] };
      }
      if (idx >= responses.length) {
        throw new Error(`Unexpected query #${idx + 1}: ${String(sql).slice(0, 80)}`);
      }
      const r = responses[idx++];
      if (r instanceof Error) throw r;
      return r;
    },
    release: () => { released = true; }
  };
  return {
    calls,
    connect: async () => client,
    get released() { return released; }
  };
}

/* ── Lesehilfen auf dem Aufruf-Protokoll ─────────────────────── */

const TX_STEUERUNG = /^(BEGIN|COMMIT|ROLLBACK)$/i;

/** Nur die fachlichen Abfragen — ohne BEGIN/COMMIT/ROLLBACK. */
function fachlich(pool) {
  return pool.calls.filter((c) => !TX_STEUERUNG.test(String(c.sql).trim()));
}

function einzigerAufruf(pool, muster, label) {
  const treffer = fachlich(pool).filter((c) => muster.test(String(c.sql)));
  assert.equal(treffer.length, 1, `genau eine Abfrage erwartet fuer ${label}, gefunden: ${treffer.length}`);
  return treffer[0];
}

function alleAufrufe(pool, muster) {
  return fachlich(pool).filter((c) => muster.test(String(c.sql)));
}

function keinAufruf(pool, muster, label) {
  assert.equal(alleAufrufe(pool, muster).length, 0, label);
}

/** Der Verlaufseintrag. params[5] traegt die Nutzlast als JSON-Text. */
function verlauf(pool) {
  return einzigerAufruf(pool, /INSERT INTO subscription_request_status_history/i, "Verlaufseintrag");
}

/**
 * Der Audit-Eintrag DIESES Vorgangs. `freezeQuoteSnapshot` schreibt im selben
 * Client einen zweiten Audit-Eintrag (quote_frozen) — der wird hier bewusst
 * ausgefiltert, sonst pruefte man den falschen Nachweis.
 */
function audit(pool, action = "subscription_request.apply_approved_change") {
  const treffer = fachlich(pool).filter(
    (c) => /INSERT INTO audit_log/i.test(String(c.sql)) && c.params?.[1] === action
  );
  assert.equal(treffer.length, 1, `genau ein Audit-Eintrag "${action}" erwartet, gefunden: ${treffer.length}`);
  return treffer[0];
}

/* ── Feste Beispieldaten ─────────────────────────────────────── */

const FROZEN_AT = "2026-08-01T10:00:00.000Z";
const ACTIVATED_AT = "2026-08-30T09:15:00.000Z";
const CANCEL_AT = "2026-12-31T00:00:00.000Z";

const AENDERUNGS_DOKUMENT = {
  id: "doc-alt",
  document_type: "change_confirmation",
  document_number: "AE-2026-000007",
  status: "issued",
  title: "Aenderungsbestaetigung AE-2026-000007",
  format: "html",
  issued_at: "2026-08-30T09:00:00.000Z"
};

function aktivierteZeile(id) {
  return { id, status: "active", activated_at: ACTIVATED_AT };
}

/* ══════════════════════════════════════════════════════════════
 * 1. Eingangswaechter
 * ══════════════════════════════════════════════════════════════ */

describe("applyApprovedChange — Eingangswaechter", () => {
  it("ein unbekannter Wunsch wird abgelehnt, ohne dass eine einzige Zeile angefasst wird", async () => {
    // Schaden ohne diese Probe: der Dienst laeuft mit `undefined` weiter und
    // schreibt Plan-Updates fuer eine Anfrage, die es nicht gibt.
    const pool = transactionPool({ rows: [] });
    const r = await applyApprovedChange(pool, { requestId: "r-weg", actorUserId: "staff-1" });

    assert.deepEqual(r, { ok: false, error: "REQUEST_NOT_FOUND" });
    assert.equal(fachlich(pool).length, 1, "nach dem Fehlschlag darf nichts weiter laufen");
    assert.deepEqual(fachlich(pool)[0].params, ["r-weg"]);
  });

  it("der Einstiegs-Lesezugriff bindet genau die Anfrage-Kennung und liest nur diese Zeile", async () => {
    // Eine vertauschte Bindung waere hier kein Formfehler, sondern ein Datenleck
    // zwischen Mandanten.
    const pool = transactionPool({ rows: [] });
    await applyApprovedChange(pool, { requestId: "r-form", actorUserId: null });

    const lese = fachlich(pool)[0];
    assert.deepEqual(lese.params, ["r-form"]);
    assert.match(lese.sql, /FROM subscription_requests\s+WHERE id = \$1/i);
    assert.match(lese.sql, /desired_plan/);
    assert.match(lese.sql, /current_plan/);
    assert.match(lese.sql, /cancellation_effective_at/);
    assert.match(lese.sql, /quote_snapshot/);
  });

  it("ein noch nicht angenommener Wunsch wird nicht angewendet und nennt den aktuellen Status", async () => {
    const pool = transactionPool({
      rows: [{ id: "r-offen", status: "submitted", request_type: REQUEST_TYPES.UPGRADE }]
    });
    const r = await applyApprovedChange(pool, { requestId: "r-offen", actorUserId: "staff-1" });

    assert.deepEqual(r, { ok: false, error: "NOT_ACCEPTED", current_status: "submitted" });
    assert.equal(fachlich(pool).length, 1);
  });

  it("eine Individuell-Neuanfrage mit offener Stripe-Sitzung ist nicht aktivierbar", async () => {
    // Invariante "Aktivierung NUR nach verifizierter Zahlung": ohne diese Probe
    // koennte das Staff Center einen unbezahlten Individuell-Vertrag scharf schalten.
    const pool = transactionPool(
      {
        rows: [{
          id: "ri", status: "accepted", request_type: REQUEST_TYPES.NEW_INDIVIDUAL,
          org_id: "o1", user_id: "u1", desired_plan: "INDIVIDUELL", current_plan: "DEMO"
        }]
      },
      { rows: [{ "?column?": 1 }] }
    );
    const r = await applyApprovedChange(pool, { requestId: "ri", actorUserId: "staff-1" });

    assert.deepEqual(r, { ok: false, error: "PAYMENT_NOT_VERIFIED" });

    const pruefung = einzigerAufruf(pool, /payment_sessions/i, "Zahlungs-Diskriminator");
    assert.deepEqual(pruefung.params, ["ri"]);
    assert.match(pruefung.sql, /WHERE request_id = \$1/i);
    assert.match(pruefung.sql, /method = 'stripe'/i);
    assert.match(pruefung.sql, /status <> 'completed'/i);
    assert.match(pruefung.sql, /LIMIT 1/i);

    keinAufruf(pool, /UPDATE organizations/i, "keine Organisation angefasst");
    keinAufruf(pool, /UPDATE subscriptions/i, "kein Abo angefasst");
    keinAufruf(pool, /SET status = 'active'/i, "Anfrage nicht aktiviert");
  });

  it("ohne offene Stripe-Sitzung laeuft die Individuell-Neuanfrage durch", async () => {
    // Gegenprobe zur Sperre oben: eine LEERE Trefferliste darf NICHT blocken.
    // Ohne sie wuerde jede Individuell-Neuanfrage dauerhaft haengen bleiben.
    const req = {
      id: "ri2", status: "accepted", request_type: REQUEST_TYPES.NEW_INDIVIDUAL,
      org_id: "o1", user_id: "u1", desired_plan: "INDIVIDUELL", current_plan: "DEMO",
      desired_addons: null, cancellation_effective_at: null
    };
    const pool = transactionPool(
      { rows: [req] },
      { rows: [] },
      { rows: [{ ...req, quote_frozen_at: FROZEN_AT, quote_snapshot: { catalog_version: "test-cat", plan: "INDIVIDUELL" } }] },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [aktivierteZeile("ri2")] },
      { rows: [{ id: "doc-ab", document_type: "order_confirmation", document_number: "AB-2026-000002", status: "issued" }] },
      { rows: [] },
      { rows: [] }
    );
    const r = await applyApprovedChange(pool, { requestId: "ri2", actorUserId: "staff-1" });

    assert.equal(r.ok, true);
    assert.equal(r.target_plan, "INDIVIDUELL");
    assert.equal(alleAufrufe(pool, /payment_sessions/i).length, 1, "geprueft, aber nicht geblockt");
    assert.equal(einzigerAufruf(pool, /UPDATE organizations/i, "Organisation").params[1], "INDIVIDUELL");
  });

  it("mit verifizierter Zahlung entfaellt die Sitzungspruefung ganz", async () => {
    const req = {
      id: "ri3", status: "accepted", request_type: REQUEST_TYPES.NEW_INDIVIDUAL,
      org_id: null, user_id: null, desired_plan: "INDIVIDUELL", current_plan: "DEMO",
      desired_addons: null, cancellation_effective_at: null
    };
    const pool = transactionPool(
      { rows: [req] },
      { rows: [{ ...req, quote_frozen_at: FROZEN_AT, quote_snapshot: { catalog_version: "test-cat", plan: "INDIVIDUELL" } }] },
      { rows: [aktivierteZeile("ri3")] },
      { rows: [{ id: "doc-ab2", document_type: "order_confirmation", document_number: "AB-2026-000003", status: "issued" }] },
      { rows: [] },
      { rows: [] }
    );
    const r = await applyApprovedChange(pool, { requestId: "ri3", actorUserId: "staff-1", verifiedPayment: true });

    assert.equal(r.ok, true);
    keinAufruf(pool, /payment_sessions/i, "Diskriminator uebersprungen");
  });
});

/* ══════════════════════════════════════════════════════════════
 * 2. Die Plan-Auswahl — der eigentliche Geldentscheid
 * ══════════════════════════════════════════════════════════════ */

describe("applyApprovedChange — welcher Plan tatsaechlich geschrieben wird", () => {
  function aufstiegPool(reqOverrides = {}, snapshotOverrides = {}) {
    const req = {
      id: "r-up", status: "accepted", request_type: REQUEST_TYPES.UPGRADE,
      org_id: "o1", user_id: "u1",
      desired_plan: "PRO", current_plan: "PLUS",
      desired_addons: null, employee_count: 42,
      cancellation_effective_at: null, effective_from: null,
      ...reqOverrides
    };
    const snapshot = {
      catalog_version: "test-cat",
      plan: "PRO",
      proposed_price_cents: 79900,
      individual_tier: null,
      ...snapshotOverrides
    };
    return transactionPool(
      { rows: [req] },
      { rows: [{ ...req, quote_frozen_at: FROZEN_AT, quote_snapshot: snapshot }] },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [aktivierteZeile("r-up")] },
      { rows: [AENDERUNGS_DOKUMENT] },
      { rows: [] },
      { rows: [] }
    );
  }

  it("ein Aufstieg schreibt den GEWUENSCHTEN Plan in Organisation und Abo", async () => {
    // Schaden bei vertauschten Zweigen: der Kunde zahlt PRO und bekommt PLUS.
    const pool = aufstiegPool();
    const r = await applyApprovedChange(pool, {
      requestId: "r-up", actorUserId: "staff-1", reason: "Freigabe nach Zahlungseingang"
    });

    assert.equal(r.target_plan, "PRO");
    assert.equal(einzigerAufruf(pool, /UPDATE organizations/i, "Organisation").params[1], "PRO");
    assert.deepEqual(einzigerAufruf(pool, /UPDATE subscriptions/i, "Abo").params, ["u1", "PRO"]);
  });

  it("eine Kuendigung behaelt den LAUFENDEN Plan, nicht den Wunschplan", async () => {
    // Ohne diese Probe wuerde eine Kuendigung den Kunden waehrend der
    // Restlaufzeit still auf den Wunschplan (hier DEMO) herunterstufen —
    // er verlaeore bezahlte Funktionen vor dem Kuendigungsdatum.
    const req = {
      id: "r-cancel", status: "accepted", request_type: REQUEST_TYPES.CANCELLATION,
      org_id: "o1", user_id: "u1",
      desired_plan: "DEMO", current_plan: "PRO",
      desired_addons: [{ key: "api" }],
      cancellation_effective_at: CANCEL_AT, effective_from: null
    };
    const pool = transactionPool(
      { rows: [req] },
      { rows: [{ ...req, quote_frozen_at: FROZEN_AT, quote_snapshot: { catalog_version: "test-cat", plan: "PRO" } }] },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [aktivierteZeile("r-cancel")] },
      { rows: [{ id: "doc-kb", document_type: "cancellation_confirmation", document_number: "KB-2026-000003", status: "issued" }] },
      { rows: [] },
      { rows: [] }
    );
    const r = await applyApprovedChange(pool, { requestId: "r-cancel", actorUserId: "staff-1" });

    assert.equal(r.target_plan, "PRO");
    assert.equal(einzigerAufruf(pool, /UPDATE organizations/i, "Organisation").params[1], "PRO");
    // Bei einer Kuendigung werden Zusatzleistungen NICHT nachgezogen, obwohl
    // welche im Wunsch stehen — sonst wuerde die Kuendigung sie neu aktivieren.
    keinAufruf(pool, /org_active_addons/i, "keine Zusatzleistungen bei Kuendigung");
  });

  it("faellt der Wunschplan weg, greift der laufende Plan", async () => {
    const pool = aufstiegPool({ desired_plan: null, current_plan: "PLUS" }, { plan: "PLUS" });
    const r = await applyApprovedChange(pool, { requestId: "r-up", actorUserId: "staff-1" });
    assert.equal(r.target_plan, "PLUS");
  });

  it("faellt bei einer Kuendigung der laufende Plan weg, greift der Wunschplan", async () => {
    const req = {
      id: "r-c2", status: "accepted", request_type: REQUEST_TYPES.CANCELLATION,
      org_id: null, user_id: null,
      desired_plan: "BASIS", current_plan: null,
      cancellation_effective_at: null
    };
    const pool = transactionPool(
      { rows: [req] },
      { rows: [{ ...req, quote_frozen_at: FROZEN_AT, quote_snapshot: { catalog_version: "test-cat", plan: "BASIS" } }] },
      { rows: [aktivierteZeile("r-c2")] },
      { rows: [{ id: "doc-kb2", document_type: "cancellation_confirmation", document_number: "KB-2026-000004", status: "issued" }] },
      { rows: [] },
      { rows: [] }
    );
    const r = await applyApprovedChange(pool, { requestId: "r-c2", actorUserId: "staff-1" });
    assert.equal(r.target_plan, "BASIS");
  });

  it("ein unbekannter Planwert faellt auf DEMO zurueck statt roh durchzuschlagen", async () => {
    const pool = aufstiegPool({ desired_plan: "FANTASIE_TARIF", current_plan: null }, { plan: "DEMO" });
    const r = await applyApprovedChange(pool, { requestId: "r-up", actorUserId: "staff-1" });
    assert.equal(r.target_plan, "DEMO");
  });
});

/* ══════════════════════════════════════════════════════════════
 * 3. Die Schreibvorgaenge — Bindungen und Form
 * ══════════════════════════════════════════════════════════════ */

describe("applyApprovedChange — was genau in die Datenbank gebunden wird", () => {
  it("die Organisationszeile bekommt Plan, Sonderstufe, Kopfzahl und Vertragspreis in dieser Reihenfolge", async () => {
    // Eine vertauschte Bindung setzt hier den Vertragspreis als Mitarbeiterzahl —
    // beides sind Zahlen, kein Datenbankfehler wuerde das melden.
    const req = {
      id: "r-org", status: "accepted", request_type: REQUEST_TYPES.PILOT,
      org_id: "o1", user_id: null,
      desired_plan: "INDIVIDUELL", current_plan: "DEMO",
      desired_individual_tier: "tier_l", employee_count: 250,
      desired_addons: null, cancellation_effective_at: null
    };
    const pool = transactionPool(
      { rows: [req] },
      {
        rows: [{
          ...req, quote_frozen_at: FROZEN_AT,
          quote_snapshot: { catalog_version: "test-cat", plan: "INDIVIDUELL", individual_tier: "tier_s", proposed_price_cents: 129900 }
        }]
      },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [aktivierteZeile("r-org")] },
      { rows: [{ id: "doc-ab3", document_type: "order_confirmation", document_number: "AB-2026-000005", status: "issued" }] },
      { rows: [] },
      { rows: [] }
    );
    await applyApprovedChange(pool, { requestId: "r-org", actorUserId: "staff-1" });

    const org = einzigerAufruf(pool, /UPDATE organizations/i, "Organisation");
    // Die Sonderstufe DES WUNSCHES schlaegt die des Angebotsstands.
    assert.deepEqual(org.params, ["o1", "INDIVIDUELL", "tier_l", 250, 129900]);
    assert.match(org.sql, /WHERE id = \$1/i);
    assert.match(org.sql, /individual_tier_auto = CASE WHEN \$2 = 'INDIVIDUELL' THEN COALESCE\(\$3, individual_tier_auto\) ELSE NULL END/i);
    assert.match(org.sql, /employee_count_approx = COALESCE\(\$4, employee_count_approx\)/i);
    assert.match(org.sql, /feature_bundle = CASE WHEN \$2 = 'INDIVIDUELL' THEN 'enterprise_full' ELSE 'standard' END/i);
    assert.match(org.sql, /billing_mode = CASE WHEN \$2 = 'INDIVIDUELL' THEN 'individual_contract' ELSE 'standard_catalog' END/i);
    assert.match(org.sql, /custom_quote_pending = FALSE/i);
  });

  it("ohne eigene Sonderstufe zaehlt die des eingefrorenen Angebots", async () => {
    const req = {
      id: "r-org2", status: "accepted", request_type: REQUEST_TYPES.PILOT,
      org_id: "o1", user_id: null,
      desired_plan: "INDIVIDUELL", current_plan: "DEMO",
      desired_individual_tier: null, employee_count: null,
      desired_addons: null, cancellation_effective_at: null
    };
    const pool = transactionPool(
      { rows: [req] },
      {
        rows: [{
          ...req, quote_frozen_at: FROZEN_AT,
          quote_snapshot: { catalog_version: "test-cat", plan: "INDIVIDUELL", individual_tier: "tier_s", proposed_price_cents: null }
        }]
      },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [aktivierteZeile("r-org2")] },
      { rows: [{ id: "doc-ab4", document_type: "order_confirmation", document_number: "AB-2026-000006", status: "issued" }] },
      { rows: [] },
      { rows: [] }
    );
    await applyApprovedChange(pool, { requestId: "r-org2", actorUserId: "staff-1" });

    // Kopfzahl und Preis sind nicht bezifferbar -> ausdruecklich null, nicht 0.
    assert.deepEqual(einzigerAufruf(pool, /UPDATE organizations/i, "Organisation").params,
      ["o1", "INDIVIDUELL", "tier_s", null, null]);
  });

  it("das Abo des Eigentuemers bekommt Plan und aktiven Status — und nur die juengste Zeile", async () => {
    const req = {
      id: "r-sub", status: "accepted", request_type: REQUEST_TYPES.DOWNGRADE,
      org_id: null, user_id: "u1",
      desired_plan: "BASIS", current_plan: "PRO",
      desired_addons: null, cancellation_effective_at: null
    };
    const pool = transactionPool(
      { rows: [req] },
      { rows: [{ ...req, quote_frozen_at: FROZEN_AT, quote_snapshot: { catalog_version: "test-cat", plan: "BASIS" } }] },
      { rows: [], rowCount: 1 },
      { rows: [aktivierteZeile("r-sub")] },
      { rows: [AENDERUNGS_DOKUMENT] },
      { rows: [] },
      { rows: [] }
    );
    await applyApprovedChange(pool, { requestId: "r-sub", actorUserId: "staff-1" });

    const sub = einzigerAufruf(pool, /UPDATE subscriptions/i, "Abo");
    assert.deepEqual(sub.params, ["u1", "BASIS"]);
    assert.match(sub.sql, /SET plan = \$2/i);
    assert.match(sub.sql, /status = 'active'/i);
    assert.match(sub.sql, /WHERE user_id = \$1/i);
    assert.match(sub.sql, /ORDER BY created_at DESC\s+LIMIT 1/i);
    assert.doesNotMatch(sub.sql, /canceling/i, "kein Kuendigungszweig bei einem Abstieg");
  });

  it("bei einer Kuendigung wird das Abo auf 'canceling' gesetzt und der Kuendigungstermin gebunden", async () => {
    const req = {
      id: "r-c3", status: "accepted", request_type: REQUEST_TYPES.CANCELLATION,
      org_id: null, user_id: "u1",
      desired_plan: null, current_plan: "PLUS",
      cancellation_effective_at: CANCEL_AT
    };
    const pool = transactionPool(
      { rows: [req] },
      { rows: [{ ...req, quote_frozen_at: FROZEN_AT, quote_snapshot: { catalog_version: "test-cat", plan: "PLUS" } }] },
      { rows: [], rowCount: 1 },
      { rows: [aktivierteZeile("r-c3")] },
      { rows: [{ id: "doc-kb3", document_type: "cancellation_confirmation", document_number: "KB-2026-000005", status: "issued" }] },
      { rows: [] },
      { rows: [] }
    );
    await applyApprovedChange(pool, { requestId: "r-c3", actorUserId: "staff-9" });

    const sub = einzigerAufruf(pool, /UPDATE subscriptions/i, "Abo");
    assert.deepEqual(sub.params, ["u1", CANCEL_AT, "staff-9"]);
    assert.match(sub.sql, /status = 'canceling'/i);
    assert.match(sub.sql, /cancel_at = \$2/i);
    assert.match(sub.sql, /cancel_requested_by = \$3/i);
    assert.doesNotMatch(sub.sql, /SET plan = /i, "eine Kuendigung schreibt keinen Plan ins Abo");
  });

  it("ohne Kuendigungstermin wird das Abo sofort zum Kuendigungszeitpunkt gestellt", async () => {
    // Ein fehlender Termin darf NICHT als NULL in cancel_at landen — dann waere
    // das Abo unbefristet in 'canceling' und niemand wuesste, wann es endet.
    const req = {
      id: "r-c4", status: "accepted", request_type: REQUEST_TYPES.CANCELLATION,
      org_id: null, user_id: "u1",
      desired_plan: null, current_plan: "PLUS",
      cancellation_effective_at: null
    };
    const pool = transactionPool(
      { rows: [req] },
      { rows: [{ ...req, quote_frozen_at: FROZEN_AT, quote_snapshot: { catalog_version: "test-cat", plan: "PLUS" } }] },
      { rows: [], rowCount: 1 },
      { rows: [aktivierteZeile("r-c4")] },
      { rows: [{ id: "doc-kb4", document_type: "cancellation_confirmation", document_number: "KB-2026-000006", status: "issued" }] },
      { rows: [] },
      { rows: [] }
    );
    await applyApprovedChange(pool, { requestId: "r-c4", actorUserId: null });

    const sub = einzigerAufruf(pool, /UPDATE subscriptions/i, "Abo");
    assert.equal(sub.params[0], "u1");
    assert.match(String(sub.params[1]), /^\d{4}-\d{2}-\d{2}T/, "ein echter Zeitstempel, kein null");
    assert.equal(sub.params[2], null);
  });

  it("die Statuszeile wird auf aktiv gesetzt und der Handelnde festgehalten", async () => {
    const pool = transactionPool(
      {
        rows: [{
          id: "r-st", status: "accepted", request_type: REQUEST_TYPES.UPGRADE,
          org_id: null, user_id: null, desired_plan: "PRO", current_plan: "PLUS",
          cancellation_effective_at: null
        }]
      },
      {
        rows: [{
          id: "r-st", quote_frozen_at: FROZEN_AT,
          quote_snapshot: { catalog_version: "test-cat", plan: "PRO" }
        }]
      },
      { rows: [aktivierteZeile("r-st")] },
      { rows: [AENDERUNGS_DOKUMENT] },
      { rows: [] },
      { rows: [] }
    );
    await applyApprovedChange(pool, { requestId: "r-st", actorUserId: "staff-1" });

    const akt = einzigerAufruf(pool, /UPDATE subscription_requests\s+SET status = 'active'/i, "Statuszeile");
    assert.deepEqual(akt.params, ["r-st", "staff-1"]);
    assert.match(akt.sql, /activated_at = NOW\(\)/i);
    // COALESCE schuetzt ein bereits gesetztes Wirksamkeitsdatum vor dem Ueberschreiben.
    assert.match(akt.sql, /effective_from = COALESCE\(effective_from, NOW\(\)\)/i);
    assert.match(akt.sql, /status_updated_by = \$2/i);
    assert.match(akt.sql, /WHERE id = \$1/i);
    assert.match(akt.sql, /RETURNING \*/i);
  });

  it("ohne Organisation wird keine Organisationszeile angefasst", async () => {
    // Schaden ohne diese Probe: ein Update mit id = NULL trifft keine Zeile,
    // der Dienst bricht mit ORG_NOT_FOUND ab — und eine gueltige, rein
    // nutzerbezogene Anfrage waere dauerhaft nicht aktivierbar.
    const req = {
      id: "r-noorg", status: "accepted", request_type: REQUEST_TYPES.UPGRADE,
      org_id: null, user_id: "u1", desired_plan: "PLUS", current_plan: "BASIS",
      desired_addons: [{ key: "api" }], cancellation_effective_at: null
    };
    const pool = transactionPool(
      { rows: [req] },
      { rows: [{ ...req, quote_frozen_at: FROZEN_AT, quote_snapshot: { catalog_version: "test-cat", plan: "PLUS" } }] },
      { rows: [], rowCount: 1 },
      { rows: [aktivierteZeile("r-noorg")] },
      { rows: [AENDERUNGS_DOKUMENT] },
      { rows: [] },
      { rows: [] }
    );
    const r = await applyApprovedChange(pool, { requestId: "r-noorg", actorUserId: "staff-1" });

    assert.equal(r.ok, true);
    keinAufruf(pool, /UPDATE organizations/i, "keine Organisation");
    keinAufruf(pool, /org_active_addons/i, "ohne Organisation keine Zusatzleistungen");
  });

  it("ohne Nutzer wird kein Abo angefasst", async () => {
    const req = {
      id: "r-nouser", status: "accepted", request_type: REQUEST_TYPES.DOWNGRADE,
      org_id: "o1", user_id: null, desired_plan: "BASIS", current_plan: "PRO",
      desired_addons: null, cancellation_effective_at: null
    };
    const pool = transactionPool(
      { rows: [req] },
      { rows: [{ ...req, quote_frozen_at: FROZEN_AT, quote_snapshot: { catalog_version: "test-cat", plan: "BASIS" } }] },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [aktivierteZeile("r-nouser")] },
      { rows: [AENDERUNGS_DOKUMENT] },
      { rows: [] },
      { rows: [] }
    );
    const r = await applyApprovedChange(pool, { requestId: "r-nouser", actorUserId: "staff-1" });

    assert.equal(r.ok, true);
    keinAufruf(pool, /UPDATE subscriptions/i, "kein Abo");
  });
});

/* ══════════════════════════════════════════════════════════════
 * 4. Zusatzleistungen — was bezahlt wurde, muss aktiv werden
 * ══════════════════════════════════════════════════════════════ */

describe("applyApprovedChange — Zusatzleistungen der Organisation", () => {
  const ADDON_REQ = {
    id: "r-addon", status: "accepted", request_type: REQUEST_TYPES.UPGRADE,
    org_id: "o1", user_id: null,
    desired_plan: "INDIVIDUELL", current_plan: "PRO",
    desired_addons: [
      { key: "api" },
      { key: "api" },
      { key: "   " },
      { key: "sonderposten_x", name: "Sonderposten", price_cents: 1234, interval: "onetime" }
    ],
    cancellation_effective_at: null
  };

  function addonPool() {
    return transactionPool(
      { rows: [ADDON_REQ] },
      { rows: [{ ...ADDON_REQ, quote_frozen_at: FROZEN_AT, quote_snapshot: { catalog_version: "test-cat", plan: "INDIVIDUELL" } }] },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [aktivierteZeile("r-addon")] },
      { rows: [AENDERUNGS_DOKUMENT] },
      { rows: [] },
      { rows: [] }
    );
  }

  it("nicht mehr gebuchte Zusatzleistungen werden abgeschaltet, die gebuchten ausgenommen", async () => {
    // Schaden ohne diese Probe: eine abbestellte Zusatzleistung bliebe aktiv —
    // der Kunde nutzt weiter, was er nicht mehr bezahlt.
    const pool = addonPool();
    await applyApprovedChange(pool, { requestId: "r-addon", actorUserId: "staff-1" });

    const ab = einzigerAufruf(pool, /UPDATE org_active_addons/i, "Abschaltung");
    assert.deepEqual(ab.params, ["o1", "staff-1", ["api", "sonderposten_x"]]);
    assert.match(ab.sql, /SET status = 'inactive'/i);
    assert.match(ab.sql, /WHERE org_id = \$1/i);
    assert.match(ab.sql, /AND status = 'active'/i);
    assert.match(ab.sql, /AND NOT \(addon_key = ANY\(\$3::text\[\]\)\)/i);
    assert.match(ab.sql, /deactivated_by = \$2/i);
  });

  it("jede gebuchte Zusatzleistung wird mit Katalogname, Preis und Quelle geschrieben", async () => {
    const pool = addonPool();
    await applyApprovedChange(pool, { requestId: "r-addon", actorUserId: "staff-1" });

    const inserts = alleAufrufe(pool, /INSERT INTO org_active_addons/i);
    // Doppelte Schluessel und leere Schluessel fallen raus — sonst schriebe eine
    // versehentlich doppelte Auswahl die Leistung zweimal in Rechnung.
    assert.equal(inserts.length, 2);

    assert.deepEqual(inserts[0].params, [
      "o1", "api", "API-Zugang & Webhooks", 39900, "monthly",
      "subscription_request", "r-addon", "staff-1",
      JSON.stringify({ source_payload: { key: "api" } })
    ]);
    assert.deepEqual(inserts[1].params, [
      "o1", "sonderposten_x", "Sonderposten", 1234, "onetime",
      "subscription_request", "r-addon", "staff-1",
      JSON.stringify({ source_payload: { key: "sonderposten_x", name: "Sonderposten", price_cents: 1234, interval: "onetime" } })
    ]);
    assert.match(inserts[0].sql, /ON CONFLICT \(org_id, addon_key\) DO UPDATE/i);
    assert.match(inserts[0].sql, /status = 'active'/i);
    assert.match(inserts[0].sql, /deactivated_by = NULL/i);
  });
});

/* ══════════════════════════════════════════════════════════════
 * 5. Abbruchgruende — der Fehlercode, den der Aufrufer sieht
 * ══════════════════════════════════════════════════════════════ */

describe("applyApprovedChange — Abbruch statt halber Aktivierung", () => {
  function codeIst(code) {
    return (err) => {
      assert.equal(err.code, code, `Fehlercode ${code} erwartet, war: ${err.code}`);
      assert.equal(err.message, code);
      return true;
    };
  }

  const BASIS_REQ = {
    id: "r-fail", status: "accepted", request_type: REQUEST_TYPES.UPGRADE,
    org_id: "o1", user_id: "u1", desired_plan: "PRO", current_plan: "PLUS",
    desired_addons: null, cancellation_effective_at: null
  };
  const FROZEN = { ...BASIS_REQ, quote_frozen_at: FROZEN_AT, quote_snapshot: { catalog_version: "test-cat", plan: "PRO" } };

  it("ein nicht einfrierbarer Angebotsstand bricht ab, bevor Plaene geschrieben werden", async () => {
    // Ohne den Snapshot gibt es keine Vertragswahrheit — dann darf auch kein
    // Plan geschrieben werden, sonst weicht die Rechnung vom Angebot ab.
    const pool = transactionPool({ rows: [BASIS_REQ] }, { rows: [] });
    await assert.rejects(
      applyApprovedChange(pool, { requestId: "r-fail", actorUserId: "staff-1" }),
      codeIst("REQUEST_NOT_FOUND")
    );
    keinAufruf(pool, /UPDATE organizations/i, "kein Plan geschrieben");
    assert.ok(pool.calls.some((c) => String(c.sql).trim() === "ROLLBACK"), "zurueckgerollt");
    assert.ok(pool.released, "Verbindung freigegeben");
  });

  it("eine fehlende Organisation bricht ab, statt still weiterzulaufen", async () => {
    const pool = transactionPool(
      { rows: [BASIS_REQ] },
      { rows: [FROZEN] },
      { rows: [], rowCount: 0 }
    );
    await assert.rejects(
      applyApprovedChange(pool, { requestId: "r-fail", actorUserId: "staff-1" }),
      codeIst("ORG_NOT_FOUND")
    );
    keinAufruf(pool, /SET status = 'active'/i, "Anfrage nicht aktiviert");
    assert.ok(pool.calls.some((c) => String(c.sql).trim() === "ROLLBACK"));
  });

  it("ein fehlendes Abo bricht ab, obwohl die Organisation schon geschrieben war", async () => {
    // Genau hierfuer ist die Transaktion da: der Plan der Organisation darf
    // nicht stehen bleiben, wenn das Abo dazu fehlt.
    const pool = transactionPool(
      { rows: [BASIS_REQ] },
      { rows: [FROZEN] },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 0 }
    );
    await assert.rejects(
      applyApprovedChange(pool, { requestId: "r-fail", actorUserId: "staff-1" }),
      codeIst("SUBSCRIPTION_NOT_FOUND")
    );
    keinAufruf(pool, /SET status = 'active'/i, "Anfrage nicht aktiviert");
    assert.ok(pool.calls.some((c) => String(c.sql).trim() === "ROLLBACK"));
  });

  it("schlaegt die Statuszeile fehl, bricht der ganze Vorgang ab", async () => {
    const pool = transactionPool(
      { rows: [BASIS_REQ] },
      { rows: [FROZEN] },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [] }
    );
    await assert.rejects(
      applyApprovedChange(pool, { requestId: "r-fail", actorUserId: "staff-1" }),
      codeIst("REQUEST_UPDATE_FAILED")
    );
    keinAufruf(pool, /INSERT INTO subscription_request_status_history/i, "kein Verlaufseintrag");
    assert.ok(pool.calls.some((c) => String(c.sql).trim() === "ROLLBACK"));
  });

  it("scheitert die Dokumenterzeugung, wird die Aktivierung zurueckgenommen", async () => {
    // Auftrags- und Aenderungsbestaetigung sind Vertragsunterlagen. Eine
    // Aktivierung ohne Beleg waere ein Zustand, den niemand nachweisen kann.
    const pool = transactionPool(
      { rows: [BASIS_REQ] },
      { rows: [FROZEN] },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [aktivierteZeile("r-fail")] },
      { rows: [] },
      { rows: [] }
    );
    await assert.rejects(
      applyApprovedChange(pool, { requestId: "r-fail", actorUserId: "staff-1" }),
      codeIst("REQUEST_NOT_FOUND")
    );
    keinAufruf(pool, /INSERT INTO subscription_request_status_history/i, "kein Verlaufseintrag");
    keinAufruf(pool, /INSERT INTO audit_log/i, "kein Audit-Eintrag");
    assert.ok(pool.calls.some((c) => String(c.sql).trim() === "ROLLBACK"));
  });
});

/* ══════════════════════════════════════════════════════════════
 * 6. Verlauf und Audit — der Nachweis "Wer + Was + Warum"
 * ══════════════════════════════════════════════════════════════ */

describe("applyApprovedChange — Verlaufs- und Audit-Nutzlast", () => {
  it("der Aufstieg hinterlaesst die vollstaendige Nutzlast — und nichts darueber hinaus", async () => {
    const req = {
      id: "r-up", status: "accepted", request_type: REQUEST_TYPES.UPGRADE,
      org_id: "o1", user_id: "u1",
      desired_plan: "PRO", current_plan: "PLUS",
      desired_addons: [{ key: "api" }], employee_count: 42,
      cancellation_effective_at: null, effective_from: null
    };
    const pool = transactionPool(
      { rows: [req] },
      {
        rows: [{
          ...req, quote_frozen_at: FROZEN_AT,
          quote_snapshot: { catalog_version: "test-cat", plan: "PRO", proposed_price_cents: 79900 }
        }]
      },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [aktivierteZeile("r-up")] },
      { rows: [AENDERUNGS_DOKUMENT] },
      { rows: [] },
      { rows: [] }
    );
    const r = await applyApprovedChange(pool, {
      requestId: "r-up", actorUserId: "staff-1", reason: "Freigabe nach Zahlungseingang"
    });

    const erwarteteNutzlast = {
      applied: true,
      target_plan: "PRO",
      request_type: "upgrade",
      cancellation_effective_at: null,
      quote_snapshot_already_frozen: true,
      quote_catalog_version: "test-cat",
      document_type: "change_confirmation",
      document_id: "doc-alt",
      document_number: "AE-2026-000007",
      document_created: false,
      document_already_exists: true,
      active_addons_synced: true,
      active_addons_count: 1
    };

    const h = verlauf(pool);
    assert.deepEqual(h.params.slice(0, 5), ["r-up", "accepted", "active", "staff-1", "Freigabe nach Zahlungseingang"]);
    assert.deepEqual(JSON.parse(h.params[5]), erwarteteNutzlast);
    assert.match(h.sql, /\(request_id, from_status, to_status, changed_by, reason, details\)/i);
    assert.match(h.sql, /VALUES \(\$1, \$2, \$3, \$4, \$5, \$6::jsonb\)/i);

    const a = audit(pool);
    assert.deepEqual(a.params, [
      "staff-1",
      "subscription_request.apply_approved_change",
      "subscription_request",
      "r-up",
      JSON.stringify({ ...erwarteteNutzlast, responsible_actor_user_id: "staff-1" }),
      null, null, null,
      "o1",
      null, null, null, null,
      "APPROVAL", "SUCCESS"
    ]);

    // Gestalt der Antwort: eine Feldprobe sagt, was da sein MUSS — diese sagt
    // zusaetzlich, dass kein weiteres Feld nach aussen dringt.
    assert.deepEqual(r, {
      ok: true,
      row: aktivierteZeile("r-up"),
      target_plan: "PRO",
      quote_snapshot: { catalog_version: "test-cat", plan: "PRO", proposed_price_cents: 79900 },
      quote_already_frozen: true,
      document: {
        id: "doc-alt",
        document_type: "change_confirmation",
        document_number: "AE-2026-000007",
        status: "issued",
        title: "Aenderungsbestaetigung AE-2026-000007",
        issued_at: "2026-08-30T09:00:00.000Z",
        download_available: true,
        created: false,
        already_exists: true
      }
    });
  });

  it("die Kuendigung haelt Termin, fehlende Zusatzleistungs-Synchronisierung und Belegart fest", async () => {
    const req = {
      id: "r-cancel", status: "accepted", request_type: REQUEST_TYPES.CANCELLATION,
      org_id: "o1", user_id: "u1",
      desired_plan: "DEMO", current_plan: "PRO",
      desired_addons: [{ key: "api" }],
      cancellation_effective_at: CANCEL_AT
    };
    const pool = transactionPool(
      { rows: [req] },
      { rows: [{ ...req, quote_frozen_at: FROZEN_AT, quote_snapshot: { catalog_version: "kat-9", plan: "PRO" } }] },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [aktivierteZeile("r-cancel")] },
      { rows: [{ id: "doc-kb", document_type: "cancellation_confirmation", document_number: "KB-2026-000003", status: "issued" }] },
      { rows: [] },
      { rows: [] }
    );
    await applyApprovedChange(pool, { requestId: "r-cancel", actorUserId: "staff-1" });

    assert.deepEqual(JSON.parse(verlauf(pool).params[5]), {
      applied: true,
      target_plan: "PRO",
      request_type: "cancellation",
      cancellation_effective_at: CANCEL_AT,
      quote_snapshot_already_frozen: true,
      quote_catalog_version: "kat-9",
      document_type: "cancellation_confirmation",
      document_id: "doc-kb",
      document_number: "KB-2026-000003",
      document_created: false,
      document_already_exists: true,
      // Bei einer Kuendigung werden Zusatzleistungen weder gezaehlt noch gezogen.
      active_addons_synced: false,
      active_addons_count: null
    });
  });

  it("ohne Organisation steht im Verlauf ausdruecklich, dass nichts synchronisiert wurde", async () => {
    const req = {
      id: "r-noorg", status: "accepted", request_type: REQUEST_TYPES.UPGRADE,
      org_id: null, user_id: "u1", desired_plan: "PLUS", current_plan: "BASIS",
      desired_addons: [{ key: "api" }, { key: "spend" }], cancellation_effective_at: null
    };
    const pool = transactionPool(
      { rows: [req] },
      { rows: [{ ...req, quote_frozen_at: FROZEN_AT, quote_snapshot: { catalog_version: "test-cat", plan: "PLUS" } }] },
      { rows: [], rowCount: 1 },
      { rows: [aktivierteZeile("r-noorg")] },
      { rows: [AENDERUNGS_DOKUMENT] },
      { rows: [] },
      { rows: [] }
    );
    await applyApprovedChange(pool, { requestId: "r-noorg", actorUserId: "staff-1" });

    const nutzlast = JSON.parse(verlauf(pool).params[5]);
    assert.equal(nutzlast.active_addons_synced, null);
    // Gezaehlt wird trotzdem: der Wunsch enthielt zwei Zusatzleistungen, sie
    // wurden aber mangels Organisation nirgends aktiviert. Genau diese Luecke
    // soll der Verlauf sichtbar machen.
    assert.equal(nutzlast.active_addons_count, 2);

    // Ohne Organisation bleibt das Audit-Feld org_id leer statt zu raten.
    assert.equal(audit(pool).params[8], null);
  });

  it("ohne mitgegebene Begruendung steht der Standardgrund im Verlauf", async () => {
    // Ein leerer Grund waere ein Verlaufseintrag ohne Warum — genau das, was
    // die Audit-Pflicht verhindern soll.
    const req = {
      id: "r-ohne-grund", status: "accepted", request_type: REQUEST_TYPES.UPGRADE,
      org_id: null, user_id: null, desired_plan: "PRO", current_plan: "PLUS",
      cancellation_effective_at: null
    };
    const pool = transactionPool(
      { rows: [req] },
      { rows: [{ ...req, quote_frozen_at: FROZEN_AT, quote_snapshot: { catalog_version: "test-cat", plan: "PRO" } }] },
      { rows: [aktivierteZeile("r-ohne-grund")] },
      { rows: [AENDERUNGS_DOKUMENT] },
      { rows: [] },
      { rows: [] }
    );
    await applyApprovedChange(pool, { requestId: "r-ohne-grund", actorUserId: null });

    assert.equal(verlauf(pool).params[4], "apply_approved_change");
    // Ohne Handelnden bleibt der Verantwortliche ausdruecklich leer — das
    // unterscheidet einen Systemlauf von einem vergessenen Feld.
    assert.equal(audit(pool).params[0], null);
    assert.equal(JSON.parse(audit(pool).params[4]).responsible_actor_user_id, null);
  });

  it("ein frisch eingefrorener Angebotsstand wird als NICHT vorbestehend vermerkt", async () => {
    const req = {
      id: "r-frisch", status: "accepted", request_type: REQUEST_TYPES.UPGRADE,
      org_id: "o1", user_id: null, desired_plan: "PRO", current_plan: "PLUS",
      desired_addons: null, proposed_price_cents: 129900,
      quote_frozen_at: null, quote_snapshot: null,
      cancellation_effective_at: null
    };
    const pool = transactionPool(
      { rows: [req] },
      { rows: [req] },                       // freezeQuoteSnapshot: noch nicht gefroren
      { rows: [{ ...req }] },                // das Einfrieren selbst
      { rows: [] },                          // Audit "quote_frozen"
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [aktivierteZeile("r-frisch")] },
      { rows: [AENDERUNGS_DOKUMENT] },
      { rows: [] },
      { rows: [] }
    );
    const r = await applyApprovedChange(pool, { requestId: "r-frisch", actorUserId: "staff-1" });

    assert.equal(r.quote_already_frozen, false);
    const nutzlast = JSON.parse(verlauf(pool).params[5]);
    assert.equal(nutzlast.quote_snapshot_already_frozen, false);
    assert.equal(nutzlast.quote_catalog_version, CATALOG_VERSION);
    // Der Vertragspreis wandert aus dem frisch gebauten Angebot in die Organisation.
    assert.equal(einzigerAufruf(pool, /UPDATE organizations/i, "Organisation").params[4], 129900);
    assert.equal(alleAufrufe(pool, /INSERT INTO audit_log/i).length, 2, "Einfrieren und Anwenden werden getrennt protokolliert");
  });

  it("ein neu erzeugter Beleg wird als neu vermerkt, nicht als vorbestehend", async () => {
    const req = {
      id: "r-neu", status: "accepted", request_type: REQUEST_TYPES.UPGRADE,
      org_id: "o1", user_id: null,
      desired_plan: "PRO", current_plan: "PLUS",
      contact_email: "owner@acme.de", desired_addons: null,
      cancellation_effective_at: null,
      quote_frozen_at: FROZEN_AT,
      quote_snapshot: { catalog_version: "test-cat", plan: "PRO", proposed_price_cents: 79900 }
    };
    const neuerBeleg = {
      id: "doc-neu", document_type: "change_confirmation",
      document_number: "AE-2026-000007", status: "issued",
      title: "Aenderungsbestaetigung", issued_at: "2026-08-30T09:30:00.000Z"
    };
    const pool = transactionPool(
      { rows: [req] },
      { rows: [req] },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [aktivierteZeile("r-neu")] },
      { rows: [] },                            // kein bestehender Beleg
      { rows: [{ ...req, org_name: "ACME" }] }, // Snapshot fuer die Erzeugung
      { rows: [{ n: 7 }] },                     // Nummernkreis
      { rows: [neuerBeleg] },                   // Ablage
      { rows: [] },                             // Vorgaenger auf 'superseded'
      { rows: [] },
      { rows: [] }
    );
    const r = await applyApprovedChange(pool, { requestId: "r-neu", actorUserId: "staff-1" });

    assert.equal(r.document.created, true);
    assert.equal(r.document.already_exists, false);
    const nutzlast = JSON.parse(verlauf(pool).params[5]);
    assert.equal(nutzlast.document_created, true);
    assert.equal(nutzlast.document_already_exists, false);
    assert.equal(nutzlast.document_id, "doc-neu");
    assert.equal(nutzlast.document_number, "AE-2026-000007");

    const suche = einzigerAufruf(pool, /FROM subscription_documents/i, "Beleg-Suche");
    assert.deepEqual(suche.params, ["r-neu", "change_confirmation"]);
    assert.match(suche.sql, /status = 'issued'/i);
    const ablage = einzigerAufruf(pool, /INSERT INTO subscription_documents/i, "Beleg-Ablage");
    assert.equal(ablage.params[0], "change_confirmation");
    assert.match(String(ablage.params[1]), /^AE-\d{4}-000007$/);
  });
});
