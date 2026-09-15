# Welle V — Komplettsystem oder angedocktes Modul: Betriebsarten, Schnittstellen, Kreisläufe

> **Status: Bauanweisung.** Erstellt 2026-09-14 aus dem Owner-Dokument (Abschnitt 16).
> **Gebaut von der bauenden Sitzung, gegengeprüft von der planenden** — siehe
> [`../UEBERGABE.md`](../UEBERGABE.md), Abschnitt „Wer baut, wer prüft".

---

## 1. Die Owner-Vorgabe

> *„Schnittstellen vorbereiten, sodass TempConnect als Zusatz für laufende Systeme verwendet werden
> kann — unter anderem zvoove, SAP Fieldglass … Keine Zeitarbeitsfirma oder kein Einsatzunternehmen
> soll komplett umbauen oder sich neu in eine Verwaltungssoftware einarbeiten müssen. TempConnect
> kann aber auch als vollwertiges System genutzt werden."*

Das ist die Marktposition in einem Satz: **nicht gegen die bestehenden Systeme antreten, sondern
die Schicht zwischen den Firmen besetzen.** Die Zeitarbeitsfirma behält ihre Lohnbuchhaltung, der
Großkunde sein Lieferantenportal — TempConnect verbindet beide.

---

## 2. Ist-Stand (gemessen 2026-09-14)

| Baustein | Stand |
|---|---|
| Webhooks | `api/routes/integrations.js`: anlegen, testen, Zustellprotokoll, fehlgeschlagene wiederholen; Slack/Teams-Formate (`integrationAdapters.js`) |
| ERP-Zuordnungen | `/org/erp-mappings` (CRUD) |
| Maschinenzugang | `apiKeyService.js`, `middleware/apiKeyAuth.js` — Schlüssel an die Organisation gebunden |
| Provisionierung | `api/routes/scim.js` |
| Buchhaltung | `datevExportService.js`; E-Rechnung ZUGFeRD / PDF/A-3u mit Schematron-Prüfung (Welle J) |
| API-Beschreibung | `openapi/` — **und drei Doku-Seiten** (`api-docs.html`, `api-explorer.html`, `api_docs.html`) |
| zvoove, SAP Fieldglass | **nichts** |

**Die Grundlage ist breiter, als der Abschnitt vermuten lässt.** Was fehlt, ist nicht die Technik
für Schnittstellen, sondern ein **stabiler, beschriebener Vertrag je Geschäftsobjekt** — und die
beiden konkreten Adapter.

---

## 3. Wellen und Phasen

### V0 · Messen

| Phase | Inhalt | Nachweis |
|---|---|---|
| V0.1 | Je Geschäftsobjekt (Mitarbeiter, Verfügbarkeit, Bedarf, Angebot, Einsatz, Stundenzettel, Rechnung): gibt es Lesen, Schreiben, Ereignis? | Matrix mit Fundstellen |
| V0.2 | **Deckt `openapi/` die echten Routen?** | Abweichungsliste |
| V0.3 | Welche der drei Doku-Seiten ist die lebende | Befund; die anderen gehen nach Welle P |

### V1 · Der offene Vertrag zuerst

| Phase | Inhalt | Nachweis |
|---|---|---|
| V1.1 | **Versionierte Schnittstelle** je Objekt aus V0.1; Änderungen nur additiv innerhalb einer Version | Vertragstest: entferntes Feld → rot |
| V1.2 | **Ereignisse je Objekt** (Einsatz angelegt, Stundenzettel genehmigt, Rechnung gestellt) über die bestehenden Webhooks, **signiert** | Falsche Signatur wird vom Beispielempfänger abgelehnt |
| V1.3 | **Idempotenz** bei schreibenden Aufrufen (bestehende Regel) | Doppelter Aufruf → ein Datensatz |
| V1.4 | **OpenAPI aus den Routen erzeugt**, eine Doku-Seite | Wächter: Route ohne Beschreibung → rot |
| V1.5 | **Mandantengrenze am Schlüssel:** ein Schlüssel der Firma A liest nie Firma B | Fremdzugriff → 403. Rückmutation |

### V2 · Ohne Programmierung

