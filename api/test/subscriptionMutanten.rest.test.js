/**
 * Buendel "rest" — Lesepfade, Verlaufsschreibung, Zusatzleistungen und die
 * Downgrade-Vorschau des Abo-Aenderungsdienstes.
 *
 * WARUM ES DIESE DATEI GIBT
 * Der Mutationslauf vom 2026-09-01 hat `services/subscriptionRequestService.js`
 * bei 43,51 % Punktzahl gemessen; 548 von 970 Mutanten haben ueberlebt. Die
 * Owner-Vorgabe lautet 90 % je Bereich. Diese Datei nimmt sich die 89
 * ueberlebenden Mutanten des Buendels "rest" vor:
 *   previewDowngradeImpact, applyImpactMetric, syncOrgActiveAddons,
 *   formatDocumentResult, hasOpenRequest, insertHistory,
 *   activationDocumentType, getRequest, listOpenForOrg, listHistory.
 *
 * WAS HIER AUF DEM SPIEL STEHT
 *   1. Die vier Lesepfade (getRequest, listOpenForOrg, hasOpenRequest,
 *      listHistory) binden Organisation und Nutzer selbst in die Abfrage. Eine
 *      verlorene oder vertauschte Bindung liefert die Anfragen einer FREMDEN
 *      Organisation zurueck — das ist kein Formfehler, sondern ein Datenleck.
 *      Faellt in hasOpenRequest der Zustandsfilter weg, blockiert eine laengst
 *      abgelehnte Altanfrage jede neue Anfrage des Kunden (oder umgekehrt:
 *      derselbe Wunsch laesst sich beliebig oft doppelt einreichen).
 *   2. insertHistory ist der Nachweis "Wer + Was + Warum". Kippt die
 *      Rueckfallkette, steht statt einer handelnden Person `undefined` in der
 *      Spalte oder die Nutzlast des Zustandswechsels verschwindet — ein
 *      Tarifwechsel ohne nachvollziehbaren Ausloeser.
 *   3. syncOrgActiveAddons entscheidet, welche Zusatzleistungen eine
 *      Organisation nach der Aktivierung wirklich hat. Leere Schluesselliste
 *      heisst: ALLE bisherigen Zusatzleistungen werden abgeschaltet. Fehlender
 *      INSERT heisst: der Kunde zahlt fuer etwas, das er nicht bekommt.
 *   4. previewDowngradeImpact/applyImpactMetric sagen dem Kunden vor dem
 *      Herabstufen, was er verliert, und sperren den Wechsel bei zu vielen
 *      Nutzern. Ein Flip macht aus einer harten Sperre eine weiche — der
 *      Kunde stuft ab und verliert Nutzerkonten. Wird der Zielplan nicht an
 *      die Verbrauchsrechnung durchgereicht, wird gegen die FALSCHEN Grenzen
 *      geprueft und die Vorschau luegt.
 *   5. activationDocumentType/formatDocumentResult bestimmen, welches Dokument
 *      der Kunde nach der Aktivierung bekommt und ob es als neu erzeugt oder
 *      als bereits vorhanden gemeldet wird — Grundlage der Belegkette.
 *
 * WAS HIER BEWUSST NICHT GEPRUEFT WIRD
 *   - Zeile 621: `req?.request_type` → `req.request_type`. Die einzige
 *     Aufrufstelle (Zeile 868) liegt hinter dem `if (!req) return ...`-Schutz;
 *     `req` ist dort nie null. Gleichwertiger Mutant.
 *   - Zeile 628: der leergezogene `case REQUEST_TYPES.PILOT:` faellt auf
 *     `default:` durch, und `default:` liefert denselben Wert
 *     ("order_confirmation"). Gleichwertiger Mutant.
 *   - Zeile 609: `details || {}` → `details`. Keine der acht Aufrufstellen von
 *     insertHistory laesst `details` weg; ueberall steht ein Objektliteral.
 *     Gleichwertiger Mutant. (`details || {}` → `{}` dagegen NICHT — der wird
 *     unten getoetet.)
 *   - Zeile 636: `result?.row` → `result.row`. Beide Aufrufstellen rufen
 *     formatDocumentResult nur ueber `document ? ... : null` auf; `result` ist
 *     nie null. Gleichwertiger Mutant.
 *   - Zeile 659: `PLAN_LIMITS[tgt] || ...` → `PLAN_LIMITS[tgt]`. `normalizePlan`
 *     liefert ausschliesslich kanonische Planschluessel, und fuer jeden davon
 *     gibt es einen Eintrag in PLAN_LIMITS. Gleichwertiger Mutant.
 *   - Zeile 690/691: der Mutant `Array.isArray(...)` → `true` auf `inTgt`
 *     (Zeile 691, ConditionalExpression→true) fehlt in der Ueberlebensliste;
 *     der hier getoetete Rest der Zeile deckt die Regel vollstaendig ab.
 *   - Zeile 940, dritter Mutant (`limit == null` → `false`): ein Grenzwert
 *     `null` entsteht nur, wenn die Verbrauchsrechnung gar keine Kennzahl
 *     liefert — dann ist der Zaehler 0 und `0 <= Number(null)` greift ohnehin.
 *     Ueber echte Eingaben nicht unterscheidbar. Gleichwertiger Mutant.
 *   - Zeile 1001, `addon.metadata || {}` → `addon.metadata`: normalizeAddonList
 *     setzt `metadata` immer auf ein Objekt. Gleichwertiger Mutant.
 *   - Protokolltexte auf Erfolgspfaden werden nicht festgenagelt; die
 *     Protokoll-Nutzlast beim Zustandswechsel dagegen schon.
 *
 * NACHWEIS
 * 33 der hier abgedeckten Mutanten wurden einzeln in die Quelle zurueck-
 * gesetzt (Mandantengrenze, Bindungen, Zielplan-Durchreichung, harte Sperre,
 * Zusatzleistungen, Verlaufs-Nutzlast, Belegart und Belegmeldung); jeder hat
 * diese Datei rot gemacht, jede Aenderung wurde sofort zurueckgenommen.
 *
 * DB-frei (Muster-Pool, gebaut wie in test/subscriptionRequestService.test.js
 * bzw. test/subscriptionRequests.routes.test.js).
 * Run: node --test --test-force-exit test/subscriptionMutanten.rest.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  getRequest,
  listOpenForOrg,
  hasOpenRequest,
  listHistory,
  previewDowngradeImpact,
  applyApprovedChange,
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
        throw new Error(`Unexpected query #${idx + 1}: ${String(sql).slice(0, 80)}`);
      }
      const resp = responses[idx++];
      if (resp instanceof Error) throw resp;
      return resp;
    }
  };
}

/* ── Transaktions-Pool: gleiche Bauart wie subscriptionRequests.routes.test.js ── */

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

