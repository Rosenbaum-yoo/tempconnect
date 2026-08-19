/**
 * Gate H1 gegen das REALE Schema — der Kunde sieht den Ausfall, nicht den Grund.
 *
 * WAS EIN MOCK HIER GRUNDSAETZLICH NICHT KANN:
 *  1. DIE MANDANTENGRENZE DER ABWESENHEIT BELEGEN. `wal.org_id` ist der
 *     Besteller, `wal.supplier_org_id` der Lieferant, `ab.supplier_org_id` die
 *     Firma, bei der die Meldung liegt. Ein Mock beantwortet alle drei gleich —
 *     die Abwesenheit der FALSCHEN Firma anzuzeigen saehe in einem
 *     Ergebnistest identisch aus.
 *  2. EINEN CHECK ERZWINGEN. `worker_absences.zustand` kennt nur
 *     'wirksam'|'beantragt'|'abgelehnt' (Mig 181); die Freigabepflicht aus
 *     G-E2 haengt daran. Der Mock nimmt jeden Wert an.
 *  3. DEN DATUMSTYP PRUEFEN. `bis` ist DATE. Ob die Antwort 'YYYY-MM-DD' oder
 *     einen UTC-Zeitpunkt traegt (der den Tag verschiebt), entscheiden die
 *     Typparser — nicht das Fixture.
 *
 * EINE KORRIGIERTE ANNAHME, DIE HIER MITGEPRUEFT WIRD:
 * Die Vorabrecherche zu H1 hielt `worker_profiles(user_id)` fuer nicht
 * eindeutig und leitete daraus zwei Befunde ab (Zeilenvervielfachung, Join auf
 * die falsche Firma). Gelesen wurde der INDEX in Mig 029:57-58 — das inline
 * UNIQUE steht aber in Zeile 35 derselben Datei. Eine Person hat also
 * hoechstens EIN Profil mit Konto. Der letzte Test dieser Datei haelt genau
 * diese Zusage fest: bricht sie eines Tages, wird die Kundenabfrage
 * mehrdeutig, und dieser Test sagt es, bevor es jemand in Produktion merkt.
 *
 * Requires: DATABASE_URL (oder DB_HOST + POSTGRES_PASSWORD)
 * Run: docker exec tempconnect_api sh -c "cd /app && node --test --test-force-exit test/integration/h1KundeSiehtAusfall.flow.test.js"
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { hasDb, createPool } from "./helpers.js";
import { getCompanyLiveWorkforce } from "../../services/workforceService.js";

/** Die Angaben, die den Kunden nichts angehen — hier gegen ECHTE Zeilen. */
const VERRAETERISCH = ["krank", "grippe", "hausarzt", "fieber", "attest", "bandscheibe"];

