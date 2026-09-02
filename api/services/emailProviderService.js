/**
 * E-Mail-Provider-Abstraktion (Phase E).
 *
 * Zweck: EINE Wahrheitsquelle dafür, welcher Versandweg aktiv ist —
 *   SMTP (generischer Server) · SendGrid (als SMTP-Relay) · console (nur Logging) · disabled (aus) —
 * und welche Fähigkeiten dabei real verfügbar sind.
 *
 * Rein funktional, ohne DB/IO → vollständig unit-testbar und in emailService.js additiv
 * (preserve-first) einsetzbar. Es wird KEINE neue Dependency benötigt: SendGrid läuft über
 * den bestehenden nodemailer-Transport (smtp.sendgrid.net, user "apikey"). "console" ist der
 * sichere Default ohne Konfiguration (E-Mails werden nur geloggt). Echte SMTP-/SendGrid-Keys
 * bleiben Owner-/Betriebssache (Gate-50 / Risiko R3).
 *
 * Spiegelt bewusst das Muster aus billingProviderService.js (resolve/describe), bleibt aber
 * entkoppelt (eigene Platzhalter-Erkennung statt Cross-Import) — isolierter Email-Diff.
 */

export const EMAIL_PROVIDERS = Object.freeze({
  SMTP: "smtp",
  SENDGRID: "sendgrid",
  CONSOLE: "console",
  DISABLED: "disabled"
});

const VALID_PROVIDERS = new Set(Object.values(EMAIL_PROVIDERS));

// Spiegelt api/config/index.js – ein gesetzter, aber offensichtlich unechter Wert
// (Platzhalter aus .env.example) zählt nicht als "konfiguriert".
const PLACEHOLDER_PATTERNS = [
  "dev_secret_change_me", "HIER_", "DEIN_", "PLACEHOLDER",
  "superlangundzufaellig", "SG.DEIN", "xxxxxxxx"
];

export function looksLikePlaceholder(val) {
  if (!val || String(val).trim() === "") return true;
  return PLACEHOLDER_PATTERNS.some((p) => String(val).trim().includes(p));
}

/** Echter (nicht-Platzhalter) SMTP-Host vorhanden? */
export function isSmtpConfigured(config = {}) {
  return !looksLikePlaceholder((config || {}).SMTP_HOST);
}

/** Echter (nicht-Platzhalter) SendGrid-API-Key vorhanden? */
export function isSendgridConfigured(config = {}) {
  return !looksLikePlaceholder((config || {}).SENDGRID_API_KEY);
}

/**
 * Bestimmt den aktiven E-Mail-Provider.
 *   - Explizites EMAIL_PROVIDER (smtp|sendgrid|console|disabled) gewinnt immer.
 *   - Sonst rückwärtskompatible Ableitung: SendGrid wenn Key vorhanden, sonst
 *     SMTP wenn SMTP_HOST vorhanden, sonst "console" (Dev-Logging).
 * @returns {{provider:string, source:"explicit"|"derived", smtp_configured:boolean, sendgrid_configured:boolean}}
 */
export function resolveEmailProvider(config = {}, opts = {}) {
  config = config || {};
  opts = opts || {};
  const explicit = String(config.EMAIL_PROVIDER || "").toLowerCase().trim();
  const smtpConfigured = typeof opts.smtpConfigured === "boolean"
    ? opts.smtpConfigured
    : isSmtpConfigured(config);
  const sendgridConfigured = typeof opts.sendgridConfigured === "boolean"
    ? opts.sendgridConfigured
    : isSendgridConfigured(config);

  if (VALID_PROVIDERS.has(explicit)) {
    return { provider: explicit, source: "explicit", smtp_configured: smtpConfigured, sendgrid_configured: sendgridConfigured };
  }

  let derived = EMAIL_PROVIDERS.CONSOLE;
  if (sendgridConfigured) derived = EMAIL_PROVIDERS.SENDGRID;
  else if (smtpConfigured) derived = EMAIL_PROVIDERS.SMTP;
  return { provider: derived, source: "derived", smtp_configured: smtpConfigured, sendgrid_configured: sendgridConfigured };
}

/**
 * Ehrliche Selbstauskunft für Health-/SCC-Sicht: welcher Provider, woraus abgeleitet,
 * welche Fähigkeiten real verfügbar sind, plus Warnungen bei Fehlkonfiguration
 * (Provider=smtp ohne Host, Provider=sendgrid ohne Key, console = nur Logging etc.).
 */
