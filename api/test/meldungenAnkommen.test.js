import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  reportProfileAbuse,
  getPendingAbuseReports,
  resolveAbuseReport,
} from "../services/profileVisibilityService.js";

/*
 * DIE MELDEFUNKTION HAT NOCH NIE EINEN BERICHT GESPEICHERT.
 *
 * Am 2026-08-22 gegen die LAUFENDE Datenbank bewiesen (nicht gelesen, nicht
 * geschlossen — in einer zurueckgerollten Transaktion ausgefuehrt):
 *
 *   INSERT ... reason='fake_profile'
 *   ERROR: new row violates check constraint "..._reason_check"
 *
 *   INSERT ... ON CONFLICT (reported_org_id, reporter_user_id)
 *   ERROR: there is no unique or exclusion constraint matching the
 *          ON CONFLICT specification
 *
 * Drei der fuenf erlaubten Gruende waren unspeicherbar; die ON-CONFLICT-Klausel
 * erledigte die restlichen zwei. Der Posteingang las `status = 'pending'` — ein
 * Wert, den der CHECK NIE erlaubt hat. Und alles drei endete in `catch { }`.
 *
 * Beide Meldetabellen haben 0 Zeilen. Das ist kein Zufall, das ist der Beleg.
 *
 * WARUM DAS SO LANGE UNBEMERKT BLIEB — und was hier dagegen steht:
 * Der Schema-Waechter prueft, ob SPALTEN existieren. Sie existierten. Er wusste
 * nichts ueber die erlaubten WERTE. Der Abzug traegt sie jetzt (`pruefwerte`,
 * 240 Spalten aus der laufenden Datenbank), und die erste Gruppe unten haelt
 * jeden geschriebenen Literal dagegen.
 */

const schema = JSON.parse(
  fs.readFileSync(new URL("./fixtures/schema.json", import.meta.url), "utf8")
);

/**
 * Schneidet aus einer Quelle nur die SQL-Abschnitte, die eine bestimmte Tabelle
 * nennen. Ohne diesen Schnitt prueft man eine Tabelle mit den Werten einer
 * anderen — `profileVisibilityService.js` verwaltet auch
 * `organization_public_profiles` mit `draft | submitted | approved | ...`.
 */
function anweisungenZu(quelle, tabelle) {
  // Template-Literale sind die Form, in der dieses Repo SQL schreibt.
  const stuecke = [...quelle.matchAll(/`([^`]*)`/g)].map((m) => m[1]);
  return stuecke.filter((s) => s.includes(tabelle)).join("\n");
}

/**
 * Zieht die Zeichenketten-Literale, die eine Quelle einer Spalte zuweist oder
 * gegen sie vergleicht, aus dem SQL — fuer EINE benannte Tabelle.
 *
 * Bewusst mit genannter Tabelle statt automatisch: `status` heisst auf 22
 * Tabellen `status`, und `'pending'` ist auf 22 davon erlaubt. Ein Waechter, der
 * nur den Spaltennamen kennt, haette genau diesen Fehler NICHT gefunden — er
 * braucht die Bindung an die Tabelle. Diese Bindung automatisch aus Aliassen
 * herzuleiten ist eine eigene Aufgabe; hier wird sie benannt, und das genuegt
 * fuer die Stellen, die wir absichern wollen.
 */
function literaleFuer(quelle, spalten) {
  const gefunden = [];
  for (const spalte of spalten) {
    /* Gebunden wird an die ANWEISUNG, nicht an die Datei. Die erste Fassung
     * dieser Probe las die ganze Datei und meldete `draft`, `approved`,
     * `suspended` — alles gueltige Werte, nur eben von
     * `organization_public_profiles`, die derselbe Dienst mitverwaltet. Eine
     * Probe, die eine Tabelle mit den Werten einer anderen schlaegt, ist keine
     * Probe, sondern ein Dauer-Rot, nach dem man sie abschaltet. */
    // spalte = 'wert'   /   spalte IN ('a', 'b')   /   alias.spalte = 'wert'
    const gleich = new RegExp(`(?:\\w+\\.)?${spalte}\\s*=\\s*'([^']+)'`, "g");
    for (const m of quelle.matchAll(gleich)) gefunden.push({ spalte, wert: m[1] });
    const drin = new RegExp(`(?:\\w+\\.)?${spalte}\\s+IN\\s*\\(([^)]*)\\)`, "gi");
    for (const m of quelle.matchAll(drin)) {
      for (const w of m[1].matchAll(/'([^']+)'/g)) gefunden.push({ spalte, wert: w[1] });
    }
  }
  return gefunden;
}

