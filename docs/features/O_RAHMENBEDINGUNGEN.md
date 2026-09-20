# Welle O — Rahmenbedingungen und Passung

> **Status: Bauanweisung, freigegeben 2026-09-05.** Ist-Stand gemessen.
> Owner-Vorgabe: Bedingungen beider Seiten bei der Registrierung erheben, harte müssen
> übereinstimmen — und **die beste Trefferquote steht oben, damit der Marktplatz voll bleibt.**

---

## 1. Die Owner-Vorgabe im Wortlaut

> „sollte man auch bedingungen die man im rahmenvertrag von unternehmen und zeitarbeitsfirmen
> bei der registration von beiden abfragen, welche bedingungen sie haben — dann muss es ein
> match geben, und nur diese firma die gematcht hat darf dieser firma personal zur verfügung
> stellen."
>
> Und nach Rückfrage: *„dann sagen wir, die Wahrscheinlichkeit ist bei der als erstes
> gezeigten Firma oder Mitarbeiter am höchsten — Übereinstimmung, sodass der Marktplatz voll
> bleibt. Einfach die beste Trefferquote absteigend modellieren."*

**Die zweite Hälfte ist die wichtigere.** Sie löst das Problem, an dem zweiseitige
Marktplätze sterben: wenn alle Bedingungen übereinstimmen *müssen*, sieht am Ende niemand
mehr etwas — jeder Filter für sich vernünftig, zusammen ersticken sie die Liquidität.

---

## 2. Der Befund: das Meiste ist modelliert, es prüft nur niemand

| Baustein | Stand |
|---|---|
| `contracts` mit `contract_type = 'framework'`, `buyer_org_id` + `supplier_org_id`, Laufzeit, Status, Kündigung mit Grund | ✅ **modelliert** (Mig 020) |
| `rate_cards` hängen am Vertrag (`rc.contract_id`) — der Konditionsrahmen ist bereits vertragsgebunden | ✅ |
| `org_settings.preferred_supplier_only` + Hilfsfunktion `preferredSuppliersOnly()` | ⊘ **toter Schalter** — die Funktion hat **keinen Aufrufer** |
| **Prüft der Buchungsweg einen Vertrag?** | ❌ **Null Treffer** auf `contracts` in `marketplaceService`, `capacityExchangeService` und `dealAgreementService` |

> **Heute kann jeder bei jedem buchen.** Kein Rahmenvertrag nötig, keine
> Lieferantenbeschränkung wirksam. Die Owner-Idee ist damit überwiegend **Verdrahtung plus
> ein Bedingungsmodell** — kein Neubau.

Was fehlt, ist ausschließlich: **strukturierte** Bedingungen. `contracts.terms_summary` ist
ein Textfeld — Prosa lässt sich nicht abgleichen.

---

## 3. Das Modell: hart gattet, weich sortiert

| Klasse | Wirkung | Inhalt |
|---|---|---|
| **Hart** | **Ausschluss.** Ohne Übereinstimmung darf nicht geliefert werden | Gültige **Verleiherlaubnis** · **Haftpflichtdeckung** ≥ geforderte Summe · **Tarif-/Mindestlohnbindung** · **Auftragsverarbeitungsvertrag** |
| **Weich** | **Rang.** Abweichung ist ein Verhandlungspunkt, kein Ausschluss | Zahlungsziel · Kündigungsfrist · Stundensatzrahmen · Schichtmodelle · Reaktionszeit · Ersatzgestellung · Mindestabnahme |

**Owner-Entscheid 2026-09-05: genau diese vier sind hart.** Alles andere ist weich.
Der Grund für die Trennlinie: bei den vier tut ein Verstoß **rechtlich oder
versicherungstechnisch** weh — bei allem anderen kostet er nur Geld oder Nerven, und darüber
darf man verhandeln.

### Die Trefferquote

