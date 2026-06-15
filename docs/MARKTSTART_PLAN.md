# TempConnect — Marktstart- & Go-to-Market-Plan

> **Lebendes Dokument.** Stand: 2026-06-14. Zweck: das Markteintritts-Vorhaben festhalten, damit Owner **und** Claude es jederzeit im Blick haben. Status pro Punkt pflegen. Quelle: Markenstrategie-Konzept + Kaltstart-Plan (Session 2026-06-14).

> **Legende:** `[ ]` offen · `[~]` in Arbeit · `[x]` erledigt · **(OWNER)** = Entscheidung liegt beim Owner · **(EMPFEHLUNG)** = Claudes Schärfung des Ursprungsplans.

---

## 0 — Kern in einem Satz

**TempConnect ist die digitale Vermittlungs- und Steuerungsplattform für die Zeitarbeit im DACH-Raum** — ein kuratierter B2B-Marktplatz, der Einsatzunternehmen und Personaldienstleister in Echtzeit verbindet. Dachclaim: **„Wo Bedarf auf Kapazität trifft."**

**Die eine Einsicht, die alles steuert:**
> Wir füllen nicht 25 + 25 Plätze — wir bauen **25 funktionierende Paare**. *Voll ist leicht. Liquide gewinnt.*

---

## 1 — Das Vorhaben (Setup)

- [ ] **UG (haftungsbeschränkt) gründen** — schlanke Rechtshülle, Haftungsschutz, Rechnungsstellung. Später auf GmbH umfirmieren, wenn es trägt. **(OWNER)**
- [ ] **Hetzner-Infrastruktur hochfahren** — EU/Deutschland-Hosting offensiv als DSGVO-/Datenresidenz-Verkaufsargument nutzen. Vor echten Kundendaten: Backups, Security-Härtung, Monitoring. Keine Über-Skalierung vor Kunden (10 statt 300 denken).
- [ ] **Marke/Identität** — Editorial-Look (Forest `#1f3a2e` / Creme `#ebe4d3` / Wine `#7a2e2e` / Gold `#b8935a`), keine Emojis, ruhig-wertige Tonalität.

---

## 2 — Launch-Mechanik

- [ ] **LinkedIn-Präsenz** — persönliches Profil (Menschen kaufen von Menschen) **und** Unternehmensseite (Seriosität), beide mit Link zum One-Pager.
- [ ] **One-Pager (Pre-Launch-Seite)** — erklärt alle Funktionen + Mehrwert, nennt **Marktstart-Termin**, enthält:
  - [ ] Voranmeldung/Pre-Registrierung für den Pilotbetrieb
  - [ ] **(EMPFEHLUNG)** „X von 25 Plätzen vergeben"-Zähler (sozialer Beweis + Dringlichkeit)
  - [ ] **(EMPFEHLUNG)** 90-Sek-Demo-Video (Wert sehen statt lesen)
  - [ ] Link zur `landing.html` — **erst bei Marktstart aktiv** (vorher kein toter Link: One-Pager-CTA = die Voranmeldung)
- [ ] **Pilot-Kontingent: 30 Einsatzunternehmen + 30 Personaldienstleister + Warteliste** — je **10 pro Anker-Branche** (Hafen/Logistik · Pflege · Industrie/Gewerbe). Velvet-Rope: Exklusivität, Dringlichkeit, kuratiert.
- [ ] **Hosting/Go-Live:** One-Pager **via Cloudflare** (WAF/CDN davor) → Link zur bei **Hetzner** laufenden TempConnect. `landing.html` erst bei Marktstart aktiv. **Readiness-driven:** Launch-Datum erst fixieren, wenn ~15+ qualifizierte Voranmeldungen je Seite vorliegen.

---

## 2.5 — Pilot-Konzept Hamburg: „Operation Elbe" (das geniale Setup)

**Mikromarkt entschieden (2026-06-14):** Pilot-**Einsatzort = Hamburg + Umland**. Firmen dürfen von überall kommen, aber **jeder Bedarf/jedes Angebot hat Einsatzort Hamburg**. Die Einheit der Liquidität ist der *Arbeitsort*, nicht der Firmensitz — dort entsteht der Match, dort verdichten wir. (Durchsetzbar über die vorhandene Standort-/Location-Scoping-Logik.)

**Buyer-first, supply-backed** (deckt sich mit `api/docs/GO_TO_MARKET.md`): Die *Story* nach außen ist buyer-first — **Einsatzunternehmen sind der Held**. Die Dienstleister sind nicht die Marketing-Story, sondern der **vorab gesicherte Vorrat**, der das Buyer-Versprechen glaubwürdig macht. Wir vermarkten an Käufer, laden aber Angebot vor, damit der Käufer nie einen leeren Raum sieht. *(Korrigiert §3.6: nicht „supply-first verkaufen", sondern „supply vorab sichern, buyer-first verkaufen".)*

