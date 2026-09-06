/**
 * companyBlocklistService — Sperrliste (P3.3).
 * Ein einsetzendes Unternehmen (Käufer-Org) sperrt eine konkrete Kraft — unbefristet
 * oder befristet. Der Zuweisungs-Guard (workerService.createAssignmentLink /
 * replaceAssignmentWorker) lehnt gesperrte Kräfte ab (BLOCKED_BY_COMPANY).
 *
 * Aktive Sperre = blocked_until IS NULL OR blocked_until >= CURRENT_DATE.
 * `db` kann pool ODER ein Transaktions-Client sein.
 */

/**
 * Die Bedingung "diese Kapazitaet gehoert KEINER fuer dieses Unternehmen
 * gesperrten Kraft" - als SQL-Baustein, damit jede Flaeche dieselbe benutzt.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM ALS BAUSTEIN UND NICHT DREIMAL GETIPPT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bis zum 2026-09-06 stand diese Bedingung genau EINMAL im Repo: im Feed
 * (`capacityExchangeService.browseFeed`). Die Suche kannte sie nicht, die
 * Detailansicht auch nicht - eine gesperrte Kraft war aus der Liste
 * verschwunden und ueber die Suche oder einen alten Link weiterhin erreichbar.
 *
 * Der Riegel beim Buchen greift (Welle J2c, 409). Genau deshalb ist die
 * Sichtbarkeit ein eigenes Problem: ein Angebot, das man nicht buchen darf, ist
 * keine Auskunft, sondern eine Falle - der Kunde plant damit und erfaehrt es
 * erst beim Abschluss.
 *
 * Eine Kopie je Flaeche waere hier besonders teuer: die Bedingung nennt zwei
 * Tabellen und eine Frist. Wer eine davon spaeter aendert, aendert sie an einer
 * Stelle und vergisst zwei.
 *
 * Die Spalte ist waehlbar, weil nicht jede Flaeche von einem ANGEBOT ausgeht:
 * der Feed und die Suche haben `cp.worker_profile_id`, die Deckungsrechnung
 * (N4.2) laeuft dagegen auf den Profilzeilen selbst - dort heisst dieselbe
 * Kennung `k.id`. Ohne diese Wahl haette die Deckungsrechnung eine eigene
 * Abschrift der Bedingung gebraucht, und genau die sollte hier verschwinden.
 *
 * @param {string} kapazitaetsAlias Alias der Zeile mit der Profil-Kennung (z. B. "cp").
 * @param {number} platzhalter Nummer des Parameters mit der Org des Betrachters.
 * @param {{spalte?: string}} [opt] Spalte mit der Profil-Kennung; Standard
 *        `worker_profile_id`. Auf einer `worker_profiles`-Zeile ist es `id`.
 * @returns {string} `NOT EXISTS (...)` - direkt in eine WHERE-Liste einsetzbar.
 */
export function nichtGesperrtSql(kapazitaetsAlias, platzhalter, opt = {}) {
  const a = String(kapazitaetsAlias || "cp").trim();
  const p = Number(platzhalter);
  const spalte = String(opt.spalte || "worker_profile_id").trim();
  if (!/^[a-z_][a-z0-9_]*$/i.test(a)) throw new Error("BLOCKLIST_ALIAS_UNGUELTIG");
  if (!Number.isInteger(p) || p < 1) throw new Error("BLOCKLIST_PLATZHALTER_UNGUELTIG");
  /* Dieselbe Schranke wie fuer den Alias: auch die Spalte landet unmaskiert
     im SQL, und ein Aufrufer, der sie eines Tages durchreicht, findet hier
     eine Tuer und keine Luecke. */
  if (!/^[a-z_][a-z0-9_]*$/i.test(spalte)) throw new Error("BLOCKLIST_SPALTE_UNGUELTIG");
  return `NOT EXISTS (
      SELECT 1
        FROM company_worker_blocklist bl
        JOIN worker_profiles wpb ON wpb.user_id = bl.worker_user_id
       WHERE wpb.id = ${a}.${spalte}
         AND bl.company_org_id = $${p}
         AND (bl.blocked_until IS NULL OR bl.blocked_until >= CURRENT_DATE)
    )`;
}

/**
 * Guard-Check: ist Worker bei diesem Unternehmen AKTIV gesperrt?
 * @returns {Promise<{id,reason,blocked_until}|null>} null = nicht gesperrt.
 */
export async function isWorkerBlockedForCompany(db, companyOrgId, workerUserId) {
  if (!companyOrgId || !workerUserId) return null;
  const { rows } = await db.query(
    `SELECT id, reason, blocked_until
       FROM company_worker_blocklist
      WHERE company_org_id = $1 AND worker_user_id = $2
        AND (blocked_until IS NULL OR blocked_until >= CURRENT_DATE)
      LIMIT 1`,
    [companyOrgId, workerUserId]
  );
  return rows[0] || null;
}

