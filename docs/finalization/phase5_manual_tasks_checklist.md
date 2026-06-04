# Phase 5 — Owner-Entscheidungen: Tracking-Checkliste

> **Zweck:** Dies ist die *lebende Tracking-Schicht* für alle Aufgaben, die nur der
> Owner durchführen kann (echte Konten, echte Keys, finale Preise, Rechtstexte,
> irreversible Infra-/Produktentscheidungen). Die *Begründung & Detailanleitung* je
> Aufgabe steht in `finalization/phase5_scale/MANUAL_TASKS.md` — hier wird nur der
> **Status** geführt, damit nichts doppelt dokumentiert wird.
>
> **Gate-Regel (99_GOLIVE_GATE.md, Teil 4):** „Fertig" / „Go-Live" erklärt **der Owner**,
> nicht Claude Code. Claude liefert die sichere, deaktivierte Integration + Vorlagen;
> der Owner schaltet mit echten Werten frei.
>
> **Spalte „Bereits gebaut":** Was Claude-seitig schon fertig im Repo liegt und nur
> noch auf die externe Freigabe wartet. Stand: 2026-06-03. Höchste Migration: **123**.
> Alle Phase-5-Diffs sind **uncommitted** (Owner-Gate).

---

## Status-Tabelle (kanonisch — hier pflegen)

| Phase | Aufgabe | Status | Datum | Verantwortlich | Bereits gebaut (wartet auf Freigabe) | Notiz |
|---|---|---|---|---|---|---|
| **D** | Stripe-Account + Secret Key + Webhook Secret + Price-IDs (BASIS/PLUS/PRO) | offen | — | Owner | `billingProviderService` (`BILLING_PROVIDER`), Checkout+Webhook in `routes/payment.js`, idemp. Webhook-Härtung | **Marktstart-Blocker Gate 10.** Vollautomatisch ab Tag 1 |
| **D** | SEPA Direct Debit + Stripe Tax + Billing Portal + Dunning/Smart Retries aktivieren | offen | — | Owner | SCC-Billing-Sicht + Inkasso-/Dunning-Worklist (`payment_failed`-Naht) | Für deutsche B2B-Kunden wichtig |
| **D** | Rechnungs-Branding + Zahlungsziel net-30 (INDIVIDUELL) festlegen | offen | — | Owner | Stripe-Invoicing-Anbindung vorbereitet | Kein manuelles Rechnungswesen |
| **E** | SendGrid-Account + API Key **oder** SMTP-Provider wählen | offen | — | Owner | `emailProviderService` (`EMAIL_PROVIDER` = console/smtp/sendgrid/disabled, `SENDGRID_API_KEY`) — **keine neue Dependency**, SendGrid via SMTP-Relay | Start mit SMTP/console möglich |
| **E** | DNS: SPF + DKIM + DMARC einrichten, Absender/Reply-To/Support-Mail | offen | — | Owner | DNS-Templates in `MANUAL_TASKS.md`, provider-fähiger `emailService` | DNS nur extern setzbar |
| **G** | Hetzner API Token (read + safe-write, **nicht** admin) erzeugen + setzen | offen | — | Owner | `staffHetznerService` vorhanden; Provider-Abstraktion (`INFRASTRUCTURE_PROVIDER`) noch **nicht** verdrahtet → bleibt disabled/manuell | Gate 50, nicht Gate 10 |
| **G** | Entscheiden: welche SCC-Aktionen erlaubt (Reboot? Backup? Snapshot?) | offen | — | Owner | Action-Gating in `staffHetznerService`/`warpExecutionService` | Owner-Risikoentscheidung |
| **C** | Preise pro Plan final (DEMO/BASIS/PLUS/PRO/INDIVIDUELL) | offen | — | Owner | `planCatalog.js` (`normalizePlanKey`), Commercial-Desk-Modul, Tarif-Workflow | Preiswerte sind Owner-Entscheid |
| **C** | Planlimits + Mindestlaufzeit/Kündigungsfrist + SLA-Level | offen | — | Owner | `contractService`, `subscriptionRequests` Workflow | Operativ haltbar prüfen |
| **C** | Vertragstexte individuelle Tarife | offen | — | Owner (Anwalt) | Dokument-Templates | Juristisch |
| **J** | Ultra-Premium-Farbwelt / Markenfarben + Logo/Brand-Assets festlegen | offen | — | Owner | `ultra_premium`-Theme + Registry + Flag-Gating (`THEME_SWITCHER_ENABLED`, `ULTRA_PREMIUM_THEME_ENABLED`) **gebaut** | Default-Theme bleibt aktuelles Design |
| **J** | Entscheiden: welche Themes öffentlich vs. nur intern; Default bestätigen | offen | — | Owner | SCC-Theme-Scope end-to-end (Flags→/bootstrap→Topbar-Cycle) | Offen: Static-Page-Injektion (R4) |
| **N** | Datenschutzerklärung + AGB/SaaS-Vertrag + AVV/DPA + TOMs finalisieren | offen | — | Owner (Anwalt) | Security-Härtung (helmet/CSRF/RateLimit/dataGovernance) + DSGVO-/TOM-Vorlagen | Niemals juristische Garantie durch Claude |
| **N** | Subprocessor-Liste (Stripe/SendGrid/Hetzner/Sentry) + Löschkonzept/Retention | offen | — | Owner (Anwalt) | Audit-Trail + Retention-Mechanik vorhanden | Rechtlich prüfen |
| **N** | Alle Secrets rotieren (falls je in Artefakt gelandet) | offen | — | Owner | `envValidator` Fail-Fast, `.env*.example` ohne echte Werte | Sicherheits-Hygiene |
| **P** | Restore-Drill mindestens einmal real durchführen | offen | — | Owner | `scripts/restore-test.sh` Fidelity-Bug gefixt (`--single-transaction --exit-on-error`) + Severity-Matrix gepinnt | Gate 300; mit Claude als Anleitung |
| **P** | Produktiv-Infra + Domain/TLS + Backup-Ziel + Monitoring-Konto (Sentry) | offen | — | Owner | Deployment-/Backup-/Rollback-Runbooks, `@sentry/node` integriert | Provisionierung nur extern |
| **P** | Incident-Verantwortliche + Eskalationsweg + On-Call benennen | offen | — | Owner | `ops_incidents` (Mig **121**) + `staffIncidentService` + 5 SCC-Routen + Signals-Feed **gebaut** | Offen: Auto-Alert-Notify-Hook (R6) |
| **Lernschleife** | Auto-Approve-Kategorien (Empf.: nur EFFIZIENZ) + Token-Budget + Takt | offen | — | Owner | `.claude/learning/config.md`, Distill/Apply/Consolidate-Skills | `.claude/` nie im Release-Artefakt |

