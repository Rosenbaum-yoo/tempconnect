/**
 * recurringBillingService.js
 *
 * SaaS-Self-Service-Billing — der bezahlte Zwilling von subscriptionLifecycleService.
 * Erweitert die bestehende Lifecycle-/Invoice-Infrastruktur (KEINE Parallelstruktur):
 *
 *   1. generateRecurringInvoices — Folge-Rechnung am Periodenende.
 *      Aktive, bezahlte (plan<>DEMO, kein Trial) Subscriptions mit
 *      `current_period_end <= NOW` erhalten eine neue Rechnung (invoiceService.createInvoice,
 *      Net-14, 19% USt) und werden auf `past_due` gesetzt — exakt analog zu
 *      `applyTrialEnds`. Damit greift die BESTEHENDE Grace-/Hard-Lock-Mechanik
 *      (`applyHardLocks`): unbezahlt nach 14 Tagen → `canceled` + Org auf DEMO.
 *      Bezahlt → `applyRenewalPayment` rollt die Periode weiter.
 *
 *   2. runDunningSweep — gestaffelte Zahlungserinnerungen (Mahnstufe 1..3)
 *      für überfällige Rechnungen, getrackt über `invoices.dunning_level` /
 *      `last_dunning_at` (Migration 142). Versendet pro Stufe genau eine Mail.
 *
 *   3. applyRenewalPayment — Happy-Path beim Zahlungseingang einer Folgerechnung
 *      (Staff-Aktion heute / Stripe `invoice.paid`-Webhook nach UG-Gründung):
 *      `past_due` → `active`, Periode +1 Monat.
 *
 * AKTIVIERUNG: ausschließlich über die Env-Flags RECURRING_BILLING_ENABLED /
 * DUNNING_ENABLED (Default AUS). Die /internal-Cron-Endpunkte sind No-Ops solange
 * die Flags aus sind — „kein Auto-Billing, solange manuelle Rechnung Default ist".
 *
 * Fail-safe (wie subscriptionLifecycleService):
 *   - Jeder Datensatz in eigener try/catch-Schleife; ein Fehler stoppt den Lauf nicht.
 *   - Audit-Log best-effort.
 *   - Status-Flip (active→past_due) UND Rechnungserstellung laufen ATOMAR in EINER Transaktion:
 *     Bricht der Prozess/die DB dazwischen ab, rollt alles zurück → kein „past_due ohne Rechnung"-
 *     Zombie. Der atomare `UPDATE … WHERE status='active'` hält zugleich den Row-Lock und dient als
 *     Idempotenz-/Concurrency-Guard (kein Doppel-Invoice bei Parallel-Lauf).
 */

import * as invoiceService from "./invoiceService.js";
// P9/A4: Der Treue-Rabatt wirkt auf JEDE Folgerechnung (Owner-Entscheidung A-E1,
// 2026-08-08 — monatlich, nicht nur auf den Jahresvertrag).
import { getUserDiscount } from "./bountyService.js";
// Welle K1.1: ein Ausfall der Rabatt-Ermittlung wird ein Befund, keine Log-Zeile.
import { ausfallFesthalten, rechnungNachtragen, grundText } from "./rabattAusfallService.js";
// Welle K1.4: der Eingriffspunkt. Die Richtung ist Absicht — der Eingriff kennt
// die Abrechnung NICHT, sonst gaebe es einen Modul-Kreis.
import {
  offenenEingriffLesen, eingriffVerbrauchen, eingriffBelegNachtragen, EINGRIFF_QUELLE
} from "./rabattEingriffService.js";
import * as auditLog from "./auditLog.js";
import { getPlanPriceCentsByKey, normalizePlanKey } from "../config/planCatalog.js";
import { dunningEmail } from "./emailHtmlTemplates.js";
import { withTransaction } from "../utils/transaction.js";
import { dateOnlyDE } from "../utils/dateDE.js";

/* ── Konstanten ────────────────────────────────────────────── */

/** Maximale Items pro Cron-Tick — schützt vor Lastspitzen (wie subscriptionLifecycleService). */
export const MAX_BATCH_SIZE = 500;

/**
 * Kulanzfrist in Tagen. MUSS identisch zu subscriptionLifecycleService.BILLING_GRACE_PERIOD_DAYS
 * und entitlementService.BILLING_GRACE_PERIOD_DAYS sein (Grace läuft ab current_period_end).
 */
export const BILLING_GRACE_PERIOD_DAYS = 14;

/**
 * Dunning-Stufen: Tage seit Rechnungs-Fälligkeit → Mahnstufe. Liegen innerhalb der
 * 14-Tage-Kulanz, damit die letzte Mahnung VOR dem Hard-Lock beim Kunden ankommt.
 */
