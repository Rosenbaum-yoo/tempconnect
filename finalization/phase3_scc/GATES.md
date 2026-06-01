# SCC Go-Live-Gates

> Fünf SCC-Gates (A–E) für Track A + ein H8-Gate für Track B. Alle Gates müssen grün sein, bevor SCC als produktiv freigegeben wird.

---

## Gate A — Access / Security

**GO nur wenn:**
- [ ] Staff-Allowlist (`tempconnect_staff`) aktiv
- [ ] `STAFF_SESSION_SECRET` in Production verpflichtend (kein Fallback)
- [ ] Staff Login Rate Limit aktiv (`/staff/api/auth/login`)
- [ ] Staff MFA aktiv ODER bewusst als Marktstart-Blocker markiert
- [ ] Step-up echte Reauth (Passwort ODER MFA-Code) — nicht nur `confirmed=true`
- [ ] Staff-Mutations haben Origin/CSRF-Schutz
- [ ] Failed/Successful Login Audit vorhanden
- [ ] Cookie-Härtung: `httpOnly`, `secure`, `sameSite: strict`, `path: /staff`
- [ ] Step-up TTL nach Risk-Level (medium 15min / high 10min / critical 5min)

**Verifikation:**
```bash
cd api && npm run test:security -- staff
```

---

## Gate B — Build / Test

**GO nur wenn:**
- [ ] `frontend npm run build:scc` grün
- [ ] SCC HTMLHint grün
- [ ] SCC TypeScript grün
- [ ] SCC ESLint grün (für `frontend/src/staff/**/*.{ts,tsx}`)
- [ ] `api npm run test:scc` grün
- [ ] Playwright SCC Smoke Test grün
- [ ] CI blockt SCC-Regressionen

**Verifikation:**
```bash
cd frontend && npm ci && npm run build:scc
cd api && npm run test:scc
npx playwright test scc-smoke
```

---

## Gate C — Operations

**GO nur wenn:**
- [ ] Runbooks sicher begrenzt (Whitelist Step Types: `check`, `hetzner`, `feature_flag`, `notify`, `wait`)
- [ ] Hetzner Production nicht im irreführenden Stub-Erfolg
- [ ] Infra Actions risk-basiert geschützt (low/medium/high/critical)
- [ ] Read-only Mode getestet
- [ ] Runbook-Historie sichtbar
- [ ] Keine Delete/Rebuild/SSH/Shell-Actions im Code
- [ ] Critical Actions: 2-Person-Approval oder deaktiviert

---

## Gate D — Commercial

**GO nur wenn:**
- [ ] Commercial Inbox vollständig arbeitsfähig
- [ ] Individuell/Enterprise Requests bearbeitbar (Status, SLA, Owner)
- [ ] Planwechsel auditierbar
- [ ] Dokumentenerzeugung funktioniert (versioniert, idempotent)
- [ ] Kündigung/Upgrade/Downgrade ehrlich abgebildet
- [ ] Plan-Aktivierung nur nach `accepted` mit Reason + Audit + Dokument
- [ ] Kein Fake-Billing

---

## Gate E — Audit / Evidence

**GO nur wenn:**
- [ ] Jede mutierende Aktion erzeugt Audit-Eintrag
- [ ] Decision Log nutzbar
- [ ] High/Critical Aktionen filterbar
- [ ] Staff Access Review dokumentiert
- [ ] SCC Evidence Pack vorhanden:
  - `docs/scc/SCC_AUDIT_AND_DECISION_MODEL.md`
  - `docs/scc/SCC_PRODUCT_SCOPE.md`
  - `docs/scc/SCC_API_SURFACE.md`
  - `docs/scc/SCC_MODULE_OWNERSHIP.md`
- [ ] Failed Actions sichtbar
- [ ] Audit Retention dokumentiert

---

## Gate H8 — SCC Hetzner Final (Track B)

**GO nur wenn (zusätzlich zu Gates A–E):**
- [ ] `build:scc` grün
- [ ] API Staff/Hetzner Tests grün
- [ ] **Keine Production-Stub-Erfolge** (Mutationen ohne Token → `503 HETZNER_NOT_CONFIGURED`)
- [ ] Critical Actions brauchen Two-Person-Approval ODER sind deaktiviert
- [ ] Keine Delete/Rebuild/SSH/Shell-Actions
- [ ] Resource Binding aktiv (nur Labels `project=tempconnect, env=prod`)
- [ ] Runbook-Versioning aktiv
- [ ] Work Orders nachvollziehbar (Status Lifecycle, Audit)
- [ ] Manuelle Hetzner-Secrets korrekt gesetzt (Owner-bestätigt — siehe `MANUAL_TASKS.md`)
- [ ] `.claude/` ist im Release-Verifier ausgeschlossen
- [ ] Hetzner Action Matrix dokumentiert in `docs/staff/SCC_INFRA_ACTION_MATRIX.md`

**Verifikationsbefehle:**
```bash
cd api && npm run test:staff
cd api && npm run test:security
cd frontend && npm run build:scc
```

---

## Gate-Pass-Workflow

Pro Gate:

1. **Check ausführen** (Befehle ODER manueller Check)
2. **Ergebnis dokumentieren** in `docs/releases/SCC_GATE_<X>_RESULT.md`
3. **Bei GO:** Commit-Hash + Datum + Verantwortlicher festhalten
4. **Bei NO-GO:** Blocker in `docs/scc/SCC_OPEN_BLOCKERS.md` mit Owner, Priorität, ETA

**Kein Gate wird "fast grün" durchgewunken.**

---

## SCC-Marktstart-Entscheidung

**SCC = produktiv freigegeben** nur wenn:
- Gate A grün ✓
- Gate B grün ✓
- Gate C grün ✓
- Gate D grün ✓
- Gate E grün ✓
- Gate H8 grün ✓

**Dokumentiert in:** `docs/releases/SCC_GO_LIVE_DECISION.md` mit:
- Datum, Commit-Hash, Release-Version
- Pro Gate: Status, Verantwortlicher, Prüfdatum
- Bekannte Restrisiken (transparent)
- Unterschrift Owner

---

## Verknüpfung mit Phase-2-Gates

SCC-Gates sind **zusätzlich** zu Phase-2-Gates A-F. Beispiele:

| Phase-2-Gate | SCC-Beitrag |
|---|---|
| Gate B (Security) | SCC Gate A erfüllt Staff-Identity-Anforderungen |
| Gate D (Product) | SCC Gate D erfüllt Commercial-Workflow-Anforderungen |
| Gate E (Operations) | SCC Gate C + H8 erfüllen Operations-Control-Anforderungen |
| Gate F (Commercial/Legal) | SCC Gate D liefert Staff-Tools für Custom-Plan-Aktivierung |

**Marktstart-GO** verlangt: Phase-2 Gates A-F grün UND SCC Gates A-E + H8 grün UND Phase-2 WAVE 16 Burn-in ≥ 7 Tage stabil.
