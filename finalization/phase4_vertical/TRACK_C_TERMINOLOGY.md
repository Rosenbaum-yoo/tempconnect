# Track C — Rollenabhängige Terminologie-Umbenennung

> Cross-cutting UI-Sprache. Klare, kundenverständliche Begriffe je nach Rolle (Company / Agency / Worker / Staff). **OHNE** technische Breaking Changes.

---

## Leitprinzipien (nicht verhandelbar)

```text
Es geht um UI-/UX-Texte, Navigation, Labels, Buttons, Tooltips, Empty States, Hilfetexte, Dashboards, Page-Titles, Breadcrumbs.

Es geht NICHT um DB-Felder, API-Routen, Enums, Migrationen, Service-Namen.

Keine globalen Find-and-Replace-Aktionen ohne Kontextprüfung.
Keine technischen Begriffe im UI lassen, wenn sie für Kunden missverständlich sind.
Keine Fachlogik zerstören.
Keine API-Kompatibilität brechen.
Keine Datenbankmigration nur wegen UI-Sprache.
```

---

## Rollen-Glossar (verbindlich)

| Rolle | Hauptbegriff "Marktplatz" | Hauptaktion |
|---|---|---|
| **Unternehmen / Company** | "Personal finden" | "Arbeitsplatz anbieten" |
| **Zeitarbeitsfirma / Agency / Supplier** | "Arbeitsplatz finden" | "Personal einstellen" |
| **Worker / Mitarbeiter** | (nicht relevant) | "Einsätze" |
| **Staff / SCC / OCC / SOC** | "Vermittlungsbereich" | (intern, kann technisch bleiben) |

---

## Begriffsmatrix (Ausgangsproblem)

| Alt | Neu für Company | Neu für Agency | Bleibt intern |
|---|---|---|---|
| Marktplatz / Marketplace | Personal finden | Arbeitsplatz finden | marketplace.html |
| Bedarf einstellen | Arbeitsplatz anbieten | (n/a) | requisitions.html |
| Bedarfe | Arbeitsplatzangebote | Arbeitsplatzangebote | requisitions table |
| Kapazität einstellen | (n/a) | Personal einstellen | capacity_search.html |
| Kapazitäten | Verfügbares Personal | Verfügbares Personal | capacity table |
| Requisition | Arbeitsplatzangebot | Arbeitsplatzangebot | API `/api/requisitions` |
| Capacity Exchange | (n/a) | (n/a) | Modulname intern OK |

---

## PHASE 0 — Read-only Inventar

**Ziel:** Bestandsaufnahme aller sichtbaren Begriffe, keine Codeänderung.

**Aufgaben:**

Scanne Repository nach:
```
Marktplatz, Marketplace
Bedarf, Bedarfe, Beschaffungsbedarf, Personalbedarf
Requisition, Requisitions
Kapazität, Kapazitäten, Capacity, Capacity Exchange
Angebot einstellen, Bedarf einstellen, Suche einstellen, Auftrag einstellen
Personal anfragen
Supplier Marketplace, Vendor Marketplace
Einsatzbörse
Arbeitsplatz (bestehende Treffer)
Worker capacity, verfügbare Mitarbeiter
```

Prüfen:
- **Frontend:** HTML, JS, React/TSX, Navigation, Sidebar, Header, Dashboard-Cards, Buttons, Modals, Tooltips, Empty/Error States, Page Titles, Breadcrumbs, Filterlabels, Tabellen, Formulare, Onboarding, Pricing, Account/Subscription, Admin/OCC/SCC/SOC
- **Backend (nur textnah):** E-Mail-Templates, Notification-Texte, Audit-Beschreibungen (falls UI-sichtbar), API-Fehlermeldungen (falls UI-sichtbar), Seed/Demo-Texte, Dokumentation (nutzernah)

**NICHT ändern:** DB-Spalten, API-Routen, interne Enums, Service-Namen, Migrationen, Testnamen, interne Kommentare.

**Ausnahme:** Tests, die explizit UI-Text prüfen, dürfen angepasst werden.

**Output:**

`docs/product/TERMINOLOGY_RENAME_AUDIT.md` mit Tabelle:

