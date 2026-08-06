# P6 i18n (DE/EN) — Übergabe für die Fortsetzung in einem neuen Chat

> **Stand:** 2026-08-05 · Branch `release/enterprise-premium-market-ready` · letzter Commit `3d1b8eb`
> **Zweck:** Diese Datei allein genügt, um P6 ohne Rückfragen fortzusetzen.
> Erst lesen, dann Abschnitt 6 abarbeiten.

---

## 1. Arbeitsumgebung (zuerst)

- **Maßgebliche Arbeitskopie:** `C:\Users\DennisStegemann\Desktop\12_tempconnect_docker(D)`.
  Die OneDrive-Kopie ist **nur Backup** — dort niemals arbeiten.
- **Frontend sichtbar machen:** `docker restart tempconnect_frontend` (nginx).
- **API neu laden:** `docker restart tempconnect_api` — braucht danach **mehrere Minuten**
  zum Hochfahren (kalter Windows-Bind-Mount). Sieht aus wie ein Hänger, ist keiner:
  mit `curl http://localhost:8080/api/health` prüfen.
- **Tests:** `cd api && node --test --test-force-exit test/<datei>`.
- **Commit/Push sind autorisiert** (stehende Freigabe), aber **immer gezielt
  `git add <dateien>`, nie `git add -A`** — im Baum liegen unversionierte
  Geschäftsdokumente (`docs/launch/`, UG-PDF), die nicht committet werden dürfen.
- GitHub-Pushes scheitern gelegentlich am Firmen-Netz → wiederholen. Vorher mit
  `git status --short --branch` prüfen, ob der Commit schon durch ist.

---

## 2. Die Architektur in fünf Sätzen

1. **`frontend/public/js/i18n.js`** ist die Sprachschicht: Wahl in `localStorage`
   (`tempconnect-lang`), `<html lang>` vor dem Paint, Marker `data-i18n` / `-ph` /
   `-title` / `-aria`, Umschalter über `data-i18n-switcher`, Event `tc:langchange`,
   `TCi18n.dateLocale()` für Datums-/Zahlenformate. Ein MutationObserver übersetzt
   **dynamisch eingefügtes Markup** automatisch nach (Shell, Modals, Drawer).
2. **Wörterbücher sind progressiv:** jede Seite registriert ihre Schlüssel per
   `TCi18n.register('de'|'en', {...})`. Fehlt ein EN-Schlüssel, fällt der Text **ehrlich
   auf Deutsch** zurück — nie auf den rohen Schlüssel.
3. **`js/terminologyLabels.js`** ist die **Rollen**-Dimension: dieselbe Stelle heißt je
   Rolle anders (Unternehmen „Personal finden", Agentur „Arbeitsplatz finden"). Englisch
   steht dort als **eigene Rollen-Tabelle** (`LABELS_EN`). Ein Label ist damit
   `f(Rolle, Sprache)` — eine Matrix, keine Liste.
4. **Shells:** `js/pageShell.js` (Plattform) liefert Umschalter, Navigation und
   Rollenbezeichnung auf allen Seiten; `js/workerPortal/portalShell.js` dasselbe fürs
   Einsatzportal (`ep.nav.*` kurz für Bottom-Nav, `ep.navlong.*` beschreibend für die
   Seitenleiste).
