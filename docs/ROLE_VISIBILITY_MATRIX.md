# ROLE_VISIBILITY_MATRIX — Rollen- und Sichtbarkeitsmatrix
> Aktualisiert: 2026-05-24 | WAVE_03 vollständig
> Kanonische Quelle: `api/config/visibilityMatrix.js` + `frontend/public/js/hubVisibility.js`

---

## 1. Rollen-Hierarchie

### Unternehmens-Seite (org_type: company)
| Rolle | Kurzname | Beschreibung |
|---|---|---|
| owner | owner | Org-Eigentümer, voller Zugriff |
| admin | admin | Org-Administrator |
| hiring_manager | hiring_mgr | Bedarfsverantwortlicher |
| recruiter | recruiter | Recruiter |
| dispatcher | dispatcher | Disponent |
| supplier_manager | supplier_mgr | Lieferantenmanager |
| member | member | Standardmitglied |
| viewer | viewer | Nur-Lesen |

### Agentur-Seite (org_type: agency)
| Rolle | Kurzname | Beschreibung |
|---|---|---|
| owner | owner | Agentur-Eigentümer |
| admin | admin | Agentur-Administrator |
| supplier_user | supplier_user | Agentur-Mitarbeiter |
| dispatcher | dispatcher | Disponent |
| recruiter | recruiter | Recruiter |

### Worker (org_type: worker)
| Rolle | Beschreibung |
|---|---|
| — | Keine Rollen-Untertypen; Zugriff nur auf Worker-Portal (`/worker/*`) |

### Platform-intern
| Rolle | Surface | Guard |
|---|---|---|
| staff | Staff Control Center `/staff/api/*` | `staffControlAccess.js` → `requireStaff` |
| owner_control | Owner Control Center `/owner-control/` | `requireOwnerControlAccess.js` |
| support | Support Operations Center `/support-ops/` | `supportAccess.js` → `requireSupportAccess` |

---

## 2. Middleware/Guard-Stack (vollständig dokumentiert)

### Schicht-Reihenfolge (Request läuft durch alle aktiven Schichten)

```
1. requireAuth           → 401 NOT_AUTHENTICATED        (auth.js)
2. orgContextMiddleware  → setzt req.orgId, req.orgRole  (orgContext.js)
3. csrfProtect           → 403 CSRF_INVALID              (auth.js)
4. [Surface-Guard]       → spezifisch je Route-Gruppe    (siehe unten)
5. [RBAC-Guard]          → 403 PERMISSION_DENIED         (rbac.js)
6. [Entitlement-Guard]   → 403 FEATURE_NOT_ENABLED etc.  (entitlementGuard.js)
7. [Boundary-Guard]      → 404/403 LOCATION_NOT_FOUND    (orgBoundary.js)
```

### Verfügbare Guards

| Guard | Datei | Code (Fehler) | HTTP | Beschreibung |
|---|---|---|---|---|
| `requireAuth` | `middleware/auth.js` | `NOT_AUTHENTICATED` | 401 | Session.userId fehlt |
| `requireOrgContext` | `middleware/rbac.js` | `NO_ORG_CONTEXT` | 403 | req.orgId nicht gesetzt |
| `requirePermission(perm)` | `middleware/rbac.js` | `PERMISSION_DENIED` | 403 | RBAC-Permission fehlt |
| `requireRole(roles[])` | `middleware/rbac.js` | `ROLE_DENIED` | 403 | Rolle nicht erlaubt |
| `requireActiveSubscription` | `middleware/entitlementGuard.js` | `SUBSCRIPTION_INACTIVE` | 403 | Abo nicht aktiv |
| `requireOrgFeature(key)` | `middleware/entitlementGuard.js` | `FEATURE_NOT_ENABLED` | 403 | Feature nicht im Plan |
| `requireOrgLimit(metric)` | `middleware/entitlementGuard.js` | `PLAN_LIMIT_REACHED` | 429 | Usage-Limit überschritten |
| `requireSameOrg(fn)` | `middleware/entitlementGuard.js` | `FORBIDDEN_CROSS_ORG` | 403 | Cross-Org-Schreibversuch |
| `requireLocationContext` | `middleware/entitlementGuard.js` | `NO_LOCATION_CONTEXT` | 403 | Location-Kontext fehlt |
| `requireCompanyOrg` | `middleware/orgAccess.js` | `BUYER_ORG_REQUIRED` | 403 | Nur Company-Orgs erlaubt |
| `requireLocationBelongsToOrg` | `middleware/orgBoundary.js` | `LOCATION_NOT_FOUND` | 404 | Location gehört nicht zur Org |
| `requireDepartmentBelongsToOrg` | `middleware/orgBoundary.js` | `DEPARTMENT_NOT_FOUND` | 404 | Dept gehört nicht zur Org |
| `requireWorkerRole` | `routes/workerPortal.js` (inline) | `WORKER_ROLE_REQUIRED` | 403 | Kein Worker-Role in Session |
| `requireStaff` | `middleware/staffControlAccess.js` | `SCC_ACCESS_DENIED` | 401/403 | Kein SCC-Zugang |
| `requireOwnerControlAccess` | `middleware/requireOwnerControlAccess.js` | `OCC_ACCESS_DENIED` | 403 | Kein OCC-Zugang |
| `requireSupportAccess` | `middleware/supportAccess.js` | `SUPPORT_ACCESS_DENIED` | 403 | Kein Support-Ops-Zugang |
| `featureGate(key)` | `middleware/featureGate.js` | `FEATURE_GATE_BLOCKED` | 403 | Feature-Gate aktiv |
| `requireInternalAccess` | `middleware/internalAccess.js` | `INTERNAL_ONLY` | 403 | Nur intern erreichbar |

