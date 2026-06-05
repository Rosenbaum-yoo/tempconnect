# TempConnect — Enterprise Gap Register

> Vollständige, transparente Liste aller bekannten Lücken, Risiken und offenen Entscheidungen.
> Kein verstecktes Risiko — alles hier dokumentiert.
> WAVE 15 — Phase 2 — 2026-05-27 · **Refresh 2026-06-05** (Track-B-Abschluss + Phase-2-Commercial-Refactor)

---

## Go-Live Owner-Action Register — konsolidiert (Stand 2026-06-05)

> Konsolidiert den GESAMTEN verbleibenden Marktstart-Scope in EINE Owner-Checkliste, mit Evidenz je Punkt.
> Disziplin (99_GOLIVE_GATE / CLAUDE.md): „Fertig" entscheidet der Owner; Phase-5-Diffs bleiben uncommitted bis
> Owner-Freigabe. Befund: der verbleibende Scope ist **überwiegend owner-/extern-gated** — kein großer
> autonomer Bau mehr offen ohne Berührung des Owner-Gates oder des laufenden Refactors.

### A. Verifiziert grün — autonom abgeschlossen (nur Kenntnisnahme)

| ID | Punkt | Evidenz |
|---|---|---|
| G-01 | Track-B Einsatzportal (Worker-Self-Service) abnahmebereit | `docs/releases/EINSATZPORTAL_GO_LIVE_DECISION.md` — 17/20 automatisiert, Browser-Smoke `e2e/.../einsatzportal-worker-flow.spec.js` 8/8 |
| G-02 | Demo-Seed-Backdoor (052) geschlossen | PILOT_GO_LIVE_TODOS **P0.6** — Commit `bc24e58`, Env-Flag-Gate `SEED_DEMO_WORLD` + Remediation-Mig 125 |
| G-03 | Migrations-Chain + Deny-by-Default-RLS forward-repariert | **P0.7** — Commit `bc24e58`, Mig 126 (scharf beim nächsten migrate-Lauf gg. Managed-/Nicht-Superuser-DB) |
| G-04 | Fresh-Install-Integrität | 127 Migrationen, 0 Fehler (Wegwerf-DB-Verify, beide Flag-Pfade) |
| G-05 | 8 commercial/entitlement-Integrationsfehler triagiert — **kein Worker-Portal-Defekt** | `docs/finalization/finalization_worklog.md` (Triage 2026-06-05): 4× FEATURE_GATE_BYPASS-Artefakt (CI-grün), 2× 429 rate/quota, 2× refactor-gekoppelt |

### B. Owner-/extern-gated — erfordert Owner-Handlung (NICHT Claude-autonom)

| ID | Punkt | Owner-Action | Quelle |
|---|---|---|---|
| O-01 | Secret-Rotation vor erstem Pilotkunden | SESSION-/STAFF_SESSION-/DB-PW rotieren; Stripe/Sentry-Keys (>6 Mon.) | PILOT_GO_LIVE_TODOS **P0.4** |
| O-02 | Staff Control Center produktiv schalten | Nginx-VHost `staff.*`, `STAFF_USER_IDS`, `STAFF_SESSION_SECRET`, TLS, optional `HETZNER_CLOUD_TOKEN` | **P1.0** |
| O-03 | Phase-2-Commercial-Refactor reviewen + committen | Working-Tree-Review (`entitlementService`/`payment`/`staffControlCenter` + neu `individuellPricingService`/`orgAccessSuspensionService` + Mig 127); Live-Stripe/Login-Durchstich. Refactor-eigene Tests **grün** (92/92 + 20/20 + 84/84) | finalization_worklog 2026-06-05 |
| O-04 | Mig 127 (org_access_suspension) im **Prod**-migrate-Pfad anwenden | migrate-Lauf gg. Prod/Managed-DB (lokal bereits angewandt) | Mig 127 Header |
| O-05 | MFA-Enforcement owner/admin/finance | Enforce-Modus + Enrollment-Frist entscheiden | ID-01 (unten) |
| O-06 | SSO: Option A (SAML bauen) vs. B (dauerhaft soft-lock) | Roadmap-Entscheidung | ID-03 (unten) |
| O-07 | Preise + Stripe-Live-Keys (WAVE 13) | Reale Preise setzen, Live-Keys einspielen | `finalization/phase2_release/WAVES.md` WAVE 13 |
| O-08 | Restore-Drill (mind. 1×) + Prod-Compose ohne Dev-Mounts (WAVE 12) | Backup→Restore real durchführen | WAVES.md WAVE 12 |
| O-09 | Pre-Production Burn-in ≥7 Tage (WAVE 16) | Preprod-Stack betreiben, P0/P1-frei | `docs/releases/WAVE16_BURNIN_RUNBOOK.md` |
| O-10 | Rechtstexte / Datenschutz | AGB/DSGVO/Impressum final | `finalization/WAVE_14_legal_dataprotection.md` |
| O-11 | Rate-Limit-Redis-Store (Multi-Instance) | Infra-Entscheidung #Instances → `RATE_LIMIT_STORE=redis` | W11-02 (unten) |

