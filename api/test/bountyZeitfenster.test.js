/**
 * P9 Spur A / Welle A3 — kein Bounty behauptet einen Zeitraum, den es nicht prueft.
 *
 * WARUM ES DIESEN TEST GIBT
 * Fuenf Bedingungen versprachen im Text etwas anderes, als sie massen: ein
 * "6 Monate"-Siegel rechnete den Gesamtschnitt, ein "3 Monate"-Antwortzeit-Bounty
 * rechnete auf einem Feld, das von SLA-Scans mitgeschrieben wird, und ein
 * Notdienst-Bounty zaehlte in einer Tabelle, in der der Notdienst gar nicht
 * stattfindet. Solche Abweichungen machen nichts rot — der Text steht in der
 * Datenbank, die Messung im Code, und niemand haelt beide nebeneinander.
 *
 * Genau das tut dieser Test. Er kann nicht wissen, welche Messung fachlich
 * richtig ist; er erzwingt, dass Beschreibung, Schwellenwert und ausgewertetes
 * Feld dieselbe Aussage machen — und dass eine neue Bedingung nicht ohne
 * bewusste Erklaerung hinzukommt.
 *
 * Zwei Ebenen:
 *   1. DB-frei — die Registry unten gegen den echten Quelltext von bountyService.
 *   2. DB-gestuetzt — die Registry gegen die echten Katalogtexte.
 *
 * Run: node --test --test-force-exit test/bountyZeitfenster.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIENST = path.join(__dirname, "..", "services", "bountyService.js");
const hasDb = Boolean(process.env.DATABASE_URL || (process.env.DB_HOST && process.env.POSTGRES_PASSWORD));

/**
 * Die dokumentierte Wahrheit: was jede Bedingung misst und ueber welchen Zeitraum.
 *
 * `fenster`  Schluessel in threshold_value, der den Zeitraum traegt (null = die
 *            Bedingung verspricht bewusst keinen).
 * `liest`    Feld aus gatherUserData, das im case-Zweig vorkommen MUSS. So faellt
 *            auf, wenn jemand die Messung auf eine andere Quelle umhaengt, ohne
 *            den Text mitzuziehen.
 */
const MESSUNG = Object.freeze({
  avg_reliability_6m:  { fenster: "months", liest: "ratingStatsFenster" },
  avg_communication:   { fenster: null,     liest: "ratingStats" },
  active_listings_6m:  { fenster: "months", liest: "listingsImFenster" },
  response_time_3m:    { fenster: "months", liest: "responseStats" },
  completed_deals:     { fenster: null,     liest: "deals" },
  emergency_deals:     { fenster: null,     liest: "deals" },
  reliability_streak:  { fenster: "days",   liest: "reliabilityStreaks" },
  subscription_age:    { fenster: "months", liest: "firstSubDate" },
  registration_before: { fenster: null,     liest: "userCreatedAt" },
  referrals:           { fenster: null,     liest: "referralCount" },
  ratings_given:       { fenster: null,     liest: "ratingsGiven" },
  mentoring:           { fenster: null,     liest: "mentoringCount" },
  top_percentile_12m:  { fenster: null,     liest: "percentileRank" }
});

const quelle = fs.readFileSync(DIENST, "utf8");

/**
 * Derselbe Quelltext ohne Kommentare.
 *
 * Die Kommentare erklaeren ausdruecklich, WELCHE alte Quelle ersetzt wurde — eine
 * Pruefung auf "kommt nicht mehr vor" wuerde sonst die Erklaerung des Defekts als
 * Defekt melden. Genau dieser Fallstrick ist in Welle A1 schon einmal zugeschnappt.
 */
const codeOhneKommentare = quelle
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "")
  .replace(/--[^\n]*/g, "");