---

## 3. Surface-Trennung (verifiziert WAVE_03)

| Surface | Mount-Pfad | Guard | Status |
|---|---|---|---|
| **Owner Control Center (OCC)** | `/owner-control/` | `requireOwnerControlAccess` | ✅ Korrekt isoliert |
| **Staff Control Center (SCC)** | `/staff/api/*` | `staffControlAccess` → `requireStaff` → `requireStepUp` (mutierende Aktionen) | ✅ Korrekt isoliert |
| **Support Operations Center (SOC)** | `/support-ops/` | `requireSupportAccess` | ✅ Korrekt isoliert |
| **Worker Portal** | `/worker/*` (Routen), HTML `/public/einsatzportal-*.html` | `requireAuth` + `requireWorkerRole` (session.userRole === "worker") | ✅ Korrekt isoliert |
| **Organization Platform** | `/api/*` | `requireAuth` + `orgContextMiddleware` + RBAC | ✅ Standard-Guards |
| **Public/Unauthenticated** | `/public/catalog`, `/api/health`, `/analytics/track-public` | Rate-Limit, kein Auth | ✅ Korrekt offen |

**Kein Cross-Surface-Leak gefunden.** Admin-Panel, Org-Routes, Worker-Portal, SCC, OCC und Support haben jeweils eigene, nicht überschneidende Guards.

---

## 4. Hub-Card-Sichtbarkeit (implementiert, 27/27 Tests grün)

Quelle: `frontend/public/js/hubVisibility.js`

| Hub-Surface | company owner/admin | company hiring_mgr | company recruiter | company viewer | agency admin | agency user | worker |
|---|---|---|---|---|---|---|---|
| marketplace | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| requisitions | ✅ | ✅ | ✅ | ✅ | ❌ hidden_wrong_side | ❌ | ❌ |
| deals | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| assignments | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| my_company | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| activity | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| bounties | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| trust_center | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| vendor_pool | ✅ | ❌ hidden_role | ❌ hidden_role | ❌ hidden_role | ❌ | ❌ | ❌ |
| executive_dashboard | ✅ | ❌ hidden_role | ❌ hidden_role | ❌ hidden_role | ❌ | ❌ | ❌ |
| admin_panel | ✅ | ❌ hidden_role | ❌ hidden_role | ❌ hidden_role | ✅(admin) | ❌ | ❌ |
| location_management | ✅ | ❌ | ❌ | ❌ | ✅(admin) | ❌ | ❌ |

---

## 5. Navigations-Sichtbarkeit

Quelle: `frontend/public/js/hubVisibility.js` NAV_RULES

| Nav-Key | company | agency | worker |
|---|---|---|---|
| uebersicht | ✅ | ✅ | ❌ |
| marktplatz | ✅ | ✅ | ❌ |
| bedarfe | ✅ | ❌ (hidden) | ❌ |
| deals_einsaetze | ✅ | ✅ | ❌ |
| steuerung | ✅ | ❌ (fallback) | ❌ |
| help | ✅ | ✅ | ✅ |

---

## 6. Plan-Gates (Feature-Sichtbarkeit)

Quelle: `api/config/planFeatures.js`

