# Übergabe — was eine neue Sitzung wissen muss

> **Diese Datei wird geprüft, nicht gepflegt.** `api/test/uebergabe.test.js` wird rot,
> sobald in einem Arbeitsplan eine offene Owner-Entscheidung auftaucht, die hier fehlt.
> Eine Übergabe, die man vergessen kann, ist keine.

**Stand: 2026-08-19** · Branch `release/enterprise-premium-market-ready`

---

## In 30 Sekunden

TempConnect ist eine B2B-Plattform für Zeitarbeit (Vermittlung zwischen
Zeitarbeitsfirmen und Unternehmen). Reifes Repo, **Finalisierungsphase** — es wird
gehärtet, nicht neu gebaut. Der Owner ist kein Entwickler; Arbeit läuft in
Abschnitten, die ich in Spuren mit **Wellen und Gates** schneide.

**Arbeitsrhythmus:** Owner sagt „weiter mit X" → ich liefere eine Welle → Output-Block
→ Owner sagt „ja committen und weiter". **Commit sofort nach grüner Suite, ohne Nachfrage** (Owner 2026-08-13). Nur der **Push** wartet auf eine ausdrückliche Zusage.

---

## Eiserne Regeln (Verstoß = echter Schaden)

| Regel | Warum |
|---|---|
| **Nie `git add -A`** | Im Baum liegen ungetrackte Geschäftsunterlagen: `docs/launch/`, `docs/aktuellesitzung/`, die UG-Gründungs-PDF. Immer Pfade einzeln stagen. |
| **Nur auf Zuruf committen** | Owner entscheidet, was fertig ist. Push wird getrennt angekündigt und nie ohne OK. |
| **`Co-Authored-By: Claude <noreply@anthropic.com>`** | An jeden Commit. |
| **Tests sind die Spezifikation** | Ein roter Test wird **nie** durch Abschwächen grün gemacht. Ausnahme nur, wenn der Test nachweisbar einen Bug als Soll kodiert — mit Begründung im Commit. |
| **Kein stiller Skip** | Ein Test, der unter `api/scripts/run-tests.js` nicht real läuft, zählt nicht als grün. Pfade immer über `import.meta.url` auflösen, nie nur über `process.cwd()`. |
| **`.claude/`, `.agents/`, `_TEMPCONNECT_*`** | Gitignored, local-only. Was dort steht, überlebt die Maschine nicht — Dauerhaftes gehört nach `docs/`. |
| **Secrets nur in Umgebungsvariablen** | Niemals in Dateien. |

---

## Wie geprüft wird

```bash
cd api && node scripts/run-tests.js          # offizieller Runner, ohne Pipe
```
Stand: **8927 Tests** (2026-08-19, voller Lauf ohne Pipe, 0 Fehler), davon 13 übersprungen — die DB-gebundenen, die nur im Container laufen.

> **Falle beim Arbeiten in einem `git worktree`:** `.agents/`, `frontend/support-ops/`
> und die ungetrackten Dateien unter `docs/launch/` sind gitignored und fehlen in
> einem frischen Baum. `dokuWaechter.test.js` und `docsConsistency.test.js` werden
> dadurch rot, **ohne dass am Code etwas falsch ist**. Wer dort arbeitet,
> verknüpft die drei Pfade aus dem Hauptbaum (Junction/Symlink), sonst jagt er
> ein Gespenst. Am 2026-08-19 gemessen und bestätigt: im Hauptbaum grün, im
> Worktree rot, nach dem Verknüpfen grün.

Die DB-gestützten Tests laufen im Container, wo `DB_HOST` gesetzt ist — auf dem
Host überspringen sie sich selbst. Was gegen das echte Schema geprüft sein muss
(Constraints, LATERALs, Casts), gehört deshalb zusätzlich dorthin:
```bash
docker exec tempconnect_api sh -c "cd /app && node --test --test-force-exit test/integration/<datei>"
```

Im Container (nur `api/` und Lese-Mounts sind dort sichtbar):
```bash
docker exec tempconnect_api sh -c "cd /app && node --test --test-force-exit test/X.test.js"
```

**`\b` in einem Template-Literal ist ein Backspace, keine Wortgrenze (2026-08-19).**
Der Org-Grenzen-Wächter erkannte Tabellennamen über ``new RegExp(`\b${tabelle}\b`)``
— und traf deshalb **nie**. Eine Probe, die nichts trifft, ist still grün: sie
meldete vier korrekt bewachte Routen als Lücke und hätte umgekehrt eine echte
durchgelassen. Gelöst durch einen Teilstring-Vergleich statt eines regulären
Ausdrucks. **Merksatz: wer ein Muster aus einem Template-Literal baut, verdoppelt
jeden Backslash — oder verzichtet auf den regulären Ausdruck.** Dieselbe Klasse
wie die Zeilenenden-Falle darunter: ein Prüfer, der leer läuft, sieht aus wie ein
Prüfer, der nichts findet.

**Zeilenenden-Falle (gelöst 2026-08-15):** Der SQL-Schema-Wächter hashte die
Migrationsdateien byteweise und konnte deshalb nur in EINER Welt grün sein —
Windows checkt CRLF aus, der Container sieht LF. Wer die Momentaufnahme im
Container erzeugte, machte sie auf dem Host rot. Der Fingerabdruck vereinheitlicht
die Zeilenenden jetzt, und der Test rechnet nicht mehr selbst, sondern benutzt die
Funktion des Erzeugers. **Merksatz für jeden neuen Wächter, der Dateien hasht:
gegen beide Welten prüfen, sonst ist er in einer davon dauerhaft rot — und ein
dauerhaft roter Test wird abgeschaltet.**

**Bekannte Fragilität:** `test/me.route.coverage.test.js` wird im vollen Lauf als
fehlgeschlagen gemeldet, obwohl alle 68 Tests darin grün sind. Ursache gefunden:
`routes/me.js` braucht 5,9 s zum Laden und hinterlässt einen offenen `MessagePort` —
der Import-Graph startet einen Worker, `--test-force-exit` tötet ihn beim Aufräumen.
Lastabhängig. **Als eigene Aufgabe ausgelagert, nicht nebenbei anfassen.**

---

## Wo die Arbeitspläne liegen

