# Plattform-Register

> **Was diese Datei ist.** Ein vollständiges, belegtes Inventar der Plattform TempConnect:
> welche Nutzerflächen existieren, was das Backend kann, was von allein läuft, was verkauft
> wird — und was davon nachweislich niemand erreicht. Sie ist die gemeinsame Grundlage für
> drei abgeleitete Dokumente: die Investorendarstellung, die Bedienungsanleitung und die
> Entscheidung darüber, was vor dem Marktstart entfernt wird.
>
> **Anspruch an die Belege.** Jede Zahl in diesem Dokument nennt ihre Herkunft (Datei, Zeile
> oder Zählbefehl). Wo das zugrunde liegende Inventar unsicher war oder sich beim Nachprüfen
> als falsch erwiesen hat, steht das ausdrücklich dort — geglättet wird nichts. Eine
> ungedeckte Behauptung in einem Investorendokument ist eine Haftung, kein Verkaufsargument.
>
> **Pflegemodell.** Diese Datei wird künftig generiert und per Test gegen den Code geprüft
> (Vorbild: `api/test/flaechenZuordnung.test.js`, das jede Fläche rot werden lässt, die in
> `docs/FLAECHEN.md` nicht eingetragen ist). Bis dahin ist sie handgeschrieben und trägt ein
> Stand-Datum. Ein Register ohne Prüfmechanik veraltet still — siehe den Abschnitt
> „Was dieses Register noch nicht leistet".
>
> **Stand: 2026-08-13.** Repo-Wurzel: `C:/Users/DennisStegemann/Desktop/12_tempconnect_docker(D)`.
> Alle Pfade relativ dazu. Branch beim Erstellen: `release/enterprise-premium-market-ready`.

---

## In drei Sätzen — was TempConnect ist

TempConnect ist eine B2B-Plattform für den DACH-Markt, auf der Zeitarbeitsfirmen ihr gerade
verfügbares Personal anbieten und einsetzende Unternehmen ihren Personalbedarf ausschreiben —
beide Seiten finden über einen Marktplatz und ein Matching-Verfahren zueinander.

Aus einem Treffer wird eine Anfrage, aus der Anfrage ein Angebot, aus dem Angebot eine
Einsatzvereinbarung: die Plattform begleitet den kompletten Weg bis zum laufenden Einsatz,
erfasst die geleisteten Stunden, lässt sie vom Kunden freigeben und erzeugt daraus die
Abrechnungsgrundlage.

Rund um diesen Kern liegen die Werkzeuge, die den Unterschied zwischen einer Vermittlungsbörse
und einem Steuerungssystem ausmachen: Lieferantensteuerung, Preisrahmen, Freigabe-Workflows,
Pflichtnachweise, Ausgabenanalyse und ein Prüfprotokoll — verkauft in fünf Tarifstufen.

---

## Die vier Flächen

Die Plattform besteht aus vier strikt getrennten Oberflächen mit eigenen Sitzungs- und
Berechtigungswelten. Die Trennung ist verbindlich und wird durch `api/test/flaechenZuordnung.test.js`
erzwungen; die inhaltliche Zuordnung steht in `docs/FLAECHEN.md`.

| Fläche | Für wen | Wofür | Technischer Einstieg |
|---|---|---|---|
| **Plattform** | Kunden: Zeitarbeitsfirmen (`agency`) und Unternehmen (`company`), dazu die Einsatzkräfte selbst (`worker`) | Das Produkt: Marktplatz, Anfragen, Deals, Einsätze, Stundenzettel, Steuerung | statische HTML-Seiten unter `frontend/public/`, API unter `/api/*` |
| **Staff Control Center** | das TempConnect-Team | Verwaltung der Plattform: Pilotbetreuung, Kataloge, Moderation, Konfiguration, interne Abläufe | `/staff/` (React), API strikt getrennt unter `/staff/api/*` (`api/app.js:462-470`) |
| **Owner Control Center** | die Eigentümer | der kundenspezifische Verwaltungsaufwand und die oberste Steuerungsebene | `/owner-control/` (React), API `/api/owner-control/*` (`api/app.js:447-448`) |
| **Support Center** | Support | Anfragen aus dem Publikum an TempConnect **und** Support zwischen Zeitarbeitsfirma und Unternehmen, beidseitig | `/support-ops/` (React, `nginx/nginx.conf:267-276`) |

**Modulzahl je interner Fläche.** Staff Control Center: 27 Module (gezählt in
`frontend/src/staff/modules/`, deckungsgleich mit der Registry in `docs/FLAECHEN.md`).
Owner Control Center: 11 Module (`docs/FLAECHEN.md`, Registry-Tabelle; Umsetzung in
`frontend/src/owner-control/modules/`). Support Center: eine Fläche ohne Modulverzeichnis
(`frontend/src/support/`, sechs Dateien).

**Merksatz zur Abgrenzung** (aus `docs/FLAECHEN.md`, entstanden aus einer realen
Fehlplatzierung): „Es geht um Geld" verschiebt nichts in die Owner-Fläche. Maßgeblich ist,
**wen** die Sache betrifft — von außen oder zwischen zwei Kunden → Support; genau ein Kunde →
Owner; die Plattform als Ganzes → Staff.

---

## Was die Plattform kann

Sortiert nach geschäftlicher Bedeutung, nicht alphabetisch. Endpunktzahlen sind gezählt mit
`grep -rEc "^\s*router\.(get|post|put|patch|delete)\(" api/routes/*.js`.

### 1. Marktplatz — Angebot und Nachfrage treffen sich

Zeitarbeitsfirmen melden, wen sie gerade frei haben; Unternehmen schreiben aus, was sie
brauchen. Beides ist durchsuchbar, beides kann die jeweils andere Seite anstoßen. Das ist der
Grund, warum es die Plattform gibt — alles Weitere hängt daran.

*Nutzt:* beiden Seiten. Die Zeitarbeitsfirma verkauft Leerlauf, das Unternehmen findet
Kapazität, ohne zehn Firmen einzeln anzurufen.
*Beleg:* `api/routes/marketplace.js` (42 Endpunkte), `api/routes/capacityExchange.js` (27),
`api/routes/listings.js` (5), `api/routes/capacities.js` (5). Oberflächen:
`capacity_exchange_feed.html`, `capacity_search.html`, `capacity_exchange_form.html`,
`marketplace_demand_create.html`, `marketplace_demand_list.html`.

### 2. Anfragen und Angebote — der Weg zum Abschluss

Ein Unternehmen fragt Personal an, die Zeitarbeitsfirma antwortet mit einem Angebot,
Gegenangebote und Rückzug sind vorgesehen. Jede Seite hat ihre eigene Liste: das Unternehmen
seine gesendeten Anfragen, die Zeitarbeitsfirma ihren Posteingang.

*Nutzt:* beiden Seiten — sie ersetzt den Mailverkehr, der sonst diesen Abschnitt trägt, durch
einen nachvollziehbaren Verlauf mit Status.
*Beleg:* `api/routes/requests.js` (11 Endpunkte), Angebotslogik in `api/routes/marketplace.js`
(`/marketplace/offers`, 16 Endpunkte). Oberflächen: `company_requests.html`,
`agency_inbox.html`, `request_detail.html`, `sla_angebote.html`, `angebote_verwalten.html`.

### 3. Matching — wer passt zu wem, und warum

Ein Bewertungsverfahren ordnet Kandidaten einem Bedarf zu und begründet die Reihenfolge nach
Rolle, Qualifikation, Region, Erfahrung und Reputation. Im Katalog heißt die Ausbaustufe
„Erweitertes 13-Faktor-Matching" (`api/config/planCatalog.js:328`), ab PRO.

*Nutzt:* dem Unternehmen (weniger Sichtung), der Zeitarbeitsfirma (weniger Fehlvorschläge)
und der Plattform selbst — das Verfahren ist das Produktversprechen, das eine Börse von einem
Vermittler unterscheidet.
*Beleg:* `api/routes/matching.js` (6 Endpunkte: nach Bedarf, nach Angebot, nach Person,
Sofortsuche, Erklärung), Bewertungslogik in `api/services/matchingEngine.js`, Rangspeicher in
der Tabelle `ai_match_rankings`. Oberfläche: `matching_results.html`.
*Einschränkung, belegt:* Von den sechs Matching-Endpunkten haben nur zwei einen Aufrufer im
Frontend (`grep -rl "matching/" frontend/` → 2 Treffer). Die Zuordnungslogik ist gebaut, aber
größtenteils nicht bedienbar.

### 4. Deals und Vereinbarungen — aus einem Ja wird ein Vertrag

Angenommene Angebote werden zu Einsatzvereinbarungen mit Zustandsverlauf, Dokumenten,
Bestätigung und Aktivierung. Dazu Rahmenverträge und ein Feedback-Kreislauf nach Abschluss.

*Nutzt:* beiden Seiten als gemeinsame Akte — was vereinbart wurde, steht an einer Stelle und
nicht in zwei Postfächern.
*Beleg:* `api/routes/contracts.js` (6), `api/routes/dealFeedback.js` (4),
`api/routes/offerAssets.js` (4), Deal-Endpunkte in `api/routes/marketplace.js`. Oberflächen:
`deal_management.html`, `offer_detail.html`. E2E-abgedeckt durch
`e2e/tests/deal-commitment-wizard.spec.js` und `e2e/tests/kernflow-deal-activation.spec.js`.

