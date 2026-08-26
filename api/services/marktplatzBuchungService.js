/**
 * marktplatzBuchungService — die drei Fragen vor der Buchung (Welle J2c)
 *
 * OWNER-ENTSCHEID (Plan J §0.2, 2026-08-26): Ein Unternehmen beantwortet vor
 * der Buchung drei Fragen — wie viele, von wann bis wann, zu welchem Preis
 * (mit Vorschlaegen). Dieses Modul prueft die Antworten GEGEN DAS ANGEBOT:
 *
 *   - Der Zeitraum muss im angebotenen Fenster liegen und darf nicht in der
 *     Vergangenheit beginnen. Ein Wunsch ausserhalb des Fensters ist keine
 *     Annahme mehr, sondern ein anderer Bedarf.
 *   - Der Preis muss im angebotenen Rahmen liegen (price_min..price_max).
 *     Ein Preis AUSSERHALB des Rahmens ist eine Verhandlung — dafuer gibt es
 *     `negotiate-deal`; die Oberflaeche leitet dorthin, statt still zu
 *     scheitern. Innerhalb des Rahmens ist er eine Annahme: die Agentur hat
 *     genau diesen Rahmen angeboten.
 *
 * Alle drei Antworten sind OPTIONAL — der bestehende Aufrufer
 * (capacityExchangeDetail, nur headcount) bleibt unveraendert gueltig; ohne
 * Wunsch gelten die Angebotswerte.
 *
 * REIN FUNKTIONAL, bewusst: keine Datenbank, keine Uhr — `heute` kommt vom
 * Aufrufer (todayDE, Europe/Berlin; Living-Platform-Direktive: nie roher
 * UTC-Slice). So ist jede Regel mit einem einzigen Funktionsaufruf testbar.
 */

/**
 * DATE-Werte kommen aus pg als 'YYYY-MM-DD'-Zeichenkette (db/pool.js laedt
 * den Typ-Parser). Ein eigener Pool ohne Parser liefert Date-Objekte — genau
 * daran ist die Vorlaufberechnung in P8 einmal lautlos gescheitert. Deshalb
 * nimmt dieser Helfer beides und lehnt alles andere ab.
 */
export function alsIsoDatum(wert) {
  if (wert == null || wert === "") return null;
  if (wert instanceof Date && !Number.isNaN(wert.getTime())) {
    const j = wert.getFullYear();
    const m = String(wert.getMonth() + 1).padStart(2, "0");
    const t = String(wert.getDate()).padStart(2, "0");
    return `${j}-${m}-${t}`;
  }
  const s = String(wert).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/**
 * Prueft die drei Buchungs-Antworten gegen das Angebot.
 *
 * @param {object} cap    Der gesperrte capacity_post (availability_from/to,
 *                        price_type/min/max).
 * @param {object} body   Der Request-Body: start_date?, end_date?, price_value?.
 * @param {string} heute  'YYYY-MM-DD' in Europe/Berlin (todayDE()).
 * @returns {{start_date: string|null, end_date: string|null, price_value: number|null}
 *          |{error: string, [k: string]: any}}
 */
export function pruefeBuchungsWuensche(cap, body = {}, heute) {
  const angebotVon = alsIsoDatum(cap?.availability_from);
  const angebotBis = alsIsoDatum(cap?.availability_to);

  /* ── Frage 2: von wann bis wann ─────────────────────────────────────── */
  const startRoh = body.start_date;
  const endeRoh = body.end_date;
  const start = alsIsoDatum(startRoh);
  const ende = alsIsoDatum(endeRoh);
  if ((startRoh != null && startRoh !== "" && !start) || (endeRoh != null && endeRoh !== "" && !ende)) {
    return { error: "PERIOD_INVALID" };
  }
  if (start && ende && start > ende) {
    return { error: "PERIOD_INVALID" };
  }
  if (start && heute && start < heute) {
    /* Ein Einsatz beginnt nicht gestern. `heute` in Europe/Berlin — der
     * UTC-Tag waere abends bereits der Vortag (F1-Befundklasse). */
    return { error: "PERIOD_IN_PAST", heute };
  }
  /* Der Wunsch muss im ANGEBOTENEN Fenster liegen. availability_from darf
   * unterschritten sein, wenn `heute` schon dahinter liegt (alte Angebote
   * mit Vergangenheits-Start sind "ab sofort"). */
  const fruehester = angebotVon && heute ? (angebotVon > heute ? angebotVon : heute) : (angebotVon || heute || null);
  if (start && fruehester && start < fruehester) {
    return { error: "PERIOD_OUTSIDE_OFFER", offered_from: angebotVon, offered_to: angebotBis };
  }
  if (angebotBis && ((start && start > angebotBis) || (ende && ende > angebotBis))) {
    return { error: "PERIOD_OUTSIDE_OFFER", offered_from: angebotVon, offered_to: angebotBis };
  }

  /* ── Frage 3: zu welchem Preis ──────────────────────────────────────── */
  let preis = null;
  if (body.price_value != null && body.price_value !== "") {
    preis = Number(body.price_value);
    if (!Number.isFinite(preis) || preis <= 0) {
      return { error: "PRICE_INVALID" };
    }
    preis = Math.round(preis * 100) / 100;
    const min = cap?.price_min != null ? Number(cap.price_min) : null;
    const max = cap?.price_max != null ? Number(cap.price_max) : null;
    if ((min != null && preis < min) || (max != null && preis > max)) {
      /* Ausserhalb des Rahmens = Verhandlung, keine Annahme. Die Antwort
       * nennt den Rahmen, damit die Oberflaeche zu `negotiate-deal` leiten
       * kann, statt den Nutzer raten zu lassen. */
      return { error: "PRICE_OUTSIDE_OFFER", price_min: min, price_max: max, price_type: cap?.price_type || null };
    }
  }

  return { start_date: start || null, end_date: ende || null, price_value: preis };
}
