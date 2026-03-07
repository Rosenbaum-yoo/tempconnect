# SendGrid einrichten (vor Hetzner / Go-Live)

TempConnect nutzt **SMTP** – SendGrid liefert genau das. Kein Code-Change nötig, nur Konfiguration.

---

## 1. SendGrid-Account & API-Key

1. **Account:** https://sendgrid.com → Sign Up (kostenlos bis 100 E-Mails/Tag).
2. **API-Key:**
   - SendGrid Dashboard → **Settings** → **API Keys** → **Create API Key**
   - Name z. B. `TempConnect-Produktion`
   - Permissions: **Restricted** → nur **Mail Send** → **Full Access** (oder nur Send)
   - Key erzeugen und **sofort kopieren** (wird nur einmal angezeigt).

---

## 2. Absender verifizieren

SendGrid verlangt einen verifizierten Absender.

- **Option A – Single Sender (schnell):**  
  **Settings** → **Sender Authentication** → **Single Sender Verification** → E-Mail-Adresse anlegen (z. B. `noreply@deine-domain.de`). Link in der Bestätigungs-Mail klicken.
- **Option B – Domain (später für bessere Zustellbarkeit):**  
  **Settings** → **Sender Authentication** → **Authenticate Your Domain** → Anleitung für DNS (SPF/DKIM) folgen.

Für den Start reicht **Single Sender** mit einer echten E-Mail (z. B. deine Firmen-Mail).

---

## 2b. DNS-Authentifizierung (Domain verifizieren)

Wenn du eine **eigene Domain** hast (z. B. `tempconnect.de`), kannst du sie bei SendGrid per DNS verifizieren. Dann dürfen Mails von `noreply@tempconnect.de` versendet werden und landen seltener im Spam (SPF/DKIM).

### Schritt 1: In SendGrid starten

1. SendGrid Dashboard → **Settings** (Zahnrad) → **Sender Authentication**
2. **Authenticate Your Domain** (nicht „Single Sender“) wählen
3. **Get Started** bzw. **Authenticate a domain** klicken

### Schritt 2: Domain eingeben

- **Domain:** z. B. `tempconnect.de` (ohne www, ohne Subdomain)
- **Advanced Settings** optional: Wenn du willst, nur eine Subdomain nutzen (z. B. `mail.tempconnect.de`) – sonst die Hauptdomain lassen
- **Next** klicken

### Schritt 3: DNS-Einträge von SendGrid anzeigen lassen

SendGrid zeigt dir **2–3 DNS-Einträge**, die du bei deinem DNS-Anbieter anlegen musst. Typisch:

| Typ  | Host / Name        | Wert / Ziel |
|------|--------------------|--------------|
| CNAME | z. B. `s1._domainkey` | Zeiger auf SendGrid (z. B. `s1.domainkey.u12345.wl.sendgrid.net`) |
| CNAME | z. B. `s2._domainkey` | Zeiger auf SendGrid (z. B. `s2.domainkey.u12345.wl.sendgrid.net`) |

(Die genauen **Host**- und **Wert**-Angaben kommen von SendGrid – immer die Werte aus dem SendGrid-Dialog übernehmen.)

- **Host:** oft `em1234.deinedomain.de` oder `s1._domainkey.deinedomain.de` – SendGrid zeigt dir genau, was du eintragen sollst (entweder nur den vorderen Teil oder die volle Angabe).
- **Value / Points to / Ziel:** der von SendGrid angegebene CNAME-Zielwert.

### Schritt 4: Einträge beim DNS-Anbieter anlegen

Du brauchst Zugang zum **DNS** deiner Domain (nicht zu SendGrid). Das ist dort, wo die Domain verwaltet wird:

- **Hetzner:** Cloud Console → **DNS** (oder **Domains**) → deine Domain → **Einträge hinzufügen**
- **Cloudflare:** Domain wählen → **DNS** → **Records** → **Add record**
- **Andere Anbieter:** Unter „DNS“, „Nameserver“, „Zone“ o. Ä. findest du die Liste der Einträge (A, CNAME, TXT, …)

Für **jeden** von SendGrid angezeigten Eintrag:

1. **Typ:** CNAME (oder was SendGrid angibt)
2. **Name / Host:** exakt so eintragen wie von SendGrid (z. B. `s1._domainkey` oder `em1234` – manche Anbieter fügen die Domain automatisch an, dann nur den vorderen Teil eintragen)
3. **Wert / Target / Points to:** den von SendGrid angegebenen Ziel-Host (z. B. `s1.domainkey.u12345.wl.sendgrid.net`)
4. **TTL:** 3600 oder „Automatisch“ reicht
5. Speichern

