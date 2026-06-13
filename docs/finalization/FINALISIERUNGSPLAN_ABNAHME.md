# TempConnect — Finalisierungsplan bis zur finalen Abnahme (Marktstart)

> **Zweck:** DER eine Vorwärts-Plan vom heutigen Stand bis zum ersten echt zahlenden Kunden.
> Konsolidiert: 6-Lens-Audit (2026-06-11) · `ENTERPRISE_GAP_REGISTER.md` (O-01–O-11) ·
> `phase5_manual_tasks_checklist.md` · `PILOT_GO_LIVE_TODOS.md` (P0.4/P1.0/P1.4/E-01/P2.x) ·
> `99_GOLIVE_GATE.md` (Teil 1 A–H + Teil 4) · `WAVE16_BURNIN_RUNBOOK.md` · Track-B-Restpunkte.
> **Detail-Begründungen bleiben in den Quell-Dokumenten — hier stehen nur Reihenfolge,
> Verantwortung, Aufwand und Abnahmekriterium.** Status hier pflegen (Checkboxen).
>
> **Zieltermin (aktualisiert 2026-06-11, Owner-Input):** ✅ **Di, 01.09.2026 — erster zahlender Kunde**
> (Stretch-Ziel bei schneller Gründung: 17.08.2026). Grund: **UG-Gründung steht noch aus** —
> Rechnungen brauchen rechtlich eine Steuernummer (§14 UStG) und das Impressum die HRB-Nummer;
> die Gründungskette (Notar → Stammkapital-Konto → Handelsregister → Finanzamt) dauert
> realistisch 8–11 Wochen und ist damit der kritische Pfad. Der Code-/Infra-Teil läuft
> vollständig parallel und ist deutlich früher fertig.
> **Abnahme-Regel (Gate Teil 4):** „Fertig" erklärt der **Owner**, nicht Claude.
>
> Erstellt: 2026-06-11 · Beweisbasis: Unit-Suite **4490/4490/0**, Audit-Gesamtnote **7,9/10**,
> Migrationen bis **133** angewandt, Bucket C des Gap-Registers **leer**.

---

## Terminübersicht

| Welle | Zeitraum | Inhalt | Verantwortlich |
|---|---|---|---|
| **F0** | 11.–15.06. | Plan-Fixierung + Start Owner-Qualitätsphase | Owner + Claude |
| **G** ⚠️ | **ab 12.06., kritischer Pfad** | **UG-Gründung:** Notar → Konto/Stammkapital → HR-Eintragung → Steuernummer | Owner (+ Notar/Bank/Amt) |
| **F1** | 16.–24.06. | Code-Schlussarbeiten (Audit-Quick-Wins, Harness-Folge) | Claude |
| **F2** | Juni (parallel) | Owner-Entscheidungen (Preise, Premium, MFA/SSO, Provider) | Owner |
| **FQ** | Juni–Juli (laufend) | **Owner-Qualitätsphase:** freies Testen, Befunde → Claude fixt | Owner + Claude |
| **F3** | Juli (KW 28–29) | Produktionsaufbau **Hetzner** (Infra, Prod-DB, SCC, Monitoring, Drill) | Owner + Claude |
| **F4** | Aug (KW 32–33) | Burn-in ≥7 Tage + Abnahmetests | Owner + Claude |
| **F2.1** | Aug (nach HR-Eintrag) | Rechtstexte **aus Plattform-Vorlagen** + echte Firmendaten (HRB, Steuernr.) | Owner + Claude |
| **F5** | KW 35 (25.–28.08.) | **Finale Abnahme** (Gate Teil 1 A–H + Sign-off) | Owner |
| **F6** | ab **01.09.** | Marktstart + Hypercare + Gate-50-Vorbereitung | Owner + Claude |

**Kritischer Pfad = Welle G (Gründung):** Notartermin muss **diese Woche** gebucht werden —
jede Woche Verzug schiebt den Marktstart 1:1. Code (F1), Qualität (FQ), Entscheidungen (F2)
und Hetzner (F3) laufen vollständig parallel und warten am Ende NUR auf Steuernummer + Rechtstexte.

