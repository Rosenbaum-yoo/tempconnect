/**
 * Marktpraesenz-Automatik (Welle J2b) — Verfuegbarkeit IST das Angebot.
 *
 * Zwei-Schicht-Disziplin (Erkenntnis 2026-06-03):
 *   Teil A (DB-frei, Mock-Pool): zaehlt die Query-ANZAHL (Anti-N+1) und prueft
 *     die SQL-FORM — die Regeln, an denen die Sicherheit des Sweeps haengt.
 *   Teil B (DB-gated, skip ohne DATABASE_URL): fuehrt den Sweep und den
 *     Schalter gegen die echte Datenbank aus — Postgres parst und plant die
 *     VOLLE Query und faengt damit Spalten-/Alias-Fehler, die der Mock
 *     durchlaesst. Der Schalter-Zyklus stellt den Ausgangszustand wieder her.
 *
 * Run: node --test --test-force-exit test/marktpraesenz.service.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

import { sweepMarktpraesenz, setzeMarktpraesenz } from "../services/marktpraesenzService.js";

const hasDb = !!process.env.DATABASE_URL;

function aufzeichnenderPool(antworten = {}) {
  const calls = [];
  return {
    calls,
    query: async (sql, params = []) => {
      calls.push({ sql: String(sql), params });
      for (const [muster, antwort] of Object.entries(antworten)) {
        if (String(sql).includes(muster)) return antwort;
      }
      return { rows: [{}], rowCount: 0 };
    }
  };
}

/* Sucht EINE Anweisung ueber ihre Form. Eine Probe, die auf `calls[3]` zeigt,
   prueft nach dem naechsten eingefuegten Schritt lautlos etwas anderes als ihr
   Name sagt — und bleibt dabei gruen. Mehrdeutigkeit ist hier ein Fehler, kein
   "nimm die erste": zwei passende Anweisungen hiessen, dass die Zusicherung
   nicht mehr weiss, wovon sie redet. */
