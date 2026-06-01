# TempConnect – Nächste Schritte (2–4 Wochen)

> **Hinweis:** Diese Datei ist veraltet. Die aktuelle, konsolidierte Go-Live-Checkliste ist **[docs/GO_LIVE_FINAL.md](./docs/GO_LIVE_FINAL.md)**.

Konkrete Prioritätenliste bis zum Launch. Abhaken, was erledigt ist.

---

## Woche 1: Online gehen

### Hosting & Domain
- [ ] **Server mieten** (z.B. Hetzner Cloud CX21, ~5 €/Monat)  
  → https://console.hetzner.cloud
- [ ] **Domain registrieren** (z.B. tempconnect.de, ~10 €/Jahr)
- [ ] **DNS:** A-Record der Domain auf die Server-IP zeigen lassen
- [ ] **SSH-Zugang** zum Server einrichten und testen

### Server vorbereiten
- [ ] Docker installieren: `curl -fsSL https://get.docker.com | sh`
- [ ] Docker Compose (Plugin) installieren
- [ ] Projekt auf Server bringen (Git clone oder Upload)
- [ ] **.env anpassen:**  
  `NODE_ENV=production`  
  `BASE_URL=https://deine-domain.de`  
  `CORS_ORIGIN=https://deine-domain.de`  
  `SESSION_SECRET=` (langen Zufallsstring setzen, z.B. `openssl rand -hex 32`)  
  `DATABASE_URL`, SMTP etc. wie in .env.example

### SSL & Start
- [ ] **HTTPS einrichten** (z.B. Caddy oder Traefik mit Let’s Encrypt – Anleitung in ROADMAP.md)
- [ ] `docker compose up -d` auf dem Server
- [ ] Im Browser testen: https://deine-domain.de und Login

### Backup (einmalig)
- [ ] Backup-Ordner anlegen
- [ ] Manuelles Backup testen (siehe DEPLOYMENT.md)
- [ ] Optional: Cron für tägliches Backup einrichten

**→ Ziel Woche 1:** App läuft unter https://deine-domain.de, Login funktioniert.

---

## Woche 2: Recht & Zahlung

### Rechtstexte (unbedingt vor Go-Live)
- [ ] **Impressum:** Echte Firma, Adresse, Kontakt, ggf. USt-ID eintragen (in Frontend/Modal)
- [ ] **Datenschutzerklärung:** Platzhalter ersetzen, Verantwortlicher, Zwecke, Speicherdauer, Betroffenenrechte – **rechtlich prüfen lassen**
- [ ] **AGB:** Platzhalter ersetzen, **rechtlich prüfen lassen**

### Stripe (wenn du Zahlungen anbieten willst)
- [ ] Stripe-Account: https://dashboard.stripe.com/register
- [ ] **Test-Modus:** API-Keys (sk_test_..., pk_test_...) in .env eintragen
- [ ] **Webhook:** In Stripe Dashboard Webhook anlegen  
  URL: `https://deine-domain.de/api/payment/webhook/stripe`  
  Event: `checkout.session.completed`
- [ ] Testzahlung durchführen (Karte 4242 4242 4242 4242)
- [ ] Für Live: Live-Keys eintragen, `PAYMENT_MODE=live` setzen

**→ Ziel Woche 2:** Rechtstexte sind echt und geprüft, Zahlung (Test) funktioniert.

---

## Woche 3: Beta & Stabilität

### Beta-Tester
- [ ] 3–5 Unternehmen (z.B. Pflegeheime, Kliniken) ansprechen
- [ ] 3–5 Zeitarbeitsfirmen ansprechen
- [ ] Zugang geben (kostenloser PLUS-Plan o.ä.) und Feedback sammeln

### Kurz prüfen
- [ ] **Mobile:** App auf dem Handy durchklicken (Layout, Buttons, Formulare)
- [ ] **E-Mails:** Echte Adresse testen (Passwort-Reset, Verifizierung, Benachrichtigungen)
- [ ] **Kritische Bugs** aus Feedback beheben

**→ Ziel Woche 3:** Erste echte Nutzer, keine Blocker-Bugs mehr.

---

## Woche 4: Launch

- [ ] Alle kritischen Punkte aus Woche 1–3 abgehakt
- [ ] Stripe ggf. auf Live umstellen
- [ ] **Kundensupport** festlegen (E-Mail, ggf. Hinweis in der App)
- [ ] Kurze Ankündigung (LinkedIn, Branche, Bekannte) – optional

**→ Ziel Woche 4:** Öffentlicher Start, erste echte Kunden möglich.

---

## Schnell-Referenz

| Was        | Wo nachschauen        |
|-----------|------------------------|
| Backup    | DEPLOYMENT.md          |
| Hosting   | ROADMAP.md (Schnellstart Hetzner) |
| .env      | .env.example           |
| Alle Tasks| ROADMAP.md             |

---

*Erstellt: Februar 2026*