### C. Offen-autonom — Claude-safe, klein (auf Zuruf)

| ID | Punkt | Hinweis |
|---|---|---|
| C-01 | Bypass-aware Test-Guards für die 4 `FEATURE_GATE_BYPASS`-Fehler | wie die P1-B-Fixes; entkoppelt Test vom Docker-Env. Kein Produktcode. |
| C-02 | Querschnitt-Worker-Ausschluss-Guard auf `/payment/checkout` (+`/individuell`) | klein, aber refactor-nah → Owner-Freigabe nötig (berührt in-flight Refactor) |

> **Befund-Kernsatz:** Bucket C ist bewusst dünn. Das ist die ehrliche Lage eines reifen Repos in
> Finalisierung — die Marktstart-Restarbeit ist Owner-Entscheidung/Infra/extern, nicht Neubau.

### Korrekturen zu Alt-Einträgen (2026-05-27 → 2026-06-05)
- **RLS:** „116 aktiv auf 10 Kerntabellen" war faktisch nie scharf (P0.7-Root-Cause: `migrate.sh` ohne `ON_ERROR_STOP` maskierte den 116-Rollback). **Mig 126** repariert Deny-by-Default + FORCE RLS forward → aktiv beim nächsten migrate-Lauf gg. Managed-DB. W11-01 „Mig 117 geplant" ist damit durch den 126-Forward-Repair ersetzt.
- **OCC-01:** OCC ist inzwischen vollständig (11/11 Module real implementiert, siehe CLAUDE.md-Empfehlungsliste P2-C/P3-B) — der Eintrag „Phase 2-15 ausstehend" ist überholt.

---

## Legende

| Priorität | Bedeutung |
|---|---|
| **P0 — Blocker** | Verhindert Go-Live. Muss vor Release behoben werden. |
| **P1 — Hoch** | Wesentliches Risiko. Owner-Entscheidung erforderlich. |
| **P2 — Mittel** | Bekanntes Risiko, akzeptiert für Pilot. Zeitplan definieren. |
| **P3 — Niedrig** | Qualitätsverbesserung, kein Sicherheitsrisiko. |

---

## P0 — Produktionsblocker (alle behoben)

Zum Zeitpunkt des Enterprise Evidence Pack (WAVE 15) gibt es **keine offenen P0-Blocker**.

Alle früheren Blocker wurden behoben:
- ✅ `npm audit` — 0 High/Critical Vulnerabilities
- ✅ Keine echten Secrets im Repository
- ✅ RLS aktiv auf 10 Kerntabellen
- ✅ CSRF auf allen mutierenden Endpunkten
- ✅ CORS — kein Wildcard in Production
- ✅ SSO Stub in Production blockiert

---

## P1 — Hohe Priorität (Owner-Entscheidung erforderlich)

### ID-01: MFA-Pflicht für owner/admin nicht erzwungen

| Feld | Wert |
|---|---|
| **Beschreibung** | MFA ist implementiert (opt-in), aber für kritische Rollen nicht erzwungen |
| **Risiko** | Schwache Passwörter bei Admins → Account-Übernahme möglich |
| **Mitigation** | `requireMfa` Middleware vorhanden, kann in Enforce-Modus geschaltet werden |
| **Empfehlung** | 30-Tage Enrollment-Frist → Pflicht-Enforcement für owner/admin/finance |
| **Owner-Entscheidung** | Ausstehend |
| **Referenz** | `docs/security/IDENTITY_MODEL.md` Sektion ID-01 |

### ID-03: SSO/SAML nicht produktionsreif

