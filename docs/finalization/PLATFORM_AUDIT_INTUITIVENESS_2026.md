# Plattform-Gesamtaudit + Intuitivitäts-Bauanleitung + Markteintritts-Roadmap

> Erstellt 2026-06-20 · 8-Agenten-Audit (Navigation/Intuitivität, Test-Coverage, SaaS-Reife, Enterprise-Reife, Commercial/Pilot, Wettbewerb, UX-Best-Practices → Synthese). Repo: `12_tempconnect_docker(D)` · Branch `release/enterprise-premium-market-ready`.

## 0. Verdikt

TempConnect ist **technisch weit überdurchschnittlich reif** für ein VMS-light vor Markteintritt: starke RBAC/Org-Boundary-Fundamente (250+ 403-Guards, 9-Level-Rollenhierarchie), append-only Audit, ~4.700 grüne Unit-Tests, gehärtetes Pilot-Lifecycle-Modell, drei vollständige React-Center (OCC/SCC/SOC). Der schärfste verbleibende Hebel ist **nicht Technik**, sondern **(a) kommerziell-operativ** (UG-Gründung, Secret-Rotation, SCC-Production-Deploy, dokumentierter Contract→Activation→Invoice-Runbook) und **(b) Aktivierungs-UX**: die „Next-Best-Action"-Daten existieren backendseitig, werden aber **nicht** prominent gerendert; Premium-Guidance (`contextHints`) ist hart auf Demo beschränkt — zahlende Erstkunden bekommen sie nicht.

## 1. Reife-Scores

| Dimension | Score | Kernaussage |
|---|---:|---|
| **Enterprise-Reife** | **86%** | RBAC/Org-Boundary/Audit/MFA stark + getestet. Lücken: SSO nur Stub (kein SAML in Prod), Scope-Transparenz nicht überall verdrahtet. |
| **Intuitivität** | **74%** | Exzellente Bausteine (rollenbewusstes Onboarding, Checklist, Empty-States, Scope-Bars, Breadcrumbs) — aber NBA nicht auf Hub, Guidance demo-only, Detail-Navigation/Liquidität/Worker-Silo offen. |
| **Test-Coverage** | **72%** | ~4.700 Unit + Security + Integration + E2E stark. Lücken: React-Center 0 Tests, **Timesheet-Audit-Security fehlt (kritisch, zahlungsrelevant)**, Deal-Saga/Pilot-Conversion nicht end-to-end. |
| **SaaS-Reife** | **62%** | Pläne/Stripe/Invoices+PDF/State-Machine da, bewusst manual-first. Fehlt für echten Self-Service: Recurring-Billing-Cron, Dunning mit Status-Mutation, Overage-Charging. |

## 2. Differenzierungs-These (die EINE gewinnende Positionierung)

> **Das erste VMS, das dem EINKÄUFER gehört — nicht der Agentur.** Echtzeit-Notdienst-Personal aus deinem kuratierten, neutral verglichenen Lieferantenpool, AÜG-/DSGVO-nativ auf deutschen Servern, **live in 24 Stunden statt nach 6-Wochen-Implementierung.**

Whitespace im Markt:
- **Enterprise-VMS** (SAP Fieldglass, Beeline): Governance ja, Echtzeit nein, ungeeignet <1000 MA, schwere Implementierung.
- **DACH-Suiten** (zvoove, Landwehr, Compana): optimieren den **Verleiher**, nicht den Einkäufer.
- **Pixid**: von Adecco/Manpower/Randstad gegründet → **nicht glaubwürdig neutral**.
- **Schicht-Apps** (Zenjob, Coople): Echtzeit ja, **kein Steuerungs-/Governance-Layer**.
- **US-Player** (Worksuite, Prosperix): nicht AÜG/DSGVO-nativ.

→ TempConnect kombiniert **Buyer-first Governance** (Spend-Transparenz, eigene Rate-Cards, neutraler Vergleich) **+ Echtzeit-Marktplatz** (Notdienst aus Pool) **+ Audit/Compliance**. Diese Kombination bietet **kein** Wettbewerber.

## 3. Bauanleitung „A–Z intuitiv werden" (jeder weiß was wo + logische nächste Schritte)

