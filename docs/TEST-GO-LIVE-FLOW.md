# TempConnect – Go-Live-Flow testen (Ende-zu-Ende)

Durchlauf: Registrierung → Angebot mit PLZ/Ort → Umkreissuche → Broadcast → Anfrage & Deal.  
Abhaken beim Durchklicken.

---

## Voraussetzung

- App läuft: `http://localhost:8080`
- API healthy: `curl -s -o NUL -w "%{http_code}" http://localhost:8080/api/health` → **200**

---

## 1. Registrierung (mit PLZ/Ort)

- [ ] **Logout** (falls eingeloggt), dann Startseite
- [ ] „Konto anlegen“ / Registrierung öffnen
- [ ] Rolle: **Zeitarbeitsfirma** (oder Unternehmen – je nachdem, was du testen willst)
- [ ] Firma, E-Mail, Telefon, **PLZ** (z. B. 20097), **Ort** (z. B. Hamburg), Passwort, AGB akzeptieren
- [ ] „Konto anlegen“ klicken
- [ ] Erwartung: Erfolg, ggf. Hinweis auf Bestätigungs-E-Mail; du bist eingeloggt

---

## 2. Angebot mit Einsatzort (PLZ/Ort)

- [ ] Zu **Anbieten** (oder „Mein Profil“ / eigene Angebote) wechseln
- [ ] **„+ Angebot erstellen“** (oder „Angebot erstellen“)
- [ ] Branche/Kategorie: z. B. **Lager**
- [ ] Region: z. B. **Hamburg**
- [ ] **PLZ (Einsatzort):** z. B. **80331** (München)
- [ ] **Ort (Einsatzort):** z. B. **München**
- [ ] Anzahl, ggf. Notiz, Speichern
- [ ] Erwartung: Angebot erscheint in deiner Liste, ggf. mit Tag „München“

*(Optional: Zweites Angebot mit anderem Ort anlegen, z. B. Berlin, um Umkreissuche zu testen.)*

---

## 3. Umkreissuche (Marktplatz)

- [ ] Zu **Suche** / Marktplatz wechseln
- [ ] **PLZ/Ort (Umkreis):** z. B. **80331** oder **München**
- [ ] **Radius:** z. B. **25 km**
- [ ] „Suchen“ klicken
- [ ] Erwartung: Dein München-Angebot erscheint (wenn Koordinaten gesetzt wurden). Kein 502, keine „HTML statt JSON“-Meldung.
- [ ] Optional: Radius auf 10 km stellen → ggf. weniger Treffer; ohne PLZ/Radius → alle passenden nach Region/Kategorie.

---

## 4. Broadcast (Vorschau & senden)

- [ ] **Broadcast**-Button klicken
- [ ] Branche: z. B. **Lager**, Region: z. B. **Hamburg**
- [ ] **PLZ/Ort (Umkreis):** z. B. **20097**, **Radius:** **25 km**
- [ ] **„Vorschau“** klicken
- [ ] Erwartung: „Passende Anbieter: X“ (X ≥ 0), **kein** 502-Fehler
- [ ] Optional: Kurze Nachricht eintragen, **„Broadcast senden“** klicken
- [ ] Erwartung: „X Anfragen wurden gesendet“ (oder 0, wenn keine passenden Angebote)

---

## 5. Anfrage & Deal (als anderer Nutzer oder zweiter Browser)

- [ ] Mit **zweitem Account** (oder Inkognito) einloggen – Rolle **Unternehmen**, wenn du als Zeitarbeit broadcastet hast
- [ ] Im Marktplatz passendes **Angebot** finden, **„Anfrage senden“**
- [ ] Nachricht eingeben, Anfrage absenden
- [ ] Mit **erstem Account** (Anbieter) zu **Anfragen** gehen: eingehende Anfrage **annehmen**, Kontaktdaten freigeben
- [ ] Mit **zweitem Account** zu Anfragen gehen: **Deal abschliessen** wählen
- [ ] Erwartung: Beide sehen Erfolgsmeldung, Kontaktdaten sind sichtbar

---

## 6. Kurz prüfen

- [ ] **Profil:** PLZ/Ort sichtbar bzw. änderbar; Passwort ändern (falls angeboten)
- [ ] **Datenschutz:** Modal öffnen → Button **„Meine Daten exportieren“** sichtbar und klickbar (Startet Download)
- [ ] **Datenexport:** Klick auf den Button → JSON-Datei wird heruntergeladen

---

## Wenn etwas hakt

- **502 / „Server nicht erreichbar“:** `docker compose ps -a` → API muss **Up (healthy)** sein. Dann: `docker compose up -d --build`, danach erneut testen.
- **„Ort nicht gefunden“ / Umkreis ignoriert:** Suche/Broadcast laufen dann ohne Radius (alle passenden Regionen) – gewollter Fallback.
- **Vorschau = 0 Anbieter:** Entweder keine Angebote mit passender Kategorie/Region/Umkreis, oder zweiter Test-Account mit passendem Angebot anlegen.

---

*Stand: Februar 2026*