**Die 6 genialen Bausteine:**
1. **Geo-Lock auf Einsatzort** — maximale Match-Dichte, ohne Teilnehmer auszuschließen.
2. **Kohorten-Launch (Batch, kein Rolling)** — alle 30+30 gehen an EINEM Launch-Tag live → Marktplatz ab Minute eins voll (kein leerer Raum). Wie ein YC-Batch.
3. **Concierge-/Liquiditäts-Versprechen (statt Garantie)** — keine Outcome-Garantie (wir vermitteln, wir verleihen nicht → unhaltbar). Stattdessen ein **Einsatz-Versprechen**: „Wir sorgen persönlich dafür, dass dein erster Hamburg-Bedarf gesehen wird und Reaktionen bekommt." Glaubwürdig + haltbar, nicht ergebnis-haftend.
4. **Branchen-Quoten: je 10 pro Sektor** — Hafen/Logistik · Pflege · Industrie/Gewerbe (= 30 je Seite). Caps verhindern, dass ein Segment flutet; jeder Sektor hat passendes Supply.
5. **Hamburg-Index** — der Pilot erzeugt den ersten regionalen Zeitarbeits-Marktreport; Pilotpartner bekommen ihn exklusiv zuerst. Reife-Beweis, nicht Front-Door (konform mit GTM-Doktrin).
6. **Anker-Tenant + Concierge** — 2–3 Marquee-Hamburg-Käufer zuerst landen (ziehen den Rest); Gründer als „Hamburg Market Maker" stiftet die ersten Deals von Hand.

## 2.6 — Gefundene Bestands-Struktur (Pilot/Konditionen)

Bereits im Code — die „bis zu 6 Monate kostenfrei"-Struktur, die der Owner vorgegeben hat:
- **Pilot-Dauer: 3 Monate frei** (Owner-Entscheid 2026-06-14, war 6). Umsetzung: `PILOT_MAX_MONTHS` 6→3 in `pilotPolicyService.js` + Tests/Docs angleichen. Pilot läuft als `pilot_contract` auf Tarif **INDIVIDUELL**, Auto-Ablauf nach 3 Monaten → danach `live`/`standard_catalog`. Org-Familie-gescoped, 1 Pilot pro Org.
- **Referral-Gratismonate** (Migration 054): bleiben wie sind (1 + bis zu 6 via Referral), **leise** gehalten.
- **Keine versehentliche Zahlung — Befund (gut):** Auto-Ablauf (`expireStalePilots`, Cron `/internal/pilot-expiry`) **chargt NICHT** — endet nur zu `live`. Konversion zu bezahlt nur im **Payment-Flow** (`payment.js`, echte Zahlung), nie automatisch. Billing standardmäßig manual/console → Risiko strukturell niedrig.
- **TODO Staff Center (Owner-Wunsch):** dedizierte **Pilot-Übersicht** — alle Piloten, Restlaufzeit (verbleibende Gratis-Tage), Bonus-/Referral-Monate, Status + manuelle Controls (verlängern/beenden/konvertieren mit Bestätigung). Safeguard: Pilot-Ende erzeugt eine **Konversions-Aufgabe (Angebot)**, nie eine Abbuchung.
- **Wichtig (GTM-Doktrin):** `api/docs/GO_TO_MARKET.md` legt **buyer-first** fest. Outbound/Landing/One-Pager führen mit Einsatzunternehmen; Referral/Gamification bleiben leise.

---

## 2.7 — Pilot-Bonus-Mechanik & Staff-Center-Verwaltung (Empfehlung)

**Bonus-Mechanik (über die 3 Gratismonate hinaus):**
1. **Freimonate an Aktivierung koppeln** — 3 Monate Basis + 1 Bonus-Monat, wenn der erste Deal in den ersten 30 Tagen zustande kommt. Belohnt Nutzung statt nur Anmeldung; verhindert „tote Piloten".
2. **Conversion-Vorwarnung 14 Tage vor Ablauf** — automatische Erinnerung + Angebot, kein stiller Übergang. Fair + bester Conversion-Moment.
3. **Gründungspartner-Status als dauerhaftes Asset** — Badge + Nennung im Hamburg-Index/Case Study. Anerkennung statt margenfressendem Dauerrabatt.

**Staff-Center-Verwaltung (plattformweit, Owner-Wunsch — wird jetzt gebaut):**
- **Plattformweite Pilot-Übersicht:** ALLE Piloten aller Orgs — Org, Status, Start, Restlaufzeit (Gratis-Tage bei 3 Monaten), Bonus-/Referral-Monate.
- **Manuelle Controls** mit Bestätigung: verlängern · beenden · konvertieren · Ausnahme/Block.
- **Safeguard gegen versehentliche Zahlung:** Pilot-Ende erzeugt eine Konversions-Aufgabe (Angebot), nie eine Abbuchung. Auto-Ablauf endet nur zu `live`.
- **Design:** folgt dem bestehenden Staff-Center-Look (**NICHT** Editorial — Staff/Support behalten ihr Design, siehe Fixplan).

