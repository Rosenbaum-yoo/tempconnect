/**
 * Die Werbepraemie erreicht die Rechnung — Welle K2.4 bis K2.7.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DER ANLASS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Gemessen am 2026-08-30: die Werbe-Mechanik war verdrahtet, nur nicht ans Geld.
 * `qualifyReferralReward` schreibt seit jeher eine `referral_rewards`-Zeile,
 * sobald der geworbene Kunde zahlt. Aber keine einzige Datei des Geldpfads
 * erwaehnte `referral` ueberhaupt — die Praemie wurde gebucht und nie angewandt.
 * Dieselbe Fehlerklasse wie der Treue-Rabatt vor Migration 170: ein
 * Preisversprechen ohne Wirkung.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DIESELBE SCHIENE WIE DER EINGRIFF AUS K1.4
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Die Praemie ist strukturell dasselbe wie ein Eingriff: EIN einmaliger
 * Zuschlag, der genau eine Rechnung betrifft und dabei verbraucht wird. Also
 * faehrt sie auf derselben Schiene und nicht auf einer zweiten:
 *
 *   vor der Transaktion   gelesen    (`offeneWerbepraemieLesen`)
 *   in der Transaktion    verbraucht (`werbepraemieVerbrauchen`, mit
 *                                     Parallellauf-Riegel im WHERE)
 *   nach der Rechnung     belegt     (`werbepraemieBelegNachtragen`)
 *
 * Der Unterschied ist nur die Herkunft: der Eingriff kommt von einem Menschen,
 * die Praemie aus dem Werbe-Buch. Beide enden im selben `discount_pct`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM DIE BEDINGUNGEN BEIM VERBRAUCHEN GEPRUEFT WERDEN, NICHT BEIM BUCHEN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Owner-Entscheid 2026-08-27: "Der Geworbene muss 30 Tage Bestand haben."
 *
 * Der naheliegende Weg waere ein Widerrufs-Job: kuendigt der Geworbene an Tag
 * 29, nimm die Praemie zurueck. Das braeuchte einen naechtlichen Lauf, einen
 * Kuendigungs-Haken und die Annahme, dass beide immer feuern — drei Stellen, an
 * denen es still schiefgehen kann. Genau die Sorte Automatik, die in diesem
 * Repo schon einmal nie gelaufen ist (der naechtliche Mutations-Job, siehe
 * TRIAGE.md).
 *
 * Stattdessen wird IM MOMENT DES VERBRAUCHENS gefragt: ist die Karenz um, und
 * hat der Geworbene noch ein zahlendes Abo? Beides steht in der Datenbank, beide
 * Fragen kosten nichts, und keine haengt davon ab, dass irgendwann irgendwo ein
 * Job gelaufen ist. Eine Praemie, deren Geworbener gekuendigt hat, wird schlicht
 * nicht faellig — ohne dass sie jemand zurueckholen muss.
 */

import { todayDE } from "../utils/dateDE.js";

/** Der Katalogeintrag, aus dem Satz und Not-Aus kommen (Migration 209). */
export const WERBE_CASHBACK_KEY = "werbe_cashback";

/** Owner-Entscheid 2026-08-27: der Geworbene muss 30 Tage Bestand haben. */
export const KARENZ_TAGE = 30;

/** Owner-Entscheid 2026-08-27: hoechstens 3 Monate insgesamt. */
export const MAX_PRAEMIEN = 3;

/** Die Praemien-Arten. `pilot_base` ist KEINE Werbepraemie, sondern der Pilotmonat. */
export const PRAEMIEN_ARTEN = Object.freeze(["free_month", "cashback"]);

/** Abos, die den Geworbenen als "noch da" zaehlen lassen. */
const BESTEHENDE_ABOS = ["active", "past_due"];

/**
 * Der Faelligkeitstag einer heute gebuchten Praemie — Europe/Berlin.
 *
 * Bewusst als DATUM und nicht als Zeitstempel: die Zusage lautet "30 Tage", nicht
 * "30 mal 24 Stunden". Ein roher UTC-Schnitt haette am Monatsersten um 00:30 den
 * Vortag getroffen.
 */
