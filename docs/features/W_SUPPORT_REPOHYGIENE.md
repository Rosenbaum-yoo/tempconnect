# Welle W — Support Center für Mengen, und ein Repository ohne Fallen

> **Status: Bauanweisung.** Erstellt 2026-09-14 aus dem Owner-Dokument (Abschnitte 18 und 19).
> **Gebaut von der bauenden Sitzung, gegengeprüft von der planenden** — siehe
> [`../UEBERGABE.md`](../UEBERGABE.md), Abschnitt „Wer baut, wer prüft".

---

## 1. Die Owner-Vorgabe

- **Abschnitt 18:** Support Center ausbauen, *„um später bei großen Ticketmengen Zeit sparen zu
  können"*, und *„soweit vorbereiten, dass Arbeit nach Indien gegeben werden kann"*.
- **Abschnitt 19:** Repo-Hygiene — Legacy-Pfade, `node_modules`, `.gitignore`, `.env` rotieren,
  Owner Control Center.

---

## 2. Ist-Stand (gemessen 2026-09-14)

| Baustein | Stand |
|---|---|
| Support Center | eigene Oberfläche `frontend/src/support/` (`vite.config.support.ts`), `api/routes/support.js` (18 Endpunkte), `supportIntake.js` |
| Support-Weg der Kunden | Welle I: Hilfe zuerst, Anfrage, Inhalte melden. `SUPPORT_PHONE` wartet auf den Owner |
| Trennung | `api/test/staffNieAusDerPlattform.test.js` — Support Center ist aus der Plattform nicht erreichbar |
| `node_modules` im Repository | **0 Dateien getrackt** ✓ |
| `.env` im Repository | **nur Vorlagen** (`.env.example`, `.env.dev.example`, `.env.prod.example`) ✓ |
| Altlasten-Register | `P_ALTLASTEN.md` (Klassen A–D) — **W legt kein zweites an** |
| API-Doku | drei Seiten für dieselbe Sache (siehe V0.3) |
| Owner Control Center | Überführung ins Staff CC entschieden (2026-08-27), wartet auf Owner-Abschnitt |
| Geschäftsunterlagen | das Owner-Dokument `*.docx` liegt **ungetrackt in der Wurzel**; das Repository ist öffentlich |

---

## 3. Support Center

### W1 · Mengen bewältigen

| Phase | Inhalt | Nachweis |
|---|---|---|
| W1.1 | **Warteschlangen nach Kategorie** und Dringlichkeit; Zuordnung beim Eingang | Neue Anfrage landet in genau einer Schlange |
| W1.2 | **Antwortvorlagen** mit Platzhaltern (Name, Vorgang) — Platzhalter werden escaped | Vorlage mit `<script>` im Namen → als Text |
| W1.3 | **Frist je Anfrage** sichtbar, Überschreitung im Staff CC | Überfällige Anfrage erscheint in der Übersicht |
| W1.4 | **Dubletten zusammenführen**, Verlauf bleibt vollständig | Zusammengeführt → beide Verläufe lesbar |
| W1.5 | **Nur, was Handeln verlangt, ins Support Center** — nicht jede Plattform-Benachrichtigung. Alles andere bleibt Protokoll | Liste der Ereignisarten mit Begründung |

> **Zu W1.5:** Der Owner schrieb *„alle Benachrichtigungen und Nachrichten der Plattform ins Staff
> Center"*. Wörtlich umgesetzt entstünde eine Flut, in der das Wichtige untergeht — für ein Team,
> das heute eine Person ist. Deshalb: alles **protokolliert**, aber nur das **vorgelegt**, was eine
> Handlung verlangt.

### W2 · Vorbereitung für externe Support-Kräfte

