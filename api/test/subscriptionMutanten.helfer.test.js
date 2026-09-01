/**
 * subscriptionRequestService — Buendel "Helfer": Mutations-Proben.
 *
 * WARUM ES DIESE DATEI GIBT
 * Der Mutationslauf vom 2026-09-01 hat fuer services/subscriptionRequestService.js
 * eine Punktzahl von 43,51 % gemessen (548 von 970 Mutanten ueberlebten). Die
 * Owner-Vorgabe lautet 90 % je Bereich. Der groesste einzelne Ausfall lag bei den
 * reinen Helfern: setEffectivity 56 von 56 ueberlebende Mutanten, normalizeAddonList
 * 49 von 51. Reine Funktionen lassen sich erschoepfend pruefen — hier ist die
 * Ausbeute am hoechsten.
 *
 * WAS DIESE DATEI ABDECKT (Buendel "helfer", 133 ueberlebende Mutanten)
 *   - setEffectivity        Wirksamkeits- und Kuendigungsdaten: Abfrageform,
 *                           Bindungsreihenfolge, Verlaufseintrag, Rueckgabegestalt
 *   - normalizePlan         Plan-Normalisierung inkl. Rueckfall auf DEMO
 *   - limitNumber           Grenzwert-Uebersetzung (-1 = unbegrenzt, sonst Zahl)
 *   - normalizeAddonList    Zusatzleistungen: Schluessel-Vorrang, Entdopplung,
 *                           Katalog-Anreicherung, Preis- und Intervall-Herkunft
 *   - parseJsonArray        Annahme von Feld-Array und JSON-Zeichenkette
 *   - throwServiceError     Fehlerschluessel bleibt der Fehlerschluessel
 *
 * normalizePlan, limitNumber, normalizeAddonList, parseJsonArray und
 * throwServiceError sind nicht exportiert. Sie werden ueber ihre einzigen
 * oeffentlichen Wege geprueft: previewDowngradeImpact (rein, ohne Datenbank, weil
 * ohne orgId frueh zurueckgekehrt wird) und applyApprovedChange (voller
 * Aktivierungspfad ueber einen Muster-Pool).
 *
 * WAS DIESE DATEI BEWUSST NICHT PRUEFT
 *   - Protokolltexte auf Erfolgspfaden — Rauschen, kein Schaden.
 *   - Mutanten, die kein beobachtbares Verhalten aendern (siehe Kommentare
 *     "aequivalent" an den betroffenen Stellen). Sie werden nicht erzwungen.
 *   - Die Zustandsmaschine, createRequest, approve/reject/activate und die
 *     Wirkungsvorschau als Ganzes — dafuer gibt es
 *     test/subscriptionRequestService.test.js und die uebrigen Buendel.
 *   - Die Kurzform "Zusatzleistung als reine Zeichenkette" (z. B. ["api"]).
 *     createRequest nimmt sie an und speichert sie unveraendert, normalizeAddonList
 *     verwirft sie stillschweigend. Das ist ein Befund, keine Spezifikation —
 *     er wird hier weder als richtig noch als falsch festgeschrieben.
 *
 * Lauf: node --test --test-force-exit api/test/subscriptionMutanten.helfer.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  setEffectivity,
  previewDowngradeImpact,
  applyApprovedChange
} from "../services/subscriptionRequestService.js";

/* ── Muster-Pool — dieselbe Bauart wie test/subscriptionRequestService.test.js ── */

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

/* ============================================================ *
 * 1. setEffectivity — Wirksamkeits- und Kuendigungsdaten        *
 * ============================================================ */

