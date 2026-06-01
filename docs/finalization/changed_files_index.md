# Changed Files Index — Phase 5

> Jede in Phase 5 geänderte/neue Datei mit Grund. Vor Release (Phase P) vollständige Review-Liste.

| Datei | Änderung | Grund | Risiko | Test |
|---|---|---|---|---|
| docs/finalization/10_300_customer_readiness_matrix.md | neu | Phase A Reifeprüfung | keine | n/a (Doku) |
| docs/finalization/finalization_worklog.md | neu | Projektgedächtnis | keine | n/a |
| docs/finalization/open_risks_and_blockers.md | neu | Risiko-/Blocker-Register | keine | n/a |
| docs/finalization/changed_files_index.md | neu | Änderungs-Index | keine | n/a |
| docs/finalization/final_acceptance_report_10_300_customers.md | neu (Skelett) | Abschlussbericht-Gerüst | keine | n/a |
| .claude/learning/insights_inbox.md | neu | Lernschleife (cheap append) | keine | n/a |
| .claude/learning/config.md | neu | Lern-Konfiguration (Auto-Approve nur EFFIZIENZ) | keine | n/a |
| frontend/public/css/design-system.css | geändert | Phase J Block 1: `[data-theme="ultra_premium"]` Tokenblock + restrained Component-Refinements | niedrig (additiv, Default `:root` unverändert) | Brace-Balance 332/332 + themeRegistry.test.js |
| frontend/public/js/theme.js | geändert | Phase J Block 1: Theme-Registry (dark/light/ultra_premium) + `__TC_THEME_FLAGS__`-Gating + `cycle()`/`list()` | niedrig (rückwärtskompatibel: `toggle()` bleibt dark↔light, Default dark) | api/test/themeRegistry.test.js 9/9 + node --check |
| api/test/themeRegistry.test.js | neu | Phase J Block 1 Tests (Default aktiv, Ultra Premium selectable, Fallback, Flag-Gating, cycle) | keine | 9/9 grün, eslint 0 |
| docs/THEME-SYSTEM.md | geändert | Doku: ultra_premium + Registry/Flags + cycle-Verhalten + Block-2-Ausblick | keine | n/a |

| api/services/staffCustomerOperationsService.js | neu | Phase B: read-only Kundenroster (Aggregat über organizations.customer_stage/plan + subscription_requests + org_memberships) | niedrig (read-only, KEINE Migration) | staffCustomerOperations.test.js 11/11 |
| api/routes/staffControlCenter.js | geändert | Phase B: GET /customers, /customers-meta, /customers/:orgId (requireStaff, read-only) | niedrig (additive Routen, keine Mutation) | node --check + Service-Tests |
| api/test/staffCustomerOperations.test.js | neu | Phase B Tests (Zero-State, Mapping, Filter-Bindings, Enum-Sanitisierung, Clamp, Detail-404/UUID, Risiko-Ableitung) | keine | 11/11 grün, eslint 0 |
| frontend/src/staff/modules/customer-operations/index.tsx | neu | Phase B Slice 2: SCC Customer-Operations-Modul (Master-Detail, Filter/Suche/Pagination, Drilldown ins Abo-Modul) | niedrig (read-only, eigenes Code-Split-Chunk) | build:scc grün (tsc+vite) |
| frontend/src/staff/components/shell/Sidebar.tsx | geändert | Phase B Slice 2: AreaKey + AREAS-Eintrag „Customer Operations" (Gruppe Arbeitsplatz) | niedrig (additiver Nav-Eintrag) | build:scc grün |
| frontend/src/staff/components/shell/AppShell.tsx | geändert | Phase B Slice 2: lazy-Import + ActiveModule-Branch für customer-operations | niedrig (additive Route) | build:scc grün |

| api/config/index.js | geändert | Phase D Slice 0: `BILLING_PROVIDER`-Env (stripe/manual/disabled, leer=Ableitung) | niedrig (additiv, rückwärtskompatibel) | config-Validierung unberührt |
| api/services/billingProviderService.js | neu | Phase D Slice 1: Provider-Abstraktion (resolve/describe/mapStripeEvent), rein funktional, manual-first | niedrig (kein DB/IO, additiv) | billingProviderService.test.js 26/26 |
| api/routes/payment.js | geändert | Phase D Slice 1: `/payment/config` +`billing`-Block; Webhook-Dispatch über mapStripeEvent (seiteneffekt-identisch); Dunning-Kommentar | niedrig (additiv + behavior-preserving) | payment.route.test.js 31/31 (Backwards-Compat) |
| api/test/billingProviderService.test.js | neu | Phase D Slice 1 Tests (Auflösung, Capabilities, Event-Mapping, Garbage-Safety) | keine | 26/26 grün, eslint 0 |

