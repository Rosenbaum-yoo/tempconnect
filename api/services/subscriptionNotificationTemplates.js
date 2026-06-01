/**
 * subscriptionNotificationTemplates.js
 *
 * Welle 8 Schritt 15 - Templates fuer Customer- und Staff-Notifications
 * zu Enterprise-Requests + Subscription-Request-Statuswechseln.
 *
 * Sprache:
 *   - Deutsch, klar, sachlich, ohne Marketing-Floskeln.
 *   - TempConnect ist EINE PLATTFORM - keine Zeitarbeitsfirma, keine
 *     Arbeitnehmerueberlassung, keine Vermittlungserfolgs-Zusage.
 *   - Keine konkrete Aussage ueber Rechnungsstellung oder Zahlungsfreigabe
 *     in Notifications - das ist NUR Sache von Steuerberater/Buchhaltung.
 *   - Keine Aussage "wir aktivieren morgen" - Aktivierung ist Staff-Aktion.
 *
 * Jedes Template liefert: { subject, text, html, in_app_title, in_app_body, severity }
 * - text: Plain-Text fuer E-Mail
 * - html: HTML-Body fuer E-Mail (einfache Strukturen, keine Tracking-Pixel)
 * - in_app_title / in_app_body: kurz fuer notifications.title / .message
 * - severity: 'info' | 'warning' | 'success' | 'error' (notifications.severity)
 */

const PLATFORM_NAME = "TempConnect";
const PLATFORM_DISCLAIMER =
  "TempConnect ist eine Plattform zur Unterstuetzung der Bedarfs-, Angebots- und Einsatzkoordination. " +
  "TempConnect ist keine Zeitarbeitsfirma und keine Arbeitnehmerueberlassung. " +
  "Es wird kein Vermittlungserfolg garantiert. Diese E-Mail enthaelt keine Rechnungs- oder Zahlungsfreigabe.";