| Feld | Wert |
|---|---|
| **Beschreibung** | SSO ist soft-locked (Option B). `@node-saml/node-saml` nicht installiert. |
| **Risiko** | Enterprise-Kunden mit SSO-Anforderung können nicht bedient werden |
| **Mitigation** | Stub ist in Production blockiert (403). Kein Fake-SSO. |
| **Empfehlung** | Option A: Vollständige SAML-Implementierung (4-6 Wochen) |
| **Owner-Entscheidung** | Dauerhaft Option B oder Roadmap-Item Option A? |
| **Referenz** | `docs/security/IDENTITY_MODEL.md` Sektion SSO |

---

## P2 — Mittlere Priorität

### W11-01: RLS auf ~60 weiteren Tabellen ausstehend

| Feld | Wert |
|---|---|
| **Beschreibung** | Migration 116 schützt 10 Kerntabellen. ~60 weitere Tabellen haben noch keine RLS-Policies. |
| **Risiko** | DB-seitig unvollständige Isolation (App-Layer und Query-Layer schützen vollständig) |
| **Mitigation** | 3-schichtige Isolation: App + Query + DB. App+Query decken alle ~70 Tabellen. |
| **Zeitplan** | Migration 117 — geplant, Datum TBD |
| **Referenz** | `docs/security/TENANT_ISOLATION_MODEL.md` |

### W11-02: Rate-Limit-Store Memory (Single-Instance)

| Feld | Wert |
|---|---|
| **Beschreibung** | Rate-Limit-Store ist Memory-basiert. Bei Multi-Instance-Deployment gelten Limits per Instance. |
| **Risiko** | Horizontale Skalierung führt zu effektiv höheren Rate-Limits (Faktor N Instances) |
| **Mitigation** | `RATE_LIMIT_STORE=redis` ENV vorhanden. Redis ist konfiguriert für Session-Store. |
| **Lösung** | Redis als Rate-Limit-Store aktivieren (1-Stunden-Aufwand nach Infra-Entscheidung) |
| **Owner-Entscheidung** | Infra-Entscheidung: Wie viele Instances im Production-Deployment? |

### OCC-01: Owner Control Center Phase 2–15 ausstehend

| Feld | Wert |
|---|---|
| **Beschreibung** | OCC React-Shell ist aufgebaut (Phase 1). Business-Logik-Module (Executive, Revenue, Platform) ausstehend. |
| **Risiko** | Owner-Tools nicht vollständig — manuelle Prozesse über SCC nötig |
| **Mitigation** | Staff Control Center deckt alle kritischen Owner-Funktionen ab |
| **Zeitplan** | OCC Phase 2-8 ist nächster Major-Milestone |

---

## P3 — Niedrige Priorität

### ID-02: MFA-Pflicht für Staff SCC (ergänzend zu Step-Up)

| Feld | Wert |
|---|---|
| **Beschreibung** | SCC hat Step-Up Re-Auth (15min). Zusätzliche MFA-Pflicht für Staff-Login selbst fehlt. |
| **Risiko** | Gering (Step-Up bietet bereits re-auth) |
| **Empfehlung** | Nice-to-have nach ID-01 |

### ID-05: Recovery Code Regeneration UI

| Feld | Wert |
|---|---|
| **Beschreibung** | Recovery-Codes können aktuell nicht über UI regeneriert werden |
| **Risiko** | Gering — Codes können via API regeneriert werden |
| **Lösung** | UI-Button in MFA-Einstellungen |

---

## Gap-Summary

| Priorität | Offen | In Arbeit | Geschlossen |
|---|---|---|---|
| P0 | 0 | 0 | 3+ |
| P1 | 2 | 0 | — |
| P2 | 3 | 0 | — |
| P3 | 2 | 0 | — |
| **Gesamt** | **7** | | |

---

## Kommunikation gegenüber Kunden

**Was darf gesagt werden:**
- ✅ "MFA ist verfügbar und für kritische Rollen empfohlen" (aber nicht: "MFA ist Pflicht")
- ✅ "SSO ist auf der Roadmap für den INDIVIDUELL-Tarif" (aber nicht: "SSO ist live")
- ✅ "Mandanten-Isolation ist dreifach abgesichert (App + Query + DB)"
- ✅ "RLS ist aktiv auf allen Kerndaten-Tabellen"

**Was nicht gesagt werden darf:**
- ❌ "MFA ist für alle Admins verpflichtend" (ist sie nicht)
- ❌ "SSO ist produktionsreif" (ist es nicht)
- ❌ "Alle Tabellen sind RLS-geschützt" (~60 Tabellen fehlen noch)

---

*WAVE 15 — Phase 2 — 2026-05-27*
*Zuständig: Security/Architecture (Claude), Freigabe: Owner*
