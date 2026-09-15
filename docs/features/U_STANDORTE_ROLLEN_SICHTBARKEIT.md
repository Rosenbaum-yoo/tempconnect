# Welle U — Standorte, Rollen, und wer welches Profil sieht

> **Status: Bauanweisung.** Erstellt 2026-09-14 aus dem Owner-Dokument (Abschnitte 11 und 24).
> **Gebaut von der bauenden Sitzung, gegengeprüft von der planenden** — siehe
> [`../UEBERGABE.md`](../UEBERGABE.md), Abschnitt „Wer baut, wer prüft".

---

## 1. Die Owner-Vorgabe

- **Abschnitt 11:** Organisations- und Standortstrukturen, rollenbasierter Zugriff, Mandantenfähigkeit
  bis zur Finalisierung. *„Was darf welche Rolle auf welcher Seite? Kann der Admin der jeweiligen
  Firma das überwachen, steuern, anpassen und verwalten?"*
- **Abschnitt 24:** *„Sollten Unternehmensprofile für Zeitarbeitsfirmen und andersrum einsehbar
  sein? Worker-Profile nur DSGVO-konform, aber hart abgesichert."*

> **Abgrenzung:** „Das Team ist eine Person" gilt für TempConnect selbst. **Kunden** haben mehrere
> Menschen — dort ist Rollenverwaltung durch den Firmen-Admin genau richtig.

---

## 2. Ist-Stand (gemessen 2026-09-14 — U0 vertieft das)

| Baustein | Stand |
|---|---|
| Mitgliedschaften und Rollen | `org_memberships.role_key`, Einladungen mit Rolle (Mig 129), HR-Attribute (Mig 144) |
| Standorte | Mehrstandort-Spalten (Mig 112); `assertLocationBelongsToOrg` in **4** Routendateien |
| Unternehmens-Provisionierung | `api/routes/scim.js` |
| Org-Kontext | `middleware/orgContext.js` — Rückfall auf die primäre Mitgliedschaft, nie leer (C-11) |
| Profilseiten | `company_profile_public.html`, `worker-profile-public.html`, `sla_profil.html` |
| Audit je Firma | Welle I (8.1.1): Firmen sehen nur das eigene Audit |

**Offen gemessen werden muss (U0):** wie viele Routen `location_id` lesen, aber nicht über
`assertLocationBelongsToOrg` prüfen — 4 Dateien sind verdächtig wenig.

---

## 3. Entscheidungen (in dieser Welle getroffen, nicht zurückgespielt)

| Frage | Entscheidung | Warum |
|---|---|---|
| Firmenprofile gegenseitig sichtbar? | **Ja, für angemeldete Plattformmitglieder.** Öffentlich im Netz nur, was die Firma selbst freigibt | Geschäftsdaten einer Firma sind kein Geheimnis; ohne Profil kein Vertrauen vor dem Abschluss |
| Worker-Profile? | **Pseudonym bis zum Abschluss:** Skills, Erfahrung, Region, Verfügbarkeit, Zuverlässigkeitsstufe (Welle Q). **Kein** Nachname, keine Kontaktdaten, kein Geburtsdatum; Foto nur mit Einwilligung | Datenminimierung — der Käufer braucht die Identität erst für den Einsatz |
| Identität nach Abschluss? | Nur an den **Käufer dieses Einsatzes**, nur die für den Einsatz nötigen Angaben | Zweckbindung |
| Rechte-Übersicht? | **Aus der zentralen Rechte-Registratur erzeugt**, nie von Hand gepflegt | Eine gepflegte Tabelle lügt nach dem ersten Umbau |

---

## 4. Wellen und Phasen

### U0 · Messen

| Phase | Inhalt | Nachweis |
|---|---|---|
| U0.1 | Welche Rollen gibt es, welche Rechte trägt jede, wo werden sie geprüft | Tabelle mit Fundstellen |
| U0.2 | **Routen, die `location_id` annehmen** — und ob sie die Zugehörigkeit prüfen | Liste; jede Lücke ist ein Sicherheitsbefund |
| U0.3 | Wo verwaltet ein Firmen-Admin heute Mitglieder und Rollen — Seite, Endpunkte, Klickpfad | Befund, bevor etwas gebaut wird |

### U1 · Der Firmen-Admin verwaltet sein Team

| Phase | Inhalt | Nachweis |
|---|---|---|
| U1.1 | Einladen, Rolle ändern, entfernen — auf **einer** Seite, erreichbar | Klickpfad; Erreichbarkeits-Wächter |
| U1.2 | **Keine Rechteausweitung:** niemand vergibt eine Rolle über der eigenen | Versuch → 403. Rückmutation |
| U1.3 | **Der letzte Admin kann sich nicht entfernen** | Versuch → abgelehnt mit Begründung |
| U1.4 | Jede Rollenänderung im **Firmen**-Audit (wer, was, vorher/nachher) | Audit-Zeile belegt; fremde Firma sieht sie nie |

### U2 · Standorte

