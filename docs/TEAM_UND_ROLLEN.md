# Team und Rollen

> **Wofuer diese Datei da ist.** Sie beantwortet drei Fragen aus drei Blickwinkeln:
> Der Eigentuemer fragt „wen muss ich engagieren?". Investoren fragen „ist der
> Personalbedarf durchdacht oder geraten?". Kuenftige Mitarbeiter fragen „wofuer
> bin ich zustaendig und was muss ich am ersten Tag koennen?".
>
> **Stand: 2026-08-14.** Alle Zahlen sind im Arbeitsbaum gemessen, nicht geschaetzt.
> Jede Zahl in diesem Dokument traegt den Befehl, mit dem sie ermittelt wurde, damit
> sie jederzeit nachgerechnet werden kann. Wo eine Messung mehrdeutig ist, steht das
> ausdruecklich dabei. Wo etwas unklar ist, steht „unklar" — nicht geglaettet.
>
> **Dies ist keine Wunschliste.** Die Rollen sind aus dem abgeleitet, was im Code
> tatsaechlich steht. An mehreren Stellen weist das Dokument ausdruecklich darauf hin,
> welche Rollen der Code **nicht** verlangt — dort laesst sich Geld sparen.

---

## Die Plattform in Zahlen

Gemessen am 2026-08-14 auf Branch `release/enterprise-premium-market-ready`.
Alle Zaehlungen ohne `node_modules` und ohne die Stryker-Sandbox `.stryker-tmp`
(beide verfaelschen naive Greps erheblich — siehe Fussnote unten).

| Groesse | Wert | Herkunft |
|---|---|---|
| Commits gesamt | 381 | `git rev-list --count HEAD` |
| **davon von einer Person** | **381 (100 %)** | `git log --format="%an" \| sort \| uniq -c` |
| Projektbeginn | 2026-03-07 | `git log --reverse --format="%ad" --date=short \| head -1` |
| Backend-Dienste | 175 Dateien / 61.690 Zeilen | `ls api/services/*.js \| wc -l`, `cat api/services/*.js \| wc -l` |
| Route-Dateien | 82 direkt / 96 rekursiv / 30.593 Zeilen | `ls api/routes/*.js`, `find api/routes -name "*.js"` |
| Groesster Einzeldienst | `assignmentStaffingService.js` 5.007 Z. | `wc -l api/services/*.js \| sort -rn` |
| Migrationen | 184 Dateien / 14.375 Zeilen SQL | `ls sql/migrations/*.sql \| wc -l` |
| Tabellen | ~177 | `grep -rhioE "create table (if not exists )?[a-z_.]+" sql/migrations` (unscharf, s. u.) |
| Indizes | 581 | `grep -rhicE "create( unique)? index" sql/migrations` |
| **Tabellen mit Row Level Security** | **9, mit 42 Policies** | `grep -rn "ENABLE ROW LEVEL SECURITY" sql/`, `grep -rc "CREATE POLICY" sql/` |
| HTML-Seiten | 77 direkt / 88 rekursiv / 36.406 Zeilen | `ls frontend/public/*.html \| wc -l` |
| davon Inline-JavaScript | 19.636 Zeilen (53,9 %) | Python-Regex ueber `<script>` ohne `src` |
| Frontend-JS in Dateien | 61 Dateien / 39.605 Zeilen | `glob public/js/**/*.js` |
| React/TypeScript | 71 Dateien / 16.648 Zeilen | `glob src/**/*.ts(x)` |
| Testdateien | 385 | `find api/test -name "*.test.js" \| wc -l` |
| Testdeklarationen | 8.073 statisch | `grep -rhoE "^\s*(it\|test)\(" api/test/` |
| E2E-Specs | 17 | `ls e2e/tests/*.spec.js \| wc -l` |
| **Unit-Tests fuer React** | **0** | `find frontend/src -name "*.test.ts*"` → 0; kein vitest/jest/testing-library in einer package.json |
| BullMQ-Worker | 4 Worker / 272 Zeilen | `wc -l api/workers/*.js` |
| Umgebungsvariablen | 101 verschiedene | `grep -rhoE "process\.env\.[A-Z0-9_]+" api/ --exclude-dir=test \| sort -u` |
| Compose-Varianten | 8 | `ls docker-compose*.yml` |
| Audit-Aufrufstellen | 144 `auditLog` + 120 `writeAudit` | `grep -rho "auditLog\|writeAudit" api/services api/routes` |
| Dokumentation | 246 Markdown-Dateien in `docs/` | `find docs -name "*.md" \| wc -l` |
| `FOR UPDATE`-Sperren | 41 in 15 Dateien | `grep -rho "FOR UPDATE" api/services api/routes` |
| Advisory Locks | 0 | `grep -ri "pg_advisory" api/ --exclude-dir=node_modules` |
| Explizite Isolationsstufen | 0 | `grep -rlE "ISOLATION LEVEL\|SERIALIZABLE" api/ --exclude-dir=node_modules` |