---

## 2.8 — Umsetzungsstand (2026-06-14)

**Gebaut + verifiziert (Tests/Build grün):**
- **Pilot 3 Monate** (`PILOT_MAX_MONTHS` 6→3) + plattformweite **SCC-Pilot-Verwaltung** (list/extend/end/exception — **kein** convert → keine versehentliche Zahlung). 53/53 Tests.
- **Voranmelde-Backend** — Migration 134 `pilot_preregistrations` + `pilotPreregistrationService` + öffentliche Routen (`create`/`confirm`/`counts`, Honeypot + Double-Opt-in + Owner-Notify). 6/6 Tests.
- **One-Pager** `frontend/public/onepager.html` (Editorial, visuell verifiziert) + Impressum/Datenschutz-Stubs.
- **SCC-Kuratierung** — `/preregistrations` + Modul „Voranmeldungen" (Telefon + Status-Workflow, Counts-Header). SCC-Build 69 Module ✓.

**Offen (Deploy/Owner, kein Code):** API-Neustart + Frontend-File-Pickup (Deploy-Sync) · `PILOT_NOTIFY_EMAIL` env setzen · echte Rechtstexte Impressum/Datenschutz · SCC-Live-Klick mit Staff-Login.

---

## 2.9 — Cloudflare-Hosting (Modell + Stand)

