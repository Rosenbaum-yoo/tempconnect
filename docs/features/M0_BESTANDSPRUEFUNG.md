# M0 — Die Bestandsprüfung, selbst nachgemessen

> **Status: Bericht an den Owner. Kein Code, kein Bauauftrag.**
> Gemessen am 2026-09-01 gegen den Vorbefund in
> [`M_MARKTPLATZ_FLOW.md`](M_MARKTPLATZ_FLOW.md), Abschnitt 2 und 5.

Sieben Prüfer haben je ein Bündel gegen den echten Code gemessen, **sieben
Skeptiker haben jede Aussage zu widerlegen versucht**. Kein einziger Beleg stammt
aus `api/.stryker-tmp` — die Falle, vor der der Plan warnt, ist bei allen sieben
Bündeln geprüft und in allen sieben leer.

## Das Ergebnis in einem Absatz

**Der Vorbefund hält im Kern.** Von 48 Urteilen weichen 20 ab. Entscheidend
für die Frage „droht ein Doppelbau?“ ist die RICHTUNG der Abweichung —
und die ist beruhigend:

* **Kein Urteil geht von `fehlt` auf `fertig`.** Es wurde also nichts als fehlend
  geführt, das in Wahrheit schon vollständig da ist. Ein Doppelbau droht aus
  dieser Messung nicht.
* **Drei Urteile gehen von `fehlt` auf `unerreichbar`** (5.1, 5.6, 5.8). Das ist
  keine Haarspalterei, sondern die teuerste Verwechslung dieses Plans: wer
  `fehlt` liest, baut einen Vorgang; wer `unerreichbar` liest, hängt einen
  Knopf an einen fertigen Vorgang.
* **Ein Urteil geht von `fehlt` auf `teilweise`** (5.3, Sperrlisten-Durchsetzung).
* **Ein Urteil ging von `teilweise` auf `fertig`** (Zeile 6, Registrierung im
  Portal) — und wurde von der Gegenprüfung **widerlegt**: `worker-login.html:9`
  lädt sein Stylesheet relativ, derselbe Fehler wie beim Sprung in 6b. Es
  bleibt bei `teilweise`.

Die übrigen Abweichungen sind Präzisierungen: mehrere Befunde sind **schwerer**
als beschrieben, an fünf Stellen ist der Vorbefund **zu absolut** formuliert.

| Urteil | Anzahl |
|---|---:|
| ✗ fehlt | 18 |
| ◐ teilweise | 14 |
| ✅ fertig | 9 |
| ⊘ unerreichbar | 7 |

---

## 1. Urteil je Zeile

`⇄` markiert eine Abweichung vom Vorbefund.

