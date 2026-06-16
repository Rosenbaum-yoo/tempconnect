/**
 * agreementDocument.test.js — Regressionsanker für die PDF-Download-Affordanz
 * der serverseitig gerenderten Dokumente (Konditionsblatt + Einsatzvereinbarung).
 *
 * Sichert: (1) der "Als PDF speichern"-Button ist vorhanden, (2) das Print-Script
 * wird als EXTERNES, CSP-konformes Asset eingebunden (kein Inline-Handler — helmet
 * scriptSrc erlaubt nur 'self'), (3) die Docs sind print/PDF-optimiert (@media print),
 * (4) die Renderer werfen nicht bei minimalem Input.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderConditionsSheet, renderAgreementDocument } from "../services/agreementDocumentService.js";

const offer = {
  id: "of-1",
  agreement_ref: "EV-2026-0001",
  agreement_status: "confirmed",
  requester_company_name: "Acme GmbH",
  supplier_company_name: "Agentur X",
  offered_hourly_rate: 32.5,
  offered_quantity: 4,
  agreement_snapshot: { offered_hourly_rate: 32.5, offered_quantity: 4 }
};

test("Konditionsblatt: PDF-Download-Button + externes CSP-konformes Print-Script", () => {
  const html = renderConditionsSheet(offer);
  assert.match(html, /data-tc-print/, "Print-Button-Marker muss vorhanden sein");
  assert.match(html, /Als PDF speichern/);
  assert.match(html, /<script src="\/public\/js\/docPrint\.js"><\/script>/, "externes Print-Script (CSP 'self') muss eingebunden sein");
  assert.match(html, /@media print/, "Print/PDF-Styles muessen vorhanden sein");
  assert.doesNotMatch(html, /onclick=/, "kein Inline-Handler (CSP scriptSrc 'self' wuerde ihn blockieren)");
});

test("Einsatzvereinbarung: derselbe PDF-Download-Pfad, ebenfalls CSP-konform", () => {
  const html = renderAgreementDocument(offer);
  assert.match(html, /data-tc-print/);
  assert.match(html, /Als PDF speichern/);
  assert.match(html, /<script src="\/public\/js\/docPrint\.js"><\/script>/);
  assert.doesNotMatch(html, /onclick=/);
});
