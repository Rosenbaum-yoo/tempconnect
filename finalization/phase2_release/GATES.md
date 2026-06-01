# Marktstart-Gates A–F

> Sechs harte Gates. Jedes Gate muss **vollständig** grün sein, sonst MARKTSTART = NO GO.

---

## Gate A — Technical Release Gate

**GO nur wenn ALLE Befehle grün:**

```bash
# API
cd api
npm run lint
npm run build
npm run test:ci
npm audit --omit=dev    # keine high/critical
cd ..

# Frontend
cd frontend
npm run typecheck
npm run lint
npm run lint:html
npm run build
npm run build:all
cd ..

# Release
./scripts/release-package.sh
./scripts/release-verify.sh dist/tempconnect-<version>.zip
```

**Checkliste:**
- [ ] API Lint grün
- [ ] API Build grün
- [ ] API `test:ci` grün
- [ ] API audit prod ohne high/critical
- [ ] Frontend typecheck grün
- [ ] Frontend lint grün
- [ ] HTMLHint grün
- [ ] Frontend `build:all` grün
- [ ] Release verify grün

---

## Gate B — Security Gate

**GO nur wenn:**
- [ ] Alle echten Secrets rotiert (Owner-bestätigt)
- [ ] Keine Secrets im Release (Release-Verifier grün)
- [ ] CORS production-safe (kein Wildcard für sensitive Routen)
- [ ] Security Headers aktiv (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, CSP)
- [ ] Rate Limits aktiv: Login, Password Reset, Public API, API Keys, Admin/Staff
- [ ] API Keys sicher (Hashing, Prefix, Scopes, Revocation, Last Used, Audit)
- [ ] Audit Events vorhanden (Login, MFA, Plan Change, Permission Change, Data Export)
- [ ] MFA für privilegierte Rollen aktiv (Admin, Owner, Staff)

---

## Gate C — Tenant Gate

**GO nur wenn:**
- [ ] Cross-Tenant Tests grün (`npm run test:tenant`)
- [ ] RLS deny-by-default
- [ ] Fehlender Tenant-Kontext blockiert (kein permissives Fallback)
- [ ] Staff-/Owner-Ausnahmen explizit + auditiert
- [ ] Background Jobs tenant-sicher
- [ ] `docs/security/TENANT_ISOLATION_MODEL.md` vorhanden

**Beweis:** Test-Output von `npm run test:tenant` als Artefakt anhängen.

---

## Gate D — Product Gate

**GO nur wenn:**
- [ ] Kompletter Pilot-Core-Flow funktioniert (manuell durchgeklickt + `npm run test:pilot` grün)
- [ ] Dashboard KPIs echt (jede mit Quelle, Drilldown, Test)
- [ ] Rollen-/Plan-Gates greifen (Frontend + Backend abgeglichen)
- [ ] Keine kaputten Pilot-/Enterprise-Seiten
- [ ] Keine sichtbaren Phantom-Features
- [ ] SSO entweder produktiv ODER vollständig soft-locked (kein Stub)

**Beweis:** Pilot-Flow-Screenshots in `docs/pilot/PILOT_CORE_FLOW.md`.

---

## Gate E — Operations Gate

**GO nur wenn:**
- [ ] `/health`, `/ready`, `/live` funktionieren
- [ ] Monitoring aktiv (Logs strukturiert, Metrics, Error Tracking)
- [ ] Backup funktioniert (Script + automatisierter Lauf)
- [ ] **Restore getestet** (nicht nur dokumentiert — durchgeführt)
- [ ] Incident Runbook vorhanden
- [ ] Rollback Runbook vorhanden
- [ ] Production Compose enthält keine Dev-Mounts

**Beweis:** Restore-Drill-Protokoll in `docs/operations/RESTORE_DRILL_<DATUM>.md`.

---

## Gate F — Commercial / Legal Gate

**GO nur wenn:**
- [ ] Preise final (Owner-Entscheidung)
- [ ] Pläne final (5 kanonische Pläne: DEMO, BASIS, PLUS, PRO, INDIVIDUELL)
- [ ] AGB / Datenschutz / AVV / TOM rechtlich geprüft (Owner-Aufgabe)
- [ ] Pilotvertrag vorbereitet (Owner-Aufgabe)
- [ ] Supportprozess definiert (Erreichbarkeit, Eskalation, SLAs)
- [ ] Enterprise-Versprechen begrenzt und wahr (keine SLA 99,9 % ohne Deckung)

**Beweis:** Liste der finalen Rechtsdokumente in `docs/legal/LEGAL_INVENTORY.md`.

---

## Gate-Pass-Workflow

Pro Gate:

1. **Check ausführen** (Befehle oder Manual-Check)
2. **Ergebnis dokumentieren** in passendem `docs/releases/`-Eintrag
3. **Bei GO:** Hash + Datum + Verantwortlicher festhalten
4. **Bei NO-GO:** Blocker in `docs/releases/OPEN_BLOCKERS.md` mit Owner, Priorität, ETA

**Kein Gate wird "fast grün" durchgewunken.** Ein offener Punkt = NO GO für dieses Gate.

---

## Finale Marktstart-Entscheidung

**MARKTSTART = GO** nur wenn:
- Gate A grün ✓
- Gate B grün ✓
- Gate C grün ✓
- Gate D grün ✓
- Gate E grün ✓
- Gate F grün ✓
- Burn-in (WAVE 16) ≥ 7 Tage stabil ✓

**Dokumentiert in:** `docs/releases/MARKET_START_GO_LIVE_DECISION.md` mit:
- Datum, Commit-Hash, Release-Version
- Pro Gate: Status, Verantwortlicher, Prüfdatum
- Bekannte Restrisiken (transparent)
- Unterschrift Owner
