# TempConnect — Tenant Isolation Model

> Security Reference — WAVE 05 — Phase 2 Finalisierung — 2026-05-26
>
> Dieses Dokument klassifiziert jede Datenbanktabelle nach ihrer Isolation-Stufe
> und definiert, welche RLS-Mechanismen greifen.

---

## Überblick: Isolation-Stufen

| Stufe | Bedeutung | RLS | Zugriff |
|---|---|---|---|
| **tenant-scoped** | Mandanten-Daten mit `org_id`-Bindung | Ja (oder geplant) | Via `withOrgContext(pool, orgId, fn)` |
| **global** | Plattform-weite Lookup/Config-Tabellen | Nein | Direkt lesbar, keine org-Filterung |
| **staff-internal** | TempConnect-intern, kein Kunden-Zugriff | Nein | Via `withStaffContext(pool, fn, {reason})` |
| **audit** | Unveränderliche Prüfpfade | Ja (audit_log) | Write: beliebiger Kontext; Read: org-gefiltert |
| **billing** | Abrechnungs- und Subscription-Daten | Teilweise (Mig 116) | Via `withOrgContext` oder `withStaffContext` |

---

## RLS-Mechanismus

**Implementiert in:** `sql/migrations/031_rls_prep.sql` + `sql/migrations/116_rls_deny_by_default.sql`

**PostgreSQL Session-Variablen:**
```sql
-- Normaler Request (Org-Kontext):
SET LOCAL app.current_org_id = '<uuid>';  -- RLS filtert auf diese Org
SET LOCAL app.rls_bypass = '';             -- kein Bypass

-- Staff-Request (Cross-Org):
SET LOCAL app.rls_bypass = 'staff';       -- Policy is_staff_context() = TRUE
SET LOCAL app.current_org_id = '';        -- keine Org-Bindung
```

**Node.js API:** `api/utils/orgContext.js`
```javascript
// Normaler Request:
await withOrgContext(pool, req.orgId, async (client) => { /* ... */ });

// Staff-Request (Pflicht: reason):
await withStaffContext(pool, async (client) => { /* ... */ }, {
  reason: "beschreibung_der_aktion",
  actorUserId: userId,
});
```

**Deny-by-Default:** Ohne gesetzten Kontext sehen alle tenant-scoped Tabellen 0 Rows zurück (keine IS NULL Wildcard mehr seit Migration 116).

---

## Tabellen-Klassifikation

### 🔴 TENANT-SCOPED — RLS aktiv (10 Tabellen)

Diese Tabellen haben `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` und werden durch die `*_same_org` + `*_staff_bypass` Policies geschützt.

| Tabelle | org-Spalte(n) | FORCE RLS | Policy |
|---|---|---|---|
| `requisitions` | `org_id` | **JA** | `req_same_org`, `req_staff_bypass` |
| `timesheets` | `org_id`, `supplier_org_id` | **JA** | `ts_same_org`, `ts_staff_bypass` |
| `invoices` | `org_id` | **JA** | `inv_same_org`, `inv_staff_bypass` |
| `org_memberships` | `org_id` | Nein | `om_same_org`, `om_staff_bypass` |
| `vendor_pool_entries` | `org_id`, `supplier_org_id` | Nein | `vpe_same_org`, `vpe_staff_bypass` |
| `compliance_documents` | `org_id`, `supplier_org_id` | Nein | `cd_same_org`, `cd_staff_bypass` |
| `subscriptions` | `org_id` | Nein | `sub_same_org`, `sub_staff_bypass` |
| `subscription_requests` | `org_id` | Nein | `subreq_same_org`, `subreq_staff_bypass` |
| `commercial_offers` | `buyer_org_id`, `seller_org_id` | Nein | `co_same_org`, `co_staff_bypass` |
| `audit_log` | `org_id` (nullable) | Nein | `al_same_org`, `al_staff_bypass` |

**Zugriffsmuster:**
```javascript
// Lesen: withOrgContext pflicht
await withOrgContext(pool, orgId, async (client) => {
  const { rows } = await client.query("SELECT * FROM requisitions WHERE ...");
});

// Staff liest cross-org:
await withStaffContext(pool, async (client) => {
  const { rows } = await client.query("SELECT * FROM requisitions");
}, { reason: "support_investigation_case_123" });
```

---

### 🟡 TENANT-SCOPED — RLS noch nicht aktiv (geplant)

