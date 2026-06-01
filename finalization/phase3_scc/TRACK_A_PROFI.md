# Track A — SCC Profi-Level (Wellen 00–13)

> 13 Wellen zur Hebung des Staff Control Centers auf Enterprise-Operations-Niveau. Jede Welle: Ziel, Aufgaben, **konkrete Befehle**, Acceptance Criteria.

---

## SCC WAVE 00 — Status einfrieren und SCC-Scope festlegen

**Ziel:** SCC als eigenständiges internes Produkt innerhalb von TempConnect behandeln.

**Aufgaben:**
- `docs/scc/SCC_PRODUCT_SCOPE.md` erstellen
- SCC klar von OCC, SOC und ICC abgrenzen
- Alle SCC-Dateien inventarisieren (Liste in `docs/scc/SCC_FILE_INVENTORY.md`)
- Alle SCC-Endpunkte inventarisieren (`docs/scc/SCC_API_SURFACE.md`)
- Alle SCC-Mutationen inventarisieren
- Alle SCC-Rollen und Staff-Permissions definieren (`docs/scc/SCC_MODULE_OWNERSHIP.md`)
- Aktuelle SCC-Checks dokumentieren
- Entscheiden: eigener Branch `release/scc-profi-level` oder direkt auf `release/enterprise-premium-market-ready`

**Acceptance:**
- `SCC_SCOPE` vorhanden
- `SCC_API_SURFACE` vorhanden
- `SCC_MODULE_OWNERSHIP` vorhanden
- OCC/SOC/SCC-Abgrenzung dokumentiert

---

## SCC WAVE 01 — Access Boundary und Staff Identity härten

**Ziel:** SCC-Zugriff nur über harte Staff-Identität.

**Aufgaben:**
- `STAFF_SESSION_SECRET` in Production verpflichtend machen
- Fallback auf `SESSION_SECRET + ':staff'` in Production verbieten
- Login Rate Limit für `/staff/api/auth/login` einführen
- Failed Login Audit schreiben
- Successful Login Audit beibehalten
- **Staff MFA erzwingen:** mindestens TOTP, optional WebAuthn später
- Staff Access Review dokumentieren
- `tempconnect_staff` erweitern: `role/scope`, `last_mfa_at`, `last_reviewed_at`, `reviewed_by`, `access_reason`, `expires_at` optional
- Revocation Flow ergänzen

**Acceptance:**
- Kein SCC-Zugang ohne `tempconnect_staff`
- Kein SCC-Zugang ohne MFA für privileged Staff
- Production startet nicht ohne `STAFF_SESSION_SECRET`
- Login ist rate-limited
- Login fail/success wird auditiert
- Staff deaktivieren beendet neue Zugriffe

---

## SCC WAVE 02 — Echte Step-up Security

**Ziel:** Step-up wird von Confirm-Dialog zu echter Reauth.

**Aufgaben:**
- `/staff/api/auth/step-up` erweitern: Passwort-Reauth ODER MFA-Code erforderlich
- UI Step-up Modal statt `window.confirm`
- Kritische Aktionen brauchen frischen Step-up
- Critical Actions brauchen typed confirmation
- **Step-up TTL nach Risk-Level:**
  - `medium`: 15 Minuten
  - `high`: 10 Minuten
  - `critical`: 5 Minuten
- Step-up Audit mit Methode, Zeit, Actor, IP

**Acceptance:**
- `confirmed=true` allein reicht nicht mehr
- Step-up ist auditierbar
- Kritische Aktionen ohne frischen Step-up geben `428`
- UI zeigt professionelles Step-up Modal

---

## SCC WAVE 03 — SCC Security Middleware

**Ziel:** `/staff/api` bekommt eigene Security-Schicht.

**Aufgaben:**
- `createStaffRateLimiters` implementieren:
  - `staffLoginLimiter`
  - `staffMutationLimiter`
  - `staffReadLimiter` (optional)
- Origin-/Referer-Check für mutierende SCC-Requests
- Optional: Staff-CSRF-Token einführen
- Staff Security Headers setzen
- **Session Cookie härten:**
  - `httpOnly`
  - `secure` in Production
  - `sameSite: strict`
  - `path: /staff`
- Max Session Age und Idle Timeout dokumentieren
- `401/403/428/429` Error Contract dokumentieren

**Acceptance:**
- `/staff/api/auth/login` hat Rate Limit
- Staff-Mutations haben Rate Limit
- Cross-site Mutation wird geblockt
- Error Contract ist konsistent

---

## SCC WAVE 04 — UI/UX auf Profi-Level

**Ziel:** SCC wirkt wie professionelle interne SaaS-Konsole.

**Aufgaben:**
- `alert()` entfernen
- Einheitliches Toast-/Notification-System bauen
- Einheitliche Modal-Komponente für Confirm/Reason/Step-up
- Module bekommen konsistente PageHeader
- Tabellen bekommen einheitliche DataTable-Komponente
- Alle Loading/Empty/Error States vereinheitlichen
- Sidebar unterstützt Deep Links via Hash oder React Router
- Aktives Modul ist bookmarkfähig
- Responsive Mindestqualität für Laptop/Tablet
- **Accessibility Basics:** Fokuszustände, Labels, Tastaturbedienung, ARIA für Modals

