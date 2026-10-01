# Wichtigkeit — was offen ist, nach Klassen A, B und C

> Owner 2026-10-01: *„wollen wir so ein Wichtigkeits-Wächter bauen, der nach Wichtigkeit noch
> nicht erledigte Sachen regelmäßig prüft und eine Erinnerung an mich schickt durch dich —
> hierarchisch strukturiert eben nach Wichtigkeitsklassen A, B und C“*

**Livegang:** 2026-12-01 — *Owner-Zeitplan 2026-09-20: „Dezember 2026“, als Stichtag der erste Tag.*

Dies ist **der Index über alle offenen Listen**, keine weitere Liste: die Einzelheiten bleiben,
wo sie stehen (Übergabe, Go-Live-Liste, Arbeitspläne); hier steht nur, **wie wichtig** etwas ist,
**wer** als Nächstes handeln muss und **was** der nächste Schritt ist. Jeden Montag früh fasst
Claude die offenen Punkte daraus zu einer Erinnerung an den Owner zusammen (Push und E-Mail).

*Nicht zu verwechseln* mit den A/B/C-Kategorien der Verbesserungsvorschläge in
`PILOT_GO_LIVE_TODOS.md` (kurzfristig / Marktwert / Vertrieb) — die hier sind **Wichtigkeit**.

## Die Klassen

| Klasse | Bedeutung | In der Erinnerung |
|---|---|---|
| **A** | **muss vor dem Livegang stehen** — sonst Schaden: Recht, Sicherheit, Geld, Daten, oder der Pilot zeigt nichts | jede Woche, jeder Punkt einzeln mit nächstem Schritt |
| **B** | **wichtig und bald** — Dezember-Liste, Entscheidungen, die Arbeit aufhalten | jede Woche, eine Zeile je Punkt |
| **C** | **später** — Ausbau nach dem Livegang, ruhende Fragen | in der ersten Woche des Monats als Liste, sonst nur die Zahl |

Innerhalb einer Klasse kommt zuerst, was **überfällig** ist (Frist vorbei; für A ohne eigene
Frist gilt der Livegang), dann was **beim Owner** liegt, dann das Älteste.

## Regeln für jede Sitzung

1. **Neu offen** → eine Zeile in die passende Klasse. Nummer: die nächste freie `OP-nn`
   (nie eine alte wiederverwenden). *Seit* = heute. *Quelle* = wo die Einzelheiten stehen.
2. **Erledigt** → die Zeile nach **Erledigt** verschieben, mit Datum und Beleg (Commit, Test).
   Nicht löschen — eine verschwundene Zeile sieht aus wie nie gewesen.
3. **Klasse ändern** → die Zeile verschieben. **Herunterstufen nur auf Owner-Wort** — sonst
   verschwindet Unbequemes still nach C.
4. **Wer** ist, wer als Nächstes handeln muss: `Owner` · `K1` · `Cloud` · `Extern`. Ist eine
   Entscheidung gefallen und gebaut wird jetzt, wechselt *Wer* von `Owner` zu `K1`.
5. **Verweise, die geprüft werden** (Spalte *Quelle*): `Reihenfolge #n` (Übergabe, „Die
   Reihenfolge der offenen Arbeit“), `Owner-Liste #n` (Übergabe, „Was auf dem Owner liegt“),
   `Entscheidung X-Yn` (Übergabe, „Offene Owner-Entscheidungen“), `Go-Live P0.n`
   (`PILOT_GO_LIVE_TODOS.md`).

**Erzwungen von `api/test/wichtigkeit.test.js`:** jeder offene Posten dieser vier Listen muss
hier eingestuft sein — wer eine neue offene Owner-Entscheidung in die Übergabe schreibt und sie
hier vergisst, bekommt ein rotes Tor. Umgekehrt darf keine offene Zeile hier auf etwas zeigen,
das dort schon erledigt ist (die teuerste Doku-Fäulnis: sie sieht aus wie Arbeit). Dazu die
Form: eindeutige Nummern, gültige Daten, *Wer* aus der Liste, Verweise auf echte Dateien.

**Selbst ansehen:** `node api/scripts/wichtigkeit.mjs` (die Erinnerung für heute) ·
`… --alle` (mit der C-Liste) · `… --pruefen` (Form und Kopplung, Rückgabewert 1 bei Befund).