Diese Tabellen haben `org_id`-Spalte und werden bei jedem Request durch Application-Layer org-gefiltert. RLS-Aktivierung ist der nächste Härtungsschritt.

| Tabelle | org-Spalte(n) | Nächster Schritt |
|---|---|---|
| `assignments` | `org_id`, `supplier_org_id` | Migration 117 |
| `contracts` | `org_id` | Migration 117 |
| `rate_cards` | `org_id` | Migration 117 |
| `rate_card_checks` | `org_id` | Migration 117 |
| `capacities` | `org_id` | Migration 117 |
| `capacity_posts` | `org_id` | Migration 117 |
| `capacity_reservations` | `org_id` | Migration 117 |
| `org_locations` | `org_id` | Migration 117 |
| `org_departments` | `org_id` | Migration 117 |
| `org_settings` | `org_id` | Migration 117 |
| `org_api_keys` | `org_id` | Migration 117 |
| `org_sso_config` | `org_id` | Migration 117 |
| `org_active_addons` | `org_id` | Migration 117 |
| `approval_requests` | `org_id` | Migration 117 |
| `demand_requests` | `org_id` | Migration 117 |
| `demand_sla_events` | `org_id` | Migration 117 |
| `matches` | `org_id` | Migration 117 |
| `worker_invites` | `org_id` | Migration 117 |
| `compliance_policies` | `org_id` | Migration 117 |
| `notifications` | `user_id` / `org_id` | Migration 117 |
| `notification_preferences` | `user_id` | Migration 117 |
| `offers` | `org_id` | Migration 117 |
| `offer_assets` | via `offer_id` | Migration 117 |
| `proofs` | `org_id` | Migration 117 |
| `ratings` | `org_id` | Migration 117 |
| `match_alerts` | `org_id` | Migration 117 |
| `timesheet_entries` | via `timesheet_id` | Migration 117 |
| `timesheet_templates` | `org_id` | Migration 117 |
| `timesheet_template_fields` | via `template_id` | Migration 117 |
| `timesheet_template_assignments` | via `template_id` | Migration 117 |
| `invoice_items` | via `invoice_id` | Migration 117 |
| `subscription_documents` | `org_id` | Migration 117 |
| `subscription_notification_log` | `org_id` | Migration 117 |
| `subscription_request_status_history` | via `request_id` | Migration 117 |
| `deal_documents` | `org_id` | Migration 117 |
| `data_governance_requests` | `org_id` | Migration 117 |
| `listing_analytics` | `org_id` | Migration 117 |
| `supplier_metrics` | `org_id` | Migration 117 |
| `supplier_reputation` | `org_id` | Migration 117 |
| `assignment_staffing_campaigns` | `org_id` | Migration 117 |
| `assignment_staffing_invites` | `org_id` | Migration 117 |
| `assignment_staffing_messages` | `org_id` | Migration 117 |
| `assignment_staffing_reservations` | `org_id` | Migration 117 |
| `assignment_staffing_waitlist` | `org_id` | Migration 117 |
| `assignment_staffing_choice_sets` | via `campaign_id` | Migration 117 |
| `assignment_staffing_choice_options` | via `choice_set_id` | Migration 117 |
| `assignment_staffing_events` | via `campaign_id` | Migration 117 |
| `worker_profiles` | `org_id` (supplier) | Migration 117 |
| `worker_profile_documents` | via `worker_profile_id` | Migration 117 |
| `worker_billing_snapshots` | `org_id` | Migration 117 |
| `worker_time_submissions` | `org_id` | Migration 117 |
| `worker_time_submission_entries` | via `submission_id` | Migration 117 |
| `worker_submission_events` | via `submission_id` | Migration 117 |
| `worker_assignment_links` | `org_id` | Migration 117 |
| `bounties` | `org_id` | Migration 117 |
| `user_bounties` | `user_id` + `org_id` | Migration 117 |
| `emergency_provider_commitments` | `org_id` | Migration 117 |
| `emergency_provider_commitment_events` | via `commitment_id` | Migration 117 |
| `support_cases` | `org_id` | Migration 117 |
| `support_case_events` | via `case_id` | Migration 117 |
| `support_case_notes` | via `case_id` | Migration 117 |
| `support_tickets` | `org_id` | Migration 117 |
| `support_escalations` | `org_id` | Migration 117 |