/** Abfrageform woertlich vergleichbar machen, ohne Einrueckung mitzupruefen. */
function norm(sql) {
  return String(sql).replace(/\s+/g, " ").trim();
}

/** Die sechs offenen Zustaende in genau der Reihenfolge, in der OPEN sie fuehrt. */
const OFFENE_ZUSTAENDE = [
  "draft", "submitted", "under_review", "needs_clarification", "offered", "accepted"
];

/**
 * Antwortfolge fuer getUsageAgainstLimits(): Organisationszeile, aktive
 * Zusatzleistungen, dann die fuenf Zaehler in der Reihenfolge, in der
 * loadQuotaUsage sie abfeuert, und zuletzt die Eigentuemersuche (leer, damit
 * keine weiteren Kontingent-Abfragen folgen).
 */
function verbrauchsAntworten({
  plan = "PLUS",
  users = 1,
  sites = 1,
  listings = 0,
  suppliers = 0,
  multiOrgSlots = 1
} = {}) {
  return [
    { rows: [{
      id: "org-1", name: "ACME", type: "company", plan,
      pilot_status: null, has_used_pilot: false,
      pilot_started_at: null, pilot_ended_at: null, converted_at: null,
      feature_bundle: "standard", account_type: "live",
      individual_tier_auto: null, employee_count_approx: null,
      billing_mode: null, customer_stage: "regular",
      parent_org_id: null, is_active: true,
      access_suspended_at: null, access_suspended_reason: null, access_suspended_kind: null,
      custom_limit_users: null, custom_limit_sites: null, custom_limit_listings: null,
      custom_limit_suppliers: null, custom_limit_multi_org_slots: null
    }] },
    { rows: [] },
    { rows: [{ cnt: users }] },
    { rows: [{ cnt: sites }] },
    { rows: [{ cnt: listings }] },
    { rows: [{ cnt: suppliers }] },
    { rows: [{ cnt: multiOrgSlots }] },
    { rows: [] }
  ];
}

/* ══════════════════════════════════════════════════════════════
 * 1. Lesepfade — die Mandantengrenze steckt in der Bindung
 * ══════════════════════════════════════════════════════════════ */

describe("getRequest", () => {
  it("liest genau die eine Anfrage, deren Kennung uebergeben wurde", async () => {
    // Faellt die Bindung weg oder wird der Abfragetext leer, trifft die Abfrage
    // eine beliebige oder gar keine Zeile — beides gibt fremde Vertragsdaten
    // heraus oder verschluckt die eigenen.
    const zeile = { id: "req-1", status: "submitted", org_id: "org-1" };
    const pool = sequencePool({ rows: [zeile] });

    const r = await getRequest(pool, "req-1");

    assert.deepEqual(r, zeile);
    assert.equal(pool.calls.length, 1);
    assert.equal(norm(pool.calls[0].sql), "SELECT * FROM subscription_requests WHERE id = $1");
    assert.deepEqual(pool.calls[0].params, ["req-1"]);
  });

  it("eine unbekannte Kennung liefert null, nicht undefined", async () => {
    const pool = sequencePool({ rows: [] });
    const r = await getRequest(pool, "gibt-es-nicht");
    assert.equal(r, null);
  });
});