## A — muss vor dem Livegang stehen

| Nr | Was | Wer | Nächster Schritt | Seit | Frist | Quelle |
|---|---|---|---|---|---|---|
| OP-01 | **Die CI läuft seit dem 24.06. nicht** — GitHub sperrt das Konto wegen einer offenen Zahlung; ohne CI gibt es kein Tor außerhalb eines Rechners | Owner | github.com → Settings → Billing and plans klären, danach Actions → CI → Run workflow (5 Minuten) | 2026-06-24 | — | [Übergabe](UEBERGABE.md): Owner-Liste #7 · [Go-Live-Liste](PILOT_GO_LIVE_TODOS.md): „Deine Schritte“ |
| OP-02 | **Schlüssel wechseln vor dem ersten Pilotkunden** (Secret-Rotation), dazu der Web3Forms-Schlüssel aus der Git-Historie | Owner | Schritt für Schritt nach der Go-Live-Liste, 20–30 Minuten | 2026-05-24 | — | [Go-Live-Liste](PILOT_GO_LIVE_TODOS.md): Go-Live P0.4, „2. Secret-Rotation“ · [Übergabe](UEBERGABE.md): Owner-eigene Punkte |
| OP-03 | **Zurücksetz- und Bestätigungs-Token gehasht speichern** (Z10) — im Klartext ist jede Datenbankkopie ein Generalschlüssel | Owner | Ja oder Nein zur Empfehlung (SHA-256, Verfallszeit, Erneuern statt Wiederverwenden) — Sicherheitsentscheidung auf dem Anmeldeweg | 2026-09-28 | — | [Übergabe](UEBERGABE.md): Owner-Liste #1, Reihenfolge #1b · [Z-Plan](features/Z_SCHEMA_SCHULDEN.md) |
| OP-04 | **Datenschutzerklärung und Betriebsrat** fürs Einsatzportal-Protokoll (wer war wann angemeldet, welche Aktionen) | Owner | Satz in die Datenschutzerklärung; Zeitarbeitsfirmen mit Betriebsrat brauchen dessen Zustimmung (§ 87 Abs. 1 Nr. 6 BetrVG) — rechtlich prüfen lassen | 2026-10-01 | — | [Übergabe](UEBERGABE.md): „Einsatzportal im Protokoll“ · [Go-Live-Liste](PILOT_GO_LIVE_TODOS.md): 2026-10-01 |
| OP-05 | **Textform des Überlassungsvertrags** ist nicht anwaltlich bestätigt | Owner | Auskunft einholen — spätestens vor dem ersten Abschluss zwischen zwei echten Kunden | 2026-09-01 | — | [Übergabe](UEBERGABE.md): „Rest-Aufgabe mit Auslöser“ |
| OP-06 | **Wiederherstellung einer Sicherung nie geprobt** | Owner | einmal eine echte Sicherung in eine leere Datenbank zurückspielen und anmelden | 2026-05-24 | — | [Übergabe](UEBERGABE.md): Owner-eigene Punkte · [Go-Live-Liste](PILOT_GO_LIVE_TODOS.md): P1.4 |
| OP-07 | **Livegang auf Hetzner und Cloudflare** (Abschnitt 21): Redis für die Takte, Staff-CC-Betriebseinrichtung, erster Produktionslauf der Takte begleitet | Owner | Abschnitt 21 und die Go-Live-Liste abarbeiten | 2026-09-20 | — | [Übergabe](UEBERGABE.md): „Der Zeitplan“ · [Go-Live-Liste](PILOT_GO_LIVE_TODOS.md): „0b. Redis ist keine Kür“ |
| OP-08 | **Harte Bedingungen** (Welle O): Verleiherlaubnis, Haftpflicht, AV-Vertrag | K1 | bauen — muss stehen, bevor echte Buchungen laufen | 2026-09-20 | — | [Übergabe](UEBERGABE.md): Reihenfolge #10 |
| OP-09 | **Der Marktplatz füllt sich selbst** (M4b, M4.8/M4.9) — ohne Inhalt zeigt keine Pilot-Vorführung etwas | K1 | bauen, nächster Posten der Reihenfolge | 2026-09-20 | — | [Übergabe](UEBERGABE.md): Reihenfolge #5 |
| OP-10 | **Null-Politik: 42 Stellen lassen eine Anfrage ohne Firma durch** (`if (req.orgId && …)`) — Mandantengrenze | Owner | entscheiden: alles auf einmal hinter `requireOrgContext` oder Datei für Datei mit dem Wächter im Rücken (Empfehlung: nach OP-23) | 2026-08-19 | — | [Übergabe](UEBERGABE.md): Entscheidung D-M2, Entscheidung W-E5 |

