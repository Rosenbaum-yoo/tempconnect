# One-Pager → Cloudflare Pages (Weg B: standalone, server-los)

Standalone-One-Pager für eine **kostenlose `*.pages.dev`-URL**. Sammelt Voranmeldungen
**ohne eigenen Server** — das Formular schickt jede Bewerbung per E-Mail an dich (via Web3Forms).

> Dieser Ordner ist **eigenständig** und unabhängig von der TempConnect-Plattform.
> Inhalt: `index.html` (One-Pager), `impressum.html`, `datenschutz.html`.

---

## Schritt 1 — Web3Forms-Key holen (2 Min, kostenlos)
1. Auf **https://web3forms.com** deine **Empfänger-E-Mail** eingeben → „Create Access Key".
2. Du bekommst einen **Access Key** (lange Zeichenkette) per Mail.
3. In **`index.html`** die Zeile ersetzen:
   ```js
   var WEB3FORMS_KEY = "DEIN-WEB3FORMS-ACCESS-KEY";
   ```
   → deinen echten Key einsetzen. Speichern.

## Schritt 2 — Rechtstexte ausfüllen (Pflicht vor Live)
- `impressum.html`: alle `[eckigen Klammern]` durch echte Angaben ersetzen (gesetzliche Pflicht).
- `datenschutz.html`: Platzhalter ersetzen; Web3Forms-Datenschutz verlinkt + AVV-Hinweis beachten.

## Schritt 3 — Auf Cloudflare Pages hochladen (Direct Upload, kein Git nötig)
1. **dash.cloudflare.com** → linke Leiste **„Workers & Pages"** → **„Create" → „Pages" → „Upload assets".**
2. Projektname vergeben, z. B. **`tempconnect`** → das ergibt die URL **`tempconnect.pages.dev`**.
3. **Diesen Ordner** (`cloudflare-pages/`) als ZIP hochladen **oder** die drei Dateien hineinziehen.
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