describe("listOpenForOrg", () => {
  it("liefert nur die offenen Anfragen der eigenen Organisation, neueste zuerst", async () => {
    // Ohne den Zustandsfilter erschienen abgelehnte und gekuendigte Anfragen
    // wieder als offen; ohne die Organisationsbindung die Anfragen aller Kunden.
    const pool = sequencePool({ rows: [{ id: "r1" }, { id: "r2" }] });

    const rows = await listOpenForOrg(pool, "org-1");

    assert.deepEqual(rows, [{ id: "r1" }, { id: "r2" }]);
    assert.equal(pool.calls.length, 1);
    assert.equal(
      norm(pool.calls[0].sql),
      "SELECT * FROM subscription_requests WHERE org_id = $1 AND status = ANY($2::text[]) ORDER BY created_at DESC"
    );
    assert.deepEqual(pool.calls[0].params, ["org-1", OFFENE_ZUSTAENDE]);
  });
});

describe("listHistory", () => {
  it("liest den Verlauf einer Anfrage zeitlich aufsteigend", async () => {
    // Aufsteigend ist Bedingung: der Verlauf wird als Kette gelesen, eine
    // umgekehrte Reihenfolge verdreht Ursache und Wirkung im Nachweis.
    const pool = sequencePool({ rows: [{ id: "h1", from_status: null, to_status: "submitted" }] });

    const rows = await listHistory(pool, "r1");

    assert.deepEqual(rows, [{ id: "h1", from_status: null, to_status: "submitted" }]);
    assert.equal(
      norm(pool.calls[0].sql),
      "SELECT id, from_status, to_status, changed_by, reason, details, created_at " +
      "FROM subscription_request_status_history WHERE request_id = $1 ORDER BY created_at ASC"
    );
    assert.deepEqual(pool.calls[0].params, ["r1"]);
  });
});

describe("hasOpenRequest", () => {
  it("nur Organisation gesetzt: Zustandsliste und Organisation binden, sonst nichts", async () => {
    // Ein zusaetzlich angehaengter Nutzer- oder Typfilter mit dem Wert
    // `undefined` liefert stumm nie einen Treffer — der Doppel-Anfrage-Schutz
    // waere abgeschaltet.
    const pool = sequencePool({ rows: [{}] });

    const has = await hasOpenRequest(pool, { orgId: "org-1" });

    assert.equal(has, true);
    assert.equal(
      norm(pool.calls[0].sql),
      "SELECT 1 FROM subscription_requests WHERE status = ANY($1::text[]) AND org_id = $2 LIMIT 1"
    );
    assert.deepEqual(pool.calls[0].params, [OFFENE_ZUSTAENDE, "org-1"]);
  });

  it("nur Nutzer gesetzt: der Nutzerfilter greift, der Organisationsfilter fehlt", async () => {
    const pool = sequencePool({ rows: [] });

    const has = await hasOpenRequest(pool, { userId: "u-1" });

    assert.equal(has, false);
    assert.equal(
      norm(pool.calls[0].sql),
      "SELECT 1 FROM subscription_requests WHERE status = ANY($1::text[]) AND user_id = $2 LIMIT 1"
    );
    assert.deepEqual(pool.calls[0].params, [OFFENE_ZUSTAENDE, "u-1"]);
  });

  it("alle drei Filter binden in der Reihenfolge Typ, Organisation, Nutzer", async () => {
    // Eine vertauschte Bindung waere hier kein Formfehler: die Kennung einer
    // fremden Organisation landete in der Nutzerspalte und umgekehrt.
    const pool = sequencePool({ rows: [{}] });

    const has = await hasOpenRequest(pool, {
      orgId: "org-1", userId: "u-1", requestType: "upgrade"
    });

    assert.equal(has, true);
    assert.equal(
      norm(pool.calls[0].sql),
      "SELECT 1 FROM subscription_requests WHERE status = ANY($1::text[]) " +
      "AND request_type = $2 AND org_id = $3 AND user_id = $4 LIMIT 1"
    );
    assert.deepEqual(pool.calls[0].params, [OFFENE_ZUSTAENDE, "upgrade", "org-1", "u-1"]);
  });

  it("ohne Organisation und ohne Nutzer wird gar nicht erst gefragt", async () => {
    const pool = sequencePool();
    assert.equal(await hasOpenRequest(pool, {}), false);
    assert.equal(pool.calls.length, 0);
  });
});

/* ══════════════════════════════════════════════════════════════
 * 2. Downgrade-Vorschau — was der Kunde verliert und was ihn sperrt
 * ══════════════════════════════════════════════════════════════ */

