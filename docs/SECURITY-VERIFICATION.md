# Verifikation: Keine Secrets im Repo

Führe diese Befehle **im Projektroot** aus, um zu prüfen, dass keine echten Secrets in getrackten Dateien stehen. (Die Datei `.env` wird absichtlich nicht durchsucht – sie enthält echte Werte und steht in .gitignore.)

## 0. Der schnelle Weg: ein Befehl statt zehn greps

```bash
bash scripts/secret-scan.sh
```

Prüft **Arbeitsstand und Versionsgeschichte** und unterscheidet echte Schlüssel von
Platzhaltern. Rückgabewert 1 bei Fund, taugt also als Gate.

Die Abschnitte 1–4 darunter bleiben als Nachschlagewerk: sie erklären, *was* geprüft wird und
wie man einzelne Muster von Hand sucht. Der Befehl oben ist der Alltag.

**Warum nicht nur der Arbeitsstand:** ein Geheimnis, das *einmal* committet war, bleibt über
die Historie erreichbar — auch wenn die Datei längst geändert ist. Das lässt sich nachträglich
praktisch nicht entfernen (Forks, Klone, Archive halten es fest). Deshalb sucht das Skript in
beidem.

**Wie es Fehlalarme vermeidet:** der Bestand enthält rund fünfzehn Platzhalter und
Test-Fixtures (`sk_live_DEIN_LIVE_SECRET_KEY`, `SG.DEIN_API_KEY`, `AKIAXXXXXXXXXXXX`). Wer nur
auf das Präfix prüft, bekommt fünfzehn Fehlalarme und schaltet das Werkzeug ab. Geprüft wird
deshalb das **Format**: echte Schlüssel dieser Anbieter haben eine Mindestlänge und gemischte
Groß-/Kleinschreibung, die Platzhalter hier sind Großbuchstaben mit Unterstrichen.

**Was es nicht sehen kann** (und deshalb Handarbeit bleibt):
- **Selbst erzeugte Geheimnisse** ohne erkennbares Format — `SESSION_SECRET`, `JWT_SECRET`,
  `ADMIN_SECRET`, `INTERNAL_CRON_SECRET`, `STAFF_SESSION_SECRET`. Eine Zufallskette ist von
  einem Platzhalter nicht unterscheidbar. Diese werden ohnehin rotiert (P0.4 in
  `PILOT_GO_LIVE_TODOS.md`).
- **Schlüssel im UUID-Format** (z. B. Web3Forms). Ein Suchmuster dafür würde jede
  Migrations-ID und jede Test-UUID treffen — unbrauchbar. Der bekannte Fall steht unten.

---

## 0b. Gate: bevor das Repository öffentlich geschaltet wird

Öffentlich ist **nicht zurücknehmbar**: ab dem Moment existieren Klone, Forks und
Suchmaschinen-Abbilder. Wieder auf privat zu stellen entfernt nichts davon. Deshalb vorher
diese vier Punkte, in dieser Reihenfolge.

> **Warum man es trotzdem wollen kann:** öffentliche Repositories haben bei GitHub Actions
> **unbegrenzte Minuten**, private nur ein Monatsbudget. Wenn die CI wegen aufgebrauchter
> Minuten nicht startet (siehe C-12 in `AUDIT_BACKLOG.md`), löst „öffentlich" das Problem
> unmittelbar.

**1. Anbieter-Geheimnisse:** `bash scripts/secret-scan.sh` → muss 0 liefern.
   *Stand 2026-07-26: liefert 0.* Nie eine echte `.env` committet; alle Treffer für
   `sk_live_`, `whsec_`, `SG.`, `AKIA` sind Platzhalter oder Test-Fixtures; keine privaten
   Schlüssel.