### 5. Einsätze und Vorstellungen — die Übergabe an die Wirklichkeit

Die Zeitarbeitsfirma stellt konkrete Personen beim Kunden vor; der Kunde prüft und bestätigt;
daraus entsteht ein laufender Einsatz mit mehreren Personen, Reservierungen und Nachbesetzung.

*Nutzt:* beiden Seiten — dieser Abschnitt ist der teuerste im Tagesgeschäft, weil hier Zusagen
kippen und nachbesetzt werden muss.
*Beleg:* `api/routes/agencyPortal.js` (17 Endpunkte, gemeinsamer Wächter in Zeile 44),
`api/routes/assignments.js` (6), `api/routes/workforce.js` (4), Tabellenfamilie
`assignment_staffing_*` (8 Tabellen: Kampagnen, Auswahlsätze, Auswahloptionen, Einladungen,
Reservierungen, Warteliste, Nachrichten, Ereignisse — gezählt in `sql/migrations/`). Oberfläche:
`worker-submissions-review.html`.

### 6. Personalstamm — die Akte der Zeitarbeitsfirma

Mitarbeiter anlegen, einladen, Qualifikationen und Papiere pflegen, auf Einsätze setzen,
abrechnungsrelevante Daten führen.

*Nutzt:* der Zeitarbeitsfirma. Größter fachlicher Einzelbereich des Backends nach dem Staff
Control Center.
*Beleg:* `api/routes/workers.js` (64 Endpunkte), `api/routes/skills.js` (3). Oberfläche:
`mitarbeiter.html`.

### 7. Einsatzportal — der eigene Bereich der Einsatzkraft

Die eingesetzte Person sieht ihre Einsätze, ihren Plan, ihre Papiere und trägt ihre Stunden
selbst ein — streng getrennt von allem, was die Firmen sehen.

*Nutzt:* der Einsatzkraft (Selbstauskunft statt Rückfrage) und der Zeitarbeitsfirma
(weniger Telefonate). Für den DACH-Markt zusätzlich ein Vertrauensargument gegenüber
Betriebsräten und Bewerbern.
*Beleg:* `api/routes/workerPortal.js` (39 Endpunkte), einheitlicher Rollenwächter über ein
gemeinsames `base`-Array (Zeile 227) statt Einzelprüfungen — die sauberste Absicherung im
Backend. Sechs Oberflächen `einsatzportal-*.html` plus `worker-login.html`. E2E:
`e2e/tests/einsatzportal-worker-flow.spec.js`, `e2e/tests/einsatzportal-aufnahme-gate.spec.js`.

### 8. Stundenzettel — der Übergang von Arbeit zu Geld

Stunden erfassen, einreichen, vom Kunden bestätigen oder zurückweisen lassen. Vier Sichten auf
denselben Vorgang, je nach Rolle: Zeitarbeitsfirma, Kunde, Einreichungsprüfung, Einsatzkraft.

