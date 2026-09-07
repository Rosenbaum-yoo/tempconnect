# Welle S — Die Abhängigkeiten laufen wieder glatt

> **Status: Bauanweisung.** Erstellt 2026-09-07, Ist-Stand gemessen.
> **Gebaut von der bauenden Sitzung, gegengeprüft von der planenden** — siehe
> [`../UEBERGABE.md`](../UEBERGABE.md), Abschnitt „Wer baut, wer prüft".

---

## 1. Der Anlass

Beim Zusammenführen der Arbeitslinie in den Hauptbaum am 2026-09-07 kam der API-Container
**nicht mehr hoch**: `Cannot find package '@pdf-lib/fontkit'`. Docker hat 26-mal neu
gestartet und ist jedes Mal abgestürzt.

Die Ursache war harmlos — das Paket stand in `package.json`, war im Hauptbaum aber nie
installiert. Der Versuch, es mit einem gewöhnlichen `npm install` nachzuholen, **scheiterte
jedoch**:

```
npm error   peerOptional redis@">=5.0.0" from bullmq@5.77.3
npm error Fix the upstream dependency conflict, or retry
npm error this command with --force or --legacy-peer-deps
```

Behelfsweise wurde nur das eine fehlende Paket mit `--legacy-peer-deps --no-save`
nachinstalliert. Der Container läuft seitdem. **Der Konflikt ist damit nicht gelöst, nur
umgangen.**

> **Warum das nicht liegen bleiben darf:** ein Projekt, in dem `npm install` nicht glatt
> durchläuft, stellt jedem Neuen und jedem neuen Paket dieselbe Falle. Beim nächsten Mal
> steht wieder jemand vor einem Container, der nicht startet — und sucht die Ursache dort,
> wo sie nicht ist.

---

## 2. Der Befund — der Konflikt ist ein Symptom

| Gemessen | |
|---|---|
| `package.json` deklariert | `redis: ^4.6.13` und `bullmq: ^5.20.0` |
| Installiert | `redis 4.7.1`, `bullmq 5.77.3`, **`ioredis 5.10.1`** |
| `ioredis` ist deklariert? | **Nein** — es kommt **transitiv über `bullmq`** |
| Wer benutzt `redis` (node-redis)? | **Genau eine Datei:** `api/middleware/rateLimit.js:7` |
| Wer benutzt `ioredis`? | `bullmq` selbst, für alle Warteschlangen |

**Damit ist die Lage klar: im Baum liegen zwei Redis-Klienten nebeneinander.**

`bullmq@5.77.3` erklärt `redis >= 5.0.0` als **optionale** Peer-Abhängigkeit — sein Hinweis
lautet sinngemäß: *„wenn du node-redis benutzt, dann bitte v5"*. Es **braucht** node-redis
nicht; es arbeitet mit `ioredis`.

Der Konflikt entsteht also nur, **weil das Projekt node-redis überhaupt mitführt** — für eine
einzige Datei.

> **Das ist die eigentliche Erkenntnis.** Der Fehler ist nicht „npm ist streng", sondern
> „wir tragen zwei Klienten für dieselbe Sache". Wer nur den Fehler wegdrückt, behält beide.

---

## 3. Die drei Wege

| Weg | Was er tut | Bewertung |
|---|---|---|
| **A · `--legacy-peer-deps` als Projektregel** (`.npmrc`) | Schaltet die strenge Peer-Prüfung ab | **Schnell, aber blind.** Er schweigt dann auch bei jedem *echten* künftigen Konflikt. Eine Regel, die alle Warnungen abstellt, nimmt uns die nächste Warnung, die zählt |
| **B · `redis` auf v5 heben** | Löst den Konflikt an der Wurzel | Betrifft **eine** Datei. Aber es bleibt bei zwei Klienten |
| **C · node-redis ablösen, `ioredis` direkt deklarieren** | Ein Klient statt zwei; `redis` fällt aus `package.json` | **Empfohlen.** `ioredis` ist ohnehin im Baum, weil `bullmq` es mitbringt. Der Konflikt verschwindet, weil sein Gegenstand verschwindet |

**Empfehlung: C**, mit **A als Übergangslösung**, bis C gebaut ist — dann aber **befristet und
begründet**, nicht als stille Dauerregel.

---

## 4. Wellen und Phasen

### S1 · Messen, bevor umgestellt wird

| Phase | Inhalt | Nachweis |
|---|---|---|
| S1.1 | **Was macht `rateLimit.js` mit Redis?** Welche Aufrufe, welche Datenstrukturen, welches Verhalten ohne Redis | Eine Seite Befund. **Vor jeder Änderung** |
| S1.2 | **Läuft der Ratenbegrenzer heute überhaupt mit Redis?** Redis ist in diesem Aufbau optional (`getConnectionOpts()` kann `null` liefern) — dann greift vermutlich ein Rückfall im Arbeitsspeicher | Wenn er im Betrieb nie mit Redis läuft, ändert das die ganze Abwägung |
| S1.3 | **Gibt es weitere Redis-Nutzer**, die die Suche nicht gefunden hat? Sitzungen, Zwischenspeicher, Sperren | Vollständige Liste mit Beleg |

