# Phase 4 — Cross-Cutting: Kollisionen vermeiden

> Phase-4-Tracks überlappen sich UND berühren Phase 1-3. Diese Datei zeigt wo, damit nichts doppelt gemacht oder gebrochen wird.

---

## 1. Track A ↔ Track C (Marketplace ↔ Terminologie)

### Kollisionspunkt: Marketplace-Begriffe

**Problem:** Track A führt neue Marketplace-Module ein (`Marketplace Visibility Center`, `Trust Score`, `Profilreichweite`). Track C ist Cross-Cutting-Sprache. Wenn Track A vor Track C läuft, baut Claude Code mit alten/inkonsistenten Begriffen.

**Lösung:**
- **Empfehlung: Track C Phasen 0+1 ZUERST** (Audit + Guide) — auch wenn nicht alles umgesetzt
- Track A liest dann `docs/product/TERMINOLOGY_GUIDE.md` und verwendet konforme Begriffe
- Marketplace-spezifische Begriffe ("Profilreichweite", "Trust Score", "Sichtbarkeitsstatus") werden in den Guide aufgenommen

**Verbindliche Marketplace-Begriffe (Track-C-konform):**
- Public Profile = "Öffentliches Anbieterprofil"
- Profile Reach = "Profilreichweite"
- Visibility Status = "Sichtbarkeitsstatus"
- Trust Score = "Trust Score" (international, bleibt)
- Verified Reviews = "Verifizierte Bewertungen"
- Featured Profile = "Featured Profile" oder "Hervorgehobenes Profil"
- Bounty = "Bounty-/Promotion-Freigabe"

**Konflikt im Marketplace-Kontext:**
- "Anbieter" ist Track-C-konform für Agency-Sicht
- "Anbieterprofil" funktioniert für beide Rollen
- Bei rollenabhängigen Texten in Marketplace-Komponenten: Track-A-Code muss `getTerminologyLabel()` aus Track C nutzen

---

## 2. Track B ↔ Track C (Einsatzportal ↔ Terminologie)

### Kollisionspunkt: Worker-Begriffe

**Problem:** Track B finalisiert Einsatzportal-UI. Track C entscheidet Worker-Begriffswelt.

**Lösung:**
- Worker-Begriffe sind in Track C bereits klar:
  - "Einsätze", "Meine Einsätze"
  - "Arbeitsplatzdetails"
  - "Verfügbarkeit"
  - "Profil", "Qualifikationen"
- **Verboten:** "Marketplace", "Requisition", "Supplier", "Capacity Exchange" im Worker-UI
- Track B kann parallel zu Track C laufen, weil Worker-Surfaces stabiler sind
- Bei neuen Worker-Strings: Track-C-Guide konsultieren

---

## 3. Track A ↔ Phase 3 SCC

### Kollisionspunkt: SCC-Modul Marketplace-Visibility

**Problem:** Track A WAVE M-06 baut neues SCC-Modul. Phase 3 Track A WAVE 04 (Profi-UI) hat eigene Standards (kein `window.confirm`, einheitliche DataTable, etc.).

**Lösung:**
- Track A M-06 folgt **strikt** den Phase-3 SCC-UI-Standards:
  - Einheitliche PageHeader-Komponente
  - DataTable-Komponente
  - Modal statt `window.confirm`
  - Toast-System
  - Deep Links
  - Step-up für kritische Aktionen
- Pflicht-Lektüre vor M-06: `finalization/phase3_scc/TRACK_A_PROFI.md` Wave 04

**Querverweis verbindlich:**
- M-07 (Staff Backend Routes) folgt Phase-3 SCC-Security-Middleware (Track A WAVE 03)
- Step-up für Marketplace-Mutationen folgt Phase-3 Track A WAVE 02 (echte Reauth)

---

## 4. Track A ↔ Phase 1 WAVE_02 (Commercial)

### Kollisionspunkt: Plan-Feature-Definitionen

**Problem:** Phase 1 WAVE_02 erstellt `docs/COMMERCIAL_SOURCE_OF_TRUTH.md` als kanonische Plan-Quelle. Track A führt 8 neue Feature-Keys ein.

**Lösung:**
- Track A WAVE M-01 erweitert `api/config/planFeatures.js` ADDITIV
- Aktualisiert `docs/COMMERCIAL_SOURCE_OF_TRUTH.md` um neue Features
- Verwendet kanonische Plan-Keys (DEMO/BASIS/PLUS/PRO/INDIVIDUELL)
- `NOTDIENST` ist Legacy → via `normalizePlanKey()` mappen

**Verbot:** Track A darf KEINE neuen Plan-Namen einführen. Nur neue Feature-Keys innerhalb existierender Plans.

---

## 5. Track B ↔ Phase 1 WAVE_04E (Timesheets/Spend)

### Kollisionspunkt: Timesheet-Statusmaschine

