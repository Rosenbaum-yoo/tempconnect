# Welle Y — Die Probebühne: jede Rolle, jedes Abo, jede Richtung

> **Status: Bauanweisung.** Erstellt 2026-09-24, Ist-Stand gegen die laufende
> Entwicklungsdatenbank gemessen.
> **Gebaut von der bauenden Sitzung, gegengeprüft von der planenden** — siehe
> [`../UEBERGABE.md`](../UEBERGABE.md), Abschnitt „Wer baut, wer prüft".

---

## 1. Die Owner-Vorgabe

> *„wir sollten sowieso mehrere Accounts anlegen, um alles in alle Richtungen durchzuspielen —
> selbst jedes Abo usw., dann auch das Einsatzportal usw."*

Vor dem Livegang im Dezember ist das keine Fleißaufgabe, sondern **die einzige Art, die Zusagen
zu prüfen, die kein Test abdeckt**: dass ein Mensch mit einem bestimmten Abo auf einer bestimmten
Fläche das Richtige sieht — und das Falsche nicht.

---

## 2. Ist-Stand, gemessen am 2026-09-24

| Gemessen | Zahl | Was das bedeutet |
|---|---|---|
| Organisationen | **2566** (1872 Unternehmen, 694 Zeitarbeitsfirmen) | Masse ist reichlich da |
| Abos aktiv | DEMO 10 · BASIS 16 · PLUS 266 · **PRO 3** · INDIVIDUELL 17 | alle fünf Stufen vorhanden, PRO dünn |
| **Organisationen mit mehr als einem Standort** | **1** | Welle U ist in Daten praktisch **nicht** durchspielbar |
| Organisationen mit mehr als einem Mitglied | 15 | Rollenverwaltung kaum belegbar |
| Arbeiterprofile | 33, **alle mit Portalkonto** | die Zugänge gibt es |
| Arbeiter **mit Fähigkeiten** | **3 von 33** | der Marktplatz kann gar nicht voll wirken |
| Demo-Welt (Mig 052) | vorhanden und **gegatet** über `app.seed_demo_world` | die Schiene existiert, sie ist nur dünn besetzt |

**Der Befund in einem Satz: es fehlen keine Daten, es fehlt eine BENANNTE BESETZUNG.**
2566 Organisationen nützen nichts, wenn man sich in keine davon anmelden kann und von keiner
weiß, wofür sie steht. Durchspielen heißt: *„ich melde mich als X an, klicke Y, und muss Z
sehen."* Genau das ist heute nicht möglich.

---

## 3. Entscheidungen (in dieser Welle getroffen)

| Frage | Entscheidung | Warum |
|---|---|---|
| Masse oder Besetzung? | **Eine benannte Besetzung von etwa 16 Konten**, jedes mit dokumentiertem Zweck | Ein Konto ohne Zweck wird beim Durchspielen übersprungen |
| Passwörter? | **Nie im Repository.** Das Entwicklungs-Passwort kommt aus der Umgebung (`DEMO_PASSWORT`), die Saat legt nur den Hash an | Ein eingechecktes Passwort ist ein Geheimnis, auch wenn „nur Demo" daneben steht |
| Wiederholbarkeit? | **Idempotent**: ein erneuter Lauf repariert die Besetzung, er verdoppelt sie nicht | Sonst hat man nach dem dritten Lauf drei „Musterfirma GmbH" |
| Zeitbezug? | **Alle Daten relativ zu heute** (`todayDE()`), nie feste Kalenderdaten | Eine Bühne mit festen Daten ist nach zwei Wochen unbrauchbar: „überfällig" wird zu „uralt" |
| Trennung zur Masse | Besetzungskonten sind **erkennbar** und vollständig entfernbar | Wer aufräumt, muss Bühne von echten Prüfdaten unterscheiden können |
| Produktion? | Die bestehende Sperre (`app.seed_demo_world`) bleibt, **plus Wächter** | Demo-Daten in der Produktion wären der peinlichste denkbare Fehler |

---

## 4. Wellen und Phasen

### Y0 · Messen und absichern

