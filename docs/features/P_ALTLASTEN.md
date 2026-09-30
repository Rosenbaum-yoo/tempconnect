# Welle P — Altlasten

> **Status: Bauanweisung, freigegeben 2026-09-05.**
> Owner-Vorgabe: *„es gibt hier viel Legacy, das müssen wir dann bald mal entfernen."*
>
> **Gebaut von der bauenden Sitzung, gegengeprüft von der planenden** — siehe
> [`../UEBERGABE.md`](../UEBERGABE.md), Abschnitt „Wer baut, wer prüft".

---

## 0. Die Unterscheidung, an der so eine Aktion scheitert

**Tot** und **noch nicht angeschlossen** sehen im Code **identisch** aus — beide haben keinen
Aufrufer — und verlangen das **Gegenteil**:

| | |
|---|---|
| **tot** | entfernen |
| **noch nicht angeschlossen** | verdrahten, **auf keinen Fall entfernen** |

**Der Beweis, dass das keine Theorie ist:** `partial_fulfillment_allowed` (Mig 070) wird von
keiner Zeile Code gelesen. Sie sieht tot aus. Der Arbeitsplan M sieht sie in **M5.9**
ausdrücklich vor („alle 30 oder keiner"). Wer sie entfernt, löscht eine geplante Fähigkeit.

**Deshalb ist jeder Posten hier gegen die Arbeitspläne gehalten** (M, N, O, K, J) und in vier
Klassen sortiert: **A entfernen · B anschließen · C behalten · D erst messen.**

---

## 1. Zur Herkunft dieser Liste — und ihrer Grenze

**Alles hier stammt aus eigener Messung im Lauf des 2026-08-28 bis 2026-09-05**, jeweils mit
Beleg. Was aus einer *unbestätigten* Quelle kommt, steht ausdrücklich in **Klasse D** und
nicht in A.

> **Ein systematischer Durchlauf steht noch aus.** Er war gestartet (vier Sucher, vier
> Gegenprüfer, ein Register) und ist **vollständig am Sitzungslimit gescheitert** — null
> Ergebnisse. Diese Liste ist deshalb **belastbar, aber nicht vollständig**: sie enthält, was
> beim Bauen nebenbei aufgefallen ist, nicht das Ergebnis einer Suche über den ganzen Baum.
>
> **Für die bauende Sitzung heißt das:** Klasse A ist belegt und kann angefasst werden. Wer
> darüber hinaus aufräumen will, misst vorher — und trägt den Fund hier nach.

---

## 2. Klasse A — entfernen

Sortiert nach Nutzen. Die ersten drei machen den größten Unterschied.

### A1 · Die zweite Limit-Tabelle *(Geld — die verkaufte Zusage gilt nicht)*

`capacityExchangeService.js:18` führt eine **eigene** `PLAN_LIMITS`-Tabelle (PRO: 50
Angebote) neben der kanonischen in `userService.js:165` (PRO: unbegrenzt). Die Middleware
lässt eine PRO-Agentur unbegrenzt durch, der Dienst schneidet bei 50 ab.

**Wirksam ist der niedrigere Wert — die verkaufte Zusage „unbegrenzt" gilt faktisch nicht.**

| | |
|---|---|
| **Entscheid** | **M-E3: unbegrenzt.** Der abweichende Wert wird **gelöscht**, nicht angeglichen |
| **Aufwand** | klein |
| **Risiko** | Tests, die auf 50 pinnen, werden rot — das ist der Zweck, nicht der Schaden |
| **Danach** | **Ein-Schreiber-Wächter** (M11.3): zwei Wahrheiten für dieselbe Grenze werden rot |

### A2 · `api/.stryker-tmp` — 124 MB, und es verfälscht Messungen *(Geschwindigkeit und Richtigkeit)*

Eine vollständige Kopie von `routes/`, `services/` und `test/` — mit **veralteten
Zeilennummern**. Sie ist gitignored, liegt aber im Baum.

**Der Schaden ist nicht die Größe, sondern die Verwechslung:** jede rohe `grep -r`-Suche
findet alles doppelt, und wer dort liest, **belegt seine Aussage mit einem Stand von
vorgestern.** In dieser Sitzung sind mehrere Suchen daran ins Zeitlimit gelaufen.

| | |
|---|---|
| **Was** | Verzeichnis entfernen; der Mutationslauf legt es bei Bedarf neu an |
| **Aufwand** | Minuten |
| **Risiko** | keines — es ist ein Zwischenspeicher |
| **Danach** | Prüfen, ob der Läufer es nach jedem Lauf selbst aufräumt |

### A3 · Drei Tests, die einen Defekt festschreiben *(Verständlichkeit — und eine Falle für den nächsten)*

| Test | Was er festnagelt |
|---|---|
| `workers.route.coverage.test.js:705` | `resendInvite` wirft bei unbekannter ID einen **TypeError → 500 statt 404**, weil der Handler `result.error` auf `null` prüft. Der Test dokumentiert es als „the actual contract" |
| `workers.route.coverage.test.js:729` | `revoke` antwortet bei **fremder ID** mit `{ok:true}` und schreibt **ein Audit-Ereignis ohne Tat** |
| `marketplaceGateChain.test.js:118` | pinnt eine Antwortform mit `details`-Umschlag, **die der Server nie sendet** — grün, und beweist nichts |

**Warum das gefährlich ist:** ein künftiger Fix macht diese Tests **rot**, und wer sie ohne
Kontext liest, hält den **Fix** für den Fehler.

| | |
|---|---|
| **Was** | Die zwei Defekte **beheben** (404 statt 500; `revoke` meldet ehrlich), den dritten Test auf die tatsächliche Antwortform stellen |
| **Und dann** | Konvention **BEFUND** einführen (M11.5): ein Test, der einen Defekt festschreibt, trägt es im Namen. Ohne Kennzeichnung gilt ein Test als **Zusage** |

### A4 · Der tote Rückweg von `result.notices`

Der Import meldet stille Korrekturen (`workers.js:713`, `result.notices`) — **kein Frontend
liest sie.** Angezeigt werden Korrekturen aus einer **zweiten, eigenen Umwandlung im
Browser** (`mitarbeiter.js:3712`). Zwei Implementierungen desselben Gedankens, eine davon
ohne Empfänger.

**Entscheid nötig:** die Serverantwort anschließen **oder** sie entfernen. Beides ist besser
als der heutige Zustand — zwei Wahrheiten über dieselbe Umwandlung.

### A5 · Zwei Werte, die Verlässlichkeit vortäuschen

- `req.locationScope` (`middleware/orgContext.js`) — erzeugt, **von niemandem gelesen**
- `surface_access.multi_location` (`userService.js:290`) — erzeugt, **von niemandem gelesen**
  (die Standort-Karte gatet über `org_settings`)

Kein Fehler nach außen. Aber ein Feld, das aussieht, als würde es etwas steuern, ist eine
Falle für den Nächsten, der darauf baut.

### A6 · `api/services/__rm_aktionen.mjs`

Eine ungetrackte Arbeitsdatei im Baum, aus einem früheren Mutationslauf. Gehört nicht dorthin.

---

## 3. Klasse B — anschließen, **nicht** entfernen

> **Nach dem 2026-09-21 neu messen, bevor hier etwas eingestuft wird.** In der laufenden
> Datenbank fehlten bis dahin **15 Migrationen** (204–218): der Takt-Herzschlag, die Feed-Kopie,
> der sichtbare Rabatt und weitere. Ein Dienst, der „vollständig gebaut, tut aber nichts"
> aussah, war möglicherweise **doppelt tot** — kein Aufrufer *und* kein Schema. Seit die 235
> Migrationen angewandt sind, liest sich ein Teil dieses Registers womöglich anders. **Jede
> Einstufung hier stammt aus der Zeit davor.**

**Diese sieben sehen tot aus und sind es nicht.** Jeder Posten nennt die Phase, die ihn
vorsieht. Wer hier aufräumt, löscht geplante Fähigkeiten.

| Gegenstand | Beleg | Sieht tot aus, weil | Vorgesehen in |
|---|---|---|---|
| `partial_fulfillment_allowed` | Mig 070:7 | kein Leser im ganzen Repo | **M5.9** — „alle 30 oder keiner" |
| `org_settings.default_radius_km` | Mig 020:103 | kein Leser | **M-E11** — der Fahrdienst-Radius der Firma |
| `preferredSuppliersOnly()` | `settingsService.js:68` | kein Aufrufer | **O5.1** — bevorzugter Lieferant wird wirksam |
| `smartPricingService` (`/api/pricing/suggest`) | Router vorhanden | **null** Frontend-Aufrufer | **N2.2** und **N7.2** — der Preisvorschlag |
| `capacityDiscoveryService` (4 Endpunkte) | Router vorhanden | **null** Frontend-Aufrufer | **N1.3** und **N7.1** — Bestand und Nachfragesignal |
| Der Notdienst-Router (7 Endpunkte) | `routes/emergency.js` | kein Frontend-Aufrufer | **N7.4** / **M10.7** — der Leitstand |
| `negotiate-deal` auf der Buchungsfläche | `marketplace.js:769` | Aufrufer nur auf anderer Seite | **N5.3** — „Anfrage senden" als dritter Ausgang |

| Der tote Paywall-Schlüssel `sla_access` | ~20 Seiten | ist für **jeden** Plan wahr — der fertige, übersetzte Paywall-Block kann **nie** erscheinen | **M1.5** / **M-E2** — je Seite ein eigener Erstellungs-Schlüssel. **Vorsicht:** der naheliegende Ersatz `capacity_exchange_basic` ist ebenfalls für alle Pläne offen — ein Ein-Wort-Fix wäre ein No-op |
| `compliance_documents` mit `doc_type = 'aueg_erlaubnis'` | Mig 019:245 | wird von **keinem** Marktplatz-, Kapazitäts- oder Vertragspfad gelesen | **M9.1** / **O1.4** — die Verleiherlaubnis als harte Bedingung |
| `notifyWorkerDocumentExpiring` / `...Expired` | `workerNotificationService.js:346/361` | verdrahtet ab `internal.js:481` — aber der Takt lief nie | **M1** — der Herzschlag; die Aufgabe ist eine der zehn stillen |
| `temp_to_perm` | `capacityExchange.js:50`, `marketplace.js:65` | existiert nur als Aufzählungswert und Beschriftung; „Übernahmegebühr“ hat **null** Treffer | **M8.3** — die Übernahme durch den Kunden |

> **Merksatz für diese Klasse:** *Ein Endpunkt ohne Aufrufer ist kein Müll, solange ein Plan
> ihn vorsieht. Er ist eine halbe Lieferung.*

---

## 4. Klasse C — behalten, mit Grund

| Gegenstand | Warum es bleibt |
|---|---|
| `reputationService` ohne Aufrufer | Das zugehörige Bounty ist abgeschaltet (Mig 166, mit Begründung in der Datenbank). Ruhende Funktion, kein Fehler. Offen ist nur, **wann** neu gerechnet wird |
| Das Rollenmodell mit sechs Staff-Rollen | Kostet nichts und greift ab der zweiten Person automatisch (`CLAUDE.md`, „Das Team ist eine Person"). **Nicht abbauen** |
| Die OCC-Module | Owner-Entscheid 2026-08-27: das OCC zieht ins Staff CC. Bis der Abschnitt ausgearbeitet ist: **keine anlegen, keine entfernen** |

---

## 5. Klasse D — erst messen, dann entscheiden

**Was hier steht, ist eine Spur, kein Befund.** Es stammt aus einem Lauf, dessen Gegenprüfer
am Sitzungslimit gescheitert sind — **ungeprüft**, und in dieser Sitzung schon zweimal hat
sich eine ungeprüfte Ableitung als falsch erwiesen.

| Spur | Was zu messen wäre |
|---|---|
| **`esc()` schützt womöglich nicht in Attributposition** | Mehrere `esc()`-Fassungen sollen über `textContent → innerHTML` gebaut sein und deshalb **keine Anführungszeichen** escapen. In Attributposition wären sie wirkungslos — und sähen im Code wie abgesichert aus. **Wenn das stimmt, ist es kein Aufräumen, sondern ein Sicherheitsbefund.** Zuerst messen: welche `esc()`-Definitionen gibt es, und was escapen sie? |
| **Inline-Rollenprüfungen** | Das Wachregister führt `inline-rolle` als *zulässige* Wachart, zehn Wege stehen so drin. Die Sperrklinke zählt sie nicht mit — die Zahl darf unbegrenzt wachsen. Zu messen: sind es noch zehn? |
| **`withTransaction` bei Mehrfach-Schreibern** | Geprüft wird heute die Hilfsfunktion, nicht ihr Einsatz. Zu messen: wie viele Dienste schreiben mehrfach ohne Klammer? |
| **Der systematische Durchlauf** | Vier Klassen über den ganzen Baum — steht noch aus |
| **Die Feed-Kopie füllt sich auf der Unternehmensseite nie** *(gemessen 2026-09-08, keine Spur)* | `istKopierwuerdig` bricht bei gesetzter `viewer_company_org_id` ab (`feedKopieService.js:125`) — **richtig so**, eine um die Sperren EINES Kunden beschnittene Liste darf nicht die Kopie für alle werden, und die Probe dafür steht. Nur: `orgContext` lässt den Kontext **nie leer** (Rückfall auf die primäre Mitgliedschaft), also trägt **jeder** angemeldete Unternehmens-Betrachter diese Kennung. Damit kann `SEITEN.supply` in der Praxis **nie geschrieben** werden: N4.4 hat zwei Spuren gebaut, von denen sich eine nicht füllen kann, und K4s Zusage „der Feed fällt nie auf leer zurück" gilt nur für die Agenturseite — ausgerechnet nicht für die, die der Owner vorführt. **Zu messen, bevor etwas gebaut wird:** gibt es Unternehmens-Betrachter ohne `orgId`? Wenn nein, ist die Wahl zwischen *ehrlichem Fehler* (heute) und *Kopie je Unternehmen* (geschlüsselt auf die Org statt auf die Marktseite) — und das ist eine Owner-Entscheidung, kein Aufräumen. |

---

## 6. Reihenfolge

```
A2  .stryker-tmp entfernen     ← zuerst: es verfälscht jede weitere Messung
A1  zweite Limit-Tabelle       ← Geld, und M-E3 ist entschieden
A3  die drei Defekt-Tests      ← davon zwei echte Fehlerpfade
A4/A5/A6                       ← klein, sauber
D   messen, was noch Spur ist
```

**A2 steht bewusst vorne.** Solange die 124-MB-Kopie im Baum liegt, ist jede weitere
Altlasten-Suche unzuverlässig — sie findet Dinge doppelt und mit falschen Zeilennummern.
**Wer zuerst aufräumt, misst danach besser.**

---

## 7. Woran gegengeprüft wird

| # | Frage |
|---|---|
| 1 | **Ist nichts aus Klasse B entfernt worden?** Die sieben Posten müssen unverändert dastehen — jeder gelöschte ist ein Rückschritt, kein Fortschritt |
| 2 | **Beißen die reparierten Fehlerpfade?** Unbekannte ID → 404, fremde ID → kein `{ok:true}` und **kein Audit ohne Tat**. Je eine Rückmutation |
| 3 | **Ist die zweite Limit-Wahrheit wirklich weg** — gelöscht, nicht auf 50 angeglichen? |
| 4 | **Legt der Mutationslauf `.stryker-tmp` neu an, und räumt er auf?** |
| 5 | **Trägt jeder Test, der einen Defekt festschreibt, jetzt BEFUND im Namen?** |
| 6 | **Wurde etwas aus Klasse D angefasst, ohne es vorher zu messen?** Das wäre der Fehler, vor dem dieses Dokument warnt |

---

## 8. Was Welle P **nicht** tut

- **Klasse B anfassen.** Sieben Posten, die geplant sind. Finger weg.
- **Aufräumen, was nicht gemessen wurde.** Klasse D wird gemessen, nicht entfernt.
- **Das Rollenmodell abbauen.** Es kostet nichts und greift ab der zweiten Person.
- **OCC-Module anlegen oder entfernen.** Owner-Entscheid 2026-08-27.
- **Migrationen zurückrollen.** Eine tote Spalte bleibt lieber stehen, als dass eine
  Migration halb zurückgenommen wird — das Risiko steht in keinem Verhältnis.
