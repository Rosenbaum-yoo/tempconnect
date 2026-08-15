# Übergabe — was eine neue Sitzung wissen muss

> **Diese Datei wird geprüft, nicht gepflegt.** `api/test/uebergabe.test.js` wird rot,
> sobald in einem Arbeitsplan eine offene Owner-Entscheidung auftaucht, die hier fehlt.
> Eine Übergabe, die man vergessen kann, ist keine.

**Stand: 2026-08-16** · Branch `release/enterprise-premium-market-ready`

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
Stand: **8515 Tests** (2026-08-15, voller Lauf ohne Pipe, 0 Fehler), davon 13 übersprungen — die DB-gebundenen, die nur im Container laufen.

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
| [ORG_GRENZE_BEFUND.md](ORG_GRENZE_BEFUND.md) | Warum die Mandantengrenze 80-mal einzeln in den Routen steht — versionierte Fassung des wichtigsten Architekturbefunds |
| [FLAECHEN.md](FLAECHEN.md) | Was gehört ins Staff CC, was ins OCC, was ins Support Center. **Vor jedem neuen Modul lesen**, wird per Test erzwungen. |
| [TESTING.md](TESTING.md) | Testarchitektur, inkl. Mutation Testing und seiner zwei Fallen |
| [features/G_ABWESENHEIT_SELBSTERFASSUNG.md](features/G_ABWESENHEIT_SELBSTERFASSUNG.md) | Abwesenheit, vom Mitarbeiter selbst gemeldet — sechs Wellen. Enthaelt die Owner-Entscheidungen G-E1 bis G-E6 (sofort wirksam, Schalter fuer Antragspflicht, alle vier Arten, Einsatzportal + eigener Reiter, absichtliche Huerde, Zeitsperre je Schritt). |
| [features/P11_DOKUMENTATION_ALS_SYSTEM.md](features/P11_DOKUMENTATION_ALS_SYSTEM.md) | Doku als System: generiert statt gepflegt, drei Leser (Investor/Owner/Technik), Hilfebereich. 11 Wellen, W1 laeuft. **Owner-Grundprinzip fuer alle Projekte.** |
| [PLATTFORM_REGISTER.md](PLATTFORM_REGISTER.md) | Das Inventar: jede Flaeche, jeder Endpunkt, jede Faehigkeit, mit Beleg und Zustand. Grundlage der Investoren- und Bedienungsdoku. Wird per `dokuWaechter.test.js` gegen den Code gehalten. |
| [TEAM_UND_ROLLEN.md](TEAM_UND_ROLLEN.md) | Wen dieser Code verlangt: Fachbereiche, Erfahrungsstufen, Minimalbesetzung, Reihenfolge der Einstellung — gemessen, nicht geschaetzt. |
| [investoren/WIE_WIR_BAUEN.md](investoren/WIE_WIR_BAUEN.md) | Das Dokument zum Zeigen: Ingenieursstandard mit Belegen, inkl. eines Abschnitts „Was noch nicht steht“. **Intern**, bis der Owner ueber Veroeffentlichung entscheidet (DOK-E3). |
| [qualitaet/mutation/2026-08-14-rbac/](qualitaet/mutation/2026-08-14-rbac/README.md) | Archivierter Mutations-Prüfbericht (voller Lauf, 91,33 %, 1292 Mutanten). Datiert abgelegt, damit der nächste Lauf ihn nicht überschreibt. |
| [features/P12_MUTATION_AUFRAEUMEN.md](features/P12_MUTATION_AUFRAEUMEN.md) | Aufräum-Wellen M0–M6 für die 112 überlebenden Mutanten. **M0 erledigt** (2026-08-15), als nächstes M1. |
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

| Datei | Score | Gate |
|---|---|---|
| `services/rbacService.js` | 95,87 % | ✅ |
| `utils/orgContext.js` | 93,94 % | ✅ |
| `services/enterpriseSurfaceAccessService.js` | 89,29 % | ✅ |
| `middleware/rbac.js` | 87,82 % | ✅ |
| `middleware/orgContext.js` | 86,96 % | ✅ |
| `utils/orgBoundary.js` | 82,20 % | ✅ |

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

