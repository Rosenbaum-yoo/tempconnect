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

export function getDealHistoryBucket(deal) {
  if (!deal) return "active";
  const offerStatus = deal.status || null;
  const agreementStatus = deal.agreement_status || "none";
  if (agreementStatus === "activated") return "completed";
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
  if (normalizedBucket === "completed") {
    return `${agreementStatus} = 'activated'`;
  }
  if (normalizedBucket === "cancelled") {
    return `(${offerStatus} IN ('rejected','withdrawn') OR ${agreementStatus} IN ('cancelled','expired'))`;
  }
  if (normalizedBucket === "active") {
    return `(${offerStatus} NOT IN ('rejected','withdrawn') AND ${agreementStatus} NOT IN ('activated','cancelled','expired'))`;
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
