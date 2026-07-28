# One-Pager → Cloudflare Pages (Weg B: standalone, server-los)

Standalone-One-Pager für eine **kostenlose `*.pages.dev`-URL**. Sammelt Voranmeldungen
**ohne eigenen Server** — das Formular schickt jede Bewerbung per E-Mail an dich (via Web3Forms).

> Dieser Ordner ist **eigenständig** und unabhängig von der TempConnect-Plattform.
> Inhalt: `index.html` (One-Pager), `start.html`, `impressum.html`, `datenschutz.html`,
> `assets/qr-pilot.svg` (statischer QR-Code) und `functions/api/prereg.js`
> (Cloudflare Pages Function, nimmt die Voranmeldung entgegen).

---

## Schritt 1 — Web3Forms-Key holen und als Geheimnis hinterlegen (2 Min, kostenlos)

> **Geändert am 2026-07-26 (Audit-Backlog C-4):** Der Key steht **nicht mehr in `index.html`**.
> Er lag dort im Klartext und damit im Repository — bei Web3Forms ist er zwar per Design
> öffentlich, committet heißt aber: jeder, der das Repo sieht, kann die Inbox zuschütten.
> Jetzt liegt er als Umgebungsvariable bei Cloudflare, und `functions/api/prereg.js` fügt
> ihn serverseitig hinzu. Die ausgelieferte Seite kennt ihn nicht.

1. Auf **https://web3forms.com** die **Empfänger-E-Mail** eingeben → „Create Access Key".
2. Der **Access Key** kommt per Mail.
3. Im Cloudflare-Dashboard: **Workers & Pages → das Pages-Projekt → Settings →
   Environment variables** → Variable **`WEB3FORMS_KEY`** anlegen, Wert = der Key,
   **Typ: Secret**. Für *Production* **und** *Preview* setzen, sonst funktioniert die
   Vorschau-Umgebung nicht.
4. Neu deployen (Cloudflare übernimmt neue Variablen erst beim nächsten Deployment).

> ⚠️ **Alter Key ist als kompromittiert zu behandeln.** Er stand in der Versionsgeschichte
> und lässt sich daraus nicht entfernen. Im Web3Forms-Konto **einen neuen Key erzeugen**
> und den alten löschen — sonst bleibt die alte Adresse für Fremde nutzbar.

**Prüfen, ob es sitzt:** Formular abschicken. Kommt „Formular ist serverseitig nicht
konfiguriert.", fehlt die Variable oder das Deployment danach.

## Schritt 2 — Rechtstexte ausfüllen (Pflicht vor Live)
- `impressum.html`: alle `[eckigen Klammern]` durch echte Angaben ersetzen (gesetzliche Pflicht).
- `datenschutz.html`: Platzhalter ersetzen; Web3Forms-Datenschutz verlinkt + AVV-Hinweis beachten.

## Schritt 3 — Auf Cloudflare Pages hochladen (Direct Upload, kein Git nötig)
1. **dash.cloudflare.com** → linke Leiste **„Workers & Pages"** → **„Create" → „Pages" → „Upload assets".**
2. Projektname vergeben, z. B. **`tempconnect`** → das ergibt die URL **`tempconnect.pages.dev`**.
3. **Diesen Ordner** (`cloudflare-pages/`) als ZIP hochladen — **komplett**, inklusive
   `functions/` und `assets/`. Ohne `functions/` nimmt niemand die Voranmeldung entgegen,
   ohne `assets/` fehlt der QR-Code.
   Wichtig: `index.html` muss auf **oberster Ebene** liegen (nicht in einem Unterordner).
4. **„Deploy site"** → nach ~30 Sek. ist die Seite live unter `https://<projektname>.pages.dev`.

## Schritt 4 — Testen
- `https://<projektname>.pages.dev` öffnen → One-Pager lädt.
- Test-Voranmeldung absenden → die Bewerbung muss als **E-Mail in deinem Postfach** ankommen.
  (Beim allerersten Versand bestätigt Web3Forms ggf. einmalig deine Empfänger-Adresse.)
- Erfolgsmeldung „Danke! Ihre Voranmeldung ist eingegangen…" erscheint.

## Schritt 5 — (optional) eigene Domain davorhängen
In den Pages-Projekt-Einstellungen unter **„Custom domains"** deine Domain verbinden
(z. B. `pilot.deine-domain.de`) — Cloudflare richtet DNS + TLS automatisch ein.

---

## Wichtig / Grenzen dieses Wegs
- **Kein Live-Zähler** „X von 30" (der bräuchte ein Backend) — die Plätze stehen statisch als „limitiert auf 30".
- **Kein Double-Opt-in / keine Kuratierungs-DB** wie in der vollen Plattform — die Bewerbung kommt
  schlicht per Mail. Du pflegst die Slots vorerst manuell.
- **Spam-Schutz:** Honeypot-Feld (`botcheck`) ist aktiv; Web3Forms filtert zusätzlich.

## Upgrade-Pfad (später = Weg A)
Sobald TempConnect auf Hetzner läuft, wird der **eigentliche** One-Pager
(`frontend/public/onepager.html`, mit Live-Zähler + Double-Opt-in + Staff-Kuratierung)
über die Domain hinter Cloudflare ausgeliefert. Diese Pages-Version ist die **Brücke**,
um schon vorher Voranmeldungen zu sammeln (readiness-driven).

---

## `start.html` — Erklär-Seite mit QR-Code (zum Verteilen)
`start.html` erklärt in 30 Sekunden, **was man bei TempConnect tun kann** (beide Seiten + Notdienst-USP)
und zeigt einen **QR-Code, der direkt auf den One-Pager (`index.html` = Voranmeldung) weiterleitet** —
ideal für Flyer, Plakat, Visitenkarte oder einen Bildschirm: Handy-Kamera drauf → Voranmeldung öffnet sich.

**Konfiguration (1 Zeile):** In `start.html` ganz unten im `<script>` die Variable setzen:
```js
var ONE_PAGER_URL = "https://<dein-projekt>.pages.dev/";   // bzw. eigene Domain
```
Der QR-Code wird daraus automatisch erzeugt (Bild via goqr.me — zum **Drucken einfach das QR-Bild speichern**;
einmal scannen zum Testen). Aufruf nach Deploy: `https://<projekt>.pages.dev/start.html`.

> Design: beide Seiten teilen denselben editorial-Look wie `landing.html` (Forest/Cream/Wine/Gold),
> inkl. des **Notdienst-USP-Blocks** als zentralem Verkaufsargument.
