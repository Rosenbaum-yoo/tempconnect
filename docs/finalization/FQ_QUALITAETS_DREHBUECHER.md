# Welle FQ — Geführte Qualitäts-Drehbücher (Owner-Abnahme durch Klicken)

> **Zweck:** Du testest die Plattform strukturiert durch — jedes Drehbuch ~10–15 Min.
> Pro Schritt steht das **erwartete Ergebnis**, damit du sofort siehst, ob etwas „falsch" ist.
> Befunde NICHT im Kopf behalten → in die Sammeltabelle unten (oder Screenshot + Schrittnummer).
> Ich triagiere jeden Befund nach `00_RULES.md` (Bug / Sichtbarkeit / UX / Commercial) und fixe in Slices.
>
> Schwerpunkt: die in den letzten Sessions gebauten Features (Umbenennung, Notdienst, Premium beidseitig,
> Dokumenten-Tresor + Auto-Ablage, Bewertungs-Moderation, Glow-Cards, Landing-USP) + die Kernflows.
>
> Erstellt: 2026-06-13 (Welle F1 abgeschlossen, Stand 4508/0 Tests grün).

---

## Vorbereitung (einmalig, 2 Min)

| | |
|---|---|
| **Plattform** | http://localhost:8080/ (läuft im Docker; bei „nicht erreichbar" → `docker restart tempconnect_api`, ~3 Min) |
| **Demo-Passwort (alle Demo-Konten)** | `DemoPass2026!` |
| **Unternehmen (Einsatzunternehmen)** | `demo-buyer@tempconnect.de` (ENTERPRISE) · `demo-buyer2@tempconnect.de` (PLUS) |
| **Agentur (Personaldienstleister)** | `demo-agency@tempconnect.de` (ENTERPRISE) · `demo-agency2@tempconnect.de` (PRO) · `demo-agency3@tempconnect.de` (BASIS) |
| **Staff (du)** | `dennisstegemann04@gmail.com` → Login unter **http://localhost:8080/staff/** (dein echtes Passwort) |
| **Browser** | Am besten 2 Profile/Fenster (z. B. InPrivate für die Gegenseite), damit du Unternehmen ↔ Agentur parallel siehst |

**Befund-Notation:** Schritt-Nr. + „erwartet X, gesehen Y" reicht. Kategorien sortiere ich selbst.

---

## Drehbuch A — Kernflow Unternehmen (~15 Min)

> Ziel: Ein Einsatzunternehmen findet Personal und kann ein Premium-Angebot schalten.

| # | Aktion | Erwartetes Ergebnis | ✅ / Befund |
|---|---|---|---|
| A1 | Login als `demo-buyer@tempconnect.de` | Landung auf der Übersicht/Hub, keine Konsolenfehler | |
| A2 | Hub ansehen | Karten je nach Rolle; **keine toten Buttons**, keine „undefined"/leeren KPIs | |
| A3 | „Arbeitsplatz anbieten" (marketplace_demand_create) öffnen | Formular lädt, Pflichtfelder klar markiert | |
| A4 | Arbeitsplatzangebot anlegen (Titel/Rolle/Stadt/Zeitraum) | Erfolg-Toast, Eintrag erscheint unter „Meine Angebote" | |
| A5 | „Meine Angebote" (marketplace_demand_list) öffnen | Angebot in der Liste, Status OPEN | |
| A6 | Auf einem **offenen** Angebot **„Premium"** klicken | Bestätigungsdialog mit Preis (49,00 € netto, 14 Tage) + Hinweis „auf nächste Monatsrechnung" | |
| A7 | Premium bestätigen | Toast/Erfolg, Angebot zeigt **PREMIUM-Badge** mit Ablaufdatum, Button verschwindet | |
| A8 | Marktplatz-Feed öffnen (Gegenseiten-Sicht) | Dein Premium-Angebot ist **priorisiert** (oben) mit Label „Premium-Anzeige" | |
| A9 | Eine Benachrichtigung/Hub-Karte mit Zahl anklicken | Direkter Deep-Link zum konkreten Ziel; beim nächsten Laden ist die Markierung weg | |

---

## Drehbuch B — Kernflow Agentur inkl. Notdienst + Premium (~15 Min)