---

## Welle F0 — Plan-Fixierung & Beweisbasis (11.–12.06.)

### Phase F0.1 — Plan committen + Owner-Priorisierung
- [x] Dieser Plan liegt im Repo (`docs/finalization/FINALISIERUNGSPLAN_ABNAHME.md`)
- [ ] Owner liest G+F1–F5, streicht/ergänzt, bestätigt den 01.09. als Ziel (Stretch 17.08.)
- **Abnahme:** Owner-Nachricht „Plan bestätigt" (ggf. mit Änderungen)

### Phase F0.2 — Beweisbasis dokumentiert (erledigt 11.06.)
- [x] Volle Unit-Suite 4490/4490/0 (Container, offizieller Runner)
- [x] 6-Lens-Audit mit Noten (Migrationen 8,5 · Security 8,0 · Skalierung 7,0 · Backend 8,2 · Frontend 7,7 · CI/CD 7,8)
- [x] Gap-Register Bucket C leer; C-01/C-02 geschlossen; O-03 committet
- **Abnahme:** erfüllt (Commits `ea5b769` + Audit in Session 2026-06-11)

---

## Welle G ⚠️ — UG-Gründung & Firmendaten (Owner · ab 12.06. · KRITISCHER PFAD)

> Ohne eingetragene Gesellschaft + Steuernummer keine rechtssichere Rechnung (§14 UStG)
> und kein vollständiges Impressum (§5 DDG: Firma, HRB, Vertretungsberechtigte, USt-IdNr).
> Realistische Gesamtdauer 8–11 Wochen — deshalb SOFORT starten, alles andere läuft parallel.

### Phase G.1 — Notar (Ziel: Termin bis 20.06., Beurkundung bis 30.06.)
- [ ] Notartermin **diese Woche buchen** (Wartezeit oft 1–2 Wochen)
- [ ] **Musterprotokoll** nutzen (1 Gründer/Geschäftsführer, Standard-UG → schneller + günstiger als individuelle Satzung)
- [ ] Firmenname vorab bei IHK auf Eintragungsfähigkeit prüfen lassen (kostenlos, vermeidet Notar-Schleife)
- [ ] Stammkapital festlegen (Empfehlung: nicht 1 € — z. B. 500–1.000 € für Konto-/Geschäftsfähigkeit)
- **Abnahme:** Beurkundung erfolgt → ab jetzt „UG (haftungsbeschränkt) i.G."

### Phase G.2 — Konto & Einzahlung (parallel, Ziel: bis 04.07.)
- [ ] Geschäftskonto eröffnen (Fintech wie Qonto/Finom = Tage statt Wochen; klassische Bank = 1–2 Wochen)
- [ ] Stammkapital einzahlen, Einzahlungsbeleg an Notar → Notar meldet ans Handelsregister
- **Abnahme:** HR-Anmeldung durch Notar raus

### Phase G.3 — Eintragung & Ämter (Ziel: bis Ende Juli / Anfang August)
- [ ] **HR-Eintragung** abwarten (typisch 2–4 Wochen) → HRB-Nummer
- [ ] Gewerbeanmeldung (Tage) · IHK-Meldung kommt automatisch
- [ ] **Steuerliche Erfassung SOFORT nach Beurkundung via ELSTER einreichen** (nicht auf HR warten — spart 2–4 Wochen!) → Steuernummer (typisch 3–6 Wochen) + USt-IdNr beantragen
- [ ] Geschäftsführer-Basics: Geschäftsadresse, ggf. Transparenzregister-Eintrag (Pflicht!)
- **Abnahme:** HRB-Nr. + Steuernummer liegen vor → Rechnungsstellung rechtlich möglich

