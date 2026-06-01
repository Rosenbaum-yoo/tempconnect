# TempConnect — Security Overview (Enterprise Evidence)

> Verweis auf die technische Security-Übersicht für Enterprise Due Diligence.
> WAVE 15 — Phase 2 — 2026-05-27

---

Das vollständige Security-Dokument befindet sich unter:

**`docs/security/SECURITY_OVERVIEW.md`**

---

## Kurzübersicht: Defense in Depth

```
Internet
  ↓ [1] HTTPS / TLS 1.2+ (nginx terminiert, Let's Encrypt)
  ↓ [2] Rate Limiting (Auth: 5/15min, API: 600/5min)
  ↓ [3] CORS Policy (keine Wildcard in Production)
  ↓ [4] CSRF Token (X-CSRF-Token, alle mutierende Requests)
  ↓ [5] Session (HttpOnly, Secure, SameSite=Strict, bcrypt 12 Runden)
  ↓ [6] RBAC (requirePermission, 12 Rollen, Hierarchie)
  ↓ [7] Org-Boundary (assertOrgOwnership + withOrgContext)
  ↓ [8] RLS (PostgreSQL Row-Level Security, deny-by-default, Migration 116)
  ↓ [9] Audit Log (alle mutierenden Aktionen, org-scoped, unveränderlich)
```

## Checklisten

- **Pilot Go-Live:** `docs/security/SECURITY_CHECKLIST_PILOT.md`
- **Enterprise Due Diligence:** `docs/security/SECURITY_CHECKLIST_ENTERPRISE.md`
- **Tenant-Isolation-Modell:** `docs/security/TENANT_ISOLATION_MODEL.md`
- **Identity & SSO:** `docs/security/IDENTITY_MODEL.md`
- **Secret Rotation:** `docs/security/SECRET_ROTATION.md`
- **Umgebungskonfiguration:** `docs/security/ENVIRONMENT_CONFIGURATION.md`

## Bekannte Lücken

| ID | Beschreibung | Priorität |
|---|---|---|
| ID-01 | MFA-Pflicht für owner/admin ausstehend | HOCH |
| ID-03 | SSO soft-locked (Option B) | HOCH |
| W11-01 | RLS auf ~60 weiteren Tabellen (Migration 117) | MITTEL |
| W11-02 | Rate-Limit-Store Memory (Redis für Multi-Instance) | MITTEL |

---

*Referenz: `docs/security/SECURITY_OVERVIEW.md` — WAVE 11 — 2026-05-26*
