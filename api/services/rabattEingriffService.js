/**
 * Der Eingriff in die Rabatt-Automatik — Welle K1.4 / K1.5, Plan-Abschnitt 3a.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM KEIN VIER-AUGEN-PRINZIP
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Es gibt keine zweite Staff-Rolle. Der Owner IST das Staff. Ein Weg, der eine
 * Gegenzeichnung verlangt, waere nicht streng, sondern DAUERHAFT BLOCKIERT —
 * es gibt niemanden, der bestaetigen koennte (`CLAUDE.md`, "Das Team ist eine
 * Person").
 *
 * Und das Bedrohungsmodell aendert sich damit ehrlich: wenn eine Person allein
 * handelt, ist "Machtmissbrauch durch Staff" gleichbedeutend mit "der Owner
 * missbraucht seine eigene Plattform". Das ist kein realistisches Risiko — er
 * kann ohnehin den Katalog aendern oder direkt in die Datenbank schreiben.
 *
 * DAS REALE RISIKO IST DAS VERSEHEN, NICHT DER VORSATZ. Deshalb ist der Schutz
 * strukturell:
 *
 *   1. KEIN FREIES BETRAGSFELD. Man waehlt einen Katalogeintrag ("dieses Bounty
 *      haette zaehlen muessen"), nicht eine Zahl. Der Satz kommt aus dem Katalog.
 *
 *   2. DIE SCHWELLE WIRD GEPRUEFT. Gegen die echten Daten, mit derselben
 *      Funktion, die auch automatisch vergibt. Ist sie nicht erfuellt, entsteht
 *      kein Eingriff — mit Angabe, welche Bedingung fehlt.
 *
 *   3. DIE DECKELUNG GILT WEITER. Der Zuschlag ist die DIFFERENZ zwischen dem,
 *      was mit dem Bounty herauskaeme, und dem, was heute gilt — beide unter der
 *      Stufen-Obergrenze gerechnet. Wer schon am Deckel ist, bekommt 0, und ein
 *      wirkungsloser Eingriff wird abgelehnt statt still angelegt.
 *
 *   4. WIRKUNGSVORSCHAU IN EURO. Bestaetigt wird die ZAHL ("diese Rechnung wird
 *      um 143,50 EUR niedriger"), nicht eine abstrakte Handlung. Weicht die
 *      Wirklichkeit beim Anlegen davon ab, wird abgelehnt statt gerechnet — ein
 *      Mensch uebersieht eine Handlung, aber selten einen falschen Betrag.
 *
 *   5. VERFALL NACH GENAU EINEM ABRECHNUNGSLAUF. Danach entscheidet wieder die
 *      Automatik. Ein Teilindex laesst je Kunde nur EINEN offenen Eingriff zu.
 *
 *   6. NIE IN EIGENER SACHE. Als Datenbankregel, nicht nur als Pruefung im Code.
 *      Kostet heute nichts und greift ab der zweiten Person automatisch.
 *
 *   7. DIE QUELLE STEHT AUF DER RECHNUNG (`discount_source = 'bounty_eingriff'`).
 *      Das ist das Audit, das den Kunden und die Buchhaltung erreicht.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SCHICHTUNG
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Dieser Dienst importiert NICHT `recurringBillingService` — der Abrechnungslauf
 * importiert ihn. Der Nettobetrag der naechsten Rechnung kommt deshalb als
 * Parameter herein, statt hier aufgeloest zu werden. Ohne diese Richtung gaebe es
 * einen Modul-Kreis zwischen Abrechnung und Eingriff.
 */

import { berechneRabatt } from "./invoiceService.js";
import { getUserDiscount, pruefeBountyBedingung } from "./bountyService.js";
import { getUserMaxDiscountMitBefund } from "./bountyTierService.js";

/** Die Quelle, die ein Eingriff auf der Rechnung hinterlaesst. */
export const EINGRIFF_QUELLE = "bounty_eingriff";

