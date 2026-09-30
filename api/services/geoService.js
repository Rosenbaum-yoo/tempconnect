const GEO_USER_AGENT = "TempConnect/1.0 (support@tempconnect.de)";

/**
 * N2.7 — WIE LANGE AUF DEN KARTENDIENST GEWARTET WIRD.
 *
 * Bis hierher: unbegrenzt. Seit N2.0 haengt die Geokodierung im Anlagepfad von
 * Bedarf und Angebot; antwortet Nominatim nicht (Ratenbegrenzung, Stoerung),
 * haengt damit das Absenden — und zwar fuer einen Nutzer, der alles richtig
 * gemacht hat. Nach drei Sekunden gilt der Punkt als nicht ermittelbar; der
 * Datensatz entsteht trotzdem und faellt auf den Stadtvergleich zurueck.
 */
export const GEO_TIMEOUT_MS = 3000;

const mitFrist = (opt) => ({
  headers: { "User-Agent": GEO_USER_AGENT },
  signal: AbortSignal.timeout(Number(opt?.timeoutMs) > 0 ? Number(opt.timeoutMs) : GEO_TIMEOUT_MS)
});

export async function geocode(postalCode, city, opt = {}) {
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
    const res = await fetch(url, mitFrist(opt));
    const data = await res.json();
    if (Array.isArray(data) && data[0] && typeof data[0].lat === "string" && typeof data[0].lon === "string") {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
    return null;
  } catch {
    return null;
  }
}

export async function geocodeQuery(q, opt = {}) {
  if (!q || String(q).trim() === "") return null;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(String(q).trim() + ", Germany")}&format=json&limit=1`;
  try {
    const res = await fetch(url, mitFrist(opt));
    const data = await res.json();
    if (Array.isArray(data) && data[0] && typeof data[0].lat === "string" && typeof data[0].lon === "string") {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
    return null;
  } catch {
    return null;
  }
}
