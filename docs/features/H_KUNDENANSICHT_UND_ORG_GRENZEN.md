# H — Kundenansicht und Mandantengrenzen

> **Stand: 2026-08-19.** Arbeitsanweisung fuer die naechste Sitzung. Zwei Punkte,
> die aus der Abarbeitung der offenen Befunde nach Spur G entstanden sind.
> Die Recherche dazu ist hier **vollstaendig festgehalten** — sie lag zuvor nur
> im Sitzungsprotokoll, das nicht versioniert wird.

---

## ✅ Stand 2026-08-19: H2 ist gebaut

**Ergebnis in drei Sätzen.** Die Entscheidung D-M1 ist gefallen: **Wächter, nicht
konsolidieren** — begründet dadurch, dass alle echten Defekte dort lagen, wo
*keine* der 80 Kopien stand. Die fünf Lücken der Recherche sind geschlossen, und
der Wächter fand beim ersten Lauf **fünf weitere** (E-6 bis E-10), darunter mit
`PATCH /organizations/:id` einen Cross-Org-Schreibzugriff auf den
Organisationsdatensatz selbst. Volle Suite 8804/0.

| Artefakt | Zweck |
|---|---|
| `api/test/security/orgGrenzeLuecken.test.js` | Die zehn Befunde als **Verhalten** nachgestellt — war vor der Reparatur rot |
| `api/test/orgGrenzenWaechter.test.js` | Der Wächter, vier Schichten inkl. Selbstprobe |
| `api/test/fixtures/orgGrenzen.json` | Das Register: je Route ein Urteil, je Datei ein Abdeckungsvermerk |
| `api/test/helpers/orgGrenzenSpion.js` | Spion-Pool + `pruefeGrenze` — dieselbe Funktion für Bestand und Selbstprobe |
| `api/test/helpers/security-mocks.js` | neu: `findChainFrom` — führt die Kette ab einem benannten Middleware aus |

**Korrekturen an dieser Recherche** (gemessen, nicht vermutet):

1. **Fallstrick 1 erledigt** — alle Befunde sind zur Laufzeit reproduziert, nicht
   nur am Quelltext belegt.
2. **Fallstrick 3 bestätigt** — `rate_cards` und `approval_requests` stehen in der
   laufenden Datenbank auf `rls=false` mit 0 Policies. Dazu neu: **Migration 117,
   auf die `TENANT_ISOLATION_MODEL.md` 28 Tabellen verweist, existiert nicht.**
3. **Fallstrick 5 war berechtigt** — aber die Lücke lag näher als vermutet: fünf
   weitere Befunde fanden sich in denselben fünf Dateien, nicht erst in den
   übrigen 38. Zwei davon (E-6, E-7) hatte die Heuristik übersehen, drei (E-8,
   E-9, E-10) lagen außerhalb ihres Suchraums.
4. **Fallstrick 5, zweite Hälfte** — die Probe darf nicht nur den letzten Handler
   ausführen: `sameOrgParam` ist ein vorgelagerter Middleware. Ohne
   `findChainFrom` meldete der Wächter acht korrekt bewachte Routen als Lücke.
5. **Fallstrick 7 bestätigt** — `ALLOWED_TABLES` hat 22 Einträge, nicht 23.
6. **Neu gemessen** — `audit_log` trägt 1782 von 2711 Zeilen ohne `org_id`; unter
   dem strikten Filter von E-5 wären 416 von 920 Entitäten unsichtbar. Heute
   folgenlos (kein Aufrufer), aber die Grundlage für Entscheidung **D-M3**.
