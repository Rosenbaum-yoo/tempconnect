# TempConnect - Projekt-Regeln (immer aktiv)
Diese Datei enthaelt harte, projektweite Regeln, die bei JEDER Agent-Interaktion
gelten. Detaillierter Projekt-Kontext (Architektur, Feature-Staende, Kern-Dateien,
UI-Entscheidungen, Procurement-Cluster etc.) steht im Skill:
`.agents/skills/tempconnect-project/SKILL.md` - dieser Skill wird automatisch
geladen, sobald in `tempconnect_docker` gearbeitet wird.
## Dauerhafte Rollenaufteilung (Owner-Vorgabe, Stand: 2026-06-01)
- **Claude** ist der einzige KI-Agent im Stack und uebernimmt den **gesamten Stack**: Frontend, React, UX, API-Client, E2E, Backend, DB, Security, APIs, Tests.
- Es gibt keine Territory-Sperren mehr. Vor Architektur-/Security-/DB-Aenderungen mit grosser Tragweite: Owner-Freigabe einholen.
## Arbeitshaltung
- Du arbeitest seit Tag 1 an TempConnect. Kenne Zielbild, Architektur und Produktlogik.
- Inkrementell arbeiten, bestehende Strukturen ZUERST pruefen und erweitern statt neu bauen.
- Enterprise-/VMS-Niveau (SAP Fieldglass / Beeline, aber modern). Keine Quick-and-dirty-Loesungen.
- Keine Parallelstrukturen, wenn Ansaetze existieren - erst suchen, dann erweitern.
- Gegenseiten- und aktionszentriert denken, nicht absenderzentriert.
## Code-Regeln (verbindlich)
- Secrets NIE in Dateien; ausschliesslich Umgebungsvariablen.
- SQL-Aenderungen IMMER als neue Migration unter `sql/migrations/`.
- Kein Commit ohne explizite Aufforderung durch den Nutzer.
- Bei Commits Co-Author-Line anhaengen: `Co-Authored-By: Claude <noreply@anthropic.com>`.
- Frontend: IMMER `esc()` fuer user-supplied Werte in `innerHTML`.
- Backend ist fuehrend bei Berechtigungen, Frontend spiegelt nur wider.
- Deutsche Kommentare im Code beibehalten.
- Zod-Validation an Routes; Service-Layer haelt Business-Logik; Routes nur HTTP-Handling.
- `withTransaction(pool, fn)` fuer Multi-Statement-Writes.
- RBAC ueber `requirePermission('domain.action')`, nicht inline pruefen.
- Idempotency-Key bei Write-Operationen respektieren.
- Keine hardcodierten Farben in Workforce-/Enterprise-Seiten - Tokens aus `design-system.css`.
- Keine Emojis/Raketen im UI - professionelle Buchstaben-Icons.
## Planmodell (kanonisch)
Nur diese Plannamen sind gueltig: `demo`, `basis`, `plus`, `pro`, `individuell`.
`individuell` hat interne Unterklassen (`individuell_s/m/l/enterprise`). "Enterprise"
ist KEIN oeffentlicher Plan, sondern ein Funktionsniveau innerhalb von `individuell`
oder des Pilotzugangs.
## Pilot-TODO-Pflege (verbindlich)
`docs/PILOT_GO_LIVE_TODOS.md` ist die aktive Roadmap-/Blocker-Liste bis Pilot/Go-Live.
Pflege-Regeln, die in JEDER Session gelten, BEVOR die Antwort abgeschlossen wird:
- Wird ein neuer echter Blocker entdeckt (Lint-Fehler, Audit-Luecke, Secret-Platzhalter,
  fehlende Abhaengigkeit, kaputte Route, Testbruch, Infra-Drift, Sicherheitsfund),
  wird er als P0/P1/P2-Eintrag mit `Status / Fakt / Aktion / Aufwand / Verify`
  ergaenzt.
- Wird ein Blocker abgearbeitet, wird der Eintrag in den Abschnitt `## Done`
  verschoben, mit Datum und Kurzbeleg (Commit-Hash, Test-Name oder Artefakt).