**Problem:** Phase 1 WAVE_04E definiert Timesheet-Statusmodell. Track B WAVE EP-02 implementiert dieselbe Logik im Frontend.

**Lösung:**
- Track B nutzt **exakt** das Statusmodell aus Phase 1 WAVE_04E:
  ```
  draft → submitted → under_review →
    needs_correction / approved_internal / rejected →
    sent_to_customer → customer_confirmed / customer_rejected →
    posted_to_timesheet
  ```
- Frontend-Statusmapper (`portalStatus.js`) ist nur Anzeige-Layer, nicht eigene Wahrheit
- Bei Konflikt: Backend ist Wahrheit (siehe `00_RULES.md`)

**Achtung:** Legacy-Status `accepted_into_timesheet` ist veraltet. Im neuen Frontend nicht verwenden.

---

## 6. Track B ↔ Phase 2 WAVE 01 (Release-Hygiene)

### Kollisionspunkt: `worker-timesheet.html` Legacy

**Problem:** Track B EP-02 macht `worker-timesheet.html` zur Legacy-Datei. Phase 2 Release-Verifier muss das wissen.

**Lösung:**
- Track B EP-10 dokumentiert in `docs/einsatzportal/LEGACY_FILES.md`
- Phase-2 Release-Verifier-Konfiguration aktualisieren:
  - `worker-timesheet.html` ist KEIN Release-Blocker (darf im Release sein als Legacy-Redirect)
  - Aber: kein Build-Entry auf diese Datei
- Nginx/VHost-Konfiguration: alte Links via 301 auf neue Seite

---

## 7. Track C ↔ Alle Phasen (UI-Texte überall)

### Kollisionspunkt: Track-C-Sprache wirkt rückwirkend

**Problem:** Track C ändert UI-Strings in Dateien, die Phase 1/2/3 schon angefasst haben oder anfassen werden.

**Lösung:**
- **Track C läuft auf eigenem Branch** `feature/terminology-rename`
- Bei Merge: alle Konflikte konzentriert lösen, nicht über Tage verteilt
- Phase 1 WAVE_10 (Premium UX), Phase 3 SCC-UI und Track A/B Frontend-Wellen MÜSSEN Track-C-Guide konsultieren
- Bei Vor-Track-C-Code: neue Texte schon Track-C-konform schreiben (besser als später nachziehen)

**Reihenfolge-Empfehlung:**
- Track C Phase 0+1 zuerst (Audit + Guide) — Tage, nicht Wochen
- Andere Tracks lesen `TERMINOLOGY_GUIDE.md` ab Tag 1
- Track C Phase 2-12 läuft dann begleitend ODER nach den anderen Tracks

---

## 8. Phase 1 WAVE 15 (Demo-Daten) ↔ Phase 4 alles

### Kollisionspunkt: Demo-Daten passen nicht mehr

**Problem:** Demo-Daten aus Phase 1 WAVE 15 enthalten:
- Alte Terminologie (Track C ungelöst)
- Keine Marketplace-Profile (Track A nicht existent)
- Möglicherweise alte Timesheet-Struktur (Track B verändert)

**Lösung:**
- Nach Phase 4 (oder parallel): Demo-Daten neu seeden
- Pflicht-Inhalt in neuen Demo-Daten:
  - Marketplace-Beispiel-Profile (Status: approved, mit Reviews, mit Trust Score)
  - Track-C-konforme Texte
  - Worker-Submissions im neuen Statusmodell
- `docs/SALES_DEMO_PATH.md` aktualisieren

**Owner-Aufgabe:** Re-Seed-Timing festlegen (vor oder nach Marktstart?)

---

## 9. Phase 1 WAVE_14 (Legal/DSGVO) ↔ Track A (Marketplace)

### Kollisionspunkt: Datenschutz für Public Profile + Analytics

**Problem:** Track A führt Public Profile, Profile Analytics, Profile View Events ein. Phase 1 WAVE_14 macht DSGVO-Doku.

**Lösung:**
- Track A WAVE M-13 erweitert `docs/legal/datenschutz.html` um:
  - Datenkategorien Profile View Events (gehashte IPs, gehashte User-Agents)
  - Aufbewahrungsfrist
  - Opt-in-Logik für Public Visibility
  - Auswirkung Profile Likes/Favorites
- Track A WAVE M-13 aktualisiert AVV-Template (Subprocessor falls Analytics extern)
- **Anwalt prüft** — markiert als "rechtlich zu prüfen"

---

## 10. Phase 3 SCC-Hetzner ↔ Track A Marketplace SCC

### Kollisionspunkt: SCC-Sidebar wird voll

**Problem:** Phase 3 Track B fügt SCC-Module hinzu (Hetzner, Work Orders). Track A WAVE M-06 fügt Marketplace-Modul hinzu.