| Datei | alter Begriff | sichtbarer Kontext | betroffene Rolle | empfohlener neuer Begriff | Änderung ja/nein | Begründung |
|---|---|---|---|---|---|---|

**Acceptance:** Audit-Datei existiert, keine Codeänderung außer dieser Datei.

---

## PHASE 1 — Verbindlicher Begriffsleitfaden

**Ziel:** `docs/product/TERMINOLOGY_GUIDE.md` als Source of Truth.

**Inhalt:**

1. **Grundregel:** TempConnect nutzt intern technische Domänenbegriffe, aber im UI rollenabhängige Kundensprache.

2. **Unternehmen / Company**
   
   **Verboten im kundennahen UI:** Marktplatz, Bedarf einstellen, Bedarfe verwalten, Kapazität suchen, Requisition erstellen
   
   **Verwenden:**
   - Personal finden
   - Arbeitsplatz anbieten
   - Arbeitsplatzangebote
   - Neues Arbeitsplatzangebot
   - Offene Arbeitsplatzangebote
   - Passendes Personal
   - Personalanfrage (kontextabhängig)
   - Besetzung starten / Besetzung prüfen

3. **Agency / Personaldienstleister**
   
   **Verboten:** Marktplatz, Kapazität einstellen, Worker Capacity, Bedarf suchen
   
   **Verwenden:**
   - Arbeitsplatz finden / Arbeitsplätze finden
   - Passende Arbeitsplätze
   - Personal einstellen
   - Verfügbares Personal einstellen
   - Mitarbeiter anbieten
   - Einsatz finden
   - Offene Arbeitsplatzangebote

4. **Worker / Mitarbeiter** (nur wenn sichtbar und sinnvoll)
   
   **Mögliche Sprache:** Einsätze, Meine Einsätze, Arbeitsplatzdetails, Verfügbarkeit, Profil, Qualifikationen
   
   **NICHT für Worker:** Marketplace, Requisition, Supplier, Capacity Exchange

5. **Admin / Owner / Staff / OCC / SCC / SOC**
   
   **Zulässig (intern/technisch):** Requisitions, Marketplace intern, Capacity Exchange intern
   
   **Besser in Staff-UI:** Arbeitsplatzangebote, Personalangebote, Vermittlungsbereich, Kapazitäts-/Personalsteuerung, Matching-Steuerung

6. **Technische Begriffe bleiben stabil:** API paths, DB schema, enum values, service names, migration names, internal event names. Bei sinnvollen technischen Renames: zuerst dokumentieren, nicht in diesem Sprint durchführen.

**Acceptance:** `TERMINOLOGY_GUIDE.md` ist verbindlich und vollständig.

---

## PHASE 2 — Rollenabhängige UI-Labels implementieren

**Ziel:** Zentrale Lösung für rollenabhängige Begriffe.

**Aufgaben:**

1. Prüfen ob bereits vorhanden:
   - i18n
   - label helper
   - role visibility helper
   - copy constants
   - `frontend/public/js` helpers
   - `src/constants`
   - shared copy module
   - plan/role based UI utilities

2. **Wenn vorhanden:** bestehende Struktur erweitern.

3. **Wenn nicht vorhanden:** kleine robuste Terminology-/Copy-Hilfsstruktur erstellen.

4. **Schnittstelle:**
   ```js
   getTerminologyLabel(key, role)
   ```
   
   **Keys (Beispiele):**
   - `marketplace`
   - `createDemand`
   - `demandList`
   - `demandDetail`
   - `capacityCreate`
   - `capacityList`
   - `findMarketplace`
   - `offerWorkplace`
   - `findStaff`
   - `findWorkplace`
   
   **Beispiele:**
   ```js
   getTerminologyLabel("marketplace", "company")   // "Personal finden"
   getTerminologyLabel("marketplace", "agency")    // "Arbeitsplatz finden"
   getTerminologyLabel("createDemand", "company")  // "Arbeitsplatz anbieten"
   getTerminologyLabel("capacityCreate", "agency") // "Personal einstellen"
   ```

**Wenn zentrale Lösung nicht sinnvoll:** UI-Texte auf betroffenen Seiten direkt anpassen, dokumentieren wo später zentralisiert werden sollte.

