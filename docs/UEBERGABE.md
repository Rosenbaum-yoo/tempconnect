# Übergabe — was eine neue Sitzung wissen muss

> **Diese Datei wird geprüft, nicht gepflegt.** `api/test/uebergabe.test.js` wird rot,
> sobald in einem Arbeitsplan eine offene Owner-Entscheidung auftaucht, die hier fehlt.
> Eine Übergabe, die man vergessen kann, ist keine.

**Stand: 2026-08-13** · Branch `release/enterprise-premium-market-ready`

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
Stand: **8446 Tests** (5 davon DB-gated, laufen nur im Container), davon 13 übersprungen (DB-gated).

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
| [features/P11_DOKUMENTATION_ALS_SYSTEM.md](features/P11_DOKUMENTATION_ALS_SYSTEM.md) | Doku als System: generiert statt gepflegt, drei Leser (Investor/Owner/Technik), Hilfebereich. 11 Wellen, W1 laeuft. **Owner-Grundprinzip fuer alle Projekte.** |
| [PLATTFORM_REGISTER.md](PLATTFORM_REGISTER.md) | Das Inventar: jede Flaeche, jeder Endpunkt, jede Faehigkeit, mit Beleg und Zustand. Grundlage der Investoren- und Bedienungsdoku. Wird per `dokuWaechter.test.js` gegen den Code gehalten. |
| [TEAM_UND_ROLLEN.md](TEAM_UND_ROLLEN.md) | Wen dieser Code verlangt: Fachbereiche, Erfahrungsstufen, Minimalbesetzung, Reihenfolge der Einstellung — gemessen, nicht geschaetzt. |
| [investoren/WIE_WIR_BAUEN.md](investoren/WIE_WIR_BAUEN.md) | Das Dokument zum Zeigen: Ingenieursstandard mit Belegen, inkl. eines Abschnitts „Was noch nicht steht“. **Intern**, bis der Owner ueber Veroeffentlichung entscheidet (DOK-E3). |
| [qualitaet/mutation/2026-08-14-rbac/](qualitaet/mutation/2026-08-14-rbac/README.md) | Archivierter Mutations-Prüfbericht (voller Lauf, 91,33 %, 1292 Mutanten). Datiert abgelegt, damit der nächste Lauf ihn nicht überschreibt. |
| [features/P12_MUTATION_AUFRAEUMEN.md](features/P12_MUTATION_AUFRAEUMEN.md) | Aufräum-Wellen M0–M6 für die 112 überlebenden Mutanten. **M0 zuerst** — ohne Kategorien wird aus Aufräumen ein Prozent-Treiben. |

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

## Wo es weitergeht *(Stand 2026-08-14, Ende der Sitzung)*

**Fertig heute:** P10 Spur D+E+F abgeschlossen (Mig 177–180) · SQL-Schema-Wächter ·
Doku-Wächter (W2) · Plattform-Register · Team-/Rollenkarte · Investoren-Dokument ·
Mutations-Bericht neu gemessen und archiviert · Redis auf der Go-Live-Liste.

**Nächster Schritt — eines von beiden, nicht beides gleichzeitig:**

| Spur | Erster Schritt | Warum zuerst |
|---|---|---|
| **P12** Mutation aufräumen | **M0** (Kategorien + CI-Job prüfen) | Das Entscheidungs-Gate ist offen; M1–M5 lassen sich ohne M0 nicht priorisieren |
| **P11** Doku als System | **W3** Generator | W1+W2 stehen; der Generator schreibt die ableitbaren Teile fort |

**Zwei Blocker, unabhängig von beiden Spuren** (aus TEAM_UND_ROLLEN.md, verifiziert):
OCC-Abmelden wirkt nicht (`Topbar.tsx:18` ruft `/auth/logout`, unter
`api/routes/occ/` gibt es keinen auth-Router) · `MFA_ENFORCE=true` sperrt den
Eigentümer aus (kein `428`/`MFA_REQUIRED` im OCC-Frontend). Beide harmlos, solange
eine Person arbeitet — gefährlich ab der zweiten.

**Drei Lektionen, die diese Sitzung geprägt haben:**
1. Ein Mock-Test beweist nie, dass SQL zum Schema passt — zwei echte Defekte kamen so durch.
2. Eine Zusage gehört auf die tiefste Ebene, auf der sie noch gilt: DB-Bedingung > Guard > Wächter-Test.
3. `… | tail` maskiert den Status der Testsuite. Nie mit Pipe messen.

---

## Offene Owner-Entscheidungen

> Diese Liste wird per Test gegen die Arbeitspläne abgeglichen.

- ~~**D-E3**~~ ✅ entschieden 2026-08-13: **Weg (a)**. Ursprünglich: Weg für Welle D6 (DSGVO für Profile ohne Konto): zweiter Einstieg für
  Profil-IDs **(a, empfohlen)** oder Vereinheitlichung der bestehenden Löschpfade (b).
  *Ein Löschpfad, der heute nachweislich richtig ist, wird nicht umgebaut, um zwei
  Zeilen zu sparen.*
- ~~E-E1/E-E2/E-E3~~ ✅ entschieden am 2026-08-13 (siehe features/E_LIVE_BELEGSCHAFT.md):
  voller Umfang, Abmeldung ans Profil, echtes Zustands-Protokoll.
- **D-M1** — Welle 3b: die 80 Inline-Org-Grenzen konsolidieren oder einen
  Wächter-Test bauen? Erst 3b.2 abwarten (zeigen die Kopien Abweichungen?).

## Offene Befunde ohne Ticket

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
