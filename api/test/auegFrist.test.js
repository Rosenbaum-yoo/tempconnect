/**
 * Die Hoechstueberlassungsdauer (Welle J8) — jede Regel einzeln belegt.
 *
 * Owner-Entscheid 2026-08-26/27: beachten und warnen, wenn die 18 Monate
 * ueberschritten sind ODER knapp werden — beidseitig planbar.
 *
 * Warum diese Datei so ausfuehrlich ist: Hier wird eine RECHTSREGEL
 * abgebildet (§ 1 Abs. 1b AUEG). Ein Rechenfehler faellt keinem Nutzer auf,
 * bis eine Pruefung ihn findet — und dann ist er teuer. Jede Aussage des
 * Dienstes steht deshalb als eigener Fall hier, mit dem Grund daneben.
 *
 * Run: node --test --test-force-exit test/auegFrist.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import pg from "pg";

import {
  HOECHSTUEBERLASSUNG_MONATE, UNTERBRECHUNG_MONATE, STUFEN,
  plusMonate, tageInklusive, baueKetten, berechneAuegKonto, pruefePlanung, alsIsoDatum,
  ladeZeitraeume, ladeAuegKonto, ladeAuegKontenFuerOrg
} from "../services/auegFristService.js";

const HEUTE = "2026-08-27";
const hasDb = !!process.env.DATABASE_URL;

describe("AUEG · Datums-Handwerk", () => {
  it("Monate addieren ist monatsende-sicher", () => {
    assert.equal(plusMonate("2026-01-31", 1), "2026-02-28", "31.01. + 1 Monat kann nicht der 31.02. sein");
    assert.equal(plusMonate("2028-01-31", 1), "2028-02-29", "Schaltjahr");
    assert.equal(plusMonate("2026-08-27", 18), "2028-02-27");
    assert.equal(plusMonate("2026-12-15", 3), "2027-03-15", "ueber den Jahreswechsel");
  });

  it("Tage werden inklusive beider Enden gezaehlt", () => {
    assert.equal(tageInklusive("2026-08-27", "2026-08-27"), 1, "ein Tag Einsatz ist ein Tag");
    assert.equal(tageInklusive("2026-01-01", "2026-01-31"), 31);
  });

  it("Date-Objekte aus einem parserlosen Pool werden verstanden", () => {
    assert.equal(alsIsoDatum(new Date(2026, 7, 27)), "2026-08-27");
    assert.equal(alsIsoDatum("2026-08-27T00:00:00.000Z"), "2026-08-27");
    assert.equal(alsIsoDatum("unfug"), null);
  });
});

describe("AUEG · Ketten — was zusammenzaehlt und was nicht", () => {
  it("mehrere Einsaetze beim selben Kunden addieren sich", () => {
    /* Der haeufigste Denkfehler: die Frist gilt je KRAFT je ENTLEIHER, nicht
     * je Einsatz. Zwei Einsaetze mit kurzer Luecke sind EINE Ueberlassung. */
    const ketten = baueKetten([
      { von: "2026-01-01", bis: "2026-03-31" },
      { von: "2026-05-01", bis: "2026-06-30" }
    ], HEUTE);
    assert.equal(ketten.length, 1, "ein Monat Luecke unterbricht nicht");
    assert.equal(ketten[0].von, "2026-01-01");
    assert.equal(ketten[0].bis, "2026-06-30");
  });

  it("erst MEHR als drei Monate Unterbrechung setzen die Uhr zurueck", () => {
    const genauDrei = baueKetten([
      { von: "2025-01-01", bis: "2025-03-31" },
      { von: "2025-06-30", bis: "2025-08-31" }
    ], HEUTE);
    assert.equal(genauDrei.length, 1,
      "genau drei Monate sind noch keine Unterbrechung — das Gesetz sagt 'mehr als drei Monate'");

    const mehrAlsDrei = baueKetten([
      { von: "2025-01-01", bis: "2025-03-31" },
      { von: "2025-07-05", bis: "2025-08-31" }
    ], HEUTE);
    assert.equal(mehrAlsDrei.length, 2, "ueber drei Monate: die Uhr beginnt neu");
  });

  it("parallele Einsaetze beim selben Kunden zaehlen NICHT doppelt", () => {
    const ketten = baueKetten([
      { von: "2026-01-01", bis: "2026-06-30" },
      { von: "2026-03-01", bis: "2026-04-30" }
    ], HEUTE);
    assert.equal(ketten.length, 1);
    assert.equal(ketten[0].tage, tageInklusive("2026-01-01", "2026-06-30"),
      "ueberlappende Zeit ist EINE Ueberlassung — sonst waere jede Doppelbesetzung ein Frist-Sprung");
  });

  it("ein offener Einsatz zaehlt bis heute, nicht bis in alle Ewigkeit", () => {
    const ketten = baueKetten([{ von: "2026-06-01", bis: null }], HEUTE);
    assert.equal(ketten[0].bis, HEUTE);
  });

  it("unbrauchbare Zeitraeume werden verworfen, nicht geraten", () => {
    const ketten = baueKetten([
      { von: null, bis: "2026-01-01" },
      { von: "2026-05-01", bis: "2026-04-01" },
      { von: "kaputt", bis: "2026-01-01" }
    ], HEUTE);
    assert.deepEqual(ketten, []);
  });
});