| Plan | Inhalt |
|---|---|
| [features/P10_IMPORT_LIVE_ZEIT.md](features/P10_IMPORT_LIVE_ZEIT.md) | Owner-Abschnitte 5–7: CSV-Import (Spur D), Live-Belegschaft (E), Systemzeit (F) |
| `_TEMPCONNECT_MUTATION_RBAC_PLAN.md` *(gitignored!)* | Mutation-Testing, Wellen 0–4 + Roadmap für sieben weitere Bereiche |
| [ORG_GRENZE_BEFUND.md](ORG_GRENZE_BEFUND.md) | Warum die Mandantengrenze 80-mal einzeln in den Routen steht — versionierte Fassung des wichtigsten Architekturbefunds. **Welle 3b ist abgeschlossen** (2026-08-19). |
| `api/test/fixtures/orgGrenzen.json` | Das **Register der Mandantengrenze**: je Route ein Urteil, je Route-Datei ein Abdeckungsvermerk. Wird von `api/test/orgGrenzenWaechter.test.js` erzwungen. **Vor jeder neuen `:id`-Route lesen.** |
| [FLAECHEN.md](FLAECHEN.md) | Was gehört ins Staff CC, was ins OCC, was ins Support Center. **Vor jedem neuen Modul lesen**, wird per Test erzwungen. |
| [TESTING.md](TESTING.md) | Testarchitektur, inkl. Mutation Testing und seiner zwei Fallen |
| [features/H_KUNDENANSICHT_UND_ORG_GRENZEN.md](features/H_KUNDENANSICHT_UND_ORG_GRENZEN.md) | **H2 abgeschlossen** (2026-08-19): zehn Cross-Org-Luecken geschlossen, Waechter gebaut, 15 von 82 Route-Dateien eingeordnet. Enthaelt die vollstaendige Recherche und die Korrekturen daran. H1 lief parallel in einem eigenen Baum. |
| [features/G_ABWESENHEIT_SELBSTERFASSUNG.md](features/G_ABWESENHEIT_SELBSTERFASSUNG.md) | Abwesenheit, vom Mitarbeiter selbst gemeldet — sechs Wellen. **G1-G3 gebaut** (Mig 181/182, Endpunkte, Zeitsperre, Mindestbeschreibung, Verspaetungsweg). Enthaelt die acht Owner-Entscheidungen G-E1 bis G-E8. **G1-G6 vollstaendig gebaut.** |
| [features/P11_DOKUMENTATION_ALS_SYSTEM.md](features/P11_DOKUMENTATION_ALS_SYSTEM.md) | Doku als System: generiert statt gepflegt, drei Leser (Investor/Owner/Technik), Hilfebereich. 11 Wellen, W1 laeuft. **Owner-Grundprinzip fuer alle Projekte.** |
| [PLATTFORM_REGISTER.md](PLATTFORM_REGISTER.md) | Das Inventar: jede Flaeche, jeder Endpunkt, jede Faehigkeit, mit Beleg und Zustand. Grundlage der Investoren- und Bedienungsdoku. Wird per `dokuWaechter.test.js` gegen den Code gehalten. |
| [TEAM_UND_ROLLEN.md](TEAM_UND_ROLLEN.md) | Wen dieser Code verlangt: Fachbereiche, Erfahrungsstufen, Minimalbesetzung, Reihenfolge der Einstellung — gemessen, nicht geschaetzt. |
| [investoren/WIE_WIR_BAUEN.md](investoren/WIE_WIR_BAUEN.md) | Das Dokument zum Zeigen: Ingenieursstandard mit Belegen, inkl. eines Abschnitts „Was noch nicht steht“. **Intern**, bis der Owner ueber Veroeffentlichung entscheidet (DOK-E3). |
| [qualitaet/mutation/2026-08-14-rbac/](qualitaet/mutation/2026-08-14-rbac/README.md) | Archivierter Mutations-Prüfbericht (voller Lauf, 91,33 %, 1292 Mutanten). Datiert abgelegt, damit der nächste Lauf ihn nicht überschreibt. |
| [features/P12_MUTATION_AUFRAEUMEN.md](features/P12_MUTATION_AUFRAEUMEN.md) | Aufräum-Wellen M0–M6 für die 112 überlebenden Mutanten. **Vollständig abgeschlossen** (2026-08-15): 39/39 A-Fälle geschlossen, Aggregat 94,43 %. |
| [qualitaet/mutation/2026-08-15-rbac-nach-wellen/](qualitaet/mutation/2026-08-15-rbac-nach-wellen/README.md) | Der Lauf NACH den Wellen: 94,43 %, 72 Überlebende, null A-Fälle. Der Gegenbeleg zum 14.08. |
| [qualitaet/mutation/2026-08-14-rbac/TRIAGE.md](qualitaet/mutation/2026-08-14-rbac/TRIAGE.md) | Das Ergebnis von M0: alle 112 Fälle einzeln eingestuft und gegengelesen (39 A · 32 B · 41 C), die Wellenreihenfolge und acht Befunde — darunter, dass der nächtliche Mutations-Job nie gelaufen ist. |

---

## Stand der Arbeit

### Owner-Abschnitte 5–7

| Abschnitt | Spur | Stand |
|---|---|---|
| 5 CSV-Import | D | **fertig** — D1–D6 ✅. D6 (DSGVO ohne Konto) am 2026-08-13 nach Weg (a) gebaut; dabei kam heraus, dass die **Konto**-Anonymisierung seit jeher an sechs Schema-Fehlern scheiterte — repariert, siehe P10/D6. |
| 6 Live-Belegschaft | E | **fertig** — E1 gemessen · E2 Abwesenheit (Mig 177) · E3 Montage (Mig 178) · E4 Reiter · E5 Zustandsprotokoll (Mig 179, Trigger). Gates E2/E3/E5 gegen die echte DB belegt, E4 am gerenderten Markup. Plan: features/E_LIVE_BELEGSCHAFT.md |
| 7 Systemzeit | F | **fertig** — F1 kartiert (33 Fehler), F2 behoben, F3 Wächter mit Grundlinie 39. Landkarte: features/F1_SYSTEMZEIT_LANDKARTE.md |

> Der Owner hat angekündigt, dass es **Abschnitte bis 12** gibt. Sie sind noch nicht durchgegeben.

### Mutation Testing

| Datei | 2026-08-14 | **nach den Wellen** |
|---|---|---|
| `services/rbacService.js` | 95,87 % | **99,01 %** |
| `services/enterpriseSurfaceAccessService.js` | 89,29 % | **93,88 %** |
| `utils/orgContext.js` | 93,94 % | 93,94 % |
| `middleware/orgContext.js` | 86,96 % | **90,22 %** |
| `middleware/rbac.js` | 87,82 % | **88,46 %** |
| `utils/orgBoundary.js` | 82,20 % | **86,44 %** |

**Aggregat 91,33 %** bei 1292 Mutanten, Break-Schwelle 86 — gemessen im vollen
Lauf vom **2026-08-14**, Bericht archiviert unter
[qualitaet/mutation/2026-08-14-rbac/](qualitaet/mutation/2026-08-14-rbac/README.md).
Das ist ab jetzt die **einzige** Quelle für diese Zahlen; die früher zitierten
91,49 % / 95,04 % stammten teils aus Einzelläufen, teils aus einer Commit-Nachricht
ohne Bericht. **29 neue Testfälle** aus den Wellen 0–4, **null Produktionsfehler** —
kein Produktionscode angefasst, jeder Kill von Hand gegenkontrolliert.

Zusätzlich: drei Frontend-Wächter (api/test/frontendVerdrahtung.test.js) — tote
onclick-Handler, fehlendes CSRF, Sackgassen-Links. Sie haben den Multi-Agenten-Audit
(docs/FRONTEND_REIFEGRAD_AUDIT.md, 85 Befunde) unabhängig reproduziert.

---

## Wo es weitergeht *(Stand 2026-08-18)*

**Spur G ist vollständig — G1 bis G6 gebaut und belegt.**
Der Owner hat angekündigt, dass es Abschnitte bis 12 gibt; der nächste ist
noch nicht durchgegeben.

### Was als Nächstes ansteht

**Arbeitsplan: [features/H_KUNDENANSICHT_UND_ORG_GRENZEN.md](features/H_KUNDENANSICHT_UND_ORG_GRENZEN.md)**
— **H2 ist gebaut** (2026-08-19). H1 lief parallel in einem eigenen Baum.

### H2 — was daraus geworden ist

