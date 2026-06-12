# Changelog

Alle nennenswerten Änderungen an TempConnect. Format angelehnt an
[Keep a Changelog](https://keepachangelog.com/de/1.1.0/); Versionierung nach
[SemVer](https://semver.org/lang/de/). Prozess: `docs/releases/RELEASE_PROCESS.md`.

## [Unreleased]

### Hinzugefügt
- **Dokumenten-Tresor (PDF-Center):** org-eigener Tresor unter „Mein Unternehmen" (Upload,
  Verwaltung, ZIP-Bulk-Export, Retention-Cron) + **Auto-Ablage** alles Plattform-Generierten
  (Rechnungs-PDFs, Einsatzvereinbarungen/Konditionsblätter für beide Parteien, Abo-Dokumente,
  Compliance-Spiegel, DSGVO-Anfragen) + Staff-Monitoring (SCC „Dokumenten-Tresor"). (Mig 131)
- **Echte Rechnungs-PDFs** via pdf-lib (`GET /invoices/:id?format=pdf`).
- **Zweiseitiges Bewertungssystem:** Bewertung nur nach abgeschlossenem (FINALIZED) Deal,
  **Staff-Moderation** (Review-Queue) + automatischer deutscher **Schimpfwort-/Beleidigungs-Filter**
  (Leetspeak-/Umlaut-Normalisierung), öffentliche Anzeige nur freigegebener Bewertungen.
- **Notdienst-Schnellformular** für Agentur-Personal (sofort aktiv, NOTDIENST-Badge,
  +12-Feed-Boost, gegenseitenorientiert). (Mig 132)
- **Premium-Anzeige (beidseitig):** einmalige In-App-Gebühr (49 € netto/14 Tage, zentral in
  `planCatalog.PREMIUM_LISTING`), Listing-Boost +15 im Feed, Gebühr landet automatisch als
  Position auf der nächsten Monatsrechnung (manual-first, kein Sofort-Charge). (Mig 133)
- **DSGVO im Staff-Center:** org-übergreifende Anfragen-Sicht + CSV-Export (SCC-Modul).
- **Hub-Glow-Cards:** ungelesene Ereignisse je Karte (Gold-Ring, Badge mit Hover-Tooltip,
  Deep-Link + Mark-Read), Notification-Surface-Mapping.
- **Mitglieder-Einladung mit allen org-internen Rollen** (Mig 129) · **Integrationen-Backend-Tabellen**
  (Mig 130) · Cookie-Consent-Banner · Notdienst-USP prominent auf der Landing.

### Geändert
- Marktplatz-Terminologie: „Verfügbares Personal" → **„Eingestelltes Personal"** (Agentur-Kontext).
- Prod-Compose gehärtet: Container-Resource-Limits, `FEATURE_GATE_BYPASS=false`-Pin,
  sicherer `PAYMENT_MODE`-Default, TLS-Pflicht-Banner in nginx.conf.
- Staff-Session-Secret-Fallback nun KDF-abgeleitet (HMAC-SHA256); Rate-Limits zählen
  API-Key-Requests pro Key-Hash statt pro IP.
- Fire-and-forget-Pfade (Notifications/Analytics/Audit-Spiegel/ROLLBACK) loggen Fehler jetzt
  sichtbar (`swallow()`-Senke) statt sie still zu verschlucken; companyProfile-Audit läuft
  über die einheitliche `res.locals.audit`-Pipeline.

### Behoben
- `createRatingsRouter` war nie gemountet (Bewertungs-Feature komplett tot) — gefunden durch
  adversariales Review, gemountet + verifiziert.
- 11 Frontend-Testdateien skippten still beim offiziellen Runner (cwd=api) bzw. liefen im
  Docker gegen falsche Pfade — marker-basierte ROOT-Auflösung + ressourcen-vollständige Guards.
- Bypass-aware Integrations-Guards (C-01): Bypass-Env prüft den dokumentierten 200-Kontrakt,
  CI erzwingt weiter 403.
- Literales `` `n ``-Artefakt auf 15 öffentlichen Seiten; Dev-Container-Boot ohne Re-Install.

## [2.0.0] — 2026-06 (Baseline)

Enterprise-Premium-Stand vor dem Finalisierungs-Endspurt: Marktplatz (Demand/Capacity,
Deals, Einsatzvereinbarungen, Assignments, digitale Stundenzettel), Multi-Tenancy mit
RLS-deny-by-default (Mig 116/126), Plan-/Entitlement-Engine (DEMO–INDIVIDUELL),
Abo-/Dokumenten-Workflows (KV/ANG/AB/AE/KB), Einsatzportal (Worker), SCC (Staff,
React) · SOC (Support) · OCC (Owner, React), Notifications + Activity, Compliance-Ampel,
Spend-Analytics/Reporting, Emergency Staffing, Backups + Monitoring + 11-Job-CI,
135 Migrationen, ~4.500 Unit-Tests.