describe("AUEG · Das Konto", () => {
  it("ohne Ueberlassung ist alles offen", () => {
    const k = berechneAuegKonto([], HEUTE);
    assert.equal(k.stufe, "ok");
    assert.equal(k.verbrauchte_tage, 0);
    assert.equal(k.frist_ende, null, "ohne Beginn gibt es kein Fristende — kein erfundenes Datum");
  });

  it("das Fristende ist KALENDERGENAU 18 Monate ab Kettenbeginn", () => {
    const k = berechneAuegKonto([{ von: "2026-01-15", bis: null }], HEUTE);
    assert.equal(k.laufende_kette_ab, "2026-01-15");
    assert.equal(k.frist_ende, "2027-07-14",
      "18 Monate ab 15.01.2026 enden mit Ablauf des 14.07.2027 — der Beginntag zaehlt mit");
    assert.equal(k.spaetestes_fristgerechtes_ende, k.frist_ende);
  });

  it("nur die AKTUELLE Kette zaehlt — die Historie bleibt trotzdem sichtbar", () => {
    const k = berechneAuegKonto([
      { von: "2023-01-01", bis: "2024-01-31" },
      { von: "2026-06-01", bis: null }
    ], HEUTE);
    assert.equal(k.laufende_kette_ab, "2026-06-01", "die alte Ueberlassung ist verjaehrt (Luecke > 3 Monate)");
    assert.equal(k.ketten.length, 2, "wer das Konto erklaeren muss, sieht beide Ketten");
    assert.ok(k.verbrauchte_tage < 120);
  });

  it("die Stufen greifen bei 15, 17 und 18 Monaten", () => {
    const ab = (monate) => plusMonate(HEUTE, -monate);
    assert.equal(berechneAuegKonto([{ von: ab(10), bis: null }], HEUTE).stufe, "ok");
    assert.equal(berechneAuegKonto([{ von: ab(15), bis: null }], HEUTE).stufe, "hinweis");
    assert.equal(berechneAuegKonto([{ von: ab(17), bis: null }], HEUTE).stufe, "warnung");
    assert.equal(berechneAuegKonto([{ von: ab(19), bis: null }], HEUTE).stufe, "alarm");
  });

  it("eine ueberschrittene Frist ist Alarm — und verbleibend ist dann null, nie negativ", () => {
    const k = berechneAuegKonto([{ von: "2024-01-01", bis: null }], HEUTE);
    assert.equal(k.stufe, "alarm");
    assert.equal(k.verbleibende_tage, 0, "negative Resttage waeren keine Auskunft");
    assert.ok(k.frist_ende < HEUTE);
  });

  it("die Stufen-Schwellen stehen als Konstanten, nicht verstreut im Code", () => {
    assert.equal(HOECHSTUEBERLASSUNG_MONATE, 18);
    assert.equal(UNTERBRECHUNG_MONATE, 3);
    assert.deepEqual(STUFEN, { hinweis: 15, warnung: 17, alarm: 18 });
  });
});