/**
 * Dasselbe, aber ueber die PROFIL-Kennung statt der Nutzer-Kennung.
 *
 * Kapazitaets-Angebote haengen an `worker_profile_id`; die Sperrliste an
 * `worker_user_id`. Wer von einem Angebot ausgeht, hat nur die erste - und den
 * Umweg ueber ein separates Laden des Profils zu gehen waere eine zweite
 * Abfrage fuer eine Frage, die eine beantwortet.
 *
 * Gibt die Sperrzeile zurueck oder `null`. Der `reason` bleibt HIER drin: die
 * Auskunft geht an das Unternehmen, das die Sperre selbst gesetzt hat.
 */
export async function isWorkerBlockedForCompanyByProfile(db, companyOrgId, workerProfileId) {
  if (!companyOrgId || !workerProfileId) return null;
  const { rows } = await db.query(
    `SELECT bl.id, bl.reason, bl.blocked_until
       FROM company_worker_blocklist bl
       JOIN worker_profiles wp ON wp.user_id = bl.worker_user_id
      WHERE bl.company_org_id = $1
        AND wp.id = $2
        AND (bl.blocked_until IS NULL OR bl.blocked_until >= CURRENT_DATE)
      LIMIT 1`,
    [companyOrgId, workerProfileId]
  );
  return rows[0] || null;
}

/**
 * Sperrliste eines Unternehmens (Käufer-Sicht). Standard: nur aktive Sperren.
 */
export async function listCompanyBlocklist(pool, companyOrgId, { includeExpired = false } = {}) {
  const activeClause = includeExpired ? "" : "AND (b.blocked_until IS NULL OR b.blocked_until >= CURRENT_DATE)";
  const { rows } = await pool.query(
    `SELECT b.id, b.worker_user_id, b.supplier_org_id, b.reason, b.blocked_until, b.created_at,
            wp.first_name, wp.last_name, wp.personnel_number,
            u.email AS worker_email,
            so.name AS agency_name
       FROM company_worker_blocklist b
       LEFT JOIN users u ON u.id = b.worker_user_id
       LEFT JOIN worker_profiles wp ON wp.user_id = b.worker_user_id
       LEFT JOIN organizations so ON so.id = b.supplier_org_id
      WHERE b.company_org_id = $1 ${activeClause}
      ORDER BY (b.blocked_until IS NULL) DESC, b.created_at DESC`,
    [companyOrgId]
  );
  return rows;
}

/**
 * Chef-Hinweis (P3.3): alle AKTIVEN Sperren, die die eigene Belegschaft betreffen —
 * „wer ist bei welchem Kunden gesperrt". Damit zeigt die Dispositions-UI die Sperre
 * schon bei der Auswahl an, statt den Disponenten erst am 409 auflaufen zu lassen.
 *
 * Scoping über die eigene Belegschaft (`worker_profiles.supplier_org_id = $1`), nicht über
 * `blocklist.supplier_org_id` — letzteres ist nur ein abgeleiteter Kontext und kann NULL sein.
 * Nutzt den in Mig 149 genau dafür angelegten Index `(worker_user_id)`.
 */