describe("Meldungen — jeder geschriebene Wert ist einer, den die Tabelle erlaubt", () => {
  const erlaubt = schema.pruefwerte?.profile_abuse_reports;
  const quelle = anweisungenZu(
    fs.readFileSync(new URL("../services/profileVisibilityService.js", import.meta.url), "utf8"),
    "profile_abuse_reports"
  );

  it("der Abzug traegt ueberhaupt erlaubte Werte — sonst prueft die Gruppe nichts", () => {
    assert.ok(schema.pruefwerte, "`pruefwerte` fehlt im Schema-Abzug (npm run schema:snapshot)");
    assert.ok(Object.keys(schema.pruefwerte).length > 50,
      `nur ${Object.keys(schema.pruefwerte || {}).length} Tabellen mit Pruefwerten — greift die Abfrage noch?`);
    assert.ok(erlaubt?.status?.length, "profile_abuse_reports.status fehlt im Abzug");
  });

  it("kein Status-Literal im Dienst, den der CHECK ablehnt", () => {
    const schlecht = literaleFuer(quelle, ["status"])
      .filter((f) => !erlaubt.status.includes(f.wert))
      .map((f) => f.wert);
    assert.deepEqual([...new Set(schlecht)], [],
      "Diese Status-Werte stehen im Dienst, aber nicht im CHECK der Tabelle.\n" +
      `Erlaubt: ${erlaubt.status.join(", ")}\n` +
      "Genau so lebte `status = 'pending'` monatelang: die Abfrage traf nie etwas, " +
      "`catch { return []; }` daneben liess es wie 'keine Meldungen' aussehen.");
  });

  it("kein Grund-Literal im Dienst, den der CHECK ablehnt", () => {
    const schlecht = literaleFuer(quelle, ["reason"])
      .filter((f) => !erlaubt.reason.includes(f.wert))
      .map((f) => f.wert);
    assert.deepEqual([...new Set(schlecht)], [], `Erlaubt: ${erlaubt.reason.join(", ")}`);
  });

  it("S: die Probe wuerde ein verbotenes Literal bemerken", () => {
    /* Rueckmutation — ohne sie belegt die Gruppe nur, dass die aktuelle Fassung
     * passt, nicht dass sie den Rueckfall SIEHT. */
    const rueckfall = "WHERE par.status = 'pending' ORDER BY created_at";
    const gefunden = literaleFuer(rueckfall, ["status"]).map((f) => f.wert);
    assert.deepEqual(gefunden, ["pending"], "die Probe erkennt den alten Fehler nicht mehr");
    assert.ok(!erlaubt.status.includes("pending"), "'pending' waere danach erlaubt — dann prueft sie nichts");
  });

  it("S: die Probe erkennt auch die IN-Form", () => {
    const gefunden = literaleFuer("status IN ('open', 'under_review')", ["status"]).map((f) => f.wert);
    assert.deepEqual(gefunden, ["open", "under_review"]);
  });
});

/** Spion-Pool, der SQL und Parameter mitschreibt. */
function spion(antwort = { rows: [{ id: "r-1" }], rowCount: 1 }) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql: String(sql), params: params || [] });
      return typeof antwort === "function" ? antwort(String(sql)) : antwort;
    },
  };
}

const ORG = "aaaaaaaa-0000-0000-0000-000000000001";
const DIENST_MELDER = "bbbbbbbb-0000-0000-0000-000000000002";
const ANGEBOT = "cccccccc-0000-0000-0000-000000000003";