describe("AUEG · Die Planungsauskunft fuers Buchungsmodal", () => {
  it("eine Buchung im Rahmen ist fristgerecht", () => {
    const p = pruefePlanung(
      [{ von: "2026-06-01", bis: "2026-08-31" }],
      { von: "2026-09-01", bis: "2026-12-31" },
      HEUTE
    );
    assert.equal(p.fristgerecht, true);
    assert.equal(p.stufe, "ok");
  });

  it("eine Buchung ueber die Frist hinaus wird benannt — mit dem spaetesten zulaessigen Ende", () => {
    const p = pruefePlanung(
      [{ von: "2025-06-01", bis: null }],
      { von: "2026-09-01", bis: "2027-06-30" },
      HEUTE
    );
    assert.equal(p.fristgerecht, false);
    assert.equal(p.spaetestes_fristgerechtes_ende, "2026-11-30",
      "18 Monate ab 01.06.2025 enden mit Ablauf des 30.11.2026 — genau dieses Datum schlaegt das Modal vor");
    assert.ok(["warnung", "alarm", "hinweis"].includes(p.stufe));
  });

  it("eine Buchung mit offenem Ende gilt nicht als Verstoss — der Zeitpunkt wird aber genannt", () => {
    const p = pruefePlanung(
      [{ von: "2025-06-01", bis: null }],
      { von: "2026-09-01", bis: null },
      HEUTE
    );
    assert.equal(p.fristgerecht, true, "was kein Ende hat, reisst heute keine Frist");
    assert.equal(p.frist_ende, "2026-11-30", "aber beide Seiten wissen, wann Schluss ist");
  });

  it("ohne geplanten Zeitraum ist die Auskunft das blosse Konto", () => {
    const p = pruefePlanung([{ von: "2026-06-01", bis: null }], {}, HEUTE);
    assert.equal(p.fristgerecht, true);
    assert.equal(p.geplant_von, undefined);
  });

  it("die geplante Zeit zaehlt ins Konto MIT — sonst waere die Warnung immer zu spaet", () => {
    /* Belegt unten in derselben Reihenfolge wie oben; hier steht der Grund. */
    const ohne = berechneAuegKonto([{ von: "2026-06-01", bis: "2026-08-31" }], HEUTE);
    const mit = pruefePlanung(
      [{ von: "2026-06-01", bis: "2026-08-31" }],
      { von: "2026-09-01", bis: "2027-06-30" },
      HEUTE
    );
    assert.ok(mit.verbrauchte_tage > ohne.verbrauchte_tage,
      "das Modal muss die Zukunft mitrechnen, nicht nur die Vergangenheit");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 *  Die Datenanbindung — Form ohne Datenbank, Wahrheit mit
 * ═══════════════════════════════════════════════════════════════════════════ */

function aufzeichnenderPool(zeilen = []) {
  const calls = [];
  return {
    calls,
    query: async (sql, params = []) => {
      calls.push({ sql: String(sql), params });
      return { rows: zeilen, rowCount: zeilen.length };
    }
  };
}

describe("AUEG · Datenanbindung — Form", () => {
  it("die Abfrage bindet Entleiher UND Kraft und ueberspringt nicht angetretene Anfragen", async () => {
    const pool = aufzeichnenderPool();
    await ladeZeitraeume(pool, "org-kunde", "kraft-1");
    const sql = pool.calls[0].sql;
    assert.match(sql, /wal\.org_id = \$1/, "org_id ist der ENTLEIHER — die Frist gilt je Entleiher");
    assert.match(sql, /wal\.worker_user_id = \$2/);
    assert.match(sql, /<> ALL\(\$3::text\[\]\)/, "abgelehnt/verfallen/zurueckgezogen zaehlt nicht mit");
    const nichtAngetreten = pool.calls[0].params[2];
    assert.deepEqual([...nichtAngetreten].sort(),
      ["expired", "withdrawn", "worker_declined", "worker_unavailable"],
      "dieselben Endzustaende wie der Statuswert-Spiegel — dort hat nie jemand gearbeitet");
  });

  it("ohne Kennung wird gar nicht erst gefragt", async () => {
    const pool = aufzeichnenderPool();
    assert.deepEqual(await ladeZeitraeume(pool, null, "kraft-1"), []);
    assert.deepEqual(await ladeZeitraeume(pool, "org-1", null), []);
    assert.equal(pool.calls.length, 0, "eine Abfrage ohne Mandant waere ein Leck, kein Leerlauf");
  });

  it("viele Kraefte kosten EINE Abfrage, nicht eine je Kraft (Anti-N+1)", async () => {
    const pool = aufzeichnenderPool([
      { worker_user_id: "k1", von: "2026-01-01", bis: "2026-06-30" },
      { worker_user_id: "k2", von: "2025-01-01", bis: null }
    ]);
    const konten = await ladeAuegKontenFuerOrg(pool, "org-kunde", ["k1", "k2", "k3"], HEUTE);
    assert.equal(pool.calls.length, 1, "eine Abfrage fuer die ganze Tafel");
    assert.equal(konten.size, 3, "auch Kraefte ohne Historie bekommen ein Konto");
    assert.equal(konten.get("k3").stufe, "ok");
    assert.equal(konten.get("k2").stufe, "alarm", "seit Anfang 2025 durchgehend = ueber 18 Monate");
    assert.equal(konten.get("k1").stufe, "ok");
  });

  it("doppelte Kennungen werden zusammengefasst", async () => {
    const pool = aufzeichnenderPool();
    await ladeAuegKontenFuerOrg(pool, "org-kunde", ["k1", "k1", "k1"], HEUTE);
    assert.equal(pool.calls[0].params[1].length, 1);
  });
});

describe("AUEG · Datenanbindung — echte Datenbank", { skip: !hasDb }, () => {
  it("Postgres parst die volle Abfrage und liefert plausible Konten", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    try {
      const { rows: paare } = await pool.query(
        `SELECT org_id, worker_user_id FROM worker_assignment_links
          WHERE org_id IS NOT NULL AND worker_user_id IS NOT NULL LIMIT 1`);
      if (!paare[0]) return;
      const konto = await ladeAuegKonto(pool, paare[0].org_id, paare[0].worker_user_id, HEUTE);
      assert.ok(konto.verbrauchte_tage >= 0);
      assert.ok(["ok", "hinweis", "warnung", "alarm"].includes(konto.stufe));
      if (konto.ketten.length) {
        assert.match(konto.frist_ende, /^\d{4}-\d{2}-\d{2}$/, "ein echtes Datum, keine Zeitzonen-Ruine");
      }
      const viele = await ladeAuegKontenFuerOrg(pool, paare[0].org_id, [paare[0].worker_user_id], HEUTE);
      assert.deepEqual(viele.get(paare[0].worker_user_id).ketten, konto.ketten,
        "Einzel- und Sammelweg muessen dasselbe rechnen — sonst widersprechen sich Tafel und Detail");
    } finally {
      await pool.end();
    }
  });
});
