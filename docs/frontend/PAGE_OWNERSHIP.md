# PAGE_OWNERSHIP — Frontend-Seitenverantwortung
> Erstellt: 2026-05-26 | Branch: release/enterprise-premium-market-ready
> Quelle: finalization/Phase2/WAVES.md WAVE 03

---

## 1. Vite-Apps (React/TypeScript)

| Entry HTML | Vite Config | Build Output | Route | Status |
|---|---|---|---|---|
| `occ.html` | `vite.config.ts` | `owner-control/` | `/owner-control/` | ⚠️ Stub (OCC Phase 3, OE-04) |
| `support.html` | `vite.config.support.ts` | `support-ops/` | `/support-ops/` | ⚠️ Stub (SOC Shell in Vorbereitung) |
| `staff.html` | `vite.config.staff.ts` | `public/staff/` | `/staff/` | ✅ Produktiv (SCC React-App) |

**OE-04:** OCC React-Build in CI integrieren oder erst nach Phase 3?
Owner-Entscheidung ausstehend. Stub aktiv damit `build:all` grün bleibt.

---

## 2. Vanilla-HTML-Seiten (frontend/public/)

### 2.1 Core Business
| Datei | Bereich | Zielrolle | Plan-Gate | Status |
|---|---|---|---|---|
| requisitions.html | Bedarfsverwaltung | Company/Agency | PLUS+ | ✅ |
| request_detail.html | Bedarfsdetail | Company/Agency | PLUS+ | ✅ |
| company_requests.html | Firmenbedarfe | Company | PLUS+ | ✅ |
| demand_create.html | Bedarf anlegen | Company | PLUS+ | ✅ |
| marketplace_demand_list.html | Marktplatz-Bedarfe | Company/Agency | BASIS+ | ✅ |
| marketplace_demand_detail.html | Marktplatz-Detail | Company/Agency | BASIS+ | ✅ |
| marketplace_demand_create.html | Marktplatz-Bedarf anlegen | Agency | BASIS+ | ✅ |
| capacity_search.html | Kapazitätssuche | Company | PLUS+ | ✅ |
| matching_results.html | Matching-Ergebnisse | Company | PLUS+ | ✅ |
| capacity_exchange.html | Kapazitätsbörse | Company/Agency | PLUS+ | ✅ |
| capacity_exchange_detail.html | KE-Detail | Company/Agency | PLUS+ | ✅ |
| capacity_exchange_feed.html | KE-Feed | Company/Agency | PLUS+ | ✅ |
| capacity_exchange_form.html | KE-Formular | Agency | PLUS+ | ✅ |
| capacity_exchange_manage.html | KE-Verwaltung | Agency | PLUS+ | ✅ |
| marketplace_capacity_create.html | Kapazität anlegen | Agency | BASIS+ | ✅ |
| app_notdienst.html | Notdienst-App | Company | PLUS+ | ⚠️ OE-06: aktiv oder Coming Soon? |
| vendor_pool.html | Lieferantenpool | Company | INDIVIDUELL | ✅ |
| supplier_scorecard.html | Lieferanten-Scorecard | Company | PLUS+ | ✅ |
| deal_management.html | Deal-Verwaltung | Company/Agency | BASIS+ | ✅ |
| offer_detail.html | Angebotsdetail | Company/Agency | BASIS+ | ✅ |
| angebote_verwalten.html | Angebote | Agency | BASIS+ | ✅ |
| mitarbeiter.html | Mitarbeiter | Agency | BASIS+ | ✅ |
| worker-portal.html | Worker-Portal | Agency | BASIS+ | ✅ |
| worker-login.html | Worker-Login | Worker | — | ✅ |
| worker-timesheet.html | Worker-Stundenzettel | Worker | — | ✅ |
| timesheets.html | Stundenzettelliste | Company/Agency | PLUS+ | ✅ |
| timesheet-templates.html | Zeiterfassungs-Vorlagen | Company | PLUS+ | ✅ |
| worker-submissions-review.html | Einreichungen prüfen | Company/Agency | PLUS+ | ✅ |
| approvals.html | Genehmigungen | Company | PLUS+ | ✅ |
| spend-analytics.html | Spend-Analyse | Company | PLUS+ | ⚠️ Scope-Display fehlt (P2-A) |
| rate-cards.html | Konditionsblätter | Company | INDIVIDUELL | ✅ |
| compliance_overview.html | Compliance | Company | PLUS+ | ✅ |
| data-governance.html | Datenverwaltung | Company | PLUS+ | ✅ |

