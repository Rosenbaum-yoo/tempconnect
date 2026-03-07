# Verifikation: Keine Secrets im Repo

Führe diese Befehle **im Projektroot** aus, um zu prüfen, dass keine echten Secrets in getrackten Dateien stehen. (Die Datei `.env` wird absichtlich nicht durchsucht – sie enthält echte Werte und steht in .gitignore.)

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
