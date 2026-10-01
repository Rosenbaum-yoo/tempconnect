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

---

## 9. Wie der Owner selbst prüft — Reihenfolge, Liste, Abbruchregel

> **Owner-Frage 2026-09-27:** *„Ich prüfe das gesamte Dokument auch nochmal — kannst du mir dazu
> eine Checkliste geben, damit ich es auch gegen das Frontend prüfen kann, und wie sollte ich
> vorgehen?"*

### 9.0 Die unbequeme Antwort zuerst: das Dokument ist die falsche Reihenfolge

Das Arbeitsdokument ist nach **Wellen** geordnet (A–Z), die Oberfläche nach **Fläche und Rolle**.
Wer das Dokument von oben nach unten abklickt, öffnet dieselbe Seite vierzehnmal und übersieht
trotzdem ganze Bereiche — weil keine Welle eine Seite vollständig beschreibt und keine Seite zu
genau einer Welle gehört.

**Also umgekehrt: die Oberfläche ist der Weg, das Dokument ist die Antwortliste.** Man geht die
Flächen ab und fragt bei jedem Halt: *welche Zusage muss hier sichtbar sein?* Die Zusagen stehen
im Dokument — aber sie werden **nachgeschlagen**, nicht abgelaufen.

### 9.1 Stufe 0 — nicht klicken, vorbereiten (15 Minuten, spart Stunden)

| # | Vorbereitung | Warum sie nicht optional ist |
|---|---|---|
| 1 | **Konsole und Netzwerk-Tab offen** (F12), die ganze Zeit | Eine Seite kann vollständig aussehen und im Hintergrund in einer 401-Schleife laufen. Ohne Konsole prüft man die halbe Seite |
| 2 | **Notizblatt mit vier Spalten:** Fläche · Rolle/Abo · erwartet · gesehen | Ein Befund ohne diese vier kostet beim Nachstellen mehr Zeit als beim Beheben. Drei Wörter mehr beim Notieren sparen eine halbe Stunde |
| 3 | **Ein Blick auf die Uhr:** jedes Datum muss `Europe/Berlin` sein | Der Off-by-one-Fehler bei Datumswerten sieht wie ein Tippfehler aus und ist einer der teuersten |
| 4 | **Zwei Browser-Profile** (oder ein privates Fenster) | Rollenwechsel ohne Abmelden. Sonst verbringt man den Abend auf Anmeldeseiten |
| 5 | **Wissen, WELCHEN Baum der Browser bedient — vor dem ersten Klick** | **Gemessen am laufenden Container 2026-10-01:** nginx bindet `…\12_tempconnect_docker(D)\frontend` ein, also das **Haupt-Repo** — `docker-compose.yml` schreibt `./frontend` relativ zu **sich selbst**, nicht zum Arbeitsbaum, in dem gerade gebaut wird. **Folge: was in einem Arbeitsbaum entsteht, ist im Browser nicht zu sehen, bis es im Haupt-Repo liegt.** Ohne diesen Blick prüft man einen Abend lang einen älteren Stand und meldet Befunde, die seit Tagen behoben sind — die teuerste Art, Prüfzeit zu verbrennen. **Prüfschritt:** `docker inspect tempconnect_frontend --format "{{range .Mounts}}{{.Source}} -> {{.Destination}}{{\"\\n\"}}{{end}}"`, und dann im Haupt-Repo `git log --oneline -1`: **ist der Stand, den ich prüfen will, dort drin?** |

### 9.2 Stufe 1 — die Besetzung, und sie ist heute ein **Blocker**

Gemessen am 2026-09-24 (Abschnitt 2): **eine** Organisation von 2566 hat mehr als einen Standort,
**3 von 33** Arbeitern haben Fähigkeiten, PRO hat **drei** Abos — und es gibt **keine benannte
Besetzung**, in die man sich anmelden kann.

**Damit sind drei Dinge heute grundsätzlich nicht prüfbar**, egal wie gut die Liste ist:
Abo-Sperren über alle fünf Stufen, Standort- und Rollensichtbarkeit, und die volle Wirkung des
Marktplatzes. Wer es trotzdem versucht, prüft nicht das Produkt, sondern die Lückenhaftigkeit der
Entwicklungsdaten.

