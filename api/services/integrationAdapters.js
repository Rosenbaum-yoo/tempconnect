/**
 * Integration Adapters: Slack + Teams message formatters and HTTP senders.
 * Each adapter transforms a normalized integration event into provider-specific payload.
 * Senders use native fetch with timeout + structured error handling.
 */

import { logger } from "../config/index.js";
import { computeSignature } from "./integrationService.js";

const SEND_TIMEOUT_MS = 8000;
const BASE_URL = process.env.BASE_URL || "http://localhost:8080";

/* ── Event Metadata ──────────────────────────────────────── */

const EVENT_META = {
  'offer.received':                      { emoji: '📩', color: '#4a9eff', title: 'Neues Angebot eingegangen' },
  'offer.accepted':                      { emoji: '✅', color: '#34d399', title: 'Angebot angenommen' },
  'offer.rejected':                      { emoji: '❌', color: '#f87171', title: 'Angebot abgelehnt' },
  'requisition.submitted_for_approval':  { emoji: '📋', color: '#fbbf24', title: 'Arbeitsplatzangebot zur Freigabe' },
  'requisition.approved':                { emoji: '✅', color: '#34d399', title: 'Arbeitsplatzangebot freigegeben' },
  'requisition.rejected':                { emoji: '⚠️', color: '#f87171', title: 'Arbeitsplatzangebot abgelehnt' },
  'requisition.filled':                  { emoji: '🎯', color: '#34d399', title: 'Arbeitsplatzangebot besetzt' },
  'deal.completed':                      { emoji: '🤝', color: '#34d399', title: 'Deal abgeschlossen' },
  'assignment.starting_soon':            { emoji: '📅', color: '#fbbf24', title: 'Einsatz beginnt bald' },
  'capacity.match_found':                { emoji: '🔍', color: '#4a9eff', title: 'Neuer Match gefunden' },
  'capacity.interest_received':          { emoji: '👋', color: '#4a9eff', title: 'Interesse an Personal' },
  'compliance.expiring':                 { emoji: '⏰', color: '#fbbf24', title: 'Dokument läuft bald ab' },
  'compliance.verified':                 { emoji: '🛡️', color: '#34d399', title: 'Dokument verifiziert' },
  'capacity.expiring_soon':              { emoji: '⏳', color: '#fbbf24', title: 'Personalangebot läuft ab' },
  'requisition.cancelled':               { emoji: '🚫', color: '#f87171', title: 'Arbeitsplatzangebot storniert' },
  'supplier.invited':                    { emoji: '📨', color: '#4a9eff', title: 'Lieferant eingeladen' },
  // Assignments
  'assignment.completed':                { emoji: '✅', color: '#34d399', title: 'Einsatz abgeschlossen' },
  // Timesheets
  'timesheet.submitted':                 { emoji: '📝', color: '#fbbf24', title: 'Stundenzettel eingereicht' },
  'timesheet.approved':                  { emoji: '✅', color: '#34d399', title: 'Stundenzettel genehmigt' },
  'timesheet.rejected':                  { emoji: '❌', color: '#f87171', title: 'Stundenzettel abgelehnt' },
  // Contracts
  'contract.activated':                  { emoji: '📝', color: '#34d399', title: 'Vertrag aktiviert' },
  'contract.terminated':                 { emoji: '🚫', color: '#f87171', title: 'Vertrag beendet' },
  // Invoices
  'invoice.issued':                      { emoji: '💰', color: '#4a9eff', title: 'Rechnung ausgestellt' },
  'invoice.paid':                        { emoji: '✅', color: '#34d399', title: 'Rechnung bezahlt' }
};

function getMeta(eventKey) {
  return EVENT_META[eventKey] || { emoji: 'ℹ️', color: '#8d9bba', title: eventKey };
}

/* ── Slack Formatter (Block Kit) ─────────────────────────── */

/**
 * Format an integration event as a Slack Block Kit message.
 * @param {string} eventKey
 * @param {Object} context - { message, linkPath, entityType, entityId, orgName }
 * @returns {Object} Slack payload
 */