## B — wichtig, bald

| Nr | Was | Wer | Nächster Schritt | Seit | Frist | Quelle |
|---|---|---|---|---|---|---|
| OP-11 | **Prüfung der Cloud-Arbeit durch K1:** Paketversand (1–14), Einsatzportal (E1–E10, D), Cloud-Stand (C1–C5, Windows) | K1 | Prüflisten abhaken, Befunde in die Übergabe | 2026-10-01 | — | [Übergabe](UEBERGABE.md): „Wer prüft, was die Cloud-Sitzung gebaut hat“ |
| OP-12 | Zusammengesetzter Fremdschlüssel `(id, org_id)` auf Standorten und Abteilungen (13 Schlüssel, 7 Tabellen) | Owner | Ja oder Nein — Risiko heute null, später teurer | 2026-09-28 | — | [Übergabe](UEBERGABE.md): Reihenfolge #1c |
| OP-13 | Darf eine Konditionskarte auf einen Lieferanten ohne Geschäftsbeziehung zeigen? | Owner | fachliche Antwort; die Daten können es heute nicht entscheiden | 2026-09-28 | — | [Übergabe](UEBERGABE.md): Reihenfolge #1d |
| OP-14 | Die Probebühne (Welle Y) — prüft die Zusagen, die kein Test abdeckt | K1 | direkt nach dem gefüllten Markt (OP-09) | 2026-09-20 | — | [Übergabe](UEBERGABE.md): Reihenfolge #5b · [Y-Plan](features/Y_PROBEBUEHNE.md) |
| OP-15 | Rangfolge, Korb, Abschluss (N3, N5, N6) | K1 | bauen | 2026-09-20 | — | [Übergabe](UEBERGABE.md): Reihenfolge #6 |
| OP-16 | Der Stundenzettel kennt seinen Kunden (N8.2) | K1 | bauen | 2026-09-20 | — | [Übergabe](UEBERGABE.md): Reihenfolge #7 |
| OP-17 | „Anmeldung erforderlich“ nur bei echter 401 (N8.7) — falsche Meldungen verstecken die nächste Ursache | K1 | bauen | 2026-09-20 | — | [Übergabe](UEBERGABE.md): Reihenfolge #8 |
| OP-18 | Leere Live-Belegschaft und Fehler 500/401: Beispielansicht oder Fehlermeldung? (E7, W-E7) | Owner | W-E7 entscheiden — Empfehlung: gekennzeichneter Leerzustand, der Fehler **benennt**; danach baut K1 | 2026-09-29 | — | [Übergabe](UEBERGABE.md): Reihenfolge #9, Entscheidung W-E7 |
| OP-19 | „Aktueller Plan: ?“ nach dem Schnellstart (N8.3) — ein Interessent sieht eine Sperre statt des Markts | K1 | bauen | 2026-09-20 | — | [Übergabe](UEBERGABE.md): Reihenfolge #11 |
| OP-20 | Wann wird die Reputation neu berechnet? (Rangliste ab PRO) | Owner | Empfehlung: nach jedem Ereignis plus täglicher Takt, einschalten nach Y1 | 2026-08-13 | — | [Übergabe](UEBERGABE.md): Owner-Liste #3 |
| OP-21 | Gehören firmeninterne Anforderungen in einen gemeinsamen Suchindex? | Owner | Empfehlung: nein, ganz heraus — wird **A**, sobald Meilisearch angebunden werden soll | 2026-09-28 | — | [Übergabe](UEBERGABE.md): Owner-Liste #5 |
| OP-22 | `mutation.yml` liegt nicht auf dem Default-Branch; `main` ist rund 400 Commits zurück | Owner | `main` nachziehen oder den Default-Branch umstellen | 2026-08-15 | — | [Übergabe](UEBERGABE.md): Owner-Liste #8 |
| OP-23 | Die Testzahl schwankt: `--test-force-exit` kürzt den Bericht (je Lauf rund 200 Ergebnisse) | Owner | entscheiden: Timer im Ratenbegrenzer freigeben und das Flag entfernen (empfohlen); danach baut K1 | 2026-09-29 | — | [Übergabe](UEBERGABE.md): Entscheidung W-E2 · [Go-Live-Liste](PILOT_GO_LIVE_TODOS.md): Go-Live P0.11 |
| OP-24 | `npm run lint` meldet 48 Probleme — der CI-Job „ESLint“ kann nicht grün werden | K1 | Welle 1, sobald K1 weiterarbeitet (Owner 2026-09-30) | 2026-09-30 | — | [Go-Live-Liste](PILOT_GO_LIVE_TODOS.md): Go-Live P0.12 · [Übergabe](UEBERGABE.md): „Für Welle 1 (Lint/CI)“ |
| OP-25 | Anbindung an Fremdsysteme: zvoove-Anfrage (Schnittstellenpartner) | Owner | zvoove anschreiben — der Vorlauf dauert | 2026-09-30 | — | [Übergabe](UEBERGABE.md): Entscheidung W-E8 · [Integrationen](INTEGRATIONS.md) |
| OP-26 | Owner Control Center ins Staff Control Center: der angekündigte Owner-Abschnitt fehlt (W-E6, das *Wie*) | Owner | Abschnitt schreiben: Zugangsstufe, Audit-Namensraum, sieben Modulnamen, Bauart | 2026-08-27 | — | [Flächen](FLAECHEN.md): „Owner-Entscheid 2026-08-27“ |
| OP-27 | Marktplatz mit **einer** Suchrichtung? (nur Unternehmen suchen Menschen) | Owner | entscheiden — bis dahin wird M5.4 nicht gebaut | 2026-09-06 | — | [Übergabe](UEBERGABE.md): „Owner-Gedanke 2026-09-06“ |
| OP-28 | Alte CSV-Exporte ohne Schutz gegen Tabellenformeln (`=`, `+`, `-`, `@` am Zellanfang) | Cloud | Schutz aus `csvText` auf die alten Exporte übertragen, echte Zahlen ausnehmen | 2026-10-01 | — | [Übergabe](UEBERGABE.md): „Einsatzportal im Protokoll“ (Gefunden, nicht angefasst) |