| Phase | Inhalt | Nachweis |
|---|---|---|
| U2.1 | Standorte anlegen, umbenennen, archivieren (nie löschen, wenn Einsätze daran hängen) | Archivierter Standort bleibt in Historie lesbar |
| U2.2 | **Standortrolle:** eine Standortleitung sieht nur ihren Standort; org-weite Flächen sind für sie `hidden_location_scope` | Fremder Standort → 403 |
| U2.3 | Drilldowns tragen `location_id` weiter (Pfeiler 7) | Wächter über alle Drilldown-Links |
| U2.4 | **Entdeckender Wächter:** jede Route, die `location_id` liest, prüft die Zugehörigkeit | Neue Route ohne Prüfung → rot |

### U3 · „Wer darf was" — sichtbar für den Firmen-Admin

| Phase | Inhalt | Nachweis |
|---|---|---|
| U3.1 | Rechte-Matrix als Seite, **erzeugt** aus der Registratur | Matrix = durchgesetzte Rechte; Abweichung → rot |
| U3.2 | Rollenbeschreibung in Klartext je Rolle | Keine Rolle ohne Beschreibung |

### U4 · Ein Mensch, mehrere Firmen

| Phase | Inhalt | Nachweis |
|---|---|---|
| U4.1 | Firmenwechsel für Personen mit mehreren Mitgliedschaften (Holding, Dienstleister für mehrere Standorte) | Wechsel ändert jede Anzeige; kein Datenrest der vorigen Firma |
| U4.2 | C-11 bleibt: ein fremder Org-Wunsch führt nie zu leerem Kontext | Bestehender Sicherheitstest bleibt grün |

### U5 · Profile

| Phase | Inhalt | Nachweis |
|---|---|---|
| U5.1 | Firmenprofil für angemeldete Mitglieder; öffentliche Freigabe als Schalter der Firma | Abgemeldet → nur Freigegebenes |
| U5.2 | **Worker-Profil über Positivliste** (wie H1 `getCompanyLiveWorkforce`) — die nächste Spalte landet nie von selbst beim Kunden | Neue Spalte im SELECT → nicht in der Antwort |
| U5.3 | **Sperrliste wirkt auf das Profil** (N4): gesperrte Kraft ist für diesen Kunden nicht aufrufbar, auch nicht per Direktlink | Direktlink → 404, nicht 403 (kein Existenzhinweis) |
| U5.4 | **Teilen-Link:** Ablaufdatum, dieselbe Sichtbarkeitsbedingung wie die Liste (Befund M4.13) | Link nach Ablauf oder nach Sperre → nicht mehr lesbar |
| U5.5 | Identität nach Abschluss nur an den Käufer dieses Einsatzes | Anderer Kunde → pseudonym |

---

## 5. Reihenfolge

**U0 → U2.4 → U1 → U5 → U2 → U3 → U4.**

> **U2.4 steht vor allem anderen**, weil U0.2 einen Sicherheitsbefund liefern kann. Eine
> Standortgrenze, die in 4 von vielleicht 30 Routen geprüft wird, ist keine Grenze.

---

## 6. Woran gegengeprüft wird

| # | Frage |
|---|---|
| 1 | Fremde Firma, fremder Standort → 403 an **jeder** betroffenen Route? |
| 2 | Kann sich jemand selbst befördern? |
| 3 | Taucht ein Nachname, eine E-Mail oder ein Geburtsdatum in einer Worker-Antwort vor dem Abschluss auf? |
| 4 | Ist die Rechte-Matrix erzeugt oder gepflegt? |

## 7. Was Welle U **nicht** tut

- **Staff-Rollen umbauen.** Die sechs Staff-Rollen bleiben, wie sie sind.
- **Direktnachrichten zwischen Firmen einführen.** Abschnitt 10b ist bewusst ausgelassen.
- **Das Owner Control Center anfassen.** Entschieden, wartet auf den Owner-Abschnitt.

## 8. Kreislauf und Verdrahtung

**Welle U schließt K-4 Vertrauen** (Profilsichtbarkeit) und trägt **K-6 Nachweis** (Rollenänderung
im Firmen-Audit). Kreislaufkarte und Verdrahtungskette: [`V_SCHNITTSTELLEN.md`](V_SCHNITTSTELLEN.md),
Abschnitte 3b und 3c — jede Phase hier gilt erst mit allen neun Gliedern als fertig.

| Über den Plan hinaus mitzudenken | Warum |
|---|---|
| Rolle geändert → **Navigation und Kacheln ändern sich sofort**, nicht erst nach neuem Login | Sonst sieht jemand minutenlang Flächen, die ihm entzogen wurden |
| Standort archiviert → offene Einsätze, Stundenzettel und Monatsplanung dieses Standorts werden **benannt**, bevor archiviert wird (Wirkungsvorschau) | Kein verwaister Einsatz |
| **Betriebsart** (V6): Mitglieder aus SCIM oder zvoove sind schreibgeschützt mit Kennzeichen | Eine lokale Rollenänderung würde beim nächsten Abgleich still verschwinden |
| Profil gesperrt → auch **Merkliste** und **Teilen-Link** des Kunden verlieren den Eintrag | Die Sperre gilt überall, nicht nur in der Liste |
