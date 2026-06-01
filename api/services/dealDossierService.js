/**
 * Deal Dossier Service — Dealakte / Dokumentenmappe fuer den Abschlussprozess.
 *
 * Vereint generierte Dokumente (Konditionsblatt, Einsatzvereinbarung) und
 * hochgeladene Dokumente (PDFs, Anlagen) zu einer nachvollziehbaren Dealakte.
 *
 * Jeder Agreement-Schritt erzeugt automatisch einen deal_documents-Record
 * mit Metadaten, Version und Content-Hash.
 */

import { createHash } from "crypto";

/* ── Content-Hash (SHA-256 der ersten 10KB fuer Aenderungserkennung) ── */

export function computeContentHash(html) {
  if (!html) return null;
  return createHash("sha256").update(String(html).slice(0, 10240)).digest("hex");
}

/* ── Dokument-Record erzeugen (bei Agreement-Lifecycle-Events) ──────── */

/**
 * Erzeugt einen deal_documents-Record fuer ein generiertes Dokument.
 * Markiert vorherige Versionen desselben Typs als 'superseded'.
 *
 * @param {import('pg').PoolClient|import('pg').Pool} client
 * @param {Object} params
 * @param {string} params.offerId
 * @param {string} params.documentType - 'conditions_sheet' | 'agreement' | 'summary' | 'cancellation'
 * @param {string} params.title
 * @param {string} [params.contentHash]
 * @param {string} [params.generatedBy] - actorId
 * @param {string} [params.agreementRef]
 * @param {number} [params.agreementVersion]
 */
export async function createDocumentRecord(client, params) {
  const { offerId, documentType, title, contentHash, generatedBy, agreementRef, agreementVersion } = params;

  // Vorherige aktuelle Version desselben Typs als superseded markieren
  await client.query(
    `UPDATE deal_documents SET status = 'superseded', updated_at = NOW()
     WHERE offer_id = $1 AND document_type = $2 AND status = 'current'`,
    [offerId, documentType]
  );

  // Naechste Version bestimmen
  const { rows: vRows } = await client.query(
    `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
     FROM deal_documents WHERE offer_id = $1 AND document_type = $2`,
    [offerId, documentType]
  );
  const version = vRows[0]?.next_version || 1;

  const { rows } = await client.query(
    `INSERT INTO deal_documents (offer_id, document_type, version, title, source, content_hash,
       generated_by, agreement_ref, agreement_version, status)
     VALUES ($1, $2, $3, $4, 'generated', $5, $6, $7, $8, 'current')
     RETURNING *`,
    [offerId, documentType, version, title, contentHash || null,
     generatedBy || null, agreementRef || null, agreementVersion || null]
  );
  return rows[0];
}

/**
 * Erstellt einen deal_documents-Record fuer ein hochgeladenes Dokument.
 */
export async function createUploadedDocumentRecord(client, params) {
  const { offerId, documentType, title, assetId, generatedBy, agreementRef } = params;

  const { rows: vRows } = await client.query(
    `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
     FROM deal_documents WHERE offer_id = $1 AND document_type = $2`,
    [offerId, documentType]
  );
  const version = vRows[0]?.next_version || 1;

  const { rows } = await client.query(
    `INSERT INTO deal_documents (offer_id, document_type, version, title, source, asset_id,
       generated_by, agreement_ref, status)
     VALUES ($1, $2, $3, $4, 'uploaded', $5, $6, $7, 'current')
     RETURNING *`,
    [offerId, documentType, version, title, assetId || null,
     generatedBy || null, agreementRef || null]
  );
  return rows[0];
}

/* ── Dealakte abrufen (Dossier) ─────────────────────────────────────── */

/**
 * Laedt die vollstaendige Dealakte eines Offers:
 * - Alle deal_documents (generierte + hochgeladene, nach Typ gruppiert)
 * - Alle offer_assets die zum Offer gehoeren
 * - Agreement-Metadaten
 *
 * @param {import('pg').Pool} pool
 * @param {string} offerId
 * @returns {Promise<Object>}
 */