describe("Gate H1 — die Kundenansicht am realen Schema", { skip: !hasDb && "No database configured" }, () => {
  let pool;
  const ids = {};
  const marke = `h1-${Date.now()}`;

  async function org(name, typ) {
    const { rows } = await pool.query(
      `INSERT INTO organizations (name, slug, type, plan) VALUES ($1,$2,$3,'INDIVIDUELL') RETURNING id`,
      [name, `${marke}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, typ]
    );
    return rows[0].id;
  }

  before(async () => {
    if (!hasDb) return;
    pool = createPool();

    ids.kunde = await org("H1 Einsatzbetrieb", "company");
    ids.agenturA = await org("H1 Zeitarbeit A", "agency");
    ids.agenturB = await org("H1 Zeitarbeit B", "agency");

    const { rows: u } = await pool.query(
      `INSERT INTO users (email, password_hash, role) VALUES ($1,'x','worker') RETURNING id`,
      [`${marke}-kraft@test.local`]
    );
    ids.kraft = u[0].id;

    /* Das Profil liegt bei Agentur A. */
    const { rows: p } = await pool.query(
      `INSERT INTO worker_profiles (user_id, supplier_org_id, first_name, last_name, personnel_number)
       VALUES ($1,$2,'Anna','Bauer',$3) RETURNING id`,
      [ids.kraft, ids.agenturA, `${marke}-A`]
    );
    ids.profil = p[0].id;

    const { rows: a } = await pool.query(
      `INSERT INTO assignments (org_id, supplier_org_id, start_date, planned_end_date, status, worker_description)
       VALUES ($1,$2,CURRENT_DATE - 10, CURRENT_DATE + 60, 'active', 'Lager') RETURNING id`,
      [ids.kunde, ids.agenturA]
    );
    ids.einsatz = a[0].id;

    const { rows: l } = await pool.query(
      `INSERT INTO worker_assignment_links
         (worker_user_id, assignment_id, org_id, supplier_org_id, role, start_date, end_date, is_active, worker_confirmation_status)
       VALUES ($1,$2,$3,$4,'primary', CURRENT_DATE - 10, CURRENT_DATE + 60, TRUE, 'worker_confirmed')
       RETURNING id`,
      [ids.kraft, ids.einsatz, ids.kunde, ids.agenturA]
    );
    ids.link = l[0].id;
  });

  after(async () => {
    if (!hasDb || !pool) return;
    await pool.query("DELETE FROM worker_absences WHERE supplier_org_id = ANY($1::uuid[])", [[ids.agenturA, ids.agenturB]]);
    await pool.query("DELETE FROM worker_assignment_links WHERE assignment_id = $1", [ids.einsatz]);
    await pool.query("DELETE FROM assignments WHERE id = $1", [ids.einsatz]);
    await pool.query("DELETE FROM worker_profiles WHERE user_id = $1", [ids.kraft]);
    await pool.query("DELETE FROM users WHERE id = $1", [ids.kraft]);
    await pool.query("DELETE FROM organizations WHERE id = ANY($1::uuid[])", [[ids.kunde, ids.agenturA, ids.agenturB]]);
    await pool.end();
  });

  /** Eine Abwesenheit MIT allem, was den Kunden nichts angeht. */
  async function abwesenheit({ supplier = null, zustand = "wirksam", bis = null } = {}) {
    const { rows } = await pool.query(
      `INSERT INTO worker_absences (worker_profile_id, supplier_org_id, art, von, bis, notiz, beschreibung, quelle, zustand)
       VALUES ($1,$2,'krank', CURRENT_DATE - 1, $3, 'Grippe, Hausarzt', $4, 'mitarbeiter', $5)
       RETURNING id`,
      [ids.profil, supplier || ids.agenturA, bis,
        "Seit gestern Fieber, war beim Hausarzt, Attest liegt vor, melde mich Montag.", zustand]
    );
    return rows[0].id;
  }
  const leere = async () =>
    pool.query("DELETE FROM worker_absences WHERE worker_profile_id = $1", [ids.profil]);

  /** Die Verknuepfung voruebergehend auf eine andere liefernde Firma stellen. */
  const lieferantAuf = async (orgId) =>
    pool.query("UPDATE worker_assignment_links SET supplier_org_id = $1 WHERE id = $2", [orgId, ids.link]);

  it("ohne Abwesenheit steht die Kraft genau einmal und vollstaendig in der Liste", async () => {
    await leere();
    const board = await getCompanyLiveWorkforce(pool, ids.kunde);
    assert.equal(board.workers.length, 1);
    assert.equal(board.kpis.total, 1);
    assert.equal(board.workers[0].live_status, "im_einsatz");
    assert.equal(board.workers[0].ausfall_bis, null);
    assert.equal(board.workers[0].last_name, "Bauer", "Gegenprobe: es wurde wirklich diese Zeile geladen");
  });

  it("die Zeile traegt die echte Einsatz-Kennung, auf die der Deep-Link zeigt", async () => {
    const board = await getCompanyLiveWorkforce(pool, ids.kunde);
    assert.equal(board.workers[0].assignment_id, ids.einsatz);
    assert.equal(board.workers[0].link_id, ids.link);
  });

  it("eine WIRKSAME Abwesenheit der liefernden Firma erreicht den Kunden", async () => {
    await leere();
    await abwesenheit();
    const board = await getCompanyLiveWorkforce(pool, ids.kunde);
    assert.equal(board.workers[0].live_status, "faellt_aus");
    assert.equal(board.kpis.faellt_aus, 1);
    assert.equal(board.kpis.im_einsatz, 0);
  });

  it("das voraussichtliche Ende kommt als Datum an, nicht als Zeitstempel", async () => {
    await leere();
    await abwesenheit({ bis: "2099-12-24" });
    const board = await getCompanyLiveWorkforce(pool, ids.kunde);
    assert.equal(board.workers[0].ausfall_bis, "2099-12-24",
      "die Oberflaeche schneidet auf YYYY-MM-DD — ein UTC-Zeitpunkt verschoebe den Tag");
  });

  it("keine echte Zeile verraet Art, Notiz oder Beschreibung", async () => {
    await leere();
    await abwesenheit({ bis: "2099-12-24" });
    const board = await getCompanyLiveWorkforce(pool, ids.kunde);
    const alles = JSON.stringify(board).toLowerCase();
    for (const wort of VERRAETERISCH) {
      assert.ok(!alles.includes(wort),
        `"${wort}" steht in der Kundenantwort — Art. 9 DSGVO, und der Kunde ist ein Dritter`);
    }
    assert.ok(alles.includes("bauer"), "Gegenprobe: die Antwort ist nicht einfach leer");
  });

  it("eine erst BEANTRAGTE Selbstmeldung bleibt beim Arbeitgeber", async () => {
    await leere();
    await abwesenheit({ zustand: "beantragt" });
    const board = await getCompanyLiveWorkforce(pool, ids.kunde);
    assert.equal(board.workers[0].live_status, "im_einsatz",
      "eine Entscheidung, die drinnen aussteht, darf nicht nach aussen getragen werden (G-E2)");
    assert.equal(board.kpis.faellt_aus, 0);
  });

  it("eine ABGELEHNTE Meldung ebenfalls", async () => {
    await leere();
    const id = await abwesenheit();
    await pool.query(
      `UPDATE worker_absences SET zustand='abgelehnt', entschieden_am=NOW(), entscheidung_grund='Kein Nachweis' WHERE id=$1`,
      [id]
    );
    const board = await getCompanyLiveWorkforce(pool, ids.kunde);
    assert.equal(board.workers[0].live_status, "im_einsatz");
  });

  it("eine zurueckgenommene Meldung ebenfalls", async () => {
    await leere();
    const id = await abwesenheit();
    await pool.query("UPDATE worker_absences SET aufgehoben_am = NOW() WHERE id = $1", [id]);
    const board = await getCompanyLiveWorkforce(pool, ids.kunde);
    assert.equal(board.workers[0].live_status, "im_einsatz");
  });

  it("eine abgelaufene Abwesenheit gilt nicht mehr", async () => {
    await leere();
    await pool.query(
      `INSERT INTO worker_absences (worker_profile_id, supplier_org_id, art, von, bis, quelle, zustand)
       VALUES ($1,$2,'urlaub', CURRENT_DATE - 20, CURRENT_DATE - 5, 'disponent', 'wirksam')`,
      [ids.profil, ids.agenturA]
    );
    const board = await getCompanyLiveWorkforce(pool, ids.kunde);
    assert.equal(board.workers[0].live_status, "im_einsatz");
  });

  it("liefert eine ANDERE Firma den Einsatz, erreicht die Meldung diesen Kunden nicht", async () => {
    /* Der Mandantentest. Die Meldung liegt beim Profil (Agentur A); geliefert
     * wird der Einsatz von Agentur B. Ohne die Bindung
     * ab.supplier_org_id = wal.supplier_org_id haette der Kunde hier einen
     * Ausfall gesehen, der seinen Einsatz gar nicht betrifft — und nebenbei
     * erfahren, dass die Person noch bei einer anderen Firma gefuehrt wird. */
    await leere();
    await abwesenheit({ supplier: ids.agenturA, bis: "2099-12-24" });
    await lieferantAuf(ids.agenturB);
    try {
      const board = await getCompanyLiveWorkforce(pool, ids.kunde);
      assert.equal(board.workers.length, 1);
      assert.equal(board.workers[0].live_status, "im_einsatz",
        "die Meldung einer anderen Zeitarbeitsfirma geht diesen Einsatz nichts an");
      assert.equal(board.workers[0].ausfall_bis, null);
      /* UND: der NAME bleibt trotzdem stehen. Genau das haette die zunaechst
       * empfohlene Org-Bedingung am Profil-Join zerstoert. */
      assert.equal(board.workers[0].last_name, "Bauer",
        "der Name darf nicht verschwinden, nur weil die Firmen auseinanderlaufen");
    } finally {
      await lieferantAuf(ids.agenturA);
    }
  });

  it("der Zustand 'wirksam' ist im CHECK verankert — der Filter kann nicht ins Leere greifen", async () => {
    const { rows } = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conrelid='worker_absences'::regclass AND conname='worker_absences_zustand_chk'`
    );
    assert.ok(rows[0], "worker_absences_zustand_chk fehlt — Mig 181 ist hier nicht angewendet");
    for (const wert of ["wirksam", "beantragt", "abgelehnt"]) {
      assert.ok(rows[0].def.includes(wert), `${wert} fehlt im CHECK`);
    }
  });

  it("der zusammengesetzte Fremdschluessel traegt die Org-Bindung mit", async () => {
    /* Er ist der Grund, warum EINE Bedingung (ab.supplier_org_id) genuegt:
     * eine Abwesenheit kann gar nicht zu einem Profil einer anderen Firma
     * gehoeren. Faellt der Fremdschluessel, faellt diese Begruendung. */
    const { rows } = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conrelid='worker_absences'::regclass AND conname='worker_absences_profil_org_fk'`
    );
    assert.ok(rows[0], "worker_absences_profil_org_fk fehlt");
    assert.match(rows[0].def, /\(worker_profile_id,\s*supplier_org_id\)/);
    assert.match(rows[0].def, /worker_profiles\(id,\s*supplier_org_id\)/);
  });

  it("ein Mensch hat hoechstens EIN Profil mit Konto — sonst waere die Abfrage mehrdeutig", async () => {
    /* Die Zusage, auf der der unbeschraenkte Profil-Join fusst. Bricht sie,
     * kann die Kundenzeile verdoppeln — dieser Test sagt es vorher. */
    const { rows } = await pool.query(
      `SELECT indexdef FROM pg_indexes
        WHERE tablename = 'worker_profiles' AND indexname = 'worker_profiles_user_id_key'`
    );
    assert.ok(rows[0], "worker_profiles_user_id_key fehlt — der Profil-Join braucht eine Org-Bedingung, sobald das so ist");
    assert.match(rows[0].indexdef, /UNIQUE INDEX .* \(user_id\)/);

    const { rows: doppelt } = await pool.query(
      `SELECT count(*)::int AS n FROM (
         SELECT user_id FROM worker_profiles WHERE user_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1
       ) x`
    );
    assert.equal(doppelt[0].n, 0, "im Bestand gibt es doch mehrfache Profile je Konto");
  });
});