**Zur Unschaerfe der Tabellenzahl:** `CREATE TABLE` in Migrationen zaehlt auch
Tabellen, die spaeter umbenannt oder entfernt wurden, und verfehlt solche, die in
`DO $$`-Bloecken dynamisch erzeugt werden. Die Zahl ~177 ist eine Groessenordnung,
keine Bilanz. Fuer die Personalfrage genuegt das: relevant ist das Verhaeltnis
9 zu ~177, nicht die zweite Nachkommastelle.

**Methodenhinweis, weil es hier zu einem Fehlschluss kam:** Greps ueber `api/`
ohne `--exclude-dir=node_modules --exclude-dir=.stryker-tmp` liefern grob falsche
Werte. Beispiel: die Suche nach Isolationsstufen ergibt ungefiltert 91 Treffer —
alle aus Fremdbibliotheken. Gefiltert sind es 0. Wer die Zahlen dieses Dokuments
nachrechnet, muss beide Verzeichnisse ausschliessen.

### Der Befund, der alles Weitere bestimmt

**381 von 381 Commits stammen von einer Person. Der Bus-Faktor ist 1.**

In fuenf Monaten sind rund 100.000 Zeilen Backend, 59.000 Zeilen Frontend-JavaScript,
16.600 Zeilen React, 184 Migrationen und 385 Testdateien entstanden. Es gibt derzeit
keinen zweiten Menschen, der weiss, warum `api/utils/transaction.js:36` per
Duck-Typing zwischen Pool und Client unterscheidet, oder warum
`api/middleware/rbac.js` den Request-Body bewusst nicht als Org-Kontext auswertet.
Dieses Wissen liegt in Kommentaren — nicht in Typen, nicht in Schnittstellen, nicht
in einem zweiten Kopf.

Die Personalfrage lautet deshalb nicht primaer „welche Faehigkeiten fehlen", sondern:
**wie viele Menschen muessen dieses System kennen, damit der Ausfall des Einzigen kein
Totalausfall ist.** Alles Folgende leitet sich daraus ab.

### Eine Korrektur an einer verbreiteten Fehlannahme

Eine fruehere Auswertung dieses Repos hielt fest, es gebe **keine** Row Level Security,
und leitete daraus ab, jede einzelne Query sei die letzte Verteidigungslinie. Das ist
nachweislich falsch und wird hier korrigiert, weil die Fehlannahme zu einer zu
pessimistischen Personalplanung fuehrt:

```
grep -rli "row level security" sql/migrations   ->  3 Dateien
  031_rls_prep.sql, 116_rls_deny_by_default.sql, 126_rls_forward_repair.sql
grep -rc "CREATE POLICY" sql/                   ->  42 Policies
```

RLS ist auf neun Tabellen aktiv — `requisitions`, `timesheets`, `invoices`,
`org_memberships`, `compliance_documents`, `vendor_pool_entries`,
`subscription_requests`, `commercial_offers`, `audit_log` — bei den drei kritischsten
zusaetzlich als `FORCE ROW LEVEL SECURITY`, also auch gegen Superuser. Die
Anwendungsseite ist dafuer verdrahtet: `api/middleware/orgContext.js:229` und
`api/utils/orgContext.js` setzen `SET LOCAL app.current_org_id` beziehungsweise
`app.rls_bypass` innerhalb der Transaktion.

**Die ehrliche Fassung lautet damit:** Die neun geschaeftskritischen Tabellen — Auftraege,
Stundenzettel, Rechnungen, Mitgliedschaften, Audit — haben ein Netz auf Datenbankebene.
Die uebrigen rund 168 haben keines. Das ist deutlich besser als „gar nichts" und
deutlich schlechter als „flaechendeckend". Fuer die Personalableitung heisst das: der
Anspruch an jede neue Query bleibt hoch, aber der Totalschaden-Fall ist auf die
ungeschuetzten Tabellen begrenzt. Das ist ein Argument fuer Sorgfalt, nicht fuer Panik.

---

## Die Fachbereiche

### 1. Disposition, Transaktionen, Org-Grenze (Backend-Kern)

**Was es umfasst.** Die Zuordnung von Arbeitskraeften zu Einsaetzen und alles, was
daran haengt: `assignmentStaffingService.js` (5.007 Z.), `workerService.js` (2.654),
`workerSubmissionService.js` (1.572), `capacityExchangeService.js` (1.562). Die zehn
groessten Dienste halten rund 17.500 Zeilen — knapp 28 Prozent des Dienstvolumens in
knapp 6 Prozent der Dateien.