export function faelligAb(heute = todayDE(), tage = KARENZ_TAGE) {
  /* BEWUSST OHNE `toISOString().slice(0, 10)`. Der Schnitt waere hier zwar
   * ungefaehrlich — der Anker steht auf `T00:00:00Z`, gerechnet wird nur in
   * ganzen Tagen — aber der Waechter `kalendertagDE.test.js` zaehlt das Muster,
   * und er hat recht damit: eine Ausnahme, die man beim Lesen erst pruefen muss,
   * ist genau die, die beim naechsten Mal kopiert wird, wo sie nicht mehr
   * stimmt. Die Bestandteile einzeln zusammenzusetzen ist kaum laenger und
   * braucht keine Ausnahme. */
  const d = new Date(`${heute}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(tage));
  const jahr = String(d.getUTCFullYear()).padStart(4, "0");
  const monat = String(d.getUTCMonth() + 1).padStart(2, "0");
  const tag = String(d.getUTCDate()).padStart(2, "0");
  return `${jahr}-${monat}-${tag}`;
}

/**
 * Satz und Zustand des Programms — aus dem Katalog, nicht aus einer Konstante.
 *
 * `aktiv: false` heisst: das Programm ist abgeschaltet (Not-Aus im Staff Control
 * Center) oder der Eintrag fehlt. Dann wird KEINE Praemie angewandt.
 *
 * `fehler` UNTERSCHEIDET DEN DATENBANKFEHLER VOM NOT-AUS. Die erste Fassung tat
 * das nicht — sie fing den Fehler ab und meldete schlicht "aus". Damit war ein
 * Ausfall nicht von einer Owner-Entscheidung zu unterscheiden, und ein Kunde
 * haette seine zugesagte Praemie verloren, ohne dass irgendwo etwas aufgefallen
 * waere. Das ist Zeichen fuer Zeichen der Defekt, den Welle K1.1 bei
 * `getUserTier` gefunden hat — beim Bauen der eigenen Probe reproduziert und
 * von ihr gefangen.
 *
 * @returns {Promise<{aktiv:boolean, satz:number, deckelFrei:boolean, fehler:string|null}>}
 */
export async function praemienKonfiguration(pool) {
  try {
    const { rows } = await pool.query(
      `SELECT discount_pct, deckel_frei, is_active
         FROM bounties WHERE key = $1`,
      [WERBE_CASHBACK_KEY]
    );
    const b = rows[0];
    if (!b) return { aktiv: false, satz: 0, deckelFrei: false, fehler: null, grund: "KEIN_KATALOGEINTRAG" };
    if (b.is_active !== true) return { aktiv: false, satz: 0, deckelFrei: false, fehler: null, grund: "PROGRAMM_AUS" };
    const satz = Number(b.discount_pct);
    return {
      aktiv: Number.isFinite(satz) && satz > 0,
      satz: Number.isFinite(satz) ? satz : 0,
      deckelFrei: b.deckel_frei === true,
      fehler: null,
      grund: Number.isFinite(satz) && satz > 0 ? null : "SATZ_IST_NULL"
    };
  } catch (e) {
    /* Kein stiller Rueckfall auf "aus": der Fehler wird BENANNT und nach oben
     * gereicht. Die Rechnung laeuft trotzdem weiter — aber nachlesbar. */
    return {
      aktiv: false, satz: 0, deckelFrei: false,
      fehler: e?.message || "KONFIGURATION_NICHT_LESBAR",
      grund: "KONFIGURATION_NICHT_LESBAR"
    };
  }
}

/**
 * Die aelteste offene Praemie, die WIRKLICH faellig ist.
 *
 * Drei Bedingungen, alle im WHERE statt in einer JS-Nachpruefung — eine
 * Bedingung, die im Code steht, laesst sich vergessen; eine im WHERE nicht:
 *
 *   1. noch nicht angewandt        `angewandt_am IS NULL`
 *   2. Karenz vorbei               `faellig_ab <= heute`   (K2.4)
 *   3. der Geworbene ist noch da   EXISTS-Abo               (K2.4, der eigentliche Punkt)
 *
 * Die dritte ist der Grund, warum es keinen Widerrufs-Job braucht: kuendigt der
 * Geworbene an Tag 29, findet diese Abfrage die Praemie nie.
 *
 * AELTESTE ZUERST: wer drei Praemien hat, bekommt sie in der Reihenfolge, in der
 * er sie verdient hat. Sonst verfiele bei einer spaeteren Aenderung die aelteste
 * zuerst — und das waere die, die am laengsten zugesagt war.
 */
export async function offeneWerbepraemieLesen(pool, userId, opts = {}) {
  const heute = opts.heute || todayDE();
  const { rows } = await pool.query(
    `SELECT rr.id, rr.user_id, rr.referral_id, rr.reward_type,
            rr.month_label, rr.faellig_ab, rr.applied_at, rr.description
       FROM referral_rewards rr
       LEFT JOIN referrals r ON r.id = rr.referral_id
      WHERE rr.user_id = $1
        AND rr.reward_type = ANY($2::text[])
        AND rr.angewandt_am IS NULL
        AND rr.faellig_ab IS NOT NULL
        AND rr.faellig_ab <= $3::date
        AND EXISTS (
          SELECT 1 FROM subscriptions s
           WHERE s.user_id = r.referred_user_id
             AND s.status = ANY($4::text[])
             AND s.plan <> 'DEMO'
        )
      ORDER BY rr.faellig_ab ASC, rr.applied_at ASC
      LIMIT 1`,
    [userId, PRAEMIEN_ARTEN, heute, BESTEHENDE_ABOS]
  );
  return rows[0] || null;
}

/**
 * Wie viele Werbepraemien dieser Kunde schon ANGEWANDT bekommen hat — der
 * Deckel aus K2.5.
 *
 * Gezaehlt werden die verbrauchten, nicht die gebuchten: der Owner-Entscheid
 * lautet "hoechstens 3 MONATE", also drei geschenkte Rechnungen. Wer vier
 * Kunden wirbt, von denen einer wieder kuendigt, hat drei Monate gut — nicht
 * zwei.
 */
export async function angewandtePraemien(pool, userId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS anzahl
       FROM referral_rewards
      WHERE user_id = $1
        AND reward_type = ANY($2::text[])
        AND angewandt_am IS NOT NULL`,
    [userId, PRAEMIEN_ARTEN]
  );
  return Number(rows[0]?.anzahl || 0);
}