**2. Der eine bekannte Fund — Web3Forms.** In der Historie steht ein **echter**
   Web3Forms-Access-Key (UUID-Format, beginnt mit `3c9f…`). Er ist aus dem aktuellen Stand
   entfernt (Audit-Backlog C-4: die Seite holt ihn jetzt serverseitig aus
   `WEB3FORMS_KEY`), aber **aus der Historie nicht**.
   *Einordnung:* Web3Forms-Keys sind per Design öffentlich — sie stehen normalerweise im
   Browser-Quelltext. Der Schaden ist **Spam in der Empfänger-Inbox**, kein Zugriff auf
   Systeme oder Daten. Trotzdem: **vor dem Öffentlich-Schalten rotieren** (neuen Key im
   Web3Forms-Konto erzeugen, alten löschen, neuen als Cloudflare-Secret setzen). Danach ist
   der alte in der Historie wertlos.

**3. Selbst erzeugte Geheimnisse rotieren** — P0.4. Sie stehen nicht im Repo, aber sie waren
   während der Entwicklung in Umlauf. Vor dem ersten echten Kunden ohnehin fällig; vor
   „öffentlich" ist es der natürliche Anlass.

**4. Personenbezug und Geschäftsunterlagen prüfen.** Vorname einer Mitarbeiterin stand in vier
   Dokumenten und wurde 2026-07-26 durch eine Rollenbezeichnung ersetzt — in einem öffentlichen
   Repository sind das Daten Dritter, und ein Vorname bringt dort keinen Erkenntniswert.
   Ebenfalls prüfen, dass Gründungs-/Notar-/Holding-Unterlagen **nicht getrackt** sind
   (Stand 2026-07-26: `docs/launch/` und die UG-PDF sind untracked — korrekt so).

```bash
# Schnellprüfung, ob Geschäftsunterlagen versehentlich getrackt wurden:
git ls-files | grep -iE "notar|holding|gruendung|firmendaten|\.pdf$"
```

*Stand 2026-07-26:* der einzige Treffer ist `docs/finalization/G4_FIRMENDATEN_CHECKLISTE.md` —
eine **leere Checkliste** mit Platzhaltern, keine echten Daten. Unbedenklich.

**5. Der Punkt, der erst nach der Gründung heikel wird.** Wenn Welle G.4 abgearbeitet wird,
   trägt jemand die echten Firmendaten in **`api/config/company.js`** ein: Geschäftsanschrift,
   Steuernummer, HRB-Nummer, Name der Geschäftsführung. Heute steht dort `isPlaceholder: true`
   mit `Musterstrasse 1` — unbedenklich. Danach nicht mehr.

   *Die Nuance:* diese Angaben **müssen** ohnehin im Impressum stehen (§5 TMG), insofern ist
   nichts „geheim". Aber ein öffentliches Repository ist eine andere Art von Veröffentlichung
   als eine Website, die man kontrolliert: Forks und Archive behalten die Daten dauerhaft, auch
   nach einem Umzug oder einer Löschung. **Wer die UG von der Privatadresse aus gründet — bei
   Erstgründungen der Normalfall — veröffentlicht damit dauerhaft seine Wohnadresse.**

   Zwei saubere Wege, wenn das Repository zu diesem Zeitpunkt öffentlich ist:
   - **Ladungsfähige Geschäftsadresse** verwenden (Coworking, Anbieter für Firmenadressen)
     statt der Privatadresse — löst das Problem auch für das Impressum selbst.
   - oder `api/config/company.js` **aus dem Repo nehmen** und wie eine Konfigurationsdatei
     behandeln (Vorlage committen, echte Werte per Umgebungsvariable). Das ist der Weg, den
     dieses Projekt für Geheimnisse ohnehin geht.

   Vor G.4 also bewusst entscheiden — nachträglich ist es nicht rückholbar.

**Nach dem Umschalten:** `bash scripts/ci-status.sh` — läuft die CI jetzt? Ergebnis in
`AUDIT_BACKLOG.md` bei C-12 eintragen.

---

## 0c. Was GitHub seit dem Öffentlich-Schalten zusätzlich absichert

Aktiviert am 2026-07-26. Für öffentliche Repositories ist all das **kostenlos** — einer der
Nebengewinne der Sichtbarkeitsänderung.