**Was es anspruchsvoll macht.** Die Korrektheit unter Last haengt an 41 handgesetzten
`FOR UPDATE`-Klauseln in 15 Dateien. Es gibt **keinen einzigen Advisory Lock und keine
einzige explizite Isolationsstufe** im gesamten Backend. Zaehler wie `filled_quantity`
und `open_quantity` sind materialisiert, nicht abgeleitet, und muessen nach jeder
Zustandsaenderung neu berechnet werden.

Dazu die Falle, die im Code nur als Kommentar dokumentiert ist:
`recalcAssignmentStaffing(db, id, { lock: true })` ist **wirkungslos**, wenn kein
Transaktionsclient uebergeben wird. `withTransaction` erkennt einen bereits
ausgecheckten Client daran, dass er `.release()` besitzt, und oeffnet dann keine neue
Verbindung. Wer das nicht weiss, schreibt Code, der im Einzelbetrieb korrekte Zahlen
liefert und unter Last ueberbucht.

**Die charakteristische Fehlerklasse ist nicht der Absturz, sondern der stille
Falschstand:** eine Ueberbuchung, wenn zwei Arbeitskraefte gleichzeitig den letzten
Platz bestaetigen. Nicht reproduzierbar, nicht geloggt, unmittelbar auf der
Geschaeftszahl.

**Traegt: Senior Backend.** Ohne diese Rolle ist die Plattform nicht sofort kaputt,
aber an ihrer teuersten Stelle unveraenderbar.

### 2. Besetzung bis Abrechnung (Frontend-Kern)

**Was es umfasst.** `workerSubmissionsReview.js` (5.623 Z.) und `mitarbeiter.js`
(4.103 Z.) — zusammen 9.726 Zeilen, die den Pfad Besetzung → Stundenzettel →
Kundenfreigabe → Abrechnung abbilden.

**Was es anspruchsvoll macht.** Kein Framework, kein Compiler, kein Typsystem. Rund 25
veraenderliche Modulvariablen und vier handgefuehrte Ladeflags; Cache-Invalidierung ist
Handarbeit — an einer Stelle werden zwei Caches manuell geleert. 70 `window.*`-Globals
und 137 per `getElementById` angesprochene IDs allein in einer Datei. Eine umbenannte
ID bricht stumm.

Erschwerend: dieselbe Datei traegt zwei Rollen mit unterschiedlichen Rechten —
Agentur-Leitstand und lesende Unternehmenssicht. Eine Aenderung wirkt auf zwei
Kundengruppen gleichzeitig.

**Auch hier ist die Fehlerklasse still:** ein Stundenzettel, der als versendet
erscheint, obwohl er es nicht ist. Das faellt keinem Test auf. Es faellt dem Kunden in
der Rechnung auf — im einzigen Bereich, in dem Vertrauen den Vertrag traegt.

**Traegt: Senior Frontend.**

### 3. Seitenflaeche und Verdrahtung

**Was es umfasst.** 77 Seiten, von denen nur 22 ihre Logik in eine eigene Datei
ausgelagert haben. Formulare, Tabellen, Filter, Detailansichten.

**Was es anspruchsvoll macht — und was nicht.** Die Muster liegen fertig vor:
`pageShell.js` traegt Topbar und Navigation auf 49 Seiten, `theme.js` laeuft auf 83,
`i18n.js` auf 57. Eine neue Tabelle mit Filter ist mustergetreue Arbeit, keine
Erfindung. Anspruchsvoll ist genau ein Punkt: die Sichtbarkeitslogik. Ob eine Karte
ausgeblendet wird, weil die Rolle fehlt, weil der Plan sie sperrt oder weil ein
Standort aktiv ist, sind drei Zustaende mit drei verschiedenen richtigen Anzeigen. Ein
generisches „nicht verfuegbar" ist technisch lauffaehig, produktseitig falsch — und im
Test nicht rot.

**Traegt: Mid-Level Frontend.**

### 4. Interne Konsolen (React/TypeScript)

**Was es umfasst.** Drei getrennte Vite-Anwendungen: Staff Control Center
(~12.200 Z.), Owner Control Center (~4.700 Z.), Support Center (~1.070 Z.). Zusammen
71 Dateien / 16.648 Zeilen, drei Build-Konfigurationen, ein `npm run build:all`.

**Was es anspruchsvoll macht — und was nicht.** Bewusst schlicht: exakt drei
Laufzeit-Abhaengigkeiten (React, React-DOM, React-Router), keine State-Bibliothek,
kein SSR, kein Suspense. Zustandsfuehrung ist ueberall dasselbe Muster
(`loading`/`error`/`ready`), Datenzugriff laeuft durch einen 77-Zeilen-Wrapper.

