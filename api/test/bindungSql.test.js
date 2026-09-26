/**
 * bindungSql — die EINE Antwort auf "ist dieser Mensch gerade gebunden?" (M4c.3b).
 *
 * Form-Probe je Bestandteil: der Muster-Pool fuehrt kein SQL aus, deshalb wird
 * jeder Teil der Bedingung einzeln festgenagelt — nicht als Block, nicht per
 * Teilzeichenkette, die in einem laengeren Ausdruck ebenfalls steckt.
 *
 * Run: node --test test/bindungSql.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { gebundenSql, BINDENDE_VEREINBARUNGEN } from "../services/bindungSql.js";

const s = gebundenSql("cp.worker_profile_id");

/** Die beiden Zweige getrennt — damit eine Zusicherung nicht im falschen Zweig Treffer findet. */
function zweige(sql) {
  const teile = sql.split(/\n\s*OR EXISTS \(/);
  assert.equal(teile.length, 2, "die Bindung hat nicht genau zwei Zweige (Einsatz ODER Buchung)");
  return { einsatz: teile[0], buchung: teile[1] };
}

describe("bindungSql — gebunden durch Einsatz ODER durch Buchung", () => {
  it("zwei Zweige, durch ODER verbunden — nicht UND", () => {
    /* Mit UND waere nur gebunden, wer eingesetzt UND gebucht ist — also fast
       niemand, und die Reservierung liefe ins Leere. */
    const { einsatz, buchung } = zweige(s);
    assert.ok(einsatz.includes("EXISTS ("), "der Einsatz-Zweig fehlt");
    assert.ok(buchung.length > 0, "der Buchungs-Zweig fehlt");
    assert.ok(!/\)\s*AND\s+EXISTS\s*\(/.test(s), "die Zweige sind mit UND verbunden");
    assert.ok(!/NOT\s+EXISTS/.test(s), "ein Zweig ist verneint");
  });

  it("Einsatz-Zweig: aktive Verknuepfung, mit Datum, am Nutzer DIESES Profils", () => {
    const { einsatz } = zweige(s);
    assert.ok(einsatz.includes("FROM worker_profiles bnd_wp"), "das Profil wird nicht gelesen");
    assert.ok(einsatz.includes("JOIN worker_assignment_links bnd_wal"), "die Einsatz-Verknuepfung fehlt");
    assert.ok(einsatz.includes("ON bnd_wal.worker_user_id = bnd_wp.user_id"), "der Einsatz haengt nicht am Nutzer des Profils");
    assert.ok(einsatz.includes("bnd_wal.is_active = TRUE"), "ein beendeter Einsatz bindet weiter");
    assert.ok(einsatz.includes("(bnd_wal.end_date IS NULL OR bnd_wal.end_date >= CURRENT_DATE)"),
      "ohne Datumsregel liefe die Bindung nie ab");
    assert.ok(einsatz.includes("WHERE bnd_wp.id = cp.worker_profile_id"), "der Einsatz ist nicht an DIESEN Menschen gebunden");
  });

  it("Buchungs-Zweig: angenommene Buchung auf einer Zeile DIESES Menschen", () => {
    const { buchung } = zweige(s);
    assert.ok(buchung.includes("FROM capacity_posts bnd_cp"), "die Zeile der Buchung wird nicht gelesen");
    assert.ok(buchung.includes("JOIN offers bnd_o ON bnd_o.capacity_post_id = bnd_cp.id"),
      "die Buchung haengt nicht an ihrer Zeile");
    assert.ok(buchung.includes("WHERE bnd_cp.worker_profile_id = cp.worker_profile_id"),
      "die Buchung ist nicht an DIESEN Menschen gebunden");
    assert.ok(buchung.includes("AND bnd_o.status = 'accepted'"), "auch nicht angenommene Angebote binden");
    assert.ok(buchung.includes("(bnd_o.end_date IS NULL OR bnd_o.end_date >= CURRENT_DATE)"),
      "eine Buchung, deren Zeitraum vorbei ist, haelt den Menschen fest");
  });

  it("die Art der Zeile schraenkt die Bindung NICHT ein", () => {
    /* Personengebunden ist, was worker_profile_id traegt — auch ein altes
       'legacy'-Angebot mit Menschen. Eine Liste der Arten waere eine
       Abschrift, die beim naechsten neuen Typ still veraltet. */
    const { buchung } = zweige(s);
    assert.ok(!buchung.includes("offer_kind"), "der Buchungs-Zweig filtert nach Angebotsart");
  });

  it("gebunden sind genau die Zustaende VOR dem Einsatz", () => {
    assert.deepEqual([...BINDENDE_VEREINBARUNGEN],
      ["none", "agreement_created", "pending_confirmation", "confirmed"]);
    /* 'activated' bindet hier bewusst nicht — ab dann bindet der Einsatz, mit
       Datum. Zaehlte die Buchung weiter, bliebe ein Mensch nach einem
       unbefristeten Deal fuer immer unsichtbar. */
    assert.ok(!BINDENDE_VEREINBARUNGEN.includes("activated"));
    assert.ok(!BINDENDE_VEREINBARUNGEN.includes("cancelled"));
    assert.ok(!BINDENDE_VEREINBARUNGEN.includes("expired"));
    const { buchung } = zweige(s);
    assert.ok(buchung.includes("COALESCE(bnd_o.agreement_status, 'none') IN ('none', 'agreement_created', 'pending_confirmation', 'confirmed')"),
      "die Zustandsliste steht nicht so im SQL, wie sie exportiert wird");
  });

  it("die Liste ist eingefroren", () => {
    assert.ok(Object.isFrozen(BINDENDE_VEREINBARUNGEN));
  });

  it("die Spalte wird eingesetzt, die gegeben wird — und nur eine Spalte", () => {
    assert.ok(gebundenSql("m.worker_profile_id").includes("WHERE bnd_wp.id = m.worker_profile_id"));
    assert.ok(gebundenSql("m.worker_profile_id").includes("WHERE bnd_cp.worker_profile_id = m.worker_profile_id"));
    for (const boese of ["x", "1); DROP TABLE offers; --", "a.b OR TRUE", "'a'.b", "$1"]) {
      assert.throws(() => gebundenSql(boese), /BINDUNG_SPALTE_UNGUELTIG/, `durchgelassen: ${boese}`);
    }
  });
});