describe("Meldungen — das Vokabular der API kommt in der Tabelle an", () => {
  it("die fuenf Gruende der Route werden alle angenommen", async () => {
    for (const grund of ["spam", "fake_profile", "misleading_info", "inappropriate_content", "other"]) {
      const pool = spion();
      const erg = await reportProfileAbuse(pool, { reportedOrgId: ORG, reporterUserId: DIENST_MELDER, reason: grund });
      assert.equal(erg.ok, true, `'${grund}' muss speicherbar sein — drei davon waren es nicht`);
      assert.ok(pool.calls[0].params.includes(grund));
    }
  });

  it("die Kurzformen aus Migration 120 werden auf die Langform abgebildet", async () => {
    const paare = [["fake", "fake_profile"], ["misleading", "misleading_info"], ["inappropriate", "inappropriate_content"]];
    for (const [kurz, lang] of paare) {
      const pool = spion();
      await reportProfileAbuse(pool, { reportedOrgId: ORG, reporterUserId: DIENST_MELDER, reason: kurz });
      assert.ok(pool.calls[0].params.includes(lang),
        `'${kurz}' muss als '${lang}' ankommen — sonst stehen zwei Schreibweisen fuer dasselbe in der Tabelle`);
      assert.ok(!pool.calls[0].params.includes(kurz));
    }
  });

  it("ein erfundener Grund wird abgewiesen, bevor die Datenbank ihn ablehnt", async () => {
    const pool = spion();
    const erg = await reportProfileAbuse(pool, { reportedOrgId: ORG, reporterUserId: DIENST_MELDER, reason: "quatsch" });
    assert.equal(erg.reason, "INVALID_REASON");
    assert.equal(pool.calls.length, 0);
  });
});

describe("Meldungen — ON CONFLICT zielt auf den Index, den es wirklich gibt", () => {
  it("die Klausel nennt Melder, Zielart und Ziel", async () => {
    const pool = spion();
    await reportProfileAbuse(pool, { reportedOrgId: ORG, reporterUserId: DIENST_MELDER, reason: "spam" });
    assert.match(pool.calls[0].sql, /ON CONFLICT \(reporter_user_id, ziel_art, ziel_id\)/,
      "Die alte Klausel (reported_org_id, reporter_user_id) hatte KEINEN passenden eindeutigen Index — " +
      "Postgres lehnte damit jede einzelne Meldung ab.");
  });

  it("der eindeutige Index, auf den sie zielt, steht in der Migration", () => {
    const migration = fs.readFileSync(
      new URL("../../sql/migrations/189_meldungen_die_ankommen.sql", import.meta.url), "utf8");
    assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS idx_par_melder_ziel\s*\n?\s*ON profile_abuse_reports \(reporter_user_id, ziel_art, ziel_id\)/,
      "Ohne diesen Index ist die ON-CONFLICT-Klausel wieder das, was sie war: ein Fehler bei jeder Meldung.");
  });

  it("eine Profilmeldung zeigt auf die Organisation, ohne dass der Aufrufer das wissen muss", async () => {
    const pool = spion();
    await reportProfileAbuse(pool, { reportedOrgId: ORG, reporterUserId: DIENST_MELDER, reason: "spam" });
    const p = pool.calls[0].params;
    assert.ok(p.includes("profil"));
    assert.equal(p[p.length - 1], ORG, "ziel_id muss bei einer Profilmeldung die Organisation sein");
  });

  it("eine Angebotsmeldung braucht ein Ziel und wird ohne abgewiesen", async () => {
    const ohne = spion();
    const erg = await reportProfileAbuse(ohne, {
      reportedOrgId: ORG, reporterUserId: DIENST_MELDER, reason: "spam", zielArt: "angebot",
    });
    assert.equal(erg.reason, "MISSING_TARGET");
    assert.equal(ohne.calls.length, 0);

    const mit = spion();
    await reportProfileAbuse(mit, {
      reportedOrgId: ORG, reporterUserId: DIENST_MELDER, reason: "spam", zielArt: "angebot", zielId: ANGEBOT,
    });
    const p = mit.calls[0].params;
    assert.ok(p.includes("angebot") && p.includes(ANGEBOT));
    assert.ok(p.includes(ORG), "die Organisation bleibt dabei — sonst ist 'wer faellt wiederholt auf' nicht mehr beantwortbar");
  });

  it("eine erfundene Zielart wird abgewiesen", async () => {
    const pool = spion();
    const erg = await reportProfileAbuse(pool, {
      reportedOrgId: ORG, reporterUserId: DIENST_MELDER, reason: "spam", zielArt: "mond", zielId: ANGEBOT,
    });
    assert.equal(erg.reason, "INVALID_TARGET");
    assert.equal(pool.calls.length, 0);
  });
});

