# TempConnect (Docker)

Plattform für Zeitarbeit: Kapazitäten, Anfragen, Deals. Mit Enterprise-Features (Pulse, Compliance, Lieferanten-Scorecard).

---

## Sicherheit – sofort beachten

**Rotate SendGrid key now.**  
Falls der SendGrid-API-Key jemals in einer getrackten Datei, in der Doku oder unsicher geteilt wurde: **sofort in SendGrid einen neuen API-Key anlegen**, den alten löschen und den neuen **nur in der lokalen .env** eintragen (niemals committen). Siehe [docs/SECURITY-CONFIG.md](docs/SECURITY-CONFIG.md) für die genaue Anleitung und **How to rotate keys** für alle Secrets.

---

## Secret Rotation Guide

Wenn ein Secret (API-Key, Passwort, Token) kompromittiert wurde oder rotiert werden soll:

1. **Neuen Wert erzeugen** (z. B. `openssl rand -hex 32` für SESSION_SECRET, JWT_SECRET, INTERNAL_CRON_SECRET).
2. **Neuen Wert nur in .env auf dem Server / lokal setzen** – nie in Git committen. `.env` steht in `.gitignore`.
3. **API/Container neu starten**, damit die neuen Umgebungsvariablen geladen werden.
4. **SendGrid (SMTP):** Bei Verdacht auf Kompromittierung: SendGrid Dashboard → Settings → API Keys → neuen Key erstellen, alten löschen. In `.env` `SMTP_PASS=<neuer_key>` setzen (bei SendGrid ist User oft `apikey`). Absender-Domain/Adresse bleibt unverändert.
5. **Stripe:** Alten Webhook-Signing-Secret ersetzen: Stripe Dashboard → Webhooks → Endpoint → Signing secret neu anzeigen; in `.env` `STRIPE_WEBHOOK_SECRET` aktualisieren. Gegebenenfalls auch `STRIPE_SECRET_KEY` rotieren (neue Keys unter API Keys).
6. **Datenbank-Passwort:** Nach Rotation in `.env` (z. B. `POSTGRES_PASSWORD`, `DATABASE_URL`) alle Container, die die DB nutzen, neu starten.

Details und weitere Secrets: [docs/SECURITY-CONFIG.md](docs/SECURITY-CONFIG.md).

---

## Konfiguration

- **Umgebung:** Werte nur in **.env** setzen (wird nicht ins Repo/Image übernommen). Vorlage: **.env.example** kopieren nach **.env** und Platzhalter ersetzen.
- **Produktion:** Die API startet nicht, wenn `NODE_ENV=production` und erforderliche Secrets fehlen oder wie Platzhalter aussehen: `SESSION_SECRET`, `JWT_SECRET`, `INTERNAL_CRON_SECRET`. Siehe [docs/SECURITY-CONFIG.md](docs/SECURITY-CONFIG.md).

---

## Start (lokal)

```bash
docker compose up -d --build
```

Frontend: http://localhost:8080 (oder konfigurierter Port). API: Port 3000 (oder `API_PORT`).

---

## Weitere Doku

- [docs/VOR-HETZNER-GO-LIVE.md](docs/VOR-HETZNER-GO-LIVE.md) – Go-Live-Checkliste
- [docs/SECURITY-CONFIG.md](docs/SECURITY-CONFIG.md) – Sichere Konfiguration, Schlüssel-Rotation
- [docs/MODEL-B-IMPLEMENTATION.md](docs/MODEL-B-IMPLEMENTATION.md) – Kapazitäten, Reservierungen, API
- [docs/ENTERPRISE-FEATURES-FOR-KI.md](docs/ENTERPRISE-FEATURES-FOR-KI.md) – Enterprise-Features (Pulse, Scorecard, Compliance)
