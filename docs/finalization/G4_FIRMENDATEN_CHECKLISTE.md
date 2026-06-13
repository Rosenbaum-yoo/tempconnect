# Welle G.4 — Firmendaten-Übergabe nach UG-Gründung (endliche Checkliste)

> **Wann:** Sobald HRB-Nummer + Steuernummer/USt-IdNr vorliegen (Welle G.3 abgeschlossen).
> **Warum endlich:** Alle backend-generierten Dokumente lesen aus EINER Datei
> (`api/config/company.js`). Nur die statischen Legal-Seiten sind separat — beide unten gelistet.
> **Aufwand:** ~30 Min (Werte eintragen) + Verifikation. Kein Code-Umbau mehr nötig.
>
> Vorbereitet 2026-06-13 (Welle F1). Bis dahin: `isPlaceholder: true`, Billing läuft erst
> nach Gründung live (`PAYMENT_MODE=live`) → keine Rechnung mit Platzhalter-Absender vorher.

---

## 1. Zentrale Backend-Config (EINE Datei → deckt Rechnung, E-Mail, Abo-Dokumente)

**Datei:** `api/config/company.js`

- [ ] `isPlaceholder` → `false`
- [ ] `name` → echte Firmierung **inkl. Rechtsform** (z. B. `TempConnect UG (haftungsbeschränkt)`)
- [ ] `street`, `postalCode`, `cityName`, `city` (= „PLZ Ort") → echte Geschäftsanschrift
- [ ] `vatId` → echte USt-IdNr (BZSt) **und/oder** `taxNumber` → Steuernummer (Finanzamt)
- [ ] `registerCourt` → zuständiges Amtsgericht · `registerNumber` → HRB-Nummer
- [ ] `managingDirector` → Name der/des Geschäftsführer(s)
- [ ] `email` (Billing) · `supportEmail` · ggf. `phone`

**Wirkt automatisch auf:**
- `api/services/invoicePdfService.js` — Rechnungsabsender (§14 UStG-Pflichtangaben)
- `api/services/emailHtmlTemplates.js` — E-Mail-Footer-Firmenname
- jede künftige Backend-Doku, die `COMPANY` importiert

---

## 2. Statische Legal-Seiten (separat — können keine JS-Config importieren)

**a) Impressum** — `frontend/public/legal/impressum.html` (Platzhalter bereits als `[…]` markiert)
- [ ] Z. ~36 `[Name des Geschäftsführers / der vertretungsberechtigten Person]`
- [ ] Z. ~46 `Registergericht: [zuständiges Amtsgericht]`
- [ ] Z. ~47 `Registernummer: [HRB-Nummer]`
- [ ] Z. ~52 `[USt-IdNr.]`
- [ ] Firmenname inkl. Rechtsform + Anschrift im Kopf prüfen

**b) Footer** — `frontend/public/js/footer.js`
- [ ] Firmenzeile / Copyright auf echte Firmierung prüfen (enthält aktuell KEINE Legaldaten, nur ggf. Markenname)

**c) Rechtstexte (Welle F2.1, mit/aus Plattform-Vorlagen)** — AGB, Datenschutzerklärung, AVV/DPA
- [ ] Firmendaten + Subprocessor-Liste (`docs/SUBPROCESSORS.md`) + TOMs (`docs/TOMS.md`) finalisieren
- [ ] Verlinkung von allen relevanten Seiten (Gate Teil 1 G) prüfen

---

## 3. Verifikation (nach dem Eintragen)

- [ ] `grep -rn "Musterstr\|DE000000000\|isPlaceholder: true" api/config/company.js` → **0 Treffer**
- [ ] Test-Rechnung erzeugen (Demo-Deal → Invoice) → PDF zeigt echte Firmierung + USt-IdNr/Steuernr
- [ ] Impressum-Seite im Browser → keine `[…]`-Platzhalter mehr
- [ ] `docker exec tempconnect_api npm run test:unit` weiterhin grün
- **Abnahme (Plan G.4):** Rechnung-PDF + Impressum zeigen echte UG-Daten; grep auf Platzhalter = 0
