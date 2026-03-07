/**
 * Email templates for Capacity Exchange events.
 *
 * Each function returns { subject, text } for the emailWorker.
 * Plain-text only (no HTML) — keeps things simple and deliverable.
 */

const PLATFORM = "TempConnect";
const BASE_URL = process.env.BASE_URL || "https://app.tempconnect.de";

/**
 * Sent to the supplier when a company expresses interest in their capacity entry.
 */
export function interestReceived({ supplierName, entryTitle, companyName, entryId }) {
  return {
    subject: `${PLATFORM}: Interesse an Ihrer Kapazitaet "${entryTitle}"`,
    text: [
      `Guten Tag ${supplierName},`,
      "",
      `das Unternehmen ${companyName} hat Interesse an Ihrem Kapazitaetseintrag "${entryTitle}" bekundet.`,
      "",
      "Naechste Schritte:",
      "1. Pruefen Sie die Anfrage in Ihrem Dashboard.",
      "2. Senden Sie ein Angebot oder stellen Sie Rueckfragen.",
      "",
      `Zum Eintrag: ${BASE_URL}/public/capacity_exchange_detail.html?id=${entryId}&owner=1`,
      "",
      `Mit freundlichen Gruessen`,
      `Ihr ${PLATFORM}-Team`,
    ].join("\n"),
  };
}

/**
 * Sent when the platform identifies a potential match between a capacity entry and a company need.
 */
export function matchFound({ recipientName, entryTitle, matchedEntityName, entryId }) {
  return {
    subject: `${PLATFORM}: Neuer Match fuer "${entryTitle}"`,
    text: [
      `Guten Tag ${recipientName},`,
      "",
      `fuer Ihren Eintrag "${entryTitle}" wurde ein potenzieller Match gefunden: ${matchedEntityName}.`,
      "",
      "Oeffnen Sie die Detailseite, um den Match zu pruefen und naechste Schritte einzuleiten.",
      "",
      `Zum Eintrag: ${BASE_URL}/public/capacity_exchange_detail.html?id=${entryId}`,
      "",
      `Mit freundlichen Gruessen`,
      `Ihr ${PLATFORM}-Team`,
    ].join("\n"),
  };
}

/**
 * Reminder sent when a capacity entry is about to expire (valid_until within 7 days).
 */
export function expiringSoon({ supplierName, entryTitle, expiryDate, entryId }) {
  return {
    subject: `${PLATFORM}: Kapazitaet "${entryTitle}" laeuft bald ab`,
    text: [
      `Guten Tag ${supplierName},`,
      "",
      `Ihr Kapazitaetseintrag "${entryTitle}" laeuft am ${expiryDate} ab.`,
      "",
      "Wenn die Kapazitaet weiterhin verfuegbar ist, verlaengern Sie bitte die Gueltigkeit oder bestaetigen Sie den Eintrag.",
      "",
      `Eintrag bearbeiten: ${BASE_URL}/public/capacity_exchange_form.html?id=${entryId}`,
      "",
      `Mit freundlichen Gruessen`,
      `Ihr ${PLATFORM}-Team`,
    ].join("\n"),
  };
}

/**
 * Nudge sent when a capacity entry has not been confirmed for over 96 hours.
 */
export function staleEntry({ supplierName, entryTitle, lastConfirmedDate, entryId }) {
  return {
    subject: `${PLATFORM}: Bitte bestaetigen Sie "${entryTitle}"`,
    text: [
      `Guten Tag ${supplierName},`,
      "",
      `Ihr Kapazitaetseintrag "${entryTitle}" wurde seit dem ${lastConfirmedDate} nicht mehr bestaetigt.`,
      "",
      "Regelmaessig bestaetigte Eintraege erhalten deutlich mehr Sichtbarkeit in der Kapazitaetsboerse.",
      "",
      "Bestaetigen Sie den Eintrag mit einem Klick in Ihrem Dashboard:",
      `${BASE_URL}/public/capacity_exchange_manage.html`,
      "",
      `Mit freundlichen Gruessen`,
      `Ihr ${PLATFORM}-Team`,
    ].join("\n"),
  };
}

/**
 * Confirmation sent to both parties when a deal is accepted.
 */
export function dealAccepted({ recipientName, entryTitle, partnerName, entryId }) {
  return {
    subject: `${PLATFORM}: Deal abgeschlossen – "${entryTitle}"`,
    text: [
      `Guten Tag ${recipientName},`,
      "",
      `ein Deal fuer den Kapazitaetseintrag "${entryTitle}" mit ${partnerName} wurde abgeschlossen.`,
      "",
      "Die Kontaktdaten beider Parteien wurden freigegeben. Sie finden alle Details auf der Detailseite.",
      "",
      `Details ansehen: ${BASE_URL}/public/capacity_exchange_detail.html?id=${entryId}`,
      "",
      `Mit freundlichen Gruessen`,
      `Ihr ${PLATFORM}-Team`,
    ].join("\n"),
  };
}