> **Status-Werte:** `offen` · `in Arbeit` · `erledigt` · `entfällt`. Beim Erledigen
> Datum + ggf. Kurzbeleg (Account-ID-Hinweis, DNS-Eintrag gesetzt, Drill-Datum) eintragen.
> **Echte Keys/Token/Preise gehören NICHT in diese Datei** — nur der Status „erledigt".

---

## Reihenfolge-Empfehlung (was blockiert welches Gate)

1. **Gate 10 (Marktstart, zahlende Kunden):** **D (Stripe)** ist der einzige *harte*
   externe Blocker — ohne echte Keys/Price-IDs kein automatisches Billing. **E** kann
   mit `EMAIL_PROVIDER=smtp` oder `console` sofort starten. Alles andere ist gestaffelt
   nachrüstbar.
2. **Gate 50:** **E → SendGrid** (professionelle Zustellung), **J → Ultra-Premium-Theme**
   freischalten, **G → Hetzner** aktivieren (Token + Action-Gating-Entscheid).
3. **Gate 300:** **P → echter Restore-Drill**; Performance/Skalierung sind code-seitig
   bereits gehärtet (unbounded Listen → Pagination, N+1 Read/Write → set-based,
   Cron-Sweep-Indizes Mig 122/123).

**Kürzeste Strecke zum Marktstart:** Stripe-Setup (D) abschließen → E auf SMTP belassen →
restliche Zeilen nach Bedarf. Die Code-Seite wartet bereits an jeder Naht.

---

## Was die Customer-Gates nicht ohne Owner grün macht

Die externen Zeilen oben können **nicht** durch Code grün werden — sie brauchen echte
Konten und menschliche Entscheidungen. Feature-Flags sorgen aber dafür, dass fehlende
externe Dienste den **Code-Fortschritt nicht blockieren**: Provider stehen auf
`manual`/`console`/`disabled`, bis der Owner mit echten Werten umschaltet.

Detail & Begründung je Aufgabe: `finalization/phase5_scale/MANUAL_TASKS.md`.
Offene Risiken/Blocker mit Tracking-IDs: `docs/finalization/open_risks_and_blockers.md`.