describe("previewDowngradeImpact — Vorschau ohne Organisation", () => {
  it("ohne Organisation steht die Zielgrenze fuer Angebote schon fest, und nichts ist gesperrt", async () => {
    // Die oeffentliche Vorschau (noch kein Konto) darf keine Datenbank
    // anfassen und muss trotzdem die echte Angebotsgrenze des Zielplans
    // nennen — BASIS erlaubt 5, nicht 0. Und sie darf nichts als gesperrt
    // oder verloren melden, was niemand geprueft hat.
    const pool = sequencePool();

    const r = await previewDowngradeImpact(pool, {
      orgId: null, currentPlan: "PRO", desiredPlan: "BASIS"
    });

    assert.equal(pool.calls.length, 0);
    assert.deepEqual(r, {
      current_plan: "PRO",
      desired_plan: "BASIS",
      users_count: 0,
      users_limit_after: null,
      sites_count: 0,
      sites_limit_after: null,
      listings_count: 0,
      listings_limit_after: 5,
      suppliers_count: 0,
      suppliers_limit_after: null,
      multi_org_slots_count: 0,
      multi_org_slots_limit_after: null,
      features_lost: [],
      blocking_processes: [],
      hard_blocking_processes: [],
      blocked: false
    });
  });
});

describe("previewDowngradeImpact — harte und weiche Sperren", () => {
  it("zu viele Nutzer sind eine HARTE Sperre und werden gegen den ZIELplan gerechnet", async () => {
    // Die Organisation faehrt heute PRO (25 Nutzer erlaubt) und will auf BASIS
    // (3 erlaubt). Wird der Zielplan nicht an die Verbrauchsrechnung
    // durchgereicht, prueft die Vorschau gegen 25 statt 3 und meldet freie
    // Fahrt — der Kunde stuft ab und vier Nutzerkonten fallen weg.
    // Und: Nutzer sind hart. Landen sie in der weichen Liste, laesst sich die
    // Sperre mit einem Haken "verstanden" uebergehen.
    const pool = sequencePool(
      ...verbrauchsAntworten({ plan: "PRO", users: 7, sites: 1, listings: 2, suppliers: 0, multiOrgSlots: 1 })
    );

    const r = await previewDowngradeImpact(pool, {
      orgId: "org-1", currentPlan: "PRO", desiredPlan: "BASIS"
    });

    assert.equal(r.users_count, 7);
    assert.equal(r.users_limit_after, 3);
    assert.deepEqual(r.hard_blocking_processes, [
      { kind: "users_over_limit", current: 7, limit_after: 3 }
    ]);
    assert.deepEqual(r.blocking_processes, []);
    assert.equal(r.hard_blocked, true);
    assert.equal(r.blocked, true);
  });

  it("jede Kennzahl landet unter ihrem eigenen Namen, und Lieferanten sind nur eine weiche Sperre", async () => {
    // Fuenf Kennzahlen, fuenf verschiedene Zahlen: waere der Name einer
    // Kennzahl leer oder vertauscht, zeigte die Vorschau dem Kunden die
    // Belegung einer anderen Groesse an. Lieferanten ueber der Grenze sind
    // bewusst weich — sie duerfen den Wechsel nicht hart blockieren.
    const pool = sequencePool(
      ...verbrauchsAntworten({ plan: "PRO", users: 4, sites: 2, listings: 7, suppliers: 2, multiOrgSlots: 1 })
    );

    const r = await previewDowngradeImpact(pool, {
      orgId: "org-1", currentPlan: "PRO", desiredPlan: "PLUS"
    });

    assert.equal(r.users_count, 4);
    assert.equal(r.users_limit_after, 10);
    assert.equal(r.sites_count, 2);
    assert.equal(r.sites_limit_after, 3);
    assert.equal(r.listings_count, 7);
    assert.equal(r.listings_limit_after, 20);
    assert.equal(r.suppliers_count, 2);
    assert.equal(r.suppliers_limit_after, 0);
    assert.equal(r.multi_org_slots_count, 1);
    assert.equal(r.multi_org_slots_limit_after, 1);

    assert.deepEqual(r.blocking_processes, [
      { kind: "suppliers_over_limit", current: 2, limit_after: 0 }
    ]);
    assert.deepEqual(r.hard_blocking_processes, []);
    assert.equal(r.hard_blocked, false);
    assert.equal(r.blocked, true);

    // Gestalt: kein Feld darf unter einem Fremdnamen zusaetzlich auftauchen.
    assert.deepEqual(Object.keys(r).sort(), [
      "blocked", "blocking_processes", "current_plan", "desired_plan",
      "features_lost", "hard_blocked", "hard_blocking_processes",
      "listings_count", "listings_limit_after",
      "multi_org_slots_count", "multi_org_slots_limit_after",
      "sites_count", "sites_limit_after",
      "suppliers_count", "suppliers_limit_after",
      "users_count", "users_limit_after"
    ]);
  });

  it("eine unbegrenzte Zielgrenze (-1) ist nie eine Ueberschreitung", async () => {
    // PRO erlaubt unbegrenzt viele Angebote. Wuerde -1 als Zahl gegen den
    // Zaehler verglichen, waere jeder Kunde mit mindestens einem Angebot
    // gesperrt — ein Wechsel, den niemand mehr durchfuehren koennte.
    const pool = sequencePool(
      ...verbrauchsAntworten({ plan: "INDIVIDUELL", users: 2, sites: 1, listings: 40, suppliers: 0, multiOrgSlots: 1 })
    );

    const r = await previewDowngradeImpact(pool, {
      orgId: "org-1", currentPlan: "INDIVIDUELL", desiredPlan: "PRO"
    });

    assert.equal(r.listings_count, 40);
    assert.equal(r.listings_limit_after, -1);
    assert.deepEqual(r.blocking_processes, []);
    assert.deepEqual(r.hard_blocking_processes, []);
    assert.equal(r.blocked, false);
    assert.equal(r.hard_blocked, false);
  });

  it("eine unbekannte Organisation liefert eine leere Vorschau statt eines Absturzes", async () => {
    // Zero-State statt Fehler: findet die Verbrauchsrechnung die Organisation
    // nicht, fehlt JEDE Kennzahl. Die Vorschau muss das aushalten und darf
    // weder werfen noch eine Sperre erfinden.
    const pool = sequencePool({ rows: [] });

    const r = await previewDowngradeImpact(pool, {
      orgId: "gibt-es-nicht", currentPlan: "PRO", desiredPlan: "BASIS"
    });

    assert.equal(pool.calls.length, 1);
    assert.equal(r.users_count, 0);
    assert.equal(r.users_limit_after, null);
    assert.equal(r.sites_count, 0);
    assert.equal(r.sites_limit_after, null);
    assert.deepEqual(r.blocking_processes, []);
    assert.deepEqual(r.hard_blocking_processes, []);
    assert.equal(r.blocked, false);
    assert.equal(r.hard_blocked, false);
  });
});

