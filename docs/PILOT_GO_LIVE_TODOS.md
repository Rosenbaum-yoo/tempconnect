# TempConnect - Pilot/Go-Live TODOs
Quelle: fundierte Projektbewertung April 2026, abgeleitet aus realem Ist-Zustand (65 Routes, 102 Services, 156 Tests, 98 Migrationen, 6-Job-CI, 289/290 Audit-Coverage).
Dieses File wird automatisch gepflegt, solange die Regel in `AGENTS.md` ("Pilot-TODO-Pflege") aktiv ist. Erledigte Punkte wandern nach `## Done

### 2026-08-19 — H2: zehn Cross-Org-Lücken geschlossen + Wächter (Welle 3b)

**Status:** erledigt · **Fakt:** Zehn Routen ohne Mandantengrenze, sechs davon
schreibend. Die fünf aus der Recherche (Konditionsrahmen aktivieren/archivieren,
operative Rechnungen issue/paid/void/correction, Freigaben approve/reject +
Historie, Requisitions submit/PATCH, Audit-`recent-changes` mit der falschen
Kennung) und fünf, die der neue Wächter selbst fand: Requisitions-`events` und
-`candidates` (Lesen mit E-Mails), **`PATCH /organizations/:id`** (Schreiben auf
den Organisationsdatensatz einer fremden Firma, inkl. `parent_org_id`),
`POST /organizations/:id/departments` (Abteilung in fremder Org anlegen) und
`POST /requisitions/:id/comment`.
**Aktion:** Grenze in Route **und** Service-SQL; `getRecentChanges` in eine
org-gebundene und eine ausdrücklich benannte plattformweite Fassung getrennt.
**Verify:** `api/test/security/orgGrenzeLuecken.test.js` (24 Fälle, vor der
Reparatur rot), `api/test/orgGrenzenWaechter.test.js` (62 Fälle inkl.
Selbstprobe), volle Suite **8804/0**. Vier Mutationen gegen den echten Bestand
gefahren: Handler-Mutationen macht der Wächter rot, SQL-Mutationen die
Service-Tests.

### 2026-08-20 — E-15/E-16/E-17: drei weitere Cross-Org-Schreibzugriffe geschlossen

**Status:** erledigt · **Fakt:** (E-17, der schwerste) `data_governance.anonymize`
halten owner/admin JEDER Kundenorganisation (rbacService.js:121), und
`anonymizeUser` prueste die Organisation des Ziels nie — ein Org-Inhaber konnte
das Konto eines FREMDEN Nutzers unwiderruflich anonymisieren.
(E-15) `deleteSearchJob` loeschte Treffer, Ereignisse und Meldungen OHNE Bindung
und prueste den Besitzer erst in der vierten Anweisung — Datenverlust bei einem
Dritten, mit 404 quittiert.
(E-16) `addFeedback` behandelte jeden Unbeteiligten als Mentee und schrieb
Bewertung samt Note auf eine fremde Sitzung.
**Aktion:** alle drei an der Wurzel geschlossen (Zugehoerigkeit bzw. Beteiligung
zuerst, Bindung im SQL). E-17 zusaetzlich auf dem /check-Weg, der sonst die
Existenz und die Blocker eines fremden Nutzers verraten haette.
**Verify:** `orgGrenzeLuecken.test.js` Abschnitte E-15/E-16/E-17, je mit
Gegenprobe, dass der eigene Weg weiterhin funktioniert.

### 2026-08-19 — E-13: derselbe Fehler ein zweites Mal, in einer anderen Datei

**Status:** erledigt · **Fakt:** `getStaffingChoiceSet`
(`assignmentStaffingService.js:3903`) rief `refreshStaffingChoiceSetLifecycle`,
das `UPDATE assignment_staffing_choice_sets SET status = ...` schreibt, VOR der
Zugehoerigkeitspruefung. Ein Zugriff mit fremder Auswahl-Kennung hat deren
Status fortgeschrieben und danach 404 geliefert.
**Aktion:** Zugehoerigkeit zuerst, im SQL; dann fortschreiben. Zusaetzlich hat
der Waechter dafuer eine eigene Zusicherung bekommen (`schreibenNachGrenze`),
die die REIHENFOLGE prueft statt nur das Ergebnis — sie findet die naechste
Fundstelle dieser Klasse von selbst.
**Verify:** `orgGrenzeLuecken.test.js` Abschnitt E-13.

### 2026-08-19 — E-12: ein Lesezugriff schrieb ueber die Mandantengrenze

**Status:** erledigt · **Fakt:** `getAssignmentStaffingOverview`
(`assignmentStaffingService.js`) rief `recalcAssignmentStaffing` — ein
`UPDATE assignments ... WHERE id = $1` ohne Org-Bindung — VOR der
Zugehoerigkeitspruefung. `GET /staffing-assignments/:id` auf eine fremde Kennung
hat damit die fremde Zeile geschrieben und danach 404 geliefert.
**Aktion:** Zugehoerigkeit zuerst, im SQL (`AND supplier_org_id = $2`), dann
rechnen. **Verify:** `orgGrenzeLuecken.test.js` Abschnitt E-12 (26/26), inkl.
Gegenprobe, dass die Neuberechnung fuer die eigene Org weiterhin laeuft.

### 2026-08-19 — H2 zweite Welle: die vier größten Flächen eingeordnet

**Status:** erledigt · **Fakt:** `capacityExchange` (18), `marketplace` (30),
`workerPortal` (18) und `staffControlCenter` (47) stehen unter dem Wächter.
**Kein neuer Cross-Org-Schreibzugriff gefunden** — dafür drei
Architekturbefunde: die ersten beiden Dateien sind **nutzer-** statt
org-gebunden (D-M5), das Arbeiterportal und das Staff Control Center haben je
*eine* Eintrittsbedingung statt einer Grenze je Route (neue Wächter-Schicht B2),
und `canAccessAsOwner` funktionierte nicht (P1-17, seit dem 2026-08-20 behoben).
**Verify:** `api/test/orgGrenzenWaechter.test.js` 457/457, volle Suite 9210/0.
Abdeckung **82 von 82** Route-Dateien, 257 verhaltensgeprüft, 123 belegte
Ausnahmen — dazu Schicht B3 für Flächen ganz ohne Platzhalter-Route (OCC).

### 2026-08-19 — Betriebswissen: gemessen gegen die laufende Datenbank

`rate_cards` und `approval_requests` haben **keine RLS-Policy** (`rls=false`,
0 Policies) — für diese Tabellen gibt es in keinem Deployment einen
DB-Backstop. `audit_log` trägt 1782 von 2711 Zeilen ohne `org_id`.`. Neue Blocker, die in Sessions auftauchen, werden als P0/P1/P2 angelegt.
Letzte Aktualisierung: 2026-08-19 — **Welle H2 (Mandantengrenzen) abgeschlossen: zehn Cross-Org-Lücken geschlossen, Wächter gebaut.** Neuer P1-Eintrag: Migration 117 existiert nicht, obwohl 28 Tabellen in `TENANT_ISOLATION_MODEL.md` auf sie verweisen. Vorher: 2026-08-07 — **P8 Deal-Verbindlichkeit (Wellen A-E) abgeschlossen und committet** (`4220693`..`67b0282`). Vier geerbte Defekte dabei gefunden und geschlossen, darunter eine Kennzahl, die das Feed-Ranking steuerte und in Produktion durchgehend NULL war, und ein Bounty, das notorische Kurzfrist-Stornierer mit 3 % Rabatt belohnte. **Neue Betriebs-Pflicht vor Go-Live: Cron `recompute-deal-reliability` einrichten + Migrationen 164/165 einspielen** (siehe Done-Eintrag). Vorher: 2026-07-26 — **P1.0 Schritt (d) erledigt**: `.env.prod.example` kannte `STAFF_SESSION_SECRET` nicht, obwohl die Variable in Produktion ein `fatal()` ausloest — ein Deploy nach dieser Vorlage waere nicht gestartet. Ergaenzt + Waechter `api/test/prodEnvTemplate.test.js`, der Pflichtvariablen aus dem Code gegen die Vorlage prueft. Ebenfalls am 2026-07-26: `docs/AUDIT_BACKLOG.md` vollstaendig abgearbeitet (u. a. ein ausnutzbares Cross-Org-Leck geschlossen). Vorher: 2026-06-13 — **Welle F1 (Code-Schlussarbeiten) abgeschlossen + committet** (`9f37250`/`1044343`/`878b022`/`845b6c9`): Prod-Härtung, Security-Quick-Wins, Hygiene-Sweep, Test-Harness-Folge inkl. eines gefundenen+gefixten requireMfa-SCC-Betriebsblockers; volle Suite 4508/0, Lint 0/0, Builds grün — siehe Abschlussbericht im Worklog. Marktstart-Ziel auf **01.09.2026** aktualisiert (UG-Gründung = kritischer Pfad). Vorher: 2026-06-11 — **Der konsolidierte Vorwaerts-Plan bis zur finalen Abnahme (Wellen F0-F6) liegt in `docs/finalization/FINALISIERUNGSPLAN_ABNAHME.md`** und mappt ALLE offenen Punkte dieses Files (P0.4, P1.0, P1.4, E-01, P2.x) + Gap-Register O-01-O-11 + Audit-Funde 2026-06-11 auf Wellen/Phasen mit Abnahmekriterien. Vorher: 2026-06-05 (Go-Live-Haertung abgeschlossen, „drei wie empfohlen" Owner-approved: P0.6 [052-Demo-Seed-Backdoor] via Env-Flag-Gate `SEED_DEMO_WORLD` [migrate.sh PGOPTIONS-GUC + 052 DO-Guard + Compose-Split base/prod=false, override=true] + Remediation-Migration 125 [Hash-Neutralisierung der 6 Demo-Konten, gegated+idempotent]; P0.7 Tier-2 [Bestands-DB-116-Backstop] via Forward-Repair-Migration 126 [nicht-transaktional, per-Tabelle-to_regclass-guarded, idempotent]; subscriptions-RLS-Exclusion bestaetigt. Verifiziert auf zwei Wegwerf-DBs [beide Flag-Pfade + Nicht-Superuser-Deny-by-Default-Laufzeitbeweis], realer Stack unberuehrt. AKTIVIERUNG: 126 schaltet Deny-by-Default+FORCE RLS beim naechsten migrate-Lauf gegen Bestands-/Managed-DB scharf. Alle Diffs uncommitted = Owner-Commit-Gate. Vorherige offene Owner-Tasks bleiben: P0.4, P1.4-Live-Run, E-01, R2/R9 extern).
## Owner-Aufgaben im Klartext (Stand 2026-07-26)

> **Warum dieser Abschnitt existiert:** die Punkte unten stehen weiter unten schon als P0.4 /
> P1.0 / P1.4 — aber in Kurzschrift, die man nur versteht, wenn man sie geschrieben hat. Hier
> steht in normalen Sätzen, **was gemeint ist, warum es zählt und was konkret zu tun ist.**
> Alles hier kann **nur der Owner** erledigen: Zugangsdaten, Server, GitHub-Konto.

---

### 0. Vorab: warum GitHub-Links „404" zeigen

`Rosenbaum-yoo/tempconnect` ist ein **privates** Repository. GitHub antwortet Besuchern ohne
Berechtigung absichtlich mit **404** statt „kein Zugriff" — es soll nicht einmal verraten, dass
etwas existiert. Ein Actions-Link, der nicht öffnet, ist deshalb **nicht kaputt**: der Browser
ist nur nicht als `Rosenbaum-yoo` angemeldet. Einmal auf github.com mit diesem Konto anmelden,
dann öffnen dieselben Links normal. (Die `gh`-Kommandozeile ist angemeldet — daher kommen die
Angaben in diesem Dokument.)

---

### 0b. 🔴 Redis ist keine Kür — ohne ihn läuft nichts von allein *(2026-08-14)*

**Der Zustand meldet sich nicht.** Ist Redis beim Start nicht erreichbar, schreibt
`api/workers/index.js:34-37` die Zeile `Redis not configured — background workers
disabled` ins Log und fährt fort. Die API antwortet normal, der Healthcheck ist
grün, die Oberfläche wirkt vollständig — nur im Hintergrund passiert nichts mehr:
keine Benachrichtigungs-E-Mail, keine Trefferberechnung, keine Einsatz-Einladung,
und **kein Verfallslauf um 03:00**.

Die letzte Folge ist die teuerste: der Marktplatz zeigt dann Personal an, das es
nicht mehr gibt. Ein Unternehmen ruft wegen einer Kraft an, die längst weg ist.
Das meldet niemand als Ausfall — das kommt als Unzuverlässigkeit an.

- [ ] Vor dem Start: Redis erreichbar (`redis-cli ping` → `PONG`).
- [ ] Nach dem Start: `docker logs tempconnect_api | grep -E "Background workers started|Redis not configured"` zeigt die **erste** Zeile.
- [ ] Überwachung meldet einen Redis-Ausfall. Ohne Alarm bleibt der stille Zustand wochenlang unbemerkt.

Vollständige Checkliste mit Wirkungstabelle: `docs/launch/C_HETZNER-DEPLOY-RUNBOOK.md` §10a.

*Warum das hier steht:* Der Kommentar in `api/workers/index.js:18-23` hält fest,
dass genau dieser Zustand schon einmal bestand — den Capacity-Worker gab es,
eingeplant hat ihn nichts, der Verfall lief nie. Ein Fehler, der sich selbst
verschweigt, gehört auf eine Liste.

---

### 1. 🔴 Die CI — Ursache gefunden, eine Owner-Handlung offen

**Was gemessen wurde:** von **62 Läufen in der gesamten Repo-Historie sind alle 62
`startup_failure`** nach 0 Sekunden. Nicht „seit Juni kaputt" — es gab **nie** einen
erfolgreichen Lauf.

**Aufgeklaert am 2026-07-26 — es waren zwei Ursachen.** Erstens war der Workflow **manuell
deaktiviert** (`gh workflow list --all` → `CI  disabled_manually`); deaktivierte Workflows
verschweigt `gh workflow list` ohne `--all`, deshalb blieb das lange unentdeckt. Das ist
**behoben**, er steht auf `active`. Zweitens zeigte der erste danach wirklich ausgefuehrte
Lauf den eigentlichen Grund: eine **Kontosperre wegen Abrechnung**. Nur die ist noch offen —
und nur vom Owner loesbar (Schritt 2 unten).

**Warum das mehr ist als ein rotes Lämpchen:** `docs/GO_LIVE_FINAL.md` und
`docs/RELEASE_RUNBOOK.md` erklären den CI-Job `release-artifact` zum **kanonischen** Weg zum
Produktions-Artefakt — „CI grün laufen lassen, Artefakt herunterladen". Dieser Weg ist derzeit
nicht ausführbar. Und jede Aussage „CI ist grün" in der Dokumentation beschreibt etwas, das nie
stattgefunden hat.

**Wie schlimm ist es wirklich?** Es ist **kein Code-Problem**: die Testsuite ist auf diesem
Rechner nachweislich grün (7484 Unit-Tests, 186 Integrationstests). Es ist ein
**Verifikations**-Problem: niemand hat den Code je auf einer fremden, sauberen Maschine gebaut
und getestet. Genau das ist der Zweck einer CI — sie fängt „bei mir läuft's". Vor dem ersten
echten Kunden muss das weg; heute brennt nichts, weil nichts produktiv läuft.

**Ursache steht fest — bitte nichts davon erneut prüfen:** es war weder der Code noch die
Workflow-Datei. Zwei Dinge kamen zusammen: ein manuell deaktivierter Workflow (behoben) und
die Kontosperre (offen, Schritt 2). Unterwegs ausgeschlossen wurde:
- Actions sind auf Repo-Ebene aktiviert (`enabled: true, allowed_actions: all`).
- Die Workflow-Datei ist auf **beiden** Branches gültig: YAML lädt, alle Jobs haben `runs-on`
  und `steps`, kein `needs` zeigt ins Leere, kein Step hat `uses` **und** `run`, keine
  doppelten Schlüssel, **kein BOM**, keine Tabs.
- Die API liefert als einzigen Hinweis `path: "BuildFailed"` — ein Platzhalter, den GitHub
  setzt, wenn es die Workflow-Definition gar nicht aufbauen konnte.

**Deine Schritte (5 Minuten):**
1. Auf github.com als `Rosenbaum-yoo` anmelden.
2. **Settings → Billing and plans.** Dort liegt die Ursache. Beim ersten tatsächlich
   ausgeführten Lauf meldete GitHub für **jeden** Job: „account is locked due to a
   billing issue“. Offene Zahlungssache klären — abgelaufene Karte, unbezahlte Rechnung
   oder ein Ausgabenlimit.
3. Hintergrund, damit die alte Fehlersuche nicht wiederholt wird: der Workflow war
   zusätzlich **manuell deaktiviert** (`gh workflow list --all` → `CI  disabled_manually`).
   Das ist **behoben**, er steht auf `active`. Genau deshalb endeten alle 62 früheren Läufe
   mit `startup_failure` nach 0 Sekunden — ohne Annotation, an der etwas ablesbar gewesen
   wäre. Die Kontosperre wurde erst sichtbar, als wieder ein Lauf startete.
4. Danach **Actions → CI → Run workflow** anstoßen (`workflow_dispatch` ist konfiguriert) und
   das Ergebnis hier eintragen.

**Selbst prüfen, jederzeit:** `bash scripts/ci-status.sh` — sagt in 5 Sekunden, ob es je einen
grünen Lauf gab und wie alt der letzte ist. Genau diese Blindstelle blieb sonst einen Monat
unbemerkt.

---

### 2. Secret-Rotation (P0.4) — die Schlüssel wechseln

**Was gemeint ist:** alle Geheimnisse in der aktuellen `.env` sind während der Entwicklung
entstanden und benutzt worden. Sie standen in Logs, in Terminals, teils in Screenshots, und
manche waren von Anfang an Entwicklungs-Platzhalter. Bevor echte Kundendaten im System liegen,
wird **jedes einzelne** durch einen frischen Zufallswert ersetzt.

**Warum das zählt:** wer `SESSION_SECRET` kennt, kann sich **fremde Sitzungen selbst
ausstellen** — ohne Passwort, ohne Spur. Das ist keine Formalie.

**Was zu tun ist** (die Befehle stehen unten bei P0.4, hier die Bedeutung):
- **`SESSION_SECRET` + `STAFF_SESSION_SECRET`** neu erzeugen. Folge: **alle** angemeldeten
  Nutzer werden ausgeloggt und müssen sich neu anmelden. Vor dem Pilotstart also harmlos,
  danach ein angekündigter Wartungsschritt.
- **DB-Passwort** wechseln — zuerst in der Datenbank, **direkt danach** in der `.env`, dann
  neu starten. Die Reihenfolge ist wichtig, sonst kommt die API nicht mehr an die Datenbank.
- **Stripe Secret Key** im Dashboard rollen („Roll key"), **Sentry-Token** neu ausstellen und
  den alten löschen.
- **Zusätzlich (aus früheren Sitzungen):** den **Web3Forms-Key** bei Cloudflare als Secret
  setzen **und den alten rotieren** — er steht in der Git-Historie und lässt sich daraus nicht
  entfernen. Bis zur Rotation bleibt er für Fremde nutzbar.

---

### 3. Staff Control Center betriebsbereit machen (P1.0, Rest)

**Was das ist:** das Staff Control Center ist die **Betreiber-Kanzel** unter `/staff/` — deine
Sicht auf die Plattform, strikt getrennt von Kunden-, Admin- und Support-Welt. Der Code ist
fertig und getestet; es fehlt die Einrichtung auf dem Server.

**Was zu tun ist:**
- **(a) nginx-VHost** für eine eigene Subdomain (z. B. `staff.tempconnect.de`), damit die
  Betreiber-Oberfläche nicht unter derselben Adresse wie die Kundenanwendung liegt.
- **(b) eigenes TLS-Zertifikat** für diese Subdomain.
- **(c) optional IP-Allowlist** auf VHost-Ebene — nur euer Anschluss kommt überhaupt bis zur
  Anmeldemaske.
- **(e) die zwei echten Nutzer-UUIDs** (Betreiber-Team) in `STAFF_USER_IDS`. Das ist ein
  einmaliger Startschalter: beim ersten Login werden diese Konten als Staff freigeschaltet,
  danach verwaltet das Center seine Mitglieder selbst. **Leer bedeutet: niemand kommt hinein.**
- **(f) optional `HETZNER_CLOUD_TOKEN`** (Lesezugriff genügt). Ohne Token zeigt die
  Infrastruktur-Ansicht ehrlich gekennzeichnete Beispieldaten statt echter Server.

**Schon erledigt (2026-07-26):** alle drei Variablen stehen samt Erklärung in
`.env.prod.example`. Dabei fiel auf, dass `STAFF_SESSION_SECRET` dort **fehlte** — und diese
Variable bricht den Produktionsstart hart ab. Ein Deploy nach der alten Vorlage wäre nicht
hochgekommen. Ein Test wacht jetzt darüber (`api/test/prodEnvTemplate.test.js`).

---

### 4. Restore-Probe (P1.4) — einmal wirklich zurückspielen

**Was gemeint ist:** die Backup-Skripte existieren, sind getestet und laufen. Aber **noch
niemand hat auf dem echten Server ein Backup tatsächlich zurückgespielt.** Genau das ist die
Aufgabe — nicht Code schreiben, sondern es einmal durchspielen.

**Warum das zählt:** ein Backup, das nie zurückgespielt wurde, ist eine **Annahme**, keine
Absicherung. Der Ernstfall ist der schlechteste Zeitpunkt, um herauszufinden, dass die Datei
unvollständig ist, ein Passwort fehlt oder der Vorgang vier Stunden dauert.

**Die Übung:**
1. Backup erzeugen (`scripts/backup.sh`) und prüfen (`scripts/backup-verify.sh`).
2. In eine **Wegwerf-Datenbank** zurückspielen (`scripts/restore-test.sh`) — nicht in die echte.
3. Stichprobe: sind Organisationen, Nutzer und Stundenzettel wirklich da?
4. **Die Uhrzeit mitschreiben.** Wie lange hat es gedauert, wie alt war der Datenstand? Das
   sind genau die beiden Zahlen (RPO/RTO), die `docs/GO_LIVE_FINAL.md` verlangt — und
   dieselben, die man im Ernstfall dem Kunden nennen muss.
5. Ergebnis in `docs/BACKUP_DISASTER_RECOVERY.md` eintragen, mit Datum.

---

## Status-Legende
- **P0** - harter Blocker, verhindert gruene CI oder stabile Produktion. Muss vor Go-Live weg.
- **P1** - soll vor erstem Pilotkunden live sein (Vertrag, Sicherheit, Demo-Glaubwuerdigkeit).
- **P2** - Haertung waehrend der ersten 2-4 Pilotwochen.
- **A / B / C** - Verbesserungsvorschlaege: A = kurzfristig hoher Leverage, B = mittelfristig Marktwert-Multiplikator, C = Enterprise-Vertriebshebel.
## P0 - Go-Live-Blocker (Summe <1 Stunde Arbeit)
### P0.1 - Lint-Errors in `api/test/enterpriseFormReuse.test.js`
- Status: ERLEDIGT (2026-05-24)
- Ergebnis: `npm run lint` exit 0, 0 Errors, 0 Warnings. Bereits behoben gewesen.
### P0.2 - Audit-Gate gruen ziehen
- Status: ERLEDIGT (2026-05-24)
- Ergebnis: `audit-coverage-check.js` exit 0, 329/329 Endpunkte mit Audit-Coverage.
- Was gemacht: (a) `writeStaffAudit` + `insertSupportAudit` in AUDIT_PATTERNS ergaenzt (SCC/Support-Routen hatten Audit via eigene Funktionen, Checker war blind), (b) `/analytics/track-public` + `/me/active-location` in ALLOWLIST_ROUTES, (c) `POST /auth/login` in SCC tatsaechlich fehlenden Audit-Marker ergaenzt (fire-and-forget nach res.json).
### P0.3 - Prometheus-Platzhalter-Secret
- Status: ERLEDIGT (2026-05-24)
- Ergebnis: Secret wird jetzt aus `PROMETHEUS_METRICS_SECRET` Umgebungsvariable injiziert.
- Was gemacht: (a) `monitoring/prometheus.yml` Placeholder auf `PROMETHEUS_METRICS_SECRET_PLACEHOLDER` umgestellt, (b) `monitoring/start-prometheus.sh` erstellt (sed-Substitution + exec prometheus), (c) `docker-compose.monitoring.yml` entrypoint auf start-prometheus.sh umgestellt + env-var eingebunden, (d) `PROMETHEUS_METRICS_SECRET=` in `.env.example` ergaenzt.
- Noch offen (Ops): `PROMETHEUS_METRICS_SECRET` in Prod-.env auf echten ADMIN_SECRET setzen.
### P0.4 - Secret-Rotation vor Go-Live
- Status: OFFEN — muss VOR erstem Pilotkunden erledigt sein
- Hintergrund: .gitignore OK, Secrets nie committed, kein akuter Leak. Rotation ist Best-Practice vor Prod-Betrieb mit echten Kundendaten.
- Aufwand: 20-30 Min.

#### Checkliste (in dieser Reihenfolge abarbeiten):

**Block A — ohne Datenbankeingriff (5 Min.):**
- [ ] Neuen SESSION_SECRET generieren: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- [ ] Neuen STAFF_SESSION_SECRET generieren: gleicher Befehl, anderer Wert
- [ ] Beide Werte in `.env` eintragen
- [ ] `docker compose restart api` — alle aktiven Sessions werden ungueltig (alle muessen sich neu einloggen)
- [ ] Verify: `curl http://localhost:3000/api/health` → 200 OK

**Block B — mit Datenbankeingriff, Wartungsfenster einplanen (15 Min.):**
- [ ] Neues DB-Passwort generieren (min. 32 Zeichen): `node -e "console.log(require('crypto').randomBytes(24).toString('base64'))"`
- [ ] Passwort in laufender DB aendern: `docker exec -it tempconnect_db psql -U POSTGRES_USER` → `ALTER USER POSTGRES_USER WITH PASSWORD 'NEUES_PW';`
- [ ] Sofort danach `.env` aktualisieren: `DB_PASSWORD=NEUES_PW` und `POSTGRES_PASSWORD=NEUES_PW`
- [ ] Sofort danach `docker compose down && docker compose up -d`
- [ ] Verify: `curl http://localhost:3000/api/health` → 200 OK, keine DB-Connection-Errors in Logs

**Block C — externe API-Keys (nur wenn aelter als 6 Monate):**
- [ ] Stripe: Dashboard → Developers → API Keys → "Roll key" → neuen Wert in `.env` STRIPE_SECRET_KEY
- [ ] Sentry: Settings → Auth Tokens → neuen Token, alten loeschen → in `.env` SENTRY_DSN

- Verify gesamt: App laeuft, Health-Check 200, kein Fehler in `docker compose logs api | tail -50`
### P0.5 - `staff_vanilla_backup_20260521/` oeffentlich erreichbar via Nginx
- Status: ERLEDIGT (2026-05-24)
- Ergebnis: Verzeichnis `frontend/public/staff_vanilla_backup_20260521/` geloescht. Inhalt war: index.html, login.html, css/, js/.
- Verify: Verzeichnis existiert nicht mehr im Dateisystem.
### P0.6 - Demo-Seed-Welt (052) wird auf JEDEM Fresh-Install (auch Prod) angelegt — ENTERPRISE-Login-Backdoor
- Status: ERLEDIGT + COMMITTED + GEPUSHT (2026-06-05, Commit `bc24e58` auf origin/release/enterprise-premium-market-ready). Owner-approved Variante „drei wie empfohlen": Env-Flag-Gate + Remediation-Migration 125 + subscriptions-RLS-Exclusion bestaetigt.
- Befund (2026-06-04, beim Fresh-Install-Verify entdeckt): `052_demo_seed_world.sql` laeuft UNGATED in der Standard-Migrationschain (kein Env-Flag, kein Dev-Gate wie `dev-data.sql`). Auf einer prod-aehnlichen DB (nur `init.sql`, KEINE Dev-Seeds) existieren danach EXAKT 6 User — und alle 6 sind Demo-Konten: demo-buyer@/demo-admin@ (company, ENTERPRISE), demo-agency@ (agency, ENTERPRISE), demo-buyer2@ (PLUS), demo-agency2@ (PRO), demo-agency3@ (BASIS); alle `is_verified=TRUE`, mit Org-Memberships + voller Demo-Datenwelt. **Gemeinsames Passwort `DemoPass2026!` — der bcrypt-Hash steht im Klartext im Repo (052 Z.31).** Ein realer Prod-Install bringt also 6 ENTERPRISE-faehige Konten mit oeffentlich bekanntem Passwort mit = Login-Backdoor mit Mandanten-Vollzugriff.
- Was gemacht (Owner-approved „drei wie empfohlen", 2026-06-05): (a) **Env-Flag-Gate** — `migrate.sh` normalisiert `SEED_DEMO_WORLD` (1/true/yes/on→true, sonst false) und exportiert `PGOPTIONS="-c app.seed_demo_world=<wert>"`, sodass JEDE psql-Session den GUC traegt; `052`-Body in einen `DO $seed_demo_world$`-Guard gewickelt (`IF current_setting('app.seed_demo_world',true) IS DISTINCT FROM 'true' THEN RAISE NOTICE … RETURN` → prod-sicherer No-Op), BEGIN/COMMIT durch den DO-Block ersetzt (Erfolgs-Notice nach innen gefaltet). (b) **Compose-Split** (Defense-in-Depth, fuegt sich in den `dev-data.sql`-Split ein): `docker-compose.yml` migrate `SEED_DEMO_WORLD: ${SEED_DEMO_WORLD:-false}` (Basis-Default AUS), `docker-compose.prod.yml` hart `"false"` (override-t etwaigen .env-Streuwert), `docker-compose.override.yml` migrate `"true"` (Dev/Sales AN). (c) **Remediation-Migration `125_remediate_demo_seed_backdoor.sql`** fuer Bestands-DBs, die das ungegatete 052 bereits liefen: setzt `password_hash` der 6 bekannten Demo-Konten auf einen gueltig FORMATIERTEN, aber unknackbaren bcryptjs-Hash (Passwort-Login unmoeglich, kein 500er-Risiko) — NUR wenn Flag aus UND der Hash noch der oeffentlich bekannte Demo-Hash ist (praezise + idempotent; bereits geaenderte/gesperrte Konten unberuehrt). `is_active=false` verworfen, weil die `users`-Tabelle (init.sql) KEINE `is_active`-Spalte hat — Hash-Neutralisierung ist der schema-treue, nicht-destruktive Weg (Demo-Welt jederzeit via `SEED_DEMO_WORLD=true` re-seedbar).
- Aufwand: 0,5 Tag (Gate + Remediation-Migration + Fresh-Install-Verifikation beider Pfade).
- Verify (2026-06-05, zwei Wegwerf-DBs, danach entfernt — realer Stack unberuehrt): **OHNE Flag** → 052 No-Op, 0 Demo-Konten; 116-Backstop aktiv; FORCE RLS req/ts/inv = t/t/t; 125 neutralisiert (bzw. No-Op wenn keine vulnerablen Konten). **`SEED_DEMO_WORLD=true`** → 6 Demo-Konten wie bisher; 125 absichtlich uebersprungen. GUC-Propagation auf `postgres:16-alpine` empirisch bestaetigt (true / unset→NULL). **Laufzeit-Beweis Deny-by-Default** mit echtem Nicht-Superuser-Rollen-Probe (`rls_probe`, kein BYPASSRLS): [B] ohne org-Kontext → 0 Zeilen, [D] falsche org → 0, [C] korrekte org → 3, [E] Staff-Bypass (`app.rls_bypass=staff`) → 3 = exakt die fuer zahlende Kunden geforderte Mandanten-Isolation. `test-fresh-install.sh` deckt beide Pfade ab.
### P0.7 - Migrations-Chain Silent-Failure + 116 Deny-by-Default-RLS hat auf KEINER DB je gegriffen
- Status: ERLEDIGT + COMMITTED + GEPUSHT (2026-06-04, Tier-2 nachgezogen 2026-06-05; Commit `bc24e58`). Bestands-DB-Forward-Repair (Tier-2) via Migration `126`. AKTIVIERUNG: 126 schaltet Deny-by-Default + FORCE RLS beim naechsten migrate-Lauf gegen Bestands-/Managed-DBs scharf.
- Befund (Root-Cause): Altes `migrate.sh` lief `psql -f` OHNE `ON_ERROR_STOP` → Exit 0 auch bei SQL-Fehler → fehlgeschlagene Migrationen wurden faelschlich als „applied" verbucht. Das maskierte MEHRERE defekte Migrationen, die auf nie existente / an ihrer Stelle noch nicht existente Schema-Objekte verwiesen. Besonders folgenschwer: `116_rls_deny_by_default.sql` ist transaktional (BEGIN…COMMIT) — der erste maskierte Defekt darin riss die GESAMTE Mandanten-Isolation in den Rollback. **Konsequenz: der Deny-by-Default-RLS-Backstop (Staff-Bypass + org-Policies, IS-NULL-Wildcards entfernt, FORCE RLS) war auf KEINER Datenbank je aktiv.**
- Was gemacht: (a) `migrate.sh` gehaertet: `psql -v ON_ERROR_STOP=1 -f` + harter `exit 1` bei Migrationsfehler (kein stilles Weiterlaufen mehr). (b) Chain-Repair (jeder In-Place-Edit JUSTIFIED — eine Forward-Migration kann eine die Chain mittendrin abbrechende Migration nicht reparieren; die Edits aendern auf bereits-korrekten DBs nichts am Ergebnis, verhindern nur Crash-on-missing-object und laufen auf applied DBs nie erneut): `031` cd_same_org auf reines org_id (compliance_documents hat keine supplier_org_id) + vendor_pool_entries-Guard; `032` deals-/vendor_pool_entries-Indizes + cap_fts_idx hinter to_regclass/column-Guard; `039` `is_demo`-Spalte von Demo-Seeds entkoppelt (Spalte laeuft immer, Seeds hinter Early-RETURN-Guard); `047` Webhook-DDL hinter org_integrations-Guard; `116` co_same_org auf org_id (commercial_offers ist ein-org-besitzt, kein buyer/seller_org_id), subscriptions bewusst aus dem org-RLS-Set (user-skaliert, kein org_id), vendor_pool_entries-Guard; `124` idempotenter cron-index-repair. (c) `test-fresh-install.sh` gehaertet: toter `check_table "deals"` → `commercial_offers`; + neue Assertions, die nach Fresh-Install pruefen, dass der 116-Backstop wirklich aktiv ist (req_staff_bypass vorhanden, req_no_ctx weg, FORCE RLS auf req/ts/inv).
- Verify (2026-06-04, prod-aehnliche Wegwerf-DB, init.sql only): Chain 127 Migrationen, 0 Fehler; 116-Policies vorhanden; IS-NULL-Wildcards weg; FORCE RLS aktiv; Phantom-Objekte (deals/vendor_pool_entries/webhook_deliveries/org_integrations/capacity_posts.description) korrekt absent. `sh -n sql/test-fresh-install.sh` OK.
- Tier-2 erledigt (2026-06-05) via `126_rls_forward_repair.sql`: NICHT-transaktional, EIN per-`to_regclass` abgesicherter `DO`-Block pro Tabelle (requisitions/timesheets/invoices/org_memberships/compliance_documents/subscription_requests/commercial_offers/audit_log; vendor_pool_entries als out-of-scope-Guard) — CREATE OR REPLACE der Helfer `current_org_id()`/`is_staff_context()`, dann je Tabelle ENABLE RLS + DROP der IS-NULL-Wildcards + DROP/CREATE same_org & staff_bypass (USING-Klauseln 1:1 aus 031/116), FORCE RLS nur auf req/ts/inv. Idempotent (DROP IF EXISTS + identisches CREATE), resilient (ein fehlendes Objekt ueberspringt nur SEINEN Block, reisst nie den Backstop mit), auf Bestands-DBs erstmals wirksam, auf frischen DBs folgenloser No-Op. `subscriptions`-RLS-Exclusion bestaetigt (user-skaliert via user_id, kein org_id; eine Membership-Bruecke wuerde persoenliche Billing-Daten cross-org leaken — Schutz bleibt App-Layer). **AKTIVIERUNGS-HINWEIS:** 126 schaltet Deny-by-Default + FORCE RLS beim NAECHSTEN migrate-Lauf gegen Bestands-/Managed-DBs scharf. Lokal ist `tempconnect` Superuser → RLS-inert (kein Breakage); auf Managed-DB (Nicht-Superuser-App-User) wird der Backstop real wirksam = gewollter Mandanten-Schutz.
## P1 - Vor Pilotkunde (Summe 2-3 Personentage)

### P1-19 — `GET /matching/worker/:id` liest eine Tabelle, die es nicht gibt

**Status:** offen (Produktfrage) · **Fakt:** `matchWorkerToAssignments` liest
`FROM workers` (`matchingEngine.js:409`). **Keine Migration hat diese Tabelle je
angelegt** — gegen die laufende Datenbank gemessen antwortet Postgres mit
`42P01`. Der Weg endet seit jeher in 500. Kein Frontend, kein E2E-Lauf und keine
Dokumentationsseite ruft ihn auf.
**Was bereits erledigt ist:** die Org-Bindung steht im SQL
(`AND supplier_org_id = $2`, sobald ein Betrachter bekannt ist). Ohne sie wäre
die Abfrage an dem Tag, an dem jemand eine `workers`-Tabelle anlegt, sofort ein
ungebundener org-übergreifender Lesezugriff — ein schlafendes Leck. Das ist
unabhängig von der Produktfrage und deshalb nicht vertagt worden.
**Aktion:** Owner entscheidet zwischen (a) Route und Engine-Funktion entfernen —
sauber, weil nichts sie aufruft — oder (b) auf `worker_profiles` bauen. Bei (b)
ist zu beachten: `worker_profiles` hat weder `role` noch Koordinaten; die
Bewertung der Engine (Rollen- und Geo-Treffer) liefe ins Leere und erzeugte
systematisch falsche Treffer. (b) ist also ein Feature, kein Umbenennen.
**Aufwand:** (a) 30 Minuten · (b) 1–2 Tage ·
**Verify:** `orgGrenzenWaechter` + `matchingEngine.coverage.test.js`.

### P1-20 — Statuswechsel einer Ausschreibung ohne Berechtigungsprüfung

**Status:** offen (Produkt-/Berechtigungsfrage) · **Fakt:**
`POST /requisitions/:id/transition` (`routes/requisitions.js:151`) trägt
`requireAuth` + `requireScope("write:requisitions")` + Org-Grenze, aber **kein**
`requirePermission`. Die schwächere Aktion — ein Feld ändern — verlangt
`requisition.edit` (`:127`); die folgenschwerere — den Status auf `CANCELLED`
setzen — verlangt nichts.
**Warum nicht mitrepariert:** bei D-M4 aufgefallen, aber eine Berechtigung
nachträglich zu FORDERN verengt Zugriff und kann laufende Abläufe brechen. Das
ist eine eigene Entscheidung, kein Nebenbei-Fix.
**Aktion:** Owner entscheidet, welche Berechtigung der Statuswechsel braucht
(`requisition.edit`? eine eigene `requisition.transition`?) und ob einzelne
Übergänge — etwa `CANCELLED` — mehr verlangen als die übrigen.
**Aufwand:** Entscheidung 15 Minuten, Umsetzung 1 Stunde ·
**Verify:** `rbac-hardening.test.js` um die Route erweitern.

### M0-B9 — Ein roter Integrationstest aus Welle G4b

**Status:** offen · **Fakt:** `test/integration/g4bKundenMeldung.flow.test.js`
→ „die erlaubten severity-Werte stimmen mit der Konstante überein" schlägt fehl
(`expected: true, actual: false`). `ERLAUBTE_SEVERITY` in
`services/notificationMatrix.js` und die Datenbank sind auseinandergelaufen.
Einziger roter Test der Integrationssuite (**285 von 286 grün**).
**Nicht aus Welle H2** — nachgewiesen: keiner der H2-Commits berührt
`workerAbsenceService`, `notificationMatrix` oder diesen Test.
**Aktion:** Konstante und Datenbank abgleichen — und prüfen, welche Seite recht
hat, bevor eine an die andere angepasst wird.
**Aufwand:** 1 Stunde ·
**Verify:** `node scripts/run-tests.js --suite=integration` (braucht Datenbank).

### ~~P1-17 — `canAccessAsOwner` hat nie funktioniert~~ ✅ ERLEDIGT (2026-08-20)

**Entscheidung des Owners: reparieren, also weiten.** Umgesetzt in
`utils/ownerCheck.js`. Die Kollegin mit **aktiver** Mitgliedschaft in **derselben**
Organisation darf jetzt handeln — die Weitung endet aber an der Arbeiterrolle:
`org_memberships` führt auch 33 Arbeiter (`role_key = 'worker'`), und
„gleiche Organisation genügt" hätte ihnen die Suchaufträge, Angebote und
Dealakten ihrer Agentur geöffnet.

Gegen das echte Schema gemessen, alte gegen neue Fassung: **genau die zwei
Gewährungen ändern sich, keine einzige Verweigerung.** Der `catch` schließt
weiterhin zu, protokolliert den Fehler aber — sein Schweigen war der Grund, warum
der Befund sechs Jahre überlebte.

**Nebenbefund mit Folgen für andere Reparaturen:** der SQL-Schema-Wächter hatte
Fehler 1 gefunden (Ausnahmeliste), aber die Reparatur schob den Code aus seinem
Sichtfeld — er prüft Spalten nur bei **einrelationalen** Anweisungen, die neue
Fassung verbindet drei. Abgedeckt durch
`test/integration/ownerCheck.flow.test.js`: ein Lauf gegen die echte Datenbank
mit erfundenen Kennungen, bei dem Postgres die volle Abfrage parst und plant.
Gemessen: die Rückmutation auf `status` macht ihn rot.

**Weiterhin offen sind die Geschwisterfragen D-M4** (Requisitions, `created_by`)
**und D-M5** (capacityExchange/marketplace, nutzergebunden). Sie stellen dieselbe
Frage an anderen Stellen; die hier getroffene Antwort ist die naheliegende
Vorlage, wurde aber bewusst nicht ungefragt übertragen.

### P1-16 — Migration 117 existiert nicht (RLS für 28 Tabellen)

**Status:** offen · **Fakt:** `docs/security/TENANT_ISOLATION_MODEL.md` führt 28
Tabellen unter „RLS noch nicht aktiv" und nennt als nächsten Schritt jeweils
„Migration 117". Diese Datei wurde nie geschrieben — `sql/migrations/` springt
von `116_rls_deny_by_default.sql` auf `118_staff_identity_hardening.sql`. Am
2026-08-19 gegen die laufende Datenbank bestätigt: `rate_cards` und
`approval_requests` stehen auf `relrowsecurity = false` mit 0 Policies.
**Aktion:** Owner entscheidet: Migration 117 nachziehen **oder** die Doku auf
den tatsächlichen Stand bringen und die Anwendungsschicht ausdrücklich als
alleinige Grenze führen. Solange sie das ist, trägt sie
`api/test/orgGrenzenWaechter.test.js`.
**Aufwand:** Entscheidung 15 Minuten, Migration 0,5–1 Tag ·
**Verify:** `SELECT relname, relrowsecurity FROM pg_class WHERE relname IN (...)`
gegen die Ziel-DB; `docs/security/TENANT_ISOLATION_MODEL.md` stimmt mit dem
Messwert überein.
### P1.0 - Staff Control Center produktiv schalten
- Status: **Schritt (d) ERLEDIGT (2026-07-26) — dabei einen Startblocker gefunden.** Rest bleibt Ops/Owner.
- Fakt: SCC-Stack ist live im Code (Migrationen 095+096, Router `/staff/api`, Frontend `/public/staff/`, Tests gruen). Ops-Schritte fehlen: Nginx-VHost `staff.tempconnect.de`, ENV `STAFF_USER_IDS` (2 UUIDs: Betreiber-Team), `STAFF_SESSION_SECRET`, optional `HETZNER_CLOUD_TOKEN`.
- Aktion: (a) Nginx-VHost fuer Staff-Subdomain anlegen, (b) dediziertes TLS-Zertifikat, (c) optional IP-Allowlist auf VHost-Ebene, ~~(d) ENV in `.env.example` dokumentieren + in Prod-Compose injizieren~~, (e) Initial-Staff-UUIDs (Betreiber-Team) in `STAFF_USER_IDS`, (f) `HETZNER_CLOUD_TOKEN` fuer Live-Infra-GUI (sonst bleibt SCC im Stub-Mode).

**(d) erledigt — und der Punkt war groesser als beschrieben.**
Nachgeprueft statt angenommen: „in Prod-Compose injizieren" war bereits erfuellt, der
`api`-Dienst laedt `env_file: .env`, alle Variablen erreichen den Container ohnehin. Und
`.env.example` dokumentierte alle drei Werte laengst.

**Offen war die Produktionsvorlage — und dort mit Folgen:** `.env.prod.example` (die Datei,
die laut Kopf „auf dem Server nach `.env.prod` kopiert" wird) kannte `STAFF_SESSION_SECRET`
nicht. Diese Variable ist in Produktion kein Komfort, sondern ein **`fatal()`** in
`runProductionValidation()` — der Rueckfall auf `SESSION_SECRET + ':staff'` ist dort
ausdruecklich verboten. Wer die Produktion nach der Vorlage aufgesetzt haette, waere mit
einer scheinbar vollstaendigen `.env.prod` dagestanden und **die API waere nicht
hochgekommen**. Aufgefallen erst beim Deploy — im ungeeignetsten Moment.

Ergaenzt wurde ein eigener SCC-Abschnitt in `.env.prod.example` mit allen drei Werten und
je einer Zeile, die sagt, was passiert, wenn man sie weglaesst (kein Zugang / Stub-Modus /
Start bricht ab).

**Damit es nicht wiederkommt:** `api/test/prodEnvTemplate.test.js` liest die Pflichtvariablen
**aus dem Code** (welche Bedingungen fuehren zu `fatal()`?) und vergleicht sie mit der
Vorlage. Wer morgen eine neue Pflichtvariable einfuehrt, wird hier daran erinnert, sie zu
dokumentieren. Der Test prueft ausserdem, dass in der Vorlage keine echten Werte stehen
(sie liegt im Repo **und** im Release-Artefakt) und dass Staff- und Kundensitzung nicht
denselben Platzhalter teilen. Gegenprobe in beide Richtungen bestanden.
- Aufwand: 0,5-1 Tag Ops.
- Verify: Login nur fuer Allowlist-User, Abo-Kunden/Platform-Admins/Org-Owner bekommen 401/403, Admin-Panel + Organization zeigen keinen Link ins SCC (und umgekehrt).
### P1.1 - SSO Enterprise-Pfad (per-Kunde aktivierbar, 300-Kunden-tauglich)
- Status: CODE-SEITIG ABGESCHLOSSEN (ehrlicher Coming-Soon-Soft-Lock). Produktive SAML-Aktivierung = pro-Kunde-Ops-Schritt (Owner + IdP-Test).
- Architektur-Entscheidung (2026-06-01, fuer max. 300 Kunden, zukunftssicher): SSO ist **pro Organisation** konfigurierbar (`org_sso_config`), nicht global. Jeder Kunde aktiviert SSO einzeln, sobald sein IdP angebunden ist — kein Big-Bang, skaliert auf beliebig viele Mandanten.
- Ist-Zustand (gate-konform, kein taeuschender Stub):
  - `ssoService.getSSOMode()` liefert `"stub"`, solange `@node-saml/node-saml` nicht installiert ist; flippt automatisch auf `"saml"`, sobald das Paket vorhanden ist (dynamischer Import).
  - `resolveSsoCardAvailability(...)` zeigt im Stub-Modus den Zustand `SSO_STUB_MODE` ("soft-locked bis produktive SAML-Laufzeit aktiv") — die Karte ist **nicht** als aktiv/buchbar sichtbar.
  - `sso_config.html` zeigt ehrlich Badge "SAML: Stub-Modus" + Locked-State; kein Kunde kann SSO scheinbar aktivieren und ins Leere laufen.
  - Break-Glass (F-02): `auth.js` erzwingt SSO-Enforce nur, wenn `getSSOMode() === "saml"` — Passwort-Login bleibt als Recovery erhalten, niemand sperrt sich aus.
  - Plan-Gate: SSO-Karte ist `PLAN_REQUIRED` unterhalb PRO/INDIVIDUELL (enterprise_only).
- Runbook — SSO fuer einen Kunden produktiv schalten (Owner-Schritte):
  1. `cd api && npm install @node-saml/node-saml` → in `api/package.json` aufnehmen, Container neu bauen. Danach `getSSOMode() === "saml"`.
  2. IdP-Testlauf (Okta-Dev ODER Azure AD Preview): SAML-App anlegen, ACS-URL + Entity-ID aus `sso_config.html` uebernehmen.
  3. Kunden-Org in `org_sso_config` konfigurieren (Metadata-XML / Cert / SSO-URL) — pro Org isoliert.
  4. Test-Login ueber echten IdP gegen die Kunden-Org; danach Enforce optional aktivieren (Passwort-Break-Glass bleibt aktiv).
  5. `sso_config.html` verifizieren: Karte zeigt `active` statt `SSO_STUB_MODE`.
- Aufwand: 0,5 Tag pro Erstanbindung (danach pro Kunde ~1h).
- Verify: `getSSOMode()` liefert `"saml"`; Login ueber echten IdP klappt; Stub-Org bleibt unveraendert (Isolation); Break-Glass-Passwort-Login funktioniert weiterhin.
### P1.2 - E2E-Smoketests um Pilot-Core erweitern
- Status: CODE-SEITIG ERLEDIGT (2026-06-01) — Specs vorhanden; CI-Verdrahtung = E-01 (Owner).
- Fakt: Die in P1.6 erstellten 4 Kernflow-Specs decken exakt die 4 geforderten Flows ab (26 Tests):
  - (a) Login + Marktplatz-Feed → `kernflow-hub-navigation.spec.js` (8 Tests: Hub Company/Agency, `/api/me`, Org-Members, Strategic Collaboration, Activity-Feed, Notifications, `capacity_exchange_feed.html`)
  - (b) Bedarf anlegen + Deal-Accept + Aktivierung → `kernflow-requisition.spec.js` (5 Tests: POST/GET/Detail/Transition DRAFT→OPEN) + `kernflow-deal-activation.spec.js` (6 Tests: OPEN-Requisition, received-offers, contracts, State-Machine-Transitions, Hub)
  - (c) Worker-Assignment + Stundenzettel → `kernflow-assignment-timesheet.spec.js` (7 Tests: Assignment anlegen/Liste/Transition planned→active, ungültige Transition, Timesheet-Plan-Gate, Endpunkt definiert, Einsätze-Seite)
  - (d) Admin-/Strategic-Collaboration → in `kernflow-hub-navigation.spec.js` abgedeckt
- **E-01 nachgeprueft (2026-07-26): die Verdrahtung IST da.** `.github/workflows/ci.yml` hat den Job `e2e-core`, der `npm run test:e2e:core` faehrt — und dieses Skript zielt ausdruecklich auf `kernflow occ-access-guards einsatzportal executive-dashboard`. Postgres laeuft als Service-Container, Playwright wird installiert. Der Job ist auf `workflow_dispatch` + woechentlichen Zeitplan (montags 02:17) begrenzt, nicht auf jeden Push — bei E2E eine vertretbare Wahl.
- **Aber: er kann derzeit gar nicht laufen.** Seit 2026-06-29 erzeugt die CI ueberhaupt keine Laeufe mehr (siehe **C-12** in `docs/AUDIT_BACKLOG.md`). E-01 haengt damit nicht mehr an der Verdrahtung, sondern an C-12.
- Verify: `npx playwright test e2e/tests/kernflow-*.spec.js` lokal; CI-Gate = E-01.
### P1.3 - `FEATURE_GATE_BYPASS`-Default umkehren
- Status: ERLEDIGT (2026-05-24)
- Ergebnis: `.env.example` setzt jetzt `FEATURE_GATE_BYPASS=false` als Default mit erklaerenden Kommentaren. Lokal per eigener `.env` ueberschreiben.
### P1.4 - Backup/Restore Dry-Run dokumentieren
- Status: TEILWEISE (2026-06-03) — Skript-Fidelity-Bug behoben, Live-Lauf bleibt Owner
- Fakt: `scripts/backup.sh`, `scripts/backup-verify.sh`, `scripts/restore.sh`, `scripts/restore-test.sh` vorhanden. **Drill-Fidelity-Bug gefunden+behoben (Triage: Bug):** `restore-test.sh` führte pg_restore OHNE `--single-transaction --exit-on-error` aus — ein nur teilweise eingespielter Dump konnte fälschlich „bestanden" melden (False-Confidence). Jetzt an echten `restore.sh` angeglichen. Zusätzlich Infra-Snapshot-Severity-Matrix (Backup-Staleness 12/24/48h) gepinnt (`infrastructureSnapshotService.test.js`, 36/36). Weiterhin kein nachweisbarer Live-Lauf.
- Aktion: einmal gegen Staging durchziehen, Run-Log als `docs/OPS_RUNBOOK.md` oder als Artefakt in `release/`-Ordner ablegen.
- Aufwand: 2 Stunden (Owner/Ops, gegen reale Infra).
- Verify: `bash -n scripts/restore-test.sh` OK; Run-Log zeigt erfolgreichen Restore in frische DB.
### P1.5 - Doku-Drift final schliessen
- Status: STRUKTURELL GELÖST (2026-06-14, A.2/Commit `5d4e67e`) — OpenAPI 3.0.3 wird jetzt AUTO-GENERIERT aus den echten Zod-Schemas (`openapi/registry.js` + `npm run openapi:generate`), Drift-Guard-Test (`openapi.spec.test.js`, deepEqual generiert↔committet) macht Drift unmöglich, x-drift-notice entfernt, Live-Explorer `api-explorer.html` + serviert via `GET /api/openapi/spec.json`. Verbleibend (inkrementell, kein Blocker): die 10 kuratierten Pfade auf weitere Route-Familien ausweiten (Framework steht, je 1 Eintrag in registry.js).
- Vorher: TEILWEISE ERLEDIGT (2026-05-28) — Sofort-Fix + Drift-Dokumentation; vollständige Auto-Generierung = P2/post-launch
- Was gemacht: (a) `docs/OPENAPI_DRIFT_REPORT.md` erstellt: vollständiges Gap-Assessment (27/747 Pfade abgedeckt, < 4 %), Route-Familien-Übersicht, 3 Lösungsstrategien (Auto-Gen / Manuell / Freeze). (b) `openapi/spec.json`: `x-drift-notice`-Warnung hinzugefügt, `/api/csrf-token` → `/api/csrf` korrigiert, Beschreibung als veraltet markiert. (c) Empfehlung Go-Live: Option C (Freeze + klarer Hinweis) jetzt aktiv; Option A (Auto-Gen via `@asteasolutions/zod-to-openapi`) als P2/A.2.
- Noch offen (P2): Vollständige spec.json-Neugenerierung aus Zod-Schemas. Kein Enterprise-Kunde darf spec.json ohne OPENAPI_DRIFT_REPORT-Hinweis als aktuelle Referenz erhalten.
- Verify: `docs/OPENAPI_DRIFT_REPORT.md` vorhanden; `openapi/spec.json` x-drift-notice gesetzt.
### P1.6 - Cross-Tenant Isolation der Core-Business-Flows
- Status: ERLEDIGT (2026-05-24)
- Ergebnis: `api/test/security/coreFlowCrossTenant.test.js` — 19/19 gruen, 0 Failures.
- Was gemacht (Welle 1 — 12 Tests): Negative Isolationstests fuer alle 5 fehlenden Business-Domains (WAVE_03-Luecken): Timesheets GET/:id (cross-tenant + supplier-perspective), Timesheets POST (cross-tenant body + supplier als Ersteller), Assignments GET/:id (cross-tenant + supplier-perspective), Assignments PATCH/:id (cross-tenant), Assignments POST/:id/transition (cross-tenant), Org Audit-Log GET/:id (cross-tenant + own-org), Requisitions GET/:id (cross-tenant + unscoped org_id=null).
- Was gemacht (Welle 2 — 7 Tests): Contracts GET/:id (cross-tenant + supplier-perspective), Contracts PATCH/:id (cross-tenant + supplier schreibt → 403), Rate Cards GET/:id (cross-tenant), Rate Cards PATCH/:id (cross-tenant). Bugfix: `rateCards.js` PERMISSION_DENIED → ORG_BOUNDARY_VIOLATION (replace_all).
- Gleichzeitig behoben: (a) dead ternary `requisitionService.js` Z.55 (`approvalRequired ? 'DRAFT' : 'DRAFT'` → direktes Assignment mit Kommentar), (b) Plan-Default `timesheets.js` Z.73 (`"FREE"` → `"DEMO"` — kanonischer Default gemaess planFeatures.js).
- WAVE_04 Subflow 4A (PARTIALLY_FILLED): Migration 113 eingespielt (`requisitions_status_check` Constraint + `requisitions_partial_fill_idx`); `stateMachine.js` + `requisitionService.js` REQUISITION_TRANSITIONS auf 10 Zustaende erweitert; Doku `CORE_BUSINESS_STATE_MACHINES.md` aktualisiert.
- P1.2 / G1.4 E2E-Specs erstellt: `kernflow-requisition.spec.js` (5 Tests), `kernflow-deal-activation.spec.js` (5 Tests), `kernflow-assignment-timesheet.spec.js` (7 Tests), `kernflow-hub-navigation.spec.js` (10 Tests). Laeuft mit `npx playwright test e2e/tests/kernflow-*.spec.js`.
- Verify: `node --test test/security/coreFlowCrossTenant.test.js` → 19 pass; E2E-Specs syntaktisch korrekt; `npm run test:unit` → bestehende Suite unveraendert.
### WAVE_05 - Executive Dashboard und KPI-Wahrheit
- Status: ERLEDIGT (2026-05-24)
- Ergebnis: G2.3 gruen — `docs/KPI_SOURCE_OF_TRUTH.md` vollstaendig; `api/test/reportingDashboard.test.js` 14/14 gruen.
- Was gemacht: (a) Hub Visibility Matrix komplett: `hubVisibility.js` alle 4 Code-Aenderungen bereits implementiert, `visibilityMatrix.test.js` 27/27 pass (frontend volume-mounted). (b) `reportingService.js`: PARTIALLY_FILLED zu `zeroRequisitionKpis()` und SQL-Query ergaenzt (Migration 113 jetzt in KPI-Zaehlung sichtbar). (c) `docs/KPI_SOURCE_OF_TRUTH.md` komplett umgeschrieben: 8 KPI-Gruppen (Requisitions, Compliance, SLA, Platform, Spend, Vendors, Rate Cards, Compliance Warnings + Finance Truth + Procurement Pulse), alle 30+ Felder mit SQL-Quelle, Zeitraum und Drilldown. (d) Null-Zustand-Garantie-Tabelle dokumentiert (alle Funktionen demo-safe). (e) 14 neue Unit-Tests: zero-state, Schema-Vollstaendigkeit, Resilience gegen DB-Fehler (Promise.allSettled).
- Verify: `node --test test/reportingDashboard.test.js` → 14 pass; `npm run test:unit` → 3787/3787 pass.
### WAVE_06 - Security Audit (Rate Limits, Upload-Haertung, API-Key-Scope)
- Status: ERLEDIGT (Audit-Phase 2026-05-24), offenes Item dokumentiert
- Ergebnis: G1.5 gruen (14/14 Tests); G3.4 substanziell verbessert (11/11 Rate-Limit-Tests gruen); 3812/3812 Unit-Tests gruen.
- Was gemacht (G1.5): (a) `/admin/control-center` fehlte `requireAdmin` — Sicherheitsluecke behoben. (b) `isGlobalAdminScope()` um `owner` via `session.userRole`-Fallback erweitert. (c) `api/test/security/adminRoutes.test.js` erstellt: 5 describe-Bloecke (Whitelist, Regression-Guard, ADMIN_PANEL_OPEN, SCC-Guard, Vollstaendigkeit). (d) SCC-Isolation verifiziert: `staffUserId`-only-Session korrekt von Platform-Session getrennt.
- Was gemacht (Rate-Limit-Wiring): (a) GET `/invoices/export` + GET `/invoices/operational/:id/export/csv` → `exportLimiter` (requestLimiter) — vorher null Rate-Limit auf GETs! (b) GET `/admin/audit-log/export/csv` → `exportLimiter` nach requireAdmin. (c) POST `/sso/callback` → `ssoCallbackLimiter` (authLimiter). (d) POST `/worker-invites` + `/resend` → `inviteLimiter` (requestLimiter, Email-Bomb-Schutz). Alle Limiter als Noop-Fallback definiert (Unit-Tests ohne echten Limiter nicht beeinflusst). (e) `api/test/security/rateLimitCoverage.test.js` erstellt: 5 describe-Bloecke, alwaysBlock429/alwaysAllow-Mock-Pattern.
- Was gemacht (Upload-Audit): Alle 3 Upload-Handler auditiert — complianceDocs, offerAssets, workerDocument — alle haben MIME-Whitelist, Extension-Whitelist, Groessenbeschaenkung (10MB), UUID-Validierung (worker).
- Was gemacht (API-Key-Audit): `apiKeyAuthMiddleware` global korrekt verdrahtet; `hasScope()` korrekt implementiert; `requireScope()` exportiert aber NIRGENDWO verwendet — Scopes sind aktuell dekorativ. Spawn-Task erstellt: Scope-Enforcement auf Finance-Routen wired.
- Offen (muss separat erledigt werden): API-Key-Scope-Enforcement (`requireScope()` auf Finance-Routen — aktuell toter Code). FEATURE_GATE_BYPASS=true in Dev (muss false in Prod sein — G1.6).
- Verify: `node --test test/security/adminRoutes.test.js` → 14/14 pass; `node --test test/security/rateLimitCoverage.test.js` → 11/11 pass; `npm run test:unit` → 3812/3812 pass.
### SCC_WAVES_03-06 - Staff Control Center Profi-Level (Code-Seite)
- Status: ERLEDIGT (2026-05-27)
- Ergebnis: SCC Build gruen (58 Modules, 0 TS-Errors). 21 neue Security-Tests (staffSecurity.test.js).
- Was gemacht: (a) WAVE 03: staffSecurity.js (Origin-Guard, CacheControl, SecHeaders), staffMutationLimiter, SCC_ERROR_CONTRACT.md, 21 Unit-Tests gruen. (b) WAVE 04: ToastContext (kein alert()), StepUpContext (kein window.confirm), ConfirmContext ARIA-gehaertet, AppShell mit Hash-Routing, PageHeader/EmptyState/ErrorBanner-Komponenten, Focus-Rings WCAG AA. (c) WAVE 05: CommercialInbox Profi-Level — Detail-Drawer, SLA-Zaehler (warn ab 48h), Preset-Filter, Assignee-Anzeige, getInboxItemDetail+getActiveStaffMembers (Backend), CSS-Klassen komplett. (d) WAVE 06: SubscriptionRequests — Plan-Modell DEMO→INDIVIDUELL (Farb-Kodierung), Pre-Aktivierungsschutz (nur bei status=accepted), Kuendigungsdatum-Feld (cancellation_effective_at), Billing-Mode-Anzeige, Dokument-Pipeline-Visualisierung (KV→ANG→AB→AE/KB), setOfferDetails cancellationEffectiveAt-Parameter ergaenzt (Backend).
- Noch offen: SCC WAVEs 07-13 (Support/SOC, Operations, Risk, Audit, Tests, Release). Ops-Setup (P1.0) weiterhin offen.
- Verify: `npm run build:scc` → 0 Errors; `node --check api/middleware/staffSecurity.js` → OK; `node --test api/test/staffSecurity.test.js` → 21/21 pass.
### WAVE_07 - Admin Centers Surface Isolation
- Status: ERLEDIGT (2026-05-24)
- Ergebnis: requireInternalPermission-Guard unit-getestet (11/11); Cross-Surface-Isolation bestaetigt; admin_panel.html Redirect bei Zugriffsfehler; 3836/3836 Unit-Tests gruen.
- Was gemacht (P1 — QA-Gap geschlossen): `api/test/security/surfaceIsolation.test.js` erstellt mit 11 Tests in 7 describe-Bloecken: (a) Unauthenticated → 401, (b) Kein DB-Eintrag → 403 INTERNAL_ACCESS_REQUIRED, (c) Falsche Permission → 403 INTERNAL_PERMISSION_DENIED (2 Faelle: audit_readonly vs. execute, support_agent vs. audit), (d) Korrekte Rolle → next() + req.internalAccess gesetzt (2 Faelle: platform_owner, support_agent), (e) Cross-Surface Org-Owner ohne DB-Eintrag → 403 (kein orgRole-Bypass), (f) Cross-Surface Platform-Admin-Session → 403 (kein session.userRole-Fallback), (g) Router-Level 3 Faelle: kein Eintrag → 403, platform_owner → 200, ops_manager auf Support-Route → 403 INTERNAL_PERMISSION_DENIED.
- Was gemacht (P2 — UX-Haertung): `frontend/public/js/pages/adminPanel.js` boot()-catch erweitert: wenn e.status === 401 ODER (e.status === 403 AND e.code === 'ADMIN_REQUIRED') → redirect zu `/?error=access_denied` statt Error-Banner. Verhindert, dass Org-User die leere Admin-Shell sehen.
- Surface-Isolation-Fazit: OCC (requireOwnerControlAccess, DB-basiert, Allowlist) ✅; SCC (staffUserId-Session, physisch getrennt) ✅; Internal Control (requireInternalPermission, DB-basiert, kein Session-Fallback) ✅ neu getestet; Admin Panel (requireAdmin, Whitelist owner/admin/platform_admin) ✅; Support-Ops (requireSupportAccess, DB-basiert) ✅.
- Verify: `node --test test/security/surfaceIsolation.test.js` → 11/11 pass; `npm run test:unit` → 3836/3836 pass.
### Phase3_WAVES_07-13 - SCC Profi-Level: Support / Operations / Risk / Audit / Tests / Release
- Status: OFFEN
- Fakt: SCC WAVES 00-06 sind erledigt (2026-05-27). WAVES 07-13 decken Support-/SOC-Modul, Operations, Risk/Trust, Audit/Decisions, Data Explorer, Automation/Runbooks, Test-Sweep und Release ab. Aktueller SCC-Score ~45% von Phase-3-Gate.
- Aktion: Pro Wave eine Session, Masterprompt in `finalization/phase3_scc/MASTERPROMPT.md`. Mit WAVE 07 beginnen (Support/SOC-Modul).
- Aufwand: 7 Sessions (je 1 Wave).
- Verify: `npm run build:scc` 0 Errors, Phase-3-Gates A-E gruen, `staffControlCenter.test.js` durchgehend gruen.
### Phase4_TRACK_B - Einsatzportal auf Enterprise-Reife 90% (Pflicht fuer Marktstart)
- Status: WORKER-SELF-SERVICE VERIFIZIERT GRÜN (2026-06-05) — Owner-Sign-off ausstehend (3 Restpunkte). Gate-Entscheidung: `docs/releases/EINSATZPORTAL_GO_LIVE_DECISION.md` (17/20 automatisiert grün).
- Erledigt: EP-02 KERN-Blocker geschlossen (native Stundenzettel-Erfassung inline in `einsatzportal-stundenzettel.html`, keine Weiterleitung). EP-03 Backend-Haertung geschlossen (org_id serverseitig aus `worker_assignment_link_id` abgeleitet, Client-Felder aus POST-Body entfernt; `workerSubmissionOrgHardening.security` gruen). Cross-Org-Negativtests gruen (EP-09 XORG-Set). 0 Links auf Legacy-`worker-timesheet.html`. Browser-Smoke NEU: `e2e/tests/einsatzportal-worker-flow.spec.js` 8/8 gruen.
- Voraussetzungs-Fixes (2026-06-05): Registrierungs-Blocker behoben (`authService.js` → `normalizePlanKey`, DEMO statt FREE), Migration 127 `org_access_suspension` angewandt.
- Restpunkte (owner-/manuell-gated, NICHT Worker-Portal): (1) Gate 16 = 2 Agency-Review-Tests in `workerSubmissionsReview.access.flow.test.js` — Fehler A `worker_view`-Capability = in-flight Entitlement-Refaktorierung (entitlementService.js uncommitted, → Task #30/Item-3); Fehler B `worker_module`-Gate 200≠403 = `FEATURE_GATE_BYPASS=true` Container-Artefakt. (2) Gate 20 Mobile-Abnahme = Owner manuell. (3) Gate 13 Kontakt-Kontext = manuelle Sicht-Bestätigung empfohlen.
- Verify (durchgeführt): `node --test test/integration/worker*` im Container → 37/39 pass (2 Fehler = Restpunkt 1, nicht Worker-Portal); `npx playwright test einsatzportal` → 8/8; `grep worker-timesheet.html einsatzportal-*.html` → leer.
### P1.7 - Entitlement-Leaks: als INDIVIDUELL verkaufte Features nur rollen-gegated
- Status: ERLEDIGT (2026-06-03, Owner-Freigabe „alle, effizientester/zukunftssicherer Weg") — HIGH-Leaks geschlossen, MED/LOW als „open-by-design" geklaert (kein Doku-Drift). Diffs uncommitted bis Owner-Commit-Freigabe.
- Befund (Audit): `visibilityMatrix.has_backend_guard:true` ist DOKU, nicht Laufzeit-Wahrheit. Nur Routen mit explizitem `requireFeature`/`requireOrgFeature` erzwingen den Plan-Gate; `rperm(...)` ist ROLLE, kein Plan. Cross-Check aller 12 `feature_key` gegen `routes/`.
- **HIGH (Umsatzleck) — GESCHLOSSEN, pilot-bewusst:**
  - `enterprise_analytics`: `requireOrgFeature("enterprise_analytics")` auf `reporting.js` `/reporting/dashboard` + `/reporting/finance-truth/export` (NUR die 2 `report.executive`-Routen; operationale Reports `report.operational` bewusst offen, da `sla_access` plan-uebergreifend gilt).
  - `assignments`: `requireOrgFeature("assignments")` auf `assignments.js` NUR `POST /assignments` (create) + `PATCH /assignments/:id` (edit) = kaeufer-exklusive Schreibpfade. Lesen (view) + Lifecycle (transition/complete) bleiben offen, weil zweiseitig — `supplier_org_id` (Agentur/Lieferant, oft nicht INDIVIDUELL) ist dort legitim beteiligt.
  - Guard ist pilot-aware (`getOrganizationEntitlements` → `effective_plan=INDIVIDUELL` fuer `pilot_status='active'`): aktive DEMO-Piloten behalten Zugang; nur zahlende Tarife < INDIVIDUELL erhalten `FEATURE_NOT_ENABLED`. Tests: `api/test/entitlementLeakGates.route.test.js` (12 Faelle: PRO=403 / INDIVIDUELL=ok / DEMO+Pilot=ok + Struktur-Checks ungegateter Routen). Bestehende `reporting.route.test.js` (28) regressionsfrei.
- **MED/LOW — OPEN-BY-DESIGN (kein Leak, NICHT gaten):** rollenbasiert geprueft, bewusst offen:
  - `persistent_requisitions` (`requisitions.js`): Requisition-CRUD ist Trial-Kernfluss (DEMO/BASIS legen Requisitionen an). Differenzierung laeuft ueber Limits/Retention, nicht ueber ein Create-Gate. Wholesale-Gate wuerde Trials brechen.
  - `basic_analytics`: KEINE dedizierte API-Route (nur Config + Frontend-Entitlement-Anzeige). `reports.js` `/reports` ist Missbrauchsmeldung (spam/betrug), NICHT Analytics — fruehere Zuordnung war falsch. Operationale Reports bleiben korrekt auf `report.operational` RBAC.
  - `supplier_ratings`: `ratings.js` `POST /ratings` ist ein ZWEISEITIGER Peer-Trust-Mechanismus (`isRequester || isReceiver`) — muss fuer alle Plaene offen bleiben, sonst kippt die Marktplatz-Reputation. Einziges theoretisches Gate-Ziel waere die Buyer-Scorecard (`requests.js` `/suppliers/:agencyId/scorecard`, companyOrg), aber Route→Feature-Mapping ist nicht durch Spec bestaetigt → kein spekulatives Gate.
  - `deal_workflow`: keine dedizierte Backend-Route (Deals laufen ueber bereits gegatete Capacity-Exchange-Endpunkte) → nur client-seitig gegated.
- Lektion: Zweiseitige Routen (view/transition/complete/peer-rating) NIE wholesale mit einem kaeuferseitigen Feature gaten — nur kaeufer-exklusive Schreibpfade. Sonst sperrt man die Lieferanten-/Agenturseite aus.
### P1.8 - Benachrichtigungen auf Hub-Cards + Glocken-Konsolidierung
- Status: ERLEDIGT (2026-06-04, Owner-Freigabe „Ja, voll bauen"). Diffs uncommitted bis Owner-Commit-Freigabe.
- Befund: Enterprise-Shell zeigte ZWEI Glocken nebeneinander (beide im `[data-notif-topbar]`): die statische pageShell-Link-Glocke `#tc-notif-bell` (→ activity.html) und das reiche `notifications.js`-Dropdown (Deep-Links via `link_path`, Read-all, Mark-read). Redundanz. Hub-Cards trugen keine Ereigniszahl.
- Umsetzung (bestehende Strukturen erweitert, keine Parallelstruktur):
  - Backend: `notificationSurfaceMap.js` = einzige Wahrheitsquelle `notification.type → Hub-Surface` (deckt notificationMatrix/Mig-019/071/072 ab). Neuer read-only `GET /api/notifications/surface-summary` (user-scoped, EINE `GROUP BY type`-Query auf den vorhandenen Partial-Index, foldet auf `{surfaces,total}`; `total` bleibt Glocken-konsistent inkl. bell-only Typen).
  - Frontend: `enterpriseHub.js` rendert kleine Zahl (≤99+) auf sichtbare `[data-surface]`-Cards; Card-href = „direkt da hin". `notifications.js` blendet die statische Alt-Glocke nach Mount plattformweit aus (guarded → strandet keine Seite; pageShell-SSE-Live-Toasts bleiben).
  - Surface-Mapping: requisition_*→requisitions, offer_*/deal_*→deals, capacity_*/demand/emergency_*→marketplace, vendor_pool_*→vendor_pool, compliance_*→trust_center, sla_*→my_company, timesheet_*→assignments; general/system/worker-only→bell-only.
- Tests: `notificationSurfaceMap.test.js` (15) + `notifications.surfaceSummary.route.test.js` (4) grün; bestehende notif-Suiten 120/120 regressionsfrei.
- Verify (manuell, Browser offen): Hub-Card-Badge erscheint bei ungelesenen Ereignissen, Klick navigiert; nur EINE Glocke sichtbar; Worker-Portal (einsatzportal-*) unberührt.
## P2 - Erste Pilotwochen (Betriebshaertung)
### P2.0 - INDIVIDUELL Tier-Schwellen migrieren (W-01 aus WAVE_02)
- Status: ERLEDIGT (2026-06-13, Owner-bestaetigt, Commit `c80b74c`)
- Loesung (echte Single Source statt nur Angleichung): kanonische Schwellen 50/150/350 leben jetzt NUR in `planFeatures.getIndividualTierByEmployeeCount`; `planCatalog` re-exportiert sie als `getIndividualTierByEmployeeCountV2` (Alias) — das abweichende `TIER_THRESHOLDS_V2`-Duplikat (Doppelwahrheit) entfernt. `auth.js` liefert dadurch automatisch kanonisch (kein Aufrufer-Change). Drift-Guard-Test (Funktion <-> INDIVIDUAL_TIER_CATALOG) verhindert kuenftige Divergenz. 3 stale-Tests kanonisch korrigiert (par. 0.9).
- (c) DB-Backfill `individual_tier_auto`: **N/A pre-launch** (keine zahlenden Bestands-Orgs; Neu-Registrierungen erhalten kanonisch). Falls je noetig: einmaliges `UPDATE organizations SET individual_tier_auto = ...` (1-Zeiler).
- Verify: `getIndividualTierByEmployeeCount(45)`==`individuell_s`, `(100)`==`individuell_m` ✓; tier/pricing/registration 115/115 + 149/149 gruen; Drift-Guard datengetrieben gegen den Katalog.
### P2.1 - Coverage-Schwellen schrittweise anheben
- Status: GEPLANT
- Ziel: von 35/75/55/35 -> 45/80/60/45 -> 55/85/70/55 in drei Schritten (monatlich).
- Aufwand: rollierend, ca. 1 Tag pro Welle.
### P2.2 - Load-Tests fuer Kern-Endpoints
- Status: GEPLANT
- Umfang: k6-Skript gegen Matching, Deal-Accept, Emergency-Commit, Timesheet-Submit.
- Aufwand: 1-2 Tage.
### P2.3 - Chaos-Run (DB-Down, Redis-Down, API-Restart)
- Status: GEPLANT
- Ziel: verifizieren, dass Correlation-IDs, Pending-Requests, Idempotency-Keys robust bleiben.
- Aufwand: 1 Tag.
### P2.4 - Phase 4 Track C: Terminologie-Umbenennung
- Status: GEPLANT (kann parallel zu Phase-3 WAVES 07-13 laufen)
- Fakt: Technische Begriffe (Requisition, Kapazitaet, Marktplatz) sichtbar im UI, fuer Kunden verwirrend. Track-C-Gate aus GATES.md ist Marktstart-Pflicht oder explizit Post-Launch.
- Aktion: Eigener Branch `feature/terminology-rename`. Mit Phase 0 (Read-only Inventar -> `docs/product/TERMINOLOGY_RENAME_AUDIT.md`) beginnen. Masterprompt: `finalization/phase 4/MASTERPROMPTS.md` Abschnitt C. Owner-Freigabe fuer Begriffsmatrix noetig (MANUAL_TASKS.md).
- Aufwand: 13 Sessions (Phase 0-12). Phase 0+1 (Audit + Guide) als Voraussetzung fuer Track A.
- Verify: Track-C-Gate aus `finalization/phase 4/GATES.md` (10 Kriterien), kein `Bedarf einstellen` in Company-Surfaces, kein `Kapazitaet einstellen` in Agency-Surfaces, `docs/product/TERMINOLOGY_GUIDE.md` vorhanden.
### P2.5 - Cross-Org-Regressionstest-Abdeckung fuer org-scoped Schreib-Endpunkte (Audit 2026-06-13)
- Status: TEILWEISE (2026-06-14, Commit `5de10d7`) — **Wave 1 workers + Wave 2 suppliers erledigt** (11 Tests in `coreFlowCrossTenant.test.js`: by-id-Worker-Mutationen + vendor-pool approve/suspend/block/categorize/tier/notes, je cross-org->403 + own-org->ok). Verbleibende Folge-Wellen (niedrigeres Risiko, Enforcement vorhanden): timesheetTemplates, agency-submissions, marketplace-offers, emergency.
- Status (Rest): GEPLANT (inkrementell; KEINE akute Vuln — Enforcement vorhanden, nur Test fehlt)
- Fakt: Cross-Org-Coverage-Audit (6-Slice-Workflow) ueber ~100 mutierende org-scoped Endpunkte. **Enforcement ist breit vorhanden** (req.orgId-scoped WHERE, getScopedWorker, requireOwnedVendorEntry, assertOrgOwnership, supplier_org_id-Check) — aber viele haben KEINEN dedizierten Cross-Org-403-Regressionstest. Risiko = Regression (jemand entfernt einen Check unbemerkt), nicht aktive Luecke. Die 2 ECHTEN Luecken (requisition-candidates IDOR) sind bereits gefixt+getestet (`1a72f60`). integrations.js-„HOCH-vuln" war False-Positive (Service org-scoped).
- Aktion: pro Domaene eine Mock-Pool-Test-Welle nach dem `coreFlowCrossTenant.test.js`-Muster (poolWith(foreignOrgRow) -> findHandlerExact -> 403). Prioritaet: workers (PII/Invites/Assignment-Links), suppliers (tier/block), timesheetTemplates, agency-submissions, marketplace-offers, dataGovernance/invoices-operational.
- Aufwand: ~4-6 kurze Slices (je 1 Domaene), rein additive Tests, kein Produktcode.
- Verify: jede Domaene hat >=1 cross-org-403 + 1 own-org-ok Test; `npm run test:unit` gruen.
## Verbesserungsvorschlaege
### A - kurzfristig, hoher Leverage (3-6 Wochen)
- **A.1** Web-Components-Shell neben Vanilla-JS einfuehren (kein Big-Bang). Zuerst `pageShell`/`hub`/`nav`, dann Page-fuer-Page.
- **A.2** OpenAPI-Spec aus Zod-Schemas generieren (`@asteasolutions/zod-to-openapi`). Beendet Doku-Drift strukturell.
- **A.3** Feature-Flags extern (Unleash oder ConfigCat) statt `FEATURE_GATE_BYPASS` + Plan-Matrix fuer granulare Pilot-Schaltung.
### B - mittelfristig, Marktwert-Multiplikator (2-3 Monate)
- **B.1** Public Marktplatz-KPI-Dashboard ("X offene Bedarfe / Y Agenturen / Z Deals") als Landing-Segment. Macht Netzwerk-Effekt sichtbar.
- **B.2** Worker-PWA statt native App: `einsatzportal-*.html` installierbar machen, Offline-Safe fuer Zeiterfassung.
- **B.3** Erklaerbares Matching: "Warum matched dieser Worker nicht" mit Feedback-Loop auf `matching_results.html`. Enterprise-Argument.
### C - Enterprise-Vertriebshebel (parallel zum Pilot)
- **C.1** SOC2/ISO27001-Vorbereitung: Audit-Log, Data-Governance, Org-Boundary-Bausteine existieren. Trust-Center-Inhalte in 2-3 Wochen vorbereitbar, voller Audit 3-6 Monate mit Partner.
- **C.2** DPA/AV-Vorlagen + Subprocessor-Liste in `trust/compliance.html`. Haeufiger Einkauf-Stopper.
- **C.3** Rollout-Playbook als Warp-Notebook ("Create Tenant", "Seed Demo", "Assign Program Manager"). Senkt Pilot-Onboarding von Stunden auf Minuten.
- **C.4** Phase 4 Track A: Marketplace Visibility Center als Post-Launch-Premium-Feature fuer PRO/INDIVIDUELL. Kontrolliertes oeffentliches Anbieterprofil, anonymisierte Profil-Analytics, verifizierte Deal-basierte Bewertungen, kuratierte Rankings. 13 Wellen (M-00 bis M-13), Masterprompt: `finalization/phase 4/MASTERPROMPTS.md` Abschnitt A. NICHT vor Phase 3 WAVE 04 + Track C Phase 0+1 starten (Cross-Cutting-Abhaengigkeit).
## Done
- **P8 Deal-Verbindlichkeit, Wellen A-E abgeschlossen 2026-08-07 (committet `4220693`, `bcecf3f`, `a7968d2`, `e02bb7f`, `67b0282`)**
  - **Was der Owner beauftragt hatte:** Beide Seiten sollen Deals zurueckziehen bzw. abbrechen koennen — mit Folgen, aber ohne Geldstrafen; Abschluss in drei Schritten bestaetigen; und die Zeitarbeitsfirma soll beim Ueberfahren eines Angebots sehen, ob sie es besetzen koennte. Alles gebaut, alle fuenf Gates nachgewiesen. Owner-Entscheidungen E1-E4 wie vorgeschlagen umgesetzt, **E5 neu entschieden**: beide Bounty-Stufen bleiben bei 3 %.
  - **Der eigentliche Ertrag waren vier geerbte Defekte**, die alle dasselbe Muster teilen — Code, der richtig aussieht, dessen Wirkung nie ankommt, bei durchgehend gruener Suite. Ein *fehlender* Effekt macht nichts rot:
    1. **`deal_success_rate` war in Produktion durchgehend NULL.** Seit Mig 044 verdrahtet, im Feed-Ranking gewichtet und an sechs Stellen angezeigt — die einzige Schreibstelle (`reputationService.recomputeReputation`) hatte nie einen Aufrufer. Am Entwicklungsbestand nachgemessen: 0 gesetzte Werte. Ein Storno kostete exakt nichts.
    2. **E1 zuendete nie.** `cancelAgreement` loeste den Einsatzbeginn ueber `offer.assignment_start_date` auf — diese Spalte gibt es auf `offers` nicht (nur auf `offer_cancellations`, als Zielspalte). `undefined` wirft nicht, es rutscht durch: `lead_time_hours` blieb NULL, die 48-Stunden-Regel griff nie. Betraf **8 von 15** bestaetigten Angeboten.
    3. **Das Bounty `zero_complaint` mass den falschen Storno-Kanal.** Es zaehlt `requests.status='CANCELED'` — den Alt-Pfad. `cancelAgreement` fasst `requests` nie an. Wer eine Einsatzvereinbarung platzen liess, behielt 3 % Rabatt fuer "null Stornos"; die Plattform subventionierte genau das Verhalten, das P8 abstellen soll.
    4. **Der Storno-Knopf war seit Welle A tot.** Die Route verlangt `reason_code` aus einem Enum, das Frontend schickte weiter Freitext unter `reason` → 400 bei jeder Stornierung ueber `offer_detail.html`. Route-Tests benutzen naturgemaess die neue Form; fuer den Knopf gab es keinen Klickpfad.
  - **Uebertragbare Lehren (gelten fuer alle 20 Folgeprojekte),** in `SKILL.md` verankert: (a) Eine Kennzahl braucht einen Test, der beweist, dass sie GESCHRIEBEN wird — nicht nur einen, der prueft, wie sie gerechnet wuerde. (b) Ein `||`-Fallback auf einen Spaltennamen ist eine ungepruefte Behauptung ueber das Schema. (c) Bei einer Bedingung ueber einen Status zaehlt nicht, *ob* er geschrieben wird, sondern *welcher Flow* ihn fuellt — bei zwei parallelen Flows ist "wird geschrieben" die falsche Frage. (d) Ein `grep`, der Status-Literal und `UPDATE` in derselben Zeile verlangt, findet parametrisierte Statements nicht; Schreibpfade ueber die Aufrufer der Update-Funktion suchen. (e) Wer eine Request-Schema-Signatur aendert, muss die Aufrufer greppen.
  - **Zwei Fehler in der eigenen Arbeit, aufgedeckt durch Gegenpruefung bzw. echte Daten** und beide korrigiert: die erste Fassung behauptete zu weit gegriffen, `'CANCELED'` schreibe *kein* Codepfad (widerlegt — es ist der falsche Kanal, nicht der tote Status); und die Bounty-Leiter lief anfangs rueckwaerts, weil Streak- und Nachweisfenster gekoppelt waren.
  - **Betriebs-Pflicht vor Go-Live:** Der Cron `POST /api/internal/recompute-deal-reliability` MUSS eingerichtet werden (taeglich, Zeile steht in `docs/SCHEDULER.md`). Ohne ihn friert jede Quote nach dem letzten Storno ein — niemand kann sich freiarbeiten, und das rollierende Jahresfenster schiebt sich nie weiter. Ausserdem: Migrationen **164** und **165** einspielen.
  - Verify: volle Suite **7986/0** (13 uebersprungen, DB-gebunden), E2E P8 **13/13**, DB-gestuetzter Schema-Smoke 10/10, drei Mutationsproben rot. Details: `docs/features/P8_DEAL_VERBINDLICHKEIT.md`.
- **Audit-Akteur bei Maschinen-Auth zentralisiert + Audit-Gate-Scanner gehaertet 2026-08-01 (committet 2026-08-02; Nachverifikation im Container: Audit-Gate 409/409, gezielte Tests 131/131 gruen)**
  - **Ausgangsmeldung (2 Gate-Verstoesse, `scim.js` PATCH/PUT `/scim/v2/Users/:id`) war ein Scanner-Fehler, KEINE fehlende Audit-Zeile:** beide Handler teilen sich die Funktion `applyUpdate`, die `writeAudit` bereits aufrief. Das Gate kannte nur Inline-Arrows und delegierte Aufrufe der Form `=> fn(req, res)`, nicht die Registrierung per Funktions-REFERENZ (`router.put(p, mw, applyUpdate)`).
  - **Die ECHTE Luecke dahinter war systemisch, nicht SCIM-spezifisch (Produktionspfeiler 5):** beide Audit-Wege loesten den Akteur nur aus `req.session.userId` auf — `middleware/auditWrite.js` (der Weg der MEISTEN Mutationen) und `writeAuditEnhanced`. Ein Request per API-Key/M2M hat keine Session und schrieb dadurch `actor_id: null` → `responsible_actor_user_id: null`, was laut der Semantik in `withResponsibleActor` „kein Mensch, sondern Cron/Webhook/Systemlauf" bedeutet. Betroffen sind alle scope-faehigen Routen: **72 Audit-Marker in 7 Dateien** (workers 32, timesheets 14, requisitions 8, invoices 7, companyTimesheets 5, assignments 4, capacityExchange 2) — jede Kundenintegration per API-Key erzeugte Audit-Zeilen ohne benennbaren Verantwortlichen.
  - **Fix an der Wurzel statt pro Route:** neues `resolveAuditActor(req)` in `services/auditLog.js` ist die eine Stelle, die den Akteur bestimmt (Session ODER Maschine); `auditWrite`-Middleware und `writeAuditEnhanced` nutzen sie beide. Verantwortlich bei Maschinen-Auth ist der Key-Ersteller — `apiKeyAuth` setzt `req.apiKeyOwnerUserId` aus `org_api_keys.created_by` (`lookupByHash`/`lookupById` selektieren die Spalte mit). Zusaetzlich landen `actor_type` (`api_key`|`m2m_token`) und `api_key_id` in `details`. **Durabilitaets-Loch geschlossen:** `created_by` ist `ON DELETE SET NULL` — ist der Ersteller geloescht, steht `responsible_actor_unknown: true` in der Zeile, statt still als Systemlauf zu erscheinen. Der Session-Fall bleibt bewusst byte-identisch (kein `actor_type`), damit bestehende Eintraege sich nicht aendern.
  - **Wirkung fuer die naechste Maschinen-Schnittstelle: keine Arbeit.** Wer ueber die Middleware oder `writeAuditEnhanced` auditiert, bekommt die Attribution automatisch — SCIM haelt selbst keine Akteurs-Logik mehr vor (`writeScimAudit` delegiert nur noch). Damit entfaellt der spaetere Umbau, den eine SCIM-lokale Loesung erzwungen haette.
  - **Vollstaendigkeit nachgemessen statt angenommen.** Audit-Wege repo-weit: 320 `res.locals.audit` (Middleware) + 6 `writeAuditEnhanced` → beide zentral geloest; 96 direkte `writeAudit`-Aufrufe bekommen kein `req` und muessen den Akteur weiterhin ausdruecklich setzen. Von diesen 96 lagen genau **7 auf einer maschinenerreichbaren Route** (`capacityExchange.js`, per `requireScope`) — sie sind auf `writeAuditEnhanced` umgestellt; nebenbei fuellen sie jetzt `org_id`/IP/User-Agent, die dort bisher leer blieben. Die uebrigen 89 liegen in reinen Session-Bereichen (admin/staff/support) und sind so korrekt. Damit ist die Luecke auf ALLEN API-Key-erreichbaren Oberflaechen geschlossen, nicht nur in SCIM.
  - **Zwei weitere Scanner-Defekte gefunden und behoben (beide false NEGATIVE — das Gate haette echte Luecken verschwiegen):** (a) der Handler-Block reichte bis zur naechsten Route-Registrierung, dadurch zog ein `writeAudit` in einer DAZWISCHEN stehenden Hilfsfunktion den vorherigen Handler faelschlich auf "abgedeckt"; jetzt paren-gematchte Blockgrenze. (b) Beim Klammer-Scan wurden Kommentare (`// 1)`) und Regex-Literale (`/^\//` — sein `//` galt als Kommentarbeginn) falsch gelesen; 4 Endpunkte fielen dadurch auf die permissive Ersatzgrenze zurueck (jetzt 0). Delegat-Aufloesung ist brace-gematcht statt 2000-Zeichen-Fenster; lokale Audit-Wrapper werden generisch aufgeloest und muessen ihren `writeAudit`-Aufruf im Rumpf BEWEISEN (kein Namens-Blindvertrauen wie bei den fruehen AUDIT_PATTERNS-Eintraegen).
  - Verify: `npm run audit:check` (CI-Pfad, Container) **408/408, exit 0** (vorher 2 Verstoesse). Negativkontrolle bestaetigt, dass das Gate weiterhin rot wird: Handler ohne Audit, Referenz-Handler ohne Audit und der Bleed-Fall werden alle gemeldet. Tests (Container): Audit-/Auth-Pfad **157/157** — `auditResponsibleActor` (+10 Maschinen-Akteur-Tests inkl. geloeschter Key-Ersteller), `audit-write` (+4 Middleware-Tests, davon einer als Regressionsschutz: Session-Eintraege bleiben unveraendert), `scim` (7 Audit-Tests), neu `auditCoverageCheck` 18/18, `apiKeyAuth`/`m2mAuth`/`audit-trail`. Lint auf allen geaenderten Dateien 0/0.
  - **Volle Suite `node scripts/run-tests.js`: 7425/7437 gruen, 3 fail + 9 cancelled — alle PRE-EXISTING und umgebungsbedingt, nicht durch diese Aenderung.** Nachgewiesen per `git stash` der Quelldateien: identische Fehlerliste mit und ohne die Aenderung. Zusaetzlich zweimal nachgemessen (nach der zentralen Middleware-Aenderung, die ~320 Audit-Marker beruehrt, und nach der `capacityExchange`-Umstellung) — beide Male exakt dieselben 9 Eintraege, also null Regressionen. Ursache: der Container mountet nur `api/` → `/app`; `docsConsistency` (`/docs/.docs-consistency-baseline.json`), `prodEnvTemplate` (`.env.prod.example`) und die Migrations-Tests (154/156) greifen auf Repo-Root-Pfade zu, die im Container nicht existieren; `occ_bootstrap` erwartet System-Status `healthy`, die Container-Umgebung meldet `degraded`. **Offene Hygiene (eigener Slice, nicht hier gefixt):** diese Tests skippen/failen je nach Startort statt sauber zu skippen — Kandidat fuer `import.meta.url`-relative Pfadaufloesung bzw. echtes Skip-Gate, sonst behauptet die "gruene" Suite mehr, als sie prueft (§0.9).
  - Geaendert: `api/services/auditLog.js` (neu `resolveAuditActor` + `withMachineActor`), `api/middleware/auditWrite.js`, `api/middleware/apiKeyAuth.js`, `api/services/apiKeyService.js`, `api/routes/scim.js`, `api/routes/capacityExchange.js` (7 Aufrufe), `api/scripts/audit-coverage-check.js`, Tests `api/test/auditResponsibleActor.test.js` + `api/test/audit-write.test.js` + `api/test/scim.test.js`, neu `api/test/auditCoverageCheck.test.js`, `.agents/skills/tempconnect-project/SKILL.md`.
- **Pre-Launch-Review #2: Kill-Switch am Self-Service-Checkout durchgesetzt 2026-06-16 (committet `2e137ea`)**
  - **HIGH Go-Live-Blocker (test-blind, dormant bis Stripe live):** Betreiber-Kill-Switch (`orgAccessSuspension`/`access_suspended_at`) griff NICHT am Self-Service-Checkout — gesperrte Org konnte buchen + via Stripe-Webhook auf INDIVIDUELL aktiviert werden (Operator-Hold unterlaufen). Fix: read-only `isOrgAccessSuspended` + zentraler `requireOrgNotSuspended`-Guard (403 ACCESS_SUSPENDED, fail-safe→500; NICHT requireActiveSubscription → Erstkäufer-sicher) auf `/payment/checkout`+`/individuell` + `access_suspended_at`-Recheck in `handleIndividuellActivation` (Audit `activation_blocked_suspended`, Session offen). Verifiziert: Host 53/53, Container 62/62 (payment + App-Boot + suspension + auth/rbac). OFFEN (eigener Slice): Findings 2/3 (Staff-Activate-Zahlungs-Diskriminator, ggf. Migration) + 2 Governance-Lows.
- **Pre-Launch-Review Geldkette: 2 Stripe-Webhook-Middleware-Blocker gefixt 2026-06-16 (committet `774c49d`)**
  - **Echte HIGH-Blocker vor echtem Stripe-Go-Live (test-blind in findHandler-Tests):** (1) globaler `express.json()` konsumierte den Roh-Body VOR der HMAC-Signaturprüfung → 400 INVALID_SIGNATURE bei JEDEM Webhook; (2) globaler `csrfProtect` blockte `/payment/webhook/*` → 403. Produktive Folge: Kunde zahlt, INDIVIDUELL-Tarif wird NIE aktiviert (Lifecycle kaputt). Fix: `express.json verify`→`req.rawBody`, `constructEvent(req.rawBody||req.body)`, csrf-Exemption `/^(\/v\d+)?\/payment\/webhook\//` (req.path ist unter `app.use("/api/")` um /api gekürzt, /vN bleibt). Plus Währungs-Check im Manipulationsschutz (Blueprint-Härtung). Neuer Integrationstest durch die VOLLE App (createApp+supertest, echte Signatur) schließt die Test-Blindheit. Verify (Container): webhook-stack **2/2**, payment-unit **85/85**, auth+rbac-flows **25/25**.
- **A.2 — OpenAPI Auto-Gen aus Zod + Live-Explorer 2026-06-14 (committet `5d4e67e`)**
  - Beendet den Doku-Drift STRUKTURELL: `openapi/registry.js` generiert OpenAPI 3.0.3 direkt aus den echten Zod-Schemas (13 Components + 10 Kern-Pfade + 3 Security-Schemes), `npm run openapi:generate`, build-time-isoliert (keine Prod-Runtime-Dep, app.js importiert registry NIE). Drift-Guard-Test (deepEqual generiert↔committet, 4 Tests) → Drift unmöglich. `GET /api/openapi/spec.json` serviert die Spec (behebt toten api-docs-Verweis). Live-Explorer `api-explorer.html` (Vanilla-JS, CSP-clean, design-system, interaktiv) + von api-docs.html verlinkt. Zukunftssicher: neue Schemas auto-Component, neue Pfade je 1 registry-Eintrag. Verify: volle Suite 4549/0, Lint 0/0, Restart+Smoke grün.
- **P2.0 Tier-Single-Source 2026-06-13 (`c80b74c`) + P2.5 Cross-Org-Tests Wave 1+2 2026-06-14 (`5de10d7`)** — Tier-Doppelwahrheit (30/250/999 vs 50/150/350) auf kanonische Single Source vereinheitlicht + Drift-Guard; workers+suppliers Cross-Org-403-Regressionstests (11).
- **Cross-Org-Audit + React-XSS + Dependency-Sweep 2026-06-13 (committet `1a72f60`)**
  - **Cross-Org-IDOR gefixt (echte Lücke, Gate C):** `POST/PATCH /requisitions/:id/candidates*` hatten kein `assertOrgOwnership` → Org B konnte Kandidaten an/in Org-A-Requisitions schreiben. Fix + 4 Regressionstests (`coreFlowCrossTenant`). Der 6-Slice-Audit über ~100 org-scoped Schreib-Endpunkte zeigte sonst: Enforcement breit vorhanden, Rest = Test-Coverage-Gap → **P2.5**. integrations-„HOCH-vuln" war False-Positive (Service org-scoped).
  - **React-SPAs (OCC/SCC/SOC) XSS-verifiziert sauber:** 0 `dangerouslySetInnerHTML`/`innerHTML`/`eval`; die 2 dynamischen URL-Params (`returnUrl`, `d.id`) sind `encodeURIComponent`'t. Keine Fixes nötig.
  - **Dependency-Sicherheit:** API-**Produktion 0 Schwachstellen** (`npm audit --omit=dev`); 2 moderate (qs-DoS) nur in Dev/CI-Tooling (Stryker), nicht produktiv erreichbar. Frontend-Prod = statische Assets (kein node_modules ausgeliefert).
- **XSS-Härtung + Frontend-Lint grün 2026-06-13 (committet `ca6a6e7` + `2dc6fea`)**
  - **Security (Gate C, Verbot „kein innerHTML ohne esc()"):** adversarialer 7-Slice-Workflow-Sweep über 39 Frontend-Dateien / 515 `innerHTML`-Sinks. Nach Eigen-Verifikation am echten Code (pageShell-Befunde als False-Positives verworfen): **14 echte Escaping-Lücken in 11 Dateien** geschlossen. Genuin exploitierbar war org-/user-Freitext (Standortname `locLbl`, Invite-Email `referred_email`, Firmenname `role`/`from`, Revenue-Label); Rest Defense-in-Depth (Status-Enum-Badge-Fallbacks, `event.icon`, `r.id`-in-onclick Attribut-Breakout, `document_url`-iframe-src). esc()-Helper in 3 Dateien ergänzt.
  - **CI-Gate-D-Blocker (dabei entdeckt): `frontend-lint:js` war ROT** (9 pre-existing Probleme in nicht-sweep-Dateien) → behoben: stray `_test2.js` (Debug-Scratch) entfernt, `portalShell.js` `/* global PortalApi */`, `cookieConsent.js` leere catch-Blöcke. Ergebnis: „Scanned 91 files, no errors found".
  - Verify: node --check 11/11, frontend lint 0/0, volle Unit-Suite **4512/4512/0**.
- **Welle F1 — Code-Schlussarbeiten 2026-06-12/13 (committet, Commits `9f37250`/`1044343`/`878b022`/`845b6c9`)**
  - **P1-Betriebsblocker gefunden+gefixt (F1.4): `requireMfa`-Identitäts-Precheck kannte die separierte Staff-Session (`staffUserId`) nicht** → 401 auf ALLEN 24 SCC-Mutationen (Step-up/Transition/Approve/…), sobald die Session nicht zufällig auch plattform-eingeloggt war — und das TROTZ `enforce:false` (Audit-Only-Vertrag darf nie blockieren). Fix: `userId || staffUserId` in `requireMfa.js` + 5 Regressions-Tests (`requireMfa.middleware.test.js`). Hätte im Staff-Produktivbetrieb (eigene `tc.staff.sid`-Session) jede Freigabe-Mutation blockiert.
  - F1.1 Prod-Härtung: Container-`resources.limits/reservations`, `FEATURE_GATE_BYPASS:"false"`-Pin in prod.yml, TLS-Pflicht-Banner (nginx+deploy). F1.2 Security: OCC/Staff-Secret via HKDF, `requireScope()` auf Finance/Export verdrahtet (war toter Code seit WAVE_06), Rate-Limit pro API-Key-ID. F1.3 Hygiene: `swallow()`-Helper ersetzt alle stillen `.catch(()=>{})` (0 Rest), companyProfile→`res.locals.audit`, CHANGELOG + RELEASE_PROCESS, Lint 4 Errors+7 Warnings→0/0, 5 Audit-Coverage-Lücken geschlossen.
  - F1.4 Test-Harness (Tests=Spezifikation, Code blieb richtig): CAN-1/FG-5 via org-first-Plan-Auflösung im Harness (`ensureSubscription` setzt Subscription+Org-Plan, FREE→DEMO), workerReview#2 via Re-Login nach Org-Umzug, HTTP-6 Step-up-Passwort, FG-3 bypass-aware. 4 Integrations-Dateien **21/21/0**.
  - Verify: volle Unit-Suite **4508/4508/0**, Lint **0/0**, Audit-Gate **373 exit 0**, Builds **OCC51/SOC29/SCC66 tsc-clean**. Abschlussbericht (Gate Teil 3) im `finalization_worklog.md` (2026-06-13).
- **SaaS-Self-Service-Billing vorbereitet (2026-06-22, feature-flagged AUS, uncommitted = Owner-Gate)**
  - **Recurring + Dunning** als bezahlter Zwilling der Lifecycle-Engine: `recurringBillingService` — `generateRecurringInvoices` (aktive bezahlte Subs, `current_period_end <= NOW` → Folgerechnung via `invoiceService.createInvoice` + Flip `active→past_due`, exakt analog `applyTrialEnds`), `runDunningSweep` (gestaffelte Mahn-Mails Stufe 1/2/3, getrackt über `invoices.dunning_level`/`last_dunning_at`), `applyRenewalPayment` (Zahlungseingang → `active` + Periode +1 Monat). **Reuse** der bestehenden Grace/Hard-Lock-Mechanik (`applyHardLocks`: unbezahlt nach 14 d → `canceled` + Org DEMO) — KEINE Parallelstruktur.
  - **Tier-2-Env-Flags** `RECURRING_BILLING_ENABLED`/`DUNNING_ENABLED` (Default AUS). `/internal/recurring-billing` + `/internal/dunning-sweep` (cronRateLimit + checkCronAuth, secret/IP-gated) sind **No-Ops** solange die Flags aus sind → „kein Auto-Billing, solange manuelle Rechnung Default ist". Mig **142** (`invoices.dunning_level`/`last_dunning_at` + Partial-Index `invoices_dunning_overdue_idx`). `dunningEmail`-Template (Stufen 1–3) in `emailHtmlTemplates.js`.
  - Tests: `recurringBilling.test.js` **16/16** (Preis-Auflösung Katalog + INDIVIDUELL-Vertragspreis, Idempotenz-Guard, Self-Healing-Revert bei Rechnungsfehler, Dunning-Stufenlogik, Flag-OFF-No-Op, Flag-ON-Service-Aufruf).
  - **Aktivierung bei UG-Gründung (verzahnt mit R1/R2):** (1) Flags setzen, (2) beide Crons im Scheduler verdrahten (wie bestehende `/internal/*`-Crons), (3) `applyRenewalPayment` an den Zahlungs-Bestätigungspfad hängen (Staff „bezahlt" heute / Stripe `invoice.paid`-Webhook nach Gründung). Bis dahin: Rechnung manuell durch Staff (unverändert).
- **Phase-5-Finalisierung 2026-06-03 (10-300-Kunden-Härtung, alle Diffs uncommitted = Owner-Gate)**
  - **Provider-Abstraktion Billing (Phase D):** `billingProviderService` (stripe/manual/disabled, manual-first), `BILLING_PROVIDER`-Env, Webhook-Dispatch über `mapStripeEvent`, `payment_failed`→Observability (kein Auto-Cancel), SCC-Billing-Sicht + Inkasso-Worklist. Tests: billingProviderService 26/26, payment.route 32/32, staffBillingOverview 8/8.
  - **Provider-Abstraktion Email (Phase E):** `emailProviderService` (console/smtp/sendgrid/disabled, KEINE neue Dependency, SendGrid via SMTP-Relay), `emailService` provider-fähig (Default-Pfad byte-identisch), `EMAIL_PROVIDER`/`SENDGRID_API_KEY`-Env, System-Health + SCC-Mail-Sicht. Tests: emailProviderService 21/21, systemHealth 17/17, staffMailCenter 10/10.
  - **Incident-Modell (R6, Owner-freigegeben):** Mig **121** `ops_incidents` + `staffIncidentService` (read-only Aggregat + open/ack/resolve mit strengen Übergängen via SELECT…FOR UPDATE) + 5 SCC-Routen (requireStaff·mfaGuard·requireStepUp·requireConfirmAndReason·Audit) + Signals-Feed (§6.2) + React-Modul. Tests: staffIncidents 25/25.
  - **Skalierungs-Index-Härtung (Phase Q):** Mig **122** (5 Cron-Sweep-Partial-Indizes) + Mig **123** (BRIN `product_analytics_events(occurred_at)`). ALLE ~20 Sweeps in internal.js gegen „wächst unbegrenzt?"-Diskriminator geprüft, jede Lücke gegen Quell-Migration verifiziert. DB-gated Index-Test `scaling-indexes.flow.test.js`.
  - **N+1-Write-Sweep:** `searchSlaScan`/`demandSlaScan`/`productReleaseService.markAllSeenForUser` auf set-based UPDATE + Bulk-UNNEST (verhaltensgleich). `createStaffingCampaignInternal` (INPUT-skaliert + withTransaction/RETURNING/per-Row-Audit) bewusst owner-gated. Tests: slaSearchService 4/4, marketplaceService grün.
  - **N+1-Read-Sweep:** `GET /support/lookup/orgs` (bis 100 Round-Trips/Request) → EINE windowed Query `loadRecentOpenCasesByOrg` (ROW_NUMBER PARTITION BY, ANY($1::uuid[])). Gesamter routes/+services/-Sweep sonst sauber. Tests: support.recentCasesByOrg 6/6 (Anti-N+1-Zählung) + DB-gated SQL-Smoke.
  - **Theme-System (Phase J):** `ultra_premium` + Registry + Tier-2-Flags (`THEME_SWITCHER_ENABLED`/`ULTRA_PREMIUM_THEME_ENABLED`) → /bootstrap → SCC-Topbar-Cycle. envValidator Fail-Fast. Tests: themeRegistry 9/9, themeFlags.config 4/4, envValidator 18/18.
  - **Restore-Drill-Fidelity (Phase P, R8):** `restore-test.sh` += `--single-transaction --exit-on-error` (False-Confidence behoben). `infrastructureSnapshotService.test.js` 36/36 (Backup-Staleness-Schwellen gepinnt).
  - **Verbleibend (alle Owner-gated/extern):** echte Stripe-Keys/Price-IDs (R2) + Lifecycle-Reaktivierung (R1), echte SendGrid-Keys (R3), platform/worker_portal-Theme-Injektion + Theme-Control-Modul (R4), Auto-Alert-Notify-Hook (R6), echter Restore-Drill gegen Infra (R8), finale Preise/Rechtstexte (R9), Flag-Konsolidierung (R10), AI-Unsafe-Classifier (R7 Hälfte B, erst bei AI-Code). Laut `99_GOLIVE_GATE.md` Teil 4 erklärt der **Owner** „fertig".
- **Finalisierungswelle 2026-05-28 (Enterprise Pack + WAVE_08-15)**
  - Enterprise Pack 1.0.0 komplett (8 Dateien in `docs/enterprise_pack/`): SECURITY_OVERVIEW, TENANT_ISOLATION_TESTS, OBSERVABILITY_OVERVIEW, CSRF_RATE_LIMIT_COVERAGE, BACKUP_RESTORE_TEST (Template), SLA_OPERATIONAL_COVERAGE, VERSION, GAPS
  - WAVE_08: Referral + Credits Cross-Tenant — 12/12 Tests gruen (`wave08CrossTenant.test.js`)
  - WAVE_09: Billing Lifecycle Trial-End + Grace + Hard-Lock — Migration 119, `applyTrialEnds()` + `applyHardLocks()`, 9 Tests gruen
  - WAVE_10: Empty-State-Audit SCC — alle 15 Module haben professionelle Empty States
  - WAVE_12/13: CI `scc-build` Job; `occ-build` Fix; Observability (Sentry, Prometheus, Pino) bestaetigt
  - WAVE_14: Legal Docs — `docs/TOMS.md`, `docs/SUBPROCESSORS.md`, `docs/AVV_TEMPLATE.md`
  - WAVE_15: `sql/seeds/demo-sales.sql`, `docs/SALES_DEMO_PATH.md`
  - F-02 SSO Break-Glass: `auth.js` — enforce_sso nur wenn `getSSOMode() === "saml"`, Passwort als Break-Glass
  - F-01 Coming-Soon-Guard: `subscriptionRequestService.js` ADDON_NOT_AVAILABLE (400); 47/47 Tests gruen
  - E-02 Spend Analytics Scope-Display: Backend `scope:{}` + `generated_at`; Frontend `renderScopeBar()`
  - Worker-Profil noindex (DSGVO): `worker-profile-public.html` `noindex, nofollow` + footer.js Mount-Point
  - `frontend/robots.txt` erstellt (Docker-Mount `./frontend` → `/robots.txt` via Nginx catch-all)
  - `docs/NOINDEX_DECISIONS.md` — alle Surfaces dokumentiert
  - Finance Export / API-Key default-deny / Vendor Tier Audit — alle bestaetigt gruen
  - Enterprise Readiness Score ~88%. Verbleibende Blocker = Owner-Tasks (P0.4, E-01, I-01, G-01, G-COM-03)
- **Welle 7 Pilot-Haertung (April 2026)**
  - Phase 12: AbortController + `ApiError(code=ABORTED|NETWORK_TRANSIENT)` im `workerSubmissionsReview.js` – kein `ERR_NETWORK_CHANGED`-Sturm mehr bei schnellen Tab-Wechseln auf `worker-submissions-review.html`
  - Phase 0+1: Hub-Card `Einsaetze & Zeiten` wird fuer `org_type=company` zu "Einsatzverfolgung / Begleitsicht" umetikettiert; `worker-submissions-review.html` zeigt fuer Unternehmen eine Read-only-Informationskachel statt des Agency-Reviews
  - Phase 3+4: `GET /api/closed-deal-assignments` + `listClosedDealAssignments` + `#closedDealAsgnSection` im Einsaetze-Tab – abgeschlossene/vollbesetzte/stornierte Deals bleiben fuer Agenturen hart sichtbar
  - Phase 2+5: `workerService.assignCapacityToWorker` schaltet Multi-Headcount-Kapazitaeten nur bei tatsaechlich vollem Headcount auf `filled`; Teilbesetzungen bleiben aktiv
  - Phase 10+11: Einsaetze-Tab bekommt Archiv-Sub-Filter; `assignmentLifecycleState` ist Europe/Berlin-timezone-safe
  - Phase 6+7+8: Aggregator `GET /api/marketplace/offers/:id/staffing-context` + `POST /api/marketplace/offers/:id/quick-assign-to-deal`; neuer `#od-staffing-block` in `offer_detail.html` mit One-click-Bulk-Zuweisung + Fast-Track-Deep-Link (manuelle Zuweisung unveraendert)
  - Phase 9: `cancelAgreement` dreht `assignments/reservations/invites` zurueck; `AGREEMENT_TRANSITIONS.activated=["cancelled"]` freigeschaltet
  - Tests: `api/test/welle7DealStaffingHardening.test.js` (4 gruen), `dealAgreement.test.js` + `hubVisibility.test.js` + `hubVisibilityIntegration.test.js` weiterhin vollstaendig gruen
## Pflege-Regeln (fuer Agenten und Menschen)
- Jeder neue echte Blocker, der in einer Session entdeckt wird, wird hier als P0/P1/P2 eingetragen, BEVOR die Antwort abgeschlossen wird.
- Aktion + Aufwand + Verify-Schritt sind Pflicht bei jedem Eintrag - kein "siehe Chat".
- Erledigte Punkte wandern in `## Done` mit Datum und Kurzbeleg (Commit-Hash, Test-Name oder Artefakt).
- Aenderungen am File brauchen keinen Commit in der Session, nur das Datei-Update.