Das Risiko liegt nicht in der Komplexitaet, sondern im fehlenden Netz: **0 Unit-Tests
auf 16.648 Zeilen**, und ESLint erfasst diesen Code nicht (`files: ["public/js/**/*.js"]`,
Skript `eslint public/js/`). Einziges Netz ist `tsc --noEmit` — das prueft Typen, aber
keine Hook-Regeln und keine toten Pfade.

**Traegt: Mid-Level React/TypeScript, Teilzeit.**

### 5. Betrieb, Ueberwachung, Wiederherstellung

**Was es umfasst.** 8 Compose-Varianten, nginx, Postgres, Redis, 4 BullMQ-Worker,
Prometheus-Alarmregeln, Grafana-Dashboards, Backup- und Restore-Skripte, 2 CI-Workflows,
101 Umgebungsvariablen.

**Was es anspruchsvoll macht — und was nicht.** Die Kette ist messbar automatisiert:
`frontend-build` als Einmaldienst im Compose, nginx mit Deep-Link-Fallback und
Cache-Regeln. Das ist ordentlich gebaut und laeuft. Aber 101 Umgebungsvariablen und
Alarmregeln brauchen einen Verantwortlichen, und `restore-test.sh` existiert nur als
Datei, solange ihn niemand faehrt. **Ein nie geprobtes Backup ist kein Backup.**

**Traegt: Betrieb/DevOps, Teilzeit — die einzige Rolle, die sich sauber extern
einkaufen laesst.**

### 6. Geld und Nachweispflicht

**Was es umfasst.** 23 Dienste mit Abrechnungsbezug, Stripe in 9 Dateien referenziert,
264 Audit-Aufrufstellen.

**Was es anspruchsvoll macht.** Ein gemessener Defekt in `api/middleware/idempotency.js`:
auch Fehlerantworten werden unter dem Idempotency-Key gespeichert und 24 Stunden lang
wiederholt. Wer dort „aufraeumt", veraendert das Wiederholverhalten fuer Zahlungen.

**Traegt: Senior Backend (nicht separat besetzt).**

---

## Wer wird wofuer gebraucht

| Rolle | Stufe | Fachbereich | Kernaufgaben | Auslastung | Risiko ohne diese Rolle |
|---|---|---|---|---|---|
| **Senior Backend** | Senior | 1, 6 | Sperrstrategie und Transaktionen; Org-Grenze; Migrationen; Geldpfade | Vollzeit, unverzichtbar | Stille Ueberbuchungen und Falschstaende, die niemand bemerkt; Plattform an der teuersten Stelle unveraenderbar |
| **Senior Frontend** | Senior | 2 | Stundenzettel- und Freigabepfad; handgefuehrter Zustand; Zusammenfuehrung der zwei HTTP-Clients | Vollzeit | Falsche Anzeige unmittelbar vor der Rechnung; Vertrauensschaden beim Kunden |
| **Betrieb / DevOps** | Mid bis Senior | 5 | Deployment, Alarme, Restore-Proben, Geheimnisverwaltung | 0,4–0,5 (extern moeglich) | Ungepruefte Backups; unbeantwortete Alarme; Konfigurationsdrift ueber 101 Variablen |
| **Mid-Level Backend** | Mid | 1, 3 | Zod-Validierung nachruesten; Routenlogik in Dienste ueberfuehren; Tests verbreitern | Vollzeit (Ausbau) | Senior macht Routinearbeit; teuerstes Wissen wird zum Engpass |
| **Mid-Level Frontend** | Mid | 3 | Seiten pflegen und vollstaendig verdrahten; i18n; Token statt Inline-Styles | Vollzeit (Ausbau) | 55 Seiten stauen sich beim Senior |
| **React / TypeScript** | Mid | 4 | OCC, SCC, SOC pflegen; ungenutzte Endpunkte erschliessen; ErrorBoundary | 0,5 (Ausbau) | Interne Konsolen frieren ein; trifft zuerst Team und Support, nicht den Kunden |
| **UI / Design-System** | Mid | 3 | Vier Themes konsistent halten; zweite Token-Sprache abloesen; Barrierefreiheit | 0,3–0,4, buendelbar | Wachsende optische Uneinheitlichkeit, vierfach sichtbar durch vier Themes |
| **Test- und Werkzeugkette** | Senior | 4, alle | Erste React-Teststrategie; ESLint ausdehnen; Typvertrag zum Backend | punktuell, dann 0,2 | Zweite CI-Strecke aus Versehen; Typen und Backend driften unbemerkt |
| **UI-Designer Aussenwirkung** | Senior | — | Oeffentliche Flaechen, Bildwelt, Themes als Produktentscheidung | projektbezogen | Nicht code-getrieben — folgt aus dem Marktstart, nicht aus dem Repo |
| **Recht / Datenschutz** | Mandat | — | AVV, SLA, DSGVO-Loeschpfade, Rechtstexte | extern | Rechtsrisiko; keine technische Rolle |