describe("previewDowngradeImpact — Funktionsverlust", () => {
  it("verloren geht nur, was der heutige Plan kann und der Zielplan nicht", async () => {
    // BASIS -> PLUS: die einzige Faehigkeit, die BASIS hat und PLUS nicht,
    // ist der Altzugang. Waere die Regel weiter gefasst, bekaeme der Kunde
    // eine Verlustliste voller Dinge, die er nie hatte — und ein Kunde, der
    // eine falsche Verlustliste sieht, storniert.
    const pool = sequencePool(
      ...verbrauchsAntworten({ plan: "BASIS", users: 1, sites: 1, listings: 1, suppliers: 0, multiOrgSlots: 1 })
    );

    const r = await previewDowngradeImpact(pool, {
      orgId: "org-1", currentPlan: "BASIS", desiredPlan: "PLUS"
    });

    assert.deepEqual(r.features_lost, ["legacy_access"]);
  });

  it("was der Zielplan weiterhin kann, steht nicht in der Verlustliste", async () => {
    // Gegenprobe von der anderen Seite: PLUS -> BASIS verliert die
    // Stundenzettel, aber der Altzugang gehoert zu BASIS und bleibt.
    const pool = sequencePool(
      ...verbrauchsAntworten({ plan: "PLUS", users: 2, sites: 1, listings: 1, suppliers: 0, multiOrgSlots: 1 })
    );

    const r = await previewDowngradeImpact(pool, {
      orgId: "org-1", currentPlan: "PLUS", desiredPlan: "BASIS"
    });

    assert.ok(r.features_lost.includes("timesheets"), "Stundenzettel gibt es in BASIS nicht");
    assert.ok(
      !r.features_lost.includes("legacy_access"),
      "der Altzugang gehoert zu BASIS und darf nicht als Verlust gemeldet werden"
    );
    assert.ok(
      !r.features_lost.includes("approval_workflows"),
      "Freigabe-Workflows hatte PLUS nie — sie koennen nicht verloren gehen"
    );
  });
});

/* ══════════════════════════════════════════════════════════════
 * 3. Aktivierung — Zusatzleistungen, Beleg und Verlaufseintrag
 * ══════════════════════════════════════════════════════════════ */

/** Eine bereits angenommene Anfrage mit eingefrorenem Angebot. */
function angenommeneAnfrage(extras = {}) {
  return {
    id: "r-addon",
    status: "accepted",
    request_type: "upgrade",
    org_id: "o1",
    user_id: null,
    desired_plan: "PRO",
    current_plan: "PLUS",
    desired_addons: [],
    desired_features: [],
    cancellation_effective_at: null,
    effective_from: null,
    employee_count: null,
    quote_frozen_at: "2026-08-01T00:00:00.000Z",
    quote_snapshot: { catalog_version: "test-cat", plan: "PRO" },
    quote_catalog_version: "test-cat",
    ...extras
  };
}