**Acceptance:**
- Kein `window.alert`
- Kein `window.confirm` für Profi-Flows
- Jeder Bereich hat Loading/Empty/Error
- Jeder Bereich ist per URL direkt aufrufbar
- SCC wirkt konsistent und hochwertig

---

## SCC WAVE 05 — Commercial Inbox professionalisieren

**Ziel:** Commercial Inbox wird zentraler Arbeitsplatz für Umsatz, Piloten, Enterprise, Tarifprozesse.

**Aufgaben:**

**Unified Queue mit Source Types:**
- `customer_request`
- `subscription_upgrade`
- `subscription_downgrade`
- `cancellation`
- `enterprise_config`
- `strategic_request`

**Queue-Triage:** priority, SLA age, assignee, next best action, risk badge

**Detail Drawer:** Kontakt, Organisation, Plan, aktuelle Subscription, gewünschte Änderung, Historie, Dokumente, Audit, interne Notizen

**Bulk Actions begrenzen:**
- Kein Bulk Activate
- Bulk Assign: ja
- Bulk Under Review: ja
- Bulk Reject mit Reason: ja

**Saved Filters:** Meine offenen, Enterprise/Individuell, Kündigungen, älter als 48h, ohne Assignee

**SLA-Zähler einführen.**

**Acceptance:**
- Commercial Inbox ersetzt verstreute manuelle Prüfungen
- Jede Anfrage hat Status, Owner, SLA, Next Action
- Keine kritische Aktion ohne Detailprüfung
- Bulk Actions sind sicher begrenzt

---

## SCC WAVE 06 — Subscription und Individuell/Enterprise-Prozess finalisieren

**Ziel:** Tarif-, Upgrade-, Kündigungs- und individuelle Angebotsprozesse laufen sauber über SCC.

**Aufgaben:**
- Planmodell exakt verwenden: `DEMO`, `BASIS`, `PLUS`, `PRO`, `INDIVIDUELL`
- Individuell-Anfragen im SCC priorisieren
- **Angebotsprozess:** Kostenvorschau → Angebot → Auftragsbestätigung → Änderungsbestätigung → Kündigungsbestätigung
- **Plan-Aktivierung:** nur nach `accepted`, mit Reason, mit Audit, mit Dokument
- **Kündigungsprozess:** Status prüfen, Frist/Datum dokumentieren, Confirmation erzeugen
- Kein Fake-Billing
- Stripe/Rechnung-Modus klar anzeigen

**Acceptance:**
- Staff kann individuelle Anfrage bearbeiten
- Dokumente sind versioniert und idempotent
- Aktivierung ist auditierbar
- Kündigung ist nachvollziehbar
- Planwechsel greift technisch

---

## SCC WAVE 07 — Support, SOC und SCC sauber verbinden

**Ziel:** Support-Eskalationen werden im SCC sichtbar, aber SOC bleibt eigener Arbeitsbereich.

**Aufgaben:**
- SCC Support-Modul als Managementsicht definieren
- SOC bleibt operative Ticketbearbeitung
- SCC sieht Eskalationen, SLA-Brüche, kritische Kundenfälle
- **Kein SCC-Impersonation ohne separates Freigabekonzept**
- Eskalation aus SOC zu SCC möglich
- SCC-Entscheidung kann zurück an SOC dokumentiert werden
- Support-RBAC getrennt von SCC-RBAC testen

**Acceptance:**
- Support-Agent hat nicht automatisch SCC
- SCC-Staff hat nicht automatisch unkontrollierte Impersonation
- Eskalationen sind sichtbar und auditierbar
- SOC/SCC-Grenze ist dokumentiert

---

## SCC WAVE 08 — Operations, Runbooks und Infra-Guardrails

**Ziel:** SCC unterstützt Betrieb, ohne zur gefährlichen Root-Konsole zu werden.

**Aufgaben:**
- **Hetzner Stub in Production sauber behandeln:** `live` / `disabled` / `stub` nur non-production
- Safe Actions risk-basiert klassifizieren
- Critical Infra Actions mit typed confirmation
- Optional 2-Person-Approval für critical Actions
- Runbook-Ausführung immer auditieren
- Runbook Dry Run prominent anbieten
- Feature Flags mit Rollback-Hinweis
- Read-only Mode mit großem Warnbanner
- **Kein Delete, kein SSH, keine freie Shell, kein Rescue**
- Runbook-Ergebnis mit Step Results anzeigen

**Acceptance:**
- Keine gefährliche freie Aktion möglich
- Production Stub täuscht keinen Erfolg vor
- Critical Actions sind besonders geschützt
- Runbook-Historie sichtbar

> **Querverweis:** Track B vertieft diese Welle für Hetzner-Steuerung.

---

## SCC WAVE 09 — Risk, Trust, Datenschutz und PII-Masking

**Ziel:** SCC wird datenschutz- und prüfungsfähig.

