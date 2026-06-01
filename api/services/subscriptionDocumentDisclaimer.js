/**
 * Zentrale Hinweise fuer Tarif-/Vertragsdokumente.
 *
 * TODO juristische Pruefung: Diese Texte sind eine fachliche Arbeitsfassung
 * fuer konsistente Dokumente und muessen vor produktiver Rechtsverwendung
 * final anwaltlich freigegeben werden.
 */

export const SUBSCRIPTION_DOCUMENT_LEGAL_TODO =
  "TODO juristische Pruefung: Disclaimer sind zentral gepflegte Arbeitsfassung und nicht final rechtlich freigegeben.";

export const SUBSCRIPTION_DOCUMENT_DISCLAIMERS = Object.freeze([
  {
    key: "platform_role",
    label: "Plattformrolle",
    text:
      "TempConnect ist Plattform/Vermittler zur Unterstuetzung von Bedarfs-, Angebots- und Einsatzkoordination; TempConnect ist keine Zeitarbeitsfirma."
  },
  {
    key: "aueg_no_guarantee",
    label: "AUEG / Arbeitnehmerueberlassung",
    text:
      "TempConnect gibt keine AUEG-Garantie und keine Arbeitnehmerueberlassungszusage ab; entsprechende Vertrags-, Erlaubnis- und Compliance-Pflichten liegen bei den beteiligten Parteien."
  },
  {
    key: "tax_net_prices",
    label: "Preise / Steuer",
    text:
      "Alle Preisangaben verstehen sich netto zzgl. gesetzlicher MwSt., sofern zutreffend; dieses Dokument ist keine Rechnung im Sinne von § 14 UStG."
  },
  {
    key: "legal_review",
    label: "Rechtliche Pruefung",
    text: SUBSCRIPTION_DOCUMENT_LEGAL_TODO
  }
]);

export function renderDocumentDisclaimersHtml() {
  return SUBSCRIPTION_DOCUMENT_DISCLAIMERS
    .map((d) => `<p><strong>${esc(d.label)}:</strong> ${esc(d.text)}</p>`)
    .join("");
}

export function renderPlatformNoticeHtml() {
  const platform = SUBSCRIPTION_DOCUMENT_DISCLAIMERS.find((d) => d.key === "platform_role");
  const aueg = SUBSCRIPTION_DOCUMENT_DISCLAIMERS.find((d) => d.key === "aueg_no_guarantee");
  return `${esc(platform?.text || "")} ${esc(aueg?.text || "")}`.trim();
}

export function renderPlainDisclaimerText() {
  return SUBSCRIPTION_DOCUMENT_DISCLAIMERS
    .map((d) => `${d.label}: ${d.text}`)
    .join("\n");
}

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