- Wird eine Verbesserungsidee waehrend der Session geboren, kommt sie unter
  `## Verbesserungsvorschlaege` als A/B/C-Eintrag (kurzfristig / Marktwert /
  Enterprise-Vertrieb) - ohne Aktion und Aufwand kein Eintrag.
- Das Datum in der Header-Zeile "Letzte Aktualisierung: ..." wird mitgezogen.
- Kein Commit des TODO-Files - nur Datei-Update.
## Skill-Pflege (verbindlich)
Nach JEDER Session, in der eines der folgenden Ereignisse eintritt, ergaenze
`.agents/skills/tempconnect-project/SKILL.md` im passenden Abschnitt, BEVOR du
die Antwort abschliesst:
- neue Route, Service, Middleware, Migration oder Page aufgenommen
- Planmodell, RBAC, Feature-Gate oder Surface-Access geaendert
- UI-Entscheidung (Topbar, Cards, Navigation, Feed, Modals) final getroffen
- neues Pattern etabliert (Factory, Helper, Policy, Gate)
- Triage-/Ticket-Regel oder Ausbauwelle angepasst
- kanonische/deprecated Seite umgezogen oder abgeloest
- Testumfang signifikant veraendert (neue Suites, Coverage-Sprung)
- Deployment-/Infra-Entscheidung getroffen (Hetzner, HA, Cron-Endpoints)
Format:
- Kurzer Bullet im passenden Abschnitt (`Aktueller Stand`, `UI-Entscheidungen`,
  `Wichtig fuer kuenftige Sessions`, `Patterns`, `Procurement-Cluster`, ...).
- Datum-/Monatsmarker beibehalten ("April 2026" etc.).
- Keine Duplikate; veraltete Bullets ersetzen, nicht zusaetzlich eintragen.
- Kein Commit der Skill-Aenderung - nur Datei-Update.
## Skalierungs-Haertung (verbindlich, "laeuft bei 10, bricht bei 300")
- Vor "Defekt" den Diskriminator anwenden: NUR Mengen, die UNBEGRENZT mit Kunden-/Datenwachstum skalieren, sind ein Skalierungs-Defekt. NICHT anfassen: bounded (`slice`/festes Array), false-positive (Loop baut JS-State, Query DANACH), already-batched (`ANY($n)`), cron/customer-cardinality, email/IO-dominiert.
- N+1 set-based aufloesen: Read → EINE windowed Query (`ROW_NUMBER … PARTITION BY` + `= ANY($1::uuid[])`); Write → Bulk-`UNNEST` + `UPDATE … RETURNING`. ABER: INPUT-skaliert (User waehlt N) ODER `withTransaction`/`RETURNING`/per-Row-Audit-verflochten → owner-gated, nicht autonom batchen.
- Reifes Repo = Verifikation, nicht Neubau. Index-Luecke direkt gegen die Quell-Migration pruefen (nicht gegen Sub-Agent-Audit). "Fertig" erklaert der Owner, nicht der Agent.
## Verifikation vor Abschluss
- Bei Code-Aenderungen: `node --check` bzw. relevantes Lint/Typecheck laufen lassen.
- Tests dort ausfuehren, wo betroffen; nicht blind "alle Tests" starten.
- Bei UI-Aenderungen: Token-/Design-System-Konformitaet pruefen.
- Bei Berechtigungen: Backend-Gate + Frontend-Sichtbarkeit synchron halten.

## Mutation Testing (verbindlich für kritische Logik)

Vor „fertig" bei RBAC-, Org-Boundary-, Auth-, Billing-, Audit- oder State-Machine-Logik: Mutation Testing statt nur Coverage. Methodik & Reihenfolge: `../MUTATION_TESTING_PLAYBOOK.md`. Projekt-Umsetzung: `_TEMPCONNECT_MUTATION_RBAC_PLAN.md`. Befehl: `npm run test:mutation:<bereich>`. Gate: Score-Ziel + null Survivor im Entscheidungs-Branch. Nur DB-freie Tests in den command runner; Diffs uncommitted bis Freigabe.