**Lösung:**
- SCC-Sidebar-Struktur in Phase 3 Track A WAVE 00 festlegen, mit Platz für:
  - Commercial (existiert)
  - Subscription Requests
  - Hetzner (Phase 3 Track B)
  - Claude Work Orders (Phase 3 Track B)
  - **Marketplace Visibility** (Track A WAVE M-06) — neuer Eintrag
  - Audit / Decisions
  - Staff Access Management
- Reihenfolge in Sidebar definieren (vom Commercial-Workflow ausgehend)
- Track A WAVE M-06 fügt Marketplace-Eintrag an passender Stelle ein

---

## 11. Übersichtstabelle aller Kollisionen

| Phase-4-Element | Kollidiert mit | Wann auflösen | Wer |
|---|---|---|---|
| Track A neue Begriffe | Track C Begriffsleitfaden | Track C Phasen 0+1 zuerst | Beide Tracks |
| Track A SCC-Modul M-06 | Phase 3 SCC Profi-UI | Phase 3 Track A WAVE 04 vor M-06 | Track A liest Phase 3 |
| Track A Plan-Features | Phase 1 WAVE_02 Commercial SoT | Phase 1 WAVE_02 vor Track A M-01 | Track A erweitert additiv |
| Track A Datenschutz | Phase 1 WAVE_14 Legal | Beide Wellen koordinieren | Track A erweitert Phase 1 |
| Track A SCC-Sidebar | Phase 3 SCC-Module | Sidebar-Layout in Phase 3 WAVE 00 | Phase 3 vergibt Platz |
| Track B Timesheet-Status | Phase 1 WAVE_04E | Phase 1 ist Quelle, Track B folgt | Backend = Wahrheit |
| Track B Legacy-Datei | Phase 2 WAVE 01 Release-Verifier | Track B EP-10 dokumentiert für Phase 2 | Beide |
| Track C UI-Strings | alle Phasen | eigener Branch, einmaliger Merge | Track C separat |
| Track D Card-Labels | Track C Terminologie | Track C Guide vor N-08 | Track D liest Track C |
| Track D SCC-Notifications | Phase 3 SCC + Phase 5 SCC-Module | Card-Targets nach SCC-Modul-Existenz | Track D mappt auf vorhandene Module |
| Track D card_target Cards | Track A Marketplace-Cards, Track B Worker-Cards | Track D mappt erst wenn Ziel-Cards existieren | Track D zuletzt |
| Track E DB-Tiefe | Phase 1 WAVE_11 + Phase 5 Phase G | Track E vertieft, ersetzt nicht | Track E liest beide |
| Track E SCC DB Ops | Phase 3 Track B Action Request Layer | Track E nutzt dasselbe Job-Muster | Track E folgt Phase 3 |
| Track E Hetzner Setup | Phase 3 Track B + Phase 5 Phase G | Hetzner-Provider-Service nicht doppeln | gemeinsamer Service |
| Demo-Daten | alle Phasen | Re-Seed nach Phase 4 | Owner-Entscheidung |

### Track D — Notification ↔ andere Tracks

**Kollision: Card-Targets brauchen existierende Cards.** Track D N-08 mappt Notifications auf Cards (`platform.offers`, `worker.assignments`, `scc.billing` etc.). Diese Cards stammen aus Track A (Marketplace), Track B (Einsatzportal), Phase 3/5 (SCC). **Lösung:** Track D nach A/B und nach den SCC-Phasen ausführen, ODER bei fehlender Ziel-Card auf Domain-Übersicht/Activity Center fallbacken (dokumentiert). Card-Labels müssen Track-C-konform sein.

### Track E — Database ↔ Phase 1/3/5

**Kollision: drei Stellen berühren DB/Hetzner.** Phase 1 WAVE_11 (Database fachlich), Phase 5 Phase G (Hetzner im SCC, Betriebssicht), Track E (Migrations-/Hosting-Tiefe). **Lösung:** Track E ist die Tiefe, ersetzt die anderen nicht. Der `InfrastructureProviderService`/Hetzner-Service wird EINMAL gebaut (Phase 3 Track B ist das Muster), Track E ergänzt nur die DB-spezifischen Jobs (Migration, Backup, Restore). SCC DB Operations nutzt denselben Action Request Layer wie Phase 3 Track B WAVE H2 — kein zweites Job-System.

---

## 12. Was tun bei Konflikt während der Arbeit

Wenn Claude Code in einer Welle merkt, dass etwas mit einer anderen Welle kollidiert:

1. **STOP** — nicht beide gleichzeitig fixen
2. **Dokumentieren** in `docs/releases/PHASE4_OPEN_BLOCKERS.md`:
   - Welche zwei Wellen kollidieren
   - Welche Datei/Funktion betroffen
   - Vorschlag zur Reihenfolge
3. **Owner fragen** — welche Welle priorisieren
4. Wenn beide gleichzeitig: nur eine in dieser Session, andere markieren

**Faustregel:** Im Zweifel — Phase 1/2/3-Welle vor Phase 4. Phase 4 setzt obenauf.
