# Deal-Erfolg, Wertgefühl & Betrugsprävention

Empfehlungen, damit Nutzer die Plattform als wertvoll erleben, bereit sind zu zahlen und Betrug eingedämmt wird.

---

## 1. So fühlt es sich „sehr gut“ an – Wertgefühl stärken

### Bereits umgesetzt
- **Kontaktdaten erst nach Deal** – klare Regel, Vertrauen durch Struktur
- **Bewertungssystem** – Sterne + Zuverlässigkeit/Kommunikation/Qualität, „Verifizierter Partner“ bei ≥5 Bewertungen und ≥4,0
- **E-Mail-Benachrichtigungen** – bei Annahme, Deal-Abschluss, Ablehnung
- **Hilfe & Anleitung** – einheitliche Anleitung für alle in der Sidebar

### Empfehlungen (Umsetzung)

| Maßnahme | Aufwand | Wirkung |
|----------|---------|--------|
| **Deal-Abschluss als Erfolgsmoment** | Gering | Nach „Deal abschließen“ sofort die **Kontaktdaten anzeigen** (nicht nur Toast). Nutzer sieht direkt den konkreten Nutzen. |
| **Klare nächste Schritte** | Gering | Nach Deal: kurzer Hinweis „Kontaktdaten unten. Bitte Partner bewerten – das hilft allen.“ |
| **Bewertungen sichtbar machen** | Bereits da | Im Marktplatz und bei Anfragen Sterne/Bewertungsanzahl prominent lassen; „Bewertungen“-Button bei jedem Angebot. |
| **Kurz „Warum zahlen?“** | Mittel | Auf Abo-Seite oder vor Checkout 1–2 Sätze: „Mit PLUS: mehr Anfragen, mehr Sichtbarkeit, schneller passende Partner finden.“ |
| **Erfolgsgeschichten (später)** | Hoch | 1–2 Zitate von echten Nutzern (mit Einwilligung) auf Landingpage oder nach Login. |

---

## 2. Deal-Abschluss „perfekt“ machen – damit Nutzer bereit sind zu zahlen

### Bezahlbereitschaft entsteht, wenn …
- der **Nutzen sofort sichtbar** ist (Kontaktdaten direkt nach Deal),
- **keine bösen Überraschungen** (transparente Preise, klare Limits),
- **Vertrauen** da ist (Bewertungen, E-Mail verifiziert, klare AGB).

### Konkrete Tipps

1. **Sofortiger Payoff nach Deal**  
   Direkt nach Klick auf „Deal abschließen“ die Kontaktansicht öffnen (E-Mail, Telefon des Partners). So erlebt der Nutzer: „Das hat sich gelohnt.“

2. **Bewertung nach Deal anregen**  
   Nach Abschluss freundlich an „Partner bewerten“ erinnern (Toast oder kurzer Hinweis). Mehr Bewertungen = mehr Vertrauen für alle = höhere Zahlungsbereitschaft.

3. **Abo-Nutzen vor dem Kauf zeigen**  
   Vor Stripe-Checkout oder auf der Abo-Seite klar machen: „Mit BASIS/PLUS: X Anfragen, Y Angebote – so findest du schneller Partner.“ Keine versteckten Kosten.

4. **Erfolgs-Toast positiv formulieren**  
   Statt nur „Kontaktdaten wurden ausgetauscht“ z. B.: „Deal abgeschlossen! Deine Kontaktdaten findest du unten. Du kannst jetzt direkt mit deinem Partner in Kontakt treten.“

---

## 3. Betrug vermeiden – was ihr schon habt & was noch hilft

### Bereits umgesetzt (gut für Vertrauen & Absicherung)

| Mechanismus | Zweck |
|-------------|--------|
| **E-Mail-Verifizierung** | Fake-Accounts erschweren, Ansprechpartner vorhanden |
| **Kontaktdaten erst nach Deal** | Kein Abgreifen von Kontakten ohne echte Annahme |
| **Bewertungen** | Schlechte Partner werden sichtbar, Anreiz für fairen Umgang |
| **Rate Limits** (Login, Register, Anfragen, API) | Brute-Force und Spam begrenzen |
| **AGB/Datenschutz** | Klarstellung: TempConnect vermittelt nur, keine Haftung für Verträge zwischen Parteien |

### Weitere Empfehlungen

| Maßnahme | Priorität | Beschreibung |
|----------|-----------|--------------|
| **Melde-Funktion** | Hoch | Button „Anfrage/Nutzer melden“ (z. B. in Anfragen-Detail oder Profil). Meldungen in DB speichern, manuell prüfen. Reduziert Missbrauch und gibt Nutzern ein sicheres Gefühl. |
| **AGB-Text schärfen** | Mittel | Explizit: „Kontaktdaten nur für legitime Geschäftszwecke; Missbrauch (Spam, Betrug) führt zu Sperre und ggf. rechtlichen Schritten.“ |
| **Verdächtige Muster (optional)** | Niedrig | Später: z. B. viele Anfragen ohne einen Deal, gleiche IP für mehrere Accounts – nur loggen und bei Bedarf manuell prüfen. Kein Auto-Sperre ohne klare Regeln. |
| **Secure Cookies / HTTPS** | Bereits geplant | Für Go-Live: HTTPS (z. B. Let’s Encrypt), Secure-Cookie-Flag in Produktion. |

