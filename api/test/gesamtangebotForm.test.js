/**
 * ═══════════════════════════════════════════════════════════════════════════
 * M4c.1 — DIE FORM DER DREI BUENDEL-ANWEISUNGEN, OHNE DATENBANK
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WARUM DIESE DATEI NEBEN DEM ABLAUF-NACHWEIS EXISTIERT.
 *
 * `test/integration/gesamtangebotEntstehtMit.flow.test.js` beweist das Verhalten
 * gegen die echte Datenbank, 9 von 9. Im Tor beweist es NICHTS: auf einem Rechner
 * ohne Datenbank meldet die Datei `tests 0` — nicht "uebersprungen", nicht als
 * Luecke, gar nichts. Gemessen in der Gegenpruefung vom 2026-09-26 blieben genau
 * deshalb zwei Rueckmutationen gruen, die das Verhalten grob verletzen:
 *
 *   BUENDEL_MINDESTZAHL von 2 auf 1  -> "Allround-Kraft mit 1 Faehigkeit"
 *   die Ruecknahme stillgelegt       -> veraltete Buendel bleiben im Markt
 *
 * Die Regel daraus: EINE ZUSICHERUNG, DIE NUR MIT DATENBANK LAEUFT, IST IM TOR
 * KEINE. Der Ablauf-Nachweis bleibt — er zeigt die Wirkung, die kein Muster-Pool
 * zeigen kann. Daneben braucht jede Kernzusage einen Nachweis, der ohne Datenbank
 * rot werden kann: die Form der Anweisung und die Bindung ihrer Parameter.
 *
 * Run: node --test test/gesamtangebotForm.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  sweepMarktpraesenz, setzeMarktpraesenz, _FUER_PROBEN, OFFENE_ZUSTAENDE, BELEGENDE_ZUSTAENDE
} from "../services/marktpraesenzService.js";
import { gebundenSql } from "../services/bindungSql.js";
import { buendelTitelSql } from "../services/buendelTitel.js";

const P = _FUER_PROBEN;
const ANLEGEN = P.buendelMaterialisierenSql();
const NACHFUEHREN = P.buendelAktualisierenSql();
const ZURUECK = P.buendelZuruecknehmenSql();

/** Zeichnet die Anweisungen eines Laufs auf, ohne eine Datenbank zu brauchen. */
function aufzeichnenderPool(antworten = {}) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      for (const [muster, antwort] of Object.entries(antworten)) {
        if (sql.includes(muster)) return antwort;
      }
      return { rows: [{ aufgehalten: 0 }], rowCount: 0 };
    }
  };
}

const istBuendel = (s) => /cp\.offer_kind = 'bundle'/.test(s) || /'bundle', 'normal'/.test(s);
const buendelAnweisungen = (pool) => pool.calls.map((c) => c.sql).filter(istBuendel);

describe("M4c.1 · Form — die Mindestzahl", () => {
  it("ein Gesamtangebot braucht ZWEI Faehigkeiten, nicht eine", () => {
    /* Die Rueckmutation, die ohne Datenbank gruen blieb. Eine "Allround-Kraft"
       mit einer einzigen Faehigkeit ist kein Buendel, sondern eine Luege — und
       sie waere von einem Einzelangebot nicht zu unterscheiden. */
    assert.equal(P.BUENDEL_MINDESTZAHL, 2,
      "die Mindestzahl ist nicht 2 — dann entstehen Buendel mit einer Faehigkeit");
  });

  it("die Mindestzahl steht in ALLEN DREI Anweisungen, und in der Ruecknahme umgekehrt", () => {
    /* Nicht nur die Zahl, sondern ihre Verwendung: stuende sie nur beim Anlegen,
       blieben Buendel stehen, deren Trupp unter zwei gefallen ist. */
    assert.ok(ANLEGEN.includes(`b.anzahl >= ${P.BUENDEL_MINDESTZAHL}`),
      "das Anlegen prueft die Mindestzahl nicht");
    assert.ok(NACHFUEHREN.includes(`b.anzahl >= ${P.BUENDEL_MINDESTZAHL}`),
      "das Nachfuehren prueft die Mindestzahl nicht — es wuerde ein Ein-Faehigkeit-Buendel pflegen");
    assert.ok(ZURUECK.includes(`< ${P.BUENDEL_MINDESTZAHL}`),
      "die Ruecknahme prueft nicht auf UNTERSCHREITUNG der Mindestzahl");
  });
});