const MULTITENANT = {
  key: "multitenant",
  name: "Multi-Mandanten (Konzern)",
  price_cents: 79900,
  interval: "monthly"
};

const VORHANDENER_BELEG = {
  id: "doc-1",
  document_type: "change_confirmation",
  document_number: "AE-2026-000007",
  status: "issued"
};

describe("Zusatzleistungen bei der Aktivierung", () => {
  it("nicht mehr gewuenschte Zusatzleistungen werden abgeschaltet, die gewuenschte eingetragen", async () => {
    // Die Abschalt-Abfrage traegt die Mandantengrenze ($1) UND die Liste der
    // Schluessel, die ueberleben sollen ($3). Ist die Liste leer, schaltet der
    // Lauf ALLE aktiven Zusatzleistungen der Organisation ab — der Kunde zahlt
    // weiter und bekommt nichts. Fehlt der Eintrag, ist es umgekehrt.
    const req = angenommeneAnfrage({ desired_addons: [MULTITENANT] });
    const pool = transactionPool(
      { rows: [req] },                                   // 1 Anfrage lesen
      { rows: [req] },                                   // 2 Angebot bereits eingefroren
      { rows: [], rowCount: 1 },                         // 3 organizations
      { rows: [], rowCount: 1 },                         // 4 Zusatzleistungen abschalten
      { rows: [], rowCount: 1 },                         // 5 Zusatzleistung eintragen
      { rows: [{ id: "r-addon", status: "active" }] },   // 6 Anfrage auf aktiv
      { rows: [VORHANDENER_BELEG] },                     // 7 Beleg existiert schon
      { rows: [] },                                      // 8 Verlaufseintrag
      { rows: [] }                                       // 9 Audit
    );

    const r = await applyApprovedChange(pool, { requestId: "r-addon", actorUserId: "staff-1" });
    assert.equal(r.ok, true);

    // BEGIN steht auf Index 0; die Reihenfolge ist Teil der Aussage.
    assert.equal(pool.calls.length, 11, "BEGIN + neun Abfragen + COMMIT");

    const abschalten = pool.calls[4];
    assert.equal(
      norm(abschalten.sql),
      "UPDATE org_active_addons SET status = 'inactive', deactivated_by = $2, " +
      "deactivated_at = NOW(), updated_at = NOW() WHERE org_id = $1 AND status = 'active' " +
      "AND NOT (addon_key = ANY($3::text[]))"
    );
    assert.deepEqual(abschalten.params, ["o1", "staff-1", ["multitenant"]]);

    const eintragen = pool.calls[5];
    assert.match(eintragen.sql, /INSERT INTO org_active_addons/);
    assert.match(eintragen.sql, /ON CONFLICT \(org_id, addon_key\) DO UPDATE/);
    assert.match(eintragen.sql, /deactivated_by = NULL/);
    assert.deepEqual(eintragen.params, [
      "o1",
      "multitenant",
      "Multi-Mandanten (Konzern)",
      79900,
      "monthly",
      "subscription_request",
      "r-addon",
      "staff-1",
      JSON.stringify({ source_payload: MULTITENANT })
    ]);
  });

  it("ohne handelnde Person steht in beiden Zusatzleistungs-Abfragen null, nicht undefined", async () => {
    // `undefined` als Bindung ist kein Ersatz fuer null: Postgres nimmt es
    // zwar an, aber der Nachweis, dass niemand namentlich gehandelt hat,
    // unterscheidet sich dann nicht mehr von einem Programmierfehler.
    const req = angenommeneAnfrage({ desired_addons: [MULTITENANT] });
    const pool = transactionPool(
      { rows: [req] },
      { rows: [req] },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [{ id: "r-addon", status: "active" }] },
      { rows: [VORHANDENER_BELEG] },
      { rows: [] },
      { rows: [] }
    );

    const r = await applyApprovedChange(pool, { requestId: "r-addon" });
    assert.equal(r.ok, true);

    assert.strictEqual(pool.calls[4].params[1], null, "deactivated_by muss null sein");
    assert.strictEqual(pool.calls[5].params[7], null, "activated_by muss null sein");
    assert.strictEqual(pool.calls[8].params[3], null, "changed_by im Verlauf muss null sein");
  });

  it("ohne gewuenschte Zusatzleistungen wird nur abgeschaltet, nichts eingetragen", async () => {
    // Leere Wunschliste heisst: alles abschalten und nichts neu anlegen.
    // Ein Eintrag mit leerem Schluessel waere eine Geisterleistung auf der
    // Rechnung.
    const req = angenommeneAnfrage({ desired_addons: [] });
    const pool = transactionPool(
      { rows: [req] },
      { rows: [req] },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [{ id: "r-addon", status: "active" }] },
      { rows: [VORHANDENER_BELEG] },
      { rows: [] },
      { rows: [] }
    );

    const r = await applyApprovedChange(pool, { requestId: "r-addon", actorUserId: "staff-1" });
    assert.equal(r.ok, true);
    assert.deepEqual(pool.calls[4].params, ["o1", "staff-1", []]);
    assert.ok(
      !pool.calls.some((c) => /INSERT INTO org_active_addons/.test(String(c.sql))),
      "ohne Wunsch darf keine Zusatzleistung angelegt werden"
    );
  });
});

