# Terminologie-Umbenennung — Inventar-Audit (Phase 0)

> **Track C Phase 0 — Read-only Inventar**
> Erstellt: 2026-05-28 | Branch: release/enterprise-premium-market-ready
> Zweck: Vollständige Bestandsaufnahme aller sichtbaren Begriffe, die in Phase 2–9 umbenannt werden sollen.
> **Keine Codeänderung in dieser Phase — nur dieses Dokument.**

---

## Legende

| Spalte | Bedeutung |
|---|---|
| `Datei` | Pfad relativ zum Repo-Root |
| `alter Begriff` | Aktueller Text im UI/Code |
| `sichtbarer Kontext` | Wo der Begriff erscheint (Titel, Button, Breadcrumb, …) |
| `betroffene Rolle` | Company / Agency / Worker / Staff / Admin / alle |
| `empfohlener neuer Begriff` | Zielzustand per Begriffsmatrix |
| `Änderung` | JA / NEIN / TEILWEISE |
| `Begründung` | Warum (oder warum nicht) |

---

## 1. Begriff: „Marktplatz"

> Ziel-Mapping: Company → „Personal finden", Agency → „Arbeitsplatz finden", intern → bleibt `marketplace.html` / `capacity_exchange_feed.html`

| Datei | alter Begriff | sichtbarer Kontext | betroffene Rolle | empfohlener neuer Begriff | Änderung | Begründung |
|---|---|---|---|---|---|---|
| `frontend/public/capacity_exchange_feed.html` | `<title>Marktplatz - TempConnect</title>` | Browser-Tab-Titel | Company + Agency | „Personal finden" / „Arbeitsplatz finden" (rollenabhängig) | JA | Erster UI-Kontaktpunkt. Technischer Dateiname bleibt. |
| `frontend/public/capacity_exchange_feed.html` | `<h1>Marktplatz</h1>` | Seitenüberschrift | Company + Agency | Rollenabhängig: s. o. | JA | Prominenteste sichtbare Stelle der Seite. |
| `frontend/public/enterprise.html` | Hub-Karte: Titel „Marktplatz" | Operations-Hub-Karte | Company | „Personal finden" | JA | Direkte Nutzeransprache auf der Startseite. |
| `frontend/public/enterprise.html` | Button: „Zum Marktplatz" | Hub-Karte CTA | Company | „Personal finden" | JA | Klar handlungsauffordernder Button. |
| `frontend/public/enterprise.html` | CTA: „Bedarf erfassen" | Hub-Karte CTA | Company | „Arbeitsplatz anbieten" | JA | Doppelbefund: betrifft auch Bedarf-Begriff. |
| `frontend/public/hilfe.html` | FAQ-Sektion: „Marktplatz" | Hilfetexte / FAQ | Company + Agency | „Personal finden / Arbeitsplatz finden" (rollenabhängig) | JA | Nutzer suchen dort nach Erklärungen — Begriffe müssen passen. |
| `frontend/public/pricing.html` | „Marktplatz-Modul" | Feature-Vergleichstabelle | alle | „Vermittlungsmodul" | JA | Marketing-seitige Seite — klare Sprache wichtig. |
| `frontend/public/sla_hilfe.html` | „Die Marktplatz ist der zentrale Marktplatz für verfügbare Personalkapazitäten." | Hilfetext | alle | „Personal finden ist der zentrale Ort für verfügbare Fachkräfte." | JA | Grammatikfehler + missverständlicher Begriff. |
| `frontend/public/executive_dashboard.html` | „Marktplatzaktivität" | KPI-Karte Titel | Admin / Staff | „Vermittlungsaktivität" | JA | Plattforminterne Metrik — neutraler Begriff sinnvoll. |
| `frontend/public/legal/agb.html` | „Marktplatz" | AGB-Definitionen | alle | — | NEIN | Juristischer Vertragstext. Änderungen erfordern Rechtsfreigabe. |
| `frontend/public/js/breadcrumb.js` | `area: 'Marktplatz'` (10 Einträge) | Breadcrumb-Navigation | Company + Agency | Rollenabhängige Breadcrumb-Label | JA | Sichtbar im Breadcrumb. Umsetzung erfordert rollenabhängige Logik (Phase 2). |
| `frontend/public/js/contextHints.js` | `title: 'Marktplatz'` (3 Stellen) | Kontexthilfe-Banner | Company + Agency | Rollenabhängig | JA | Inline-Hilfetexte — müssen mit der Seitensprache konsistent sein. |
| `frontend/public/js/footer.js` | Footer-Link: „Marktplatz" | Globaler Footer | alle | „Personal finden" | JA | Footer ist auf jeder Seite sichtbar. |
| `frontend/public/js/navConfig.js` | `label: "Kapazitätssuche"` | Haupt-Navigation | Company | „Personal finden" | JA | Einziger NAV-Eintrag der Hauptnavigation mit technischem Begriff. |
| `frontend/public/about.html` | „wiederkehrender temporärer Personalbedarf" | Marketing-Landingpage | Besucher | „Personalplanung" / neutraler | TEILWEISE | Marketing-Text. Nicht „Marktplatz" aber Kontext relevant für Track C Phase 5. |