/** Mindestlaenge der Begruendung — dieselbe Schwelle wie bei Staff-Entscheidungen. */
export const GRUND_MIN_LAENGE = 10;

/**
 * Rechnet aus, was ein Bounty diesem Kunden zusaetzlich braechte.
 *
 * DIE GANZE MECHANIK IN EINER ZEILE:
 *   zusatz = min(deckel, summe + bounty) - min(deckel, summe)
 *
 * Das ist exakt das, was `getUserDiscount` geliefert haette, waere das Bounty
 * automatisch vergeben worden. Damit laesst sich per Eingriff nur vergeben, was
 * der Katalog ohnehin hergaebe — und wer bereits am Stufen-Deckel sitzt, bekommt
 * null. Kein Sonderweg, keine zweite Rechenregel.
 *
 * @returns {Promise<{ heute:number, mit:number, zusatz:number, deckel:number,
 *                     deckelFehler:string|null }>}
 */
export async function zusatzsatzBerechnen(pool, userId, bountyPct, opts = {}) {
  const heute = Number(await getUserDiscount(pool, userId, { festhalten: opts.festhalten !== false })) || 0;
  const { maxPct, fehler } = await getUserMaxDiscountMitBefund(pool, userId);

  /* `heute` ist bereits gedeckelt. Die Rohsumme laesst sich daraus nicht
   * zurueckrechnen — aber sie muss auch nicht: der Deckel wirkt auf beide
   * Seiten gleich, und `heute` IST min(deckel, summe). Also ist
   * min(deckel, summe + bounty) = min(deckel, heute + bounty), solange
   * heute < deckel. Sitzt der Kunde am Deckel, sind beide Seiten gleich und
   * der Zusatz ist null — genau richtig. */
  const mit = Math.min(maxPct, heute + Number(bountyPct || 0));
  return {
    heute,
    mit,
    zusatz: Math.max(0, Math.round((mit - heute) * 100) / 100),
    deckel: maxPct,
    deckelFehler: fehler
  };
}

/**
 * Die Wirkungsvorschau: was wuerde dieser Eingriff kosten?
 *
 * Schreibt NICHTS. Wird sowohl vom Vorschau-Endpunkt als auch beim Anlegen
 * benutzt — dieselbe Rechnung, damit die bestaetigte Zahl und die angelegte Zahl
 * nicht auseinanderlaufen koennen.
 *
 * @param {number} nettoCents Nettobetrag der naechsten Rechnung (Planbetrag)
 * @returns {Promise<{ok:boolean, code?:string, grund?:string, ...}>}
 */
