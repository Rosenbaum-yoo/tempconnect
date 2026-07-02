# H — Architektur-Roadmap: Cloudflare-Edge + Hetzner-Origin

> **Leitsatz:** Cloudflare ist die **Hülle** (Edge, Sicherheit, Auslieferung), Hetzner ist der **Motor** (App + Daten), die Demo ist dieselbe Hülle mit einem austauschbaren Motor. **Ein einziges Deploy-Artefakt** (`docker-compose`) für Demo und Produktion — nur Env und Origin unterscheiden sich.

Dieses Dokument ist die verbindliche Reihenfolge für TempConnect **und** die wiederverwendbare Blaupause für alle Folgeprojekte (→ Holding, `F_HOLDING-STRUKTUR-ENTSCHEIDUNG.md`).

---

## Kernprinzipien (jede Entscheidung daran messen)

1. **Kein Vendor-Lock-in.** Die App bleibt portables Docker (Node + Postgres + Redis + nginx) und läuft überall. Cloudflare davor, nicht darin (kein Workers-Rewrite).
2. **Ein Artefakt, viele Umgebungen.** Demo und Prod nutzen dieselben Images/Compose-Bausteine; Unterschied nur über Env-Dateien + Origin. Keine Divergenz, kein Wegwerf-Aufbau.
3. **Origin nie offen.** Zugriff ausschließlich über Cloudflare Tunnel (ausgehend, kein offener Port, keine feste IP) — für Demo **und** Prod identisch.
4. **Härtung & Backup ab Tag 1**, nicht als Retrofit (Access vor Admin-Flächen, R2-Backups, Secrets rotiert, Monitoring).
5. **Skalieren nur auf Signal.** Größere Ressourcen erst, wenn Metriken es fordern (10 → 300 → 3000). Kein Vorbau.
6. **Alles wiederverwendbar dokumentiert.** Was hier für TempConnect steht, ist die Vorlage für Projekt #2…#20.

---

## Namens- & Subdomain-Konvention (die Blaupause)

Gilt pro Projekt-Domain identisch (`tempconnect.de`, dann `<projekt>.de`):

| Host | Zweck | Läuft auf | Auslieferung |
|---|---|---|---|
| `@` / `www.` | Marketing-Onepager, Pre-Register | Cloudflare **Pages** (statisch) | Edge |
| `demo.` | Velvet-Rope-Demo (Demo-Daten) | Origin: **PC** (jetzt) → optional Hetzner | CF Tunnel |
| `app.` | Produktiv-Plattform (echte Kunden) | Origin: **Hetzner** | CF Tunnel |
| `status.` *(optional)* | Status/Uptime-Seite | Cloudflare / extern | Edge |
| `docs.` *(optional)* | Kunden-/Partner-Doku | Pages | Edge |

**Admin-Flächen** (OCC `/owner-control`, Staff `/staff`, SOC `/support-ops`) laufen unter `app.` **hinter Cloudflare Access** (Zero Trust) — nie öffentlich.

---

## Die 7 Phasen (in Reihenfolge)

### ① Fundament — Domain & Schema  ·  *jetzt · Voraussetzung für alles*
- [ ] `tempconnect.de` liegt mit DNS bei Cloudflare (Nameserver auf CF).
- [ ] Subdomain-Schema (oben) angelegt/reserviert.
- **Zukunftssicher:** eine Konvention, die jedes Folgeprojekt 1:1 übernimmt.

### ② Demo scharf schalten — Velvet Rope  ·  *jetzt · vor UG*
- [ ] Cloudflare-Tunnel `tempconnect-demo` anlegen, Token in `.env` (`CLOUDFLARE_TUNNEL_TOKEN`).
- [ ] Public Hostname `demo.tempconnect.de` → Service `HTTP: frontend:80`.
- [ ] Start: `docker compose -f docker-compose.yml -f docker-compose.demo.yml --profile dev up -d --build`.
- [ ] Onepager-Button „Live-Demo" → `demo.tempconnect.de`.
- **Zukunftssicher:** derselbe Tunnel-/Compose-Mechanismus wie später Prod. → Runbook `G_DEMO-CLOUDFLARE-TUNNEL.md`.
- **Wert:** die 40 Messe-Leads können sofort spielen; Retention testen (siehe Marktanalyse).

