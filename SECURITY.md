# Sicherheitslücken melden

Danke, dass Sie sich die Mühe machen. Wir nehmen Meldungen ernst und antworten.

## Wie melden

**Bitte nicht über ein öffentliches Issue.** Eine öffentlich beschriebene Lücke ist für
jeden nutzbar, bevor sie geschlossen ist.

Der Weg ist **GitHub Private Vulnerability Reporting**:
[Security → Report a vulnerability](https://github.com/Rosenbaum-yoo/tempconnect/security/advisories/new)

Das läuft direkt über GitHub — kein Konto bei uns, keine E-Mail-Adresse nötig, und der
Austausch bleibt privat, bis die Sache behoben ist.

## Was uns hilft

- Was passiert, und was stattdessen passieren sollte
- Wie man es nachstellt — Endpunkt, Rolle, Beispielaufruf
- Welche Auswirkung Sie sehen (Datenzugriff? Rechteausweitung? Nur Ärgernis?)
- Gern eine Einschätzung, wie schwer Sie es finden — wir bewerten selbst nach, aber Ihre
  Sicht hilft beim Einordnen

Ein `curl`-Aufruf sagt mehr als eine Seite Prosa.

## Was Sie erwarten dürfen

| | |
|---|---|
| Eingangsbestätigung | innerhalb von **3 Werktagen** |
| Erste Einschätzung | innerhalb von **10 Werktagen** |
| Rückmeldung zum Verlauf | bis zur Behebung, ohne dass Sie nachfragen müssen |

Wir sind ein sehr kleines Team und das Produkt steht vor dem Marktstart. Das heißt: kurze
Wege und schnelle Fixes, aber keine Rund-um-die-Uhr-Bereitschaft.

## Was wir (noch) nicht anbieten

**Kein Bug-Bounty-Programm, keine Prämien.** Wir sagen das lieber vorher, als jemanden
Arbeit investieren zu lassen und hinterher zu enttäuschen. Auf Wunsch nennen wir Sie in der
Behebungsnotiz.

## Geltungsbereich

Dieses Repository und die daraus betriebene Anwendung.

**Nicht im Geltungsbereich** — bitte direkt beim jeweiligen Anbieter melden:
Hetzner, Cloudflare, Stripe, SendGrid und andere eingebundene Dienste.

**Ausdrücklich nicht erwünscht:** Lasttests, Denial-of-Service, Social Engineering gegenüber
Mitarbeitenden oder Kunden, und jeder Zugriff auf fremde Daten, der über das Nötige zum
Nachweis hinausgeht. Wer beim Nachstellen versehentlich auf fremde Daten stößt: bitte
abbrechen, nicht speichern, und in der Meldung erwähnen.

## Bereits bekannt

Offene und behobene Punkte führen wir öffentlich in
[`docs/AUDIT_BACKLOG.md`](docs/AUDIT_BACKLOG.md) — inklusive der Fehler, die wir selbst
gefunden haben. Ein Blick dorthin erspart Ihnen womöglich doppelte Arbeit.

*Stand: 2026-07-26. Sobald die Betreibergesellschaft gegründet ist, kommt hier zusätzlich
eine Sicherheits-E-Mail-Adresse dazu.*