| Schritt | Titel | Was | Aufwand | Wo |
|---|---|---|---:|---|
| **A** | **Next-Best-Action-Karte auf dem Hub** | `suggested_next`/`suggested_next_link` aus `/api/onboarding/status` als EINE prominente Aktionskarte oben im Hub rendern. Daten existieren (`onboardingService.js:264-281`), werden in `enterpriseHub.js` 0× genutzt. | **S** | `enterpriseHub.js`, `enterprise.html` |
| **B** | **Premium-Guidance für zahlende Kunden** | `contextHints.js` vom harten Demo-Guard (Z.24-29) lösen, an Onboarding-Fortschritt koppeln (solange `progress_pct<100` ODER erste N Tage). | **S** | `contextHints.js` |
| **C** | **Pseudo-Schritt durch echtes Aktivierungs-Event ersetzen** | `platform_explored` (nur per Dismiss erfüllbar) → verhaltensbasiert (`first_deal` als North-Star/Aha-Moment). | **S** | `onboardingService.js:157-168` |
| **D** | **Einheitliche Empty-States (Doppel-CTA)** | Überall: Icon + Title + Text + Primär-CTA (create) + Sekundär-CTA (browse/filter/help) + Learn-Link. `gefiltert-leer` vs `echt-leer` (Vorlage `requisitions.js:256-261`) auf Deals/Marketplace übertragen. | **M** | `requisitions.html`, `deal_management.html` |
| **E** | **Inline-Nächste-Aktion auf Listenzeilen** | Je Zeile den nächsten Schritt zeigen („Angebot erhalten → Jetzt beantworten"). `.dm-card__nextstep` von Cards auf Zeilen + andere Listen ausweiten. | **M** | `requisitions.js`, `deal_management.html` |
| **F** | **Detailseiten: Breadcrumb + Zurück + Related-Nav** | `breadcrumb.js` AREAS-Map um `offer_detail/requestDetail/capacityExchangeDetail` erweitern; Cross-Links (Deal→Assignments→Timesheet); Not-Found-Fallback (`vendorPool.js:27-39`). | **M** | `breadcrumb.js`, Detailseiten |
| **G** | **Rollen-/Plan-Gating sichtbar erklären** | Bei gesperrten Cards Tooltip mit Grund + Pfad („Preisrahmen · PRO+ erforderlich · Upgrade ansehen"). `hidden_*`-Reasons existieren in `hubVisibility.js`. | **M** | `hubVisibility.js`, `enterpriseHub.js` |
| **H** | **Marktplatz-Liquiditäts-Puls + Supply-first-Seeding** | Pro Region/Skill zeigen, wie viel Gegenseite aktiv ist („14 offene Angebote in Ihrer Region"). Cold-Start: erst Supply seeden. | **L** | Marketplace/Capacity-Feeds |
| **I** | **Worker-Portal in Plattform-Nav integrieren** | `einsatzportal-*` mit Breadcrumb + in `NAV_RULES`/`HUB_SURFACES` abbilden (kein Silo). | **M** | `einsatzportal-*`, `breadcrumb.js`, `hubVisibility.js` |
| **J** | **Frontend-Test-Fundament + kritische E2E** | Vitest für OCC/SOC/SCC (0 Tests heute); **Timesheet-Audit-Security-Test (kritisch)**; E2E Deal-Saga + Pilot→Live. | **L** | `frontend/` (Vitest), `api/test/security/`, `e2e/` |

## 4. „Sofort startklar für den ersten ZAHLENDEN Pilotkunden"

> Reihenfolge = Kritikpfad. **O** = Owner/Infra (nicht von Claude baubar), **C** = von Claude baubar.

1. **(O) UG-Gründung abschließen** — ohne HRB+Steuernummer keine §14-UStG-konforme Rechnung / §5-DDG-Impressum → kein legaler Revenue. ~8–11 Wochen. **Härtester Blocker.**
2. **(O) Secret-Rotation** (SESSION/STAFF_SESSION_SECRET, DB-PW, Stripe-Keys, Sentry-DSN) — vor erstem Kunden. ~30 Min. (`PILOT_GO_LIVE_TODOS.md:28-47`)
3. **(O) SCC in Produktion deployen** (`staff.tempconnect.de`, TLS, `STAFF_USER_IDS`) — Code 100% fertig, aber ohne Live-SCC kein Pilot-Onboarding/-Aktivierung/-Support. ~2–4h Infra.
4. **(C) Pilot→Paid Activation-Runbook** dokumentieren + verdrahten (Wer triggert `contract_requested→pilot`? Wann `subscription_requests.activate()`? Wann Pilot-Rechnung?). → `docs/enterprise-readiness/PILOT_CUSTOMER_RUNBOOK.md`.
5. **(C) Pilot-Invoice-Pfad testen** (`billing_mode='pilot_contract'` + `pilot_price_cents` → Line-Items + PDF) + Auslöser definieren.
6. **(O) Pricing final bestätigen** (BASIS/PLUS/PRO/INDIVIDUELL + Premium-Add-on + per-Seat). ~15 Min.
7. **(C) Support-Kanal + Monitoring scharfschalten** (SOC erreichbar, org-isolierter Support-Case-Flow einmal real durchspielen).

## 5. Top-Prioritäten (in Reihenfolge)

1. **Kritikpfad Markteintritt** (O): UG-Gründung + Secret-Rotation + SCC-Production-Deploy.
2. **Pilot→Paid-Runbook** (C) verdrahten + Pilot-Invoice-Pfad testen.
3. **Aktivierungs-UX** (C): NBA-Karte (A) + contextHints freischalten (B) + echtes `first_deal`-Event (C) — höchster Time-to-Value-Hebel, kleinster Aufwand.
4. **Kritische Test-Lücke** (C): Timesheet-Audit-Security (zahlungsrelevant), dann Deal-Saga + Pilot-Conversion.
5. **Intuitivität durchgängig** (C): Empty-States (D) + Inline-NBA (E) + Detail-Breadcrumb/Related (F).
6. **Differenzierung kommunizieren** (C/O): buyer-first + Echtzeit-Notdienst + DSGVO/Hetzner + „live in 24h" als EINE Botschaft im One-Pager/Hero.
7. **Marktplatz-Liquidität** (C): Liquiditäts-Puls + Supply-first + Hamburg-30+30-Kohorte.
8. **SaaS-Self-Service** (C, nach Gründung): Recurring-Cron + Dunning + Overage → Skalierung 10→300 ohne Staff-Intervention.

---
*Quelle: 8-Agenten-Audit (652k Token, 258 Tool-Calls). Owner-Tasks bleiben owner-gated; Claude-baubare Punkte (C) sind inkrementell + getestet umsetzbar.*
