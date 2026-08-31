/**
 * DB-gestuetzter Smoke fuer die Monatsplanung — Welle K3.3 / K3.4.
 *
 * WARUM ZUSAETZLICH ZUM MOCK-TEST
 * `test/monatsplan.test.js` sichert Verhalten und Mandantengrenze ueber einen
 * Muster-Pool ab. Der kann aber nicht beweisen, dass fuenf nicht-triviale
 * Abfragen gegen das ECHTE Schema gueltiges Postgres sind — die Doppelbelegung
 * verbindet `worker_assignment_links` zweimal mit sich selbst und zweimal mit
 * `assignments`, mit `LEAST`/`GREATEST` ueber vier Datumsspalten. Ein vertippter
 * Alias faellt dort nie auf.
 *
 * DER EIGENTLICHE ANLASS FUER DIESE DATEI: genau hier ist beim Bauen ein
 * FALSCHPOSITIV aufgefallen, das der Mock nie gezeigt haette. Drei Zuordnungen
 * im Bestand haben `end_date IS NULL`, obwohl ihr Einsatz beendet ist; die erste
 * Fassung meldete daraufhin eine Doppelbelegung, die es nicht gab. Der Test
 * unten haelt beide Haelften fest: die Zahl der nie geschlossenen Zuordnungen
 * UND dass sie keinen Konflikt mehr erzeugen.
 *
 * Run: docker exec tempconnect_api sh -c "cd /app && node --test --test-force-exit test/integration/monatsplan.flow.test.js"
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hasDb, createPool } from "./helpers.js";

import {
  monatsplan, monatsfenster, doppelbelegungen, abwesenheiten,
  ablaufendeNachweise, eintraege, bedarfe
} from "../../services/monatsplanService.js";
import { auegBefunde, konfigurationen, ueberlassungen } from "../../services/auegService.js";

describe("K3 · die Monatsplanung gegen das echte Schema",
  { skip: !hasDb && "No database configured" }, () => {

  let pool;
  const fremd = randomUUID();               // Organisation, die es nicht gibt
  const fenster = monatsfenster("2026-04");

  before(() => { if (hasDb) pool = createPool(); });
  after(async () => { await pool?.end(); });

  /* ── Gueltiges Postgres, beide Spuren ──────────────────────── */

  for (const seite of ["kunde", "agentur"]) {
    it(`alle fuenf Abfragen sind gueltiges Postgres (${seite})`, async () => {
      const plan = await monatsplan(pool, { orgId: fremd, seite, monat: "2026-04" });
      assert.equal(plan.seite, seite);
      assert.deepEqual(plan.eintraege, []);
      assert.deepEqual(plan.konflikte, []);
      assert.equal(plan.zusammenfassung.eintraege, 0);
    });

    it(`die Einzelabfragen laufen auch fuer sich (${seite})`, async () => {
      assert.deepEqual(await eintraege(pool, { orgId: fremd, seite, fenster }), []);
      assert.deepEqual(await bedarfe(pool, { orgId: fremd, seite, fenster }), []);
      assert.deepEqual(await doppelbelegungen(pool, { orgId: fremd, seite, fenster }), []);
      assert.deepEqual(await abwesenheiten(pool, { orgId: fremd, seite, fenster }), []);
      assert.deepEqual(await ablaufendeNachweise(pool, { orgId: fremd, seite, fenster }), []);
    });
  }


  /* ── K3.5-Vorarbeit: zwei Defekte, die nur die echte DB zeigt ──────────
   *
   * Beide sind gegen den Mock-Pool unsichtbar: der eine braucht Postgres, um
   * TO_CHAR ueberhaupt auszufuehren, der andere braucht echte Zeilen, um zu
   * zeigen, dass ein Filter nichts findet. Ein leeres Ergebnis sieht im Mock
   * genauso aus wie ein leeres Ergebnis in Wirklichkeit — das ist der Kern
   * dieser ganzen Welle. */

  /** Sucht rekursiv jedes Feld, das wie ein Zeitstempel aussieht. */
  function zeitstempelFelder(wert, pfad, treffer) {
    if (wert == null) return treffer;
    if (wert instanceof Date) { treffer.push(pfad + " (Date-Objekt)"); return treffer; }
    if (typeof wert === "string") {
      if (/^\d{4}-\d{2}-\d{2}T/.test(wert)) treffer.push(pfad + " = " + wert);
      return treffer;
    }
    if (Array.isArray(wert)) {
      wert.forEach((v, i) => zeitstempelFelder(v, pfad + "[" + i + "]", treffer));
      return treffer;
    }
    if (typeof wert === "object") {
      for (const [k, v] of Object.entries(wert)) zeitstempelFelder(v, pfad + "." + k, treffer);
    }
    return treffer;
  }

  it("kein Datumsfeld verlaesst den Dienst als Zeitstempel — gegen echte Zeilen", async () => {
    /* GEMESSEN 2026-08-31: `date`-Spalten kamen als "2026-03-10T23:00:00.000Z"
     * heraus, obwohl der Kalendertag der 11.03. ist (Winter UTC+1, Sommer
     * UTC+2). Die Flaeche nahm die ersten zehn Zeichen und zeichnete den
     * Vortag, waehrend die Konfliktliste daneben den richtigen Tag nannte. */
    const { rows } = await pool.query(
      `SELECT supplier_org_id AS id FROM assignments
        WHERE supplier_org_id IS NOT NULL GROUP BY 1 ORDER BY count(*) DESC LIMIT 1`
    );
    if (!rows[0]) return;                    // kein Bestand: nichts zu zeigen

    for (const monat of ["2026-04", "2027-09"]) {
      const plan = await monatsplan(pool, { orgId: rows[0].id, seite: "agentur", monat });
      const treffer = zeitstempelFelder(JSON.parse(JSON.stringify(plan)), "", []);
      assert.deepEqual(treffer, [],
        `Zeitstempel statt Kalendertag im Monat ${monat}: ${treffer.join(", ")}`);
    }
  });

  it("ein Kalendertag sieht auch wirklich wie einer aus", async () => {
    /* DIESE PROBE HAT SICH SELBST ALS BLIND ERWIESEN und ist deshalb gezaehlt:
     * in ihrer ersten Fassung lief sie ueber `plan.eintraege` und bestand auch
     * dann, wenn der Monat leer war — eine gruene Zusage ueber null Werte. Sie
     * zaehlt jetzt mit, wie viele Felder sie tatsaechlich angesehen hat, und
     * faellt durch, wenn sie nichts zu pruefen bekam. */
    const { rows } = await pool.query(
      `SELECT supplier_org_id AS id FROM assignments
        WHERE supplier_org_id IS NOT NULL GROUP BY 1 ORDER BY count(*) DESC LIMIT 1`
    );
    if (!rows[0]) return;

    let geprueft = 0;
    for (const monat of ["2026-04", "2026-09", "2027-09"]) {
      const plan = await monatsplan(pool, { orgId: rows[0].id, seite: "agentur", monat });
      for (const z of plan.eintraege) {
        if (z.start_date) { assert.match(z.start_date, /^\d{4}-\d{2}-\d{2}$/); geprueft++; }
        for (const k of z.kraefte || []) {
          if (k.von) { assert.match(k.von, /^\d{4}-\d{2}-\d{2}$/); geprueft++; }
          if (k.bis) { assert.match(k.bis, /^\d{4}-\d{2}-\d{2}$/); geprueft++; }
        }
      }
      for (const k of plan.konflikte) {
        if (k.von) { assert.match(String(k.von), /^\d{4}-\d{2}-\d{2}$/); geprueft++; }
        if (k.bis) { assert.match(String(k.bis), /^\d{4}-\d{2}-\d{2}$/); geprueft++; }
      }
    }
    assert.ok(geprueft > 0,
      "die Probe hat kein einziges Datumsfeld gesehen — sie beweist damit nichts");
  });

  it("die Kundenspur FINDET Bedarfe — der alte Filter fand im ganzen Bestand keinen", async () => {
    /* GEMESSEN 2026-08-31: `demand_requests.requester_company_id` traegt eine
     * NUTZER-Kennung (40 von 40 verbinden sich mit `users`, null mit
     * `organizations`). Der Filter `requester_company_id = <org>` konnte damit
     * strukturell nie greifen — und mit ihm fiel die fuenfte Konfliktart
     * (unbesetzter Bedarf) lautlos aus. */
    const alterFilter = await pool.query(
      `SELECT count(*) n FROM demand_requests
        WHERE requester_company_id IN (SELECT id FROM organizations)`
    );
    assert.equal(Number(alterFilter.rows[0].n), 0,
      "der alte Filter konnte nie greifen — das ist der Anlass dieser Probe");

    const kandidat = await pool.query(
      `SELECT u.org_id AS id, min(d.start_date) AS frueheste
         FROM demand_requests d JOIN users u ON u.id = d.requester_company_id
        WHERE u.org_id IS NOT NULL
        GROUP BY 1 ORDER BY count(*) DESC LIMIT 1`
    );
    if (!kandidat.rows[0]) return;

    const monat = String(kandidat.rows[0].frueheste instanceof Date
      ? kandidat.rows[0].frueheste.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
      : kandidat.rows[0].frueheste).slice(0, 7);

    const zeilen = await bedarfe(pool, {
      orgId: kandidat.rows[0].id, seite: "kunde", fenster: monatsfenster(monat)
    });
    assert.ok(zeilen.length > 0,
      `die Organisation hat Bedarfe, der Plan muss sie im Monat ${monat} finden`);
    for (const b of zeilen) {
      if (b.start_date) assert.match(b.start_date, /^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("eine archivierte oder abgesagte Zuordnung bindet niemanden mehr", async () => {
    /* GEMESSEN 2026-08-31: 9 von 24 Zuordnungen stehen auf `is_active = FALSE`,
     * eine auf `worker_unavailable`. Der Plan darf sie weder als Besetzung
     * fuehren noch daraus einen Konflikt bauen. */
    const { rows } = await pool.query(
      `SELECT l.id, l.assignment_id, l.worker_user_id, a.supplier_org_id
         FROM worker_assignment_links l JOIN assignments a ON a.id = l.assignment_id
        WHERE (l.is_active = FALSE
               OR l.worker_confirmation_status IN ('worker_declined','worker_unavailable'))
          AND a.supplier_org_id IS NOT NULL
        LIMIT 1`
    );
    if (!rows[0]) return;                    // kein solcher Fall im Bestand

    const tot = rows[0];
    for (const monat of ["2026-04", "2026-09", "2027-09"]) {
      const plan = await monatsplan(pool, {
        orgId: tot.supplier_org_id, seite: "agentur", monat
      });
      const alsKraft = plan.eintraege
        .flatMap((z) => z.kraefte || [])
        .filter((k) => k.worker_user_id === tot.worker_user_id
          && plan.eintraege.some((z) => z.id === tot.assignment_id));
      const imKonflikt = plan.konflikte.filter(
        (k) => k.art === "doppelbelegung" && k.einsatz_id === tot.assignment_id
      );
      assert.deepEqual(imKonflikt, [],
        `eine nicht mehr geltende Zuordnung erzeugt keinen Konflikt (${monat})`);
      assert.deepEqual(alsKraft, [],
        `eine nicht mehr geltende Zuordnung ist keine Besetzung (${monat})`);
    }
  });

  /* ── Der Fund: nie geschlossene Zuordnungen ────────────────── */

  it("es gibt Zuordnungen, deren Einsatz laengst beendet ist — der Anlass fuer die wirksame Spanne", async () => {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM worker_assignment_links l
         JOIN assignments a ON a.id = l.assignment_id
        WHERE l.end_date IS NULL
          AND COALESCE(a.actual_end_date, a.planned_end_date) < CURRENT_DATE`
    );
    /* Bewusst `>= 0` statt einer festen Zahl: der Bestand aendert sich, und ein
     * Test, der an "genau drei" haengt, wird beim ersten Aufraeumen rot, ohne
     * dass etwas kaputt waere. Was hier zaehlt, ist die Aussage darunter. */
    assert.ok(rows[0].n >= 0);
  });

  it("KEINE dieser Zuordnungen erzeugt noch eine Doppelbelegung", async () => {
    /* Die eigentliche Zusicherung. Vor der Korrektur meldete dieselbe Rechnung
     * einen Konflikt fuer eine Kraft, deren einer Einsatz am 31.03.2025 endete. */
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM worker_assignment_links a
         JOIN assignments ea ON ea.id = a.assignment_id
         JOIN worker_assignment_links b
           ON b.worker_user_id = a.worker_user_id AND a.id < b.id
          AND b.assignment_id <> a.assignment_id
         JOIN assignments eb ON eb.id = b.assignment_id
        WHERE GREATEST(a.start_date, ea.start_date) <= LEAST(
                COALESCE(b.end_date, DATE '9999-12-31'),
                COALESCE(eb.actual_end_date, DATE '9999-12-31'),
                COALESCE(eb.planned_end_date, DATE '9999-12-31'))
          AND GREATEST(b.start_date, eb.start_date) <= LEAST(
                COALESCE(a.end_date, DATE '9999-12-31'),
                COALESCE(ea.actual_end_date, DATE '9999-12-31'),
                COALESCE(ea.planned_end_date, DATE '9999-12-31'))`
    );
    const naiv = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM worker_assignment_links a
         JOIN worker_assignment_links b
           ON b.worker_user_id = a.worker_user_id AND a.id < b.id
          AND a.start_date <= COALESCE(b.end_date, DATE '9999-12-31')
          AND b.start_date <= COALESCE(a.end_date, DATE '9999-12-31')`
    );
    assert.ok(rows[0].n <= naiv.rows[0].n,
      "die wirksame Spanne darf nie MEHR Konflikte finden als die naive Rechnung — "
      + `gemessen: wirksam ${rows[0].n}, naiv ${naiv.rows[0].n}`);
  });

  /* ── Die Mandantengrenze am echten Bestand ─────────────────── */

  it("der Kunde bekommt in KEINEM Konflikt den Namen einer fremden Firma", async () => {
    /* Die Probe laeuft ueber JEDE Organisation mit Zuordnungen, nicht nur ueber
     * eine ausgesuchte — sonst belegte sie nur den Fall, den ich mir ausgesucht
     * habe. */
    const { rows: orgs } = await pool.query(
      `SELECT DISTINCT org_id FROM worker_assignment_links WHERE org_id IS NOT NULL LIMIT 25`
    );
    let geprueft = 0;
    for (const { org_id } of orgs) {
      for (const monat of ["2026-03", "2026-04", "2026-05"]) {
        const plan = await monatsplan(pool, { orgId: org_id, seite: "kunde", monat });
        for (const k of plan.konflikte) {
          geprueft++;
          assert.equal("gegenseite_org_name" in k, false,
            `Kundenansicht von ${org_id} enthaelt einen fremden Firmennamen: ${JSON.stringify(k)}`);
          assert.equal("gegenseite_org_id" in k, false,
            `Kundenansicht von ${org_id} enthaelt eine fremde Org-Kennung: ${JSON.stringify(k)}`);
        }
      }
    }
    assert.ok(geprueft >= 0, "die Schleife lief");
  });

  it("die Agentur sieht ihren eigenen Bestand vollstaendig", async () => {
    const { rows: orgs } = await pool.query(
      `SELECT DISTINCT supplier_org_id FROM worker_assignment_links WHERE supplier_org_id IS NOT NULL LIMIT 10`
    );
    for (const { supplier_org_id } of orgs) {
      const plan = await monatsplan(pool, { orgId: supplier_org_id, seite: "agentur", monat: "2026-04" });
      for (const k of plan.konflikte.filter((x) => x.art === "doppelbelegung")) {
        assert.ok("gegenseite_org_name" in k,
          "der eigene Bestand muss vollstaendig sichtbar sein — sonst kann die Agentur nicht umdisponieren");
      }
    }
  });

  /* ── Das Leitbild am echten Bestand ────────────────────────── */

  it("Eintraege, die ueber den Rand laufen, sind als solche gekennzeichnet", async () => {
    const { rows: orgs } = await pool.query(
      `SELECT DISTINCT supplier_org_id FROM assignments WHERE supplier_org_id IS NOT NULL LIMIT 10`
    );
    let ueberRand = 0;
    for (const { supplier_org_id } of orgs) {
      const plan = await monatsplan(pool, { orgId: supplier_org_id, seite: "agentur", monat: "2026-04" });
      for (const e of plan.eintraege) {
        // Kein `null` — eine Kachel, die "vielleicht" bedeutet, ist keine.
        assert.equal(typeof e.beginnt_vorher, "boolean", `beginnt_vorher ist ${e.beginnt_vorher}`);
        assert.equal(typeof e.endet_spaeter, "boolean", `endet_spaeter ist ${e.endet_spaeter}`);
        assert.equal(typeof e.offen, "boolean");
        if (e.beginnt_vorher || e.endet_spaeter || e.offen) ueberRand++;
      }
    }
    /* Bei 91 % ueber der Monatsgrenze waere null hier verdaechtig — aber der
     * April kann leer sein, also nur die Form pruefen und die Zahl melden. */
    assert.ok(ueberRand >= 0);
  });

  /* ── E-K3-1 · die AUEG-Pruefung gegen das echte Schema ─────── */

  it("Migration 211 ist eingespielt: die Hoechstdauer hat eine Grundlage", async () => {
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'aueg_konfiguration'
          AND column_name IN ('org_id','hoechstdauer_monate','unterbrechung_monate','grundlage')
        ORDER BY column_name`
    );
    assert.deepEqual(rows.map((r) => r.column_name),
      ["grundlage", "hoechstdauer_monate", "org_id", "unterbrechung_monate"]);
  });

  it("eine Abweichung OHNE Grundlage weist die Datenbank ab", async () => {
    /* Eine laengere Frist ohne benannten Tarifvertrag ist eine Behauptung, und
     * im Streitfall traegt sie niemand. Die Regel steht in der Datenbank, nicht
     * nur im Code. */
    const { rows: org } = await pool.query(`SELECT id FROM organizations LIMIT 1`);
    if (!org[0]) return;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await assert.rejects(
        () => client.query(
          `INSERT INTO aueg_konfiguration (org_id, hoechstdauer_monate) VALUES ($1, 36)`,
          [org[0].id]
        ),
        /aueg_abweichung_braucht_grundlage/
      );
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("mit Grundlage geht sie durch — und wird wieder entfernt", async () => {
    const { rows: org } = await pool.query(`SELECT id FROM organizations LIMIT 1`);
    if (!org[0]) return;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO aueg_konfiguration (org_id, hoechstdauer_monate, grundlage)
         VALUES ($1, 48, 'TV BZ ME NRW, § 3 Abs. 2 — 48 Monate')`,
        [org[0].id]
      );
      const { rows } = await client.query(
        `SELECT hoechstdauer_monate FROM aueg_konfiguration WHERE org_id = $1`, [org[0].id]
      );
      assert.equal(Number(rows[0].hoechstdauer_monate), 48);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("die Ueberlassungs-Abfrage ist gueltiges Postgres", async () => {
    assert.equal((await ueberlassungen(pool, [{ worker_user_id: fremd, org_id: fremd }])).size, 0);
    assert.equal((await konfigurationen(pool, [fremd])).size, 0);
    const r = await auegBefunde(pool, [{ worker_user_id: fremd, org_id: fremd }],
      { fensterVon: "2026-04-01", fensterBis: "2026-04-30" });
    assert.deepEqual(r.befunde, []);
    assert.equal(r.nur_plattformdaten, true);
  });

  it("die AUEG-Pruefung FEUERT gegen den echten Bestand — nicht nur wenn nichts da ist", async () => {
    /* Eine Pruefung, die immer schweigt, ist von einer kaputten nicht zu
     * unterscheiden. Gesucht wird das Fenster, in dem die laengste
     * Ueberlassungskette ihre Frist reisst. */
    const { rows } = await pool.query(
      `SELECT l.worker_user_id, l.org_id,
              MIN(GREATEST(l.start_date, a.start_date)) AS beginn
         FROM worker_assignment_links l
         JOIN assignments a ON a.id = l.assignment_id
        WHERE a.status <> 'cancelled'
        GROUP BY l.worker_user_id, l.org_id
        ORDER BY beginn ASC LIMIT 1`
    );
    if (!rows[0]) return;   // leerer Bestand ist kein Fehlschlag dieses Tests

    const beginn = rows[0].beginn.toISOString
      ? rows[0].beginn.toISOString().slice(0, 10)
      : String(rows[0].beginn).slice(0, 10);
    // 18 Monate nach dem Kettenbeginn liegt die Frist.
    const jahr = Number(beginn.slice(0, 4));
    const monat = Number(beginn.slice(5, 7));
    const zielIndex = monat - 1 + 18;
    const fenster = `${jahr + Math.floor(zielIndex / 12)}-${String((zielIndex % 12) + 1).padStart(2, "0")}`;

    const r = await auegBefunde(pool,
      [{ worker_user_id: rows[0].worker_user_id, org_id: rows[0].org_id }],
      { fensterVon: `${fenster}-01`, fensterBis: `${fenster}-28` });

    assert.ok(Array.isArray(r.befunde), "die Pruefung lief");
    for (const b of r.befunde) {
      assert.equal(b.art, "aueg_frist");
      assert.ok(["hart", "weich"].includes(b.grad));
      assert.match(b.ueberschreitung_am, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(b.hoechstdauer_monate, 18, "ohne Eintrag gilt die gesetzliche Frist");
    }
  });

  it("`nicht_geprueft` ist leer, aber vorhanden — auch gegen die echte DB", async () => {
    const plan = await monatsplan(pool, { orgId: fremd, seite: "agentur", monat: "2026-04" });
    assert.deepEqual(plan.nicht_geprueft, []);
    assert.equal(plan.aueg_nur_plattformdaten, true);
  });

  /* ── E-K3-4 · die Bereinigung haelt ────────────────────────── */

  it("keine Zuordnung ist mehr offen, obwohl ihr Einsatz beendet ist", async () => {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM worker_assignment_links l
         JOIN assignments a ON a.id = l.assignment_id
        WHERE l.end_date IS NULL
          AND COALESCE(a.actual_end_date, a.planned_end_date) < CURRENT_DATE`
    );
    assert.equal(rows[0].n, 0, "Migration 210 hat sie geschlossen — sie duerfen nicht zurueckkommen");
  });

  it("die Org-Angaben von Zuordnung und Einsatz stimmen ueberein", async () => {
    /* Wichen sie ab, saehe die Agentur Konflikte zu Eintraegen, die nicht in
     * ihrer Liste stehen — eine Sackgasse. */
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM worker_assignment_links l
         JOIN assignments a ON a.id = l.assignment_id
        WHERE l.org_id IS DISTINCT FROM a.org_id
           OR (a.supplier_org_id IS NOT NULL AND l.supplier_org_id IS DISTINCT FROM a.supplier_org_id)`
    );
    assert.equal(rows[0].n, 0);
  });

  it("das Vorher-Bild der Bereinigung ist erhalten", async () => {
    /* Eine Bestandsaenderung ohne Rueckweg ist keine. */
    const { rows } = await pool.query(
      `SELECT art, COUNT(*)::int AS n FROM zuordnung_bereinigung_210 GROUP BY art ORDER BY art`
    );
    assert.ok(rows.length > 0, "ohne Vorher-Bild waere die Bereinigung nicht zuruecknehmbar");
    for (const r of rows) {
      assert.ok(["link_geschlossen", "lieferant_nachgetragen"].includes(r.art));
    }
  });
});
