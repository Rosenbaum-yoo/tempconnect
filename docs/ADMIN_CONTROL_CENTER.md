# Admin Control Center
Die Admin-Zentrale in `frontend/public/admin_panel.html` verwendet `GET /api/admin/control-center` als kanonischen Bootstrap. Der Endpunkt liefert den aktuellen Benutzerkontext, Card-States, Rollout-Reihenfolge und die ersten zusammengefassten Kennzahlen für die Hub-Ansicht. Dadurch ersetzt die Seite den früheren globalen Deny-Block durch kontrollierte per-Card-Zugriffslogik.

> **Stand 2026-09-30 — zuerst den Abschnitt „Prüfung beidseitig" unten lesen.** Für Kunden
> (Unternehmen **und** Zeitarbeitsfirma) ist diese Seite eine zweite, schlechtere Fassung des
> Organization Control Center; ein Knopf ist kaputt, zwei sind tot. Empfehlung: für Kunden
> abschaffen statt reparieren (Owner-Entscheidung **W-E9**), den Plattform-Teil ins Staff
> Control Center überführen (**W-E10**). Vorschau: `docs/design/vorschau-verwaltung-kunden.html`.
## Card States
Alle Karten werden mit einem klaren fachlichen Zustand gerendert:
- `active`: vollständig nutzbar
- `restricted`: sichtbar, aber bewusst begrenzt oder runtime-abhängig
- `admin_only`: nur für Owner, Admin oder platform_admin operativ freigeschaltet
- `enterprise_only`: fachlich vorhanden, aber erst ab höherem Plan freigegeben
- `planned`: Referenz sichtbar, keine operative Oberfläche
## Erste starke Karten
`Benutzer & Organisationen`, `Audit-Log` und `Plattform-Metriken` bilden den ersten belastbaren Kern der Zentrale. Sie nutzen bestehende Routen und Oberflächen weiter, statt eine zweite Admin-Welt aufzubauen:
- `/api/admin/users`
- `/api/admin/organizations`
- `/api/admin/audit-log`
- `/api/admin/metrics`
- `frontend/public/organization.html?tab=<members|audit|usage|security|roles>`
## Vertrag: `/api/admin/users`
Der Users-Endpunkt liefert eine kanonische Pagination-Hülle und konsistente Fehlerobjekte:
- Success: `{ success: true, data: { items, total, limit, offset } }`
- Error: `{ success: false, error: { code, message } }`
Scope-Logik:
- `platform_admin` und Legacy-Globaladmins sehen den plattformweiten Bestand.
- Org-Admins (`owner`/`admin`) erhalten dieselbe Route org-gebunden; ohne Org-Kontext wird sauber mit `ORG_CONTEXT_REQUIRED` beantwortet statt mit 500.
Plan-Darstellung:
- Das Feld `plan` wird aus der neuesten `subscriptions`-Zeile abgeleitet (`DEMO` als Fallback), damit die Benutzerverwaltung nicht von optionalen/legacy `users.plan`-Spalten abhängt.
## SSO / SAML
Die SSO-Karte und `frontend/public/sso_config.html` verwenden denselben Policy-Satz wie der Bootstrap. Aktiv ist SSO nur, wenn alle Bedingungen erfüllt sind:
- Organisations- oder Plattform-Adminrechte
- gültiger Organisationskontext
- Plan `PRO` oder `INDIVIDUELL`
- produktive SAML-Runtime (`getSSOMode() === "saml"`)
Wenn eine dieser Bedingungen fehlt, bleibt die Karte sichtbar, aber soft-locked mit klarer Begründung. Die Admin-Endpunkte unter `/api/sso/config/:orgId` und `/api/sso/test/:orgId` erzwingen dieselbe Freigabelogik serverseitig.
## Workflows & State Machines
Die Workflow-Karte bleibt bewusst `planned`. Die zugrunde liegenden Zustandsmodelle sind real vorhanden, aber die Admin-Zentrale zeigt nur Referenzzustände und keine halbfertige operative Steuerfläche. Erst mit klaren Guardrails soll daraus ein aktiver Bereich werden.
## Revenue Tab: Commercial Truth
Der Revenue-Tab im Admin Panel (`/public/admin_panel.html`, Tab `Revenue`) zeigt keine kosmetischen KPI-Summen mehr, sondern explizite Quellen:
- **Contractual MRR**: anerkannter MRR aus aktiven Subscriptions, mit Preisquellen-Praezedenz (`custom_quote_pending` > `contract_price` > `pilot_price` > `catalog_price`).
- **Catalog MRR (theoretisch)**: Referenzwert aus Katalog-/Tier-Preisen, getrennt vom anerkannten Vertragsumsatz.
- **Invoice Truth**: Lifecycle (`draft`, `issued`, `overdue`, `paid`, `void`) plus `invoiced_revenue`, `paid_revenue`, `open_receivables`.
- **Payment Truth**: aggregierte Payment Sessions (`completed`, `pending`, `failed`, `expired`) inkl. Amount.
- **Billable Truth**: approved, noch nicht verknuepfte Timesheet-Leistung (`invoice_id IS NULL`) als fakturierbares Volumen.
- **Spend↔Invoice Bridge (30d)**: approved Spend gegen operational invoiced Revenue zur Reconciliation-Luecke.
- **Retention/Churn Truth**: aktive Paid-Kundenbasis, retained/churned Logos, Gross-Churn-MRR, NRR, inactive-but-paying, PQA sowie usage-intensity-Bänder und At-Risk-Drilldowns.
- **Pilot/Conversion Truth**: verbindliche Funnel-Stufen (`lead` bis `paid_live`/`lost_aborted`), Aktivierung, belastbare Nutzung, Pricing-Klarheit, Stage-Distribution, Transition-Raten und At-Risk-Pilots.
- **GTM Learnings**: ICP-/Tarifpfad-Performance, Onboarding-Bottlenecks und echte Produktbereichsnutzung der Piloten.
Wichtig: `available: false` in einzelnen Truth-Blöcken bedeutet Schema-/Drift-Limitierung und darf nicht als `0 €` interpretiert werden.
Export/Audit:
- Im Revenue-Tab stehen `Export CSV` und `Export JSON` bereit.
- Beide Aktionen verwenden kanonisch `GET /api/reporting/finance-truth/export?format=csv|json`.
- Damit sind Admin- und Executive-Sicht auf denselben Finance-Truth-Exportvertrag verdrahtet; zusätzlich nutzen `organization.html` (Usage-Tab) und `spend-analytics.html` denselben Exportpfad.