---

### 🟢 GLOBAL — Keine Mandanten-Isolation

Plattform-weite Tabellen ohne `org_id`-Bindung. Kein RLS erforderlich.

| Tabelle | Beschreibung |
|---|---|
| `users` | User-Identitäten (alle Orgs) |
| `organizations` | Org-Stammdaten (selbst ist kein Tenant-Objekt) |
| `platform_skills` | Skill-Taxonomie (global) |
| `platform_events` | Plattform-weite Ereignisse |
| `catalog_versions` | Plan-Katalog (global) |
| `plan_usage_rules` | Plan-Feature-Regeln |
| `product_release_entries` | Changelog / Release Notes |
| `idempotency_keys` | Technische Deduplizierungs-Keys |
| `bounty_tiers` | Bonus-Tier-Definitionen (global) |
| `user_bounty_tiers` | User-bezogen, kein org_id |
| `user_milestones` | User-Fortschritt (global) |
| `user_onboarding_progress` | User-Fortschritt (global) |
| `user_product_release_ack` | User-Quittierungen |
| `credit_packages` | Kredit-Produkte (global definiert) |
| `company_profiles` | Öffentliche Firmenprofil-Daten |
| `company_contacts` | Öffentliche Kontakte |
| `company_certifications` | Öffentliche Zertifizierungen |
| `company_capabilities` | Öffentliche Fähigkeiten |
| `company_locations` | Öffentliche Standorte |

---

### 🔵 STAFF-INTERNAL — TempConnect-intern

Kein Kunden-Zugriff. Zugriff ausschließlich über `staffControlAccess`-Middleware.

| Tabelle | Beschreibung |
|---|---|
| `tempconnect_staff` | Staff-Mitglieder von TempConnect |
| `internal_user_roles` | Interne Rollen-Zuweisung |
| `feature_overrides` | Plan-Feature-Überschreibungen (Staff-Only) |
| `support_agents` | Support-Agent-Profile |
| `support_queues` | Support-Routing-Konfiguration |
| `support_knowledge` | Interne Wissensdatenbank |
| `support_vendors` | Vendor-Pool für Support |
| `support_audit_log` | Support-spezifischer Audit |
| `infrastructure_snapshots` | Platform-Ops-Snapshots |
| `deployments` | Deployment-Tracking |
| `warp_hosts` | Automatisierungs-Hosts |
| `warp_runbooks` | Automatisierungs-Runbooks |
| `warp_executions` | Ausführungsprotokoll |
| `automation_jobs` | Job-Queue (intern) |
| `occ_owner_access` | Owner Control Center — Zugangstabelle |
| `occ_decisions` | Owner Control Center — Entscheidungsprotokoll |
| `owner_control_access_audit` | OCC-Zugriffs-Audit |

---

### 🟣 AUDIT — Unveränderliche Prüfpfade

| Tabelle | RLS | Beschreibung |
|---|---|---|
| `audit_log` | **JA** (Migration 116) | Hauptaudit-Trail — org-gefiltert für Kunden, vollständig für Staff |
| `support_audit_log` | Nein | Support-Audit — ausschließlich Staff |
| `owner_control_access_audit` | Nein | OCC-Zugriffs-Protokoll |

**Wichtig:** `audit_log` Einträge mit `org_id IS NULL` sind Staff-/Platform-Einträge und nur für Staff sichtbar (Policy: `al_same_org` = `org_id = current_org_id() OR org_id IS NULL` — letztere werden von `al_staff_bypass` abgedeckt).

---

### 💰 BILLING — Abrechnungs-Daten

| Tabelle | RLS | Beschreibung |
|---|---|---|
| `subscriptions` | **JA** (Migration 116) | Aktive Abonnements |
| `subscription_requests` | **JA** (Migration 116) | Abo-Änderungsanträge |
| `commercial_offers` | **JA** (Migration 116) | Kommerzielle Angebote |
| `billing_usage_metrics` | Nein (geplant) | Nutzungsmetriken für Abrechnung |
| `credit_accounts` | Nein (geplant) | Kredit-Guthaben |
| `credit_transactions` | Nein (geplant) | Kredit-Transaktionen |
| `payment_sessions` | Nein (geplant) | Zahlungssitzungen |
| `worker_billing_snapshots` | Nein (geplant) | Abrechnungs-Snapshots |
| `subscription_documents` | Nein (geplant) | Vertragsdokumente |
| `subscription_notification_log` | Nein (geplant) | Abo-Benachrichtigungsprotokoll |
| `subscription_request_status_history` | Nein (geplant) | Status-Historie |
| `product_analytics_events` | Nein | Produkt-Analyse-Events |
| `product_analytics_sessions` | Nein | Analyse-Sitzungen |
| `product_analytics_daily_rollups` | Nein | Tages-Rollups |
| `product_analytics_funnel_definitions` | Nein | Funnel-Definitionen |
| `product_analytics_funnel_steps` | Nein | Funnel-Schritte |
| `product_analytics_journeys` | Nein | User-Journeys |

