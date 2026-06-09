/**
 * Deal History Service — canonical bucket logic for marketplace deal history.
 */

export const DEAL_HISTORY_BUCKETS = Object.freeze(["active", "completed", "cancelled"]);
export const DEAL_HISTORY_QUERY_BUCKETS = Object.freeze([...DEAL_HISTORY_BUCKETS, "all"]);

function agreementStatusSql(offerAlias) {
  return `COALESCE(NULLIF(${offerAlias}.agreement_status, ''), 'none')`;
}

export function normalizeDealHistoryBucket(value, fallback = null) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return DEAL_HISTORY_QUERY_BUCKETS.includes(normalized) ? normalized : fallback;
}

export function getDealHistoryBucket(deal, nowMs = Date.now()) {
  if (!deal) return "active";
  const offerStatus = deal.status || null;
  const agreementStatus = deal.agreement_status || "none";
  if (agreementStatus === "activated") {
    // 6.5: 'aktiviert' = der Einsatz laeuft noch. Erst 'abgeschlossen', wenn das
    // Einsatz-Enddatum vorbei ist; vorher (oder ohne Enddatum) bleibt der Deal aktiv/in Prozess.
    const endMs = deal.end_date ? new Date(deal.end_date).getTime() : NaN;
    return (Number.isFinite(endMs) && endMs < nowMs) ? "completed" : "active";
  }
  if (
    offerStatus === "rejected" ||
    offerStatus === "withdrawn" ||
    agreementStatus === "cancelled" ||
    agreementStatus === "expired"
  ) {
    return "cancelled";
  }
  return "active";
}

export function buildDealHistoryBucketSql(bucket, { offerAlias = "o" } = {}) {
  const normalizedBucket = normalizeDealHistoryBucket(bucket, "all");
  const agreementStatus = agreementStatusSql(offerAlias);
  const offerStatus = `${offerAlias}.status`;
  // 6.5: 'aktiviert' zaehlt erst als abgeschlossen, wenn das Einsatz-Enddatum vorbei ist.
  // NULL-Enddatum -> nicht abgeschlossen (bleibt aktiv), damit nichts zwischen Buckets faellt.
  const einsatzDone = `${agreementStatus} = 'activated' AND ${offerAlias}.end_date IS NOT NULL AND ${offerAlias}.end_date < NOW()`;
  if (normalizedBucket === "completed") {
    return `(${einsatzDone})`;
  }
  if (normalizedBucket === "cancelled") {
    return `(${offerStatus} IN ('rejected','withdrawn') OR ${agreementStatus} IN ('cancelled','expired'))`;
  }
  if (normalizedBucket === "active") {
    return `(${offerStatus} NOT IN ('rejected','withdrawn') AND ${agreementStatus} NOT IN ('cancelled','expired') AND NOT (${einsatzDone}))`;
  }
  return "TRUE";
}

export function buildDealHistorySortSql({ offerAlias = "o" } = {}) {
  const agreementStatus = agreementStatusSql(offerAlias);
  return `CASE
    WHEN ${agreementStatus} = 'activated'
      THEN COALESCE(${offerAlias}.activated_at, ${offerAlias}.updated_at, ${offerAlias}.created_at)
    ELSE COALESCE(${offerAlias}.updated_at, ${offerAlias}.created_at)
  END`;
}
