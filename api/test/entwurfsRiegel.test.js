/**
 * ═══════════════════════════════════════════════════════════════════════════
 * M4c.8 / M4c.9 — DER ENTWURFS-RIEGEL HAT EINEN NAMEN, EINE ZAHL UND EINE FRIST
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Gefunden bei der Messung zu M4c.0: `MATERIALISIEREN_SQL` schliesst ueber sein
 * `NOT EXISTS` auch ENTWUERFE aus — richtig, damit nichts doppelt entsteht. Ein
 * Entwurf ist im Markt aber UNSICHTBAR und besetzt trotzdem den Platz. Der Mensch
 * ist damit weder im Markt noch materialisierbar, unbegrenzt.
 *
 * Und `offeneGruende()` behauptete das Gegenteil: wer keine Gruende hat, wird mit
 * "steht im Markt — keine Zeile noetig" uebersprungen. Keine der sechs
 * Bedingungen kannte den Riegel.
 *
 * Gemessen am 2026-09-26 gegen die Entwicklungsdatenbank: 8 ueberfaellige
 * Entwuerfe, 2 betroffene Menschen — bei genau 2 markt-faehigen Menschen.
 *
 * OHNE DATENBANK (Lehre aus M4c.15): beide Seiten sind statisch lesbar.
 *
 * Run: node --test test/entwurfsRiegel.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PRAESENZ_BEDINGUNGEN, ENTWURFS_FRIST_TAGE, unsichtbareKraefte, sweepMarktpraesenz, _FUER_PROBEN
} from "../services/marktpraesenzService.js";

const RIEGEL = PRAESENZ_BEDINGUNGEN.find((b) => b.schluessel === "entwurf_blockiert");

describe("M4c.9 · die siebte Bedingung", () => {
  it("sie existiert, und zwar als Diagnose — nicht als Materialisierungs-Bedingung", () => {
    assert.ok(RIEGEL, "die siebte Bedingung fehlt — der Bericht meldet Unsichtbares als sichtbar");
    assert.equal(RIEGEL.nurDiagnose, true,
      "der Riegel steht als echte Praesenz-Bedingung drin: ein einziger Entwurf fuer "
      + "'MS Office' haette die Pflegekraft dann KOMPLETT aus dem Markt genommen");
    assert.equal(RIEGEL.wer, "firma", "beheben kann es nur, wer den Entwurf veroeffentlicht oder verwirft");
    assert.ok(RIEGEL.hinweis.length > 40, "ohne lesbaren Hinweis weiss die Firma nicht, was zu tun ist");
  });

  it("sie zaehlt nur ENTWUERFE, nicht pausierte Angebote", () => {
    /* Ein pausiertes Angebot ist die Arbeit des Reservierungs-Sweeps: die Kraft
       ist gebunden und kommt von selbst zurueck. Wer 'paused' mitzaehlte, meldete
       jede gebuchte Kraft als Problem. */
    assert.ok(RIEGEL.sql.includes("cpe.status = 'draft'"), "der Riegel prueft nicht auf Entwuerfe");
    assert.ok(!RIEGEL.sql.includes("paused"), "pausierte Angebote werden als Problem gemeldet");
    assert.ok(RIEGEL.sql.includes("NOT EXISTS"), "die Bedingung ist nicht erfuellt, wenn KEIN Entwurf blockiert");
    assert.ok(RIEGEL.sql.includes("cpe.worker_profile_id = wp.id"), "der Riegel ist nicht an DIESEN Menschen gebunden");
  });

  it("sie bringt eine ZAHL mit — ein Grund ohne Groesse ist kein Arbeitsauftrag", () => {
    assert.ok(RIEGEL.zahlSql, "die Bedingung traegt keine Zahl");
    assert.ok(RIEGEL.zahlSql.includes("COUNT(*)"), "die Zahl wird nicht gezaehlt");
    assert.ok(RIEGEL.zahlSql.includes("cpz.status = 'draft'"), "die Zahl zaehlt etwas anderes als Entwuerfe");
  });

  it("der Bericht traegt die Zahl IM Grund, mit richtiger Beugung", async () => {
    const pool = {
      query: async () => ({ rows: [{
        worker_profile_id: "wp-1", name: "Probe",
        b0: true, b1: true, b2: true, b3: true, b4: true, b5: true, b6: false, z6: 6
      }] })
    };
    const [eintrag] = await unsichtbareKraefte(pool, "org-1");
    const grund = eintrag.gruende.find((g) => g.schluessel === "entwurf_blockiert");
    assert.ok(grund, "der Riegel erscheint nicht im Bericht");
    assert.equal(grund.anzahl, 6);
    assert.equal(grund.grund, "6 Entwuerfe blockieren 6 Angebote.");

    const einer = { query: async () => ({ rows: [{
      worker_profile_id: "wp-2", name: "Eins",
      b0: true, b1: true, b2: true, b3: true, b4: true, b5: true, b6: false, z6: 1
    }] }) };
    const [zweiter] = await unsichtbareKraefte(einer, "org-1");
    assert.equal(zweiter.gruende.find((g) => g.schluessel === "entwurf_blockiert").grund,
      "1 Entwurf blockiert 1 Angebot.", "die Einzahl ist nicht gebeugt");
  });

  it("wer NUR den Riegel hat, erscheint im Bericht — vorher wurde er uebersprungen", async () => {
    /* Das war der Kern von M4c.9: `if (!gruende.length) continue` mit dem
       Kommentar "steht im Markt". Genau dieser Mensch stand NICHT im Markt. */
    const pool = { query: async () => ({ rows: [{
      worker_profile_id: "wp-1", name: "Probe",
      b0: true, b1: true, b2: true, b3: true, b4: true, b5: true, b6: false, z6: 3
    }] }) };
    const offen = await unsichtbareKraefte(pool, "org-1");
    assert.equal(offen.length, 1,
      "ein Mensch, den nur der Entwurfs-Riegel unsichtbar macht, fehlt im Bericht");
  });
});

