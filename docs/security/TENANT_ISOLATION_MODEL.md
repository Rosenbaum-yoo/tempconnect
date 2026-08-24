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

<!-- MANDANTEN-MODELL:START — generiert, nicht von Hand pflegen -->

> **Gemessen am 2026-08-21 gegen die laufende Datenbank** — nicht gegen die Migrationen, die beiden laufen auseinander. Erhebung: Fremdschluessel mit Ziel `organizations`, dazu Zeilen- und `NULL`-Zaehlung je Traegerspalte. Quelle: `api/test/fixtures/mandantenTabellen.json`, erzwungen durch `api/test/mandantenModellWaechter.test.js`.
>
> **Dieser Abschnitt wird generiert.** Von Hand geaendert haelt er nicht: der Waechter vergleicht ihn Zeichen fuer Zeichen mit der Registry. Neu rendern mit `node scripts/render-mandanten-modell.js --write`.

**78 Tabellen** tragen einen Fremdschluessel auf `organizations`. 26 Backstop steht · 0 Backstop moeglich · 25 Backstop moeglich, aber nicht nachweisbar · 10 Backstop NICHT moeglich · 17 Kein Mandantentraeger.

### 🔴 Backstop steht — RLS aktiv (26)

Eine Verbindung ohne Org-Kontext und ohne Staff-Bypass sieht hier nichts. Angelegt von `116_rls_deny_by_default.sql`, auf Bestands-Datenbanken nachgezogen von `126_rls_forward_repair.sql`.

| Tabelle | Traegerspalte(n) | Bestand | Anmerkung |
|---|---|---|---|
| `assignment_staffing_campaigns` | `org_id`, `supplier_org_id` | 1 Zeilen, lueckenlos | Policies: `asc_same_org`, `asc_staff_bypass` · FORCE |
| `assignment_staffing_invites` | `org_id`, `supplier_org_id` | 1 Zeilen, lueckenlos | Policies: `asi_same_org`, `asi_staff_bypass` · FORCE |
| `assignment_staffing_waitlist` | `org_id`, `supplier_org_id` | 1 Zeilen, lueckenlos | Policies: `asw_same_org`, `asw_staff_bypass` · FORCE |
| `assignments` | `org_id`, `supplier_org_id` | 68 Zeilen, lueckenlos | Policies: `asg_same_org`, `asg_staff_bypass` · FORCE |
| `audit_log` | `org_id` | **1796 von 2740 ohne Org** | Policies: `al_same_org`, `al_staff_bypass` |
| `commercial_offers` | `org_id` | leer | Policies: `co_same_org`, `co_staff_bypass` |
| `compliance_documents` | `org_id` | 5 Zeilen, lueckenlos | Policies: `cd_same_org`, `cd_staff_bypass` |
| `contracts` | `buyer_org_id`, `supplier_org_id` | 3 Zeilen, lueckenlos | Policies: `ctr_same_org`, `ctr_staff_bypass` · FORCE |
| `document_center` | `org_id` | 158 Zeilen, lueckenlos | Policies: `doc_same_org`, `doc_staff_bypass` · FORCE |
| `invoices` | `org_id`, `supplier_org_id` | leer | Policies: `inv_same_org`, `inv_staff_bypass` · FORCE |
| `org_api_keys` | `org_id` | 4 Zeilen, lueckenlos | Policies: `oak_same_org`, `oak_staff_bypass` · FORCE |
| `org_departments` | `org_id` | 4 Zeilen, lueckenlos | Policies: `odp_same_org`, `odp_staff_bypass` · FORCE |
| `org_invitations` | `org_id` | 1 Zeilen, lueckenlos | Policies: `oiv_same_org`, `oiv_staff_bypass` · FORCE |
| `org_locations` | `org_id` | 4 Zeilen, lueckenlos | Policies: `olc_same_org`, `olc_staff_bypass` · FORCE |
| `org_memberships` | `org_id` | 251 Zeilen, lueckenlos | Policies: `om_same_org`, `om_staff_bypass` |
| `org_settings` | `org_id` | 18 Zeilen, lueckenlos | Policies: `ost_same_org`, `ost_staff_bypass` · FORCE |
| `rate_cards` | `org_id`, `supplier_org_id` | 4 Zeilen, lueckenlos | Policies: `rcd_same_org`, `rcd_staff_bypass` · FORCE |
| `requisitions` | `org_id` | 73 Zeilen, lueckenlos | Policies: `req_same_org`, `req_staff_bypass` · FORCE |
| `search_history` | `org_id` | 36 Zeilen, lueckenlos | Policies: `shs_same_org`, `shs_staff_bypass` · FORCE |
| `subscription_requests` | `org_id` | 11 Zeilen, lueckenlos | Policies: `subreq_same_org`, `subreq_staff_bypass` |
| `timesheets` | `org_id`, `supplier_org_id` | 10 Zeilen, lueckenlos | Policies: `ts_same_org`, `ts_staff_bypass` · FORCE |
| `worker_assignment_links` | `org_id`, `supplier_org_id` | 24 Zeilen, lueckenlos | Policies: `wal2_same_org`, `wal2_staff_bypass` · FORCE |
| `worker_billing_snapshots` | `org_id` | 1 Zeilen, lueckenlos | Policies: `wbs_same_org`, `wbs_staff_bypass` · FORCE |
| `worker_invites` | `supplier_org_id` | 7 Zeilen, lueckenlos | Policies: `wiv_same_org`, `wiv_staff_bypass` · FORCE |
| `worker_profiles` | `supplier_org_id` | 33 Zeilen, lueckenlos | Policies: `wpf_same_org`, `wpf_staff_bypass` · FORCE |
| `worker_time_submissions` | `org_id`, `supplier_org_id` | 19 Zeilen, lueckenlos | Policies: `wts_same_org`, `wts_staff_bypass` · FORCE |