---

## Sicherheitsanforderungen

### Regel 1: Alle tenant-scoped Queries in Transaktion mit gesetztem Context

```javascript
// ✅ Korrekt
await withOrgContext(pool, req.orgId, async (client) => {
  await client.query("SELECT * FROM requisitions WHERE status = $1", ["open"]);
});

// ❌ Falsch — kein Org-Context → 0 Rows zurück (deny-by-default)
await pool.query("SELECT * FROM requisitions WHERE org_id = $1", [orgId]);
```

### Regel 2: Staff-Context erfordert reason (Audit-Pflicht)

```javascript
// ✅ Korrekt
await withStaffContext(pool, async (client) => {
  /* cross-org queries */
}, { reason: "support_case_456_investigation", actorUserId: staffId });

// ❌ Falsch — wirft Error: "opts.reason ist Pflichtfeld"
await withStaffContext(pool, async (client) => { /* ... */ }, {});
```

### Regel 3: Middleware-Helper vs. withOrgContext

`req.setOrgContext(client)` und `req.withStaffContext(fn)` stehen nur in Request-Middleware-Kontexten zur Verfügung.
Background-Jobs und Cronjobs müssen `withOrgContext` / `withStaffContext` direkt aus `api/utils/orgContext.js` importieren.

### Regel 4: SET LOCAL nur in Transaktionen

```sql
-- SET LOCAL wirkt NUR zwischen BEGIN und COMMIT.
-- pool.query() außerhalb von Transaktionen hat KEINEN Kontext.
BEGIN;
SET LOCAL app.current_org_id = 'uuid';
SELECT * FROM requisitions; -- gefiltert auf org
COMMIT;
```

---

## Roadmap: Nächste RLS-Aktivierungen

**Migration 117** (nächste Härtungswelle):
- Priorität 1: `assignments`, `contracts`, `rate_cards` — geschäftskritisch
- Priorität 2: `org_locations`, `org_departments`, `org_settings` — Org-Konfiguration
- Priorität 3: `capacities`, `capacity_posts`, `capacity_reservations` — Marketplace
- Priorität 4: Child-Tabellen (cascade via Parent-FK-Join statt eigene Policy)

**Empfehlung für Child-Tabellen:** Statt eigenständige RLS-Policies zu erstellen, Joins über Parent-Tabellen verwenden (die bereits RLS haben). Beispiel:
```sql
-- invoice_items haben keine eigene org_id, aber:
SELECT ii.* FROM invoice_items ii
JOIN invoices i ON i.id = ii.invoice_id
-- RLS auf invoices filtert automatisch org_id
```

---

## Verifikation (Checkliste nach Migration)

```sql
-- 1. Deny-by-Default: Ohne Kontext → 0 Rows
SELECT COUNT(*) FROM requisitions;  -- erwartet: 0

-- 2. Org-Context: nur eigene Daten
BEGIN;
SET LOCAL app.current_org_id = '<test-uuid>';
SELECT COUNT(*) FROM requisitions;  -- erwartet: nur org-eigene Rows
COMMIT;

-- 3. Staff-Bypass: alle Rows
BEGIN;
SET LOCAL app.rls_bypass = 'staff';
SELECT COUNT(*) FROM requisitions;  -- erwartet: alle Rows
COMMIT;

-- 4. FORCE RLS: auch Superuser betroffen (requisitions, timesheets, invoices)
SET ROLE postgres;
SELECT COUNT(*) FROM requisitions;  -- erwartet: 0 ohne Kontext
```

---

*Letzte Aktualisierung: WAVE 05 — Phase 2 — 2026-05-26*
*Zuständig: Backend-Security (Claude), Freigabe: Owner*