**Die Entscheidung D-M1: Wächter bauen, die 80 nicht konsolidieren.** Begründet
hat sie sich selbst: die fünf Lücken lagen genau dort, wo **keine** der 80
Kopien stand. Eine Konsolidierung hätte keine einzige gefunden.

**Zehn geschlossene Lücken, nicht fünf.** Die fünf aus der Recherche (E-1 bis
E-5) plus fünf, die der Wächter beim ersten Lauf selbst fand:

| | Route | Was möglich war |
|---|---|---|
| E-1 | `POST /rate-cards/:id/{activate,archive}` | fremden Konditionsrahmen schalten, Sätze per `RETURNING *` zurückbekommen |
| E-2 | `POST /invoices/operational/:id/{issue,paid,void,correction}` | fremde Rechnungen stellen, auf bezahlt setzen, stornieren |
| E-3 | `POST /approvals/:id/{approve,reject}` + `/history` | fremde Freigaben entscheiden; Historie mit Antragsteller-/Freigeber-E-Mails lesen |
| E-4 | `POST /requisitions/:id/submit`, `PATCH /requisitions/:id` | fremde Ausschreibung einreichen |
| E-5 | `GET /organizations/:id/audit-log/recent-changes` | `old_values`/`new_values` samt Akteur-E-Mail fremder Entitäten |
| **E-6** | `GET /requisitions/:id/events` | vollständige Statushistorie samt Akteur-E-Mails einer fremden Ausschreibung |
| **E-7** | `GET /requisitions/:id/candidates` | Lieferantennamen, Prüfer-E-Mails und Match-Scores einer fremden Ausschreibung |
| **E-8** | `PATCH /organizations/:id` | **den Organisationsdatensatz einer fremden Firma ändern** — Name, `billing_email`, `tax_id`, `parent_org_id`. Die einzige `:id`-Schreibroute der Datei ohne `sameOrgParam`. |
| **E-9** | `POST /organizations/:id/departments` | eine Abteilung **in** einer fremden Organisation anlegen |
| **E-10** | `POST /requisitions/:id/comment` | einen Kommentar an eine fremde Ausschreibung schreiben |

E-8 ist der schwerste: `requirePermission` schützt dort nicht, weil es gegen
`req.orgId` prüft (die eigene Org, in der man Admin ist) und sein `explicitOrg`
nur `query.org_id`/`params.org_id` liest — der Platzhalter heißt hier `:id`.

**Der Wächter** (`api/test/orgGrenzenWaechter.test.js`, Register
`api/test/fixtures/orgGrenzen.json`) hat vier Schichten:

- **(A) Vollständigkeit** — jede Route mit Pfad-Platzhalter in einer abgedeckten
  Datei braucht ein Urteil. Aufgezählt wird über das **Router-Objekt**, nicht
  über den Quelltext. *Das hätte E-1 bis E-4 beim Anlegen gemeldet.*
- **(B) Verhalten** — Spion-Pool, der jede Abfrage mitschreibt: 403 · **kein**
  INSERT/UPDATE/DELETE · die Ressourcen-ID stand in der Abfrage · Org und
  Adressat stehen in derselben Anweisung. Dazu die **Gegenprobe** mit der
  eigenen Org, ohne die ein pauschales `return 403` bestünde — und die
  **Seitenprobe**: bei einer zweiseitigen Grenze (`org_id ODER supplier_org_id`)
  wird jede Hälfte einzeln belegt. Ohne sie bleibt eine halbierte Grenze
  unbemerkt; gemessen an einer Mutation in `contracts.js`, die der Wächter
  zunächst durchgelassen hat.
- **(B2) Torwächter** — für Flächen, die *eine* Eintrittsbedingung statt einer
  Grenze je Route haben. Geprüft wird, dass der benannte Middleware auf **jeder**
  Platzhalter-Route steht, dass er ohne die Voraussetzung mit dem erwarteten
  Status abweist **und** dass dabei nichts geschrieben wird. Der dritte Punkt ist
  der Grund, warum das kein Struktur-Test ist: ein Torwächter, der dasteht und
  `next()` ruft, fällt hier durch.
- **(C) Bestandsbuch** — jede der 82 Route-Dateien ist abgedeckt **oder** mit
  Grund ausgesetzt. Damit ist die ehrlichste Zahl sichtbar und wächst nicht mehr
  stillschweigend: **82 Dateien · 257 Routen verhaltensgeprüft · 123 belegte
  Ausnahmen · 0 Dateien ausgesetzt.** Die 14 des Owner Control Centers werden
  über ihren Einstiegspunkt geführt (Schicht B3), `matching.js` ist seit dem
  Abschluss von E-14 regulär geprüft. Eine Sperrklinke verhindert, dass die Zahl fällt.

  | Datei | geprüft | Ausnahmen | Grenzmodell |
  |---|---|---|---|
  | `rateCards` `invoices` `approvals` `requisitions` `organizations` | 43 | — | Org |
  | `contracts` `assignments` `vendorPool` `complianceDocs` `documentCenter` `timesheets` | 37 | — | Org |
  | `workers` `orgControlCenter` `suppliers` | 53 | — | Org, Grenze im Dienst-SQL |
  | `capacityExchange` | 17 | 1 | **Nutzer** |
  | `marketplace` | 22 | 8 | **Nutzer**, teils offen per Bauart |
  | `workerPortal` | 18 | — | **Nutzer** + Torwächter `requireWorkerRole` |
  | `listings` `mentoring` `slaSearchJobs` `companyProfile` `emergency` `offerAssets` `notifications` | 26 | 6 | **Nutzer** (`owner_id`, `mentor_id`/`mentee_id`, `owner_company_id`, `user_id`) |
  | `dataGovernance` `supplierPools` `strategicCollaboration` `subscriptionDocuments` `capacities` `integrations` `preferredVendors` | 21 | 4 | Org — vier davon erst durch E-17 bis E-20 gebunden |
  | `staffControlCenter` | — | 47 | **Staff**, org-übergreifend per Bauart; Torwächter `staffControlAccess` |
  | `support` | — | 14 | **Torwächter am Präfix** `supportAuth`; Zuschnitt aus dem Agenten-Datensatz (Warteschlange, Fallart, `data_scope`) |
  | `internalControlCenter` `productReleases` | — | 19 | **Plattform-Flächen**, org-übergreifend per Bauart |
  | `agencyPortal` `admin` `timesheetTemplates` `scim` `sso` | — | 33 | **Torwächter** je Fläche |
  | `ratings` `reputation` `search` `analytics` `profileVisibility` `dealFeedback` `auth` | — | 41 | **bewusst offen**: Marktplatz-Aggregation bzw. Token-Weg vor der Anmeldung |
  | `matching` | 4 | 1 | **Sichtbarkeitsregel des Marktplatzes** statt Org-Grenze (E-14) |
| `companyTimesheets` | 4 | — | Org, Grenze im Middleware `requireCompanySubmission` |
  | 28 Dateien ohne `:id`-Route | — | — | mit `routen: []` eingetragen — der Wächter **rechnet das nach** |

  **Zwei Namen, die mehr versprechen als sie halten** (im Register vermerkt, keine
  Lücke, aber der Anfang der E-11-Klasse): `requireAgencyRole` verlangt **keine**
  Agentur-Rolle — es sperrt nur `userRole === 'worker'` aus; ein Firmennutzer oder
  einer ganz ohne Rollenfeld kommt durch. Die echte Grenze dieser Flächen sind
  `rperm('worker.review')` und `requireOwnSubmission`. Und `requireAdmin` kennt
  einen Bypass `ADMIN_PANEL_OPEN`, der jeden Angemeldeten durchlässt — per
  Voreinstellung aus, in der laufenden Umgebung `false`, seit Welle G1.5 durch
  einen eigenen Test abgedeckt.