### 🟡 Backstop moeglich — Traegerspalte ist lueckenlos gefuellt (0)

Mandanten-privat, und die Traegerspalte steht in **jeder** Zeile. RLS kann hier aktiviert werden, ohne dass Zeilen verschwinden.

| Tabelle | Traegerspalte(n) | Bestand | Anmerkung |
|---|---|---|---|

### ⚪ Backstop moeglich, aber nicht nachweisbar — Tabelle ist leer (25)

Traegerspalte vorhanden, noch keine Zeilen. Technisch aktivierbar; an echten Daten laesst sich die Trennung heute nicht zeigen.

| Tabelle | Traegerspalte(n) | Bestand | Anmerkung |
|---|---|---|---|
| `ai_match_rankings` | `org_id` | leer | Traegerspalte vorhanden, noch keine Zeilen — RLS technisch moeglich, aber an echten Daten nicht nachweisbar. |
| `approval_requests` | `org_id` | leer | Traegerspalte vorhanden, noch keine Zeilen — RLS technisch moeglich, aber an echten Daten nicht nachweisbar. |
| `assignment_staffing_choice_options` | `supplier_org_id` | leer | Traegerspalte vorhanden, noch keine Zeilen — RLS technisch moeglich, aber an echten Daten nicht nachweisbar. |
| `assignment_staffing_choice_sets` | `supplier_org_id` | leer | Traegerspalte vorhanden, noch keine Zeilen — RLS technisch moeglich, aber an echten Daten nicht nachweisbar. |
| `assignment_staffing_reservations` | `org_id`, `supplier_org_id` | leer | Traegerspalte vorhanden, noch keine Zeilen — RLS technisch moeglich, aber an echten Daten nicht nachweisbar. |
| `billing_usage_metrics` | `org_id` | leer | Traegerspalte vorhanden, noch keine Zeilen — RLS technisch moeglich, aber an echten Daten nicht nachweisbar. |
| `data_governance_requests` | `org_id` | leer | Traegerspalte vorhanden, noch keine Zeilen — RLS technisch moeglich, aber an echten Daten nicht nachweisbar. |
| `flagged_search_queries` | `org_id` | leer | Traegerspalte vorhanden, noch keine Zeilen — RLS technisch moeglich, aber an echten Daten nicht nachweisbar. |
| `match_logs` | `org_id` | leer | Traegerspalte vorhanden, noch keine Zeilen — RLS technisch moeglich, aber an echten Daten nicht nachweisbar. |
| `org_active_addons` | `org_id` | leer | Traegerspalte vorhanden, noch keine Zeilen — RLS technisch moeglich, aber an echten Daten nicht nachweisbar. |
| `org_erp_mappings` | `org_id` | leer | Traegerspalte vorhanden, noch keine Zeilen — RLS technisch moeglich, aber an echten Daten nicht nachweisbar. |
| `org_integrations` | `org_id` | leer | Traegerspalte vorhanden, noch keine Zeilen — RLS technisch moeglich, aber an echten Daten nicht nachweisbar. |
| `org_sso_config` | `org_id` | leer | Traegerspalte vorhanden, noch keine Zeilen — RLS technisch moeglich, aber an echten Daten nicht nachweisbar. |
| `premium_listing_charges` | `org_id` | leer | Traegerspalte vorhanden, noch keine Zeilen — RLS technisch moeglich, aber an echten Daten nicht nachweisbar. |
| `profile_bounties` | `org_id` | leer | Traegerspalte vorhanden, noch keine Zeilen — RLS technisch moeglich, aber an echten Daten nicht nachweisbar. |
| `profile_ranking_snapshots` | `org_id` | leer | Traegerspalte vorhanden, noch keine Zeilen — RLS technisch moeglich, aber an echten Daten nicht nachweisbar. |
| `profile_visibility_settings` | `org_id` | leer | Traegerspalte vorhanden, noch keine Zeilen — RLS technisch moeglich, aber an echten Daten nicht nachweisbar. |
| `rate_card_checks` | `org_id`, `supplier_org_id` | leer | Traegerspalte vorhanden, noch keine Zeilen — RLS technisch moeglich, aber an echten Daten nicht nachweisbar. |
| `requisition_candidates` | `supplier_org_id` | leer | Traegerspalte vorhanden, noch keine Zeilen — RLS technisch moeglich, aber an echten Daten nicht nachweisbar. |
| `sso_sessions` | `org_id` | leer | Traegerspalte vorhanden, noch keine Zeilen — RLS technisch moeglich, aber an echten Daten nicht nachweisbar. |
| `submissions` | `supplier_org_id` | leer | Traegerspalte vorhanden, noch keine Zeilen — RLS technisch moeglich, aber an echten Daten nicht nachweisbar. |
| `timesheet_template_assignments` | `org_id`, `supplier_org_id` | leer | Traegerspalte vorhanden, noch keine Zeilen — RLS technisch moeglich, aber an echten Daten nicht nachweisbar. |
| `timesheet_templates` | `supplier_org_id` | leer | Traegerspalte vorhanden, noch keine Zeilen — RLS technisch moeglich, aber an echten Daten nicht nachweisbar. |
| `worker_delays` | `supplier_org_id` | leer | Traegerspalte vorhanden, noch keine Zeilen — RLS technisch moeglich, aber an echten Daten nicht nachweisbar. |
| `worker_profile_documents` | `supplier_org_id` | leer | Traegerspalte vorhanden, noch keine Zeilen — RLS technisch moeglich, aber an echten Daten nicht nachweisbar. |