| Phase | Inhalt | Nachweis |
|---|---|---|
| Y0.1 | **Zuerst die Sperre prüfen:** läuft Mig 052 wirklich nur mit gesetztem Schalter, und gilt dasselbe für die neue Saat? | Ohne Schalter entsteht keine Zeile. **Rückmutation:** Schalterprüfung entfernen → rot |
| Y0.2 | Zahlen von heute erheben und die Tabelle oben fortschreiben | Tabelle mit Datum, damit niemand gegen einen alten Stand baut |

### Y1 · Die Besetzung

| Phase | Inhalt | Nachweis |
|---|---|---|
| Y1.1 | **Je Abo eine Zeitarbeitsfirma und ein Unternehmen** — DEMO, BASIS, PLUS, PRO, INDIVIDUELL; bei INDIVIDUELL zusätzlich die Größenstufen S und Enterprise, weil sie andere Grenzen tragen | 12 Konten, jedes anmeldbar, jedes mit Zweck im Regiebuch |
| Y1.2 | **Eine Firma mit drei Standorten und drei Menschen** (Verwaltung, Disposition, Standortleitung) — heute gibt es **eine** solche Organisation unter 2566 | Welle U wird damit überhaupt erst durchspielbar |
| Y1.3 | **Je ein Konto im Sonderzustand:** Pilotkunde, gekündigt, wegen Zahlungsausfall gesperrt, Abo läuft in drei Tagen ab | Jeder Zustand ist anmeldbar und zeigt genau seine Oberfläche |
| Y1.4 | **Eine Zeitarbeitsfirma mit vollständiger Belegschaft:** 12 Kräfte, davon 8 mit Katalog-Fähigkeiten, 2 im Einsatz, 1 krank, 1 verspätet | Erst damit kann der Marktplatz voll wirken (heute: 3 von 33 mit Fähigkeiten) |

### Y2 · Die Zustände, die sonst niemand herstellt

| Phase | Inhalt | Nachweis |
|---|---|---|
| Y2.1 | **Deals in jedem Zustand**: angefragt, verhandelt, abgeschlossen, laufend, beendet, zurückgenommen | Jeder Zustand einmal sichtbar, auf **beiden** Seiten |
| Y2.2 | **Stundenzettel in jedem Zustand**: offen, eingereicht, abgelehnt mit Korrekturbitte, genehmigt, an den Kunden gesendet, abgerechnet | Der ganze Weg des Kreislaufs K-2 ist an einem Tag durchklickbar |
| Y2.3 | **Rechnungen**: offen, fällig, überfällig, gemahnt, bezahlt — mit **relativen** Datumswerten | Die Mahnstrecke zeigt echte Fälligkeiten statt „vor zwei Jahren" |
| Y2.4 | **Ein Mensch für den Betrugsriegel** (M4c.3): eine Kraft, die als Einzelangebot **und** im Sammelangebot steht | Die wichtigste Probe aus M4c lässt sich von Hand nachvollziehen |
| Y2.5 | **Eine Sperre**: dieselbe Kraft bei Kunde A gesperrt, bei Kunde B sichtbar | Die zentrale Zusage der Sperrliste wird vorführbar |
| Y2.6 | **Ein offener Fähigkeits-Vorschlag** und **eine katalogfremde Schreibvariante** | Die Kuratierfläche aus b-6/b-7 ist nicht leer, wenn man sie zeigt |
| Y2.7 | **Sammelangebote mit eigenen Mitgliedern.** Gemessen am 2026-09-24: die beiden vorhandenen Sammelangebote teilen sich **dieselben zwei Menschen**, und einer davon steht zusätzlich in einem Einzelangebot. Eine Bühne, die Sammelangebote vorführen soll, braucht Mitglieder, die sonst nirgends stehen — sonst führt sie genau die Doppelbuchung vor, die sie widerlegen soll | Ein Sammelangebot mit 4 Mitgliedern, die in keinem Einzelangebot vorkommen; dazu **ein** bewusst doppelt geführter Mensch für die Probe aus M4c.3 |

### Y3 · Das Einsatzportal