- **(D) Selbstprobe** — fünf absichtlich kaputte Mini-Router (Grenze vergessen ·
  Grenze **nach** dem Schreiben · Grenze auf dem falschen Parameter · halbierte
  zweiseitige Grenze · ungefilterte Liste) müssen gemeldet werden — und **zwei
  korrekte Router dürfen es nicht**, sonst wäre der Prüfer nur streng statt
  richtig. Dazu zwei Proben auf das Werkzeug selbst: der Schreib-Erkenner
  verwechselt `deleted_at`/`updated_at` in einem SELECT nicht mit einem
  Schreibvorgang, und `BEGIN`/`COMMIT` zählen nicht als Abfrage.

**Gegen den echten Bestand mutiert** — nicht nur gegen Mini-Router:

| Mutation | Wächter | Service-Test |
|---|---|---|
| Grenze mit `if (false && …)` abgeschaltet (der G6-Mutant) | **rot** | — |
| `sameOrgParam` aus der Kette entfernt | **rot** | — |
| zweiseitige Grenze halbiert (supplier-Zweig weg) | **rot** | — |
| JS-Filter einer Listen-Route entschärft | **rot** | — |
| Grenze auf den falschen Parameter gelegt (die E-5-Klasse) | **rot** | — |
| Org-Grenze aus `/requisitions/:id/events` entfernt | **rot** | — |
| `AND org_id = $3` aus dem UPDATE genommen, Parameter bleibt | grün *(dokumentierte Grenze)* | **rot** |
| Org-Bindung aus der Freigabe-Historie entfernt | grün *(dokumentierte Grenze)* | **rot** |

Die dritte Zeile ist die lehrreichste: sie war beim ersten Anlauf **grün**. Beide
Trägerspalten trugen immer denselben Besitzer, also fiel nicht auf, dass der
Handler nur noch einen Zweig prüft. Erst die Seitenprobe macht sie rot — ein
Wächter, den man nicht gegen den echten Bestand mutiert, misst seine eigene
Erwartung.

Das ist die **ehrliche Grenze** des Wächters: er beweist die Entscheidung des
Handlers und die Parameterübergabe, **nicht**, dass ein Service-SQL seine
`AND org_id`-Klausel behalten hat. Diese Hälfte tragen die Service-Tests, die
das abgesetzte SQL selbst befragen. Beide zusammen, keiner allein.

### Der wichtigste Fund der zweiten Welle: nicht jede Grenze ist eine Org-Grenze

`capacityExchange` und `marketplace` sind **nicht org-gebunden**. Ihre Grenze ist
der **Nutzer**: `supplier_company_id` / `requester_company_id` werden gegen
`req.session.userId` verglichen. Eine Probe, die nur die Organisation variiert,
hätte dort jede Verletzung durchgelassen — sie wechselt schlicht nicht die
Kennung, über die entschieden wird. Der Wächter kennt deshalb jetzt die
Dimension `identitaet: "org" | "nutzer"`.

Die Folge ist ein Produktbefund, kein Sicherheitsbefund: **ein Kollege derselben
Organisation kann die Einträge eines Teamkollegen nicht sehen oder bearbeiten.**
Dasselbe Muster wie D-M4 bei den Requisitions — zusammengefasst als **D-M5**.

### E-12 · Ein Lesezugriff schrieb in die fremde Zeile *(geschlossen)*

`GET /staffing-assignments/:id` rief `getAssignmentStaffingOverview`, und die
Funktion begann mit `recalcAssignmentStaffing` — einem
`UPDATE assignments ... WHERE id = $1` **ohne Org-Bindung**. Die
Zugehörigkeitsprüfung stand in der Zeile **danach**. Ein GET auf eine fremde
Einsatz-Kennung hat damit Mengen, Besetzungsstatus und Zeitstempel der fremden
Zeile angefasst und anschließend 404 geliefert: kein Datenabfluss, aber ein
Schreibvorgang über die Mandantengrenze, ausgelöst von einem bloßen Lesen.

Gefunden hat ihn der Wächter, nicht eine Recherche — und zwar genau über die
Zusicherung „auf dem Spion steht kein INSERT/UPDATE/DELETE". Ein reiner
Statuscode-Test hätte den 404 gesehen und nichts gemerkt.

**Geschlossen:** die Zugehörigkeit wird jetzt zuerst geklärt, und zwar im SQL
(`WHERE id = $1 AND supplier_org_id = $2`), dann wird gerechnet. Beleg:
`api/test/security/orgGrenzeLuecken.test.js`, Abschnitt E-12 — mit einer
Gegenprobe, die sicherstellt, dass die Neuberechnung für die **eigene** Org
weiterhin stattfindet, die Reparatur die Funktion also begrenzt und nicht
stilllegt.

### E-20 · Der DSGVO-Vollexport eines fremden Nutzers stand offen *(geschlossen)*

**Der größte Datenabfluss dieser Arbeit.** `GET /data-governance/export/user/:userId`
rief `exportUserDataFull(pool, req.params.userId)` — allein mit der Kennung aus
dem Pfad. Das Recht `data_governance.export` halten `owner` und `admin` **jeder**
Kundenorganisation, für die eigene Belegschaft.

Damit konnte ein beliebiger Org-Admin den vollständigen Datensatz eines
beliebigen fremden Nutzers ziehen: Mailadresse, Telefon, Anschrift, Steuernummer,
dazu alle Anzeigen, Anfragen, Bewertungen, Angebote, Einsätze und Stundenzettel.
Ein Werkzeug für die Art.-15-Auskunft, auf Dritte gerichtet.

Die **Geschwister-Route** `/export/org` in derselben Datei machte es von Anfang
an richtig: sie nimmt `req.orgId` und akzeptiert gar keine Kennung aus dem Pfad.
Zwei Wege, eine Datei, zwei Bauarten — das ist das Muster, an dem man diese
Klasse künftig zuerst sucht.

**Geschlossen** mit derselben Bindung wie E-17 (`istInMeinerOrg`, über
`is_active`): eigene Organisation ja, fremde 403 — und die Absage fällt **vor**
dem Laden der Personendaten, was der Test eigens prüft. Der Selbstexport läuft
über `GET /me/data-export` und bleibt unberührt.

### E-19 · Der Verteilplan einer fremden Ausschreibung war lesbar *(geschlossen)*

`getDistributionPlan(pool, requisitionId)` lud die Verteilstufen allein über die
Ausschreibungs-Kennung; `GET /supplier-pools/distribution/:requisitionId` trug
dazu nur `requireAuth`. Jeder Angemeldete konnte damit lesen, an **welche**
Lieferanten die Ausschreibung eines Wettbewerbers geht, in welcher Reihenfolge
und wo sie gerade steht — die Wettbewerbsinformation schlechthin in einem
Marktplatz.

Schwerer noch: `advanceDistribution` hängt am selben Plan. Ein Fremder konnte die
Ausschreibung eines Wettbewerbers auf die nächste Lieferantenstufe
**weiterschalten** und damit dessen Vergabe steuern.

**Geschlossen** über die Ausschreibung, wo die Organisation steht:
`JOIN requisitions r ON r.id = ds.requisition_id AND r.org_id = $2`. Ohne
Organisation im Kontext wird gar nicht erst gefragt.