function esc(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlWrap(title, bodyHtml) {
  return [
    "<!doctype html><html><body style=\"font-family:system-ui,sans-serif;color:#222;line-height:1.5;max-width:560px;margin:0 auto;padding:20px\">",
    "<h2 style=\"margin:0 0 12px;font-size:18px\">" + esc(title) + "</h2>",
    bodyHtml,
    '<hr style="border:none;border-top:1px solid #e5e5e5;margin:18px 0"/>',
    '<div style="font-size:11px;color:#666">' + esc(PLATFORM_DISCLAIMER) + "</div>",
    "</body></html>"
  ].join("");
}

function fmtCents(cents) {
  if (cents == null) return null;
  const n = Number(cents) / 100;
  if (!isFinite(n)) return null;
  return n.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " EUR";
}

function fmtDateISO(value) {
  if (!value) return null;
  const s = String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
}

/* ── Customer Templates (9 Status-Events) ─────────────────────── */

export const CUSTOMER_TEMPLATES = {
  /**
   * @param {{requestId, requestType, contactName, planLabel, currentPlan, desiredPlan}} ctx
   */
  submitted(ctx) {
    const planText = ctx.desiredPlan || ctx.planLabel || "Ihr Tarifwunsch";
    const subject = "Anfrage eingegangen: " + planText;
    const intro = "wir haben Ihre Anfrage erhalten und werden sie pruefen.";
    const body =
      "Hallo " + (ctx.contactName || "zusammen") + ",\n\n" +
      intro + "\n\n" +
      "Anfrage-Typ: " + (ctx.requestType || "Tarif-Anfrage") + "\n" +
      (ctx.currentPlan ? "Aktueller Plan: " + ctx.currentPlan + "\n" : "") +
      (ctx.desiredPlan ? "Wunsch-Plan: " + ctx.desiredPlan + "\n" : "") +
      "\nWir melden uns mit dem naechsten Schritt.\n\n" +
      "Beste Gruesse\nIhr " + PLATFORM_NAME + " Team";
    return {
      subject,
      text: body,
      html: htmlWrap(subject, "<p>" + esc(intro) + "</p><p><strong>Anfrage-Typ:</strong> " + esc(ctx.requestType || "Tarif-Anfrage") + "</p>" +
        (ctx.currentPlan ? "<p><strong>Aktueller Plan:</strong> " + esc(ctx.currentPlan) + "</p>" : "") +
        (ctx.desiredPlan ? "<p><strong>Wunsch-Plan:</strong> " + esc(ctx.desiredPlan) + "</p>" : "") +
        "<p>Wir melden uns mit dem naechsten Schritt.</p>"),
      in_app_title: "Anfrage eingegangen",
      in_app_body: "Wir haben Ihre " + (ctx.requestType || "Anfrage") + " erhalten.",
      severity: "info"
    };
  },

  under_review(ctx) {
    const subject = "Anfrage in Pruefung";
    const body =
      "Hallo " + (ctx.contactName || "zusammen") + ",\n\n" +
      "Ihre Anfrage befindet sich aktuell in Pruefung.\n" +
      "Bei Rueckfragen melden wir uns direkt bei Ihnen.\n\n" +
      "Beste Gruesse\nIhr " + PLATFORM_NAME + " Team";
    return {
      subject, text: body,
      html: htmlWrap(subject, "<p>Ihre Anfrage befindet sich aktuell in Pruefung.</p><p>Bei Rueckfragen melden wir uns direkt bei Ihnen.</p>"),
      in_app_title: "Anfrage in Pruefung",
      in_app_body: "Wir pruefen Ihre Anfrage und melden uns bei Bedarf zurueck.",
      severity: "info"
    };
  },

  needs_clarification(ctx) {
    const subject = "Rueckfrage zu Ihrer Anfrage";
    const body =
      "Hallo " + (ctx.contactName || "zusammen") + ",\n\n" +
      "wir haben einige Rueckfragen zu Ihrer Anfrage. Bitte pruefen Sie die Nachricht in Ihrem Kunden-Dashboard.\n\n" +
      "Beste Gruesse\nIhr " + PLATFORM_NAME + " Team";
    return {
      subject, text: body,
      html: htmlWrap(subject, "<p>Wir haben einige Rueckfragen zu Ihrer Anfrage. Bitte pruefen Sie die Nachricht in Ihrem Kunden-Dashboard.</p>"),
      in_app_title: "Rueckfrage zu Anfrage",
      in_app_body: "Bitte pruefen Sie die Nachricht zu Ihrer Anfrage.",
      severity: "warning"
    };
  },

  offered(ctx) {
    const priceLine = fmtCents(ctx.proposedPriceCents);
    const term = ctx.proposedTermMonths ? ctx.proposedTermMonths + " Monate Laufzeit" : null;
    const start = fmtDateISO(ctx.expectedStartDate);
    const subject = "Angebot erstellt" + (priceLine ? " (" + priceLine + ")" : "");
    const body =
      "Hallo " + (ctx.contactName || "zusammen") + ",\n\n" +
      "wir haben fuer Sie ein Angebot erstellt. Bitte pruefen Sie die Eckdaten in Ihrem Kunden-Dashboard.\n" +
      (priceLine ? "Vorschlag: " + priceLine + " / Monat\n" : "") +
      (term ? "Laufzeit: " + term + "\n" : "") +
      (start ? "Erwarteter Start: " + start + "\n" : "") +
      "\nDieses Angebot ist unverbindlich und ersetzt KEINE Rechnung.\n\n" +
      "Beste Gruesse\nIhr " + PLATFORM_NAME + " Team";
    return {
      subject, text: body,
      html: htmlWrap(subject, "<p>wir haben fuer Sie ein Angebot erstellt. Bitte pruefen Sie die Eckdaten in Ihrem Kunden-Dashboard.</p>" +
        (priceLine ? "<p><strong>Vorschlag:</strong> " + esc(priceLine) + " / Monat</p>" : "") +
        (term ? "<p><strong>Laufzeit:</strong> " + esc(term) + "</p>" : "") +
        (start ? "<p><strong>Erwarteter Start:</strong> " + esc(start) + "</p>" : "") +
        "<p style=\"font-size:12px;color:#666\">Dieses Angebot ist unverbindlich und ersetzt keine Rechnung.</p>"),
      in_app_title: "Angebot erstellt",
      in_app_body: priceLine ? "Vorschlag: " + priceLine + " / Monat" : "Bitte pruefen Sie das Angebot.",
      severity: "info"
    };
  },

  accepted(ctx) {
    const subject = "Anfrage angenommen";
    const body =
      "Hallo " + (ctx.contactName || "zusammen") + ",\n\n" +
      "wir haben Ihre Anfrage intern angenommen. Die finale Aktivierung erfolgt durch unser Team in Kuerze.\n" +
      "Sie erhalten eine separate Nachricht, sobald der Tarif aktiv geschaltet wurde.\n\n" +
      "Beste Gruesse\nIhr " + PLATFORM_NAME + " Team";
    return {
      subject, text: body,
      html: htmlWrap(subject, "<p>wir haben Ihre Anfrage intern angenommen. Die finale Aktivierung erfolgt durch unser Team in Kuerze.</p>" +
        "<p>Sie erhalten eine separate Nachricht, sobald der Tarif aktiv geschaltet wurde.</p>"),
      in_app_title: "Anfrage angenommen",
      in_app_body: "Aktivierung folgt nach interner Pruefung.",
      severity: "success"
    };
  },

  active(ctx) {
    const planText = ctx.desiredPlan || ctx.planLabel || "Ihr Tarif";
    const subject = "Tarif aktiv: " + planText;
    const body =
      "Hallo " + (ctx.contactName || "zusammen") + ",\n\n" +
      "Ihr neuer Tarif (" + planText + ") ist ab sofort aktiv.\n" +
      "Sie koennen die freigeschalteten Funktionen ueber Ihr Dashboard nutzen.\n\n" +
      "Diese Nachricht ist eine Aktivierungsbestaetigung. Sie ist KEINE Rechnung.\n\n" +
      "Beste Gruesse\nIhr " + PLATFORM_NAME + " Team";
    return {
      subject, text: body,
      html: htmlWrap(subject, "<p>Ihr neuer Tarif (<strong>" + esc(planText) + "</strong>) ist ab sofort aktiv.</p>" +
        "<p>Sie koennen die freigeschalteten Funktionen ueber Ihr Dashboard nutzen.</p>" +
        "<p style=\"font-size:12px;color:#666\">Diese Nachricht ist eine Aktivierungsbestaetigung. Sie ist keine Rechnung.</p>"),
      in_app_title: "Tarif aktiv",
      in_app_body: planText + " ist ab sofort aktiv.",
      severity: "success"
    };
  },

  rejected(ctx) {
    const subject = "Anfrage abgelehnt";
    const reason = ctx.rejectionReason ? "Begruendung: " + ctx.rejectionReason + "\n" : "";
    const body =
      "Hallo " + (ctx.contactName || "zusammen") + ",\n\n" +
      "wir koennen Ihre Anfrage in der vorliegenden Form leider nicht annehmen.\n" +
      reason +
      "\nBei Rueckfragen erreichen Sie unser Team ueber den Kontaktbereich.\n\n" +
      "Beste Gruesse\nIhr " + PLATFORM_NAME + " Team";
    return {
      subject, text: body,
      html: htmlWrap(subject, "<p>wir koennen Ihre Anfrage in der vorliegenden Form leider nicht annehmen.</p>" +
        (ctx.rejectionReason ? "<p><strong>Begruendung:</strong> " + esc(ctx.rejectionReason) + "</p>" : "") +
        "<p>Bei Rueckfragen erreichen Sie unser Team ueber den Kontaktbereich.</p>"),
      in_app_title: "Anfrage abgelehnt",
      in_app_body: ctx.rejectionReason || "Anfrage wurde nicht angenommen.",
      severity: "warning"
    };
  },

  cancelled(ctx) {
    const effective = fmtDateISO(ctx.cancellationEffectiveAt);
    const subject = "Kuendigung vorgemerkt";
    const body =
      "Hallo " + (ctx.contactName || "zusammen") + ",\n\n" +
      "Ihre Kuendigung ist bei uns vorgemerkt.\n" +
      (effective ? "Wirksam zum: " + effective + "\n" : "") +
      "Bis zur Wirksamkeit bleibt Ihr Tarif unveraendert nutzbar.\n\n" +
      "Beste Gruesse\nIhr " + PLATFORM_NAME + " Team";
    return {
      subject, text: body,
      html: htmlWrap(subject, "<p>Ihre Kuendigung ist bei uns vorgemerkt.</p>" +
        (effective ? "<p><strong>Wirksam zum:</strong> " + esc(effective) + "</p>" : "") +
        "<p>Bis zur Wirksamkeit bleibt Ihr Tarif unveraendert nutzbar.</p>"),
      in_app_title: "Kuendigung vorgemerkt",
      in_app_body: effective ? "Wirksam zum " + effective : "Kuendigung erfasst",
      severity: "warning"
    };
  },

  expired(ctx) {
    const subject = "Anfrage abgelaufen";
    const body =
      "Hallo " + (ctx.contactName || "zusammen") + ",\n\n" +
      "Ihre Anfrage ist ohne Annahme abgelaufen.\n" +
      "Bei Bedarf koennen Sie eine neue Anfrage ueber unser Kunden-Dashboard erstellen.\n\n" +
      "Beste Gruesse\nIhr " + PLATFORM_NAME + " Team";
    return {
      subject, text: body,
      html: htmlWrap(subject, "<p>Ihre Anfrage ist ohne Annahme abgelaufen.</p>" +
        "<p>Bei Bedarf koennen Sie eine neue Anfrage ueber unser Kunden-Dashboard erstellen.</p>"),
      in_app_title: "Anfrage abgelaufen",
      in_app_body: "Bitte ggf. neue Anfrage stellen.",
      severity: "info"
    };
  }
};

/* ── Staff Templates (5 kritische Events) ────────────────────── */

export const STAFF_TEMPLATES = {
  /**
   * Public-Konfigurator-Submission ist eingetroffen.
   */
  enterprise_request_received(ctx) {
    const subject = "[Staff] Neue Enterprise-Anfrage: " + (ctx.companyName || ctx.contactEmail || "Lead");
    const monthly = fmtCents(ctx.monthlyEstimateCents);
    const body =
      "Eine neue Public-Enterprise-Anfrage ist eingetroffen.\n\n" +
      "Firma:   " + (ctx.companyName || "(unbekannt)") + "\n" +
      "Kontakt: " + (ctx.contactName || "-") + " <" + (ctx.contactEmail || "-") + ">\n" +
      "Plan:    " + (ctx.planRequested || "INDIVIDUELL") + "\n" +
      (monthly ? "Schaetzung (Monat): " + monthly + "\n" : "") +
      (ctx.seatsRequested ? "Sitze (gewuenscht): " + ctx.seatsRequested + "\n" : "") +
      "\nDirekt zur Inbox: " + (ctx.deepLink || "/staff/#commercial-inbox") + "\n";
    return {
      subject, text: body,
      html: htmlWrap(subject,
        "<p>Eine neue Public-Enterprise-Anfrage ist eingetroffen.</p>" +
        "<p><strong>Firma:</strong> " + esc(ctx.companyName || "(unbekannt)") + "<br/>" +
        "<strong>Kontakt:</strong> " + esc(ctx.contactName || "-") + " &lt;" + esc(ctx.contactEmail || "-") + "&gt;<br/>" +
        "<strong>Plan:</strong> " + esc(ctx.planRequested || "INDIVIDUELL") + "</p>" +
        (monthly ? "<p><strong>Schaetzung (Monat):</strong> " + esc(monthly) + "</p>" : "") +
        (ctx.seatsRequested ? "<p><strong>Sitze (gewuenscht):</strong> " + esc(ctx.seatsRequested) + "</p>" : "") +
        "<p><a href=\"" + esc(ctx.deepLink || "/staff/#commercial-inbox") + "\">In Staff Control Center oeffnen</a></p>"),
      in_app_title: "Neue Enterprise-Anfrage",
      in_app_body: (ctx.companyName || ctx.contactEmail || "Lead") + (monthly ? " (~" + monthly + "/Mo)" : ""),
      severity: "warning"
    };
  },

  subscription_request_submitted(ctx) {
    const subject = "[Staff] Neue Subscription-Anfrage: " + (ctx.requestType || "Anfrage");
    const body =
      "Neue Subscription-Anfrage eingegangen.\n\n" +
      "Typ:   " + (ctx.requestType || "?") + "\n" +
      "Org:   " + (ctx.orgName || ctx.orgId || "(Public-Lead)") + "\n" +
      "Email: " + (ctx.contactEmail || "-") + "\n" +
      "Plan:  " + (ctx.desiredPlan || ctx.currentPlan || "?") + "\n";
    return {
      subject, text: body,
      html: htmlWrap(subject,
        "<p>Neue Subscription-Anfrage eingegangen.</p>" +
        "<p><strong>Typ:</strong> " + esc(ctx.requestType || "?") + "<br/>" +
        "<strong>Org:</strong> " + esc(ctx.orgName || ctx.orgId || "(Public-Lead)") + "<br/>" +
        "<strong>Email:</strong> " + esc(ctx.contactEmail || "-") + "<br/>" +
        "<strong>Plan:</strong> " + esc(ctx.desiredPlan || ctx.currentPlan || "?") + "</p>"),
      in_app_title: "Neue " + (ctx.requestType || "") + "-Anfrage",
      in_app_body: (ctx.orgName || ctx.contactEmail || "Lead"),
      severity: "warning"
    };
  },

  subscription_request_accepted(ctx) {
    const subject = "[Staff] Anfrage akzeptiert: " + (ctx.requestType || "Anfrage");
    const body =
      "Eine Subscription-Anfrage wurde akzeptiert und wartet auf Aktivierung.\n\n" +
      "Anfrage: " + (ctx.requestId || "?") + "\n" +
      "Org:     " + (ctx.orgName || ctx.orgId || "(Public-Lead)") + "\n" +
      "Plan:    " + (ctx.desiredPlan || ctx.currentPlan || "?") + "\n" +
      "\nNaechster Schritt: Aktivierung im Staff Control Center pruefen.\n";
    return {
      subject, text: body,
      html: htmlWrap(subject,
        "<p>Eine Subscription-Anfrage wurde akzeptiert und wartet auf Aktivierung.</p>" +
        "<p><strong>Anfrage:</strong> " + esc(ctx.requestId || "?") + "<br/>" +
        "<strong>Org:</strong> " + esc(ctx.orgName || ctx.orgId || "(Public-Lead)") + "<br/>" +
        "<strong>Plan:</strong> " + esc(ctx.desiredPlan || ctx.currentPlan || "?") + "</p>" +
        "<p>Naechster Schritt: Aktivierung im Staff Control Center pruefen.</p>"),
      in_app_title: "Anfrage akzeptiert (Aktivierung wartet)",
      in_app_body: ctx.orgName || ctx.contactEmail || "Anfrage",
      severity: "warning"
    };
  },

  subscription_request_cancellation(ctx) {
    const subject = "[Staff] Kuendigung angefragt";
    const effective = fmtDateISO(ctx.cancellationEffectiveAt);
    const body =
      "Eine Kuendigungs-Anfrage ist eingegangen.\n\n" +
      "Org:       " + (ctx.orgName || ctx.orgId || "(Public-Lead)") + "\n" +
      "Aktueller Plan: " + (ctx.currentPlan || "?") + "\n" +
      (effective ? "Wirksam zum:    " + effective + "\n" : "") +
      "\nBitte zeitnah pruefen.\n";
    return {
      subject, text: body,
      html: htmlWrap(subject,
        "<p>Eine Kuendigungs-Anfrage ist eingegangen.</p>" +
        "<p><strong>Org:</strong> " + esc(ctx.orgName || ctx.orgId || "(Public-Lead)") + "<br/>" +
        "<strong>Aktueller Plan:</strong> " + esc(ctx.currentPlan || "?") + "</p>" +
        (effective ? "<p><strong>Wirksam zum:</strong> " + esc(effective) + "</p>" : "")),
      in_app_title: "Kuendigung angefragt",
      in_app_body: (ctx.orgName || ctx.contactEmail || "Anfrage") + (effective ? " - wirksam " + effective : ""),
      severity: "warning"
    };
  },

  subscription_request_activation_failed(ctx) {
    const subject = "[Staff] Aktivierung fehlgeschlagen";
    const body =
      "Bei der Aktivierung einer Subscription-Anfrage ist ein Fehler aufgetreten.\n\n" +
      "Anfrage: " + (ctx.requestId || "?") + "\n" +
      "Code:    " + (ctx.errorCode || "UNKNOWN") + "\n" +
      "Detail:  " + (ctx.errorMessage || "-") + "\n" +
      "\nBitte manuell pruefen.\n";
    return {
      subject, text: body,
      html: htmlWrap(subject,
        "<p>Bei der Aktivierung einer Subscription-Anfrage ist ein Fehler aufgetreten.</p>" +
        "<p><strong>Anfrage:</strong> " + esc(ctx.requestId || "?") + "<br/>" +
        "<strong>Code:</strong> " + esc(ctx.errorCode || "UNKNOWN") + "</p>" +
        "<p>" + esc(ctx.errorMessage || "") + "</p>"),
      in_app_title: "Aktivierung fehlgeschlagen",
      in_app_body: (ctx.errorCode || "UNKNOWN") + " - " + (ctx.requestId || ""),
      severity: "error"
    };
  },

  subscription_request_expiring_soon(ctx) {
    const subject = "[Staff] Anfrage laeuft bald ab";
    const body =
      "Eine offene Anfrage steht kurz vor dem Ablauf.\n\n" +
      "Anfrage: " + (ctx.requestId || "?") + "\n" +
      (ctx.expiresAt ? "Ablauf:  " + fmtDateISO(ctx.expiresAt) + "\n" : "") +
      "\nBitte zeitnah eine Entscheidung treffen.\n";
    return {
      subject, text: body,
      html: htmlWrap(subject,
        "<p>Eine offene Anfrage steht kurz vor dem Ablauf.</p>" +
        "<p><strong>Anfrage:</strong> " + esc(ctx.requestId || "?") + "</p>" +
        (ctx.expiresAt ? "<p><strong>Ablauf:</strong> " + esc(fmtDateISO(ctx.expiresAt)) + "</p>" : "")),
      in_app_title: "Anfrage laeuft bald ab",
      in_app_body: ctx.expiresAt ? "Ablauf " + fmtDateISO(ctx.expiresAt) : "Bitte pruefen",
      severity: "warning"
    };
  }
};

export const PLATFORM_DISCLAIMER_TEXT = PLATFORM_DISCLAIMER;