### 🟠 Backstop NICHT moeglich — die Traegerspalte ist nicht gefuellt (10)

Hier ist RLS kein Schutz, sondern ein Datenausfall: Zeilen mit `NULL` in der Traegerspalte waeren fuer **jeden** unsichtbar, auch fuer den Eigentuemer. Erst die Schreibseite reparieren, dann sichern. Derselbe Defekt wie in Abschnitt 8.1.1 des Plans I (`audit_log`).

| Tabelle | Traegerspalte(n) | Bestand | Anmerkung |
|---|---|---|---|
| `capacity_posts` | `org_id` | **3 von 33 ohne Org** | Die Org-Spalte ist in 3 von 33 Zeilen NULL. RLS wuerde diese Zeilen fuer JEDEN unsichtbar machen — ein Datenausfall, kein Schutz. Erst die Schreibseite reparieren. |
| `csv_import_field_aliases` | `org_id` | **95 von 95 ohne Org** | Die Org-Spalte ist in 95 von 95 Zeilen NULL. RLS wuerde diese Zeilen fuer JEDEN unsichtbar machen — ein Datenausfall, kein Schutz. Erst die Schreibseite reparieren. |
| `notifications` | `org_id` | **731 von 765 ohne Org** | Die Org-Spalte ist in 731 von 765 Zeilen NULL. RLS wuerde diese Zeilen fuer JEDEN unsichtbar machen — ein Datenausfall, kein Schutz. Erst die Schreibseite reparieren. |
| `payment_sessions` | `org_id` | **33 von 33 ohne Org** | Die Org-Spalte ist in 33 von 33 Zeilen NULL. RLS wuerde diese Zeilen fuer JEDEN unsichtbar machen — ein Datenausfall, kein Schutz. Erst die Schreibseite reparieren. |
| `product_analytics_events` | `org_id` | **2132 von 6024 ohne Org** | Die Org-Spalte ist in 2132 von 6024 Zeilen NULL. RLS wuerde diese Zeilen fuer JEDEN unsichtbar machen — ein Datenausfall, kein Schutz. Erst die Schreibseite reparieren. |
| `product_analytics_sessions` | `org_id` | **612 von 4504 ohne Org** | Die Org-Spalte ist in 612 von 4504 Zeilen NULL. RLS wuerde diese Zeilen fuer JEDEN unsichtbar machen — ein Datenausfall, kein Schutz. Erst die Schreibseite reparieren. |
| `ratings` | `org_id` | **11 von 11 ohne Org** | Die Org-Spalte ist in 11 von 11 Zeilen NULL. RLS wuerde diese Zeilen fuer JEDEN unsichtbar machen — ein Datenausfall, kein Schutz. Erst die Schreibseite reparieren. |
| `requests` | `org_id` | **47 von 47 ohne Org** | Die Org-Spalte ist in 47 von 47 Zeilen NULL. RLS wuerde diese Zeilen fuer JEDEN unsichtbar machen — ein Datenausfall, kein Schutz. Erst die Schreibseite reparieren. |
| `subscription_documents` | `org_id` | **12 von 19 ohne Org** | Die Org-Spalte ist in 12 von 19 Zeilen NULL. RLS wuerde diese Zeilen fuer JEDEN unsichtbar machen — ein Datenausfall, kein Schutz. Erst die Schreibseite reparieren. |
| `user_onboarding_progress` | `org_id` | **29 von 195 ohne Org** | Die Org-Spalte ist in 29 von 195 Zeilen NULL. RLS wuerde diese Zeilen fuer JEDEN unsichtbar machen — ein Datenausfall, kein Schutz. Erst die Schreibseite reparieren. |