## C — später

| Nr | Was | Wer | Nächster Schritt | Seit | Frist | Quelle |
|---|---|---|---|---|---|---|
| OP-29 | Vier leere Waisen-Tabellen löschen (Z11) | Owner | Ja als Migration mit Rücknahme — `email_verification_tokens` erst nach OP-03 | 2026-09-28 | — | [Übergabe](UEBERGABE.md): Owner-Liste #2, Reihenfolge #1b |
| OP-30 | `preferredVendors` — Partner-Schnittstelle oder Altlast? | Owner | vor Dezember nicht anfassen | 2026-09-28 | — | [Übergabe](UEBERGABE.md): Owner-Liste #6 |
| OP-31 | Protokollzeilen ohne Firma (1782 von 2711) | Owner | erst nötig, wenn die Route einen Aufrufer bekommt | 2026-08-19 | — | [Übergabe](UEBERGABE.md): Entscheidung D-M3 |
| OP-32 | Hub-Karte für Guthaben | Owner | beide Seiten oder nur Kunden? Abzeichen bei niedrigem Stand? | 2026-08-21 | — | [Übergabe](UEBERGABE.md): Entscheidung D-N1 |
| OP-33 | Testläufer für die drei React-Konsolen (19.621 Zeilen, 0 Unit-Tests) | Owner | vitest (empfohlen) oder node:test mit jsdom | 2026-09-29 | — | [Übergabe](UEBERGABE.md): Entscheidung W-E3 |
| OP-34 | Umfang der Design-System-Bereinigung (2.181 Inline-Stile, 1.208 Hex-Werte) | Owner | Empfehlung: nur die Kundenfläche, Inline-JS zuerst | 2026-09-29 | — | [Übergabe](UEBERGABE.md): Entscheidung W-E4 |
| OP-35 | Kein Kanal erreicht das Team bei Systemereignissen (K4-B1) | Owner | entscheiden, sobald es mehr als zwei Fälle sind | 2026-08-28 | — | [Übergabe](UEBERGABE.md): „Offene Befunde ohne Ticket“ |
| OP-36 | Ruhende Owner-Schalter: `SUPPORT_PHONE`, Web Push (I3 Stufen 2–4), `enforce_mfa`, `preferred_supplier_only`, `partial_fulfillment_allowed`, Demo-Zugang Arbeiter-Perspektive | Owner | bei Bedarf einzeln freigeben | 2026-08-21 | — | [Übergabe](UEBERGABE.md): „Owner-gated, ruhend“ |
| OP-37 | Code-Befunde, die Produktionscode berühren: M0-B4/B8, M0-B6, M0-B7, Welle 3b | Owner | Freigabe, ob und wann | 2026-08-15 | — | [Übergabe](UEBERGABE.md): „Offene Befunde ohne Ticket“ |
| OP-38 | Freigabe externer Support-Kräfte | Owner | nach dem Livegang | 2026-09-20 | — | [Übergabe](UEBERGABE.md): „Nicht in dieser Liste, weil es dem Owner gehört“ |
| OP-39 | Lernschleife: Auto-Übernahme nur für Kategorie EFFIZIENZ bestätigen | Owner | Ja oder Nein | 2026-06-03 | — | [Lern-Konfiguration](../.claude/learning/config.md) |
| OP-40 | Zuverlässigkeit, Zeugnis, Abwesenheit (Welle Q) — rechtlich heikel | K1 | sorgfältig statt schnell | 2026-09-20 | — | [Übergabe](UEBERGABE.md): Reihenfolge #12 |
| OP-41 | Die Sicht der Zeitarbeitsfirma: ein Ort, ein Tag (Welle R) | K1 | bauen | 2026-09-20 | — | [Übergabe](UEBERGABE.md): Reihenfolge #13 |
| OP-42 | Umkreis bundesweit (N8.4) | K1 | bauen | 2026-09-20 | — | [Übergabe](UEBERGABE.md): Reihenfolge #14 |
| OP-43 | Wächter für Kachel und Zahl (N8.6) | K1 | bauen | 2026-09-20 | — | [Übergabe](UEBERGABE.md): Reihenfolge #15 |
| OP-44 | Betriebsarten: Komplettsystem oder angedockt (V6, V7) | K1 | vor jedem Adapter, nach dem Kern | 2026-09-20 | — | [Übergabe](UEBERGABE.md): Reihenfolge #16 |
| OP-45 | Das monatliche Audit (Welle T, mit T6) | K1 | wartet auf messbaren Auslöser | 2026-09-20 | — | [Übergabe](UEBERGABE.md): Reihenfolge #17 |
| OP-46 | Rollen, Standorte, Profilsichtbarkeit (U1–U5) | K1 | sobald Kunden mehrere Menschen und Standorte haben | 2026-09-20 | — | [Übergabe](UEBERGABE.md): Reihenfolge #18 |
| OP-47 | Lohnvorschau (Welle X) | K1 | bauen | 2026-09-20 | — | [Übergabe](UEBERGABE.md): Reihenfolge #19 |
| OP-48 | Aufräumen und Ausbau: P Klasse A, W1/W2, V2–V4, M5–M11 | K1 | nach dem Livegang | 2026-09-20 | — | [Übergabe](UEBERGABE.md): Reihenfolge #20 |

## Erledigt

| Nr | Was | Erledigt am | Beleg |
|---|---|---|---|
| OP-49 | Admin Panel für Kunden → Verwaltung (W-E9) | 2026-10-01 | `4123bad`, `d7c239e`, `92c29aa` |
| OP-50 | Plattform-Teil des Admin Panels ins Staff Control Center (W-E10) | 2026-10-01 | `894c867`, Migration 226 |
| OP-51 | Produkt-Mails im Paketversand, Listen nach 12 Monaten löschen | 2026-10-01 | `3633b1d`, `982ea1f` |
| OP-52 | Einsatzportal im Protokoll | 2026-10-01 | `89ca180` |
| OP-53 | Cloud-Stand automatisch holen | 2026-10-01 | `afc9e1f` |
