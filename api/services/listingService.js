/**
 * Listing-Service: SQL-Queries fuer Karteikarten/Angebote.
 */

/** Listings suchen (mit optionalem Geo-Radius). */
export async function searchListings(pool, { type, category, region, notdienst, centerLat, centerLng, radiusKm }) {
  const params = [];
  const where = ["l.is_active=TRUE"];
  if (type) { params.push(type); where.push(`l.type=$${params.length}`); }
  if (category) { params.push(`%${category}%`); where.push(`l.category ILIKE $${params.length}`); }
  if (region) { params.push(`%${region}%`); where.push(`l.region ILIKE $${params.length}`); }
  if (notdienst === "1") where.push("l.notdienst=TRUE");

  const useRadius = !Number.isNaN(centerLat) && !Number.isNaN(centerLng) && !Number.isNaN(radiusKm) && radiusKm > 0;
  if (useRadius) {
    params.push(centerLat, centerLng, radiusKm);
    const clat = params.length - 2;
    const clng = params.length - 1;
    const rkm = params.length;
    where.push(`((l.latitude IS NULL OR l.longitude IS NULL) OR (6371 * acos(least(1, greatest(-1, cos(radians(l.latitude)) * cos(radians($${clat})) * cos(radians($${clng}) - radians(l.longitude)) + sin(radians(l.latitude)) * sin(radians($${clat}))))) <= $${rkm}))`);
  }

  const q = `
    SELECT l.*, u.email, u.company_name,
           COALESCE(rs.avg_rating, 0) AS avg_rating,
           COALESCE(rs.rating_count, 0)::int AS rating_count
    FROM listings l
    JOIN users u ON u.id = l.owner_id
    LEFT JOIN (
      SELECT rated_id, ROUND(AVG(stars)::numeric, 1) AS avg_rating, COUNT(*) AS rating_count
      FROM ratings
      GROUP BY rated_id
    ) rs ON rs.rated_id = l.owner_id
    WHERE ${where.join(" AND ")}
    ORDER BY l.notdienst DESC, l.updated_at DESC
    LIMIT 200`;
  const r = await pool.query(q, params);
  return r.rows;
}

/** Eigene Listings laden. */
export async function getMyListings(pool, userId) {
  const r = await pool.query(
    "SELECT * FROM listings WHERE owner_id=$1 AND is_active=TRUE ORDER BY updated_at DESC",
    [userId]
  );
  return r.rows;
}

/** Listing erstellen. */
export async function createListing(pool, userId, type, data) {
  const { category, region, qty, start_date, note, notdienst, postal_code, city } = data;
  const r = await pool.query(
    "INSERT INTO listings (owner_id, type, category, region, qty, start_date, note, notdienst, postal_code, city) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",
    [userId, type, category, region, qty, start_date || null, note || null, !!notdienst, postal_code || null, city || null]
  );
  return r.rows[0];
}

/** Listing aktualisieren. */
export async function updateListing(pool, id, userId, data) {
  const { category, region, qty, start_date, note, notdienst, postal_code, city } = data;
  const r = await pool.query(
    `UPDATE listings
     SET category=$1, region=$2, qty=$3, start_date=$4, note=$5, notdienst=$6, postal_code=$7, city=$8, updated_at=NOW()
     WHERE id=$9 AND owner_id=$10
     RETURNING *`,
    [category, region, qty, start_date || null, note || null, !!notdienst, postal_code || null, city || null, id, userId]
  );
  return r.rows[0] || null;
}

/** Geo-Koordinaten fuer Listing setzen. */
export async function updateListingGeo(pool, id, lat, lng) {
  const r = await pool.query(
    "UPDATE listings SET latitude=$1, longitude=$2, updated_at=NOW() WHERE id=$3 RETURNING *",
    [lat, lng, id]
  );
  return r.rows[0];
}

/** Geo-Koordinaten fuer Listing loeschen. */
export async function clearListingGeo(pool, id) {
  await pool.query("UPDATE listings SET latitude=NULL, longitude=NULL, updated_at=NOW() WHERE id=$1", [id]);
}

/** Listing soft-loeschen. */
export async function softDeleteListing(pool, id, userId) {
  const r = await pool.query(
    "UPDATE listings SET is_active=FALSE, updated_at=NOW() WHERE id=$1 AND owner_id=$2 RETURNING id",
    [id, userId]
  );
  return !!r.rows[0];
}
