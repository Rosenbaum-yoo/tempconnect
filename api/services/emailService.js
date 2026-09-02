/**
 * E-Mail-Service: Zentraler Versand ueber Nodemailer.
 * Wird vom emailWorker und anderen Services genutzt.
 * Falls SMTP_HOST nicht konfiguriert, wird der Versand geloggt und uebersprungen (Dev-Modus).
 */

import nodemailer from "nodemailer";
import { config } from "../config/index.js";
import { createServiceLogger } from "../utils/logger.js";
import { resolveEmailProvider, describeEmail, EMAIL_PROVIDERS, versandwegPflicht } from "./emailProviderService.js";
import { mitRahmen } from "./emailHtmlTemplates.js";
/* M1.3 — Riegel und Protokoll. Der Pool wird hier direkt geholt statt
 * durchgereicht: `sendMail` hat 42 Aufrufer, und ein neuer Pflichtparameter
 * an allen 42 waere ein grosser Diff fuer eine Beobachtung, die ohnehin nie
 * wirft. `mailNotieren` vertraegt einen Pool ohne Datenbank. */
import { pool } from "../db/pool.js";
import { mailNotieren, KeinVersandweg } from "./mailProtokollService.js";

const logger = createServiceLogger("emailService");

/** Transporter wird lazy erstellt, sobald sendMail aufgerufen wird */
let _transporter = null;

/**
 * Liefert die nodemailer-Transport-Optionen je Provider — oder null, wenn nicht
 * gesendet wird (console/disabled oder Provider ohne echte Konfiguration).
 * SendGrid läuft bewusst über SMTP-Relay (keine neue Dependency).
 */
function buildTransportOpts(provider) {
  if (provider === EMAIL_PROVIDERS.SENDGRID) {
    return {
      host: "smtp.sendgrid.net",
      port: 587,
      secure: false,
      auth: { user: "apikey", pass: config.SENDGRID_API_KEY },
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
    };
  }
  if (provider === EMAIL_PROVIDERS.SMTP) {
    return {
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_PORT === 465,
      auth:
        config.SMTP_USER && config.SMTP_PASS
          ? { user: config.SMTP_USER, pass: config.SMTP_PASS }
          : undefined,
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
    };
  }
  return null; // console / disabled → nur loggen, kein Versand
}

function getTransporter() {
  if (_transporter) return _transporter;

  const { provider } = resolveEmailProvider(config);
  const opts = buildTransportOpts(provider);

  if (!opts) {
    logger.warn({ provider }, "Kein E-Mail-Versandweg aktiv — E-Mails werden nur geloggt");
    return null;
  }

  _transporter = nodemailer.createTransport(opts);
  return _transporter;
}

/** Ehrliche Provider-Selbstauskunft (Provider/Capabilities/Warnings) für Health-/SCC-Sicht. */
export function describe() {
  return describeEmail(config);
}

/**
 * E-Mail senden.
 * @param {Object} opts
 * @param {string} opts.to - Empfaenger-Adresse(n)
 * @param {string} opts.subject - Betreff
 * @param {string} [opts.html] - HTML-Body
 * @param {string} [opts.text] - Text-Body
 * @param {string} [opts.from] - Absender (default: SMTP_FROM)
 * @returns {Promise<Object>} Nodemailer-Info oder Log-Dummy
 */