### ③ Edge-Härtung  ·  *parallel · reine Config*
- [ ] **Cloudflare Access** (Zero Trust) vor `/owner-control`, `/staff`, `/support-ops`.
- [ ] **Turnstile** auf Pre-Register/Register (Anti-Bot).
- [ ] WAF-Grundregeln + Rate-Limit am Edge.
- **Zukunftssicher:** wiederverwendbare Edge-Policies — einmal definiert, für jedes Projekt gültig.

### ④ UG-Gründung  ·  *der Gate — extern (Notartermin)*
- [ ] Gründung vollzogen → schaltet echte Stripe-Keys, Produktions-Secrets, Rechtstexte frei.
- **Verweise:** `E_NOTARTERMIN-CHECKLISTE.md`, `B_rechtstexte/` (Impressum/DSGVO/AGB), `F_HOLDING-STRUKTUR-ENTSCHEIDUNG.md`.
- **Kein technischer Blocker** — nur der geschäftliche Schlüssel für ⑤.

### ⑤ Produktiv-Motor auf Hetzner  ·  *nach UG*
- [ ] Hetzner provisionieren (`C_HETZNER-DEPLOY-RUNBOOK.md`).
- [ ] Secrets erzeugt & rotiert (`D_env.production.template`): `SESSION_SECRET`, `JWT_SECRET`, `INTERNAL_CRON_SECRET`, `ADMIN_SECRET`, echte `STRIPE_*`.
- [ ] Tunnel Hetzner → `app.tempconnect.de` (keine offenen Ports).
- [ ] **R2-Backups** (verschlüsselt, off-site) + **Restore-Drill** bestanden.
- [ ] Sentry aktiv + Uptime-Monitor.
- [ ] Go-Live-Gate-Checkliste abgehakt.
- **Zukunftssicher:** Origin getunnelt & austauschbar; Backup/Monitoring von Tag 1.

### ⑥ Pilot → Paid  ·  *Velvet Rope endet*
- [ ] Piloten von Demo/Gratis auf echtes Billing umstellen.
- [ ] Referral aktiv (bis zu 3 Gratis-Monate je geworbenem Kunden).
- [ ] **Churn/Retention & NRR** messen (die wertkritische Kennzahl der Analyse).

### ⑦ Skalierung & Blaupause ernten  ·  *10 → 300, nur auf Signal*
- [ ] Stack als Template (CF-Config + Hetzner-Deploy + Compose) für Projekt #2…#20.
- [ ] Scale-Hebel (größerer Hetzner / managed Postgres / Read-Replica / Queue-Worker) **erst wenn Metriken es fordern**.
- [ ] Marken/Projekte in Holding-Struktur überführen (`F_HOLDING-…`).

---

## Gate-Übersicht

```
① Domain/Schema → ② Demo live → ③ Edge-Härtung → ④ UG → ⑤ Hetzner-Prod → ⑥ Pilot→Paid → ⑦ Skalieren
        └────────── jetzt möglich (pre-UG) ──────────┘   └──────── nach UG ────────┘
```

| Phase | Gate | Kann jetzt? |
|---|---|---|
| ①–③ | keiner (keine echten Secrets/Zahlungen) | ✅ ja |
| ④ | UG-Gründung | ⏳ Notartermin |
| ⑤–⑦ | nach UG | 🔒 gated |

---

## Blaupause für Folgeprojekte (Projekt #2…#20)

Wiederverwendbar **ohne Neubau**:
1. Neue Domain → Nameserver auf Cloudflare, Subdomain-Schema übernehmen.
2. Repo aus dem TempConnect-Muster ableiten (portables Docker, `docker-compose` + `.demo`-Overlay).
3. Cloudflare-Bausteine kopieren: Pages-Onepager, Tunnel (Demo + Prod), Access, Turnstile, R2-Backups.
4. Hetzner-Deploy nach `C_HETZNER`-Muster.
5. Rechts-/Firmendaten pro Projekt-Marke unter die Holding hängen (`F_HOLDING`).

→ Der Aufwand liegt einmalig bei TempConnect; danach ist jedes Projekt Konfiguration statt Konstruktion.

---

## Änderungslog
- 2026-07-02 — Erstfassung. Architektur bestätigt (CF-Edge + Hetzner-Origin + Demo), Reihenfolge ①–⑦ verankert. Ergänzt `G_DEMO-CLOUDFLARE-TUNNEL.md` (Demo-Setup live).