| Phase | Inhalt | Nachweis |
|---|---|---|
| Y3.1 | **Vier Arbeiter in vier Stadien**: eingeladen aber nicht registriert · registriert ohne Fähigkeiten · vollständig mit Nachweisen · im Einsatz | Jeder Schritt der Kette aus M2/M3 ist von außen nachvollziehbar |
| Y3.2 | **Krankmeldung und Verspätung** je einmal gesetzt, mit heutigem Bezug | Welle Q wird prüfbar, ohne auf einen Ausfall zu warten |
| Y3.3 | **Ein hochgeladener Nachweis mit Katalogbezug** (seit N8.1b Pflicht) | Der Nachweis belegt eine Katalog-Fähigkeit, keinen freien Text |
| Y3.4 | **Die harte Trennung bleibt:** kein Arbeiterkonto erreicht die Plattform, kein Firmenkonto das Portal | Bestehende Wächter bleiben grün — **diese Zusage darf die Bühne nicht aufweichen** |

### Y4 · Die getrennten Flächen

| Phase | Inhalt | Nachweis |
|---|---|---|
| Y4.1 | Je ein Zugang für **Staff CC**, **Support Center** und die **Owner-Sicht** | Die drei Flächen sind einzeln durchspielbar |
| Y4.2 | **Keine dieser Flächen wird aus der Kundenplattform erreichbar** | `staffNieAusDerPlattform.test.js` bleibt grün |

### Y5 · Das Regiebuch

| Phase | Inhalt | Nachweis |
|---|---|---|
| Y5.1 | **Ein Dokument mit Durchspiel-Wegen**, je Richtung einer: „melde dich an als … → klicke … → du musst sehen …" | Ein Mensch ohne Vorwissen prüft jede Richtung in Minuten |
| Y5.2 | Die Wege decken **die Kreisläufe K-1 bis K-7** ab (`V_SCHNITTSTELLEN.md`, Abschnitt 3b) | Jeder Kreislauf hat mindestens einen Weg |
| Y5.3 | **Das erwartete Ergebnis steht dabei**, nicht nur der Klickpfad | Wer etwas anderes sieht, erkennt es sofort als Fehler |

### Y6 · Wächter

| Phase | Inhalt | Nachweis |
|---|---|---|
| Y6.1 | **Die Besetzung ist vollständig**: fehlt eine Rolle, ein Abo oder ein Zustand aus Y1–Y3, wird die Probe rot | Eintrag entfernen → rot. **Rückmutation** |
| Y6.2 | **Kein festes Datum** in der Saat | Kalenderdatum einbauen → rot |
| Y6.3 | **Kein Passwort im Repository** — erweitert den Schlüsselmuster-Wächter aus W4.2 | Passwort in der Saat → rot |
| Y6.4 | **Idempotenz**: zweimal ausführen ergibt dieselbe Besetzung | Zählung vor und nach dem zweiten Lauf gleich |

---

## 5. Reihenfolge

**Y0 → Y1 → Y3 → Y2 → Y5 → Y4 → Y6.**

> **Y0.1 steht vor allem anderen**, weil eine Saat ohne wirksame Sperre der einzige Fehler
> dieser Welle wäre, der sich nicht zurücknehmen lässt. **Y5 vor Y4**, weil erst das Regiebuch
> zeigt, was auf den getrennten Flächen überhaupt zu prüfen ist.

## 6. Woran gegengeprüft wird

| # | Frage |
|---|---|
| 1 | Kann ein Mensch sich in **jede** Rolle und **jedes** Abo tatsächlich anmelden? |
| 2 | Läuft die Saat in einer Umgebung ohne Schalter wirklich nicht? |
| 3 | Steht irgendwo ein Passwort oder ein festes Datum? |
| 4 | Ist nach zwei Läufen alles genau einmal da? |
| 5 | Bleiben die Trennungen (Arbeiter, Staff, Support) unangetastet? |

## 7. Was Welle Y **nicht** tut

- **Echte Kundendaten erzeugen.** Die Bühne ist erkennbar Bühne.
- **Die vorhandene Masse löschen.** Sie bleibt; die Besetzung kommt daneben.
- **In der Produktion laufen.** Die Sperre bleibt, und ein Wächter hält sie fest.
- **Die Trennung der Flächen aufweichen**, nur damit das Durchspielen bequemer wird.

## 8. Kreislauf und Verdrahtung

Welle Y baut keinen Kreislauf — sie macht **alle sieben begehbar**
(`V_SCHNITTSTELLEN.md`, Abschnitt 3b). Damit ist sie die Voraussetzung dafür, das Monatsaudit
aus Welle T ehrlich zu lesen: **eine Fähigkeit, die niemand durchspielen kann, ist auch im
Audit nur eine Behauptung.**
