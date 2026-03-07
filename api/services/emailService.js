/**
 * E-Mail-Service: Zentraler Versand ueber Nodemailer.
 * Wird vom emailWorker und anderen Services genutzt.
 * Falls SMTP_HOST nicht konfiguriert, wird der Versand geloggt und uebersprungen (Dev-Modus).
 */

import nodemailer from "nodemailer";
import { config, logger } from "../config/index.js";

/** Transporter wird lazy erstellt, sobald sendMail aufgerufen wird */
let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  if (!config.SMTP_HOST) {
    logger.warn("SMTP_HOST nicht konfiguriert — E-Mails werden nur geloggt (Dev-Modus)");
    return null;
  }

  _transporter = nodemailer.createTransport({
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
  });

  return _transporter;
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