**Hinweis:** Manche Anbieter verlangen beim CNAME-Ziel einen Punkt am Ende (z. B. `s1.domainkey.u12345.wl.sendgrid.net.`) – wenn SendGrid keinen Punkt zeigt, erst ohne probieren; bei Fehlermeldung einen Punkt ans Ende setzen.

### Schritt 5: Warten und in SendGrid verifizieren

- DNS-Änderungen können **einige Minuten bis 48 Stunden** dauern (oft 5–30 Minuten).
- In SendGrid auf **Verify** klicken (oder „I’ve added the records“).
- Wenn alles stimmt: Status wird **Verified** (grüner Haken).

### Schritt 6: Absender-Adresse nutzen

- In der **.env** dann: `SMTP_FROM=noreply@deine-domain.de` (also eine Adresse **auf der verifizierten Domain**).
- Danach API neu starten (`docker compose up -d api`).

### Kurz-Checkliste DNS-Auth

- [ ] SendGrid: **Authenticate Your Domain** → Domain eingeben
- [ ] Alle angezeigten CNAMEs (evtl. TXT) **1:1** beim DNS-Anbieter anlegen
- [ ] 5–30 Min. warten, dann in SendGrid **Verify** klicken
- [ ] `.env`: `SMTP_FROM` auf Adresse der verifizierten Domain setzen (z. B. `noreply@tempconnect.de`)

---

## 3. .env setzen

Im **Projektordner** (wo `docker-compose.yml` liegt) in der `.env` die Mail-Zeilen anpassen.  
**Lokal (z. B. PowerShell):**

```powershell
# Alte Mailpit-/Gmail-Zeilen auskommentieren oder ersetzen, dann:

# SendGrid (SMTP)
$env:SMTP_HOST = "smtp.sendgrid.net"
$env:SMTP_PORT = "587"
$env:SMTP_USER = "apikey"
$env:SMTP_PASS = "<Deinen_SendGrid_API_Key_hier_eintragen>"
$env:SMTP_FROM = "noreply@deine-domain.de"
```

**Dauerhaft in der Datei `.env`** (empfohlen für Server):

```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=<Deinen_SendGrid_API_Key_nur_in_der_env_setzen>
SMTP_FROM=noreply@deine-domain.de
```

- `SMTP_USER` muss **genau** `apikey` sein (SendGrid-Vorgabe).
- `SMTP_PASS` = dein SendGrid-API-Key (mit `SG.` am Anfang).
- `SMTP_FROM` = die bei SendGrid verifizierte Absender-Adresse.

---

## 4. API neu starten (Terminal)

Damit die neue Konfiguration geladen wird:

```bash
docker compose up -d --build api
```

Oder alles neu:

```bash
docker compose down
docker compose up -d --build
```

Log prüfen (sollte „SMTP konfiguriert“ zeigen):

```bash
docker compose logs api | Select-String -Pattern "SMTP|E-Mail"
```

---

## 5. Test

1. In der App: **Registrierung** mit einer echten E-Mail-Adresse.
2. Postfach prüfen: Verifizierungs-Mail sollte ankommen (evtl. Spam).
3. Optional: **Passwort vergessen** testen → Reset-Mail.

Wenn keine Mail ankommt: SendGrid Dashboard → **Activity** → nach Fehlern (Bounces, Blocked) schauen; oft fehlt dann die Sender-Verifizierung oder der API-Key hat keine Send-Berechtigung.

---

## Kurz-Checkliste

- [ ] SendGrid-Account erstellt
- [ ] API-Key erstellt und kopiert
- [ ] Single Sender (oder Domain) verifiziert
- [ ] `.env`: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` gesetzt
- [ ] `docker compose up -d --build api` ausgeführt
- [ ] Registrierung / Passwort-Reset getestet

Danach ist die E-Mail für Hetzner/Go-Live vorbereitet.

---

## Fehlerbehebung: Worauf achten, damit es läuft

### 1. Richtige .env-Datei und Format

- Die **.env** muss im **gleichen Ordner** liegen wie **docker-compose.yml** (also im Ordner `tempconnect_docker`).
- **Keine Leerzeichen** um das `=`:
  - Richtig: `SMTP_USER=apikey`
  - Falsch: `SMTP_USER = apikey`
- **Keine Anführungszeichen** um den API-Key (kann Probleme machen):
  - Richtig: `SMTP_PASS=SG.abc123...`
  - Besser vermeiden: `SMTP_PASS="SG.abc123..."`
- **Nur eine Zeile pro Variable** – kein Zeilenumbruch mitten im API-Key.
- Alte Mail-Einträge (z. B. Mailpit) **auskommentieren** (`#` davor) oder löschen, damit nicht versehentlich `SMTP_HOST=mailpit` aktiv bleibt.

