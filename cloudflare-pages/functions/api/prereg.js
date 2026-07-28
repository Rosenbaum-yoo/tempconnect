/**
 * Pilot-Voranmeldung — serverseitige Weiterleitung an Web3Forms.
 *
 * Warum es diese Funktion gibt: der Web3Forms-Access-Key lag vorher im Klartext in
 * `index.html` und damit im Repository. Bei Web3Forms ist der Key zwar per Design
 * oeffentlich — committet heisst aber: jeder, der das Repo sieht, kann die Inbox des
 * Owners zuschuetten. Hier liegt er als Umgebungsgeheimnis bei Cloudflare und verlaesst
 * den Server nie.
 *
 * Cloudflare Pages Functions: diese Datei beantwortet automatisch `POST /api/prereg`.
 *
 * Einrichtung (einmalig, im Cloudflare-Dashboard):
 *   Settings → Environment variables → `WEB3FORMS_KEY` = <Access-Key> (als Secret)
 *
 * Ohne gesetzte Variable antwortet die Funktion mit 503 und einer klaren Meldung —
 * das Formular sagt dann ehrlich, dass es nicht konfiguriert ist, statt still zu schlucken.
 */

const ALLOWED_FIELDS = [
  "Seite", "Organisation", "Ansprechpartner", "E-Mail", "Telefon",
  "Branche", "Größe", "Bedarf / Kapazität", "Empfohlen von",
  "Einsatzort Hamburg bestätigt", "Quelle"
];

const MAX_FIELD_LENGTH = 2000;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });

export async function onRequestPost({ request, env }) {
  const key = env.WEB3FORMS_KEY;
  if (!key) {
    return json({ success: false, message: "Formular ist serverseitig nicht konfiguriert." }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, message: "Ungültige Anfrage." }, 400);
  }

  // Honeypot: ausgefuellt = Bot. Freundlich bestaetigen, aber nichts weiterleiten.
  if (body.botcheck) return json({ success: true });

  const email = String(body["E-Mail"] || "").trim();
  const org = String(body["Organisation"] || "").trim();
  if (!org || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ success: false, message: "Bitte Organisation und eine gültige E-Mail angeben." }, 400);
  }

  // Nur bekannte Felder weiterreichen und laengenbegrenzen: der Client bestimmt nicht,
  // was in der Mail landet.
  const payload = {
    access_key: key,
    subject: `Pilot-Voranmeldung (${String(body["Seite"] || "").slice(0, 60)}): ${org.slice(0, 120)}`,
    from_name: "TempConnect One-Pager",
    replyto: email
  };
  for (const field of ALLOWED_FIELDS) {
    if (body[field] != null) payload[field] = String(body[field]).slice(0, MAX_FIELD_LENGTH);
  }

  try {
    const upstream = await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await upstream.json().catch(() => ({}));
    if (result && result.success) return json({ success: true });
    return json({ success: false, message: "Übermittlung fehlgeschlagen. Bitte später erneut versuchen." }, 502);
  } catch {
    return json({ success: false, message: "Übermittlung fehlgeschlagen. Bitte später erneut versuchen." }, 502);
  }
}

// Bewusst NUR `onRequestPost`: Cloudflare beantwortet andere Methoden dann selbst mit 405.
// Ein zusaetzliches `onRequest` wuerde die methodenspezifische Variante aushebeln.