describe("Meldungen — der Posteingang ist nicht mehr dauerhaft leer", () => {
  it("gelesen werden offene UND angefasste Faelle", async () => {
    const pool = spion({ rows: [], rowCount: 0 });
    await getPendingAbuseReports(pool);
    assert.match(pool.calls[0].sql, /status IN \('open', 'under_review'\)/,
      "'under_review' gehoert dazu: ein angefasster Fall darf nicht aus der Liste fallen, bevor er erledigt ist");
    assert.ok(!pool.calls[0].sql.includes("'pending'"), "'pending' war nie ein erlaubter Wert");
  });

  it("die Zielart geht mit hinaus — sonst sieht Staff nicht, WAS gemeldet wurde", async () => {
    const pool = spion({ rows: [], rowCount: 0 });
    await getPendingAbuseReports(pool);
    assert.match(pool.calls[0].sql, /ziel_art/);
    assert.match(pool.calls[0].sql, /ziel_id/);
  });
});

describe("Meldungen — Erledigen und Abweisen schreiben, was die Tabelle kennt", () => {
  it("'resolved' wird zu 'resolved_action_taken'", async () => {
    const pool = spion({ rows: [], rowCount: 1 });
    const erg = await resolveAbuseReport(pool, "r-1", "resolved", "staff-1");
    assert.equal(erg.ok, true);
    assert.ok(pool.calls[0].params.includes("resolved_action_taken"),
      "'resolved' allein verletzt den CHECK — der Aufrufer spricht anders als die Tabelle, und die Abbildung gehoert hierher");
  });

  it("'dismissed' wird zu 'resolved_dismissed'", async () => {
    const pool = spion({ rows: [], rowCount: 1 });
    await resolveAbuseReport(pool, "r-1", "dismissed", "staff-1");
    assert.ok(pool.calls[0].params.includes("resolved_dismissed"));
  });

  it("beide Zielwerte sind welche, die die Tabelle erlaubt", () => {
    const erlaubt = schema.pruefwerte.profile_abuse_reports.status;
    for (const w of ["resolved_action_taken", "resolved_dismissed"]) {
      assert.ok(erlaubt.includes(w), `${w} steht nicht im CHECK — dann schreibt der Dienst wieder ins Leere`);
    }
  });

  it("die Bedingung trifft offene und angefasste Faelle, nicht 'pending'", async () => {
    const pool = spion({ rows: [], rowCount: 1 });
    await resolveAbuseReport(pool, "r-1", "resolved", "staff-1");
    assert.match(pool.calls[0].sql, /status IN \('open', 'under_review'\)/);
  });

  it("ein unbekanntes Wort wird abgewiesen, bevor irgendetwas geschrieben wird", async () => {
    const pool = spion();
    const erg = await resolveAbuseReport(pool, "r-1", "vielleicht", "staff-1");
    assert.equal(erg.reason, "INVALID_STATUS");
    assert.equal(pool.calls.length, 0);
  });
});

describe("Meldungen — der Fehler wird nicht mehr verschluckt", () => {
  /*
   * Der dritte Fehler, und der teuerste: `catch { return { ok:false } }` ohne
   * Protokoll. Der Nutzer las "Meldung konnte nicht gespeichert werden", niemand
   * erfuhr warum, und die leere Tabelle sah aus wie "es meldet halt niemand".
   * Ein Fehlerpfad, den niemand sieht, ist kein Fehlerpfad — er ist eine Luecke,
   * die sich als Ruhe tarnt.
   */
  it("ein Datenbankfehler kommt mit heraus, statt zu verschwinden", async () => {
    const pool = { calls: [], query: async () => { throw new Error("check constraint verletzt"); } };
    const erg = await reportProfileAbuse(pool, { reportedOrgId: ORG, reporterUserId: DIENST_MELDER, reason: "spam" });
    assert.equal(erg.ok, false);
    assert.equal(erg.reason, "DB_ERROR");
    assert.ok(erg.fehler instanceof Error, "ohne den Fehler kann die Route nichts protokollieren");
    assert.match(erg.fehler.message, /check constraint/);
  });

  it("die Route protokolliert ihn auch wirklich", () => {
    const route = fs.readFileSync(new URL("../routes/profileVisibility.js", import.meta.url), "utf8");
    assert.match(route, /if \(result\.fehler\)[\s\S]{0,200}logger\.error/,
      "Der Dienst reicht den Fehler heraus — wenn die Route ihn wegwirft, ist nichts gewonnen.");
  });
});