**Aufgaben:**
- PII-Klassifikation je SCC-Modul
- **Sensitive Felder maskieren:**
  - E-Mail teilweise
  - Telefonnummer teilweise
  - personenbezogene IDs gekürzt
- **Reveal Sensitive Data nur mit Reason + Audit**
- Data Explorer Views mit PII-Level versehen
- Export standardmäßig deaktivieren
- Data Access Audit für Detailaufrufe sensibler Fälle
- DSGVO-/Lösch-/Export-Fälle im SCC als Risk Items anzeigen

**Acceptance:**
- Kein unnötiges PII-Leaking im SCC
- Sensitive Reveals werden auditiert
- Data Explorer ist PII-bewusst
- Trust/Risk-Modul zeigt echte Risiken

---

## SCC WAVE 10 — Audit, Decisions und Evidence

**Ziel:** Jede wichtige Staff-Aktion ist später erklärbar.

**Aufgaben:**
- Audit Detail Drawer
- Audit Export als CSV/JSON nur für berechtigte Staff-Rollen
- Decision Log mit Reversibility Status
- Failed Actions sichtbar machen
- High/Critical Risk Actions eigene Ansicht
- Audit Retention dokumentieren
- Audit Event Coverage testen
- `docs/scc/SCC_AUDIT_AND_DECISION_MODEL.md` erstellen

**Acceptance:**
- Jede mutierende Aktion erzeugt Audit
- Audit ist filterbar
- Decision Logs sind sichtbar
- High/Critical Actions sind separat prüfbar

---

## SCC WAVE 11 — Staff Access Management

**Ziel:** Staff-Zugriffe nicht nur technisch, sondern organisatorisch beherrscht.

**Aufgaben:**
- Staff-Mitgliederliste im SCC anzeigen
- **Staff-Status anzeigen:** `active`, `disabled`, `requires_mfa`, `last_access`, `last_reviewed`
- Neue Staff-Mitglieder nur via Owner/Bootstrap oder Migration
- Staff deaktivieren mit Reason + Audit
- Monatlicher Access Review als Runbook
- `STAFF_USER_IDS` Bootstrap nur für Initialisierung verwenden
- Production-Warnung, wenn Bootstrap-ENV dauerhaft aktiv ist

**Acceptance:**
- Staff-Zugänge sind sichtbar
- Deaktivierung ist auditierbar
- Access Review ist dokumentiert
- Bootstrap ist nicht dauerhaft unkontrolliert

---

## SCC WAVE 12 — Tests, CI und Build-Gates

**Ziel:** SCC darf nicht durch allgemeine Plattformänderungen brechen.

**Aufgaben:**
- `test:scc` Script im API-Package ergänzen
- `build:scc` in CI aufnehmen
- ESLint für `frontend/src/staff/**/*.{ts,tsx}` konfigurieren
- SCC Component/structure tests aktualisieren
- Playwright Smoke Test für SCC Login und Navigation

**Security Tests (Pflicht):**
- Kein normaler User
- Kein Org Owner
- Kein Support Agent ohne Staff
- Kein OCC Owner automatisch
- Step-up required
- Confirm/Reason required
- Rate Limit
- CSRF/Origin Check
- API Snapshot Tests für SCC Bootstrap

**Befehle:**
```bash
cd frontend && npm ci && npm run build:scc
cd api && npm run test:scc
cd api && npm run test:security
npx playwright test scc-smoke
```

**Acceptance:**
- `npm run build:scc` grün
- `npm run test:scc` grün
- SCC ESLint grün
- SCC Playwright Smoke grün
- CI blockiert SCC-Regressionen

---

## SCC WAVE 13 — Release-Integration

**Ziel:** SCC wird sauber ausgeliefert, ohne interne Artefakte ins Release zu packen.

**Aufgaben:**
- `frontend/public/staff` Build-Artefakt korrekt erzeugen
- Source und Build-Output-Strategie festlegen
- Release-Verifier prüft SCC-Pfade
- **Keine `.env`, keine Secrets, keine `node_modules`, keine `.claude`** (siehe Phase-2 WAVE 01)
- `STAFF_SESSION_SECRET` und `STAFF_USER_IDS` nur als Env-Dokumentation, nicht als echte Werte
- Nginx/VHost für `staff.tempconnect.de` dokumentieren
- Optional IP-Allowlist auf VHost-Ebene dokumentieren

**Acceptance:**
- SCC ist im Release enthalten, aber ohne Secrets
- Staff Build ist reproduzierbar
- Staff Subdomain/Route ist dokumentiert
- Release Verify grün

> **Querverweis:** Diese Welle hängt eng an Phase-2 WAVE 01 (Release-Hygiene) und WAVE 15 (Evidence Pack).

---

## Übergang zu Track B

Spätestens nach Track A WAVE 04 (UI/UX) kann Track B parallel starten. **Pflicht-Vorlauf für Track B:**
- Track A WAVE 01-03 abgeschlossen (Security-Basis steht)
- Track A WAVE 08 mit den Grundsätzen verstanden (Operations-Guardrails)

Track B baut auf der gehärteten Security-Schicht auf und ergänzt das Hetzner-Control-Plane.
