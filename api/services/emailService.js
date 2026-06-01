/**
 * E-Mail-Service: Zentraler Versand ueber Nodemailer.
 * Wird vom emailWorker und anderen Services genutzt.
 * Falls SMTP_HOST nicht konfiguriert, wird der Versand geloggt und uebersprungen (Dev-Modus).
 */

import nodemailer from "nodemailer";
import { config } from "../config/index.js";
import { createServiceLogger } from "../utils/logger.js";
import { resolveEmailProvider, describeEmail, EMAIL_PROVIDERS } from "./emailProviderService.js";

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
export async function sendMail({ to, subject, html, text, from } = {}) {
  const fromAddr = from || config.SMTP_FROM;
  const transporter = getTransporter();

  if (!transporter) {
    // Dev-Modus: nur loggen
    logger.info({ to, subject, from: fromAddr }, "E-Mail (Dev-Modus, nicht gesendet)");
    return { messageId: `dev-${Date.now()}`, accepted: [to], rejected: [] };
  }

  const info = await transporter.sendMail({
    from: fromAddr,
    to,
    subject,
    html: html || undefined,
    text: text || undefined,
  });

  logger.info({ messageId: info.messageId, to, subject }, "E-Mail gesendet");
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
