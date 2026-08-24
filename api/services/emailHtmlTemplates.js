/**
 * emailHtmlTemplates.js
 *
 * Responsive, investor-grade HTML email templates for TempConnect.
 * All templates use inline styles for maximum email-client compatibility.
 *
 * Exports:
 *  - invitationEmail({ inviterName, orgName, inviteUrl })
 *  - dealConfirmationEmail({ dealId, requisitionTitle, workerName, startDate, endDate, orgName })
 *  - slaAlertEmail({ alertType, requisitionTitle, orgName, dueDate, actionUrl })
 *  - invoiceEmail({ invoiceNumber, amount, currency, dueDate, orgName, downloadUrl })
 *  - planActivationEmail({ plan, amount, currency, activatedAt, userName })
 *  - passwordResetEmail({ resetUrl, userName, expiresInMinutes })
 */

// Firmenname aus zentraler Config (Single Source of Truth, G.4) — PLATZHALTER bis UG-Gründung.
import { COMPANY } from "../config/company.js";

/**
 * Haengt einer HANDGEBAUTEN Mail denselben Rahmen an, den die Vorlagen haben.
 *
 * BEFUND (2026-08-24, gemessen): 40 Stellen rufen `sendMail`, aber nur 16 gehen
 * durch eine Vorlage aus dieser Datei. Die anderen 24 bauen ihr HTML am
 * Aufrufort zusammen — und tragen damit KEINEN Absender: keine Firmierung,
 * keinen Kontakt, nichts. Fuer Geschaeftsbriefe sind das Pflichtangaben, und
 * E-Mail zaehlt dazu (§ 37a HGB; fuer die geplante UG § 35a GmbHG).
 *
 * Zweite Folge, die erst bei der Gruendung sichtbar wuerde: `COMPANY.name` ist
 * ausdruecklich ein PLATZHALTER bis zur UG-Gruendung (config/company.js). Wer
 * durch den Rahmen geht, bekommt die neue Firmierung automatisch. Die 24
 * anderen haetten sie nie bekommen — und niemand haette es gemerkt, weil eine
 * Mail ohne Absender nicht auffaellt, sie sieht nur unfertig aus.
 *
 * WARUM HIER UND NICHT AN DEN 24 STELLEN: eine Aenderung an 24 Aufrufern
 * schuetzt nicht vor dem 25. Der Rahmen gehoert an die eine Stelle, durch die
 * jede Mail geht — dasselbe Prinzip wie beim Live-Push in `notifyWorker`.
 *
 * IDEMPOTENT: Wer bereits ein vollstaendiges Dokument liefert (die Vorlagen tun
 * das, erkennbar am DOCTYPE), wird NICHT ein zweites Mal eingepackt.
 */
export function mitRahmen(html, titel = "TempConnect") {
  const inhalt = String(html || "");
  if (/<!DOCTYPE/i.test(inhalt) || /<html[\s>]/i.test(inhalt)) return inhalt;
  return baseLayout(titel, inhalt);
}

