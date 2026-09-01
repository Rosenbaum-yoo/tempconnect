/**
 * subscriptionMutanten.anlegen.test.js
 *
 * WARUM ES DIESE DATEI GIBT
 * -------------------------
 * Der Mutationslauf vom 2026-09-01 hat `services/subscriptionRequestService.js`
 * bei 43,51 % Punktzahl gemessen — 548 von 970 Mutanten ueberlebten. Die
 * Owner-Vorgabe lautet 90 % je Bereich (CLAUDE.md, Mutation-Testing-Direktive).
 * Diese Datei arbeitet das Buendel "anlegen" ab: 87 ueberlebende Mutanten in
 * `createRequest()` (Zeilen 162-291).
 *
 * WAS SIE ABDECKT
 * ---------------
 *   - Eingangspruefung: fehlender/ungueltiger request_type, fehlende oder nur
 *     aus Leerzeichen bestehende Kontakt-E-Mail, fehlende Mandantenbindung,
 *     nicht buchbare Zusatzleistungen, ungueltiger Anfangsstatus.
 *     Geprueft wird jeweils Code UND Meldung — die Meldung ist das, was der
 *     Aufrufer dem Nutzer zeigt.
 *   - Die vollstaendige Bindungsliste des INSERT als Gestaltprobe (deepEqual
 *     ueber alle 32 Parameter), einmal voll belegt und einmal minimal. Eine
 *     vertauschte oder auf `null` gekippte Bindung ist hier kein Formfehler:
 *     sie schreibt fremde oder leere Werte in die Abo-Anfrage.
 *   - Die FORM der Abfrage woertlich (Spaltenreihenfolge, Platzhalter,
 *     jsonb-Umwandlungen, NOW(), RETURNING) — der Muster-Pool fuehrt nichts
 *     aus, also muss die Form selbst behauptet werden.
 *   - Die Einstufung "Selbstbedienung ja/nein" ueber alle Anfragearten, gelesen
 *     aus den Bindungen statt aus der Mock-Zeile.
 *   - Den Verlaufseintrag (Wer + Was + Warum) als Gestaltprobe.
 *
 * WAS SIE BEWUSST NICHT PRUEFT
 * ----------------------------
 *   - `desired_addons: []` (leere Liste): der Mutant `length >= 0` betritt dann
 *     zwar den Coming-Soon-Block, der aber ueber eine leere Liste laeuft und
 *     nichts tut. Kein beobachtbarer Unterschied → aequivalent, wird nicht
 *     erzwungen.
 *   - Das Weglassen von `.filter(Boolean)` in Zeile 191: uebrig bleibende
 *     `undefined`-Eintraege finden im ADDON_CATALOG ohnehin keinen Treffer.
 *     Kein beobachtbarer Unterschied → aequivalent.
 *   - Protokolltexte auf Erfolgspfaden.
 *
 * Lauf: node --test --test-force-exit test/subscriptionMutanten.anlegen.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  REQUEST_TYPES,
  STATUS,
  createRequest
} from "../services/subscriptionRequestService.js";

/* ── Muster-Pool (gleiche Bauart wie subscriptionRequestService.test.js) ── */

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

/** Zeile, die der INSERT zurueckliefert. Der Verlaufseintrag liest daraus. */
function zeile(over = {}) {
  return {
    id: "req-77",
    status: "submitted",
    request_type: "new_individual",
    is_self_service: false,
    ...over
  };
}

/** Erfolgs-Pool: INSERT-Antwort + leere Antwort fuer den Verlaufseintrag. */
function erfolgsPool(row = zeile()) {
  return sequencePool({ rows: [row] }, { rows: [] });
}

function spaltenListe(sql) {
  const m = String(sql).match(/INSERT INTO subscription_requests\s*\(([\s\S]*?)\)\s*VALUES/);
  assert.ok(m, "INSERT-Kopf mit Spaltenliste muss auffindbar sein");
  return m[1].split(",").map((s) => s.trim()).filter(Boolean);
}

function platzhalterListe(sql) {
  const m = String(sql).match(/VALUES\s*\(([\s\S]*?)\)\s*RETURNING/);
  assert.ok(m, "VALUES-Block muss auffindbar sein");
  return m[1].split(",").map((s) => s.trim()).filter(Boolean);
}

function norm(sql) {
  return String(sql).replace(/\s+/g, " ").trim();
}

/* ── Eingangspruefung: request_type ───────────────────────────── */