/* ===================================================================== */
/* DIE ROUTEN — an echten Antworten geprueft, nicht am Quelltext.        */
/*                                                                       */
/* `if (false && ...)` enthaelt die gesuchte Zeichenkette weiterhin;     */
/* deshalb wird der Handler gebaut und aufgerufen.                       */
/* ===================================================================== */

const MELDER = "d0a00000-0000-0000-0000-000000000002";
const ANBIETER = "98f83a6f-5d68-428c-86d1-75295aae4f34";
const BESTELLER = "e1111111-0000-0000-0000-000000000004";
const OFFER = "d7c857d3-e93a-4883-bcb2-31f79354d33b";
const KAPAZITAET = "cccccccc-1111-0000-0000-000000000005";
const ANBIETER_ORG = "ae376d4b-8608-4f80-aa7f-1c28614e461f";

/**
 * Baut den Handler um einen Spion, der ZWEI Abfragearten unterscheiden muss:
 * die Zeile (offers / capacity_posts) und die Besitzabfrage aus
 * `canAccessAsOwner` (erkennbar an `FROM org_memberships meine`).
 *
 * `parteiVon` nennt die Nutzerkennungen, als deren Kollege die Sitzung gilt.
 * Ohne diese Unterscheidung beantwortet ein Spion JEDE Abfrage bejahend — und
 * eine Sichtbarkeitspruefung, die gegen so einen Spion laeuft, prueft nichts.
 * Genau daran ist die erste Fassung dieser Proben gescheitert.
 */
async function rufeMeldeRoute(pfad, zeile, {
  koerper = { reason: "spam" }, parteiVon = [], id = OFFER,
} = {}) {
  const { createProfileVisibilityRouter } = await import("../routes/profileVisibility.js");
  const calls = [];
  const pool = {
    calls,
    query: async (sql, params) => {
      const text = String(sql);
      calls.push({ sql: text, params: params || [] });
      if (/FROM org_memberships meine/.test(text)) {
        // params[0] = entityOwnerId, params[1] = sessionUserId
        return { rows: parteiVon.includes(params[0]) ? [{ eins: 1 }] : [], rowCount: 0 };
      }
      if (/FROM offers|FROM capacity_posts/.test(text)) {
        return { rows: zeile ? [zeile] : [], rowCount: zeile ? 1 : 0 };
      }
      return { rows: [{ id: "report-1" }], rowCount: 1 };
    },
  };
  const router = createProfileVisibilityRouter({
    pool, requireAuth: (_q, _s, n) => n(), requireFeature: () => (_q, _s, n) => n(),
    logger: { error() {}, warn() {}, info() {} },
  });
  const schicht = router.stack.find((s) => s.route?.path === pfad);
  assert.ok(schicht, `die Route ${pfad} fehlt`);
  const handler = schicht.route.stack[schicht.route.stack.length - 1].handle;

  let status = 200; let json = null;
  const res = { status(c) { status = c; return this; }, json(j) { json = j; return this; } };
  await handler({ params: { id }, body: koerper, session: { userId: MELDER }, headers: {} }, res);
  return { status, json, calls };
}

const angebotsZeile = (extra = {}) => ({
  id: OFFER,
  supplier_company_id: ANBIETER,
  requester_company_id: BESTELLER,
  anbieter_org_id: ANBIETER_ORG,
  ...extra,
});