### S2 · Ein Klient statt zwei

| Phase | Inhalt | Nachweis |
|---|---|---|
| S2.1 | **`ioredis` als direkte Abhängigkeit deklarieren** — heute hängt es unausgesprochen an `bullmq`. Fällt `bullmq` weg, verschwindet es unbemerkt mit | Es steht in `package.json`, mit Version |
| S2.2 | **`rateLimit.js` auf `ioredis` umstellen** | Ratenbegrenzung wirkt unverändert — mit Redis **und** in ihrem Rückfall |
| S2.3 | **`redis` aus `package.json` entfernen** | Kein Vorkommen mehr im Quelltext. `npm ls redis` findet es nicht mehr als direkte Abhängigkeit |
| S2.4 | **`npm install` läuft ohne Zusatzschalter durch** | **Das ist die Abnahme dieser Welle.** Frisches `node_modules`, `npm install`, Rückgabewert 0 |

### S3 · Es bleibt glatt

| Phase | Inhalt | Nachweis |
|---|---|---|
| S3.1 | **Wächter: `npm install --dry-run` muss ohne `--legacy-peer-deps` durchlaufen** — sonst rot | Peer-Konflikt künstlich einbauen → Probe rot. **Ohne diese Rückmutation zählt S2.4 nicht** |
| S3.2 | **Wächter: keine zwei Klienten für dieselbe Sache.** Ein Register nennt je Aufgabe genau eine Bibliothek (Redis, HTTP, PDF, Datum); ein zweiter Eintrag wird rot | Entdeckend, nicht aufzählend — die nächste Doppelung fällt von selbst auf |
| S3.3 | **`@pdf-lib/fontkit` sauber nachziehen** — heute mit `--no-save` installiert, also **nicht in `package-lock.json`** | Frische Installation bringt es mit, ohne Handgriff |

### S4 · Der Hauptbaum als Betriebsumgebung

**Der zweite Teil des Anlasses, und er wiegt schwerer als der erste.**

| Phase | Inhalt | Nachweis |
|---|---|---|
| S4.1 | **Der Container bedient den Hauptbaum** — gemessen: `…/12_tempconnect_docker(D)/api → /app`. Sein `node_modules` ist **nicht** dasselbe wie das eines Worktrees | Dokumentiert, damit niemand wieder aus einem grünen Worktree auf einen laufenden Container schließt |
| S4.2 | **Nach jedem Merge in den Hauptbaum: `npm install` und Neustart** — als Ablauf, nicht als Erinnerung | Eine Anleitung, die man befolgen kann, ohne sie zu kennen |
| S4.3 | **Der Container sagt selbst, wenn er auf altem Stand läuft** — Startprotokoll mit Commit-Kennung | Ein Blick genügt, statt `ps -o etime` und Dateivergleich |

---

## 5. Reihenfolge

```
S1  Messen                 ← besonders S1.2: laeuft der Ratenbegrenzer ueberhaupt mit Redis?
 ├── S4  Hauptbaum-Ablauf  ← unabhaengig, verhindert die Wiederholung SOFORT
 ├── S2  Ein Klient
 └── S3  Es bleibt glatt
```

**Empfohlen: S1 → S4 → S2 → S3.**

> **S4 steht früh, weil es das Wiederholungsrisiko sofort senkt** — und weil es nichts am
> Code ändert. Der nächste Merge kommt bestimmt.

---

## 6. Woran gegengeprüft wird

| # | Frage |
|---|---|
| 1 | **Läuft `npm install` ohne Zusatzschalter durch?** Frisches `node_modules`, Rückgabewert 0 — das ist der Kern |
| 2 | **Wirkt die Ratenbegrenzung unverändert?** Mit Redis und ohne — beide Wege belegt |
| 3 | **Beißt der Wächter?** Peer-Konflikt künstlich einbauen → rot |
| 4 | **Ist `--legacy-peer-deps` wieder verschwunden?** Wenn es als Übergangslösung eingetragen wurde, muss es am Ende weg sein |
| 5 | **Steht `@pdf-lib/fontkit` in `package-lock.json`?** Heute nicht — es wurde mit `--no-save` installiert |

---

## 7. Was Welle S **nicht** tut

- **Redis abschaffen.** Es bleibt — nur mit einem Klienten statt zwei.
- **`bullmq` austauschen.** Es funktioniert; sein Peer-Hinweis ist ein Hinweis, kein Mangel.
- **Alle Abhängigkeiten aktualisieren.** Nur der eine Konflikt, der `npm install` blockiert.
- **`--legacy-peer-deps` als Dauerregel einführen.** Wenn als Übergang, dann befristet und
  mit Begründung — eine Regel, die alle Warnungen abstellt, nimmt uns die nächste, die zählt.