**Sanktioniertes Modell: Cloudflare *vor* Hetzner** (DNS-Proxy/CDN/WAF), kein Workers-Rewrite.
- One-Pager + `/api/*` laufen **same-origin** hinter CF → CSRF/Cookies/Formular/`/pilot`-Redirect funktionieren ohne Extra-Config. `trust proxy=1`, secure-Cookies bei HTTPS, CORS in Prod zu.
- **nginx CF-real-IP** (ergänzt 2026-06-15): echte Besucher-IP via `CF-Connecting-IP`, nur aus CF-Ranges → per-IP-Limiter/Abuse-Controls greifen korrekt (nicht „alle = Cloudflare-IP"). Ungenutzt harmlos.
- **Voranmelde-Endpoint gehärtet:** dedizierter strenger Limiter (8/15min/IP prod), Opt-in-Token 30 Tage gültig, Honeypot. Offen für Launch: CAPTCHA/Turnstile + per-Empfänger-Sendecap, sobald echter Mail-Provider aktiv.
- **Alternative** (One-Pager als eigenständige CF-Pages-Seite, anderer Origin): bräuchte CORS-Freigabe + Cookie `SameSite=None;Secure` → komplexer; das In-Front-Modell ist einfacher + empfohlen.
- **Owner-Schritte zum Launch:** Domain bei CF orange-clouden (Proxy an), TLS „Full (strict)", echten Mail-Provider (SMTP/SendGrid) + `PILOT_NOTIFY_EMAIL` setzen.

---

## 3 — Geschärfte Prinzipien (EMPFEHLUNG — gegenüber dem Ursprungsplan)

1. **Kuratieren auf *Passung*, nicht auf *Reihenfolge*.** Voranmeldung = kurze Bewerbung mit **3 Feldern: Region · Branche · freie Kapazität bzw. konkreter Bedarf**. Dann 25 **zueinander passende Paare** auswählen → am Launch-Tag entstehen sofort echte Matches/Deals.
2. **Verknappung mit Datum + Grund.** „25 Plätze · Bewerbung bis [DATUM] · Start [DATUM] · weil wir jeden Partner persönlich begleiten."
3. **Pilotplatz = echtes Angebot: „Gründungspartner".** Pilotphase kostenlos, dauerhafter Vorzugspreis, Mitgestaltung, Logo in erster Case Study + erstem *Zeitarbeits-Index*.
4. **LinkedIn-Content JETZT starten** (nicht erst zum Launch) — Problem („Vermittlungs-Blindflug"), Einblicke, Index-Teaser. Am Launch = warmes Publikum.
5. **Telefon nie kalt allein — Multi-Touch:** LinkedIn-Kontakt + One-Pager zuerst, dann Anruf. **BBQ-Netzwerk zuerst** (warm, CAC ≈ 0), Kaltakquise danach.
6. **Angebotsseite leicht vor Nachfrage öffnen** — Dienstleister mit freier Kapazität füllen das Schaufenster, damit am Launch schon Angebot drinsteht.

---

## 4 — Akquise

- [ ] **Zielkunden-Listen vorab** erstellen: je passende Einsatzunternehmen + Personaldienstleister im gewählten Mikromarkt.
- [ ] **Mikromarkt festlegen: eine Region + eine Branche** (Dichte schlägt Breite; erst kippen lassen, dann replizieren). **(OWNER)**
- [ ] **Telefonwerbung** als Hauptkanal (Zeitarbeit ist telefon-nativ), kombiniert mit LinkedIn-Vorkontakt.
- [ ] **Empfehlung in der Voranmeldung** („passenden Partner empfehlen = Slot-Priorität") → jeder Anmelder bringt seinen Cluster mit (nutzt die Einladungs-Funktion der Plattform).

---

## 5 — Zusätzliche Hebel (Möglichkeiten)

| Hebel | Wirkung | Status |
|---|---|---|
| Launch-Webinar / Erstvorstellung (Warteliste + Verbände einladen) | viele Conversions + Content aus einem Event | [ ] |
| Index-Teaser VOR dem Launch (aus Marktrecherche) | Autorität + Lead-Magnet vor Produkt-Live | [ ] |
| Verband/Kammer-Partnerschaft (GVP/iGZ-Umfeld, IHK) | Vortrag = ~20 qualifizierte Leads + Glaubwürdigkeit | [ ] |
| Pre-Launch-E-Mail-Strecke an Warteliste | Beziehung vor dem Anruf | [ ] |
| Lokale/Fach-PR zum Launch | Reichweite + Glaubwürdigkeit | [ ] |

---

## 6 — Rechtliches / Vertrauen (vor erstem echten Datensatz)

- [ ] Impressum, Datenschutzerklärung, AGB
- [ ] **AVV-Vorlage** (Auftragsverarbeitung, DSGVO)
- [ ] **(WICHTIG)** Klarstellung in den Bedingungen: **TempConnect ist Plattform/Vermittlungsinfrastruktur — NICHT der Verleiher.** Keine eigene AÜG-Erlaubnis nötig (es wird kein Personal überlassen), aber das muss sauber dokumentiert sein → kein Regulierungs-Risiko.
- [ ] Double-Opt-in bei Voranmeldung/Warteliste (DSGVO).

---

## 7 — Die ersten 30 Tage (nach Mikromarkt-Festlegung)

| Woche | Aufgabe | Ziel |
|---|---|---|
| 1 | Mikromarkt + Wedge festlegen, 30 warme Kontakte listen | Zielbild scharf |
| 2 | 15 Dienstleister persönlich ansprechen, Konten einrichten | Angebotsseite gefüllt |
| 3 | 8–10 Einsatzunternehmen (+ ihre Bestands-Dienstleister) andocken | Erste Cluster live |
| 4 | 3–5 Deals von Hand stiften, erste Referenz einsammeln | **Beweis, dass es funktioniert** |

---

## 8 — Anti-Pattern (NICHT tun)

- Kein breiter, bundesweiter Launch (leerer Marktplatz = Friedhof).
- Keine Ads zuerst (erst Liquidität, dann Performance-Marketing).
- Nicht beide Seiten gleich stark gleichzeitig (erst Angebot verdichten).
- Keine Skalierung vor dem „Kippen" eines Mikromarkts.

---

## 9 — KPIs (Kaltstart)

Voranmeldungen (qualifiziert, nach Passung) · vergebene Pilotplätze (X/25 je Seite) · Time-to-first-Match · Time-to-first-Deal · von Hand gestiftete Deals · erste Referenzen/Case Studies.

---

## 10 — Offene Owner-Entscheidungen

- [x] **Mikromarkt: Hamburg + Umland (Einsatzort)** — entschieden 2026-06-14. Anker-Branchen: Hafen/Logistik · Pflege · Industrie/Gewerbe (je 10 → 30+30).
- [x] **Gründungspartner: 3 Monate Pilot frei (INDIVIDUELL)** + stille Referral-Verlängerung — entschieden 2026-06-14. (Offen: PILOT_MAX_MONTHS 6→3 + Staff-Center-Verwaltung.)
- [x] **Marktstart: readiness-driven** + One-Pager via Cloudflare → Hetzner — entschieden 2026-06-14.
- [ ] **(OWNER)** Konkreter Kohorten-Tag/Bewerbungsfrist (sobald Cohort steht, ~15+ Voranmeldungen/Seite).
- [ ] **(OWNER)** UG-Gründung Timing + Firmenname/Rechtsname (vor erstem Pilotvertrag; IHK-Voreintragungsprüfung gratis).

---

## Nächste baubare Artefakte (auf Zuruf)
- One-Pager im Editorial-Look (Bewerbungs-Formular + „X von 25"-Zähler)
- Voranmeldungs-Fragen (Kuratierung auf Passung)
- Pre-Launch-LinkedIn-Posts (fertig zum Veröffentlichen)
- Telefon-/LinkedIn-Akquise-Skript
- Erste *Zeitarbeits-Index*-Musterausgabe