describe("createRequest — Anfrageart ist Pflicht", () => {
  // Schaden bei Ausfall dieser Pruefung: eine Anfrage ohne Art landet in der
  // Tabelle und keine der nachgelagerten Regeln (Plan, Freigabe, Preis) greift.
  it("ohne Eingabeobjekt wird REQUEST_TYPE_REQUIRED gemeldet", async () => {
    const pool = sequencePool();
    await assert.rejects(
      () => createRequest(pool, null),
      (e) => {
        assert.equal(e.code, "REQUEST_TYPE_REQUIRED");
        assert.equal(e.message, "REQUEST_TYPE_REQUIRED");
        return true;
      }
    );
    assert.equal(pool.calls.length, 0, "vor der Pruefung darf nichts geschrieben werden");
  });

  it("mit leerem Eingabeobjekt wird REQUEST_TYPE_REQUIRED gemeldet — nicht INVALID_REQUEST_TYPE", async () => {
    // Die Unterscheidung ist keine Kosmetik: "fehlt" fuehrt den Aufrufer zum
    // Pflichtfeld, "ungueltig" zur Auswahlliste.
    const pool = sequencePool();
    await assert.rejects(
      () => createRequest(pool, {}),
      (e) => {
        assert.equal(e.code, "REQUEST_TYPE_REQUIRED");
        assert.equal(e.message, "REQUEST_TYPE_REQUIRED");
        return true;
      }
    );
    assert.equal(pool.calls.length, 0);
  });

  it("leerer request_type-String wird wie fehlend behandelt", async () => {
    const pool = sequencePool();
    await assert.rejects(
      () => createRequest(pool, { request_type: "", contact_email: "a@b.de" }),
      (e) => {
        assert.equal(e.code, "REQUEST_TYPE_REQUIRED");
        return true;
      }
    );
    assert.equal(pool.calls.length, 0);
  });

  it("unbekannte Anfrageart wird mit INVALID_REQUEST_TYPE abgelehnt", async () => {
    const pool = sequencePool();
    await assert.rejects(
      () => createRequest(pool, { request_type: "wunschkonzert", contact_email: "a@b.de" }),
      (e) => {
        assert.equal(e.code, "INVALID_REQUEST_TYPE");
        assert.equal(e.message, "INVALID_REQUEST_TYPE");
        return true;
      }
    );
    assert.equal(pool.calls.length, 0);
  });

  it("alle fuenf katalogisierten Anfragearten werden angenommen", async () => {
    for (const art of Object.values(REQUEST_TYPES)) {
      const pool = erfolgsPool(zeile({ request_type: art }));
      await createRequest(pool, {
        request_type: art,
        contact_email: "a@b.de",
        org_id: "org-1",
        current_plan: "BASIS",
        desired_plan: "PLUS"
      });
      assert.equal(pool.calls[0].params[0], art, `${art} muss unveraendert gebunden werden`);
    }
  });
});

/* ── Eingangspruefung: Kontakt-E-Mail ─────────────────────────── */

describe("createRequest — Kontakt-E-Mail wird normalisiert und erzwungen", () => {
  it("fehlende E-Mail wird mit CONTACT_EMAIL_REQUIRED abgelehnt", async () => {
    const pool = sequencePool();
    await assert.rejects(
      () => createRequest(pool, { request_type: REQUEST_TYPES.PILOT }),
      (e) => {
        assert.equal(e.code, "CONTACT_EMAIL_REQUIRED");
        assert.equal(e.message, "CONTACT_EMAIL_REQUIRED");
        return true;
      }
    );
    assert.equal(pool.calls.length, 0);
  });

  it("eine E-Mail aus reinen Leerzeichen zaehlt als fehlend", async () => {
    // Ohne das Abschneiden der Leerzeichen entstuende eine Anfrage, die
    // niemand beantworten kann — die Rueckmeldung ginge ins Leere.
    const pool = sequencePool();
    await assert.rejects(
      () => createRequest(pool, { request_type: REQUEST_TYPES.PILOT, contact_email: "   \t  " }),
      (e) => {
        assert.equal(e.code, "CONTACT_EMAIL_REQUIRED");
        return true;
      }
    );
    assert.equal(pool.calls.length, 0);
  });

  it("Umschliessende Leerzeichen und Grossbuchstaben werden vor dem Schreiben entfernt", async () => {
    // Schaden ohne Normalisierung: dieselbe Firma erzeugt mehrere Konten,
    // Dubletten-Erkennung und Zustellung laufen auf verschiedene Schluessel.
    const pool = erfolgsPool();
    await createRequest(pool, {
      request_type: REQUEST_TYPES.NEW_INDIVIDUAL,
      contact_email: "  Chef@Firma.DE  "
    });
    assert.equal(pool.calls[0].params[4], "chef@firma.de");
  });
});