| Phase | Inhalt | Nachweis |
|---|---|---|
| V2.1 | CSV-/Excel-Vorlagen je Objekt, Import mit denselben Synonymregeln wie der Mitarbeiter-Import (Abschnitt 5) | Vorlage herunterladen → ausfüllen → importieren |
| V2.2 | Export je Objekt, DATEV und E-Rechnung bleiben, wie sie sind | Bestehende Tests grün |

### V3 · Adapter zvoove

**Voraussetzung (Owner):** Partner- bzw. Schnittstellenzugang und Dokumentation beim Anbieter. Ohne
sie wird nicht geraten, sondern gewartet — ein Adapter gegen eine vermutete Schnittstelle ist
schlimmer als keiner.

| Phase | Inhalt | Nachweis |
|---|---|---|
| V3.1 | **Richtung festlegen:** Mitarbeiterstamm und Einsätze aus zvoove lesen; Stundenzettel und Abrechnungsdaten zurückgeben | Zuordnungstabelle Feld für Feld |
| V3.2 | **Je Firma zuschaltbar**, Zugangsdaten verschlüsselt, nie im Repository | Ohne Freischaltung kein Aufruf |
| V3.3 | **Vertragstests mit aufgezeichneten Antworten** — kein Live-System im Test | Test läuft ohne Netz |
| V3.4 | Konflikte sichtbar: wer ist führend, wenn beide Seiten ändern | Konfliktfall erscheint, statt still überschrieben zu werden |

### V4 · Adapter SAP Fieldglass

**Voraussetzung:** Fieldglass ist das Lieferantenportal des **Großkunden**; die Anbindung gibt in
aller Regel der Kunde frei. Ob der Branchenstandard HR Open Standards (früher HR-XML) genutzt wird,
ist mit der Anbieter-Dokumentation zu klären, nicht anzunehmen.

| Phase | Inhalt | Nachweis |
|---|---|---|
| V4.1 | Bedarfe aus Fieldglass als Bedarf im Marktplatz (katalogfest, N8.1) | Ein eingelesener Bedarf findet Treffer |
| V4.2 | Besetzung, Zeiten und Rechnung zurück | Feld-Zuordnung belegt |
| V4.3 | Wie V3.2–V3.4 | dito |

### V5 · Datenschutz über alle Wellen

| Phase | Inhalt | Nachweis |
|---|---|---|
| V5.1 | Jede Übertragung von Mitarbeiterdaten hat eine benannte Rechtsgrundlage und ist durch den Firmen-Admin freigeschaltet | Keine Freischaltung → keine Übertragung |
| V5.2 | Protokoll je Übertragung (wer, welches Objekt, wohin) im **Firmen**-Audit | Audit-Zeile belegt |
| V5.3 | Schlüssel rotierbar ohne Ausfall | Alter Schlüssel nach Rotation → 401 |

---

---

## 3a. Zwei Betriebsarten — Komplettsystem oder angedocktes Modul

**Owner-Vorgabe 2026-09-14:** TempConnect muss **als Komplettsystem** nutzbar sein **und** modular,
angedockt an zvoove bis SAP Fieldglass. Das ist keine Schnittstellenfrage, sondern eine
**Produktarchitektur** — sie entscheidet für jedes Geschäftsobjekt, welches System die Wahrheit hält.

| | **Komplettsystem** | **Angedockt** |
|---|---|---|
| Für wen | Firmen ohne Branchensoftware, Neugründungen, KMU | Zeitarbeitsfirmen mit zvoove, Großkunden mit SAP Fieldglass |
| Mitarbeiterstamm | TempConnect | zvoove führt, TempConnect liest |
| Verfügbarkeit, Marktplatz, Matching, Deal | TempConnect | **TempConnect** — das ist die Schicht zwischen den Firmen |
| Live-Belegschaft, Einsatzportal | TempConnect | **TempConnect** |
| Bedarf des Großkunden | TempConnect | Fieldglass führt, TempConnect liest und besetzt |
| Stundenzettel | TempConnect | TempConnect erfasst, Ergebnis geht zurück |
| Rechnung, Lohn | TempConnect (Rechnung), Lohn nie | Branchensoftware führt |