describe("Verlaufseintrag der Aktivierung", () => {
  it("der Verlauf haelt Wer, Was und Warum vollstaendig fest", async () => {
    // Die Nutzlast ist der Nachweis der Aktivierung. Faellt sie auf ein leeres
    // Objekt zurueck, steht im Protokoll nur noch "Status geaendert" — ohne
    // Zielplan, ohne Belegnummer, ohne Anzahl der Zusatzleistungen.
    const req = angenommeneAnfrage({ desired_addons: [MULTITENANT] });
    const pool = transactionPool(
      { rows: [req] },
      { rows: [req] },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [{ id: "r-addon", status: "active" }] },
      { rows: [VORHANDENER_BELEG] },
      { rows: [] },
      { rows: [] }
    );

    await applyApprovedChange(pool, { requestId: "r-addon", actorUserId: "staff-1" });

    const verlauf = pool.calls[8];
    assert.match(verlauf.sql, /INSERT INTO subscription_request_status_history/);
    assert.equal(verlauf.params[0], "r-addon");
    assert.equal(verlauf.params[1], "accepted");
    assert.equal(verlauf.params[2], "active");
    assert.equal(verlauf.params[3], "staff-1");
    assert.equal(verlauf.params[4], "apply_approved_change");
    assert.deepEqual(JSON.parse(verlauf.params[5]), {
      applied: true,
      target_plan: "PRO",
      request_type: "upgrade",
      cancellation_effective_at: null,
      quote_snapshot_already_frozen: true,
      quote_catalog_version: "test-cat",
      document_type: "change_confirmation",
      document_id: "doc-1",
      document_number: "AE-2026-000007",
      document_created: false,
      document_already_exists: true,
      active_addons_synced: true,
      active_addons_count: 1
    });
  });
});

describe("Belegart und Belegmeldung", () => {
  it("ein bereits vorhandener Beleg wird als vorhanden gemeldet, nicht als neu erzeugt", async () => {
    // Ein zweiter Aktivierungslauf darf keine zweite Auftragsbestaetigung
    // erzeugen und muss das auch so melden: `created` false, `already_exists`
    // true. Wer das verwechselt, verschickt dieselbe Bestaetigung zweimal.
    const req = angenommeneAnfrage({ desired_addons: [] });
    const pool = transactionPool(
      { rows: [req] },
      { rows: [req] },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [{ id: "r-addon", status: "active" }] },
      { rows: [VORHANDENER_BELEG] },
      { rows: [] },
      { rows: [] }
    );

    const r = await applyApprovedChange(pool, { requestId: "r-addon", actorUserId: "staff-1" });

    assert.deepEqual(r.document, {
      id: "doc-1",
      document_type: "change_confirmation",
      document_number: "AE-2026-000007",
      status: "issued",
      title: null,
      issued_at: null,
      download_available: true,
      created: false,
      already_exists: true
    });
  });

  it("ein frisch erzeugter Beleg reicht Titel und Ausstellungsdatum durch und meldet sich als neu", async () => {
    // Gegenprobe: hier gibt es noch keinen Beleg. Titel und Datum kommen aus
    // der neu geschriebenen Zeile und duerfen nicht auf null gekappt werden —
    // sie stehen spaeter auf dem Beleg des Kunden.
    const req = angenommeneAnfrage({ org_id: null, desired_addons: [] });
    const neuerBeleg = {
      id: "doc-neu",
      document_type: "change_confirmation",
      document_number: "AE-2026-000008",
      status: "issued",
      title: "Aenderungsbestaetigung AE-2026-000008",
      issued_at: "2026-09-01T08:00:00.000Z"
    };
    const pool = transactionPool(
      { rows: [req] },                                   // 1 Anfrage lesen
      { rows: [req] },                                   // 2 Angebot bereits eingefroren
      { rows: [{ id: "r-addon", status: "active" }] },   // 3 Anfrage auf aktiv
      { rows: [] },                                      // 4 kein vorhandener Beleg
      { rows: [{ ...req, org_name: null }] },            // 5 Anfrage-Abzug fuer den Beleg
      { rows: [{ n: 8 }] },                              // 6 Belegnummer
      { rows: [neuerBeleg] },                            // 7 Beleg schreiben
      { rows: [] },                                      // 8 aeltere Belege ueberholt setzen
      { rows: [] },                                      // 9 Verlaufseintrag
      { rows: [] }                                       // 10 Audit
    );

    const r = await applyApprovedChange(pool, { requestId: "r-addon", actorUserId: "staff-1" });

    assert.equal(r.ok, true);
    assert.deepEqual(r.document, {
      id: "doc-neu",
      document_type: "change_confirmation",
      document_number: "AE-2026-000008",
      status: "issued",
      title: "Aenderungsbestaetigung AE-2026-000008",
      issued_at: "2026-09-01T08:00:00.000Z",
      download_available: true,
      created: true,
      already_exists: false
    });
  });

  it("eine Anfrage mit unbekanntem Typ bekommt trotzdem eine Auftragsbestaetigung", async () => {
    // Der Rueckfall in activationDocumentType ist der Schutz gegen einen
    // Altbestand mit einem Typ, den der Katalog heute nicht mehr kennt. Faellt
    // er weg, wird gar kein Beleg erzeugt — eine Aktivierung ohne Beleg ist
    // eine Luecke in der Belegkette.
    const req = angenommeneAnfrage({ request_type: "legacy_plan_change", desired_addons: [] });
    const pool = transactionPool(
      { rows: [req] },
      { rows: [req] },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [{ id: "r-addon", status: "active" }] },
      { rows: [{ id: "doc-alt", document_type: "order_confirmation", document_number: "AB-2026-000003", status: "issued" }] },
      { rows: [] },
      { rows: [] }
    );

    const r = await applyApprovedChange(pool, { requestId: "r-addon", actorUserId: "staff-1" });

    assert.equal(r.ok, true);
    assert.equal(r.document.document_type, "order_confirmation");
    // Die Belegsuche fragt genau nach dieser Belegart.
    assert.equal(pool.calls[6].params[1], "order_confirmation");
  });
});