/* ── Eingangspruefung: Mandantenbindung ───────────────────────── */

describe("createRequest — Aenderungen an bestehenden Abos brauchen eine Bindung", () => {
  for (const art of [REQUEST_TYPES.UPGRADE, REQUEST_TYPES.DOWNGRADE, REQUEST_TYPES.CANCELLATION]) {
    it(`${art} ohne Organisation und ohne Nutzer wird mit ORG_OR_USER_REQUIRED abgelehnt`, async () => {
      // Schaden: eine Kuendigung oder Planaenderung ohne Zuordnung liesse sich
      // spaeter beliebig einem Mandanten zuschlagen.
      const pool = sequencePool();
      await assert.rejects(
        () => createRequest(pool, { request_type: art, contact_email: "a@b.de", current_plan: "BASIS" }),
        (e) => {
          assert.equal(e.code, "ORG_OR_USER_REQUIRED");
          assert.equal(e.message, "ORG_OR_USER_REQUIRED");
          return true;
        }
      );
      assert.equal(pool.calls.length, 0);
    });
  }

  it("allein die Nutzerkennung genuegt als Bindung", async () => {
    const pool = erfolgsPool(zeile({ request_type: "upgrade" }));
    await createRequest(pool, {
      request_type: REQUEST_TYPES.UPGRADE,
      contact_email: "a@b.de",
      user_id: "user-9",
      current_plan: "BASIS",
      desired_plan: "PLUS"
    });
    assert.equal(pool.calls[0].params[3], "user-9");
    assert.equal(pool.calls[0].params[2], null, "ohne Organisation bleibt org_id leer");
  });

  for (const art of [REQUEST_TYPES.NEW_INDIVIDUAL, REQUEST_TYPES.PILOT]) {
    it(`${art} darf ohne jede Bindung eingehen (oeffentlicher Interessent)`, async () => {
      const pool = erfolgsPool(zeile({ request_type: art }));
      await createRequest(pool, { request_type: art, contact_email: "a@b.de" });
      assert.equal(pool.calls.length, 2);
    });
  }
});

/* ── Eingangspruefung: nicht buchbare Zusatzleistungen ────────── */

describe("createRequest — angekuendigte Zusatzleistungen sind nicht bestellbar", () => {
  it("eine noch nicht verfuegbare Zusatzleistung meldet ADDON_NOT_AVAILABLE samt Liste", async () => {
    // Schaden: der Kunde bestellt und bezahlt etwas, das es nicht gibt.
    const pool = sequencePool();
    await assert.rejects(
      () => createRequest(pool, {
        request_type: REQUEST_TYPES.NEW_INDIVIDUAL,
        contact_email: "a@b.de",
        desired_addons: [{ key: "api" }, { key: "sso" }]
      }),
      (e) => {
        assert.equal(e.code, "ADDON_NOT_AVAILABLE");
        assert.equal(e.message, "ADDON_NOT_AVAILABLE");
        assert.equal(e.status, 400);
        // Gestaltprobe: genau die gesperrte Leistung, nicht die buchbare.
        assert.deepEqual(e.details, { coming_soon: ["sso"] });
        return true;
      }
    );
    assert.equal(pool.calls.length, 0, "kein Schreibvorgang vor der Sperre");
  });

  it("buchbare Zusatzleistungen passieren die Sperre unveraendert", async () => {
    const pool = erfolgsPool();
    await createRequest(pool, {
      request_type: REQUEST_TYPES.NEW_INDIVIDUAL,
      contact_email: "a@b.de",
      desired_addons: ["api", "spend"]
    });
    assert.equal(pool.calls[0].params[14], JSON.stringify(["api", "spend"]));
  });

  it("ohne Feld desired_addons wird die Sperre uebersprungen statt zu stolpern", async () => {
    // Schaden bei einer stets betretenen Sperre: jede Anfrage ohne
    // Zusatzleistungen bricht mit einem technischen Fehler ab.
    const pool = erfolgsPool();
    const row = await createRequest(pool, {
      request_type: REQUEST_TYPES.NEW_INDIVIDUAL,
      contact_email: "a@b.de"
    });
    assert.equal(row.id, "req-77");
    assert.equal(pool.calls[0].params[14], "[]");
  });
});

