/**
 * SMS-Versand — duenner Adapter ueber der Provider-Entscheidung.
 *
 * Aufteilung mit Absicht:
 *   smsProviderService  — WELCHER Weg ist aktiv und was kann er? (rein funktional)
 *   smsService (hier)   — der Versand selbst.
 * Dieselbe Trennung wie bei E-Mail. Sie erlaubt, die Entscheidung vollstaendig zu
 * testen, ohne je etwas zu verschicken.
 *
 * DER SICHERE DEFAULT
 * Ohne konfigurierten Anbieter laeuft "console": die Nachricht wird protokolliert,
 * nicht gesendet. Damit ist der zweite Zustellweg heute vollstaendig verdrahtet und
 * vorfuehrbar — ohne Vertrag, ohne Abhaengigkeit, ohne Kosten. Sobald der Owner einen
 * Anbieter waehlt, kommt genau EIN Fall in `sendSms` dazu.
 *
 * WAS HIER NICHT PASSIERT
 * Kein Werfen bei fehlendem Anbieter oder fehlender Nummer. Eine Einladung darf nicht
 * scheitern, weil der Zweitweg fehlt — die E-Mail ist der verlaessliche Kanal, die SMS
 * die Zugabe. Der Rueckgabewert sagt ehrlich, was passiert ist.
 */
import { describeSms, canSendInvite, SMS_PROVIDERS } from "./smsProviderService.js";
import { createServiceLogger } from "../utils/logger.js";

const logger = createServiceLogger("sms");

/** Nummern nie vollstaendig ins Protokoll — personenbezogen (Regel S-2). */
function maskiert(phone) {
  const s = String(phone || "").replace(/\s/g, "");
  return s.length <= 4 ? "***" : `***${s.slice(-4)}`;
}

/**
 * Eine SMS senden — oder ehrlich melden, warum nicht.
 *
 * @returns {Promise<{sent:boolean, provider:string, reason:string|null}>}
 *   `sent:false` ist ein normaler Ausgang, kein Fehler.
 */
export async function sendSms(config, { phone, text }) {
  const pruefung = canSendInvite(config, { phone });
  const beschreibung = describeSms(config);

  // console ist der Entwicklungs-/Standardweg: sichtbar, aber ohne Zustellung.
  if (beschreibung.provider === SMS_PROVIDERS.CONSOLE) {
    logger.info({ an: maskiert(phone), zeichen: String(text || "").length }, "SMS (console) — nicht gesendet");
    return { sent: false, provider: SMS_PROVIDERS.CONSOLE, reason: "CONSOLE_ONLY" };
  }
  if (beschreibung.provider === SMS_PROVIDERS.DISABLED) {
    return { sent: false, provider: SMS_PROVIDERS.DISABLED, reason: "DISABLED" };
  }
  if (!pruefung.possible) {
    return { sent: false, provider: beschreibung.provider, reason: pruefung.reason };
  }

  // Ab hier gaebe es einen echten Anbieter. Der Aufruf gehoert in genau diesen
  // Block — bewusst noch nicht geschrieben: ein ungetesteter Netzaufruf gegen
  // einen Anbieter, den niemand gewaehlt hat, waere toter Code mit Kosten-Risiko.
  logger.warn(
    { provider: beschreibung.provider, an: maskiert(phone) },
    "SMS-Anbieter konfiguriert, aber kein Versand-Adapter hinterlegt"
  );
  return { sent: false, provider: beschreibung.provider, reason: "NO_ADAPTER" };
}

/**
 * Einladungstext. Kurz, weil SMS kurz ist: eine Zeile Zweck, ein Link, eine Frist.
 * Bewusst DEUTSCH — die Sprache des Empfaengers ist beim Versand unbekannt, und
 * die Zielgruppe im DACH-Raum liest deutsch (dieselbe Regel wie bei gesendeten
 * Interaktionstexten).
 */
export function buildInviteSms({ firstName, inviteUrl, orgName = null }) {
  const absender = orgName ? ` von ${orgName}` : "";
  return `Hallo ${firstName}, Sie wurden${absender} zum TempConnect Einsatzportal eingeladen. ` +
         `Konto einrichten: ${inviteUrl} (Link 7 Tage gueltig)`;
}