## Prüfung beidseitig (2026-09-30)

**Anlass:** Owner-Frage „muss da so viel hin? Kann man das noch etwas schöner machen?"

**Wie geprüft — am laufenden System, nicht am Code allein.** Frische Datenbank mit allen 229
Migrationen und der Demo-Welt (Migration 052), API gegen diese Datenbank, Seite im Browser
(Playwright), angemeldet als **Owner eines Unternehmens** (Nordbau Industrie GmbH) und als
**Owner einer Zeitarbeitsfirma** (ElektroStaff GmbH). Jede Zeile der Tabelle ist geklickt
oder abgefragt, nicht vermutet.

**Das Ergebnis vorweg:** Beide Seiten sehen **exakt dieselbe Seite** — dieselben sechs
Karten, dieselbe „Ausbaufolge", dieselben fünf Reiter (Benutzer, Organisationen,
Aktivitäten, Requests, Audit-Log). Seit Befund 8.1.1 (d) sind die Daten dahinter sauber auf
die eigene Firma begrenzt; das hat gehalten. Übrig geblieben ist die **Hülle einer
Plattformkonsole**, die ein Kunde sieht.

| # | Befund | Beleg | Art |
|---|---|---|---|
| 1 | **„Deaktivieren" scheitert immer** mit HTTP 500. Die Route setzt `users.role = 'inactive'`, die Datenbank erlaubt dort seit Migration 029 nur `company`, `agency`, `worker` (`users_role_check`). Trifft auch die Plattformverwaltung. | API-Aufruf: 500; Server-Log: `violates check constraint "users_role_check"`; dasselbe `UPDATE` direkt in der Datenbank | echter Fehler |
| 2 | „Deaktivieren" wirkt auf das **ganze Konto**, nicht auf die Mitgliedschaft; die Prüfung `zielNutzerErlaubt` ignoriert `org_memberships.is_active`. Heute folgenlos, weil #1 alles abbricht — wird aber scharf, sobald jemand #1 „repariert", indem er `inactive` erlaubt: dann sperrt ein früherer Arbeitgeber das Konto einer Person, die längst woanders arbeitet. Den richtigen Weg gibt es schon: `DELETE /org/members/:userId` (nur Mitgliedschaft, mit Audit). | `api/routes/admin.js` (`zielNutzerErlaubt`, `/deactivate`); `orgControlCenter.js:184` | Rollen-Logik |
| 3 | **„Metriken öffnen" ist ein toter Knopf** — die Karte zeigt auf den Reiter `metrics`, der für Kunden nicht freigeschaltet ist. | Klick im Browser: aktiver Reiter bleibt „Benutzer" (beide Seiten) | toter Knopf |
| 4 | **„Speichern" bei Requests ist tot** — Kunden bekommen die Statuswahl angezeigt, der Endpunkt ist der Plattform vorbehalten. | `PATCH /admin/requests/:id/status` → 403 `NUR_PLATTFORMVERWALTUNG` (beide Seiten) | toter Knopf |
| 5 | **9 von 9 Kennzahlen zeigen 0.** Seit 8.1.1 (d) bekommen Kunden keine Plattformzahlen mehr, die Karten sind aber stehen geblieben: „Benutzer 0", während das Organization Control Center für dieselbe Firma „2 Mitglieder" zeigt. | `adminControlCenterService.js` (`plattformweit`-Zweig) | Regel „Kein Fake-Data / Mock-KPIs" |
| 6 | **Plattform- und Entwicklersprache für Kunden:** „Die Plattformzentrale ist freigeschaltet", „Das Plattform-Audit ist freigeschaltet", „Die Plattformmetriken sind freigeschaltet"; „Card-States und klare Soft-Locks statt globalem Totalsperrer", „Stub-Modus", „soft-locked", „Workflows & State Machines", „BPM-Spielereien", „keine Fake-Steuerung"; eine „Priorisierte Ausbaufolge"; englische Statuswerte (SENT, ACCEPTED, Requester, Receiver). | Seitentext im Browser | UX |
| 7 | **Emojis in der produktiven Oberfläche:** acht verschiedene in `adminPanel.js` — sieben als Kartensymbole (`iconForCard`), eines als Ersatzsymbol der Aktivitäten —, dazu die Symbole, die `activityFeedService.getIcon` vom Server mitschickt. | Quelltext + Bildschirmfoto | Regel „Keine Emojis" |
| 8 | **Links in Sackgassen:** „System Health" (Karte und Kopfzeile des Organization Control Center, beide Seiten) endet in „Zugriff verweigert. Administratorrechte erforderlich." — obwohl der Kunde Admin **ist**; „Executive Dashboard" für Zeitarbeitsfirmen (laut Sichtbarkeits-Matrix nur Unternehmen); im Executive Dashboard der Unternehmen führen „Revenue-Konsole", „Revenue-Drilldown" und „Funnel-Drilldown" auf `admin_panel.html?tab=revenue` — und landen bei „Benutzer". | Browser, beide Seiten | Deep-Link-Regel |
| 9 | **Handy:** die Seite ist 823 Pixel breit auf einem 390-Pixel-Bildschirm (Querscrollen), die Mitgliederliste beginnt bei 4.942 Pixeln — nach 5,9 Bildschirmhöhen. Am Rechner bei 2.303 Pixeln (2,6 Bildschirmhöhen). | gemessen im Browser | UX |
| 10 | **Alles, was ein Kunde hier tun kann, gibt es an besserer Stelle schon:** Benutzer → Mitglieder im Organization Control Center (einladen, Rolle, Standorte, entfernen); Organisationen → eine einzige Zeile, die eigene Firma; Aktivitäten = Audit-Log (dieselben Daten, zweimal) → Audit Log im Organization Control Center; Requests → `company_requests.html` bzw. Posteingang der Zeitarbeitsfirma (`agency_inbox.js`); SSO-Karte → Reiter Security. **Einzige Lücke dort:** der CSV-Export des Protokolls. | Endpunkte und Seiten im Code | Parallelstruktur |
| 11 | **Zeitarbeitsfirmen haben keinen Menüpunkt zur Verwaltung.** „Steuerung" in der Kopfzeile hängt an der Fläche `executive_dashboard`, die nur Unternehmen haben. Der Weg geht nur über die Kacheln der Übersicht oder die Suche. | `hubVisibility.js:117` | Sichtbarkeit |
| 12 | **Die fünf Plattform-Reiter erreicht heute niemand.** Sie verlangen `platform_admin`; vergeben wird die Rolle nirgends — kein Skript, keine Einladung, kein Rollenwechsel (beide Schemata in `orgControlCenter.js` schließen sie aus); in der Demo-Datenbank hat sie kein Konto. **Feature-Flags** und **Produkt-Updates** gibt es nur hier; Metriken, Revenue und Kooperationsanfragen hat das Staff Control Center bereits. | Code + Demo-Datenbank | Fläche |

