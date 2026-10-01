/**
 * Produkt-Mitteilungen per E-Mail — Versand in Paketen (Owner-Entscheid 2026-10-01).
 *
 * WAS HIER FESTGEHALTEN WIRD, und jedes davon faellt im Betrieb erst auf, wenn
 * ein Kunde sich beschwert:
 *   1. EINE Tarifregel — die Zielgruppe der Mail rechnet mit derselben Funktion
 *      wie `getUserAndPlan`, und die Abfrage liest dieselben Fakten.
 *   2. EINE Abfrage je 1000 Nutzer, nicht sieben je Nutzer — und kein Schreiben.
 *   3. Kein Doppelversand: der zweite Klick friert nichts ein, ein Empfaenger
 *      wird nur aus `offen` heraus beansprucht.
 *   4. Fortsetzbar und ehrlich: Abgelehntes wird wiederholt, Haengengebliebenes
 *      nicht; ohne Versandweg bleibt alles offen.
 *   5. Der Widerspruch gilt sofort — auch fuer eine schon eingefrorene Liste.
 *   6. Takt, Registratur und Einplanung meinen dasselbe.
 *   7. Die Staff-Wege: Start und Protokoll in EINER Transaktion, Handkurbel,
 *      Anhalten mit Grund.
 *
 * Alles hier laeuft OHNE Datenbank (Form- und Bindungsproben, Muster-Pool).
 * Den Vergleich gegen die echte Datenbank fuehrt
 * `test/integration/produktUpdateEmpfaenger.flow.test.js`.
 *
 * Run: node --test --test-force-exit test/produktUpdateVersand.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config/index.js";
import * as svc from "../services/productReleaseService.js";
import * as versand from "../services/produktUpdateVersandService.js";
import { effektiverPlan, kuendigungFaellig } from "../services/userService.js";
import { mailKoepfe } from "../services/emailService.js";
import { LAEUFE, produktUpdatePakete, produktUpdateAufbewahrung } from "../services/betriebsTaktLaeufe.js";
import { TAKTE } from "../services/betriebsTaktService.js";
import { createStaffControlCenterRouter } from "../routes/staffControlCenter.js";
import { darfStaffBereich } from "../config/staffRollen.js";

const API = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (rel) => fs.readFileSync(path.join(API, rel), "utf8");

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const REL = "44444444-4444-4444-8444-444444444444";
const STAFF = "55555555-5555-4555-8555-555555555555";
const KEY = "probe-schluessel";
const leise = { info() {}, warn() {}, error() {}, debug() {} };

/** Muster-Pool: Antworten nach Teilzeichenkette/Regex; alle Aufrufe werden mitgeschrieben. */
function pool(routes = []) {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql: String(sql), params });
    for (const r of routes) {
      const passt = r.match instanceof RegExp ? r.match.test(String(sql)) : String(sql).includes(r.match);
      if (passt) {
        if (r.wirft) throw r.wirft;
        const rows = typeof r.rows === "function" ? r.rows({ sql: String(sql), params }) : (r.rows || []);
        return { rows, rowCount: r.rowCount ?? rows.length };
      }
    }
    return { rows: [], rowCount: 0 };
  };
  return { calls, query, connect: async () => ({ query, release() {} }) };
}

const fakten = (id, extra = {}) => ({
  id, role: "company", is_demo: false, org_role: "owner", org_plan: "PLUS", pilot_status: null,
  abo_plan: "PLUS", abo_status: "active", abo_cancel_at: null, intern: false, abgemeldet: false, ...extra
});

const MITTEILUNG = {
  id: REL, title: "Neu: Verwaltung", summary: "Kurz", body: null, feature_key: null, audiences: [],
  min_plan: null, required_feature_key: null, visibility: "public", status: "published",
  published_at: "2026-09-30T10:00:00Z", show_in_app: true, send_email_on_publish: false, email_sent_at: null,
  priority: 0, show_as_modal: false, created_at: "2026-09-30", updated_at: "2026-09-30"
};

/* ── 1. Eine Tarifregel ──────────────────────────────────────────────────── */