*Nutzt:* beiden Seiten unmittelbar — ohne bestätigte Stunden gibt es keine Rechnung.
Der Katalog nennt es „ArbZG-konforme Erfassung, Freigabe und Rechnungsbezug"
(`api/config/planCatalog.js:321`), ab PLUS.
*Beleg:* `api/routes/timesheets.js` (21), `api/routes/companyTimesheets.js` (10),
`api/routes/timesheetTemplates.js` (8). Oberflächen: `timesheets.html`,
`company-timesheets.html`, `worker-submissions-review.html`,
`einsatzportal-stundenzettel.html`.
*Hinweis:* Die Vierteilung ist gewollte Rollen-/Prozesstrennung, kein Versehen — ausdrücklich
festgehalten in `.agents/skills/tempconnect-project/SKILL.md:513` („KEIN Merge, KEIN
Deprecate"). Für die Bedienungsanleitung ist es dennoch ein Benennungsproblem.

### 9. Rechnungsstellung

Aus freigegebenen Stunden werden Rechnungen: erzeugen, stellen, als bezahlt markieren,
stornieren, korrigieren, exportieren — inklusive DATEV-Export.

*Nutzt:* der Zeitarbeitsfirma. Das Ende der Wertschöpfungskette.
*Beleg:* `api/routes/invoices.js` (16 Endpunkte).
*Einschränkung, belegt:* Der operative Rechnungslauf `/invoices/operational/*` (10 der 16
Endpunkte, inkl. `generate`, `issue`, `paid`, `void`, `correction`, `export/csv`) hat **null**
Treffer im Frontend (`grep -rl "invoices/operational" frontend/` → 0). Gebaut, nicht bedienbar.

### 10. Einkaufssteuerung — das, was Unternehmen zum Zahlen bringt

Interne Bedarfsliste mit Freigabestufen, Lieferantenpool mit Stufen, Preisrahmen mit Ziel- und
Maximalsätzen, Ausgabenanalyse nach Lieferant, Region und Zeit, Lieferantenbewertung.

*Nutzt:* dem einkaufenden Unternehmen. Dieser Block ist die Begründung für die Tarifstufen PRO
und Individuell — er unterscheidet TempConnect von einer reinen Vermittlung.
*Beleg:* `api/routes/requisitions.js` (12), `api/routes/vendorPool.js` (10),
`api/routes/suppliers.js` (13), `api/routes/rateCards.js` (9),
`api/routes/spendAnalytics.js` (8), `api/routes/approvals.js` (7). Oberflächen:
`requisitions.html`, `requisition_create.html`, `vendor_pool.html`, `supplier_scorecard.html`,
`rate-cards.html`, `spend-analytics.html`, `approvals.html`.
*Anmerkung:* `rate-cards.html` trägt die feinste Zugriffslogik der Plattform — voll, nur
lesend, plan-gesperrt oder rollen-gesperrt, aufgelöst in `frontend/public/js/pageShell.js:53-70`
und `:174-239`.

### 11. Compliance und Nachweise

Pflichtdokumente mit Ampellogik, Ablauftermine, Verifikation, dazu ein Dokumententresor für
Rechnungen, Verträge, Richtlinien und Nachweise.

*Nutzt:* dem Unternehmen (Haftungsvermeidung nach AÜG) und der Zeitarbeitsfirma (ein Ort statt
Mailanhänge).
*Beleg:* `api/routes/complianceDocs.js` (9), `api/routes/documentCenter.js` (9). Oberflächen:
`compliance_overview.html`, `documents-center.html`.
*Einschränkung, belegt:* Eine dritte Fläche für denselben Zweck, `sla_nachweise.html`, ist eine
Attrappe ohne Datenverbindung; das zugehörige `api/routes/proofs.js` antwortet auf beide
Endpunkte mit HTTP 501 `NOT_IMPLEMENTED`. Frontend und Backend sind hier ehrlich zueinander —
gebaut ist nichts. Details im Aufräum-Abschnitt.

### 12. Notdienst — kurzfristige Besetzung

Ein Unternehmen meldet dringenden Bedarf, Zeitarbeitsfirmen reagieren mit verbindlichen
Zusagen, Eskalationsstufen greifen, aus einer Zusage wird direkt eine Vereinbarung.

*Nutzt:* beiden Seiten und ist ein Preisargument: Dringlichkeit rechtfertigt Aufschläge.
Im Katalog „Notdienst / Emergency Staffing" (`api/config/planCatalog.js:322`), ab PLUS.
*Beleg:* `api/routes/emergency.js` (11 Endpunkte, inkl. `/emergency/:id/escalate` und
`/emergency/:id/commitments/:cid/create-agreement`). Oberflächen:
`capacity_exchange_notdienst.html`, Eingang in `marketplace_demand_detail.html`.

### 13. Auswertung und Steuerung

Managementsicht auf Lieferantenleistung, Besetzungsdruck, Ausgaben, Qualität und
Plattformzustand — mit Angabe des Betrachtungsrahmens (Organisation, Standort, Zeitraum,
Datenstand) und Warnbannern bei SLA-Unterschreitung.

*Nutzt:* der Geschäftsleitung des Kunden. Zugleich das sichtbarste Argument in einer
Verkaufsdemonstration.
*Beleg:* `api/routes/reporting.js` (8), `api/routes/analytics.js` (14),
`api/services/reportingService.js` (Warnliste `alerts[]`). Oberfläche:
`executive_dashboard.html`, E2E: `e2e/tests/executive-dashboard-flow.spec.js`.

### 14. Benachrichtigungen, Aktivität und Daueraufträge

Ein Ereignisverteiler übersetzt Geschäftsvorgänge in Benachrichtigungen — auf der Plattform und
per E-Mail. Dazu gespeicherte Suchaufträge, die melden, wenn passendes Personal oder ein
passender Bedarf auftaucht.

*Nutzt:* beiden Seiten. Ohne diesen Mechanismus verfällt eine Marktplatzplattform zu einer
Seite, die man aktiv besuchen muss.
*Beleg:* `api/services/notificationMatrix.js` deckt **46 Ereignistypen** ab (gezählt:
`grep -cE "^  '[a-z_]+\.[a-z_]+':" api/services/notificationMatrix.js`) — von
`requisition.submitted_for_approval` über `deal.agreement_activated` bis `bounty.earned`.
Dazu `api/routes/notifications.js` (11), `api/routes/notificationStream.js` (2, Live-Strom),
`api/routes/activityFeed.js`, `api/routes/slaSearchJobs.js` (14). Oberflächen:
`activity.html` (von der Glocke auf jeder Seite), `sla_search_jobs_list.html`,
`sla_search_job_detail.html`.

### 15. Sichtbarkeit und Reputation

Firmen- und Personenprofile, öffentliche Kurzprofile mit Einwilligung, Bewertungen, Rankings
und bezahlte Marktplatz-Sichtbarkeit.

*Nutzt:* der Zeitarbeitsfirma (gefunden werden) und der Plattform (zweite Erlösquelle neben
dem Abonnement).
*Beleg:* `api/routes/companyProfile.js` (19), `api/routes/profileVisibility.js` (11),
`api/routes/reputation.js` (4), `api/routes/ratings.js` (4),
`api/routes/profileBounties.js` (4), `api/routes/profileAnalytics.js` (3),
`api/routes/profileRankings.js` (2). Oberflächen: `company_profile_public.html`,
`worker-profile-public.html`.

### 16. Bindung und Wachstum

Rabatte, die Kunden sich durch Nutzung erarbeiten; Empfehlungsprogramm; Guthaben; Mentoring;
strategische Zusammenarbeit.

*Nutzt:* der Plattform — Aktivierungs- und Bindungsmechanik. Wirtschaftlich der Hebel gegen
Abwanderung nach dem ersten Monat.
*Beleg:* `api/routes/bounties.js` (6), `api/routes/referralProgram.js` (6),
`api/routes/mentoring.js` (5), `api/routes/strategicCollaboration.js` (5),
`api/routes/credits.js` (4). Oberfläche: `bounties.html`, `credits.html`.
*Nachtrag 2026-08-21:* Die Einschränkung „`/credits/*` hat null Treffer im
Frontend" gilt nicht mehr — `credits.html` bedient alle vier Endpunkte. Der Kauf
läuft seit Befund P1-22 über Stripe; gutgeschrieben wird ausschließlich im
signaturgeprüften Webhook.

### 17. Tarife, Abonnement und Abrechnung

Tarifkatalog, öffentliche Preisseite, Buchung, Tarifanfragen mit Freigabe durch das Team,
Vertragsdokumente, Zahlungsabwicklung, Testzugang.

*Nutzt:* der Plattform unmittelbar — hier entsteht der Umsatz.
*Beleg:* `api/config/planCatalog.js` (Wahrheitsquelle für Pläne, Features und Zusatzmodule),
`api/routes/plans.js` (2), `api/routes/publicPlans.js` (6),
`api/routes/subscriptionRequests.js` (7), `api/routes/subscriptionDocuments.js` (5),
`api/routes/payment.js` (8), `api/routes/demo.js` (3). Oberflächen: `pricing.html`,
`sla_abo.html`, `enterprise_anfrage.html`, `demo.html`.

### 18. Organisation, Zugang und Sicherheit

Mitglieder, Rollen, Standorte, Abteilungen, Einladungen, API-Schlüssel, Zwei-Faktor-Anmeldung,
Unternehmens-Login über SAML sowie automatische Nutzerbereitstellung über SCIM.

*Nutzt:* dem Kunden (Verwaltung ohne Support-Ticket) und dem Vertrieb: SSO und SCIM sind bei
Konzernkunden Ausschlusskriterien, nicht Zusatzwünsche.
*Beleg:* `api/routes/orgControlCenter.js` (30), `api/routes/organizations.js` (17),
`api/routes/me.js` (20), `api/routes/auth.js` (12), `api/routes/sso.js` (9),
`api/routes/scim.js` (7, SCIM 2.0), `api/routes/mfa.js` (5), `api/routes/oauth.js` (2).
Rechtemodell: 12 Rollen und 63 benannte Berechtigungen in `api/services/rbacService.js`.
Oberflächen: `organization.html`, `sso_config.html`, `org-invite.html`.

### 19. Schnittstellen zu Fremdsystemen

Webhooks für Slack und Teams, Zustellprotokoll mit Wiederholung, sowie Feldzuordnungen für
DATEV, SAP und zvoove.

*Nutzt:* dem Kunden (kein doppeltes Erfassen) und der Plattform als Wechselbarriere.
Verkauft als Zusatzmodul für 399,00 € im Monat.
*Beleg:* `api/routes/integrations.js` (12 Endpunkte, inkl. `/integrations/:id/deliveries` und
`/org/erp-mappings`). Oberfläche: `integrations.html`.

### 20. Datenschutz und Governance

Datenbestandsauskunft, Datenexport je Nutzer und je Organisation, Anonymisierung mit
Vorabprüfung, Aufbewahrungsfristen, Bearbeitung von Betroffenenanfragen.

*Nutzt:* dem Kunden (DSGVO-Nachweispflicht) und der Plattform (Voraussetzung für den
Einkaufsprozess großer Unternehmen).
*Beleg:* `api/routes/dataGovernance.js` (10 Endpunkte). Oberflächen: `data-governance.html`,
`trust/security.html`, `trust/compliance.html`.
*Erkenntnis aus dem Projektprotokoll:* Fehlerpfade in Löschflüssen eskalieren bewusst
(409/500) statt zu degradieren — ein früherer Hard-Delete-Notnagel hätte Aufbewahrungspflichten
nach HGB §257 verletzen können (`CLAUDE.md`, Erkenntnis 2026-08-03).

### 21. Betrieb, Diagnose und Prüfprotokoll

Gesundheitsprüfungen, Systemzustand, Plattformkennzahlen, Prüfprotokoll mit CSV-Export,
interne Steuerendpunkte.

*Nutzt:* dem Betrieb und der Nachweisführung. Das Prüfprotokoll (`audit_log`, angelegt in
`sql/migrations/010_enterprise_hardening.sql:16`) ist bei Enterprise-Verkäufen ein
regelmäßiger Prüfpunkt.
*Beleg:* `api/routes/health.js` (8), `api/routes/admin.js` (25), `api/routes/internal.js` (28),
`api/routes/internalControlCenter.js` (15). Prüfprotokoll-Schreibzugriffe in 28 Dateien unter
`api/routes/` und `api/services/`. Oberflächen: `system-health.html`, `admin_panel.html`,
`trust/status.html`.

### 22. Interne Flächen (kein Kundenprodukt)

Staff Control Center (`api/routes/staffControlCenter.js`, 104 Endpunkte — größte
Einzeldatei des Backends), Owner Control Center (`api/routes/occ/`, 31 Endpunkte in 13
Modul-Routern), Support Center (`api/routes/support.js`, 17 Endpunkte).

Der **Weg hinein** liegt bewusst außerhalb dieser Flächen: `api/routes/supportIntake.js`
(`/support-requests`) ist die Kundenseite des Support Centers. Sie hängt **nicht** unter dem
Präfix `/support` — dort steht das Staff-Tor `supportAuth` (`support.js:664`), und eine
Kundenroute darunter wäre ein Loch, das ab da für alle Routen darunter gälte. Bis dahin hatte
`support_cases` im gesamten Repo **kein einziges `INSERT`**: das Support Center war ein
Lesesaal über einer Tabelle, die niemand füllen konnte.

*Nutzt:* dem Betreiber. Für die Investorendarstellung relevant als Beleg, dass der Betrieb der
Plattform selbst produktisiert ist und nicht per Datenbankkonsole läuft.

---

### 23. Weitere Endpunkt-Familien — nachgetragen am 2026-08-14

Diese dreizehn Router fehlten in der ersten Fassung des Registers. Aufgefallen sind
sie nicht beim Lesen, sondern durch den Doku-Wächter (`api/test/dokuWaechter.test.js`),
der jede Router-Datei gegen dieses Dokument hält. Genau dafür gibt es ihn.

**Tragende Infrastruktur** — ohne sie funktioniert die Oberfläche nicht:

| Router | Pfad | Wozu | Oberfläche |
|---|---|---|---|
| `api/routes/csrf.js` | `/csrf` | Token gegen Formularfälschung; jede schreibende Aktion holt es | 54 Seiten |
| `api/routes/onboarding.js` | `/onboarding/status` | Einrichtungs-Fortschritt nach der Anmeldung | 59 Seiten |
| `api/routes/search.js` | `/search` | Übergreifende Suche | 7 Seiten |
| `api/routes/settings.js` | `/settings` | Betriebseinstellungen der Organisation | 1 Seite |
| `api/routes/geo.js` | `/geo/coordinates` | Adresse zu Koordinaten, für Umkreissuche | 2 Seiten |
| `api/routes/productReleases.js` | `/product-releases` | Produkt-Updates nach Rolle und Tarif | 3 Seiten |
| `api/routes/pilotPreregistration.js` | `/pilot-preregistration` | Voranmeldung für den Hamburger Pilotstart | 1 Seite |
| `api/routes/ownerControlCenter.js` | `/owner-control` | Einstieg der Eigentümer-Fläche (React-Shell) | eigene Anwendung |

**Gebaut, aber ohne Oberfläche** — gezählt am 2026-08-14 mit
`grep -rl "<pfad>" frontend/public/`, jeweils **null** Treffer:

| Router | Pfad | Wozu es gedacht war |
|---|---|---|
| `api/routes/preferredVendors.js` | `/preferred-vendors` | Vorzugslieferanten eines Unternehmens verwalten |
| `api/routes/supplierPools.js` | `/supplier-pools/distribute` | Eine Anfrage an mehrere Zeitarbeitsfirmen gleichzeitig verteilen |
| `api/routes/capacityDiscovery.js` | `/capacity-discovery/by-role` | Freie Kapazität nach Rolle finden |
| `api/routes/smartPricing.js` | `/pricing/suggest` | Preisvorschlag für ein Angebot |

Das ist **keine Fehlerliste.** Der Code sagt nur, dass keine Oberfläche darauf
zugreift — nicht, warum. Drei Lesarten sind möglich: bewusst für später gebaut,
über eine Schnittstelle von außen genutzt, oder liegengeblieben. Welche zutrifft,
weiß nur der Owner. Die Entscheidung steht unter *Aufräumen*, nicht hier.

## Nutzerflächen im Einzelnen

89 Nutzerflächen: 77 Dateien in `frontend/public/*.html`, 6 unter `legal/`, 4 unter `trust/`,
dazu `frontend/landing.html` und `frontend/demo.html`
(gezählt: `ls frontend/public/*.html | wc -l` → 77).

**Zustandsschlüssel:** `aktiv` = echte Datenanbindung und erreichbar · `teilweise` = erreichbar,
aber mit belegtem Mangel · `attrappe` = Oberfläche ohne Funktion dahinter · `tot` = reine
Weiterleitung oder für keinen Nutzer erreichbar.

### Einstieg und Öffentlichkeit

| Seite | Für wen | Wozu | Zustand |
|---|---|---|---|
| `frontend/landing.html` | öffentlich, alle Kunden | Startseite und Anmeldemaske in einem; Eingeloggte werden in den Arbeitsbereich geschickt (`nginx/nginx.conf:91-93`) | aktiv |
| `frontend/demo.html` | öffentlich (Unternehmen) | Testzugang ohne Vertrag anfordern | aktiv |
| `frontend/public/pricing.html` | öffentlich | Tarifübersicht vor der Anmeldung; ohne Login erreichbar (`js/pageShell.js:528`) | aktiv |
| `frontend/public/about.html` | öffentlich | Selbstdarstellung und Positionierung; durch `e2e/tests/product-core-positioning.spec.js` geschützt | aktiv |
| `frontend/public/onepager.html` | öffentlich | eigenständige Kampagnenseite für den Hamburger Pilotstart mit Voranmeldung (`nginx/nginx.conf:109`) | aktiv |
| `frontend/public/onboarding.html` | öffentlich | Drei-Schritte-Erklärung für Neuinteressenten | teilweise |
| `frontend/public/whats-new.html` | alle Kunden | Produkt-Updates nach Rolle und Tarif | aktiv |

### Arbeitsbereich und Marktplatz

| Seite | Für wen | Wozu | Zustand |
|---|---|---|---|
| `enterprise.html` | Zeitarbeitsfirma, Unternehmen | Startseite nach dem Login; Kachelübersicht zu 15 Zielseiten, 12 davon rollenabhängig geschaltet (`data-surface`) | aktiv |
| `capacity_exchange_feed.html` | Unternehmen, Zeitarbeitsfirma | Marktplatzliste: verfügbares Personal durchsuchen | aktiv |
| `capacity_search.html` | Unternehmen | Detailsuche nach Rolle, Ort, Verfügbarkeit; plan-gesperrt (`sla_access`) | aktiv |
| `capacity_exchange_detail.html` | Unternehmen | einzelner Personaleintrag, daraus Anfrage stellen | aktiv |
| `capacity_exchange_form.html` | Zeitarbeitsfirma | verfügbare Mitarbeiter in den Marktplatz stellen | aktiv |
| `capacity_exchange_manage.html` | Zeitarbeitsfirma | eigene Marktplatzeinträge aktivieren, pausieren, archivieren | aktiv |
| `capacity_exchange_notdienst.html` | Zeitarbeitsfirma | dringend verfügbares Personal sofort priorisiert melden | aktiv |
| `marketplace_demand_create.html` | Unternehmen | Personalbedarf ausschreiben | aktiv |
| `marketplace_demand_list.html` | Unternehmen | eigene Ausschreibungen mit Status und Reaktionen | aktiv |
| `marketplace_demand_detail.html` | Unternehmen, Zeitarbeitsfirma | Ausschreibung mit allen eingegangenen Angeboten; hier wird entschieden | aktiv |

### Anfragen, Angebote, Deals

| Seite | Für wen | Wozu | Zustand |
|---|---|---|---|
| `requisitions.html` | Unternehmen | interne Bedarfsliste: erfassen, priorisieren, durch die Freigabe schicken | aktiv |
| `requisition_create.html` | Unternehmen | neues internes Stellenangebot anlegen | aktiv |
| `company_requests.html` | Unternehmen | alle an Zeitarbeitsfirmen gestellten Anfragen mit Status | aktiv |
| `agency_inbox.html` | Zeitarbeitsfirma | Posteingang: welche Unternehmen haben angefragt | aktiv |
| `request_detail.html` | beide | einzelne Anfrage mit Verlauf und Status | aktiv |
| `angebote_verwalten.html` | Zeitarbeitsfirma | Sammelseite: eigene Anfragen, Eingänge, Treffer, Angebote | aktiv |
| `sla_angebote.html` | Zeitarbeitsfirma | Angebot auf eine Ausschreibung abgeben; plan-gesperrt (`sla_offers_create`) | aktiv |
| `matching_results.html` | Unternehmen | passende Kandidaten mit Begründung der Reihenfolge | aktiv |
| `deal_management.html` | beide | alle Einsatzvereinbarungen und Verhandlungen mit Stand | aktiv |
| `offer_detail.html` | beide | vollständige Dealakte: Angebot, Vereinbarung, Dokumente, Verlauf | aktiv |
| `sla_search_jobs_list.html` | beide | gespeicherte Daueraufträge | aktiv |
| `sla_search_job_detail.html` | beide | Dauerauftrag ansehen, ändern, Treffer verfolgen | aktiv |

### Personal, Einsätze, Zeiten

| Seite | Für wen | Wozu | Zustand |
|---|---|---|---|
| `mitarbeiter.html` | Zeitarbeitsfirma | Personalverzeichnis: Stammdaten, Qualifikationen, Einsatzhistorie | aktiv |
| `worker-submissions-review.html` | beide | zentrale Steuerung: Einsatzkräfte, Stundenzettel, Kundenfreigaben, Nachweise | aktiv |
| `timesheets.html` | Zeitarbeitsfirma, Unternehmen | Arbeitszeiten eintragen, einreichen, freigeben lassen | aktiv |
| `company-timesheets.html` | Unternehmen | Stundenzettel-Eingang prüfen, bestätigen oder zurückweisen | aktiv |
| `approvals.html` | Unternehmen | alles, was auf eine Entscheidung wartet | aktiv |
| `timesheet-templates.html` | Unternehmen | wiederverwendbare Vorlagen für die Zeiterfassung | **tot** |

### Einsatzportal (Einsatzkräfte)

| Seite | Für wen | Wozu | Zustand |
|---|---|---|---|
| `worker-login.html` | Mitarbeiter | Konto einrichten und anmelden; eigene kurze URL für Links in SMS/E-Mail (`nginx/nginx.conf:99-101`) | aktiv |
| `einsatzportal-dashboard.html` | Mitarbeiter | Startseite: nächster Einsatz, offene Aufgaben; Pflichtziel für Rolle `worker` (`js/pageShell.js:138,544`) | aktiv |
| `einsatzportal-einsaetze.html` | Mitarbeiter | aktuelle und vergangene Einsätze | aktiv |
| `einsatzportal-plan.html` | Mitarbeiter | Dienstplan: wann und wo | aktiv |
| `einsatzportal-abwesenheit.html` | Mitarbeiter | sich selbst abmelden (dreistufig, mit Zeitsperre) oder eine Verspätung melden | aktiv |
| `einsatzportal-stundenzettel.html` | Mitarbeiter | eigene Arbeitszeiten eintragen und einreichen | aktiv |
| `einsatzportal-profil.html` | Mitarbeiter | Stammdaten, Qualifikationen, Foto pflegen | aktiv |
| `einsatzportal-benachrichtigungen.html` | Mitarbeiter | Nachrichten und Hinweise | aktiv |
| `einsatzportal-kontakt.html` | Mitarbeiter | Zeitarbeitsfirma oder Support erreichen | aktiv |
| `worker-profile-public.html` | öffentlich (Link) | einsehbares Kurzprofil, nur mit Einwilligung | aktiv |

### Steuerung und Einkauf

| Seite | Für wen | Wozu | Zustand |
|---|---|---|---|
| `executive_dashboard.html` | Unternehmen (Leitung) | Managementsicht: Lieferanten, Besetzungsdruck, Ausgaben, Qualität | aktiv |
| `vendor_pool.html` | Unternehmen | bevorzugte Zeitarbeitsfirmen mit Stufen und Leistung | aktiv |
| `supplier_scorecard.html` | Unternehmen | Bewertung, Leistung, Risikosignale je Lieferant | aktiv |
| `rate-cards.html` | Unternehmen (Einkaufsrollen, PRO/Individuell) | Ziel- und Maximalsätze pro Rolle, Region, Lieferant | aktiv |
| `spend-analytics.html` | Unternehmen | wohin das Geld fließt: Kosten, Abweichungen, Lieferantenausgaben, Export | aktiv |
| `compliance_overview.html` | Unternehmen | Pflichtdokumente mit Ampellogik, Ablauftermine, Verifikation | aktiv |
| `documents-center.html` | beide | Dokumententresor: Rechnungen, Verträge, Richtlinien, Nachweise | aktiv |
| `sla_nachweise.html` | Unternehmen | sollte Nachweise hochladen — Funktion ist nicht gebaut | **attrappe** |

### Konto, Organisation, Technik

| Seite | Für wen | Wozu | Zustand |
|---|---|---|---|
| `sla_profil.html` | beide | Kontoeinstellungen: Firmenprofil, Tarif, Organisation, Schnittstellen | aktiv |
| `sla_abo.html` | beide | Tarifauswahl und Buchung; Ziel jeder Bezahlschranke der Plattform | aktiv |
| `enterprise_anfrage.html` | Unternehmen | Konfigurator für den individuellen Tarif | aktiv |
| `bounties.html` | beide | Aufgaben, mit denen Kunden sich Rabatte erarbeiten | aktiv |
| `credits.html` | beide | Guthabenstand, Verlauf und Kauf über Stripe (Befund P1-22) | aktiv |
| `organization.html` | beide (Admin) | Mitglieder, API-Schlüssel, Sicherheitseinstellungen, Finanz-Export | aktiv |
| `org-invite.html` | neue Mitglieder | Einladung aus der E-Mail annehmen; bewusst ohne Navigation | aktiv |
| `integrations.html` | beide | Slack/Teams, DATEV, SAP, zvoove anbinden | aktiv |
| `sso_config.html` | Unternehmen (Admin) | Anmeldung über das Firmen-Login einrichten | aktiv |
| `admin_panel.html` | Admin | Benutzer, Organisationen, Prüfprotokoll, Plattformkennzahlen | aktiv |
| `system-health.html` | Admin | Echtzeit-Diagnose der Plattformkomponenten | aktiv |
| `company_profile_public.html` | öffentlich, Kunden | Visitenkarte einer Firma inkl. Bewertungen und Kooperationsanfrage | aktiv |
| `activity.html` | beide | Posteingang der Plattform; von der Glocke jeder Seite erreichbar (`js/pageShell.js:444`) | aktiv |

### Hilfe, Vertrauen, Recht

| Seite | Für wen | Wozu | Zustand |
|---|---|---|---|
| `hilfe.html` | alle, öffentlich | Kurzhilfe, FAQ nach Rolle, Support-Kontakt; vom Fragezeichen jeder Seite erreichbar | aktiv |
| `sla_hilfe.html` | alle Kunden | ausführliches Handbuch (54 KB, übersetzt) | aktiv |
| `data-governance.html` | beide | Trust Center: Verteiler zu Recht, Datenschutz, Sicherheit, Compliance | aktiv |
| `api-docs.html` | beide (Technik) | Schnittstellenreferenz für Kundenentwickler | aktiv |
| `api-explorer.html` | beide (Technik) | Schnittstellen direkt im Browser testen | aktiv |
| `legal/impressum.html` | öffentlich | gesetzliche Anbieterangaben (gültige Fassung) | aktiv |
| `legal/datenschutz.html` | öffentlich | Datenschutzerklärung (gültige Fassung) | aktiv |
| `legal/agb.html` | öffentlich, alle Kunden | Vertragsbedingungen (22 KB, größter Rechtstext) | aktiv |
| `legal/sla.html` | öffentlich, alle Kunden | Anlage 1: zugesicherte Servicelevel | aktiv |
| `legal/kontakt.html` | öffentlich | Kontaktwege zum Anbieter | aktiv |
| `trust/security.html` | öffentlich, Unternehmen | wie die Plattform Daten schützt — Argument im Einkaufsprozess | aktiv |
| `trust/compliance.html` | öffentlich, Unternehmen | welche gesetzlichen Anforderungen abgedeckt sind | aktiv |
| `trust/platform-sla.html` | öffentlich, Unternehmen | zugesicherte Verfügbarkeit und Reaktionszeiten | aktiv |
| `trust/status.html` | öffentlich, alle Kunden | öffentliche Statusanzeige | aktiv |
| `impressum.html` (Wurzel) | öffentlich | Platzhalter statt Pflichtangaben; nur aus `onepager.html:219` verlinkt | **attrappe** |
| `datenschutz.html` (Wurzel) | öffentlich | Kurzfassung für die Pilot-Voranmeldung | **attrappe** |

### Weiterleitungen ohne eigenen Inhalt

Alle neun bestehen aus 14 nicht-leeren Zeilen mit einem `<meta http-equiv="refresh">`
(gezählt: `grep -c . frontend/public/<datei>.html`).

| Seite | Leitet auf | Zustand |
|---|---|---|
| `capacity_exchange.html` | `capacity_exchange_feed.html` | tot |
| `marketplace_capacity_create.html` | `capacity_exchange_form.html` | tot |
| `worker-portal.html` | `einsatzportal-dashboard.html` | tot |
| `worker-timesheet.html` | `einsatzportal-stundenzettel.html` | tot |
| `internal_control_center.html` | `admin_panel.html` | tot |
| `api_docs.html` | `api-docs.html` | tot |
| `app_notdienst.html` | `/` | tot |
| `legal/meine-agb.html` | `legal/agb.html` | tot |
| `demand_create.html` | `marketplace_demand_create.html` | **teilweise** — wird noch aktiv angesteuert |

---

## Was von allein läuft

> **Nachgetragen am 2026-08-14:** `api/workers/capacityWorker.js` fehlte in der
> ersten Fassung — derselbe Wächter hat es gemeldet. Er trägt die drei Tagesläufe
> (Verfall 03:00, Überfälligkeits-Prüfung 03:30, Aufbewahrung des
> Zustandsprotokolls 04:00).


Hintergrundarbeit läuft über vier BullMQ-Warteschlangen mit Redis. **Ohne Redis startet die
Anwendung weiterhin, aber es läuft nichts von allein** — die Warteschlangen werden dann gar
nicht erst erzeugt (`api/queue/queues.js`, `getOrCreate` gibt `null` zurück;
`api/workers/index.js:41-44` protokolliert „Redis not configured — background workers disabled").
Das ist bewusst so gebaut und für die Betriebsplanung die wichtigste Einzelinformation dieses
Abschnitts.

| Job / Auslöser | Wann | Was passiert ohne ihn |
|---|---|---|
| **E-Mail-Versand** (`email`-Queue) | ereignisgesteuert, max. 20 E-Mails/Minute, 5 parallel, 3 Wiederholungen | Keine Benachrichtigungs-E-Mail verlässt die Plattform. Nutzer erfahren von Angeboten, Freigaben und Treffern nur, wenn sie die Seite von sich aus öffnen. Beleg: `api/workers/emailWorker.js`, Aufrufer `api/services/notificationMatrix.js` und `api/services/matchAlertService.js` |
| **Trefferberechnung** (`match`-Queue) | ereignisgesteuert bei neuer Anfrage, 3 parallel | Zu neuen Anfragen wird kein Treffer-Ranking berechnet; die Vorschlagsliste bleibt leer. Beleg: `api/workers/matchWorker.js` → `api/services/matchingEngine.js` |
| **Einsatz-Einladungen und Erinnerungen** (`staffing`-Queue) | ereignisgesteuert, 6 parallel | Einladungen an Einsatzkräfte werden nicht zugestellt, Erinnerungen bleiben aus. Beleg: `api/workers/staffingWorker.js` → `api/services/assignmentStaffingService.js:661` |
| **Verfallslauf Marktplatz** (`capacity-expiry`) | täglich 03:00 | Abgelaufene Angebote und Bedarfe bleiben auf `active`. Der Marktplatz zeigt Personal an, das es nicht mehr gibt — der direkteste Weg, das Vertrauen in die Liste zu verlieren. Beleg: `api/workers/index.js:28` |
| **Überfälligkeitsprüfung** (`capacity-stale-check`) | täglich 03:30 | Einträge, die zur Bestätigung anstehen, werden nicht gemeldet; die Liste veraltet unbemerkt. Beleg: `api/workers/index.js:29-30` |
| **Aufbewahrung Zustandsprotokoll** (`worker-status-events-retention`) | täglich 04:00, Frist 24 Monate | Die Ereignistabelle wächst unbegrenzt. Abgesichert: die Frist steht zusätzlich als Datenbankfunktion (`SELECT worker_status_events_aufraeumen();`, Migration 179) und ist jederzeit von Hand auslösbar. Beleg: `api/workers/index.js:32-38` |

**Einplanung ist neustartfest.** Die drei Tagesläufe werden über `upsertJobScheduler` mit fester
Kennung eingeplant und verdoppeln sich bei einem Neustart nicht (`api/workers/index.js:24-38`).
Der Kommentar an dieser Stelle hält fest, dass es den Capacity-Worker vorher schon gab, aber
nichts die Jobs eingeplant hat — der Verfallslauf lief nie.

**Kein zweiter Taktgeber.** Es gibt keine `setInterval`-basierte Hintergrundarbeit in
`api/server.js`, `api/app.js` oder `api/services/*.js` (geprüft, null Treffer). Alles
Wiederkehrende läuft über die drei Einträge oben.

**Betriebsmessung.** Alle vier Warteschlangen melden Wartende und Aktive an Prometheus
(`registerQueueMetrics`, `api/workers/index.js:63-70`), ebenso der Datenbank-Pool.

---

## Pläne und Preise

Wahrheitsquelle: `api/config/planCatalog.js`. Kanonische Plankeys: `DEMO`, `BASIS`, `PLUS`,
`PRO`, `INDIVIDUELL`. `ENTERPRISE` ist kein öffentlicher Plan, sondern eine Tarifstufe
innerhalb von `INDIVIDUELL`.

| Plan | Preis | Takt | Selbst buchbar | Positionierung laut Katalog |
|---|---|---|---|---|
| DEMO | 0,00 € | 14 Tage | ja | „Plattform 14 Tage kostenlos testen." |
| BASIS | 150,00 € | / Monat | ja | „Anfragen senden, Angebote erstellen, Deals abschliessen — der operative Einstieg." |
| PLUS | 499,00 € | / Monat | ja | „Digitale Stundenzettel, automatische Abrechnung, Notdienst und Smart Pricing." Badge: *Empfohlen* |
| PRO | 799,00 € | / Monat | ja | „Unbegrenzte Anfragen, erweitertes Matching mit AI-Ranking, Lieferanten-Bewertung." |
| INDIVIDUELL | auf Anfrage | individuell | nein, Anfrage nötig | „Individueller Tarif fuer mehrere Standorte, Rahmenkonditionen und Governance." Badge: *Custom* |

*(Preise im Katalog in Cent hinterlegt: 0 / 15000 / 49900 / 79900 / `null`,
`api/config/planCatalog.js:185-278`.)*

**Stufen innerhalb von INDIVIDUELL** — automatisch nach Mitarbeiterzahl abgeleitet
(`organizations.individual_tier_auto`, Migration 080; `api/config/planCatalog.js:106-160`):
S, M, L, Enterprise.

**Zusatzmodule** — ausschließlich für INDIVIDUELL buchbar
(`api/config/planCatalog.js:383-386`):

| Zusatzmodul | Preis / Monat | Freigabe durch das Team nötig |
|---|---|---|
| API-Zugang & Webhooks | 399,00 € | nein |
| Spend Analytics Premium | 349,00 € | nein |
| Rate Card Management | 299,00 € | nein |
| Erweiterter SLA (99,9 % statt 99,5 %) | 449,00 € | ja |

**Funktionskatalog.** 36 benannte Funktionsschlüssel (gezählt: `grep -c "feature_key:"
api/config/planCatalog.js`, alle innerhalb von `FEATURE_CATALOG_RAW`, Zeilen 314-371) in zehn
Kategorien (`core`, `staffing`,
`matching`, `capacity`, `analytics`, `governance`, `compliance`, `integration`, `support`,
`security`), jeder mit den Feldern `visible_in_pricing`, `visible_in_subscription`,
`available_as_addon`, `requires_staff_approval` (`api/config/planCatalog.js:316-367`).
Nicht jeder Schlüssel wird beworben: `sla_proofs` etwa steht auf `visible_in_pricing: false`
(Zeile 367) — er taucht in der Abo-Ansicht auf, wird aber nicht verkauft. Das ist bei der
Bewertung der Attrappe `sla_nachweise.html` weiter unten wichtig.

---

## Zahlen auf einen Blick

| Größe | Zahl | Herkunft |
|---|---|---|
| API-Endpunkte insgesamt | **938** | `grep -rE "^\s*(router\|app)\.(get\|post\|put\|patch\|delete)\(" api/routes/ --include=*.js \| wc -l` |
| davon Owner Control Center | 31 | dieselbe Zählung, beschränkt auf `api/routes/occ/` (13 Modul-Router) |
| davon Staff Control Center | 104 | `api/routes/staffControlCenter.js` — größte Einzeldatei |
| Router-Dateien | 83 | `ls api/routes/ \| wc -l` (inkl. Verzeichnis `api/routes/occ/`) |
| Service-Dateien | 175 | `ls api/services/ \| wc -l` |
| Datenbanktabellen | **180** | eindeutige `CREATE TABLE`-Namen in `sql/init.sql` + `sql/migrations/*.sql`, bereinigt um einen Treffer aus einem deutschen Kommentar. Davon 4 aus dem Grundschema (`users`, `listings`, `requests`, `subscriptions`), 176 aus Migrationen |
| Migrationsdateien | **197** | `ls sql/migrations/*.sql \| wc -l` — nummeriert `001_ratings.sql` bis `193_ersatz_anfrage_verfaellt.sql`; neun Nummern sind doppelt belegt (`027`/`027b`, `045`/`045b`, `064`, `070`, `074`, `075`, `086`, `130`, `140`). `NUMBERING.md` ist keine Migration |
| Nutzerflächen | **89** | 77 in `frontend/public/*.html` + 6 `legal/` + 4 `trust/` + `frontend/landing.html` + `frontend/demo.html` |
| davon reine Weiterleitungen | 9 | je 14 nicht-leere Zeilen, reiner Meta-Refresh |
| davon Attrappen | 3 | `sla_nachweise.html`, `impressum.html`, `datenschutz.html` (Wurzel) |
| davon für keinen Nutzer erreichbar | 1 | `timesheet-templates.html` — null eingehende Verweise in `frontend/`, `api/`, `nginx/`, `e2e/` |
| Backend-Testdateien | 340 | `ls api/test/*.test.js \| wc -l` |
| E2E-Testdateien | 17 | `ls e2e/tests/ \| wc -l` |
| Rollen im Rechtemodell | 12 | `ROLE_HIERARCHY` in `api/services/rbacService.js:9-22` |
| Benannte Berechtigungen | 63 | `PERMISSIONS` in `api/services/rbacService.js:25 ff.` |
| Benachrichtigungs-Ereignistypen | 46 | Schlüssel in `MATRIX`, `api/services/notificationMatrix.js` |
| Hintergrund-Warteschlangen | 4 | `api/queue/queues.js` (`email`, `match`, `capacity`, `staffing`) |
| Wiederkehrende Tagesläufe | 3 | `api/workers/index.js:24-38` |
| Öffentliche Tarife | 5 | `PLAN_CATALOG`, `api/config/planCatalog.js` |
| Buchbare Zusatzmodule | 4 | `api/config/planCatalog.js:383-386` |
| Interne Module (Staff / Owner) | 27 / 11 | `frontend/src/staff/modules/` bzw. Registry in `docs/FLAECHEN.md` |

> **Zwei Zahlen, die man nicht verwechseln darf.** 938 Endpunkte sind *Routen*, nicht
> *Kundenfunktionen*: 104 davon gehören dem TempConnect-Team, 31 den Eigentümern, 17 dem
> Support. Für eine Investorendarstellung ist die belastbare Aussage „rund 780 Endpunkte in der
> Kundenfläche", nicht „938 Funktionen".
>
> **Eine Zahl, die hier bewusst fehlt:** die Gesamtzahl grüner Tests. Sie steht in mehreren
> Projektdokumenten (3979+), wurde für dieses Register aber **nicht** nachgerechnet, weil das
> einen vollständigen Suite-Lauf erfordert hätte. Belegt sind nur die 340 Testdateien und
> 17 E2E-Dateien. Wer die Testzahl in ein Investorendokument schreibt, muss sie vorher unter
> `api/scripts/run-tests.js` real erzeugen.

---

## Aufräumen: was weg kann

Die folgenden Urteile beruhen auf einer Nachprüfung gegen den Code, nicht auf dem Rohinventar.
Zwei Positionen des Rohinventars haben sich dabei als falsch oder unvollständig erwiesen; das
steht jeweils dabei.

### Liste A — kann sofort weg (verifiziert unreferenziert)

**A1 · `frontend/public/timesheet-templates.html` — löschen. Backend im selben Zug entscheiden.**
Null eingehende Verweise im gesamten realen Baum (`frontend/`, `api/`, `nginx/`, `e2e/`;
die Kopien unter `.claude/worktrees/` und das temporäre Stryker-Verzeichnis (nur während eines Laufs vorhanden) sind ausgenommen). Kein
nginx-Eintrag, kein Test, keine Navigation. Die Seite funktioniert technisch, ist aber für
keinen Nutzer erreichbar. Zusätzlich dokumentiert `docs/FRONTEND_REIFEGRAD_AUDIT.md:128` einen
verifizierten Stored-XSS-Pfad genau dort (Ursache: `esc()` in
`frontend/public/timesheet-templates.html:200` escapt keine Anführungszeichen).
*Wichtig:* `api/routes/timesheetTemplates.js` (8 Endpunkte, PLUS-Gate) ist **nicht** mit tot.
Wer nur die HTML löscht, lässt acht verwaiste Endpunkte stehen. Entweder verlinken und härten
oder beides entfernen — der jetzige Zustand ist Risiko ohne Nutzen.

**A2 · Acht Weiterleitungen — als Paket löschen, mit ihren Wächtern.**
`capacity_exchange.html`, `marketplace_capacity_create.html`, `worker-timesheet.html`,
`worker-portal.html`, `internal_control_center.html`, `api_docs.html`, `app_notdienst.html`,
`legal/meine-agb.html`. Jede exakt 14 nicht-leere Zeilen, reiner Meta-Refresh, kein Verweis aus
der Anwendung. Vor dem Marktstart gibt es keine externen Altlinks, die sie auffangen müssten.
*Mit zu entfernen, sonst wird die Suite rot:* `api/test/frontendCanonicalPages.test.js:38-46`,
`api/test/hubVisibilityIntegration.test.js:194-221` (Formwächter, listet alle neun Stubs
namentlich) und `:156-192` (Zusatzhärtung nur für `worker-portal.html`), dazu die
Disallow-Zeilen in `frontend/public/robots.txt:12-13` und `frontend/robots.txt:12-13`.
*Nebenbefund beim Prüfen:* Die zweite Disallow-Zeile lautet `/public/meine-agb.html` — unter
diesem Pfad liegt keine Datei, die Weiterleitung liegt unter `legal/meine-agb.html`. Die
Sperrzeile geht seit jeher ins Leere.
*Ausnahme:* `app_notdienst.html` ist in `docs/frontend/PAGE_OWNERSHIP.md:44` noch als offene
Owner-Entscheidung (OE-06) geführt — technisch ein Stub wie die anderen, formal nicht
freigegeben.

**A3 · Totes JavaScript-Paar plus tote nginx-Route.**
`frontend/public/js/navConfig.js` wird von keiner HTML eingebunden. Sein einziger Konsument ist
`frontend/public/js/enterpriseDashboard.js:3` — und **auch diese Datei ist in keiner HTML
eingebunden**. Beide sind tot, nicht nur eine; das Rohinventar hatte nur `navConfig.js` gemeldet.
Dritter Rest derselben abgeschafften Einseiten-Architektur, vom Rohinventar übersehen:
`nginx/nginx.conf:112` (`location = /search { return 302 /index.html#dashboard; }`) — Zeile 117
leitet `/index.html` weiter auf `/`, der Hash geht dabei verloren, der Aufruf landet über zwei
Sprünge auf der Landingpage. Die echte Navigation kommt aus `js/pageShell.js`.

### Liste B — erst umhängen, dann löschen (sofortiges Löschen richtet Schaden an)

**B1 · `frontend/public/demand_create.html` — zwei Verweise umhängen, dann löschen.**
Das Rohinventar nannte nur `js/onboardingWizard.js:63`. Es gibt einen zweiten, prominenteren:
`frontend/public/js/pageShell.js:1149` führt „Bedarf anlegen" im Schnellzugriff der Suche auf
`/public/demand_create.html`. Echte Nutzer laufen über die Hauptsuche in diesen Umweg.
Erst beide Stellen auf `marketplace_demand_create.html` zeigen lassen, dann die Datei entfernen.

**B2 · `impressum.html` und `datenschutz.html` in der Wurzel — erst `onepager.html:219`
umhängen, dann löschen.**
Beide enthalten Platzhaltertext („werden vor dem Marktstart ergaenzt", 23 bzw. 25 Zeilen); die
gültigen Fassungen liegen unter `legal/` (80 bzw. 95 Zeilen). Footer (`js/footer.js:13-14`) und
Cookie-Banner (`js/cookieConsent.js:60`) zeigen korrekt auf `legal/`. **Nur** die
Pilot-Kampagnenseite `onepager.html:219` verlinkt die Platzhalter — wer über die Kampagne kommt,
sieht ein Impressum ohne Pflichtangaben. Ab Marktstart ist das ein Abmahnrisiko.
Weil es um Pflichtangaben geht, ist die Reihenfolge nicht verhandelbar: umgekehrt entstünde eine
Kampagnenseite ganz ohne Impressum.
*Zusätzlicher Defekt an derselben Stelle:* Beide Platzhalter verlinken zurück auf
`/onepager.html` (Zeile 20 bzw. 22). `nginx/nginx.conf:109` mappt nur `/pilot` auf
`/public/onepager.html`; für `/onepager.html` gibt es keine Regel, der Aufruf fällt in
`location /` und liefert die Landingpage. Der Rückweg führt nicht dorthin, wo der Nutzer herkam.

**B3 · `frontend/public/sla_nachweise.html` — Produktentscheidung vor Codeänderung.**
Attrappe bestätigt: kein einziger `fetch`, fester Text „Der Nachweis-Upload wird in Kuerze
freigeschaltet", hartkodiert leere Liste, plan-gesperrt über `data-sla-guard="sla_proofs"`.
Gegen ein einfaches Löschen sprechen vier lebende Verweise (`sla_hilfe.html:324` und `:343`,
`sla_search_job_detail.html:263`, `worker-submissions-review.html:397`), ein Nav-Match in
`js/pageShell.js:32`, ein Breadcrumb-Alias und zwei vollständige Übersetzungswörterbücher.
*Neu gegenüber dem Rohinventar:* Es gibt ein Backend — `api/routes/proofs.js`, gemountet in
`api/app.js:377`. Es ist selbst ein Stub und antwortet auf `GET` und `POST /proofs` mit
HTTP 501 `NOT_IMPLEMENTED`. Frontend- und Backend-Platzhalter passen also ehrlich zusammen.
*Zur Aussage „Kunden zahlen für eine leere Hülle": abgeschwächt.*
`api/config/planCatalog.js:367` setzt `visible_in_pricing: false, visible_in_subscription: true`
— das Feature wird nicht beworben, taucht aber in der Abo-Ansicht auf. Unschön, aber kein
Verkaufsversprechen.
*Wirtschaftlich naheliegendste Lösung:* `documents-center.html` (9 Endpunkte in
`api/routes/documentCenter.js`, inkl. Upload, Archiv, Löschen) und `compliance_overview.html`
(9 Endpunkte in `api/routes/complianceDocs.js`) leisten dasselbe bereits. „Nachweise" wäre eine
dritte Dokumentenfläche. Eine Weiterleitung auf `documents-center.html` lässt das
`sla_proofs`-Gate und `api/routes/proofs.js` entfallen — das spart Bauaufwand, statt ihn zu
erzeugen.

### Liste C — gebaut, aber nicht bedienbar (Entscheidung: fertigstellen oder entfernen)

Alle folgenden Pfade haben **null** Treffer in `frontend/` (geprüft mit `grep -rl`, ohne
`node_modules` und Arbeitskopien).

| Backend-Bereich | Endpunkte | Was fehlt |
|---|---|---|
| `/invoices/operational/*` | 10 | Der operative Rechnungslauf inkl. `generate`, `issue`, `paid`, `void`, `correction`, `export/csv`. Schwerster Fall: das Ende der Wertschöpfungskette, dort wo das Geld entsteht. |
| `/preferred-vendors/*` | 8 | Funktionale Doppelung zu `/vendor-pool/*`, das eine Oberfläche hat. Verdacht: abgelöst, nicht entfernt. |
| `/capacity-discovery/*` | 4 | Suche nach Rolle, Region, Kategorie plus Zusammenfassung — vollständiges Nebenmodul ohne Fläche. |
| `/supplier-pools/*` | 4 | dito. |
| `/credits/*` | 4 | Guthabenmodell ohne Bedienoberfläche. |
| `/matching/*` | 4 von 6 | Die Zuordnungslogik — Kern des Produktversprechens — ist überwiegend unbedient. |
| `/smart-pricing` | 1 | Preisempfehlung, im Katalog ab PLUS beworben (`planCatalog.js:323`), ohne Aufrufer. |
| `/marketplace/deals/:id/progress` | 1 | Einzelfall. |
| `/agency/submissions/bundles/send` | 1 | Einzelfall. |

**Unklar und nicht ableitbar:** ob diese Bereiche abgelöste Altlast oder eingeplante nächste
Ausbaustufe sind. Der Code sagt nur, dass keine Oberfläche existiert — er sagt nicht, warum.
Das ist eine Owner-Entscheidung, keine Codefrage.

### Liste D — fertig gebaut, praktisch unauffindbar

Je genau **ein** eingehender Link. Entweder prominenter verlinken oder als Beleg werten, dass
die Funktion nicht gebraucht wird — beides ist eine legitime Entscheidung, der jetzige Zustand
ist keine.

| Seite | Investition | Einziger Zugang |
|---|---|---|
| `documents-center.html` | 9 Endpunkte inkl. Upload, Archiv, Löschen | eine Kachel in `sla_profil.html` |
| `sla_hilfe.html` | 54 KB gepflegtes, übersetztes Handbuch | ein Link in `hilfe.html` |
| `api-explorer.html` | lädt die OpenAPI-Spezifikation real nach | ein Link in `api-docs.html` |
| `sla_search_jobs_list.html` | vollständige Backend-Route (14 Endpunkte) | ein Link in `angebote_verwalten.html` |
| `matching_results.html` | eigener Backend-Test | ein Link in `angebote_verwalten.html` |
| `company-timesheets.html` | eigene Seitenlogik | ein Link in `timesheets.html` |

### Liste E — Widersprüche, die vor der Bedienungsanleitung geklärt sein müssen

**E1 · Das Rohinventar widerspricht sich selbst — `system-health.html`.** Gemeldet als „aus
`enterprise.html` verlinkt". Nachgeprüft falsch: `enterprise.html` verlinkt ausschließlich
`admin_panel.html` (Zeile 223). `system-health.html` kommt aus `organization.html:83`,
`executive_dashboard.html:102` und `:246`, `api/services/adminControlCenterService.js:321`
sowie `api/routes/admin.js:490`. Die daraus abgeleitete Behauptung „ein Kunde sieht
Plattform-Interna direkt aus dem Hub" trägt für diese Seite nicht.

**E2 · Flächenzuordnung `admin_panel.html` — offene Owner-Frage.** Die Hub-Kachel trägt
`data-surface="admin_panel"` und ist damit rollengesteuert; ein offenes Loch ist es nicht.
Ob der Inhalt org-eigene Administration (legitim in der Kundenfläche) oder plattformweite
Verwaltung ist (gehört laut `docs/FLAECHEN.md` ins Staff Control Center), lässt sich aus dem
Markup **nicht** entscheiden. Produkt-Taxonomie steht nicht im Code.

**E3 · Doku widerspricht dem Code — `docs/frontend/PAGE_OWNERSHIP.md`.** Führt fünf reine
Weiterleitungen als produktive Seiten mit Haken und Plan-Gate, `timesheet-templates.html:51`
als produktiv („Company | PLUS+ | ✅") obwohl für niemanden erreichbar, und `enterprise.html`
als „Enterprise-Landingpage, Public" — tatsächlich ist das der eingeloggte Arbeitsbereich mit
Plan-Sperre. Als Quelle für eine Bedienungsanleitung erst brauchbar, wenn korrigiert.

**E4 · Aufwand für eine unerreichbare Seite.** `docs/design/EDITORIAL_THEME_ROLLOUT.md:197`
und `:283` führen `timesheet-templates.html` als Reskin-Kandidaten mit Aufwandsschätzung.

**E5 · Grüner Test, offene Lücke — Übersetzung.** `organization.html`, `sso_config.html`,
`system-health.html` und `timesheet-templates.html` binden `js/i18n.js` nicht ein und bleiben
einsprachig deutsch. Der Übersetzungstest überspringt unmigrierte Seiten still
(`if (!html.includes("js/i18n.js")) continue;`), meldet aber vollständige Parität
(`docs/FRONTEND_REIFEGRAD_AUDIT.md:188`, Beleg dort: `api/test/i18nFoundation.test.js:224`).
Die gemeldete Parität von 7130 zu 7130 Schlüsseln gilt nur für die erfassten Seiten, nicht für
die Plattform.

**E6 · Irreführende Namen — das Präfix `sla_`.** Bei sieben Seiten ist `sla_` ein historischer
Produktname, kein Servicelevel: `sla_abo` (= Tarifwahl), `sla_profil` (= Mein Unternehmen),
`sla_hilfe` (= Handbuch), `sla_angebote` (= Angebot abgeben), `sla_nachweise`,
`sla_search_jobs_list` und `-detail` (= Suchaufträge). Gleichzeitig gibt es echte SLA-Inhalte
unter `legal/sla.html` und `trust/platform-sla.html`. In der Bedienungsanleitung müssen diese
Seiten zwingend unter ihrem Klartextnamen stehen.

**E7 · `onboarding.html` zeigt Eingeloggten Registrierungsknöpfe.** Die Seite trägt eine eigene,
abweichende Kopfzeile mit „Anmelden" und „Kostenlos starten", wird aber aus dem eingeloggten
Bereich verlinkt (`executive_dashboard.html`, `hilfe.html`).

**E8 · Vier Flächen für den Stundenzettel-Ablauf — kein Defekt, aber ein Benennungsproblem.**
`timesheets.html`, `company-timesheets.html`, `worker-submissions-review.html` und
`einsatzportal-stundenzettel.html` decken denselben Prozessabschnitt in vier Rollen ab.
`.agents/skills/tempconnect-project/SKILL.md:513` benennt diese Trennung ausdrücklich als
gewollt („KEIN Merge, KEIN Deprecate"). Die Abgrenzung erschließt sich aber nicht aus den Namen.

**E9 · Drei Artefakte für eine API-Dokumentation.** `api-docs.html` (97 KB, von Hand gepflegt),
`api-explorer.html` (interaktiv) und `api_docs.html` (Weiterleitung). Die statische Doku wird
nicht aus der OpenAPI-Spezifikation erzeugt — Abweichungsrisiko gegenüber dem echten Backend.

### Zusammenfassung des Aufräumurteils

Von den geprüften Kandidaten sind **9 sofort löschbar** (Liste A), **4 erst nach Umhängen**
(Liste B). Zwei davon — `demand_create.html` und die beiden Rechtstext-Platzhalter — hätten bei
sofortigem Löschen echten Schaden angerichtet: einen zerschossenen Schnellzugriff in der
Hauptsuche beziehungsweise eine Kampagnenseite ohne Impressum.

---

## Was dieses Register noch nicht leistet

Ehrlichkeit über die eigenen Grenzen gehört in ein Dokument, das später an Investoren geht.

1. **Es ist handgeschrieben, nicht generiert.** Der Kopf verspricht ein generiertes, per Test
   geprüftes Register. Das ist der Zielzustand, nicht der heutige. Bis ein
   `docs-consistency`-Test existiert, der tote Verweise und verwaiste Dateien rot werden lässt,
   veraltet diese Datei still. Vorbild für die Mechanik: `api/test/flaechenZuordnung.test.js`.

2. **Die Testzahl ist nicht nachgerechnet.** Belegt sind 340 Backend-Testdateien und 17
   E2E-Dateien. Die in mehreren Projektdokumenten genannte Gesamtzahl grüner Tests (3979+)
   wurde für dieses Register **nicht** verifiziert — dazu wäre ein vollständiger Suite-Lauf
   unter `api/scripts/run-tests.js` nötig gewesen. Wer sie in eine Investorendarstellung
   übernimmt, muss sie vorher erzeugen.

3. **Die Verdrahtungsprüfung ist statisch, nicht dynamisch.** „Endpunkt hat keinen Aufrufer im
   Frontend" beruht auf Textsuche über `frontend/`. Ein Endpunkt, der ausschließlich dynamisch
   zusammengesetzt aufgerufen wird (Pfad aus Variablen), würde fälschlich als unbedient gelten.
   Umgekehrt beweist ein gefundener Aufruf nicht, dass der Weg dorthin für einen echten Nutzer
   erreichbar ist. Die Liste C ist damit ein starker Hinweis, kein Urteil.

4. **Die drei internen Flächen sind nur gezählt, nicht durchgearbeitet.** Staff Control Center
   (104 Endpunkte, 27 Module), Owner Control Center (31 Endpunkte, 11 Module) und Support
   Center sind hier auf Modulebene erfasst. Was jedes einzelne Modul leistet, welche davon
   Attrappen sind und welche doppelt existieren — das ist **nicht** geprüft. Für die
   Bedienungsanleitung des Teams braucht es einen eigenen Durchgang in derselben Tiefe wie für
   die Kundenfläche.

5. **Die Datenbank ist nur gezählt, nicht beschrieben.** 179 Tabellen und 197 Migrationsdateien
   sind belegt; welche Tabellen tot sind, welche redundant, welche ohne Index auf einem heißen
   Lesepfad liegen — offen. Ein Schema-Register wäre der nächste sinnvolle Schritt
   (`api/scripts/schema-snapshot.js` existiert bereits als unversionierte Arbeitsdatei).
   Nebenbei aufgefallen und ungeklärt: neun doppelt belegte Migrationsnummern. Solange die
   Ausführungsreihenfolge allein am Dateinamen hängt, ist das ein latentes Risiko beim
   Neuaufsetzen einer Datenbank.

6. **Zwei Zustandsurteile beruhen auf fremder Doku, nicht auf eigener Messung.** Der
   XSS-Befund zu `timesheet-templates.html` und die Übersetzungslücke stammen aus
   `docs/FRONTEND_REIFEGRAD_AUDIT.md` (Zeilen 128 und 188). Beide sind plausibel und passen zum
   Code, wurden hier aber nicht selbst reproduziert.

7. **Keine Aussage über Betriebslast und Kosten.** Was bei 10, 50, 300 Kunden passiert — welche
   Abfragen dann teuer werden, welche Warteschlange zuerst überläuft — steht nicht in diesem
   Register. Für die Investorendarstellung ist das die wichtigste fehlende Achse, weil sie über
   die Deckungsbeitragsrechnung entscheidet.

8. **Zwei Produktfragen sind ausdrücklich offen und nicht aus dem Code ableitbar:** die
   Flächenzuordnung von `admin_panel.html` (E2) und der Status der neun endpunktlosen
   Backend-Bereiche (Liste C). Beide brauchen eine Owner-Entscheidung. Sie hier zu erraten wäre
   genau der Fehler, den `docs/FLAECHEN.md` nach einer realen Fehlplatzierung dokumentiert:
   „Eine Ableitung aus Code ersetzt keine Produktentscheidung."

---

*Erstellt am 2026-08-13 gegen den Stand von Branch `release/enterprise-premium-market-ready`.
Alle Zählungen zu diesem Zeitpunkt reproduzierbar mit den in der Spalte „Herkunft" genannten
Befehlen. Vier Dateien hatten beim Erstellen uncommittete Änderungen im Arbeitsverzeichnis
(`api/package.json`, `frontend/public/sla_abo.html`, `frontend/public/timesheets.html`,
`support-ops-dist/index.html`); die Aussagen zu diesen Seiten beziehen sich auf den
Arbeitsstand, nicht auf den letzten Commit.*