> Ziel: Eine Zeitarbeitsfirma stellt Personal ein, nutzt den Notdienst-Schnellschalter und Premium.

| # | Aktion | Erwartetes Ergebnis | ✅ / Befund |
|---|---|---|---|
| B1 | Login als `demo-agency@tempconnect.de` | Hub lädt; Navigation spricht von **„Eingestelltes Personal"** (NICHT „Verfügbares Personal") | |
| B2 | „Personal einstellen" (capacity_exchange_form) → Eintrag anlegen | Erfolg, erscheint unter „Eingestelltes Personal" | |
| B3 | „Eingestelltes Personal" (capacity_exchange_manage) öffnen | H1 = **„Eingestelltes Personal"**; Liste zeigt deine Einträge | |
| B4 | **„Notdienst einstellen"** (Button auf Manage/Feed) öffnen | Schnellformular mit **nur Kernfeldern** (Titel/Rolle/Anzahl/Stadt/ab), amber gestylt | |
| B5 | Notdienst-Eintrag veröffentlichen | „sofort live"-Bestätigung, Link zur Übersicht | |
| B6 | Bei einem **aktiven** Eintrag **„Premium"** klicken → bestätigen | PREMIUM-Badge erscheint; Gebühr-Hinweis „nächste Monatsrechnung" | |
| B7 | Als Unternehmen (2. Fenster, `demo-buyer@`) den Feed ansehen | Notdienst-Eintrag trägt **NOTDIENST-Badge** + „Notdienst"-Label, ist priorisiert; Premium-Eintrag oben mit „Premium-Anzeige" | |
| B8 | Landing-Seite http://localhost:8080/ (ausgeloggt) ansehen | Im Hero der **fett hervorgehobene Notdienst-USP** („Notfall-Personal in Stunden statt Tagen") | |

---

## Drehbuch C — Einsatzportal / Worker mobil (~15 Min)

> Ziel: Ein Worker bestätigt einen Einsatz und erfasst einen Stundenzettel — **mobil** (Browser schmal ziehen / DevTools-Mobilansicht).

| # | Aktion | Erwartetes Ergebnis | ✅ / Befund |
|---|---|---|---|
| C1 | Worker-Login (über Einladungslink/Worker-Login der Agentur-Demo-Welt) | Worker-Dashboard, **nur eigene Daten** sichtbar | |
| C2 | Browser auf ~390px schmal ziehen | Layout bleibt lesbar, keine abgeschnittenen Buttons, kein horizontales Scrollen | |
| C3 | Einsatz bestätigen / ablehnen / „nicht verfügbar" melden | Status ändert sich sichtbar, Rückmeldung erscheint | |
| C4 | Stundenzettel (einsatzportal-stundenzettel) öffnen | **Inline-Erfassung** (keine Weiterleitung auf Legacy-Seite) | |
| C5 | Stunden eintragen + einreichen | Statuswechsel Entwurf → eingereicht, klare Bestätigung | |
| C6 | Versuchen, fremde Daten zu sehen (URL-Manipulation) | Server blockt (403/leere Sicht), **kein** fremder Datensatz | |

---

## Drehbuch D — Bewertungen + Auto-Filter + Staff-Moderation (~10 Min)

> Ziel: Bewertung nur nach abgeschlossenem Deal; Schimpfwörter werden auto-geflaggt; Staff entscheidet.

| # | Aktion | Erwartetes Ergebnis | ✅ / Befund |
|---|---|---|---|
| D1 | Als Unternehmen/Agentur einen **abgeschlossenen** Deal aufrufen | Bewerten-Möglichkeit nur dort sichtbar (nicht bei offenen) | |
| D2 | Bewertung mit normalem Text absenden | Toast „wird nach kurzer Prüfung freigegeben" (nicht sofort öffentlich) | |
| D3 | Bewertung mit einem Schimpfwort absenden (Test) | Wird angenommen, aber **intern auto-geflaggt** (taucht in Staff-Queue als geflaggt auf) | |
| D4 | Öffentliches Profil der Gegenseite ansehen | Nur **freigegebene** Bewertungen sichtbar, die neuen noch nicht | |
| D5 | (Staff, Drehbuch E) Queue prüfen | siehe E3 | |

---

