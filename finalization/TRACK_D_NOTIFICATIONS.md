# Track D — Notification Experience: Glocke als Quick-Preview + Card-Badges

> Dreistufiges Benachrichtigungsmodell: Glocke = Quick-Preview, Cards = primäre Arbeitsführung, Activity Center = Historie. Bestehende Glocke erhalten und präzise erweitern, kein neues System bauen.

---

## Leitprinzipien (nicht verhandelbar)

```text
Glocke bleibt erhalten — wird zur Quick-Preview, nicht abgeschafft.
Cards werden primäre operative Arbeitsführung (App-Badge-Stil).
Activity Center bleibt Historie/Nachverfolgung.
Bei 0 Notifications: Default unverändert (keine sichtbare 0, kein Dot, kein Layoutsprung).
Kein doppeltes Zählen (Glocke + Cards aus EINER Quelle).
Jede relevante Notification braucht ein card_target.
Keine riesige Architekturänderung. Bestehende Logik zuerst nutzen.
Synchronisierte Status (gelesen in Glocke = gelesen auf Card).
```

---

## Das dreistufige Modell

```
Ebene 1 — Glocke (Quick-Preview)
  globalUnread, Top-Prioritäten, kurze Vorschau, Schnellnavigation, Link zum Activity Center
  NICHT: jede technische Aktivität, kein Activity-Center-Duplikat

Ebene 2 — Cards (operative Arbeitsflächen)
  Jede Card zeigt nur ihre eigenen Notifications als kleines Badge
  Klick auf Card-Badge → direkt zur fachlichen Quelle

Ebene 3 — Activity Center (Historie)
  Vollständiger Verlauf, Such-/Filterort, "Zur Quelle"-Navigation
  Bleibt bestehen, wird NICHT ersetzt
```

---

## WAVE N-00 — Read-only Audit & Bestandsschutz

**Ziel:** Bestehende Notification-/Glocken-/Activity-Struktur prüfen, keine Codeänderung.

**Aufgaben:**
- Inventar: Header-/Glocken-Komponenten, Notification Dropdown, Activity Center, Notification-APIs, Services, Tabellen/Migrationen, Dashboard-Cards, SCC-Kacheln, Einsatzportal-Cards, Sidebar/Navigation
- Prüfen: Gibt es bereits eine Glocke? Mehrere Notification-Einstiege? Welche Tabellen (`notifications`, `activity_events`, `audit_logs`, `events`, `user_notifications`, `notification_preferences`)?
- `docs/notifications/NOTIFICATION_EXPERIENCE_AUDIT.md` erstellen

**Acceptance:**
- Audit-Datei existiert mit Mapping vorhandene Komponenten ↔ Zielarchitektur
- Kanonische Glocke identifiziert (falls mehrere existieren)
- Keine Codeänderung

---

## WAVE N-01 — Notification Routing Layer

**Ziel:** Zentrale, wartbare Mapping-Schicht (kein Framework).

**Aufgaben:**
- `NotificationRouteRegistry`, `NotificationBadgeRegistry`, `NotificationTargetResolver` (einfach, wartbar)
- Jede Notification mappt auf: `bell_visible`, `bell_priority`, `card_target`, `navigation_target`, `activity_visible`, `target_route`, `fallback_route`, `source_entity_type`, `source_entity_id`
- Mapping-Tabelle aus Quelldokument Abschnitt 8 implementieren (Card-Zuordnung pro Rolle)

**Acceptance:**
- Routing-Layer existiert
- Jeder Notification-Typ hat definiertes card_target ODER dokumentierten Fallback
- Tests für Zielauflösung

---

## WAVE N-02 — Datenmodell (additiv, minimal)

**Ziel:** Bestehende Felder nutzen, nur fehlende ergänzen.

**Aufgaben:**
- Vorhandene Tabellen prüfen (siehe N-00)
- NUR falls nicht vorhanden, additiv ergänzen:
  ```
  bell_visible boolean default true
  activity_visible boolean default true
  card_target text
  navigation_target text
  target_route text
  fallback_route text
  source_entity_type text
  source_entity_id text
  seen_at timestamp
  read_at timestamp
  ```
- Dedupe-Logik (kein doppeltes Zählen)
- Migration idempotent, additiv

**Acceptance:**
- Migration läuft fresh + upgrade
- Keine bestehenden Felder gebrochen
- Dedupe verhindert Doppelzählung