| api/services/staffBillingOverviewService.js | neu | Phase D Slice 2: read-only SCC-Billing-Aggregat (describeBilling + invoices-Summen je Status + listInvoices) | niedrig (read-only, KEINE Migration/Mutation, Zero-State) | staffBillingOverview.test.js 8/8 |
| api/routes/staffControlCenter.js | geändert | Phase D Slice 2: GET /billing/overview, /billing/meta (requireStaff, read-only) | niedrig (additive Routen) | node --check + Service-Tests |
| api/test/staffBillingOverview.test.js | neu | Phase D Slice 2 Tests (Provider-Shape, Zero-State, Aggregation/Mapping, Status-Sanitisierung+Clamp, Param-Forward) | keine | 8/8 grün, eslint 0 |
| frontend/src/staff/modules/billing/index.tsx | neu | Phase D Slice 2: SCC Billing-Modul (Provider-Karte + Totals-KPI + Summen-je-Status + Letzte-Rechnungen, read-only) | niedrig (read-only, eigenes Code-Split-Chunk, kein neues CSS) | build:scc grün (62 Module) |
| frontend/src/staff/components/shell/Sidebar.tsx | geändert | Phase D Slice 2: AreaKey + AREAS-Eintrag „Billing" (Gruppe Strategie) | niedrig (additiver Nav-Eintrag) | build:scc grün |
| frontend/src/staff/components/shell/AppShell.tsx | geändert | Phase D Slice 2: lazy-Import + ActiveModule-Branch für billing | niedrig (additive Route) | build:scc grün |

| api/services/staffBillingOverviewService.js | geändert | Phase D Slice 3: `loadAttention`/`mapAttention`/`ATTENTION_LIMIT` + 3. parallele Query → `attention[]`+`scope.attention_limit` (überfällige Forderungen, älteste zuerst) | niedrig (read-only, additiv, KEINE Mutation/Migration) | staffBillingOverview.test.js 8/8 |
| api/routes/payment.js | geändert | Phase D Slice 3: `payment_failed`-Webhook-Zweig = logger.warn (Observability), KEIN Seiteneffekt/Auto-Cancel/Mail | niedrig (behavior-preserving, returnt weiter received:true) | payment.route.test.js 32/32 |
| api/test/staffBillingOverview.test.js | geändert | Phase D Slice 3: sequencePool 3-Antworten + Attention-Assertions + Zero-State `attention:[]` + `scope.attention_limit` | keine | 8/8 grün, eslint 0 |
| api/test/payment.route.test.js | geändert | Phase D Slice 3: Test `invoice.payment_failed` = received:true + warnCalled + keine DB-Berührung + keine Mail | keine | 32/32 grün, eslint 0 |
| frontend/src/staff/modules/billing/index.tsx | geändert | Phase D Slice 3: Abschnitt „Überfällig · Inkasso-Worklist" (days_overdue-Severity >14 danger, Zero-State, Limit-Hinweis), AttentionRow-Typ, `dunningTone()` | niedrig (read-only, kein neues CSS) | build:scc grün (62 Module) |

| api/services/emailProviderService.js | neu | Phase E: Email-Provider-Abstraktion (resolve/describe, console/smtp/sendgrid/disabled), rein funktional, KEINE neue Dependency | niedrig (kein DB/IO, additiv) | emailProviderService.test.js 21/21 |
| api/config/index.js | geändert | Phase E: `EMAIL_PROVIDER` + `SENDGRID_API_KEY`-Env (leer=Ableitung) | niedrig (additiv, rückwärtskompatibel) | node --check |
| api/services/emailService.js | geändert | Phase E: provider-fähiger Transport (SendGrid via SMTP-Relay, SMTP unverändert, console/disabled=Log-only) + `describe()`-Export; sendMail-Signatur identisch | niedrig (preserve-first, Default-Pfad byte-identisch) | subscriptionNotifications.test.js 43/43 (kein Regress) |
| api/test/emailProviderService.test.js | neu | Phase E Tests (Auflösung+Präzedenz, Capabilities-Ehrlichkeit, Degradierung, unbekannter Provider, Garbage-Safety) | keine | 21/21 grün, eslint 0 |
| .env.example | geändert | Phase E: Provider-Auswahl-Block (EMAIL_PROVIDER/SENDGRID_API_KEY) im E-Mail-Abschnitt (adressiert R5 Email-Dimension) | keine | n/a (Doku) |

> Hinweis: Phase A war read-only. Erste Code-Einträge ab Phase J (Design-first, Owner-Vorgabe): isolierter Design-Diff (kein Misch-Diff über Billing/SCC/Auth). SCC-Theme-Control + Backend folgen als Block 2.