**Nebenbefunde am Zielort** (das Organization Control Center, auf das die Empfehlung zeigt):
die Einladung bietet **jeder Seite alle zehn Rollen** an (Hiring-Manager für die
Zeitarbeitsfirma, Dispatcher für das Unternehmen); dieselben Rollen tragen **drei
verschiedene Beschriftungen** (`roleBadge.js`, `organization.html` zweimal); die Seite hat eine
**eigene Kopfzeile** statt der gemeinsamen (`pageShell.js`); `DELETE /org/members/:userId`
nimmt **keinen Grund** an.

**Nebenbefund außerhalb dieser Seite, getrennt zu klären:** das Executive Dashboard eines
Unternehmens zeigt „Contractual MRR", „Logo Churn Rate", „NRR" und einen Pilot-Trichter —
TempConnects eigene SaaS-Kennzahlen, **über den Kunden selbst**. Die Zahlen sind auf die
eigene Firma begrenzt (`getRevenueMetrics(pool, { orgId })`), es fließt also nichts ab;
aber sie sind für das falsche Publikum und auf Englisch.

### Vorschlag

**A — Für Kunden abschaffen statt reparieren (W-E9).** `admin_panel.html` leitet Owner und
Admins von Kunden auf die Verwaltung (`organization.html`) um; Kachel und ein Menüpunkt
„Verwaltung" für Owner und Admins **auf beiden Seiten**, unabhängig vom Executive Dashboard.
Mitzunehmen ist genau eine Sache: der **CSV-Export des Protokolls**
(`/admin/audit-log/export/csv`, heute schon auf die eigene Firma begrenzt). Die drei Links im
Executive Dashboard und „System Health" in der Kopfzeile verschwinden für Kunden. Aus
„Deaktivieren" wird das vorhandene „Entfernen" mit **Wirkungsvorschau** und **Grund** (kleine
Erweiterung: der Grund landet in den Audit-Details). **Befunde 1, 3–7, 9 und 10 verschwinden
damit mit der Seite, statt einzeln repariert zu werden** — nichts reparieren, was wegfällt.