---

## Die kleinstmoegliche Mannschaft

*Die Plattform laeuft. Es kommen Fehlerbehebungen, keine neuen Funktionen.*

**Zwei Vollzeitstellen plus eine halbe. Nicht weniger — und ehrlicherweise auch nicht mehr.**

1. **Senior Backend (Vollzeit).** Die einzige Stelle, die auch ohne jede
   Weiterentwicklung nicht entfallen kann. 456 der Endpunkte schreiben; die
   Korrektheit unter Last haengt an 41 handgesetzten Sperren ohne
   Isolationsstufen-Absicherung.
2. **Senior Frontend (Vollzeit).** 9.726 Zeilen tragen den Weg zur Rechnung. Wer diese
   Rolle mit einem Mid-Level besetzt, spart Gehalt und bezahlt es mit Vertrauensschaden
   in dem einen Bereich, in dem Vertrauen den Vertrag traegt.
3. **Betrieb/DevOps (0,4–0,5, extern moeglich).** Kein Vollzeitbedarf, weil die Kette
   automatisiert ist. Aber sobald echte Kundendaten daraufliegen, brauchen Alarmregeln
   und Restore-Proben einen Verantwortlichen.

### Nicht in der Minimalbesetzung

React-Entwickler (die drei Konsolen laufen containerisiert, `tsc --noEmit` gruen, das
OCC wurde seit Erstanlage zweimal angefasst), Designer, eigene QA-Abteilung,
Uebersetzungsdienstleister, DBA, Data Engineer, Framework-Spezialist,
Frontend-Build-Ingenieur. **Der Code verlangt sie nicht.** Fuer die Kundenflaeche gibt es
keinen Build und keine einzige externe Skriptquelle.

### Zwei Blocker, die kein Personal ersetzt

Beide verifiziert, beide vor dem Live-Gang zu schliessen, beide Tagesarbeit:

- **Der OCC-Logout meldet niemanden ab.** `Topbar.tsx:18` ruft
  `occApi.post("/auth/logout")` gegen die Basis `/api/v1/owner-control`. Unter
  `api/routes/occ/` liegen 13 Router — **keiner davon ist ein auth-Router**. Der echte
  Endpunkt ist `api/routes/auth.js:312`. Der Aufruf ist zusaetzlich mit
  `.catch(() => {})` versehen, schluckt den Fehlschlag also vollstaendig. Das
  Sitzungscookie bleibt gueltig. An einer Eigentuemer-Konsole ist das ein
  Sicherheitsthema, keine Oberflaechenfrage.
- **`MFA_ENFORCE=true` sperrt den Eigentuemer aus.** `requireMfa` haengt vor den
  Schreibpfaden in `api/routes/occ/decisionsRequests.js`, `automation.js` und `warp.js`.
  Die Suche nach `428`, `MFA_REQUIRED` oder `MFA_VERIFY` im gesamten OCC-Frontend
  liefert **null Treffer**. Wird MFA wie im Abnahmeplan vorgesehen scharf geschaltet,
  sind die einzigen beiden Schreibaktionen des Eigentuemers ohne Bedienweg blockiert.

---

## Die Mannschaft zum Weiterbauen

Zusaetzlich zur Minimalbesetzung, mit messbarem Ausloeser statt Bauchgefuehl:

| Rolle | Stufe | Umfang | Messbarer Ausloeser |
|---|---|---|---|
| Backend Mid-Level | Mid | 1,0 | 41 der 82 Route-Dateien ohne Zod; 140 `pool.query` direkt in Routen |
| Frontend Seitenflaeche | Mid | 1,0 | 55 der 77 Seiten ohne ausgelagerte Logik |
| React / TypeScript | Mid | 0,5 | 16.648 Z. in drei Shells, SCC allein ~12.200 |
| UI / Design-System | Mid | 0,3–0,4 | 1.969 Inline-Styles, 743 Hex-Werte, 4 Themes, zweite Token-Sprache |
| Test-/Werkzeugkette | Senior | punktuell, dann 0,2 | 0 Unit-Tests auf 16.648 Z. React; ESLint deckt nur `public/js/**` ab |
| UI-Designer | Senior | projektbezogen | nicht code-getrieben |

**Realistischer Ausbau nach zwoelf Monaten: vier Vollzeitstellen plus rund 1,2 verteilt.**
Die Begruendung fuer die Obergrenze steht im naechsten Abschnitt.

---

## Was eine Person zusammen machen kann — und was nicht