/* ── Eingangspruefung: Anfangsstatus ──────────────────────────── */

describe("createRequest — Anfangsstatus", () => {
  it("ein nicht katalogisierter Anfangsstatus wird mit INVALID_INITIAL_STATUS abgelehnt", async () => {
    // Schaden: ein Status ausserhalb der Zustandsmaschine ist eine Sackgasse —
    // kein Uebergang traegt ihn je wieder heraus.
    const pool = sequencePool();
    await assert.rejects(
      () => createRequest(pool, {
        request_type: REQUEST_TYPES.NEW_INDIVIDUAL,
        contact_email: "a@b.de",
        status: "halbfertig"
      }),
      (e) => {
        assert.equal(e.code, "INVALID_INITIAL_STATUS");
        assert.equal(e.message, "INVALID_INITIAL_STATUS");
        return true;
      }
    );
    assert.equal(pool.calls.length, 0);
  });

  it("ohne Angabe wird 'submitted' gebunden", async () => {
    const pool = erfolgsPool();
    await createRequest(pool, { request_type: REQUEST_TYPES.NEW_INDIVIDUAL, contact_email: "a@b.de" });
    assert.equal(pool.calls[0].params[1], STATUS.SUBMITTED);
  });

  it("ein katalogisierter Anfangsstatus wird uebernommen", async () => {
    const pool = erfolgsPool(zeile({ status: "draft" }));
    await createRequest(pool, {
      request_type: REQUEST_TYPES.NEW_INDIVIDUAL,
      contact_email: "a@b.de",
      status: STATUS.DRAFT
    });
    assert.equal(pool.calls[0].params[1], "draft");
  });
});

/* ── Einstufung Selbstbedienung ───────────────────────────────── */

describe("createRequest — Einstufung Selbstbedienung entscheidet ueber die Staff-Freigabe", () => {
  // Gelesen wird aus den Bindungen, nicht aus der Mock-Zeile: nur so faellt auf,
  // wenn die Einstufung gar nicht mehr aus der Anfrage abgeleitet wird.
  const faelle = [
    {
      name: "Neuanfrage Individuell ist nie Selbstbedienung",
      input: { request_type: REQUEST_TYPES.NEW_INDIVIDUAL },
      selbst: false
    },
    {
      name: "Pilot ist nie Selbstbedienung",
      input: { request_type: REQUEST_TYPES.PILOT },
      selbst: false
    },
    {
      name: "Hochstufung BASIS auf PLUS ist Selbstbedienung",
      input: { request_type: REQUEST_TYPES.UPGRADE, org_id: "org-1", current_plan: "BASIS", desired_plan: "PLUS" },
      selbst: true
    },
    {
      name: "Hochstufung auf INDIVIDUELL braucht Staff",
      input: { request_type: REQUEST_TYPES.UPGRADE, org_id: "org-1", current_plan: "PLUS", desired_plan: "INDIVIDUELL" },
      selbst: false
    },
    {
      name: "Herabstufung aus INDIVIDUELL heraus braucht Staff",
      input: { request_type: REQUEST_TYPES.DOWNGRADE, org_id: "org-1", current_plan: "INDIVIDUELL", desired_plan: "PRO" },
      selbst: false
    },
    {
      name: "Kuendigung eines Standardplans ist Selbstbedienung",
      input: { request_type: REQUEST_TYPES.CANCELLATION, org_id: "org-1", current_plan: "BASIS" },
      selbst: true
    },
    {
      name: "Kuendigung eines Individuell-Vertrags braucht Staff",
      input: { request_type: REQUEST_TYPES.CANCELLATION, org_id: "org-1", current_plan: "INDIVIDUELL" },
      selbst: false
    }
  ];

  for (const fall of faelle) {
    it(fall.name, async () => {
      const pool = erfolgsPool();
      await createRequest(pool, { contact_email: "a@b.de", ...fall.input });
      assert.equal(pool.calls[0].params[26], fall.selbst, "is_self_service");
      assert.equal(pool.calls[0].params[27], !fall.selbst, "requires_staff_approval ist stets das Gegenteil");
    });
  }

  it("Kuendigung ohne bekannten aktuellen Plan bindet undefined statt false", async () => {
    // ACHTUNG — festgehaltenes Ist-Verhalten, kein Wunschzustand.
    // `canBypassStaffApproval` gibt bei einer Kuendigung `req.current_plan &&
    // req.current_plan !== PLAN.INDIVIDUELL` zurueck. Fehlt der Ist-Plan, ist
    // das Ergebnis `undefined`, nicht `false`.
    // Schaden: die Spalte ist laut Migration 099 `BOOLEAN NOT NULL`; der
    // Treiber bindet `undefined` als NULL. Der Einfuegevorgang scheitert also
    // an der NOT-NULL-Bedingung — die Kuendigung geht als Serverfehler
    // verloren, statt angelegt zu werden.
    // Diese Probe haelt den Befund fest, damit die Korrektur ihn nicht
    // unbemerkt mitnimmt. Der Produktionscode bleibt hier unberuehrt.
    const pool = erfolgsPool();
    await createRequest(pool, {
      request_type: REQUEST_TYPES.CANCELLATION,
      contact_email: "a@b.de",
      org_id: "org-1"
    });
    assert.equal(pool.calls[0].params[26], undefined);
    assert.equal(pool.calls[0].params[27], true, "die Staff-Freigabe bleibt korrekt Pflicht");
  });
});