describe("setEffectivity", () => {
  const ZEILE = { id: "r1", status: "accepted", request_type: "upgrade" };

  // Die Abfrageform woertlich: der Muster-Pool fuehrt nichts aus, also ist die
  // Zeichenkette der einzige Beweis, dass Spaltennamen, Trennzeichen, das
  // Zeitstempel-Feld und die WHERE-Bindung stehen. Eine verschobene Bindung waere
  // hier kein Formfehler, sondern ein Datum am falschen Datensatz.
  const ERWARTETE_ABFRAGE =
    "UPDATE subscription_requests SET effective_from = $1, billing_effective_from = $2, "
    + "effective_until = $3, cancellation_effective_at = $4, updated_at = NOW() "
    + "WHERE id = $5 RETURNING *";

  it("schreibt alle vier Datumsfelder in fester Reihenfolge und meldet die Zeile zurueck", async () => {
    const pool = sequencePool({ rows: [ZEILE] }, { rows: [] });
    const r = await setEffectivity(pool, {
      requestId: "r1",
      actorUserId: "staff-1",
      effectiveFrom: "2026-10-01",
      billingEffectiveFrom: "2026-10-01",
      effectiveUntil: "2027-09-30",
      cancellationEffectiveAt: "2027-09-30",
      reason: "Vertragsstart"
    });

    assert.equal(pool.calls.length, 2, "genau ein UPDATE und ein Verlaufseintrag");
    assert.equal(pool.calls[0].sql, ERWARTETE_ABFRAGE);
    assert.deepEqual(pool.calls[0].params, [
      "2026-10-01", "2026-10-01", "2027-09-30", "2027-09-30", "r1"
    ]);
    // Gestaltprobe: sagt zusaetzlich, was NICHT zurueckkommen darf.
    assert.deepEqual(r, { ok: true, row: ZEILE });
  });

  // Der Verlaufseintrag ist der Nachweis "Wer + Was + Warum". Faellt eines der
  // Datumsfelder aus der Nutzlast, laesst sich spaeter nicht mehr belegen, ab wann
  // ein Vertrag wirksam gestellt wurde — genau der Streitfall, fuer den es ihn gibt.
  it("haelt Grund, Akteur und alle vier Daten im Verlaufseintrag fest", async () => {
    const pool = sequencePool({ rows: [ZEILE] }, { rows: [] });
    await setEffectivity(pool, {
      requestId: "r1",
      actorUserId: "staff-1",
      effectiveFrom: "2026-10-01",
      billingEffectiveFrom: "2026-11-01",
      effectiveUntil: "2027-09-30",
      cancellationEffectiveAt: "2027-12-31",
      reason: "Vertragsstart"
    });

    assert.match(pool.calls[1].sql, /INSERT INTO subscription_request_status_history/);
    assert.deepEqual(pool.calls[1].params, [
      "r1",
      "accepted",
      "accepted",
      "staff-1",
      "Vertragsstart",
      JSON.stringify({
        effective_from: "2026-10-01",
        billing_effective_from: "2026-11-01",
        effective_until: "2027-09-30",
        cancellation_effective_at: "2027-12-31"
      })
    ]);
  });

  it("ohne Grund traegt der Verlauf 'set_effectivity' und vier leere Daten", async () => {
    const pool = sequencePool({ rows: [ZEILE] }, { rows: [] });
    const r = await setEffectivity(pool, { requestId: "r1" });

    assert.equal(pool.calls[0].sql, ERWARTETE_ABFRAGE);
    assert.deepEqual(pool.calls[0].params, [null, null, null, null, "r1"]);
    assert.deepEqual(pool.calls[1].params, [
      "r1",
      "accepted",
      "accepted",
      null,
      "set_effectivity",
      JSON.stringify({
        effective_from: null,
        billing_effective_from: null,
        effective_until: null,
        cancellation_effective_at: null
      })
    ]);
    assert.deepEqual(r, { ok: true, row: ZEILE });
  });

  // Festgehaltenes Ist-Verhalten, kein Guetesiegel: die vier Datumsfelder haben
  // den Vorgabewert null (nicht undefined), also schreibt jeder Aufruf ALLE vier.
  // Wer nur das Kuendigungsdatum setzen will, loescht damit die drei anderen.
  // Wird das im Produktionscode korrigiert, muss diese Probe rot werden und mit
  // ihr diese Warnung gelesen werden.
  it("ein einzeln gesetztes Datum nullt die drei uebrigen Datumsfelder", async () => {
    const pool = sequencePool({ rows: [ZEILE] }, { rows: [] });
    await setEffectivity(pool, {
      requestId: "r1",
      cancellationEffectiveAt: "2027-12-31"
    });
    assert.equal(pool.calls[0].sql, ERWARTETE_ABFRAGE);
    assert.deepEqual(pool.calls[0].params, [null, null, null, "2027-12-31", "r1"]);
  });

  // Ein unbekannter Datensatz darf keinen Verlaufseintrag erzeugen: sonst steht
  // im Protokoll ein Zustandswechsel, den es nie gab.
  it("unbekannter Datensatz liefert REQUEST_NOT_FOUND und schreibt keinen Verlauf", async () => {
    const pool = sequencePool({ rows: [] });
    const r = await setEffectivity(pool, { requestId: "gibt-es-nicht" });
    assert.deepEqual(r, { ok: false, error: "REQUEST_NOT_FOUND" });
    assert.equal(pool.calls.length, 1, "kein Verlaufseintrag nach nicht gefundenem Datensatz");
  });

  // Anmerkung zum Zweig NO_FIELDS (Zeile 712): er ist nicht erreichbar, weil die
  // vier Datumsfelder den Vorgabewert null tragen und `!== undefined` damit immer
  // wahr ist. Die Mutanten in diesem Zweig, die nur seinen INHALT aendern
  // (ok:true, error:"", leeres Objekt), sind aequivalent und werden nicht erzwungen.
  // Die Mutanten, die den Zweig SCHARF stellen, faengt jede Erfolgsprobe oben.
});