**Acceptance:**
- Helper-Funktion existiert ODER lokale Anpassungen mit Doku
- Keine doppelten String-Konstanten in mehreren Dateien

---

## PHASE 3 — Unternehmensansicht überarbeiten

**Ziel:** Company sieht durchgehend "Arbeitsplatz anbieten" / "Personal finden".

**Konkrete Umbenennungen:**

**Navigation:**
- "Marktplatz" → "Personal finden"
- "Bedarfe" → "Arbeitsplatzangebote"
- "Bedarf erstellen" → "Arbeitsplatz anbieten"
- "Kapazitäten" → kontextabhängig "Verfügbares Personal" oder "Personal finden"

**Buttons / CTAs:**
- "Bedarf einstellen" → "Arbeitsplatz anbieten"
- "Neuen Bedarf erstellen" → "Neuen Arbeitsplatz anbieten"
- "Bedarf veröffentlichen" → "Arbeitsplatzangebot veröffentlichen"
- "Marktplatz durchsuchen" → "Personal finden"
- "Kapazitäten anzeigen" → "Verfügbares Personal anzeigen"

**Formulare:**
- "Bedarfsdetails" → "Arbeitsplatzdetails"
- "Anzahl benötigter Mitarbeiter" (bleibt)
- "Startdatum des Bedarfs" → "Startdatum"
- "Bedarf speichern" → "Arbeitsplatzangebot speichern"
- "Bedarf schließen" → "Arbeitsplatzangebot schließen"

**Tabellen:**
- "Bedarf" → "Arbeitsplatzangebot"
- "Bedarfsstatus" → "Status"
- "Offener Bedarf" → "Offene Positionen" oder "Offene Plätze"
- "Erfüllungsgrad" → "Besetzungsstand"

**Empty States:**
- Alt: "Keine Bedarfe vorhanden." → Neu: "Sie haben noch keine Arbeitsplatzangebote erstellt." + CTA "Arbeitsplatz anbieten"
- Alt: "Keine Kapazitäten gefunden." → Neu: "Aktuell wurde kein passendes Personal gefunden." + CTA "Suchkriterien anpassen"

**Acceptance:** Alle Company-sichtbaren Hauptbegriffe sind angepasst, Audit-Datei aktualisiert.

---

## PHASE 4 — Personaldienstleister-Ansicht überarbeiten

**Ziel:** Agency sieht durchgehend "Personal einstellen" / "Arbeitsplatz finden".

**Navigation:**
- "Marktplatz" → "Arbeitsplatz finden"
- "Kapazität einstellen" → "Personal einstellen"
- "Kapazitäten" → "Verfügbares Personal"
- "Bedarfe" → "Arbeitsplatzangebote"
- "Requisitions" → "Arbeitsplatzangebote"

**Buttons / CTAs:**
- "Kapazität einstellen" → "Personal einstellen"
- "Neue Kapazität" → "Personal einstellen"
- "Mitarbeiterkapazität hinzufügen" → "Personal einstellen"
- "Marktplatz durchsuchen" → "Arbeitsplatz finden"
- "Bedarf ansehen" → "Arbeitsplatzangebot ansehen"
- "Auf Bedarf anbieten" → "Personal anbieten"

**Formulare für Personal/Kapazität:**
- Alt: "Kapazität hinzufügen" → Neu: "Personal einstellen"
- "Worker" → "Mitarbeiter"
- "Kapazitätsprofil" → "Personalprofil"
- "Verfügbare Kapazität" → "Verfügbares Personal"
- "Verfügbarkeit eintragen" (bleibt)
- "Stundensatz / Rate Card" bleibt fachlich

**Empty States:**
- Alt: "Keine Kapazitäten eingestellt." → Neu: "Sie haben noch kein verfügbares Personal eingestellt." + CTA "Personal einstellen"
- Alt: "Keine Bedarfe gefunden." → Neu: "Aktuell gibt es keine passenden Arbeitsplatzangebote." + CTA "Filter anpassen"

**Acceptance:** Alle Agency-sichtbaren Hauptbegriffe sind angepasst.

---