### 🔵 Kein Mandantentraeger — org-RLS waere das falsche Modell (17)

Die Fremdschluessel auf `organizations` sind hier Selbstbezug, globaler Katalog, die Gegenseite eines zweiseitigen Vorgangs oder eine Staff-/Owner-Flaeche. Dieselbe Begruendung, mit der `116` schon `subscriptions` ausgenommen hat: eine Mitgliedschaftsbruecke wuerde fremde Daten erst recht offenlegen.

| Tabelle | Traegerspalte(n) | Bestand | Anmerkung |
|---|---|---|---|
| `company_worker_blocklist` | `company_org_id`, `supplier_org_id` | leer | company_org_id/supplier_org_id sind zwei Mandanten an einem Vorgang. |
| `deal_feedback` | `rated_org_id`, `rater_org_id` | leer | rated_org_id/rater_org_id sind zwei Mandanten an einem Vorgang. |
| `listings` | `org_id` | **23 von 23 ohne Org** | Marktplatz-Anzeigen sind absichtlich org-uebergreifend sichtbar; org_id ist heute zudem in allen 23 Zeilen NULL. |
| `occ_decisions` | `org_id` | leer | org_id ist der Bezug einer OWNER-Entscheidung; die Akte gehoert dem Owner Control Center. |
| `organizations` | `parent_org_id` | **1804 von 1804 ohne Org** | parent_org_id ist der Selbstbezug der Org-Hierarchie, kein Mandantentraeger. |
| `platform_events` | `org_id`, `target_org_id` | **3 von 3 ohne Org** | org_id/target_org_id sind Bezuege eines plattformweiten Ereignisstroms (Staff Center). |
| `platform_skills` | `proposed_by_org_id` | **162 von 162 ohne Org** | proposed_by_org_id vermerkt den Einreicher eines GLOBALEN Katalogs — der Katalog gilt fuer alle. |
| `profile_abuse_reports` | `reported_org_id`, `reporter_org_id` | leer | reported_org_id ist die gemeldete Gegenseite; die Meldung gehoert dem Staff Center. |
| `profile_favorites` | `favorited_org_id` | leer | favorited_org_id ist die Gegenseite einer oeffentlichen Profilhandlung. |
| `profile_likes` | `liked_org_id`, `liker_org_id` | leer | liked_org_id/liker_org_id sind beide Seiten einer oeffentlichen Profilhandlung. |
| `profile_view_events` | `viewed_org_id`, `viewer_org_id` | leer | viewed_org_id/viewer_org_id sind beide Seiten eines oeffentlichen Profilaufrufs. |
| `strategic_collaboration_requests` | `requester_org_id`, `target_org_id` | **11 von 12 ohne Org** | requester_org_id/target_org_id sind zwei Mandanten an einem Vorgang. |
| `support_cases` | `reporter_org_id` | leer | reporter_org_id ist der Melder; die Fallakte gehoert dem Support Center (siehe docs/FLAECHEN.md). |
| `support_tickets` | `org_id` | leer | org_id ist der Melder; das Ticket gehoert dem Support Center (siehe docs/FLAECHEN.md). |
| `users` | `org_id` | **158 von 395 ohne Org** | org_id ist heute in 158 von 395 Zeilen NULL; Kontodaten sind nutzer-, nicht mandantenskaliert. |
| `vendor_pool` | `client_org_id`, `supplier_org_id` | leer | client_org_id/supplier_org_id sind zwei Mandanten an einem Vorgang. |
| `worker_complaints` | `company_org_id`, `supplier_org_id` | leer | company_org_id/supplier_org_id sind zwei Mandanten an einem Vorgang. |

