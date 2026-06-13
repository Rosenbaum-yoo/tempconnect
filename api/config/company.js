/**
 * company.js — ZENTRALE Firmen-/Rechnungsabsender-Stammdaten (Single Source of Truth).
 *
 * ⚠️ PLATZHALTER bis zur UG-Gründung. Nach Handelsregister-Eintragung + Steuernummer
 *    werden die Werte hier EINMALIG gefüllt (Welle G.4). Alle backend-generierten
 *    Dokumente (Rechnungs-PDF §14 UStG, E-Mail-Footer, Abo-Dokumente) lesen von hier.
 *    Die statischen Legal-Seiten (Impressum §5 DDG, Footer) sind eine separate, ebenfalls
 *    endliche Liste — siehe `docs/finalization/G4_FIRMENDATEN_CHECKLISTE.md`.
 *
 * `isPlaceholder: true` signalisiert, dass die Daten noch nicht final sind. Billing läuft
 * ohnehin erst nach Gründung live (PAYMENT_MODE=live), daher gehen vorher keine Rechnungen
 * mit Platzhalter-Absender raus.
 *
 * Pflichtfelder Rechnung (§14 UStG): vollständiger Name + Anschrift des leistenden
 *   Unternehmers, USt-IdNr ODER Steuernummer, Rechnungsnummer/-datum (separat erzeugt).
 * Pflichtfelder Impressum (§5 DDG): Firma inkl. Rechtsform, Anschrift, Vertretungsberechtigte,
 *   Registergericht + Registernummer (HRB), USt-IdNr, Kontakt.
 */

export const COMPANY = Object.freeze({
  // Markiert die Daten als noch-nicht-final (G.4 setzt false).
  isPlaceholder: true,

  // ── Rechnungsabsender (von invoicePdfService verwendet — Schlüsselnamen NICHT umbenennen) ──
  name: "TempConnect GmbH",          // G.4: echte Firmierung inkl. Rechtsform, z. B. "TempConnect UG (haftungsbeschränkt)"
  street: "Musterstrasse 1",         // G.4: echte Geschäftsanschrift
  city: "10115 Berlin",              // G.4: PLZ + Ort
  country: "Deutschland",
  vatId: "DE000000000",              // G.4: echte USt-IdNr (nach Beantragung beim BZSt)
  email: "billing@tempconnect.de",   // G.4: echte Rechnungs-/Billing-Adresse
  web: "https://tempconnect.de",

  // ── Zusätzliche Stammdaten für Impressum / Abo-Dokumente / Verträge (G.4) ──
  legalForm: "UG (haftungsbeschränkt)", // Zielrechtsform
  postalCode: "10115",                  // G.4
  cityName: "Berlin",                   // G.4 (ohne PLZ, für getrennte Felder)
  taxNumber: "",                        // G.4: Steuernummer vom Finanzamt (Alternative/Ergänzung zur USt-IdNr)
  registerCourt: "",                    // G.4: zuständiges Amtsgericht (Registergericht)
  registerNumber: "",                   // G.4: HRB-Nummer
  managingDirector: "",                 // G.4: Name der/des Geschäftsführer(s)
  supportEmail: "support@tempconnect.de",
  phone: ""                             // optional
});

export default COMPANY;