describe("Tarifregel: eine Fassung fuer getUserAndPlan und den Versand", () => {
  it("aktiver Pilot ist INDIVIDUELL — ausser auf einem Demo-Konto", () => {
    assert.deepEqual(effektiverPlan({ orgPlan: "BASIS", pilotStatus: "active" }), { plan: "INDIVIDUELL", istAktiverPilot: true });
    assert.deepEqual(effektiverPlan({ orgPlan: "BASIS", pilotStatus: "active", istDemo: true }), { plan: "BASIS", istAktiverPilot: false });
    assert.equal(effektiverPlan({ orgPlan: "BASIS", pilotStatus: "ended" }).plan, "BASIS");
  });

  it("der Tarif der Organisation geht vor dem Abo; ohne beides DEMO", () => {
    assert.equal(effektiverPlan({ orgPlan: "PRO", aboPlan: "BASIS" }).plan, "PRO");
    assert.equal(effektiverPlan({ orgPlan: null, aboPlan: "BASIS" }).plan, "BASIS");
    assert.equal(effektiverPlan({}).plan, "DEMO");
  });

  it("Altnamen werden kanonisch: ENTERPRISE/INDIVIDUAL -> INDIVIDUELL, FREE -> DEMO", () => {
    assert.equal(effektiverPlan({ orgPlan: "ENTERPRISE" }).plan, "INDIVIDUELL");
    assert.equal(effektiverPlan({ aboPlan: "INDIVIDUAL" }).plan, "INDIVIDUELL");
    assert.equal(effektiverPlan({ aboPlan: "FREE" }).plan, "DEMO");
  });

  it("eine Kuendigung ist faellig, wenn sie 'canceling' ist und ihr Datum erreicht ist — sonst nicht", () => {
    const jetzt = new Date("2026-10-01T12:00:00Z");
    assert.equal(kuendigungFaellig({ status: "canceling", cancel_at: "2026-10-01T11:59:59Z" }, jetzt), true);
    assert.equal(kuendigungFaellig({ status: "canceling", cancel_at: "2026-10-01T12:00:00Z" }, jetzt), true);
    assert.equal(kuendigungFaellig({ status: "canceling", cancel_at: "2026-10-01T12:00:01Z" }, jetzt), false);
    assert.equal(kuendigungFaellig({ status: "active", cancel_at: "2026-01-01" }, jetzt), false);
    assert.equal(kuendigungFaellig({ status: "canceling", cancel_at: null }, jetzt), false);
    assert.equal(kuendigungFaellig({ status: "canceling", cancel_at: "kein Datum" }, jetzt), false);
    assert.equal(kuendigungFaellig(null, jetzt), false);
  });

  it("getUserAndPlan rechnet mit genau diesen Funktionen — und hat keine zweite Fassung mehr", () => {
    const quelle = lies("services/userService.js");
    const gup = quelle.slice(quelle.indexOf("export async function getUserAndPlan"));
    assert.match(gup, /effektiverPlan\(\{/, "getUserAndPlan nutzt effektiverPlan");
    assert.match(gup, /if \(kuendigungFaellig\(subscription\)\)/, "getUserAndPlan nutzt kuendigungFaellig");
    assert.equal((quelle.match(/=== "ENTERPRISE"/g) || []).length, 1, "die Altnamen-Regel steht genau einmal");
    assert.ok(!lies("services/productReleaseService.js").includes('"ENTERPRISE"'),
      "der Versand schreibt die Tarifregel nicht ab");
  });
});

/* ── 2. Die Empfaenger-Abfrage ───────────────────────────────────────────── */

describe("Empfaenger: eine Abfrage je Seite, dieselben Fakten wie getUserAndPlan", () => {
  const sql = svc.EMPFAENGER_SQL;

  it("liest die Mitgliedschaft wie getUserAndPlan: aktiv, in der eigenen Organisation, sonst die aelteste", () => {
    assert.ok(sql.includes("om.user_id = u.id AND om.is_active = TRUE"));
    assert.ok(sql.includes("(u.org_id IS NULL OR om.org_id = u.org_id)"));
    assert.ok(sql.includes("ORDER BY om.created_at ASC"));
    // Die Kopplung: aendert getUserAndPlan seinen Leseweg, wird diese Probe rot —
    // und zeigt auf EMPFAENGER_SQL, das mitgezogen werden muss.
    const gup = lies("services/userService.js");
    assert.ok(gup.includes("WHERE om.user_id = $1 AND om.is_active = TRUE"), "getUserAndPlan liest die Mitgliedschaft anders — EMPFAENGER_SQL mitziehen");
    assert.ok(gup.includes("ORDER BY om.created_at ASC LIMIT 1"), "getUserAndPlan waehlt die Mitgliedschaft anders — EMPFAENGER_SQL mitziehen");
  });

  it("liest das juengste Abo wie loadLatestSubscription", () => {
    assert.ok(sql.includes("ORDER BY sub.created_at DESC"));
    assert.ok(/FROM subscriptions sub\s+WHERE sub\.user_id = u\.id\s+ORDER BY sub\.created_at DESC\s+LIMIT 1/.test(sql));
    const gup = lies("services/userService.js");
    assert.ok(/FROM subscriptions\s+WHERE user_id = \$1\s+ORDER BY created_at DESC\s+LIMIT 1/.test(gup),
      "loadLatestSubscription liest anders — EMPFAENGER_SQL mitziehen");
  });

  it("intern heisst: Rolle admin oder aktive Mitgliedschaft platform_admin (wie loadReleaseContext)", () => {
    assert.ok(sql.includes("u.role = 'admin'"));
    assert.ok(sql.includes("pa.is_active = TRUE AND pa.role_key = 'platform_admin'"));
  });

  it("schliesst aus, wer nichts empfangen kann: Demo, anonymisiert, inaktiv, ohne Adresse", () => {
    assert.ok(sql.includes("COALESCE(u.is_demo, FALSE) = FALSE"));
    assert.ok(sql.includes("u.email NOT ILIKE $2"));
    assert.ok(sql.includes("u.role NOT IN ('inactive')"));
    assert.ok(sql.includes("u.email IS NOT NULL AND TRIM(u.email) <> ''"));
  });

  it("Bindung: Kategorie, anonymisierte Domain, Keyset, Seitengroesse", async () => {
    const p = pool([{ match: "LEFT JOIN LATERAL", rows: [] }]);
    await svc.ermittleEmpfaenger(p, MITTEILUNG);
    assert.equal(p.calls.length, 1);
    assert.deepEqual(p.calls[0].params, ["product_updates", "%@anonymized.local", null, 1000]);
    assert.ok(p.calls[0].sql.includes("($3::uuid IS NULL OR u.id > $3::uuid)"));
    assert.ok(/ORDER BY u\.id\s+LIMIT \$4/.test(p.calls[0].sql));
  });

  it("2500 Nutzer kosten DREI Abfragen — und keine schreibt", async () => {
    const ids = Array.from({ length: 2500 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    const p = pool([{
      match: "LEFT JOIN LATERAL",
      rows: ({ params }) => {
        const ab = params[2] ? ids.indexOf(params[2]) + 1 : 0;
        return ids.slice(ab, ab + params[3]).map((id) => fakten(id));
      }
    }]);
    const r = await svc.ermittleEmpfaenger(p, MITTEILUNG);
    assert.equal(r.empfaenger.length, 2500);
    assert.equal(p.calls.length, 3, "eine Abfrage je Seite, nicht je Nutzer");
    assert.equal(p.calls[1].params[2], ids[999], "die zweite Seite beginnt nach dem letzten der ersten");
    assert.equal(p.calls[2].params[2], ids[1999]);
    assert.ok(p.calls.every((c) => /^\s*SELECT/.test(c.sql)), "die Ermittlung schreibt nichts");
  });

  it("der Kontext aus einer Zeile: faellige Kuendigung zaehlt als DEMO, die Organisation geht vor", () => {
    const jetzt = new Date("2026-10-01T12:00:00Z");
    const faellig = { abo_plan: "PRO", abo_status: "canceling", abo_cancel_at: "2026-09-30T00:00:00Z" };
    assert.equal(svc.kontextAusZeile(fakten(A, { org_plan: null, ...faellig }), jetzt).plan, "DEMO");
    assert.equal(svc.kontextAusZeile(fakten(A, { org_plan: "BASIS", ...faellig }), jetzt).plan, "BASIS",
      "wie getUserAndPlan: der Tarif der Organisation bleibt, wenn sie einen hat");
    assert.equal(svc.kontextAusZeile(fakten(A, { org_plan: null, abo_plan: "PRO" }), jetzt).plan, "PRO");
    assert.equal(svc.kontextAusZeile(fakten(A, { pilot_status: "active", org_plan: "BASIS" }), jetzt).plan, "INDIVIDUELL");
    assert.deepEqual(svc.kontextAusZeile(fakten(A, { role: null, org_role: null, intern: true }), jetzt),
      { userId: A, userRole: "company", orgRole: null, plan: "PLUS", isInternalViewer: true });
  });

  it("die Zielgruppe entscheidet entryVisibleForUser: Tarif und Zielgruppe", async () => {
    const p = pool([{
      match: "LEFT JOIN LATERAL",
      rows: [fakten(A, { org_plan: "BASIS" }), fakten(B, { org_plan: "INDIVIDUELL" }), fakten(C, { role: "agency", org_plan: "PRO" })]
    }]);
    const abPlus = await svc.ermittleEmpfaenger(p, { ...MITTEILUNG, min_plan: "PLUS" });
    assert.deepEqual(abPlus.empfaenger, [B, C]);
    assert.equal(abPlus.nicht_in_zielgruppe, 1);
    const nurFirmen = await svc.ermittleEmpfaenger(p, { ...MITTEILUNG, audiences: ["agency"] });
    assert.deepEqual(nurFirmen.empfaenger, [C]);
  });
});

/* ── 3. Einfrieren: der Riegel gegen den zweiten Klick ───────────────────── */

describe("Start: die Liste wird einmal eingefroren", () => {
  it("eine leere Zielgruppe friert nichts ein und stempelt nichts", async () => {
    const p = pool();
    assert.deepEqual(await versand.versandEinfrieren(p, REL, []), { gestartet: false, grund: "LEERE_ZIELGRUPPE" });
    assert.equal(p.calls.length, 0);
  });

  it("der Stempel ist die Pruefung: bedingtes UPDATE, dann die Liste ohne Dubletten", async () => {
    const p = pool([
      { match: "UPDATE product_release_entries", rowCount: 1 },
      { match: "INSERT INTO product_release_mail_empfaenger", rowCount: 2 }
    ]);
    const r = await versand.versandEinfrieren(p, REL, [A, B]);
    assert.deepEqual(r, { gestartet: true, eingereiht: 2 });
    const [stempel, liste] = p.calls;
    assert.ok(stempel.sql.includes("email_sent_at IS NULL"), "nur ein UPDATE findet die Zeile noch ungestempelt");
    assert.ok(stempel.sql.includes("status = 'published'"));
    assert.deepEqual(stempel.params, [REL]);
    assert.ok(liste.sql.includes("unnest($2::uuid[])"));
    assert.ok(liste.sql.includes("ON CONFLICT (release_id, user_id) DO NOTHING"));
    assert.deepEqual(liste.params, [REL, [A, B]]);
  });

  it("wer zu spaet kommt, friert NICHTS ein", async () => {
    const p = pool([{ match: "UPDATE product_release_entries", rowCount: 0 }]);
    assert.deepEqual(await versand.versandEinfrieren(p, REL, [A, B]), { gestartet: false, grund: "SCHON_GESTARTET" });
    assert.equal(p.calls.filter((c) => c.sql.includes("INSERT")).length, 0);
  });
});

/* ── 4. Ein Paket ────────────────────────────────────────────────────────── */

/** Eine Welt mit eingefrorener Liste; `beansprucht` liefert, was das Beanspruchen zurueckgibt. */
function paketWelt({ eintrag = MITTEILUNG, kandidaten = [A, B, C], beansprucht } = {}) {
  const standard = (id) => [{ email: `${id.slice(0, 4)}@kunde.de`, role: "company", versuche: 1, abgemeldet: false }];
  return pool([
    { match: "SELECT id, title, summary, status FROM product_release_entries", rows: eintrag ? [eintrag] : [] },
    { match: "SELECT user_id FROM product_release_mail_empfaenger", rows: kandidaten.map((user_id) => ({ user_id })) },
    { match: "SET status = 'in_arbeit'", rows: ({ params }) => (beansprucht ? beansprucht(params[1]) : standard(params[1])) },
    { match: "UPDATE product_release_mail_empfaenger", rowCount: 1 }
  ]);
}
const abschluesse = (p) => p.calls.filter((c) => /UPDATE product_release_mail_empfaenger\s+SET status = \$3/.test(c.sql));

describe("Paket: beanspruchen, senden, abschliessen", () => {
  it("beansprucht nur aus 'offen' heraus — Bindung Mitteilung, Empfaenger, Kategorie", async () => {
    const p = paketWelt({ kandidaten: [A] });
    await versand.paketSenden(p, REL, { sendMail: async () => true, schluessel: KEY });
    const b = p.calls.find((c) => c.sql.includes("SET status = 'in_arbeit'"));
    assert.ok(b.sql.includes("e.status = 'offen'"), "ein zweiter Lauf darf denselben Empfaenger nicht nehmen");
    assert.ok(b.sql.includes("versuche = e.versuche + 1"));
    assert.deepEqual(b.params, [REL, A, "product_updates"]);
    const ab = abschluesse(p)[0];
    assert.ok(ab.sql.includes("AND status = 'in_arbeit'"));
    assert.deepEqual(ab.params, [REL, A, "gesendet", null]);
    // Gemessen am laufenden System: ohne die Typen leitet PostgreSQL fuer $3 zwei
    // verschiedene ab und wirft bei JEDEM Empfaenger. Der Muster-Pool merkt das nie —
    // deshalb steht der Typ hier als Form fest (und laeuft in der DB-Probe echt).
    assert.ok(ab.sql.includes("SET status = $3::text, fehler = $4::text"), ab.sql);
    assert.ok(ab.sql.includes("CASE WHEN $3::text = 'gesendet'"), ab.sql);
  });

  it("die Kandidaten: nur offene, aelteste zuerst, hoechstens ein Paket", async () => {
    const p = paketWelt({ kandidaten: [] });
    await versand.paketSenden(p, REL, { sendMail: async () => true, schluessel: KEY });
    const k = p.calls.find((c) => c.sql.includes("SELECT user_id FROM product_release_mail_empfaenger"));
    assert.ok(k.sql.includes("status = 'offen'"));
    assert.ok(k.sql.includes("ORDER BY angelegt_am, user_id"));
    assert.deepEqual(k.params, [REL, 20]);
    const q = paketWelt({ kandidaten: [] });
    await versand.paketSenden(q, REL, { sendMail: async () => true, schluessel: KEY, groesse: 5 });
    assert.equal(q.calls.find((c) => c.sql.includes("LIMIT $2")).params[1], 5);
  });

  it("war ein anderer Lauf schneller, wird NICHT gesendet", async () => {
    const gesendet = [];
    const p = paketWelt({ kandidaten: [A, B], beansprucht: (id) => (id === A ? [] : [{ email: "b@kunde.de", role: "company", versuche: 1, abgemeldet: false }]) });
    const r = await versand.paketSenden(p, REL, { sendMail: async (to) => { gesendet.push(to); return true; }, schluessel: KEY });
    assert.deepEqual(gesendet, ["b@kunde.de"]);
    assert.equal(r.gesendet, 1);
  });

  it("abgelehnt -> im naechsten Paket erneut; beim dritten Versuch endgueltig fehlgeschlagen", async () => {
    const p = paketWelt({ kandidaten: [A, B], beansprucht: (id) => [{ email: "x@kunde.de", role: "company", versuche: id === A ? 1 : 3, abgemeldet: false }] });
    const r = await versand.paketSenden(p, REL, { sendMail: async () => false, schluessel: KEY });
    assert.equal(r.erneut, 1);
    assert.equal(r.fehlgeschlagen, 1);
    const zurueck = p.calls.find((c) => c.sql.includes("SET status = 'offen', fehler = 'zustellung'"));
    assert.deepEqual(zurueck.params, [REL, A]);
    assert.ok(zurueck.sql.includes("AND status = 'in_arbeit'"));
    assert.deepEqual(abschluesse(p)[0].params, [REL, B, "fehlgeschlagen", "zustellung"]);
  });

  it("ein Wurf des Mailwegs zaehlt wie eine Ablehnung — die Mail ist nicht raus", async () => {
    const p = paketWelt({ kandidaten: [A] });
    const r = await versand.paketSenden(p, REL, { sendMail: async () => { throw new Error("ECONNRESET"); }, schluessel: KEY });
    assert.equal(r.erneut, 1);
    assert.equal(r.gesendet, 0);
  });

  it("ohne Versandweg: zurueck auf offen, Versuch nicht gezaehlt, Paket beendet", async () => {
    const gesendet = [];
    const kein = Object.assign(new Error("Kein E-Mail-Versandweg"), { code: "MAIL_NO_TRANSPORT" });
    const p = paketWelt({ kandidaten: [A, B] });
    const r = await versand.paketSenden(p, REL, { sendMail: async (to) => { gesendet.push(to); throw kein; }, schluessel: KEY });
    assert.equal(r.kein_versandweg, true);
    assert.equal(gesendet.length, 1, "nach dem ersten Wurf wird nicht weiter versucht");
    const zurueck = p.calls.find((c) => c.sql.includes("GREATEST(versuche - 1, 0)"));
    assert.ok(zurueck, "der Versuch wird zurueckgenommen");
    assert.deepEqual(zurueck.params, [REL, A]);
    assert.equal(p.calls.filter((c) => c.sql.includes("SET status = 'in_arbeit'")).length, 1, "B wurde gar nicht erst beansprucht");
  });

  it("wer inzwischen abbestellt hat, bekommt nichts — wer keine Adresse hat, auch nicht", async () => {
    const gesendet = [];
    const p = paketWelt({
      kandidaten: [A, B, C],
      beansprucht: (id) => [{
        email: id === C ? "  " : `${id.slice(0, 4)}@kunde.de`, role: id === B ? "company" : "company",
        versuche: 1, abgemeldet: id === B
      }]
    });
    const r = await versand.paketSenden(p, REL, { sendMail: async (to) => { gesendet.push(to); return true; }, schluessel: KEY });
    assert.deepEqual(gesendet, ["1111@kunde.de"]);
    assert.equal(r.entfallen, 2);
    const grund = abschluesse(p).filter((c) => c.params[2] === "entfallen").map((c) => [c.params[1], c.params[3]]);
    assert.deepEqual(grund, [[B, "abgemeldet"], [C, "ohne_adresse"]]);
    const b = p.calls.find((c) => c.sql.includes("SET status = 'in_arbeit'"));
    assert.ok(b.sql.includes("np.channel_email = FALSE"), "der Widerspruch wird beim Versand gelesen, nicht nur beim Einfrieren");
  });

  it("eine zurueckgezogene Mitteilung sendet nichts — eine geloeschte auch nicht", async () => {
    for (const [eintrag, grund] of [[{ ...MITTEILUNG, status: "draft" }, "NICHT_VEROEFFENTLICHT"], [null, "NICHT_GEFUNDEN"]]) {
      let gesendet = 0;
      const p = paketWelt({ eintrag });
      const r = await versand.paketSenden(p, REL, { sendMail: async () => { gesendet++; return true; }, schluessel: KEY });
      assert.equal(r.angehalten, grund);
      assert.equal(gesendet, 0);
      assert.equal(p.calls.length, 1, "nach dem Blick auf die Mitteilung keine weitere Abfrage");
    }
  });

  it("ohne Versandweg-Funktion und ohne Schluessel wird gar nicht erst angefangen", async () => {
    const p = paketWelt();
    await assert.rejects(versand.paketSenden(p, REL, { schluessel: KEY }), /ohne Versandweg/);
    await assert.rejects(versand.paketSenden(p, REL, { sendMail: async () => true }), /ohne Abmelde-Schluessel/);
    assert.equal(p.calls.length, 0);
  });
});

/* ── 5. Der Takt ─────────────────────────────────────────────────────────── */

describe("Takt: Lauf, Registratur, Einplanung", () => {
  it("der Lauf steht in LAEUFE, sein Soll in TAKTE, seine Einplanung jede Minute", () => {
    assert.equal(LAEUFE["produkt-update-pakete"], produktUpdatePakete);
    assert.equal(TAKTE["produkt-update-pakete"]?.intervall_min, 1);
    const index = lies("workers/index.js");
    assert.ok(/upsertJobScheduler\("produkt-update-pakete-1min", \{ pattern: "\* \* \* \* \*" \}, \{ name: "produkt-update-pakete" \}\)/.test(index));
  });

  it("nichts zu tun ist kein Fehler — eine einzige Abfrage", async () => {
    const p = pool();
    const r = await produktUpdatePakete(p, { config: {}, logger: leise, sendMail: async () => true });
    assert.deepEqual(r, { leer: true });
    assert.equal(p.calls.length, 1);
    assert.ok(p.calls[0].sql.includes("r.status = 'published'"), "zurueckgezogene Mitteilungen ruhen");
    assert.ok(p.calls[0].sql.includes("e.status = 'offen'"));
  });

  it("ohne Versandweg wirft der Lauf — sonst stuende er gruen, waehrend Mails liegen", async () => {
    await assert.rejects(produktUpdatePakete(pool(), { config: {}, logger: leise }), /keinen Versandweg/);
    // Der Takt bekommt Arbeit, der Mailweg lehnt hart ab -> der Lauf scheitert sichtbar.
    const welt = paketWelt({ kandidaten: [A] });
    const query = async (sql, params) => (String(sql).includes("JOIN product_release_entries r")
      ? { rows: [{ release_id: REL }], rowCount: 1 }
      : welt.query(sql, params));
    const kein = Object.assign(new Error("Kein E-Mail-Versandweg"), { code: "MAIL_NO_TRANSPORT" });
    await assert.rejects(
      produktUpdatePakete({ query }, { config: { JWT_SECRET: KEY }, logger: leise, sendMail: async () => { throw kein; } }),
      (e) => e.code === "MAIL_NO_TRANSPORT"
    );
  });

  it("der Lauf signiert die Abmeldelinks mit dem Schluessel aus der Umgebung", async () => {
    const welt = paketWelt({ kandidaten: [A] });
    const query = async (sql, params) => (String(sql).includes("JOIN product_release_entries r")
      ? { rows: [{ release_id: REL }], rowCount: 1 }
      : welt.query(sql, params));
    const mails = [];
    const r = await produktUpdatePakete({ query }, {
      config: { JWT_SECRET: KEY, BASE_URL: "https://tempconnect.de" }, logger: leise,
      sendMail: async (to, betreff, html, opts) => { mails.push(opts); return true; }
    });
    assert.equal(r.gesendet, 1);
    const link = mails[0].headers["List-Unsubscribe"];
    const t = /[?&]t=([^&>]+)/.exec(link)[1];
    assert.equal(svc.pruefeAbmeldung(A, t, KEY), true);
  });
});

/* ── 5b. Aufbewahrung: 12 Monate (Owner-Entscheid 2026-10-01) ─────────────── */

describe("Aufbewahrung: Empfaengerlisten nach 12 Monaten loeschen", () => {
  const mig = fs.readFileSync(path.join(API, "..", "sql", "migrations", "228_produkt_update_empfaenger_aufbewahrung.sql"), "utf8");

  it("die Regel steht in der Datenbank: Listen, die vor mehr als 12 Monaten eingefroren wurden", () => {
    assert.ok(/DELETE FROM product_release_mail_empfaenger\s+WHERE angelegt_am < NOW\(\) - INTERVAL '12 months';/.test(mig), mig);
    assert.ok(mig.includes("RETURNS INTEGER"));
    assert.ok(mig.includes("ROLLBACK") && mig.includes("DROP FUNCTION IF EXISTS produkt_update_empfaenger_aufraeumen();"));
  });

  it("der Code kennt die Frist nicht — sonst gaebe es zwei Zahlen", () => {
    for (const datei of ["services/produktUpdateVersandService.js", "services/betriebsTaktLaeufe.js", "workers/index.js"]) {
      assert.ok(!/INTERVAL\s+'\d+\s*months?'/i.test(lies(datei)), `${datei} rechnet die Frist selbst`);
    }
  });

  it("der Aufruf: genau die Funktion, die Zahl kommt zurueck", async () => {
    const p = pool([{ match: "produkt_update_empfaenger_aufraeumen()", rows: [{ geloescht: "44" }] }]);
    assert.deepEqual(await versand.aufbewahrungDurchsetzen(p), { geloescht: 44 });
    assert.equal(p.calls[0].sql, "SELECT produkt_update_empfaenger_aufraeumen() AS geloescht");
  });

  it("der Takt protokolliert nur, wenn er etwas geloescht hat", async () => {
    const leer = pool([{ match: "produkt_update_empfaenger_aufraeumen()", rows: [{ geloescht: 0 }] }]);
    assert.deepEqual(await produktUpdateAufbewahrung(leer), { geloescht: 0 });
    assert.equal(leer.calls.filter((c) => /audit/i.test(c.sql)).length, 0, "eine Nacht ohne Loeschung ist kein Protokolleintrag");

    const voll = pool([{ match: "produkt_update_empfaenger_aufraeumen()", rows: [{ geloescht: 44 }] }]);
    assert.deepEqual(await produktUpdateAufbewahrung(voll), { geloescht: 44 });
    const audit = voll.calls.filter((c) => /audit/i.test(c.sql));
    assert.equal(audit.length, 1, "eine Loeschung personenbezogener Zuordnungen bleibt nachvollziehbar");
    assert.ok(JSON.stringify(audit[0].params).includes("product_release.recipients_retention"));
    assert.ok(JSON.stringify(audit[0].params).includes('\\"geloescht\\":44') || JSON.stringify(audit[0].params).includes('"geloescht":44'));
  });

  it("Lauf, Soll und Einplanung: taeglich 04:15", () => {
    assert.equal(LAEUFE["produkt-update-aufbewahrung"], produktUpdateAufbewahrung);
    assert.equal(TAKTE["produkt-update-aufbewahrung"]?.intervall_min, 1440);
    assert.ok(/upsertJobScheduler\("produkt-update-aufbewahrung-daily", \{ pattern: "15 4 \* \* \*" \}, \{ name: "produkt-update-aufbewahrung" \}\)/.test(lies("workers/index.js")));
  });
});

/* ── 6. Der Stand ────────────────────────────────────────────────────────── */

describe("Stand: was das Staff Control Center zeigt", () => {
  const jetzt = Date.parse("2026-10-01T12:00:00Z");
  const zeile = (extra = {}) => ({
    gesamt: 1240, offen: 928, in_arbeit: 0, unklar: 0, gesendet: 312, fehlgeschlagen: 0, entfallen: 0,
    zuletzt_bewegt_am: "2026-10-01T11:59:30Z", ...extra
  });

  it("nie gestartet -> null; vor dem Paketversand gemailt -> alter_versand, ohne erfundene Zahlen", () => {
    assert.equal(versand.bewerteStand(null, { gestartetAm: null }), null);
    assert.deepEqual(versand.bewerteStand(undefined, { gestartetAm: "2026-09-01" }), { alter_versand: true, gestartet_am: "2026-09-01" });
  });

  it("laeuft: 312 von 1.240, noch 47 Pakete, nicht fertig, stockt nicht", () => {
    const s = versand.bewerteStand(zeile(), { gestartetAm: "2026-10-01T11:00:00Z", jetzt });
    assert.equal(s.gesendet, 312);
    assert.equal(s.gesamt, 1240);
    assert.equal(s.rest_minuten, 47);
    assert.equal(s.fertig, false);
    assert.equal(s.stockt, false);
  });

  it("stockt ab fuenf stillen Minuten — und ruht, wenn die Mitteilung zurueckgezogen ist", () => {
    const still = zeile({ zuletzt_bewegt_am: "2026-10-01T11:55:00Z" });
    assert.equal(versand.bewerteStand(still, { gestartetAm: "x", jetzt }).stockt, true);
    assert.equal(versand.bewerteStand(zeile({ zuletzt_bewegt_am: "2026-10-01T11:55:01Z" }), { gestartetAm: "x", jetzt }).stockt, false);
    const ruht = versand.bewerteStand(still, { gestartetAm: "x", veroeffentlicht: false, jetzt });
    assert.equal(ruht.stockt, false);
    assert.equal(ruht.pausiert, true);
  });

  it("fertig, wenn nichts mehr offen und nichts mehr frisch in Arbeit ist — Haengengebliebenes zaehlt als unklar", () => {
    const s = versand.bewerteStand(zeile({ offen: 0, gesendet: 1237, unklar: 1, fehlgeschlagen: 2 }), { gestartetAm: "x", jetzt });
    assert.equal(s.fertig, true);
    assert.equal(s.unklar, 1);
    assert.equal(s.rest_minuten, 0);
    assert.equal(versand.bewerteStand(zeile({ offen: 0, in_arbeit: 3 }), { gestartetAm: "x", jetzt }).fertig, false);
  });

  it("der Stand vieler Mitteilungen kostet EINE Abfrage; Ungestartete fragen nicht mit", async () => {
    const p = pool([{ match: "FROM product_release_mail_empfaenger", rows: [{ release_id: A, ...zeile() }] }]);
    const m = await versand.versandStaende(p, [
      { id: A, email_sent_at: "2026-10-01T11:00:00Z", status: "published" },
      { id: B, email_sent_at: null, status: "published" }
    ], { jetzt });
    assert.equal(p.calls.length, 1);
    assert.deepEqual(p.calls[0].params, [[A], 15]);
    assert.ok(p.calls[0].sql.includes("make_interval(mins => $2)"));
    assert.ok(p.calls[0].sql.includes("release_id = ANY($1::uuid[])"));
    assert.equal(m.get(A).gesendet, 312);
    assert.equal(m.get(B), null);
  });

  it("Anhalten trifft nur Offenes — Gesendetes bleibt gesendet", async () => {
    const p = pool([{ match: "UPDATE product_release_mail_empfaenger", rowCount: 928 }]);
    assert.equal(await versand.versandAnhalten(p, REL), 928);
    assert.ok(p.calls[0].sql.includes("SET status = 'entfallen', fehler = 'angehalten'"));
    assert.ok(p.calls[0].sql.includes("WHERE release_id = $1 AND status = 'offen'"));
    assert.deepEqual(p.calls[0].params, [REL]);
  });

  it("die Vorschau rechnet die Dauer: das erste Paket sofort, dann eines je Minute", () => {
    assert.deepEqual(versand.pakete(0), { pakete: 0, dauer_minuten: 0 });
    assert.deepEqual(versand.pakete(20), { pakete: 1, dauer_minuten: 0 });
    assert.deepEqual(versand.pakete(21), { pakete: 2, dauer_minuten: 1 });
    assert.deepEqual(versand.pakete(1240), { pakete: 62, dauer_minuten: 61 });
  });
});

/* ── 7. Kopfzeilen ───────────────────────────────────────────────────────── */

describe("Kopfzeilen: nur List-Unsubscribe, nur einzeilig", () => {
  it("laesst List-Unsubscribe durch, alles andere nicht", () => {
    assert.deepEqual(mailKoepfe({ "List-Unsubscribe": "<https://x.de/a>", "Bcc": "x@y.de", "X-Priority": "1" }),
      { "List-Unsubscribe": "<https://x.de/a>" });
    assert.deepEqual(mailKoepfe({ "list-unsubscribe": "<https://x.de/a>" }), { "list-unsubscribe": "<https://x.de/a>" });
  });

  it("Owner-Entscheid 2026-10-01: Ein-Klick bleibt aus — List-Unsubscribe-Post kommt nicht durch", () => {
    /* Abbestellen mit einem Klick direkt im Postfach (RFC 8058) braeuchte einen
     * Endpunkt ohne CSRF-Schutz. Der Owner hat entschieden: bleibt aus. Wer den Kopf
     * freischaltet, macht diese Probe rot und muss die Entscheidung neu einholen. */
    assert.equal(mailKoepfe({ "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }), null);
    assert.deepEqual(
      mailKoepfe({ "List-Unsubscribe": "<https://x.de/a>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }),
      { "List-Unsubscribe": "<https://x.de/a>" });
    assert.ok(!lies("services/produktUpdateVersandService.js").includes("List-Unsubscribe-Post"));
  });

  it("ein Zeilenumbruch im Wert ist eine Einschleusung — der Kopf faellt weg", () => {
    assert.equal(mailKoepfe({ "List-Unsubscribe": "<https://x.de>\r\nBcc: opfer@x.de" }), null);
    assert.equal(mailKoepfe({ "List-Unsubscribe": "" }), null);
    assert.equal(mailKoepfe(null), null);
    assert.equal(mailKoepfe("List-Unsubscribe: x"), null);
  });

  it("beide Mailwege reichen den gefilterten Kopf weiter", () => {
    const app = lies("app.js");
    assert.ok(app.includes("const koepfe = mailKoepfe(opts?.headers);"));
    assert.ok(app.includes("html: mitRahmen(html, subject), ...(koepfe ? { headers: koepfe } : {}) });"));
    assert.ok(app.includes("await emailServiceSendMail({ to, subject, html, from: SMTP_FROM, zweck, headers: koepfe });"));
    const es = lies("services/emailService.js");
    assert.ok(es.includes("const koepfe = mailKoepfe(headers);"));
    assert.ok(es.includes("...(koepfe ? { headers: koepfe } : {}),"));
  });
});

/* ── 7b. Das Versandprotokoll schreibt wirklich (M1.3) ───────────────────── */

describe("Versandprotokoll: die Einfuege-Abfrage traegt ihre Typen", () => {
  it("$3/$4/$5 sind typisiert — ohne das scheiterte JEDER Aufruf, und mail_versand blieb leer", async () => {
    const { mailNotieren } = await import("../services/mailProtokollService.js");
    const p = pool([{ match: "INSERT INTO mail_versand", rowCount: 1 }]);
    assert.equal(await mailNotieren(p, { zweck: "produkt-update", ergebnis: "zugestellt", weg: "smtp" }), true);
    const sql = p.calls[0].sql;
    assert.ok(sql.includes("$4::text, $5::text"), sql);
    assert.ok(sql.includes("CASE WHEN $5::text IS NULL"), sql);
    assert.ok(sql.includes("CASE WHEN $3::text = 'zugestellt'"), sql);
    assert.deepEqual(p.calls[0].params.slice(2), ["zugestellt", "smtp", null]);
  });
});

/* ── 8. Die Staff-Wege ───────────────────────────────────────────────────── */

function kette(router, methode, pfad) {
  const s = router.stack.find((l) => l.route && l.route.path === pfad && l.route.methods[methode]);
  assert.ok(s, `Route ${methode.toUpperCase()} ${pfad} fehlt`);
  return s.route.stack;
}
const handler = (router, m, p) => { const k = kette(router, m, p); return k[k.length - 1].handle; };
function mockRes() {
  const res = { _status: 200, _json: null };
  res.status = (c) => { res._status = c; return res; };
  res.json = (b) => { res._json = b; return res; };
  return res;
}
const req = (extra = {}) => ({
  body: {}, query: {}, params: { id: REL }, headers: {}, ip: "127.0.0.1",
  sccActorId: STAFF, sccReason: "Neue Verwaltung fuer alle Kunden", ...extra
});
const staff = (p, extra = {}) => createStaffControlCenterRouter({ pool: p, logger: leise, sendMail: async () => true, ...extra });

/** Eine veroeffentlichte Mitteilung, drei Kunden; der Start gelingt. */
function startWelt({ stempel = 1 } = {}) {
  return pool([
    { match: "SELECT * FROM product_release_entries WHERE id", rows: [MITTEILUNG] },
    { match: "LEFT JOIN LATERAL", rows: ({ params }) => (params[2] ? [] : [fakten(A), fakten(B, { abgemeldet: true }), fakten(C)]) },
    { match: "UPDATE product_release_entries", rowCount: stempel },
    { match: "INSERT INTO product_release_mail_empfaenger", rowCount: 2 },
    { match: "INSERT INTO staff_control_audit_log", rows: [{ id: "audit" }] },
    { match: "SELECT id, title, summary, status FROM product_release_entries", rows: [MITTEILUNG] },
    { match: "SELECT user_id FROM product_release_mail_empfaenger", rows: [{ user_id: A }, { user_id: C }] },
    { match: "SET status = 'in_arbeit'", rows: ({ params }) => [{ email: `${params[1].slice(0, 4)}@kunde.de`, role: "company", versuche: 1, abgemeldet: false }] },
    { match: "UPDATE product_release_mail_empfaenger", rowCount: 1 }
  ]);
}

describe("POST /staff/api/produkt-updates/:id/mailen — Start in Paketen", () => {
  it("friert ein und protokolliert in EINER Transaktion; das erste Paket geht danach", async () => {
    const p = startWelt();
    const mails = [];
    const res = mockRes();
    await handler(staff(p, { sendMail: async (to) => { mails.push(to); return true; } }), "post", "/produkt-updates/:id/mailen")(req(), res);
    assert.equal(res._status, 200, JSON.stringify(res._json));
    assert.equal(res._json.data.gestartet, true);
    assert.equal(res._json.data.eingereiht, 2);
    assert.equal(res._json.data.abgemeldet, 1);
    assert.equal(res._json.data.erstes_paket.gesendet, 2);
    assert.deepEqual(mails, ["1111@kunde.de", "3333@kunde.de"]);

    const folge = p.calls.map((c) => c.sql.trim().split(/\s+/).slice(0, 3).join(" "));
    const begin = folge.indexOf("BEGIN");
    const commit = folge.indexOf("COMMIT");
    const stempel = p.calls.findIndex((c) => c.sql.includes("email_sent_at IS NULL"));
    const audit = p.calls.findIndex((c) => c.sql.includes("staff_control_audit_log"));
    const erstesPaket = p.calls.findIndex((c) => c.sql.includes("SET status = 'in_arbeit'"));
    assert.ok(begin >= 0 && begin < stempel && stempel < audit && audit < commit, folge.join(" | "));
    assert.ok(erstesPaket > commit, "der Versand laeuft NACH der Transaktion");
    const a = p.calls[audit];
    assert.equal(a.params[2], "staff.produkt_update.gemailt");
    assert.equal(a.params[6], "Neue Verwaltung fuer alle Kunden");
    assert.ok(String(a.params.find((x) => typeof x === "string" && x.includes("eingereiht"))).includes('"eingereiht":2'));
  });

  it("der zweite Klick (Wettlauf): 409, kein Protokoll, keine Liste", async () => {
    const p = startWelt({ stempel: 0 });
    const res = mockRes();
    await handler(staff(p), "post", "/produkt-updates/:id/mailen")(req(), res);
    assert.equal(res._status, 409);
    assert.equal(res._json.error.code, "SCHON_GEMAILT");
    assert.equal(p.calls.filter((c) => c.sql.includes("staff_control_audit_log") || c.sql.includes("INSERT INTO product_release_mail_empfaenger")).length, 0);
  });

  it("ohne Abmelde-Schluessel: 503 und nichts eingefroren", async () => {
    const vorher = [config.JWT_SECRET, config.SESSION_SECRET];
    config.JWT_SECRET = "";
    config.SESSION_SECRET = "";
    try {
      const p = startWelt();
      const res = mockRes();
      await handler(staff(p), "post", "/produkt-updates/:id/mailen")(req(), res);
      assert.equal(res._status, 503);
      assert.equal(res._json.error.code, "KEIN_ABMELDE_SCHLUESSEL");
      assert.equal(p.calls.filter((c) => /UPDATE|INSERT/.test(c.sql)).length, 0);
    } finally {
      [config.JWT_SECRET, config.SESSION_SECRET] = vorher;
    }
  });
});

describe("Handkurbel und Anhalten", () => {
  it("Paket von Hand: nur fuer einen gestarteten Versand", async () => {
    const p = pool([{ match: "SELECT * FROM product_release_entries WHERE id", rows: [MITTEILUNG] }]);
    const res = mockRes();
    await handler(staff(p), "post", "/produkt-updates/:id/paket")(req(), res);
    assert.equal(res._status, 409);
    assert.equal(res._json.error.code, "NICHT_GESTARTET");
  });

  it("Paket von Hand: sendet, protokolliert als Handkurbel, nennt den Stand", async () => {
    const p = startWelt();
    p.calls.length = 0;
    const gestartet = { ...MITTEILUNG, email_sent_at: "2026-10-01T11:00:00Z" };
    const welt = pool([{ match: "SELECT * FROM product_release_entries WHERE id", rows: [gestartet] }]);
    const query = async (sql, params) => (String(sql).includes("SELECT * FROM product_release_entries WHERE id")
      ? welt.query(sql, params) : p.query(sql, params));
    const res = mockRes();
    await handler(staff({ query, connect: p.connect }), "post", "/produkt-updates/:id/paket")(req(), res);
    assert.equal(res._status, 200, JSON.stringify(res._json));
    assert.equal(res._json.data.paket.gesendet, 2);
    const audit = p.calls.find((c) => c.sql.includes("staff_control_audit_log"));
    assert.equal(audit.params[2], "staff.produkt_update.paket");
    assert.ok(audit.params.some((x) => typeof x === "string" && x.includes('"ausloeser":"handkurbel"')));
  });

  it("Anhalten: Liste und Protokoll in EINER Transaktion, mit Grund", async () => {
    const p = pool([
      { match: "SELECT * FROM product_release_entries WHERE id", rows: [{ ...MITTEILUNG, email_sent_at: "2026-10-01T11:00:00Z" }] },
      { match: "SET status = 'entfallen', fehler = 'angehalten'", rowCount: 928 },
      { match: "INSERT INTO staff_control_audit_log", rows: [{ id: "audit" }] }
    ]);
    const res = mockRes();
    await handler(staff(p), "post", "/produkt-updates/:id/versand-anhalten")(req({ sccReason: "Tippfehler im Titel bemerkt" }), res);
    assert.equal(res._status, 200, JSON.stringify(res._json));
    assert.equal(res._json.data.angehalten, 928);
    const folge = p.calls.map((c) => c.sql.trim().split(/\s+/)[0]);
    const halt = p.calls.findIndex((c) => c.sql.includes("fehler = 'angehalten'"));
    const audit = p.calls.findIndex((c) => c.sql.includes("staff_control_audit_log"));
    assert.ok(folge.indexOf("BEGIN") < halt && halt < audit && audit < folge.indexOf("COMMIT"), folge.join(" | "));
    assert.equal(p.calls[audit].params[2], "staff.produkt_update.versand_angehalten");
    assert.equal(p.calls[audit].params[6], "Tippfehler im Titel bemerkt");
  });

  it("die neuen Pfade gehoeren dem Bereich platform", () => {
    for (const pfad of ["/produkt-updates/x/paket", "/produkt-updates/x/versand-anhalten"]) {
      assert.equal(darfStaffBereich("staff_ops", pfad, "POST").erlaubt, true, pfad);
      assert.equal(darfStaffBereich("staff_support", pfad, "POST").erlaubt, false, pfad);
    }
  });
});

/* ── 9. Die Migration ────────────────────────────────────────────────────── */

describe("Migration 227: die Empfaengerliste", () => {
  const sql = fs.readFileSync(path.join(API, "..", "sql", "migrations", "227_produkt_update_versand_in_paketen.sql"), "utf8");
  const tabelle = sql.slice(sql.indexOf("CREATE TABLE"), sql.indexOf(");", sql.indexOf("CREATE TABLE")));

  it("ein Mensch steht hoechstens einmal auf der Liste einer Mitteilung", () => {
    assert.ok(tabelle.includes("PRIMARY KEY (release_id, user_id)"));
  });

  it("die Zustaende sind genau die fuenf, die der Dienst schreibt", () => {
    assert.ok(tabelle.includes("CHECK (status IN ('offen', 'in_arbeit', 'gesendet', 'fehlgeschlagen', 'entfallen'))"));
  });

  it("keine E-Mail-Adresse in der Liste (Datensparsamkeit)", () => {
    assert.ok(!/\bemail\b/i.test(tabelle), tabelle);
  });

  it("Mitteilung oder Konto geloescht -> Zeilen weg; und eine Ruecknahme ist beschrieben", () => {
    assert.ok(tabelle.includes("REFERENCES product_release_entries (id) ON DELETE CASCADE"));
    assert.ok(tabelle.includes("REFERENCES users (id) ON DELETE CASCADE"));
    assert.ok(sql.includes("ROLLBACK") && sql.includes("DROP TABLE IF EXISTS product_release_mail_empfaenger"));
  });
});
