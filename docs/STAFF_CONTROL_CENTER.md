# Staff Control Center (SCC)
Interne TempConnect-Steuerzentrale fuer das Team (Elmira + Mitarbeiter). Hier werden Kundenanfragen bearbeitet, Hetzner gesteuert, globale Kill-Switches betaetigt und Audit-/Decision-Logs gepflegt.
## Klare Abgrenzung zu bestehenden Bereichen
SCC ist strikt getrennt von den Kunden-/Plattform-Bereichen:
- **SCC (`/staff/*`)** - interne TempConnect-Team-Konsole. Nur Team-Mitglieder, die in `tempconnect_staff` mit `is_active = TRUE` stehen. Kunden und Plattform-Admins kommen hier NICHT rein.
- **Admin-Panel (`/public/admin_panel.html`)** - Plattform-Admin-Flaeche fuer Kundenseite (Platform-Admins, Owner-Rolle der Kundenorg). Nutzt `tc.sid`-Session, `/api/v1`-Routen, normale RBAC. Kein Zugriff von dort ins SCC.
- **Internal Control Center (`/public/internal_control_center.html`)** - Legacy-Redirect auf Admin-Panel.
- **Organization (`/public/organization.html`, `/public/sla_profil.html`)** - Kunden-Org-eigene Verwaltung (Plan, Mitglieder, Profil). Bleibt komplett bei der Kundenorganisation.
## Zugang
- URL (ops): `https://staff.tempconnect.de/public/staff/login.html` ueber eigene Subdomain; in der Codebasis liegt das Frontend unter `frontend/public/staff/` und die API unter `/staff/api/*`.
- Cookie: `tc.staff.sid` (Path=/staff, SameSite=Strict, HttpOnly, max-age 4 h).
- Getrennter Session-Store in Postgres: `staff_session`.
- Kein csrfProtect/demoGuard/orgContext/apiKeyAuth-Overlap mit den `/api/*`-Routen.
## Access-Modell (dreistufig)
1. Login ueber `POST /staff/api/auth/login` — schlaegt fehl, wenn der User NICHT in `tempconnect_staff` (is_active = TRUE) steht.
2. Eigene Session via `tc.staff.sid`.
3. Step-up (15 Min TTL) PLUS `confirmed=true` PLUS `reason` (mind. 10 Zeichen) fuer alle mutierenden Aktionen (Confirm/Reason wird serverseitig im Middleware-Guard erzwungen).
**Bootstrap**: ENV `STAFF_USER_IDS` (Komma-separierte UUIDs) wird beim ersten Request akzeptiert, falls der User noch nicht in der Tabelle steht, und traegt ihn automatisch ein. Fuer Produktion: zwei Initial-Team-Mitglieder via ENV setzen, danach werden weitere Mitglieder per Migration/Insert gepflegt.
## Kernarbeitsplatz: Kundenanfragen
`strategic_collaboration_requests` (INDIVIDUELL / Upgrade / Pilot / Sonderfreigabe) ist die Datenquelle. Ergaenzt durch:
- `staff_customer_request_messages` - Thread (interne Notiz vs. Nachricht an Kunde)
- `staff_customer_request_assignments` - wer aus dem Team bearbeitet gerade die Anfrage
Lifecycle (`ALLOWED_TRANSITIONS`):
- eingegangen → rueckfrage_offen | angebot_erstellt | abgelehnt
- rueckfrage_offen → eingegangen | angebot_erstellt | abgelehnt
- angebot_erstellt → rueckfrage_offen | bestaetigt | abgelehnt
- bestaetigt → aktiviert | rueckfrage_offen
- aktiviert → abgeschlossen
- abgeschlossen / abgelehnt sind Endzustaende
Endpoints:
- `GET  /staff/api/customer-requests` - Inbox mit Filter (status, unassigned, assignee)
- `GET  /staff/api/customer-requests/:id` - Detail + Thread
- `POST /staff/api/customer-requests/:id/messages` - interne Notiz oder Kundennachricht
- `POST /staff/api/customer-requests/:id/transition` - Status-Wechsel mit Reason (Confirm+Step-up Pflicht)
- `POST /staff/api/customer-requests/:id/assign` - Anfrage einem Team-Mitglied zuweisen
- `POST /staff/api/customer-requests/:id/release` - Zuweisung aufheben
- `GET  /staff/api/customer-requests-meta/statuses` - erlaubte Uebergaenge
## Sekundaere Areas
- Executive (aktive Abos, Pilotkunden, offene Anfragen, Incidents/24h)
- Platform (globale Kill-Switches)
- Revenue (Abo-Status-Verteilung)
- Support (Eskalations-Signale; Impersonation bewusst AUS)
- Operations (Runbook-Laeufe)
- Hetzner (Read-only Infra + 4 Safe-Actions)
- Risk / Trust (DSGVO, abgelaufene Compliance-Docs)
- Audit / Decisions (Staff-Namespace + Decision-Log)
- Data Explorer (4 vordefinierte Views, kein freies SQL)
- Automation (deklarative Runbooks: Snapshot-all, Enter/Exit Read-Only)
## Hetzner-Guardrails
- Read-Whitelist: 8 Pfade (servers, volumes, load_balancers, floating_ips, datacenters, firewalls, certificates, placement_groups)
- Safe-Actions: 4 (server.create_image, server.reboot, server.enable_backup, load_balancer.add_service)
- Verboten: DELETE, SSH-Shell, Rescue-Mode, Firewall-Mutation
- Ohne `HETZNER_CLOUD_TOKEN` laeuft der Service im Stub-Mode (deterministische Mock-Daten, UI-Pill zeigt "Hetzner: stub").
## Audit / Decision
- Eigener Namespace `staff_control.*` in `staff_control_audit_log` mit `area`, `action`, `entity_type/id`, `status`, `reason`, `confirmed`, `risk_level`, `step_up_at`, `ip`, `user_agent`.
- Decision-Log `staff_control_decisions` (reversibel/irreversibel, optionales Revert).
- Keine stille Mutation: Jede Veraenderung erzeugt Audit-Eintrag.
## Tests
- `api/test/staffControlCenter.test.js` - 17 Tests gruen:
  - Access-Gate: 401 ohne Session, 403 fuer Nicht-Staff, 403 fuer platform_admin ohne Allowlist, OK fuer Staff.
  - Step-up + Confirm/Reason Guards.
  - Hetzner-Whitelist + Stub-Mode.
  - Runbook-Step-Type-Whitelist (blockt `shell`/`exec` hart).
  - Customer-Requests-Service: Transitions (valid/invalid), addMessage (empty/long/missing/OK), assign (staff-only).