Je Paar (Unternehmen, Zeitarbeitsfirma) ein Wert, **absteigend sortiert**. Nichts
verschwindet außer dem, was hart ausgeschlossen ist.

**Zwei Eigenschaften sind nicht verhandelbar:**

**Sie muss erklärbar sein.** „92 %" ohne Begründung ist eine Blackbox, und eine Blackbox
wird nicht geglaubt — schon gar nicht, wenn Geld daran hängt. Also immer mit dem Grund:
> „Passt zu 7 von 9 Bedingungen · abweichend: Zahlungsziel 45 statt 30 Tage, Reaktionszeit 8 h statt 4 h"

**Sie muss stabil sein.** Dieselbe Paarung ergibt heute und morgen denselben Wert, solange
sich keine Bedingung geändert hat. Ein Rang, der ohne erkennbaren Grund springt, zerstört
das Vertrauen schneller als ein schlechter Rang.

---

## 4. Die Kollision, die diese Welle sonst wertlos macht

**Bezahlte Sichtbarkeit fließt heute bereits in die Sortierung.** Gemessen:

| Fundstelle | Was sie tut |
|---|---|
| `capacity_posts.placement_boost_level` (0–3), gelesen in `capacityExchangeService.js:1022` | hebt Einträge im Feed |
| `profileRankingService`: `premium_boost` → `effective_rank_score`, absteigend sortiert | bezahlte Hebung im Rang-Wert |
| `profile_bounties` (Staff CC, „Marketplace Visibility") | bezahlte Marktplatz-Sichtbarkeit je Kunde |

> **Wer „die beste Trefferquote steht oben" verspricht und heimlich Bezahlung mitsortiert,
> verspricht etwas Unwahres.** Das Unternehmen kann nicht unterscheiden, ob der erste
> Treffer am besten passt oder am meisten gezahlt hat — und genau darauf soll es sich
> verlassen. Einmal bemerkt, ist das Vertrauen weg, und mit ihm der Vorteil, den diese Welle
> überhaupt bringt.

**Die Regel (O-L1):**

1. **Sortiert wird nach Passung.** Punkt.
2. **Bezahlte Hebung bricht höchstens Gleichstand** — sie verschiebt nie eine schlechtere
   Passung über eine bessere.
3. **Was gehoben ist, ist als solches gekennzeichnet.** Sichtbar, nicht im Kleingedruckten.

Das ist keine Einschränkung des Geschäftsmodells, sondern seine Bedingung: eine
Trefferquote, der man glaubt, ist mehr wert als eine Platzierung, die man kaufen kann.

---

## 5. Ein Match ist kein Vertrag — er erzeugt einen

Zwei Häkchen erzeugen keinen Rahmenvertrag. Sie erzeugen einen **vorabgestimmten
Bedingungssatz**, aus dem der Vertrag entsteht — und die Tabelle dafür existiert:

```
Bedingungen erhoben (beide Seiten)
   → harte Prüfung
   → contracts-Zeile, contract_type = 'framework', status = 'draft'
   → beide bestätigen
   → status = 'active'
   → ab hier darf geliefert werden
```

**Und damit trägt es den Sammelabschluss aus Welle M5.** Wer vorab gematcht ist, braucht
beim Buchen von 30 Leuten über 20 Firmen keine 20 Verhandlungen — die Bedingungen stehen
schon. **Das ist die eigentliche Auflösung der ursprünglichen Owner-Frage** („ohne mit 10
Kunden Verträge abschließen zu müssen").

---

## 6. Wellen und Phasen

### O1 · Die Bedingungen bekommen eine Form

| Phase | Inhalt | Nachweis |
|---|---|---|
| O1.1 | **Bedingungen strukturiert** statt als Prosa in `terms_summary`. Je Bedingung: Schlüssel, Klasse (hart/weich), Wert, Gültigkeit | Zwei Orgs, ein Abgleich, ein nachvollziehbares Ergebnis |
| O1.2 | **Als Register, nicht als festes Formular** — dieselbe Mechanik wie der Nachtrag aus M4b.5. Eine neue Bedingung ist ein Registereintrag, kein Umbau | Neue Bedingung ergänzen, ohne Code zu ändern |
| O1.3 | **Nur die vier harten bei der Registrierung.** Alles andere im Nachtrag | Die Anmeldung wird nicht länger |
| O1.4 | **Die Verleiherlaubnis ist keine Selbstauskunft** — sie hängt an `compliance_documents` (`doc_type = 'aueg_erlaubnis'`, mit Prüf- und Ablaufzustand), das heute **niemand liest** (M9.1) | Abgelaufene Erlaubnis → Firma fällt aus der harten Prüfung. **Rückmutation** |

### O2 · Die harte Prüfung

| Phase | Inhalt | Nachweis |
|---|---|---|
| O2.1 | **Ohne harte Übereinstimmung keine Lieferung** — geprüft im Buchungsweg, nicht nur in der Anzeige | Buchung ohne Match → 403 mit lesbarem Grund. **Rückmutation je harter Bedingung** |
| O2.2 | **Der Grund ist lesbar und nennt die Bedingung** — nicht „nicht möglich" | „Haftpflichtdeckung 1 Mio. gefordert, nachgewiesen 500 Tsd." |
| O2.3 | **Und er sagt, wer ihn beheben kann** | Die Firma sieht, was ihr fehlt; das Unternehmen sieht nur, dass es nicht passt |

### O3 · Die Trefferquote

| Phase | Inhalt | Nachweis |
|---|---|---|
| O3.1 | **Wert je Paarung, absteigend sortiert** | Beste Passung steht oben — an echten Zeilen belegt |
| O3.2 | **Immer mit Begründung**: wie viele Bedingungen passen, welche nicht | Keine nackte Zahl |
| O3.3 | **Stabil**: gleiche Eingaben, gleicher Wert | Zweimal abrufen → identisch |
| O3.4 | **O-L1 erzwungen**: bezahlte Hebung bricht nur Gleichstand und ist gekennzeichnet | ✅ **2026-09-19 im Marktplatz-Feed und in der Profil-Rangliste** (Welle N3.5). Die Rangzahl ist geteilt: `rank_score` verdient (Marktseite, Reputation, Passung, Dringlichkeit, Aktualität), `rank_boost_paid` bezahlt (Tarif, Platzierung, Hervorhebung). Sortiert wird verdient → bezahlt → Kennung. Auf der Karte trägt die Hebung ein eigenes Kennzeichen mit Erklärung und fällt nicht mehr unter die Kürzung auf drei Gründe. **Rückmutationen rot:** Hebung zurück in die verdiente Summe, Gleichstands-Schritt entfernt, Kennzeichnung entfernt, Kennzeichnung doppelt, Positionen wieder nach `effective_rank_score`. **Offen bleibt die Paarungs-Trefferquote aus O3.1/O3.2** — sie existiert noch nicht, O-L1 gilt dort ab Bau |

### O4 · Der Rahmenvertrag entsteht

| Phase | Inhalt | Nachweis |
|---|---|---|
| O4.1 | **Der Match erzeugt den Entwurf** (`contracts`, `framework`, `draft`) | Eine Zeile je Paarung, keine zwei |
| O4.2 | **Beide bestätigen, dann aktiv** — mit Protokoll, wer wann | Audit je Bestätigung |
| O4.3 | **Der Konditionsrahmen hängt daran** — `rate_cards.contract_id` existiert bereits | Preise kommen aus dem Vertrag, nicht aus der Luft |
| O4.4 | **Ablauf und Kündigung wirken**: abgelaufen heißt nicht lieferbar | Vertrag auf `expired` → Buchung abgewiesen |

### O5 · Der bevorzugte Lieferant wird endlich wirksam

| Phase | Inhalt | Nachweis |
|---|---|---|
| O5.1 | **`preferred_supplier_only` bekommt einen Aufrufer** — heute ein toter Schalter | Schalter an → nur Vertragspartner erscheinen |
| O5.2 | **Und er sagt es**, statt die Liste stillschweigend zu leeren | „Nur bevorzugte Lieferanten — 3 von 41 Angeboten sichtbar" |

### O6 · Härtung

| Phase | Inhalt | Nachweis |
|---|---|---|
| O6.1 | **Wächter: kein Buchungsweg ohne Vertragsprüfung** — entdeckend, nicht aufzählend | Neuer Buchungsweg ohne Prüfung → rot |
| O6.2 | **Mutationsprüfung auf der harten Prüfung und der Sortierung**, Schwelle 90 % | Null Überlebende im Entscheidungs-Branch |
| O6.3 | **Mandantengrenze**: niemand sieht die Bedingungen einer fremden Org | Fremde Org → 403 |

---

## 7. Reihenfolge

```
O1  Bedingungen bekommen eine Form   ← ohne Struktur kein Abgleich
 ├── O2  Die harte Pruefung          ← das eigentliche Tor
 ├── O3  Die Trefferquote            ← haelt den Marktplatz voll
 ├── O4  Der Rahmenvertrag entsteht  ← traegt den Sammelabschluss aus M5
 ├── O5  Bevorzugter Lieferant       ← klein, ein toter Schalter wird lebendig
 └── O6  Haertung                    ← begleitend
```

**Empfohlen: O1 → O2 → O3 → O4 → O5, O6 begleitend.**

---

## 8. Ein rechtlicher Punkt, der benannt gehört

**Bilaterale Konditionen zwischen zwei Firmen sind normal.** Eine Plattform, die einen
**Mindeststundensatz für alle** durchsetzt, bewegt sich dagegen in Richtung Preisabstimmung.

Das ist leicht versehentlich gebaut — „Mindestsatz" als Plattformeinstellung klingt harmlos
und wäre es nicht. **Bevor so etwas entsteht, gehört es anwaltlich geklärt.** Kein Blocker
für diese Welle: solange jede Bedingung zwischen genau zwei Parteien gilt und die Plattform
keine Untergrenze vorgibt, stellt sich die Frage nicht.

---

## 9. Woran gegengeprüft wird

| # | Frage |
|---|---|
| 1 | **Bleibt der Marktplatz voll?** Eine abweichende weiche Bedingung darf **nichts** verschwinden lassen — nur den Rang ändern |
| 2 | **Beißt die harte Prüfung?** Je Bedingung eine Rückmutation im **Buchungsweg**, nicht in der Anzeige |
| 3 | **Ist die Sortierung ehrlich?** Bezahlte Hebung über eine bessere Passung → Probe rot (O-L1) |
| 4 | **Ist die Quote erklärbar?** Jede Zahl nennt die Bedingungen, die nicht passen |
| 5 | **Zählt „fertig" als fertig?** Jeder Endpunkt hat einen Aufrufer, jede Seite einen Klickpfad |
| 6 | **Ist etwas doppelt gebaut?** `contracts`, `rate_cards`, `preferredSuppliersOnly`, `compliance_documents` existieren |

---

## 10. Was Welle O **nicht** tut

- **Den Rahmenvertrag ersetzen.** Der Match erzeugt ihn, er tritt nicht an seine Stelle.
- **Eine zweite Vertragstabelle bauen.** `contracts` trägt `framework` bereits.
- **Weiche Bedingungen zu Ausschlüssen machen.** Sie sortieren, sie sperren nie.
- **Bezahlte Sichtbarkeit abschaffen.** Sie bleibt — sichtbar gekennzeichnet und ohne die
  Passung zu überschreiben (O-L1).
- **Einen plattformweiten Mindestsatz einführen.** Siehe Abschnitt 8.