/* ═══════════════════════════════════════════════════════════════════════════
   Nachtrag aus der Gegenpruefung (2026-09-01)

   Ein Mutant war HIER als gleichwertig abgetan worden — zu Unrecht. Die
   Begruendung lautete: "keine der acht Aufrufstellen laesst `details` weg,
   ueberall steht ein Objektliteral." Das stimmt fuer die Aufrufstellen INNERHALB
   des Dienstes, uebersieht aber, dass `transitionStatus` EXPORTIERT ist.

   Sein Vorgabewert `details = {}` greift nur bei `undefined`, NICHT bei `null`.
   Ein Aufrufer von aussen, der `details: null` uebergibt, erzeugt ohne den
   Rueckfall `JSON.stringify(null)` — also die Zeichenkette "null" in einer
   jsonb-Spalte. Das ist kein leeres Objekt: jeder spaetere Zugriff auf ein Feld
   darin bricht, und der Verlaufseintrag traegt eine Angabe, die es nicht gibt.
   ═══════════════════════════════════════════════════════════════════════════ */

describe("insertHistory — `details: null` von aussen wird zum leeren Objekt", () => {
  const ANFRAGE = { id: "req-1", status: "submitted", request_type: "new_individual" };

  /** Ein Durchlauf von transitionStatus, der bis zum Verlaufseintrag kommt. */
  async function verlaufBei(details) {
    const pool = transactionPool(
      { rows: [ANFRAGE] },                                   // aktuellen Zustand lesen
      { rows: [{ ...ANFRAGE, status: "under_review" }] },      // Zustand setzen
      { rows: [{ id: "h-1" }] }                               // Verlauf schreiben
    );
    const opts = { requestId: "req-1", toStatus: "under_review" };
    if (details !== undefined) opts.details = details;
    const ergebnis = await transitionStatus(pool, opts);
    assert.equal(ergebnis.ok, true, `unerwartet: ${JSON.stringify(ergebnis)}`);
    const verlauf = pool.calls.find((a) =>
      /INSERT INTO subscription_request_status_history/.test(String(a.sql)));
    assert.ok(verlauf, "der Verlaufseintrag muss geschrieben werden");
    return verlauf.params[5];
  }

  it("ein Aufruf mit details: null schreibt {} in den Verlauf, nicht \"null\"", async () => {
    assert.equal(await verlaufBei(null), "{}",
      "aus `null` wird ein leeres Objekt — sonst steht die Zeichenkette \"null\" "
      + "in einer jsonb-Spalte, und jeder spaetere Feldzugriff darin bricht");
  });

  it("ohne Angabe greift der Vorgabewert, mit Angabe bleibt sie erhalten", async () => {
    /* Die Gegenprobe: der Rueckfall darf nicht ALLES platt machen. */
    assert.equal(await verlaufBei(undefined), "{}", "ohne Angabe: leeres Objekt");
    assert.equal(await verlaufBei({ grund: "geprueft" }), '{"grund":"geprueft"}',
      "mit Angabe: unveraendert uebernommen");
  });
});