## Deployment-Schritte
1. Migration 095 + 096 anwenden.
2. ENV setzen: `STAFF_USER_IDS=<uuid1>,<uuid2>`, `STAFF_SESSION_SECRET=<lang-zufaellig>`, optional `HETZNER_CLOUD_TOKEN`.
3. App neu starten.
4. Erster Login unter `https://staff.tempconnect.de/public/staff/login.html` (oder bis Subdomain-Setup steht: `https://tempconnect.de/public/staff/login.html`).
5. Nginx-VHost fuer `staff.tempconnect.de` mit dediziertem TLS-Zertifikat (optional IP-Allowlist auf VHost-Ebene).
## Erweiterungsrichtlinien
- Neue Aktionen nur via Safe-Action-Whitelist oder Runbook-Step-Type-Whitelist.
- Neue Data-Explorer-Views: Eintrag im `DATA_EXPLORER_VIEWS`-Map; keine User-Inputs im SQL.
- Weitere Staff-Mitglieder: INSERT in `tempconnect_staff` via Migration (oder spaeter Owner-UI als Phase 2).
## Was bewusst NICHT gebaut wurde
- Keine Impersonation-Funktion (Team sieht Anfragen, reagiert darauf, spielt aber keinen Kunden).
- Keine freie Browser-Shell.
- Keine rohe PostgreSQL-Konsole.
- Keine Self-Service-Grant-Funktion, die einen Abo-Kunden oder Platform-Admin zum Staff macht — geht nur ueber Allowlist-Tabelle/ENV/Migration.
- Kein UI-Link aus Admin/Organization/ICC ins SCC und zurueck — die Bereiche bleiben strikt getrennt.