5. **Drei Kundenseiten:** Unternehmen und Personaldienstleister **teilen** Flächen
   (→ Terminologie-Matrix nötig). Der **Arbeiter** hat eine **eigene** Fläche
   (Einsatzportal) → dort ist alles seine Sprache; es darf aber **keine Firmen-/
   Handelssprache** hineinsickern („Kapazität", „Ressource", „Personal einstellen").

---

## 3. Verbindliche Regeln für jede weitere Migration

**Ablauf je Seite**
1. `i18n.js` ist überall eingebunden — nicht erneut einfügen.
2. Sichtbare deutsche Texte mit `data-i18n="<ns>.<key>"` markieren, **deutschen Text als
   Fallback stehen lassen**.
3. Wörterbuch an den Anfang der **ausgelagerten Seiten-JS** (falls vorhanden), sonst an
   den Anfang des Haupt-Inline-Scripts. DE **und** EN mit **exakt denselben Schlüsseln**.
4. Dynamische Texte (Toasts, Fehler, Status-Maps, Button-Zustände) auf `TCi18n.t(...)`
   an der **Verwendungsstelle**. `'de-DE'` → `TCi18n.dateLocale()`.

**Englische Begriffswelt (verbindlich)**
- „Arbeitsplatzangebot" = **job posting** (nie job offer / job opening / placement offer)
- „placement" ist **nur** der Agentur-Sicht vorbehalten („Find placements")
- „Personal finden" = Find staff · „Personal einstellen" = List staff
- „Einsatz" = assignment · „Stundenzettel" = timesheet · „Lieferant" = supplier
- „Preisrahmen" = rate card · „Freigabe" = approval · „Tarif" = plan

**Todsünden — jede ist real passiert**
- `*/` **im Kommentartext** beendet den Kommentar vorzeitig → das ganze Script wird
  unparsebar, die Seite läuft ohne JS.
- Ein Wörterbuch-**Wert** darf nie ein `TCi18n.t()`-Aufruf sein (Selbstverweis → stiller
  Leertext; Syntax und Parität bleiben dabei gültig!).
- **Keine neuen Emojis/Unicode-Symbole** (✓ ✗ ⏳) — `uiNoEmoji.test.js` verbietet das.
- Kein `data-i18n` auf Elemente, deren Text JS ohne `t()` überschreibt **oder** die
  Laufzeitwerte enthalten (dort Marker **entfernen**, sonst setzt das nächste `apply()`
  die Fassung ohne Werte zurück).
- **Rollenabhängige Begriffe nie als festen Wörterbuch-Wert einfrieren.** Läuft eine
  Stelle über `TC.terminology.get(...)`, unverändert lassen (**kein** `data-i18n` darauf).
- API-Datenwerte und `value`-Attribute von Filtern/Selects **nie** anfassen (letztere
  gehen an den Server).
- **Text, der GESENDET wird** (Interaktions-Nachrichten an die Gegenseite), bleibt
  deutsch: die Sprache des Empfängers ist beim Absenden unbekannt.
- **Marker ohne Wörterbuch nie committen** — zur Laufzeit harmlos, aber der Test wird zu
  Recht rot. Entweder fertig machen oder zurücksetzen.

---

## 4. Die Gates (`api/test/i18nFoundation.test.js`)

`cd api && node --test --test-force-exit test/i18nFoundation.test.js`