> **Der Kern bleibt immer bei TempConnect:** Marktplatz, Matching, Deal, Live-Belegschaft,
> Einsatzportal. Genau das hat kein Bestandssystem firmenübergreifend — deshalb ist es das, was
> man kauft, auch wenn man den Rest behält.

### V6 · Das führende System je Objekt

| Phase | Inhalt | Nachweis |
|---|---|---|
| V6.1 | **Registratur „führendes System"** je Organisation und Objekt (Mitarbeiter, Verfügbarkeit, Bedarf, Einsatz, Stundenzettel, Rechnung). Vorgabe: TempConnect | Neue Organisation → Komplettsystem, ohne Zutun |
| V6.2 | **Genau ein führendes System je Objekt.** Ist es extern, lehnt jeder schreibende Endpunkt dieses Objekts ab (409, mit Hinweis wohin) — geschrieben wird nur über den Adapter | Schreibversuch bei extern geführtem Objekt → 409. Rückmutation |
| V6.3 | **Wechsel der Betriebsart** ist ein geführter Vorgang mit Wirkungsvorschau („ab jetzt kommen 214 Mitarbeiter aus zvoove, 3 lokale Änderungen würden überschrieben") — nie ein stiller Schalter | Vorschau zeigt Zahlen, bevor etwas geschieht |
| V6.4 | **Module als Berechtigung** (Tier 3 der Konfigurations-Taxonomie), nicht als eigener Plan-Zweig | Modul aus → Fläche nach bestehendem Sichtbarkeitsmuster |
| V6.5 | **Owner-Entscheidung V-E1 (offen):** Preis des angedockten Pakets — eigenes Paket, Rabatt auf PRO oder Provision | Blockiert V6.1–V6.4 nicht |

### V7 · Die Oberfläche kennt die Betriebsart

| Phase | Inhalt | Nachweis |
|---|---|---|
| V7.1 | **Einrichtung beim ersten Login:** „Wie nutzen Sie TempConnect?" — Komplettsystem · mit zvoove · mit SAP Fieldglass · anderes System. Die Antwort setzt V6.1 | Jede Antwort ergibt eine belegte Registratur |
| V7.2 | **Extern geführte Objekte sind sichtbar, nicht versteckt:** schreibgeschützt, Kennzeichen „geführt in zvoove", Direktlink ins Fremdsystem, Datenstand. Versteckt wäre eine Sackgasse | Neuer Sichtbarkeitszustand neben den bestehenden `hidden_*`; jede Objektseite zeigt ihn |
| V7.3 | **Kein toter Button:** Anlegen/Bearbeiten erscheint bei extern geführten Objekten gar nicht | Entdeckender Wächter über alle Seiten der registrierten Objekte |
| V7.4 | **Synchronisationsstand sichtbar** (letzter Abgleich, Fehler, „jetzt abgleichen") für den Firmen-Admin; Ausfälle zusätzlich im Staff CC | Adapter-Fehler → Hinweis in beiden Sichten |
| V7.5 | **Hilfe-Center je Betriebsart** — dieselbe Frage hat im angedockten Betrieb eine andere Antwort | Artikel mit Betriebsart-Kennzeichen |

---

## 3b. Die Kreisläufe — und wer welches Glied führt

Eine Plattform wirkt erst dann „fertig", wenn **jede Kette zu ihrem Anfang zurückkehrt**. Jedes Glied
unten ist eine Fähigkeit im Sinne von Welle T (Endpunkt · Aufrufer · Wächter) — **das Monatsaudit
misst also, welche Kreisläufe geschlossen sind.**

| Kreislauf | Glieder | Liefernde Wellen |
|---|---|---|
| **K-1 Verfügbarkeit** | Skill eingetragen → Angebot → Marktplatz → Deal → Einsatz → Bestätigung im Einsatzportal → Live-Belegschaft → Einsatzende → **wieder verfügbar, Angebot wieder sichtbar** | M4b, N, M7, E, J |
| **K-2 Zeit und Geld** | Einsatz → Stundenzettel (Frist) → Prüfung Zeitarbeitsfirma → **Kunde (N8.2)** → genehmigt → Rechnung / E-Rechnung → Zahlung / Mahnung → Bounty / Cashback → **Lohnvorschau (X)** → Monatsplanung | N8, J, K, X, M1.9 |
| **K-3 Ausfall** | Krankmeldung oder Verspätung → Benachrichtigung Firma und Kunde → Ersatzvorschlag → Ersatz mit Bestätigung → Live-Belegschaft und Stundenzettel **ab Datum** → Zuverlässigkeit (ohne Gesundheitsdaten) | Q, I, E |
| **K-4 Vertrauen** | Abschluss → Bewertung beidseitig → Ranking → Sperrliste → Profilsichtbarkeit → Matching | O, N4, U5 |
| **K-5 Hilfe** | Frage → Hilfe-Center → Support-Anfrage → Lösung → **häufige Anfrage wird Hilfeartikel** → weniger Anfragen | I, W |
| **K-6 Nachweis** | Handlung → Audit (Firma / Staff CC) → Monatsaudit → Fähigkeiten-Register → Investorensicht | I, T |
| **K-7 Anbindung** | Fremdsystem ändert → Adapter → K-1 / K-2 aktualisiert → Ereignis zurück ans Fremdsystem | V |

| Phase | Inhalt | Nachweis |
|---|---|---|
| V8.1 | **Jeder Kreislauf als Durchstich-Test** über alle Glieder, in beiden Betriebsarten | Ein fehlendes Glied → der Kreislauf-Test ist rot und nennt es |
| V8.2 | **Kreisläufe im Monatsaudit (T2):** je Kreislauf „geschlossen / offen bei Glied n" | Glied entfernen → Audit meldet genau dieses |

---

## 3c. Verdrahtung im Frontend — gilt für jede Phase dieser und der Wellen N8, E7, U, W, X

Eine Phase ist erst fertig, wenn diese Kette **vollständig** belegt ist:

| # | Glied | Beleg |
|---|---|---|
| 1 | Endpunkt vorhanden, Mandantengrenze geprüft | Test fremde Org → 403 |
| 2 | Frontend ruft ihn wirklich auf (`credentials: 'include'`, CSRF bei Schreiben) | Aufrufer mit Fundstelle |
| 3 | Antwort landet in echten DOM-Elementen, Nutzerwerte über `esc()` | Markup-Probe |
| 4 | Laden · Leer · Fehler · 401 · 403 je eigener Zustand | vier Zustände auslösbar |
| 5 | Handler gebunden, kein toter Button | Klick-Probe |
| 6 | **Klickpfad** von der Übersicht aus, nicht nur die URL | Erreichbarkeits-Wächter (bestimmter Weg, wie N2.6) |
| 7 | DE / EN | kein Reststring |
| 8 | **Betriebsart beachtet** (V7.2) | extern geführt → schreibgeschützt mit Kennzeichen |
| 9 | Eingriffspunkt im Staff CC, wo die Handlung schiefgehen kann | Staff-CC-Sicht belegt |

## 4. Reihenfolge

**V0 → V6 → V7.1–V7.3 → V1 → V2 → V8 → V3 → V4**, V5 in jeder Welle.

> **V6 vor den Adaptern:** ohne „führendes System" würde der erste zvoove-Adapter in dieselben
> Tabellen schreiben, die Nutzer in TempConnect bearbeiten — zwei Wahrheiten, und die spätere
> überschreibt still die frühere.

> **Der offene Vertrag vor den Adaptern.** Ein zvoove-Adapter ohne stabilen Vertrag darunter
> muss beim ersten Umbau neu geschrieben werden. Mit V1 ist jeder weitere Adapter eine Zuordnung.

## 5. Woran gegengeprüft wird

| # | Frage |
|---|---|
| 1 | Beschreibt die OpenAPI die Routen, die es gibt — nicht die, die es mal gab? |
| 2 | Liest ein Schlüssel jemals fremde Daten? |
| 3 | Läuft ein Adaptertest ohne Netz? |
| 4 | Steht irgendwo ein Zugangsdatum im Repository? |

## 6. Was Welle V **nicht** tut

- **Eine Lohnbuchhaltung bauen.** Die bleibt beim bestehenden System der Zeitarbeitsfirma.
- **Adapter gegen vermutete Schnittstellen schreiben.** Ohne Anbieter-Dokumentation wird gewartet.
- **Die bestehenden Webhooks ersetzen.** Sie werden um Objekt-Ereignisse und Signatur erweitert.
