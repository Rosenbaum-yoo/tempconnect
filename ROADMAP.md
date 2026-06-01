# TempConnect - Roadmap zur Marktreife

> **Aktueller Stand:** ~90% fertig  
> **Ziel:** Produktionsreifer Launch in 2-3 Wochen

---

## ✅ Was bereits funktioniert

- [x] User-Registrierung & Login
- [x] E-Mail-Verifizierung
- [x] Abo-System (FREE / BASIS / PLUS / NOTDIENST)
- [x] Plan-Limits (Anfragen, Karteikarten)
- [x] Karteikarten erstellen, bearbeiten, löschen
- [x] Marktplatz durchsuchen (Filter: Region, Kategorie, Notdienst)
- [x] Anfragen senden, annehmen, ablehnen
- [x] Deal abschließen mit Kontaktaustausch
- [x] Gegenseitenorientierter Angebotsflow (Counterparty-First)
- [x] Perspektivische Statuslabels (Sender/Empfänger sehen unterschiedliche Texte)
- [x] Gegenangebots-Flow mit vollständigem Status-Lifecycle
- [x] Auto-Assignment nach Angebotsannahme
- [x] Bewertungssystem (Sterne + Kategorien)
- [x] Payment-System vorbereitet (Stripe + Demo-Modus)
- [x] Docker-basiertes Deployment
- [x] Passwort-Reset Funktion
- [x] DSGVO-Seiten (Impressum, Datenschutz, AGB, Kontakt)
- [x] AGB-Checkbox bei Registrierung
- [x] Account löschen (DSGVO Art. 17)
- [x] Rate Limiting (Brute-Force-Schutz)
- [x] E-Mail-Benachrichtigungen (Anfragen, Deals, etc.)

---

## 🔴 PHASE 1: Kritisch vor Launch (Woche 1)