### Phase G.4 — Plattform-Übergabe der Firmendaten (Claude, 0,5 PT, nach G.3)
- [ ] Firmendaten zentral einpflegen: `invoicePdfService.js` COMPANY-Block (Name/Adresse/USt-IdNr), Impressum, AGB-/DSE-Platzhalter, Footer, `subscriptionDocumentDisclaimer`
- **Abnahme:** Rechnung-PDF + Impressum zeigen echte UG-Daten; grep auf Platzhalter = 0 Treffer

---

## Welle FQ — Owner-Qualitätsphase (Owner+Claude · Juni–Juli · laufend)

> Owner-Wunsch: „lass mich noch etwas die Plattform auf Qualität prüfen."
> Strukturierter Feedback-Loop statt Findings im Chat verlieren.

### Phase FQ.1 — Freies Testen (Owner, laufend)
- [ ] Owner testet frei (beide Rollen + Worker + Staff); Befunde als kurze Liste/Screenshots
- [ ] Claude triagiert nach `00_RULES.md` (Bug/Sichtbarkeit/UX/Commercial) und fixt in Slices
- **Abnahme:** Befundliste leer ODER Rest bewusst als Post-Launch markiert

### Phase FQ.2 — Geführte Qualitäts-Drehbücher (je ~15 Min, Claude liefert Skripte auf Zuruf)
- [ ] Kernflow Unternehmen · Kernflow Agentur (inkl. Notdienst+Premium) · Einsatzportal mobil · Staff-Tag (Moderation/DSGVO/Tresor/Incidents) · Themes/Konsole
- **Abnahme:** alle Drehbücher einmal durchlaufen, Befunde geschlossen

---

## Welle F1 — Code-Schlussarbeiten (Claude · 16.–24.06. · ~3–4 PT)

> Triage je Phase nach `00_RULES.md` Abschnitt 2; DoD nach `99_GOLIVE_GATE.md` Teil 2.
> Jede Phase endet mit Tests + Commit (Owner-Commit-Freigabe gilt als erteilt für F1-Scope,
> sofern Owner in F0.1 bestätigt).