export async function eingriffVorschau(pool, { userId, bountyKey, nettoCents }) {
  const pruefung = await pruefeBountyBedingung(pool, userId, bountyKey);

  if (!pruefung.gefunden) {
    return {
      ok: false, code: "BOUNTY_UNBEKANNT",
      grund: `Kein aktives Bounty mit dem Schluessel "${bountyKey}".`
    };
  }
  if (!pruefung.verfuegbar) {
    return {
      ok: false, code: "BOUNTY_AUSSERHALB_ZEITRAUM",
      grund: pruefung.hinweis || "Dieses Bounty ist derzeit nicht verdienbar."
    };
  }
  if (!pruefung.earned) {
    /* Der Kern des Schutzes: es laesst sich nur vergeben, was der Kunde
     * ohnehin bekommen haette. `note` sagt, WELCHE Bedingung fehlt. */
    return {
      ok: false, code: "BEDINGUNG_NICHT_ERFUELLT",
      grund: pruefung.note || "Die Bedingung dieses Bountys ist nicht erfuellt.",
      fortschritt: pruefung.progress ?? 0
    };
  }

  const bountyPct = Number(pruefung.bounty.discount_pct) || 0;
  const satz = await zusatzsatzBerechnen(pool, userId, bountyPct, { festhalten: false });

  if (satz.zusatz <= 0) {
    return {
      ok: false, code: "OHNE_WIRKUNG",
      grund: `Der Kunde liegt bereits bei ${satz.heute} % und damit auf der Obergrenze `
           + `seiner Stufe (${satz.deckel} %). Dieses Bounty wuerde nichts aendern.`,
      satz_heute: satz.heute, deckel: satz.deckel
    };
  }

  const netto = Number.isFinite(Number(nettoCents)) ? Math.max(0, Math.round(Number(nettoCents))) : null;
  const vorher = netto === null ? null : berechneRabatt(netto, satz.heute).betragCents;
  const nachher = netto === null ? null : berechneRabatt(netto, satz.mit).betragCents;

  return {
    ok: true,
    bounty_key: pruefung.bounty.key,
    bounty_name: pruefung.bounty.name_de,
    bounty_pct: bountyPct,
    satz_heute: satz.heute,
    satz_nachher: satz.mit,
    zusatz_pct: satz.zusatz,
    deckel: satz.deckel,
    netto_cents: netto,
    rabatt_vorher_cents: vorher,
    rabatt_nachher_cents: nachher,
    /* DIE Zahl, die bestaetigt wird. */
    ersparnis_cents: vorher === null ? null : Math.max(0, nachher - vorher)
  };
}

/**
 * Legt den Eingriff an — nach erneuter Pruefung.
 *
 * WARUM HIER NOCHMAL GERECHNET WIRD: zwischen Vorschau und Bestaetigung koennen
 * Sekunden oder Stunden liegen. Der Kunde kann in der Zeit ein Bounty verdient
 * haben, die Stufe kann gestiegen sein, der Katalog kann sich geaendert haben.
 * Wer die Zahl aus dem Dialog einfach uebernaehme, schriebe eine Zusage fest,
 * die niemand geprueft hat. Weicht die Wirkung ab, wird ABGELEHNT — nicht
 * stillschweigend die neue Zahl genommen.
 *
 * @param {object} a
 * @param {string} a.userId                   der Kunde
 * @param {string|null} a.orgId
 * @param {string} a.bountyKey
 * @param {number} a.nettoCents               Nettobetrag der naechsten Rechnung
 * @param {number} a.bestaetigteErsparnisCents die Zahl aus der Vorschau
 * @param {string} a.grund                    Begruendung (Pflicht)
 * @param {string} a.actorId                  wer handelt
 */
