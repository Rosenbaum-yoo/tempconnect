# WAVE_01 — Release-Hygiene und Secret-Sicherheit

> **Phase:** Foundation. **Prio:** P0. **Voraussetzung:** WAVE_00 abgeschlossen.
> **Ausführungsagent:** Backend-Eingriff — Owner-Freigabe erforderlich, ggf. Warp/Oz delegieren

---

## Ziel

TempConnect darf nur als sauberes Release-Artefakt bewertet, geteilt oder ausgeliefert werden. Aktueller Stand laut ZIP-Scan: erhebliche Hygiene-Funde — siehe `SPECIAL_file_inventory.md`.

---

## Aufgaben

### 1. Vorhandenen CI-Release-Artefakt-Job härten

Im Repo existiert bereits `.github/workflows/ci.yml` mit einem `release-artifact` Job (git archive + Verifikationen). **Nicht neu bauen — härten.**

Zusätzliche Blocker erzwingen:

- `.env*` (außer `.env.example` mit nur Platzhaltern)
- `.git`
- `node_modules`
- `.claude`, `.claire`, `.clone`, `.agents`, `.vercel`
- Coverage-Output, `.c8_output`, Analyseordner
- Lokale `release/`-Inhalte
- `_zip_analysis/`
- `.lnk`-Dateien
- Lokale Uploads
- Temporäre Worktrees
- Logs
- Alte ZIPs / Dist-Artefakte
- Datenbank-Dumps mit Echtdaten
- Private Dokumente
- Echte Tokens / Keys / Secrets (Mustererkennung)

### 2. Release-Skript-Eigenschaften

Stelle sicher, dass das Release-Artefakt enthält:

- Manifest mit Datei-Liste
- SHA-256 über Artefakt
- Build-ID / Version
- Dateigrößen-Sanity-Check (Obergrenze)

### 3. `.env.example` validieren

- vollständig (alle benötigten Variablen)
- secret-frei (nur Platzhalter)
- echte Secrets werden nicht in Tests oder Doku kopiert

### 4. Secret-Rotation dokumentieren

Wenn jemals Secrets in einem Artefakt lagen (laut ZIP-Scan: ja — `.env`, `.env.local`, `.env.txt`, `deploy/.env`):

→ als kompromittiert behandeln
→ Rotation als notwendige Maßnahme dokumentieren in `docs/SECURITY_INCIDENTS.md`
→ Liste betroffener Key-Klassen (ohne Werte) in der Doku
→ Keine echten Werte in Code, Doku oder Antwort

### 5. Lokale Artefakte aus Git-History prüfen

- Wurden jemals `.env` mit echten Werten committed?
- Wenn ja: `git log` dokumentieren, Rotation erzwingen, ggf. History-Rewrite empfehlen (aber nicht durchführen ohne Owner)

---

## Akzeptanzkriterien

- [ ] Dirty Release wird automatisch geblockt (CI-Job failt)
- [ ] Frisches Releasepaket enthält keine lokalen Artefakte
- [ ] Setup-Doku funktioniert ohne echte Secrets
- [ ] Keine echten Schlüsselwerte werden im CI-Output ausgegeben
- [ ] `.env.example` ist vollständig und secret-frei
- [ ] Secret-Rotation für historisch geleakte Werte ist dokumentiert (nicht zwingend ausgeführt)
- [ ] CI-Job-Test: künstlich verschmutztes Working Directory → CI failt mit klarem Fehler
- [ ] `git archive` (oder Äquivalent) ist die Quelle, nicht lokale Worktree

---

## Stop-Regeln in dieser Welle

- Wenn echte Secrets in der Git-History gefunden werden → STOP, Owner informieren, Strategie abstimmen (Rotation? History-Rewrite? Beides?)
- Wenn der vorhandene CI-Job auf eine fundamental andere Architektur setzt als hier beschrieben → trotzdem härten, aber Architektur dokumentieren

---

## Output

Standard-Output nach Format in `00_RULES.md` Abschnitt 3, plus:

```
## Hygiene-Report
- Im aktuellen Working Directory gefundene problematische Artefakte (Liste, ohne Werte):
- In CI-Job ergänzte Blocker (Liste):
- Test: künstliche Verschmutzung → CI failt? (ja/nein, Output):
- Geleakte Secret-Kategorien historisch (Liste, ohne Werte):
- Empfohlene Secret-Rotation (Liste, ohne Werte):
```

---

## Übergang

→ Erst wenn CI-Hygiene-Gate grün: WAVE_02 starten.
