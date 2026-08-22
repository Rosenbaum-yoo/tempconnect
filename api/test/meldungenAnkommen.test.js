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
const MELDER = "bbbbbbbb-0000-0000-0000-000000000002";
const ANGEBOT = "cccccccc-0000-0000-0000-000000000003";

describe("Meldungen — das Vokabular der API kommt in der Tabelle an", () => {
  it("die fuenf Gruende der Route werden alle angenommen", async () => {
    for (const grund of ["spam", "fake_profile", "misleading_info", "inappropriate_content", "other"]) {
      const pool = spion();
      const erg = await reportProfileAbuse(pool, { reportedOrgId: ORG, reporterUserId: MELDER, reason: grund });
      assert.equal(erg.ok, true, `'${grund}' muss speicherbar sein — drei davon waren es nicht`);
      assert.ok(pool.calls[0].params.includes(grund));
    }
  });

  it("die Kurzformen aus Migration 120 werden auf die Langform abgebildet", async () => {
    const paare = [["fake", "fake_profile"], ["misleading", "misleading_info"], ["inappropriate", "inappropriate_content"]];
    for (const [kurz, lang] of paare) {
      const pool = spion();
      await reportProfileAbuse(pool, { reportedOrgId: ORG, reporterUserId: MELDER, reason: kurz });
      assert.ok(pool.calls[0].params.includes(lang),
        `'${kurz}' muss als '${lang}' ankommen — sonst stehen zwei Schreibweisen fuer dasselbe in der Tabelle`);
      assert.ok(!pool.calls[0].params.includes(kurz));
    }
  });

  it("ein erfundener Grund wird abgewiesen, bevor die Datenbank ihn ablehnt", async () => {
    const pool = spion();
    const erg = await reportProfileAbuse(pool, { reportedOrgId: ORG, reporterUserId: MELDER, reason: "quatsch" });
    assert.equal(erg.reason, "INVALID_REASON");
    assert.equal(pool.calls.length, 0);
  });
});

describe("Meldungen — ON CONFLICT zielt auf den Index, den es wirklich gibt", () => {
  it("die Klausel nennt Melder, Zielart und Ziel", async () => {
    const pool = spion();
    await reportProfileAbuse(pool, { reportedOrgId: ORG, reporterUserId: MELDER, reason: "spam" });
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
    await reportProfileAbuse(pool, { reportedOrgId: ORG, reporterUserId: MELDER, reason: "spam" });
    const p = pool.calls[0].params;
    assert.ok(p.includes("profil"));
    assert.equal(p[p.length - 1], ORG, "ziel_id muss bei einer Profilmeldung die Organisation sein");
  });

  it("eine Angebotsmeldung braucht ein Ziel und wird ohne abgewiesen", async () => {
    const ohne = spion();
    const erg = await reportProfileAbuse(ohne, {
      reportedOrgId: ORG, reporterUserId: MELDER, reason: "spam", zielArt: "angebot",
    });
    assert.equal(erg.reason, "MISSING_TARGET");
    assert.equal(ohne.calls.length, 0);

    const mit = spion();
    await reportProfileAbuse(mit, {
      reportedOrgId: ORG, reporterUserId: MELDER, reason: "spam", zielArt: "angebot", zielId: ANGEBOT,
    });
    const p = mit.calls[0].params;
    assert.ok(p.includes("angebot") && p.includes(ANGEBOT));
    assert.ok(p.includes(ORG), "die Organisation bleibt dabei — sonst ist 'wer faellt wiederholt auf' nicht mehr beantwortbar");
  });

  it("eine erfundene Zielart wird abgewiesen", async () => {
    const pool = spion();
    const erg = await reportProfileAbuse(pool, {
      reportedOrgId: ORG, reporterUserId: MELDER, reason: "spam", zielArt: "mond", zielId: ANGEBOT,
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
    const erg = await reportProfileAbuse(pool, { reportedOrgId: ORG, reporterUserId: MELDER, reason: "spam" });
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