### 1.1 Sicherheit
| Task | Priorität | Status |
|------|-----------|--------|
| HTTPS/SSL-Zertifikat (Let's Encrypt) | KRITISCH | ⬜ |
| Rate Limiting (Login, API) | KRITISCH | ✅ |
| Passwort-Reset Funktion | KRITISCH | ✅ |
| CSRF-Schutz | HOCH | ✅ |
| Secure Cookies (Produktion) | HOCH | ✅ |
| Input-Validierung verschärfen | MITTEL | ⬜ |

**Geschätzter Aufwand:** 1 Tag

### 1.2 Rechtliches / DSGVO
| Task | Priorität | Status |
|------|-----------|--------|
| Impressum-Seite | KRITISCH | ✅ |
| Datenschutzerklärung | KRITISCH | ✅ |
| AGB / Nutzungsbedingungen | KRITISCH | ✅ |
| Checkbox "AGB akzeptieren" bei Registrierung | KRITISCH | ✅ |
| Account löschen Funktion | HOCH | ✅ |
| Datenexport (DSGVO Art. 20) | MITTEL | ✅ |
| Cookie-Banner (falls Tracking) | NIEDRIG | ⬜ (nicht nötig, nur Session-Cookies) |

**Geschätzter Aufwand:** ERLEDIGT  
**Hinweis:** Platzhalter-Texte vorhanden. Vor Launch mit echten Firmendaten ersetzen und von Anwalt prüfen lassen.

### 1.3 Hosting & Deployment
| Task | Priorität | Status |
|------|-----------|--------|
| Server mieten (Hetzner/DigitalOcean) | KRITISCH | ⬜ |
| Domain registrieren | KRITISCH | ⬜ |
| DNS konfigurieren | KRITISCH | ⬜ |
| Docker auf Server installieren | KRITISCH | ⬜ |
| SSL-Zertifikat einrichten | KRITISCH | ⬜ |
| Firewall konfigurieren | HOCH | ⬜ |
| Automatische Backups (DB) | HOCH | ⬜ |
| Monitoring einrichten | MITTEL | ⬜ |

**Geschätzter Aufwand:** 1-2 Tage

---

## 🟡 PHASE 2: Wichtig (Woche 2)

### 2.1 Payment finalisieren
| Task | Priorität | Status |
|------|-----------|--------|
| Stripe-Account erstellen | KRITISCH | ⬜ |
| Echte API-Keys eintragen | KRITISCH | ⬜ |
| Webhook-Endpoint testen | KRITISCH | ⬜ |
| Testzahlung durchführen | KRITISCH | ⬜ |
| Abo-Kündigung über Stripe | HOCH | ⬜ |
| Rechnungen/Invoices | MITTEL | ⬜ |

**Geschätzter Aufwand:** 1 Tag

### 2.2 E-Mail-Benachrichtigungen
| Task | Priorität | Status |
|------|-----------|--------|
| E-Mail-Provider einrichten (SendGrid/Brevo) | KRITISCH | ✅ (in .env vorbereitet) |
| Passwort-Reset E-Mail | KRITISCH | ✅ |
| Neue Anfrage erhalten | HOCH | ✅ |
| Anfrage angenommen/abgelehnt | HOCH | ✅ |
| Deal abgeschlossen | HOCH | ✅ |
| Account gelöscht | HOCH | ✅ |
| Abo läuft ab Erinnerung | MITTEL | ⬜ |
| Professionelle E-Mail-Templates | MITTEL | ⬜ |

**Geschätzter Aufwand:** Grundfunktionen ERLEDIGT, Templates optional

### 2.3 UX-Verbesserungen
| Task | Priorität | Status |
|------|-----------|--------|
| Mobile-Responsive prüfen/verbessern | HOCH | ⬜ |
| Loading-States bei API-Calls | HOCH | ⬜ |
| Bessere Fehlermeldungen | MITTEL | ⬜ |
| Leere Zustände (Empty States) | MITTEL | ⬜ |
| FAQ-Seite | MITTEL | ⬜ |
| Kontakt-Formular | MITTEL | ⬜ |
 Passwort ändern im Bereich „Mein Profil“ | MITTEL | ⬜ |

### 2.4 Marktplatz & Suche
| Task | Priorität | Status |
|------|-----------|--------|
| Erweiterte Filteroptionen (z. B. nach Plan) | MITTEL | ⬜ |
| Umkreissuche mit Radius, inkl. Berücksichtigung bei Broadcast | MITTEL | ✅ |

### 2.5 Landing Page
| Task | Priorität | Status |
|------|-----------|--------|
| Landing Page Texte verfeinern | MITTEL | ⬜ |
| Landing Page: Buttons zur Registrierung für Unternehmen | HOCH | ⬜ |
| Landing Page: Buttons zur Registrierung für Zeitarbeitsfirmen | HOCH | ⬜ |
**Geschätzter Aufwand:** 2-3 Tage

---

## 🟢 PHASE 3: Beta-Test (Woche 3-4)

### 3.1 Beta-Tester finden
- [ ] 3-5 Unternehmen (Pflegeheime, Krankenhäuser, Industrie)
- [ ] 3-5 Zeitarbeitsfirmen
- [ ] Persönlich kontaktieren und einladen
- [ ] Kostenloser PLUS-Plan für Beta-Tester

### 3.2 Feedback sammeln
- [ ] Wöchentliche Feedback-Runden
- [ ] Bug-Reports sammeln
- [ ] Feature-Wünsche dokumentieren
- [ ] Kritische Bugs sofort fixen

### 3.3 Vor offiziellem Launch
- [ ] Alle kritischen Bugs behoben
- [ ] Mindestens 3 positive Testimonials
- [ ] Performance-Test (Load Testing)
- [ ] Backup/Recovery getestet

---

## 🔵 PHASE 4: Launch & Wachstum (Woche 5+)

### 4.1 Marketing
| Kanal | Priorität | Status |
|-------|-----------|--------|
| LinkedIn-Firmenseite | HOCH | ⬜ |
| LinkedIn-Posts (2x/Woche) | HOCH | ⬜ |
| Branchenverbände kontaktieren | HOCH | ⬜ |
| Google My Business | MITTEL | ⬜ |
| Pressemitteilung | MITTEL | ⬜ |
| Google Ads | NIEDRIG | ⬜ |

### 4.2 Nach dem Launch
- [ ] Kundensupport einrichten (E-Mail/Chat)
- [ ] Feedback-System im Dashboard
- [ ] Monatliche Feature-Updates
- [ ] Referral-Programm (Kunden werben Kunden)
- [ ] Case Studies erstellen

---

## 💰 Geschätzte Kosten

### Einmalig
| Posten | Kosten |
|--------|--------|
| Domain (.de) | ~10 €/Jahr |
| Rechtstexte (Generator) | 0-100 € |
| Logo/Branding (optional) | 0-500 € |

### Monatlich
| Posten | Kosten |
|--------|--------|
| Server (Hetzner CX21) | 5-20 € |
| E-Mail (SendGrid Free) | 0 € |
| Backups | 0-5 € |
| **Summe** | **~10-25 €** |

### Pro Transaktion (Stripe)
- 1.4% + 0.25 € pro Kartenzahlung
- Bei 10 Kunden à 150€ = ~25€ Stripe-Gebühren

---

## 🚀 Schnellstart-Anleitung

### Server aufsetzen (Hetzner Beispiel)

```bash
# 1. Server mieten: https://console.hetzner.cloud
#    CX21 (2 vCPU, 4GB RAM) für ~5€/Monat

# 2. SSH verbinden
ssh root@DEINE_SERVER_IP

# 3. Docker installieren
curl -fsSL https://get.docker.com | sh

# 4. Docker Compose installieren
apt install docker-compose-plugin

# 5. Projekt klonen/hochladen
git clone https://github.com/DEIN_REPO/tempconnect.git
cd tempconnect

# 6. .env anpassen
cp .env.example .env
nano .env  # Werte anpassen!

# 7. Starten
docker compose up -d

# 8. SSL mit Caddy/Traefik einrichten (siehe separate Anleitung)
```

---

## 🏗️ Hosting & Skalierung

### Option 1: Einfacher Start (~20€/Monat)
Für 0-100 Kunden:
- **Server:** Hetzner CX21 (2 vCPU, 4GB RAM) - 5€/Monat
- **Domain:** .de Domain - 10€/Jahr
- **E-Mail:** SendGrid Free (100 E-Mails/Tag) - 0€
- **Backups:** Hetzner Backup - 2€/Monat
- Docker Compose wie aktuell konfiguriert

**Architektur:**
```
┌─────────────────────────────────────┐
│         Hetzner Server              │
│  ┌─────────┐  ┌─────────────────┐  │
│  │ Nginx   │  │ PostgreSQL      │  │
│  │ Frontend│  │ Datenbank       │  │
│  └─────────┘  └─────────────────┘  │
│  ┌─────────────────────────────┐   │
│  │ Node.js API                 │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```
Alles auf einem Server. Einfach, günstig, reicht für den Start.

### Option 2: Managed Services (~100€/Monat)
Für 100-500 Kunden:
- **Datenbank:** Supabase oder Railway PostgreSQL
- **Server:** Railway.app oder Render.com
- **E-Mail:** SendGrid Pro (50k E-Mails/Monat)
- Automatische Skalierung, weniger Wartung

**Architektur:**
```
┌──────────────┐     ┌──────────────┐
│ Railway.app  │     │ Supabase     │
│ (API+Frontend)├────▶│ (Datenbank)  │
└──────────────┘     └──────────────┘
```
**Vorteile:** Automatische Skalierung, keine Server-Wartung, Ein-Klick-Deployment  
**Nachteile:** Teurer, weniger Kontrolle

### Option 3: High Availability (~300€/Monat)
Für 500+ Kunden:
- **Load Balancer:** Hetzner LB oder Cloudflare
- **2+ Server:** Hetzner CX31 (4 vCPU, 8GB RAM)
- **Managed DB:** Hetzner Cloud Database oder AWS RDS
- **CDN:** Cloudflare für statische Assets
- Automatische Failover, 99.9% Uptime

**Architektur:**
```
                 ┌─────────────────┐
                 │  Load Balancer  │
                 └────────┬────────┘
           ┌──────────────┼──────────────┐
           ▼              ▼              ▼
    ┌──────────┐   ┌──────────┐   ┌──────────┐
    │ Server 1 │   │ Server 2 │   │ Server 3 │
    └──────────┘   └──────────┘   └──────────┘
           │              │              │
           └──────────────┼──────────────┘
                          ▼
                 ┌─────────────────┐
                 │ Managed Database│
                 │ (mit Replika)   │
                 └─────────────────┘
```
**Vorteile:** Server fällt aus? Andere übernehmen. Datenbank-Backup in Echtzeit. Extrem schnell durch CDN.

### Empfehlung für Launch
**Starte mit Option 1.** Bei TempConnect ist die Datenbank klein (Text, keine Bilder), daher reicht ein einzelner Server für viele Kunden. Bei Erfolg innerhalb von 2-4 Stunden auf Option 2 oder 3 migrierbar.

---

## 📧 E-Mail-Benachrichtigungen (implementiert)

Folgende automatische E-Mails werden versendet:

| Ereignis | E-Mail an | Inhalt |
|----------|-----------|--------|
| Neue Anfrage erhalten | Listing-Besitzer | "XY möchte dich kontaktieren" |
| Anfrage angenommen | Anfragesteller | "Gute Nachrichten! XY hat angenommen" |
| Anfrage abgelehnt | Anfragesteller | "Leider abgelehnt, suche weiter" |
| Deal abgeschlossen | Beide Parteien | Kontaktdaten werden ausgetauscht |
| Account gelöscht | Gelöschter User | "Deine Daten wurden entfernt" |
| Passwort-Reset | User | Link zum Zurücksetzen (1h gültig) |
| E-Mail-Verifizierung | Neuer User | Bestätigungslink |

---

## 🛡️ Rate Limiting (implementiert)

Schutz gegen Brute-Force-Angriffe und API-Missbrauch:

| Bereich | Limit | Zeitfenster | Zweck |
|---------|-------|-------------|-------|
| Login | 5 Versuche | 15 Minuten | Passwort-Raten verhindern |
| Register | 5 Versuche | 15 Minuten | Spam-Accounts verhindern |
| Passwort-Reset | 5 Versuche | 15 Minuten | E-Mail-Spam verhindern |
| Anfragen senden | 30 Anfragen | 10 Minuten | Spam verhindern |
| API allgemein | 200 Aufrufe | 5 Minuten | Überlastung verhindern |

Bei Überschreitung: Fehlermeldung "Zu viele Versuche, bitte warte X Minuten."

---

## 🗑️ Account löschen (DSGVO Art. 17 - implementiert)

Nutzer können ihren Account vollständig löschen:

**Was wird gelöscht:**
```
┌─────────────────────────────────────────────┐
│  DELETE /api/me löscht:                    │
│                                             │
│  1. Alle Bewertungen (gegeben + erhalten)  │
│  2. Alle gesendeten Anfragen               │
│  3. Alle Anfragen an eigene Karteikarten   │
│  4. Alle Karteikarten                      │
│  5. Abo-Daten                              │
│  6. User-Account                           │
│                                             │
│  → Bestätigungs-E-Mail wird gesendet       │
└─────────────────────────────────────────────┘
```

**Sicherheit:** Doppelte Bestätigung erforderlich (2x klicken)

---

## 📞 Support & Kontakt

Bei Fragen zur Implementierung:
- Technische Dokumentation: `README.md`
- API-Dokumentation: `docs/API.md` (TODO)
- E-Mail-Konfiguration: `.env.example`

---

## Changelog

| Datum | Version | Änderungen |
|-------|---------|------------|
| 2026-03-27 | 1.2.0 | Gegenseitenorientierter Angebotsflow: perspektivische Labels, Counterparty-First-Sortierung, Notifications für Counter/Withdraw, State-Machine-Härtung, Badge-Farblogik, Unit-Tests |
| 2026-02-19 | 0.9.5 | Account löschen, Rate Limiting, E-Mail-Benachrichtigungen erweitert |
| 2026-02-19 | 0.9.2 | Passwort-Reset, DSGVO-Seiten (Impressum, Datenschutz, AGB), AGB-Checkbox |
| 2026-02-19 | 0.9.0 | Abo-System, Payment (Stripe), Bewertungen |
| 2026-02-17 | 0.8.0 | E-Mail-Verifizierung, Kontaktaustausch |

---

*Erstellt: 19.02.2026*  
*Letzte Aktualisierung: März 2026*

---

## Backlog (offen)

### UX / Frontend
- [ ] Landing Page: Testuser-Button entfernen, Texte marktreif formulieren
- [ ] Landing Page: Registrierungs-Buttons für Unternehmen und Zeitarbeitsfirmen
- [ ] Landing Page: Marketplace/Anfragen/Kontaktaustausch-Buttons → Login/Registrierung
- [ ] Mobile-Responsive prüfen und verbessern
- [ ] Login: "Daten merken" (Remember Me)
- [ ] Support / Hilfe / FAQ-Seite einbinden
- [ ] Angebote (ehem. Karteikarten) ein-/ausblendbar machen

### Features
- [ ] Passwort ändern im Bereich "Mein Profil"
- [ ] Handelsregister-Eintrag: Profildaten ergänzen
- [ ] Datenexport-Link bei Datenschutzbestimmungen platzieren

### Bereits umgesetzt ✅
- [x] Umkreissuche mit Broadcast-Berücksichtigung
- [x] Datenexport (DSGVO Art. 20): `GET /api/me/export`
- [x] Gegenseitenorientierter Angebotsflow (Counterparty-First)
- [x] Perspektivische Statuslabels für Offer-Views
- [x] Counterparty-First Sortierung in Offer-Listen
- [x] Notification-Events für Gegenangebot + Rückzug
- [x] State-Machine-Integration für OFFER_TRANSITIONS
- [x] Idempotente Accept-Logik + Race-Condition-Schutz
- [x] Unit-Tests für Offer-Statusmodell (21 Tests)