function anweisung(pool, muster, name) {
  const treffer = pool.calls.filter((c) => muster.test(c.sql));
  assert.equal(treffer.length, 1, `${name}: ${treffer.length} passende Anweisungen statt genau einer`);
  return treffer[0].sql;
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  Teil A — die Form der Abfragen
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("Marktpraesenz · Teil A — Form", () => {
  it("der Sweep sind GENAU sechs Abfragen — Ruecknahme, Wiederkehr, Aufgehaltenes, Horizont, Anlage, Lueckenmass", async () => {
    /* Fixture-Pflege 2026-08-27 (Welle J9): der Horizont-Spiegel kam als
     * vierter Schritt dazu. Fixture-Pflege 2026-09-25 (M4c.3b): das Zaehlen der
     * AUFGEHALTENEN Wiederherstellungen kam dazu — eine Kraft, deren Rueckkehr
     * dauerhaft an einem besetzten Platz haengt, faellt sonst lautlos aus dem
     * Markt. Die Zaehlung waechst mit, die Regel dahinter (set-basiert, keine
     * Schleife) bleibt dieselbe: sechs feste Abfragen, keine je Kraft. */
    const pool = aufzeichnenderPool();
    await sweepMarktpraesenz(pool);
    assert.equal(pool.calls.length, 6,
      "mehr Abfragen hiesse: jemand hat eine Schleife eingebaut — der Sweep ist set-basiert");
  });

  it("die Reihenfolge ist Absicht: erst aufraeumen, dann anlegen", async () => {
    const pool = aufzeichnenderPool();
    await sweepMarktpraesenz(pool);
    assert.match(pool.calls[0].sql, /SET status = 'archived'/, "zuerst die Ruecknahme");
    assert.match(pool.calls[1].sql, /SET status = 'active'/, "dann die Wiederkehr");
    /* NACH der Wiederkehr gezaehlt: was jetzt noch aufgehalten ist, ist wirklich
       aufgehalten — vorher waere die Zahl um die gerade Zurueckgekehrten zu hoch. */
    assert.match(pool.calls[2].sql, /SELECT COUNT\(\*\)::int AS aufgehalten/, "dann das Aufgehaltene (M4c.3b)");
    assert.match(pool.calls[3].sql, /SET availability_to = wp\.einsetzbar_bis/, "dann der Horizont-Spiegel (J9)");
    assert.match(pool.calls[4].sql, /INSERT INTO capacity_posts/, "dann die Anlage");
  });

  it("die Anlage traegt Herkunft, Anonymitaet und den Ausschalter", async () => {
    const pool = aufzeichnenderPool();
    await sweepMarktpraesenz(pool);
    const sql = anweisung(pool, /INSERT INTO capacity_posts/, "die Anlage");
    assert.match(sql, /'live_belegschaft'/, "ohne Herkunft kann die Ruecknahme nicht unterscheiden");
    assert.match(sql, /marktpraesenz_deaktiviert = FALSE/, "der Ausschalter (Mig 200) muss greifen");
    assert.match(sql, /wp\.is_active = TRUE/, "inaktive Profile werden nie angeboten");
    assert.match(sql, /ON CONFLICT \(worker_profile_id, primary_skill_id\)/,
      "der Dedup-Index (Mig 145) ist der Rueckhalt gegen Doppel-Angebote");
    assert.match(sql, /NOT EXISTS/, "vorhandene Angebote (egal welcher Herkunft) haben Vorrang");
    assert.match(sql, /wp\.city IS NOT NULL/, "location_city ist NOT NULL — ein erfundener Ort waere eine Luege");
  });

  it("die Ruecknahme fasst NUR eigene, offene Zeilen an — nie laufende Geschaefte", async () => {
    const pool = aufzeichnenderPool();
    await sweepMarktpraesenz(pool);
    const sql = anweisung(pool, /SET status = 'archived'/, "die Ruecknahme");
    assert.match(sql, /quelle = 'live_belegschaft'/,
      "ein von Hand gepflegtes Angebot ist die Entscheidung der Agentur und bleibt stehen");
    assert.match(sql, /status IN \('draft', 'active', 'paused'\)/,
      "'reserved' und 'filled' tragen laufende Geschaefte — eine Praesenz-Entscheidung storniert keinen Deal");
    assert.ok(!/'reserved'|'filled'/.test(sql), "die geschuetzten Zustaende tauchen nicht einmal auf");
  });

  it("die Wiederkehr respektiert die Hard-Reserve des Reservierungs-Sweeps", async () => {
    const pool = aufzeichnenderPool();
    await sweepMarktpraesenz(pool);
    assert.match(pool.calls[1].sql, /worker_reserved = FALSE/,
      "worker_reserved-Zeilen gehoeren dem Reservierungs-Sweep — zwei Schreiber auf derselben Zeile waeren zwei Wahrheiten");
  });

  it("eine wirksam abwesende Kraft ist am Markt nicht 'verfuegbar' (Owner 2026-08-26)", async () => {
    /* Der Befund hinter der Regel: die erste Fassung bot eine heute
     * krankgeschriebene Kraft als verfuegbar an — genau das Gegenteil von
     * "ob er wirklich verfuegbar ist". Alle drei Anweisungen kennen die
     * Abwesenheit jetzt: Ruecknahme nimmt Abwesende raus, Wiederkehr und
     * Anlage lassen sie draussen, bis die Abwesenheit endet. */
    const pool = aufzeichnenderPool();
    await sweepMarktpraesenz(pool);
    /* Der Horizont-Spiegel (J9) ist bewusst NICHT dabei — er kennt keine
     * Abwesenheit: ein Datum spiegeln ist keine Verfuegbarkeitsaussage.
     * Gesucht wird ueber die FORM, nicht ueber die Position: sonst zeigt diese
     * Probe nach dem naechsten neuen Schritt auf eine andere Anweisung und
     * prueft still etwas anderes, als ihr Name sagt (M4c.3b). */
    for (const [name, muster] of [
      ["Ruecknahme", /SET status = 'archived'/],
      ["Wiederkehr", /SET status = 'active'/],
      ["Anlage", /INSERT INTO capacity_posts/]
    ]) {
      const sql = anweisung(pool, muster, name);
      assert.match(sql, /worker_absences/, name + " kennt die Abwesenheit nicht");
      assert.match(sql, /ab\.zustand = 'wirksam'/,
        name + ": nur WIRKSAME Abwesenheit zaehlt — eine erst beantragte Selbstmeldung ist eine " +
        "Entscheidung, die beim Arbeitgeber noch aussteht (H1-Linie)");
      assert.match(sql, /ab\.aufgehoben_am IS NULL/, name + ": eine zurueckgenommene Meldung sperrt nicht");
      assert.match(sql, /ab\.bis IS NULL OR ab\.bis >= CURRENT_DATE/,
        name + ": am Tag nach dem Bis-Datum kehrt die Kraft von selbst zurueck");
      assert.ok(!/ab\.art/.test(sql),
        name + ": DASS-nicht-WARUM — die ART der Abwesenheit hat im Marktplatz-SQL nichts verloren");
    }
  });

  it("der Schalter ist org-gebunden und meldet eine fremde Kraft als null", async () => {
    const pool = aufzeichnenderPool({ "UPDATE worker_profiles": { rows: [], rowCount: 0 } });
    const ergebnis = await setzeMarktpraesenz(pool, "org-a", "wp-fremd", true);
    assert.equal(ergebnis, null, "fremde Org: kein Treffer, keine Nebenwirkung");
    assert.equal(pool.calls.length, 1, "nach dem Fehlschlag laeuft KEIN Sweep");
    assert.match(pool.calls[0].sql, /supplier_org_id = \$2/, "die Mandantengrenze steht im SQL");
  });

  it("der Schalter zieht die Folgen sofort nach — kraft- UND org-gebunden", async () => {
    const pool = aufzeichnenderPool({
      "UPDATE worker_profiles": { rows: [{ id: "wp-1", marktpraesenz_deaktiviert: true }], rowCount: 1 }
    });
    const ergebnis = await setzeMarktpraesenz(pool, "org-a", "wp-1", true);
    assert.equal(ergebnis.marktpraesenz_deaktiviert, true);
    /* Fixture-Pflege 2026-09-25 (M4c.3b): das Zaehlen der aufgehaltenen
       Wiederherstellungen kam als vierte Folge dazu — dieselbe Erweiterung wie
       im Cron, denn beide Reichweiten kommen seither aus EINEM Bauplan. */
    assert.equal(pool.calls.length, 5, "Schalter + vier kraftgebundene Folgen — wer abschaltet, wartet nicht auf den Cron");
    /* Der Org-Grenzen-Waechter hat die erste Fassung abgewiesen: sie liess
     * nach dem UPDATE den GLOBALEN Sweep laufen. Seitdem gilt: JEDE
     * Anweisung dieses Weges traegt Profil UND Org in den Parametern —
     * eine Route, die fuer Org A handelt, schreibt nichts Unbeweisbares. */
    for (const call of pool.calls) {
      assert.ok(call.params.includes("wp-1"), "die Kraft-Kennung fehlt: " + call.sql.slice(0, 60));
      assert.ok(call.params.includes("org-a"), "die Org-Kennung fehlt: " + call.sql.slice(0, 60));
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 *  Teil B — gegen die echte Datenbank
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("Marktpraesenz · Teil B — echte Datenbank", { skip: !hasDb }, () => {
  it("der Sweep laeuft, ist idempotent, und der Schalter-Zyklus traegt", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    try {
      /* Lauf 1 raeumt auf, Lauf 2 muss leer sein — sonst erzeugt der Cron
       * in jedem Takt Arbeit aus dem Nichts. */
      await sweepMarktpraesenz(pool);
      const zweiter = await sweepMarktpraesenz(pool);
      assert.equal(zweiter.materialisiert, 0, "der zweite Lauf legt nichts Neues an");
      assert.equal(zweiter.zurueckgenommen, 0);
      assert.equal(zweiter.wiederhergestellt, 0);

      /* Die Lueckenmessung liefert Zahlen, keine undefined — sie speist die
       * Aufsicht (J6). */
      assert.equal(typeof zweiter.unsichtbar_ohne_skill, "number");
      assert.equal(typeof zweiter.unsichtbar_ohne_ort, "number");

      /* Eine nicht existente Kraft: null, und Postgres hat die VOLLE
       * UPDATE-Query geparst (faengt Spaltenfehler, die der Mock nie sieht). */
      const nix = await setzeMarktpraesenz(pool, "00000000-0000-0000-0000-000000000001",
        "00000000-0000-0000-0000-000000000002", true);
      assert.equal(nix, null);

      /* Der Abwesenheits-Zyklus an einer echten Kraft mit Auto-Angeboten:
       * wirksame Abwesenheit heute -> die eigenen Angebote verschwinden;
       * Meldung weg -> sie kommen zurueck. Aufgeraeumt wird in jedem Fall. */
      const { rows: abwKandidaten } = await pool.query(
        `SELECT DISTINCT cp.worker_profile_id, wp.supplier_org_id
           FROM capacity_posts cp
           JOIN worker_profiles wp ON wp.id = cp.worker_profile_id
          WHERE cp.quelle = 'live_belegschaft'
            AND cp.status IN ('draft','active','paused')
            AND NOT EXISTS (
              SELECT 1 FROM worker_absences ab
               WHERE ab.worker_profile_id = cp.worker_profile_id
                 AND ab.aufgehoben_am IS NULL AND ab.von <= CURRENT_DATE
                 AND (ab.bis IS NULL OR ab.bis >= CURRENT_DATE)
            )
          LIMIT 1`);
      if (abwKandidaten[0]) {
        const { worker_profile_id: wpId, supplier_org_id: orgId } = abwKandidaten[0];
        let absenceId = null;
        try {
          const { rows: abIns } = await pool.query(
            `INSERT INTO worker_absences (worker_profile_id, supplier_org_id, art, von, bis, zustand)
             VALUES ($1, $2, 'sonstiges', CURRENT_DATE, CURRENT_DATE, 'wirksam')
             RETURNING id`, [wpId, orgId]);
          absenceId = abIns[0].id;
          const weg = await sweepMarktpraesenz(pool);
          assert.ok(weg.zurueckgenommen >= 1,
            "eine heute wirksam abwesende Kraft muss aus dem Markt verschwinden");
          const { rows: offenAbw } = await pool.query(
            `SELECT COUNT(*)::int AS n FROM capacity_posts
              WHERE worker_profile_id = $1 AND quelle = 'live_belegschaft'
                AND status IN ('draft','active','paused')`, [wpId]);
          assert.equal(offenAbw[0].n, 0, "waehrend der Abwesenheit ist nichts offen");
        } finally {
          if (absenceId) await pool.query("DELETE FROM worker_absences WHERE id = $1", [absenceId]);
          const rueckkehr = await sweepMarktpraesenz(pool);
          assert.ok(rueckkehr.wiederhergestellt >= 1 || rueckkehr.materialisiert >= 1,
            "nach dem Ende der Abwesenheit kehrt die Kraft von selbst zurueck");
        }
      }

      /* Der volle Zyklus an einer echten Kraft mit Auto-Angeboten — falls es
       * eine gibt. Zustand wird in jedem Fall wiederhergestellt. */
      const { rows: kandidaten } = await pool.query(
        `SELECT DISTINCT cp.worker_profile_id, wp.supplier_org_id
           FROM capacity_posts cp
           JOIN worker_profiles wp ON wp.id = cp.worker_profile_id
          WHERE cp.quelle = 'live_belegschaft' AND wp.marktpraesenz_deaktiviert = FALSE
          LIMIT 1`);
      if (kandidaten[0]) {
        const { worker_profile_id: wpId, supplier_org_id: orgId } = kandidaten[0];
        try {
          const aus = await setzeMarktpraesenz(pool, orgId, wpId, true);
          assert.ok(aus.zurueckgenommen >= 1, "Abschalten nimmt die eigenen Angebote zurueck");
          const { rows: offen } = await pool.query(
            `SELECT COUNT(*)::int AS n FROM capacity_posts
              WHERE worker_profile_id = $1 AND quelle = 'live_belegschaft'
                AND status IN ('draft','active','paused')`, [wpId]);
          assert.equal(offen[0].n, 0, "nach dem Abschalten ist nichts mehr offen");
        } finally {
          const an = await setzeMarktpraesenz(pool, orgId, wpId, false);
          assert.ok(an, "der Ausgangszustand ist wiederhergestellt");
        }
      }
    } finally {
      await pool.end();
    }
  });
});