export const DUNNING_STAGES = [
  { level: 1, afterDays: 3 },
  { level: 2, afterDays: 7 },
  { level: 3, afterDays: 11 }
];
export const MAX_DUNNING_LEVEL = 3;

/** Mindestabstand zwischen zwei Erinnerungen derselben Rechnung (Doppelversand-Schutz). */
const DUNNING_MIN_INTERVAL_HOURS = 20;

const DAY_MS = 24 * 60 * 60 * 1000;

/* ── Helfer ─────────────────────────────────────────────────── */

function clampBatch(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return MAX_BATCH_SIZE;
  return Math.min(MAX_BATCH_SIZE, Math.floor(v));
}

function resolveNow(now) {
  if (now instanceof Date && !Number.isNaN(now.getTime())) return now;
  if (typeof now === "string" || typeof now === "number") {
    const d = new Date(now);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

/**
 * Bestimmt die höchste fällige Mahnstufe, die noch nicht versendet wurde.
 * @param {number} daysOverdue
 * @param {number} currentLevel  bereits versendete Stufe (0 = keine)
 * @returns {number} neue Stufe (>currentLevel) oder 0 (keine neue Stufe fällig)
 */
export function resolveDunningLevel(daysOverdue, currentLevel) {
  let target = 0;
  for (const stage of DUNNING_STAGES) {
    if (Number(daysOverdue) >= stage.afterDays) target = stage.level;
  }
  return target > (Number(currentLevel) || 0) ? target : 0;
}

/**
 * Löst Owner-Org, Empfänger-E-Mail und Netto-Abrechnungspreis (Cent) einer
 * Subscription auf — exakt über denselben Owner-Org-Pfad wie applyHardLocks
 * (`org_memberships.role_key='owner'`). INDIVIDUELL nutzt den Vertragspreis der Org,
 * Katalog-Pläne den Katalogpreis.
 *
 * @param {import('pg').Pool} pool
 * @param {{ user_id: string, plan: string }} sub
 * @returns {Promise<{ orgId: string|null, orgName: string|null, email: string|null, amountCents: number|null }>}
 */
async function resolveOwnerBilling(pool, sub) {
  let row = null;
  try {
    const res = await pool.query(
      `SELECT o.id AS org_id, o.name AS org_name,
              o.billing_mode, o.individual_contract_price_cents,
              u.email AS user_email
         FROM org_memberships om
         JOIN organizations o ON o.id = om.org_id
         JOIN users u ON u.id = om.user_id
        WHERE om.user_id = $1 AND om.role_key = 'owner' AND om.is_active = TRUE
        LIMIT 1`,
      [sub.user_id]
    );
    row = res.rows[0] || null;
  } catch { /* schema-tolerant — Preis für Katalog-Pläne bleibt auflösbar */ }

  const planKey = normalizePlanKey(sub.plan, { fallback: null });
  let amountCents = null;
  if (planKey === "INDIVIDUELL") {
    const contract = Number(row?.individual_contract_price_cents);
    amountCents = Number.isFinite(contract) ? contract : null;
  } else if (planKey) {
    amountCents = getPlanPriceCentsByKey(planKey);
  }

  return {
    orgId: row?.org_id || null,
    orgName: row?.org_name || null,
    email: row?.user_email || null,
    amountCents
  };
}

/**
 * Was diesem Kunden als Nächstes in Rechnung gestellt würde — Nettobetrag und
 * Fälligkeit. Für die Einzelfall-Ansicht (K1.2) und die Wirkungsvorschau des
 * Eingriffs (K1.4).
 *
 * Bewusst HIER und nicht im Eingriffs-Dienst: der Preis eines Abos ist Wissen
 * der Abrechnung. Ein zweiter Ort, der ihn auflöst, wäre eine zweite Wahrheit
 * über das, was der Kunde zahlt.
 *
 * `null`, wenn es kein abrechenbares Abo gibt — dann gibt es auch nichts zu
 * rabattieren, und die Fläche sagt das statt eine Zahl zu erfinden.
 */
export async function naechsteAbrechnung(pool, userId) {
  const { rows } = await pool.query(
    `SELECT id, user_id, plan, status, trial_mode, current_period_start, current_period_end
       FROM subscriptions
      WHERE user_id = $1 AND status IN ('active', 'past_due') AND plan <> 'DEMO'
      ORDER BY (status = 'active') DESC, current_period_end ASC
      LIMIT 1`,
    [userId]
  );
  const sub = rows[0];
  if (!sub) return null;

  const billing = await resolveOwnerBilling(pool, sub);
  const netto = Number(billing.amountCents);
  return {
    subscription_id: sub.id,
    plan: sub.plan,
    status: sub.status,
    trial_mode: sub.trial_mode,
    periode_endet: sub.current_period_end,
    faellig: sub.current_period_end != null && new Date(sub.current_period_end) <= new Date(),
    org_id: billing.orgId,
    org_name: billing.orgName,
    email: billing.email,
    netto_cents: Number.isFinite(netto) && netto > 0 ? netto : null
  };
}

/* ── 1) Recurring Invoice Generation ────────────────────────── */

/**
 * Was diese Abrechnung von dieser Subscription hält — OHNE etwas zu tun.
 *
 * WARUM ES DIESE FUNKTION GIBT (Welle K1.3)
 * Die Vorschau auf den nächsten Lauf ist nur dann etwas wert, wenn sie DASSELBE
 * rechnet wie der Lauf. Zwei Fassungen derselben Regel laufen früher oder später
 * auseinander — und dann zeigt die Vorschau einen Betrag, den niemand je in
 * Rechnung stellt. Deshalb entscheidet HIER genau eine Funktion, und sowohl
 * `generateRecurringInvoices` als auch `vorschauRecurringInvoices` rufen sie auf.
 * Der Unterschied ist ausschließlich, was danach passiert.
 *
 * Diese Funktion schreibt nichts — mit einer Ausnahme, die sie abschalten kann:
 * fällt die Rabatt-Ermittlung aus, hält der echte Lauf den Befund fest (K1.1).
 * Die Vorschau setzt `festhalten: false` und bleibt vollständig lesend.
 *
 * @param {{ festhalten?: boolean, logger?: object }} [opts]
 */
export async function abrechnungsEntscheidung(pool, s, opts = {}) {
  const festhalten = opts.festhalten !== false;
  const logger = opts.logger || null;

  const billing = await resolveOwnerBilling(pool, s);

  // Ohne auflösbaren Netto-Preis kann nicht abgerechnet werden
  // (z.B. INDIVIDUELL ohne hinterlegten Vertragspreis) → bewusst überspringen + auditieren.
  if (!Number.isFinite(Number(billing.amountCents)) || Number(billing.amountCents) <= 0) {
    return { status: "uebersprungen", grund: "NO_RESOLVABLE_PRICE", billing, subscription: s };
  }

  // Ohne auflösbaren Owner-Org-Kontext NICHT abrechnen — sonst entstünde eine verwaiste
  // Rechnung mit org_id=NULL (Org-Boundary-Verletzung). Tritt z.B. auf, wenn der Owner-Lookup
  // transient fehlschlägt (resolveOwnerBilling fängt DB-Fehler schema-tolerant ab → orgId=null).
  // Sauber überspringen + auditieren; Status bleibt 'active' → nächster Lauf versucht erneut.
  if (!billing.orgId) {
    return { status: "uebersprungen", grund: "NO_OWNER_ORG", billing, subscription: s };
  }

  const nettoCents = Number(billing.amountCents);

  // Rabattsatz VOR der Transaktion auflösen: es ist ein Lesevorgang über
  // mehrere Tabellen und hätte in der Transaktion nur die Sperre verlängert.
  // Fällt er aus, wird trotzdem abgerechnet — aber sichtbar, nicht stumm:
  // eine Rechnung ohne Rabatt ist ein Fehler, den jemand sehen muss.
  //
  // K1.1: „sichtbar" hieß bis hierher eine `logger.warn`-Zeile, die niemand
  // liest. Jetzt entsteht ein Befund mit Kunde, Monat und Grund, den die
  // Staff-Fläche zeigt. Eine Meldung wird NICHT behauptet — es gibt heute keinen
  // Kanal, der das Team erreicht (Übergabe: `K4-B1`).
  let rabattSatz = 0;
  let ausfallId = null;
  let ausfall = null;
  try {
    rabattSatz = Number(await getUserDiscount(pool, s.user_id, { festhalten })) || 0;
  } catch (e) {
    ausfall = grundText(e);
    logger?.warn?.({ err: e?.message, userId: s.user_id },
      "Folgerechnung: Rabattsatz nicht ermittelbar, Rechnung ohne Rabatt");
    if (festhalten) {
      ausfallId = await ausfallFesthalten(pool, {
        userId: s.user_id,
        orgId: billing.orgId,
        stelle: "rabattsatz",
        fehler: e,
        angesetztPct: 0,
        nettoCents
      });
    }
  }

  // K1.4: der offene Eingriff wird hier nur GELESEN. Verbraucht wird er in der
  // Transaktion — sonst könnte ein Absturz dazwischen einen Eingriff verzehren,
  // dem keine Rechnung gegenübersteht.
  let eingriff = null;
  try {
    eingriff = await offenenEingriffLesen(pool, s.user_id);
  } catch (e) {
    // Ein Fehler beim Lesen des Eingriffs darf die Abrechnung nicht anhalten;
    // ohne ihn gilt schlicht die Automatik.
    logger?.warn?.({ err: e?.message, userId: s.user_id },
      "Folgerechnung: Eingriff nicht lesbar, es gilt die Automatik");
  }

  const satzMitEingriff = eingriff
    ? Math.min(100, rabattSatz + (Number(eingriff.zusatz_pct) || 0))
    : rabattSatz;

  return {
    status: "rechnung",
    subscription: s,
    billing,
    nettoCents,
    rabattSatz,
    satzMitEingriff,
    eingriff,
    ausfallId,
    ausfall
  };
}

/** Die Notiz auf dem Beleg — eine Fassung für Vorschau und Lauf. */
function rechnungsNotiz(s, satz, ausEingriff) {
  // Klasse DB_WERT_NACH_UTC: current_period_end kam korrekt aus der DB und
  // wurde per toISOString().slice(0,10) nach UTC zurueckgerechnet. Auf dem
  // Beleg stand dadurch ein Periodenbeginn, der einen Tag vor dem
  // tatsaechlichen liegt — derselbe Off-by-one, der in invoiceService.js
  // fuer billing_period_start/end bereits behoben ist.
  const kopf = `Automatische Folgerechnung (Abo-Verlängerung) — Periode ab ${dateOnlyDE(s.current_period_end)}`;
  if (!(satz > 0)) return kopf;
  // Die Quelle steht auf der Rechnung (Plan-Abschnitt 3a): Automatik oder Eingriff.
  return kopf + (ausEingriff
    ? ` · Rabatt ${satz} % beruecksichtigt (Automatik + Eingriff des TempConnect-Teams)`
    : ` · Treue-Rabatt ${satz} % beruecksichtigt`);
}

/**
 * Vorschau auf den nächsten Abrechnungslauf — Welle K1.3.
 *
 * Was würde angesetzt, bevor es läuft. Benutzt dieselbe Auswahl (`faelligeAbos`)
 * und dieselbe Entscheidung (`abrechnungsEntscheidung`) wie der echte Lauf; ein
 * Test hält beide Ergebnisse gegeneinander.
 *
 * SCHREIBT NICHTS — auch keinen Rabatt-Ausfall. Eine Vorschau, die Spuren
 * hinterlässt, ist keine Vorschau.
 */
export async function vorschauRecurringInvoices(pool, opts = {}) {
  const batch = clampBatch(opts.batchSize);
  const nowTs = resolveNow(opts.now);
  const rows = await faelligeAbos(pool, nowTs, batch);

  const posten = [];
  let summeNettoCents = 0;
  let summeRabattCents = 0;
  let uebersprungen = 0;
  let mitEingriff = 0;

  for (const s of rows) {
    let e;
    try {
      e = await abrechnungsEntscheidung(pool, s, { festhalten: false, logger: opts.logger || null });
    } catch (err) {
      // Ein Fehler in der Vorschau darf die Vorschau nicht töten — er ist
      // selbst die Aussage: dieser Kunde würde den Lauf sprengen.
      posten.push({
        subscription_id: s.id, user_id: s.user_id, plan: s.plan,
        status: "fehler", grund: err?.message || "ERROR"
      });
      continue;
    }

    if (e.status === "uebersprungen") {
      uebersprungen++;
      posten.push({
        subscription_id: s.id, user_id: s.user_id, plan: s.plan,
        status: "uebersprungen", grund: e.grund,
        org_id: e.billing.orgId, org_name: e.billing.orgName, email: e.billing.email
      });
      continue;
    }

    const satz = e.satzMitEingriff;
    const rabatt = invoiceService.berechneRabatt(e.nettoCents, satz);
    summeNettoCents += e.nettoCents;
    summeRabattCents += rabatt.betragCents;
    if (e.eingriff) mitEingriff++;

    posten.push({
      subscription_id: s.id, user_id: s.user_id, plan: s.plan,
      status: "rechnung",
      org_id: e.billing.orgId, org_name: e.billing.orgName, email: e.billing.email,
      periode_ab: dateOnlyDE(s.current_period_end),
      netto_cents: e.nettoCents,
      rabatt_pct: satz,
      rabatt_cents: rabatt.betragCents,
      rabatt_quelle: satz > 0 ? (e.eingriff ? EINGRIFF_QUELLE : "bounty") : null,
      automatik_pct: e.rabattSatz,
      eingriff: e.eingriff
        ? { id: e.eingriff.id, bounty_key: e.eingriff.bounty_key, zusatz_pct: Number(e.eingriff.zusatz_pct) }
        : null,
      // Der Ausfall wird in der Vorschau GEZEIGT, aber nicht festgehalten.
      ausfall: e.ausfall
    });
  }

  return {
    stand: nowTs.toISOString(),
    batch_size: batch,
    faellig: rows.length,
    rechnungen: rows.length - uebersprungen - posten.filter((p) => p.status === "fehler").length,
    uebersprungen,
    mit_eingriff: mitEingriff,
    summe_netto_cents: summeNettoCents,
    summe_rabatt_cents: summeRabattCents,
    posten,
    /* Die Grenze wird genannt: eine still abgeschnittene Vorschau liest sich wie
     * „mehr ist nicht fällig". */
    abgeschnitten: rows.length >= batch
  };
}

/** Die fälligen Abos — eine Auswahl für Vorschau und Lauf. */
async function faelligeAbos(pool, nowTs, batch) {
  const { rows } = await pool.query(
    `SELECT id, user_id, plan, current_period_start, current_period_end
       FROM subscriptions
      WHERE status = 'active'
        AND trial_mode = FALSE
        AND plan <> 'DEMO'
        AND current_period_end IS NOT NULL
        AND current_period_end <= $1
      ORDER BY current_period_end ASC
      LIMIT $2`,
    [nowTs.toISOString(), batch]
  );
  return rows;
}

/**
 * Erzeugt Folge-Rechnungen für fällige aktive Subscriptions und setzt sie auf
 * `past_due` (bezahlter Zwilling von applyTrialEnds). Flip + Rechnung laufen atomar in
 * einer Transaktion (Crash → Rollback, kein Zombie); der Flip ist Idempotenz-/Concurrency-Guard.
 * Subscriptions ohne auflösbaren Preis ODER ohne Owner-Org werden übersprungen + auditiert.
 *
 * Die Entscheidung je Subscription trifft `abrechnungsEntscheidung` — dieselbe
 * Funktion, die auch die Vorschau (K1.3) benutzt. Hier steht nur noch, was
 * daraus FOLGT.
 *
 * @param {import('pg').Pool} pool
 * @param {{ batchSize?: number, now?: Date|string|null, logger?: object, createInvoice?: Function }} [opts]
 */
export async function generateRecurringInvoices(pool, opts = {}) {
  const batch = clampBatch(opts.batchSize);
  const nowTs = resolveNow(opts.now);
  const logger = opts.logger || null;
  const createInvoice = opts.createInvoice || invoiceService.createInvoice; // injizierbar für Tests

  const rows = await faelligeAbos(pool, nowTs, batch);

  let processed = 0;
  let invoiced = 0;
  let skipped = 0;
  let eingriffeAngewandt = 0;
  let ohneForderung = 0;
  const failed = [];

  for (const s of rows) {
    processed++;
    try {
      // Dieselbe Entscheidung, die auch die Vorschau trifft (K1.3).
      const entscheidung = await abrechnungsEntscheidung(pool, s, { festhalten: true, logger });

      if (entscheidung.status === "uebersprungen") {
        skipped++;
        try {
          await auditLog.writeAudit(pool, {
            action: "subscription.recurring_invoice_skipped",
            entity_type: "subscription",
            entity_id: s.id,
            details: { user_id: s.user_id, plan: s.plan, reason: entscheidung.grund, org_id: entscheidung.billing.orgId, auto: true }
          });
        } catch { /* best-effort */ }
        continue;
      }

      const billing = entscheidung.billing;

      // Status-Flip (active→past_due) UND Rechnung ATOMAR: Crash/DB-Abbruch dazwischen → Rollback,
      // kein „past_due ohne Rechnung"-Zombie. Der UPDATE … WHERE status='active' hält den Row-Lock
      // bis COMMIT und ist zugleich Idempotenz-/Concurrency-Guard (kein Doppel-Invoice).
      // createInvoice erhält den Transaktions-Client; withTransaction erkennt den geschachtelten
      // Client (.release vorhanden) und öffnet KEINE zweite Transaktion.
      let angewandterEingriff = null;
      let angewandterSatz = entscheidung.rabattSatz;
      // Gate K2.2: wurde DIESE Rechnung mit ihrer Ausstellung beglichen?
      // BEWUSST hier deklariert und nicht in der Transaktion — genau die Falle,
      // die in K4 einen ReferenceError erzeugt hat (`opts` mit `const`
      // innerhalb des try, im catch unsichtbar). Und bewusst ANDERS benannt als
      // der Zaehler `ohneForderung` weiter oben: zwei Dinge, zwei Namen.
      let rechnungOhneForderung = false;

      const invoice = await withTransaction(pool, async (client) => {
        const { rowCount } = await client.query(
          `UPDATE subscriptions
              SET status = 'past_due',
                  updated_at = NOW()
            WHERE id = $1 AND status = 'active'`,
          [s.id]
        );
        if (!rowCount) return null; // Parallel-Lauf hat den Datensatz bereits verarbeitet.

        /* K1.4 — Verfall nach GENAU EINEM Lauf. Der Eingriff wird HIER verbraucht,
         * nicht vorher: `WHERE verbraucht_am IS NULL` ist zugleich der Riegel gegen
         * den Parallellauf. Gewinnt ein zweiter Lauf das Rennen, kommt `false`
         * zurück und der Zuschlag wird NICHT angesetzt — derselbe Eingriff kann
         * niemals auf zwei Rechnungen landen. */
        let satz = entscheidung.rabattSatz;
        let quelle = satz > 0 ? "bounty" : null;
        let ausEingriff = false;

        if (entscheidung.eingriff) {
          const verbraucht = await eingriffVerbrauchen(client, entscheidung.eingriff.id);
          if (verbraucht) {
            satz = entscheidung.satzMitEingriff;
            quelle = EINGRIFF_QUELLE; // die Quelle steht auf der Rechnung
            ausEingriff = true;
          }
        }
        angewandterSatz = satz;

        const inv = await createInvoice(client, {
          orgId: billing.orgId,
          userId: s.user_id,
          plan: s.plan,
          amountCents: entscheidung.nettoCents,
          // Eingefroren: der Satz von heute steht in dieser Zeile. Verliert der
          // Kunde das Bounty naechsten Monat, bleibt diese Rechnung unveraendert.
          discountPct: satz,
          discountSource: quelle,
          notes: rechnungsNotiz(s, satz, ausEingriff)
        });

        if (ausEingriff) {
          /* Was der Eingriff WIRKLICH gebracht hat — die Differenz zwischen dem
           * Rabatt mit und ohne ihn, auf demselben Netto gerechnet wie die
           * Rechnung. Der Vergleich mit `erwartete_ersparnis_cents` zeigt in der
           * Monatsübersicht, ob der Lauf tat, was angekündigt war. */
          const mit = invoiceService.berechneRabatt(entscheidung.nettoCents, satz).betragCents;
          const ohne = invoiceService.berechneRabatt(entscheidung.nettoCents, entscheidung.rabattSatz).betragCents;
          await eingriffBelegNachtragen(client, entscheidung.eingriff.id, inv?.id || null, Math.max(0, mit - ohne));
          angewandterEingriff = entscheidung.eingriff;
        }

        /* ══════════════════════════════════════════════════════════════════
         * GATE K2.2 — EINE 0-EUR-RECHNUNG IST MIT IHRER AUSSTELLUNG BEGLICHEN
         * ══════════════════════════════════════════════════════════════════
         *
         * Ohne diesen Zweig endete ein Freimonat in der SPERRE statt in der
         * Freude. Gemessen am 2026-08-30:
         *
         *   Rechnung ueber 0,00 EUR  →  Abo auf `past_due`
         *   niemand zahlt sie        →  es gibt nichts zu zahlen
         *   applyRenewalPayment      →  hat KEINEN EINZIGEN AUFRUFER
         *   nach 14 Tagen            →  applyHardLocks: `canceled`, Org auf DEMO
         *
         * Der Kunde, dem die naechste Rechnung geschenkt wurde, waere
         * ausgesperrt worden. Das ist kein Randfall des Cashbacks — es trifft
         * JEDE Rechnung, die auf null faellt, also auch einen Eingriff nach
         * K1.4, der die 100 % erreicht.
         *
         * Der Fix ist keine Umgehung, sondern die richtige Buchung: eine
         * Forderung ueber null ist in dem Moment erfuellt, in dem sie entsteht.
         * Also wird sie sofort als bezahlt gebucht und die Periode
         * weitergerollt — mit derselben Funktion, die auch ein echter
         * Zahlungseingang benutzen wuerde.
         *
         * IN DERSELBEN TRANSAKTION wie der Flip: sonst gaebe es ein Fenster, in
         * dem das Abo `past_due` ist und der Haerte-Riegel zuschlagen koennte.
         *
         * Die Reihenfolge bleibt: erst der bewachte Flip (er ist der
         * Idempotenz-Riegel gegen den Parallellauf), dann die Rechnung, dann
         * der Ausgleich. */
        if (inv && Number(inv.total_cents) === 0) {
          await client.query(
            `UPDATE invoices SET status = 'paid', paid_at = NOW(), updated_at = NOW()
              WHERE id = $1 AND status = 'issued'`,
            [inv.id]
          );
          // `applyRenewalPayment` erwartet `past_due` — genau der Zustand, den
          // der Flip zwei Anweisungen vorher hergestellt hat.
          await applyRenewalPayment(client, { subscriptionId: s.id, now: nowTs });
          rechnungOhneForderung = true;
        }

        return inv;
      });

      if (!invoice) {
        // Row war beim Flip nicht mehr 'active' (Parallel-Lauf) → nichts erstellt.
        continue;
      }

      if (angewandterEingriff) eingriffeAngewandt++;
      if (rechnungOhneForderung) ohneForderung++;

      /* K1.1 — der Befund bekommt seinen Beleg. Erst dadurch ist er prüfbar:
       * „DIESE Rechnung ging ohne Rabatt raus". Wirft nie. */
      if (entscheidung.ausfallId) {
        await rechnungNachtragen(pool, entscheidung.ausfallId, invoice.id);
      }

      try {
        await auditLog.writeAudit(pool, {
          action: "subscription.recurring_invoice_issued",
          entity_type: "subscription",
          entity_id: s.id,
          details: {
            user_id: s.user_id,
            org_id: billing.orgId,
            plan: s.plan,
            amount_cents: entscheidung.nettoCents,
            invoice_id: invoice?.id || null,
            invoice_number: invoice?.invoice_number || null,
            period_end_before: s.current_period_end,
            transitioned_to: "past_due",
            discount_pct: angewandterSatz,
            // Automatik oder Eingriff — im Audit wie auf der Rechnung.
            discount_source: angewandterSatz > 0
              ? (angewandterEingriff ? EINGRIFF_QUELLE : "bounty")
              : null,
            rabatt_eingriff_id: angewandterEingriff?.id || null,
            rabatt_ausfall: entscheidung.ausfall || null,
            auto: true
          }
        });
      } catch { /* best-effort */ }

      invoiced++;
    } catch (e) {
      if (logger && typeof logger.warn === "function") {
        logger.warn({ subscription_id: s.id, err: e.message }, "recurring-billing: invoice failed for subscription");
      }
      failed.push({ id: s.id, error: e.message || "ERROR" });
    }
  }

  return {
    processed, invoiced, skipped, failed, batch_size: batch,
    eingriffe_angewandt: eingriffeAngewandt,
    // Gate K2.2: wie viele Rechnungen mit ihrer Ausstellung beglichen waren.
    // Ein Lauf, der Freimonate ausgibt, ohne das zu berichten, waere wieder still.
    ohne_forderung: ohneForderung
  };
}

/* ── 2) Dunning Sweep ───────────────────────────────────────── */

/**
 * Versendet gestaffelte Zahlungserinnerungen für überfällige Abo-Rechnungen.
 * Pro Rechnung genau eine Mail je Stufe (getrackt über dunning_level/last_dunning_at).
 *
 * @param {import('pg').Pool} pool
 * @param {{ batchSize?: number, now?: Date|string|null, logger?: object, sendMail?: Function, baseUrl?: string }} [opts]
 */
export async function runDunningSweep(pool, opts = {}) {
  const batch = clampBatch(opts.batchSize);
  const nowTs = resolveNow(opts.now);
  const logger = opts.logger || null;
  const sendMail = typeof opts.sendMail === "function" ? opts.sendMail : null;
  const baseUrl = (opts.baseUrl || "").replace(/\/+$/, "");

  // Ohne Mailer kein Versand — die Erinnerung darf nicht „verloren" gehen (keine Markierung).
  if (!sendMail) {
    return { processed: 0, reminded: 0, skipped: 0, failed: [], batch_size: batch, note: "NO_MAILER" };
  }

  const cooldownTs = new Date(nowTs.getTime() - DUNNING_MIN_INTERVAL_HOURS * 60 * 60 * 1000);

  const { rows } = await pool.query(
    `SELECT i.id, i.invoice_number, i.user_id, i.org_id, i.total_cents, i.currency,
            i.due_at, i.dunning_level, i.last_dunning_at, i.plan,
            u.email AS user_email, o.name AS org_name
       FROM invoices i
       LEFT JOIN users u ON u.id = i.user_id
       LEFT JOIN organizations o ON o.id = i.org_id
      WHERE i.status = 'overdue'
        AND i.invoice_type = 'subscription'
        -- Gate K2.2: eine Rechnung ueber 0,00 EUR wird NIE gemahnt.
        --
        -- Gemessen am 2026-08-30: diese Bedingung fehlte, und der Mahnlauf
        -- haette dem Kunden, dem gerade ein Freimonat geschenkt wurde, eine
        -- Zahlungserinnerung ueber 0,00 EUR geschickt. Der Ausgleich beim
        -- Ausstellen (siehe generateRecurringInvoices) verhindert das schon —
        -- diese Zeile ist der zweite Riegel fuer den Altbestand und fuer jede
        -- Rechnung, die auf anderem Weg auf null faellt.
        AND i.total_cents > 0
        AND i.dunning_level < $1
        AND (i.last_dunning_at IS NULL OR i.last_dunning_at <= $2)
      ORDER BY i.due_at ASC
      LIMIT $3`,
    [MAX_DUNNING_LEVEL, cooldownTs.toISOString(), batch]
  );

  let processed = 0;
  let reminded = 0;
  let skipped = 0;
  const failed = [];

  for (const inv of rows) {
    processed++;
    try {
      const dueAt = inv.due_at ? new Date(inv.due_at) : null;
      const daysOverdue = dueAt ? Math.max(0, Math.floor((nowTs.getTime() - dueAt.getTime()) / DAY_MS)) : 0;

      const targetLevel = resolveDunningLevel(daysOverdue, inv.dunning_level || 0);
      if (!targetLevel) { skipped++; continue; } // noch keine neue Stufe fällig

      const email = inv.user_email;
      if (!email) { skipped++; continue; } // kein Empfänger → ohne Versand keine Markierung

      // Klasse DB_WERT_NACH_UTC: das Fristende wird aus due_at (DB) berechnet und
      // war per toISOString().slice(0,10) nach UTC zurueckgerechnet. Die dem Kunden
      // kommunizierte Schonfrist endete auf dem Papier einen Tag frueher als im
      // System — er haette geglaubt, die Frist verpasst zu haben, oder umgekehrt.
      const graceUntil = dueAt
        ? dateOnlyDE(new Date(dueAt.getTime() + BILLING_GRACE_PERIOD_DAYS * DAY_MS))
        : null;
      const downloadUrl = baseUrl ? `${baseUrl}/public/sla_abo.html` : "";

      const { subject, html } = dunningEmail({
        invoiceNumber: inv.invoice_number,
        amount: (Number(inv.total_cents) || 0) / 100,
        currency: inv.currency || "EUR",
        // Klasse DB_WERT_NACH_UTC: due_at kam korrekt aus der DB und wurde nach UTC
        // zurueckgerechnet. Der Kunde las im Mahnbrief ein Faelligkeitsdatum, das
        // einen Tag vor dem tatsaechlichen liegt — eine falsche Frist in einem
        // zahlungsrelevanten Schreiben.
        dueDate: dueAt ? (dateOnlyDE(dueAt) || "—") : "—",
        orgName: inv.org_name || "Ihre Organisation",
        level: targetLevel,
        daysOverdue,
        graceUntil,
        downloadUrl
      });

      const sent = await sendMail(email, subject, html);
      if (!sent) { failed.push({ id: inv.id, error: "MAIL_NOT_SENT" }); continue; }

      // Stufe erst NACH erfolgreichem Versand markieren.
      await pool.query(
        `UPDATE invoices
            SET dunning_level = $1, last_dunning_at = NOW(), updated_at = NOW()
          WHERE id = $2 AND status = 'overdue'`,
        [targetLevel, inv.id]
      );

      try {
        await auditLog.writeAudit(pool, {
          action: "invoice.dunning_reminder_sent",
          entity_type: "invoice",
          entity_id: inv.id,
          details: {
            invoice_number: inv.invoice_number,
            user_id: inv.user_id,
            org_id: inv.org_id,
            dunning_level: targetLevel,
            days_overdue: daysOverdue,
            auto: true
          }
        });
      } catch { /* best-effort */ }

      reminded++;
    } catch (e) {
      if (logger && typeof logger.warn === "function") {
        logger.warn({ invoice_id: inv.id, err: e.message }, "dunning-sweep: reminder failed for invoice");
      }
      failed.push({ id: inv.id, error: e.message || "ERROR" });
    }
  }

  return { processed, reminded, skipped, failed, batch_size: batch };
}

/* ── 3) Renewal Payment (Happy-Path) ────────────────────────── */

/**
 * Wird beim Zahlungseingang einer Folgerechnung aufgerufen (Staff-Aktion heute /
 * Stripe `invoice.paid`-Webhook nach UG-Gründung). Setzt eine `past_due`-Subscription
 * auf `active` zurück und rollt die Abrechnungsperiode +1 Monat. Idempotent (nur past_due).
 *
 * @param {import('pg').Pool} pool
 * @param {{ userId?: string, subscriptionId?: string, now?: Date|string }} [opts]
 * @returns {Promise<object|null>} aktualisierte Subscription-Zeile oder null
 */
export async function applyRenewalPayment(pool, opts = {}) {
  const nowTs = resolveNow(opts.now);
  const target = opts.subscriptionId
    ? { clause: "id = $1", param: opts.subscriptionId }
    : opts.userId
      ? { clause: "user_id = $1", param: opts.userId }
      : null;
  if (!target) throw new Error("RENEWAL_PAYMENT_TARGET_REQUIRED");

  const { rows } = await pool.query(
    `UPDATE subscriptions
        SET status = 'active',
            current_period_start = COALESCE(current_period_end, $2::timestamptz),
            current_period_end   = COALESCE(current_period_end, $2::timestamptz) + INTERVAL '1 month',
            updated_at = NOW()
      WHERE ${target.clause} AND status = 'past_due'
      RETURNING id, user_id, plan, status, current_period_start, current_period_end`,
    [target.param, nowTs.toISOString()]
  );

  const sub = rows[0] || null;
  if (sub) {
    try {
      await auditLog.writeAudit(pool, {
        action: "subscription.renewal_payment_applied",
        entity_type: "subscription",
        entity_id: sub.id,
        details: { user_id: sub.user_id, plan: sub.plan, new_period_end: sub.current_period_end, auto: true }
      });
    } catch { /* best-effort */ }
  }
  return sub;
}
