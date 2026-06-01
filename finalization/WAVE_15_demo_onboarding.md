# WAVE_15 — Demo, Onboarding und Sales-Reife

> **Phase:** Polish. **Prio:** P2. **Voraussetzung:** WAVE_04+ (Kernflows), WAVE_10 (UX).

---

## Ziel

Produkt, Demo und Pilot müssen sofort plausibel wirken. Jede Rolle versteht den nächsten Schritt.

---

## 1. Demo-Daten

Erstelle/härte saubere Demo-Daten für:
- Demo-Organisation
- Demo-Unternehmen (1-2)
- Demo-Vendoren (3-5)
- Demo-Worker (10-20)
- Demo-Requisitions (verschiedene Status)
- Demo-Rate-Cards
- Demo-Assignments
- Demo-Timesheets (verschiedene Status)
- Demo-Spend
- Demo-Compliance-Warnungen (sinnvoll, nicht generisch)
- Demo-Verträge
- Bonus/Referral NUR falls sinnvoll und klar markiert

**Wichtig:**
- Keine privaten Echtwerte
- Demo-Daten klar als Demo markiert
- Demo läuft ohne manuelle DB-Eingriffe (Seed-Skript)
- Demo verfälscht keine Production-KPIs

---

## 2. Onboarding je Rolle

### Unternehmen / Kunde

1. Organisation vervollständigen
2. Bedarf / Requisition erstellen
3. Vendoren einladen ODER Pool nutzen
4. Rate Card prüfen
5. Angebote / Besetzung verwalten
6. Spend und Compliance sehen

### Vendor / Zeitarbeitsfirma

1. Profil vervollständigen
2. Mitarbeiter / Skills pflegen
3. Rate Cards / Konditionen prüfen
4. Auf Requisitions reagieren
5. Assignments und Timesheets verwalten

### Worker / Mitarbeiter

1. Profil ergänzen
2. Verfügbarkeit pflegen
3. Einsätze sehen / annehmen
4. Stundenzettel pflegen

### Staff

1. Kunden / Freigaben / Custom Plans verwalten
2. Enterprise Requests bearbeiten
3. Ausnahmefälle prüfen

### Owner

1. Systemstatus, Security und Betrieb überwachen

---

## 3. Demo-Pfad (verkaufbar)

Definierter "Golden Path" für Verkaufs-Demo:
- Welche Seiten zeigt der Sales in welcher Reihenfolge
- Welche Story erzählt er dabei
- Welche Demo-Daten unterstützen das

Dokumentiert in `docs/SALES_DEMO_PATH.md`.

---

## 4. Onboarding-Wizard (falls vorhanden)

- `frontend/public/onboarding.html`
- Pro Rolle eigener Pfad
- Skipbare Schritte erlauben
- Fortschritt persistent

---

## Akzeptanzkriterien

- [ ] Demo läuft ohne manuelle Datenbankeingriffe
- [ ] Jede Rolle versteht den nächsten Schritt
- [ ] Keine Demo zeigt kaputte Premium-Flächen
- [ ] Sales kann End-to-End-Demo zeigen ohne "das ignorieren wir"
- [ ] Demo-Daten verfälschen keine echten KPIs
- [ ] Onboarding-Pfade pro Rolle dokumentiert

---

## Stop-Regeln

- Demo-Daten in Production-Datenbank → STOP, separieren
- Demo zeigt Feature, das nicht produktiv funktioniert → STOP, ausblenden oder fixen
- Onboarding führt in tote Sackgasse → fixen

---

## Betroffene Dateien

- `frontend/public/onboarding.html`
- Seed-Skripte (identifizieren)
- `docs/SALES_DEMO_PATH.md` (anlegen)