### Was ihr bewusst nicht übernehmt (und warum das ok ist)

- **Zahlungsabwicklung zwischen Nutzern** – TempConnect vermittelt nur Kontakte; Verträge und Zahlungen laufen zwischen Unternehmen und Zeitarbeitsfirma. Das reduziert eure Haftung und Komplexität.
- **Automatische Betrugserkennung** – am Anfang reicht: E-Mail-Verifizierung, Bewertungen, Rate Limits, klare AGB und eine einfache Melde-Funktion.

---

## 4. Kurz-Checkliste vor Go-Live

- [x] Deal-Abschluss: Kontaktansicht öffnet sich direkt nach „Deal abschließen“.
- [x] Erfolgs-Toast/Hinweis erwähnt „Kontaktdaten unten“ und „Partner bewerten“.
- [x] Abo-Seite / Checkout: 1–2 Sätze Nutzen (Anfragen, Angebote, schneller Partner).
- [x] AGB: Hinweis auf Missbrauch (Spam/Betrug) und Konsequenzen (Sperre, Rechtsschritte).
- [x] Melde-Button für Anfragen/Nutzer (siehe Abschnitt 5).
- [ ] HTTPS und Secure Cookies in Produktion aktiv.

---

## 5. Nächste sinnvolle Schritte (Reihenfolge empfohlen)

### Schritt 1: AGB um Missbrauchshinweis ergänzen
**Aufwand:** gering | **Datei:** Rechtstexte im Frontend (z. B. AGB im Legal-Modal)

- In den AGB einen eigenen Absatz oder Satz einfügen, z. B.:
  - *„Kontaktdaten dürfen nur für legitime geschäftliche Zwecke genutzt werden. Missbrauch (Spam, Betrug, Belästigung) kann zur Sperrung des Accounts und ggf. rechtlichen Schritten führen.“*
- Optional: Verweis auf Melde-Funktion („Verdächtiges Verhalten kannst du über ‚Melden‘ an uns übermitteln.“), sobald Schritt 3 umgesetzt ist.

---

### Schritt 2: Abo- / Checkout-Seite um Nutzen-Text ergänzen
**Aufwand:** gering | **Ort:** Abo-Auswahl oder Stelle, an der zum Stripe-Checkout weitergeleitet wird

- Kurze Nutzen-Sätze pro Plan, z. B.:
  - **BASIS:** „Mehr Anfragen und Angebote – finde schneller passende Partner.“
  - **PLUS:** „Noch mehr Reichweite und Anfragen – ideal für aktive Vermittlung.“
  - **NOTDIENST:** „Inkl. Notdienst-Option – sichtbar bei dringenden Anfragen.“
- Ein Satz vor dem Bezahl-Button: „Du erhältst sofort vollen Zugriff nach Zahlungseingang.“

---

### Schritt 3: Melde-Funktion (Anfrage / Nutzer melden)
**Aufwand:** mittel | **Zweck:** Vertrauen, Abschreckung, manuelle Prüfung möglich

**Backend (API):**
- Neue Tabelle z. B. `reports` (id, reporter_id, reported_user_id, request_id optional, reason, comment, created_at).
- Endpoint `POST /api/reports` (requireAuth): reporter_id = eingeloggter User, reported_user_id + optional request_id, reason (Dropdown: Spam, Betrug, Belästigung, Sonstiges), comment (optional). Validierung: reported_user_id ≠ reporter_id, User/Request existieren.
- Keine Auto-Sperre; Meldungen nur speichern und z. B. per Admin oder E-Mail an Support sichtbar machen.

**Frontend:**
- Bei Anfragen-Card oder in Detailansicht einer Anfrage: Button „Melden“ (Icon/Text).
- Modal: Grund auswählen (Spam, Betrug, Belästigung, Sonstiges), optional Kurztext, Senden.
- Optional: Auf Profil eines anderen Nutzers (z. B. in Bewertungen oder Kontaktansicht) „Nutzer melden“ anbieten.

**Hinweis:** Wer gemeldet wird, muss nicht sofort informiert werden (rechtlich prüfen); Auswertung der Meldungen manuell (z. B. wöchentlich).

---

### Schritt 4: HTTPS und Secure Cookies (Go-Live)
**Aufwand:** abhängig von Hosting (oft gering mit Caddy/Nginx + Let’s Encrypt)

- SSL-Zertifikat (z. B. Let’s Encrypt) einrichten, siehe `DEPLOYMENT.md` / `VOR-GELDFLUSS.md`.
- In Produktion: Session-Cookie mit `secure: true` setzen (in API nur wenn `BASE_URL` mit `https://`).

---

### Schritt 5 (optional): Verdächtige Muster loggen
**Aufwand:** mittel | **Priorität:** niedrig

- Bei Bedarf: z. B. Anzahl Anfragen pro User ohne einen FINALIZED-Deal, oder Registrierungen von gleicher IP – nur in Log/DB festhalten, keine automatische Sperre. Später auswerten und bei klaren Regeln ggf. Warnung oder manuelle Prüfung.

---

*Dokument: Empfehlungen für Wertgefühl, Deal-UX und Betrugsprävention. Stand: 27.02.2026.*