### E-18 · Eine fremde DSGVO-Anfrage ließ sich schließen *(geschlossen)*

`completeDataRequest` band nur an Kennung und Status
(`WHERE id = $1 AND status IN (...)`). Das Tor davor prüft ausschließlich, ob der
Aufrufer das Recht in **seiner** Organisation hat. Ein Org-Admin konnte damit die
Auskunfts- oder Löschanfrage einer fremden Organisation als erledigt schließen,
ohne sie zu erfüllen. Der Schaden liegt nicht im Abfluss, sondern in der
**Frist**: die fremde Organisation glaubt, ihre Art.-15/17-Pflicht sei erledigt,
während die Uhr weiterläuft. **Geschlossen** mit `AND org_id = $4` im WHERE.

> **Drei Befunde in einer Datei.** E-17, E-18 und E-20 liegen alle in
> `dataGovernance.js`. Die Datenschutz-Werkzeuge waren durchgehend unbewacht,
> weil das Recht die eigene Organisation prüft, die Kennung im Pfad aber eine
> beliebige sein durfte. Wo eine Datei *ein* solches Muster zeigt, lohnt es,
> **jeden** Weg darin zu prüfen statt nur den gemeldeten.

### Warum diese drei gegen die echte Datenbank geprüft wurden

Ein Spion-Pool kann kein `WHERE` erzwingen. Die Zusicherung „das SQL enthält
`org_id = $n`" fällt damit in dieselbe Klasse wie ein Quelltext-Test — und die
Lehre aus Welle G6 lautet, dass `if (false && X)` die gesuchte Zeichenkette
weiterhin enthält.

Deshalb lief für E-18/E-19/E-20 dieselbe Anweisung gegen das echte
Postgres-Schema, in einer Transaktion mit `ROLLBACK`: **acht Prüfungen grün**.
Mit entfernter Bindung wurden **fünf davon rot** — Organisation A schloss die
DSGVO-Anfrage von B (`status = 'completed'`), las deren Verteilplan und schaltete
deren Vergabe weiter. Erst diese Gegenprobe macht aus einer Textzusicherung einen
Nachweis.

### Zwei Blindstellen des Wächters selbst

**Anonyme Torwächter sind unsichtbar.** `supportAuth` **und** `ownerControlAuth`
waren namenlose Closures. Für jede Strukturprüfung und jede Stapelspur
unsichtbar — der Wächter konnte nicht belegen, dass die einzige
Eintrittsbedingung der **gesamten** Support- bzw. **Owner-Fläche** überhaupt noch
montiert ist. Der Name ist jetzt Teil der Absicherung, nicht Kosmetik.

**Und eine dritte, die schwerer wog als beide.** Das Owner Control Center hat
**keine einzige** Platzhalter-Route — es adressiert alles über Abfrageparameter.
Damit war die privilegierteste Fläche des Systems für den gesamten Wächter
unsichtbar: `ownerControlCenter.js` stand mit `routen: []` im Register und galt
als abgedeckt, während seine 13 montierten Unterrouter mit 31 Wegen niemand
anfasste. Die neue Schicht **(B3)** prüft solche Flächen als Ganzes: jede Route
liegt unter dem Montagepfad des Tores, das Tor hängt **vor** allen Teilflächen,
und ohne Owner-Freigabe weist es mit 403 ab, ohne etwas anderes zu schreiben als
sein eigenes Zugriffsprotokoll. Vier Mutationen an der Montage — Teilfläche vor
dem Tor, Teilfläche daneben, Tor lässt durch, Tor wieder anonym — werden jede von
genau der Zusicherung rot, die sie fangen soll.

**Ein Helferfehler, der die neue Schicht wertlos gemacht hätte.** `listRoutesTief`
gab die **inneren** Pfade zurück (`/bootstrap`) statt der aufrufbaren
(`/owner-control/bootstrap`) — Express behält den rohen Montagepfad nicht, nur
die daraus gebaute Regexp. Eine Prüfung „liegt jede Route unter dem Tor?" hätte
gegen einen Pfad verglichen, den es nach außen gar nicht gibt: grün und blind.
Der Pfad wird jetzt zurückgewonnen — und wo der Montagepfad selbst einen
Platzhalter trägt, **weggelassen statt geraten**, weil ein falsches Präfix eine
ungeschützte Route als geschützt ausweisen würde. Beides hält eine eigene
Selbstprobe fest ((l) und (l2)).