<!-- MANDANTEN-MODELL:ENDE -->

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
| `subscriptions` | **Nein** | Aktive Abonnements. **Korrigiert 2026-08-21:** hier stand „JA (Migration 116)“ — 116 nimmt `subscriptions` ausdrücklich aus (nutzer-, nicht mandantenskaliert), und die Datenbank zeigt `relrowsecurity = false`. |
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

> **Eine Migration mit der Nummer 117 gibt es nicht — und es hat sie nie gegeben.**
> `sql/migrations/` springt von `116_rls_deny_by_default.sql` auf
> `118_staff_identity_hardening.sql`. Dieses Dokument hat sie für 63 Tabellen als
> nächsten Schritt geführt; wer das las, hörte auf zu suchen. Der Verweis ist am
> 2026-08-21 durch den gemessenen Ist-Stand oben ersetzt worden (Befund P1-16).

**Was die Messung ergeben hat — und warum die alte Reihenfolge nicht funktioniert
hätte:**

1. **Zuerst die Schreibseite, dann der Backstop.** Bei 10 Tabellen ist die
   Trägerspalte gar nicht oder nur teilweise gefüllt — `requests`, `ratings` und
   `listings` zu **100 %**, `notifications` zu 96 %. RLS wäre dort kein Schutz,
   sondern ein Datenausfall: die Zeilen würden für **jeden** unsichtbar, auch für
   den Eigentümer. Das ist derselbe Defekt wie in Abschnitt 8.1.1 des Plans I
   (`audit_log`: 1796 von 2740 Zeilen ohne `org_id`) — **8.1.1 gehört deshalb
   VOR die RLS-Aktivierung dieser Tabellen**, nicht danach.
2. **Die alte Priorität 3 war unmöglich.** `capacities`, `capacity_reservations`
   und der ganze Marktplatz tragen überhaupt keinen Fremdschlüssel auf
   `organizations`: `capacities.agency_id`, `demand_requests.requester_company_id`
   und `offers.supplier_company_id` zeigen auf **`users`** (nachgemessen: 39 von
   39 bzw. 38 von 38 Werten treffen `users`, null treffen `organizations`). Eine
   Policy `org_id = current_org_id()` hätte dort auf eine nicht existente Spalte
   verwiesen — genau der Fehler, der `116` in den Rollback riss.
3. **Priorität 1 und 2 sind dagegen sofort möglich.** `assignments`, `contracts`,
   `rate_cards`, `org_locations`, `org_departments`, `org_settings` stehen oben
   unter „Backstop möglich“: Trägerspalte lückenlos gefüllt, mandanten-privat.

**Offene Owner-Entscheidung:** Welche der 18 bereiten und 25 leeren Tabellen in
der ersten Aktivierungswelle scharf geschaltet werden. Die Wirkung tritt nur auf
einer Managed-DB mit Nicht-Superuser-Rolle ein — lokal läuft die Anwendung als
Superuser, RLS ist dort wirkungslos und ein Fehler würde von der Testsuite
**nicht** bemerkt. Deshalb gehört jede Tabelle einzeln an einer Wegwerf-Datenbank
mit Nicht-Superuser-Rolle nachgewiesen, bevor sie aktiviert wird.

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
