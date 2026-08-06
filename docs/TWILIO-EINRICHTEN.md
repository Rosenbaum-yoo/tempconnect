# Twilio einrichten — zweiter Einladungskanal (SMS, später WhatsApp)

> **Warum überhaupt:** Die Einladung ins Einsatzportal ging bis 2026-08-06 nur per
> E-Mail. Genau die Zielgruppe, die den Marktplatz füllt — gewerbliche Einsatzkräfte —
> liest aber zuverlässiger eine SMS als ein Postfach, das sie alle paar Wochen öffnet.
> Jede nicht angenommene Einladung ist ein Arbeiter, der nie im Katalog steht, und damit
> ein Angebot, das der Plattform fehlt.
>
> **Stand:** Die Entscheidungsschicht und der Versandweg sind gebaut und getestet
> (`smsProviderService`, `smsService`, Mig 161). Es fehlt **nur** der Netzaufruf zu
> Twilio — bewusst, weil ungetesteter Code gegen einen ungewählten Anbieter ein
> Kostenrisiko wäre. Ohne Konfiguration läuft alles im Modus `console`: Die Nachricht
> wird protokolliert, **nichts geht nach draußen**.

---

## 1. Twilio-Account & Zugangsdaten

1. **Account:** <https://www.twilio.com/try-twilio> → Registrieren. Die Testphase enthält
   Guthaben; SMS nach Deutschland kosten danach grob 7–9 ct pro Nachricht.
2. **Console öffnen:** Auf der Startseite stehen unter *Account Info*:
   - **Account SID** (beginnt mit `AC…`)
   - **Auth Token** (verdeckt, per Klick sichtbar)
3. **Absendernummer:** *Phone Numbers* → *Buy a number* → Land **Deutschland**,
   Fähigkeit **SMS**. Kosten ca. 1–2 € im Monat.

> **Alphanumerischer Absender statt Nummer.** In Deutschland darf als Absender auch ein
> Name stehen (z. B. `TempConnect`), das wirkt seriöser als eine fremde Handynummer und
> spart die monatliche Nummerngebühr. Nachteil: Der Empfänger kann **nicht antworten**.
> Für eine Einladung mit Link ist das genau richtig. Einzurichten unter
> *Messaging → Senders → Alphanumeric Sender ID*.

---

## 2. Konfiguration setzen

In die Produktions-Umgebung (nicht ins Repo):

```bash
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=AC................................
TWILIO_AUTH_TOKEN=................................
SMS_SENDER=TempConnect          # oder die gekaufte Nummer im Format +49...
```

**Alle vier Werte sind nötig.** Fehlt einer oder steht ein Platzhalter drin, bleibt der
Versand aus — und die Plattform **warnt** darüber, statt still zu schweigen. Genau das
ist die teuerste Fehlkonfiguration: Sie sieht richtig aus und liefert nichts.

Prüfen lässt sich das ohne Versand:

```bash
cd api && node -e "import('./services/smsProviderService.js').then(m=>console.log(m.describeSms(process.env)))"
```

Erwartet: `provider: 'twilio'`, `capabilities.outbound_delivery: true`, `warnings: []`.

---

## 3. Was noch im Code fehlt (ca. 20 Zeilen)

In `api/services/smsService.js` gibt es genau **eine** vorbereitete Stelle — dort steht
heute der Hinweis *„SMS-Anbieter konfiguriert, aber kein Versand-Adapter hinterlegt"* und
es wird `reason: "NO_ADAPTER"` zurückgegeben. Dort kommt der Aufruf hin:

```js
// POST https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json
// Body (form-urlencoded): To, From, Body
// Auth: HTTP Basic aus SID:AUTH_TOKEN
// -> { sent: true, provider, reason: null } bei 2xx
```

Kein SDK nötig — `fetch` reicht, das spart eine Abhängigkeit. **Wichtig beim Einbau:**

- Die Funktion darf **weiterhin nicht werfen**. Eine Einladung darf nicht scheitern, weil
  der Zweitweg ausfällt; die E-Mail ist der verlässliche Kanal, die SMS die Zugabe.
  `api/test/smsInviteDelivery.test.js` prüft genau das über alle Kombinationen.
- Die Nummer gehört **nicht in Klartext ins Log** (Regel S-2). Dafür gibt es `maskiert()`.
- Nach erfolgreichem Versand setzt die Einladungs-Route `sms_sent_at` — daran hängt die
  Unterscheidung „nicht versucht" gegen „fehlgeschlagen".

---

## 4. WhatsApp (später)

Twilio ist im Code der einzige Anbieter, der `capabilities.whatsapp: true` meldet — das
ist kein Zufall, sondern der Grund für die Empfehlung. Der Weg dahin:

1. *Messaging → Try it out → Send a WhatsApp message* (Sandbox, sofort nutzbar zum Testen).
2. Für den Produktivbetrieb: **WhatsApp Business Account** über Twilio beantragen,
   Vorlagen („Templates") vorab genehmigen lassen. Eine Einladung mit Link ist ein
   klassischer Vorlagenfall.
3. Im Code ändert sich dann nur das `To`-Feld (`whatsapp:+49…`) und der Absender.

**Realistisch:** Die Vorlagen-Genehmigung dauert Tage bis Wochen. Deshalb zuerst SMS
scharf schalten, WhatsApp danach — die Entscheidungsschicht unterstützt beides bereits.

---

## 5. Kosten im Blick behalten

Der Versand hängt an der Einladung, nicht an einem Automatismus — es gibt also keinen Weg,
auf dem die Plattform von allein viele SMS erzeugt. Trotzdem gilt:

- **„Alle einladen"** verschickt so viele SMS wie einzuladende Kräfte. Bei 200 Mitarbeitern
  sind das einmalig rund 15 €.
- Ohne Mobilnummer am Datensatz passiert nichts (`reason: NO_PHONE`) — CSV-Importe ohne
  Telefonspalte kosten also nichts.
- Zum Abschalten ohne Deploy: `SMS_PROVIDER=disabled`.

---

## Verwandte Dokumente

- `docs/SENDGRID-EINRICHTEN.md` — derselbe Aufbau für den E-Mail-Weg
- `docs/features/URSPRUNGSPROMPT_AUDIT.md` — Punkt A2b, Herleitung der Entscheidung
