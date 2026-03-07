const GEO_USER_AGENT = "TempConnect/1.0 (support@tempconnect.de)";

export async function geocode(postalCode, city) {
  let url;
  if (postalCode && city) {
    url = `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(postalCode)}&city=${encodeURIComponent(city)}&country=Germany&format=json&limit=1`;
  } else if (postalCode) {
    url = `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(postalCode)}&country=Germany&format=json&limit=1`;
  } else if (city) {
    url = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(city)}&country=Germany&format=json&limit=1`;
  } else {
    return null;
  }
  try {
    const res = await fetch(url, { headers: { "User-Agent": GEO_USER_AGENT } });
    const data = await res.json();
    if (Array.isArray(data) && data[0] && typeof data[0].lat === "string" && typeof data[0].lon === "string") {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
    return null;
  } catch (e) {
    return null;
  }
}

export async function geocodeQuery(q) {
  if (!q || String(q).trim() === "") return null;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(String(q).trim() + ", Germany")}&format=json&limit=1`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": GEO_USER_AGENT } });
    const data = await res.json();
    if (Array.isArray(data) && data[0] && typeof data[0].lat === "string" && typeof data[0].lon === "string") {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
    return null;
  } catch (e) {
    return null;
  }
}