**B — Die Verwaltung wird die schöne Seite.** Ein Kopf mit Firmenname, Seite und Tarif;
vier echte Kennzahlen aus vorhandenen Endpunkten; sieben kurze Reiter in einer Zeile;
**Mitglieder und offene Einladungen in einer Liste**; Rollen **je Seite** mit deutschen
Namen (Vorschlag: Disponent/in statt Dispatcher, Betrachter/in statt Viewer, Lieferant statt
Supplier); Entfernen mit Wirkungsvorschau; am Handy ohne Querscrollen, die Liste nach 1.078
statt 4.942 Pixeln. **Vorschau:** `docs/design/vorschau-verwaltung-kunden.html` — nur
Design-System-Bausteine, keine Farbwerte, keine Emojis, nur Daten mit vorhandenem Endpunkt
(Ausnahme markiert: das Feld „Grund").

**C — Der Plattform-Teil zieht ins Staff Control Center (W-E10).** Feature-Flags (eine
Freischaltung für **einen** Kunden — nach der Entscheidungsfrage in `FLAECHEN.md` die
Owner-Ebene) und Produkt-Updates (Plattform) gehen ins Staff CC, zusammen mit der
OCC-Überführung (W-E6). Danach wird `admin_panel.html` ganz stillgelegt, und die Frage, ob
`platform_admin` überhaupt noch gebraucht wird, beantwortet sich mit.

**Aufwand, grob:** A etwa ein Tag samt Tests; B ein bis zwei Tage (das Organization Control
Center hat 933 Zeilen mit Inline-JavaScript — Welle 6 fasst es ohnehin an); C etwa ein Tag,
sobald der Owner-Abschnitt zur OCC-Überführung vorliegt.

**Tests, die A und B mitbringen müssen:** Kunden-Admin auf `admin_panel.html` landet in der
Verwaltung · Plattform-Umfang unverändert · Zeitarbeitsfirma sieht „Verwaltung" in der
Kopfzeile, Worker nicht · CSV-Export aus der Verwaltung liefert nur die eigene Firma ·
Entfernen ohne Grund = 400, mit Grund steht er im Audit · Boundary-Tests OCC / Support /
Staff unverändert grün.

**Rückweg:** die Umleitung ist eine Zeile in der Seite plus ein Eintrag in
`api/config/visibilityMatrix.js`; ein Revert stellt den heutigen Zustand wieder her. Keine
Migration.

**Bis zur Entscheidung gilt:** nichts an dieser Seite reparieren. Befund 1 richtet keinen
Schaden an (er bricht ab, bevor er schreibt). Lautet die Antwort auf W-E9 „nein", ist der
richtige Fix für #1 **nicht**, `inactive` zu erlauben, sondern die Mitgliedschaft zu beenden
(siehe #2).
