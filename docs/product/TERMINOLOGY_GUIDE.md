# TempConnect — Verbindlicher Terminologie-Leitfaden

> **Track C Phase 1 — Source of Truth**
> Erstellt: 2026-05-29 | Gilt ab: sofort für alle neuen UI-Strings
> Basis: `finalization/phase 4/TRACK_C_TERMINOLOGY.md`
> Inventory: `docs/product/TERMINOLOGY_RENAME_AUDIT.md`

---

## Grundregel

> **TempConnect nutzt intern technische Domänenbegriffe (Requisition, Capacity Exchange, marketplace.html), aber im UI rollenabhängige Kundensprache.**

Jeder sichtbare String — Seitentitel, Button, Navigation, Breadcrumb, Empty State, Tooltip, E-Mail — richtet sich nach der Rolle des Nutzers. Technische Begriffe bleiben in API-Pfaden, DB-Feldern, Enums, Service-Namen und internen Kommentaren.

**Prioritätsregel bei Widerspruch:**

```
User-Anweisung > CLAUDE.md > dieser Leitfaden
```

---

## Rollen-Übersicht

| Rollencode | Anzeigename | Hauptperspektive |
|---|---|---|
| `company` | Unternehmen / Einsatzunternehmen | sucht Personal, bietet Arbeitsplätze an |
| `agency` | Zeitarbeitsfirma / Personaldienstleister | bietet Personal an, sucht Arbeitsplätze |
| `worker` | Mitarbeiter / Fachkraft | sucht Einsätze, verwaltet Verfügbarkeit |
| `staff` | Staff / SCC / OCC / SOC | Plattform-intern, technische Sprache OK |
| `admin` | Admin | Plattform-intern, technische Sprache OK |

---

## 1. Company-Terminologie

### 1.1 Verbotene Begriffe im kundennahen UI

| ❌ Verboten | ✅ Verwenden stattdessen |
|---|---|
| Marktplatz | Personal finden |
| Zum Marktplatz | Personal finden |
| Marktplatz durchsuchen | Personal finden |
| Bedarf einstellen | Arbeitsplatz anbieten |
| Bedarf erstellen | Arbeitsplatz anbieten |
| Neuen Bedarf erstellen | Neuen Arbeitsplatz anbieten |
| Bedarfe verwalten | Arbeitsplatzangebote verwalten |
| Bedarfe | Arbeitsplatzangebote |
| Bedarf | Arbeitsplatzangebot |
| Bedarfsprofil | Stellenprofil / Arbeitsplatzdetails |
| Bedarfsstatus | Status |
| Offener Bedarf | Offene Position / Offener Platz |
| Bedarf speichern | Arbeitsplatzangebot speichern |
| Bedarf schließen | Arbeitsplatzangebot schließen |
| Bedarf veröffentlichen | Arbeitsplatzangebot veröffentlichen |
| Requisition erstellen | Arbeitsplatzangebot erstellen |
| Requisition | Arbeitsplatzangebot |
| Kapazitäten | Verfügbares Personal |
| Kapazitäten anzeigen | Verfügbares Personal anzeigen |

### 1.2 Zulässige Company-Begriffe

| Begriff | Kontext |
|---|---|
| Personal finden | Navigation, H1, CTA, Breadcrumb |
| Arbeitsplatz anbieten | CTA, Button, Formulartitel |
| Arbeitsplatzangebot(e) | Tabellen, Listen, Labels |
| Neues Arbeitsplatzangebot | Anlage-Buttons |
| Offene Arbeitsplatzangebote | Dashboards, Filter |
| Passendes Personal | Matching-Ergebnisse |
| Personalanfrage | Kontextabhängig (wenn aktive Anfrage) |
| Besetzung starten / Besetzung prüfen | Deal-/Staffing-Flows |
| Verfügbares Personal | Suchergebnisse, Listings |
| Erfüllungsstand / Besetzungsstand | Statt "Erfüllungsgrad" |
| Anzahl benötigter Mitarbeiter | Bleibt (verständlich) |
| Startdatum | Statt "Startdatum des Bedarfs" |

### 1.3 Company Empty States