---

## WAVE N-03 — Notification Summary Service (kanonische Quelle)

**Ziel:** EINE Quelle für Glocke UND Cards (keine getrennten Berechnungen).

**Aufgaben:**
- `NotificationSummaryService` liefert:
  ```
  globalUnread, globalUrgent, globalCritical,
  bellTopItems, cardBadges, navigationBadges, activityCounters (optional)
  ```
- Summary statt Vollscan (Performance!)
- Tenant-/Rollen-gescoped (Badge-Zahl kann sensibel sein)

**Acceptance:**
- Glocke und Cards lesen aus derselben Summary
- Keine getrennte Zählung
- Summary ist performant (kein Full-Table-Scan)
- Cross-Tenant-Test: Badge-Zahlen leaken nicht

---

## WAVE N-04 — Notification APIs

**Ziel:** REST-API für Summary, Liste, Zielauflösung, Status.

**Aufgaben:**
- `GET /api/notifications/summary` — kanonische Summary, rollen-/tenant-gescoped
- `GET /api/notifications?card_target=&page=` — paginierte Liste
- `GET /api/notifications/:id/resolve-target` — Zielauflösung (target_route)
- `POST /api/notifications/:id/seen` — als gesehen markieren
- `POST /api/notifications/:id/read` — als gelesen markieren (synchronisiert Glocke + Card)
- `POST /api/notifications/read-all?card_target=` — alle einer Card als gelesen
- Sicherheit: requireAuth, Tenant-Scope, keine fremden Notifications

**Acceptance:**
- Alle Endpoints geschützt
- Status-Änderung synchronisiert Glocke + Card
- Pagination funktioniert
- Cross-Tenant-Negativtests bestehen

---

## WAVE N-05 — Glocke als Quick-Preview (Frontend)

**Ziel:** Bestehende Glocke zur Quick-Preview präzisieren.

**Aufgaben:**
- `NotificationBell`-Komponente (bestehende erweitern, nicht neu bauen)
- Zeigt: globalUnread-Zahl, bellTopItems (Top-Prioritäten), kurze Vorschau, Link zum Activity Center
- Klickverhalten:
  - Klick auf Glocken-Icon → Dropdown öffnet
  - Klick auf Notification im Dropdown → direkt zur fachlichen Quelle (target_route), markiert read
  - Klick auf "Alle anzeigen" → Activity Center
  - Klick auf "Alle ungelesenen anzeigen" → gefiltertes Activity Center
- **Bei 0:** Glocke bleibt im aktuellen Default-Zustand (keine sichtbare 0)

**Acceptance:**
- Glocke zeigt nur Quick-Preview (keine überladene Liste)
- Kein Activity-Center-Duplikat
- Bei 0: unverändert
- Klick führt zur Quelle

---

## WAVE N-06 — Card-Badges (Frontend)

**Ziel:** Cards bekommen App-Badge-Stil.

**Aufgaben:**
- `NotificationBadge`-Komponente (klein, App-Stil)
- `Card Adapter`: heftet Badge an bestehende Cards basierend auf cardBadges aus Summary
- Card-Badge-Verhalten:
  - Zahl > 0: kleines Badge sichtbar
  - Zahl = 0: KEIN Badge, kein Dot, kein Layoutsprung
- Klick auf Card mit Badge:
  - Eine Notification → direkt zur Quelle
  - Mehrere → Card-Popover als Mini-Arbeitsliste ODER zur Domain-Übersicht
  - Keine → normales Card-Verhalten (unverändert)

**Acceptance:**
- Badges erscheinen nur bei > 0
- Bei 0 ist Default vollständig erhalten
- Klick-Verhalten korrekt (1 vs. mehrere vs. keine)
- Kein Layoutsprung

---

## WAVE N-07 — Navigation Adapter + Zielnavigation

**Ziel:** Auch Sidebar/Navigation kann Badges zeigen, Deep Links funktionieren.

**Aufgaben:**
- `Navigation Adapter`: navigationBadges an Sidebar-Einträge
- `Zielnavigation`: target_route mit Fokus-Parametern (z.B. `/deals/123?notificationId=notif_1&focus=offer:456`)
- Deep Link öffnet Zielseite + fokussiert das relevante Element + markiert read
- Fallback-Route, falls Ziel nicht mehr existiert

