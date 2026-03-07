# TempConnect – AGB-Anlage: Service-Level-Agreement (SLA)

Stand: 03.03.2026

Diese Anlage ergänzt die Allgemeinen Geschäftsbedingungen (AGB) der TempConnect-Plattform und regelt die Service-Level-Vereinbarung für Kunden mit einem kostenpflichtigen Tarif (PLUS oder NOTDIENST).

---

## § 1 Geltungsbereich

1. Diese TempConnect Pulse SLA-Anlage gilt ausschließlich für Kunden, die einen der folgenden Tarife gebucht haben:
   - **PLUS** (SLA-Level: PRO)
   - **NOTDIENST** (SLA-Level: EMERGENCY)

2. Kunden der Tarife FREE und BASIS erhalten keinen Pulse-Schutz. Die Plattform wird für diese Tarife nach bestem Ermessen betrieben (Best-Effort).

3. Die detaillierten Leistungsmerkmale je SLA-Level sind in der **TempConnect Pulse - Leistungsbeschreibung** (Dokument: `SLA_LEISTUNGSBESCHREIBUNG.md`) definiert, die Bestandteil dieser Anlage ist.

---

## § 2 Leistungsumfang

1. TempConnect betreibt eine digitale Plattform zur Vermittlung von Zeitarbeitskapazitäten zwischen Unternehmen (Auftraggeber) und Zeitarbeitsfirmen (Agenturen).

2. Die SLA-Zusagen beziehen sich auf:
   - **Matchingversuch:** Automatische Suche und Benachrichtigung passender Agenturen innerhalb der vereinbarten Frist (PRO: 120 Minuten, EMERGENCY: 30 Minuten).
   - **Plattformverfügbarkeit:** Erreichbarkeit der Plattform gemäß den in der Leistungsbeschreibung definierten Schwellenwerten (PRO: 99,0%, EMERGENCY: 99,5%).

3. **Kein Vermittlungserfolg geschuldet.** Die SLA-Fristen beziehen sich ausschließlich auf den technischen Matchingversuch. TempConnect schuldet weder das Zustandekommen eines Vertrags noch die tatsächliche Bereitstellung von Personal.

---

## § 3 Haftungsbeschränkung

1. Die Haftung von TempConnect für SLA-Verstöße ist auf die in § 5 geregelten Service-Gutschriften beschränkt.

2. TempConnect haftet nicht für:
   - Schäden, die aus dem Nichtzustandekommen einer Vermittlung entstehen
   - Entgangenen Gewinn oder mittelbare Schäden aufgrund verspäteter Matchingversuche
   - Qualitätsmängel des vermittelten Personals (Verantwortung der jeweiligen Agentur)
   - Ausfälle durch höhere Gewalt gemäß § 4

3. Die Gesamthaftung von TempConnect je Schadensereignis ist auf den Betrag der monatlichen Tarifgebühr des betroffenen Kunden beschränkt.

4. Die vorstehenden Haftungsbeschränkungen gelten nicht bei Vorsatz, grober Fahrlässigkeit oder Verletzung wesentlicher Vertragspflichten (Kardinalpflichten). Bei Verletzung von Kardinalpflichten ist die Haftung auf den vertragstypisch vorhersehbaren Schaden begrenzt.

---

## § 4 Ausschlüsse und höhere Gewalt

1. Die SLA-Zusagen gelten nicht in folgenden Fällen:
   - Geplante Wartungsfenster (Di/Do 02:00–06:00 MEZ, mindestens 48h vorher angekündigt)
   - Höhere Gewalt: Naturkatastrophen, Pandemien, behördliche Anordnungen, Krieg, Terrorismus
   - Ausfall von Drittanbietern (Cloud-Infrastruktur, DNS, E-Mail-Provider)
   - DDoS-Angriffe oder sonstige Cyberangriffe
   - Falsche oder unvollständige Angaben des Kunden
   - Überschreitung der tariflichen Kontingente

2. Bei höherer Gewalt ruhen die SLA-Pflichten für die Dauer des Ereignisses. TempConnect informiert den Kunden unverzüglich über den Eintritt und die voraussichtliche Dauer.

---

## § 5 Service-Gutschriften

1. Bei einem nachgewiesenen SLA-Verstoß kann der Kunde eine Service-Gutschrift verlangen. Die Gutschrift wird mit der nächsten Monatsrechnung verrechnet.

2. **Höhe der Gutschriften:**
   - PRO (Tarif PLUS): 10% der Monatsgebühr je Verstoß, max. 1×/Monat, max. 49,90€
   - EMERGENCY (Tarif NOTDIENST): 20% der Monatsgebühr je Verstoß, max. 2×/Monat, max. 199,80€
   - Verfügbarkeits-Gutschrift: PRO 10% bei < 99,0%, EMERGENCY 15% bei < 99,5%

3. Gutschriften sind **nicht kumulierbar**. Die maximale Gesamtgutschrift pro Monat beträgt 100% der jeweiligen Monatsgebühr.

4. **Ausschließlicher Rechtsbehelf.** Die Service-Gutschriften sind der ausschließliche und abschließende Rechtsbehelf des Kunden bei SLA-Verstößen, soweit gesetzlich zulässig. Weitergehende Schadensersatzansprüche bleiben im Rahmen von § 3 unberührt.

5. **Kein Barauszahlungsanspruch.** Gutschriften können nicht in bar ausgezahlt werden und verfallen bei Vertragsbeendigung.

---

## § 6 Meldepflicht und Verfahren

1. Der Kunde muss einen SLA-Verstoß **innerhalb von 14 Kalendertagen** nach dem Vorfall schriftlich (E-Mail an support@tempconnect.de) melden.

2. Die Meldung muss enthalten:
   - Anfrage-ID
   - Zeitstempel des Vorfalls
   - Erwartete vs. tatsächliche Reaktionszeit

3. TempConnect prüft den Vorfall anhand der automatischen SLA-Protokollierung (`sla_events`) und teilt das Ergebnis innerhalb von 10 Werktagen mit.

4. Verspätete Meldungen (nach Ablauf der 14-Tage-Frist) begründen keinen Gutschriftanspruch.

---

## § 7 Laufzeit und Kündigung

1. Die TempConnect Pulse SLA-Anlage gilt für die Dauer des jeweiligen Tarifvertrags.

2. Bei Downgrade auf einen Tarif ohne SLA (FREE oder BASIS) endet der Pulse-Schutz zum Ende des aktuellen Abrechnungszeitraums.

3. TempConnect kann die SLA-Bedingungen mit einer Ankündigungsfrist von 30 Tagen ändern. Wesentliche Verschlechterungen berechtigen den Kunden zur außerordentlichen Kündigung zum Änderungszeitpunkt.

---

## § 8 Schlussbestimmungen

1. Im Falle von Widersprüchen zwischen dieser Anlage und den AGB gehen die Regelungen dieser Anlage vor, soweit sie den Pulse-Schutz betreffen.

2. Sollten einzelne Bestimmungen dieser Anlage unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt. Die unwirksame Bestimmung wird durch eine wirksame Regelung ersetzt, die dem wirtschaftlichen Zweck am nächsten kommt.

3. Es gilt deutsches Recht. Gerichtsstand ist der Sitz von TempConnect, soweit gesetzlich zulässig.
