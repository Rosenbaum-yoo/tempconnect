# TempConnect — WAVE 16: Pre-Production Burn-in Runbook

> Verbindliche Checkliste und Durchführungsanleitung für den 7-Tage Burn-in.
> Erst nach bestandenem Burn-in: Marktstart Go.
> WAVE 16 — Phase 2 — 2026-05-27

---

## Überblick

Der Burn-in ist eine ≥7-tägige Stabilisierungsphase in einer Preprod-Umgebung,
die der Production so ähnlich wie möglich ist. Ziel: alle verbleibenden Fehler,
Performance-Probleme und Fehlkonfigurationen finden, bevor echter Traffic kommt.

**Verantwortlich:** Owner + Tech Lead  
**Mindestdauer:** 7 Tage  
**Freigabe:** Owner (nach Bestätigung aller Kriterien)

---

## Phase 1: Preprod aufsetzen (Tag 1)

### 1.1 Umgebung

```bash
# Preprod-Server (empfohlen: identische Hardware wie Production)
# - Hetzner CX21 oder gleichwertig
# - Docker + Docker Compose installiert
# - Separate DB-Instanz (NICHT Production-DB)
# - Eigene .env.preprod (eigene Secrets, eigene Domain)

# Deployment
docker compose -f docker-compose.prod.yml up -d --build

# Migrations prüfen
docker logs tempconnect_migrate
```

### 1.2 Health-Check nach Deployment

```bash
# Alle Endpoints müssen antworten
curl -sf https://<preprod-domain>/api/health | jq .
# → {"ok":true,"service":"api"}

curl -sf https://<preprod-domain>/api/ready | jq .
# → {"ok":true,"ready":true}

curl -sf https://<preprod-domain>/api/live | jq .
# → {"ok":true,"live":true}

curl -sf https://<preprod-domain>/api/service-status | jq .
# → {"status":"ok",...}
```

---

## Phase 2: Smoke Tests (Tag 1-2)

### 2.1 Manueller Pilot-Core-Flow

Mindestens **3× vollständig** durchlaufen:

- [ ] Login (E-Mail + Passwort)
- [ ] Hub — alle Karten sichtbar
- [ ] Neue Requisition anlegen
- [ ] Requisition annehmen / Angebot machen
- [ ] Assignment anlegen
- [ ] Timesheet ausfüllen + einreichen + genehmigen
- [ ] Executive Dashboard aufrufen (KPIs laden)
- [ ] Logout

**Dokumentation:** Jeden Durchlauf mit Datum + Tester + Ergebnis festhalten.

### 2.2 RBAC-Smoke-Test

```bash
# Test 1: Fremde Org — 403
LOGIN_AS_USER_A
curl -H "Cookie: ..." https://<preprod>/api/requisitions/<id-von-org-b>
# → 403 ORG_BOUNDARY_VIOLATION

# Test 2: Fehlende Rolle — 403
LOGIN_AS_MEMBER (keine admin-Rolle)
curl -H "Cookie: ..." -X POST https://<preprod>/api/organizations/<id>/settings
# → 403 PERMISSION_DENIED
```

### 2.3 Security Smoke Test

```bash
# CSRF-Check
curl -X POST https://<preprod>/api/requisitions \
  -H "Content-Type: application/json" \
  -d '{"title":"test"}' \
  # OHNE X-CSRF-Token
# → 403 CSRF_INVALID

# Rate-Limit-Check (Auth)
for i in {1..6}; do
  curl -X POST https://<preprod>/api/auth/login \
    -d '{"email":"x@y.de","password":"wrong"}'
done
# Nach 5 Versuchen: 429 Too Many Requests

# SSO Stub blockiert
curl https://<preprod>/api/sso/callback?stub=1
# → 403 SSO_STUB_NOT_ALLOWED
```

### 2.4 Backup-Smoke-Test

```bash
# Backup erstellen
./scripts/backup.sh

# Manifest prüfen
cat backups/*/manifest.json | jq .

# Restore-Test auf separater DB
./scripts/restore-test.sh backups/<DATUM>
```

---

## Phase 3: 7-Tage-Betrieb (Tag 1–7)

### Tägliche Checks

| Check | Befehl | Ziel |
|---|---|---|
| Health | `curl /api/health` | `{"ok":true}` |
| Fehler-Rate | `docker logs --since 24h \| grep '"level":50' \| wc -l` | 0 |
| 500er | `docker logs --since 24h \| grep '"statusCode":5' \| wc -l` | 0 |
| Backup | `cat backups/last_success_epoch` | < 25h alt |
| Memory | `docker stats tempconnect_api --no-stream` | Stabil (kein Leak) |

### Fehler-Klassifikation

| Fehlertyp | Klassifikation | Verhalten |
|---|---|---|
| 500er in Auth | P0 — Blocker | Sofort stoppen, analysieren |
| 403 bei fremder Org | ✅ Korrekt | Ignorieren |
| 500er in non-kritischen Pfaden | P1 | Analysieren, bis Tag 7 beheben |
| 404 auf existierende Ressource | P1 | Analysieren |
| Langsame Queries (> 2s) | P2 | Log sammeln, nach Marktstart |

---

## Phase 4: Last-/Abuse-Minicheck (Tag 5-6)

```bash
# Einfacher Last-Test (kein echter Load-Test nötig)
# 50 parallele Health-Checks
for i in {1..50}; do
  curl -sf https://<preprod>/api/health &
done
wait

# Rate-Limit-Verhalten unter Last
for i in {1..10}; do
  curl -X POST https://<preprod>/api/auth/login \
    -d '{"email":"test@test.de","password":"wrong"}' &
done
wait
# Mindestens 5 von 10 müssen 429 zurückgeben
```

---

## Phase 5: Abschluss-Checkliste (Tag 7)

### Burn-in Abschluss-Protokoll

| Kriterium | Erfüllt | Nachweis |
|---|---|---|
| ≥ 7 Tage stabiler Betrieb | ☐ | Startdatum: ___ |
| Keine P0-Fehler | ☐ | |
| Keine P1-Fehler | ☐ | |
| Keine wiederkehrenden 500er | ☐ | |
| Keine Auth-Fehler | ☐ | |
| Keine Tenant-Isolations-Fehler | ☐ | |
| Keine Secret-Leaks in Logs | ☐ | `docker logs | grep -i secret\|password\|token` |
| Backup erstellt und verifiziert | ☐ | Backup-Datum: ___ |
| Restore-Test bestanden | ☐ | Test-Datum: ___ |
| Pilot-Core-Flow 3× durchlaufen | ☐ | Tester: ___ |
| RBAC-Smoke-Test bestanden | ☐ | |
| Security-Smoke-Test bestanden | ☐ | |
| Rate-Limit-Test bestanden | ☐ | |
| Memory stabil (kein Leak) | ☐ | |
| Metrics-Baseline dokumentiert | ☐ | |

---

## Marktstart-Freigabe

**Nur wenn alle Kriterien erfüllt:**

- **Burn-in Start:** _______________
- **Burn-in Ende:** _______________
- **Gesamtdauer:** ___ Tage
- **Durchgeführt von:** _______________
- **Owner-Freigabe Marktstart:** _______________
- **Datum Marktstart:** _______________

---

*WAVE 16 — Phase 2 — 2026-05-27*
*Zuständig: Operations (Claude), Freigabe: Owner*