// ─── Base layout wrapper ───────────────────────────────────────────────────────
function baseLayout(title, bodyContent) {
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f4f6f9;padding:40px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1a56db 0%,#0d3a8e 100%);padding:32px 40px 28px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <span style="font-size:24px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">TempConnect</span>
                    <span style="font-size:13px;color:#93c5fd;margin-left:8px;font-weight:400;">Enterprise</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              ${bodyContent}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:24px 40px;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.6;">
                ${COMPANY.name} &bull; Automatisch generierte E-Mail &bull; Bitte nicht antworten.<br>
                Bei Fragen wenden Sie sich an <a href="mailto:${COMPANY.supportEmail}" style="color:#1a56db;text-decoration:none;">${COMPANY.supportEmail}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function primaryBtn(label, url) {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;">
    <tr>
      <td style="border-radius:6px;background:#1a56db;">
        <a href="${escHtml(url)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:0.2px;">${escHtml(label)}</a>
      </td>
    </tr>
  </table>`;
}

function infoBox(rows) {
  const cells = rows.map(([label, value]) =>
    `<tr>
      <td style="padding:10px 16px;font-size:13px;color:#64748b;width:40%;border-bottom:1px solid #f1f5f9;">${escHtml(label)}</td>
      <td style="padding:10px 16px;font-size:13px;color:#1e293b;font-weight:500;border-bottom:1px solid #f1f5f9;">${escHtml(value)}</td>
    </tr>`
  ).join("");
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
    style="border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;margin:20px 0;">
    ${cells}
  </table>`;
}

function alertBadge(type) {
  const map = {
    sla_breach: { bg: "#fef2f2", border: "#fca5a5", text: "#dc2626", label: "SLA-Verletzung" },
    sla_warning: { bg: "#fffbeb", border: "#fcd34d", text: "#b45309", label: "SLA-Warnung" },
    overdue:     { bg: "#fff7ed", border: "#fdba74", text: "#c2410c", label: "Überfällig" },
    info:        { bg: "#eff6ff", border: "#93c5fd", text: "#1d4ed8", label: "Information" }
  };
  const s = map[type] || map.info;
  return `<span style="display:inline-block;padding:4px 10px;border-radius:20px;background:${s.bg};border:1px solid ${s.border};color:${s.text};font-size:12px;font-weight:600;">${s.label}</span>`;
}

// ─── Template: User Invitation ────────────────────────────────────────────────
export function invitationEmail({ inviterName, orgName, inviteUrl }) {
  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1e293b;">Sie wurden eingeladen</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.6;">
      <strong style="color:#1e293b;">${escHtml(inviterName)}</strong> hat Sie eingeladen, der Organisation
      <strong style="color:#1e293b;">${escHtml(orgName)}</strong> auf TempConnect beizutreten.
    </p>
    ${infoBox([
      ["Organisation", orgName],
      ["Eingeladen von", inviterName],
      ["Plattform", "TempConnect Enterprise"]
    ])}
    <p style="margin:0 0 4px;font-size:14px;color:#64748b;">
      Klicken Sie auf den Button, um Ihre Einladung anzunehmen und Ihr Konto zu aktivieren.
      Dieser Link ist 72 Stunden gültig.
    </p>
    ${primaryBtn("Einladung annehmen", inviteUrl)}
    <p style="margin:16px 0 0;font-size:13px;color:#94a3b8;">
      Falls der Button nicht funktioniert, kopieren Sie folgenden Link in Ihren Browser:<br>
      <a href="${escHtml(inviteUrl)}" style="color:#1a56db;word-break:break-all;">${escHtml(inviteUrl)}</a>
    </p>`;
  return baseLayout(`Einladung zu ${orgName} — TempConnect`, body);
}

// ─── Template: Deal Confirmation ──────────────────────────────────────────────
export function dealConfirmationEmail({ dealId, requisitionTitle, workerName, startDate, endDate, orgName, actionUrl }) {
  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1e293b;">Deal bestätigt</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.6;">
      Ein neuer Einsatz wurde erfolgreich abgeschlossen. Alle Details finden Sie unten.
    </p>
    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:6px;padding:16px 20px;margin:0 0 24px;">
      <span style="font-size:13px;font-weight:600;color:#16a34a;">&#10003; Deal erfolgreich abgeschlossen</span>
    </div>
    ${infoBox([
      ["Deal-ID", dealId],
      ["Einsatztitel", requisitionTitle],
      ["Mitarbeiter", workerName],
      ["Organisation", orgName],
      ["Startdatum", startDate],
      ["Enddatum", endDate]
    ])}
    ${primaryBtn("Deal-Details anzeigen", actionUrl)}`;
  return baseLayout("Deal bestätigt — TempConnect", body);
}

// ─── Template: SLA Alert ──────────────────────────────────────────────────────
export function slaAlertEmail({ alertType, requisitionTitle, orgName, dueDate, actionUrl, details }) {
  const body = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#1e293b;">SLA-Benachrichtigung</h1>
    <p style="margin:0 0 20px;">${alertBadge(alertType)}</p>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.6;">
      Eine SLA-relevante Aktion ist für die folgende Anforderung erforderlich.
      ${details ? `<br><strong style="color:#1e293b;">${escHtml(details)}</strong>` : ""}
    </p>
    ${infoBox([
      ["Anforderung", requisitionTitle],
      ["Organisation", orgName],
      ["Fällig bis", dueDate],
      ["Priorität", alertType === "sla_breach" ? "KRITISCH" : alertType === "sla_warning" ? "HOCH" : "MITTEL"]
    ])}
    ${primaryBtn("Jetzt handeln", actionUrl)}
    <p style="margin:16px 0 0;font-size:13px;color:#94a3b8;">
      Diese Benachrichtigung wurde automatisch vom TempConnect SLA-Monitor generiert.
    </p>`;
  return baseLayout("SLA-Alert — TempConnect", body);
}

// ─── Template: Invoice ────────────────────────────────────────────────────────
export function invoiceEmail({ invoiceNumber, amount, currency, dueDate, orgName, downloadUrl, lineItems }) {
  const formattedAmount = new Intl.NumberFormat("de-DE", { style: "currency", currency: currency || "EUR" }).format(amount);
  const lineItemRows = Array.isArray(lineItems) && lineItems.length
    ? lineItems.map(li => [li.description || "Leistung", `${li.quantity || 1}x — ${new Intl.NumberFormat("de-DE", { style: "currency", currency: currency || "EUR" }).format(li.amount)}`])
    : [["Abo-Leistung", formattedAmount]];
  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1e293b;">Ihre Rechnung</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.6;">
      Ihre Rechnung für die TempConnect-Dienstleistungen steht bereit.
    </p>
    ${infoBox([
      ["Rechnungsnummer", invoiceNumber],
      ["Organisation", orgName],
      ["Fälligkeitsdatum", dueDate],
      ...lineItemRows,
      ["Gesamtbetrag", formattedAmount]
    ])}
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:16px 20px;margin:20px 0;">
      <p style="margin:0;font-size:14px;color:#1d4ed8;font-weight:500;">
        Gesamtbetrag fällig: <strong style="font-size:18px;">${escHtml(formattedAmount)}</strong>
      </p>
    </div>
    ${primaryBtn("Rechnung herunterladen", downloadUrl)}
    <p style="margin:16px 0 0;font-size:13px;color:#94a3b8;">
      Bitte begleichen Sie die Rechnung bis zum ${escHtml(dueDate)}.
      Bei Fragen wenden Sie sich an <a href="mailto:billing@tempconnect.de" style="color:#1a56db;">billing@tempconnect.de</a>
    </p>`;
  return baseLayout(`Rechnung ${invoiceNumber} — TempConnect`, body);
}

// ─── Template: Dunning / Zahlungserinnerung ───────────────────────────────────
/**
 * Gestaffelte Zahlungserinnerung für überfällige Rechnungen.
 * @param {object} p
 * @param {string} p.invoiceNumber
 * @param {number} p.amount            Bruttobetrag (Euro) der offenen Rechnung
 * @param {string} [p.currency]
 * @param {string} p.dueDate           Fälligkeitsdatum (formatiert)
 * @param {string} p.orgName
 * @param {number} p.level             Mahnstufe 1..3 (1=freundlich, 3=letzte vor Sperrung)
 * @param {number} p.daysOverdue       Tage seit Fälligkeit
 * @param {string} [p.graceUntil]      Datum bis zu dem der Zugang aktiv bleibt (Soft-Lock)
 * @param {string} [p.downloadUrl]     Link zur Rechnung / zum Zahlungsbereich
 * @returns {{ subject: string, html: string }}
 */
export function dunningEmail({ invoiceNumber, amount, currency, dueDate, orgName, level, daysOverdue, graceUntil, downloadUrl }) {
  const lvl = Math.min(3, Math.max(1, Number(level) || 1));
  const formattedAmount = new Intl.NumberFormat("de-DE", { style: "currency", currency: currency || "EUR" }).format(amount);
  const stage = {
    1: { heading: "Zahlungserinnerung", subject: `Zahlungserinnerung — Rechnung ${invoiceNumber}`, accent: "#2563eb", bg: "#eff6ff", border: "#bfdbfe", intro: "Wir möchten Sie freundlich daran erinnern, dass die folgende Rechnung noch offen ist." },
    2: { heading: "2. Zahlungserinnerung", subject: `2. Zahlungserinnerung — Rechnung ${invoiceNumber} überfällig`, accent: "#d97706", bg: "#fffbeb", border: "#fde68a", intro: "Trotz unserer ersten Erinnerung ist die folgende Rechnung weiterhin offen. Bitte begleichen Sie den Betrag zeitnah." },
    3: { heading: "Letzte Mahnung", subject: `Letzte Mahnung — Rechnung ${invoiceNumber}: Zugang wird ausgesetzt`, accent: "#dc2626", bg: "#fef2f2", border: "#fecaca", intro: "Die folgende Rechnung ist weiterhin nicht beglichen. Ohne Zahlungseingang wird Ihr Zugang nach Ablauf der Kulanzfrist automatisch ausgesetzt." }
  }[lvl];

  const warnLine = lvl >= 3 && graceUntil
    ? `Bei ausbleibender Zahlung wird der Zugang ab dem ${escHtml(graceUntil)} gesperrt und Ihr Plan auf DEMO zurückgestuft.`
    : graceUntil
      ? `Ihr Zugang bleibt zunächst aktiv (Kulanzfrist bis ${escHtml(graceUntil)}).`
      : "Bitte begleichen Sie den offenen Betrag, um eine Unterbrechung Ihres Zugangs zu vermeiden.";

  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1e293b;">${escHtml(stage.heading)}</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.6;">
      ${escHtml(stage.intro)}
    </p>
    ${infoBox([
      ["Rechnungsnummer", invoiceNumber],
      ["Organisation", orgName],
      ["Fällig seit", `${escHtml(dueDate)} (${Number(daysOverdue) || 0} Tage überfällig)`],
      ["Offener Betrag", formattedAmount]
    ])}
    <div style="background:${stage.bg};border:1px solid ${stage.border};border-radius:6px;padding:16px 20px;margin:20px 0;">
      <p style="margin:0;font-size:14px;color:${stage.accent};font-weight:500;line-height:1.6;">
        ${warnLine}
      </p>
    </div>
    ${downloadUrl ? primaryBtn("Rechnung ansehen & begleichen", downloadUrl) : ""}
    <p style="margin:16px 0 0;font-size:13px;color:#94a3b8;">
      Sollte sich Ihre Zahlung mit dieser E-Mail überschnitten haben, betrachten Sie diese Erinnerung bitte als gegenstandslos.
      Bei Fragen wenden Sie sich an <a href="mailto:billing@tempconnect.de" style="color:#1a56db;">billing@tempconnect.de</a>
    </p>`;
  return { subject: stage.subject, html: baseLayout(`${stage.heading} ${invoiceNumber} — TempConnect`, body) };
}

// ─── Template: Plan Activation ────────────────────────────────────────────────
export function planActivationEmail({ plan, amount, currency, activatedAt, userName, dashboardUrl }) {
  const formattedAmount = new Intl.NumberFormat("de-DE", { style: "currency", currency: currency || "EUR" }).format(amount);
  const planFeatures = {
    BASIS:    ["5 Personalanfragen/Monat", "5 Personalangebote/Monat", "Basis-Matching", "E-Mail-Support"],
    PLUS:     ["20 Personalanfragen/Monat", "20 Personalangebote/Monat", "Erweitertes Matching", "Priority-Support"],
    PRO:      ["Unbegrenzte Anfragen", "Unbegrenzte Karten", "Erweitertes Matching", "Dedizierter Support", "SLA-Monitoring"],
    FREE:     ["3 Personalanfragen/Monat", "3 Personalangebote/Monat", "Community-Support"]
  };
  const features = planFeatures[plan] || [];
  const featureList = features.map(f => `<li style="padding:4px 0;font-size:14px;color:#374151;">&#10003; ${escHtml(f)}</li>`).join("");
  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1e293b;">Abo aktiviert!</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.6;">
      Hallo <strong style="color:#1e293b;">${escHtml(userName)}</strong>, Ihr TempConnect-Abo wurde erfolgreich aktiviert.
    </p>
    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:6px;padding:20px 24px;margin:0 0 24px;">
      <p style="margin:0 0 4px;font-size:13px;color:#16a34a;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Aktiver Plan</p>
      <p style="margin:0;font-size:28px;font-weight:700;color:#15803d;">${escHtml(plan)}</p>
      <p style="margin:4px 0 0;font-size:14px;color:#16a34a;">${escHtml(formattedAmount)} / Monat</p>
    </div>
    ${infoBox([
      ["Plan", plan],
      ["Monatlicher Betrag", formattedAmount],
      ["Aktiviert am", activatedAt]
    ])}
    <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#1e293b;">Ihre Plan-Leistungen:</p>
    <ul style="margin:0 0 24px;padding-left:0;list-style:none;">${featureList}</ul>
    ${primaryBtn("Zum Dashboard", dashboardUrl || "https://app.tempconnect.de/dashboard")}`;
  return baseLayout(`Plan aktiviert: ${plan} — TempConnect`, body);
}

// ─── Template: Timesheet Sent to Customer ───────────────────────────────────
export function timesheetSentToCustomerEmail({
  customerName, supplierName, workerName, weekStart, weekEnd,
  totalHours, overtimeHours, note, actionUrl
}) {
  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1e293b;">Stundenzettel zur Pr\u00fcfung</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.6;">
      Sehr geehrte(r) <strong style="color:#1e293b;">${escHtml(customerName || 'Kundenverantwortliche(r)')}</strong>,<br>
      ein Stundennachweis liegt zur Pr\u00fcfung f\u00fcr Sie bereit.
    </p>
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:16px 20px;margin:0 0 24px;">
      <span style="font-size:13px;font-weight:600;color:#1d4ed8;">Pr\u00fcfung erforderlich \u2014 bitte best\u00e4tigen oder melden Sie R\u00fcckfragen.</span>
    </div>
    ${infoBox([
      ["Dienstleister", supplierName || "\u2013"],
      ["Mitarbeiter", workerName || "\u2013"],
      ["Zeitraum", `${escHtml(weekStart || '')} \u2013 ${escHtml(weekEnd || '')}`],
      ["Gesamtstunden", totalHours != null ? String(totalHours) + ' h' : '\u2013'],
      ...(overtimeHours > 0 ? [["Davon \u00dcberstunden", String(overtimeHours) + ' h']] : [])
    ])}
    ${note ? `<p style="margin:0 0 16px;font-size:14px;color:#64748b;line-height:1.6;"><strong>Hinweis:</strong> ${escHtml(note)}</p>` : ''}
    ${actionUrl ? primaryBtn("Stundenzettel pr\u00fcfen", actionUrl) : ''}
    <p style="margin:16px 0 0;font-size:13px;color:#94a3b8;">
      Diese E-Mail wurde automatisch von TempConnect generiert. Bei R\u00fcckfragen wenden Sie sich bitte an Ihren Dienstleister.
    </p>`;
  return baseLayout('Stundenzettel zur Pr\u00fcfung \u2014 TempConnect', body);
}

// ─── Template: Password Reset ─────────────────────────────────────────────────
export function passwordResetEmail({ resetUrl, userName, expiresInMinutes }) {
  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1e293b;">Passwort zurücksetzen</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.6;">
      Hallo <strong style="color:#1e293b;">${escHtml(userName)}</strong>,<br>
      wir haben eine Anfrage zum Zurücksetzen Ihres Passworts erhalten.
      Klicken Sie auf den Button, um ein neues Passwort festzulegen.
    </p>
    <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:6px;padding:12px 16px;margin:0 0 20px;">
      <p style="margin:0;font-size:13px;color:#b45309;">
        &#9888; Dieser Link ist nur <strong>${escHtml(String(expiresInMinutes || 60))} Minuten</strong> gültig.
        Wenn Sie diese Anfrage nicht gestellt haben, ignorieren Sie diese E-Mail.
      </p>
    </div>
    ${primaryBtn("Passwort zurücksetzen", resetUrl)}
    <p style="margin:16px 0 0;font-size:13px;color:#94a3b8;">
      Falls der Button nicht funktioniert:<br>
      <a href="${escHtml(resetUrl)}" style="color:#1a56db;word-break:break-all;">${escHtml(resetUrl)}</a>
    </p>`;
  return baseLayout("Passwort zurücksetzen — TempConnect", body);
}