### Unbedenklich, teils besser gebuendelt

- **Senior Frontend + Frontend-Testverantwortung.** Die Testkultur liegt ohnehin bei
  den Entwicklern — die Frontend-Tests liegen im selben Verzeichnis und im selben Stil
  wie die Backend-Tests. Eine eigene QA-Stelle waere hier erfundener Overhead.
- **Frontend Mid-Level + Design-System.** Gleiche Dateien, gleiches Token-Vokabular.
- **React/TS + Gestaltung der internen Konsolen.** Kleine geschlossene Flaeche, ein
  Thema, internes Publikum.
- **Senior Backend + Datenbank und Migrationen.** Zwingend zusammen: die 184
  Migrationen und die Sperrstrategie sind dieselbe Entscheidung. Ein getrennter DBA
  waere Verschwendung.
- **Betrieb + Release/CI.**

### Zur ausdruecklichen Frage: darf dieselbe Person Sicherheit und Features machen?

**Ja — und alles andere waere bei dieser Teamgroesse Theater.** Sicherheit ist in diesem
System kein Fachgebiet neben dem Code, sondern in ihn eingebaut: RBAC, Org-Kontext,
Support-Zugriff, Staff-Zugriff, MFA und die zentrale Ratenbegrenzung sind Middleware,
die jedes Feature zwangslaeufig beruehrt. Eine Sicherheitsstelle, die nur prueft und
nichts baut, waere weder finanzierbar noch wirksam.

**Was aber niemals dieselbe Person sein darf: wer eine sicherheitsrelevante Aenderung
schreibt, und wer sie freigibt.**

Der Beleg steht im Repo. 45 Stellen in den Routen pruefen die Org-Grenze als
`if (req.orgId && ressource.org_id !== req.orgId)` — eine Pruefung, **die sich bei
`null` selbst abschaltet**. Genau daraus ist ein erreichbares Cross-Org-Leck auf
Mitgliederlisten entstanden, nachgestellt in
`api/test/integration/orgContextBoundary.security.test.js`. Solche Fehler fallen keinem
Kopf auf, der sie selbst geschrieben hat.

Die Regel lautet deshalb: **Vier-Augen-Pflicht auf jedem Diff, der `api/middleware/`,
Permission-Guards, `sql/migrations/` oder einen Geldpfad beruehrt.** Das kostet keine
Stelle, sondern eine Regel — aber die Regel existiert erst ab der zweiten
Backend-Person. Das ist das staerkste Argument dafuer, die zweite Backend-Stelle nicht
dauerhaft aufzuschieben.

### Fahrlaessige Buendelungen

- **Backend-Lead dauerhaft in Personalunion mit dem Bereitschaftsdienst.** Jeder
  Vorfall zieht genau die Person aus der Disposition, die als Einzige die Sperrlogik
  versteht. Kurzfristig unvermeidbar, auf Dauer ein Klumpenrisiko.
- **Ein Mensch fuer Frontend-Kern und Backend-Kern.** Nicht wegen fehlender Faehigkeit,
  sondern wegen der Aufmerksamkeitsgrenze: 9.726 Zeilen Frontend-Kern gegen ~17.500
  Zeilen in den zehn groessten Diensten. **Beide oben gefundenen Defekte — toter Logout,
  MFA-Sackgasse — liegen exakt auf dieser Naht,** dort wo jemand nur eine Seite
  betrachtet hat.
- **Junior als alleiniger Bereitschaftsdienst.** Keine Rufbereitschaft ohne jemanden,
  der das Duck-Typing in `withTransaction` und die `FOR UPDATE`-Semantik kennt.
- **Externe Agentur fuer den Dispositionskern.** Das ist der einzige echte
  Produktgraben; dieses Wissen darf das Haus nicht verlassen.
- **Mehr als vier bis fuenf Haende gleichzeitig am Code, solange die Netze fehlen.**
  Siehe „Stelle 0" weiter unten.

---

## Wo ein Junior sofort nuetzlich ist

Das Auswahlkriterium ist nicht „einfach", sondern **die Fehlerrichtung**: geeignet ist
alles, wo ein Anfaengerfehler laut scheitert statt still falsch zu sein.

1. **Zod-Validierung in den 41 Route-Dateien ohne Validierung nachruesten.** Mechanisch,
   gut pruefbar, hoher Sicherheitsertrag — und der Fehlerfall ist „zu streng" (eine
   gueltige Eingabe wird abgelehnt, sofort sichtbar), nie „zu lax". Ausnahme: Geld- und
   Statusuebergangsrouten nur mit Review.
2. **Lesende Reporting- und Listenendpunkte** in Routen, die bereits einen
   Permission-Guard tragen, nach dem vorhandenen Testmuster (fremde Org = 403, leere
   Daten = Zero-State, valider Aufruf = erwartetes Shape).
