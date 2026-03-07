/**
 * Compliance traffic light: RED / YELLOW / GREEN with reasons.
 * MVP rules: RED if missing shift_schedule, start_date, quantity<=0, location_text, invalid dates; YELLOW for certs/rate/notes; GREEN otherwise.
 */

/**
 * Compute compliance for one request and upsert into request_compliance.
 */
export async function computeForRequest(pool, requestId) {
  const r = await pool.query(
    `SELECT id, requester_id, capacity_id, quantity, location_text, start_date, end_date, duration_days,
            shift_schedule, required_certifications, max_hourly_rate_cents, urgency, notes, role
     FROM requests WHERE id=$1`,
    [requestId]
  );
  if (!r.rows[0]) return { ok: false, error: "NOT_FOUND" };
  const req = r.rows[0];

  const reasons = [];
  let status = "GREEN";

  const qty = req.quantity ?? 0;
  if (qty <= 0) {
    reasons.push({ code: "QUANTITY_INVALID", message: "Quantity must be at least 1" });
    status = "RED";
  }
  if (!req.location_text || String(req.location_text).trim() === "") {
    reasons.push({ code: "LOCATION_MISSING", message: "Location is required" });
    status = "RED";
  }
  if (!req.shift_schedule || (typeof req.shift_schedule === "object" && Object.keys(req.shift_schedule).length === 0)) {
    reasons.push({ code: "SHIFT_SCHEDULE_MISSING", message: "Shift schedule is required" });
    status = "RED";
  }
  if (!req.start_date) {
    reasons.push({ code: "START_DATE_MISSING", message: "Start date is required" });
    status = "RED";
  }
  const hasEnd = req.end_date || (req.duration_days && req.duration_days >= 1);
  if (!hasEnd) {
    reasons.push({ code: "END_OR_DURATION_MISSING", message: "End date or duration is required" });
    status = "RED";
  }
  if (req.start_date && req.end_date && new Date(req.end_date) < new Date(req.start_date)) {
    reasons.push({ code: "DATES_INVALID", message: "End date must be after start date" });
    status = "RED";
  }

  if (status !== "RED") {
    const policy = await pool.query(
      "SELECT required_certifications FROM compliance_policies WHERE (company_id=$1 OR company_id IS NULL) ORDER BY company_id NULLS LAST LIMIT 1",
      [req.requester_id]
    );
    const policyCerts = policy.rows[0]?.required_certifications;
    if (Array.isArray(policyCerts) && policyCerts.length > 0) {
      const hasCerts = Array.isArray(req.required_certifications) && req.required_certifications.length > 0;
      if (!hasCerts) {
        reasons.push({ code: "REQUIRED_CERTIFICATIONS_MISSING", message: "Certifications required by policy" });
        status = "YELLOW";
      }
    }
    if (req.urgency === "urgent" && (req.max_hourly_rate_cents == null || req.max_hourly_rate_cents === 0)) {
      reasons.push({ code: "MAX_RATE_MISSING_URGENT", message: "Max rate recommended for urgent requests" });
      status = status === "GREEN" ? "YELLOW" : status;
    }
    if (req.role && String(req.role).toLowerCase().includes("risk") && (!req.notes || String(req.notes).trim() === "")) {
      reasons.push({ code: "NOTES_RECOMMENDED", message: "Notes recommended for higher-risk roles" });
      status = status === "GREEN" ? "YELLOW" : status;
    }
  }

  await pool.query(
    `INSERT INTO request_compliance (request_id, status, reasons, computed_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (request_id) DO UPDATE SET status=EXCLUDED.status, reasons=EXCLUDED.reasons, computed_at=NOW()`,
    [requestId, status, JSON.stringify(reasons)]
  );
  return { ok: true, status, reasons };
}

/**
 * Recompute compliance for a batch of requests (e.g. recent or by ID list).
 */
export async function recomputeBatch(pool, batchSize = 100) {
  const r = await pool.query(
    `SELECT id FROM requests ORDER BY updated_at DESC NULLS LAST LIMIT $1`,
    [batchSize]
  );
  let updated = 0;
  for (const row of r.rows) {
    const out = await computeForRequest(pool, row.id);
    if (out.ok) updated++;
  }
  return { updated };
}