export async function sendMail({ to, subject, html, text, from, zweck } = {}) {
  const fromAddr = from || config.SMTP_FROM;
  const transporter = getTransporter();

  /*
   * ═══════════════════════════════════════════════════════════════════════
   * DER RIEGEL (M1.3)
   * ═══════════════════════════════════════════════════════════════════════
   * Vorher gab dieser Zweig ohne Transport ein erfolgreich AUSSEHENDES
   * Ergebnis zurueck: `{ messageId: "dev-…", accepted: [to], rejected: [] }`.
   * Wer die Antwort prueft — und der BullMQ-Email-Arbeiter tut das ueber den
   * Wurf —, konnte den Nichtversand nicht von einem Versand unterscheiden.
   *
   * Die Entscheidung kommt aus `versandwegPflicht`, also aus derselben
   * Funktion wie im Weg ueber `app.js`. Zwei Mechaniken fuer dieselbe Zusage
   * waeren genau der Zustand, den M1.3 abschafft.
   */
  const pflicht = versandwegPflicht(config);
  if (!transporter || !pflicht.senden) {
    await mailNotieren(pool, {
      zweck, ergebnis: "ohne_versandweg", weg: pflicht.weg, fehler: pflicht.grund
    });
    if (pflicht.hart) {
      logger.error({ zweck, weg: pflicht.weg }, "E-Mail ohne Versandweg abgelehnt");
      throw new KeinVersandweg(pflicht.grund);
    }
    logger.info({ to, subject, from: fromAddr, zweck, weg: pflicht.weg },
      "E-Mail nicht gesendet (kein Versandweg, Entwicklung)");
    /* `accepted` bleibt LEER — auch in Entwicklung. Wer die Antwort liest,
     * soll den Unterschied sehen koennen; der Dev-Modus ist kein Grund,
     * dieselbe Luege leiser zu erzaehlen. */
    return { messageId: `ohne-versandweg-${Date.now()}`, accepted: [], rejected: [to], zugestellt: false };
  }

  /*
   * DER ABSENDER-FUSS GEHOERT AUF BEIDE MAILWEGE.
   *
   * Am 2026-08-24 wurde entschieden, dass JEDE Mail die Pflichtangaben traegt
   * (Firmierung, Kontakt — § 37a HGB), und `mitRahmen` in den sendMail-Engpass
   * von `app.js` gesetzt. Dieser Dienst hier ist der ZWEITE Weg: ihn nutzen der
   * BullMQ-Email-Worker, `orgControlCenter.js` und `workerSubmissionService.js`.
   * Er ging leer aus — "jede Mail" waren in Wahrheit nur die aus dem einen
   * Engpass. Gefunden am 2026-08-26 beim Anschluss des Arbeiter-Meldewegs.
   *
   * `mitRahmen` ist gutmuetig: ein bereits vollstaendiges HTML-Dokument gibt es
   * unveraendert zurueck, die bestehenden Vorlagen bleiben also unberuehrt. Und
   * NUR wenn es HTML gibt — eine reine Textmail in einen HTML-Rahmen zu packen
   * ergaebe ein leeres Dokument mit Fuss und ohne Inhalt.
   */
  let info;
  try {
    info = await transporter.sendMail({
      from: fromAddr,
      to,
      subject,
      html: html ? mitRahmen(html, subject) : undefined,
      text: text || undefined,
    });
  } catch (e) {
    /* Der Wurf bleibt — der BullMQ-Arbeiter braucht ihn fuer seinen
     * Wiederholungsversuch. Neu ist nur, dass der Fehlschlag auch dann
     * sichtbar wird, wenn ihn oben niemand faengt. */
    await mailNotieren(pool, { zweck, ergebnis: "fehlgeschlagen", weg: pflicht.weg, fehler: e?.message });
    throw e;
  }

  await mailNotieren(pool, { zweck, ergebnis: "zugestellt", weg: pflicht.weg });
  logger.info({ messageId: info.messageId, to, subject, zweck }, "E-Mail gesendet");
  return info;
}

/**
 * Transporter-Verbindung testen (fuer Health-Checks).
 * @returns {Promise<boolean>}
 */
export async function verifyConnection() {
  const transporter = getTransporter();
  if (!transporter) return false;
  try {
    await transporter.verify();
    return true;
  } catch (err) {
    logger.warn({ err: err.message }, "SMTP-Verbindung fehlgeschlagen");
    return false;
  }
}