**Präfix-Tore sahen aus wie Lücken.** `support.js` montiert sein Tor einmal auf
`/support` statt je Route. Das ist die **strengere** Bauart — auf einer neuen
Route kann man es nicht vergessen —, aber ein Test, der nur `route.stack` liest,
meldet die Fläche als ungeschützt. Genau die Falschmeldung, vor der die
Arbeitsregel warnt („positiv formulieren"). Der Wächter kennt jetzt beide Formen
(`findPrefixMiddleware`, Register-Feld `alsPraefix`) und prüft bei der Präfix-Form
zusätzlich, dass der Montagepfad **jede** Route darunter wirklich deckt.

### Merksatz für die Folgeprojekte

> **Wo ein Recht die eigene Organisation prüft, die Kennung im Pfad aber eine
> beliebige sein darf, steht die Tür offen.** Das ist die Klasse hinter E-17,
> E-18 und E-20 — und sie sieht in jeder Datei gleich aus: eine Route nimmt
> `req.orgId`, die Geschwister-Route daneben nimmt `req.params.<etwas>Id`.

### E-17 · Ein Org-Admin konnte einen FREMDEN Nutzer anonymisieren *(geschlossen)*

**Der schwerste Fund dieser Arbeit.** `data_governance.anonymize` halten laut
`services/rbacService.js:121` die Rollen **`owner` und `admin`** — also jede
Kundenorganisation für sich selbst, nicht die Plattform. `anonymizeUser` hat die
Organisation des Ziels aber **nie geprüft**: `canDeleteUser` sieht nur
Betriebsblocker (offene Einsätze, Stundenzettel, Rechnungen), alle am *Ziel*.

Damit konnte der Inhaber einer beliebigen Kundenorganisation das Konto eines
beliebigen **fremden** Nutzers unwiderruflich anonymisieren: E-Mail, Name,
Passwort-Hash und Personenbezüge überschrieben. Art.-17-Maschinerie auf einen
Dritten gerichtet. Er gibt keine Daten preis — er **zerstört** die eines Dritten.

**Geschlossen** an der Wurzel: `anonymizeUser` verlangt jetzt die Organisation
des Aufrufers und prüft die Mitgliedschaft des Ziels; die Vorbedingungsprüfung
(`/check`) ebenso, weil sie sonst verraten hätte, dass es den fremden Nutzer gibt
und was ihn blockiert. Die Abfrage nutzt **`is_active`, nicht `status`** — genau
der Fehler, an dem `utils/ownerCheck.js` seit jeher scheitert (E-11); hier nicht
wiederholt. Beleg: `orgGrenzeLuecken.test.js`, Abschnitt E-17.

> **Falls die Plattform je einen org-übergreifenden Weg braucht** (Support,
> Rechtsabteilung): der gehört hinter das Staff-Tor, nicht hinter eine
> Berechtigung, die jede Kundenorganisation selbst vergibt.

### E-16 · Fremde Mentoring-Sitzungen waren bewertbar *(geschlossen)*

`addFeedback` ermittelte `isMentor = mentor_id === userId` — und wer **weder**
Mentor noch Mentee war, galt damit stillschweigend als **Mentee**. Das UPDATE band
nur `WHERE id = $3`. Jeder Angemeldete konnte also Bewertung und Note auf eine
fremde Sitzung schreiben; die Note zählt auf den Ruf des Mentors.
**Geschlossen:** wer nicht beteiligt ist, bekommt `null`, und das UPDATE bindet
`AND (mentor_id = $4 OR mentee_id = $4)`.

### E-15 · Fremde Daten wurden GELÖSCHT *(geschlossen)*

`deleteSearchJob` räumte erst auf und prüfte dann den Besitzer:

```
DELETE FROM sla_search_matches WHERE search_job_id = $1     <- ohne Bindung
DELETE FROM sla_search_events  WHERE search_job_id = $1     <- ohne Bindung
DELETE FROM match_alerts       WHERE job_id = $1            <- ohne Bindung
DELETE FROM sla_search_jobs    WHERE id = $1 AND owner_company_id = $2
```

Ein `DELETE /sla/search-jobs/<fremde-id>` hat damit Treffer, Ereignisse und
Treffermeldungen einer fremden Suche gelöscht — und dem Aufrufer danach **404**
gemeldet. Der Bestohlene sah eine leere Suche und keinen Grund dafür. Dieselbe
Klasse wie E-12/E-13 (handeln, dann prüfen), nur in ihrer schlimmsten Form.
**Geschlossen:** Besitzprüfung zuerst, dann aufräumen.

### E-14 · Die Matching-Wege liefen ohne jede Bindung *(geschlossen)*

`findMatches` lud `SELECT * FROM demand_requests WHERE id = $1` — sonst nichts.
Jeder Angemeldete mit `requisition.view` konnte die Engine damit gegen einen
**fremden** Bedarf laufen lassen und erfuhr, dass es ihn gibt und welche
Lieferanten zu ihm passen. `logMatch` schrieb den fremden Vorgang zusätzlich
unter der **eigenen** Org ins ML-Protokoll — die Trainingsdaten des Rankings also
mit fremder Herkunft. Dasselbe galt für `matchCapacityToRequisitions`.

**Warum die Reparatur nicht „eigene Org" heißt.** Ein Bedarf wird im Marktplatz
*bewusst* an Lieferanten ausgespielt; eine reine Org-Grenze wäre das Ende des
Marktplatzes. Genau daran hing die Frage bisher als Owner-Entscheidung.

**Die Regel musste nicht erfunden werden — sie stand schon im Code.**
`capacityExchangeService` zeigt einen Bedarf genau dann, wenn er offen ist, noch
freie Plätze hat, keinen Ursprungsauftrag trägt und nicht abgelaufen ist
(`demandVisibilityWhere`, Zeile 538). `WHERE id = $1` erreichte dagegen auch
`closed`, `cancelled` und `fulfilled`. **Das Matching war die Hintertür zu genau
den Bedarfen, die die Sichtbarkeitsregel schützt** — und damit war es kein
Produktkonflikt mehr, sondern eine Inkonsistenz mit einer Regel, die die
Plattform längst getroffen hatte.

Geschlossen mit zwei Wächtern im Dienst, `darfBedarfSehen` und
`darfKapazitaetSehen`, die vor jeder Arbeit klären (Muster aus E-12/E-15). Wer
den Bedarf selbst gestellt hat, sieht ihn in jedem Status; der Anbieter sieht
sein Angebot auch privat; ein Kollege derselben Organisation ebenfalls.

**Gegen das echte Schema geprüft, mit der Zusicherung, die zählt:** über alle
angelegten Bedarfe hinweg zeigen Matching und Marktplatz derselben Agentur
**dieselbe Menge — null Abweichungen**. Dazu zwölf weitere Prüfungen, alle grün.
Sechs Mutationen — jede der vier Sichtbarkeitsbedingungen einzeln, die
Kapazitätsregel, und das Entfernen der Klärung — werden alle rot.

> Die drei Gegenproben wiegen hier schwerer als die Hauptproben. Eine Reparatur,
> die den Marktplatz zumacht, wäre schlimmer als der Befund gewesen.

### E-21 · `GET /matching/worker/:id` hat nie funktioniert *(gebunden — Rest ist P1-19)*

`matchWorkerToAssignments` liest `FROM workers`. **Diese Tabelle hat keine
Migration je angelegt** — gegen die laufende Datenbank gemessen antwortet
Postgres mit `42P01`. Der Weg endet seit jeher in 500. Kein Frontend, kein
E2E-Lauf und keine Dokumentationsseite ruft ihn auf.

Ob er entfernt oder auf `worker_profiles` gebaut wird, ist eine
Produktentscheidung (**P1-19**) und wurde hier nicht geraten: `worker_profiles`
hat weder `role` noch Koordinaten — die Bewertung der Engine liefe ins Leere und
erzeugte systematisch falsche Treffer.

**Was nicht gewartet hat: die Bindung.** Sie steht jetzt im SQL
(`AND supplier_org_id = $2`, sobald ein Betrachter bekannt ist). Ohne sie wäre
die Abfrage an dem Tag, an dem jemand eine `workers`-Tabelle anlegt, sofort ein
ungebundener org-übergreifender Lesezugriff — ein **schlafendes Leck**, das
niemand mit dem Anlegen der Tabelle in Verbindung gebracht hätte. Hintergrund-
und Cron-Läufe ohne Betrachter behalten ihr Verhalten; eine Bindung, die dort
greift, würde die Hintergrundarbeit stilllegen.

> **Merksatz.** Eine Grenze gehört ins SQL, **bevor** es die Tabelle gibt. Sie
> nachzurüsten heißt, sich daran erinnern zu müssen — und niemand erinnert sich
> beim Anlegen einer Tabelle an eine Abfrage, die seit Jahren fehlschlägt.

### E-13 · Dasselbe Muster, zweite Fundstelle *(geschlossen)*

`getStaffingChoiceSet` rief `refreshStaffingChoiceSetLifecycle` — und das
**schreibt** (`UPDATE assignment_staffing_choice_sets SET status = …`). Die
Zugehörigkeitsprüfung stand erst danach. Ein Zugriff mit fremder
Auswahl-Kennung hat deren Status fortgeschrieben, etwa auf
`options_presented`, und anschließend 404 geliefert.

Der Wächter hat es gefunden, **nachdem** E-12 dieselbe Klasse in einer anderen
Datei aufgedeckt hatte. Deshalb gibt es dafür jetzt eine eigene Zusicherung
statt eines Schalters: `schreibenNachGrenze` prüft die **Reihenfolge** — es
muss eine lesende Abfrage geben, die Kennung und Adressat zusammen trägt, und
sie muss **vor** dem ersten Schreibvorgang kommen. Genau das war bei E-12 und
E-13 verletzt. Geschlossen wie dort: Zugehörigkeit zuerst, im SQL.

### Der Wächter hatte selbst ein falsches Grün eingebaut

`catchAsync` (`utils/routeHandler.js:39-43`) ruft
`Promise.resolve(fn(…)).catch(next)` und gibt **sofort** zurück — die eigentliche
Arbeit läuft danach weiter. Die Probe hat also nachgesehen, bevor der Handler
fertig war, und hätte einen noch nicht erfolgten Schreibvorgang für einen
unterbliebenen gehalten: **ein falsches Grün für jede `catchAsync`-Route.**
Aufgefallen ist es, weil eine zusätzliche `await`-Runde im Spion eine zuvor
grüne Route auf „schreibt nichts" umschlagen ließ. Die Probe wartet jetzt,
bis der Handler wirklich zu Ende ist.

### E-11 · `canAccessAsOwner` hat nie funktioniert

`utils/ownerCheck.js:28-33` soll genau diese Lücke schließen: direkter
Besitzer **oder** Mitglied derselben Organisation. Zwei Fehler in vier Zeilen:

1. Die Abfrage fragt `org_memberships.status` ab — **diese Spalte gibt es
   nicht** (sie heißt `is_active`). Gegen die laufende Datenbank ausgeführt:
   `column "status" does not exist`.
2. Als `org_id` wird `entityOwnerId` übergeben — eine **Nutzer**-Kennung
   (`demand_requests.requester_company_id` → `users`), verglichen mit einer
   **Org**-Kennung (`org_memberships.org_id` → `organizations`). Selbst mit
   richtiger Spalte könnte das nie treffen.

Der `catch` darunter macht aus dem Fehler stillschweigend ein `false`. Ergebnis:
an **10 Aufrufstellen** in `emergency.js`, `marketplace.js`, `offerAssets.js` und
`slaSearchJobs.js` ist die Funktion auf „nur der direkte Besitzer" degradiert —
seit sie existiert, bei jedem Aufruf mit einer wirkungslosen Datenbankrunde.
`offerAssets.js:127` trägt sogar den Kommentar „canAccessAsOwner beruecksichtigt
auch Organisations-Member".

**Kein Leck** — der Fehler ist zu streng, nicht zu lasch. Deshalb ist er
*nicht* autonom repariert: die Korrektur **weitet Zugriff aus** und ist damit
eine Owner-Entscheidung. Eintrag **P1-17**.

### Gegen die echte Datenbank geprüft (was ein Mock nicht zeigen kann)

- `rate_cards` und `approval_requests`: **`rls=false`, 0 Policies** — für E-1 und
  E-3 gab es in **keinem** Deployment einen Backstop in der Datenbank. Die
  Vermutung des Plans ist damit gemessen, nicht mehr vermutet.
- **Migration 117 existiert nicht.** `docs/security/TENANT_ISOLATION_MODEL.md`
  verweist 28 Tabellen auf sie als „nächsten Schritt"; die Datei wurde nie
  geschrieben (`sql/migrations/` springt von 116 auf 118).
- `audit_log`: 2711 Zeilen, davon **1782 ohne `org_id`**; von 920 Entitäten
  wären **416** unter dem strikten Filter von E-5 unsichtbar. Das ist heute
  folgenlos — die org-gebundene Route hat **keinen** Aufrufer (das Admin-Panel
  ruft die plattformweite Fassung). Es ist aber die Zahl, die zur offenen
  Null-Politik-Entscheidung gehört.

### Erledigt am 2026-08-19

| Punkt | Ergebnis |
|---|---|
| **Demo-Compose** (`cde6c42`) | War **nie** startfähig (nicht „seit P0-08"): Die Datei entstand einen Monat nach dem Guard, den sie verletzt. Schwerer: Sie wird **ausgeliefert** und öffnete beim Kunden alle Plan-Gates — der CI-Wächter dagegen durchsucht nur `.env*`. Dazu der `release-package.sh`-Fehler, durch den `.claude/` ins Artefakt kam (die `EXCLUDE_LIST` galt nur im Fallback-Zweig). Wächter: `composeStartfaehig.test.js` |
| **NOT_AUTH** (`61d2091`) | Nicht „alle Portalseiten", sondern **genau die G5-Seite**. Und kein Konsolen-Problem: Sie blieb für Abgemeldete **dauerhaft weiß**, ohne Weg zum Login — ausgerechnet der Notfallweg. Siebenmal kopiert, beim achten Mal vergessen. |
| **H2 — Mandantengrenzen** | Die Entscheidung **D-M1 ist gefallen: Wächter, nicht konsolidieren.** Die fünf Lücken des Plans sind geschlossen — **und der Wächter fand über alle 81 Route-Dateien hinweg elf weitere**. Sechzehn Lücken, nicht fünf. Die schwersten kamen zuletzt und lagen zu dritt in **einer** Datei: DSGVO-Vollexport eines Fremden (E-20), fremdes Konto anonymisieren (E-17), fremde Betroffenenanfrage schließen (E-18); dazu der Verteilplan fremder Ausschreibungen, lesbar **und weiterschaltbar** (E-19). Alle geschlossen und gegen das echte Schema bewiesen, ebenso E-14 (Matching) — offen bleibt allein E-11 als Owner-Frage. Details unten. |

### Zwei Blocker, die nur der Owner lösen kann

**Die gesamte CI läuft seit dem 2026-06-24 nicht.** Selbst über die GitHub-API
geprüft: alle Jobs enden mit `Schritte: 0`, GitHub sagt wörtlich *„The job was
not started because your account is locked due to a billing issue."* Kein
einziger erfolgreicher Lauf seit zwei Monaten.

**`mutation.yml` liegt nicht auf dem Default-Branch.** GitHub feuert `schedule`
nur dort. `main` steht auf `fd9a3ab` (01.06.) und ist **400 Commits zurück**;
`gh workflow list` kennt nur `ci.yml`. Der frühere Abschluss-Vermerk zu M0-B1
(auch in `TRIAGE.md:127`) hat den Branch nicht geprüft, der die Sache
entscheidet. Die dokumentierten Ursachen (Zeitgrenze 90 min, `incremental`) sind
dagegen längst behoben — `timeout-minutes: 180`, sechs parallele Matrix-Jobs.

## Offene Owner-Entscheidungen

> Diese Liste wird per Test gegen die Arbeitspläne abgeglichen.

- ~~**D-E3**~~ ✅ entschieden 2026-08-13: **Weg (a)**. Ursprünglich: Weg für Welle D6 (DSGVO für Profile ohne Konto): zweiter Einstieg für
  Profil-IDs **(a, empfohlen)** oder Vereinheitlichung der bestehenden Löschpfade (b).
  *Ein Löschpfad, der heute nachweislich richtig ist, wird nicht umgebaut, um zwei
  Zeilen zu sparen.*
- ~~E-E1/E-E2/E-E3~~ ✅ entschieden am 2026-08-13 (siehe features/E_LIVE_BELEGSCHAFT.md):
  voller Umfang, Abmeldung ans Profil, echtes Zustands-Protokoll.
- ~~**G-E1**~~ ~~**G-E2**~~ ~~**G-E3**~~ ~~**G-E4**~~ ~~**G-E5**~~ ~~**G-E6**~~ ~~**G-E7**~~ ~~**G-E8**~~ ✅ entschieden am 2026-08-15 (Selbsterfassung von Abwesenheit,
  siehe features/G_ABWESENHEIT_SELBSTERFASSUNG.md): **sofort wirksam** statt auf Antrag,
  mit **Schalter je Zeitarbeitsfirma** für den Rückfall auf Antragspflicht · **alle vier
  Arten** selbst meldbar · **Einsatzportal UND eigener Reiter**, nicht später · die Meldung
  ist **absichtlich mehrstufig**, damit sie niemand versehentlich auslöst · **Zeitsperre von
  einer Minute je Schritt**, serverseitig erzwungen · **auch der Kunde wird benachrichtigt**
  (Ausfall und Ersatz) — **ohne die Art der Abwesenheit**, weil „krank" ein Gesundheitsdatum
  nach Art. 9 DSGVO ist und der Kunde ein Dritter · **mindestens 30 Woerter Beschreibung**,
  erreicht ueber vier strukturierte Fragen statt eines leeren Textfelds — und dieser Text
  bleibt beim Arbeitgeber.

- ~~**D-M1**~~ ✅ entschieden 2026-08-19: **Wächter, nicht konsolidieren.**
  Die 80 Kopien sind untereinander einheitlich; alle zehn echten Defekte lagen
  dort, wo *keine* stand. Der Helfer taugt in heutiger Form nicht als Ziel
  (22 Tabellen ohne `timesheets`/`invoices`/`worker_profiles`, keine zweiseitige
  Grenze, eine Extra-Abfrage je Aufruf). Umgesetzt als
  `api/test/orgGrenzenWaechter.test.js`.
- **D-M2 (neu)** — **Null-Politik.** Darf eine Anfrage ohne `req.orgId` durch?
  Heute dreigeteilt: 42 Stellen `if (req.orgId && …)` (fail-open), 14 fail-closed,
  `timesheets.js:67` mit eigener Legacy-Ausnahme. Der neue Code ist durchgehend
  fail-closed. Der saubere Ort für eine Vereinheitlichung ist eine Middleware
  `requireOrgContext`, die vor dem Handler mit 403 abbricht — nicht das
  Umschreiben von 80 Vergleichen. Vorbild existiert (`suppliers.js:46`,
  `workforce.js:58`). *Berührt Produktionscode auf breiter Fläche → Owner.*
- **D-M3 (neu)** — **Audit-Zeilen ohne `org_id`.** `GET /organizations/:id/audit-log/recent-changes`
  filtert jetzt strikt (`al.org_id = $3`). Gemessen: 1782 von 2711 Audit-Zeilen
  tragen keine Org, 416 von 920 Entitäten wären damit unsichtbar. Heute
  folgenlos (kein Aufrufer). Sobald die Route einen bekommt: strikt lassen
  (kein Leck, leere Historie) **oder** wie die RLS-Policy `org_id IS NULL`
  durchlassen (vollständige Historie, Rest-Leck)? *Owner.*
- **D-M5 (neu)** — **Nutzer- statt Org-Grenze in `capacityExchange` und
  `marketplace`.** Beide binden über `req.session.userId`, nicht über die
  Organisation. Ein Kollege derselben Firma sieht die Einträge seines Teams
  nicht. Zusammen mit **E-11** (der Helfer, der genau das reparieren sollte und
  nie funktioniert hat) und **D-M4** ist das *ein* Thema: soll die
  Zusammenarbeit innerhalb einer Organisation überhaupt möglich sein? Die
  Antwort entscheidet über drei Stellen gleichzeitig. *Owner.*
- **D-M4 (neu)** — **`PATCH /requisitions/:id` begrenzt per `created_by`**, nicht
  per Org. Die Org-Grenze steht jetzt zusätzlich davor (E-4), die
  Ersteller-Bedingung ist unangetastet. Nebeneffekt bleibt: ein Kollege
  derselben Org kann die Ausschreibung eines anderen nicht bearbeiten. Absicht
  oder Altlast? *Produktentscheidung, kein Sicherheitsthema.*

## Offene Befunde ohne Ticket

- **M0-B1 (neu, 2026-08-15)** — **Der nächtliche Mutations-Job ist nie gelaufen.**
  `.github/workflows/mutation.yml` entstand am 2026-08-12, `origin` steht auf dem
  Stand vom 2026-08-06 und ist **57 Commits zurück**. Die Übergabe hat ihn bis
  heute als bestehend geführt. Zwei Folgepunkte: seine Zeitgrenze (90 min) liegt
  unter der gemessenen Laufzeit (1 h 49 min), und `incremental: true` bringt in CI
  nichts. Alle drei gehören in Welle M6 — der Push der 57 Commits ist eine
  Owner-Entscheidung, keine Nebenbei-Aufgabe.
- **M0-B4/B8 (neu)** — Zwei Werte werden erzeugt und von niemandem gelesen:
  `req.locationScope` (`middleware/orgContext.js`) und
  `surface_access.multi_location` (`userService.js:290`; die Standort-Karte gatet
  über `org_settings`). Kein Fehler nach außen, aber Felder, die Verlässlichkeit
  vortäuschen.
- **M0-B7 (neu)** — Die zentrale Mandantengrenze `assertOrgOwnership` erlaubt **23
  Tabellen und wird genau einmal aufgerufen** (`routes/requisitions.js`, viermal,
  immer mit `'requisitions'`); `assertUserOwnership` hat **gar keinen** Aufrufer.
  Das ist derselbe Befund wie [ORG_GRENZE_BEFUND.md](ORG_GRENZE_BEFUND.md) von der
  anderen Seite und gehört zur offenen Entscheidung **D-M1**.
- **M0-B6 (neu)** — `enterpriseSurfaceAccessService.js:157-159` prüft doppelt
  (`coMode === "full"` ist gleichbedeutend mit `isSenior`). Vier Mutanten sind
  dadurch nicht tötbar — kein Testproblem, ein Codeproblem.
  *Alle drei berühren Produktionscode und wurden deshalb nicht angefasst: P12
  verbietet das ausdrücklich.*
- **Welle 3b** — 80 Mandantengrenzen stehen einzeln in 18 Route-Dateien.
  Braucht Owner-Freigabe, weil ihre Auflösung Produktionscode berührt.
- **P1-14** `reputationService` hat keinen Aufrufer. Präzisiert am 2026-08-13:
  das Bounty `top_supplier` ist **bereits abgeschaltet** (`is_active = f` mit
  Begründung in der Datenbank, Mig 166) — offen ist nur noch, **wann** die
  Reputation neu gerechnet wird (Cron oder ereignisgesteuert). Kein Fehler nach
  außen, eine ruhende Funktion.
- ~~**P1-15** Notfall-Antwortpfad liefert 500~~ ✅ **geschlossen 2026-08-13**
  (Migration 180; Beleg `test/integration/notdienstAntwortpfad.flow.test.js`, 5/5).
- **Owner-eigene Punkte:** Secret-Rotation (inkl. Web3Forms-Key in der Git-Historie),
  Staff-CC-Betriebseinrichtung, Backup-Wiederherstellungsprobe.

---

## Die eine Lektion, die sich durch alles zieht

**Ein Test, der das Ergebnis prüft statt WELCHE Abfrage lief, beweist nichts.**

Sie ist in dieser Codebasis fünfmal unabhängig aufgetreten — bei der Standortbindung,
beim Schutz des letzten Eigentümers, beim Standort-Cache, bei der Flächenmatrix, und
einmal in einem Test, den ich selbst gerade geschrieben hatte. Der Mock beantwortet
jede Abfrage gleich, der Code fällt in einen anderen Zweig, das Ergebnis sieht
identisch aus — und die Suite bleibt grün.

Zweite Fassung derselben Lektion: **doppelte Logik braucht doppelte Tests.** Derselbe
Guard steht zweimal in `middleware/rbac.js`; die erste Runde deckte nur eine Kopie ab.
Coverage kann das prinzipiell nicht sehen — beide Kopien werden ausgeführt, also gelten
beide als abgedeckt.