## PHASE 5 — "Marktplatz"-Begriff plattformweit entschärfen

**Ziel:** "Marktplatz" verschwindet aus kunden-/rollenrelevanten Hauptnavigationspunkten.

**Aufgaben:**

Scanne sichtbare Stellen mit:
- Marktplatz / Marketplace
- Supplier Marketplace
- Marketplace Hub / Marketplace Angebote / Marketplace Suche

**Entscheide pro Rolle:**
- **Company:** "Personal finden"
- **Agency:** "Arbeitsplatz finden"
- **Admin/Staff (intern):** "Vermittlungsbereich" / "Matching-Bereich" / "Marketplace intern"
- **Admin/Staff (kundennahe Ansicht):** "Personal- und Arbeitsplatzvermittlung"

**Wenn dieselbe HTML rollenabhängig genutzt wird:**
- Überschrift dynamisch ODER kontextabhängig
- Wenn aktuell nicht möglich:
  - Neutrale Überschrift "Vermittlung"
  - Rollenabhängige Subline:
    - Company: "Finden Sie passendes Personal für Ihre Arbeitsplatzangebote."
    - Agency: "Finden Sie passende Arbeitsplätze für Ihr verfügbares Personal."

**Acceptance:** "Marktplatz" als sichtbarer Hauptnavigationspunkt für Company/Agency ist eliminiert.

---

## PHASE 6 — "Bedarf"-Begriff kontextualisieren

**Ziel:** "Bedarf" nur dort wo fachlich sinnvoll.

**Regel:**

**Company:**
- Bedarf erstellen → Arbeitsplatz anbieten
- Bedarfe → Arbeitsplatzangebote
- Beschaffungsbedarf → Arbeitsplatzangebot
- Personalbedarf → bleibt nur wenn natürlicher im Satz
- Requisition → Arbeitsplatzangebot

**Agency:**
- Bedarf → Arbeitsplatzangebot
- Bedarfe → offene Arbeitsplatzangebote
- Requisition → Arbeitsplatzangebot
- Auf Bedarf anbieten → Personal anbieten

**Admin/Staff:**
- Requisition kann intern bleiben (technisch/operativ sinnvoll)
- Kundennahe Adminansicht besser: Arbeitsplatzangebot

**Acceptance:** "Bedarf" ist aus Unternehmens-CTAs und zentralen kundennahen Flows entfernt oder fachlich sauber ersetzt.

---

## PHASE 7 — "Kapazität"-Begriff kontextualisieren

**Ziel:** "Kapazität" verschwindet aus Agency-CTAs.

**Regel:**

**Agency:**
- Kapazität einstellen → Personal einstellen
- Kapazität hinzufügen → Personal einstellen
- Kapazitätsprofil → Personalprofil
- Verfügbare Kapazitäten → Verfügbares Personal
- Kapazitätsliste → Personalübersicht

**Company:**
- Kapazitäten suchen → Personal finden
- Kapazitäten anzeigen → Verfügbares Personal anzeigen
- Kapazitätsdetails → Personalprofil oder Anbieterprofil

**Admin/Staff:**
- Capacity Exchange intern bleibt OK
- Kundennahe Staff-Ansicht: "Personal- und Kapazitätssteuerung"

**Acceptance:** "Kapazität einstellen" ist für Agency durch "Personal einstellen" ersetzt.

---

## PHASE 8 — Dashboards, KPI-Karten, Navigation prüfen

**Ziel:** Konsistenz auf allen Übersichtsflächen.

**Bereiche:**
- Executive Dashboard
- Company Dashboard
- Agency Dashboard
- Worker Dashboard
- OCC / SCC / SOC
- Sidebar, Header-Navigation
- Quick Actions, KPI Cards, Drilldowns

**Beispiele:**

**Company Dashboard:**
- "Bedarf erstellen" → "Arbeitsplatz anbieten"
- "Marktplatz" → "Personal finden"
- "Offene Bedarfe" → "Offene Arbeitsplatzangebote"
- "Kapazitäten verfügbar" → "Verfügbares Personal"