describe("Angebot melden — melden darf nur, wer sehen darf", () => {
  /*
   * IM BROWSER GEFUNDEN, NICHT IM QUELLTEXT. Die erste Fassung dieser Route
   * pruefte die Sichtbarkeit gar nicht: dieselbe Sitzung bekam bei
   * `/marketplace/offers/:id/detail` ein 403 und konnte das Angebot trotzdem
   * melden. Zwei Folgen, beide unnoetig — ein Orakel fuer Angebotskennungen
   * (404 gegen 200), und ein Weg, wahllos Meldungen gegen Angebote abzusetzen,
   * die man nie gesehen hat. Jede davon kostet das Team dieselbe Bearbeitung
   * wie eine echte.
   */

  it("der Besteller darf das Angebot seines Lieferanten melden", async () => {
    const r = await rufeMeldeRoute("/offers/:id/report", angebotsZeile(), { parteiVon: [BESTELLER] });
    assert.equal(r.status, 200);
    const insert = r.calls.find((c) => /INSERT INTO profile_abuse_reports/.test(c.sql));
    assert.ok(insert, "es muss eine Meldung entstehen");
    assert.ok(insert.params.includes("angebot") && insert.params.includes(OFFER));
    assert.ok(insert.params.includes(ANBIETER_ORG),
      "die Organisation des Anbieters traegt die Meldung — sonst kann der Posteingang sie nicht anzeigen");
  });

  it("ein Unbeteiligter bekommt DIESELBE Antwort wie bei einem Angebot, das es nicht gibt", async () => {
    const fremd = await rufeMeldeRoute("/offers/:id/report", angebotsZeile(), { parteiVon: [] });
    const weg   = await rufeMeldeRoute("/offers/:id/report", null, { parteiVon: [BESTELLER] });
    assert.equal(fremd.status, 404);
    assert.equal(weg.status, 404);
    assert.deepEqual(fremd.json, weg.json,
      "Unterschiedliche Antworten waeren ein Orakel: wer Kennungen durchprobiert, koennte daran " +
      "ablesen, welche existieren.");
    assert.ok(!fremd.calls.some((c) => /INSERT INTO profile_abuse_reports/.test(c.sql)));
  });

  it("das eigene Angebot laesst sich nicht melden — auch nicht als Kollege des Anbieters", async () => {
    const r = await rufeMeldeRoute("/offers/:id/report", angebotsZeile(), { parteiVon: [ANBIETER] });
    assert.equal(r.status, 400);
    assert.equal(r.json?.error?.code, "SELF_REPORT_NOT_ALLOWED");
    assert.ok(!r.calls.some((c) => /INSERT INTO profile_abuse_reports/.test(c.sql)),
      "`canAccessAsOwner` deckt auch Kolleginnen und Kollegen ab — sonst meldet der Kollege, " +
      "was der Chef nicht melden darf");
  });

  it("ohne Anbieter-Organisation wird ABGEWIESEN, nicht halb gespeichert", async () => {
    const r = await rufeMeldeRoute("/offers/:id/report", angebotsZeile({ anbieter_org_id: null }), { parteiVon: [BESTELLER] });
    assert.equal(r.status, 409);
    assert.equal(r.json?.error?.code, "OFFER_WITHOUT_ORG");
    assert.ok(!r.calls.some((c) => /INSERT INTO profile_abuse_reports/.test(c.sql)));
  });

  it("die Organisation wird BESTIMMT gewaehlt, nicht zufaellig", async () => {
    const r = await rufeMeldeRoute("/offers/:id/report", angebotsZeile(), { parteiVon: [BESTELLER] });
    const laden = r.calls.find((c) => /FROM offers/.test(c.sql));
    assert.match(laden.sql, /ORDER BY m\.created_at ASC\s*\n?\s*LIMIT 1/);
    assert.match(laden.sql, /m\.is_active = TRUE/, "eine beendete Mitgliedschaft darf die Meldung nicht tragen");
  });

  it("ein erfundener Grund wird abgewiesen, bevor das Angebot geladen wird", async () => {
    const r = await rufeMeldeRoute("/offers/:id/report", angebotsZeile(), { koerper: { reason: "erfunden" }, parteiVon: [BESTELLER] });
    assert.equal(r.status, 400);
    assert.equal(r.json?.error?.code, "VALIDATION");
    assert.equal(r.calls.length, 0);
  });
});

const kapazitaetsZeile = (extra = {}) => ({
  id: KAPAZITAET, supplier_company_id: ANBIETER, is_active: true, anbieter_org_id: ANBIETER_ORG, ...extra,
});

