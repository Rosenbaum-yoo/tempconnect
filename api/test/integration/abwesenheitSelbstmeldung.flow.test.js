/**
 * G1 — die Datenschicht der Abwesenheits-Selbsterfassung, am ECHTEN Schema.
 *
 * WARUM DB-GESTUETZT UND NICHT MIT ATTRAPPE
 * Was hier zaehlt, sind Zusagen der DATENBANK: Vorgabewerte, CHECK-Bedingungen,
 * ein Teil-Index. Eine Attrappe kann all das nur behaupten. In genau dieser
 * Codebasis sind zwei Defekte monatelang unsichtbar geblieben, weil die Mocks
 * Spalten erfanden, die es nicht gab (siehe notdienstAntwortpfad.flow.test.js).
 *
 * GEPRUEFT WIRD, WAS DIE OWNER-ENTSCHEIDUNGEN VERSPRECHEN:
 *   G-E1  Eine Selbstmeldung ist SOFORT wirksam — der Vorgabewert traegt das,
 *         nicht der Anwendungscode.
 *   G-E2  Die Freigabepflicht ist ein SCHALTER je Zeitarbeitsfirma, kein zweiter
 *         Codepfad. Standard: aus.
 *   G1    Eine Meldung des Mitarbeiters ist von der des Disponenten
 *         unterscheidbar — und zwar unabhaengig davon, WER sie eingetragen hat.
 *
 * Und eine Zusage, die nur die Datenbank halten kann: eine ABGELEHNTE Meldung
 * ohne Entscheider und ohne Grund darf es nicht geben. Im Anwendungscode waere
 * das eine Absicht; hier ist es eine Bedingung.
 *
 * Requires: DATABASE_URL (oder DB_HOST + POSTGRES_PASSWORD)
 * Run: node --test --test-force-exit test/integration/abwesenheitSelbstmeldung.flow.test.js
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { hasDb, createPool, createSupplierOrg } from "./helpers.js";

describe("G1 — Abwesenheit: Quelle, Zustand und Schalter am realen Schema", { skip: !hasDb && "No database configured" }, () => {
  let pool;
  let org;
  let profil;

  before(async () => {
    pool = createPool();
    // createSupplierOrg liefert die ID selbst, kein Objekt.
    org = await createSupplierOrg(pool, "G1-Selbstmeldung");

    const { rows } = await pool.query(
      // personnel_number ist Pflicht, wenn kein Konto dranhaengt: das Schema
      // verlangt eine Identitaet (worker_profiles_identitaet_chk). Genau die Sorte
      // Regel, die eine Attrappe nie zeigt — und der Grund fuer diesen Testtyp.
      `INSERT INTO worker_profiles (supplier_org_id, first_name, last_name, personnel_number)
       VALUES ($1, 'Test', 'Kraft', $2)
       RETURNING id`,
      [org, `G1-${Date.now()}`]
    );
    profil = rows[0];
  });

  after(async () => {
    if (!pool) return;
    await pool.query("DELETE FROM worker_absences WHERE supplier_org_id = $1", [org]).catch(() => {});
    await pool.query("DELETE FROM worker_profiles WHERE supplier_org_id = $1", [org]).catch(() => {});
    await pool.end();
  });

  const melden = (felder = {}) => {
    // Jede Meldung bekommt ihren EIGENEN Tag: Mig 177 verbietet ueberlappende
    // Zeitraeume je Person (EXCLUDE USING gist). Ein offenes Ende (bis = NULL)
    // wuerde jede weitere Zeile ausschliessen — die Regel ist richtig, der Test
    // muss sich danach richten.
    const von = felder.von || "2026-09-01";
    const spalten = { worker_profile_id: profil.id, supplier_org_id: org, art: "krank", bis: von, ...felder, von };
    const namen = Object.keys(spalten);
    const platz = namen.map((_, i) => `$${i + 1}`);
    return pool.query(
      `INSERT INTO worker_absences (${namen.join(", ")}) VALUES (${platz.join(", ")}) RETURNING *`,
      Object.values(spalten)
    );
  };

  /* ── G1: die Herkunft ist festgehalten ─────────────────────────────────── */

  it("ohne Angabe gilt eine Meldung als vom Disponenten — der Bestand bleibt richtig", async () => {
    const { rows } = await melden({ von: "2026-09-02" });
    assert.equal(
      rows[0].quelle,
      "disponent",
      "Vor dieser Welle gab es keinen anderen Weg. Der Vorgabewert bildet den Bestand ab, " +
        "statt ihn auf 'unbekannt' zu setzen und jede spaetere Auswertung zu vergiften"
    );
  });

  it("eine Selbstmeldung ist als solche erkennbar — unabhaengig davon, wer sie eintraegt", async () => {
    const { rows } = await melden({ von: "2026-09-03", quelle: "mitarbeiter" });
    assert.equal(rows[0].quelle, "mitarbeiter");
    assert.equal(
      rows[0].erfasst_von,
      null,
      "Die Herkunft haengt NICHT an erfasst_von: dieselbe Person kann beide Rollen haben, " +
        "und bei einem Profil ohne Konto ist das Feld leer"
    );
  });

  it("eine erfundene Quelle weist die Datenbank ab", async () => {
    await assert.rejects(
      () => melden({ von: "2026-09-04", quelle: "irgendwer" }),
      (err) => /worker_absences_quelle_chk/.test(err.message),
      "Freitext waere der Anfang vom Ende jeder Auswertung — die Liste ist geschlossen"
    );
  });

  /* ── G-E1: sofort wirksam ──────────────────────────────────────────────── */

  it("G-E1: eine Meldung gilt sofort — der Vorgabewert traegt das, nicht der Code", async () => {
    const { rows } = await melden({ von: "2026-09-05", quelle: "mitarbeiter" });
    assert.equal(
      rows[0].zustand,
      "wirksam",
      "Wer krank ist, ist krank. Ein Vorgabewert 'beantragt' wuerde die Tafel bis zur " +
        "Freigabe falsch zeigen — genau der Zustand, den diese Spur beseitigt"
    );
  });

  it("ein erfundener Zustand wird abgewiesen", async () => {
    await assert.rejects(
      () => melden({ von: "2026-09-06", zustand: "vielleicht" }),
      (err) => /worker_absences_zustand_chk/.test(err.message)
    );
  });

  /* ── Eine Ablehnung ohne Entscheider gibt es nicht ─────────────────────── */

  it("eine Ablehnung ohne Grund und ohne Zeitpunkt laesst die Datenbank nicht zu", async () => {
    await assert.rejects(
      () => melden({ von: "2026-09-07", quelle: "mitarbeiter", zustand: "abgelehnt" }),
      (err) => /worker_absences_entscheidung_chk/.test(err.message),
      "Eine abgelehnte Meldung ohne Begruendung ist keine Entscheidung, sondern ein Verschwinden. " +
        "Im Anwendungscode waere das eine Absicht — hier ist es eine Bedingung"
    );
  });

  it("mit Zeitpunkt und Grund ist die Ablehnung zulaessig und bleibt nachvollziehbar", async () => {
    const { rows } = await melden({
      von: "2026-09-08",
      quelle: "mitarbeiter",
      zustand: "abgelehnt",
      entschieden_am: new Date().toISOString(),
      entscheidung_grund: "Urlaub war bereits abgelehnt worden",
    });
    assert.equal(rows[0].zustand, "abgelehnt");
    assert.ok(rows[0].entscheidung_grund, "Der Grund bleibt an der Zeile, nicht in einem Protokoll daneben");
  });

  /* ── G-E2: der Schalter je Zeitarbeitsfirma ────────────────────────────── */

  it("G-E2: die Freigabepflicht ist ein Schalter der Firma — standardmaessig aus", async () => {
    const { rows } = await pool.query(
      `INSERT INTO org_settings (org_id) VALUES ($1)
       ON CONFLICT (org_id) DO UPDATE SET updated_at = NOW()
       RETURNING abwesenheit_selbstmeldung_freigabepflicht AS pflicht`,
      [org]
    );
    assert.equal(
      rows[0].pflicht,
      false,
      "Standard ist G-E1 (sofort wirksam). Wer Missbrauch erlebt, stellt SEINE Firma um — " +
        "ohne dass jemand Code aendert"
    );

    const { rows: um } = await pool.query(
      `UPDATE org_settings SET abwesenheit_selbstmeldung_freigabepflicht = TRUE
       WHERE org_id = $1 RETURNING abwesenheit_selbstmeldung_freigabepflicht AS pflicht`,
      [org]
    );
    assert.equal(um[0].pflicht, true, "Der Schalter muss umlegbar sein, sonst ist er keiner");
  });

  it("der Schalter wertet BESTEHENDE Meldungen nicht rueckwirkend um", async () => {
    // Die Firma steht auf Freigabepflicht (voriger Test). Eine Meldung, die
    // vorher als wirksam entstanden ist, bleibt wirksam.
    const { rows } = await pool.query(
      `SELECT zustand FROM worker_absences
       WHERE supplier_org_id = $1 AND von = '2026-09-05'`,
      [org]
    );
    assert.equal(
      rows[0].zustand,
      "wirksam",
      "Der Zustand haengt an der ZEILE, nicht am Schalter. Sonst wuerde das Umlegen " +
        "laengst disponierte Meldungen umwerten — und niemand koennte sich auf die Tafel verlassen"
    );
  });

  /* ── Der Zugriffspfad des Bueros ───────────────────────────────────────── */

  it("die offenen Selbstmeldungen haben einen eigenen Zugriffspfad", async () => {
    const { rows } = await pool.query(
      `SELECT indexdef FROM pg_indexes
       WHERE tablename = 'worker_absences' AND indexname = 'worker_absences_offene_selbstmeldungen_idx'`
    );
    assert.equal(rows.length, 1, "Ohne Teil-Index ist die taegliche Frage des Bueros ein Scan ueber alle Abwesenheiten");
    assert.match(rows[0].indexdef, /quelle = 'mitarbeiter'/);
    assert.match(rows[0].indexdef, /zustand = 'beantragt'/);
  });
});