export async function eingriffAnlegen(pool, a = {}) {
  const grund = String(a.grund || "").trim();
  if (grund.length < GRUND_MIN_LAENGE) {
    return {
      ok: false, code: "GRUND_ZU_KURZ",
      grund: `Die Begruendung muss mindestens ${GRUND_MIN_LAENGE} Zeichen haben.`
    };
  }

  // Nie in eigener Sache. Die Datenbankregel greift ebenfalls — hier steht sie,
  // damit die Ablehnung eine Erklaerung hat statt einer Constraint-Verletzung.
  if (!a.actorId || String(a.actorId) === String(a.userId)) {
    return {
      ok: false, code: "EIGENE_SACHE",
      grund: "Ein Eingriff in eigener Sache ist nicht moeglich."
    };
  }

  const offen = await offenenEingriffLesen(pool, a.userId);
  if (offen) {
    return {
      ok: false, code: "BEREITS_OFFEN",
      grund: `Fuer diesen Kunden ist bereits ein Eingriff offen `
           + `(${offen.bounty_key}, +${offen.zusatz_pct} %). Ein Eingriff wirkt genau einmal.`
    };
  }

  const vorschau = await eingriffVorschau(pool, {
    userId: a.userId, bountyKey: a.bountyKey, nettoCents: a.nettoCents
  });
  if (!vorschau.ok) return vorschau;

  const bestaetigt = Number(a.bestaetigteErsparnisCents);
  if (!Number.isFinite(bestaetigt) || bestaetigt !== vorschau.ersparnis_cents) {
    return {
      ok: false, code: "WIRKUNG_ABWEICHEND",
      grund: `Die bestaetigte Wirkung (${(Number(bestaetigt) || 0) / 100} EUR) stimmt nicht mehr `
           + `mit der berechneten (${(vorschau.ersparnis_cents ?? 0) / 100} EUR) ueberein. `
           + `Bitte die Vorschau neu laden.`,
      erwartet_cents: vorschau.ersparnis_cents
    };
  }

  const { rows } = await pool.query(
    `INSERT INTO rabatt_eingriffe
       (user_id, org_id, bounty_key, zusatz_pct, erwartete_ersparnis_cents, grund, angelegt_von)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [a.userId, a.orgId || null, vorschau.bounty_key, vorschau.zusatz_pct,
     vorschau.ersparnis_cents, grund, a.actorId]
  );

  return { ok: true, eingriff: rows[0], vorschau };
}

/**
 * Der offene Eingriff eines Kunden — hoechstens einer (Teilindex).
 *
 * Der Abrechnungslauf fragt das VOR der Transaktion, um den Satz zu bilden;
 * verbraucht wird er INNERHALB, damit ein Absturz dazwischen keinen Eingriff
 * verzehrt, dem keine Rechnung gegenuebersteht.
 */
export async function offenenEingriffLesen(pool, userId) {
  const { rows } = await pool.query(
    `SELECT id, user_id, org_id, bounty_key, zusatz_pct, erwartete_ersparnis_cents,
            grund, angelegt_von, angelegt_am
       FROM rabatt_eingriffe
      WHERE user_id = $1 AND verbraucht_am IS NULL`,
    [userId]
  );
  return rows[0] || null;
}

/**
 * Verbraucht den Eingriff — im Transaktions-Client des Abrechnungslaufs.
 *
 * `WHERE verbraucht_am IS NULL` ist zugleich der Parallellauf-Riegel: gewinnt
 * ein zweiter Lauf das Rennen, kommt `false` zurueck und der Zuschlag wird NICHT
 * angesetzt. Ohne diese Bedingung koennte derselbe Eingriff auf zwei Rechnungen
 * landen — der Verfall "nach genau einem Lauf" waere keiner.
 *
 * @param {import('pg').PoolClient} client Transaktions-Client, kein Pool
 */
export async function eingriffVerbrauchen(client, eingriffId) {
  const { rowCount } = await client.query(
    `UPDATE rabatt_eingriffe SET verbraucht_am = NOW()
      WHERE id = $1 AND verbraucht_am IS NULL`,
    [eingriffId]
  );
  return rowCount === 1;
}

/**
 * Traegt Rechnung und tatsaechliche Wirkung nach — im selben Transaktions-Client.
 *
 * Getrennt vom Verbrauchen, weil die Rechnungs-Id erst existiert, nachdem
 * `createInvoice` durchgelaufen ist. Die Datenbankregel
 * `rabatt_eingriffe_verbrauch_vollstaendig` laesst den Zwischenzustand
 * ausdruecklich zu.
 */
export async function eingriffBelegNachtragen(client, eingriffId, rechnungId, tatsaechlichCents) {
  await client.query(
    `UPDATE rabatt_eingriffe
        SET rechnung_id = $2, tatsaechliche_ersparnis_cents = $3
      WHERE id = $1`,
    [eingriffId, rechnungId || null,
     Number.isFinite(Number(tatsaechlichCents)) ? Math.max(0, Math.round(Number(tatsaechlichCents))) : null]
  );
}

/** Die Eingriffe eines Kunden, neueste zuerst — fuer die Einzelfall-Ansicht. */
export async function eingriffeFuerNutzer(pool, userId, opts = {}) {
  const grenze = Math.min(100, Math.max(1, Number(opts.limit) || 20));
  const { rows } = await pool.query(
    `SELECT e.*, i.invoice_number
       FROM rabatt_eingriffe e
       LEFT JOIN invoices i ON i.id = e.rechnung_id
      WHERE e.user_id = $1
      ORDER BY e.angelegt_am DESC
      LIMIT $2`,
    [userId, grenze]
  );
  return rows;
}

/**
 * Die Monatsuebersicht der Eingriffe — Welle K1.5.
 *
 * WARUM UEBERSICHT UND NICHT EINZELMELDUNG: sich selbst zu benachrichtigen waere
 * Laerm. Was zaehlt, ist "August: 3 Eingriffe, zusammen 412 EUR" — zur Durchsicht
 * und fuer die Buchhaltung.
 *
 * Gezaehlt wird nach ANLAGEMONAT, nicht nach Verbrauch: die Handlung ist der
 * Vorgang, den jemand verantwortet. Ein im August angelegter Eingriff, der erst
 * im September wirkt, bleibt im August sichtbar — sonst verschwaende er aus
 * beiden Monaten, bis er verbraucht ist.
 *
 * Die Summe steht bewusst NEBEN den Einzelfaellen in derselben Antwort: sie wird
 * aus derselben Menge gebildet, sodass ein Auseinanderlaufen unmoeglich ist.
 */
export async function eingriffeImMonat(pool, monat, opts = {}) {
  const grenze = Math.min(500, Math.max(1, Number(opts.limit) || 200));
  const { rows } = await pool.query(
    `SELECT e.id, e.user_id, e.org_id, e.bounty_key, e.zusatz_pct,
            e.erwartete_ersparnis_cents, e.tatsaechliche_ersparnis_cents,
            e.grund, e.angelegt_von, e.angelegt_am, e.verbraucht_am, e.rechnung_id,
            u.email  AS kunde_email,
            a.email  AS akteur_email,
            o.name   AS org_name,
            i.invoice_number
       FROM rabatt_eingriffe e
       JOIN users u ON u.id = e.user_id
       LEFT JOIN users a ON a.id = e.angelegt_von
       LEFT JOIN organizations o ON o.id = e.org_id
       LEFT JOIN invoices i ON i.id = e.rechnung_id
      WHERE date_trunc('month', e.angelegt_am AT TIME ZONE 'Europe/Berlin') = $1::date
      ORDER BY e.angelegt_am DESC
      LIMIT $2`,
    [monat, grenze]
  );

  /* Die Summe wird aus den GELIEFERTEN Zeilen gebildet, nicht aus einer zweiten
   * Abfrage. Zwei Abfragen koennten auseinanderlaufen (Grenze, Zeitpunkt,
   * Zeitzone) — und eine Uebersicht, deren Summe nicht zu ihren Zeilen passt,
   * ist schlimmer als gar keine. */
  const wirksam = rows.map((r) =>
    r.tatsaechliche_ersparnis_cents === null || r.tatsaechliche_ersparnis_cents === undefined
      ? Number(r.erwartete_ersparnis_cents) || 0
      : Number(r.tatsaechliche_ersparnis_cents) || 0
  );

  return {
    monat,
    eingriffe: rows,
    anzahl: rows.length,
    anzahl_offen: rows.filter((r) => !r.verbraucht_am).length,
    summe_cents: wirksam.reduce((s, c) => s + c, 0),
    summe_erwartet_cents: rows.reduce((s, r) => s + (Number(r.erwartete_ersparnis_cents) || 0), 0),
    summe_tatsaechlich_cents: rows.reduce(
      (s, r) => s + (Number(r.tatsaechliche_ersparnis_cents) || 0), 0),
    /* Die Grenze wird GENANNT, nicht verschwiegen: eine still abgeschnittene
     * Liste liest sich wie "das war alles". */
    abgeschnitten: rows.length >= grenze
  };
}