/* ── Bindungsliste: voll belegt ───────────────────────────────── */

describe("createRequest — die Bindungsliste des INSERT", () => {
  it("bei voller Belegung steht jeder Wert an seiner Stelle", async () => {
    // Gestaltprobe ueber alle 32 Bindungen. Eine vertauschte Bindung schriebe
    // die Telefonnummer in das Firmenfeld oder den Wunschplan in den Ist-Plan —
    // beides faellt im Betrieb erst auf, wenn abgerechnet wird.
    const pool = erfolgsPool(zeile({ request_type: "upgrade", is_self_service: true }));
    await createRequest(pool, {
      request_type: REQUEST_TYPES.UPGRADE,
      status: STATUS.DRAFT,
      org_id: "org-1",
      user_id: "user-1",
      contact_email: "  Chef@Firma.DE  ",
      contact_name: "Anna Beispiel",
      contact_phone: "+49 30 1234",
      requester_company_name: "Beispiel GmbH",
      source_strategic_request_id: "sr-9",
      current_plan: "BASIS",
      current_individual_tier: "S",
      desired_plan: "PLUS",
      desired_individual_tier: "M",
      desired_features: ["spend_analytics"],
      desired_addons: ["api", "spend"],
      employee_count: 120,
      user_count: 8,
      site_count: 3,
      supplier_count: 5,
      monthly_volume: "50-100",
      region_scope: "DACH",
      industry: "Logistik",
      expected_start_date: "2026-10-01",
      expected_end_date: "2027-09-30",
      proposed_price_cents: 249900,
      proposed_term_months: 12,
      context: { quelle: "preisseite" },
      submitted_ip: "203.0.113.7",
      submitted_user_agent: "Mozilla/5.0",
      reason: "Wachstum"
    });

    assert.deepEqual(pool.calls[0].params, [
      "upgrade",
      "draft",
      "org-1",
      "user-1",
      "chef@firma.de",
      "Anna Beispiel",
      "+49 30 1234",
      "Beispiel GmbH",
      "sr-9",
      "BASIS",
      "S",
      "PLUS",
      "M",
      JSON.stringify(["spend_analytics"]),
      JSON.stringify(["api", "spend"]),
      120,
      8,
      3,
      5,
      "50-100",
      "DACH",
      "Logistik",
      "2026-10-01",
      "2027-09-30",
      249900,
      12,
      true,
      false,
      JSON.stringify({ quelle: "preisseite" }),
      "203.0.113.7",
      "Mozilla/5.0",
      "user-1"
    ]);
  });

  it("bei minimaler Belegung steht ueberall NULL — nicht false, nicht undefined", async () => {
    // Der Unterschied zwischen NULL und false ist in Postgres real: eine
    // boolesche Falschaussage in einem Textfeld oder ein `false` statt NULL in
    // einer Fremdschluesselspalte laesst den Einfuegevorgang scheitern oder
    // erfindet eine Zuordnung.
    const pool = erfolgsPool();
    await createRequest(pool, {
      request_type: REQUEST_TYPES.NEW_INDIVIDUAL,
      contact_email: "lead@firma.de"
    });

    assert.deepEqual(pool.calls[0].params, [
      "new_individual",
      "submitted",
      null,
      null,
      "lead@firma.de",
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      "[]",
      "[]",
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      false,
      true,
      "{}",
      null,
      null,
      null
    ]);
  });

  it("leere Zeichenketten und Nullwerte in Zaehlfeldern werden zu NULL statt uebernommen", async () => {
    // Schaden: ein leerer String in einem Datumsfeld ist kein gueltiges Datum,
    // eine 0 als Mitarbeiterzahl ist dagegen eine echte Angabe und bleibt.
    const pool = erfolgsPool();
    await createRequest(pool, {
      request_type: REQUEST_TYPES.NEW_INDIVIDUAL,
      contact_email: "a@b.de",
      contact_name: "",
      industry: "",
      expected_start_date: "",
      employee_count: 0,
      proposed_price_cents: 0
    });
    const p = pool.calls[0].params;
    assert.equal(p[5], null, "leerer Name wird NULL");
    assert.equal(p[21], null, "leere Branche wird NULL");
    assert.equal(p[22], null, "leeres Startdatum wird NULL");
    assert.equal(p[15], 0, "die Zahl 0 ist eine Angabe und bleibt erhalten");
    assert.equal(p[24], 0, "der Preis 0 ist eine Angabe und bleibt erhalten");
  });

  it("Wunsch-Merkmale und Zusatzleistungen werden als JSON-Listen gebunden", async () => {
    // Schaden: wird hier `true`, `false` oder undefined gebunden, verliert die
    // Anfrage genau die Angaben, aus denen sich der Preis ergibt.
    const pool = erfolgsPool();
    await createRequest(pool, {
      request_type: REQUEST_TYPES.NEW_INDIVIDUAL,
      contact_email: "a@b.de",
      desired_features: ["multi_location", "contracts"],
      desired_addons: [{ key: "api" }],
      context: { kampagne: "sommer", stufen: [1, 2] }
    });
    const p = pool.calls[0].params;
    assert.equal(p[13], '["multi_location","contracts"]');
    assert.equal(p[14], '[{"key":"api"}]');
    assert.equal(p[28], '{"kampagne":"sommer","stufen":[1,2]}');
  });

  it("AUSDRUECKLICH leere Angaben bleiben leere Behaelter — sie werden nicht zu null", async () => {
    /* KORRIGIERT NACH DER GEGENPRUEFUNG (2026-09-01). Die erste Fassung fuhr
     * dieselbe minimale Eingabe wie die Gestaltprobe darueber, deren deepEqual
     * ueber alle 32 Bindungen diese drei Stellen bereits woertlich enthaelt —
     * eine Kopie mit anderem Namen, die nichts Neues trug.
     *
     * Der Fall, den es wirklich zu unterscheiden gilt, ist ein anderer: WEGGELASSEN
     * gegen AUSDRUECKLICH LEER. Wer eine Zusatzleistung entfernt, schickt eine
     * leere Liste — und die muss als leere Liste ankommen. Wuerde sie zu `null`,
     * unterschiede die Datenbank nicht mehr zwischen "keine Angabe" und "bewusst
     * keine Zusatzleistungen", und ein Entzug saehe aus wie ein vergessenes Feld. */
    const pool = erfolgsPool();
    await createRequest(pool, {
      request_type: REQUEST_TYPES.NEW_INDIVIDUAL,
      contact_email: "a@b.de",
      desired_features: [],
      desired_addons: [],
      context: {}
    });
    const p = pool.calls[0].params;
    assert.equal(p[13], "[]", "eine ausdrueckliche leere Liste bleibt eine leere Liste");
    assert.equal(p[14], "[]");
    assert.equal(p[28], "{}");
  });
});