3. **Inline-JavaScript aus HTML in Dateien heben** (19.636 Zeilen). Reine
   Verschiebearbeit — und ab diesem Moment greift ESLint dort.
4. **Inline-Styles und Hex-Farben in Tokens ueberfuehren.** Fehler sind sichtbar, nicht
   still.
5. **i18n-Pflege.** `i18nFoundation.test.js` erzwingt DE/EN-Paritaet — Vergessen wird rot.
6. **Testverbreiterung** nach den vorhandenen Vorlagen; besonders Playwright fuer die
   eingeloggte OCC-Oberflaeche, die heute keine Abdeckung hat. Neuland ohne
   Produktivrisiko.
7. **Doku-Konsistenz.** 246 Dateien mit belegter Drift — die Projektdoku beschreibt fuer
   das OCC Verzeichnisse (`routes/`, `components/ui/`, `hooks/`, `PermissionContext`),
   die es nicht gibt, und nennt `/api/owner-control` statt `/api/v1/owner-control`. Das
   zwingt zum Lesen des Codes und ist die beste bezahlte Einarbeitung, die es gibt.
8. **Betriebsroutine nach Runbook:** Restore-Test fahren und protokollieren,
   Geheimnis-Scan, Alarm-Triage.

---

## Wo Erfahrung zwingend ist

1. **Transaktionen und Sperren.** `recalcAssignmentStaffing(db, id, { lock: true })` ist
   folgenlos ohne Transaktionsclient. Ergebnis eines Fehlers: gruene Tests, korrekte
   Zahlen im Einzelbetrieb, Ueberbuchung unter Last. Die Regel steht nur als Kommentar —
   es gibt keinen Typ und keine Lint-Regel, die sie durchsetzt.
2. **Org-Kontext und RBAC.** Der Body wird bewusst nicht als Org-Kontext ausgewertet,
   weil `org_id` dort ein Nutzdatum ist. Die „naheliegende Vervollstaendigung" bricht
   legitime Agenturvorgaenge; die umgekehrte Nachlaessigkeit erzeugt das dokumentierte
   Cross-Org-Leck. Beide Richtungen sind fuer einen Anfaenger unsichtbar.
3. **Jede neue Query auf einer der ~168 Tabellen ohne RLS.** Auf den neun geschuetzten
   Tabellen faengt die Datenbank einen vergessenen Filter. Ueberall sonst nicht. Wer
   nicht weiss, auf welcher Seite dieser Grenze er gerade arbeitet, sollte dort nicht
   allein arbeiten.
4. **Der Frontend-Zustandspfad Stundenzettel und Freigabe.** Manuelle
   Cache-Invalidierung, ~25 Modulvariablen, keine Fehlermeldung bei vergessenem
   Zuruecksetzen — nur eine falsche Anzeige unmittelbar vor der Rechnung.
5. **Geldpfade.** 23 Abrechnungsdienste, Stripe in 9 Dateien, dazu der
   Idempotency-Defekt: auch Fehlerantworten werden 24 Stunden lang wiederholt.
6. **Migrationen.** 184 Dateien, 581 Indizes, keine automatische Ruecknahme. Der einzige
   unumkehrbare Schritt im System.
7. **Middleware-Reihenfolge** und der bewusst getrennte `/staff/api`-Mount ohne diese
   Kette. Falsch eingehaengt oeffnet oder blockiert man eine ganze Flaeche, ohne dass
   zwingend ein Test rot wird.
8. **Auth, Session, MFA.** Getrenntes Staff-Cookie, `requireMfa` mit bewusster Ausnahme
   fuer das SCC. Der bereits vorhandene tote Logout zeigt, wie leicht hier etwas plausibel
   aussieht und nichts tut.

---

## Reihenfolge der Einstellung

**Stelle 0 — keine Einstellung, sondern Arbeit davor.**
Die drei Netze schliessen: ESLint ueber die 19.636 Zeilen Inline-JS und die 16.648
Zeilen TypeScript ausdehnen, den toten Logout reparieren, den MFA-428-Pfad bauen.
Begruendung: diese Luecken sind harmlos, solange nur der Erbauer arbeitet, und werden
**in genau dem Moment gefaehrlich, in dem ein Zweiter editiert.** Wer zuerst einstellt
und dann aufraeumt, bezahlt die Einarbeitung doppelt.

**1. Senior Backend.** Zuerst, weil hier der einzige Fehlerbereich liegt, der Geld
unmittelbar falsch macht und dabei still bleibt — und weil dieses Wissen heute an einer
einzigen Person haengt. Bis diese Stelle besetzt ist, ist jeder Krankheitstag des
Eigentuemers ein Betriebsrisiko.