export function describeEmail(config = {}, opts = {}) {
  config = config || {};
  const resolution = resolveEmailProvider(config, opts);
  const { provider, smtp_configured: smtpConfigured, sendgrid_configured: sendgridConfigured } = resolution;

  const smtpActive = provider === EMAIL_PROVIDERS.SMTP && smtpConfigured;
  const sendgridActive = provider === EMAIL_PROVIDERS.SENDGRID && sendgridConfigured;
  const outboundActive = smtpActive || sendgridActive;

  const capabilities = {
    outbound_delivery: outboundActive,            // echter Versand möglich (smtp/sendgrid aktiv)
    pooled_connections: outboundActive,           // nodemailer-Pool (beide Versandwege)
    bounce_tracking: sendgridActive,              // Bounce-/Event-Webhooks nur via SendGrid
    dev_logging: provider === EMAIL_PROVIDERS.CONSOLE  // E-Mails werden nur geloggt
  };

  const warnings = [];
  const explicitRaw = String(config.EMAIL_PROVIDER || "").toLowerCase().trim();
  if (explicitRaw && !VALID_PROVIDERS.has(explicitRaw)) {
    warnings.push(`Unbekannter EMAIL_PROVIDER="${explicitRaw}" – abgeleiteter Provider "${provider}" wird genutzt.`);
  }
  if (provider === EMAIL_PROVIDERS.SMTP && !smtpConfigured) {
    warnings.push("EMAIL_PROVIDER=smtp, aber SMTP_HOST fehlt/Platzhalter – E-Mails werden nur geloggt.");
  }
  if (provider === EMAIL_PROVIDERS.SENDGRID && !sendgridConfigured) {
    warnings.push("EMAIL_PROVIDER=sendgrid, aber SENDGRID_API_KEY fehlt/Platzhalter – E-Mails werden nur geloggt.");
  }
  if (provider === EMAIL_PROVIDERS.CONSOLE) {
    warnings.push("Provider \"console\" – E-Mails werden nur geloggt, nicht zugestellt (Dev-Modus).");
  }
  if (provider === EMAIL_PROVIDERS.DISABLED) {
    warnings.push("Provider \"disabled\" – E-Mail-Versand ist bewusst abgeschaltet.");
  }

  return {
    provider,
    source: resolution.source,
    smtp_configured: smtpConfigured,
    sendgrid_configured: sendgridConfigured,
    from: config.SMTP_FROM || null,
    capabilities,
    warnings
  };
}


/* ═══════════════════════════════════════════════════════════════════════════
 * M1.3 — DIE ENTSCHEIDUNG "DARF GESENDET WERDEN?"
 * ═══════════════════════════════════════════════════════════════════════════
 * Sie steht HIER und nicht im Protokoll-Dienst, aus einem harten Grund: der
 * Startpruefer sitzt in `config/index.js`, und diese Datei ist die einzige der
 * beiden, die `config` nicht importiert. Umgekehrt gaebe es einen Ringschluss.
 *
 * Inhaltlich gehoert sie ohnehin neben `describeEmail`: es ist dieselbe Frage,
 * einmal als Auskunft und einmal als Urteil.
 */
/**
 * Darf ueberhaupt gesendet werden — und wenn nein, ist das ein Fehler?
 *
 * Trennt die zwei Faelle, die vorher einen Topf bildeten:
 *
 *   - KEIN VERSANDWEG IN PRODUKTION → das ist ein Konfigurationsfehler. Eine
 *     Einladung, die Zustellung meldet und nie ankommt, kostet einen Kunden.
 *     Hier wird hart abgelehnt.
 *   - KEIN VERSANDWEG IN ENTWICKLUNG → gewollt. Mailpit und `console` sind
 *     der Normalzustand; ein Wurf waere nur laestig.
 *
 * @param {object} config
 * @param {{produktion?: boolean}} [opts]
 * @returns {{senden: boolean, weg: string, hart: boolean, grund: string|null}}
 *   `senden`  – es gibt einen echten Versandweg
 *   `hart`    – ohne Versandweg MUSS der Aufruf scheitern
 *   `weg`     – smtp | sendgrid | console | disabled
 */
export function versandwegPflicht(config = {}, opts = {}) {
  const produktion = typeof opts.produktion === "boolean"
    ? opts.produktion
    : String(process.env.NODE_ENV || "").toLowerCase() === "production";

  const auskunft = describeEmail(config);
  const senden = Boolean(auskunft.capabilities?.outbound_delivery);

  if (senden) return { senden: true, weg: auskunft.provider, hart: false, grund: null };

  /*
   * `disabled` ist eine AUSDRUECKLICHE Entscheidung des Betreibers, `console`
   * ist der Zustand, in den man ohne Konfiguration faellt. Beide duerfen in
   * Produktion nicht still Erfolg melden — aber nur der zweite ist auch ein
   * Grund, den Start zu verweigern (siehe `startPruefung`).
   */
  const grund = auskunft.provider === EMAIL_PROVIDERS.DISABLED
    ? "E-Mail-Versand ist abgeschaltet (EMAIL_PROVIDER=disabled)"
    : "Kein E-Mail-Versandweg konfiguriert (weder SMTP_HOST noch SENDGRID_API_KEY)";

  return { senden: false, weg: auskunft.provider, hart: produktion, grund };
}

/**
 * Die Startpruefung: soll der Prozess mit dieser Konfiguration ueberhaupt
 * hochkommen?
 *
 * Nur wenn NIEMAND den Zustand gewaehlt hat. `EMAIL_PROVIDER=disabled` ist
 * eine Betriebsentscheidung und wird respektiert — dann scheitert spaeter
 * jeder einzelne Versand laut, was ehrlich genug ist. Ein abgeleitetes
 * `console` dagegen heisst: es hat schlicht niemand eingerichtet.
 *
 * @returns {string|null} Fehlermeldung, oder null wenn in Ordnung
 */
export function startPruefung(config = {}, opts = {}) {
  const produktion = typeof opts.produktion === "boolean"
    ? opts.produktion
    : String(process.env.NODE_ENV || "").toLowerCase() === "production";
  if (!produktion) return null;

  const auskunft = describeEmail(config);
  if (auskunft.capabilities?.outbound_delivery) return null;
  if (auskunft.provider === EMAIL_PROVIDERS.DISABLED) return null;

  return "In Produktion muss ein E-Mail-Versandweg konfiguriert sein "
    + "(SMTP_HOST oder SENDGRID_API_KEY). Ohne ihn melden Einladungen und "
    + "Zahlungserinnerungen Zustellung, ohne zugestellt zu werden. "
    + "Bewusst ohne Mailversand betreiben: EMAIL_PROVIDER=disabled setzen.";
}