/* ============================================================ *
 * 2. normalizePlan + limitNumber                                *
 * ------------------------------------------------------------ *
 * Zugang ueber previewDowngradeImpact: ohne orgId kehrt die Funktion vor jedem
 * Datenbankzugriff zurueck, der Pool wird nie beruehrt.                          *
 * ============================================================ */

describe("normalizePlan (Rueckfall DEMO)", () => {
  it("unbekannte Planbezeichnung faellt auf DEMO zurueck — nie auf leer", async () => {
    const r = await previewDowngradeImpact(null, {
      orgId: null,
      currentPlan: "Fantasieplan",
      desiredPlan: "gibt-es-nicht"
    });
    assert.equal(r.current_plan, "DEMO");
    assert.equal(r.desired_plan, "DEMO");
  });

  it("fehlende Planbezeichnung faellt auf DEMO zurueck", async () => {
    const r = await previewDowngradeImpact(null, {
      orgId: null,
      currentPlan: null,
      desiredPlan: undefined
    });
    assert.equal(r.current_plan, "DEMO");
    assert.equal(r.desired_plan, "DEMO");
  });

  // Bestandsdaten-Aliase: ein falsch aufgeloester Alias vergibt einen anderen Plan
  // und damit einen anderen Preis.
  it("Aliase und Schreibweisen landen auf dem kanonischen Plan", async () => {
    const faelle = [
      ["ENTERPRISE", "INDIVIDUELL"],
      ["INDIVIDUAL", "INDIVIDUELL"],
      ["FREE", "DEMO"],
      ["STARTER", "BASIS"],
      ["  pro  ", "PRO"],
      ["plus", "PLUS"]
    ];
    for (const [eingabe, erwartet] of faelle) {
      const r = await previewDowngradeImpact(null, {
        orgId: null, currentPlan: eingabe, desiredPlan: eingabe
      });
      assert.equal(r.current_plan, erwartet, `current_plan fuer "${eingabe}"`);
      assert.equal(r.desired_plan, erwartet, `desired_plan fuer "${eingabe}"`);
    }
  });
});

