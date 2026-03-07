# SendGrid einbinden – ganz einfach erklärt

Damit die Plattform echte E-Mails verschicken kann (z. B. zur Registrierung oder Passwort-Reset), braucht sie einen E-Mail-Dienst. **SendGrid** ist so ein Dienst: Die App schickt die Mail an SendGrid, und SendGrid liefert sie beim Empfänger ab.

---

## In 4 Schritten

### 1. SendGrid-Account (einmal pro Person/Team)

- Auf **https://sendgrid.com** gehen und kostenlos registrieren.
- Ein Account reicht für beide – oder jeder macht seinen eigenen (später könnt ihr euch für eine „Plattform“ entscheiden).

---

### 2. „Absender“ freischalten (Single Sender)

SendGrid will wissen: **Von wem** darf die App Mails verschicken? Dafür muss **genau diese E-Mail-Adresse** bestätigt werden.

- In SendGrid: **Settings** (Zahnrad) → **Sender Authentication** → **Single Sender Verification**.
- **Create New Sender** (oder ähnlich).
- Alles ausfüllen:
  - **From Name:** z. B. dein Name oder „TempConnect“.
  - **From Email:** die Adresse, die später als Absender steht (z. B. `deine-email@freenet.de`).
  - **Reply To:** dieselbe Adresse oder eine andere, an die Antworten gehen sollen.
  - **Company Address, City, State, Country, Zip** – deine echte Adresse (Pflicht).
- Speichern.
- **Wichtig:** An diese E-Mail-Adresse schickt SendGrid eine Bestätigungs-Mail. **Link in der Mail klicken** – erst dann ist der Absender „verified“ und Versand funktioniert.

---

### 3. API-Key holen

Damit die App bei SendGrid „anmelden“ darf, braucht sie einen Schlüssel (API-Key).

- In SendGrid: **Settings** → **API Keys** → **Create API Key**.
- Name z. B. „TempConnect“.
- Berechtigung: **Restricted** → **Mail Send** → **Full Access** (oder nur Send).
- **Create & View** klicken.
- Den langen Key **sofort kopieren** (wird nur einmal angezeigt). Er beginnt mit `SG.` und ist sehr lang.

---

### 4. In der App eintragen (.env)

Die App liest die SendGrid-Daten aus der Datei **.env** im Projektordner (`tempconnect_docker`).

**.env öffnen** und diese Zeilen eintragen (oder anpassen, wenn schon was steht):

```
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=<Deinen_SendGrid_API_Key_nur_in_der_env_datei_eintragen_niemals_committen>
SMTP_FROM=deine-email@freenet.de
```

- **SMTP_USER** muss **genau** `apikey` sein (ein Wort, klein).
- **SMTP_PASS** = der kopierte API-Key (der mit `SG.` am Anfang).
- **SMTP_FROM** = **genau die E-Mail**, die du in Schritt 2 als Single Sender angelegt und per Link bestätigt hast.

**Wichtig:**

- Keine Leerzeichen am Zeilenanfang (Zeile beginnt mit `SMTP_HOST=`, nicht ` SMTP_HOST=`).
- Kein Leerzeichen um das `=` (richtig: `SMTP_USER=apikey`, falsch: `SMTP_USER = apikey`).
- Alte E-Mail-Zeilen (z. B. für Mailpit) mit `#` auskommentieren oder löschen, damit nur die SendGrid-Zeilen aktiv sind.

---

## App neu starten

Nach Änderung der .env die API neu starten, damit sie die neuen Werte lädt:

```bash
docker compose down
docker compose up -d
```

(Oder nur API: `docker compose up -d api`.)

---

## Test

- In der App: **Registrierung** mit einer E-Mail, die du abrufen kannst (oder **Passwort vergessen**).
- Mail sollte ankommen (Postfach und Spam prüfen).
- In SendGrid unter **Activity** siehst du, ob die Mail bei SendGrid angekommen und versendet wurde.

---

## Wenn zwei Leute „rumspielen“ (zwei Laptops)

- **Gleicher Absender:** Beide haben die **gleiche .env** (gleicher API-Key, gleiches `SMTP_FROM`). Dann gehen alle Mails von derselben Adresse – egal von welchem Laptop die App gestartet wird.
- **Eigener Absender pro Person:** Jede Person legt in **demselben** SendGrid-Account einen **eigenen** Single Sender an (ihre eigene E-Mail) und klickt den Bestätigungslink. Auf **ihrem** Laptop steht in der .env dann **ihre** E-Mail bei `SMTP_FROM`, auf deinem Laptop deine. API-Key kann gleich bleiben (ein Account für beide).

---

## Kurz-Checkliste für deine Partnerin

1. SendGrid-Account anlegen (oder deinen nutzen).
2. Single Sender mit **ihrer** E-Mail anlegen und **Bestätigungslink klicken**.
3. API-Key erstellen und kopieren.
4. Im Projektordner in der **.env** die 5 Zeilen (SMTP_HOST … SMTP_FROM) eintragen, **SMTP_FROM** = ihre verifizierte E-Mail.
5. `docker compose down` und `docker compose up -d`.
6. Registrierung oder Passwort vergessen testen.

Fertig.