describe("M4c.1 · Form — was die drei Anweisungen zusichern", () => {
  it("das Anlegen laesst gebundene Menschen aus — mit der GETEILTEN Bindung", () => {
    assert.ok(ANLEGEN.includes(`NOT ${gebundenSql("wp.id")}`),
      "das Anlegen benutzt eine eigene Fassung der Bindung oder keine — ein gebuchter "
      + "Mensch bekaeme ein Gesamtangebot, und das ist die Darstellung, die keine "
      + "Buchung verbraucht");
  });

  it("das Anlegen laesst besetzte Plaetze aus — auch die, die der Index nicht sieht", () => {
    /* Der Eindeutigkeits-Index (Mig 220) deckt nur OFFENE Zustaende. Ein
       gebuchtes Buendel steht auf 'reserved' und faellt heraus; dort ist dieses
       NOT EXISTS der einzige Riegel. */
    assert.ok(ANLEGEN.includes("NOT EXISTS"), "das Anlegen prueft nicht auf einen besetzten Platz");
    assert.ok(ANLEGEN.includes(`cp.status IN (${BELEGENDE_ZUSTAENDE.map((z) => `'${z}'`).join(", ")})`),
      "das Anlegen prueft nur die offenen Zustaende — ein gebuchtes Buendel bekaeme einen Zwilling");
    assert.ok(BELEGENDE_ZUSTAENDE.includes("reserved") && BELEGENDE_ZUSTAENDE.includes("filled"),
      "'reserved'/'filled' gelten nicht als belegt");
  });

  it("das Anlegen traegt Herkunft, Anonymitaet und den veroeffentlichten Zustand", () => {
    assert.ok(ANLEGEN.includes("'live_belegschaft'"),
      "ohne Herkunft kann die Ruecknahme ihre eigenen Zeilen nicht erkennen");
    assert.ok(ANLEGEN.includes("'bundle', 'normal', 0, TRUE, 'live_belegschaft'"),
      "Art, Rang, Vorrang, Anonymitaet oder Herkunft stimmen nicht");
    assert.ok(/'active', TRUE,/.test(ANLEGEN),
      "ein Entwurf waere im Markt unsichtbar — die Automatik IST die Veroeffentlichung");
    assert.ok(ANLEGEN.includes("wp.einsetzbar_bis"),
      "das Gesamtangebot entsteht ohne Horizont und bliebe nach dem Einsatzende stehen");
  });

  it("der Titel kommt aus der GETEILTEN Quelle, nicht als Abschrift", () => {
    assert.ok(ANLEGEN.includes(buendelTitelSql("b.anzahl")),
      "das Anlegen schreibt einen eigenen Titel — Takt und Hand liefen auseinander");
    assert.ok(NACHFUEHREN.includes(buendelTitelSql("b.anzahl")),
      "das Nachfuehren schreibt einen eigenen Titel");
  });

  it("die Leitfaehigkeit wird gewaehlt wie auf dem Weg von Hand", () => {
    /* `loadWorkerSkills` sortiert `is_primary DESC, name`. Eine andere Wahl
       hiesse: dasselbe Buendel traegt je nach Entstehungsweg eine andere Rolle. */
    for (const [name, sql] of [["Anlegen", ANLEGEN], ["Nachfuehren", NACHFUEHREN]]) {
      assert.ok(sql.includes("ORDER BY s.is_primary DESC, s.name"),
        `${name}: die Leitfaehigkeit wird anders sortiert als in loadWorkerSkills`);
    }
  });

  it("das Nachfuehren schreibt NUR bei echter Abweichung", () => {
    /* Ohne diese Bedingung beruehrte der Takt vierundzwanzigmal am Tag jede
       Zeile, und `updated_at` — die Sortierung des Feeds — spraenge dauernd. */
    for (const teil of ["cp.skill_tags IS DISTINCT FROM b.namen",
                        "cp.primary_skill_id IS DISTINCT FROM b.leit_skill_id",
                        "cp.role IS DISTINCT FROM b.leit_name"]) {
      assert.ok(NACHFUEHREN.includes(teil), `der Leerlauf-Schutz fehlt: ${teil}`);
    }
  });

  it("Nachfuehren und Ruecknahme fassen NUR eigene, offene Zeilen an", () => {
    const offen = `cp.status IN (${OFFENE_ZUSTAENDE.map((z) => `'${z}'`).join(", ")})`;
    for (const [name, sql] of [["Nachfuehren", NACHFUEHREN], ["Ruecknahme", ZURUECK]]) {
      assert.ok(sql.includes("cp.quelle = 'live_belegschaft'"),
        `${name}: fasst auch handgemachte Buendel an`);
      assert.ok(sql.includes("cp.offer_kind = 'bundle'"),
        `${name}: ist nicht auf Gesamtangebote begrenzt`);
      assert.ok(sql.includes(offen),
        `${name}: fasst laufende Geschaefte an ('reserved'/'filled' tragen eine Buchung)`);
    }
  });

  it("die Faehigkeiten werden ueber das KATALOG-TOR gelesen, nicht nur ueber is_active", () => {
    for (const [name, sql] of [["Anlegen", ANLEGEN], ["Nachfuehren", NACHFUEHREN], ["Ruecknahme", ZURUECK]]) {
      assert.ok(/ps\.status = 'approved'/.test(sql) && /ps\.is_active/.test(sql),
        `${name}: ein unkuratierter Vorschlag zaehlt mit`);
    }
  });

  it("der Cast auf text steht — sonst scheitert der Vergleich zur Laufzeit", () => {
    /* `platform_skills.name` ist varchar, `capacity_posts.skill_tags` ist text[].
       Ohne Cast: "operator does not exist: text[] = character varying[]" — und
       zwar erst beim Lauf, nicht beim Lesen. */
    assert.ok(NACHFUEHREN.includes("ps.name::text"),
      "ohne Cast scheitert IS DISTINCT FROM gegen skill_tags zur Laufzeit");
  });
});