/** Schneidet den case-Zweig einer Bedingung aus dem Quelltext. */
function caseBlock(typ) {
  const start = quelle.indexOf(`case '${typ}':`);
  if (start < 0) return null;
  const rest = quelle.slice(start + 1);
  const naechster = rest.search(/\n    case '|\n    default:/);
  return naechster < 0 ? rest : rest.slice(0, naechster);
}

/** Findet Zeitangaben in einem Beschreibungstext: "6 Monate", "90 Tage", "12 Monaten". */
function zeitangaben(text) {
  const treffer = [];
  const re = /(\d+)\s*(Monate?n?|Tage?n?|Jahre?n?)/gi;
  let m;
  while ((m = re.exec(text || ""))) {
    const einheit = m[2].toLowerCase().startsWith("monat") ? "months"
      : m[2].toLowerCase().startsWith("tag") ? "days" : "years";
    treffer.push({ zahl: Number(m[1]), einheit });
  }
  return treffer;
}

/* ── 1. Registry gegen den Quelltext ───────────────────────────────────── */

describe("P9/A3 · Jede Bedingung liest die Quelle, die sie laut Registry liest", () => {
  it("jeder case-Zweig im Dienst hat einen Registry-Eintrag", () => {
    const imCode = [...quelle.matchAll(/\n    case '([a-z0-9_]+)':/g)].map((m) => m[1]);
    const fehlend = imCode.filter((t) => !Object.prototype.hasOwnProperty.call(MESSUNG, t));
    assert.deepEqual(fehlend, [],
      `Nicht in der Registry dieses Tests erklaert: ${fehlend.join(", ")}. `
      + "Trag ein, welchen Zeitraum die Bedingung verspricht und welches Feld sie liest — "
      + "und pruefe dabei, ob die Katalog-Beschreibung dasselbe sagt.");
  });

  it("jeder Registry-Eintrag existiert auch wirklich im Dienst", () => {
    for (const typ of Object.keys(MESSUNG)) {
      assert.ok(caseBlock(typ), `Registry kennt '${typ}', der Dienst nicht — Karteileiche?`);
    }
  });

  for (const [typ, m] of Object.entries(MESSUNG)) {
    it(`${typ} liest ${m.liest}${m.fenster ? ` und wertet tv.${m.fenster} aus` : " (bewusst ohne Zeitraum)"}`, () => {
      const block = caseBlock(typ);
      assert.ok(block.includes(m.liest),
        `'${typ}' liest laut Registry ${m.liest}, im Code steht das nicht — `
        + "entweder wurde die Quelle gewechselt oder die Registry ist veraltet.");

      if (m.fenster) {
        assert.ok(new RegExp(`tv\\.${m.fenster}`).test(block),
          `'${typ}' verspricht einen Zeitraum, der case-Zweig liest tv.${m.fenster} aber nicht. `
          + "Genau so entsteht ein Katalogwert, den niemand auswertet — er suggeriert dann "
          + "Konfigurierbarkeit, die es nicht gibt.");
      }
    });
  }

  it("die Bewertungs-Abfragen sind moderationsgefiltert", () => {
    // Sonst zaehlt eine als Faelschung ABGELEHNTE Bewertung weiter auf den Rabatt:
    // 'rejected' loescht die Zeile in `ratings` nicht.
    assert.match(quelle, /profile_review_moderation/,
      "ohne diesen Filter heisst \"Bewertung\" im Rabatt-Pfad etwas anderes als auf dem Profil");
    assert.match(quelle, /prm\.status = 'approved'/);
  });

  it("die Antwortzeit rechnet nicht mehr auf requests.updated_at", () => {
    // updated_at wird dort von SLA-Scans, Eskalationsstufen und der
    // DSGVO-Anonymisierung mitgeschrieben — es bedeutet nicht "beantwortet".
    const block = caseBlock("response_time_3m");
    assert.ok(!/updated_at/.test(block));
    assert.match(quelle, /FROM matches m/,
      "der Nenner muss aus den Benachrichtigungen kommen, sonst ist die Quote geraten");
  });

  it("nie beantwortete Bedarfe senken den Durchschnitt nicht mehr", () => {
    assert.match(quelle, /FILTER \(WHERE erste_antwort IS NOT NULL\)/,
      "ohne diesen Filter verbessert das Ignorieren einer Anfrage die eigene Antwortzeit");
  });

  it("der Notdienst wird im lebenden Kanal gemessen", () => {
    assert.match(codeOhneKommentare, /d\.urgency = 'notdienst'/);
    assert.ok(!/priority = 'NOTDIENST'/.test(codeOhneKommentare),
      "die Alt-Quelle hat noch nie einen Treffer geliefert");
  });

  it("erfolgreiche Abschluesse zaehlen beide Kanaele und entdoppeln", () => {
    const block = codeOhneKommentare.slice(codeOhneKommentare.indexOf("WITH abschluesse AS"));
    assert.match(block, /COUNT\(DISTINCT vorgang\)/,
      "es gibt keine DB-Regel gegen Selbstgeschaefte — die Zaehlung muss selbst entdoppeln");
    assert.match(block, /o\.confirmed_at IS NOT NULL/,
      "verbindlich wird ein Angebot erst mit confirmed_at, nicht mit status='accepted'");
    assert.ok(!/'COMPLETED'/.test(block),
      "der Status COMPLETED ist auf requests unerreichbar — kein Codepfad fuehrt dorthin");
  });
});

/* ── 2. Registry gegen die echten Katalogtexte ─────────────────────────── */

describe("P9/A3 · Beschreibung und Schwellenwert sagen dasselbe",
  { skip: !hasDb && "Keine Datenbank konfiguriert" }, () => {

  it("kein Bounty-Text nennt einen Zeitraum, den threshold_value nicht traegt", async () => {
    const { default: pg } = await import("pg");
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL
        || `postgres://${process.env.DB_USER || "tempconnect"}:${process.env.POSTGRES_PASSWORD}`
           + `@${process.env.DB_HOST}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || "tempconnect"}`
    });
    try {
      const { rows } = await pool.query(
        "SELECT key, description_de, threshold_type, threshold_value FROM bounties ORDER BY sort_order"
      );
      assert.ok(rows.length > 0, "der Katalog ist leer — falsche Datenbank?");

      const fehler = [];
      for (const b of rows) {
        const m = MESSUNG[b.threshold_type];
        if (!m) { fehler.push(`${b.key}: threshold_type '${b.threshold_type}' fehlt in der Registry`); continue; }

        for (const z of zeitangaben(b.description_de)) {
          if (z.einheit === "years") continue; // "1 Jahr TempConnect" ist ein Name, keine Messregel
          if (!m.fenster) {
            fehler.push(`${b.key}: Text nennt ${z.zahl} ${z.einheit}, die Bedingung kennt aber keinen Zeitraum`);
            continue;
          }
          const wert = Number(b.threshold_value?.[m.fenster]);
          if (wert !== z.zahl) {
            fehler.push(`${b.key}: Text sagt ${z.zahl} ${z.einheit}, threshold_value.${m.fenster} ist ${wert}`);
          }
        }

        // Umgekehrt: ein Zeitraum im Schwellenwert, den der Text verschweigt,
        // ist genauso eine Luecke — dann weiss der Nutzer nicht, was zaehlt.
        if (m.fenster && b.threshold_value?.[m.fenster] != null) {
          const genannt = zeitangaben(b.description_de).some(
            (z) => z.einheit === m.fenster && z.zahl === Number(b.threshold_value[m.fenster])
          );
          if (!genannt) {
            fehler.push(`${b.key}: threshold_value.${m.fenster}=${b.threshold_value[m.fenster]}, `
              + `der Text nennt diesen Zeitraum aber nicht`);
          }
        }
      }

      assert.deepEqual(fehler, [], "\n" + fehler.join("\n"));
    } finally {
      await pool.end();
    }
  });

  it("eine als Faelschung abgelehnte Bewertung zaehlt nicht auf den Rabatt", async () => {
    // Der Kern des Moderationsbefunds: 'rejected' loescht die Zeile in `ratings`
    // nicht. Ohne den Filter bliebe eine abgelehnte Bewertung im Rabatt-Schnitt
    // stehen, obwohl sie vom Profil verschwunden ist.
    const { default: pg } = await import("pg");
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL
        || `postgres://${process.env.DB_USER || "tempconnect"}:${process.env.POSTGRES_PASSWORD}`
           + `@${process.env.DB_HOST}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || "tempconnect"}`
    });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: nutzer } = await client.query("SELECT id FROM users LIMIT 2");
      // `ratings.request_id` traegt einen Fremdschluessel — es braucht eine echte,
      // noch unbewertete Anfrage.
      const { rows: [anfrage] } = await client.query(
        `SELECT r.id FROM requests r
          WHERE NOT EXISTS (SELECT 1 FROM ratings ra WHERE ra.request_id = r.id)
          LIMIT 1`
      );
      if (nutzer.length < 2 || !anfrage) { await client.query("ROLLBACK"); return; }
      const [bewerteter, bewerter] = nutzer;

      const zaehle = async () => (await client.query(
        `SELECT COUNT(*)::int AS n, ROUND(AVG(r.reliability)::numeric,2) AS avg
           FROM ratings r
           LEFT JOIN profile_review_moderation prm ON prm.rating_id = r.id
          WHERE r.rated_id = $1 AND (prm.id IS NULL OR prm.status = 'approved')`,
        [bewerteter.id]
      )).rows[0];

      const vorher = await zaehle();

      const { rows: [neu] } = await client.query(
        `INSERT INTO ratings (request_id, rater_id, rated_id, stars, reliability, communication, quality)
         VALUES ($1, $2, $3, 5, 5, 5, 5) RETURNING id`,
        [anfrage.id, bewerter.id, bewerteter.id]
      );
      await client.query(
        "INSERT INTO profile_review_moderation (rating_id, status) VALUES ($1, 'approved')", [neu.id]
      );
      const mitFreigabe = await zaehle();
      assert.equal(mitFreigabe.n, vorher.n + 1, "eine freigegebene Bewertung muss zaehlen");

      await client.query(
        "UPDATE profile_review_moderation SET status = 'rejected' WHERE rating_id = $1", [neu.id]
      );
      const nachAblehnung = await zaehle();
      assert.equal(nachAblehnung.n, vorher.n,
        "eine abgelehnte Bewertung darf nicht mehr zaehlen — sie steht aber weiter in `ratings`");
      assert.equal(
        (await client.query("SELECT COUNT(*)::int AS n FROM ratings WHERE id = $1", [neu.id])).rows[0].n,
        1, "die Zeile bleibt bestehen — genau darum braucht es den Filter");

      await client.query("ROLLBACK");
    } finally {
      client.release();
      await pool.end();
    }
  });
});