### 2.2 Einsatzportal (Worker-Only)
| Datei | Bereich | Zielrolle |
|---|---|---|
| einsatzportal-dashboard.html | Worker-Dashboard | Worker |
| einsatzportal-einsaetze.html | Einsatzliste | Worker |
| einsatzportal-plan.html | Einsatzplan | Worker |
| einsatzportal-profil.html | Worker-Profil | Worker |
| einsatzportal-stundenzettel.html | Stundenzettel | Worker |
| einsatzportal-benachrichtigungen.html | Benachrichtigungen | Worker |
| einsatzportal-kontakt.html | Kontakt | Worker |

**Guard:** Nur `org_type = worker` darf diese Seiten sehen (hidden_worker in Hub-Matrix).

### 2.3 Public Profile
| Datei | Bereich | Auth-Guard |
|---|---|---|
| worker-profile-public.html | Worker-Profil öffentlich | Einwilligung Pflicht |
| company_profile_public.html | Firmenprofil öffentlich | Opt-in |

### 2.4 Dashboard / Commercial
| Datei | Bereich | Zielrolle | Plan-Gate |
|---|---|---|---|
| executive_dashboard.html | Executive KPIs | Company Admin | PLUS+ |
| pricing.html | Preisseite | Public | — |
| enterprise.html | Enterprise-Landingpage | Public | — |
| enterprise_anfrage.html | Enterprise-Anfrage | Company | — |
| sla_abo.html | SLA-Abo | Company | PLUS+ |
| sla_angebote.html | SLA-Angebote | Company | PLUS+ |
| sla_hilfe.html | SLA-Hilfe | All | — |
| sla_nachweise.html | SLA-Nachweise | Company | PRO+ |
| sla_profil.html | SLA-Profil | Company | PLUS+ |
| sla_search_jobs_list.html | SLA-Jobsuche | Company | PLUS+ |
| sla_search_job_detail.html | SLA-Job-Detail | Company | PLUS+ |
| bounties.html | Bounty-System | Company | PRO+ |

### 2.5 Admin / Internal (Staff-Only)
| Datei | Bereich | Zielrolle | Guard |
|---|---|---|---|
| admin_panel.html | Admin-Panel | admin/owner/platform_admin | requireAdmin |
| activity.html | Aktivitäts-Feed | admin | requireAdmin |
| internal_control_center.html | Internes CC | platform_owner/ops_manager | requireInternalPermission |
| organization.html | Org-Verwaltung | Company Admin | requirePermission |

### 2.6 Utility
| Datei | Bereich |
|---|---|
| integrations.html | Integrationen |
| sso_config.html | SSO-Konfiguration |
| about.html | Über TempConnect |
| hilfe.html | Hilfe |
| onboarding.html | Onboarding |
| agency_inbox.html | Agency-Posteingang |
| system-health.html | System-Status (Public) |
| whats-new.html | Neuigkeiten |

### 2.7 Hygiene-Risiken
| Datei | Problem | OE | Prio |
|---|---|---|---|
| api-docs.html | Duplikat von api_docs.html | OE-01 | P2 |
| api_docs.html | Duplikat von api-docs.html | OE-01 | P2 |
| meine(agb).html | Sonderzeichen im Dateinamen | OE-02 | P2 |

---

## 3. Subdirectory-Seiten
| Pfad | Datei | Guard |
|---|---|---|
| public/staff/ | staff.html | Nur SCC React-App (auth via SCC-Session) |
| public/trust/ | compliance.html, platform-sla.html, security.html, status.html | Public |
| public/legal/ | agb.html, datenschutz.html, impressum.html, kontakt.html, sla.html | Public |

---

## 4. Offene Owner-Entscheidungen

| # | Frage | Impact |
|---|---|---|
| OE-01 | api-docs.html vs api_docs.html — welche kanonisch? | Duplikat entfernen |
| OE-02 | meine(agb).html umbenennen? | URL-Encoding-Risiko |
| OE-04 | OCC React-Build in CI? | Stub vs. echte Shell |
| OE-06 | app_notdienst.html — aktiv oder Coming Soon? | Plan-Gate Entscheidung |