### 2. SendGrid: Diese Werte exakt

| Variable     | Muss sein |
|-------------|-----------|
| SMTP_HOST   | `smtp.sendgrid.net` (kein https://, nur der Hostname) |
| SMTP_PORT   | `587` |
| SMTP_USER   | **genau** `apikey` (kleingeschrieben, ein Wort) – nicht deine E-Mail, nicht dein SendGrid-Login |
| SMTP_PASS   | Dein **API-Key** (beginnt mit `SG.`, sehr lang) – aus SendGrid: Settings → API Keys → Create; Key sofort kopieren |
| SMTP_FROM   | **Genau die E-Mail**, die du bei SendGrid als Single Sender **verifiziert** hast (z. B. `dennis.stegemann1@freenet.de`) |

### 3. API-Key Berechtigung

- In SendGrid: **Settings** → **API Keys** → dein Key.
- Der Key muss **„Mail Send“** erlauben (Restricted → Mail Send → Full Access).
- Key **neu erstellen**, wenn unsicher.

### 4. Absender verifiziert?

- SendGrid → **Settings** → **Sender Authentication** → **Single Sender Verification**.
- Die Adresse, die unter **SMTP_FROM** steht, muss hier **„Verified“** sein (grüner Haken).
- Ohne Verifizierung werden Mails von SendGrid blockiert.

### 5. Container liest .env erst nach Neustart

Nach jeder Änderung an der .env:

```bash
docker compose down api
docker compose up -d api
```

Oder mit Rebuild:

```bash
docker compose up -d --build api
```

### 6. Log prüfen (ob SMTP überhaupt geladen wird)

**Wichtig:** Im Ordner `tempconnect_docker` (wo die .env liegt) ausführen:

```bash
docker compose logs api --tail 80
```

- Steht dort **„SMTP konfiguriert“** mit `smtp.sendgrid.net:587` und `auth: true` → .env wird gelesen, SendGrid ist aktiv.
- Steht dort **„SMTP nicht konfiguriert - Demo-Modus“** oder **„reason: SMTP_HOST leer“** → die API sieht die Variablen nicht (z. B. .env im falschen Ordner, Leerzeichen am Zeilenanfang, oder Container nicht neu gestartet).
- Steht dort **„E-Mail-Fehler“** mit einer Fehlermeldung → SMTP ist aktiv, aber SendGrid lehnt ab (API-Key, Absender, Berechtigung prüfen).

**Env im Container prüfen (PowerShell, im Ordner tempconnect_docker):**

```powershell
docker compose exec api node -e "console.log('SMTP_HOST=' + process.env.SMTP_HOST); console.log('SMTP_USER=' + process.env.SMTP_USER); console.log('SMTP_FROM=' + process.env.SMTP_FROM);"
```

- Wenn dort `SMTP_HOST=undefined` oder leer → .env wird vom Container nicht geladen. Dann: `docker compose down` und `docker compose up -d` **aus dem Ordner** `tempconnect_docker` ausführen.

### 7. SendGrid Activity (wenn Mails nicht ankommen)

- SendGrid Dashboard → **Activity**.
- Sieh nach, ob die Mail als **Processed** / **Delivered** oder **Dropped** / **Bounced** / **Blocked** geloggt wird.
- Bei **Dropped/Blocked**: oft fehlende Sender-Verifizierung oder ungültiger API-Key.

### Kurz-Check

1. .env im Ordner `tempconnect_docker`, Format ohne Leerzeichen um `=`.
2. `SMTP_USER=apikey` (wörtlich).
3. `SMTP_PASS=SG.xxx...` (vollständiger Key).
4. `SMTP_FROM` = verifizierte Absender-Adresse.
5. API neu starten: `docker compose up -d api`.
6. Log: „SMTP konfiguriert“ sichtbar?
7. SendGrid Activity: wird die Mail versendet / geblockt?
