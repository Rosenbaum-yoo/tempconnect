/**
 * staffDocumentVaultService — org-uebergreifendes Monitoring des Dokumenten-Tresors
 * fuer das Staff-Center (read-only). Zeigt, dass die Auto-Ablage ("streng reguliert")
 * laeuft: Zaehler je Quelle/Typ, Ingest-Aktivitaet (24h/7d) und die letzten Ablagen.
 */

export async function getVaultOverview(pool, { limit = 50 } = {}) {
  const lim = Math.min(200, Math.max(1, Number(limit) || 50));
  const [bySource, byType, recent, totals] = await Promise.all([
    pool.query("SELECT source, COUNT(*)::int AS n FROM document_center GROUP BY source"),
    pool.query("SELECT document_type, COUNT(*)::int AS n FROM document_center GROUP BY document_type"),
    pool.query(
      `SELECT dc.id, dc.org_id, o.name AS org_name, dc.document_type, dc.content_category,
              dc.title, dc.source, dc.source_ref, dc.mime_type, dc.file_size_bytes, dc.created_at
       FROM document_center dc
       LEFT JOIN organizations o ON o.id = dc.org_id
       ORDER BY dc.created_at DESC
       LIMIT $1`,
      [lim]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int AS last_24h,
              COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int AS last_7d,
              COUNT(*) FILTER (WHERE source <> 'upload')::int AS auto_ingested,
              COALESCE(SUM(file_size_bytes), 0)::bigint AS total_bytes
       FROM document_center`
    )
  ]);
  const counts_by_source = {};
  bySource.rows.forEach((r) => { counts_by_source[r.source] = r.n; });
  const counts_by_type = {};
  byType.rows.forEach((r) => { counts_by_type[r.document_type] = r.n; });
  const t = totals.rows[0] || {};
  return {
    totals: {
      total: Number(t.total) || 0,
      last_24h: Number(t.last_24h) || 0,
      last_7d: Number(t.last_7d) || 0,
      auto_ingested: Number(t.auto_ingested) || 0,
      total_bytes: Number(t.total_bytes) || 0
    },
    counts_by_source,
    counts_by_type,
    recent: recent.rows
  };
}