| Feature | DEMO | BASIS | PLUS | PRO | INDIVIDUELL |
|---|---|---|---|---|---|
| marketplace | ✅ | ✅ | ✅ | ✅ | ✅ |
| advanced_matching | ❌ | ❌ | ❌ | ✅ | ✅ |
| assignments | ❌ | ❌ | ❌ | ❌ | ✅ |
| departments | ❌ | ❌ | ❌ | ❌ | ✅ |
| compliance | ❌ | ❌ | ❌ | ❌ | ✅ |
| contracts | ❌ | ❌ | ❌ | ❌ | ✅ |
| enterprise_analytics | ❌ | ❌ | ❌ | ❌ | ✅ |
| timesheets | ❌ | ❌ | ✅ | ✅ | ✅ |
| emergency_staffing | ❌ | ❌ | ✅ | ✅ | ✅ |
| rate_card_management | ❌ | ❌ | ❌ | ✅ | ✅ |
| spend_analytics | ❌ | ❌ | ❌ | ✅ | ✅ |
| integrations | ❌ | ❌ | ❌ | ❌ | ✅ |

**Hinweis:** `FEATURE_GATE_BYPASS=false` ist jetzt der Default in `.env.example` (P1.3 ERLEDIGT WAVE_02).

---

## 7. Standardisierte Fehlercodes (WAVE_03 Status)

### Aktive Fehler-Codes (verifiziert in Code)

| Code | HTTP | Guard | Format | Beschreibung |
|---|---|---|---|---|
| `NOT_AUTHENTICATED` | 401 | `requireAuth`, `requireWorkerRole` | `{error: "STRING"}` | Session fehlt |
| `CSRF_INVALID` | 403 | `csrfProtect` | `{error: "STRING", message}` | CSRF-Token ungültig |
| `NO_ORG_CONTEXT` | 403 | `requireOrgContext` | `{error: "STRING", message}` | Kein Org-Kontext |
| `PERMISSION_DENIED` | 403 | `requirePermission` | `{error: "STRING", message}` | RBAC-Check fehlgeschlagen |
| `ROLE_DENIED` | 403 | `requireRole` | `{error: "STRING", message}` | Rolle nicht erlaubt |
| `NO_ORG_MEMBERSHIP` | 403 | `requirePermission`, `requireRole` | `{error: "STRING", message}` | Kein Org-Mitglied |
| `ORG_BOUNDARY_VIOLATION` | 403 | `routes/organizations.js` (inline) | `{error: "STRING"}` | Cross-Org-Zugriff |
| `FORBIDDEN_CROSS_ORG` | 403 | `requireSameOrg` | `{error: {code, ...}}` | Cross-Org-Schreibversuch |
| `SUBSCRIPTION_INACTIVE` | 403 | `requireActiveSubscription` | `{error: {code, message, ...}}` | Abo inaktiv |
| `FEATURE_NOT_ENABLED` | 403 | `requireOrgFeature` | `{error: {code, feature, plan, ...}}` | Feature nicht im Plan |
| `FEATURE_PENDING_APPROVAL` | 409 | `requireOrgFeature` | `{error: {code, ...}}` | Wartet auf Staff |
| `PLAN_LIMIT_REACHED` | 429 | `requireOrgLimit` | `{error: {code, metric, current, limit}}` | Limit überschritten |
| `WORKER_ROLE_REQUIRED` | 403 | `requireWorkerRole` (workerPortal.js) | `{error: "STRING"}` | Kein Worker-Role |
| `BUYER_ORG_REQUIRED` | 403 | `requireCompanyOrg` | `{error: "STRING", message}` | Nur Company-Orgs |

### ⚠️ Format-Inkonsistenz (P2 — Tech Debt)

**Problem:** Drei unterschiedliche Error-Response-Formate koexistieren:
1. **Flat String:** `{ error: "CODE" }` — verwendet in `auth.js`, `workerPortal.js`, `organizations.js`
2. **Flat String + Message:** `{ error: "CODE", message: "..." }` — verwendet in `rbac.js`, `orgAccess.js`
3. **Nested Object:** `{ error: { code: "CODE", message: "...", feature: "...", ... } }` — verwendet in `entitlementGuard.js`

**Risiko:** Frontend-Error-Handler müssen alle drei Formate parsen. Neue Routes könnten falsches Format verwenden.
**Fix:** WAVE_06 oder später — alle Guards auf Format 3 (`{error: {code, message}}`) vereinheitlichen. Braucht Frontend-Anpassung in `frontend/public/js/apiClient.js`.
**Jetzt:** Dokumentiert als P2.x — kein Go-Live-Blocker.

---

## 8. Cross-Tenant-Negativtests (Coverage-Map)