### Phase F1.1 — Prod-Infra-Härtung (Audit: CI/CD kritisch/hoch) — 0,5 PT ✅ (12.06., Commit `9f37250`)
- [x] `docker-compose.prod.yml`: `resources.limits` (memory/cpus) + `reservations` für api/redis/frontend
- [x] `docker-compose.prod.yml`: `FEATURE_GATE_BYPASS: "false"` hart pinnen (Defense-in-Depth zu envValidator)
- [x] `nginx/nginx.conf` + `deploy/README`: TLS-Pflicht-Hinweis prominent („MUSS hinter Caddy/TLS-Proxy")
- **Abnahme:** ✅ `docker compose -f docker-compose.prod.yml config` zeigt Limits + Pin; Doku-Diff sichtbar

### Phase F1.2 — Security-Quick-Wins (Audit: Security hoch) — 1 PT ✅ (12.06., Commit `1044343`)
- [x] OCC/Staff-Session-Secret-Fallback: String-Concat → HKDF/HMAC-SHA256-Ableitung (`app.js:231`)
- [x] API-Key-Scope-Enforcement: `requireScope()` (toter Code seit WAVE_06) auf Finance-/Export-Routen verdrahten + Tests
- [x] Rate-Limit pro API-Key-ID (Limiter-Key = apiKeyId statt nur IP) auf API-Key-Pfaden
- **Abnahme:** ✅ neue Tests grün (Scope-Denial 403, KDF-Determinismus); volle Suite 0 Fehler

### Phase F1.3 — Betriebs-Sichtbarkeit & Hygiene (Audit: Backend hoch) — 1 PT ✅ (12.06.)
- [x] `.catch(() => {})`-Sweep: alle stillen Hook-Catches → `logger.warn` via `swallow()`-Helper (`utils/logger.js`); 0 stille Rest-Treffer
- [x] `companyProfile.js`: Audit-Markierung auf `res.locals.audit`-Pattern migriert (Checker-konform)
- [x] `CHANGELOG.md` (rückwirkend ab v2.0.0) + `docs/releases/RELEASE_PROCESS.md` (SemVer-Prozess)
- **Abnahme:** ✅ grep = 0 stille Treffer; Lint 0/0; Audit-Gate 373 Endpunkte grün (5 Engagement-Routen mit echten Audit-Markern, Analytics-Ingest begründet allowlisted); volle Suite **4503/4503/0**

### Phase F1.4 — Test-Harness-Folge-Slice (Register-Status-Note 2026-06-11) — 1 PT ✅ (12.06.)
- [x] CAN-1: Root-Cause = effektiver Plan ist **org-first** (`basePlan = org_plan || dbPlan`) + kaputtes `ON CONFLICT (user_id)` (kein Unique-Constraint) — Harness `ensureSubscription` setzt jetzt Subscription (UPDATE→INSERT) **und** Org-Plan, FREE→DEMO kanonisiert
- [x] HTTP-6: **PRODUKTBUG gefunden+gefixt** — `requireMfa`-Identitäts-Precheck kannte die separierte Staff-Session (`staffUserId`) nicht → 401 auf allen 24 SCC-Mutationen trotz Audit-Only-Vertrag (`enforce:false` darf nie blockieren). Fix in `requireMfa.js` + 5 neue Middleware-Tests. Zusätzlich Harness: Step-up sendet jetzt Passwort (gehärteter Refactor-Kontrakt `STEP_UP_CREDENTIAL_REQUIRED`)
- [x] workerReview #2: Root-Cause = Session-Org-Cache zeigt nach Test-Org-Umzug auf deaktivierte Alt-Membership → `org_role=null` → Capabilities false. Harness: Re-Login nach Umzug (spiegelt echtes Verhalten)
- [x] FG-3/FG-5: das „429" war NICHT der Express-Limiter, sondern **Org-Limit** `PLAN_LIMIT_REACHED listings:0` der DEMO-Org hinter dem bypassten Gate. FG-5 durch Org-Plan-Harness-Fix geheilt; FG-3 bypass-aware (Bypass-Env: 429+PLAN_LIMIT exakt asserted, CI: 403+FEATURE_NOT_ALLOWED)
- **Abnahme:** ✅ 4 Integrations-Dateien im Container **21/21/0** — null Rest-Artefakte

### Phase F1.5 — Schlussverifikation Welle F1 — 0,5 PT
- [ ] Volle Unit-Suite (Container) 0 Fehler · `npm run lint` (api) 0 Warnings · `build:occ`+`build:scc`+`build:soc` grün
- [ ] E2E lokal: `kernflow-*.spec.js` + `einsatzportal-*` + `occ-access-guards` grün
- [ ] `PILOT_GO_LIVE_TODOS.md` + Gap-Register Status nachziehen
- **Abnahme:** Abschlussbericht nach Gate-Teil-3-Format im Worklog

---

## Welle F2 — Owner-Entscheidungen & Konten (Owner · parallel Juni)

> Quelle/Detail: `phase5_manual_tasks_checklist.md` (kanonische Status-Tabelle — dort abhaken!).
> Hier nur Reihenfolge + was WANN blockiert.

### Phase F2.1 — Rechtstexte AUS der Plattform (Owner-Entscheid 2026-06-11; Timing: August, nach G.3)
> Owner: „Rechtstexte ziehen wir uns sauber aus der Plattform für die Plattform."
> Basis existiert bereits im Repo: `docs/TOMS.md`, `docs/SUBPROCESSORS.md`, `docs/AVV_TEMPLATE.md`,
> Disclaimer-Service, Trust-Center-Seiten. **Finalisierung erst nach HR-Eintrag möglich**
> (Impressum braucht HRB + Vertretungsberechtigten, AGB/AVV die Firmierung).
- [ ] Claude generiert Final-Entwürfe aus den Plattform-Vorlagen + echten UG-Daten (Impressum, Datenschutzerklärung, AGB/SaaS, AVV/DPA, TOMs, Subprocessor-Liste, Widerrufs-/B2B-Klauseln)
- [ ] Owner-Review Wort für Wort; **Empfehlung (Risikohinweis, kein Muss): 1–2 h anwaltliche Kurzprüfung der AGB/AVV vor erstem zahlenden Kunden** — Claude liefert keine Rechtsberatung
- [ ] Einbindung: Footer-Links, Registrierungs-Checkbox, noindex-Entscheide
- **Abnahme:** alle Texte live verlinkt, mit echten Firmendaten, Owner-abgenommen

### Phase F2.2 — Kommerzielle Festlegungen (bis 30.06.)
- [ ] Planpreise final bestätigen (BASIS/PLUS/PRO + INDIVIDUELL-Tiers) → `planCatalog.js` ist Quelle
- [ ] **Premium-Anzeige bestätigen:** 49 € netto / 14 Tage (oder Wert nennen → 1-Zeilen-Änderung)
- [ ] Mindestlaufzeit/Kündigungsfrist + SLA-Level je Plan
- [ ] Billing-Modus Start: **manual-first bestätigen** (empfohlen — Stripe-Keys sind dann KEIN Marktstart-Blocker; Stripe = Gate-50-Nachzug)
- **Abnahme:** Werte schriftlich fixiert; ggf. planCatalog-Anpassung durch Claude

### Phase F2.3 — Secrets & Zugänge (bis 30.06.)
- [ ] Secret-Rotation **P0.4** Block A+B(+C) nach Checkliste in `PILOT_GO_LIVE_TODOS.md`
- [ ] E-Mail: `EMAIL_PROVIDER=smtp` + Absender/Reply-To + DNS SPF/DKIM/DMARC
- [ ] Sentry-Konto/DSN + `PROMETHEUS_METRICS_SECRET` (Prod-Werte)
- **Abnahme:** Health 200 nach Rotation; Test-Mail zugestellt (SPF/DKIM pass)

### Phase F2.4 — Produkt-Restentscheidungen (bis 11.07., festlegen)
- [ ] MFA-Enforce-Modus owner/admin/finance (O-05): enforce ab wann + Enrollment-Frist
- [ ] SSO: Option B (ehrlicher Soft-Lock, Status quo) für Marktstart bestätigen (O-06)
- [ ] Notification-Polling-Intervall (Empf. 60s) + bell_priority-Schwellen (Track D)
- [ ] Schimpfwort-Liste reviewen/ergänzen (`contentModerationService.js` BADWORDS)
- [ ] Track A (Marketplace Visibility/Bounties): als Post-Launch bestätigen (Empfehlung aus MANUAL_TASKS)
- **Abnahme:** je Punkt eine Zeile Entscheidung in `phase5_manual_tasks_checklist.md`

---

## Welle F3 — Produktionsaufbau HETZNER (Owner+Claude · Juli, KW 28–29)

### Phase F3.1 — Infrastruktur (Owner, Claude liefert Runbooks) — 1 PT
- [ ] Hetzner-Server (Ziel-Setup lt. `GO-LIVE-GAP-ANALYSE.md`) + Domain + **TLS via Caddy** (`deploy/Caddyfile.example`) + Firewall (nur App→DB)
- [ ] Backup-Ziel (separater Standort) + Retention festlegen
- **Abnahme:** `https://` erreichbar, A+-Headers (HSTS), Firewall-Regeln dokumentiert

### Phase F3.2 — Prod-Datenbank + Migrationslauf (O-04) — 0,5 PT
- [ ] Managed PostgreSQL (Empfehlung) ODER self-managed Entscheid; `DATABASE_URL` + SSL
- [ ] `sql/migrate.sh` gegen Prod-DB (Chain 001–133) — **Fresh-DB-Proof** (`test-fresh-install.sh`-Assertions)
- [ ] **RLS-Scharfschaltungs-Verify:** auf Managed-DB (Nicht-Superuser) Deny-by-Default-Probe wie P0.7 (ohne Org-Kontext 0 Zeilen, korrekte Org N, Staff-Bypass N)
- [ ] `SEED_DEMO_WORLD` ungesetzt/false → 0 Demo-Konten verifizieren (P0.6-Pfad)
- **Abnahme:** Proof-Log als Artefakt in `docs/finalization/` (Migrations-Count, RLS-Probe, 0 Demo-User)

### Phase F3.3 — SCC produktiv (P1.0) — 0,5–1 PT
- [ ] Nginx-VHost `staff.*` + eigenes TLS + optional IP-Allowlist
- [ ] `STAFF_USER_IDS` (2 UUIDs) + `STAFF_SESSION_SECRET` (rotiert) in Prod-Env
- **Abnahme:** Staff-Login nur Allowlist; Org-User → 401/403; Plattform↔SCC keine Cross-Links

### Phase F3.4 — Monitoring & Cron — 0,5 PT
- [ ] Monitoring-Overlay aktiv (Prometheus/Alertmanager/Grafana) + Sentry empfängt Test-Event
- [ ] Externe Cron-Quelle für `/api/internal/*`-Sweeps (inkl. `document-center-retention-sweep`) mit `x-internal-secret` + IP-Allowlist; Zeitplan dokumentieren
- **Abnahme:** je Sweep ein manueller 200-Lauf geloggt; Alert-Testfeuer kommt an

### Phase F3.5 — Restore-Drill REAL (O-08 / P1.4) — 0,5 PT
- [ ] `backup.sh` → `backup-verify.sh` → `restore-test.sh` gegen Staging/Prod-Kopie, **Run-Log als Artefakt**
- **Abnahme:** Log zeigt vollständigen Restore in frische DB (single-transaction, exit-on-error), App startet dagegen

---

## Welle F4 — Burn-in & Abnahmetests (August, KW 32–33 · O-09/WAVE16)

### Phase F4.1 — Pre-Prod-Burn-in ≥7 Tage
- [ ] Stack lt. `docs/releases/WAVE16_BURNIN_RUNBOOK.md` betreiben; tägliche Checks (Sentry, Logs, Health, Disk)
- **Abnahme:** 7 Tage ohne offenes P0/P1; Burn-in-Protokoll geführt

### Phase F4.2 — Automatisierte Abnahme gegen Pre-Prod
- [ ] E2E-Kernflows + Einsatzportal + OCC-Guards gegen Pre-Prod grün
- [ ] **E-01:** `test:e2e:smoke` in CI grün ziehen (App+DB im Runner)
- [ ] `perf:smoke` p95 < 500ms auf Zielrouten
- **Abnahme:** CI-Lauf-Links/Logs im Burn-in-Protokoll

### Phase F4.3 — Manuelle Funktions-Abnahme (Owner, ~2h, Skript je 10 Min)
- [ ] Track-B-Rest: **Mobile-Abnahme Einsatzportal** (Gate 20) + Kontakt-Kontext-Sichtprüfung (Gate 13)
- [ ] Kernflow als Kunde: Registrierung → Angebot → Deal → Vereinbarung → Einsatz → Stundenzettel
- [ ] Neue Flächen: PDF-Tresor (Upload/Auto-Ablage/ZIP) · Bewertung→Staff-Moderation→öffentlich · Notdienst-Schnellformular→Feed-Badge · Premium-Kauf beidseitig→Boost+Monatsrechnungs-Posten · Hub-Glow/Tooltip/Deep-Link
- [ ] Beide Themes (dark/editorial) auf 5 Kernseiten, Konsole sauber
- **Abnahme:** Abhak-Protokoll mit Datum/Initialen je Punkt

### Phase F4.4 — Sicherheits-Schlussprüfung
- [ ] Gate-Teil-1-Block C (Security) Punkt für Punkt mit Evidenz
- [ ] `docs/SUBSCRIPTION_COMMERCIAL_PENTEST_CHECKLIST.md` Commercial-Surface durchgehen
- [ ] Negativ-Stichprobe live: Cross-Org 403, Worker auf Checkout 403, Staff-Origin-Guard
- **Abnahme:** unterschriebene Checkliste; 0 offene Kritisch/Hoch-Funde

---

## Welle F5 — FINALE ABNAHME (25.–28.08.)

### Phase F5.1 — Globales Go-Live-Gate (Teil 1 A–H) formal durchgehen
> Owner + Claude gemeinsam, jede Zeile mit Evidenz-Verweis (Test/Screenshot/Log). Quelle: `99_GOLIVE_GATE.md`.
- [ ] **A Produkt** (5 Punkte) — Kernflow E2E, Verträge auditfähig, keine Phantom-Features
- [ ] **B Commercial** (6) — eine kanonische Preisquelle, buchbar = lieferbar, Individuell via Staff
- [ ] **C Security** (8) — Tenant-Isolation-Negativtests, CSRF, Rate-Limits, Owner-Schutz, kein Secret im Release
- [ ] **D QA** (9) — Fresh-Clone grün, Migrations Fresh+Upgrade, Empty-States, Plan-/Rollen-Gates
- [ ] **E Enterprise** (6) — Audit immutable/exportierbar, Backup getestet (F3.5!), Incident-Prozess (Verantwortliche aus F2/F3 benannt)
- [ ] **F UX** (8) — keine toten Links/Cards, KPI-Wahrheit, Themes ok
- [ ] **G Public/Privacy** (3) — Rechtstexte verlinkt (aus F2.1!), noindex-Entscheide
- [ ] **H Finance/Governance** (4) — Exporte auditierbar, 4-Augen wo nötig
- **Abnahme:** Gate-Protokoll ohne offene Punkte ODER bewusste, dokumentierte Ausnahmen (mit Risiko + Frist)

### Phase F5.2 — Abschlussbericht (Gate Teil 3-Format)
- [ ] Claude liefert den formalen Abschlussbericht (geprüfte Bereiche, Entscheidungen, Tests mit Nachweis, P0/P1-Status, Risiken, nächster Slice)
- **Abnahme:** Bericht im Worklog + committet

### Phase F5.3 — Owner-Sign-off (Gate Teil 4) ✍️
- [ ] Owner erklärt formal: „Finalisierungswelle abgeschlossen, Go-Live freigegeben" (Datum + Name in DIESER Datei unten)
- [ ] **Go/No-Go 01.09.** — bei No-Go: Fallback 15.09. + konkrete Restliste
- **Abnahme:** Sign-off-Block unten ausgefüllt

---

## Welle F6 — Marktstart & Pilotbetrieb (ab 01.09.)

### Phase F6.1 — Erster zahlender Kunde (01.09.)
- [ ] Onboarding nach `docs/enterprise-readiness/PILOT_CUSTOMER_RUNBOOK.md`; Plan BASIS/PLUS, **manuelle Rechnung** (createInvoice inkl. Premium-Posten-Mechanik)
- **Abnahme:** Kunde aktiv, erste Rechnung gestellt, Zahlungseingang terminiert

### Phase F6.2 — Hypercare Woche 1 (01.–08.09., täglich 15 Min)
- [ ] Sentry 0 neue Kritische · Inkasso-Worklist · SCC: Moderations-Queue + Dokumenten-Tresor-Monitor + Incidents-Feed · Backup-Status grün
- **Abnahme:** tägliche Einzeiler im Burn-in-/Betriebsprotokoll

### Phase F6.3 — P2-Härtung (September, rollierend)
- [ ] P2.0 Tier-Schwellen-Vereinheitlichung (50/150/350) · P2.1 Coverage-Anhebung Stufe 1 · P2.2 Load-Tests · P2.3 Chaos-Run
- **Abnahme:** je Punkt PILOT_TODOS-Done-Eintrag

### Phase F6.4 — Gate-50-Vorbereitung (parallel, owner-getaktet)
- [ ] Stripe live (Keys/Price-IDs/SEPA/Tax/Dunning → R1/R2-Rest) · SendGrid · Plan-Limiter auf Redis + Lookup-Cache (Audit-Skalierung) · CSP-Nonce-Migration · Theme-Static-Injection (R4-Rest) · Ops-Alert-Notify-Hook (R6-Rest) · Track A / Terminologie-Rollout (P2.4)
- **Abnahme:** je Punkt eigener Slice mit Tests; Register-Update

---

## Vollständigkeits-Matrix (nichts vergessen — Quelle → Welle)

| Offener Punkt (Quelle) | Abgedeckt in |
|---|---|
| **UG-Gründung: Notar/Konto/HR/Steuernummer (Owner-Input 11.06.)** | **Welle G (kritischer Pfad)** |
| Firmendaten in Plattform (Rechnung/Impressum/Footer) | G.4 |
| Owner-Qualitätsphase („noch etwas auf Qualität prüfen") | Welle FQ |
| Hetzner-Setup steht noch aus | F3 (Juli) |
| O-01 Secret-Rotation / P0.4 | F2.3 |
| O-02 SCC produktiv / P1.0 | F3.3 |
| O-03 Rest (Live-Stripe-Durchstich) | F6.4 |
| O-04 Prod-Migrate + Fresh-DB-Proof | F3.2 |
| O-05 MFA-Entscheid | F2.4 |
| O-06 SSO-Entscheid | F2.4 |
| O-07 Preise + Stripe-Keys | F2.2 (Preise) / F6.4 (Stripe) |
| O-08 Restore-Drill / P1.4 | F3.5 |
| O-09 Burn-in ≥7 Tage | F4.1 |
| O-10 Rechtstexte / R9 | F2.1 → F5.1-G |
| O-11 Rate-Limit-Redis / W11-02 | F6.4 |
| Audit: Resource-Limits, BYPASS-Pin, TLS-Doku | F1.1 |
| Audit: OCC-KDF, API-Key-Scope+Limit | F1.2 |
| Audit: stille Catches, companyProfile-Audit, CHANGELOG | F1.3 |
| Audit: Plan-Limiter-Redis, Lookup-Cache, CSP-Nonce, Partitionierung | F6.4 (Gate 50/300) |
| Audit: Mobile-Breakpoints/localStorage (Frontend mittel) | F4.3 (Abnahme) + F6.3 |
| Harness: CAN-1/HTTP-6/workerReview#2/FG-3/FG-5 | F1.4 |
| Track-B-Gates 13/20 (manuell) | F4.3 |
| E-01 E2E in CI | F4.2 |
| Track D Polling/Schwellen | F2.4 |
| Track A + Terminologie (Track C Rollout) | F6.4 (Post-Launch, bewusst) |
| R4-Rest (Theme-Injection) / R6-Rest (Alert-Hook) / R7-B (AI) / R10 (Flag-Konsolidierung) | F6.4 bzw. owner-getaktet danach |
| Premium-Preis-Bestätigung (49 €) + Schimpfwort-Review (neu, Session 06-10/11) | F2.2 / F2.4 |
| Demo-Daten/Sales-Demo-Pfad-Check (MANUAL_TASKS Cross-Cutting) | F4.3 (Sichtprüfung) |

---

## ✍️ Finale Abnahme (Gate Teil 4 — nur Owner)

```
Hiermit bestätige ich die Abnahme der Finalisierungswelle nach Prüfung
des Go-Live-Gates (Teil 1 A–H) und gebe TempConnect für den Marktstart frei.

Go-Live-Datum: ____________   Ausnahmen (falls): ____________________________

Datum: ____________   Name/Unterschrift Owner: _______________________________
```

> Pflege: Checkboxen hier abhaken; Detail-Status weiterhin in
> `phase5_manual_tasks_checklist.md` (Owner-Konten) und `PILOT_GO_LIVE_TODOS.md` (Blocker).