| Situation | Text |
|---|---|
| Keine Arbeitsplatzangebote | "Sie haben noch keine Arbeitsplatzangebote erstellt." + CTA: **„Arbeitsplatz anbieten"** |
| Kein passendes Personal | "Aktuell wurde kein passendes Personal gefunden." + CTA: **„Suchkriterien anpassen"** |
| Kein Deal | "Noch keine aktiven Deals." + CTA: **„Personal finden"** |

---

## 2. Agency-Terminologie

### 2.1 Verbotene Begriffe im kundennahen UI

| ❌ Verboten | ✅ Verwenden stattdessen |
|---|---|
| Marktplatz | Arbeitsplatz finden |
| Kapazität einstellen | Personal einstellen |
| Neue Kapazität | Personal einstellen |
| Mitarbeiterkapazität hinzufügen | Personal einstellen |
| Kapazitätsprofil | Personalprofil |
| Verfügbare Kapazitäten | Verfügbares Personal |
| Kapazitätsliste | Personalübersicht |
| Kapazitätssuche | Personal finden (Seiten-H1) |
| Kapazitätsangebote | Personalangebote |
| Bedarf | Arbeitsplatzangebot |
| Bedarfe | Offene Arbeitsplatzangebote |
| Auf Bedarf anbieten | Personal anbieten |
| Requisition | Arbeitsplatzangebot |
| Worker Capacity | Verfügbares Personal |

### 2.2 Zulässige Agency-Begriffe

| Begriff | Kontext |
|---|---|
| Arbeitsplatz finden | Navigation, H1, CTA |
| Arbeitsplätze finden | Plural-Kontext |
| Personal einstellen | Primäre Aktion Agency |
| Verfügbares Personal einstellen | Erweiterter Kontext |
| Mitarbeiter anbieten | Aktive Angebots-CTAs |
| Einsatz finden | Worker-nahe Agency-Ansichten |
| Offene Arbeitsplatzangebote | Listings, Filter |
| Personalangebote | Eigene Agency-Listings |
| Personalprofil | Mitarbeiterprofile |

### 2.3 Agency Empty States

| Situation | Text |
|---|---|
| Kein Personal eingestellt | "Sie haben noch kein verfügbares Personal eingestellt." + CTA: **„Personal einstellen"** |
| Keine passenden Arbeitsplätze | "Aktuell gibt es keine passenden Arbeitsplatzangebote." + CTA: **„Filter anpassen"** |

---

## 3. Worker-Terminologie

| ❌ Nicht verwenden | ✅ Verwenden |
|---|---|
| Marketplace | Einsatz / Einsätze |
| Requisition | (nicht sichtbar für Worker) |
| Capacity Exchange | (nicht sichtbar für Worker) |
| Supplier | (nicht sichtbar für Worker) |

**Worker-Hauptbegriffe:**
- Einsätze / Meine Einsätze
- Arbeitsplatzdetails (wenn konkreter Einsatzort)
- Verfügbarkeit / Meine Verfügbarkeit
- Profil / Qualifikationen
- Stundenzettel

---

## 4. Staff / Admin / OCC / SCC / SOC

**Intern (technisch OK):**
- Requisitions
- Marketplace intern
- Capacity Exchange
- Worker Capacity (intern)

**In kundennahen Staff-Ansichten besser:**
- Arbeitsplatzangebote
- Personalangebote
- Vermittlungsbereich
- Matching-Steuerung
- Kapazitäts-/Personalsteuerung

---

## 5. Vollständige Begriffsmatrix

| Alt | Company-UI | Agency-UI | Worker-UI | Bleibt intern |
|---|---|---|---|---|
| Marktplatz | „Personal finden" | „Arbeitsplatz finden" | — | `marketplace.html`, `capacity_exchange_feed.html` |
| Bedarf einstellen | „Arbeitsplatz anbieten" | n/a | — | `requisitions.html` |
| Bedarfe | „Arbeitsplatzangebote" | „Offene Arbeitsplatzangebote" | — | `requisitions` (DB-Tabelle) |
| Bedarf / Requisition | „Arbeitsplatzangebot" | „Arbeitsplatzangebot" | — | `API /api/requisitions` |
| Kapazität einstellen | n/a | „Personal einstellen" | — | `capacity_search.html` |
| Kapazitäten | „Verfügbares Personal" | „Verfügbares Personal" | — | `capacity_posts` (DB) |
| Kapazitätssuche | „Personal finden" | „Personal finden" | — | Dateiname intern |
| Kapazitätsangebote | — | „Personalangebote" | — | intern |
| Capacity Exchange | — | — | — | Modulname intern |
| Bedarfsprofil | „Stellenprofil" | — | — | — |
| Erfüllungsgrad | „Besetzungsstand" | — | — | — |
| Marktplatzaktivität | „Vermittlungsaktivität" | — | — | — |