**2. Senior Frontend.** Zweitens, weil der zweite stille Fehlerpfad dort liegt. Der
eigentliche Gewinn ist nicht Kapazitaet: **ab hier existiert die Vier-Augen-Regel zum
ersten Mal in der Praxis.**

**3. Betrieb/DevOps (0,4–0,5, Retainer moeglich).** Drittens statt erstens, weil die
Kette automatisiert ist. Aber sobald echte Kundendaten darauf liegen, brauchen 101
Umgebungsvariablen, die Alarmregeln und die Restore-Probe einen Verantwortlichen.
**Faellt der Live-Gang vor Einstellung 2, tauscht 3 mit 2.**

**4. Mid-Level Backend.** Wenn der Senior anfaengt, Routinearbeit zu machen. Messbarer
Ausloeser: die 41 Route-Dateien ohne Zod und die 140 `pool.query` in Routen liegen
unbearbeitet.

**5. Mid-Level Frontend.** Wenn sich die 55 Seiten ohne ausgelagerte Logik beim Senior
stauen — das teuerste Wissen im Haus darf nicht der Engpass fuer die billigste Aufgabe
sein.

**6. Senior Test- und Werkzeugkette, punktuell.** Erst hier, weil die
Grundsatzentscheidung — eigene React-Teststrecke oder Einbettung in den bestehenden
Runner — nur dann dauerhaft traegt, wenn feststeht, wer damit taeglich arbeitet.

**7. React/TypeScript-Teilzeit und Gestaltung.** Zuletzt: interne Konsolen und
Aussenwirkung. Ihr Stillstand sperrt niemanden aus.

### Zur Obergrenze

Eine zu grosse Mannschaft ist an diesem Code real gefaehrlich, nicht nur teuer: rund
168 Tabellen ohne RLS, kein generierter Typvertrag zwischen React und Backend, ein
Linter, der die Haelfte des Frontends nicht sieht, und 0 Unit-Tests auf 16.648 Zeilen
React. **Das System hat heute nur eine teilweise Schutzschicht gegen viele Haende.**
Vier Menschen an diesem Code sind produktiver als sieben, solange Stelle 0 nicht
erledigt ist — und drei sind sicherer als vier, wenn die Vier-Augen-Regel nicht
wirklich gelebt wird.

---

## Was diese Karte nicht leistet

- **Keine Gehaltsangaben.** Weder Spannen noch Marktvergleiche. Vergueten ist eine
  Eigentuemer-Entscheidung; dieses Dokument liefert nur die fachliche Begruendung, welche
  Stufe eine Rolle braucht.
- **Keine Personentage-Schaetzung.** „Vollzeit" und „0,5" beschreiben dauerhafte
  Auslastung, nicht den Aufwand einzelner Vorhaben. Wer aus diesem Dokument einen
  Projektplan ableiten will, braucht eine separate Schaetzung pro Vorhaben.
- **Keine Aussage zu Personen.** Die Rollen sind aus dem Code abgeleitet, nicht auf
  vorhandene Mitarbeiter zugeschnitten. Eine Person kann mehrere Rollen tragen — die
  zulaessigen und unzulaessigen Kombinationen stehen oben.
- **Keine vollstaendige Sicherheitsbewertung.** Die drei genannten Defekte (toter
  Logout, MFA-Sackgasse, Idempotency-Verhalten bei Fehlern) sind Nebenbefunde dieser
  Messung, kein Audit-Ergebnis. Ein vollstaendiges Sicherheitsaudit ist damit nicht
  ersetzt.
- **Keine Aussage ueber die Zukunft der Zahlen.** Stand ist der 2026-08-14 auf Branch
  `release/enterprise-premium-market-ready`. Bei nennenswerter Weiterentwicklung
  verschieben sich die Verhaeltnisse — insbesondere die 53,9 Prozent Inline-JavaScript
  und die Zahl der Tabellen ohne RLS sollten sinken. **Wenn sie das tun, sinkt auch der
  Anspruch an die Erfahrungsstufe an mehreren Stellen.** Dieses Dokument sollte deshalb
  nach groesseren Aufraeumarbeiten neu gemessen werden.
- **Unklar geblieben:** ob RLS in der laufenden Produktionsdatenbank tatsaechlich aktiv
  ist. Die Migrationen aktivieren sie, und `126_rls_forward_repair.sql` deutet darauf
  hin, dass es damit bereits Probleme gab. Ob alle Anwendungspfade den noetigen
  `SET LOCAL app.current_org_id`-Kontext setzen, wurde hier nicht end-to-end verifiziert
  — das ist eine eigene Pruefung wert und die erste sinnvolle Aufgabe fuer den
  Senior Backend.