Quelle: `api/test/security/org-isolation.test.js` + verwandte Security-Test-Suite

| Domäne | Test vorhanden | Testdatei |
|---|---|---|
| Organizations (Org-Daten) | ✅ | `security/org-isolation.test.js` |
| Compliance-Dokumente | ✅ | `security/org-isolation.test.js` |
| Invoices | ✅ | `security/org-isolation.test.js` |
| Requisitions | ✅ | `security/org-isolation.test.js` |
| Approvals | ✅ | `security/org-isolation.test.js` |
| Vendor Pool | ✅ | `security/org-isolation.test.js` |
| RBAC / Role-Escalation | ✅ | `security/role-escalation.test.js` |
| Resource Ownership | ✅ | `security/resource-ownership.test.js` |
| Permission Bypass | ✅ | `security/permission-bypass.test.js` |
| Support-OCC-Boundary | ✅ | `security/support-occ-boundaries.test.js` |
| Subscription-Security | ✅ | `subscriptionSecurity.test.js` |
| Backend-Boundary-Hardening | ✅ | `backendBoundaryHardening.test.js` |
| Org-Boundary (Location/Dept) | ✅ | `orgBoundary.test.js`, `org-boundary.test.js` |
| Multi-Location | ✅ | `multi-location-integration.test.js` |
| **Timesheets** | ❌ fehlt | — Cross-Org-Timesheet-Zugriff nicht getestet |
| **Assignments** | ❌ fehlt | — Cross-Org-Assignment-Zugriff nicht getestet |
| **Workers** | ❌ fehlt | — Org-A kann Worker aus Org-B nicht sehen? |
| **Audit-Log** | ❌ fehlt | — Cross-Org-Audit-Zugriff nicht getestet |
| **Referral/Credits** | ❌ fehlt | — falls vorhanden |

**Fehlende Tests → als P1.6 in PILOT_GO_LIVE_TODOS eintragen (Timesheets + Assignments am kritischsten).**

---

## 9. Worker-Portal Isolation (verifiziert WAVE_03)

**Guard:** `requireWorkerRole` in `routes/workerPortal.js` (Zeile 126–131)
```javascript
function requireWorkerRole(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ error: "NOT_AUTHENTICATED" });
  if (req.session.userRole !== "worker") {
    return res.status(403).json({ error: "WORKER_ROLE_REQUIRED" });
  }
  next();
}
```
**Alle Worker-Portal-Routen** werden mit `base = [requireAuth, requireWorkerRole]` geschützt.

**Worker-Portal HTML-Seiten** (einsatzportal-*.html): Diese werden von Nginx als statische Dateien ausgeliefert. Die API-Routen dahinter sind korrekt durch `requireWorkerRole` geschützt.

**Offener Punkt:** Nginx-Konfiguration für Worker-Portal-HTML prüfen — sind die Seiten ohne Login erreichbar? (HTML selbst ist statisch, API ist geschützt.) Niedrige Priorität, da API die einzige sensitive Schicht ist.

---

## 10. Maturity Gates (unreife Features)

Quelle: `api/config/planFeatures.js` → `MATURITY_GATES`

| Feature | Gesperrt | Begründung |
|---|---|---|
| admin_panel_access | ❌ false (gesperrt) | Admin-Panel nicht produktionsreif |
| executive_control_access | ❌ false (gesperrt) | Überwachung/Steuerung in Arbeit |
| monitoring_suite_access | ❌ false (gesperrt) | Monitoring-Suite unvollständig |

---

## 11. WAVE_03 Abschluss-Status

### Rollen-Matrix-Status
- Kernseiten Hub-Visibility: 12/12 ✅
- Server-Guards dokumentiert: 18 Guards ✅
- Cross-Tenant-Tests: 14/19 sensible Domänen ✅ (5 fehlen — P1.6)
- Error-Code-Format vereinheitlicht: ❌ (P2 Tech Debt — 3 Formate koexistieren)
- Surface-Trennung eingehalten: ✅ OCC/SCC/SOC/Worker alle korrekt isoliert
- Worker-Portal-Isolation: ✅ `requireWorkerRole` auf allen Routen

### Offene Punkte für Folge-Wellen
- **P1.6 (NEU):** Cross-Tenant-Tests für Timesheets, Assignments, Workers, Audit-Log
- **P2.x (NEU):** Error-Response-Format vereinheitlichen auf `{error: {code, message}}`
- **P2.0 (besteht):** INDIVIDUELL Tier-Schwellen-Migration (aus WAVE_02)
