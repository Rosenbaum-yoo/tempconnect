/**
 * ═══════════════════════════════════════════════════════════════════════════
 * N8.1b-7 — DAS VENTIL WIRD GELEERT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Der Vorschlagsweg ist seit Migration 160 gebaut, und er ist richtig gebaut:
 * ein vorgeschlagener Begriff erreicht den Markt NIE ungeprueft. Genau deshalb
 * ist er unter dem Owner-Entscheid vom 2026-09-22 ("keine Freitexte mehr") das
 * EINZIGE Ventil — wer einen Begriff braucht, den es nicht gibt, kann nur noch
 * hier hinein.
 *
 * GEMESSEN AM 2026-09-22, und das ist der Anlass dieser Welle:
 *
 *   `status='proposed'`      wird von KEINER Zeile im Stack gelesen
 *   `merged_into_skill_id`   schreibt niemand
 *   offene Vorschlaege       0 (alle 162 Katalogeintraege sind `approved`)
 *
 * Der Arbeiter hoert "wird geprueft", und geprueft wird nie. Die Null ist
 * dabei die WICHTIGERE Zahl: sie heisst nicht "alles erledigt", sondern "der
 * Weg wurde bisher nicht benutzt" — und das aendert sich mit dem Katalogzwang.
 *
 * DREI AUSGAENGE, und die Reihenfolge ist Absicht: ZUORDNEN zuerst. Von 54
 * katalogfremden Eintraegen im Markt sind 20 allein "Lagerhelfer" gegen
 * "Lagerhelfer:in" — eine Schreibvariante, keine neue Faehigkeit. Eine
 * Oberflaeche, die "annehmen" zuerst anbietet, laesst den Katalog wachsen, wo
 * er nur praeziser werden sollte.
 *
 * Lauf: node --test --test-force-exit test/vorschlagWirdEntschieden.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  listeVorschlaege, entscheideVorschlag, VORSCHLAG_ENTSCHEIDUNGEN
} from "../services/skillCatalogService.js";
import { getWorkerSkills } from "../services/workerService.js";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(HIER, "..");

/**
 * Ein Pool, der jede Abfrage mitschreibt und nach SQL-Merkmal antwortet.
 *
 * OHNE `connect` und OHNE `release`: `withTransaction` reicht ihn dann direkt
 * an die Funktion durch (siehe utils/transaction.js). Die Probe urteilt damit
 * ueber die Abfragen selbst, nicht ueber die Transaktionsklammer.
 */
