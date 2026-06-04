# 00_RULES — Arbeitsregeln für die Finalisierungswelle

> Diese Datei wird **bei jeder Welle** gelesen, zusätzlich zur projektweiten `CLAUDE.md`. Sie definiert das nicht-verhandelbare Regelwerk dieser Finalisierungsphase.

---

## 1. Absolut verbindliche Arbeitsregeln

1. **Echte Repo-Dateien lesen, nichts halluzinieren.** Keine erfundenen Pfade, Tabellen, Routen oder Tests.
2. **Erst prüfen, dann bauen.** Vor jeder Änderung: betroffene Dateien, Datenmodelle, Routen, Services, Tests und UI-Zustände inspizieren.
3. **Keine Big-Bang-Rewrites.** Kleine, nachvollziehbare Slices.
4. **P0 vor P1, P1 vor P2.** Kein Polish, solange Launch-Blocker offen sind.
5. **Bug oder Sichtbarkeitslogik zuerst unterscheiden** (siehe Abschnitt 2 Triage).
6. **Server-Guards vor UI-Kosmetik.** UI-Ausblendung reicht nie als Security.
7. **Keine Secrets ausgeben.** Bei Fund: Pfad + Kategorie dokumentieren, Werte redigieren, Rotation empfehlen.
8. **Keine Phantomfeatures.** Features sind produktiv, deaktiviert oder ehrlich als Coming Soon markiert.
9. **Keine Deko-KPIs.** Jede Kennzahl braucht Quelle, Definition, Zeitraum, Berechnungslogik, Drilldown.
10. **Keine Commercial-Doppelwahrheit.** Pricing, Plan-Limits, Add-ons aus einer kanonischen Quelle.
11. **Keine schwammigen Abschlussmeldungen.** Output-Format aus Abschnitt 3 verwenden.
12. **Bei unklarer Business-Entscheidung:** sichere Default — deaktivieren, soft-locken, Coming Soon, oder Staff-Freigabe erzwingen. Entscheidung dokumentieren.
13. **Keine Commits ohne ausdrückliche Owner-Freigabe.**
14. **Kanonisches Planmodell verwenden:** Nur `DEMO`, `BASIS`, `PLUS`, `PRO`, `INDIVIDUELL`. `ENTERPRISE` ist Tier innerhalb `INDIVIDUELL`, kein eigener Plan. Legacy-Begriffe (FREE, TRIAL, STARTER, NOTDIENST, ENTERPRISE) nur via `normalizePlanKey(...)` als Aliase.
15. **Surface-Trennung respektieren:**
    - OCC liegt unter `/owner-control/` — getrennt von Admin Panel, Staff Control Center, Support-Ops, Organization Control Center
    - Staff Control Center: `/staff/` und `/staff/api/*`
    - Support-Ops: `/support-ops/`
    - Organization Control Center: `/public/organization.html` und `/api/org/*`

---

## 2. Triage VOR jedem Ticket (Pflicht)

Bevor irgendetwas gefixt wird, klassifiziere das Problem:

| Kategorie | Beschreibung | Lösungstyp |
|---|---|---|
| **Bug** | Code funktioniert nicht wie beabsichtigt | Reparieren |
| **Rollen-/Sichtbarkeitslogik** | Code funktioniert, aber Sichtbarkeitsregel falsch oder fehlt | Ausblenden, soft-locken, ausgrauen, Plan-Gate, serverseitiger Guard |
| **Tenant-Isolation** | Cross-Org-Datenleck-Risiko | Server-Guard, RLS, Org-Scope erzwingen |
| **Commercial** | Pricing/Plan/Entitlement greift nicht wie definiert | Source of Truth angleichen |
| **Security** | Auth-/CSRF-/Session-Schwäche | Härten, ggf. P0 |
| **Core Flow** | Kernprodukt-Fluss gebrochen | Reparieren (meist P0) |
| **QA** | Test-/Build-/Release-Lücke | Test ergänzen, Gate härten |
| **UX/Default** | Logik korrekt, aber Nutzer irregeführt | Copy, Empty State, Default |
| **Produktausbau** | Funktion fehlt schlicht | Bewusste Entscheidung: bauen oder Coming Soon |
| **Cleanup/Doku** | Redundanz, veraltete Wahrheit | Bereinigen oder deprecate |

**Jede Kategorie hat einen anderen Fix und andere Tests. Vermischen kostet Wochen.**

### Triage-Fragen pro Element

Pro Card, Seite, Button, API:
1. Für welche Rolle ist dieser Bereich bestimmt?
2. Für welchen Plan / welches Add-on?
3. Kundenrelevant, vendorrelevant, staffintern, ownerintern?
4. Lösung: reparieren / ausblenden / ausgrauen / soft-locken / Coming Soon / Enterprise-Request / entfernen?
5. Muss die API ebenfalls geschützt werden?
6. Datenleck-Risiko, wenn UI nur versteckt wird?