| Schutz | Was er tut |
|---|---|
| **Secret Scanning** | Durchsucht Code **und Historie** laufend nach bekannten Schlüsselformaten und meldet Treffer. |
| **Push Protection** | Blockiert einen Push, der ein erkanntes Geheimnis enthält — **bevor** es im Repo landet. |
| **Private Vulnerability Reporting** | Finder melden Schwachstellen privat über GitHub, statt ein öffentliches Issue zu öffnen (siehe `SECURITY.md`). |

**Push Protection ist die eigentliche Verbesserung.** `scripts/secret-scan.sh` findet ein
Geheimnis, *nachdem* es committet wurde — dann hilft nur noch rotieren. Push Protection
verhindert den Commit. Beides zusammen ist sinnvoll: das Skript deckt auch Formate ab, die
GitHub nicht kennt, und läuft ohne Netz.

Prüfen:

```bash
gh api repos/<owner>/<repo> --jq '.security_and_analysis'
gh api repos/<owner>/<repo>/private-vulnerability-reporting --jq '.enabled'
```

**Nicht aktiviert:** Dependabot-Sicherheitsupdates. Die erzeugen automatisch Pull Requests —
sinnvoll, aber eine Entscheidung über den Arbeitsfluss, nicht über Sicherheit. Bewusst dem
Owner überlassen.

---

## 1. .env darf nicht getrackt sein

```bash
git status --short .env
# Erwartung: "??" (untracked) oder nichts, wenn .env in .gitignore steht.
git check-ignore -v .env
# Erwartung: .gitignore:2:.env    .env
```

## 2. Keine SendGrid-API-Keys (SG.) in Code oder Doku

Suche nur in typischen Quell-/Doku-Dateien, **ohne** .env:

```bash
# Windows (PowerShell), von tempconnect_docker aus:
Get-ChildItem -Recurse -Include *.js,*.ts,*.md,*.json -Path . | Where-Object { $_.FullName -notmatch "node_modules|\.env" } | Select-String -Pattern "SG\.[a-zA-Z0-9_-]{20,}" | Select-Object -First 20

# Linux/macOS (Bash):
# grep -r --include='*.js' --include='*.ts' --include='*.md' --include='*.json' -E 'SG\.[a-zA-Z0-9_-]{20,}' --exclude-dir=node_modules . 2>/dev/null || true
```

**Erwartung:** Keine Treffer in getrackten Dateien. (Treffer nur in .env sind zulässig; .env nicht committen.)

## 3. Keine hardcodierten Stripe-Secret-Keys (sk_live / sk_test mit echtem Muster)

```bash
# PowerShell (ohne node_modules und .env):
# Get-ChildItem -Recurse -Include *.js,*.ts -Path . -Exclude node_modules | Select-String -Pattern "sk_(live|test)_[a-zA-Z0-9]{24,}" | Select-Object -First 10

# Bash:
# grep -r --include='*.js' --include='*.ts' -E 'sk_(live|test)_[a-zA-Z0-9]{24,}' --exclude-dir=node_modules . 2>/dev/null || true
```

**Erwartung:** Keine Treffer (Keys nur aus process.env).

## 4. Keine Platzhalter als echte Werte in Beispiel-Dateien

.env.example und .env.prod.example sollen nur Platzhalter wie `<DEIN_...>` oder `HIER_...` enthalten, keine echten Keys:

```bash
# Prüfen, dass in Beispiel-Dateien kein langer SG.-Key steht (nur Platzhalter):
# Bash: grep -E "SG\.[a-zA-Z0-9_-]{30,}" .env.example .env.prod.example 2>/dev/null && echo "FEHLER: Echter Key in Beispiel" || echo "OK"
```

**Erwartung:** Kein Treffer (keine langen SG.-Strings in .env.example / .env.prod.example).

---

Nach einer Schlüssel-Rotation: neuen Key **nur** in der lokalen .env setzen und App neu starten. Siehe [SECURITY-CONFIG.md](SECURITY-CONFIG.md) (How to rotate keys).