describe("M4c.8 · die Frist", () => {
  it("es gibt eine, und sie ist eine Woche", () => {
    assert.equal(ENTWURFS_FRIST_TAGE, 7,
      "ohne Frist wird der Riegel ausgesessen; drei Tage waeren zu kurz fuer ein Wochenende, "
      + "dreissig liessen den Platz einen Monat brachliegen");
  });

  it("der Sweep meldet die ueberfaelligen Entwuerfe — neben den anderen Luecken", async () => {
    const calls = [];
    const pool = {
      query: async (sql) => {
        calls.push(sql);
        if (/AS ueberfaellig/.test(sql)) return { rows: [{ ueberfaellig: 8, betroffene_menschen: 2 }] };
        return { rows: [{ aufgehalten: 0, ohne_skill: 0, ohne_ort: 0 }], rowCount: 0 };
      }
    };
    const e = await sweepMarktpraesenz(pool);
    assert.equal(e.entwuerfe_ueberfaellig, 8, "die ueberfaelligen Entwuerfe werden nicht gemeldet");
    assert.equal(e.entwuerfe_betroffene_menschen, 2, "die betroffenen Menschen werden nicht gemeldet");
    assert.equal(e.entwurfs_frist_tage, 7, "die Frist faehrt nicht mit — dann ist die Zahl nicht deutbar");
    const abfrage = calls.find((s) => /AS ueberfaellig/.test(s));
    assert.ok(abfrage, "der Sweep fragt die ueberfaelligen Entwuerfe nicht ab");
    assert.ok(abfrage.includes(`INTERVAL '${ENTWURFS_FRIST_TAGE} days'`),
      "die Abfrage benutzt eine andere Frist als die exportierte Konstante");
    assert.ok(abfrage.includes("cp.status = 'draft'"), "die Abfrage zaehlt etwas anderes als Entwuerfe");
  });
});

describe("M4c.8/9 · die Ausnahme ist keine Hintertuer", () => {
  it("die Materialisierung traegt GENAU die Bedingungen ohne `nurDiagnose`", () => {
    /*
     * Die Ausnahme (`nurDiagnose`) ist noetig, aber sie darf nicht zur Hintertuer
     * werden: wer eine echte Praesenz-Bedingung so markiert, aendert lautlos,
     * WER im Markt erscheint. Deshalb wird hier beides gegeneinander gehalten.
     */
    const sql = _FUER_PROBEN.materialisierenSql();
    for (const b of PRAESENZ_BEDINGUNGEN) {
      if (b.nurDiagnose) {
        assert.ok(!sql.includes(b.sql),
          `${b.schluessel} ist als Diagnose markiert, steht aber in der Materialisierung`);
      } else {
        assert.ok(sql.includes(b.sql),
          `${b.schluessel} fehlt in der Materialisierung — dann erscheint jemand im Markt, der nicht darf`);
      }
    }
  });

  it("genau ZWEI Bedingungen sind als Diagnose markiert, und zwar diese", () => {
    /* Waechst die Zahl, ist entweder eine echte Bedingung stillgelegt worden
       oder es gibt einen weiteren Riegel, der eine eigene Begruendung braucht.
       Fixture-Pflege 2026-10-03 (M4b.3): die achte Bedingung kam dazu —
       `nur_vorschlag`. Sie ist KEINE zusaetzliche Huerde: wer nur einen Vorschlag
       hat, scheitert bereits an `keine_freigegebene_faehigkeit`. Sie VERFEINERT
       die Erklaerung, damit "wird geprueft" nicht denselben Satz bekommt wie
       "nichts eingetragen" — genau die stille Abwesenheit, die M4b.3 verbietet.
       Stuende sie in der Materialisierung, waere derselbe Mensch zweimal
       ausgeschlossen; die Probe darueber erzwingt, dass sie es nicht tut. */
    const diagnose = PRAESENZ_BEDINGUNGEN.filter((b) => b.nurDiagnose).map((b) => b.schluessel);
    assert.deepEqual(diagnose, ["entwurf_blockiert", "nur_vorschlag"],
      "die Zahl der Diagnose-Bedingungen hat sich geaendert — jede braucht ihre eigene Begruendung");
    assert.equal(PRAESENZ_BEDINGUNGEN.length, 8, "die Zahl der Bedingungen hat sich geaendert");
  });
});
