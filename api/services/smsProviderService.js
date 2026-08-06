/**
 * SMS-/Messenger-Provider-Abstraktion — zweiter Einladungskanal.
 *
 * WARUM ES DEN KANAL GIBT
 * Die Einladung ins Einsatzportal ging bisher ausschliesslich per E-Mail. Genau
 * die Zielgruppe, die den Marktplatz fuellt — gewerbliche Arbeitskraefte — liest
 * aber zuverlaessiger eine SMS als ein Postfach, das sie alle paar Wochen oeffnet.
 * Jede nicht angenommene Einladung ist ein Arbeiter, der nie im Katalog auftaucht,
 * und damit ein Angebot, das der Plattform fehlt.
 *
 * WARUM ES EINE ABSTRAKTION IST UND KEIN TWILIO-AUFRUF
 * Spiegelt bewusst emailProviderService.js / billingProviderService.js
 * (resolve/describe, console-first). Der Nutzen:
 *   - KEINE neue Dependency und KEIN Vertrag noetig, um das Feature zu bauen,
 *     zu testen und zu zeigen. Ohne Konfiguration laeuft "console": die
 *     Nachricht wird geloggt statt versendet.
 *   - Der Owner entscheidet den Anbieter spaeter ueber EINE Umgebungsvariable.
 *   - Dieselbe Datei traegt in die Folgeprojekte — dort steht dieselbe Frage.
 *
 * Rein funktional: kein DB-Zugriff, kein Netz. Der Versand selbst gehoert in
 * einen duennen Adapter, sobald ein echter Anbieter gewaehlt ist.
 */

export const SMS_PROVIDERS = Object.freeze({
  TWILIO: "twilio",
  MESSAGEBIRD: "messagebird",
  CONSOLE: "console",
  DISABLED: "disabled"
});

const VALID_PROVIDERS = new Set(Object.values(SMS_PROVIDERS));

/* Spiegelt api/config/index.js: ein gesetzter, aber offensichtlich unechter Wert
   (Platzhalter aus .env.example) zaehlt nicht als konfiguriert. */
const PLACEHOLDER_PATTERNS = [
  "dev_secret_change_me", "HIER_", "DEIN_", "PLACEHOLDER", "xxxxxxxx", "ACxxxx"
];

export function looksLikePlaceholder(val) {
  if (!val || String(val).trim() === "") return true;
  return PLACEHOLDER_PATTERNS.some((p) => String(val).trim().includes(p));
}

/** Echte Twilio-Zugangsdaten vorhanden? */
export function isTwilioConfigured(config = {}) {
  return !looksLikePlaceholder(config.TWILIO_ACCOUNT_SID) &&
         !looksLikePlaceholder(config.TWILIO_AUTH_TOKEN) &&
         !looksLikePlaceholder(config.SMS_SENDER);
}

/** Echte MessageBird-Zugangsdaten vorhanden? */
export function isMessageBirdConfigured(config = {}) {
  return !looksLikePlaceholder(config.MESSAGEBIRD_API_KEY) &&
         !looksLikePlaceholder(config.SMS_SENDER);
}

/**
 * Welcher Kanal ist aktiv?
 *
 * Ableitung statt Raten: eine ausdrueckliche, gueltige SMS_PROVIDER-Angabe
 * gewinnt. Ohne Angabe entscheiden die vorhandenen Zugangsdaten — und wenn
 * keine da sind, bleibt es bei "console". Ein stiller Fehlversand ist damit
 * ausgeschlossen: ohne Konfiguration geht nichts nach draussen.
 */
export function resolveSmsProvider(config = {}) {
  config = config || {};
  const twilio = isTwilioConfigured(config);
  const messagebird = isMessageBirdConfigured(config);

  const explicit = String(config.SMS_PROVIDER || "").toLowerCase().trim();
  let provider;
  if (VALID_PROVIDERS.has(explicit)) {
    provider = explicit;
  } else if (twilio) {
    provider = SMS_PROVIDERS.TWILIO;
  } else if (messagebird) {
    provider = SMS_PROVIDERS.MESSAGEBIRD;
  } else {
    provider = SMS_PROVIDERS.CONSOLE;
  }

  return {
    provider,
    twilio_configured: twilio,
    messagebird_configured: messagebird,
    explicit: VALID_PROVIDERS.has(explicit) ? explicit : null
  };
}

/**
 * Was kann der aktive Kanal wirklich — und woran hakt es?
 *
 * `warnings` ist der wichtige Teil: Ein auf "twilio" gestellter Provider ohne
 * Zugangsdaten sieht in der Konfiguration richtig aus und versendet trotzdem
 * nichts. Diese Kombination muss laut sein, nicht still.
 */
export function describeSms(config = {}) {
  config = config || {};
  const resolution = resolveSmsProvider(config);
  const { provider, twilio_configured: twilio, messagebird_configured: messagebird } = resolution;

  const twilioActive = provider === SMS_PROVIDERS.TWILIO && twilio;
  const birdActive = provider === SMS_PROVIDERS.MESSAGEBIRD && messagebird;
  const outboundActive = twilioActive || birdActive;

  const capabilities = {
    outbound_delivery: outboundActive,   // echter Versand moeglich
    delivery_receipts: outboundActive,   // Zustellnachweis bieten beide Anbieter
    whatsapp: twilioActive,              // WhatsApp Business laeuft heute nur ueber Twilio
    dev_logging: provider === SMS_PROVIDERS.CONSOLE
  };

  const warnings = [];
  const explicitRaw = String(config.SMS_PROVIDER || "").toLowerCase().trim();
  if (explicitRaw && !VALID_PROVIDERS.has(explicitRaw)) {
    warnings.push(`Unbekannter SMS_PROVIDER="${explicitRaw}" – abgeleiteter Kanal "${provider}" wird genutzt.`);
  }
  if (provider === SMS_PROVIDERS.TWILIO && !twilio) {
    warnings.push("SMS_PROVIDER=twilio, aber TWILIO_ACCOUNT_SID/AUTH_TOKEN/SMS_SENDER fehlen oder sind Platzhalter – es wird nur geloggt.");
  }
  if (provider === SMS_PROVIDERS.MESSAGEBIRD && !messagebird) {
    warnings.push("SMS_PROVIDER=messagebird, aber MESSAGEBIRD_API_KEY/SMS_SENDER fehlen oder sind Platzhalter – es wird nur geloggt.");
  }

  return { ...resolution, capabilities, warnings };
}

/**
 * Ist der zweite Kanal fuer eine konkrete Einladung ueberhaupt nutzbar?
 *
 * Bewusst getrennt von `describeSms`: Selbst bei aktivem Anbieter bleibt der
 * Kanal ohne Mobilnummer wertlos. Diese Pruefung gehoert an EINE Stelle, sonst
 * beantwortet sie jede aufrufende Stelle anders.
 */
export function canSendInvite(config = {}, { phone = null } = {}) {
  const d = describeSms(config);
  const hatNummer = typeof phone === "string" && /^\+?[0-9 ()/-]{6,}$/.test(phone.trim());
  return {
    possible: d.capabilities.outbound_delivery && hatNummer,
    provider: d.provider,
    reason: !hatNummer ? "NO_PHONE"
      : (!d.capabilities.outbound_delivery ? "NO_PROVIDER" : null)
  };
}
