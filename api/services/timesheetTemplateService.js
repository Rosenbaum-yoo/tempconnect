/**
 * Timesheet Template Service
 * Verwaltung von Stundenzettel-Vorlagen (Zeitarbeit).
 * Templates sind immer einer Zeitarbeitsfirma (supplier_org_id) zugeordnet.
 */

/* ── Template abrufen ───────────────────────────────────────────────────── */

export async function getTemplate(pool, templateId, supplierOrgId = null) {
  const { rows } = await pool.query(
    `SELECT tt.*,
            u.email AS created_by_email
     FROM timesheet_templates tt
     LEFT JOIN users u ON u.id = tt.created_by
     WHERE tt.id = $1
       ${supplierOrgId ? "AND tt.supplier_org_id = $2" : ""}`,
    supplierOrgId ? [templateId, supplierOrgId] : [templateId]
  );
  if (!rows[0]) return null;

  const { rows: fields } = await pool.query(
    `SELECT * FROM timesheet_template_fields
     WHERE template_id = $1
     ORDER BY sort_order ASC, created_at ASC`,
    [templateId]
  );
  return { ...rows[0], fields };
}

/* ── Template-Liste der Agentur ─────────────────────────────────────────── */

export async function listTemplates(pool, supplierOrgId) {
  const { rows } = await pool.query(
    `SELECT tt.id, tt.supplier_org_id, tt.name, tt.description,
            tt.is_default, tt.is_active, tt.created_by, tt.created_at, tt.updated_at,
            u.email AS created_by_email,
            COUNT(tta.id) AS assignment_count
     FROM timesheet_templates tt
     LEFT JOIN users u ON u.id = tt.created_by
     LEFT JOIN timesheet_template_assignments tta ON tta.template_id = tt.id
     WHERE tt.supplier_org_id = $1
     GROUP BY tt.id, u.email
     ORDER BY tt.is_default DESC, tt.name ASC`,
    [supplierOrgId]
  );
  return rows;
}

/* ── Template anlegen ───────────────────────────────────────────────────── */

export async function createTemplate(pool, {
  supplierOrgId, name, description, isDefault, createdBy, fields = []
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Wenn isDefault: bestehenden Default aufheben
    if (isDefault) {
      await client.query(
        `UPDATE timesheet_templates SET is_default = FALSE
         WHERE supplier_org_id = $1 AND is_default = TRUE`,
        [supplierOrgId]
      );
    }

    const { rows: [tmpl] } = await client.query(
      `INSERT INTO timesheet_templates
         (supplier_org_id, name, description, is_default, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [supplierOrgId, name.trim(), description?.trim() || null, !!isDefault, createdBy]
    );

    // Felder anlegen
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      await client.query(
        `INSERT INTO timesheet_template_fields
           (template_id, field_key, label, field_type, is_required, is_visible,
            default_value, options, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          tmpl.id, f.field_key, f.label, f.field_type || "text",
          f.is_required ?? false, f.is_visible ?? true,
          f.default_value || null,
          f.options ? JSON.stringify(f.options) : null,
          f.sort_order ?? i
        ]
      );
    }

    await client.query("COMMIT");
    return { template: tmpl };
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505") return { error: "DUPLICATE_NAME" };
    throw err;
  } finally {
    client.release();
  }
}

/* ── Template aktualisieren ─────────────────────────────────────────────── */