---

## 2. Begriff: „Bedarf / Bedarfe"

> Ziel-Mapping: Company → „Arbeitsplatzangebot / Arbeitsplatzangebote", „Arbeitsplatz anbieten"

| Datei | alter Begriff | sichtbarer Kontext | betroffene Rolle | empfohlener neuer Begriff | Änderung | Begründung |
|---|---|---|---|---|---|---|
| `frontend/public/requisitions.html` | Seitentitel: „Bedarfe" | `<h1>` / Page-Title | Company | „Arbeitsplatzangebote" | JA | Hauptseite des Bedarf-Flows. |
| `frontend/public/requisitions.html` | Button: „Neuer Bedarf" | Aktions-Button | Company | „Neues Arbeitsplatzangebot" | JA | Anlage-CTA — Schlüsselpunkt im User-Flow. |
| `frontend/public/requisitions.html` | Empty-State-Text (mit „Bedarf") | Leer-Zustand | Company | Neuer Text mit „Arbeitsplatzangebot" | JA | Nutzer landen hier wenn nichts da ist. |
| `frontend/public/enterprise.html` | Hub-Karte Titel: „Bedarfe" | Hub-Karte | Company | „Arbeitsplatzangebote" | JA | Direkte Nutzeransprache auf Startseite. |
| `frontend/public/enterprise.html` | Hub-Karte Beschreibung mit „Bedarfe" | Hub-Karte Subtext | Company | Rollenlogisch umformulieren | JA | Beschreibungstext unter Karte. |
| `frontend/public/demand_create.html` | `<title>Bedarf erstellen – Marktplatz</title>` | Browser-Tab + H1 | Company | „Arbeitsplatzangebot erstellen" | JA | Legacy-Erstellungsseite ist noch aktiv. |
| `frontend/public/marketplace_demand_detail.html` | „Bedarf gesamt" | Detail-Seite Metrik | Company | „Stellen gesamt" | JA | Numerische Metrik auf der Detailseite. |
| `frontend/public/pricing.html` | „Bedarf & Deal" | Feature-Vergleichszeile | Company | „Arbeitsplatz & Deal" | JA | Pricing-Seite ist extern sichtbar. |
| `frontend/public/js/contextHints.js` | Context-Hint-Label: „Bedarfe" (2 Stellen) | Kontexthilfe-Banner | Company | „Arbeitsplatzangebote" | JA | Inline-Hilfe muss konsistent sein. |
| `frontend/public/js/contextHints.js` | Text: „Personalanfragen für konkrete Zeitarbeits-Bedarfe" | Kontexthilfe-Text | Company | „Arbeitsplatzangebote erstellen und verwalten" | JA | Verständlichkeit für Nicht-Fachkundige. |
| `frontend/public/js/breadcrumb.js` | `area: 'Bedarfe'` (5 Einträge) | Breadcrumb | Company | „Arbeitsplatzangebote" | JA | Sichtbar oben auf jeder Bedarfs-Seite. |
| `frontend/public/about.html` | „Zeitarbeitsbedarfe" (3 Stellen) | Marketing-Texte | Besucher | „Personalbedarf" / „Stellenbedarf" | TEILWEISE | Weniger technisch, aber noch akzeptabel für B2B. Prüfen in Phase 3. |
| `api/services/agreementDocumentService.js` | „Bedarfsprofil" | PDF-Vertragsabschnitt | Company | „Stellenprofil" | JA | Erscheint im kundennahen Vertragsdokument (PDF). |

---

## 3. Begriff: „Kapazität / Kapazitäten"

> Ziel-Mapping: Agency → „Personal einstellen", „Verfügbares Personal"; Fachkräfte-Listings → „Personalangebote"

| Datei | alter Begriff | sichtbarer Kontext | betroffene Rolle | empfohlener neuer Begriff | Änderung | Begründung |
|---|---|---|---|---|---|---|
| `frontend/public/capacity_search.html` | `<title>Kapazitätssuche</title>` | Browser-Tab-Titel | Agency | „Personal finden" | JA | Erster UI-Kontaktpunkt für Agency-Nutzer. |
| `frontend/public/capacity_search.html` | `<h1>Kapazitäten suchen</h1>` | Seitenüberschrift | Agency | „Personal finden" | JA | Prominenteste Stelle. |
| `frontend/public/capacity_search.html` | „Keine Kapazitäten im Umkreis" | Leer-Zustand Suchresultat | Agency | „Keine Mitarbeiter im Umkreis gefunden" | JA | Wichtiger Leer-Zustand im Suchflow. |
| `frontend/public/capacity_search.html` | Modal-Texte mit „Kapazität" | Detail-Modal | Agency | „Mitarbeiter" / „Fachkraft" | JA | Direkter Nutzerdialog im Modal. |
| `frontend/public/sla_angebote.html` | „Kapazitätsangebote" | Seitentitel / H1 | Agency | „Personalangebote" | JA | SLA-Angebote-Seite für Agency. |
| `frontend/public/js/navConfig.js` | `label: "Kapazitätssuche"` | Hauptnavigation | Company | „Personal finden" | JA | Bereits in Marktplatz-Abschnitt erfasst — selbe Datei/Zeile. |
| `frontend/public/legal/agb.html` | „Kapazitäten" (3 Stellen, Definitionen) | AGB-Definitionen | alle | — | NEIN | Juristischer Vertragstext. Keine Änderung ohne Rechtsfreigabe. |
| `frontend/public/worker-submissions-review.html` | „+ Kapazität zuweisen" | Staff-internes Tool | Staff | — | NEIN | Internes Steuerungs-Interface für Staff. Technischer Begriff ist hier OK. |
| `api/services/activityFeedService.js` | „Kapazität eingestellt" / „Kapazität aktualisiert" etc. (4 Labels) | Activity-Feed Labels | Company + Agency | „Mitarbeiter eingestellt" / „Angebot aktualisiert" | TEILWEISE | Sichtbar im Activity-Feed für Nutzer — Phase 9 (Notifications/Activity). |
| `api/services/adminControlCenterService.js` | „Aktive Kapazitäten" | Admin-Panel Metrik | Admin | — | NEIN | Interne Admin-Metrik. Technischer Begriff bleibt. |

---

## 4. Begriff: „Requisition / Requisitions"

> Intern bleibt: `requisitions`-Tabelle, `/api/requisitions`, alle DB-Felder.
> Sichtbar für Nutzer: umbenannt zu „Arbeitsplatzangebot".

| Datei | alter Begriff | sichtbarer Kontext | betroffene Rolle | empfohlener neuer Begriff | Änderung | Begründung |
|---|---|---|---|---|---|---|
| `frontend/public/activity.html` | Filter-Button: „Requisitions" | Activity-Filter | Company | „Arbeitsplatzangebote" | JA | Sichtbarer Filter auf der Activity-Seite. |
| `frontend/public/activity.html` | Dropdown: „Requisition erstellt" / „Requisition besetzt" | Event-Filter | Company | „Angebot erstellt" / „Stelle besetzt" | JA | Nutzersichtbare Event-Labels im Filter. |
| `frontend/public/api-docs.html` | „Requisitions (VMS)" Section, API-Pfade | Entwicklerdokumentation | Entwickler | — | NEIN | Technische API-Dokumentation. Fachbegriff ist korrekt und erwünscht. |
| `api/services/activityFeedService.js` | Labels: „Requisition erstellt" bis „Requisition besetzt" (8 Einträge) | Activity-Feed Anzeige | Company | „Angebot erstellt" / „Stelle besetzt" usw. | JA | Sichtbar im Activity-Feed der Company-Nutzer. Phase 9. |
| `api/services/adminControlCenterService.js` | State-Machine-Beschreibung: „Requisition" | Admin-Übersicht | Admin/Staff | — | NEIN | Interne Betriebsdokumentation. Technischer Begriff bleibt. |
| `api/services/assignmentStaffingService.js` | „Für diesen Bedarf bereits kontaktiert" | Staff-interne Score-Reason | Staff | — | NEIN | Interner Scoring-Hinweis für Staff-Prozesse. |

---

## 5. Weitere sichtbare Begriffe mit Handlungsbedarf

> Nicht in der primären Begriffsmatrix, aber im Scan aufgefallen.

| Datei | alter Begriff | sichtbarer Kontext | betroffene Rolle | empfohlener neuer Begriff | Änderung | Begründung |
|---|---|---|---|---|---|---|
| `frontend/public/js/contextHints.js` | „Marktplatz-, Bedarfs- und Deal-Erfolg" | Kontexthilfe | Company | Umformulieren | JA | Kombinierter Satz mit mehreren Problembegriffen. |
| `frontend/public/js/contextHints.js` | „Bedarfe und verfügbare Kapazitäten" | Kontexthilfe | Company + Agency | „Angebote und verfügbare Fachkräfte" | JA | Beide Problemterme in einem Satz. |
| `frontend/public/js/breadcrumb.js` | Kommentar-Zeile: `/* Marktplatz */` | Code-Kommentar | — | — | NEIN | Kommentar, nicht sichtbar. Kann bleiben als technische Orientierung. |
| `frontend/public/js/authIntent.js` | Code-Kommentar: `// Default: Marktplatz als Einstiegspunkt` | Code-Kommentar | — | — | NEIN | Nur Code-Kommentar, nicht sichtbar. |
| `frontend/public/js/catalogRenderer.js` | „Bedarfs-, Angebots- und Einsatzkoordination" | Pricing-Footer-Text | alle | „Personalvermittlung und Einsatzkoordination" | JA | Sichtbar unten auf der Preisliste. |

---

## 6. Bewusst nicht geänderte Stellen (technisch intern)

> Diese Begriffe wurden gefunden, aber werden **nicht** umbenannt. Zur Dokumentation.

| Begriff | Warum nicht ändern |
|---|---|
| `capacity_exchange_feed.html` (Dateiname) | Dateiname — kein Breaking Change ohne Redirect-Kette. In Phase 10 ggf. evaluieren. |
| `requisitions.html` (Dateiname) | Dateiname — bleibt intern. API-Route `/api/requisitions` unverändert. |
| `capacity_search.html` (Dateiname) | Dateiname — technisch intern. |
| DB-Felder: `requisitions`, `capacity_posts`, etc. | Keine DB-Migration nur wegen UI-Sprache (Phase-4-Track-C-Regel). |
| API-Routen: `/api/requisitions`, `/api/capacities` | API-Kompatibilität darf nicht brechen. |
| AGB / Impressum / Datenschutz | Juristischer Text — Owner-Freigabe + Rechtsberatung erforderlich. |
| Admin-Control-Center-Metriken | Interne Betriebsoberfläche — technische Begriffe OK. |
| Staff-interne Tools (z. B. `worker-submissions-review.html`) | Staff kennt technische Begriffe, Kundenverwirrung entsteht dort nicht. |
| API-Dokumentation (`api-docs.html`) | Entwicklerdokumentation — Fachbegriffe korrekt und gewünscht. |

---

## 7. Zusammenfassung: Betroffene Dateien

| Kategorie | Anzahl Dateien mit JA-Änderungen | Priorität |
|---|---|---|
| Frontend HTML (Seiten) | 10 | Hoch — Phase 2–7 |
| Frontend JS (Breadcrumb, Context, Nav, Footer) | 5 | Mittel — Phase 8 |
| Backend Services (sichtbare Labels in Activity/Feed) | 2 | Niedrig — Phase 9 |
| PDFs / Vertragsdokumente | 1 | Mittel — Phase 3 |
| **Gesamt** | **18** | |

---

## 8. Rollenzuweisung Übersicht

| Begriff | Company sieht | Agency sieht | Worker sieht | Neuer Begriff (Company) | Neuer Begriff (Agency) |
|---|---|---|---|---|---|
| Marktplatz | ✓ | ✓ | — | „Personal finden" | „Arbeitsplatz finden" |
| Bedarf / Bedarfe | ✓ | — | — | „Arbeitsplatzangebot/e" | — |
| Kapazität einstellen | — | ✓ | — | — | „Personal einstellen" |
| Kapazitäten (Listings) | ✓ | ✓ | — | „Verfügbares Personal" | „Personalangebote" |
| Requisition (UI) | ✓ | — | — | „Arbeitsplatzangebot" | — |

---

## 9. Akzeptanzkriterien Phase 0

- [x] Scan aller `frontend/public/*.html` auf Marktplatz, Bedarf, Kapazität, Requisition
- [x] Scan aller `frontend/public/js/*.js` auf dieselben Begriffe
- [x] Scan `api/services/` auf nutzersichtbare Labels (Activity Feed, PDF-Templates)
- [x] Alle Fundstellen mit Rolle und Empfehlung dokumentiert
- [x] Bewusst nicht geänderte Stellen explizit dokumentiert
- [x] Keine Codeänderung außer dieser Datei
- [ ] Owner-Review: Begriffsmatrix bestätigen oder anpassen vor Phase 1

---

## 10. Empfehlung für Phase 1

Die nächste Phase erstellt `docs/product/TERMINOLOGY_GUIDE.md` mit:
1. Verbindliche Begriffsmatrix (rollenabhängig)
2. Priorisierte Änderungsliste (nach Sichtbarkeit sortiert)
3. Worte die immer → immer falsch sind (Verbotsliste)
4. Worte die technisch bleiben (Zulässigkeitsliste)

**Owner-Entscheidung vor Phase 1 nötig:**
- Ist „Arbeitsplatzangebot" der finale Begriff für Company (statt z. B. „Stellenangebot" oder „Personalbedarf")?
- Soll der Footer rollenabhängig gerendert werden oder einen neutralen Begriff haben?
- Soll die Breadcrumb-Logik in JS rollenabhängig oder statisch umbenannt werden?

---

*Phase 0 abgeschlossen. Keine weiteren Aktionen in dieser Datei bis Owner-Review.*

---

## Track C — Abschlussstatus (2026-05-29)

Track C vollständig abgeschlossen. Alle 13 Phasen (0–12) durchgeführt.

| Phase | Abgeschlossen | Ergebnis |
|---|---|---|
| 0 | ✅ 2026-05-28 | Inventar-Audit erstellt (diese Datei) |
| 1 | ✅ 2026-05-28 | TERMINOLOGY_GUIDE.md erstellt |
| 2 | ✅ 2026-05-28 | terminologyLabels.js, pageShell.js, 4 Hauptseiten; 14/14 Tests grün |
| 3 | ✅ 2026-05-28 | Company-Ansicht: enterprise.html, requisitions.html, marketplace_demand_detail.html u.a. |
| 4 | ✅ 2026-05-28 | Agency-Ansicht: capacity_exchange_feed.html, capacity_exchange_manage.html u.a. |
| 5 | ✅ 2026-05-28 | Marktplatz→Vermittlung: breadcrumb.js, footer.js, contextHints.js, 15+ HTML-Dateien |
| 6 | ✅ 2026-05-28 | Bedarf-Begriff: pageShell.js, capacityExchangeDetail.js, marketplaceFeed.js |
| 7 | ✅ 2026-05-29 | Kapazität-Begriff: activity.js, navConfig.js, 18+ HTML-Dateien |
| 8 | ✅ 2026-05-29 | Dashboards/Navigation: KPI-Karten, trust/*.html, pricing.html, sla_abo.html u.a. |
| 9 | ✅ 2026-05-29 | E-Mails/Notifications: activityFeed.js, integrationAdapters.js, emailHtmlTemplates.js, planCatalog.js u.a. |
| 10 | ✅ 2026-05-29 | Kompatibilitätsprüfung: activity.html Filter-Buttons; funktionale Attribute unverändert |
| 11 | ✅ 2026-05-29 | 3979 Tests, 0 Failures; Fix: subscriptionLifecycle leadRow sso→spend |
| 12 | ✅ 2026-05-29 | Dokumentation: TERMINOLOGY_GUIDE.md + TERMINOLOGY_RENAME_AUDIT.md + PHASE_STATUS.md aktualisiert |

**Nicht geändert (intentional):** `legal/agb.html`, `legal/sla.html`, `api-docs.html` — juristische/technische Terminologie bleibt.
**Funktionale Attribute unverändert:** `data-cat="requisition"`, `option value="requisition_created"`, API-Keys, Route-Pfade, DB-Spalten.

*Track C vollständig. Keine weiteren Aktionen in dieser Datei erforderlich.*
