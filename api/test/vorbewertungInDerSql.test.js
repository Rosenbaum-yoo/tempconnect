import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

/*
 * DIE VORBEWERTUNG (Owner-Entscheid 2026-08-21: "Vorbewertung in die Datenbank
 * ziehen").
 *
 * BEFUND: `queryWorkerSuggestionBase` schnitt den Kandidatenpool mit
 * `ORDER BY wp.last_name ASC ... LIMIT n` ALPHABETISCH ab — und zwar BEVOR
 * `scoreWorkersForAssignment` bewertet. Wer hinten im Alphabet steht, kam nie
 * in die Bewertung. "Bester Treffer" waere ab einer gewissen Groesse eine
 * Behauptung gewesen, und zwar eine lautlose: es sieht aus wie eine Rangfolge.
 *
 * Gemessen am 2026-08-24: die groesste Agentur hat 12 aktive Kraefte, der
 * Schnitt liegt bei 50-250 — heute beisst er nicht. Ab ~60 schon.
 *
 * WAS AUSDRUECKLICH NICHT PASSIERT IST: die Bewertung wurde NICHT nach SQL
 * kopiert. Zwei Fassungen derselben Rangfolge waeren die naechste Drift, und
 * die teure Haelfte (Rollenfit, Schichtfit, Zuverlaessigkeit, Kundenfit)
 * braucht die Textanalyse aus `computeNeedleCoverage`. Die Abfrage sortiert
 * nach genau den HARTEN Signalen, die sie ohnehin ausrechnet.
 */

/* Zeilenenden vereinheitlichen: die Datei traegt je nach git-Durchlauf CRLF
 * oder LF. Eine Probe, die daran scheitert, prueft das Zeilenende statt den
 * Code — und wird beim naechsten Mal aus dem falschen Grund grün gemacht. */
const quelle = fs.readFileSync(new URL("../services/assignmentStaffingService.js", import.meta.url), "utf8")
  .split(String.fromCharCode(13)).join("");