| Gate | Prüft |
|---|---|
| Schicht-Sandbox | Auflösung, DE-Fallback, Interpolation, `set`/`apply`/Event |
| DE/EN-Parität | je Seite; Quelle automatisch HTML **oder** ausgelagertes JS |
| Marker-Auflösbarkeit | jeder `data-i18n`-Key existiert im Wörterbuch |
| Inline-Script-Syntax | jedes Script jeder Seite parst (fängt die `*/`-Falle) |
| Selbstverweis-Verbot | kein Wörterbuch-Wert ist ein `t()`-Aufruf |
| Drei-Seiten-Gate | kein eingefrorener Rollenbegriff; liest `api/config/visibilityMatrix.js`, um Ein-Rollen-Seiten automatisch auszunehmen |
| Arbeiter-Schutz | keine Firmensprache im Einsatzportal (**„Disponent" ist erlaubt** — seine Bezugsperson) |
| Zuständigkeits-Trennung | keine Seite übersetzt Shell-Navigation selbst |
| Nudge-Rollenregel | Aufforderung und Knopf gehören derselben Rolle |

**Migrierte Seiten werden automatisch entdeckt** (Seite oder ihre Seiten-JS registriert
ein Wörterbuch) — **keine Liste zu pflegen**.

Mitlaufen lassen: `test/uiNoEmoji.test.js`, `test/frontendCanonicalPages.test.js`,
`test/marketplaceFeedCard.test.js` (letzterer führt `marketplaceFeed.js` **ohne**
i18n-Schicht aus — die Datei hat deshalb einen lokalen DE-Ersatz).

---

## 5. Fertig

- Schicht, Umschalter, Terminologie-Matrix (3 Rollen), `dateLocale`, `data-i18n-aria`
- **Einsatzportal:** alle 7 Seiten + `portalShell` + `portalStatus` + `worker-login`
  (inkl. `preferred_locale`-Sync → Sprache reist aufs nächste Gerät)
- **Plattform-Shell** + Kernflow (enterprise, feed, requisitions, deal_management,
  mitarbeiter, hilfe)
- **Welle A** (12 täglich genutzte Seiten) — `76c249e`
- **Welle B** (12 Seiten Steuerung/Compliance/Analytics) — `4c17a43`
- **`surfaceAccess.js`** (Sperr-Begründungen, auf vielen Seiten sichtbar) — `636ecab`
- **Welle C** (slaGuard, onboardingChecklist, Admin, Data-Governance, Preise, Abo,
  SLA-Flächen) — `3d1b8eb`
- **Welle D — die zehn Restseiten** (`rst.a`–`rst.j`): bounties, whats-new,
  api-explorer, agency_inbox, angebote_verwalten, request_detail,
  requisition_create, enterprise_anfrage, company_profile_public, sla_profil.
  Damit hat **jede** Seite mit `i18n.js` ein Wörterbuch — die Suchschleife aus
  Abschnitt 7 liefert keine Treffer mehr.

Dabei mit behoben (auf den migrierten Seiten gefunden, nicht gesucht):

| Fund | Wirkung vorher |
|---|---|
| `requisition_create.html` + `integrations.html` lasen `d.csrfToken`, `GET /api/csrf` liefert aber `{ token }` | Header leer → **jede** Erstellung/Mutation endete in `403 CSRF_INVALID` |
| `request_detail.html`: `slaBoxHtml` wurde gebaut, aber nie eingehängt; `#slaSetBtn` ohne Handler | Pulse-Frist ließ sich gar nicht ändern (toter Zweig + toter Knopf) |
| `request_detail.html`: Ladekette ohne `.catch` | Netzwerkfehler ließ die Seite dauerhaft auf „Lade Anfrage…" stehen |
| `enterpriseAnfrage.js`: `renderAddons()` setzte den Haken nicht aus `selectedAddons` | erneutes Rendern (Katalog nachgeladen) verlor die sichtbare Auswahl |
| `requisition_create.html`: Server-Meldung ging roh in `innerHTML` | fehlendes `esc()` (Projektregel) |

**Aus früheren P6-Wellen liegengeblieben** (erst durch die Vollsuite sichtbar — die
Wellen A–C wurden nur gegen die vier i18n-Gates geprüft, nicht gegen `run-tests.js`):

| Fund | Wirkung |
|---|---|
| `matching_results.html` und `js/pages/enterpriseAnfrage.js` riefen `TCi18n` **ohne Brücke** auf | beide werden in vm-Sandboxen **ohne** i18n-Schicht ausgeführt → `ReferenceError`, **18 Tests rot** (`matchingResultsPage`, `enterprisePrefill`) |
| Beide registrierten `tc:langchange` ungeschützt | `TypeError: document.addEventListener is not a function` im minimalen Sandbox-DOM |
| `test/timesheetSource.test.js` prüfte das Literal `title="Direkt erfasst` | die i18n-Migration verschob den Text ins Wörterbuch → spröder Test, ersetzt durch eine **Verhaltens**-Prüfung in beiden Sprachen |
| `docs/features/P6_I18N_UEBERGABE.md` war verwaist | `docsConsistency` schlug zu Recht an → jetzt aus `docs/README.md` verlinkt |

> **Lehre für jede weitere Welle:** die vier i18n-Gates reichen **nicht**. Vor dem Commit
> `cd api && node scripts/run-tests.js` fahren — ohne Pipe, sonst verschluckt die Shell
> den Exit-Code. Merksatz: ein Seiten-Skript, das in einer vm-Sandbox läuft, braucht die
> **lokale i18n-Brücke** (Vorbild: `js/pages/marketplaceFeed.js`) und einen Guard um
> `document.addEventListener`.

Nebenbei behoben: nginx lieferte den Einladungslink `/worker-login.html?invite=…` als
**Landing** aus (Einladung war eine Sackgasse); `slaGuard` schrieb rohe Schlüssel in den
Paywall-Satz; „1 Eintraeg"; „Erhoet".

---

## 6. Offen

1. ~~Neun Restseiten~~ — **erledigt** (Welle D, siehe Abschnitt 5).
2. **P7c**: die vier KI-Bilder + Hero-Video für die Landing. Prompts liegen fertig in
   `docs/mockups/LANDING_KI_BILD_PROMPTS.md`; der Drop-in ist gebaut — Dateien nur unter
   `frontend/public/img/landing/` mit den dort genannten Namen ablegen, dann erscheinen
   sie automatisch. **Owner-Aufgabe** (Bildmaterial), kein Code offen.

### Muster, die Welle D ergänzt hat

- **Sprachwechsel ohne Netz-Abruf.** Alles, was als HTML-String entsteht, wird bei
  `tc:langchange` aus dem zuletzt geladenen Datensatz neu gezeichnet (Cache-Variable
  je Seite). Kein `fetch` beim Umschalten.
- **Marker mitführen statt entfernen.** Ändert JS den Text eines markierten Elements
  auf eine *andere* Übersetzung (Fehlerzustand, Knopf „Wird gesendet…"), wird das
  `data-i18n`-Attribut **mitgesetzt**. So übersetzt der nächste `apply()` den
  aktuellen Zustand, statt auf die Ruhefassung zurückzufallen.
- **Beschriftung und Laufzeitwert trennen.** Statt den Marker wegzulassen, wird das
  Markup geteilt: `<span data-i18n>Endpunkte</span>` neben `<b id="…">42</b>`.
  Gilt auch für Pflicht-Sterne und Checkboxen (`<label><input><span data-i18n>`) —
  ein Marker auf dem Elternelement löscht sonst das Kind.
- **Gesendeter Text bleibt deutsch.** In `enterpriseAnfrage.js` steht dafür eine
  eigene Konstante `KONTEXT_DE`; sie füllt das Anmerkungsfeld, das an unser
  Tarif-Team geht — unabhängig von der Anzeigesprache.

---

## 7. So anfangen

```bash
# Welche Seiten haben noch kein Woerterbuch?
cd "C:/Users/DennisStegemann/Desktop/12_tempconnect_docker(D)/frontend/public"
for f in *.html; do
  grep -q "js/i18n.js" "$f" || continue
  grep -q "TCi18n.register" "$f" && continue
  js=$(grep -o 'js/pages/[a-zA-Z]*\.js' "$f" | head -1)
  [ -n "$js" ] && grep -q "TCi18n.register" "$js" 2>/dev/null && continue
  echo "OFFEN: $f"
done
```

```bash
# Alle Gates
cd "C:/Users/DennisStegemann/Desktop/12_tempconnect_docker(D)/api"
node --test --test-force-exit test/i18nFoundation.test.js test/uiNoEmoji.test.js \
  test/frontendCanonicalPages.test.js test/marketplaceFeedCard.test.js
```

Dann die offenen Seiten migrieren (Regeln aus Abschnitt 3), gern per Fan-out mit
**maximal 6 Agenten pro Welle** — größere Läufe sind mehrfach ins Session-Limit gelaufen.
Danach Gates fahren, im Browser gegenprüfen (`docker restart tempconnect_frontend`, dann
`http://localhost:8080/public/hilfe.html` öffnen und DE/EN umschalten), gezielt committen.

**Merksatz aus diesem Projekt:** erst messen, dann urteilen. Mehrere „Lücken" waren beim
Nachmessen korrekt (company-only-Seiten brauchen keine Rollenverzweigung; „Disponent" ist
die Bezugsperson des Arbeiters, kein Firmenjargon) — und mehrere grüne Suiten verbargen
echte Defekte, bis ein Gate sie sichtbar machte.
