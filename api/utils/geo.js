/**
 * Geo utility helpers.
 * Canonical haversine implementation re-exported from matchingEngine,
 * plus convenience wrappers for radius filtering.
 */

const R_EARTH_KM = 6371;
const TO_RAD = Math.PI / 180;

/**
 * Haversine distance between two (lat, lng) pairs in kilometres.
 * @param {number} lat1  @param {number} lng1
 * @param {number} lat2  @param {number} lng2
 * @returns {number} distance in km
 */
export function calculateDistance(lat1, lng1, lat2, lng2) {
  const dLat = (Number(lat2) - Number(lat1)) * TO_RAD;
  const dLng = (Number(lng2) - Number(lng1)) * TO_RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(Number(lat1) * TO_RAD) * Math.cos(Number(lat2) * TO_RAD) *
    Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.sqrt(a));
}

/**
 * Filter an array of objects to those within a given radius of a point.
 * Each item must have latitude/longitude (or location_lat/location_lng).
 * @param {{ lat: number, lng: number }} origin
 * @param {Array<Object>} items
 * @param {number} radiusKm
 * @returns {Array<{ item: Object, distanceKm: number }>}
 */
export function findWithinRadius(origin, items, radiusKm) {
  const results = [];
  for (const item of items) {
    const lat = item.latitude ?? item.location_lat;
    const lng = item.longitude ?? item.location_lng;
    if (lat == null || lng == null) continue;
    const dist = calculateDistance(origin.lat, origin.lng, lat, lng);
    if (dist <= radiusKm) {
      results.push({ item, distanceKm: Math.round(dist * 100) / 100 });
    }
  }
  results.sort((a, b) => a.distanceKm - b.distanceKm);
  return results;
}

/**
 * Approximate bounding box for a quick pre-filter before haversine.
 * Returns { minLat, maxLat, minLng, maxLng }.
 */
export function boundingBox(lat, lng, radiusKm) {
  const dLat = radiusKm / R_EARTH_KM * (180 / Math.PI);
  const dLng = dLat / Math.cos(Number(lat) * TO_RAD);
  return {
    minLat: Number(lat) - dLat,
    maxLat: Number(lat) + dLat,
    minLng: Number(lng) - dLng,
    maxLng: Number(lng) + dLng
  };
}