## Drehbuch E — Staff-Tag im SCC (~15 Min)

> Login: **http://localhost:8080/staff/** als `dennisstegemann04@gmail.com`.
> Ziel: Die Operator-Sicht funktioniert — Moderation, DSGVO, Dokumenten-Tresor, Incidents.

| # | Aktion (SCC-Sidebar) | Erwartetes Ergebnis | ✅ / Befund |
|---|---|---|---|
| E1 | Login ins SCC | Eigene Staff-Session (`tc.staff.sid`); Org-/Plattform-Login bleibt getrennt | |
| E2 | Sidebar durchklicken (alle Module) | Jedes Modul lädt mit Daten **oder** professionellem Leer-Zustand — **kein** Spinner-forever, **kein** 500 | |
| E3 | **Marketplace-Visibility → Moderations-Queue** | Die in D2/D3 erzeugten Bewertungen liegen hier; geflaggte erkennbar | |
| E4 | Eine Bewertung **freigeben** (Approve, mit Reason + Step-up) | Step-up verlangt **Passwort-Bestätigung**; danach erscheint sie öffentlich (D4 erneut prüfen) | |
| E5 | **DSGVO / Datenschutz** | Org-übergreifende Anfragenliste + CSV-Download funktioniert | |
| E6 | **Dokumenten-Tresor** | KPIs (gesamt/24h/7d/auto-abgelegt/Speicher) + letzte Ablagen mit Quelle-Pill („System (Auto-Ablage)") | |
| E7 | **Incidents** | Liste + Signals-Feed; eine mutierende Aktion verlangt Confirm + Reason + Step-up | |

---

## Drehbuch F — Dokumenten-Tresor + Auto-Ablage (~10 Min)

> Ziel: Alles Plattform-Generierte landet automatisch im org-eigenen Tresor.

| # | Aktion | Erwartetes Ergebnis | ✅ / Befund |
|---|---|---|---|
| F1 | Als Unternehmen „Mein Unternehmen" → **„Dokumente & PDFs"** öffnen | documents-center lädt; Tabelle mit Typ/Quelle/Größe/Datum | |
| F2 | Einen Deal/eine Einsatzvereinbarung abschließen (Kernflow) | Danach im Tresor **beider** Parteien: „Einsatzvereinbarung …" + „Konditionsblatt …" mit **„Auto"-Badge** | |
| F3 | Eine Compliance-Datei hochladen | Erscheint im Tresor (Spiegel-Eintrag) | |
| F4 | Mehrere Dokumente auswählen → ZIP-Export | ZIP lädt herunter, enthält die Dateien | |
| F5 | Eintrag ohne Datei (z. B. DSGVO-Anfrage-Record) | Kein „Download"-Button, aber Eintrag sichtbar (kein toter Link) | |

---

## Drehbuch G — Themes + Konsolen-Sauberkeit (~10 Min)

| # | Aktion | Erwartetes Ergebnis | ✅ / Befund |
|---|---|---|---|
| G1 | Theme-Umschalter (Topbar) durchschalten (dark/light/editorial/ultra) | Farben wechseln konsistent, **keine** hartcodierten Brüche, Text lesbar | |
| G2 | Auf 5 Kernseiten je die Browser-Konsole (F12) ansehen | **Keine** roten Fehler (besonders `TypeError`/`is not a function`/401-Schleifen) | |
| G3 | Eine Seite je Rolle neu laden | Kein Flackern toter Inhalte, Lade-/Leer-/Fehlerzustände sauber | |

---

## Befund-Sammeltabelle (hier eintragen, ich triagiere)

| Drehbuch-Schritt | Was erwartet | Was gesehen | Screenshot? | (Claude) Kategorie |
|---|---|---|---|---|
| z. B. A6 | Preis-Dialog 49 € | kein Dialog, direkt gebucht | ja | Bug |
| | | | | |
| | | | | |
| | | | | |

> Wenn ein Drehbuch komplett sauber war: einfach „A ✅", „B ✅" notieren — das reicht mir als Abnahme.
> Wenn du irgendwo nicht weiterkommst (z. B. Worker-Login-Einrichtung), sag Bescheid — dann liefere ich
> den genauen Setup-Schritt oder einen Test-Datensatz.