**Rechtliche Voraussetzung, bevor ein Mensch außerhalb der EU Zugriff bekommt:** Für Indien gibt es
**keinen Angemessenheitsbeschluss** der EU-Kommission. Eine Übermittlung personenbezogener Daten
braucht deshalb **Standardvertragsklauseln**, eine **Transfer-Folgenabschätzung**, einen
**Auftragsverarbeitungsvertrag** mit dem Dienstleister und eine angepasste Datenschutzerklärung.
Das ist Sache des Owners mit rechtlicher Beratung — **W2 baut die Technik, schaltet aber nichts frei.**

| Phase | Inhalt | Nachweis |
|---|---|---|
| W2.1 | **Rolle „Support extern" mit geringsten Rechten:** Anfrage und die dafür nötigen Kontoangaben — keine Gesundheitsdaten, keine Bankdaten, keine Rechnungsdetails, keine Exporte | Positivliste; gesperrtes Feld → nie in der Antwort. Rückmutation |
| W2.2 | **Jede Einsicht protokolliert** und im Staff CC auswertbar | Einsicht → Audit-Zeile |
| W2.3 | **Zeitlich begrenzte Freigabe** je Person; Ablauf sperrt automatisch | Abgelaufen → 401 |
| W2.4 | **Oberfläche auf Englisch** über die bestehende i18n (P6) | Kein deutscher Reststring in der Support-Oberfläche |
| W2.5 | **Keine Funktion verlässt sich darauf, dass die Rolle besetzt ist** („Das Team ist eine Person") | Ohne externe Kraft läuft alles wie heute |

### W3 · Wächter

| Phase | Inhalt | Nachweis |
|---|---|---|
| W3.1 | Support Center bleibt aus der Plattform unerreichbar | bestehender Wächter grün |
| W3.2 | Externe Rolle erreicht keine Staff-CC-Fläche außer dem Support Center | Versuch → 403 |

---

## 4. Repo-Hygiene

### W4 · Geheimnisse

| Phase | Inhalt | Nachweis |
|---|---|---|
| W4.1 | **Rotationsliste vor dem Go-Live** — welche Schlüssel (Sitzung, Datenbank, Stripe, Mail-Versand, API-Signatur), **ohne Werte**. Der Owner rotiert am Server | Datum je Schlüssel im Betriebsbuch |
| W4.2 | **Wächter:** kein Schlüsselmuster (z. B. `sk_live_`, `-----BEGIN … PRIVATE KEY`, `tc_live_`) in getrackten Dateien | ✅ **2026-09-21** — `api/test/repoHygiene.test.js`. **Nichts neu erfunden:** die Regel, was ein *echter* Zugangswert ist, steht seit der Release-Prüfung in `scripts/lib/secretScan.mjs` (Anbieter-Präfix mit strengem Format, sonst Länge **und** Entropie — an echten Werten gemessen, deshalb ohne die 18 Fehlalarme der Vorgängerregel). Sie lief bisher nur gegen das **Release-Paket**; jetzt zusätzlich gegen alle **1911** getrackten Dateien: 0 Treffer. Mit Gegenprobe (zwei gepflanzte Werte **werden** gefunden) — sonst wäre eine blind gewordene Regel still grün |

### W5 · Geschäftsunterlagen

| Phase | Inhalt | Nachweis |
|---|---|---|
| W5.1 | `.gitignore` für Office-Dateien in der Wurzel und Word-Sperrdateien (`~$*`), dazu `docs/launch/` | ✅ **2026-09-21 — und der Befund war ein anderer als erwartet:** die Regeln existierten bereits, aber in **`.git/info/exclude`**. Diese Datei **wandert nicht mit** — sie schützt genau einen Arbeitsplatz; ein frischer Klon (anderer Rechner, CI, neue Mitarbeit) hatte sie nicht. Jetzt in `.gitignore`, also versioniert. `docs/launch/*` war bereits dort (mit zwei bewussten Ausnahmen) |
| W5.2 | **Wächter:** keine `.docx`/`.xlsx`/`.pptx` getrackt; PDFs nur in benannten Pfaden (Testvorlagen) | ✅ **2026-09-21** — über `git ls-files`, also über genau das, was veröffentlicht wird. Heute: **0** Office-Dateien, **0** PDFs getrackt. Mit Gegenprobe an einer erfundenen Liste, weil beide Proben sonst auch mit einer Einstufung grün wären, die nichts mehr erkennt. **5 Rückmutationen, alle rot** |

### W6 · Altlasten

| Phase | Inhalt | Nachweis |
|---|---|---|
| W6.1 | **Klasse A aus `P_ALTLASTEN.md` abarbeiten** — Klasse B nie (sieht tot aus, ist geplant) | je Posten ein Commit mit Messung |
| W6.2 | **Eine API-Doku-Seite** (siehe V0.3), die anderen leiten dorthin um | Alte Adresse → Umleitung, kein 404 |
| W6.3 | Legacy-Pfade mit Umleitung statt Löschung, solange Links von außen existieren können | Alte URL → Ziel |

### W7 · Owner Control Center

**Nicht anfassen**, bis der Owner-Abschnitt zur Überführung vorliegt (Entscheid 2026-08-27). Keine
Module anlegen, keine entfernen.

---

## 5. Reihenfolge

**W5 → W4.2 → W1 → W6 → W3 → W2 → W4.1.**

> **W5 zuerst, weil es heute schon eine offene Falle ist:** das Owner-Dokument liegt ungetrackt im
> öffentlichen Repository. Ein einziges `git add .` würde es veröffentlichen. W4.1 zuletzt, weil
> Rotieren erst direkt vor dem Go-Live Sinn hat.

## 6. Woran gegengeprüft wird

| # | Frage |
|---|---|
| 1 | Sieht die externe Rolle ein einziges Feld, das sie nicht braucht? |
| 2 | Wurde etwas freigeschaltet, bevor die rechtlichen Voraussetzungen belegt sind? |
| 3 | Beißt der Schlüsselmuster-Wächter wirklich? |
| 4 | Wurde etwas aus Klasse B oder D von `P_ALTLASTEN.md` entfernt? |

## 7. Was Welle W **nicht** tut

- **Einen externen Dienstleister auswählen oder freischalten.** Das entscheidet der Owner.
- **Ein zweites Altlasten-Register anlegen.**
- **Direktnachrichten zwischen Kunden bauen** (Abschnitt 10b bewusst ausgelassen).

## 8. Kreislauf und Verdrahtung

**Welle W schließt K-5 Hilfe** — das fehlende Glied ist der Rückweg: *häufige Anfrage wird
Hilfeartikel*. Kreislaufkarte und Verdrahtungskette: [`V_SCHNITTSTELLEN.md`](V_SCHNITTSTELLEN.md),
Abschnitte 3b und 3c.

| Über den Plan hinaus mitzudenken | Warum |
|---|---|
| **W1.6 Rückweg:** das Support Center zählt Anfragen je Thema; ab einer Schwelle schlägt es einen Hilfeartikel vor, der Artikel wird im Anfrageformular **vor** dem Absenden angezeigt | Ohne Rückweg wächst die Ticketmenge mit jedem Kunden — genau das, was Abschnitt 18 verhindern will |
| **W1.7 Kontext mitschicken:** die Anfrage trägt Seite, Betriebsart (V6), Plan und letzten Fehlercode automatisch mit — ohne personenbezogene Inhalte der Seite | Die erste Rückfrage „wo genau?" entfällt |
| **W1.8 Der Kunde sieht den Stand** seiner Anfrage in der Plattform (offen / in Bearbeitung / gelöst) und wird bei Antwort benachrichtigt | Sonst fragt er ein zweites Mal — eine Dublette mehr |
| **Angedockter Betrieb:** Anfragen zu extern geführten Objekten nennen das Fremdsystem, damit Support nicht in TempConnect sucht, was in zvoove liegt | Kürzere Bearbeitung |