---

## 3. Output-Format pro Ticket (Pflicht)

Jedes Ticket gibt diesen Block aus, ohne Felder zu überspringen:

```
Bereich:
Ticket:
Problemklassifizierung (Bug / Rollen-Logik / Tenant / Commercial / Security / Core Flow / QA / UX / Ausbau / Cleanup):
Priorität (P0/P1/P2/P3):
Gelesene Dateien:
Geänderte Dateien:
Betroffene APIs/Routen:
Betroffene Services:
Betroffene Middleware:
Betroffene Rollen:
Betroffene Org-Scope-Regeln:
Feature-/Planbezug:
CSRF-Auswirkung:
Audit-Auswirkung:
Observability-/Logging-Auswirkung:
Rate-Limit-Auswirkung:
Datenmodell-/Migration-Auswirkung:
Bruchrisiko (was kann brechen):
Rollback-Strategie:
Feature-Flag nötig (ja/nein, welcher):
Tests (Unit / Service / Route / Integration / E2E / Cross-Org-Negativ / Plan-Gate):
Manuelle Prüfschritte (mit Owner & Datum ODER explizit als Risiko markiert):
Offene Risiken:
Wiederverwendbarkeit für andere Projekte:
Nächster sinnvoller Schritt:
```

**Manuelle Prüfschritte dürfen nicht zur Ausrede werden.** Entweder automatisierter Test, oder explizites Risiko mit Owner, oder klarer manueller Abnahmepunkt mit Datum/Verantwortlichem.

---

## 4. Stop-Regeln (sofort anhalten)

Nicht weiterpatchen, sondern Befund melden, wenn:

1. Eine betroffene API nicht gefunden wird
2. Unklar ist, welche Rolle schreiben darf
3. Org-Scope nicht serverseitig prüfbar ist
4. CSRF-Middleware unklar ist
5. Statusübergänge nicht definiert sind
6. Datenmodell für Zielzustand fehlt
7. Public-Profile-Flow ohne Einwilligung/Freigabe existiert
8. SSO-Enforce ohne Recovery / Break-Glass möglich
9. Finance Export ohne Audit möglich
10. Worker-/Staff-/Admin-Session nicht sauber trennbar
11. Secrets in Code, Doku oder Release-Artefakt gefunden werden
12. Zwei widersprüchliche Wahrheiten in Commercial-/Plan-/Feature-Definitionen

**Dann:**
- Befund dokumentieren
- Minimalen sicheren Fix vorschlagen
- Auf Owner-Bestätigung warten
- Erst dann umsetzen

---

## 5. Retrofit-Strategie (kritisch — TempConnect ist Bestandscode, kein Greenfield)

Vor jeder Änderung beantworten:

1. **Was kann brechen?** Welche bestehenden Flows nutzen den betroffenen Code?
2. **Gibt es Feature-Flags?** Lässt sich der Patch dahinter verstecken, falls er Probleme macht?
3. **Gibt es Rollback?** Wie wird der vorherige Zustand wiederhergestellt?
4. **Welche bestehenden Flows MÜSSEN unverändert weiterlaufen?**
5. **Migration nötig?** Wenn ja: idempotent, mit Rollback, in `sql/migrations/`.

Wenn diese Fragen nicht beantwortet werden können → Stop-Regel 5/6 greift.

---

## 6. Architektur-Konventionen (aus AGENTS.md / CLAUDE.md übernommen)

- Routes bleiben dünn; Business-Logik in `api/services/*`
- Zod-Validation an Eingangsgrenzen
- RBAC nur über zentrale Guards (`requirePermission(...)`); keine Inline-Rollenchecks
- Multi-Statement-Writes mit `withTransaction(pool, fn)`
- Frontend: user-supplied Werte in `innerHTML` immer mit `esc()` absichern
- Keine hardcodierten Farben in Workforce-/Enterprise-Seiten; Design Tokens verwenden
- Keine Emojis in produktiver UI
- SQL-Änderungen immer als neue Migration unter `sql/migrations/`
- Keine Secrets in Dateien — nur Umgebungsvariablen

---

## 7. Agenten-Rollenaufteilung

Aus `AGENTS.md` und `CLAUDE.md`:
- **Claude / Claude Code:** einziger KI-Agent im Stack — gesamter Stack (Frontend, React, UX, API-Client, E2E, Backend, DB, Security, APIs, Tests).
- Keine Territory-Sperren mehr.

Vor Architektur-/Security-/DB-Aenderungen mit grosser Tragweite gilt weiterhin:
→ Owner-Freigabe einholen, bevor der Eingriff erfolgt.
