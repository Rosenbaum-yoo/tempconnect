# Welle Z — Die Schema-Schulden: Code, der gegen Spalten schreibt, die es nicht gibt

> **Status: Bauanweisung.** Erstellt 2026-09-27 aus einem Befund der planenden und einer
> vollständigen Messung der bauenden Sitzung.
> **Gebaut von der bauenden Sitzung, gegengeprüft von der planenden** — siehe
> [`../UEBERGABE.md`](../UEBERGABE.md), Abschnitt „Wer baut, wer prüft".

---

## 1. Wie diese Welle entstand — und eine Korrektur an der planenden Sitzung

Beim Einordnen der vier lange roten Ablaufproben fiel auf: `offer.counterpartyFirst` endet in
**500**, weil `emergencyStaffingService.js:205` die Spalte `demand_requests.response_window_minutes`
schreibt, die es in der Datenbank nicht gibt. Die planende Sitzung schlug daraufhin einen
**entdeckenden Wächter** vor.

> **Der Wächter existiert längst.** `api/test/sqlSchemaWaechter.test.js` (seit 2026-09-15,
> 1007 Zeilen) prüft genau das — kein Produktionscode schreibt SQL gegen eine unbekannte Tabelle
> oder Spalte, ohne Datenbank, gegen `schema.json`. Und der Befund stand bereits **wörtlich** in
> seiner Bestandsliste (Zeile 738).
>
> **Damit gilt für diese Welle das, was wir anderen sagen: erst messen, dann bauen.** Es fehlt
> nicht die Erkennung, es fehlt die **Behebung**. Der Wächter verlangt sie sogar: seine
> Bestandsliste *darf nur schrumpfen*, und eine eigene Probe hält fest, dass sie nicht „zur
> Ausrede verrottet".

---

## 2. Der Ist-Stand: 16 Befunde in 7 Gruppen

Gemessen von der bauenden Sitzung gegen die **laufende** Datenbank, alle in `BESTAND` mit
Begründung. Hier nach **Kundenwirkung** geordnet — nicht nach Aufwand.