| # | Vorbefund | Mein Urteil | | Beleg |
|---|---|---|---|---|
| **1** | ✅ fertig | ✅ fertig |  | api/services/subscriptionRequestService.js:793 (Symbol: applyApprovedChange, `UPDATE organizations SET plan = $2`) — gelesen in api/services/userServi |
| **1b** | ✗ fehlt | ✗ fehlt |  | api/middleware/featureGate.js:16 (Symbol: requireFeature) — prueft ausschliesslich `hasFeature(plan, featureKey, featureOpts)` in Zeile 30; das Wort s |
| **1c** | ⊘ unerreichbar | ◐ teilweise | ⇄ | api/config/planFeatures.js:71 `sla_access: ["DEMO", "BASIS", "PLUS", "PRO", I]` — alle fuenf Plaene. Wirksamkeit: frontend/public/js/slaGuard.js (Symb |
| **1d** | ◐ teilweise | ◐ teilweise | ⇄ | api/services/capacityExchangeService.js:18 (Symbol: PLAN_LIMITS) — PRO: 50 in Zeile 23, INDIVIDUELL: 999 in Zeile 24; durchgesetzt in createCapacityEn |
| **2** | ✅ fertig | ✅ fertig |  | api/routes/workers.js:666 (router.post "/workers/import"), :602 ("/workers/import/map-columns"), :631 ("/workers/import/field-alias"), :745 ("/workers |
| **2b** | ◐ teilweise | ◐ teilweise |  | api/routes/workers.js:559 (const base = [requireAuth, gate]); api/routes/workers.js:272 (function requireWorkerFeature) prueft ausschliesslich hasFeat |
| **3** | ✅ fertig | ✅ fertig |  | api/services/workerService.js:3105 (export async function bulkImportWorkers) -> :3287 createWorkerAccount(...) mit isVerified: false; api/services/wor |
| **3b** | ⊘ unerreichbar | ⊘ unerreichbar |  | Sperre: api/routes/workers.js:460 (importItemSchema, Feld email: z.string().email().max(254) — ohne .optional()); Zurueckweisung je Zeile in api/route |
| **4** | ◐ teilweise | ◐ teilweise |  | Route: api/routes/workers.js:1541 (router.post "/worker-invites/bulk"); Dienst: api/services/workerService.js:841 (export async function bulkCreateWor |
| **4b** | ✗ fehlt | ✗ fehlt |  | api/routes/workers.js:1546 (const candidates = await workerService.listInvitableWorkers(pool, req.orgId)) — die Route liest req.body nirgends und hat  |
| **4c** | ◐ teilweise | ◐ teilweise |  | api/services/workerService.js:839 (export const BULK_INVITE_MAX = 200), :860 (const truncated = Math.max(0, unique.length - BULK_INVITE_MAX)), :861 (b |
| **4d** | ✗ fehlt | ✗ fehlt | ⇄ | api/app.js:130 (async function sendMail), :125 (if (SMTP_HOST) { ... createTransport }), :136 (if (mailTransport) {...}), :156 (return true — der Durc |
| **5** | ✅ fertig | ✅ fertig |  | api/services/workerService.js:805 (createWorkerInvite, expiresAt = 7*24*60*60*1000); api/routes/workers.js:1489/1561/1609 (inviteUrl in POST /worker-i |
| **6** | ◐ teilweise | ✅ fertig | ⇄ | api/routes/auth.js:454 (GET /auth/worker/invite/:token) und :476-494 (POST /auth/worker/accept-invite); frontend/public/worker-login.html:283-311 (che |
| **6b** | ✗ fehlt | ✗ fehlt |  | frontend/public/worker-login.html:368 (acceptInvite, location.href = 'einsatzportal-profil.html?willkommen=1', relativ); nginx/nginx.conf:322-324 (loc |
| **7** | ✅ fertig | ✅ fertig |  | api/services/workerService.js:3282-3285 (bulkImportWorkers, EMAIL_EXISTS_OTHER_ROLE); :3143 (globalEmailMap mit u.email.toLowerCase()); :3149 (CSV-Adr |
| **7b** | ✗ fehlt | ✗ fehlt |  | api/services/workerService.js:940-947 (acceptInvite, INSERT INTO users ... ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, i |
| **8a** | ◐ teilweise | ◐ teilweise | ⇄ | api/routes/invoices.js:239 router.get("/invoices/operational", requireAuth, ...) · api/middleware/auth.js:6 requireAuth (prueft NUR req.session.userId |
| **8b** | ✅ fertig | ✅ fertig |  | api/routes/workerPortal.js:214 function requireWorkerRole · api/routes/workerPortal.js:228 const base = [requireAuth, requireWorkerRole] · eigene Zaeh |
| **8c** | ◐ teilweise | ◐ teilweise | ⇄ | api/test/orgGrenzenWaechter.test.js:321 (Schleife B2: if (!layer.route \|\| !layer.route.path.includes(':')) continue;) · dieselbe Filterung in :182 ( |
| **8d** | ✗ fehlt | ✗ fehlt |  | api/app.js:263-272 app.use("/staff", session({ name: "tc.staff.sid", store: staffSessionStore (Tabelle staff_session), cookie.path "/staff", sameSite  |
| **9** | ✅ fertig | ✅ fertig |  | api/routes/workerPortal.js:558 (router.get "/worker/me/skills") und :567 (router.put "/worker/me/skills" → workerService.setWorkerSkills, :573); Aufru |
| **10** | ⊘ unerreichbar | ⊘ unerreichbar | ⇄ | api/services/workerService.js:1211 setWorkerSkills — beruehrt nur worker_profile_skills (DELETE :1235 / INSERT :1238) und den Spiegel worker_profiles. |
| **11** | ⊘ unerreichbar | ⊘ unerreichbar | ⇄ | Mechanismus: api/services/marktpraesenzService.js:60 MATERIALISIEREN_SQL (quelle 'live_belegschaft', is_anonymous TRUE, status 'active') + sql/migrati |
| **12** | ◐ teilweise | ◐ teilweise | ⇄ | Feldsparsamkeit: api/services/capacityPostOeffentlicheSpalten.js:22 OEFFENTLICH / :42 NUR_INTERN / :55 cpSpaltenSql, benutzt in api/services/capacityE |
| **12b** | ✗ fehlt | ✗ fehlt | ⇄ | Einziger Schalter: api/routes/workers.js:869 POST /workers/:profileId/marktpraesenz, hinter rperm("worker.edit") — Agenturseite. In api/routes/workerP |
| **12c** | ✗ fehlt | ✗ fehlt | ⇄ | api/services/workerService.js:1211 setWorkerSkills loescht/setzt nur worker_profile_skills und skill_tags, nie capacity_posts. api/services/marktpraes |
| **12d** | ✗ fehlt | ✗ fehlt | ⇄ | api/services/marktpraesenzService.js: die Datei hat keine einzige import-Zeile und ruft nirgends auditLog — 361 Zeilen vollstaendig gelesen. Im Aufruf |
| **13** | ✗ fehlt | ✗ fehlt |  | api/routes/marketplace.js:518 (router.post "/marketplace/capacity-posts/:id/accept-deal") + :522 getLockedCapacityPost(client, req.params.id); api/ser |
| **13b** | ⊘ unerreichbar | ⊘ unerreichbar |  | frontend/public/sla_angebote.html:48 (input of_quantity, name=offered_quantity), :296 fetch("/marketplace/demand-requests"), :309 sel.value = params.g |
| **14** | ◐ teilweise | ◐ teilweise | ⇄ | frontend/public/company-live-workforce.html:205-243 (Modal clwBookModal: bkCount :212/213, bkStart/bkEnd :216-220, bkPrice :223/224), :139 (Listenfilt |
| **15** | ◐ teilweise | ◐ teilweise | ⇄ | frontend/public/company-live-workforce.html:240-243 (genau zwei Knoepfe: clwBookClose "Schliessen", bkSubmit "Verbindlich buchen"); frontend/public/js |
| **16** | ✗ fehlt | ✗ fehlt |  | api/services/dealAgreementService.js:321 activateAgreement; api/routes/marketplace.js:1737 POST /marketplace/offers/:id/activate |
| **16b** | ◐ teilweise | ◐ teilweise |  | api/services/workforceService.js:584 getCompanyLiveWorkforce (AND wal.start_date <= CURRENT_DATE); api/services/monatsplanService.js:129 SICHTBARE_ZUS |
| **16c** | ◐ teilweise | ◐ teilweise |  | frontend/public/js/workerPortal/portalShell.js:145 starteLiveStrom / :139 startePolling; frontend/public/einsatzportal-einsaetze.html (kein EventSourc |
| **17** | ✅ fertig | ✅ fertig |  | frontend/public/offer_detail.html:1037 doAction('confirm-agreement') + :1758 openCommitWizard + :1681 wizAbsenden('confirm-agreement'); frontend/publi |
| **18** | ✗ fehlt | ✗ fehlt |  | api/routes/staffControlCenter.js Zeilen 11-105 (Importblock, kein companyBlocklistService); :112 marketplace.new_offers_off; api/services/profileVisib |
| **19** | ◐ teilweise | ◐ teilweise |  | api/routes/workerPortal.js:647 GET /worker/documents; api/services/workerService.js:1854 getWorkerAssignmentDetail; frontend/public/offer_detail.html: |
| **5.1** | ✗ fehlt | ⊘ unerreichbar | ⇄ | api/services/assignmentService.js:246 completeAssignment / :198 transitionAssignment; api/routes/assignments.js:147 POST /assignments/:id/complete, :1 |
| **5.2** | ✗ fehlt | ✗ fehlt |  | repo-weite Suche nach equal_pay/equalpay/'equal pay': einziger Treffer docs/features/J_LIVE_BELEGSCHAFT_MARKTPLATZ.md:659 |
| **5.3** | ✗ fehlt | ◐ teilweise | ⇄ | api/services/assignmentStaffingService.js:1-7 (Importblock, kein companyBlocklistService); Durchsetzung nur in api/services/workerService.js:1674 und  |
| **5.4** | ✗ fehlt | ✗ fehlt | ⇄ | api/services/workerService.js:1101 setWorkerActive (Block :1113-1119); api/routes/workers.js:1398 POST /workers/:userId/deactivate; frontend/public/js |
| **5.5** | ✗ fehlt | ✗ fehlt |  | api/services/workerService.js:2019 declineAssignment (nur UPDATE :2025 + recalcAssignmentStaffing :2050) gegen :2131 verfalleneAnfragen |
| **5.6** | ✗ fehlt | ⊘ unerreichbar | ⇄ | api/services/assignmentStaffingService.js:3043 listAssignmentsReadyForAutoBackfill (NOT EXISTS ... :3080), :3090 runAutoBackfill, :5303 runStaffingMai |
| **5.7** | ✗ fehlt | ✗ fehlt |  | api/services/assignmentService.js:22-23 VALID_TRANSITIONS ('extended'), :224; api/routes/capacityExchange.js:50 und api/routes/marketplace.js:65 (empl |
| **5.8** | ✗ fehlt | ⊘ unerreichbar | ⇄ | api/services/invoiceService.js:327 markOverdueInvoices; api/routes/internal.js:120 POST /internal/invoice-overdue-scan; api/services/operationalInvoic |
| **5.9** | ✗ fehlt | ✗ fehlt |  | repo-weite Suche cancellation_fee/stornogeb/absagefrist/cancel_fee: einziger Treffer docs/features/M_MARKTPLATZ_FLOW.md:222 |
| **5.10** | ✗ fehlt | ✗ fehlt | ⇄ | sql/migrations/029_worker_module.sql:97 (Spalte org_id), :117/:119/:121; 034:42/:46; 035:18; 188:69; 193:97/:101 (neun Indizes); sql/migrations/196_rl |

---

## 2. Die Abweichungen — in beide Richtungen

Der Plan verlangt sie ausdrücklich in beide Richtungen: *Ist doch schon da ist
so wertvoll wie fehlt doch.*

### Abo, Plan und Paywall

- 1c — Vorbefund zu absolut (Richtung: 'ist doch erreichbar'). 'Kann nie erscheinen' stimmt nicht woertlich. frontend/public/js/slaGuard.js run() hat einen .catch-Zweig mit showPaywall(), und frontend/public/js/planFeatures.js load() setzt bei einer nicht-ok-Antwort von /api/plan-features die Matrix auf {}, wonach hasFeature fuer jedes Feature false liefert. Korrekt ist: die Paywall ist plan-blind, nicht tot — sie erscheint ausschliesslich im Stoerfall, nie wegen des Plans. Das ist wichtig, weil ein Bauauftrag 'Paywall erreichbar machen' sonst am falschen Ende ansetzt.
- 1c — Vorbefund zu milde (Richtung: 'ist schlimmer'). Zwei der 20 Seiten haben ueberhaupt keinen Paywall-Block: frontend/public/offer_detail.html:92 und frontend/public/integrations.html:59 tragen data-sla-guard="sla_access", besitzen aber weder ein Element #paywall noch #main-content. showPaywall() findet dort nichts zum Anzeigen und nichts zum Verstecken — der Waechter ist in jedem Zweig ein No-op, auch fail-closed. offer_detail.html ist die Seite mit dem mehrstufigen Assistenten aus Zeile 14.
- 1c — Zahl praezisiert: 'rund 20 Seiten' sind exakt 20 Seiten mit data-sla-guard="sla_access" (agency_inbox, angebote_verwalten, capacity_exchange_feed/_detail/_manage/_form, company_requests, capacity_search, deal_management, enterprise, integrations, marketplace_demand_create/_detail/_list, offer_detail, mitarbeiter, matching_results, sla_search_job_detail, sla_search_jobs_list, supplier_scorecard). Drei weitere Seiten tragen einen WIRKSAMEN Schluessel (sla_angebote.html:22, sla_profil.html:85, sla_nachweise.html:11) — die Mechanik selbst funktioniert also.
- 1d — Vorbefund unterschaetzt die Schaerfe. Der Widerspruch ist kein Vergleich zweier entfernter Tabellen, sondern laeuft in EINER Middleware-Kette auf EINER Route: api/routes/capacityExchange.js:111 montiert requireOrgLimit('listings') (Limit aus userService, PRO = -1 = durchlassen) auf POST /capacity-exchange/entries (:115), und der Handler ruft danach createCapacityEntry, das bei 50 wirft. Belegt ueber api/services/entitlementService.js:614 (countListings zaehlt capacity_posts) und :546 (computeQuotaLimits nimmt userService.PLAN_LIMITS.listings).
- 1d — zweite betroffene Stufe: nicht nur PRO. INDIVIDUELL steht in api/services/capacityExchangeService.js:24 auf 999, in api/services/userService.js:170 auf -1. Fuer den 'Individuellen Tarif' ist 999 eine harte Obergrenze gegen eine schriftlich zugesagte Unbegrenztheit.
- 1d — die verkaufte Zusage ist staerker belegbar als 'faktisch nicht geltend': sie steht im generierten Abo-Dokument (api/services/subscriptionDocumentService.js:338 plus fmtLimit :556 → Text 'Unbegrenzt') und in der Kontoansicht (frontend/public/js/pages/accountSubscription.js:450 plus limitStatus :378). Das ist kein UI-Detail, das ist ein Dokument beim Kunden.
- 1b — Zahl bestaetigt statt korrigiert: 'zehn Routendateien' stimmt exakt (11 Montagen von requireOrgFeature(, verteilt auf 10 Dateien, weil orgControlCenter.js zwei traegt).
- 1b — Gegenrichtung, keine Korrektur am Wortlaut, aber gegen eine wahrscheinliche Fehllesung: Der PLAN wird am Marktplatz sehr wohl geprueft, nur nicht per Middleware. api/routes/marketplace.js:444-446 und :952-954 pruefen `me.limits.max_workers_per_request` aus userService.PLAN_LIMITS und antworten 403 WORKER_LIMIT_EXCEEDED; :948 prueft `me.limits.notdienst`. Fuer DEMO (max_workers_per_request = 0) blockt das jede Anlage. Wer 1b als 'am Marktplatz gibt es kein Plan-Gate' liest, baut ein zweites.
- 1 — Einschraenkung, die der Vorbefund nicht nennt: die zeitgesteuerte Aktivierung (accepted mit effective_from in der Zukunft) laeuft nicht von selbst. activateDueRequests (api/services/subscriptionLifecycleService.js:325) haengt an runLifecycleTick (:734), dessen einziger Aufrufer POST /internal/subscription-lifecycle-tick ist (api/routes/internal.js:515). Kein Scheduler-Dienst in docker-compose.yml / docker-compose.prod.yml (dort nur die Variable INTERNAL_CRON_SECRET), kein Crontab im Repo; scripts/scheduler-smoke.sh ist ein Smoke-Test, kein Takt. Dieselbe Fehlerklasse wie Zeile 11.

### CSV-Import und Masseneinladung

- Zeile 2 — Vorbefund untertreibt: er nennt drei Endpunkte, es sind vier. `POST /workers/import/field-alias` (api/routes/workers.js:631, org-gebundenes Alias-Lernen) fehlt in der Aufzaehlung und hat einen echten Aufrufer (frontend/public/js/pages/mitarbeiter.js:4022). Kein Bauauftrag, nur Vollstaendigkeit des Ist-Stands.
- Zeile 3b — Urteil richtig, Begruendung ueberholt. Der Vorbefund sagt "Absichtlich, per Test festgenagelt". Gemessen: die Absicht stuetzt sich auf zwei Aussagen, die der Baum selbst widerlegt. (a) api/routes/workers.js:452 behauptet "Zusaetzlich lehnt workerService.bulkImportWorkers Zeilen ohne E-Mail selbst ab" — der Dienst traegt den Fall seit P10/D5 ausdruecklich (api/services/workerService.js:3163-3236). (b) api/test/csvFeldregeln.test.js:184-188 begruendet die Pflicht mit "worker_profiles.user_id NOT NULL" — genau das hat sql/migrations/175_mitarbeiter_ohne_konto.sql aufgehoben. Die Sperre ist heute allein die Schemazeile api/routes/workers.js:460.
- Zeile 4d — Vorbefund ist zu SCHWACH, nicht falsch. Er fuehrt die Falschmeldung "0 fehlgeschlagen" auf den fehlenden Transport zurueck. Gemessen: sie tritt auch MIT konfiguriertem Transport auf, weil api/routes/workers.js:1560 den Rueckgabewert von sendMail nie prueft und sendMail seine Fehler selbst schluckt (api/app.js:152-154 -> return false). failed_count ist strukturell immer 0. Dieselbe Blindstelle in POST /worker-invites (workers.js:1502-1504) und /worker-invites/:id/resend (workers.js:1613-1615).
- Zeile 2b — Vorbefund bestaetigt, mit einer Verschaerfung: es gibt nicht nur keinen org_type-Riegel am Import, es gibt im ganzen api/-Baum gar keinen `requireAgencyOrg` (der Name existiert nur in einem Test-Regex, api/test/auditDreiSichten.test.js:78), und api/config/visibilityMatrix.js kennt mitarbeiter.html ueberhaupt nicht. Die Agentur-Zuordnung lebt ausschliesslich in frontend/public/js/pageShell.js:1234 (org: "agency").
- Zeile 4b — Vorbefund bestaetigt, Menge praezisiert: betroffen sind nicht "alle unverifizierten Kraefte" schlechthin, sondern genau die aus frueheren IMPORTEN. Manuell ueber POST /workers angelegte Kraefte fallen heraus, weil api/routes/workers.js:799 kein isVerified uebergibt und api/services/workerService.js:656 den Vorgabewert true traegt. Das schwaecht den Befund nicht ab — es benennt die Quelle der Unbeteiligten praeziser.

### Die Trennwand in beide Richtungen

- 8a — Zahl: eigene Zaehlung ergibt 166 statt 165 Routenzeilen mit requireAuth als einzigem Riegel (api/routes/*.js, ohne das Unterverzeichnis occ, das ueber ownerControlCenter.js:23 hinter occRateLimit+requireAuth+occMiddleware haengt). Differenz von 1 ist methodisch (Zaehlregel), nicht inhaltlich. Verteilung: me.js 20, companyProfile.js 18, notifications.js 11, requests.js 8, slaSearchJobs.js 7, subscriptionRequests.js 7, invoices.js 4 ... Wichtig fuer die Bewertung: ein grosser Teil davon (me.js) ist selbstbezogen und fuer einen Arbeiter legitim — die reine Zahl ueberzeichnet das Risiko, der genannte Einzelfall traegt es.
- 8a — Praezision: 'im ganzen api/ kommt hidden_worker nur als Kommentar vor' stimmt nicht woertlich. Es steht auch rund 15-mal in api/test/hubVisibility.test.js als Zusicherung. Diese Datei laedt aber die FRONTEND-Datei in eine vm-Sandbox (hubVisibility.test.js:14-28) — es ist also ein Test des Frontend-Moduls, keine Backend-Durchsetzung. Schlussfolgerung des Vorbefunds bleibt richtig, die Formulierung ist zu absolut.
- 8a — SCHWERER als beschrieben (Gegenrichtung zum Entlasten): hidden_worker ist nicht nur 'reines Frontend', es greift fuer die reale Arbeiter-Population UEBERHAUPT NICHT. hubVisibility.js:169 prueft orgType === 'worker'; normalizeOrgType (Zeile 121-127) liest me.org_type und faellt nur bei LEEREM Wert auf me.role zurueck. me.org_type stammt aus userService.js:239 = organizations.type der Mitglieds-Org, und diese Spalte laesst per CHECK nur 'company' und 'agency' zu (sql/migrations/019_vms_enterprise.sql:13). Ein per Einladung oder Import angelegter Arbeiter hat immer eine aktive Mitgliedschaft in der Agentur-Org (workerService.js:677 und :951) und bekommt damit org_type='agency'. Der hidden_worker-Zweig feuert bei ihm nie.
- 8a — Belegkorrektur: die wirksame Frontend-Trennung ist nicht hubVisibility.js:170, sondern frontend/public/js/pageShell.js:542 — ein Redirect auf me.role === 'worker' nach /public/einsatzportal-dashboard.html. Der greift fuer die reale Population, ist aber ein Client-Redirect (location.href) und nur dort wirksam, wo pageShell geladen wird.
- 8b — bestaetigt ohne jede Abweichung: 44 Routenzeilen, 44 mit Riegel, 0 ohne. Zusatzpruefung: es gibt keinen /worker/-Weg ausserhalb von workerPortal.js. Hier ist nichts zu bauen.
- 8c — entlastende Korrektur an der Beispielliste: GET /worker/me ist nicht 'ungesehen'. Sein Torwaechter wird in api/test/workerPortal.route.coverage.test.js:127-163 verhaltensgeprueft (401/403), allerdings hart auf diese eine Route und auf layer.route.stack[1] verdrahtet, also nicht entdeckend. PUT /worker/me/skills und GET /worker/documents bleiben ohne jede Torwaechter-Zusicherung, weil die Coverage-Tests den terminalen Handler direkt abgreifen (getHandler, Zeile 95-100) und die Kette dabei umgehen.
- 8c — Zahlen exakt bestaetigt: das Register api/test/fixtures/orgGrenzen.json fuehrt fuer workerPortal.js genau 18 Routen, alle mit Platzhalter; die Datei hat 18 Wege mit ':' und 26 ohne. Das Register setzt kein alsPraefix, also deckt auch keine Praefix-Bauart die 26 ab.
- 8d — vollstaendig bestaetigt, kein Punkt weicht ab (Cookie, Store, users-Tabelle, Trennung allein ueber users.role, /staff als vorhandenes Muster).
- Nebenbefund gegen die eigene Doku: docs/PLATTFORM_REGISTER.md:185-187 und docs/features/J_LIVE_BELEGSCHAFT_MARKTPLATZ.md:212 behaupten weiterhin 'kein Frontend-Aufrufer von /invoices/operational/*' (grep -rl -> 0). Das stimmt nicht mehr: companyTimesheets.js:537/538/594/635 und workerSubmissionsReview.js:5892/6066/6072 rufen die Strecke real auf. Die 8a-Route ist also nicht nur erreichbar, sondern bedient.

### Portal-Eintritt und die Trennwand

- Zeile 6 (Vorbefund: teilweise -> gemessen: fertig). Die Zeile listet Formular, Vorbefuellung und Passwortvergabe — alle drei sind gebaut UND verdrahtet, mit Lade-, Fehler- und Ungueltig-Zustand. Die Teilbewertung stammt allein aus dem Sprung danach, und der hat mit 6b eine eigene Zeile. Der Vorbefund zaehlt denselben Mangel zweimal. Kostenrichtung: harmlos, aber ein Bauauftrag auf 'Zeile 6 vervollstaendigen' wuerde ins Leere greifen — dort ist nichts zu vervollstaendigen.
- Zeile 6b, Umfang groesser als beschrieben: der Vorbefund nennt nur den frisch Registrierten. Derselbe relative Sprung steht ein zweites Mal bei worker-login.html:406 im normalen Login-Pfad (location.href = 'einsatzportal-dashboard.html'). Auch jede BESTANDSKRAFT, die sich ueber die kurze Adresse aus der Mail anmeldet, landet auf der Marketing-Startseite. M1.4 muss beide Sprungziele erfassen, nicht eines.
- Zeile 6b, mildernder Umstand, den der Vorbefund nicht nennt: die Willkommens-Mail nach erfolgreicher Annahme traegt einen ABSOLUTEN und korrekten Link (api/routes/auth.js:530, ${BASE_URL}/public/einsatzportal-dashboard.html). Der Mensch ist also nicht dauerhaft ausgesperrt — es gibt einen zweiten Weg hinein, sofern der Mailversand wirklich funktioniert (was Zeile 4d bestreitet). Das aendert nichts am Urteil 'fehlt', aber es aendert die Dringlichkeit gegenueber einer echten Totalsperre.
- Zeile 6b, warum es niemandem auffiel (Beifang fuer den Nachweis in M1.4): const API = '/api' bei worker-login.html:141 ist absolut — die Registrierung SELBST gelingt vollstaendig, Konto und Sitzung entstehen. Nur die Navigation danach bricht. Und die E2E-Tests fahren die Seite ausschliesslich unter /public/worker-login.html an (e2e/tests/einsatzportal-aufnahme-gate.spec.js:74 und :148), wo der relative Sprung korrekt aufloest. Der Nachweis in M1.4 muss zwingend die KURZE Adresse benutzen, sonst beweist er nichts.
- Zeile 7, staerker als behauptet: der Import haelt nicht einen, sondern zwei unabhaengige Riegel. Zusaetzlich zu EMAIL_EXISTS_OTHER_ROLE (workerService.js:3282) benutzt createWorkerAccount ein schlichtes INSERT ohne ON CONFLICT (:667-672) — eine Kollision scheitert dort hart an der UNIQUE-Bedingung. Fuer M2.1 ist das die genaue Vorlage: der Einladungsweg braucht beides, nicht nur die Rollenpruefung.
- Zeile 7, praeziser als behauptet: der Import-Riegel arbeitet case-unempfindlich (workerService.js:3143 und :3149 senken beide Seiten). Der Einladungsweg tut das nicht — createWorkerInvite senkt nur die eingeladene Adresse (:818), waehrend users.email eine case-SENSITIVE UNIQUE-Spalte ist (sql/init.sql:12) und die Registrierung verbatim speichert (api/routes/auth.js:23-35 ohne transform, api/services/authService.js:15-21). Damit hat 7b zwei getrennte Zweige: bei einem kleingeschriebenen Plattform-Konto greift ON CONFLICT und das Passwort wird ueberschrieben; bei einem gemischt geschriebenen entsteht ein ZWEITKONTO mit derselben Adresse. Der Vorbefund beschreibt nur den ersten Zweig. Das bestaetigt zugleich M2.2 im Bauplan.
- Zeile 7b, schwerer als beschrieben: der Vorbefund sagt 'role bleibt unangetastet'. Gemessen ist die Folge groesser — api/routes/auth.js:497 uebernimmt genau diese unangetastete Rolle in die neue Sitzung (req.session.userRole = result.user.role). Wer eine Worker-Einladung auf eine Adresse mit Plattform-Konto annimmt, bekommt keine Arbeiter-Sitzung, sondern eine Sitzung in der Rolle des uebernommenen Kontos. Zusaetzlich legt :1003-1014 fuer dieses Konto ein worker_profile in der einladenden Agentur an. Fuer M2.1 heisst das: der Riegel muss VOR der Sitzungserzeugung greifen, ein blosses Aendern des SQL genuegt nicht.

### Sammelbuchung und Modal

- Zeile 13 — Praezisierung gegen den Vorbefund ("sperrt genau einen capacity_post"): accept-deal beruehrt genau einen Posten, SPERRT ihn aber nur bei voller Ausschoepfung. syncCapacityCommercialState (api/services/capacityExchangeService.js:243) setzt status='reserved' ausschliesslich bei is_fully_committed; eine Teilmenge laesst ihn aktiv (buildCapacityCommercialState, :101-127). Mehrere Unternehmen koennen heute schon Scheiben desselben Postens nehmen.
- Zeile 13 — es ist doch schon da (Teilstueck): die Summierung ueber MEHRERE Anbieter je Bedarf ist gebaut und live — api/services/marketplaceService.js:326-338 summiert offered_quantity ueber alle accepted Offers eines demand_request. Was fehlt, ist ausschliesslich der eine Akt, nicht das Mengengeruest. Wer Zeile 13 als "nicht vorhanden" liest und ein zweites Bedarfs-/Angebotsmodell anlegt, baut daneben.
- Zeile 13b — Verschaerfung: nicht nur die Liste ist leer, auch der Deep-Link scheitert. sla_angebote.html:309 setzt sel.value NACH dem Aufbau der eigenen Optionen; eine fremde demand_id hat keine Option, der Wert faellt auf "" zurueck und Zeile 322 bricht mit alert ab.
- Zeile 14 — Praezisierung: es sind keine drei SCHRITTE, sondern drei nummerierte Fragen in EINEM Formular (company-live-workforce.html:212-224). Es gibt kein Weiter/Zurueck und keinen Fortschritt. "Von drei auf vier Schritte" ist deshalb kein Anbau, sondern ein neuer Rahmen.
- Zeile 14 — Einschraenkung der Doppelbau-Warnung: der Assistent in offer_detail.html ist generisch in der FORM (wizOeffnen mit Lade-, Schritt- und Absende-Parameter, Hooks pruefen/nachRender), aber nicht als Komponente montiert — er liegt inline in der Seite, es gibt kein js/pages/offerDetail.js und keinen Treffer fuer wizOeffnen in frontend/public/**/*.js. Ausserdem ist Schritt 1 reine Anzeige aus commitment-preview und laeuft auf der Anbieterseite (confirm-agreement ist agenturexklusiv, api/routes/marketplace.js:1703-1704).
- Zeile 14 — es ist doch schon da (uebersehen): eine DRITTE Flaeche traegt Menge, Zeitraum, ORT und Preis bereits gemeinsam in einem Modal — capacity_exchange_detail.html:397-437 (im-headcount, im-start/im-end, im-location "Standortbezug", im-price-min/max), vorbefuellt in capacityExchangeDetail.js:1340-1367. Der Vorbefund nennt sie nicht.
- Zeile 15 — es ist doch schon da: negotiate-deal ist NICHT aufruferlos. capacityExchangeDetail.js:1511/1515 ruft ihn, ausgeloest vom Knopf "Um Verhandlung bitten" (capacity_exchange_detail.html:352). Auf dieser Flaeche stehen alle drei Ausgaenge des Owner-Punkts 15 bereits verdrahtet nebeneinander (:349 zustimmen, :352 verhandeln, :463 abbrechen) und sind ueber Nav "Personal finden" -> Feed -> Karte erreichbar. Die Formulierung "hat auf dieser Flaeche keinen Aufrufer" ist woertlich richtig, laedt aber zum Neubau ein.
- Zeile 15 — Praezisierung: der Live-Belegschaft-Fehlertext nennt den Verhandlungsweg bereits ausdruecklich (companyLiveWorkforce.js:113: "ausserhalb starten Sie eine Verhandlung ueber die Angebotsseite") — es fehlt nur der Link, nicht die Erklaerung.

### Skills, Marktbefuellung und DSGVO — Zeilen 9, 10, 11, 12, 12b, 12c, 12d aus Abschnitt 2 von docs/features/M_MARKTPLATZ_FLOW.md

- Zeile 11, Richtung 'ist doch schon da': 'Kein Crontab im Repo' ist woertlich falsch. docs/SCHEDULER.md enthaelt die fertige Zeile '*/15 * * * * curl -sf -X POST "$LB_URL/api/internal/staffing-maintenance" -H "X-Internal-Secret: $CRON_SECRET"' samt Begruendung. Sie ist Doku-Vorlage, kein eingerichteter Takt — das Urteil ⊘ bleibt richtig, aber M1.2 ist Uebernehmen, nicht Erfinden.
- Zeile 11, Ergaenzung: auch ein manueller Aufruf ist nicht voraussetzungslos. checkCronAuth (api/routes/internal.js:38) ist fail-closed und liefert ohne gesetztes INTERNAL_CRON_SECRET 503 CRON_NOT_CONFIGURED.
- Zeile 10, Richtung 'ist doch schon da': neben dem toten Sweep existiert ein zweiter, menschlich ausgeloester Weg von Skills zu Einzelskill-Angeboten — POST /capacity-exchange/workers/:workerProfileId/generate-offers (api/routes/capacityExchange.js:174/186) mit echtem Klickpfad (frontend/public/mitarbeiter.html:700). Unterschied: der erzeugt 'draft', die Automatik 'active'.
- Zeile 12, Richtung 'schlimmer als beschrieben': nicht nur die Wohnort-PLZ, auch die Wohnort-STADT faehrt ins oeffentliche Angebot (marktpraesenzService.js:70, location_city in OEFFENTLICH).
- Zeile 12, Richtung 'schlimmer als beschrieben': dieselbe Preisgabe steckt auch im MANUELLEN Angebotsgenerator (capacityOfferGeneratorService.js:138 und :162). Ein Fix, der nur den Automatikpfad anfasst, schliesst die Luecke nicht.
- Zeile 12, Richtung 'schlimmer als beschrieben': der Feed nennt den Agenturnamen (capacityExchangeService.js:41-43, supplier_company_name + org_name). Die Re-Identifikation ist damit leichter als im Vorbefund angenommen.
- Zeile 12, Richtung 'schwaecher als behauptet': 'Feldsparsamkeit ist maschinell erzwungen' gilt nur teilweise automatisch — die Probe, ob JEDE reale Spalte klassifiziert ist, ist DB-gated (api/test/marktplatzFeldWaechter.test.js:68, skip: !hasDb). Ohne DATABASE_URL laufen nur die Quelltext-Proben.
- Zeile 12b, Richtung 'es gibt doch einen Hebel — der aber auch tot ist': der Mensch kann sich selbst abwesend melden, standardmaessig sofort wirksam (workerAbsenceService.js:311/332), und eine wirksame Abwesenheit ist ein Ruecknahmegrund (marktpraesenzService.js:102/128). Weil createAbsence capacity_posts nicht anfasst, wirkt das aber ausschliesslich ueber den stillstehenden Sweep.
- Zeile 12c, Ergaenzung: das Angebot bleibt nicht nur sichtbar, sondern auffindbar und buchbar — cp.skill_tags traegt eine eigene Kopie des Skill-Namens (marktpraesenzService.js:69), gegen die die Feed-Suche laeuft.
- Zeile 12d, Praezisierung: 'auf seit wann stand ich im Markt gibt es keine Quelle' stimmt im Ergebnis, aber nicht in der Begruendung. capacity_posts.created_at existiert und ist oeffentlich; unbrauchbar ist es, weil WIEDERHERSTELLEN_SQL dieselbe Zeile reaktiviert statt eine neue anzulegen.

### Abschluss, Nachlauf und Dokumente — Zeilen 16, 16b, 16c, 17, 18, 19 aus Abschnitt 2 plus die zehn Luecken aus Abschnitt 5

- Luecke 8 (Zahlungsausfall/overdue) — TEUERSTE ABWEICHUNG, Richtung 'ist doch schon da'. Der Vorbefund sagt 'nicht modelliert' und 'overdue_count strukturell immer null'. Gemessen: api/services/invoiceService.js:327 markOverdueInvoices setzt UPDATE invoices SET status='overdue' WHERE status='issued' AND due_at < NOW() — ohne invoice_type-Filter, also auch auf operative Rechnungen (die in derselben Tabelle liegen, operationalInvoiceService.js:293, mit gesetztem due_at). Der Uebergang ist im Zustandsautomaten erlaubt (operationalInvoiceService.js:28). Es fehlt nur der Aufrufer von POST /internal/invoice-overdue-scan (routes/internal.js:120). Richtige Einstufung: gebaut-aber-unerreichbar, Fix = Crontab-Zeile, nicht Datenmodell.
- Luecke 6 (automatischer Ersatz) — Teilkorrektur, Richtung 'ist doch schon da'. 'Kein Takt' stimmt fuer diesen Job, darf aber nicht als 'keine Scheduler-Infrastruktur' gelesen werden: api/workers/index.js:24-47 betreibt einen laufenden BullMQ-Scheduler mit vier wiederkehrenden Jobs, darunter ersatz-frist-10min (*/10 * * * *), der verfalleneAnfragen ausfuehrt (capacityWorker.js, case 'ersatz-frist'). Ein Auto-Backfill-Takt waere ein Eintrag in einer bestehenden, funktionierenden Reihe — keine neue Infrastruktur. Die zweite Ursache (expires_at NULL blockiert den Kandidatenfilter dauerhaft) ist dagegen exakt bestaetigt.
- Luecke 3 (Sperrliste) — Wortlaut falsch, Substanz richtig. 'assignmentStaffingService.js enthaelt kein einziges Vorkommen von Sperr/blocklist' stimmt nicht: die Datei enthaelt fuenf Treffer auf 'Sperr*' (Zeilen 1021, 1026, 1578, 1585, 1588) — sie meinen Zeilensperren (FOR UPDATE) und Abwesenheits-Hartausschluss, nicht die Kundensperrliste. Richtig bleibt: kein Import von companyBlocklistService, keine Abfrage auf company_worker_blocklist. Ergaenzung, die im Vorbefund fehlt: der Riegel greift zusaetzlich beim Buchen (routes/marketplace.js:540) und im Feed (capacityExchangeService.js:610) — die Sperrliste ist loechrig, nicht ungenutzt.
- Luecke 4 (Deaktivieren) — Code-Beschreibung falsch, Wirkung richtig. Einen 'Wiederherstellungsblock hinter if (!isActive)' gibt es nicht. Hinter if (!isActive) (workerService.js:1113-1119) steht die DEAKTIVIERUNGS-Kaskade, die alle worker_assignment_links auf is_active=FALSE setzt. Ein Wiederherstellungspfad existiert ueberhaupt nicht — bei isActive=true wird nur worker_profiles.is_active zurueckgedreht. Kein toter Code, sondern fehlender Code; das aendert den Fix.
- Luecke 10 (Index auf org_id) — Umfang zu breit. 'die Spalte, mit der jede Kundenabfrage beginnt' trifft nicht zu: die meisten Auswertungen filtern auf assignments.org_id und erreichen die Links ueber den vorhandenen Index auf assignment_id. Der Kern der Luecke haelt aber vollstaendig: die alle 30 Sekunden gepollte Live-Belegschaft (workforceService.js:559, companyLiveWorkforce.js:520) beginnt tatsaechlich bei wal.org_id, und genau darauf gibt es unter neun Indizes keinen.
- Luecke 1 (kein completed) — Einstufung, nicht Substanz. Die Substanz ist exakt bestaetigt (einziger Schreiber transitionAssignment, null Frontend-Aufrufer, kein Cron). Ich stufe es dennoch als 'gebaut, aber unerreichbar' ein statt als Luecke: Route, Zustandsautomat, Audit, Reputations- und Bewertungsnachlauf sind vollstaendig vorhanden. Wer 'Luecke' liest, baut einen Abschluss-Vorgang; wer 'unerreichbar' liest, haengt einen Knopf und/oder einen Job an.
- Zeile 16 (Kette reisst) — Praezisierung, keine Korrektur. 'die Zuordnung eines Menschen macht immer ein Mensch' stimmt, aber einer der fuenf Wege wird vom ARBEITER ausgeloest, nicht vom Disponenten: respondToStaffingInvite (routes/workerPortal.js:885) -> respondToStaffingInviteInternal (assignmentStaffingService.js:5110) -> promoteReservationInternal -> createWorkerAssignmentLink (:1159). Bei einer Kampagne mit promotion_mode='auto_finalize' entsteht der Link also ohne weiteres Zutun der Agentur. Die Kette ist einen menschlichen Schritt vom Schliessen entfernt, nicht zwei.
- Zeile 18 (Staff-Eingriff) — Verschaerfung. Der Vorbefund sagt, es gebe keinen Endpunkt fuer die Ruecknahme eines einzelnen Angebots. Gemessen kommt hinzu: die MELDUNG kann bereits einen Einzelvorgang benennen (profileVisibilityService.js:386 erlaubt ziel_art 'angebot' und 'kapazitaet'), aber resolveAbuseReport (:496) aendert ausschliesslich den Status der Meldung selbst. Es existiert ein vollstaendiger Meldeweg ohne jeden Wirkweg — das ist teurer als ein schlicht fehlender Endpunkt, weil es Erwartung erzeugt.

---

## 3. Was die Gegenprüfung widerlegt hat

Fünf von sieben Skeptikern meldeten `haltbar: false`. Das ist kein Makel der
Messung, sondern ihr Wert: **jede dieser Widerlegungen wäre sonst als Tatsache in
den Bauauftrag gewandert.**

**[6]** Vorbefund 'teilweise' -> sein Urteil 'fertig'. Begruendung: Formular, Vorbefuellung und Passwortvergabe seien alle drei gebaut UND verdrahtet, die Teilbewertung stamme ausschliesslich aus 6b, das eine eigene Zeile hat. Gestuetzt auf seine Aussage in abweichungen: 'const API = /api bei worker-login.html:141 ist absolut — die Registrierung SELBST gelingt vollstaendig.'

> **Gegenbeleg:** frontend/public/worker-login.html:9 — `<link rel="stylesheet" href="worker.css">`, RELATIV. Er hat nur den API-Pfad auf Absolutheit geprueft (:141) und die Assets uebersehen. Die Datei liegt unter frontend/public/worker.css (frontend/worker.css existiert nicht). Unter der KURZEN Adresse aus der Mail (/worker-login.html) loest der Verweis nach /worker.css auf; dafuer gibt es in nginx/nginx.conf keine location — die css-Regel :136-138 greift nur auf ^/public/(js|css)/, die Medien-Regel :308-310 nur auf ^/public/. Es faengt der Catch-All nginx/nginx.conf:322-324 (try_files $uri $uri/ /landing.html). Empirisch am laufenden Stack gemessen: GET /worker.css -> HTTP 200, Content-Type: text/html, 71681 Bytes (= landing.html, identische Groesse wie sein eigener Messwert fuer /einsatzportal-profil.html), Gegenprobe GET /public/worker.css -> HTTP 200, text/css, 15325 Bytes. Der Antwort-Header traegt X-Content-Type-Options: nosniff — der Browser BLOCKIERT das Stylesheet hart, es ist nicht einmal eine Frage fehlerhaften Parsens. Folge: die Einladungsseite, die der Mensch aus der Mail oeffnet, wird VOLLSTAENDIG UNGESTYLT dargestellt. Das liegt im eigenen Geltungsbereich von Zeile 6 (das Formular selbst), nicht in dem von 6b (der Sprung danach) — die Zeile ist damit zu Recht ◐ und nicht ✅. Warum es auch ihm nicht auffiel, ist derselbe Grund wie bei 6b: die E2E-Tests fahren die Seite nur unter /public/worker-login.html an (e2e/tests/einsatzportal-aufnahme-gate.spec.js:74 und :148), wo der relative Verweis korrekt aufloest.

**[13b]** "Auch 'die einzige Seite mit freiem Mengenfeld' haelt: Grep offered_quantity ueber frontend/ findet ausser sla_angebote.html:48/324 nur Anzeigen." — sla_angebote.html sei die einzige Flaeche, auf der ein Anbieter eine Menge frei eingeben kann.

> **Gegenbeleg:** frontend/public/capacity_exchange_detail.html:409 — <input id="im-headcount" type="number" min="1"> ist ein freies Mengenfeld und wird von einer AGENTUR auf einem Demand-Eintrag bedient. Freigeschaltet durch frontend/public/js/pages/capacityExchangeDetail.js:1116-1117 (shouldShowActionZone: bei currentIsDemand return viewerRole === "agency") und :1128 (canUseActionZone sperrt nur company), scharfgeschaltet in :2015 (if (interactionEnabled && canUseActionZone() && shouldShowActionZone())) — interactionEnabled ist in :1972 nur !isOwner + Status, KEIN Feature-Flag. Der Grep verfehlte das Feld, weil es im-headcount heisst, nicht offered_quantity. Er hat dasselbe Feld unter Zeile 14 (Abweichung C) selbst gefunden und die Folge fuer 13b nicht gezogen.

**[neue_funde #2]** "In Verbindung mit 13b heisst das: die einzige Partei, deren Bedarfsliste sich heute fuellt, ist der Besteller selbst — die Angebotsseite ist ausschliesslich fuer die Partei bedienbar, die dort nicht bieten darf."

> **Gegenbeleg:** Falsch auf Systemebene — die Agentur hat einen zweiten, voll verdrahteten Weg zu FREMDEN Bedarfen. frontend/public/js/pages/marketplaceFeed.js:814 verlinkt Feed-Karten mit &type= + data-feed-type, und der Feed fuehrt feed_type==="demand"-Eintraege (marketplaceFeed.js:131-132 'feed.type.demandLong' = "Arbeitsplatzangebot eines Unternehmens", :458 demand-Badge). capacityExchangeDetail.js:842 liest params.get("type"), :1854 setzt currentIsDemand, :1443 ruft POST /marketplace/demand-requests/:id/accept-deal und :1511 POST /marketplace/demand-requests/:id/negotiate-deal. Gelesen wird ueber api/routes/marketplace.js:2450 GET /marketplace/public/demand-requests/:id (nur requireAuth, KEIN requester-Filter) — capacityExchangeDetail.js:1791/1793/1797. Richtig ist nur der enge Satz: POST /demand-requests/:id/offers hat als einzigen schreibenden Frontend-Aufrufer sla_angebote.html:352. Wer die weite Formulierung liest und fuer M5.4 einen Anbieter-Modus baut, baut den bestehenden Demand-Zweig aus capacity_exchange_detail.html ein zweites Mal — genau der Doppelbau, vor dem er bei Zeile 15 warnt.

**[neue_funde #5]** "capacityExchangeDetail.js:1453 bucht bei deal_accept pauschal entryRemainingHeadcount(currentEntry)" — und (Zeile 14) im-headcount werde "aus der Restmenge" vorbefuellt.

> **Gegenbeleg:** Gilt nur im SUPPLY-Zweig. frontend/public/js/pages/capacityExchangeDetail.js:1447 sendet im Demand-Zweig headcount: entryTotalHeadcount(currentEntry) — die VOLLE Menge, nicht die Restmenge, obwohl demandRemainingOpenCount() auf derselben Seite existiert (:1356). Dieselbe Verwechslung in der Vorbefuellung: :1354 var defaultHeadcount = currentIsDemand ? entryTotalHeadcount(currentEntry) : entryRemainingHeadcount(currentEntry). Der Defekt ist damit groesser als gemeldet: auf einem bereits teilbesetzten Bedarf schlaegt die Oberflaeche die volle statt der offenen Menge vor und sendet sie.

**[2]** Org-Bindung des Duplikat-Checks belegt mit 'api/routes/workers.js:764 WHERE wp.supplier_org_id = $1 mit req.orgId'

> **Gegenbeleg:** api/routes/workers.js:764 ist `} catch (err) { next(err); }`. Die WHERE-Klausel steht auf api/routes/workers.js:756, der Parameter req.orgId auf :757. Die Aussage stimmt inhaltlich, die Fundstelle ist um 8 Zeilen falsch — wer sie oeffnet, findet den Beleg nicht.

**[3b]** 'D-E1 steht laut docs/features/P10_IMPORT_LIVE_ZEIT.md:667 auf entschieden' — zweimal so zitiert (Urteil + zu_fragen)

> **Gegenbeleg:** docs/features/P10_IMPORT_LIVE_ZEIT.md:667 traegt D-E2 (Wegwahl B, user_id nullbar). D-E1 steht auf :666, ausserdem auf :41 und :474. Beide sind ✅ entschieden (2026-08-11); die Zeilennummer im Beleg zeigt nur auf die falsche Zeile.

**[3b]** Die Sperre begruendende Teststelle sei 'api/test/csvFeldregeln.test.js:184-188' bzw. der Test auf ':191'

> **Gegenbeleg:** api/test/csvFeldregeln.test.js:184-188 gehoert zum Test 'mischt Umwandlung und Ablehnung in einer Datei' (assert.equal(r.gueltig.length, 2)). Der gemeinte Test beginnt auf :192, die Begruendung mit 'worker_profiles.user_id NOT NULL' steht auf :194-199. Inhaltlich hat er recht — Migration 175 hebt genau das auf (sql/migrations/175_mitarbeiter_ohne_konto.sql:70 ALTER TABLE worker_profiles ALTER COLUMN user_id DROP NOT NULL) — aber beide zitierten Bereiche sind falsch.

**[1 / neue_funde #2]** "kein Crontab im Repo; scripts/scheduler-smoke.sh ist ein Smoke-Test, kein Takt" — und die daraus abgeleitete Owner-Frage "Braucht /internal/subscription-lifecycle-tick einen Takt, und wenn ja welchen?"

> **Gegenbeleg:** docs/SCHEDULER.md:98 traegt die woertliche Crontab-Zeile `*/5 * * * * curl -sf -X POST "$LB_URL/api/internal/subscription-lifecycle-tick" -H "X-Internal-Secret: $CRON_SECRET" > /dev/null`, das Intervall steht als Tabellenzeile in docs/SCHEDULER.md:90 ("alle 5 Min"). docs/SUBSCRIPTION_LIFECYCLE.md:140-157 enthaelt zusaetzlich ein vollstaendiges Kubernetes-CronJob-Manifest fuer denselben Endpunkt (docs/SUBSCRIPTION_LIFECYCLE.md:152), docs/SUBSCRIPTION_LIFECYCLE.md:122 nennt dasselbe Intervall. Der Takt ist im Repo VORGESCHRIEBEN, nur nicht montiert. Die Frage ist damit keine offene Owner-Entscheidung mehr, sondern eine Deploy-Luecke.

**[1 / neue_funde #2]** "Kein Scheduler-Dienst in docker-compose.yml / docker-compose.prod.yml ... kein BullMQ-Takt"

> **Gegenbeleg:** Ein laufender In-Process-Cron existiert: api/server.js:38 ruft `startWorkers()` (Import api/server.js:8), und api/workers/index.js registriert vier BullMQ-Job-Scheduler mit Cron-Muster — api/workers/index.js:27 (`capacity-expiry-daily`, `0 3 * * *`), :29, :36 (`0 4 * * *`) und :45 (`upsertJobScheduler("ersatz-frist-10min", { pattern: "*/10 * * * *" })`). Redis ist in BEIDEN Compose-Dateien ein Dienst: docker-compose.yml:47 und docker-compose.prod.yml:42. Die Takt-Mechanik laeuft also bereits und treibt mindestens vier wiederkehrende Jobs — der Lifecycle-Tick ist nur nicht daran registriert. Wer seine zu_fragen #5 ("Scheduler-Dienst in docker-compose, externer Cron auf dem Host, BullMQ?") als offene Frage liest, baut einen dritten Mechanismus neben zwei bereits entschiedenen. Genau der Doppelbau, den M0 verhindern soll.

**[neue_funde #2]** "ein gekuendigtes Abo faellt nicht von selbst auf DEMO zurueck"

> **Gegenbeleg:** api/services/userService.js:98 `finalizeCancellationIfDue` laeuft LESE-LAZY aus `getUserAndPlan` heraus — api/services/userService.js:192-196 prueft bei jedem Aufruf `subscription?.status === "canceling" && cancel_at <= new Date()` und ruft dann den Finalisierer, der in derselben Transaktion `UPDATE subscriptions SET status='canceled'`, `insertSubscription(client, userId, "DEMO", "active")` und `UPDATE organizations SET plan = 'DEMO' WHERE id = $1` ausfuehrt. Fuer den canceling→cancel_at-Pfad braucht es keinen Takt. (Die past_due-Hard-Lock-Haelfte der Aussage konnte ich nicht widerlegen — die steht.)

**[1b]** "37 der 42 Routen in marketplace.js tragen slaAccess, 5 tragen nur requireAuth"

> **Gegenbeleg:** 37 ist die Zahl der Vorkommen des STRINGS `slaAccess` — darin enthalten die Definition api/routes/marketplace.js:373 `const slaAccess = requireFeature("sla_access")`. Echte Routen-Montagen: 36 (`grep -c 'router\.(get|post|put|patch|delete)(.*slaAccess' api/routes/marketplace.js` = 36) bei 42 Routen (`grep -c 'router\.(get|post|put|patch|delete)('` = 42). Also 6 Routen ohne slaAccess, nicht 5.

**[1b, 1c, 1d]** Der Bericht ist als zeilengenau verkauft ("datei:zeile"-Belege durchgaengig)

> **Gegenbeleg:** Fuenf Zeilennummern driften: api/middleware/featureGate.js — `hasFeature(plan, featureKey, featureOpts)` steht auf :29, behauptet :30. api/middleware/entitlementGuard.js — `export function requireOrgFeature` steht auf :53, behauptet :54. api/services/entitlementService.js — `async function countListings` steht auf :615, :614 ist eine Leerzeile. api/services/capacityExchangeService.js — der PLAN_LIMIT-Wurf in createCapacityEntry steht auf :301 und :309, behauptet ":305" (keine der beiden); die Rueckgabe in updateEntryStatus steht auf :446, behauptet :445. frontend/public/js/pages/slaAbo.js — `limit: meData.limits.listings` steht auf :828, behauptet :827. Alle inhaltlich harmlos (Symbol und Aussage stimmen), aber ein Bauauftrag, der auf die Zeile springt, landet daneben.

**[8a]** ABWEICHUNG 1: 'eigene Zaehlung ergibt 166, nicht 165 Routenzeilen mit requireAuth als einzigem Riegel' — er korrigiert den Vorbefund nach oben.

> **Gegenbeleg:** Reproduziert nicht. Zwei unabhaengige Zaehlungen ueber api/routes/*.js (ohne occ) ergeben BEIDE exakt 165: (a) strikt 'requireAuth, (async) (' → 165, (b) zusaetzlich benannte Handler zugelassen → 165, 0 benannte Faelle. Die Verteilung deckt sich Datei fuer Datei mit seiner eigenen Liste (me.js 20, companyProfile.js 18, notifications.js 11, requests.js 8, slaSearchJobs.js 7, subscriptionRequests.js 7, invoices.js 4). Eine andere Zaehlregel kann die +1 nicht erzeugen: grep -E 'router\.(get|post|put|patch|delete)\($' api/routes/*.js liefert 0 Treffer, es gibt also keine mehrzeilige Routendeklaration. Auch keine Praefix-Wache verzerrt: die einzigen 'router.use(pfad, middleware)'-Stellen sind api/routes/ownerControlCenter.js:23, api/routes/support.js:773 und :778 — keine in einer gezaehlten Datei. docs/features/M_MARKTPLATZ_FLOW.md:96 ('165 Routenzeilen') bleibt richtig.

**[8a]** 'requireCompanyOrg ist nur in 6 Routendateien montiert (requests, vendorPool, suppliers, spendAnalytics, reporting, payment)'

> **Gegenbeleg:** Es sind 7. grep -rl requireCompanyOrg api/routes/ liefert zusaetzlich api/routes/companyTimesheets.js. Ausgerechnet diese Flaeche: ihr Frontend-Pendant frontend/public/js/pages/companyTimesheets.js:537 ist der von ihm selbst genannte Aufrufer von /invoices/operational, und dieselbe Datei behandelt in Zeile 543 'isCompanyGateError(e)', also genau die Antwort dieses Riegels. Die Bestandsaufnahme des vorhandenen Schutzes ist um eine Flaeche zu klein.

**[8a]** 'Belegkorrektur: die wirksame Stelle ist nicht hubVisibility.js:170' — er erklaert die Vorbefund-Zeile fuer falsch und nennt :169.

> **Gegenbeleg:** Die Korrektur ist selbst falsch. frontend/public/js/hubVisibility.js:170 lautet 'return { visible: false, state: "hidden_worker", reason: ... };' — das ist die Zeile mit dem belegten Zustand. :169 ist nur die Bedingung 'if (orgType === "worker") {'. Der Vorbefund zitiert die passende Zeile; hier war nichts zu korrigieren.

**[8a]** Praezisierung: 'im ganzen api/ kommt hidden_worker nur als Kommentar vor' sei zu absolut, weil es AUSSERDEM rund 15-mal in api/test/hubVisibility.test.js stehe.

> **Gegenbeleg:** Seine Korrektur ist selbst unvollstaendig und untertreibt den Fund. (1) api/test/hubVisibility.test.js hat 19 Treffer, nicht 'rund 15'. (2) Der wichtigere Fundort fehlt: api/utils/ownerCheck.js:51-53 begruendet einen Sicherheitsausschluss woertlich mit "'hidden_worker' auf allen Flaechen, 'requireCompanyOrg' sperrt 'org_type = worker'". Genau diese Annahme widerlegt er an anderer Stelle selbst (sql/migrations/019_vms_enterprise.sql:13 laesst nur 'company'|'agency' zu; keine Folgemigration aendert diesen CHECK — alle sql/migrations/*.sql geprueft). Die Fehlannahme steht damit nicht nur im Frontend, sondern als tragende Begruendung in einer Sicherheits-Utility des Backends.

**[12c]** Verfall: MATERIALISIEREN_SQL setzt availability_to = wp.einsetzbar_bis (:70), das ist NULL = unbefristet per Entwurf ... das Angebot faellt aus keinem Verfallslauf. Der Sweep besteht aus Ruecknahme, Wiederkehr, Anlegen.

> **Gegenbeleg:** api/services/marktpraesenzService.js:157 HORIZONT_SQL — ein VIERTER, nicht gemeldeter Sweep-Schritt, ausgefuehrt in api/services/marktpraesenzService.js:180 (`const horizont = await pool.query(...)`), Rueckgabefeld `horizont_gespiegelt` (:203). Er spiegelt `wp.einsetzbar_bis` LAUFEND auf `availability_to` aller eigenen Auto-Angebote (`cp.quelle = 'live_belegschaft'`). Sobald die Agentur einen Horizont setzt, ist `availability_to IS NOT NULL` — und genau darauf greift api/services/capacityExchangeService.js:1465. Der Befund ✗ fuer 12c HAELT (eine Ruecknahme bei Skill-Entzug existiert in keinem Pfad), aber die Begruendung 'faellt aus keinem Verfallslauf' gilt nur bei `einsetzbar_bis IS NULL`, nicht absolut. Der Agent hat 361 Zeilen gelesen und diesen Schritt in keinem der sieben Urteile erwaehnt.

**[12d]** Nur logger.info (:600) traegt die Zahlen.

> **Gegenbeleg:** api/routes/internal.js:601 `res.json({ ok: true, ...result });` — die fuenf `result.marktpraesenz_*`-Zaehler (:560-564) gehen zusaetzlich im Antwortkoerper an den Aufrufer. Praktisch folgenlos, weil der vorgesehene Aufrufer sie verwirft (docs/SCHEDULER.md:55: `curl -sf -X POST ... > /dev/null`) — das Urteil ✗ haelt, die Beleg-Aussage 'nur logger.info' ist falsch.

**[12]** Dieselbe Preisgabe steckt auch im MANUELLEN Angebotsgenerator (capacityOfferGeneratorService.js:138 und :162). Ein Fix, der nur den Automatikpfad anfasst, schliesst die Luecke nicht.

> **Gegenbeleg:** Es sind DREI Schreiber, nicht zwei: api/services/capacityOfferGeneratorService.js:333 (`location_city: city`) im Pool-Angebot, mit `status:"draft"` (:336). Die Stadt entsteht aus `SELECT wp.id, wp.city` (:304) und einer Mehrheitswahl ueber die Mitglieder (:314-320); bei genau EINEM gueltigen Mitglied ist das unveraendert dessen Wohnort-Stadt, dann aber mit `worker_profile_id: null` (:340) — also ohne die Ruecknahme-Bindung, die der Sweep kennt. Die Richtung des Einwands stimmt, sein Umfang war zu klein: wer 12 fixt, muss drei Stellen anfassen.

**[5.8]** Seine als 'WICHTIGSTE KORREKTUR DES BUENDELS' bezeichnete Umdeutung: 'Damit ist overdue_count (:470) NICHT strukturell null. Was wirklich fehlt, ist der Aufrufer... richtig ist eine Betriebszeile.' Er stuft 5.8 auf 'unerreichbar' um und schreibt dem Owner als Fix eine einzelne Crontab-Zeile vor.

> **Gegenbeleg:** Er hat den Weg NACH 'issued' nie geprueft. api/services/operationalInvoiceService.js:300 legt jede operative Rechnung als 'draft' an ('EUR','draft',NULL,$11,...). markOverdueInvoices trifft nur WHERE status='issued' (api/services/invoiceService.js:329). Der einzige Uebergang draft->issued ist api/routes/invoices.js:329 POST /invoices/operational/:id/issue -> transitionInvoice(...,'issued',...) bei :331 — und dieser Endpunkt hat NULL Frontend-Aufrufer: alle sieben Beruehrungen von '/invoices/operational' im Frontend sind lesend (companyTimesheets.js:537 Liste, :538 kpis, :594 Detail, :635 Basis-URL fuer Export; workerSubmissionsReview.js:5892 Liste, :6066 CSV, :6072 PDF). Repo-weite Suche nach 'operational/:id/issue' im Frontend: keine Treffer. Folge: overdue_count (operationalInvoiceService.js:470) bleibt praktisch null — aus einem ZWEITEN, unabhaengigen Grund, den er nicht gemessen hat. Die vom Vorbefund benannte WIRKUNG stimmt also, nur seine Ursache war falsch. Sein Fix ist unvollstaendig: die Crontab-Zeile allein aendert nichts, es fehlt zusaetzlich die Ausstellen-Bedienung in der Oberflaeche.

Dazu kamen zahlreiche Einwände unterhalb der Widerlegungsschwelle — überwiegend
**verschobene Zeilennummern** (ein Beleg zeigte acht Zeilen daneben auf ein
`catch`). Für einen Bericht, den jemand nachschlagen soll, ist das kein Detail.

---

## 4. Neue Funde — im Vorbefund gar nicht genannt

1. requireActiveSubscription ist gebaut, dokumentiert und getestet — und hat null Aufrufer. Definition: api/middleware/entitlementGuard.js:23. Test: api/test/entitlementService.test.js:429ff. Montiert: in keiner einzigen Routendatei. Exakt die Fehlerklasse dieser Welle, und sie steht direkt neben Zeile 1b.

2. runLifecycleTick hat genau einen Aufrufer und keinen Takt: api/routes/internal.js:515 (POST /internal/subscription-lifecycle-tick). In docker-compose.yml:125 und docker-compose.prod.yml:107 steht nur INTERNAL_CRON_SECRET, es gibt keinen Scheduler-/Cron-Container. Betrifft nicht nur die Abo-Aktivierung, sondern die ganze Phasenkette (expiry, activation, cancellation, trial_ends, hard_locks — api/services/subscriptionLifecycleService.js:734ff): ein gekuendigtes Abo faellt nicht von selbst auf DEMO zurueck, ein past_due-Abo wird nicht von selbst gesperrt.

3. Das Plan-Limit deckelt die Owner-Vorgabe Nr. 13 unabhaengig vom fehlenden Sammelabschluss: api/services/userService.js:169 setzt fuer PRO max_workers_per_request = 20; api/routes/marketplace.js:444-446 und :952-954 antworten darueber mit 403 WORKER_LIMIT_EXCEEDED. '30 Mitarbeiter auf einmal' ist also schon auf PRO gesperrt, bevor Zeile 13 (Sammelabschluss ueber mehrere Firmen) ueberhaupt greift. Nur INDIVIDUELL (-1) traegt die Vorgabe. Das ist eine Produkt-/Preisfrage, keine Bauluecke — gehoert aber vor jeden Bau an Zeile 13.

4. api/services/entitlementService.js:614 (countListings) zaehlt unter dem Namen 'listings' die Tabelle capacity_posts, waehrend api/services/userService.js:206 unter demselben Namen die Tabelle listings zaehlt (durchgesetzt in api/routes/listings.js:50). Dieselbe Vokabel, zwei Tabellen, zwei Zaehlerstaende in zwei Oberflaechen: frontend/public/js/pages/accountSubscription.js:450 zeigt den capacity_posts-Stand, frontend/public/js/pages/slaAbo.js:827 den listings-Stand. Kein Sicherheitsproblem, aber die Quelle des Missverstaendnisses hinter 1d.

5. Der Kommentar in api/middleware/orgAccess.js:51 haelt fest, warum requireActiveSubscription bewusst NICHT breit montiert wurde: 'das wuerde Erstkaeufer OHNE Abo blocken'. Wer 1b reparieren will, muss diese Absicht kennen — ein pauschal montierter Riegel sperrt genau die Neukunden aus, die kaufen wollen.

6. Beschriftungs-Widerspruch im Einladungs-Toast: frontend/public/js/pages/mitarbeiter.js:2501 beschriftet r.failed_count mit dem Schluessel 'mit.ok.bulkSkipped' ("uebersprungen"), waehrend mitarbeiter.js:2485 denselben Wert mit 'mit.ok.bulkMailErrors' ("Mail-Fehler") beschriftet. Dieselbe Zahl, zwei Bedeutungen — und da failed_count strukturell 0 ist (siehe 4d), meldet die Oberflaeche in beiden Faellen dauerhaft Null.

7. Die echten Uebersprungen-Zahlen der Bulk-Einladung (skipped_pending, skipped_accepted; api/routes/workers.js:1596-1597) haben im Frontend ebenfalls keinen Leser. Der Disponent erfaehrt also weder, wie viele wegen laufender Einladung uebersprungen wurden, noch wie viele bereits registriert sind.

8. Der Kommentar api/routes/workers.js:452 ist eine falsche Projektwahrheit im Code selbst: er behauptet eine Ablehnung im Dienst, die es seit P10/D5 nicht mehr gibt. Wer ihn liest, haelt die Oeffnung des Schemas fuer riskanter, als sie ist.

9. POST /worker-invites/bulk hat als einzige der geprueften Schreibrouten gar kein Zod-Schema — nicht weil der Koerper leer sein muesste, sondern weil er nirgends gelesen wird (api/routes/workers.js:1541-1601). Fuer den Stapel-Zuschnitt aus M-L4 existiert heute also kein Eingang, nicht einmal ein ignorierter.

10. Es gibt im Importergebnis keine Stapel-Identitaet: api/routes/workers.js:721-736 liefert created/updated/skipped/errors und total_rows, aber keine Import-ID. Eine stapelbegrenzte Einladung (M-L4) haette heute nichts, worauf sie sich berufen koennte, ausser der Liste der zurueckgegebenen user_id/profile_id.

11. Die Testabsicherung von hidden_worker prueft eine Population, die es in der Datenbank nicht geben kann: api/test/hubVisibility.test.js:53-62 (function workerUser) setzt org_type: "worker" von Hand. organizations.type laesst per CHECK nur 'company'|'agency' zu (Mig 019:13). Die gruene Suite beweist damit eine Sperre fuer einen Zustand, den getUserAndPlan nie liefert.

12. Auch die Backend-Seite der Flaechen-Sichtbarkeit kennt Arbeiter nicht: weder api/services/enterpriseSurfaceAccessService.js noch api/config/visibilityMatrix.js enthalten den Begriff 'worker' (ausser einem Kommentar). Das surface_access-Objekt in der /me-Nutzlast sperrt einen Arbeiter also ebenfalls nicht.

13. api/services/rbacService.js:179 getPrimaryOrg schliesst role_key='worker' nicht aus. Fuer jeden per Einladung angelegten Arbeiter setzt orgContext damit req.orgId auf die Agentur-Org — genau der Wert, gegen den die 166 requireAuth-Routen ihre Daten scopen. Das ist die Wurzel, aus der 8a seine Wirkung zieht.

14. Nur 6 der 81 Routendateien im Register api/test/fixtures/orgGrenzen.json tragen ueberhaupt einen Torwaechter-Eintrag: admin.js, agencyPortal.js, scim.js, staffControlCenter.js, support.js, workerPortal.js. Fuer die uebrigen Sonderflaechen gibt es diese Pruefart gar nicht.

15. Die Trennung nach /staff ist im Code sauber begruendet und dokumentiert (api/app.js:255-262 Kommentar, staffSessionSecret als HMAC-Ableitung statt String-Concat). Wer 8d baut, hat eine fertige, gepruefte Vorlage — das ist kein Neubau, sondern eine zweite Anwendung desselben Musters.

16. api/routes/support.js:773 zeigt eine dritte, strengere Bauart: router.use("/support", supportRateLimit, requireAuth, supportAuth) — ein Praefix-Tor, das man auf einer neuen Route nicht vergessen kann. Fuer die Portal-Flaeche waere dieselbe Bauart (statt 44-mal ...base) die Variante, die 8c strukturell erledigt.

17. BASE_URL hat keinen Produktions-Riegel. api/config/index.js:40 faellt still auf 'http://localhost:8080' zurueck, api/config/envValidator.js:36 fuehrt die Variable als optional, und der Produktions-Check in api/config/index.js:280-320 verlangt sie nicht (INTERNAL_CRON_SECRET, ADMIN_SECRET, STAFF_SESSION_SECRET und die DB sind dort fatal, BASE_URL nicht). Fehlt sie im Betrieb, zeigt JEDER Einladungslink aus workers.js:1489/1561/1609 auf localhost — und der Fehler faellt niemandem auf, weil der Versand ohnehin 'erfolgreich' meldet (Zeile 4d). Betrifft meine Zeile 5: der Link ist im Code korrekt, seine Gueltigkeit haengt aber an einer ungesicherten Umgebungsvariablen. docker-compose.yml:113 reicht sie ohne Standardwert durch, .env.example:36 dokumentiert sie.

18. Der Kollisionsfall in acceptInvite ist vollstaendig ungetestet. api/test/workerService.coverage.test.js:373-409 deckt INVITE_NOT_FOUND, INVITE_ALREADY_USED, INVITE_REVOKED, INVITE_EXPIRED und den Gutfall ab — kein einziger Fall mit bereits existierender Adresse. Ein Riegel, der in M2.1 eingebaut wird, haette heute keinen Test, der seine Abwesenheit rot faerbt. Fuer die in M2.7 geforderte Mutationspruefung heisst das: die Entscheidungslogik existiert noch gar nicht, sie muss mit ihrem Test zusammen entstehen.

19. Die E-Mail-Identitaet ist plattformweit case-sensitiv, aber nur an manchen Stellen. Anmeldung (api/services/authService.js:71-74, WHERE email=$1), Passwort-Vergessen (:77-80) und die Doppelpruefung bei der Registrierung (:9-12) vergleichen byte-genau; loginSchema in api/routes/auth.js enthaelt keine Normalisierung; sql/init.sql:12 setzt UNIQUE auf die rohe Spalte. Kleingeschrieben wird ausschliesslich in den Import- und Einladungspfaden (workerService.js:818, :3143, :3149, :671). Das ist die gemeinsame Wurzel unter 7b-Zweig-zwei und M2.2 — und sie liegt nicht im Einladungscode, sondern im Identitaetsmodell.

20. Der Sprung nach der Anmeldung ist der stille Zwilling von 6b: frontend/public/worker-login.html:406 (location.href = 'einsatzportal-dashboard.html'). Er steht in doLogin, nicht in acceptInvite, und wird von M1.4 in seiner jetzigen Formulierung nicht zwingend miterfasst.

21. Alle drei eingehenden Deep-Links nach sla_angebote.html tragen die FALSCHE ID, der Weg ist damit auch fuer ein Unternehmen kaputt: matching_results.html:281 haengt demand_id=<capacity_post_id> an (im else-Zweig ist entity ein Kapazitaetsposten, die Bedarfs-ID steht in params.get("id"), :339); capacity_search.html:935 haengt demand_id=<search_job_id> an (data stammt aus /sla/search-jobs/:id); capacity_search.html:650 schickt gar keine demand_id. Jeder dieser Wege endet im alert("Bitte Anfrage waehlen").

22. POST /marketplace/demand-requests/:id/offers (api/routes/marketplace.js:1342-1361) traegt nur requireAuth + requireFeature("sla_access") — keinen Rollen-, keinen Org- und keinen Selbstgeschaefts-Riegel; geprueft wird nur, dass der Bedarf existiert und nicht 'fulfilled' ist. In Verbindung mit 13b heisst das: die einzige Partei, deren Bedarfsliste sich heute fuellt, ist der Besteller selbst — die Angebotsseite ist ausschliesslich fuer die Partei bedienbar, die dort nicht bieten darf. (M5.8 kennt den fehlenden Riegel, verortet aber nicht, dass die Flaeche dadurch nur verkehrt herum nutzbar ist.)

23. Der Kopfkommentar von api/services/marktplatzBuchungService.js:12-14 sagt zu, "die Oberflaeche leitet dorthin [negotiate-deal], statt still zu scheitern". Auf der Live-Belegschaft trifft das nicht zu: companyLiveWorkforce.js:838-846 erklaert nur den Rahmen, ohne Link. Ein Kommentar, der eine Verdrahtung behauptet, die es auf der genannten Flaeche nicht gibt.

24. Es gibt eine DRITTE, unabhaengige Schritt-Implementierung im Frontend: frontend/public/js/onboardingWizard.js (585 Zeilen, hart auf drei Onboarding-Schritte, global per <script> eingebunden). M-L6 sagt "zwei Assistenten sind schon zu viel" — es sind drei, und keiner ist als gemeinsame Komponente montiert.

25. capacityExchangeDetail.js:1453 bucht bei deal_accept pauschal entryRemainingHeadcount(currentEntry), ohne den Nutzer nach der Menge zu fragen; geschuetzt nur durch ein confirm() (:1431). Das Mengenfeld im-headcount steht auf derselben Seite bereits und wird fuer den Annahmeweg nur nicht benutzt. Verwandt mit M6.5 — aber dessen Formulierung "schickt einen leeren Rumpf" trifft nicht zu: der Rumpf traegt die volle Restmenge (bei Demand-Eintraegen zusaetzlich price_min/price_max, :1446-1448).

26. Benachrichtigungs-Flut, sobald der Takt eingeschaltet wird: findStaleEntries (api/services/capacityExchangeService.js:1493) waehlt status='active' AND last_confirmed_at IS NULL, OHNE Filter auf quelle. Auto-Angebote setzen last_confirmed_at nie — sie sind also dauerhaft 'bestaetigungsbeduerftig'. Der taegliche BullMQ-Job capacity-stale-check (api/workers/index.js:29, Handler api/workers/capacityWorker.js:56-77) verschickt dafuer 'benoetigt Bestaetigung' an die Agentur, bis zu 100 pro Tag, jeden Tag. Dieser Job LAEUFT (Redis vorausgesetzt), waehrend der Materialisierungs-Sweep stillsteht. Wer M1.2 einschaltet, schaltet damit auch diese Dauerschleife ein.

27. Zwei verschiedene Veroeffentlichungsschwellen fuer dieselben Daten: der manuelle Generator legt 'draft' an (capacityOfferGeneratorService.js:138), die Automatik 'active' (marktpraesenzService.js:71, mit ausdruecklicher Begruendung in :51-59). Am Menschen betrachtet heisst das: der Weg MIT Agentur-Entscheidung hat eine Freigabestufe, der Weg OHNE nicht.

28. Die Voraussetzung der Marktpraesenz kann heute nur der Mensch selbst schaffen: worker_profile_skills wird ausschliesslich von setWorkerSkills geschrieben (workerService.js:1235/1238), und deren einziger Aufrufer ist PUT /worker/me/skills. Die Agentur kann zwar worker_profiles.skill_tags pflegen (workerService.js:1143-1149, allowed-Liste), aber das speist die Materialisierung nicht — sie joint worker_profile_skills (marktpraesenzService.js:74). Folge A (beruhigend): ein Profil OHNE Konto (Mig 175, createWorkerProfileWithoutAccount) kann gar nicht materialisiert werden, weil es keinen Weg gibt, ihm Katalog-Skills zu geben. Folge B (unberuhigend): der Mensch loest den Markteintritt selbst aus, ohne dass ihm das an irgendeiner Stelle gesagt wird — die Erklaerung im Portal spricht nur von 'passenden Einsaetzen' (einsatzportal-profil.html:452ff), nie von einem oeffentlichen Marktplatz.

29. Der Sweep misst seine eigene Luecke mit (marktpraesenzService.js:188-198: unsichtbar_ohne_skill / unsichtbar_ohne_ort, Stand 2026-08-26 laut Kopfkommentar 30 von 33 Kraeften) und gibt sie an den Aufrufer zurueck. Weil der Aufrufer sie weder auditiert noch persistiert (internal.js:560-564, nur logger.info :600), verschwindet diese Kennzahl mit der Log-Rotation — auch dann noch, wenn der Takt laeuft.

30. Zwei Skill-Wahrheiten nebeneinander: worker_profiles.skill_tags (agenturpflegbar, Freitext-nah, sanitizeSkillTags) und worker_profile_skills (Katalog, nur vom Menschen setzbar). Der Markt haengt an der zweiten, die Anzeige-/Suchflaechen teils an der ersten. Das ist heute folgenlos, weil der Sweep steht — beim Einschalten wird es zur Erklaerungsluecke gegenueber der Agentur ('warum steht der nicht im Markt, ich habe die Faehigkeiten doch eingetragen').

31. api/workers/index.js:24-47 — im Repo laeuft ein BullMQ-Job-Scheduler mit vier wiederkehrenden Takten (capacity-expiry, capacity-stale-check, worker-status-events-retention, ersatz-frist alle 10 Minuten), gestartet aus startWorkers() sobald Redis konfiguriert ist. Abschnitt 2 und 5 erwaehnen ihn nirgends; mehrere 'kein Takt/kein Scheduler-Container'-Saetze lesen sich dadurch pessimistischer, als der Stand ist.

32. api/services/invoiceService.js:329 — markOverdueInvoices hat KEINEN invoice_type-Filter. Sobald der Cron eingerichtet wird, kippen Abo-Rechnungen und operative Rechnungen gleichzeitig auf 'overdue'. Ob das gewollt ist (recurringBillingService.js:738 haengt eine Mahnlogik an status='overdue') ist eine Owner-Frage, kein Implementierungsdetail.

33. api/services/assignmentStaffingService.js:5177 — expireStaleStaffingState filtert 'expires_at IS NOT NULL AND expires_at <= NOW()'. Weil das Frontend nie ein expires_at sendet (workerSubmissionsReview.js:4898/4957), verfaellt keine einzige real erzeugte Staffing-Einladung. Das ist dieselbe Wurzel wie Luecke 6, wirkt aber zusaetzlich auf hasOpenInvite (:2000) — ein einmal angefragter Mensch traegt den Vermerk 'Offene Staffing-Anfrage laeuft bereits' dauerhaft.

34. api/routes/workers.js:1398-1407 — der Deaktivierungs-Endpunkt schreibt res.locals.audit ohne reason-Feld. Bei einer Handlung, die alle Kundenzuordnungen eines Menschen auf einmal loescht, steht im Protokoll nur Wer und Was, nie Warum. Das kollidiert mit der Regel 'kein wurde-geaendert ohne Wer + Was + Warum'.

35. sql/migrations/210_zuordnungen_schliessen.sql:29-36 — die Mehrwegepruefung vom 31.08. haelt fest: 3 von 24 Zuordnungen offen bei beendetem Einsatz, und 51 von 68 Einsaetzen tragen ueberhaupt keinen supplier_org_id. Das ist ein zweiter, unabhaengiger Datenschaden neben Luecke 1 — 49 dieser Einsaetze sind laut Migration nicht rekonstruierbar.

---

## 5. Was der Owner entscheiden muss

Der Plan sagt: **fehlt etwas wirklich, wird gefragt, nicht erfunden.** Diese
Fragen sind das Ergebnis davon — keine davon ist autonom beantwortbar, weil jede
eine Produkt-, Vertrags- oder Rechtsfolge hat.

**F1.** 1c — Produktentscheidung, kein Bug: Soll der Marktplatz ueberhaupt ein Plan-Gate haben? Entweder der Schluessel wird geschaerft (welche Plaene duerfen den Marktplatz sehen? DEMO nur lesen?) oder die 20 toten data-sla-guard-Attribute werden entfernt, damit kein Waechter Sicherheit vortaeuscht, die er nicht leistet. Beides ist Owner-Sache. Der Vorbefund selbst haelt in Abschnitt 0 fest, dass freies Browsen als Absicht im Code steht — ein nachgeruestetes Gate koennte also gewollt-falsch sein.

**F2.** 1c — Sofort und unstrittig klaerbar: offer_detail.html und integrations.html tragen einen Waechter ohne Paywall-Block und ohne #main-content. Soll der Block dort nachgezogen oder das Attribut entfernt werden? Ein halber Waechter ist die teuerste Variante.

**F3.** 1d — Welche Zahl gilt fuer PRO und INDIVIDUELL: 50/999 oder unbegrenzt? Das ist keine Aufraeumfrage, sondern eine Vertragsfrage: das generierte Abo-Dokument (api/services/subscriptionDocumentService.js:338) sagt bereits schriftlich 'Unbegrenzt'. Kunden koennten das in der Hand haben. Erst nach dieser Antwort darf eine der beiden Tabellen angefasst werden.

**F4.** 1b — Soll die Abo-Wirksamkeit (subscription.active) am Marktplatz und in der Kapazitaetsboerse greifen? Wenn ja: NICHT pauschal requireOrgFeature montieren — der Kommentar in api/middleware/orgAccess.js:51 warnt ausdruecklich, dass das Erstkaeufer ohne Abo aussperrt. Es braucht eine Owner-Regel, welche Marktplatz-Routen lesend offen bleiben und welche (Anlage, Abschluss) ein aktives Abo verlangen.

**F5.** 1 / neue Funde — Braucht /internal/subscription-lifecycle-tick einen Takt, und wenn ja welchen (Scheduler-Dienst in docker-compose, externer Cron auf dem Host, BullMQ)? Das ist dieselbe Entscheidung, die Zeile 11 blockiert; sie sollte einmal fuer alle internen Endpunkte getroffen werden, nicht zweimal einzeln.

**F6.** 4d (schwerster Punkt): Soll ein konfigurierter Mailtransport in Produktion ein harter Startriegel werden (fatal wie SESSION_SECRET, api/config/index.js:274-292) statt einer Warnung (index.js:294-296)? Und unabhaengig davon: soll sendMail seinen Fehlschlag an den Aufrufer durchreichen, damit failed_count wieder etwas bedeutet? Beides beruehrt Betrieb und Sicherheit — Owner-Entscheidung, kein Routinepatch.

**F7.** 3b: Migration 175 hat den Grund entfernt, mit dem das Routen-Schema und der Test die E-Mail-Pflicht begruenden. Soll das Schema jetzt geoeffnet werden (D-E1 steht laut docs/features/P10_IMPORT_LIVE_ZEIT.md:667 auf "entschieden"), oder bleibt die Pflicht aus einem anderen, noch gueltigen Grund? Es liegen zwei einander widersprechende Entscheidungen im Repo; eine davon muss zurueckgezogen werden, bevor irgendjemand baut.

**F8.** 2b: Soll der Import einen org_type-Riegel bekommen — oder ist es gewollt, dass eine Unternehmens-Org mit eigenem Stammpersonal denselben Weg nutzt? Solange die Antwort offen ist, waere ein Riegel eine Produktentscheidung im Code (Abgrenzung Flaechen, CLAUDE.md), keine Haertung. Falls ja: dann fehlt auch der Eintrag fuer mitarbeiter.html in api/config/visibilityMatrix.js.

**F9.** 4b: M-L4 ist entschieden, aber der Zuschnitt braucht eine Vorgabe — soll der Import eine Stapel-Identitaet bekommen (neue Spalte/Tabelle) oder genuegt es, dass das Frontend die aus dem Importergebnis zurueckgegebenen profile_id/user_id an die Route uebergibt? Das ist eine Datenmodell-Frage, und der billigere Weg (Liste im Koerper) haelt bei 1000 Zeilen moeglicherweise nicht.

**F10.** 8d (Owner-Entscheidung noetig): Soll das Einsatzportal eine eigene Sitzungswelt nach dem /staff-Muster bekommen (eigenes Cookie, eigener Store, eigener Pfad)? Das beruehrt Login-Pfad, Einladungsannahme und alle bestehenden Arbeiter-Sitzungen — eine Migrationsfrage, keine reine Codefrage. Nicht autonom bauen.

**F11.** 8a (Owner-Entscheidung noetig): Welcher Riegel soll die requireAuth-only-Klasse schliessen? Eine Positivliste je Route (requireCompanyOrg breiter montieren), ein neuer requireNonWorker vor dem v1-Router, oder ein entdeckendes Register wie bei orgGrenzen. 166 Zeilen sind betroffen, und ein Teil davon (me.js: eigenes Profil, eigenes Passwort, eigene Mitgliedschaften) muss fuer Arbeiter offen BLEIBEN — eine pauschale Sperre waere ein Ausfall, kein Fix.

**F12.** hidden_worker (Owner-Entscheidung noetig, bevor irgendjemand etwas anfasst): Soll die Wurzel repariert werden (org_type fuer Nutzer mit role='worker' nicht aus der Agentur-Org ableiten) oder der Guard auf me.role umgestellt werden? Beides aendert die /me-Nutzlast bzw. die Sichtbarkeitsmatrix und wirkt auf alle Flaechen gleichzeitig. Ohne Entscheidung entsteht hier ein zweiter Wahrheitsstrang neben pageShell.js:542.

**F13.** 8c: Soll der Torwaechter-Test auf ALLE Routen erweitert werden (Filter path.includes(':') fallen lassen) oder soll workerPortal.js auf die Praefix-Bauart von support.js:773 umgestellt werden? Die zweite Variante macht den Test-Filter gegenstandslos und ist die strengere — aber sie aendert Produktionscode und braucht deshalb eine Ansage.

**F14.** Doku-Pflege (klein, aber audit-relevant): docs/PLATTFORM_REGISTER.md:185-187 und docs/features/J_LIVE_BELEGSCHAFT_MARKTPLATZ.md:212 behaupten 'kein Frontend-Aufrufer von /invoices/operational/*'. Das ist inzwischen falsch. Soll das mitkorrigiert werden, wenn Welle M an diese Zeilen geht?

**F15.** 7b, Altbestand: der Riegel aus M2.1 schuetzt kuenftige Annahmen. Er sagt nichts darueber, ob bereits ein Konto ueberschrieben wurde. Eine Pruefabfrage waere billig (worker_invites mit status='accepted', deren worker_user_id auf einen users-Satz mit role != 'worker' zeigt — dort haette das ON CONFLICT gefeuert). Ob gesucht, ob gemeldet und ob betroffene Konten gesperrt werden, ist eine Owner-Entscheidung mit Meldepflicht-Bezug, kein Patch. Nicht gebaut, nicht ausgefuehrt.

**F16.** Wurzelbehandlung oder Punktreparatur: 7b-Zweig-zwei und M2.2 verschwinden nicht durch einen Rollen-Riegel, sondern nur, wenn die E-Mail-Identitaet plattformweit case-unempfindlich wird (citext oder UNIQUE auf lower(email) plus Normalisierung in Registrierung und Anmeldung). Das ist eine Migration auf der users-Tabelle mit Kollisionsrisiko bei Bestandsdaten und beruehrt den Anmeldepfad — ausdruecklich Owner-Freigabe, und es geht ueber M2.1/M2.2 in ihrer heutigen Fassung hinaus.

**F17.** 6b, Zielform: absolute Pfade im Sprung ODER ein nginx-Alias je Portalseite. Beide Wege sind im Plan als Alternative genannt (M1.4), aber acht einsatzportal-*.html-Seiten einzeln zu aliassen ist etwas anderes als zwei Zeilen JavaScript zu aendern — und die Wahl entscheidet, ob die kurze Adresse dauerhaft eine zweite oeffentliche Oberflaechen-URL wird. Entscheidung gehoert dem Owner.

**F18.** BASE_URL: soll die Variable in Produktion fatal werden (wie INTERNAL_CRON_SECRET und STAFF_SESSION_SECRET) oder bewusst weich bleiben? Der weiche Zustand macht jeden Einladungslink still unbrauchbar.

**F19.** Owner-Punkt 13 (ein Akt ueber mehrere Firmen) fehlt tatsaechlich — aber Mengengeruest und Summierung stehen bereits (marketplaceService.js:326-338, capacityExchangeService.js:101-127/243). Bitte bestaetigen, dass der Korb auf demand_requests + N offers aufsetzt, BEVOR jemand ein zweites Bedarfs-/Angebotsmodell anlegt.

**F20.** Welche der drei Flaechen wird der EINE Buchungs-Assistent? Meister Bestand: capacity_exchange_detail.html (alle vier Felder Menge/Zeitraum/Ort/Preis und alle drei Ausgaenge bereits verdrahtet). Besserer Rahmen: der wiz*-Block aus offer_detail.html (Schrittnavigation, Hooks, Absende-Parameter) — der muesste dafuer aber erst aus der Seite herausgeloest werden. Ohne Entscheid entsteht der vierte Assistent.

**F21.** Bekommt sla_angebote.html einen Anbieter-Modus (M5.4) oder verschwindet die Seite hinter einer neuen Bedarfsliste? Heute ist sie nur fuer die Partei bedienbar, die dort nicht bieten darf, und alle drei Deep-Links dorthin tragen eine falsche ID — beides waere sonst zweimal zu reparieren.

**F22.** Soll der fehlende Selbstgeschaefts-/Rollen-Riegel auf POST /demand-requests/:id/offers (M5.8) VOR M5.4 gezogen werden? Sobald die Bedarfsliste fremde Bedarfe zeigt, wird aus der heutigen Luecke ein offener Weg fuer jeden angemeldeten Nutzer.

**F23.** Widerspruch des Menschen (12b): Es fehlt tatsaechlich jede Selbstbestimmung ueber die eigene Marktpraesenz — kein Portal-Endpunkt, kein Schalter, kein Einwilligungsfeld im Schema. Das ist keine Verdrahtungsluecke, sondern eine Produktentscheidung mit Rechtsfolge: soll die Praesenz Grundzustand mit Widerspruchsrecht bleiben (dann braucht der Mensch mindestens einen Aus-Schalter und einen Hinweis beim Skill-Speichern), oder wird sie einwilligungspflichtig (dann braucht das Schema ein Einwilligungsfeld und der Sweep eine zusaetzliche Bedingung)? Owner-Entscheidung, nicht ableitbar.

**F24.** Wohnort im Angebot (12): Der PLZ-/Stadt-Befund betrifft ZWEI Pfade (Automatik und manueller Generator). Was tritt an die Stelle — Zweisteller-PLZ, Umkreis um den Agentursitz, oder ein eigenes Einsatzort-Feld auf worker_profiles? Alle drei haben unterschiedliche Folgen fuer Suche, Umkreisfilter und die vorhandene Aggregation LEFT(cp.location_postal, 2) in capacityDiscoveryService.js:95. Bevor hier gebaut wird, sollte die Zielform feststehen.

**F25.** Ruecknahme bei Skill-Entzug (12c): Soll setWorkerSkills die betroffenen Auto-Angebote SOFORT archivieren (dann greift derselbe Weg, den setzeMarktpraesenz schon fuer den Praesenz-Schalter geht, marktpraesenzService.js:283-299) — oder soll der Sweep eine zusaetzliche Ruecknahme-Bedingung 'Skill nicht mehr zugeordnet' bekommen? Der Sofort-Weg ist der einzige, der auch ohne eingerichteten Takt wirkt; er beruehrt aber den Portal-Schreibpfad des Menschen. Diese Wahl gehoert dem Owner.

**F26.** Audit der Automatik (12d): Ein Audit-Ereignis JE Angebot waere die einzige Form, die 'seit wann stand ich im Markt' fuer einen einzelnen Menschen beantwortet — bei 30+ Kraeften und 15-Minuten-Takt aber ein spuerbarer Schreibpfad. Alternative: ein Lauf-Ereignis mit Zaehlern (billig, beantwortet die Personenfrage nicht). Welche der beiden Fragen soll das Audit beantworten?

**F27.** Stale-Dauerschleife: soll findStaleEntries automatische Angebote ausnehmen (Filter auf quelle), oder soll die Materialisierung last_confirmed_at setzen? Beides ist klein, aber es ist eine Verhaltensentscheidung darueber, ob ein Auto-Angebot ueberhaupt 'bestaetigungsbeduerftig' sein soll — und sie muss VOR dem Einschalten des Takts fallen, sonst ist der erste Betriebstag eine Mailflut.

**F28.** WER schliesst einen Einsatz ab? Das ist keine Bug-, sondern eine Produktfrage: Kunde, Zeitarbeitsfirma, oder automatisch am planned_end_date? Ohne diese Entscheidung ist Luecke 1 nicht baubar. Technisch fehlt danach nur noch ein Aufrufer fuer POST /assignments/:id/complete (routes/assignments.js:147) und/oder ein Job in der bestehenden capacity-Queue.

**F29.** Soll der Crontab aus docs/SCHEDULER.md:55 endlich eingerichtet werden? Das ist die billigste einzelne Handlung im ganzen Buendel: sie aktiviert in einem Schritt die Faelligkeitsmarkierung der Rechnungen (Luecke 8), den Marktpraesenz-Sweep (Zeile 11) und den automatischen Nachrueckerlauf (Luecke 6, zusammen mit dem expires_at-Vorgabewert). PILOT_GO_LIVE_TODOS.md:1329 fuehrt das bereits als offene Betriebspflicht.

**F30.** Soll markOverdueInvoices auf invoice_type='operational' eingeschraenkt werden, oder ist der gemeinsame Lauf ueber Abo- und operative Rechnungen gewollt? Betrifft die Mahnstrecke in recurringBillingService.js:738.

**F31.** Equal Pay (Luecke 2): bauen oder ausdruecklich ausserhalb des Umfangs? J_LIVE_BELEGSCHAFT_MARKTPLATZ.md:659 klammert es bewusst aus. Wenn das weiter gilt, gehoert die Zeile aus der Lueckenliste in eine Nicht-Umfang-Liste — sonst wird sie irgendwann von jemandem gebaut, der die Begruendung nicht kennt.

**F32.** Storno-Entgelt (Luecke 9): Hoehe, Staffelung nach Vorlaufklasse (die Rechnung dafuer existiert bereits: dealReliabilityService.js:14), und wem das Geld zusteht — der Zeitarbeitsfirma, der Plattform, oder geteilt? Ohne diese drei Angaben ist die Folge nicht baubar.

**F33.** Deaktivieren (Luecke 4): soll die Reaktivierung die Zuordnungen wiederherstellen, oder ist der Datenverlust gewollt und die Handlung soll stattdessen Grund + Bestaetigung + Kundenmeldung verlangen? Beide Wege sind vertretbar, sie schliessen einander aber aus.

---

## 5c. Abgleich 2026-09-03 — zehn der 33 Fragen sind beantwortet

Die Liste stand zwei Tage. In der Zwischenzeit sind M1 und M2 gebaut und vier
Entscheidungen gefallen — **zehn Fragen brauchen den Owner nicht mehr**, und drei
weitere sehen anders aus als bei der Aufnahme. Jede Zeile ist am heutigen Stand
nachgemessen, nicht aus der Übergabe abgeschrieben.

### Erledigt — nicht mehr vorlegen

| | Frage | Stand am 2026-09-03 |
|---|---|---|
| **F3** | PRO/INDIVIDUELL: 50/999 oder unbegrenzt? | **Gebaut.** `userService.js:169-170` — `requests_send`, `requests_receive` und `listings` stehen für PRO **und** INDIVIDUELL auf `-1`. Die zweite Wahrheit ist weg, nicht angeglichen (M-E3, gebaut in M1.7). |
| **F6** | Mailtransport hart, und Fehlschlag durchreichen? | **Gebaut, beide Hälften.** Startriegel: `config/index.js` bricht in Produktion mit `fatal(mailFehler)` ab. Laufzeit: `app.js` wirft `KeinVersandweg` statt `return true` — vorher meldete eine Einladung Zustellung, ohne dass etwas das Haus verließ, und 36 von 42 Aufrufern prüfen die Rückgabe gar nicht. |
| **F10** | Eigene Sitzungswelt fürs Einsatzportal? | **Entschieden 2026-09-03: nein.** Stattdessen ein Riegel auf `/api/v1` mit benannter Ausnahmeliste (M2.6). |
| **F11** | Welcher Riegel schließt die `requireAuth`-only-Klasse? | **Entschieden 2026-09-03: das entdeckende Register**, genau die dritte der drei genannten Varianten. Und die Warnung der Frage — *ein Teil davon (`me.js`) muss für Arbeiter offen BLEIBEN* — ist bereits kodiert: 48 der 49 Registereinträge sind „eigene Daten". |
| **F13** | Torwächter auf ALLE Routen erweitern? | **Gebaut (M2.4).** Der Filter `path.includes(':')` ist aus der Torwächter-Prüfung entfernt; beim Entfernen fiel genau eine Route auf, und die ist eine begründete Ausnahme (RFC 7644 §3.2). Die zweite Variante der Frage (workerPortal auf Präfix-Bauart) ist damit gegenstandslos. |
| **F16** | E-Mail-Identität plattformweit case-unempfindlich? | **Gebaut (M2.2).** Migration `215_email_ohne_schreibweise.sql` legt `UNIQUE (LOWER(email))` an, mit vorgeschaltetem `RAISE EXCEPTION`, das bestehende Doppel benennt. `LOWER(email)` in `authService`, `ssoService`, `scimService`. |
| **F29** | Crontab aus `SCHEDULER.md:55` einrichten? | **Überholt in der Form, offen in der Sache** — siehe unten. Der Mechanismus ist entschieden und fünfmal gebaut: `upsertJobScheduler` in `workers/index.js`, kein Host-Crontab. |

### F7 war kein Widerspruch — es war eine abgelaufene Begründung

Die Frage lautete: *„Es liegen zwei einander widersprechende Entscheidungen im Repo;
eine davon muss zurückgezogen werden, bevor irgendjemand baut."* Nachgemessen stimmt
das nicht. Es gab **eine** Entscheidung, und drei von vier Schichten hatten sie längst
umgesetzt:

| Schicht | Stand am 2026-09-03 |
|---|---|
| Datenbank | **offen** — Migration 175: `ALTER TABLE worker_profiles ALTER COLUMN user_id DROP NOT NULL` |
| Dienst | **gebaut** — `workerService.js:3244`: *„P10/D5 — kein E-Mail-Zwang mehr, aber auch kein Datensatz ohne Identitaet"*; die Personalnummer trägt die Wiedererkennung, `MISSING_IDENTITY` wenn beides fehlt |
| Routen-Schema | **zu** — `email: z.string().email().max(254)` |
| Wirklichkeit | **0 von 33** Profilen ohne Konto |

Und der Kommentar, der die Sperre begründete, berief sich auf genau die Dinge, die
nicht mehr galten: auf ein `NOT NULL`, das die Migration aufgehoben hatte, und auf eine
Ablehnung im Dienst, die es nicht mehr gab. **Ein Schema, dessen Begründung abgelaufen
ist, sieht aus wie eine Regel und ist ein Überbleibsel.** Die Entscheidung war
getroffen, die Datenbank war offen, der Dienst war gebaut — und der Eingang blieb zu.

**Geöffnet.** `email` ist im Import-Schema jetzt `optional().nullable()`. Die Pflicht
verschwindet dabei nicht, sie wandert: **`email` ODER `personnel_number`**, erzwungen
dort, wo beide Felder zusammen sichtbar sind — im Dienst, je Zeile, mit einem Bericht
statt eines Abbruchs (P10/D1). Ein Zod-Schema kann „eines von beiden" nicht ausdrücken,
ohne die zweite Regel zu verdoppeln; zwei Wahrheiten über dieselbe Frage sind der
Fehler, nicht ihre Formulierung.

**Belegt, dass dabei kein Loch entstanden ist:**

| Zeile | Ergebnis |
|---|---|
| mit E-Mail | angenommen |
| nur Personalnummer | angenommen — und der Mensch wird **angelegt** (Ende zu Ende geprüft) |
| kaputte E-Mail | abgelehnt, `VALIDATION` |
| weder noch | abgelehnt, `MISSING_IDENTITY`, **null Schreibabfragen** |

Die letzte Zeile ist die wichtigste: eine Ablehnung *nach* dem Schreiben wäre keine.

> **Ein Test war der Stolperdraht — und er hat gehalten.** `csvFeldregeln.test.js`
> prüfte *„E-Mail bleibt Pflicht, solange das Datenmodell sie verlangt"* und sagte in
> seinem eigenen Kommentar an, er werde rot, *„sobald jemand das Schema öffnet, ohne
> die Datenbank mitzuziehen. Genau dann muss man hinschauen."* Er ist rot geworden, und
> beim Hinschauen war es **umgekehrt**: die Datenbank war zuerst dran. Der Draht bleibt,
> er zeigt nur nicht mehr auf eine Momentaufnahme — geprüft wird jetzt die BEZIEHUNG
> zwischen Migration und Schema, und er fällt in **beide** Richtungen. Dazu eine neue
> Gegenprobe, die es vorher nicht gab: eine unbrauchbare Adresse bleibt ein Fehler.

### F15 und F17 — erledigt

**F15 ist faktisch beantwortet: null betroffene Konten.** Die Frage war, ob im
Altbestand bereits ein Konto durch das `ON CONFLICT` überschrieben wurde. Der
Bericht nannte die Prüfabfrage „billig" und führte sie ausdrücklich **nicht** aus.
Sie ist rein lesend, also ausgeführt:

```sql
SELECT count(*) FROM worker_invites wi
  JOIN users u ON u.id = wi.worker_user_id
 WHERE wi.status = 'accepted' AND u.role IS DISTINCT FROM 'worker';   -- 0
```

**Und gegengeprüft, damit die Null nicht leerläuft:** `worker_invites` enthält eine
angenommene Einladung, und die trägt einen `worker_user_id`. Die Abfrage hat also eine
echte Zeile gesehen. (6 weitere stehen auf `pending`, dort ist die Spalte erwartungsgemäß
leer.) Damit entfallen beide Folgefragen — melden und sperren —, weil es nichts zu melden
gibt. **Gilt für diese Datenbank**; auf einer anderen dauert dieselbe Abfrage eine Sekunde.

**F17 ist gebaut (M1.4): absolute Pfade, nicht ein Alias je Seite.** Damit wird die kurze
Adresse **nicht** zu einer zweiten öffentlichen Oberflächen-URL — genau die Folge, wegen
der die Frage dem Owner gehörte. Dazu ein Wächter, der die **nginx-Konfiguration liest**
statt einer Namensliste (`wurzelSeiten.test.js`): kommt morgen ein zweiter Alias dazu, ist
die neue Seite sofort bewacht.

### F27 ist keine Vorsichtsfrage mehr — der Fall ist eingetreten

Der Bericht warnt: *„sie muss VOR dem Einschalten des Takts fallen, sonst ist der erste
Betriebstag eine Mailflut."* Gemessen am 2026-09-03: **beide Takte laufen bereits**
(`staffing-maintenance` alle 15 min, `capacity-stale-check` täglich um 03:30), und die
Bedingung ist erfüllt.

`findStaleEntries` filtert **nicht** auf `quelle` — und die erste Hälfte seiner Bedingung
ist `last_confirmed_at IS NULL`. Ein Eintrag ohne Bestätigung ist damit **sofort**
überfällig, nicht erst nach sieben Tagen. Der aktuelle Bestand:

| Quelle | Zustand | Zeilen | davon mit `last_confirmed_at` |
|---|---|---|---|
| `manuell` | aktiv | 7 | 1 |
| `live_belegschaft` | aktiv | 6 | **0** |

**Zwölf von dreizehn aktiven Einträgen sind dauerhaft überfällig** — darunter alle sechs,
die die Automatik selbst erzeugt hat und die niemand „bestätigen" kann, weil sie
maschinell entstehen. Der Takt versendet je Eintrag eine Meldung (`capacity.stale`), und
der Empfänger ist ein **echter Mensch**: `supplier_company_id` hält eine Nutzer-Kennung
(`AGENTUR_NUTZER_SQL` wählt owner/admin der Agentur). Täglich, unbefristet.

> **Was NICHT passiert:** die Eskalationsstufe (`processConfirmationReminders`, pausiert
> nach 14 Tagen) hat **keinen Takt** — sie hängt allein an
> `POST /capacity-exchange/admin/process-reminders`. Die Auto-Angebote werden also nicht
> stillgelegt; es bleibt bei der täglichen Meldung. Das ist ein Glücksfall, kein Entwurf:
> läuft dieser Takt eines Tages mit, pausiert er genau die Einträge, die den Marktplatz
> füllen sollen.

Die Frage bleibt dieselbe wie im Bericht — Filter auf `quelle` oder
`last_confirmed_at` bei der Materialisierung setzen —, aber sie ist **dringlich statt
vorsorglich**, und der Sofort-Weg (`last_confirmed_at` beim Anlegen setzen) hat den
Vorteil, dass er auch die sechs bestehenden Zeilen sofort heilt.

### F1 und F2 — beide ruhten auf einer falschen Annahme

Beide Fragen gehen davon aus, `data-sla-guard` sei **tot**: *„damit kein Wächter
Sicherheit vortäuscht, die er nicht leistet"*. Nachgemessen stimmt das nicht.

**F1 ist beantwortet — durch M-E2 und M1.5, und die Alternative ist widerlegt.**
`sla_access` ist weiterhin für jeden Plan wahr und steht auf 18 Seiten. Das ist
**Absicht**: M-E2 hat entschieden, dass Browsen ab Konto frei ist, und M1.5 hat den
Schlüssel genau dort geschärft, wo etwas ENTSTEHT (`capacity_exchange_create`,
`marketplace_demand_create`). Die zweite Variante der Frage — *die toten Attribute
entfernen* — würde einen Schutz wegnehmen, den es gibt: `slaGuard.js` zeigt die
Paywall auch im **`.catch`-Zweig**, also wenn die Berechtigungsabfrage scheitert. Das
Attribut ist der fail-closed-Pfad, nicht Deko.

**F2 war schlimmer als beschrieben — und ist repariert.** Der Bericht nannte es *„ein
halber Wächter"*. Gemessen war es **gar keiner**: `showPaywall()` tut genau zwei Dinge,
beide mit `if (element)` — `#paywall` einblenden, `#main-content` ausblenden. Auf
`offer_detail.html` und `integrations.html` fehlten **beide**. Der Wächter entschied und
bewirkte nichts.

| | Seiten |
|---|---|
| vollständig (Paywall **und** main-content) | 21 von 23 |
| halb | 0 |
| **Leerlauf (weder noch)** | **2** |

Da der Schlüssel dieser beiden `sla_access` ist, erschien die Paywall dort ohnehin nie
wegen des Tarifs — sondern nur im Störfall. Genau dort waren sie die **einzigen zwei
Seiten, die bei einer gescheiterten Berechtigungsabfrage alles zeigten**, während die
anderen 21 zumachen. Beide tragen den Block jetzt, wortgleich zum Muster aus
`agency_inbox.html`. Erzwungen von `paywallSchluessel.test.js`: jede bewachte Seite muss
beide Elemente tragen, und der Block muss sagen, *was gilt* und *wohin*.

> **Ein eigener Fehler, vom Wächter gefangen — und es ist derselbe, vor dem ich zwei
> Absätze weiter unten warne.** Ich habe den Block wortgleich aus `agency_inbox.html`
> kopiert, **mitsamt deren i18n-Präfix** `rst.d.`. Jede Seite trägt aber ihr eigenes
> Wörterbuch inline (`TCi18n.register`), und `integrations.html` benutzt `sp.b.`,
> `offer_detail.html` `demd.od.`. Ein englischsprachiger Nutzer hätte in der Paywall
> rohe Schlüssel gesehen. `i18nFoundation.test.js` hat es beim ersten vollen Lauf
> gefangen — sechs unbekannte Keys je Seite. Behoben: Marker auf das Präfix der Seite
> umgestellt, sechs DE- und sechs EN-Schlüssel in **beide** Wörterbücher eingetragen,
> Texte wortgleich zum Bestand.
>
> Das ist zugleich der Beleg dafür, warum die zwölf Seiten ohne Feature-Namen **nicht**
> nebenbei nachgezogen werden: derselbe Griff, zwölfmal, mit zwölf verschiedenen
> Präfixen und 144 Wörterbuch-Zeilen.

> **Verifikation, ehrlich benannt:** die zwei Seiten sind **nicht** im Browser geprüft.
> Der Docker-nginx bedient das Haupt-Repo und der Vorschau-Server einen anderen Worktree
> — beide zeigen diesen Stand nicht. Geprüft wurde deterministisch am Diff: +24/−1 je
> Datei, die eine Entfernung ist `<div class="wrap">` → `<div id="main-content"
> class="wrap">`; die `<div>`-Bilanz bleibt ausgeglichen (148/148 und 48/48), der Block
> trägt `display:none`.

**Neuer Befund nebenbei: der Paywall-Block gibt es in zwei Varianten.**
Von 23 Blöcken tragen **11** das Feld `paywall-feature-name` und **12 nicht**. Wer auf
einer der zwölf landet, liest *„Bereich nicht verfügbar / Aktueller Plan: DEMO / Abo
ansehen"* — ohne je zu erfahren, **welches** Feature fehlt. `slaGuard.js` berechnet den
Namen (`featureLabel(feature)`) und findet kein Ziel.

Nicht mitrepariert, mit Grund: die zwölf nachzuziehen verlangt `data-i18n`-Schlüssel je
Seiten-Präfix (`rst.d.*`, `rst.e.*`, …), und ob der lange oder der kurze Text gelten
soll, ist eine Produktfrage. Die Zusicherung verlangt deshalb nur die zwei **tragenden**
Felder (Plan und Weiterweg) — ohne die steht der Mensch vor einer Wand ohne Tür.

### Anders als aufgenommen — mit dem Owner vorlegen, aber schärfer

**F5 + F29 sind dieselbe Frage, und sie ist messbar geworden.**
Von den **zehn** Aufgaben in der Takt-Registratur (`betriebsTaktService.TAKTE`) sind
**fünf eingeplant** und **fünf nicht** — und die fünf stillen sind Geld und Lebenszyklus:

| Aufgabe | Soll | Was ausbleibt |
|---|---|---|
| `recurring-billing` | täglich | die wiederkehrenden Abo-Rechnungen entstehen nicht |
| `dunning-sweep` | täglich | keine Mahnstufen, kein Hard-Lock bei Zahlungsausfall |
| `invoice-overdue-scan` | täglich | `overdue` ist ein gültiger Zustand, den nichts je setzt |
| `subscription-lifecycle-tick` | stündlich | ein Abo mit zukünftigem Beginn wird nie von selbst wirksam |
| `expire-reservations` | stündlich | abgelaufene Reservierungen binden weiter Kapazität |

Der Mechanismus steht **direkt daneben**: fünf `upsertJobScheduler`-Aufrufe im selben
File, idempotent, neustartfest. Einschalten wäre fünf Zeilen. Genau deshalb ist es eine
Owner-Entscheidung und kein Patch: ab dem ersten Lauf erzeugt `recurring-billing`
Rechnungen und `dunning-sweep` verschickt Mahnungen an echte Kunden.

> **Gebaut, ohne etwas einzuschalten:** die Lücke steht jetzt in der Registratur selbst
> (`ohne_einplanung` je Aufgabe, mit Grund) und wird von
> [`takteEingeplant.test.js`](../../api/test/takteEingeplant.test.js) erzwungen — in
> **beide** Richtungen: eine Aufgabe ohne Takt und ohne Begründung färbt rot, und eine
> Begründung, die stehen bleibt, nachdem der Takt läuft, ebenfalls. Vorher war die
> Lücke nur im Betrieb sichtbar (Kachel `still`) — und nur dem, der hinsieht.

**F18 ist größer als „Einladungslinks".**
`BASE_URL` hat im ganzen `config/index.js` **eine** Referenz: den Rückfall auf
`http://localhost:8080` (Zeile 44). Es gibt **keine** Produktionsprüfung, während
`SESSION_SECRET`, `JWT_SECRET`, `INTERNAL_CRON_SECRET`, `ADMIN_SECRET`, die Datenbank
und (seit M1.3) der Mailweg alle `fatal` sind. Daraus bauen **25 Stellen** in zehn
Dateien Adressen — darunter `routes/auth.js` (Passwort zurücksetzen),
`routes/payment.js` (Stripe-Rückkehradressen) und die Einladungen. Eine
Stripe-Rückkehradresse auf `localhost` bricht den Kauf, nicht nur einen Link.

**F30 ist kleiner als aufgenommen.**
Beim Nachmessen für die Umsatz-Entscheidung: die **Mahnstrecke** filtert bereits auf
`i.invoice_type = 'subscription'` (`recurringBillingService.js`). Es gehen also **keine
Mahnmails an Schulden zwischen zwei Kunden**. Offen ist allein die **Sichtbarkeit** in
der Arbeitsliste des Operators (`staffBillingOverviewService.js`, `loadAttention` und
`loadInvoiceTotals` ohne Typfilter) — und das ist die zweite Hälfte der F30-Frage, die
am 2026-09-03 **nicht** mitentschieden wurde.

**F14 ist keine Frage mehr, sondern eine Korrektur.**
`docs/PLATTFORM_REGISTER.md:185-187` und `J_LIVE_BELEGSCHAFT_MARKTPLATZ.md:212`
behaupten „kein Frontend-Aufrufer von `/invoices/operational/*`". Belegt falsch:
`companyTimesheets.js:537` und `workerSubmissionsReview.js:5892` rufen es. Und in
M2.5 kam heraus, dass die Route zu dem Zeitpunkt **gar nicht erreichbar** war —
`/invoices/:id` stand davor und fing sie ab, `WHERE i.id = 'operational'` warf gegen
die echte Datenbank. Beides ist repariert; die Doku-Zeilen bleiben zu korrigieren.

---

## 5b. Nachtrag 2026-09-02 — drei Korrekturen aus der Gegenprüfung

Die Parallelsitzung hat die vier Korrekturen aus diesem Bericht unabhängig
nachgemessen. Alle vier tragen — und drei Dinge kamen hinzu, von denen zwei die
Einordnung ändern und eines den Bauauftrag.

### 7b hat KEINEN Angriffsweg — und richtet trotzdem mehr an als beschrieben

**Zur Einordnung, damit dieser Bericht nicht überspitzt gelesen wird:** die
Kette „eine Agentur lädt eine beliebige Adresse ein und übernimmt das Konto“ ist
**zu**. Drei Austrittsstellen wurden geprüft:

* `listInvites` wählt zehn Felder — **keinen Token**
* `POST /worker-invites/:id/resend` antwortet `{ok:true}`, der Token geht nur in die Mail
* `POST /worker-invites` baut den Token ausschließlich in die Mail-URL

Der Token verlässt den Server nur ins Postfach des Eingeladenen. **7b bleibt ein
schwerer Defekt, ist aber keine Schwachstelle mit Angriffsweg.**

**Was es tatsächlich anrichtet, ist schlimmer als „Passwort überschrieben“.**
Nimmt der echte Adressinhaber an, entsteht dieser Zustand:

* Passwort ersetzt, `is_verified` gesetzt
* Mitgliedschaft in der einladenden Org auf `worker` **herabgestuft**
* `users.role` bleibt **unangetastet** (z. B. `company`)

Daraus folgt: `rbacService` gibt über `role_key='worker'` keine Berechtigung mehr,
und `requireWorkerRole` lässt die Person wegen `session.userRole !== 'worker'`
auch nicht ins Portal. **Das Konto ist danach in BEIDEN Welten tot.**

> **Für M2.1:** der Nachweis muss genau diesen Zustand prüfen, nicht nur das
> Passwort. Ein Riegel, der die Überschreibung verhindert, aber die Herabstufung
> stehen lässt, löst den halben Schaden.

### Eine Einladung ist faktisch eine Mitgliedschaftsvergabe

Wer annimmt, hat danach eine `org_membership` in der einladenden Firma. Zusammen
mit den 165 Routen, die nur `requireAuth` tragen (Zeile 8a), liest die eingeladene
Person danach Daten dieser Firma.

Kein Angriffsweg — der Einladende verschenkt seine eigenen Daten. Aber **eine
Einladung verdient damit dieselbe Sorgfalt wie eine Rechtevergabe**, und das ist
heute nicht so gebaut.

### 5.8 — eine dritte Ursache wurde vorgeschlagen und ist WIDERLEGT

Die Gegenprüfung meldete einen dritten Grund: `markOverdueInvoices` laufe auf
der Plattform-Tabelle `invoices`, während die operative Rechnung in
`operational_invoices` liege — der Lauf träfe sie also selbst dann nicht, wenn
sie `issued` wäre.

**Selbst nachgemessen: das stimmt nicht.** Es gibt keine Tabelle
`operational_invoices`.

```
SELECT table_name FROM information_schema.tables
 WHERE table_name IN ('invoices','operational_invoices');
  -> invoices          (eine Zeile, nicht zwei)
```

`operationalInvoiceService.js:293` schreibt `INSERT INTO invoices` — dieselbe
Tabelle, unterschieden durch die Spalte `invoice_type = 'operational'`. Und
`markOverdueInvoices` (`invoiceService.js:327`) läuft auf
`UPDATE invoices … WHERE status = 'issued' AND due_at < NOW()` — **ohne**
`invoice_type`-Filter. Der Lauf trifft die operative Rechnung also sehr wohl.

**Es bleibt bei ZWEI Ursachen** (kein Takt; angelegt als `draft`, und der
Ausstellen-Endpunkt hat null Frontend-Aufrufer). Beide müssen behoben werden —
die dritte gibt es nicht.

> **Was an der Stelle WIRKLICH offen ist**, und es zeigt in dieselbe Richtung:
> weil der Filter fehlt, kippen Abo- und operative Rechnungen **gemeinsam** auf
> `overdue`, sobald der Takt läuft. Ob das gewollt ist, ist eine Owner-Frage
> (F30 in Abschnitt 5) — an `status='overdue'` hängt die Mahnstrecke in
> `recurringBillingService.js:738`.

**Merke:** ein falsches „trifft nicht“ ist genauso teuer wie ein falsches
„fertig“. Hätte diese Zeile unwidersprochen im Bericht gestanden, wäre eine
Tabellen-Trennung gebaut worden, die es nicht zu trennen gibt.
---
## 6. Was M0 NICHT getan hat

- **Keine Zeile Produktionscode angefasst.** Alle sieben Prüfer und alle sieben
  Skeptiker haben `git status --porcelain` bestätigt.
- **Nichts gebaut.** M0 endet mit diesem Bericht, nicht mit einem Bauauftrag.
- **Nichts erfunden.** Wo etwas wirklich zu fehlen scheint, steht es in
  Abschnitt 5 als Frage.

*Erhoben am 2026-09-01. 48 Urteile, 56 Abweichungen, 20 Widerlegungen, 35 neue Funde, 33 offene Entscheidungen.*