describe("limitNumber (Anzeigegrenze der Zielstufe)", () => {
  // -1 heisst unbegrenzt. Wird daraus eine 1, sieht der Kunde vor dem Wechsel
  // eine Obergrenze von einer Anzeige, wo keine Grenze gilt.
  it("unbegrenzt bleibt -1", async () => {
    for (const plan of ["PRO", "INDIVIDUELL"]) {
      const r = await previewDowngradeImpact(null, { orgId: null, currentPlan: "INDIVIDUELL", desiredPlan: plan });
      assert.equal(r.listings_limit_after, -1, `listings_limit_after fuer ${plan}`);
    }
  });

  // Endliche Grenzen muessen die echte Zahl behalten — nicht auf "unbegrenzt"
  // kippen. Sonst verspricht die Vorschau mehr, als der Zielplan hergibt.
  it("endliche Grenzen behalten ihre Zahl", async () => {
    const faelle = [["DEMO", 0], ["BASIS", 5], ["PLUS", 20]];
    for (const [plan, erwartet] of faelle) {
      const r = await previewDowngradeImpact(null, { orgId: null, currentPlan: "PRO", desiredPlan: plan });
      assert.equal(r.listings_limit_after, erwartet, `listings_limit_after fuer ${plan}`);
    }
  });

  // Anmerkung: `if (v === -1) return -1;` ist eine Abkuerzung — faellt die
  // Bedingung weg, liefert der Rest fuer -1 dasselbe. Die Mutanten
  // "Bedingung immer falsch" und "v === +1" sind daher aequivalent, solange
  // limitNumber nur mit den Werten aus PLAN_LIMITS.listings (0, 5, 20, -1)
  // aufgerufen wird. Sie werden nicht erzwungen.
});