describe("M4c.1 · Verdrahtung — die drei Anweisungen laufen wirklich", () => {
  it("der Sweep sendet alle drei, in der Reihenfolge zuruecknehmen -> anlegen -> nachfuehren", async () => {
    /* Die zweite Rueckmutation, die ohne Datenbank gruen blieb: eine
       stillgelegte Anweisung. Gemessen wird deshalb, was GESENDET wird. */
    const pool = aufzeichnenderPool();
    await sweepMarktpraesenz(pool);
    const b = buendelAnweisungen(pool);
    assert.equal(b.length, 3, `${b.length} Buendel-Anweisungen gesendet, erwartet 3`);

    const stelle = (pruefer) => b.findIndex(pruefer);
    const iZurueck = stelle((s) => /SET status = 'archived'/.test(s));
    const iAnlegen = stelle((s) => /INSERT INTO capacity_posts/.test(s));
    const iNach = stelle((s) => /SET title = /.test(s));
    assert.ok(iZurueck >= 0, "die Ruecknahme wird nicht gesendet");
    assert.ok(iAnlegen >= 0, "das Anlegen wird nicht gesendet");
    assert.ok(iNach >= 0, "das Nachfuehren wird nicht gesendet");
    assert.ok(iZurueck < iAnlegen,
      "die Ruecknahme laeuft nach dem Anlegen — ein veraltetes Buendel haelt den Platz besetzt");
    assert.ok(iAnlegen < iNach,
      "das Nachfuehren laeuft vor dem Anlegen und findet nichts");
  });

  it("der Praesenz-Schalter sendet sie ebenfalls — kraft- UND org-gebunden", async () => {
    /* Sonst hielte das Versprechen "wer abschaltet, wartet nicht auf den Cron"
       nur zur Haelfte: Einzelangebote sofort, Gesamtangebot in 15 Minuten. */
    const pool = aufzeichnenderPool({
      "UPDATE worker_profiles": { rows: [{ id: "wp-1", marktpraesenz_deaktiviert: false }], rowCount: 1 }
    });
    await setzeMarktpraesenz(pool, "org-a", "wp-1", false);
    const b = pool.calls.filter((c) => istBuendel(c.sql));
    assert.equal(b.length, 3, `${b.length} Buendel-Anweisungen im Schalter, erwartet 3`);
    for (const c of b) {
      assert.deepEqual(c.params, ["wp-1", "org-a"],
        "eine Buendel-Anweisung des Schalters traegt nicht Kraft UND Org: " + c.sql.slice(0, 70));
      assert.ok(c.sql.includes("= $1") && c.sql.includes("= $2"),
        "die Eingrenzung steht nicht im SQL, sondern nur in den Parametern");
    }
  });

  it("der Sweep meldet, was die drei getan haben", async () => {
    /* Ein Zaehler, den niemand zurueckgibt, ist ein Schritt, dessen Ausfall
       niemand bemerkt — genau so ist die Reservierung ein Jahr lang nicht
       gelaufen (Befund F3). */
    const pool = aufzeichnenderPool();
    const e = await sweepMarktpraesenz(pool);
    for (const schluessel of ["buendel_zurueckgenommen", "buendel_materialisiert", "buendel_nachgefuehrt"]) {
      assert.ok(schluessel in e, `der Sweep meldet ${schluessel} nicht`);
      assert.equal(typeof e[schluessel], "number", `${schluessel} ist keine Zahl`);
    }
  });
});