---

## 6. Verbotsliste — Niemals in kundennahem UI

> Diese Begriffe dürfen **nicht** in Seiten-H1, Buttons, Navigationslinks, Breadcrumbs, Empty States, Tooltips oder E-Mails erscheinen, wenn die Zielgruppe Company oder Agency ist.

```
Marktplatz          (→ "Personal finden" / "Arbeitsplatz finden")
Bedarf einstellen   (→ "Arbeitsplatz anbieten")
Bedarfe             (→ "Arbeitsplatzangebote")
Requisition         (→ "Arbeitsplatzangebot")
Kapazität einstellen (→ "Personal einstellen")
Kapazitätssuche     (→ "Personal finden")
Worker Capacity     (→ "Verfügbares Personal")
Capacity Exchange   (→ nicht sichtbar für Kunden)
Supplier            (→ "Personaldienstleister" wenn sichtbar nötig)
```

---

## 7. Zulässigkeitsliste — Technische Begriffe, die intern bleiben

> Diese Begriffe sind korrekt in API-Pfaden, DB-Feldern, Enums, Service-Namen, Migrations, Testnamen, Code-Kommentaren und Admin/Staff-internen Bereichen.

```
/api/requisitions          (API-Route — nicht ändern)
requisitions               (DB-Tabelle — nicht ändern)
capacity_posts             (DB-Tabelle — nicht ändern)
capacity_exchange_feed.html (Dateiname — nicht ändern)
marketplace.html           (Dateiname — nicht ändern)
capacity_search.html       (Dateiname — nicht ändern)
demand_create.html         (Dateiname — nicht ändern)
requisition_created        (Event-Enum — nicht ändern)
NOTDIENST                  (Legacy-Planname — via normalizePlanKey() mappen)
```

---

## 8. Navigationslabels (Source of Truth)

> Pro Seite: welches Label, für welche Rolle.

| Seite / Route | Company-Label | Agency-Label | Notiz |
|---|---|---|---|
| `capacity_exchange_feed.html` | „Personal finden" | „Arbeitsplatz finden" | Rollenabhängig rendern |
| `requisitions.html` | „Arbeitsplatzangebote" | „Arbeitsplatzangebote" | Company-Seite, Agency sieht ggf. gefiltert |
| `capacity_search.html` | „Verfügbares Personal" | „Personal einstellen" | Rollenabhängig |
| `enterprise.html` (Hub) | Hub-Karten anpassen | Hub-Karten anpassen | Rollenabhängige Karten-Titel |
| Breadcrumb „Marktplatz" | „Personal finden" | „Arbeitsplatz finden" | `breadcrumb.js` Phase 8 |
| Breadcrumb „Bedarfe" | „Arbeitsplatzangebote" | — | `breadcrumb.js` Phase 8 |
| Footer-Link „Marktplatz" | „Vermittlung" (neutral) | „Vermittlung" (neutral) | Footer ist rollenunabhängig → neutraler Begriff |

---

## 9. Implementierungshinweise für Phase 2

### Empfohlene Lösung: `getTerminologyLabel(key, role)`

```js
// frontend/public/js/terminologyLabels.js  (NEU in Phase 2)
const TERMINOLOGY = {
  marketplace:     { company: "Personal finden",        agency: "Arbeitsplatz finden" },
  createDemand:    { company: "Arbeitsplatz anbieten",  agency: null },
  demandList:      { company: "Arbeitsplatzangebote",   agency: "Offene Arbeitsplatzangebote" },
  demandDetail:    { company: "Arbeitsplatzangebot",    agency: "Arbeitsplatzangebot" },
  capacityCreate:  { company: null,                     agency: "Personal einstellen" },
  capacityList:    { company: "Verfügbares Personal",   agency: "Verfügbares Personal" },
  findStaff:       { company: "Personal finden",        agency: null },
  findWorkplace:   { company: null,                     agency: "Arbeitsplatz finden" },
};

function getTerminologyLabel(key, role) {
  return TERMINOLOGY[key]?.[role] ?? TERMINOLOGY[key]?.company ?? key;
}
```