## Wo es weitergeht *(Stand 2026-08-16)*

**P12 ist vollständig abgeschlossen** — M0 bis M6. Alle 39 zugriffsrelevanten
Fälle sind mit Tests geschlossen, im Aggregat gemessen (**94,43 %**, 1219 von
1292), und der Wächter läuft ab Montag 04:30 UTC wöchentlich. **Er wird rot, wenn
ein A-Fall wieder überlebt — nicht, wenn eine Zahl sinkt.**

**Der Push ist erfolgt** (Owner-Freigabe 2026-08-15): 66 Commits, `origin` ist auf
Stand, `mutation.yml` liegt auf GitHub. Damit ist M0-B1 geschlossen — der Befund,
der die ganze Spur ausgelöst hat.

**Nächster Schritt: G1** — die Datenschicht der Abwesenheits-Selbsterfassung
(features/G_ABWESENHEIT_SELBSTERFASSUNG.md). Acht Owner-Entscheidungen liegen vor,
die Wellen G1–G6 sind geschnitten. G1 macht eine Meldung des Mitarbeiters von
einer des Disponenten unterscheidbar und legt den Schalter für die Antragspflicht
an.

### Was am 2026-08-15/16 entstanden ist

| | |
|---|---|
| **P12/M0–M6** | 112 Mutanten eingestuft (39 A · 32 B · 41 C), gegengelesen, in fünf Wellen geschlossen, Aggregat gemessen, CI-Job als Matrix neu zugeschnitten |
| **Drei Produktionscode-Befunde** | M0-B7 war ein echter Defekt (Tabellenliste als Abschrift, 17 statt 22 — fünf Tabellen liefen nie durch die Mandantengrenze); M0-B6 und M0-B8 bleiben mit begründetem Kommentar stehen |
| **Schema-Wächter repariert** | Der Fingerabdruck hing an den Zeilenenden und konnte nur in einer Welt grün sein. Jetzt vereinheitlicht, in Host **und** Container gegengeprüft |
| **Neues Werkzeug** | `mutation-welle.js` (misst eine Datei, ohne das Archiv zu überschreiben) · `mutation-archivieren.js` (datierter Auszug, überschreibt nie) · `mutation-neuverankern.js` (führt die Triage nach, wenn Code sich verschiebt) |
| **Werkzeugkasten** | projektübergreifend unter `Desktop/_QUALITAETS-WERKZEUGKASTEN/` — Wächter und Mutation Testing für alle zwölf Projekte |

### Zwei Dinge, die eine neue Sitzung wissen muss

**Das Repo ist öffentlich.** Am 2026-08-15 sind zwölf Geschäftsunterlagen
versehentlich gepusht worden — nicht durch `git add -A` (die Regel dagegen war
bekannt), sondern durch **`git add docs/`**. Ein Pfad-Präfix genügt. Inhalt war
durchweg Platzhalter, die Historie wurde umgeschrieben, `.gitignore` sperrt die
Pfade jetzt. **Immer einzelne Dateipfade stagen, nie ein Verzeichnis.**

**Wer Produktionscode anfasst, muss die Triage nachführen.** `triage.json` trägt
zwei Anker: `zeile_bericht` verankert an der Messung vom 14.08. und bewegt sich
nie, `zeile` zeigt auf den heutigen Code. Nach jeder Codeänderung in den sechs
gemessenen Dateien:

```bash
cd api && node scripts/mutation-neuverankern.js --von HEAD~1 --bis HEAD
cd api && node scripts/mutation-welle.js <datei> && node scripts/mutation-triage.js --welle <datei>
```

Ohne das meldet der Montags-Lauf „Überlebende, die die Einstufung nicht kennt" —
ein Fehlalarm, und ein falsch-roter Wächter wird abgeschaltet statt repariert.

---

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

- **D-M1** — Welle 3b: die 80 Inline-Org-Grenzen konsolidieren oder einen
  Wächter-Test bauen? Erst 3b.2 abwarten (zeigen die Kopien Abweichungen?).

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