/* ── Form der Abfrage ─────────────────────────────────────────── */

describe("createRequest — die Form des INSERT", () => {
  it("Spaltenreihenfolge und Platzhalter decken sich Stelle fuer Stelle", async () => {
    const pool = erfolgsPool();
    await createRequest(pool, { request_type: REQUEST_TYPES.NEW_INDIVIDUAL, contact_email: "a@b.de" });
    const sql = pool.calls[0].sql;

    assert.deepEqual(spaltenListe(sql), [
      "request_type", "status",
      "org_id", "user_id", "contact_email", "contact_name", "contact_phone", "requester_company_name",
      "source_strategic_request_id",
      "current_plan", "current_individual_tier",
      "desired_plan", "desired_individual_tier", "desired_features", "desired_addons",
      "employee_count", "user_count", "site_count", "supplier_count",
      "monthly_volume", "region_scope", "industry",
      "expected_start_date", "expected_end_date",
      "proposed_price_cents", "proposed_term_months",
      "is_self_service", "requires_staff_approval",
      "context", "submitted_ip", "submitted_user_agent",
      "status_updated_at", "status_updated_by"
    ]);

    assert.deepEqual(platzhalterListe(sql), [
      "$1", "$2",
      "$3", "$4", "$5", "$6", "$7", "$8",
      "$9",
      "$10", "$11",
      "$12", "$13", "$14::jsonb", "$15::jsonb",
      "$16", "$17", "$18", "$19",
      "$20", "$21", "$22",
      "$23", "$24",
      "$25", "$26",
      "$27", "$28",
      "$29::jsonb", "$30", "$31",
      "NOW()", "$32"
    ]);
  });

  it("jede Spalte hat genau einen Wert und jeder Platzhalter genau eine Bindung", async () => {
    // Schaden bei Schieflage: Postgres bindet stillschweigend versetzt, sobald
    // eine Spalte oder ein Platzhalter dazukommt oder wegfaellt.
    const pool = erfolgsPool();
    await createRequest(pool, { request_type: REQUEST_TYPES.NEW_INDIVIDUAL, contact_email: "a@b.de" });
    const sql = pool.calls[0].sql;
    const spalten = spaltenListe(sql);
    const platzhalter = platzhalterListe(sql);

    assert.equal(spalten.length, platzhalter.length, "Spalten und Werte muessen gleich viele sein");
    // NOW() ist der einzige Wert ohne Bindung.
    assert.equal(pool.calls[0].params.length, platzhalter.length - 1);
  });

  it("der Zeitstempel kommt aus der Datenbank und die eingefuegte Zeile wird zurueckgegeben", async () => {
    // Ohne RETURNING gaebe es keine Kennung fuer den Verlaufseintrag; ohne NOW()
    // haenge der Statuszeitpunkt an der Uhr des Anwendungsservers.
    const pool = erfolgsPool();
    await createRequest(pool, { request_type: REQUEST_TYPES.NEW_INDIVIDUAL, contact_email: "a@b.de" });
    const sql = norm(pool.calls[0].sql);
    assert.ok(sql.includes("NOW(), $32"), "status_updated_at kommt aus NOW()");
    assert.ok(/RETURNING \*$/.test(sql), "die Abfrage endet auf RETURNING *");
  });

  it("die eingefuegte Zeile wird unveraendert durchgereicht", async () => {
    const row = zeile({ id: "req-abc", status: "draft", is_self_service: true });
    const pool = erfolgsPool(row);
    const ergebnis = await createRequest(pool, {
      request_type: REQUEST_TYPES.NEW_INDIVIDUAL,
      contact_email: "a@b.de",
      status: STATUS.DRAFT
    });
    assert.deepEqual(ergebnis, row);
  });
});