| # | Gruppe | Wirkung |
|---|---|---|
| **1** | `users.reset_token`, `reset_token_expires` | **Der Passwort-Zurücksetzen-Weg wirft.** Wer sein Passwort vergisst, kommt nicht zurück — und meldet es nicht, er geht |
| **2** | `timesheets.worker_signed_at`, `_ip` | **Niemand kann unterschreiben.** Der Wert wird gelesen (`timesheetService.js:544` „schon unterschrieben?", `:688` in einer Auswertung), der Schreibweg wirft — die Auswertung zählt dauerhaft null. Bei Stundenzetteln ist das keine Schönheitsfrage |
| **3** | `state_transitions` (Tabelle) | Der Aufruf steckt in `try/catch` → **stumm leere Zeitleiste**. Kein Fehler, keine Historie |
| **4** | `feature_overrides` (Tabelle) | Migration 059 existiert und ist **als angewandt verbucht**, die Tabelle fehlt trotzdem |
| **5** | `supplier_reputation` (6 Spalten) | Drei Dienste schreiben gegen **drei verschiedene**, je nicht existierende Formen |
| **6** | `vendor_pool_history`, `vendor_pool_notes` | Nie angelegt; wirft beim Lesen **und** beim Schreiben |
| **7** | `demand_requests.response_window_minutes` | Notdienst-500. **Entschieden: der Schreibweg entfällt** (siehe unten) |

### Die Ursache hinter Gruppe 4 — und warum die Momentaufnahme aus der Datenbank kommt

`sql/migrate.sh` verbuchte vor der Umstellung auf `ON_ERROR_STOP=1` **gescheiterte Migrationen
als angewandt**. Das Verzeichnis sagt also nicht die Wahrheit über das Schema. Genau deshalb
zieht `schema-snapshot.js` seine Momentaufnahme aus der **laufenden Datenbank** und nicht aus
den Migrationen — im Kopf der Datei steht der Satz, der diese ganze Welle erklärt:
*„ein migrationsbasierter Wächter meldete grün, während die Produktion 500 wirft."*

---

## 3. Entscheidungen

| Frage | Entscheidung | Warum |
|---|---|---|
| Notdienst-Fenster: Spalte anlegen oder Schreibweg entfernen? | **Schreibweg entfernen** (bauende Sitzung, von der planenden nachgemessen) | **Niemand liest die Spalte.** `reportingService.js:349` liest `urgencyConfig?.responseWindow` aus der **Konfiguration**. Sie zu speichern wäre eine zweite Wahrheit: ändert der Owner den Notdienst von 15 auf 10 Minuten, trügen alte Zeilen weiter 15, während die Auswertung 10 sagt |
| Reihenfolge? | **Nach Kundenwirkung**, nicht nach Aufwand | Vor dem Livegang zählt, was ein echter Mensch anfasst. Passwort und Stundenzettel schlagen Reputation und Lieferantenhistorie |
| Anlegen oder entfernen? | **Je Gruppe einzeln entschieden und begründet** | Eine Spalte anzulegen, die niemand liest, vergrößert die Schuld statt sie zu tilgen |

---

## 4. Wellen und Phasen

| Phase | Inhalt | Nachweis |
|---|---|---|
| Z1 | **Passwort zurücksetzen** (Gruppe 1): Migration mit Rücknahme, Ablaufzeit als Pflichtfeld | Ein vergessenes Passwort führt wieder zurück ins Konto. **Rückmutation:** Spalte entfernen → rot |
| Z2 | **Die Unterschrift des Arbeiters** (Gruppe 2): Migration; `worker_signed_at` und `_ip` werden geschrieben, wo sie heute schon gelesen werden | Unterschrift wird gespeichert; die Auswertung zählt nicht mehr dauerhaft null |
| Z3 | **Die Zeitleiste** (Gruppe 3): Tabelle anlegen **oder** den Aufruf entfernen — aber der stille `catch` verschwindet in jedem Fall | Kein stummer Ausfall mehr: entweder Historie oder ehrliche Abwesenheit |
| Z4 | **`feature_overrides` und das Verzeichnis** (Gruppe 4). **Gemessen 2026-09-27 von der planenden Sitzung:** `059_feature_overrides.sql` steht **als angewandt verbucht**, die Tabelle existiert nicht — der Beleg für die Ursache oben. Das Verzeichnis führt **239** Buchungen, das Repository **226** Dateien; die 13 Differenzen sind **Altnamen** zusammengefasster Migrationen (`002_marketplace.sql` …). **Die gefährliche Richtung ist sauber: keine einzige Datei ist ungelaufen.** | Tabelle nachziehen oder Nutzung entfernen — **und ein Wächter, der OBJEKTE vergleicht, nicht Namen:** eine als angewandt verbuchte Migration, deren Tabelle oder Spalte fehlt, wird rot. Der Namensvergleich allein hätte hier grün gemeldet |
| Z5 | **Reputation** (Gruppe 5): **die Tabelle `supplier_reputation` existiert** — es fehlen **Spalten**, und drei Dienste schreiben gegen drei verschiedene Formen. Erst messen, welche gemeint war | Drei Dienste, ein Schema |
| Z6 | **Lieferantenhistorie** (Gruppe 6): anlegen oder Lese- und Schreibweg entfernen | Kein Weg wirft mehr |
| Z7 | **Notdienst** (Gruppe 7): Schreibweg entfernen | `offer.counterpartyFirst` grün |
| Z8 | **Die Bestandsliste schrumpft sichtbar.** Je behobener Gruppe fällt ihr Eintrag aus `BESTAND` | Der Wächter zählt weniger Ausnahmen; seine Probe gegen das Verrotten bleibt grün |
| Z9 | **Eine Zeile, die es nicht geben dürfte** *(gemeldet von der bauenden Sitzung, nachgemessen 2026-09-27: genau 1)*. In `worker_time_submissions` steht eine Einreichung mit `status='accepted_into_timesheet'` **und** `timesheet_id IS NULL`, obwohl der Code beides zusammen setzt. Entweder Altdaten aus einer früheren Fassung oder **ein zweiter Schreibweg daneben** | Erst messen, welcher Weg sie erzeugt haben kann (Datum, Urheber), **dann** entscheiden: Altlast bereinigen oder Lücke schließen. Wenn ein zweiter Weg existiert, ist die Zeile die Spitze und nicht der Fall |

---

## 5. Reihenfolge

**Z7 → Z1 → Z2 → Z3 → Z4 → Z5 → Z6**, Z8 fortlaufend.

> **Z7 zuerst, weil es schon in Arbeit und klein ist** — ein entfernter Schreibweg, kein Schema.
> Danach die beiden, die einen Menschen unmittelbar treffen: **niemand kommt ins Konto zurück**,
> und **niemand kann einen Stundenzettel unterschreiben**. Reputation und Lieferantenhistorie
> sind wichtig, aber sie kosten heute keinen Kunden.

## 6. Woran gegengeprüft wird

| # | Frage |
|---|---|
| 1 | Ist die Bestandsliste kürzer geworden — oder nur die Begründung länger? |
| 2 | Wurde eine Spalte angelegt, die niemand liest? |
| 3 | Bleibt irgendwo ein stiller `catch` stehen, der das Fehlen verdeckt? |
| 4 | Stimmt das Migrationsverzeichnis nach Z4 wieder mit dem Schema überein? |

## 7. Was Welle Z **nicht** tut

- **Einen neuen Wächter bauen.** Es gibt ihn; er hat den Bestand erhoben und verlangt seine Tilgung.
- **Jede fehlende Spalte anlegen.** Wo niemand liest, verschwindet der Schreibweg.
- **Die Bestandsliste kürzen, ohne die Ursache zu beheben.** Das wäre genau die Ausrede, gegen die der Wächter eine eigene Probe hat.