export async function listBlocksForSupplier(pool, supplierOrgId, { companyOrgId = null } = {}) {
  if (!supplierOrgId) return [];

  /*
   * ═══════════════════════════════════════════════════════════════════════════
   * WAS DIE AGENTUR ERFAEHRT - UND WAS NICHT (N4.3, Owner-Entscheid 2026-09-06)
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * Bis hierher lieferte diese Abfrage `reason` und den KUNDENNAMEN mit. Der
   * Disponenten-Bildschirm zeigte die Gruende sogar an ("2 gesperrt: zu spaet
   * gekommen, Qualitaet").
   *
   * Eine Sperre ist ein Urteil eines Kunden ueber einen MENSCHEN. Es an dessen
   * Arbeitgeber weiterzureichen, ist etwas anderes als es durchzusetzen - und
   * der Grund wurde fuer den Kunden selbst notiert, nicht fuer die Gegenseite.
   *
   * Die Disposition braucht davon nichts. Sie braucht genau eine Antwort:
   * "wen kann ich BEI DIESEM KUNDEN nicht einsetzen?" Deshalb beantwortet der
   * Server jetzt die gestellte Frage, statt die ganze Liste herauszugeben:
   *
   *   companyOrgId gesetzt   nur die Sperren dieses einen Kunden, ohne Grund,
   *                          ohne Namen - genau das, was die Auswahl braucht.
   *   companyOrgId fehlt     die eigenen Kraefte, die IRGENDWO gesperrt sind,
   *                          ohne zu sagen wo. Fuer eine Uebersicht, die sagen
   *                          darf "hier gibt es eine Einschraenkung", ohne sie
   *                          aufzuschluesseln.
   *
   * Der Riegel selbst bleibt davon unberuehrt: gebucht werden kann die Kraft
   * ohnehin nicht (409 im Deal-Weg).
   */
  if (companyOrgId) {
    const { rows } = await pool.query(
      `SELECT b.worker_user_id, b.blocked_until
         FROM company_worker_blocklist b
         JOIN worker_profiles wp ON wp.user_id = b.worker_user_id
        WHERE wp.supplier_org_id = $1
          AND b.company_org_id = $2
          AND (b.blocked_until IS NULL OR b.blocked_until >= CURRENT_DATE)
        ORDER BY b.created_at DESC`,
      [supplierOrgId, companyOrgId]
    );
    return rows;
  }

  /* Ohne Kunden: nur WELCHE Kraft, und bis wann die naechste Sperre laeuft.
     `DISTINCT` je Kraft, damit die ANZAHL der Zeilen nicht verraet, bei wie
     vielen Kunden jemand gesperrt ist - auch das waere eine Aussage. */
  const { rows } = await pool.query(
    `SELECT b.worker_user_id,
            CASE WHEN bool_or(b.blocked_until IS NULL) THEN NULL
                 ELSE MAX(b.blocked_until) END AS blocked_until
       FROM company_worker_blocklist b
       JOIN worker_profiles wp ON wp.user_id = b.worker_user_id
      WHERE wp.supplier_org_id = $1
        AND (b.blocked_until IS NULL OR b.blocked_until >= CURRENT_DATE)
      GROUP BY b.worker_user_id`,
    [supplierOrgId]
  );
  return rows;
}

/**
 * Kraft sperren / Sperre aktualisieren (Upsert je company+worker).
 *
 * Beziehungs-Nachweis (Pflicht): gesperrt werden kann NUR eine Kraft, die bei diesem
 * Unternehmen tatsächlich im Einsatz ist oder war (`worker_assignment_links.org_id`).
 * Sonst könnte eine Käufer-Org beliebige Worker-UUIDs auf ihre Sperrliste schreiben und
 * damit fremde Kräfte für sich blockieren, die sie nie gesehen hat.
 *
 * Die Herkunfts-Agentur (`supplier_org_id`) wird dabei SERVER-SEITIG aus dem echten
 * Einsatz abgeleitet — nie aus dem Request übernommen (sonst falsche Zuordnung).
 * Alles in EINER Anweisung: race-frei und ohne zusätzlichen Roundtrip.
 *
 * @param {object} opts blockedUntil: null = unbefristet ("nie wieder").
 * @returns {{block}|{error:"MISSING_PARAMS"|"NO_ASSIGNMENT_RELATION"}}
 */
export async function blockWorkerForCompany(pool, {
  companyOrgId, workerUserId, reason = null, blockedUntil = null, createdBy = null
}) {
  if (!companyOrgId || !workerUserId) return { error: "MISSING_PARAMS" };
  const { rows } = await pool.query(
    `INSERT INTO company_worker_blocklist
       (company_org_id, worker_user_id, supplier_org_id, reason, blocked_until, created_by)
     SELECT $1, $2, rel.supplier_org_id, $3, $4, $5
       FROM (SELECT wal.supplier_org_id
               FROM worker_assignment_links wal
              WHERE wal.worker_user_id = $2 AND wal.org_id = $1
              ORDER BY wal.is_active DESC, wal.start_date DESC
              LIMIT 1) rel
     ON CONFLICT (company_org_id, worker_user_id) DO UPDATE
       SET reason = EXCLUDED.reason,
           blocked_until = EXCLUDED.blocked_until,
           supplier_org_id = COALESCE(EXCLUDED.supplier_org_id, company_worker_blocklist.supplier_org_id),
           updated_at = NOW()
     RETURNING *`,
    [companyOrgId, workerUserId, reason, blockedUntil, createdBy]
  );
  if (!rows[0]) return { error: "NO_ASSIGNMENT_RELATION" };
  return { block: rows[0] };
}

/**
 * Sperre aufheben ("wieder frei").
 */
export async function unblockWorkerForCompany(pool, companyOrgId, workerUserId) {
  const { rowCount } = await pool.query(
    `DELETE FROM company_worker_blocklist WHERE company_org_id = $1 AND worker_user_id = $2`,
    [companyOrgId, workerUserId]
  );
  return rowCount > 0;
}