/* ── Verlaufseintrag ──────────────────────────────────────────── */

describe("createRequest — der Verlaufseintrag beweist Wer, Was und Warum", () => {
  it("die Bindungen des Verlaufseintrags stehen vollstaendig und in dieser Reihenfolge", async () => {
    // Schaden: ohne Verlaufseintrag laesst sich spaeter nicht belegen, wer die
    // Anfrage in die Welt gesetzt hat — genau das verlangt die Audit-Regel.
    const row = zeile({ id: "req-77", status: "submitted", request_type: "upgrade", is_self_service: true });
    const pool = erfolgsPool(row);
    await createRequest(pool, {
      request_type: REQUEST_TYPES.UPGRADE,
      contact_email: "a@b.de",
      org_id: "org-1",
      user_id: "user-42",
      current_plan: "BASIS",
      desired_plan: "PLUS",
      reason: "Wachstum im Sommergeschaeft"
    });

    assert.equal(pool.calls.length, 2, "genau ein Schreibvorgang und ein Verlaufseintrag");
    assert.deepEqual(pool.calls[1].params, [
      "req-77",
      null,
      "submitted",
      "user-42",
      "Wachstum im Sommergeschaeft",
      JSON.stringify({ request_type: "upgrade", is_self_service: true })
    ]);
  });

  it("ohne angegebenen Grund wird 'create' vermerkt — nicht NULL", async () => {
    // Ein leeres Grundfeld waere ein Verlaufseintrag ohne Aussage.
    const pool = erfolgsPool();
    await createRequest(pool, { request_type: REQUEST_TYPES.NEW_INDIVIDUAL, contact_email: "a@b.de" });
    assert.equal(pool.calls[1].params[4], "create");
  });

  it("ein leerer Grund faellt auf 'create' zurueck", async () => {
    const pool = erfolgsPool();
    await createRequest(pool, {
      request_type: REQUEST_TYPES.NEW_INDIVIDUAL,
      contact_email: "a@b.de",
      reason: ""
    });
    assert.equal(pool.calls[1].params[4], "create");
  });

  it("ohne angemeldeten Nutzer bleibt das Urheberfeld leer statt erfunden", async () => {
    const pool = erfolgsPool();
    await createRequest(pool, { request_type: REQUEST_TYPES.NEW_INDIVIDUAL, contact_email: "a@b.de" });
    assert.equal(pool.calls[1].params[3], null);
    assert.equal(pool.calls[0].params[31], null, "auch status_updated_by bleibt leer");
  });

  it("der Nutzer steht im Verlauf und als Statusaenderer der Zeile", async () => {
    const pool = erfolgsPool();
    await createRequest(pool, {
      request_type: REQUEST_TYPES.NEW_INDIVIDUAL,
      contact_email: "a@b.de",
      user_id: "user-5"
    });
    assert.equal(pool.calls[1].params[3], "user-5");
    assert.equal(pool.calls[0].params[31], "user-5");
    assert.equal(pool.calls[0].params[3], "user-5");
  });

  it("die Einzelheiten nennen Anfrageart und Selbstbedienung — und sonst nichts", async () => {
    // Gestaltprobe: kein zusaetzliches Feld, keine Kontaktdaten im Verlauf.
    const row = zeile({ request_type: "cancellation", is_self_service: false });
    const pool = erfolgsPool(row);
    await createRequest(pool, {
      request_type: REQUEST_TYPES.CANCELLATION,
      contact_email: "a@b.de",
      org_id: "org-1",
      current_plan: "INDIVIDUELL"
    });
    assert.deepEqual(
      JSON.parse(pool.calls[1].params[5]),
      { request_type: "cancellation", is_self_service: false }
    );
    assert.equal(
      pool.calls[1].params[5],
      '{"request_type":"cancellation","is_self_service":false}',
      "Reihenfolge der Felder ist Teil der festgehaltenen Gestalt"
    );
  });

  it("der Verlaufseintrag beginnt ohne Vorgaengerstatus", async () => {
    // from_status muss NULL sein: eine neue Anfrage kommt aus keinem Zustand.
    const pool = erfolgsPool();
    await createRequest(pool, { request_type: REQUEST_TYPES.NEW_INDIVIDUAL, contact_email: "a@b.de" });
    assert.equal(pool.calls[1].params[1], null);
    assert.equal(pool.calls[1].params[2], "submitted", "Zielstatus stammt aus der geschriebenen Zeile");
  });

  it("der Zielstatus des Verlaufs stammt aus der GESCHRIEBENEN Zeile, nicht aus der Eingabe", async () => {
    /* KORRIGIERT NACH DER GEGENPRUEFUNG (2026-09-01). Die erste Fassung setzte
     * `zeile({ status: "draft" })` UND `status: STATUS.DRAFT` — beide Quellen
     * waren deckungsgleich, die Probe konnte sie also gar nicht trennen und
     * blieb bei einer Rueckmutation von `to_status: row.status` auf
     * `to_status: initialStatus` gruen. Sie behauptete etwas, das sie nicht
     * zeigte.
     *
     * Jetzt gehen die beiden AUSEINANDER: die Eingabe verlangt "draft", die
     * Datenbank liefert "submitted" zurueck. Massgeblich ist, was WIRKLICH
     * geschrieben wurde — sonst protokolliert der Verlauf einen Zustand, den
     * die Anfrage nie hatte. */
    const pool = erfolgsPool(zeile({ status: "submitted" }));
    await createRequest(pool, {
      request_type: REQUEST_TYPES.NEW_INDIVIDUAL,
      contact_email: "a@b.de",
      status: STATUS.DRAFT
    });
    assert.equal(pool.calls[1].params[2], "submitted",
      "der Verlauf nennt den Zustand der Zeile, nicht den gewuenschten");
  });

  it("die Form des Verlaufs-INSERT liegt fest", async () => {
    const pool = erfolgsPool();
    await createRequest(pool, { request_type: REQUEST_TYPES.NEW_INDIVIDUAL, contact_email: "a@b.de" });
    assert.equal(
      norm(pool.calls[1].sql),
      "INSERT INTO subscription_request_status_history (request_id, from_status, to_status, changed_by, reason, details) " +
      "VALUES ($1, $2, $3, $4, $5, $6::jsonb)"
    );
    assert.equal(pool.calls[1].params.length, 6);
  });
});