export function formatSlack(eventKey, context = {}) {
  const meta = getMeta(eventKey);
  const link = context.linkPath ? `${BASE_URL}${context.linkPath}` : null;
  const timestamp = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });

  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: `${meta.emoji} ${meta.title}`, emoji: true }
    }
  ];

  if (context.message) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: context.message }
    });
  }

  // Context line with metadata
  const contextParts = [`*Event:* \`${eventKey}\``];
  if (context.orgName) contextParts.push(`*Organisation:* ${context.orgName}`);
  contextParts.push(`*Zeit:* ${timestamp}`);

  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: contextParts.join('  |  ') }]
  });

  if (link) {
    blocks.push({
      type: "actions",
      elements: [{
        type: "button",
        text: { type: "plain_text", text: "In TempConnect öffnen", emoji: true },
        url: link,
        style: "primary"
      }]
    });
  }

  blocks.push({ type: "divider" });

  return {
    text: `${meta.emoji} ${meta.title}${context.message ? ': ' + context.message.slice(0, 120) : ''}`,
    blocks
  };
}

/* ── Teams Formatter (MessageCard) ───────────────────────── */

/**
 * Format an integration event as a Microsoft Teams MessageCard (O365 Connector).
 * @param {string} eventKey
 * @param {Object} context
 * @returns {Object} Teams payload
 */
export function formatTeams(eventKey, context = {}) {
  const meta = getMeta(eventKey);
  const link = context.linkPath ? `${BASE_URL}${context.linkPath}` : null;
  const timestamp = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });

  const card = {
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    themeColor: meta.color.replace('#', ''),
    summary: `${meta.emoji} ${meta.title}`,
    sections: [{
      activityTitle: `${meta.emoji} ${meta.title}`,
      activitySubtitle: `TempConnect · ${timestamp}`,
      facts: [
        { name: "Event", value: eventKey }
      ],
      markdown: true
    }]
  };

  if (context.message) {
    card.sections[0].text = context.message;
  }
  if (context.orgName) {
    card.sections[0].facts.push({ name: "Organisation", value: context.orgName });
  }
  if (context.entityType) {
    card.sections[0].facts.push({ name: "Entität", value: `${context.entityType}${context.entityId ? ' / ' + String(context.entityId).slice(0, 8) + '…' : ''}` });
  }

  if (link) {
    card.potentialAction = [{
      "@type": "OpenUri",
      name: "In TempConnect öffnen",
      targets: [{ os: "default", uri: link }]
    }];
  }

  return card;
}

/* ── HTTP Sender ─────────────────────────────────────────── */

/**
 * Send a payload to a webhook URL with timeout.
 * Optionally signs the payload with HMAC-SHA256 if signingSecret is provided.
 * @param {string} webhookUrl
 * @param {Object} payload
 * @param {{ signingSecret?: string }} [options]
 * @returns {Promise<{ ok: boolean, status?: number, error?: string }>}
 */
export async function sendWebhook(webhookUrl, payload, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  try {
    const body = JSON.stringify(payload);
    const headers = { 'Content-Type': 'application/json' };

    // HMAC-SHA256 signing for payload verification
    if (options.signingSecret) {
      try {
        headers['X-TC-Signature-256'] = 'sha256=' + computeSignature(body, options.signingSecret);
      } catch (_e) { /* signing failure should not block delivery */ }
    }

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (res.ok || res.status === 200 || res.status === 201 || res.status === 204) {
      return { ok: true, status: res.status };
    }

    const errBody = await res.text().catch(() => '');
    return { ok: false, status: res.status, error: `HTTP ${res.status}: ${errBody.slice(0, 200)}` };
  } catch (err) {
    clearTimeout(timeout);
    const msg = err.name === 'AbortError' ? `Timeout nach ${SEND_TIMEOUT_MS}ms` : err.message;
    return { ok: false, error: msg };
  }
}

/**
 * Format and send an event to a specific provider.
 * @param {'slack'|'teams'} provider
 * @param {string} webhookUrl
 * @param {string} eventKey
 * @param {Object} context
 * @param {{ signingSecret?: string }} [options]
 * @returns {Promise<{ ok: boolean, status?: number, error?: string }>}
 */
export async function sendIntegrationEvent(provider, webhookUrl, eventKey, context = {}, options = {}) {
  const payload = provider === 'teams'
    ? formatTeams(eventKey, context)
    : formatSlack(eventKey, context);

  const result = await sendWebhook(webhookUrl, payload, { signingSecret: options.signingSecret });

  if (!result.ok) {
    logger.warn({ provider, eventKey, error: result.error }, 'Integration webhook delivery failed');
  }

  return result;
}