function pool(antworten = [], { wirft = false } = {}) {
  const gesehen = [];
  return {
    gesehen,
    async query(sql, params) {
      const text = String(sql);
      gesehen.push({ sql: text, params: params || [] });
      if (wirft) throw new Error("Datenbank weg");
      for (const [marke, rows] of antworten) {
        if (text.includes(marke)) return { rows, rowCount: rows.length };
      }
      return { rows: [], rowCount: 0 };
    }
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   A) DIE LISTE — was offen ist, und was es vermutlich sein sollte
   ═══════════════════════════════════════════════════════════════════════════ */

describe("N8.1b-7 · die offenen Vorschlaege werden ueberhaupt gelesen", () => {

  it("liest genau die offenen — und holt den Katalog in EINER zweiten Abfrage", async () => {
    /* Kein N+1: der Zuordnungsvorschlag entsteht im Arbeitsspeicher ueber 162
       Katalogzeilen, nicht ueber 162 Abfragen. */
    const p = pool([
      ["FROM platform_skills ps", [{ id: "v1", name: "Lagerhelfer", created_at: "2026-09-01", traeger: 3 }]],
      ["status = 'approved' AND is_active = TRUE", [{ id: "k1", name: "Lagerhelfer:in", aliases: [] }]]
    ]);
    const erg = await listeVorschlaege(p);

    assert.equal(erg.verfuegbar, true);
    assert.equal(p.gesehen.length, 2, "mehr als zwei Abfragen — das waere ein N+1 in Zeitlupe");
    assert.ok(/status = 'proposed'/.test(p.gesehen[0].sql),
      "die Liste liest nicht die OFFENEN Vorschlaege");
    assert.ok(/ORDER BY ps\.created_at ASC/.test(p.gesehen[0].sql),
      "aelteste zuerst — sonst verhungert der erste Vorschlag zuunterst");
  });

  it("nennt, wie viele Menschen an einem Vorschlag haengen", async () => {
    /* Ohne diese Zahl ist die Kuratierung blind: ein Begriff mit 20 Traegern
       ist etwas anderes als einer mit null. */
    const p = pool([
      ["FROM platform_skills ps", [{ id: "v1", name: "Lagerhelfer", created_at: "2026-09-01", traeger: 20 }]],
      ["status = 'approved' AND is_active = TRUE", []]
    ]);
    const erg = await listeVorschlaege(p);
    assert.equal(erg.vorschlaege[0].traeger, 20);
    assert.ok(/worker_profile_skills/.test(p.gesehen[0].sql),
      "die Traegerzahl wird gar nicht erhoben");
  });

  it("schlaegt die Schreibvariante vor — der haeufigste Fall, ausgefuehrt", async () => {
    const p = pool([
      ["FROM platform_skills ps", [
        { id: "v1", name: "Lagerhelfer", created_at: "2026-09-01", traeger: 20 },
        { id: "v2", name: "Quantenschweissen", created_at: "2026-09-02", traeger: 0 }
      ]],
      ["status = 'approved' AND is_active = TRUE", [
        { id: "k1", name: "Lagerhelfer:in", aliases: [] },
        { id: "k2", name: "Bauhelfer:in", aliases: [] }
      ]]
    ]);
    const erg = await listeVorschlaege(p);

    const lager = erg.vorschlaege.find((v) => v.name === "Lagerhelfer");
    assert.deepEqual(lager.zuordnungsvorschlag.map((z) => z.name), ["Lagerhelfer:in"],
      "die Schreibvariante wird nicht vorgeschlagen — dann sucht der Kuratierende in 162 Eintraegen");

    const quanten = erg.vorschlaege.find((v) => v.name === "Quantenschweissen");
    assert.deepEqual(quanten.zuordnungsvorschlag, [],
      "ein fremdes Gewerk bekommt einen Vorschlag angeheftet — das waere geraten, nicht gemessen");
  });

  it("ein Datenbankfehler reisst die Aufsichtsseite nicht mit", async () => {
    const erg = await listeVorschlaege(pool([], { wirft: true }));
    assert.equal(erg.verfuegbar, false);
    assert.deepEqual(erg.vorschlaege, []);
  });

  it("die drei Ausgaenge stehen nach HAEUFIGKEIT, nicht nach Einfall", () => {
    assert.deepEqual(VORSCHLAG_ENTSCHEIDUNGEN, ["zuordnen", "annehmen", "ablehnen"],
      "wer kuratiert, soll die haeufigste Antwort zuerst sehen: 20 von 54 katalogfremden "
      + "Eintraegen sind eine Schreibvariante, keine neue Faehigkeit");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   B) DIE ENTSCHEIDUNG — und was sie NICHT tun darf
   ═══════════════════════════════════════════════════════════════════════════ */

const OFFEN = [["FROM platform_skills WHERE id = $1", [{ id: "v1", name: "Lagerhelfer", status: "proposed" }]]];
const ZIEL = ["status = 'approved' AND is_active = TRUE", [{ id: "k1", name: "Lagerhelfer:in" }]];

function schreibend(p) {
  return p.gesehen.filter((c) => /^\s*(UPDATE|INSERT|DELETE)/i.test(c.sql));
}

describe("N8.1b-7 · eine Entscheidung ohne Grund gibt es nicht", () => {

  it("eine zu kurze Begruendung wird abgewiesen, BEVOR irgendetwas geschrieben wird", async () => {
    const p = pool(OFFEN);
    await assert.rejects(
      () => entscheideVorschlag(p, { vorschlagId: "v1", entscheidung: "annehmen", grund: "ok" }),
      (err) => err.code === "BEGRUENDUNG_FEHLT");
    assert.deepEqual(schreibend(p), [],
      "es wurde geschrieben, obwohl die Begruendung fehlte");
  });

  it("eine unbekannte Entscheidung faellt auf, statt still nichts zu tun", async () => {
    const p = pool(OFFEN);
    await assert.rejects(
      () => entscheideVorschlag(p, { vorschlagId: "v1", entscheidung: "vielleicht", grund: "Begruendung lang genug" }),
      (err) => err.code === "UNBEKANNTE_ENTSCHEIDUNG");
    assert.deepEqual(schreibend(p), []);
  });

  it("zuordnen ohne Ziel wird abgewiesen", async () => {
    const p = pool(OFFEN);
    await assert.rejects(
      () => entscheideVorschlag(p, { vorschlagId: "v1", entscheidung: "zuordnen", grund: "Begruendung lang genug" }),
      (err) => err.code === "ZIEL_FEHLT");
    assert.deepEqual(schreibend(p), []);
  });

  it("ein bereits entschiedener Vorschlag wird nicht zweimal entschieden", async () => {
    const p = pool([["FROM platform_skills WHERE id = $1", [{ id: "v1", name: "x", status: "approved" }]]]);
    await assert.rejects(
      () => entscheideVorschlag(p, { vorschlagId: "v1", entscheidung: "annehmen", grund: "Begruendung lang genug" }),
      (err) => err.code === "SCHON_ENTSCHIEDEN");
    assert.deepEqual(schreibend(p), []);
  });

  it("der Vorschlag wird GESPERRT gelesen — zwei Kuratierende sind kein Wettlauf", async () => {
    const p = pool(OFFEN);
    await entscheideVorschlag(p, { vorschlagId: "v1", entscheidung: "annehmen", grund: "Begruendung lang genug" });
    assert.ok(/FOR UPDATE/.test(p.gesehen[0].sql),
      "ohne Sperre koennen zwei Entscheidungen denselben Vorschlag gleichzeitig treffen");
  });
});

describe("N8.1b-7 · die drei Ausgaenge tun, was sie sagen", () => {

  it("annehmen macht den Vorschlag zum Katalogeintrag", async () => {
    const p = pool(OFFEN);
    const erg = await entscheideVorschlag(p, {
      vorschlagId: "v1", entscheidung: "annehmen", grund: "Fehlte im Katalog, eigenes Gewerk"
    });
    const geschrieben = schreibend(p);
    assert.equal(geschrieben.length, 1, "annehmen schreibt genau einmal");
    assert.ok(/status = 'approved'/.test(geschrieben[0].sql));
    assert.ok(/is_active = TRUE/.test(geschrieben[0].sql));
    assert.equal(erg.entscheidung, "annehmen");
    assert.equal(erg.umgehaengt, 0);
  });

  it("ablehnen legt still, statt zu loeschen", async () => {
    /* Geloescht wird nichts: an einem Vorschlag koennen Zuordnungen haengen,
       und eine geloeschte Zeile nimmt sie per ON DELETE CASCADE mit. */
    const p = pool(OFFEN);
    await entscheideVorschlag(p, {
      vorschlagId: "v1", entscheidung: "ablehnen", grund: "Tippfehler, kein Gewerk"
    });
    const geschrieben = schreibend(p);
    assert.equal(geschrieben.length, 1);
    assert.ok(/status = 'rejected'/.test(geschrieben[0].sql));
    assert.ok(/is_active = FALSE/.test(geschrieben[0].sql));
    assert.ok(!/DELETE/i.test(geschrieben[0].sql), "ein Vorschlag wird nicht geloescht");
  });

  it("zuordnen macht den Namen zum ALIAS, haengt um und legt still — in dieser Reihenfolge", async () => {
    /*
     * Der Alias ist der eigentliche Gewinn: beim naechsten Mal trifft
     * `proposeSkill` sofort ueber ihn, und es entsteht gar kein Vorschlag mehr.
     * Ohne ihn waere die Zuordnung eine Einmal-Aufraeumung statt einer Regel.
     */
    const p = pool([...OFFEN, ZIEL]);
    const erg = await entscheideVorschlag(p, {
      vorschlagId: "v1", entscheidung: "zuordnen", zielSkillId: "k1",
      grund: "Schreibvariante von Lagerhelfer:in"
    });

    const geschrieben = schreibend(p);
    assert.equal(geschrieben.length, 4,
      "erwartet: Alias setzen, Dubletten entfernen, Zuordnungen umhaengen, Vorschlag stilllegen");

    assert.ok(/aliases/.test(geschrieben[0].sql), "der Name wird nicht zum Alias");
    assert.ok(/DELETE FROM worker_profile_skills/i.test(geschrieben[1].sql),
      "Dubletten werden nicht entfernt — die Eindeutigkeit (worker_profile_id, skill_id) schlaegt dann zu");
    assert.ok(/UPDATE worker_profile_skills SET skill_id/i.test(geschrieben[2].sql),
      "die Zuordnungen wandern nicht mit — der Arbeiter haette seine Faehigkeit verloren");
    assert.ok(/status = 'merged'/.test(geschrieben[3].sql) && /merged_into_skill_id/.test(geschrieben[3].sql),
      "der Vorschlag wird nicht als zugeordnet vermerkt");

    assert.equal(erg.ziel.name, "Lagerhelfer:in");
  });

  it("ein Ziel, das kein gueltiger Katalogeintrag ist, wird abgewiesen", async () => {
    const p = pool(OFFEN);  // die Ziel-Abfrage liefert nichts
    await assert.rejects(
      () => entscheideVorschlag(p, {
        vorschlagId: "v1", entscheidung: "zuordnen", zielSkillId: "k-weg",
        grund: "Begruendung lang genug"
      }),
      (err) => err.code === "ZIEL_UNGUELTIG");
    assert.deepEqual(schreibend(p), [],
      "es wurde umgehaengt, obwohl das Ziel nicht taugt");
  });

  it("ein Vorschlag wird nicht sich selbst zugeordnet", async () => {
    const p = pool([
      ["FROM platform_skills WHERE id = $1", [{ id: "v1", name: "x", status: "proposed" }]],
      ["status = 'approved' AND is_active = TRUE", [{ id: "v1", name: "x" }]]
    ]);
    await assert.rejects(
      () => entscheideVorschlag(p, {
        vorschlagId: "v1", entscheidung: "zuordnen", zielSkillId: "v1",
        grund: "Begruendung lang genug"
      }),
      (err) => err.code === "ZIEL_IST_VORSCHLAG");
    assert.deepEqual(schreibend(p), []);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   C) DIE FLAECHE UND DIE RUECKMELDUNG
   ═══════════════════════════════════════════════════════════════════════════ */

describe("N8.1b-7 · die Flaeche traegt die Entscheidung, der Mensch erfaehrt sie", () => {

  const lies = (...teile) => fs.readFileSync(path.join(API_ROOT, ...teile), "utf8");

  it("die Staff-Antwort traegt die Vorschlaege neben den Altbezeichnungen", () => {
    const quelle = lies("routes", "staffControlCenter.js");
    const i = quelle.indexOf('router.get("/markt-sichtbarkeit"');
    assert.ok(i > 0, "die Route ist nicht mehr auffindbar");
    const block = quelle.slice(i, i + 1800);
    assert.ok(/listeVorschlaege/.test(block), "die Vorschlaege werden nicht geholt");
    assert.ok(/faehigkeits_vorschlaege/.test(block), "das Feld heisst anders");
    assert.ok(/katalogfremde_rollen/.test(block),
      "die Altbezeichnungen sind verschwunden — beides gehoert nebeneinander");
  });

  it("die Entscheidung verlangt Bestaetigung UND Begruendung", () => {
    const quelle = lies("routes", "staffControlCenter.js");
    const i = quelle.indexOf('router.post("/faehigkeits-vorschlaege/:id/entscheiden"');
    assert.ok(i > 0, "die Entscheidung hat keinen Weg");
    const block = quelle.slice(i, i + 900);
    assert.ok(/requireStaff/.test(block), "ohne Staff-Tor");
    assert.ok(/requireConfirmAndReason/.test(block),
      "ohne Bestaetigung und Grund — eine Katalogaenderung ohne Verantwortlichen");
  });

  it("jede Entscheidung landet im Protokoll, mit Grund und Ziel", () => {
    const quelle = lies("routes", "staffControlCenter.js");
    const i = quelle.indexOf('router.post("/faehigkeits-vorschlaege/:id/entscheiden"');
    const block = quelle.slice(i, i + 2200);
    assert.ok(/res\.locals\.audit/.test(block), "kein Audit-Eintrag");
    assert.ok(/skill_catalog\.proposal_decided/.test(block), "die Aktion ist nicht benannt");
    assert.ok(/grund: req\.sccReason/.test(block), "der Grund steht nicht im Protokoll");
    assert.ok(/umgehaengte_zuordnungen/.test(block),
      "die Wirkung (wie viele Zuordnungen wanderten) steht nicht im Protokoll");
  });

  it("der Arbeiter sieht, zu welchem Eintrag sein Begriff jetzt gehoert", async () => {
    /*
     * Ohne diese Rueckmeldung saehe er nur einen anderen Namen und wuesste
     * nicht, warum. Und wer einmal nicht erfaehrt, was aus seinem Vorschlag
     * wurde, schlaegt beim naechsten Mal nichts mehr vor — dann bewirkt der
     * Katalogzwang das Gegenteil dessen, wofuer er da ist.
     */
    const p = pool([["FROM worker_profile_skills wps", [{
      id: "z1", skill_id: "k1", name: "Lagerhelfer:in", category: "Logistik",
      status: "approved", proficiency: "intermediate", years_experience: null,
      is_primary: true, certified: false, certificate_ref: null, source: "worker",
      merged_von: ["Lagerhelfer"]
    }]]]);
    const items = await getWorkerSkills(p, "wp-1");

    assert.equal(items[0].name, "Lagerhelfer:in");
    assert.deepEqual(items[0].merged_von, ["Lagerhelfer"],
      "der urspruengliche Begriff des Menschen geht verloren");
    /*
     * FORM-PROBE, und sie ist hier nicht Beiwerk: der Muster-Pool liefert
     * `merged_von` unabhaengig davon, was die Abfrage TUT. Eine Rueckmutation,
     * die `array_agg(alt.name)` durch `NULL::text[]` ersetzte, blieb deshalb
     * gruen — die Probe sah einen Wert, den sie selbst hineingelegt hatte.
     * Gepinnt wird deshalb jeder Bestandteil der Abfrage einzeln.
     */
    const sql = p.gesehen[0].sql;
    assert.ok(/array_agg\(alt\.name\)/.test(sql),
      "die Abfrage sammelt die urspruenglichen Begriffe gar nicht ein");
    assert.ok(/alt\.merged_into_skill_id = ps\.id/.test(sql),
      "die Abfrage verbindet Vorschlag und Ziel nicht");
    assert.ok(/alt\.proposed_by_user_id/.test(sql),
      "die Abfrage grenzt NICHT auf den eigenen Vorschlag ein — ein Mensch saehe damit, "
      + "welchen Begriff ein anderer eingetragen hat");
  });

  it("GEGENPROBE: ohne Zuordnung bleibt das Feld leer statt erfunden", async () => {
    const p = pool([["FROM worker_profile_skills wps", [{
      id: "z1", skill_id: "k1", name: "Altenpflege", category: "Pflege",
      status: "approved", proficiency: "expert", years_experience: 5,
      is_primary: false, certified: false, certificate_ref: null, source: "worker",
      merged_von: null
    }]]]);
    const items = await getWorkerSkills(p, "wp-1");
    assert.deepEqual(items[0].merged_von, []);
  });
});
