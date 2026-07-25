# Pilot-Kunden-Strecke — Befund & Zielbild

> Geprüft 2026-07-25. Kette laut Owner: **LinkedIn → Cloudflare Page → QR → Pilot-Voranmeldung → Marktstart-Info.**
> Ergebnis: **nicht perfekt.** Die Strecke hat einen strukturellen Bruch — sie umgeht das
> eigene Backend vollständig. Unten der Befund, dann das Zielbild.

## Ist-Zustand (verifiziert)

| Station | Datei | Was tatsächlich passiert |
|---|---|---|
| QR-Seite | `cloudflare-pages/start.html` | QR-Bild wird live von `api.qrserver.com` geladen, zeigt auf `ONE_PAGER_URL` |
| One-Pager | `cloudflare-pages/index.html` | Formular postet an **`api.web3forms.com`** → Bewerbung landet als **E-Mail** |
| Backend | `api/routes/pilotPreregistration.js` | vollständig gebaut: DB, Double-Opt-In (`/confirm`), `/counts`, Rate-Limit, `source`-Feld — **wird von der Strecke nie aufgerufen** |

## Der Bruch

**Die Leads landen in einer Mailbox, nicht im Produkt.** Damit fällt weg, was bereits gebaut ist:

1. **Kein Double-Opt-In-Nachweis.** Der Endpunkt hat `/pilot-preregistration/confirm`. Über
   Web3Forms gibt es keinen bestätigten Datensatz — bei einer Werbe-Ansprache ist das der
   Nachweis, den man im Zweifel braucht.
2. **Der stärkste Verkaufshebel bleibt ungenutzt.** `/pilot-preregistration/counts` liefert die
   Belegung. „Noch 7 von 30 Plätzen" auf der Landing ist echte, belegbare Verknappung —
   aktuell steht dort eine statische Zahl.
3. **Keine Attribution.** Das Schema hat `source` (max 120 Zeichen) genau dafür. Ohne UTM-Parameter
   in den LinkedIn-Links weiß niemand, welcher Post die Anmeldungen gebracht hat. Beim zweiten
   Post ist das der Unterschied zwischen Optimieren und Raten.
4. **Datenschutz-Umweg.** Bewerberdaten laufen über einen US-Dienst, obwohl ein eigener,
   DSGVO-sauberer Endpunkt existiert. Zusätzlich liegt der Web3Forms-Key im Repo (C-4)
   und der QR-Dienst sieht bei jedem Seitenaufruf die Ziel-URL (C-5).
5. **Die Kette endet im Nichts.** Es gibt **keinen Link zur Marktstart-Info-Seite** in
   `start.html` oder `index.html`. Wer sich anmeldet, erfährt nicht, was als Nächstes passiert —
   genau der Moment mit der höchsten Aufmerksamkeit bleibt ungenutzt.

**Warum es so gebaut wurde:** Der `README.md` sagt es offen — „Weg B: standalone, server-los",
entstanden, als es noch keinen erreichbaren Server gab. Diese Voraussetzung gilt nicht mehr.

## Zielbild

**Cloudflare Page bleibt die Front — das Backend wird die Wahrheit.**
Die statische Seite am Edge ist richtig (schnell, kein Server-Risiko beim Traffic-Peak nach
einem LinkedIn-Post). Falsch ist nur, wohin sie ihre Daten schickt.

1. **Formular auf den echten Endpunkt umstellen.** `POST /api/pilot-preregistration` mit
   `source` aus dem UTM-Parameter der URL. Braucht CORS für die `pages.dev`-Domain.
2. **Web3Forms als Fallback behalten**, nicht als Hauptweg: schlägt der API-Call fehl
   (Server-Wartung, Netzwerk), greift der E-Mail-Weg. Kein Lead geht verloren — aber der
   Normalfall erzeugt einen sauberen Datensatz.
3. **Live-Platzzähler** aus `/pilot-preregistration/counts` auf die Landing. Echte Zahl,
   kein Fake — der Zähler ist nur so überzeugend, wie er ehrlich ist.
4. **UTM-Kette durchziehen:** LinkedIn-Post-Link trägt `?utm_source=linkedin&utm_campaign=<post>`,
   die Seite reicht ihn als `source` weiter, der QR-Code trägt eine eigene Kennung
   (`utm_source=qr`) — damit ist unterscheidbar, ob Print/Messe oder der Post gewirkt hat.
5. **Nach dem Absenden auf die Marktstart-Info verlinken** statt nur „Danke" zu zeigen.
   Der Moment direkt nach der Anmeldung ist der einzige, in dem jemand freiwillig weiterliest.
6. **QR statisch ausliefern** (einmal erzeugen, als Datei mitgeben) — keine Fremd-Abhängigkeit
   auf der wichtigsten Marketing-Seite.

## Reihenfolge

Vor dem ersten LinkedIn-Post: **1, 3, 4, 6** (das ist die Strecke selbst).
Direkt danach: **5** (Marktstart-Info muss dafür stehen).
**2** ist Absicherung und kann parallel laufen.

Aufwand gesamt: ~3–4 h. Der Nutzen ist nicht kosmetisch — ohne Punkt 4 ist der erste Post
ein Blindflug, und ohne Punkt 1 gibt es zum Marktstart keine verwertbare Pilotliste,
sondern einen Mail-Ordner.

## Verwandte Aufräum-Punkte
`docs/AUDIT_BACKLOG.md`: **C-4** (Web3Forms-Key im Repo), **C-5** (QR von Fremd-Dienst).
