# Spur E — Echte Live-Belegschaft

**Owner-Abschnitt 6.** Wellen und Gates. Die Owner-Entscheidungen sind am
2026-08-13 gefallen und unten festgehalten.

---

## E1 ist erledigt *(2026-08-13)* — gemessen, nicht vermutet

Die Reihenfolge war bewusst: erst messen, welche Zustände überhaupt eine
Datenquelle haben, dann entscheiden. Sonst fallen Entscheidungen über Reiter,
die sich nicht befüllen lassen.

**Was heute schon berechnet wird** (`api/services/workforceService.js:567`):

| Zustand | Herleitung |
|---|---|
| `inaktiv` | `worker_profiles.is_active = FALSE` |
| `verfuegbar` | kein laufender Einsatz |
| `endet_bald` | Einsatz endet innerhalb `LIVE_BOARD_ENDS_SOON_DAYS` |
| `im_einsatz` | laufender Einsatz vorhanden |

Zwei der vier vom Owner gewünschten Zustände sind damit bereits da: *verfügbar*
und *besetzt* (als `im_einsatz`, mit `endet_bald` als Verfeinerung).

**Für „krank" gibt es nur eine halbe Quelle.** Migration 073 legte
`unavailable_from`, `unavailable_reason` und `unavailable_reported_at` an — aber
auf `worker_assignment_links`, also am **Einsatz**, nicht am Menschen. Zwei
Folgen:

1. Der Grund ist **Freitext**. Krank, Urlaub und Arzttermin sind nicht
   unterscheidbar, ohne in Text zu raten.
2. Wer gerade **keinen** Einsatz hat, kann sich überhaupt nicht abmelden — die
   Abwesenheit hängt an einem Auftrag, den es nicht gibt.

**Für „Montage" gibt es keine Quelle.** Es ist auch kein Zustand des Menschen,
sondern eine Eigenschaft des Einsatzes (auswärts mit Übernachtung). Muss erst
erfasst werden.

---

## Owner-Entscheidungen *(2026-08-13)*

| Kennung | Frage | Entscheidung |
|---|---|---|
| **E-E1** | Welche Zustände führt die Live-Belegschaft? | ✅ **Alles zusammen** — die vier vorhandenen plus `abwesend`, plus getrennte Abwesenheitsgründe, plus Montage/Auswärtseinsatz |
| **E-E2** | Abmeldung am Einsatz oder am Profil? | ✅ **Ans Profil verlagern.** Abwesenheit gehört zum Menschen, nicht zum Auftrag — eine Zeitarbeitsfirma will wissen, wer nächste Woche krank ist, auch ohne laufenden Einsatz |
| **E-E3** | Verlauf ableiten oder protokollieren? | ✅ **Echtes Zustands-Protokoll.** Jede Änderung wird mitgeschrieben — genauer und audit-fest |

---

## E.2 Wellen

### Welle E2 — Das Datenmodell für Abwesenheit *(zuerst)*

Ohne sie kann E3 nichts anzeigen und E4 nichts protokollieren.

- Neue Tabelle `worker_absences`: `worker_profile_id` (nicht `assignment_id`!),
  `von`, `bis`, `art`, `notiz`, `erfasst_von`, `erfasst_am`.
- `art` als **CHECK-Liste**, nicht Freitext: `krank`, `urlaub`, `termin`,
  `sonstiges`. Freitext war genau der Grund, warum die vorhandenen Felder
  nichts hergeben.
- Die alten Felder auf `worker_assignment_links` bleiben zunächst — sie tragen
  Bestandsdaten. **Migrationspfad und Stichtag im Rollback-Block benennen.**
- Überlappungen: höchstens eine aktive Abwesenheit je Mensch und Tag
  (Teil-Index), sonst zeigt die Tafel zwei Zustände gleichzeitig.

**Gate E2:** Eine Abwesenheit lässt sich für einen Mitarbeiter **ohne laufenden
Einsatz** erfassen und erscheint in der Live-Belegschaft. Ein Test belegt, dass
sich zwei überlappende Abwesenheiten nicht anlegen lassen.

### Welle E3 — Montage als Eigenschaft des Einsatzes

- Feld am Einsatz (`worker_assignment_links` oder `assignments` — **erst prüfen,
  wo es fachlich hingehört**), nicht am Menschen.
- Erfassung in der Oberfläche, sonst bleibt das Feld leer und der Reiter tot.

**Gate E3:** Ein als Montage erfasster Einsatz erscheint in der Live-Belegschaft
unter Montage statt unter „im Einsatz". Ohne Erfassung kein Reiter — ein leerer
Reiter ist schlimmer als keiner.

### Welle E4 — Die Reiter

- Reiter je Zustand: verfügbar · im Einsatz · endet bald · Montage · abwesend
  (mit Untergliederung nach Art) · inaktiv.
- Zählwerte je Reiter, aus **einer** Abfrage — nicht sechs.
- Jeder Reiter mit Leerzustand („Niemand ist gerade krank gemeldet"), nicht mit
  leerer Tabelle.
- Deep-Link je Zeile auf den konkreten Mitarbeiter, nicht auf die Übersicht.
- Zweisprachig DE/EN mit identischen Schlüsseln.

**Gate E4:** Jeder Reiter ist real auslösbar und zeigt echte Daten. Die Summe
der Reiter-Zählwerte entspricht der Gesamtzahl — kein Mensch fällt zwischen zwei
Reiter, keiner erscheint doppelt.

### Welle E5 — Das Zustands-Protokoll

- Tabelle `worker_status_events`: `worker_profile_id`, `von_zustand`,
  `nach_zustand`, `ausgeloest_durch`, `zeitpunkt`, `bezug` (Einsatz/Abwesenheit).
- Geschrieben **an der Quelle** jeder Änderung, nicht durch einen Cron, der
  hinterherpollt — sonst fehlen genau die kurzen Zustände.
- Zeitstrahl je Mitarbeiter aus dieser Tabelle.

> **Wirtschaftlichkeit mitdenken:** ein Ereignis je Zustandswechsel je Mensch.
> Bei 300 Kunden × 200 Mitarbeitern sind das keine großen Mengen — aber die
> Tabelle wächst unbegrenzt. Aufbewahrungsfrist **vor** dem Bau festlegen, nicht
> danach.

**Gate E5:** Der Zeitstrahl eines Mitarbeiters zeigt jede Änderung der letzten
90 Tage mit Zeitpunkt und Auslöser. Ein Test belegt, dass ein Zustandswechsel
ohne Protokolleintrag nicht möglich ist.

---

## Reihenfolge

**E2 → E3 → E4 → E5.** Erst die Quellen, dann die Anzeige, dann der Verlauf.

Die Versuchung ist, mit den Reitern anzufangen — sie sind das Sichtbare. Das
wäre falsch: ein Reiter ohne Datenquelle ist eine Zusage, die das Produkt nicht
halten kann, und genau davon hat dieses Repo schon genug (siehe
`docs/FRONTEND_REIFEGRAD_AUDIT.md`).
