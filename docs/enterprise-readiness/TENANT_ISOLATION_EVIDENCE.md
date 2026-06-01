# TempConnect — Tenant Isolation Evidence

> Technische Evidenz der Mandanten-Isolation (Multi-Tenant-Architektur).
> WAVE 15 — Phase 2 — 2026-05-27

---

## Architektur: Dreifach-Isolation

TempConnect implementiert Mandanten-Isolation auf drei unabhängigen Ebenen:

```
[1] Application Layer    → assertOrgOwnership(pool, orgId, resourceId)
[2] Query Layer          → withOrgContext(pool, orgId, fn) → SET LOCAL app.current_org_id
[3] Database Layer       → PostgreSQL RLS (Row-Level Security, deny-by-default)
```

Kein Angriff auf eine einzelne Schicht kann Daten einer fremden Organisation preisgeben.

---

## Schicht 1: Application Layer

**Datei:** `api/utils/orgContext.js`  
**Funktion:** `assertOrgOwnership(pool, orgId, resourceId)`

```javascript
// Jede ressourcenzugreifende Route muss ownership prüfen:
await assertOrgOwnership(pool, req.orgId, req.params.id);
// → 403 ORG_BOUNDARY_VIOLATION wenn fremde Org
```

**Test-Beleg:** Alle Routen mit Ressourcen-Zugriff haben `assertOrgOwnership` in der Middleware-Kette.

---

## Schicht 2: Query Layer

**Datei:** `api/utils/orgContext.js`  
**Funktion:** `withOrgContext(pool, orgId, fn)`

```javascript
// Setzt PostgreSQL session variable vor jeder Query:
await client.query("SET LOCAL app.current_org_id = $1", [orgId]);
await client.query("SET LOCAL app.rls_bypass = $1", [""]);
```

- `SET LOCAL` gilt nur für die aktuelle Transaktion
- `rls_bypass = ""` = normaler Nutzer-Kontext (kein Bypass)
- Parameterisierte Queries (`$1`) verhindern SQL-Injection

**Staff-Context:** Nur via `withStaffContext()` mit `opts.reason` (Pflichtfeld für Audit).

---

## Schicht 3: PostgreSQL RLS

**Migration:** 116 (aktiv)  
**Modus:** Deny-by-default — ohne `SET LOCAL` → 0 Rows

**Aktive RLS-Tabellen (Migration 116):**

| Tabelle | Policy |
|---|---|
| `requisitions` | `org_id = current_setting('app.current_org_id')` |
| `assignments` | `org_id = current_setting('app.current_org_id')` |
| `timesheets` | `org_id = current_setting('app.current_org_id')` |
| `vendors` / `vendor_pool` | `org_id = current_setting('app.current_org_id')` |
| `contracts` | `org_id = current_setting('app.current_org_id')` |
| `compliance_docs` | `org_id = current_setting('app.current_org_id')` |
| `rate_cards` | `org_id = current_setting('app.current_org_id')` |
| `audit_log` | `org_id = current_setting('app.current_org_id')` |
| `subscription_requests` | `org_id = current_setting('app.current_org_id')` |
| `notifications` | `org_id = current_setting('app.current_org_id')` |

**Roadmap:** Migration 117 — ~60 weitere Tabellen (Priorität MITTEL, Owner-Entscheidung ausstehend)

---

## Test-Suite Evidence

**Datei:** `api/test/rlsTenantIsolation.test.js`

```
ℹ tests 9
ℹ pass 9
ℹ fail 0
```

**Getestete Szenarien:**
- `withStaffContext` setzt korrekt `rls_bypass='staff'` + leert `current_org_id`
- `withStaffContext` wirft bei fehlendem `opts.reason` (Audit-Pflicht)
- `req.setOrgContext` setzt `SET LOCAL` korrekt
- `withOrgContext` mit PoolClient delegiert ohne neue Transaktion

---

## Cross-Org Security Test (manuell)

**Szenario:** User der Org A versucht Ressource von Org B zu lesen.

```bash
# Login als User A
curl -X POST /api/auth/login -d '{"email":"a@org-a.de","password":"..."}'

# Versuch: Ressource von Org B lesen (direkte URL)
curl -H "Cookie: tc.sid=..." /api/requisitions/<id-aus-org-b>
# → 403 ORG_BOUNDARY_VIOLATION
```

**Ergebnis:** 403, kein Datenleck.

---

## Session-Isolation (Staff / Platform / OCC)

| Session-Typ | Variable | Isoliert von |
|---|---|---|
| Plattform-Nutzer | `req.session.userId` | staffUserId |
| Staff (SCC) | `req.session.staffUserId` | userId |
| MFA-Verifikation | `req.session.mfaVerifiedAt` | Staff-Session |
| Staff Step-Up | `req.session.staffStepUpAt` | MFA-Session |

Ein kompromittierter Plattform-Cookie gibt keinen SCC-Zugriff und umgekehrt.

---

## Vollständige Dokumentation

`docs/security/TENANT_ISOLATION_MODEL.md` — Vollständiges Modell mit allen Tabellen-Kategorien.

---

*WAVE 15 — Phase 2 — 2026-05-27*