> **Empfehlung: Y1 und Y5.1–Y5.3 vor dem ersten Prüfabend bauen lassen.** Das ist dieselbe Regel,
> die der Owner für die Marktführer-Empfehlungen gesetzt hat — *erst wenn die Grundlagen stimmen* —
> angewandt auf die eigene Prüfzeit. Ohne Besetzung ist ein Prüfabend kein Nachweis, sondern eine
> Stichprobe mit unbekannter Abdeckung.
>
> **Bis dahin sinnvoll prüfbar:** alles in Stufe 2 mit den eigenen bekannten Konten, Stufe 4
> vollständig (die Sperren brauchen keine Besetzung), und Stufe 5.

### 9.3 Stufe 2 — sechs Fragen je Halt (die Verdrahtungskette auf Menschenmaß)

An jeder Fläche, in dieser Reihenfolge. Die ersten fünf sind schnell, die sechste ist die wertvolle.

| # | Frage | Was ein Fehler hier bedeutet |
|---|---|---|
| 1 | Lädt sie **ohne roten Konsolenfehler**? | `TypeError`, `is not a function`, 401-Schleife — die Seite ist gebrochen, auch wenn sie aussieht wie fertig |
| 2 | Stehen **echte** Daten drin — keine Platzhalter, keine Striche, keine Nullen ohne Grund? | Eine Kachel, die immer „0" zeigt, ist kein Leerzustand, sondern ein toter Draht |
| 3 | Ist der **Leerzustand ehrlich**? „Noch keine Daten" — nicht Spinner für immer, nicht leere Fläche | Ein ewiger Spinner ist die schlimmste Auskunft: er verspricht, dass noch etwas kommt |
| 4 | Tut **jeder** Knopf etwas — und sagt er vorher, was er tut? | Ein toter Knopf kostet Vertrauen dauerhaft, nicht einmal |
| 5 | Führt **jeder** Verweis zum **konkreten** Ziel (Detailseite, gefilterte Liste) — nicht zur Übersicht? | Eine Benachrichtigung, die auf die Startseite führt, ist eine Sackgasse mit Umweg |
| 6 | **Nach einer Änderung: erscheint sie an allen anderen Stellen?** | Das ist die Frage, die **kein Test** abdeckt — und die Mehrzahl der Fehler dieser Woche hätte sie gefunden |

**Frage 6 im Konkreten:** eine Kraft auf „krank" setzen → verschwindet sie aus dem Marktplatz,
ändert sich die Live-Belegschaft, entsteht eine Benachrichtigung, bleibt der Stundenzettel
stimmig? Genau das sind die Kreisläufe **K-1 bis K-7** (`V_SCHNITTSTELLEN.md`, Abschnitt 3b).

### 9.4 Stufe 3 — die drei Matrizen (hier liegt das Gold)

| Matrix | Vorgehen | Worauf es ankommt |
|---|---|---|
| **A · Rollen** | Dieselbe Seite als Arbeiter · Zeitarbeitsfirma · Unternehmen · Staff · Owner | **Nicht was sichtbar ist, sondern was NICHT.** Eine Kachel, die einer falschen Rolle erscheint, ist ein Sicherheitsbefund, kein Schönheitsfehler |
| **B · Abos** | Dieselbe Fähigkeit in DEMO · BASIS · PLUS · PRO · INDIVIDUELL | Jede Sperre muss einen **konkreten** Aufstiegspfad nennen. „Nicht verfügbar" ohne Ziel ist eine verlorene Verkaufsgelegenheit an der Stelle, an der der Kunde gerade zahlen wollte |
| **C · Richtungen** | Jede Sache aus **beiden** Richtungen: was die Zeitarbeitsfirma sendet, muss das Unternehmen sehen — und umgekehrt | Einseitig geprüfte Wege sind der häufigste Fund: die sendende Hälfte ist fast immer fertig, die empfangende nicht |

### 9.5 Stufe 4 — absichtlich falsch klicken (findet man nur von Hand)

