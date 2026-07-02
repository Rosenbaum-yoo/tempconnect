# G — Pilot-Demo öffentlich schalten (Cloudflare Tunnel, ohne eigenen Server)

**Ziel:** Interessenten/Pilotkunden spielen mit der **echten, voll funktionsfähigen** Plattform (Demo-Modus) — über eine öffentliche URL, ohne dass du einen Server mietest. Läuft auf deinem PC über einen ausgehenden Cloudflare-Tunnel: keine offenen Ports, keine feste IP, kostenlos.

> **Wann sinnvoll:** begleitete Velvet-Rope-Piloten in Zeitfenstern („hier ist dein Zugang für diese Woche / unser Gespräch"). Dein PC + Docker müssen dabei an sein. Für echtes 24/7-unbeaufsichtigt später einen billigen Dauer-Host (Hetzner/Fly/Railway).

Das Demo-Setup liegt in **`docker-compose.demo.yml`** (Repo-Wurzel). Es nutzt die **gebackene API** (kein Bind-Mount → keine 502-Blips), seedet die Demo-Welt, leitet alle E-Mails in den Mailpit-Mock (nie echt raus) und bringt den Tunnel als Container mit.

---

## Kanonischer Startbefehl

```bash
cd "C:\Users\DennisStegemann\Desktop\12_tempconnect_docker(D)"
docker compose -f docker-compose.yml -f docker-compose.demo.yml --profile dev up -d --build
```

- **Beide `-f` explizit** → der Dev-Override (`docker-compose.override.yml`) wird NICHT geladen → API stabil aus dem Image.
- **`--profile dev`** → aktiviert nur den Mailpit-Mail-Mock (kein anderer Dev-Effekt).

---

## Weg A — 2-Minuten-Schnelltest (ohne Cloudflare-Konto, Zufalls-URL)

Für den ersten Blick, ob alles läuft. Erzeugt eine `*.trycloudflare.com`-URL.

1. Stack ohne den (noch tokenlosen) Tunnel-Container starten:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.demo.yml --profile dev up -d --build \
     db redis migrate api frontend-build frontend mailpit
   ```
2. Schnell-Tunnel auf das interne nginx legen:
   ```bash
   docker run --rm --network tempconnect_docker_default \
     cloudflare/cloudflared:latest tunnel --url http://frontend:80
   ```
3. Im Log erscheint eine Zeile `https://<zufall>.trycloudflare.com` → diese URL im Browser öffnen. Läuft, solange das Kommando offen ist (Strg+C beendet).

> Optional für saubere Links: vorher in `.env` `DEMO_BASE_URL=https://<zufall>.trycloudflare.com` setzen und `api` neu starten. Für den reinen Durchklick nicht nötig.

---

## Weg B — Benannte Demo unter `demo.tempconnect.de` (empfohlen für Leads)

Voraussetzung: deine Domain liegt bei Cloudflare (wie der Onepager).

1. **Tunnel anlegen:** Cloudflare-Dashboard → **Zero Trust** → **Networks → Tunnels** → **Create a tunnel** → Typ **Cloudflared** → Namen geben (z. B. `tempconnect-demo`).
2. **Token kopieren** (im „Docker"-Tab wird ein `--token eyJ...` gezeigt — nur den Token-Wert).
3. In **`.env`** eintragen:
   ```
   CLOUDFLARE_TUNNEL_TOKEN=eyJ...
   DEMO_BASE_URL=https://demo.tempconnect.de
   ```
4. **Public Hostname** im Tunnel konfigurieren (Reiter „Public Hostname" → Add):
   - Subdomain `demo`, Domain `tempconnect.de`
   - Service: **`HTTP`** → **`frontend:80`**
5. **Starten** (kanonischer Befehl oben). Fertig — `https://demo.tempconnect.de` ist live.

Prüfen:
```bash
docker logs tempconnect_cloudflared --tail 20     # "Registered tunnel connection"
curl -s -o /dev/null -w "%{http_code}\n" https://demo.tempconnect.de/api/health   # 200
```

---

## Sicherheits-Leitplanken (bereits gesetzt)

- **Nur Demo-Daten** (`SEED_DEMO_WORLD=true`), **keine echten Zahlungen** (`PAYMENT_MODE=demo`), **keine Live-Stripe-Keys** in `.env` (geprüft).
- **E-Mails** gehen ausschließlich in **Mailpit** (`http://localhost:8025` lokal einsehbar), nie echt raus.
- **Cloudflare davor** = TLS, CDN, WAF/DDoS-Schutz gratis. DB/Redis bleiben intern (nur nginx ist getunnelt).
- Rate-Limiting aktiv (`RATE_LIMIT_STORE=redis`).
- **Vor öffentlicher Freigabe kurz prüfen:** `.env` enthält keine echten Produktions-Secrets (aktuell erfüllt, da noch vor UG-Gründung).

---

## Pilot-Einladung (Velvet Rope)

1. Tunnel **an**, wenn ein Pilot-Fenster läuft; **aus**, wenn nicht (Exklusivität + Kontrolle).
2. Link/QR aus dem CF-Pages-Onepager zeigt auf `demo.tempconnect.de`; wenn der Tunnel aus ist, Onepager-CTA = „Demo-Termin buchen".
3. Demo-Logins der 3 Perspektiven (Einsatzunternehmen / Personaldienstleister / Steuerung-Admin) an die Leads geben — die stammen aus der Demo-Welt.

---

## Betrieb

```bash
# Status
docker compose -f docker-compose.yml -f docker-compose.demo.yml --profile dev ps

# Stoppen (Tunnel + App aus)
docker compose -f docker-compose.yml -f docker-compose.demo.yml --profile dev down

# Nur Tunnel aus, App weiterlaufen lassen
docker stop tempconnect_cloudflared

# 502 nach Neustart? (bekannter Blip) — einmal nginx neu laden:
docker exec tempconnect_frontend nginx -s reload
```

**Demo zurücksetzen** (frische Demo-Daten): DB-Volume leeren und neu seeden —
`docker compose ... down` → `docker volume rm tempconnect_docker_dbdata` → Startbefehl erneut.
⚠️ Nur für die reine Demo-Instanz; nicht auf einer Instanz mit echten Daten.