**Agency Dashboard:**
- "Kapazität einstellen" → "Personal einstellen"
- "Marktplatz" → "Arbeitsplatz finden"
- "Neue Bedarfe" → "Neue Arbeitsplatzangebote"
- "Auf Bedarf reagieren" → "Personal anbieten"

**Executive/Admin:**
- "Bedarfe" je nach Kundennähe zu "Arbeitsplatzangebote"
- "Kapazitäten" zu "Personalangebote" oder "Verfügbares Personal"

**Acceptance:** KPI-Karten und Navigation rollenkonsistent.

---

## PHASE 9 — E-Mails, Notifications, Audit, Support-Texte

**Ziel:** Auch außerhalb der App ist die Sprache rollenkonsistent.

**Prüfen (nutzerseitig sichtbar):**
- E-Mail-Templates
- In-App Notifications
- Toasts
- Modals
- Support-Texte
- Audit Events (falls für Kunden sichtbar)
- Statusmeldungen
- Fehlermeldungen

**Regeln:**
- Unternehmen: Sprache mit "Arbeitsplatz anbieten" / "Personal finden"
- Agency: Sprache mit "Personal einstellen" / "Arbeitsplatz finden"
- Worker: Sprache mit "Einsatz" / "Arbeitsplatz" / "Verfügbarkeit" / "Profil"
- Interne Audit-Events dürfen technisch bleiben, kundenseitige Labels nicht

**Beispiele:**
- "Ihr Bedarf wurde veröffentlicht." → "Ihr Arbeitsplatzangebot wurde veröffentlicht."
- "Neue Kapazität verfügbar." → "Neues verfügbares Personal wurde eingestellt."
- "Neues Marketplace Match." → rollenabhängig "Neuer Personalvorschlag" oder "Neues passendes Arbeitsplatzangebot"

**Acceptance:** E-Mails und Notifications sind rollenkonsistent.

---

## PHASE 10 — Routen, Dateinamen, technische Kompatibilität

**Ziel:** Sprache aktualisiert, Technik unverändert.

**NICHT automatisch ändern:**
- `marketplace.html` darf technisch bleiben
- `requisitions.html` darf technisch bleiben
- `capacity_search.html` darf technisch bleiben
- API `/api/requisitions` bleibt
- DB-Tabelle `requisitions` bleibt

**Aber:** sichtbare Überschrift, Navigation und CTA müssen kundenverständlich sein.

**Falls technische Aliase gewünscht:**
- Nur additive Aliase
- Keine Breaking Changes
- Alte Links weiter funktionsfähig
- Redirects sauber testen
- Keine 404 erzeugen

**Vor technischen Renames:**
- Vorschlag in `TERMINOLOGY_RENAME_AUDIT.md` dokumentieren
- Nicht in diesem Sprint brechen

**Acceptance:**
- Keine API-Breaking-Changes
- Keine entfernten Routen ohne Redirect
- Keine Migration nur wegen UI-Sprache

---

## PHASE 11 — Tests und Regression

**Ziel:** Sicherstellen dass Sprachänderungen keine Funktion brechen.

**Anpassen nur dort wo Tests sichtbare UI-Texte prüfen.**

**Ergänzen für:**

1. **Unternehmensrolle:**
   - Navigation zeigt "Personal finden"
   - CTA zeigt "Arbeitsplatz anbieten"
   - Bedarfs-/Requisition-Seite zeigt kundennahe Arbeitsplatz-Sprache
   - Kein sichtbarer Hauptnavigationspunkt "Marktplatz" (Company-Kontext)

2. **Agency-Rolle:**
   - Navigation zeigt "Arbeitsplatz finden"
   - CTA zeigt "Personal einstellen"
   - Kapazitäts-/Personal-Seite zeigt "Verfügbares Personal"
   - Kein sichtbarer Hauptnavigationspunkt "Marktplatz" (Agency-Kontext)

3. **Empty States:**
   - Company: "Sie haben noch keine Arbeitsplatzangebote erstellt."
   - Agency: "Sie haben noch kein verfügbares Personal eingestellt."

4. **Keine technische Regression:**
   - API build bleibt grün
   - Frontend typecheck bleibt grün
   - Frontend lint bleibt grün oder verbessert sich
   - Vite build nicht schlechter
   - Bestehende Routen bleiben erreichbar