describe("Kapazitaet melden — die Flaeche, auf der Fremde Fremdes sehen", () => {
  /*
   * "Angebot" meint im Produkt ZWEI Dinge. `offers` sehen nur die zwei
   * Parteien; `capacity_posts` sieht JEDER angemeldete Nutzer mit SLA-Zugang
   * (marketplace.js:296-302 filtert nicht nach Anbieter). "Freche oder
   * betruegerische Inhalte" trifft vor allem die zweite. Statt zu raten,
   * welche gemeint war, tragen beide.
   */

  it("ein fremder Eintrag laesst sich melden", async () => {
    const r = await rufeMeldeRoute("/capacity-posts/:id/report", kapazitaetsZeile(), { id: KAPAZITAET, parteiVon: [] });
    assert.equal(r.status, 200);
    const insert = r.calls.find((c) => /INSERT INTO profile_abuse_reports/.test(c.sql));
    assert.ok(insert.params.includes("kapazitaet") && insert.params.includes(KAPAZITAET));
  });

  it("KEINE Sichtbarkeitspruefung — und das ist Absicht", async () => {
    /* Anders als bei `offers`: der Feed zeigt jedem angemeldeten Nutzer jeden
     * Eintrag. Eine Sichtbarkeitspruefung waere hier eine Attrappe. Diese
     * Zusicherung haelt fest, dass der Unterschied GEWOLLT ist — sonst
     * "repariert" ihn beim naechsten Mal jemand in die falsche Richtung und
     * nimmt der Meldefunktion genau die Leute weg, fuer die sie da ist. */
    const r = await rufeMeldeRoute("/capacity-posts/:id/report", kapazitaetsZeile(), { id: KAPAZITAET, parteiVon: [] });
    assert.equal(r.status, 200, "ein Unbeteiligter MUSS melden koennen — er sieht den Eintrag ja");
  });

  it("der eigene Eintrag laesst sich nicht melden", async () => {
    const r = await rufeMeldeRoute("/capacity-posts/:id/report", kapazitaetsZeile(), { id: KAPAZITAET, parteiVon: [ANBIETER] });
    assert.equal(r.status, 400);
    assert.equal(r.json?.error?.code, "SELF_REPORT_NOT_ALLOWED");
  });

  it("die Organisation kommt DIREKT aus der Zeile, mit Mitgliedschaft als Rueckfall", async () => {
    const r = await rufeMeldeRoute("/capacity-posts/:id/report", kapazitaetsZeile(), { id: KAPAZITAET, parteiVon: [] });
    const laden = r.calls.find((c) => /FROM capacity_posts/.test(c.sql));
    assert.match(laden.sql, /COALESCE\(cp\.org_id,/,
      "`capacity_posts` traegt org_id direkt (gemessen 30 von 33) — der Rueckfall gilt nur den drei ohne");
    assert.match(laden.sql, /FROM org_memberships m/);
  });

  it("ohne Anbieter-Organisation wird ABGEWIESEN", async () => {
    const r = await rufeMeldeRoute("/capacity-posts/:id/report", kapazitaetsZeile({ anbieter_org_id: null }), { id: KAPAZITAET, parteiVon: [] });
    assert.equal(r.status, 409);
    assert.equal(r.json?.error?.code, "CAPACITY_POST_WITHOUT_ORG");
  });

  it("ein Eintrag, den es nicht gibt, ergibt 404", async () => {
    const r = await rufeMeldeRoute("/capacity-posts/:id/report", null, { id: KAPAZITAET, parteiVon: [] });
    assert.equal(r.status, 404);
    assert.equal(r.json?.error?.code, "CAPACITY_POST_NOT_FOUND");
  });
});

describe("Alle drei Zielarten sind welche, die die Tabelle erlaubt", () => {
  it("profil, angebot und kapazitaet stehen im CHECK", () => {
    const erlaubt = schema.pruefwerte?.profile_abuse_reports?.ziel_art || [];
    for (const art of ["profil", "angebot", "kapazitaet"]) {
      assert.ok(erlaubt.includes(art),
        `'${art}' wird geschrieben, steht aber nicht im CHECK — dann schreibt die Route ins Leere. ` +
        `Erlaubt: ${erlaubt.join(", ")}`);
    }
  });

  it("die Routen schreiben KEINE Zielart, die der CHECK ablehnt", () => {
    /* Der allgemeine Fall dieser Probe ist der Waechter, der noch fehlt: jeder
     * geschriebene Literal gegen den CHECK seiner Tabelle. Hier steht er fuer
     * die eine Spalte, an der er heute gebraucht wird. */
    const erlaubt = schema.pruefwerte.profile_abuse_reports.ziel_art;
    const quelle = fs.readFileSync(new URL("../routes/profileVisibility.js", import.meta.url), "utf8");
    const gesetzt = [...quelle.matchAll(/zielArt:\s*"([^"]+)"/g)].map((m) => m[1]);
    assert.ok(gesetzt.length >= 2, `nur ${gesetzt.length} Zielarten gefunden — greift das Muster noch?`);
    for (const art of gesetzt) {
      assert.ok(erlaubt.includes(art), `'${art}' steht in einer Route, aber nicht im CHECK`);
    }
  });
});