| # | Versuch | Erwartung |
|---|---|---|
| 1 | Aus der Kundenplattform einen Weg ins **Staff CC**, **OCC**, **Support Center** oder **Einsatzportal** suchen | **Es gibt keinen.** Kein Menüpunkt, keine Kachel, kein Link, keine erratene Adresse |
| 2 | Mit einem **Arbeiterkonto** eine Plattformseite aufrufen; mit einem **Firmenkonto** das Portal | Beides abgewiesen — und zwar mit einer Auskunft, nicht mit einem Absturz |
| 3 | In der Adresszeile eine **fremde Kennung** einsetzen (andere Organisation, anderer Einsatz) | **403.** Niemals 200 mit fremden Daten, niemals eine leere Seite, die wie „nichts da" aussieht |
| 4 | Eine Aktion **ohne Begründung** absenden, wo eine Begründung Pflicht ist | Abgewiesen, mit klarem Hinweis — nicht stillschweigend gespeichert |
| 5 | **Zurück-Knopf und Neuladen** mitten in einem mehrstufigen Vorgang | Kein doppelter Datensatz, kein halber Zustand |

### 9.6 Stufe 5 — die Zusagen, die verkaufen

Nicht Technik, sondern Marktposition: die **drei gesetzlichen Fristen** als Kaufgrund, die
Lebendigkeit der Fläche (Live-Überwachung aktiver Einsätze auf **beiden** Seiten), der Tonfall der
Texte, und dass kein Platzhalter mehr sichtbar ist. Wer hier etwas findet, findet es vor dem
ersten Pilotkunden — und genau dafür ist die Bühne da.

### 9.7 Die 82 Kundenseiten in 9 begehbaren Gruppen

Eine Liste von 82 Seiten wird nicht abgearbeitet, neun Gruppen schon. Je Gruppe **ein** Durchgang
mit den sechs Fragen, dann Matrix A für die Gruppe.

| Gruppe | Flächen (Auswahl) | Kreislauf |
|---|---|---|
| 1 · **Eintritt & Konto** | `onboarding`, `pricing`, `org-invite`, `organization`, `mitarbeiter`, `sso_config`, `credits` | — |
| 2 · **Bedarf** | `marketplace_demand_list/_detail/_create`, `demand_create`, `requisitions`, `requisition_create`, `matching_results`, `capacity_search` | K-1 |
| 3 · **Angebot** | `capacity_exchange*` (7 Seiten), `angebote_verwalten`, `offer_detail`, `schaufenster` | K-1 |
| 4 · **Deal & Verbindlichkeit** | `deal_management`, `request_detail`, `company_requests`, `approvals`, `agency_inbox` | K-3 |
| 5 · **Einsatz & Live** | `company-live-workforce`, `monatsplan`, `notdienst_leitstand`, `app_notdienst` | K-4 |
| 6 · **Zeit & Geld** | `timesheets`, `company-timesheets`, `worker-timesheet`, `worker-submissions-review`, `spend-analytics`, `rate-cards`, `sla_abo`, `bounties` | K-2 |
| 7 · **Einsatzportal** | die acht `einsatzportal-*`-Seiten, `worker-portal`, `worker-login`, `worker-profile-public` | K-5 |
| 8 · **Lieferanten & Nachweise** | `vendor_pool`, `supplier_scorecard`, `compliance_overview`, `documents-center`, `sla_nachweise`, `sla_profil` | K-6 |
| 9 · **Getrennte Flächen** | `admin_panel`, `internal_control_center`, `executive_dashboard`, `system-health`, `data-governance` | K-7 |

### 9.8 Abbruchregel und Zeitökonomie

> **Mehr als drei Befunde auf einer Fläche: aufhören, notieren, weitergehen.** Eine Fläche mit
> vier Befunden ist nicht „schlecht geprüft", sie ist **unfertig** — sie gehört zurück in die
> Bauliste, nicht weiter unter die Lupe. Sonst wird die Liste ein Haufen, und ein Haufen wird
> nicht abgearbeitet.

**Und was der Owner NICHT prüfen sollte, weil ein Tor es beweist:** Rollen-403 an der
Schnittstelle, SQL-Form, Migrationsreihenfolge, Rechenwege, Mandantengrenzen im Backend. Dort ist
Handarbeit reine Doppelung. **Unersetzlich ist die Hand nur, wo kein Test hinkommt:** sichtbare
Wahrheit, Verdrahtung über Seitengrenzen, Rollen-**Un**sichtbarkeit, ehrliche Leerzustände,
Rechtstexte, Tonfall — und Frage 6.