/**
 * Was der naechste Abrechnungslauf diesem Kunden an Werbepraemie zugesteht.
 *
 * WIRFT NIE — eine Stoerung im Praemienweg darf die Rechnung nicht anhalten;
 * dann gilt eben der Normalpreis. Dieselbe Regel wie beim Feed-Rueckfall aus K4
 * und beim Ausfall-Befund aus K1.1: ein Zusatzweg bringt den Hauptweg nie um.
 *
 * @returns {Promise<{praemie:object|null, satz:number, grund:string|null}>}
 *          `grund` sagt, WARUM nichts gewaehrt wird — fuer die Staff-Flaeche und
 *          die Vorschau. Schweigen waere hier wieder der stille Ausfall.
 */
export async function werbepraemieFuerLauf(pool, userId, opts = {}) {
  try {
    const konfig = await praemienKonfiguration(pool);
    if (!konfig.aktiv) {
      /* `grund` unterscheidet: abgeschaltet, kein Eintrag, Satz null — oder die
       * Konfiguration war gar nicht lesbar. Ein Ausfall darf nicht wie eine
       * Entscheidung aussehen. */
      return {
        praemie: null, satz: 0,
        grund: konfig.fehler ? `NICHT_ERMITTELBAR: ${konfig.fehler}` : (konfig.grund || "PROGRAMM_AUS")
      };
    }

    const verbraucht = await angewandtePraemien(pool, userId);
    if (verbraucht >= MAX_PRAEMIEN) {
      return { praemie: null, satz: 0, grund: "DECKEL_ERREICHT" };
    }

    const praemie = await offeneWerbepraemieLesen(pool, userId, opts);
    if (!praemie) {
      return { praemie: null, satz: 0, grund: "KEINE_FAELLIGE_PRAEMIE" };
    }

    return { praemie, satz: konfig.satz, grund: null, deckelFrei: konfig.deckelFrei };
  } catch (e) {
    return { praemie: null, satz: 0, grund: `NICHT_ERMITTELBAR: ${e?.message || "FEHLER"}` };
  }
}

/**
 * Verbraucht die Praemie — im Transaktions-Client des Abrechnungslaufs.
 *
 * `WHERE angewandt_am IS NULL` ist zugleich der Parallellauf-Riegel: gewinnt ein
 * zweiter Lauf das Rennen, kommt `false` zurueck und der Zuschlag wird NICHT
 * angesetzt. Ohne diese Bedingung koennte dieselbe Praemie zwei Rechnungen frei
 * machen — aus einem geschenkten Monat wuerden zwei.
 *
 * @param {import('pg').PoolClient} client Transaktions-Client, kein Pool
 */
export async function werbepraemieVerbrauchen(client, praemieId) {
  const { rowCount } = await client.query(
    `UPDATE referral_rewards SET angewandt_am = NOW()
      WHERE id = $1 AND angewandt_am IS NULL`,
    [praemieId]
  );
  return rowCount === 1;
}

/**
 * Traegt die Rechnung nach, die durch die Praemie frei wurde.
 *
 * Getrennt vom Verbrauchen, weil die Rechnungs-Id erst existiert, nachdem
 * `createInvoice` durchgelaufen ist — genau wie beim Eingriff aus K1.4.
 */
export async function werbepraemieBelegNachtragen(client, praemieId, rechnungId) {
  await client.query(
    `UPDATE referral_rewards SET rechnung_id = $2 WHERE id = $1`,
    [praemieId, rechnungId || null]
  );
}

/**
 * Die Werbepraemien eines Kunden — fuer die Einzelfall-Ansicht (K1.2) und die
 * Monatsuebersicht.
 *
 * WIRFT (Lesepfad einer Staff-Flaeche): ein leeres Ergebnis waere dort nicht von
 * "keine Praemien" zu unterscheiden.
 */
export async function praemienFuerNutzer(pool, userId, opts = {}) {
  const grenze = Math.min(100, Math.max(1, Number(opts.limit) || 20));
  const { rows } = await pool.query(
    `SELECT rr.id, rr.reward_type, rr.month_label, rr.description,
            rr.applied_at, rr.faellig_ab, rr.angewandt_am, rr.rechnung_id,
            r.referred_email, r.referred_user_id, r.status AS werbung_status,
            i.invoice_number
       FROM referral_rewards rr
       LEFT JOIN referrals r ON r.id = rr.referral_id
       LEFT JOIN invoices i ON i.id = rr.rechnung_id
      WHERE rr.user_id = $1 AND rr.reward_type = ANY($2::text[])
      ORDER BY rr.applied_at DESC
      LIMIT $3`,
    [userId, PRAEMIEN_ARTEN, grenze]
  );
  return rows;
}