### Alternative: Direkte Anpassung pro Seite

Wenn rollenabhängige Logik auf einer Seite bereits vorhanden ist (z. B. via `window.TC_USER.org_type`), können Strings direkt im HTML/JS der Seite angepasst werden. Doku-Pflicht: Welche Strings wurden wo geändert.

### Was NICHT tun in Phase 2

- Keine globale Find-and-Replace-Aktion ohne Kontext
- Keine Änderung an `innerHTML` ohne `esc()` Absicherung
- Keine neuen Backend-Endpunkte nur für Terminologie
- Keine DB-Migrationen

---

## 10. Offene Entscheidungen (Owner-Freigabe)

> Diese Punkte sind dokumentiert, blockieren aber NICHT Phase 2. Standard-Verhalten ist in Klammern angegeben.

| # | Frage | Standard (wenn kein Input) |
|---|---|---|
| C-1 | Ist „Arbeitsplatzangebot" der finale Begriff für Company? (oder „Stellenangebot"?) | „Arbeitsplatzangebot" (aus Track-C-Dok.) |
| C-2 | Footer-Link: rollenabhängig oder neutral „Vermittlung"? | Neutral „Vermittlung" (kein Rollen-Overhead im Footer) |
| C-3 | Breadcrumb-Logik: rollenabhängig in JS oder statisch? | Statisch pro Seite (einfacher, weniger Risikozone) |

---

## 11. Phasen-Fortschritt

| Phase | Inhalt | Status | Artefakt |
|---|---|---|---|
| 0 | Inventar | ✅ abgeschlossen | `docs/product/TERMINOLOGY_RENAME_AUDIT.md` |
| 1 | Leitfaden | ✅ abgeschlossen | diese Datei |
| 2 | Rollenabhängige UI-Labels | ✅ abgeschlossen | `frontend/public/js/terminologyLabels.js`, `pageShell.js`, 4 Hauptseiten, 14/14 Tests grün |
| 3 | Company-Ansicht | ✅ abgeschlossen | `enterprise.html`, `requisitions.html`, `marketplace_demand_detail.html` u.a. |
| 4 | Agency-Ansicht | ✅ abgeschlossen | `capacity_exchange_feed.html`, `capacity_exchange_manage.html` u.a. |
| 5 | Marktplatz-Begriff | ✅ abgeschlossen | `breadcrumb.js`, `footer.js`, `contextHints.js`, nav in 15+ HTML-Dateien |
| 6 | Bedarf-Begriff | ✅ abgeschlossen | `pageShell.js`, `capacityExchangeDetail.js`, `marketplaceFeed.js` |
| 7 | Kapazität-Begriff | ✅ abgeschlossen | `activity.js`, `navConfig.js`, 18+ HTML-Dateien |
| 8 | Dashboards / Navigation | ✅ abgeschlossen | KPI-Karten, `trust/*.html`, `pricing.html`, `sla_abo.html` u.a. |
| 9 | E-Mails / Notifications | ✅ abgeschlossen | `activityFeed.js`, `integrationAdapters.js`, `emailHtmlTemplates.js`, `planCatalog.js` u.a. |
| 10 | Routen / Dateinamen | ✅ abgeschlossen | `activity.html` Filter-Buttons, Kompatibilitätsprüfung |
| 11 | Tests / Regression | ✅ abgeschlossen | 3979 Tests, 0 Failures; Fix: `leadRow.selected_addons` sso→spend |
| 12 | Dokumentation | ✅ abgeschlossen | `TERMINOLOGY_GUIDE.md`, `TERMINOLOGY_RENAME_AUDIT.md`, `PHASE_STATUS.md` |

---

*Änderungen an diesem Leitfaden nur nach Owner-Bestätigung. Bei Widerspruch mit TRACK_C_TERMINOLOGY.md gilt der Leitfaden als aktuellerer Stand.*