**Acceptance:**
- Deep Links öffnen korrekte Seite mit Fokus
- Fallback greift bei totem Ziel
- Navigation-Badges synchron mit Summary

---

## WAVE N-08 — Card-Zuordnung pro Rolle

**Ziel:** Alle Notification-Typen den richtigen Cards zuordnen.

**Aufgaben:** Mapping-Tabellen aus Quelldokument Abschnitt 8 vollständig umsetzen:
- **Unternehmen:** offers, deals, assignments, support, billing, profile
- **Personaldienstleister:** jobs, offers, deals, assignments, capacity, workers, support
- **Einsatzportal:** today/assignments, timesheets, availability, skills, messages
- **SCC:** commercial, billing, customer_operations, support, monitoring, infrastructure, ai_ops, security, backups

**Terminologie:** Card-Labels folgen Track C (z.B. "Arbeitsplatzangebote" statt "Requisitions").

**Acceptance:**
- Jeder Notification-Typ hat korrektes card_target
- Rollen-spezifische Zuordnung stimmt
- Kein Notification-Typ verschwindet nur in der Glocke

> **Querverweis:** Track C (Terminologie) — Card-Labels müssen Track-C-konform sein.

---

## WAVE N-09 — Activity Center "Zur Quelle"

**Ziel:** Activity Center bleibt Historie, bekommt Quell-Navigation.

**Aufgaben:**
- Activity Center NICHT entfernen
- "Zur Quelle"-Button pro Eintrag (nutzt target_route)
- Activity Center Filter (nach Domain, Status, Zeitraum)
- Vollständiger Verlauf bleibt erhalten

**Acceptance:**
- Activity Center funktioniert wie bisher + "Zur Quelle"
- Filter funktionieren
- Kein Funktionsverlust

---

## WAVE N-10 — Performance, Tests, Abnahme

**Ziel:** Operations-Reife.

**Performance:**
- Summary statt Vollscan
- Polling-Intervall vernünftig (nicht aggressiv)
- Pagination für Listen
- Indizes prüfen (auf `user_id`, `card_target`, `read_at`, `source_entity`)

**Tests:**
- **Unit:** Target-Resolver, Badge-Berechnung, Dedupe
- **API:** Summary, Liste, Status-Sync, Pagination
- **Security:** Cross-Tenant (Badge-Zahlen + Notifications), Rollen-Scope, SCC-Notifications nur Staff/Owner
- **UI Smoke:** Glocke öffnet, Card-Badge klickbar, Deep Link, bei 0 unverändert

**Acceptance (aus Quelldokument Abschnitt 15):**
- [ ] Bestehende Glocke erhalten + zur Quick-Preview präzisiert
- [ ] Cards zeigen Badges nur bei > 0
- [ ] Bei 0 Default unverändert
- [ ] Deep Links führen zur Quelle mit Fokus
- [ ] Activity Center bleibt + "Zur Quelle"
- [ ] Glocke + Cards aus einer Quelle (kein Doppelzählen)
- [ ] Status synchronisiert
- [ ] Rollen-/Tenant-Sicherheit (Badge-Zahlen können sensibel sein)
- [ ] Tests grün

---

## Definition of Done

- Glocke ist Quick-Preview (nicht abgeschafft, nicht überladen)
- Cards sind primäre Arbeitsführung mit App-Badges
- Activity Center bleibt Historie
- Bei 0 ist alles unverändert
- Eine kanonische Summary-Quelle
- Deep Links mit Fokus funktionieren
- Rollen-/Tenant-sicher
- Keine zweite Glocke, kein Activity-Center-Ersatz
- Tests grün, keine Fake-Fertigmeldung

---

## Abschlussbericht-Format pro Welle

```
Wave: N-XX
Gelesene Dateien:
Geänderte Dateien:
Betroffene APIs:
Rollen-/Tenant-Auswirkung:
Performance-Auswirkung:
Tests (Befehl + Ergebnis):
Offene Risiken:
Nächste Welle:
```

---

## Wichtigster erster Block

```
1. N-00 Audit (bestehende Glocke finden, nicht doppeln)
2. N-03 Summary Service (eine Quelle für Glocke + Cards)
3. N-05 + N-06 (Glocke als Preview + Card-Badges)
```

Wenn nur diese erledigt sind, ist das Kernerlebnis (Glocke = Preview, Cards = Arbeit) bereits da.