describe("Wirkungsvorschau ohne Organisation", () => {
  // Gestaltprobe des Nullzustands: haelt fest, welche Felder da sein MUESSEN und
  // welche NICHT — insbesondere, dass ohne orgId kein hard_blocked gesetzt wird
  // und keine Zaehlung stattgefunden hat.
  it("liefert die vollstaendige Nullzustands-Gestalt", async () => {
    const r = await previewDowngradeImpact(null, {
      orgId: null, currentPlan: "PLUS", desiredPlan: "BASIS"
    });
    assert.deepEqual(r, {
      current_plan: "PLUS",
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

/* ============================================================ *
 * 3. throwServiceError                                          *
 * ============================================================ */

describe("throwServiceError", () => {
  // Der Fehlerschluessel ist das, was Route und Oberflaeche in eine Meldung
  // uebersetzen. Wird er durch den Sammelbegriff ersetzt, sieht der Nutzer
  // "unbekannter Fehler" statt "Organisation nicht gefunden" — und der Betreiber
  // sucht an der falschen Stelle.
  it("gibt den uebergebenen Schluessel weiter — als Meldung UND als code", async () => {
    const req = {
      id: "r1", status: "accepted", request_type: "upgrade",
      org_id: "org-1", user_id: null,
      desired_plan: "PRO", current_plan: "BASIS",
      desired_addons: [], cancellation_effective_at: null
    };
    const pool = sequencePool(
      { rows: [req] },
      { rows: [{ id: "r1", quote_frozen_at: "2026-09-01T00:00:00.000Z", quote_snapshot: { catalog_version: "cat-test" } }] },
      { rows: [], rowCount: 0 } // UPDATE organizations trifft nichts
    );
    await assert.rejects(
      () => applyApprovedChange(pool, { requestId: "r1", actorUserId: "staff-1" }),
      (e) => {
        assert.equal(e.message, "ORG_NOT_FOUND");
        assert.equal(e.code, "ORG_NOT_FOUND");
        assert.deepEqual(e.details, {});
        return true;
      }
    );
    assert.equal(pool.calls.length, 3, "nach dem Fehler darf nichts mehr geschrieben werden");
  });

  // Anmerkung: der Rueckfall `code || "SUBSCRIPTION_REQUEST_SERVICE_ERROR"` ist an
  // keiner Aufrufstelle erreichbar — alle Aufrufer uebergeben einen wahrheitswerten
  // Schluessel. Die Mutanten, die nur den Rueckfalltext leeren, sind aequivalent.
});

/* ============================================================ *
 * 4. normalizeAddonList + parseJsonArray                        *
 * ------------------------------------------------------------ *
 * Zugang ueber applyApprovedChange -> syncOrgActiveAddons. Beobachtbar sind die  *
 * Bindungen der beiden org_active_addons-Abfragen: die Deaktivierung traegt die  *
 * Schluesselliste, jeder INSERT den fertigen Datensatz.                          *
 * ============================================================ */

const AKTIVIERUNGS_ANTRAG = {
  id: "r1",
  status: "accepted",
  request_type: "upgrade",
  org_id: "org-1",
  user_id: null,
  desired_plan: "PRO",
  current_plan: "BASIS",
  desired_individual_tier: null,
  desired_features: [],
  employee_count: null,
  cancellation_effective_at: null,
  effective_from: null
};

/**
 * Baut den Muster-Pool fuer einen vollstaendigen Aktivierungslauf.
 * `erwarteteEinfuegungen` ist die Zahl der org_active_addons-INSERTs, die der
 * gesunde Code ausloest. Weicht ein Mutant davon ab, verschiebt sich die
 * Antwortfolge und der Lauf bricht — genau das soll er.
 */
function aktivierungsPool(desiredAddons, erwarteteEinfuegungen) {
  const antworten = [
    { rows: [{ ...AKTIVIERUNGS_ANTRAG, desired_addons: desiredAddons }] },
    { rows: [{ id: "r1", quote_frozen_at: "2026-09-01T00:00:00.000Z", quote_snapshot: { catalog_version: "cat-test", plan: "PRO" } }] },
    { rows: [], rowCount: 1 },  // UPDATE organizations
    { rows: [], rowCount: 0 }   // UPDATE org_active_addons (Abwahl)
  ];
  for (let i = 0; i < erwarteteEinfuegungen; i++) antworten.push({ rows: [], rowCount: 1 });
  antworten.push({ rows: [{ id: "r1", status: "active", request_type: "upgrade" }], rowCount: 1 });
  antworten.push({
    rows: [{
      id: "doc-1", document_type: "change_confirmation",
      document_number: "AE-2026-000001", status: "issued",
      title: "Aenderungsbestaetigung", issued_at: "2026-09-01T00:00:00.000Z"
    }]
  });
  antworten.push({ rows: [] }); // Verlaufseintrag
  antworten.push({ rows: [] }); // audit_log
  return sequencePool(...antworten);
}

function abwahl(pool) {
  return pool.calls.find((c) => /UPDATE org_active_addons/.test(c.sql));
}
function einfuegungen(pool) {
  return pool.calls.filter((c) => /INSERT INTO org_active_addons/.test(c.sql));
}
function verlaufsdetails(pool) {
  const eintrag = pool.calls.find((c) => /INSERT INTO subscription_request_status_history/.test(c.sql));
  return JSON.parse(eintrag.params[5]);
}

describe("normalizeAddonList — Katalog-Anreicherung", () => {
  // Preis und Name kommen aus dem Katalog, wenn der Antrag nur den Schluessel
  // nennt. Greift die Katalogsuche daneben, wird eine falsche Zusatzleistung zu
  // einem falschen Preis aktiviert — das ist unmittelbar Geld.
  it("ein blosser Schluessel wird mit Name, Preis und Intervall aus dem Katalog gefuellt", async () => {
    const pool = aktivierungsPool([{ key: "api" }], 1);
    const r = await applyApprovedChange(pool, { requestId: "r1", actorUserId: "staff-1" });
    assert.equal(r.ok, true);

    const ein = einfuegungen(pool);
    assert.equal(ein.length, 1);
    assert.deepEqual(ein[0].params, [
      "org-1",
      "api",
      "API-Zugang & Webhooks",
      39900,
      "monthly",
      "subscription_request",
      "r1",
      "staff-1",
      JSON.stringify({ source_payload: { key: "api" } })
    ]);
    assert.deepEqual(abwahl(pool).params, ["org-1", "staff-1", ["api"]]);
    assert.equal(verlaufsdetails(pool).active_addons_count, 1);
  });

  // Der Katalogtreffer muss der Eintrag mit GLEICHEM Schluessel sein. Greift die
  // Suche auf den ersten oder auf den ersten ANDEREN Eintrag zu, bekommt der Kunde
  // den Namen und den Preis einer fremden Zusatzleistung.
  it("der Katalogtreffer gehoert zum angefragten Schluessel, nicht zum ersten Eintrag", async () => {
    const pool = aktivierungsPool([{ addon_key: "spend" }], 1);
    await applyApprovedChange(pool, { requestId: "r1", actorUserId: "staff-1" });
    const p = einfuegungen(pool)[0].params;
    assert.equal(p[1], "spend");
    assert.equal(p[2], "Spend Analytics Premium");
    assert.equal(p[3], 34900);
    assert.equal(p[4], "monthly");
  });

  // Einmalig abgerechnete Zusatzleistungen duerfen nicht als monatlich landen —
  // das waere eine Dauerbelastung statt einer einmaligen Gebuehr.
  it("das Intervall stammt aus dem Katalog, auch wenn es 'onetime' lautet", async () => {
    const pool = aktivierungsPool([{ id: "onboarding" }], 1);
    await applyApprovedChange(pool, { requestId: "r1", actorUserId: "staff-1" });
    const p = einfuegungen(pool)[0].params;
    assert.equal(p[1], "onboarding");
    assert.equal(p[2], "Dediziertes Onboarding-Paket");
    assert.equal(p[3], 249900);
    assert.equal(p[4], "onetime");
  });

  // Unbekannte Schluessel duerfen die Aktivierung nicht sprengen: die Zeile wird
  // ohne Katalogdaten geschrieben, nicht mit einem Absturz quittiert.
  it("unbekannter Schluessel wird ohne Preis und Intervall uebernommen", async () => {
    const pool = aktivierungsPool([{ key: "unbekannt" }], 1);
    await applyApprovedChange(pool, { requestId: "r1", actorUserId: "staff-1" });
    assert.deepEqual(einfuegungen(pool)[0].params, [
      "org-1",
      "unbekannt",
      "unbekannt",
      null,
      null,
      "subscription_request",
      "r1",
      "staff-1",
      JSON.stringify({ source_payload: { key: "unbekannt" } })
    ]);
  });
});

describe("normalizeAddonList — Vorrang der Angaben", () => {
  // Was im Antrag steht, schlaegt den Katalog: sonst wird eine ausgehandelte
  // Kondition beim Aktivieren stillschweigend auf den Listenpreis zurueckgesetzt.
  it("eigene Angaben aus dem Antrag schlagen die Katalogwerte", async () => {
    const roh = { key: "api", name: "Eigener Name", price_cents: 1234, interval: "yearly" };
    const pool = aktivierungsPool([roh], 1);
    await applyApprovedChange(pool, { requestId: "r1", actorUserId: "staff-1" });
    assert.deepEqual(einfuegungen(pool)[0].params, [
      "org-1",
      "api",
      "Eigener Name",
      1234,
      "yearly",
      "subscription_request",
      "r1",
      "staff-1",
      JSON.stringify({ source_payload: roh })
    ]);
  });

  // Der Preis 0 ist eine Angabe, kein fehlender Wert. Faellt er auf den
  // Katalogpreis zurueck, wird eine zugesagte Gratis-Leistung berechnet.
  it("ein Preis von 0 bleibt 0 und faellt nicht auf den Katalogpreis zurueck", async () => {
    const pool = aktivierungsPool([{ key: "api", price_cents: 0 }], 1);
    await applyApprovedChange(pool, { requestId: "r1", actorUserId: "staff-1" });
    assert.equal(einfuegungen(pool)[0].params[3], 0);
  });

  it("alternativer Name aus addon_name wird genutzt, wenn name fehlt", async () => {
    const pool = aktivierungsPool([{ key: "api", addon_name: "Aus addon_name" }], 1);
    await applyApprovedChange(pool, { requestId: "r1", actorUserId: "staff-1" });
    assert.equal(einfuegungen(pool)[0].params[2], "Aus addon_name");
  });

  // Schluessel-Vorrang: key vor addon_key vor id. Eine andere Reihenfolge
  // aktiviert eine andere Zusatzleistung als bestellt.
  it("key gewinnt vor addon_key, addon_key gewinnt vor id", async () => {
    const pool = aktivierungsPool([{ key: "api", addon_key: "spend", id: "ratecards" }], 1);
    await applyApprovedChange(pool, { requestId: "r1", actorUserId: "staff-1" });
    assert.equal(einfuegungen(pool)[0].params[1], "api");

    const pool2 = aktivierungsPool([{ addon_key: "spend", id: "ratecards" }], 1);
    await applyApprovedChange(pool2, { requestId: "r1", actorUserId: "staff-1" });
    assert.equal(einfuegungen(pool2)[0].params[1], "spend");

    const pool3 = aktivierungsPool([{ id: "ratecards" }], 1);
    await applyApprovedChange(pool3, { requestId: "r1", actorUserId: "staff-1" });
    assert.equal(einfuegungen(pool3)[0].params[1], "ratecards");
    assert.equal(einfuegungen(pool3)[0].params[2], "Rate Card Management");
  });

  // Ohne Beschnitt trifft "  api  " keinen Katalogeintrag: die Leistung wuerde
  // ohne Preis aktiviert und die Abwahlliste enthielte einen Schluessel, der in
  // keiner Tabelle steht.
  it("umschliessende Leerzeichen werden vom Schluessel entfernt", async () => {
    const pool = aktivierungsPool([{ key: "  api  " }], 1);
    await applyApprovedChange(pool, { requestId: "r1", actorUserId: "staff-1" });
    assert.equal(einfuegungen(pool)[0].params[1], "api");
    assert.equal(einfuegungen(pool)[0].params[3], 39900);
    assert.deepEqual(abwahl(pool).params[2], ["api"]);
  });

  // Die Rohnutzlast wird mitgeschrieben — sie ist der Beleg dafuer, was der Kunde
  // tatsaechlich bestellt hat, wenn spaeter ueber den Preis gestritten wird.
  it("die Rohnutzlast landet unveraendert in den Metadaten", async () => {
    const roh = { key: "spend", price_cents: 4200, herkunft: "angebot-7" };
    const pool = aktivierungsPool([roh], 1);
    await applyApprovedChange(pool, { requestId: "r1", actorUserId: "staff-1" });
    assert.equal(
      einfuegungen(pool)[0].params[8],
      JSON.stringify({ source_payload: roh })
    );
  });
});

describe("normalizeAddonList — Aussortieren", () => {
  // Doppelte Schluessel duerfen nicht zweimal geschrieben werden. Der erste
  // Eintrag gewinnt; ein zweiter Durchlauf wuerde den Datensatz mit abweichenden
  // Werten ueberschreiben.
  it("doppelte Schluessel werden einmal aktiviert, der erste Eintrag gewinnt", async () => {
    const pool = aktivierungsPool([{ key: "api" }, { key: "api", name: "Zweiter" }], 1);
    await applyApprovedChange(pool, { requestId: "r1", actorUserId: "staff-1" });
    const ein = einfuegungen(pool);
    assert.equal(ein.length, 1, "nur eine Einfuegung fuer denselben Schluessel");
    assert.equal(ein[0].params[2], "API-Zugang & Webhooks");
    assert.deepEqual(abwahl(pool).params[2], ["api"]);
    assert.equal(verlaufsdetails(pool).active_addons_count, 1);
  });

  // Ein Eintrag ohne Schluessel wird verworfen. Wuerde er mit leerem Schluessel
  // geschrieben, entstuende eine Geisterzeile in org_active_addons, die die
  // Abwahl beim naechsten Lauf nie wieder erwischt.
  it("Eintraege ohne Schluessel werden verworfen", async () => {
    const pool = aktivierungsPool([{}, { name: "ohne Schluessel" }, { key: "api" }], 1);
    await applyApprovedChange(pool, { requestId: "r1", actorUserId: "staff-1" });
    assert.equal(einfuegungen(pool).length, 1);
    assert.deepEqual(abwahl(pool).params[2], ["api"]);
  });

  // Ein null-Eintrag in der gespeicherten JSON-Spalte darf die Aktivierung nicht
  // sprengen: sonst bleibt ein bezahlter Wechsel wegen eines Datenrests haengen.
  it("ein null-Eintrag in den gespeicherten Zusatzleistungen bricht die Aktivierung nicht ab", async () => {
    const pool = aktivierungsPool([null, { key: "api" }], 1);
    const r = await applyApprovedChange(pool, { requestId: "r1", actorUserId: "staff-1" });
    assert.equal(r.ok, true);
    assert.equal(einfuegungen(pool).length, 1);
    assert.deepEqual(abwahl(pool).params[2], ["api"]);
  });

  // Die Abwahlliste ist die Bindung, die entscheidet, welche bestehenden
  // Leistungen bestehen bleiben. Eine falsche Liste deaktiviert bezahlte
  // Leistungen — oder laesst abbestellte weiterlaufen.
  it("die Abwahl bekommt genau die normalisierten Schluessel in Reihenfolge", async () => {
    const pool = aktivierungsPool(
      [{ key: "api" }, { addon_key: "spend" }, { id: "ratecards" }],
      3
    );
    await applyApprovedChange(pool, { requestId: "r1", actorUserId: "staff-1" });
    assert.deepEqual(abwahl(pool).params, ["org-1", "staff-1", ["api", "spend", "ratecards"]]);
    assert.deepEqual(
      einfuegungen(pool).map((c) => c.params[1]),
      ["api", "spend", "ratecards"]
    );
    assert.equal(verlaufsdetails(pool).active_addons_count, 3);
  });
});

describe("parseJsonArray", () => {
  // Die Spalte desired_addons ist jsonb. Je nach Treiber und Aufrufweg kommt sie
  // als Feld ODER als Zeichenkette zurueck. Wird die Zeichenkette nicht gelesen,
  // aktiviert der Wechsel stillschweigend keine einzige Zusatzleistung — der Kunde
  // zahlt fuer etwas, das nie eingeschaltet wurde.
  it("eine JSON-Zeichenkette wird wie ein Feld gelesen", async () => {
    const pool = aktivierungsPool('[{"key":"api"},{"key":"spend"}]', 2);
    await applyApprovedChange(pool, { requestId: "r1", actorUserId: "staff-1" });
    assert.deepEqual(
      einfuegungen(pool).map((c) => c.params[1]),
      ["api", "spend"]
    );
    assert.deepEqual(abwahl(pool).params[2], ["api", "spend"]);
  });

  it("ein echtes Feld wird unveraendert uebernommen", async () => {
    const pool = aktivierungsPool([{ key: "api" }, { key: "spend" }], 2);
    await applyApprovedChange(pool, { requestId: "r1", actorUserId: "staff-1" });
    assert.deepEqual(
      einfuegungen(pool).map((c) => c.params[1]),
      ["api", "spend"]
    );
  });

  // Unbrauchbare Werte ergeben eine leere Liste — und eine leere Liste in der
  // Abwahl bedeutet: alle bisher aktiven Zusatzleistungen werden abgeschaltet.
  // Dass das die Wirkung ist, muss sichtbar festgehalten sein.
  it("unbrauchbare Werte ergeben eine leere Liste ohne Einfuegung", async () => {
    for (const wert of [null, undefined, 42, { key: "api" }, "kein json", '{"key":"api"}']) {
      const pool = aktivierungsPool(wert, 0);
      const r = await applyApprovedChange(pool, { requestId: "r1", actorUserId: "staff-1" });
      assert.equal(r.ok, true, `Wert ${JSON.stringify(wert) ?? "undefined"}`);
      assert.equal(einfuegungen(pool).length, 0, `Wert ${JSON.stringify(wert) ?? "undefined"}`);
      assert.deepEqual(abwahl(pool).params[2], [], `Wert ${JSON.stringify(wert) ?? "undefined"}`);
      assert.equal(verlaufsdetails(pool).active_addons_count, 0);
    }
  });

  // Anmerkung: die Rueckfaelle auf [] im Fehler- und im Nicht-Feld-Zweig sind von
  // aussen nicht unterscheidbar, weil normalizeAddonList jeden Eintrag ohne
  // Schluessel ohnehin verwirft. Die zugehoerigen Mutanten sind aequivalent und
  // werden nicht erzwungen.
});