export async function getDossier(pool, offerId) {
  // 1. Offer + Agreement-Metadaten
  const { rows: offerRows } = await pool.query(
    `SELECT o.id, o.status, o.agreement_status, o.agreement_ref, o.agreement_version,
            o.agreement_snapshot, o.confirmed_at, o.activated_at, o.assignment_id,
            o.signature_required, o.signature_status, o.signed_at,
            o.signed_by_party_a, o.signed_by_party_b, o.signature_provider,
            o.signature_reference,
            d.title AS demand_title, d.requester_company_id, o.supplier_company_id,
            du.company_name AS requester_company_name,
            su.company_name AS supplier_company_name
     FROM offers o
     JOIN demand_requests d ON d.id = o.demand_request_id
     LEFT JOIN users du ON du.id = d.requester_company_id
     LEFT JOIN users su ON su.id = o.supplier_company_id
     WHERE o.id = $1`,
    [offerId]
  );
  if (!offerRows.length) return null;
  const offer = offerRows[0];

  // 2. Alle deal_documents
  const { rows: documents } = await pool.query(
    `SELECT dd.*, u.email AS generated_by_email, u.company_name AS generated_by_company,
            oa.file_path AS asset_file_path, oa.original_name AS asset_original_name,
            oa.mime_type AS asset_mime_type
     FROM deal_documents dd
     LEFT JOIN users u ON u.id = dd.generated_by
     LEFT JOIN offer_assets oa ON oa.id = dd.asset_id
     WHERE dd.offer_id = $1
     ORDER BY dd.document_type, dd.version DESC`,
    [offerId]
  );

  // 3. Offer-Assets (hochgeladene Dateien)
  const { rows: assets } = await pool.query(
    `SELECT * FROM offer_assets
     WHERE marketplace_offer_id = $1
     ORDER BY created_at DESC`,
    [offerId]
  );

  // Gruppierung
  const grouped = {
    generated: [],
    uploaded: [],
    attachments: []
  };

  for (const doc of documents) {
    if (doc.source === "generated") {
      grouped.generated.push(doc);
    } else {
      grouped.uploaded.push(doc);
    }
  }

  // Assets die nicht als deal_document verknuepft sind = Anlagen
  const docAssetIds = new Set(documents.filter(d => d.asset_id).map(d => d.asset_id));
  for (const asset of assets) {
    if (!docAssetIds.has(asset.id)) {
      grouped.attachments.push(asset);
    }
  }

  // 4. Timeline aus Audit-Log
  const { rows: timelineRows } = await pool.query(
    `SELECT action, details, actor_id, created_at
       FROM audit_log
      WHERE entity_type = 'offer' AND entity_id = $1
        AND (
          action LIKE 'deal.agreement_%'
          OR action = 'state_machine.transition'
          OR action = 'offer_asset.upload'
          OR action = 'offer_asset.delete'
        )
      ORDER BY created_at DESC
      LIMIT 50`,
    [offerId]
  );

  const timeline = timelineRows.map((row) => ({
    action: row.action,
    actor_id: row.actor_id,
    at: row.created_at,
    details: row.details || null
  }));

  return {
    offer_id: offer.id,
    agreement_ref: offer.agreement_ref,
    agreement_status: offer.agreement_status,
    agreement_version: offer.agreement_version,
    demand_title: offer.demand_title,
    requester_company_name: offer.requester_company_name,
    supplier_company_name: offer.supplier_company_name,
    signature: {
      required: offer.signature_required,
      status: offer.signature_status,
      signed_at: offer.signed_at,
      signed_by_party_a: offer.signed_by_party_a,
      signed_by_party_b: offer.signed_by_party_b,
      provider: offer.signature_provider,
      reference: offer.signature_reference
    },
    documents: grouped,
    document_count: documents.length + grouped.attachments.length,
    timeline,
    confirmed_at: offer.confirmed_at,
    activated_at: offer.activated_at,
    assignment_id: offer.assignment_id
  };
}

/* ── Dokument-Historie fuer einen bestimmten Typ ───────────────────── */

/**
 * Laedt alle Versionen eines Dokumenttyps fuer ein Offer.
 */
export async function getDocumentHistory(pool, offerId, documentType) {
  const { rows } = await pool.query(
    `SELECT dd.*, u.email AS generated_by_email
     FROM deal_documents dd
     LEFT JOIN users u ON u.id = dd.generated_by
     WHERE dd.offer_id = $1 AND dd.document_type = $2
     ORDER BY dd.version DESC`,
    [offerId, documentType]
  );
  return rows;
}