**Befehle:**
```bash
cd frontend && npm run lint
cd frontend && npm run typecheck
cd frontend && npm run build
cd api && npm run test
```

**Wenn ein Build vorher schon rot war:** "vorher rot / nachher nicht verschlechtert" dokumentieren. Keine fremden Großbaustellen lösen.

**Acceptance:** Alle Tests grün ODER vorher-rot/jetzt-nicht-schlechter dokumentiert.

---

## PHASE 12 — Dokumentation

**Pflichtdokumente:**

1. **`docs/product/TERMINOLOGY_GUIDE.md`**
   - Rollenabhängige Begriffe
   - Verbotene/zu vermeidende Begriffe im UI
   - Erlaubte technische Begriffe intern
   - Beispiele alt → neu

2. **`docs/product/TERMINOLOGY_RENAME_AUDIT.md`**
   - Geprüfte Dateien/Bereiche
   - Geänderte Stellen
   - Bewusst nicht geänderte Stellen
   - Technische Begriffe, die intern bleiben
   - Mögliche spätere technische Renames

3. **Optional: `docs/product/ROLE_BASED_COPY.md`**
   - Falls zentrale Copy-Helper-Struktur entsteht

**Acceptance:** Alle drei Dokumente existieren und sind aktuell.

---

## Akzeptanzkriterien (Track C komplett)

1. Plattformweit alle sichtbaren Hauptbegriffe geprüft:
   - Marktplatz / Marketplace
   - Bedarf / Bedarfe
   - Requisition / Requisitions
   - Kapazität / Kapazitäten / Capacity

2. **Unternehmen sehen im UI primär:**
   - "Personal finden"
   - "Arbeitsplatz anbieten"
   - "Arbeitsplatzangebote"
   - "Verfügbares Personal"

3. **Personaldienstleister sehen im UI primär:**
   - "Arbeitsplatz finden"
   - "Personal einstellen"
   - "Verfügbares Personal"
   - "Offene Arbeitsplatzangebote"

4. "Marktplatz" aus kunden-/rollenrelevanten Hauptnavigationspunkten entfernt

5. "Bedarf" aus Unternehmens-CTAs und zentralen kundennahen Flows entfernt

6. "Kapazität einstellen" für Agency durch "Personal einstellen" ersetzt

7. Technische Namen nicht riskant gebrochen:
   - Keine DB-Renames
   - Keine API-Breaking-Changes
   - Keine entfernten Routen ohne Redirect/Alias
   - Keine Migration nur wegen UI-Sprache

8. Dokumentation vorhanden:
   - `TERMINOLOGY_GUIDE.md`
   - `TERMINOLOGY_RENAME_AUDIT.md`

9. Tests/Checks ausgeführt und dokumentiert

10. Ergebnis wirkt sprachlich wie professionelle B2B-SaaS-Plattform:
    - Verständlich für Unternehmen
    - Verständlich für Personaldienstleister
    - Konsistent für Admin/Staff
    - Keine unnötigen internen Begriffe im Kunden-UI
    - Keine Deko-Umbenennung ohne Kontextprüfung

---

## Abschlussbericht-Format

```
1. Zusammenfassung der neuen Begriffswelt
2. Liste aller geänderten Dateien
3. Liste aller bewusst nicht geänderten technischen Begriffe
4. Rollenmatrix:
   - Company
   - Agency
   - Worker
   - Admin/Staff
5. Vorher/Nachher-Beispiele
6. Tests/Checks mit Ergebnis
7. Restrisiken
8. Stellen für spätere technische Aliase oder i18n-Zentralisierung
```

---

## Wichtige Warnung

**KEINE Find-and-Replace ohne Kontext.** Beispiel-Fallen:
- `requisition` in API-Routen darf NICHT ersetzt werden
- `marketplace` in CSS-Klassennamen darf NICHT ersetzt werden
- "Bedarf" in internen Code-Kommentaren darf bleiben
- "Kapazität" in Migrations-SQL darf NICHT ersetzt werden

**Jede Änderung ist eine UI-Text-Änderung, NICHT eine technische Änderung.** Im Zweifel: nicht ändern, dokumentieren.