7. **Abschnitt 5 präzisiert** — Zusicherung 4 („orgId in der Parameterliste")
   gehört an die **Gegenprobe**, nicht an den Fremdlauf: eine korrekt bewachte
   Route bricht ab, *bevor* sie die Abfrage stellt. Dort ist die Abwesenheit der
   Org der Beweis, nicht der Mangel.

### Zweite Welle (2026-08-19): die vier vorrangigen Dateien

`capacityExchange` (18) · `marketplace` (30) · `workerPortal` (18) ·
`staffControlCenter` (47) stehen unter dem Wächter. Abdeckung jetzt **15 von 82
Dateien, 137 verhaltensgeprüft, 56 belegte Ausnahmen**.

**Kein neuer Cross-Org-Schreibzugriff** — dafür drei Befunde, die der Plan nicht
vorhergesehen hatte:

1. **Die Leitfrage war zu eng.** Keine dieser vier Dateien trägt eine
   *Org*-Grenze. `capacityExchange` und `marketplace` binden an den **Nutzer**,
   `workerPortal` an die Arbeitersitzung, `staffControlCenter` ist
   org-übergreifend per Bauart. Eine Probe, die nur die Organisation variiert,
   hätte dort jede Verletzung durchgelassen → neue Dimension
   `identitaet: "org" | "nutzer"`.
2. **Flächen mit einer Eintrittsbedingung** brauchen eine eigene Schicht: der
   Torwächter (`requireWorkerRole`, `staffControlAccess`) muss auf *jeder* Route
   stehen, ohne Voraussetzung abweisen und dabei nichts schreiben → Schicht
   **(B2)**, mit eigener Selbstprobe.
3. **E-11 · `canAccessAsOwner` funktioniert nicht** — falsche Spalte
   (`status` statt `is_active`, gegen die laufende Datenbank belegt) und eine
   Nutzer-Kennung, die gegen eine Org-Kennung verglichen wird. 10 Aufrufstellen,
   seit jeher auf „nur direkter Besitzer" degradiert. **Nicht autonom repariert:
   die Korrektur weitet Zugriff aus.** → P1-17, D-M5.

**Eine Falle, die 20 Minuten gekostet hat und in jedes Folgeprojekt gehört:**
``new RegExp(`${name}`)`` — `` ist im Template-Literal ein Backspace, keine
Wortgrenze. Der Ausdruck traf nie, und ein Prüfer, der leer läuft, sieht aus wie
einer, der nichts findet.

Vier neue Owner-Entscheidungen stehen in
[../UEBERGABE.md](../UEBERGABE.md#offene-owner-entscheidungen): **D-M2**
(Null-Politik), **D-M3** (Audit-Zeilen ohne Org), **D-M4** (`created_by`- statt
Org-Grenze bei `PATCH /requisitions/:id`).

---

## ⚠️ Vorbemerkung: H2 enthaelt Sicherheitsluecken *(historisch — geschlossen)*

Die Recherche zu den Mandantengrenzen hat **fuenf Stellen ohne jede Org-Pruefung**
gefunden, drei davon mit schreibendem Cross-Org-Zugriff (Konditionsrahmen,
Rechnungen, Freigaben) und zwei mit Datenabfluss (Audit-Werte samt Akteur-E-Mail).
Das ist keine Aufraeumarbeit, sondern ein Befund mit Aussenwirkung.

**Die Reihenfolge H1 -> H2 ist eine Owner-Entscheidung vom 2026-08-19.** Wer sie
umdreht, hat einen Grund: H2-Befund E-2 erlaubt fremdes Schreiben auf Rechnungen.

---

## H1 — Der Kunde sieht den Ausfall (Fortsetzung von G4b/G5)

**Gate:** Die Kundenansicht zeigt, dass eine gebuchte Kraft ausfaellt — **ohne die
Art** (Art. 9 DSGVO). Der Deep-Link aus der G4b-Benachrichtigung fuehrt zur
betroffenen Zeile, nicht auf eine Uebersicht.

### Recherche-Ergebnis (2026-08-19, vollstaendig)

KURZANTWORT: Heute nirgends. `getCompanyLiveWorkforce` berührt `worker_absences` nicht, die Zeile trägt nicht einmal eine `assignment_id`, der Deep-Link `?einsatz=…#live` wird von der Zielseite komplett ignoriert (weder Query noch Hash), und es gibt keinen einzigen Test, der die Kundenantwort gegen Art.-9-Felder hält. Der Statusbadge ist zusätzlich ein binäres Ternär — ein neuer Zustand „fällt aus" würde heute als grünes „Im Einsatz" gerendert, also nicht fehlen, sondern falsch behaupten.

────────────────────────────────────────
1. getCompanyLiveWorkforce — vollständig
────────────────────────────────────────
Datei: C:/Users/DennisStegemann/Desktop/12_tempconnect_docker(D)/api/services/workforceService.js, Zeilen 479–533.

Signatur: `export async function getCompanyLiveWorkforce(pool, companyOrgId, filters = {})`
- `filters.search` → ILIKE über `wp.first_name`, `wp.last_name`, `so.name` (Firmenname der Agentur)
- `filters.limit` → `Math.min(500, Math.max(1, Number(filters.limit) || 300))`, direkt ins SQL interpoliert (Zahl, kein Injektionsweg)
- Zero-State ohne `companyOrgId`: `{ available:false, workers:[], kpis:{total:0,im_einsatz:0,endet_bald:0,agencies:0}, scope }`

SQL (Zeile 492–520), eine einzige set-basierte Query, kein N+1:
```
FROM worker_assignment_links wal
JOIN assignments a       ON a.id = wal.assignment_id
JOIN users u             ON u.id = wal.worker_user_id
LEFT JOIN worker_profiles wp  ON wp.user_id = wal.worker_user_id
LEFT JOIN organizations so    ON so.id = wal.supplier_org_id
WHERE wal.org_id = $1
  AND wal.is_active = TRUE
  AND wal.worker_confirmation_status NOT IN ('worker_declined','worker_unavailable')
  AND wal.start_date <= CURRENT_DATE
  AND (wal.end_date IS NULL OR wal.end_date >= CURRENT_DATE)
  AND <lifecycle_state> IN ('active','ends_today')
```
SCOPE: **`wal.org_id = $1`** — die Käufer-Org aus `req.orgId`. NICHT `a.org_id`, NICHT `supplier_org_id`. Der Test in api/test/companyTimesheets.route.test.js:135–137 hält beides fest, inklusive Negativ-Assertion `assert.ok(!/supplier_org_id = \$1/.test(...))`.

Rückgabefelder je Zeile (Zeile 492–507): `link_id`, `worker_user_id`, `first_name`, `last_name`, `personnel_number`, `role`, `start_date`, `effective_end_date`, `shift_start`, `shift_end`, `agency_name`, `supplier_org_id`, `worker_description`, `lifecycle_state`, `live_status`.
`live_status` kennt genau zwei Werte (Zeile 502–506): `'endet_bald'` (effektives Ende ≤ CURRENT_DATE + 7) sonst `'im_einsatz'`.

**Was fehlt und für Punkt 4 entscheidend ist: es gibt kein `assignment_id` in der Zeile.** Nur `link_id` (= `wal.id`). Ein Deep-Link auf einen Einsatz lässt sich mit dem heutigen Payload gar nicht auf eine Zeile abbilden.

Rückgabe (Zeile 522–532): `{ available:true, workers:rows, kpis:{total,im_einsatz,endet_bald,agencies}, scope:{company_org_id,ends_soon_days:7}, generated_at }`. Kein `truncated`-Flag — anders als `getWorkerLiveBoard` (Zeile 549: `LIVE_BOARD_ENDS_SOON_DAYS = 7`; Zeile 555 ff. liefert `truncated`).

`worker_absences` kommt in der ganzen Funktion nicht vor.

────────────────────────────────────────
2. Route und Berechtigung
────────────────────────────────────────
api/routes/companyTimesheets.js:77–86
```
router.get("/company/live-workforce", ...base, requireScope("read:workers"),
           rperm("assignment.view"), handler)
```
`base` = `[requireAuth, requireFeature("worker_module"), requireCompanyOrg(...)]` (Zeile 27), `requireCompanyOrg` mit `errorCode: "COMPANY_TIMESHEETS_NOT_AVAILABLE_FOR_ORG_TYPE"` (Zeile 23–26).
Mount: api/app.js:411 in den `v1`-Router, der auf `/api/v1` **und** `/api` liegt (app.js:452–453). Effektiver Pfad: `GET /api/company/live-workforce`.

Rollen mit `assignment.view` (api/services/rbacService.js:88): owner, admin, program_manager, hiring_manager, supplier_manager, finance, dispatcher, recruiter, member, viewer.

WICHTIG FÜR DEN DEEP-LINK: Die G4b-Benachrichtigung geht an `KUNDE_PERMISSION = "assignment.edit"` (api/services/workerAbsenceService.js:796), also owner, admin, program_manager, hiring_manager, dispatcher (rbacService.js:87). Das ist eine **echte Teilmenge** von `assignment.view` — jeder Empfänger der Meldung darf die Zielseite auch tatsächlich öffnen. Es gibt hier also kein 403-Sackgassen-Risiko; die Sackgasse ist rein navigatorisch (Punkt 4).

Ein Struktur-Wächter prüft, dass die Kette real Guards trägt: companyTimesheets.route.test.js:284–296 (`chain.length >= 6` für u. a. `["get","/company/live-workforce"]`).

────────────────────────────────────────
3. Die Oberfläche heute
────────────────────────────────────────
frontend/public/company-timesheets.html:116–138 (`<div id="viewLive">`), Reiter `#tabLive` in Zeile 83.
Tabellenkopf (Zeile 134), 8 Spalten: Mitarbeiter | Zeitarbeitsfirma | Rolle | Schicht | Seit | Bis | Status | (Aktionen).
Drei KPI-Kacheln (Zeile 122–126): `lwTotal` „Aktuell im Einsatz", `lwEnds` „Endet in Kürze", `lwAgencies` „Zeitarbeitsfirmen".

Renderer: frontend/public/js/pages/companyTimesheets.js:559–583 `renderLive(list)`. Eine Zeile zeigt: Name + Personalnummer, `agency_name`, `role || worker_description`, `shift_start–shift_end`, `start_date`, `effective_end_date` (sonst „offen"), `liveBadge(live_status)`, dann zwei Knöpfe „Problem melden" (`ctComplain`) und „Sperren" (`ctBlock`).

ZUSTÄNDE: genau zwei, und der Fallback ist das Problem — companyTimesheets.js:554–558:
```
return status === 'endet_bald'
  ? '<span class="ct-badge ct-badge--soon">…Endet bald…'
  : '<span class="ct-badge ct-badge--live">…Im Einsatz…';
```
Jeder unbekannte Status landet im grünen „Im Einsatz". Ein serverseitig ergänztes `live_status='faellt_aus'` würde also **nicht fehlen, sondern lügen**. Diese Funktion ist die erste Stelle, die angefasst werden muss, und ein Wächter gehört genau hierhin.

WO PLATZ IST:
- Status-Spalte via `liveBadge` — CSS hat bisher nur `.ct-badge--live` und `.ct-badge--soon` (company-timesheets.html:39–40); eine dritte Klasse (z. B. `--out` auf `--ds-danger-muted`) fehlt.
- Vierte KPI-Kachel neben `lwTotal`/`lwEnds`/`lwAgencies`; `updateLiveKPIs` (companyTimesheets.js:584–588) liest heute nur `total`, `endet_bald`, `agencies`.
- Die Spalte „Bis" ist **belegt** durch `effective_end_date` des EINSATZES. Das voraussichtliche Ende der Abwesenheit (`fuerKunde().bis`) ist eine andere Größe und darf sie nicht überschreiben — es gehört in die Statuszelle („fällt aus · vsl. bis 25.08.") oder in eine eigene Zeile darunter.
- i18n: Wörterbuch liegt inline in derselben Datei, DE ab ~Zeile 119 (`cts.live.badge.soon/active/openEnd`), EN ab ~Zeile 266. Ein neuer Schlüssel braucht beide Blöcke.

KEIN POLLING: `_liveTimer` (Zeile 515) wird ausschließlich als Such-Debounce benutzt (Zeile 534, `setTimeout(ctLoadLive, 350)`). Es gibt in der ganzen Datei kein `setInterval`. Die Kundentafel aktualisiert sich nur bei Reiterwechsel oder Klick auf „Aktualisieren" — im Gegensatz zur Agenturtafel (frontend/public/js/pages/mitarbeiter.js: `setInterval(loadLiveBoard, LIVE_POLL_MS)`). Für einen Zustand, der „live" heißen soll, ist das die zweite offene Verdrahtung.

────────────────────────────────────────
4. ?einsatz= wird NICHT ausgewertet — die Sackgasse ist real
────────────────────────────────────────
`init()` (companyTimesheets.js:375–380) macht genau drei Dinge: `TC.api.get('/me')`, `show('main')`, `ctLoad()`. Kein `location.search`, kein `location.hash`, kein `URLSearchParams` — in der gesamten Datei nicht (Grep über alle drei Muster: null Treffer; `pageShell.js` und `notifications.js` ebenfalls null Treffer).

Folgen, in aufsteigender Schwere:
1. Auch **`#live` allein** greift nicht. `ctView()` (Zeile 523) wird nur per `onclick` aufgerufen; Startzustand ist der Reiter „Stundenzettel-Eingang" (HTML:82 trägt `ct-tab--active`, `#viewLive` steht auf `display:none`). Der Kunde landet also auf der Stundenzettel-Liste, nicht auf der Live-Belegschaft.
2. **Der Einsatz ist danach nicht auffindbar.** Selbst wenn jemand `?einsatz=` parst: die Zeilen tragen keine `assignment_id` (siehe Punkt 1). Es gibt nichts, wogegen man vergleichen könnte.

Das verletzt die CLAUDE.md-Regel „Deep-Links statt Sackgassen" (Karten/Benachrichtigungen müssen zum konkreten Ziel führen, nicht auf eine Übersicht).

WIE ER BEIM RICHTIGEN EINSATZ LANDET — das Muster existiert bereits im Repo und ist nachbaubar:
- frontend/public/js/pages/mitarbeiter.js:1516–1522 (`startLiveBoard` liest `#live-<status>` und setzt `_liveFilter` vor dem ersten Laden)
- frontend/public/js/pages/mitarbeiter.js:2015–2020 (`leseFokusAusAdresse()` + `showTab("live")` **nach** dem `/me`-Erfolg, mit begründetem Kommentar: vorher wäre es ein kurzes Aufblitzen von Daten für einen nicht angemeldeten Besucher). Genau diese Reihenfolge gehört auch hier eingehalten.
Serverseitig fehlt dafür nur `a.id AS assignment_id` in der SELECT-Liste (workforceService.js:492–507) — dieselbe Ergänzung, die Welle G6 auf der Agenturseite für `wal.id AS link_id` gemacht hat, mit derselben Begründung (workforceService.js, Kommentar ~Zeile 613–618: ein Einsatz kann mehrere Kräfte tragen, die Oberfläche darf nicht raten).

Der Link selbst ist gebaut und getestet: `kundenDeepLink()` in api/services/workerAbsenceService.js:874–876, festgehalten in api/test/integration/g4bKundenMeldung.flow.test.js:162 — aber nur als INSERT-Parameter. **Kein Test prüft, dass die Zielseite den Parameter je liest.** Das ist exakt die G4-Lehre („wer ruft das auf — und wer lädt/liest es?") in ihrer nächsten Ausprägung.

────────────────────────────────────────
5. Welche Felder dürfen hinüber
────────────────────────────────────────
ERLAUBT — `fuerKunde()`, api/services/workerAbsenceService.js:483–490, exakt vier Felder:
`id`, `von`, `bis`, `faellt_aus` (= `zustand === "wirksam" && !aufgehoben_am`). Positivliste, neues Objekt statt `delete` — der Kommentar 471–482 begründet das ausdrücklich.

VERBOTEN, aus der Agentur-Live-Tafel (workforceService.js:590–591):
- `absence_art` (`abw.art`) — CHECK-Liste `krank|urlaub|termin|sonstiges` (sql/migrations/177_abwesenheit_gehoert_zum_menschen.sql:129–130). „krank" ist ein Gesundheitsdatum, Art. 9 DSGVO.
- `absence_notiz` (`abw.notiz`) — Freitext.
Zusätzlich verboten, in der Tabelle vorhanden, aber nicht einmal in der Agenturtafel: `beschreibung` (die 30 Wörter, sql/migrations/181_abwesenheit_selbsterfassung.sql:90), `quelle`, `zustand`, `entscheidung_grund`, `entschieden_von`, `aufhebung_grund`, `erfasst_von`.
Ebenfalls verboten, weil Aggregation über Art.-9-Daten: `kpis.abwesend_nach_art` (workforceService.js:565 und 659–661) — eine Zahl „3 krank" ist bei kleiner Belegschaft de facto eine Einzelauskunft.

EMPFEHLUNG ZUR VIERTEN ZUSAGE: `absence.id` weglassen. `fuerKunde()` gibt sie mit, aber die Live-Tafel braucht sie nicht, und der Kunde hat auf die Abwesenheit keinen Zugriff — `benachrichtigeKunde()` ankert bewusst am Einsatz, nicht an der Abwesenheit (workerAbsenceService.js, Kommentar ~950–955: „der Kunde kennt keine Abwesenheits-ID und hat auf sie keinen Zugriff"). In die Zeile gehören genau zwei neue Angaben: ein Statuswert und `bis`.

────────────────────────────────────────
6. Gibt es schon einen Test darauf? Nein.
────────────────────────────────────────
- Der einzige Test auf `getCompanyLiveWorkforce` ist api/test/companyTimesheets.route.test.js:122–139 und prüft ausschließlich Scope (`wal.org_id = $1`) und Shape (`available`, `workers.length`, `kpis.total`). Kein Wort zu Abwesenheit.
- Repo-Grep `absence_art|absence_notiz` trifft ausschließlich Agentur-Pfade: workforceService.js:590–591, 659; mitarbeiter.js:1744–1745; api/test/abwesenheitOberflaeche.test.js (168, 193, 201, 211, 356); api/test/workerAbwesenheit.test.js (290–292, 319, 394); api/test/integration/workerAbwesenheit.flow.test.js:82. Keine einzige Kundenseite.
- api/test/g4bKundenBenachrichtigung.test.js schützt den BENACHRICHTIGUNGS-Weg: die `VERRAETERISCH`-Liste (Zeile 55) wird gegen den **vollständigen INSERT-Parametersatz** geprüft, plus ein erfundenes Zusatzfeld (`diagnose_code`, Zeile ~131) und die Signatur von `kundenNachricht()`. Das ist ein Verhaltenstest — aber auf `notifications`, nicht auf der Live-Antwort.

VORSCHLAG FÜR DEN WÄCHTER (Verhalten, nicht Quelltext — die G6-Lehre, dass `if (false && X)` die Zeichenkette weiterhin enthält):
1. **Antwort-Wächter (der wichtigste):** Mock-Pool liefert eine Zeile, die absichtlich `absence_art:'krank'`, `absence_notiz:'Grippe'`, `beschreibung:'…Fieber…'` trägt — also so, als hätte jemand den Join naiv erweitert. Der echte Route-Handler wird aufgerufen, dann `JSON.stringify(res._json).toLowerCase()` gegen dieselbe `VERRAETERISCH`-Liste geprüft. Ein abgeschalteter Filterzweig überlebt das nicht, weil das ERGEBNIS geprüft wird.
2. **Positivliste statt Negativliste:** `Object.keys(res._json.workers[0])` muss Teilmenge einer erlaubten Feldmenge sein. Damit fällt auch das Feld auf, das erst nächstes Jahr ergänzt wird und in keiner Wortliste steht.
3. **SQL-Formtest als Ergänzung, nicht als Ersatz:** kommt `worker_absences` im SQL vor, muss dasselbe SQL auch `zustand`/`'wirksam'` und `aufgehoben_am IS NULL` sowie die supplier-Org-Bindung enthalten — sonst leakt eine nur BEANTRAGTE Selbstmeldung an den Kunden (die Grenze aus G1, workerAbsenceService.js:896–904).
4. **DOM-Wächter auf `renderLive`:** bei `live_status='faellt_aus'` darf die Zeile nicht `ct-badge--live`/„Im Einsatz" enthalten. Fängt genau den binären Fallback aus companyTimesheets.js:554–558. Das Muster für einen vm-Sandbox-Test der Seiten-JS existiert in api/test/abwesenheitOberflaeche.test.js.

### Fallstricke

1. ORG-BOUNDARY-FALLE IM JOIN (der schwerste Punkt): worker_absences haengt an worker_profile_id + supplier_org_id (Mig 177:103-104, FK 124-127). Die Kundenabfrage joint aber nur 'LEFT JOIN worker_profiles wp ON wp.user_id = wal.worker_user_id' (workforceService.js:497) — OHNE wp.supplier_org_id = wal.supplier_org_id. worker_profiles(user_id) ist kein UNIQUE-Index (Mig 029:57-58), eine Person kann also Profile bei zwei Agenturen haben. Ein naiver Absenz-Join wuerde damit die Abwesenheit der FALSCHEN Firma anzeigen. Jede Erweiterung muss zwingend wp.supplier_org_id = wal.supplier_org_id UND ab.supplier_org_id = wal.supplier_org_id binden — sonst ist die Datenschutz-Erweiterung selbst ein Org-Boundary-Bruch.
2. LATENTER BESTANDSDEFEKT AUS DEMSELBEN GRUND: derselbe unbeschraenkte LEFT JOIN kann heute schon Zeilen vervielfachen (eine Kraft erscheint doppelt in der Kundenliste) und damit kpis.total verfaelschen. Aus dem Schema ableitbar, in echten Daten nicht von mir geprueft — vor der Erweiterung einmal messen (SELECT user_id, count(*) FROM worker_profiles WHERE user_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1).
3. BEANTRAGT-LEAK: Wird nur auf 'aufgehoben_am IS NULL' gejoint, gelangt eine noch nicht freigegebene Selbstmeldung (zustand='beantragt', Mig 181:50-56) an den Kunden. Die Benachrichtigung schuetzt sich dagegen ueber fuerKunde().faellt_aus (workerAbsenceService.js:896-904); der Live-Join braucht dieselbe Bedingung explizit, sonst weichen zwei Wahrheiten voneinander ab.
4. DER BADGE LUEGT, ER FEHLT NICHT: liveBadge (companyTimesheets.js:554-558) faellt fuer jeden unbekannten Status auf gruen 'Im Einsatz' zurueck. Wer nur das Backend erweitert und den Renderer vergisst, hat die Lage verschlechtert, nicht bloss nicht verbessert. Reihenfolge deshalb: Renderer + Wachtest zuerst, dann das Feld.
5. DIE SPALTE 'BIS' IST BELEGT: sie zeigt effective_end_date des EINSATZES. Das voraussichtliche Ende der Abwesenheit (fuerKunde().bis) ist eine andere Groesse. Beides in dieselbe Zelle zu schreiben erzeugt genau die Verwechslung, die den Kunden falsch planen laesst.
6. DEEP-LINK BRAUCHT ZWEI AENDERUNGEN, NICHT EINE: Query-Parsing im Frontend allein reicht nicht, weil die Zeile keine assignment_id traegt (workforceService.js:492-507). Ohne 'a.id AS assignment_id' in der SELECT-Liste laesst sich ?einsatz= auf nichts abbilden.
7. REIHENFOLGE IM FRONTEND: Reiterwechsel erst NACH dem /me-Erfolg setzen (Muster mitarbeiter.js:2015-2020). Vorher waere es ein kurzes Aufblitzen von Daten fuer einen nicht angemeldeten Besucher.
8. KEIN POLLING: die Kunden-Live-Tafel hat kein setInterval (nur Such-Debounce, companyTimesheets.js:515/534). Ein Zustand 'faellt aus' waere ohne Refresh so aktuell wie der letzte Reiterklick — die Living-Platform-Direktive (Live-Ueberwachung als Pflicht-Standard) ist damit nicht erfuellt.
9. QUELLTEXT-TESTS REICHEN HIER NICHT (G6-Lehre): ein Test, der prueft 'im SQL steht kein abw.art', laesst jede Variante durch, die das Feld ueber einen Zwischenschritt oder ein spread-Objekt weiterreicht. Der Waechter muss die ANTWORT pruefen (JSON.stringify des Handler-Ergebnisses) und zusaetzlich eine Positivliste der erlaubten Schluessel fuehren.
10. NICHT GEPRUEFT: Ich habe nichts im Browser ausgefuehrt und keine Tests laufen lassen (READ-ONLY). Alle Aussagen stammen aus Quelltext, SQL-Migrationen und Testdateien. Ob es ausserhalb von api/test/ (z. B. in e2e/) einen Test auf die Kundenansicht gibt, habe ich nicht vollstaendig durchsucht — meine Grep-Belege zu Art.-9-Feldern decken das gesamte Repo ab, meine Testsuche nach 'live-workforce' nur api/test/.

### Belege

| Datei | Zeile | Was |
|---|---|---|
|  | 479-533 | getCompanyLiveWorkforce: Signatur (pool, companyOrgId, filters), SQL mit WHERE wal.org_id = $1, Rueckgabefelder link_id/worker_user_id/.../live_status. Kein assignment_id, kein worker_absences. |
|  | 492-507 | SELECT-Liste der Kundenansicht — belegt, dass assignment_id fehlt (nur wal.id AS link_id). |
|  | 502-506 | live_status kennt genau zwei Werte: 'endet_bald' / 'im_einsatz'. |
|  | 590-591 | Agentur-Tafel getWorkerLiveBoard selektiert abw.art AS absence_art und abw.notiz AS absence_notiz — genau die Felder, die nicht hinueber duerfen. |
|  | 659-661 | kpis.abwesend_nach_art aggregiert ueber absence_art — Aggregation ueber Art.-9-Daten, ebenfalls tabu fuer den Kunden. |
|  | 613-618 | G6-Kommentar: warum link_id mitgegeben wurde ('die Oberflaeche muesste sonst raten') — dieselbe Begruendung gilt fuer assignment_id auf der Kundenseite. |
|  | 77-86 | GET /company/live-workforce mit requireScope('read:workers') + requirePermission('assignment.view'); base = requireAuth + requireFeature('worker_module') + requireCompanyOrg. |
|  | 411, 452-453 | createCompanyTimesheetsRouter im v1-Router, gemountet auf /api/v1 und /api → effektiv GET /api/company/live-workforce. |
|  | 87-88 | assignment.edit = owner/admin/program_manager/hiring_manager/dispatcher; assignment.view = diese plus fuenf weitere → Empfaengerkreis der G4b-Meldung ist Teilmenge und darf die Seite oeffnen. |
|  | 483-490 | fuerKunde(): gibt exakt id, von, bis, faellt_aus (zustand==='wirksam' && !aufgehoben_am) — Positivliste, neues Objekt. |
|  | 796 | KUNDE_PERMISSION = 'assignment.edit' — wer die Ausfallmeldung bekommt. |
|  | 874-876 | kundenDeepLink(): '/public/company-timesheets.html?einsatz=' + id + '#live'. |
|  | 896-904 | Absendebedingung ist fuerKunde().faellt_aus — beantragte Meldungen gehen nicht an den Kunden; dieselbe Grenze muss der Live-Join einhalten. |
|  | 375-380 | init(): nur /me, show('main'), ctLoad(). Kein location.search, kein location.hash, kein URLSearchParams — der Deep-Link wird ignoriert. |
|  | 554-558 | liveBadge(): binaeres Ternaer — alles ausser 'endet_bald' faellt in das gruene 'Im Einsatz'. Ein Zustand 'faellt_aus' wuerde falsch gerendert. |
|  | 559-583 | renderLive(): acht Zellen, dazu Knoepfe 'Problem melden' und 'Sperren'. Keine Abwesenheitsangabe. |
|  | 584-588 | updateLiveKPIs() liest nur total, endet_bald, agencies — Platz fuer eine vierte Kachel. |
|  | 515, 534 | _liveTimer wird ausschliesslich als Such-Debounce genutzt; kein setInterval in der Datei → die Kunden-Live-Tafel pollt nicht. |
|  | 119-121, 266-268 | i18n-Woerterbuch inline, DE und EN: cts.live.badge.soon/active/openEnd — ein neuer Zustand braucht beide Bloecke. |
|  | 116-138 | viewLive: drei KPI-Kacheln (lwTotal/lwEnds/lwAgencies), Tabellenkopf mit 8 Spalten, tbody#lwBody. |
|  | 39-40 | Nur zwei Badge-Klassen definiert: ct-badge--live (success) und ct-badge--soon (warning). Eine dritte fehlt. |
|  | 82-85 | Reiter; #tabTimesheets traegt ct-tab--active → Startzustand ist der Stundenzettel-Eingang, nicht die Live-Belegschaft. |
|  | 1516-1522 | Nachbaubares Muster: startLiveBoard() liest '#live-<status>' aus der Adresse und setzt den Reiterfilter vor dem ersten Laden. |
|  | 2015-2020 | leseFokusAusAdresse() + showTab('live') NACH dem /me-Erfolg, mit Begruendung (kein Aufblitzen von Daten fuer Nichtangemeldete). |
|  | 122-139 | Einziger Test auf getCompanyLiveWorkforce: prueft Scope (wal.org_id, Negativ-Assertion gegen supplier_org_id) und Shape. Nichts zu Abwesenheit. |

---

### ✅ H1 gebaut und belegt (2026-08-19)

**Gate erfuellt.** Die Kundenansicht zeigt den Ausfall samt voraussichtlichem
Ende, nennt die Art nirgends, und der Deep-Link aus der G4b-Meldung landet auf
der betroffenen Zeile.

| Was | Wo |
|---|---|
| Zustand `faellt_aus` + `ausfall_bis`, Projektion ueber eine Positivliste, KPI `faellt_aus` | `api/services/workforceService.js` (getCompanyLiveWorkforce) |
| `a.id AS assignment_id` — der Anker des Deep-Links | dieselbe SELECT-Liste |
| Abwesenheits-LATERAL: org-gebunden, nur `zustand='wirksam'`, nicht aufgehoben, laufend | dieselbe Abfrage |
| `liveBadge()` als Zustandstabelle statt binaerem Ternaer, dritte Klasse `.ct-badge--out`, Statuszelle mit "vsl. bis …" | `frontend/public/js/pages/companyTimesheets.js`, `company-timesheets.html` |
| `?einsatz=` + `#live` werden gelesen, Reiter oeffnet, Zeile wird hervorgehoben und angescrollt | `companyTimesheets.js` (`leseEinsatzAusAdresse`/`fokussiereEinsatz`) |
| Vierte Kachel `lwOut`; "Aktuell im Einsatz" zaehlt Ausgefallene nicht mehr mit | `updateLiveKPIs` |
| 30-Sekunden-Takt, solange der Live-Reiter offen ist (vorher: kein Polling) | `startLivePolling`/`stopLivePolling` |
| 32 Waechter (Antwort, Positivliste, Abfrageform, gerenderte Oberflaeche, Deep-Link, Takt, DE/EN) | `api/test/h1KundenansichtAusfall.test.js` |
| 13 Tests gegen das echte Schema (Mandantengrenze, CHECK, DATE-Typ, Fremdschluessel) | `api/test/integration/h1KundeSiehtAusfall.flow.test.js` |

**Was gegenueber der Recherche ANDERS entschieden wurde — und warum:**

> **Fallstricke 1 und 2 beruhten auf einer falschen Schema-Annahme.** Die
> Recherche hielt `worker_profiles(user_id)` fuer nicht eindeutig und las dafuer
> den **Index** in `029_worker_module.sql:57-58`. Das inline `UNIQUE` steht aber
> in **Zeile 35 derselben Datei**; gegen die laufende Datenbank geprueft,
> existiert `worker_profiles_user_id_key`. Folgen:
>
> - **Fallstrick 2 (Zeilenvervielfachung) existiert nicht** — auch nicht latent.
>   Gemessen: 0 Konten mit mehr als einem Profil (33 Profile im Bestand).
> - **Fallstrick 1 war halb richtig.** Die Mandantengrenze gehoert an die
>   **Abwesenheit** (`ab.supplier_org_id = wal.supplier_org_id`), nicht an den
>   Profil-Join. Weil `worker_absences (worker_profile_id, supplier_org_id)`
>   zusammengesetzt auf `worker_profiles (id, supplier_org_id)` zeigt
>   (Mig 177:124-127), schliesst diese **eine** Bedingung die Profil-Firma
>   zwingend mit ein.
> - Die zunaechst empfohlene Bedingung am Profil-Join war **zuerst gebaut und
>   dann wieder entfernt**: sie haette nichts geschuetzt und einen Schaden
>   angerichtet — weicht die Firma des Profils einmal von der der Verknuepfung
>   ab (Wechsel der Zeitarbeitsfirma bei laufendem Alt-Einsatz), waere der
>   **Name** der Kraft aus der Kundenliste gefallen. Ein Integrationstest haelt
>   genau diesen Fall fest.
>
> **Uebertragbare Lehre:** Eine Aussage ueber das Schema wird gegen
> `pg_constraint`/`pg_indexes` geprueft, nicht gegen die Migrationsdatei —
> und schon gar nicht gegen eine einzelne Zeile daraus. Ein `CREATE INDEX`
> neben einer Spalte sagt nichts darueber, ob die Spalte ein `UNIQUE` traegt.
> Dieselbe Sorgfalt gilt fuer H2: die dortigen fuenf Befunde sind
> Quelltext-Lesungen und noch nicht gegen die laufende Datenbank belegt.

**Zwei Entscheidungen zur Darstellung** (beide aus Fallstrick 4/5 abgeleitet):

1. `endet_bald` wurde vom Zustand zu einem **eigenen booleschen Feld**. Der
   Ausfall ueberdeckt es im Abzeichen (er ist die dringendere Auskunft), aber
   die Kennzahl "Endet in Kuerze" behaelt exakt ihre bisherige Bedeutung und die
   Zeile sagt beides. Dasselbe Muster wie auf der Agenturtafel.
2. Die Abwesenheits-Kennung geht **nicht** hinueber. Der Kunde hat auf die
   Abwesenheit keinen Zugriff; was er nicht oeffnen kann, braucht er nicht zu
   kennen. In der Zeile stehen genau zwei neue Angaben: Zustand und `bis`.

**Beim Bauen zusaetzlich gefunden und behoben — die Spalte "Rolle" log:**
Sie rendert `wal.role`, und das ist keine Taetigkeit, sondern die
**Besetzungsart**: ein geschlossener CHECK auf `'primary'|'backup'`
(Mig 029:99-100), NOT NULL mit Vorgabe `'primary'`. Der Kunde las unter
"Rolle" also das englische Wort **"primary"** — im Bestand tragen **alle 24**
Verknuepfungen genau diesen Wert, es traf damit **jede Zeile**. Der Rueckfall
`|| worker_description` konnte nie greifen, weil die Spalte nicht leer sein
kann: eine tote Zeile, die aussah, als sei der Fall bedacht. Jetzt steht dort
die Taetigkeit; die Besetzungsart wird nur genannt, wenn sie etwas aussagt
("Springer" beim Ersatz) — bei `'primary'`, also immer, waere sie ein Etikett
ohne Unterschied. Drei Waechter dazu, plus eine verschaerfte DE/EN-Pruefung
ueber das **ganze** Woerterbuch statt ueber eine Liste "neuer" Schluessel (eine
solche Liste altert, weil niemand sie pflegt).

**Nicht erledigt, bewusst:** Fallstrick 3 (Beantragt-Leak) ist geschlossen,
Fallstrick 8 (kein Polling) ist geschlossen. Offen bleibt nichts aus H1.

---

## H2 — Die 80 Mandantengrenzen (offene Entscheidung D-M1)

**Frage:** Die 80 einzelnen Org-Pruefungen in 18 Route-Dateien konsolidieren, oder
einen Waechter bauen, der Abweichungen faengt?

### Recherche-Ergebnis (2026-08-19, vollstaendig)

## Kurzfassung der Empfehlung

**Waechter — und zwar sofort. Konsolidieren der 80: nein.** Nicht weil es zu riskant waere, sondern weil es das Problem nicht loest. Die 80 Kopien sind untereinander erstaunlich einheitlich. Gefaehrlich sind die Stellen, an denen **gar keine Kopie steht** — und davon habe ich fuenf gefunden, drei davon mit schreibendem Cross-Org-Zugriff. Eine Konsolidierung der 80 haette keine einzige davon gefunden.

---

## 1. Kern von docs/ORG_GRENZE_BEFUND.md

Die Mutation-Haertung (Welle 3) suchte den EINEN zentralen Guard "fremde Org -> 403" und fand ihn nicht: 80 Fundstellen `ORG_BOUNDARY_VIOLATION` in 18 Route-Dateien, 6 in Services, 2 im Helfer, 1 als blosser Kommentar. Typische Form ist der direkte Vergleich ohne Helfer. Owner-Entscheidung 2026-08-11: Welle 3 laeuft auf dem Helfer, ihr Gate heisst ehrlich "Helfer-Pfad abgesichert" (~9 von 89 Entscheidungsstellen); die 80 werden als Welle 3b gefuehrt. Die vom Dokument selbst gestellte Leitfrage lautet: **nicht "wie oft", sondern "wo weicht eine Kopie ab?"**

## 2. Zahl selbst verifiziert — 80 bestaetigt

Verteilung exakt wie dokumentiert: `workers.js` 13, `timesheets.js` 12, `organizations.js` 8, `complianceDocs.js` 7, `assignments.js` 6, `requisitions.js`/`invoices.js`/`documentCenter.js`/`contracts.js` je 5, `vendorPool.js` 4, `suppliers.js`/`rateCards.js` je 2, `workforce.js`/`spendAnalytics.js`/`reporting.js`/`orgControlCenter.js`/`matching.js`/`approvals.js` je 1. Summe 80.

**Gruppierung nach Muster (Summe 80):**

| Muster | Anzahl | Beispiel |
|---|---|---|
| `if (req.orgId && X !== req.orgId)` — **fail-open** bei fehlendem orgId | **42** | `contracts.js:73` |
| `if (X !== req.orgId)` ohne Null-Wache — **fail-closed** | **14** | `workers.js:1080` (13x), `organizations.js:65` |
| datei-privater `checkOrgBoundary(ts, req.orgId)` | **9** | `timesheets.js:168` |
| `catch (err) { if (err instanceof OrgBoundaryError) -> 403 }` | **8** | `requisitions.js:152` |
| Service liefert Fehlercode, Route mappt auf 403 | **6** | `workforce.js:62` |
| Sonderform `!belongsToUser && !belongsToOrg` | **1** | `invoices.js:121` |

Ein Muster fehlt in dieser Zaehlung voellig und ist genau deshalb wichtig: **die Grenze im SQL** (`WHERE org_id = $1` im Service). Diese Routen erzeugen die Zeichenkette nie — sie sind sicher, ohne in den 80 vorzukommen. Jeder Waechter, der nur die Zeichenkette einfordert, produziert dort Falschmeldungen.

## 3. Weichen die Kopien voneinander ab? — JA, in zwei Klassen

### Klasse 1: Formale Abweichung (real, aber weitgehend entschaerft)

Die **Null-Politik** ist dreigeteilt und widerspruechlich:
- 42 Stellen: `req.orgId &&` -> schaltet sich bei fehlendem orgId selbst ab (fail-open)
- 14 Stellen (13x `workers.js`, 1x `organizations.js:65` `parentOrgBoundary`) -> fail-closed
- `timesheets.js:67-70`: `if (!orgId) return true;` — Legacy-Ausnahme, explizit fail-open
- 11 der 42 haben eine **zweite** Fail-open-Stufe: `req.orgId && doc.org_id && doc.org_id !== req.orgId` (z. B. `complianceDocs.js:180`) — eine Zeile mit NULL-`org_id` passiert ungeprueft.

Entschaerft ist das durch `api/middleware/orgContext.js` Regel 7 (Audit C-11, 2026-07-26): ein nicht aufloesbarer Org-Wunsch faellt auf die eigene Org zurueck, statt `req.orgId = null` zu setzen. Der Kommentar dort nennt selbst "45 Routen", die sich bei `null` abschalten. Fuer einen Nutzer mit mindestens einer Mitgliedschaft ist `req.orgId` damit immer gesetzt. **Genau deshalb ist der Ertrag einer Konsolidierung der 42 gering.**

### Klasse 2: Fehlende Kopie — fuenf konkrete Befunde (das ist die eigentliche Beute)

**E-1 · Rate Cards: Cross-Org-SCHREIBEN, kein Backstop.**
`POST /rate-cards/:id/activate` (`api/routes/rateCards.js:222-240`) und `/archive` (`:242-260`) haben **keine** Grenzpruefung. Die Geschwister GET `/rate-cards/:id` (`:119`) und PATCH `/rate-cards/:id` (`:200`) in derselben Datei haben eine. `ensureCompanyRateCardAccess` (`:13-36`) prueft nur, dass ein Org-Kontext existiert und der Org-Typ `company` ist — keine Bindung an die Ressource. Der Service `activateRateCard`/`archiveRateCard` (`api/services/rateCardService.js:238-247`, `252-261`) macht `UPDATE rate_cards ... WHERE id = $1 RETURNING *` — kein `org_id`. `rate_cards` hat **keine RLS-Policy**. Ergebnis: wer `rate_card.update` in irgendeiner company-Org hat, kann den Konditionsrahmen einer fremden Org aktivieren/archivieren und bekommt ihn per `RETURNING *` samt Saetzen zurueck.

**E-2 · Operative Rechnungen: Cross-Org-SCHREIBEN auf Geld.**
`POST /invoices/operational/:id/{issue,paid,void,correction}` (`api/routes/invoices.js:291-347`) uebergeben `req.orgId` **nicht**. Das Geschwister-GET direkt darueber (`:281-288`) ruft `getOperationalInvoice(pool, req.params.id, req.orgId)` und mappt `ORG_BOUNDARY_VIOLATION` auf 403 — die Leseseite ist sauber, die Schreibseite nicht. `transitionInvoice` (`api/services/operationalInvoiceService.js:459-486`) laedt `org_id, supplier_org_id` sogar in `inv[0]`, **vergleicht sie aber nie**, und schreibt `UPDATE invoices ... WHERE id = $1 RETURNING *`. Gleiches in `addCorrectionItem` (`:413-430`).

**E-3 · Freigaben: Cross-Org-SCHREIBEN + Cross-Org-Historie.**
`POST /approvals/:id/approve` (`api/routes/approvals.js:244-251`) und `/reject` (`:253-260`) haben keine Pruefung; das Geschwister-GET `/approvals/:id` (`:234-242`) hat eine. `approveEntity`/`rejectEntity` (`api/services/approvalService.js:25-46`, `48-…`) machen `UPDATE approval_requests ... WHERE id = $1 AND status = 'pending'` — kein `org_id`. Dazu `GET /approvals/history/:entityType/:entityId` (`:262-265`) ganz ohne Grenze; `getApprovalHistory` (`:96-107`) filtert nur nach `entity_type`/`entity_id` und gibt Antragsteller- und Freigeber-E-Mails heraus. `approval_requests` hat keine RLS-Policy.

**E-4 · Requisitions: die Grenze steht an zwei von drei Tueren zum selben Raum.**
`POST /requisitions/:id/transition` (`api/routes/requisitions.js:142`) und `/approve` (`:180`) rufen `assertOrgOwnership`. `POST /requisitions/:id/submit` (`:162-176`) nicht — und landet ueber `submitForApproval` (`api/services/requisitionService.js:228-230`) in derselben `transitionStatus`, die `UPDATE requisitions ... WHERE id = $1` schreibt (`:203-206`). Auch `PATCH /requisitions/:id` (`:126-134`) hat keine Org-Grenze; `updateRequisition` (`:163-164`) begrenzt per `WHERE id = $1 AND created_by = $2` — eine **Ersteller**-Grenze statt einer Org-Grenze. Kein Leck, aber ein abweichendes Grenzmodell mit dem Nebeneffekt, dass ein Kollege derselben Org fremde Requisitions der eigenen Org nicht bearbeiten kann.

**E-5 · Die Pruefung bewacht den falschen Knopf.**
`GET /organizations/:id/audit-log/recent-changes` (`api/routes/organizations.js:274-293`) prueft `req.params.id !== req.orgId` — der Nutzer traegt dort natuerlich die **eigene** Org ein. Der tatsaechliche Datenwaehler ist `req.query.entity_id`, und `getRecentChanges` (`api/services/auditLog.js:310-325`) filtert `WHERE al.entity_type = $1 AND al.entity_id = $2` — **ohne** `org_id`. Die Nachbarroute `/audit-log` (`:238-270`) macht es richtig ueber `queryOrgAuditLog` -> `queryAuditLog` mit `al.org_id = $n` (`api/services/auditLog.js:242`). Ergebnis: owner/admin einer beliebigen Org liest `old_values`/`new_values` und Akteur-E-Mail fremder Entitaeten. (Kein Frontend-Aufrufer — der Aufruf in `frontend/public/js/pages/adminPanel.js:1321` zielt auf `/admin/audit-log/recent-changes`.)

**Zur RLS-Frage:** `audit_log`, `invoices`, `requisitions`, `timesheets` u. a. haben Policies; `rate_cards` und `approval_requests` **nicht**. Und der Kopf von `sql/migrations/126_rls_forward_repair.sql:26-28` sagt selbst, dass der lokale Superuser `tempconnect` RLS generell umgeht — in der Docker-Standardkonfiguration (`.env.example:17` `POSTGRES_USER=tempconnect`) gibt es also keinen DB-Backstop. Zusaetzlich laufen alle genannten Service-Schreibvorgaenge ueber `pool.query` ohne `SET LOCAL app.current_org_id`.

## 4. assertOrgOwnership / assertUserOwnership — unpassend geschnitten, nicht nur unbekannt

Beide in `api/utils/orgBoundary.js`. `assertOrgOwnership` (`:54-77`): Null-Wache fail-closed, `ALLOWED_TABLES`-Pruefung, `SELECT <col> FROM <table> WHERE id = $1`, 404 wenn leer, sonst `OrgBoundaryError` bei Ungleichheit. `assertUserOwnership` (`:83-104`): identisch, nur gegen `owner_id`. Aufrufer verifiziert: `assertOrgOwnership` nur `routes/requisitions.js:142,180,230,247` (4x, immer `'requisitions'`), `assertUserOwnership` **null**. Bestaetigt.

Vier Gruende, warum er nicht benutzt wird — drei davon strukturell:

1. **Er kann die zweiseitige Grenze nicht ausdruecken.** Ein Vergleich, eine Spalte. Der reale Bedarf in assignments/contracts/timesheets/vendorPool ist `org_id = ich ODER supplier_org_id = ich` — rund 20 der 80 Stellen. Nicht abbildbar.
2. **Seine Tabellenliste enthaelt die wichtigsten Tabellen nicht.** `ALLOWED_TABLES` hat 22 Eintraege (nicht 23 — bitte im Auftragstext korrigieren). Es fehlen `timesheets`, `invoices`, `worker_profiles`, `worker_submissions`, `document_center` — also genau die Tabellen hinter `timesheets.js` (12), `workers.js` (13), `invoices.js` (5), `documentCenter.js` (5) = 35 der 80 Stellen. Dort ist der Helfer nicht "ungenutzt", sondern **nicht benutzbar**.
3. **Er kostet eine zusaetzliche Abfrage.** Die Routen haben die Zeile ueber ihren Service schon geladen; der Helfer liest sie ein zweites Mal. 80 Stellen umzustellen hiesse rund 60 zusaetzliche Roundtrips auf heissen Pfaden — gegen §0.3.
4. **Und selbst an seinen 4 echten Aufrufstellen ist er entschaerft:** jeder Aufruf steht als `if (req.orgId) await assertOrgOwnership(...)`. Die eigene fail-closed-Wache `if (!orgId) throw` (`:55`) ist damit an jeder realen Aufrufstelle toter Code. Eine Konsolidierung in der heutigen Form wuerde das Fail-open also **mitnehmen**, nicht beseitigen.

## 5. Der Waechter — konkret, additiv, ohne Produktionscode

Vorbild ist der bereits existierende `api/test/sqlSchemaWaechter.test.js`: Register + Pruefung + **Selbstprobe**. Drei Schichten, alle rein additiv:

**Schicht 1 — Register.** Eine eingecheckte `api/test/fixtures/orgGrenzen.json`: je Route Methode, Pfad, Traegerspalte(n), Urteil (`geprueft` | `bewusste-ausnahme` + Begruendung). Der Test zaehlt die Routen aus dem **Router-Objekt** auf (`listRoutes(router)` existiert bereits in `api/test/helpers/security-mocks.js:180`), nicht aus dem Quelltext — das ist die G6-Lehre auf die Aufzaehlung angewandt. Rot, sobald eine `:id`-Route auf einer org-gebundenen Tabelle auftaucht, die das Register nicht kennt. **Genau das haette E-1 bis E-4 beim Anlegen gemeldet.**

**Schicht 2 — Verhaltensprobe mit Spion-Pool (der Kern).** Router ueber seine Factory montieren, Pool ersetzen durch einen Spion, der jedes `{sql, params}` mitschreibt und jedes SELECT mit einer Zeile **fremder** Org beantwortet. Dann `req.orgId = ORG_A`, `params.id = fremd` — und **vier** Zusicherungen, wobei erst 2 bis 4 den Beweis tragen:
1. Status ist 403 (das Ergebnis — allein wertlos),
2. **auf dem Spion steht kein INSERT/UPDATE/DELETE** — eine Route, die erst schreibt und danach 403 meldet, faellt hier durch,
3. **die Parameter der entscheidenden SELECT-Abfrage enthalten die Ressourcen-ID** — beweist, dass die Route ueber *die* Zeile geurteilt hat, die sie danach anfasst; das ist die Zusicherung, die **E-5** (geprueft wird `params.id`, geholt wird `query.entity_id`) rot macht,
4. **`req.orgId` steht in der Parameterliste der lesenden Abfrage**, wo die Grenze im Service-SQL liegt; das ist die Zusicherung, die **E-2** (`transitionInvoice` bekommt die orgId nie) rot macht.
Dazu die **Gegenprobe**: derselbe Aufbau, Zeile traegt ORG_A -> Status ist *nicht* 403 **und** der Schreibvorgang steht auf dem Spion. Ohne sie wuerde ein pauschales `return 403` bestehen.

Das ist strikt mehr als das vorhandene `api/test/security/coreFlowCrossTenant.test.js`, das nur `res._status === 403` prueft (Zeile 78) und mit `poolWith(row)` jede Abfrage gleich beantwortet — also nur Punkt 1.

**Schicht 3 — Selbstprobe.** Ein Mini-Router im Test mit drei absichtlichen Fehlern: (a) Grenze vergessen, (b) Grenze nach dem Schreiben, (c) Grenze auf dem falschen Parameter. Der Waechter **muss** alle drei melden. Ohne diese Probe ist ein kaputter Waechter von einem sauberen Bestand nicht zu unterscheiden — dieselbe Begruendung, die `sqlSchemaWaechter.test.js` in seinem Punkt (f) fuer sich selbst gibt.

**Warum das den G6-Mutanten toetet:** `if (false && X)` aendert das Verhalten — der 403 bleibt aus, der Schreibvorgang erscheint auf dem Spion. Rot. Ein Quelltext-Test haette den Mutanten wieder durchgelassen.

**Ehrliche Grenze des Waechters:** Er beweist die Entscheidung des Handlers und die Parameteruebergabe. Er beweist **nicht**, dass ein Service-SQL sein `AND org_id = $2` behalten hat — nimmt jemand die Klausel heraus, aber uebergibt den Parameter weiter, bleibt Schicht 2 gruen. Diese Luecke gehoert zu `sqlSchemaWaechter` plus den Mutationslaeufen auf den Services und muss im Gate benannt statt uebertuencht werden.

## 6. Empfehlung mit Begruendung

**Waechter bauen. Die 80 nicht konsolidieren. Fuenf Befunde als Tickets an den Owner.**

1. **Die 80 sind nicht das Risiko.** Sie weichen formal ab (Null-Politik), aber sie existieren, und `orgContext` Regel 7 hat ihre Fail-open-Variante fuer jeden Nutzer mit Mitgliedschaft ohnehin entschaerft. Alle fuenf echten Defekte liegen dort, wo **keine** der 80 steht. Eine Konsolidierung haette keinen einzigen gefunden. Das ist das entscheidende Argument.
2. **Der Helfer taugt in heutiger Form nicht als Ziel.** 35 der 80 Stellen liegen auf Tabellen, die seine Liste nicht kennt; ~20 brauchen eine zweiseitige Grenze, die er nicht kann; jede Nutzung kostet eine Extra-Abfrage; und alle 4 realen Aufrufe entschaerfen seine eigene Null-Wache. "Konsolidieren" hiesse zuerst den Helfer neu schneiden und dann 80 Produktionsstellen anfassen — in einer Phase, die laut CLAUDE.md ausdruecklich Haertung und nicht Neubau ist.
3. **Der Waechter ist additiv und wirkt nach vorn.** Kein Produktionscode, kein Retrofit-Risiko, kein Rollback-Plan noetig. Und er ist das Artefakt, das die naechsten 80 ueberfluessig macht — uebertragbar auf die 20 Folgeprojekte, was der Befund selbst als eigentliches Ziel benennt.
4. **Konsolidiert gehoert nur eine Sache, und die ist klein:** die Null-Politik. Das ist eine einzige Owner-Entscheidung ("darf eine Anfrage ohne `req.orgId` durch?"), und ihr Ort ist eine Middleware `requireOrgContext`, die vor dem Handler mit 403 abbricht — nicht das Umschreiben von 80 Vergleichen. Vorbild existiert: `suppliers.js:46` und `workforce.js:58` machen genau das bereits mit `ORG_CONTEXT_REQUIRED` / `NO_ORG_CONTEXT`.
5. **Gate 3b wird dadurch erst pruefbar.** Statt "jede der 80 Stellen ist abgedeckt oder dokumentiert" lautet es: "jede `:id`-Route auf einer org-gebundenen Tabelle steht im Register und ist entweder verhaltensgeprueft oder als bewusste Ausnahme mit Begruendung eingetragen" — durchgesetzt von einem Test, den `api/scripts/run-tests.js` bei jedem Lauf ausfuehrt.

**Reihenfolge:** (a) E-1 bis E-3 als Sicherheits-Tickets sofort an den Owner (Cross-Org-Schreibzugriffe auf Konditionen, Rechnungen und Freigaben, ohne DB-Backstop), (b) Waechter Schicht 1+3 bauen und mit dem Ist-Register gruen schalten, (c) Schicht 2 Route fuer Route scharf stellen — jede neu gruene Zeile ist ein bewiesener Pfad, (d) Null-Politik als eigene Owner-Entscheidung.

### Fallstricke

1. Die fuenf Befunde E-1 bis E-5 sind am Quelltext belegt (Route + Service + Schema), aber NICHT zur Laufzeit nachgestellt. Vor dem Ticket-Eintrag sollte jeder in einem Mock-Pool-Test reproduziert werden — sonst gilt derselbe Vorwurf wie gegen einen Quelltext-Waechter.
2. RLS-Wirkung ist deployment-abhaengig. Der Migrationskopf 126 sagt, dass der lokale Superuser RLS umgeht (Docker-Standard laut .env.example: POSTGRES_USER=tempconnect). Auf einer Managed-DB mit Nicht-Superuser-Rolle greift bei invoices/requisitions/timesheets Deny-by-Default — dann schlagen die genannten Schreibpfade ins Gegenteil um (0 betroffene Zeilen auch fuer Berechtigte, weil pool.query kein SET LOCAL app.current_org_id setzt). Welcher Fall real gilt, habe ich NICHT geprueft — das braucht einen Blick auf die Produktions-Rolle.
3. rate_cards und approval_requests haben keine RLS-Policy — dort gibt es in KEINEM Deployment einen DB-Backstop. E-1 und E-3 sind damit die dringendsten.
4. Die 80 sind nur die Stellen, die die Zeichenkette ORG_BOUNDARY_VIOLATION tragen. Routen, deren Grenze ausschliesslich im Service-SQL steht, tauchen nicht auf — sie sind meist sicher. Ein Waechter, der die Zeichenkette einfordert, meldet dort falsch.
5. Meine Luecken-Suche (Skript ueber Route-Zeilenbereiche) ist eine Heuristik: sie schneidet Handler an der naechsten router.*-Zeile ab und uebersieht Grenzen in umschliessenden Middlewares. Ich habe jeden Treffer einzeln nachgelesen und die Falschmeldungen (organizations PATCH/departments, matching, workers/public) aussortiert — aber die Suche lief nur ueber die 18 Dateien mit vorhandener Zeichenkette. Die uebrigen ~38 Route-Dateien mit :param-Routen (u. a. capacityExchange 18, marketplace 30, workerPortal 18, staffControlCenter 47) sind NICHT geprueft. Dort koennen weitere Luecken derselben Klasse liegen.
6. assertUserOwnership bleibt auch nach dem Waechter ohne Aufrufer. Entweder es gibt einen Anwendungsfall (Legacy-Tabellen ohne org_id) — dann fehlt er im Register — oder die Funktion sollte entfernt werden. Das ist eine Owner-Entscheidung, keine Ableitung.
7. ALLOWED_TABLES hat 22 Eintraege, nicht 23 wie im Auftragstext (M0-B7) angegeben. Kleine Abweichung, aber die Liste ist laut Kommentar in orgBoundary.js:36-43 schon einmal auseinandergedriftet — die Zahl gehoert korrigiert, bevor sie in ein Dokument wandert.
8. Ich habe die Suite NICHT ausgefuehrt (read-only Auftrag, Laufzeit). Vor jedem Commit gilt weiterhin: cd api && node scripts/run-tests.js.

### Belege

| Datei | Zeile | Was |
|---|---|---|
|  | gesamt | Befund 2026-08-11: 80 Fundstellen in 18 Route-Dateien; Owner-Entscheidung Weg a; Welle 3b mit der Leitfrage 'wo weicht eine Kopie ab?' |
|  | grep-Zaehlung | 80 Fundstellen ORG_BOUNDARY_VIOLATION selbst verifiziert; Verteilung exakt wie dokumentiert (workers 13, timesheets 12, organizations 8, complianceDocs 7, assignments 6, requisitions/invoices/documentCenter/contracts je 5, vendorPool 4, suppliers/rateCards je 2, 6 Dateien je 1) |
|  | 44-77, 83-104 | ALLOWED_TABLES hat 22 Eintraege (nicht 23); es fehlen timesheets, invoices, worker_profiles, worker_submissions, document_center — die Tabellen hinter 35 der 80 Stellen. assertOrgOwnership kann nur EINE Spalte vergleichen, nicht die zweiseitige Grenze. |
|  | 142, 180, 230, 247 | Die einzigen 4 Produktionsaufrufe von assertOrgOwnership — jeder als 'if (req.orgId) await ...', wodurch die fail-closed Null-Wache des Helfers (orgBoundary.js:55) an jeder realen Aufrufstelle toter Code ist. assertUserOwnership: 0 Aufrufer. |
|  | 222-240, 242-260 | BEFUND E-1: POST /rate-cards/:id/activate und /archive ohne jede Org-Grenze; Geschwister GET :119 und PATCH :200 haben eine. ensureCompanyRateCardAccess (:13-36) prueft nur Org-Typ. |
|  | 238-247, 252-261 | BEFUND E-1: activateRateCard/archiveRateCard machen 'UPDATE rate_cards ... WHERE id = $1 RETURNING *' ohne org_id. rate_cards hat keine RLS-Policy. |
|  | 291-347 vs. 281-288 | BEFUND E-2: die vier operativen Schreibrouten uebergeben req.orgId nicht; das Geschwister-GET ruft getOperationalInvoice(pool, id, req.orgId) und mappt 403. |
|  | 459-486, 413-430 | BEFUND E-2: transitionInvoice laedt org_id/supplier_org_id in inv[0], vergleicht sie nie, und schreibt 'UPDATE invoices ... WHERE id = $1 RETURNING *'. Gleiches Muster in addCorrectionItem. |
|  | 244-251, 253-260, 262-265 vs. 234-242 | BEFUND E-3: approve/reject/history ohne Org-Grenze; GET /approvals/:id hat eine. |
|  | 25-46, 48-…, 96-107 | BEFUND E-3: approveEntity/rejectEntity 'UPDATE approval_requests ... WHERE id = $1 AND status = pending' ohne org_id; getApprovalHistory filtert nur entity_type/entity_id und gibt Antragsteller-/Freigeber-E-Mails aus. |
|  | 126-134, 162-176 | BEFUND E-4: PATCH /:id und POST /:id/submit ohne assertOrgOwnership, obwohl /transition (:142) und /approve (:180) es haben; submit erreicht dieselbe transitionStatus. |
|  | 163-164, 203-206, 228-230 | BEFUND E-4: updateRequisition begrenzt per 'WHERE id = $1 AND created_by = $2' (Ersteller- statt Org-Grenze); transitionStatus schreibt 'UPDATE requisitions ... WHERE id = $1' ohne org_id. |
|  | 274-293 vs. 238-270 | BEFUND E-5: recent-changes prueft req.params.id (vom Nutzer frei auf die eigene Org gesetzt), waehlt die Daten aber ueber req.query.entity_id; die Nachbarroute /audit-log scopt korrekt ueber queryOrgAuditLog. |
|  | 310-325 vs. 242 | BEFUND E-5: getRecentChanges hat 'WHERE al.entity_type = $1 AND al.entity_id = $2' ohne org_id; queryAuditLog setzt dagegen 'al.org_id = $n'. |
|  | 107-125 | Regel 7 (Audit C-11): benennt selbst die '45 Routen', die 'if (req.orgId && ...)' pruefen und sich bei null abschalten; loest es durch Rueckfall auf die eigene Org — dadurch ist die Fail-open-Variante fuer Nutzer mit Mitgliedschaft entschaerft. |
|  | 67-70 | datei-privater checkOrgBoundary mit expliziter Legacy-Ausnahme 'if (!orgId) return true' — dritte, abweichende Null-Politik; 9 Aufrufstellen. |
|  | 26-28, 171-182 | RLS-Kopf sagt selbst, dass der lokale Superuser tempconnect RLS generell umgeht; audit_log bekommt ENABLE (ohne FORCE) mit Policy 'org_id = current_org_id() OR org_id IS NULL'. rate_cards und approval_requests haben ueberhaupt keine Policy. |
|  | 1-60 | Vorbild fuer den Waechter: Register + Pruefung + SELBSTPROBE (f), mit der Begruendung, dass ein kaputter Pruefer sonst von einem sauberen Bestand nicht zu unterscheiden waere. |
|  | 53-80 | Vorhandener Verhaltenstest: montiert Router ueber Factory mit Mock-Pool und prueft res._status === 403 — aber poolWith(row) beantwortet jede Abfrage gleich, es wird nur das Ergebnis geprueft, nicht welche Abfrage lief. |
|  | 154-164, 180 | findHandlerExact und listRoutes existieren bereits — die Aufzaehlung ueber router.stack (nicht ueber Quelltext) ist damit ohne neuen Code moeglich. |

---

## Belege — H1 (Kundenansicht)

| Datei | Zeile | Was |
|---|---|---|
| `api/services/workforceService.js` | 479-533 | getCompanyLiveWorkforce: Signatur (pool, companyOrgId, filters), SQL mit WHERE wal.org_id = $1, Rueckgabefelder link_id/worker_user_id/.../live_status. Kein assignment_id, kein wor |
| `api/services/workforceService.js` | 492-507 | SELECT-Liste der Kundenansicht — belegt, dass assignment_id fehlt (nur wal.id AS link_id). |
| `api/services/workforceService.js` | 502-506 | live_status kennt genau zwei Werte: 'endet_bald' / 'im_einsatz'. |
| `api/services/workforceService.js` | 590-591 | Agentur-Tafel getWorkerLiveBoard selektiert abw.art AS absence_art und abw.notiz AS absence_notiz — genau die Felder, die nicht hinueber duerfen. |
| `api/services/workforceService.js` | 659-661 | kpis.abwesend_nach_art aggregiert ueber absence_art — Aggregation ueber Art.-9-Daten, ebenfalls tabu fuer den Kunden. |
| `api/services/workforceService.js` | 613-618 | G6-Kommentar: warum link_id mitgegeben wurde ('die Oberflaeche muesste sonst raten') — dieselbe Begruendung gilt fuer assignment_id auf der Kundenseite. |
| `api/routes/companyTimesheets.js` | 77-86 | GET /company/live-workforce mit requireScope('read:workers') + requirePermission('assignment.view'); base = requireAuth + requireFeature('worker_module') + requireCompanyOrg. |
| `api/app.js` | 411, 452-453 | createCompanyTimesheetsRouter im v1-Router, gemountet auf /api/v1 und /api → effektiv GET /api/company/live-workforce. |
| `api/services/rbacService.js` | 87-88 | assignment.edit = owner/admin/program_manager/hiring_manager/dispatcher; assignment.view = diese plus fuenf weitere → Empfaengerkreis der G4b-Meldung ist Teilmenge und darf die Sei |
| `api/services/workerAbsenceService.js` | 483-490 | fuerKunde(): gibt exakt id, von, bis, faellt_aus (zustand==='wirksam' && !aufgehoben_am) — Positivliste, neues Objekt. |
| `api/services/workerAbsenceService.js` | 796 | KUNDE_PERMISSION = 'assignment.edit' — wer die Ausfallmeldung bekommt. |
| `api/services/workerAbsenceService.js` | 874-876 | kundenDeepLink(): '/public/company-timesheets.html?einsatz=' + id + '#live'. |
| `api/services/workerAbsenceService.js` | 896-904 | Absendebedingung ist fuerKunde().faellt_aus — beantragte Meldungen gehen nicht an den Kunden; dieselbe Grenze muss der Live-Join einhalten. |
| `frontend/public/js/pages/companyTimesheets.js` | 375-380 | init(): nur /me, show('main'), ctLoad(). Kein location.search, kein location.hash, kein URLSearchParams — der Deep-Link wird ignoriert. |
| `frontend/public/js/pages/companyTimesheets.js` | 554-558 | liveBadge(): binaeres Ternaer — alles ausser 'endet_bald' faellt in das gruene 'Im Einsatz'. Ein Zustand 'faellt_aus' wuerde falsch gerendert. |
| `frontend/public/js/pages/companyTimesheets.js` | 559-583 | renderLive(): acht Zellen, dazu Knoepfe 'Problem melden' und 'Sperren'. Keine Abwesenheitsangabe. |
| `frontend/public/js/pages/companyTimesheets.js` | 584-588 | updateLiveKPIs() liest nur total, endet_bald, agencies — Platz fuer eine vierte Kachel. |
| `frontend/public/js/pages/companyTimesheets.js` | 515, 534 | _liveTimer wird ausschliesslich als Such-Debounce genutzt; kein setInterval in der Datei → die Kunden-Live-Tafel pollt nicht. |
| `frontend/public/js/pages/companyTimesheets.js` | 119-121, 266-268 | i18n-Woerterbuch inline, DE und EN: cts.live.badge.soon/active/openEnd — ein neuer Zustand braucht beide Bloecke. |
| `frontend/public/company-timesheets.html` | 116-138 | viewLive: drei KPI-Kacheln (lwTotal/lwEnds/lwAgencies), Tabellenkopf mit 8 Spalten, tbody#lwBody. |
| `frontend/public/company-timesheets.html` | 39-40 | Nur zwei Badge-Klassen definiert: ct-badge--live (success) und ct-badge--soon (warning). Eine dritte fehlt. |
| `frontend/public/company-timesheets.html` | 82-85 | Reiter; #tabTimesheets traegt ct-tab--active → Startzustand ist der Stundenzettel-Eingang, nicht die Live-Belegschaft. |
| `frontend/public/js/pages/mitarbeiter.js` | 1516-1522 | Nachbaubares Muster: startLiveBoard() liest '#live-<status>' aus der Adresse und setzt den Reiterfilter vor dem ersten Laden. |
| `frontend/public/js/pages/mitarbeiter.js` | 2015-2020 | leseFokusAusAdresse() + showTab('live') NACH dem /me-Erfolg, mit Begruendung (kein Aufblitzen von Daten fuer Nichtangemeldete). |
| `api/test/companyTimesheets.route.test.js` | 122-139 | Einziger Test auf getCompanyLiveWorkforce: prueft Scope (wal.org_id, Negativ-Assertion gegen supplier_org_id) und Shape. Nichts zu Abwesenheit. |

## Belege — H2 (Mandantengrenzen)

| Datei | Zeile | Was |
|---|---|---|
| `docs/ORG_GRENZE_BEFUND.md` | gesamt | Befund 2026-08-11: 80 Fundstellen in 18 Route-Dateien; Owner-Entscheidung Weg a; Welle 3b mit der Leitfrage 'wo weicht eine Kopie ab?' |
| `api/routes/ (18 Dateien)` | grep-Zaehlung | 80 Fundstellen ORG_BOUNDARY_VIOLATION selbst verifiziert; Verteilung exakt wie dokumentiert (workers 13, timesheets 12, organizations 8, complianceDocs 7, assignments 6, requisitio |
| `api/utils/orgBoundary.js` | 44-77, 83-104 | ALLOWED_TABLES hat 22 Eintraege (nicht 23); es fehlen timesheets, invoices, worker_profiles, worker_submissions, document_center — die Tabellen hinter 35 der 80 Stellen. assertOrgO |
| `api/routes/requisitions.js` | 142, 180, 230, 247 | Die einzigen 4 Produktionsaufrufe von assertOrgOwnership — jeder als 'if (req.orgId) await ...', wodurch die fail-closed Null-Wache des Helfers (orgBoundary.js:55) an jeder realen  |
| `api/routes/rateCards.js` | 222-240, 242-260 | BEFUND E-1: POST /rate-cards/:id/activate und /archive ohne jede Org-Grenze; Geschwister GET :119 und PATCH :200 haben eine. ensureCompanyRateCardAccess (:13-36) prueft nur Org-Typ |
| `api/services/rateCardService.js` | 238-247, 252-261 | BEFUND E-1: activateRateCard/archiveRateCard machen 'UPDATE rate_cards ... WHERE id = $1 RETURNING *' ohne org_id. rate_cards hat keine RLS-Policy. |
| `api/routes/invoices.js` | 291-347 vs. 281-288 | BEFUND E-2: die vier operativen Schreibrouten uebergeben req.orgId nicht; das Geschwister-GET ruft getOperationalInvoice(pool, id, req.orgId) und mappt 403. |
| `api/services/operationalInvoiceService.js` | 459-486, 413-430 | BEFUND E-2: transitionInvoice laedt org_id/supplier_org_id in inv[0], vergleicht sie nie, und schreibt 'UPDATE invoices ... WHERE id = $1 RETURNING *'. Gleiches Muster in addCorrec |
| `api/routes/approvals.js` | 244-251, 253-260, 262-265 vs. 234-242 | BEFUND E-3: approve/reject/history ohne Org-Grenze; GET /approvals/:id hat eine. |
| `api/services/approvalService.js` | 25-46, 48-…, 96-107 | BEFUND E-3: approveEntity/rejectEntity 'UPDATE approval_requests ... WHERE id = $1 AND status = pending' ohne org_id; getApprovalHistory filtert nur entity_type/entity_id und gibt  |
| `api/routes/requisitions.js` | 126-134, 162-176 | BEFUND E-4: PATCH /:id und POST /:id/submit ohne assertOrgOwnership, obwohl /transition (:142) und /approve (:180) es haben; submit erreicht dieselbe transitionStatus. |
| `api/services/requisitionService.js` | 163-164, 203-206, 228-230 | BEFUND E-4: updateRequisition begrenzt per 'WHERE id = $1 AND created_by = $2' (Ersteller- statt Org-Grenze); transitionStatus schreibt 'UPDATE requisitions ... WHERE id = $1' ohne |
| `api/routes/organizations.js` | 274-293 vs. 238-270 | BEFUND E-5: recent-changes prueft req.params.id (vom Nutzer frei auf die eigene Org gesetzt), waehlt die Daten aber ueber req.query.entity_id; die Nachbarroute /audit-log scopt kor |
| `api/services/auditLog.js` | 310-325 vs. 242 | BEFUND E-5: getRecentChanges hat 'WHERE al.entity_type = $1 AND al.entity_id = $2' ohne org_id; queryAuditLog setzt dagegen 'al.org_id = $n'. |
| `api/middleware/orgContext.js` | 107-125 | Regel 7 (Audit C-11): benennt selbst die '45 Routen', die 'if (req.orgId && ...)' pruefen und sich bei null abschalten; loest es durch Rueckfall auf die eigene Org — dadurch ist di |
| `api/routes/timesheets.js` | 67-70 | datei-privater checkOrgBoundary mit expliziter Legacy-Ausnahme 'if (!orgId) return true' — dritte, abweichende Null-Politik; 9 Aufrufstellen. |
| `sql/migrations/126_rls_forward_repair.sql` | 26-28, 171-182 | RLS-Kopf sagt selbst, dass der lokale Superuser tempconnect RLS generell umgeht; audit_log bekommt ENABLE (ohne FORCE) mit Policy 'org_id = current_org_id() OR org_id IS NULL'. rat |
| `api/test/sqlSchemaWaechter.test.js` | 1-60 | Vorbild fuer den Waechter: Register + Pruefung + SELBSTPROBE (f), mit der Begruendung, dass ein kaputter Pruefer sonst von einem sauberen Bestand nicht zu unterscheiden waere. |
| `api/test/security/coreFlowCrossTenant.test.js` | 53-80 | Vorhandener Verhaltenstest: montiert Router ueber Factory mit Mock-Pool und prueft res._status === 403 — aber poolWith(row) beantwortet jede Abfrage gleich, es wird nur das Ergebni |
| `api/test/helpers/security-mocks.js` | 154-164, 180 | findHandlerExact und listRoutes existieren bereits — die Aufzaehlung ueber router.stack (nicht ueber Quelltext) ist damit ohne neuen Code moeglich. |

---

## Arbeitsregeln, die in dieser Sitzung teuer gelernt wurden

**Ein Waechter, der Quelltext liest, schlaegt auf dem Kommentar an, der den
Fehler erklaert.** Dreimal passiert (Wellen G4, G6 und beim NOT_AUTH-Fix).
Loesung: den Test POSITIV formulieren ("der Einstieg ruft X im try auf") statt
als Verbot ("die alte Zeile darf nicht vorkommen") — oder Kommentare vor der
Pruefung entfernen. Die positive Form ist die haltbarere.

**Verhalten pruefen, nicht Schreibweise.** In Welle G6 hat ein Quelltext-Test
einen Mutanten ueberleben lassen: eine Bedingung, die mit `false &&` abgeschaltet
wurde, enthaelt die gesuchte Zeichenkette weiterhin. Wo eine Funktion rein ist,
exportieren und mit echten Werten fuettern (Vorbild:
`scoreWorkersForAssignment`, `validateEnv(logger, env)`).

**CRLF.** Der Punkt matcht in JavaScript kein Wagenruecklauf-Zeichen. Wer Dateien
zeilenweise liest, splittet auf `/\r?\n/` — sonst liefert der Parser still
nichts, und alle Pruefungen darueber sind gruen, ohne je etwas gelesen zu haben.
Immer eine Gegenprobe einbauen, die belegt, dass ueberhaupt etwas ankam.

**Agenten-Empfehlungen gegenpruefen.** Beim Demo-Compose lautete die Empfehlung
"NODE_ENV ist redundant, streichen" — falsch: Die Basis interpoliert den Wert aus
der lokalen .env und haette die oeffentlich getunnelte Demo ohne
Produktionshaertung laufen lassen. Eine Empfehlung ist ein Vorschlag, kein Befund.

**Die Frage, die drei tote Stellen aufgedeckt hat:** nicht "gibt es das?",
sondern **"wer ruft das auf — und wer laedt es?"**. `pushToUser` war
vollstaendig gebaut und hatte null Aufrufer; `toast.js` war vollstaendig gebaut
und wurde von keiner Seite eingebunden; `fuerKunde()` hatte bis G4b keinen
Produktionsaufrufer.