/** Der ORDER-BY-Block der Basisabfrage, ohne Kommentare. */
function sortierBlock() {
  const start = quelle.indexOf("     ORDER BY\n");
  assert.ok(start >= 0, "der ORDER-BY-Block wurde nicht gefunden — greift das Muster noch?");
  const ende = quelle.indexOf("LIMIT $${limitParam}", start);
  assert.ok(ende > start, "das Ende des Blocks wurde nicht gefunden");
  return quelle.slice(start, ende).replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("Vorbewertung — der Schnitt ist nicht mehr alphabetisch", () => {
  it("der Nachname fuehrt die Sortierung NICHT mehr an", () => {
    const block = sortierBlock();
    const ersteZeile = block.split("\n").map((z) => z.trim()).filter(Boolean)[1] || "";
    assert.ok(!/^wp\.last_name/.test(ersteZeile),
      "Solange der Nachname zuerst sortiert, entscheidet das Alphabet, WER ueberhaupt " +
      "bewertet wird — und die Bewertung dahinter ordnet nur noch eine willkuerliche " +
      "Teilmenge.");
  });

  it("er bleibt als STABILER Rest erhalten", () => {
    /* Ohne einen eindeutigen letzten Schluessel liefern zwei Laeufe verschiedene
     * Reihenfolgen, sobald die vorderen Ebenen gleichstehen — und ein Disponent
     * sieht bei jedem Neuladen eine andere Liste. */
    const block = sortierBlock();
    assert.match(block, /wp\.last_name ASC, wp\.first_name ASC\s*$/,
      "der Nachname gehoert ans ENDE, nicht weg");
  });

  it("zuerst kommt, wer ueberhaupt kann — die vier harten Zaehler", () => {
    /* Es sind exakt die Zaehler, aus denen `scoreWorkersForAssignment` seine
     * hard_failures baut. Keine zweite Wahrheit, dieselbe — nur eine Ebene
     * frueher benutzt. */
    const block = sortierBlock();
    for (const zaehler of [
      "link_stats.current_assignment_count",
      "conflicts.conflict_count",
      "reservations.reservation_conflict_count",
      "absences.absence_conflict_count",
    ]) {
      assert.ok(block.includes(zaehler), `${zaehler} fehlt in der Vorbewertung`);
    }
    assert.match(block, /= 0\) DESC/, "die hart-freien muessen NACH VORN, nicht nach hinten");
  });

  it("dann die geforderten Skills", () => {
    const block = sortierBlock();
    assert.match(block, /unnest\(COALESCE\(wp\.skill_tags/,
      "die Skill-Ueberschneidung gehoert in die Vorbewertung");
    assert.match(block, /lower\(s\) = ANY \(SELECT lower\(x\)/,
      "Gross-/Kleinschreibung darf ueber einen Treffer nicht entscheiden");
  });

  it("Naehe zaehlt NUR, wenn beide Seiten Koordinaten haben", () => {
    const block = sortierBlock();
    assert.match(block, /u\.latitude IS NOT NULL AND u\.longitude IS NOT NULL/);
    assert.match(block, /ASC NULLS LAST/,
      "ohne NULLS LAST wuerden Kraefte OHNE Koordinaten als die naechsten gelten — " +
      "eine fehlende Angabe darf kein Vorteil sein");
  });

  it("S: die Probe wuerde die alte, alphabetische Fassung bemerken", () => {
    /* Rueckmutation: ohne sie belegt die Gruppe nur, dass die neue Fassung
     * passt, nicht dass sie den Rueckfall SIEHT. */
    const alt = "     ORDER BY wp.last_name ASC, wp.first_name ASC\n";
    const ersteZeile = alt.replace("     ORDER BY ", "").trim();
    assert.ok(/^wp\.last_name/.test(ersteZeile),
      "die alte Fassung fuehrte mit dem Nachnamen — genau das prueft die erste Probe");
    assert.ok(!/absence_conflict_count/.test(alt),
      "und sie kannte keinen einzigen harten Zaehler");
  });
});

describe("Vorbewertung — die Anforderungen erreichen die Abfrage", () => {
  it("die Basisabfrage leitet die Anforderungen selbst ab", () => {
    /* Sonst muesste jeder der fuenf Aufrufer sie mitgeben — und der erste, der
     * es vergisst, bekaeme lautlos wieder eine alphabetische Reihenfolge. */
    const fn = quelle.slice(quelle.indexOf("async function queryWorkerSuggestionBase"));
    assert.match(fn, /const anforderungen = deriveAssignmentRequirements\(assignment\);/,
      "die Abfrage muss die Anforderungen selbst ableiten, nicht auf Zuruf warten");
    assert.match(fn, /params\.push\(anforderungen\.required_skills \|\| \[\]\)/);
    assert.match(fn, /params\.push\(anforderungen\.location_lat \?\? null\)/);
  });

  it("die neuen Parameter stehen HINTER dem Limit — Position 6 bleibt frei", () => {
    /*
     * BEIM ERSTEN ANLAUF FALSCH GEBAUT, und der Fehler war lehrreich:
     * Die Parameterliste ist bis Position 5 fest (org, id, start, ende,
     * kundenOrg) und traegt an Position 6 OPTIONAL die Arbeiterliste. Wer die
     * Vorbewertung DAVOR einschiebt, legt an genau diese Stelle ein ARRAY —
     * und jeder Leser, der "Position 6 ist die Arbeiterliste, wenn es ein
     * Array ist" annimmt, greift daneben. Eine Probe in
     * assignmentMultiStaffingCore hielt die Skill-Liste prompt fuer eine
     * Kennungsliste und lud niemanden mehr ein (invited_workers 2 -> 1).
     *
     * SQL nummeriert; die Reihenfolge im Array ist frei. Hinter dem Limit
     * stoert die Erweiterung niemanden.
     */
    const fn = quelle.slice(quelle.indexOf("async function queryWorkerSuggestionBase"));
    const iLimit = fn.indexOf("const limitParam = params.length");
    const iSkill = fn.indexOf("const skillParam = params.length");
    assert.ok(iLimit > 0 && iSkill > iLimit,
      "Die Vorbewertungs-Parameter muessen NACH dem Limit angehaengt werden. " +
      "Davor besetzen sie die Position, an der Aufrufer die Arbeiterliste erwarten.");
  });
});

/*
 * DB-SMOKE: Postgres plant und sortiert wirklich. Ein Mock kann kein ORDER BY
 * auswerten — genau daran waere der alphabetische Schnitt nie aufgefallen.
 */
describe("Vorbewertung — DB-Smoke: der Schnitt behaelt die Richtigen",
  { skip: !(process.env.DATABASE_URL || (process.env.DB_HOST && process.env.POSTGRES_PASSWORD)) && "keine Datenbank" }, () => {
  it("bei kleinem Limit kommen die bestbewerteten zurueck, nicht die alphabetisch ersten", async () => {
    await import("../db/typeParsers.js");   // sonst kommen DATE-Spalten als 'Wed Apr 01' zurueck
    const { Pool } = await import("pg");
    const pool = new Pool(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : undefined);
    try {
      const { rows: kandidat } = await pool.query(
        `SELECT a.id, a.supplier_org_id, count(wp.*)::int AS n
           FROM assignments a
           JOIN worker_profiles wp ON wp.supplier_org_id = a.supplier_org_id
          WHERE a.start_date IS NOT NULL
          GROUP BY a.id, a.supplier_org_id
         HAVING count(wp.*) >= 3
          ORDER BY n DESC LIMIT 1`);
      if (!kandidat.length) return;   // zu wenig Bestand: nichts zu beweisen, nichts kaputt

      const asg = kandidat[0];
      const svc = await import("../services/assignmentStaffingService.js");
      const alle = await svc.listAssignmentSuggestions(pool, asg.id, asg.supplier_org_id, {});
      const geschnitten = await svc.listAssignmentSuggestions(pool, asg.id, asg.supplier_org_id, { limit: 3 });

      const punkte = (x) => Number(x.total_score ?? x.score ?? 0);
      const besteDrei = (alle.suggestions || []).slice(0, 3).map(punkte);
      const ausSchnitt = (geschnitten.suggestions || []).map(punkte);

      assert.ok(ausSchnitt.length > 0, "der Schnitt darf nicht leer sein");
      assert.deepEqual(ausSchnitt, besteDrei.slice(0, ausSchnitt.length),
        "Der Schnitt muss dieselben Kraefte liefern wie die Spitze der vollen Liste. " +
        "Frueher lieferte er die alphabetisch ersten — die Bewertung ordnete danach " +
        "nur noch eine willkuerliche Teilmenge.");

      const { rows: alpha } = await pool.query(
        `SELECT last_name FROM worker_profiles
          WHERE supplier_org_id = $1 AND is_active = TRUE
          ORDER BY last_name ASC, first_name ASC LIMIT 1`, [asg.supplier_org_id]);
      if (alpha.length && (alle.suggestions || []).length > 3) {
        const spitze = (geschnitten.suggestions || []).map((x) => x.last_name);
        const alleGleich = spitze.every((n) => n === alpha[0].last_name);
        assert.ok(!alleGleich,
          "der Schnitt darf nicht zufaellig wieder die alphabetische Reihenfolge sein");
      }
    } finally {
      await pool.end();
    }
  });
});