export async function updateTemplate(pool, templateId, supplierOrgId, {
  name, description, isDefault, isActive, fields
}) {
  const tmpl = await getTemplate(pool, templateId, supplierOrgId);
  if (!tmpl) return { error: "NOT_FOUND" };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (isDefault) {
      await client.query(
        `UPDATE timesheet_templates SET is_default = FALSE
         WHERE supplier_org_id = $1 AND is_default = TRUE AND id != $2`,
        [supplierOrgId, templateId]
      );
    }

    const updates = [];
    const params = [];
    if (name       !== undefined) { params.push(name.trim());         updates.push(`name = $${params.length}`); }
    if (description !== undefined) { params.push(description?.trim() || null); updates.push(`description = $${params.length}`); }
    if (isDefault  !== undefined) { params.push(!!isDefault);         updates.push(`is_default = $${params.length}`); }
    if (isActive   !== undefined) { params.push(!!isActive);          updates.push(`is_active = $${params.length}`); }
    updates.push("updated_at = NOW()");

    params.push(templateId);
    if (updates.length > 1) {
      await client.query(
        `UPDATE timesheet_templates SET ${updates.join(", ")} WHERE id = $${params.length}`,
        params
      );
    }

    // Felder: vollständiges Ersetzen wenn mitgeliefert
    if (Array.isArray(fields)) {
      await client.query("DELETE FROM timesheet_template_fields WHERE template_id = $1", [templateId]);
      for (let i = 0; i < fields.length; i++) {
        const f = fields[i];
        await client.query(
          `INSERT INTO timesheet_template_fields
             (template_id, field_key, label, field_type, is_required, is_visible,
              default_value, options, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            templateId, f.field_key, f.label, f.field_type || "text",
            f.is_required ?? false, f.is_visible ?? true,
            f.default_value || null,
            f.options ? JSON.stringify(f.options) : null,
            f.sort_order ?? i
          ]
        );
      }
    }

    await client.query("COMMIT");
    return { ok: true };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/* ── Template löschen ───────────────────────────────────────────────────── */

export async function deleteTemplate(pool, templateId, supplierOrgId) {
  // Prüfen ob in Verwendung (Assignments)
  const { rows: uses } = await pool.query(
    `SELECT COUNT(*) AS cnt FROM timesheet_template_assignments
     WHERE template_id = $1`,
    [templateId]
  );
  if (parseInt(uses[0].cnt, 10) > 0) {
    return { error: "TEMPLATE_IN_USE", count: parseInt(uses[0].cnt, 10) };
  }

  const { rowCount } = await pool.query(
    `DELETE FROM timesheet_templates
     WHERE id = $1 AND supplier_org_id = $2`,
    [templateId, supplierOrgId]
  );
  return rowCount > 0 ? { ok: true } : { error: "NOT_FOUND" };
}

/* ── Template für einen Einsatz ermitteln ───────────────────────────────── */
/* Priorität: 1. assignment-spezifisch, 2. org-spezifisch, 3. Default */

export async function getTemplateForAssignment(pool, assignmentId, supplierOrgId) {
  // 1. Assignment-spezifische Zuweisung
  const { rows: asgn } = await pool.query(
    `SELECT tt.*
     FROM timesheet_template_assignments tta
     JOIN timesheet_templates tt ON tt.id = tta.template_id
     WHERE tta.assignment_id = $1
       AND tt.supplier_org_id = $2
       AND tt.is_active = TRUE
     LIMIT 1`,
    [assignmentId, supplierOrgId]
  );
  if (asgn[0]) {
    const tmpl = await getTemplate(pool, asgn[0].id, supplierOrgId);
    return tmpl;
  }

  // 2. Org-spezifisch (ohne Assignment-Bindung)
  const { rows: orgSpec } = await pool.query(
    `SELECT tt.*
     FROM timesheet_template_assignments tta
     JOIN timesheet_templates tt ON tt.id = tta.template_id
     WHERE tta.org_id = (SELECT org_id FROM assignments WHERE id = $1)
       AND tta.assignment_id IS NULL
       AND tt.supplier_org_id = $2
       AND tt.is_active = TRUE
     LIMIT 1`,
    [assignmentId, supplierOrgId]
  );
  if (orgSpec[0]) {
    const tmpl = await getTemplate(pool, orgSpec[0].id, supplierOrgId);
    return tmpl;
  }

  // 3. Default-Template der Agentur
  const { rows: def } = await pool.query(
    `SELECT id FROM timesheet_templates
     WHERE supplier_org_id = $1 AND is_default = TRUE AND is_active = TRUE
     LIMIT 1`,
    [supplierOrgId]
  );
  if (def[0]) {
    const tmpl = await getTemplate(pool, def[0].id, supplierOrgId);
    return tmpl;
  }

  return null;
}

/* ── Template einem Einsatz zuweisen ─────────────────────────────────────── */

export async function assignTemplate(pool, {
  templateId, supplierOrgId, assignmentId = null, orgId = null, createdBy
}) {
  // Sicherstellen, dass Template zur Agentur gehört
  const tmpl = await getTemplate(pool, templateId, supplierOrgId);
  if (!tmpl) return { error: "TEMPLATE_NOT_FOUND" };
  if (!assignmentId && !orgId) return { error: "ASSIGNMENT_OR_ORG_REQUIRED" };

  try {
    const { rows: [asgn] } = await pool.query(
      `INSERT INTO timesheet_template_assignments
         (template_id, assignment_id, org_id, created_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (template_id, assignment_id)
         DO UPDATE SET org_id = EXCLUDED.org_id, created_by = EXCLUDED.created_by
       RETURNING *`,
      [templateId, assignmentId || null, orgId || null, createdBy]
    );
    return { ok: true, assignment: asgn };
  } catch (err) {
    if (err.code === "23505") return { error: "ALREADY_ASSIGNED" };
    throw err;
  }
}

/* ── Template-Zuweisung entfernen ────────────────────────────────────────── */

export async function removeAssignment(pool, assignmentId, supplierOrgId) {
  const { rowCount } = await pool.query(
    `DELETE FROM timesheet_template_assignments tta
     USING timesheet_templates tt
     WHERE tta.template_id = tt.id
       AND tt.supplier_org_id = $1
       AND tta.assignment_id = $2`,
    [supplierOrgId, assignmentId]
  );
  return rowCount > 0 ? { ok: true } : { error: "NOT_FOUND" };
}
