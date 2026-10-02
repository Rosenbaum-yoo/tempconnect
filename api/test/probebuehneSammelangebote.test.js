/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SAMMELANGEBOTE, DIE NICHT DIE DOPPELBUCHUNG VORFÜHREN (Y2.4 · Y2.7)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * DER PLAN NENNT HIER SELBST EINE FALLE, und die Messung bestätigt sie genau.
 * Gemessen am 2026-10-01: die beiden vorhandenen Pool-Angebote teilen sich
 * **dieselben zwei Menschen** (Max Mustermann, Anna Kraft) — und beide stehen
 * zusätzlich in **vier** bzw. **drei** offenen Einzelangeboten.
 *
 * Eine Bühne, die auf ihnen aufbaut, führt also genau die **Doppelbuchung** vor,
 * die der Betrugsriegel widerlegen soll. Der Owner nennt diesen Zustand
 * ausdrücklich Betrug: *„ein Mensch, fünfmal gebucht, wäre Betrug"*
 * (`api/services/bindungSql.js`).
 *
 * ZWEI ANGEBOTE, ZWEI ZWECKE — und der Unterschied ist der ganze Punkt:
 *
 *   (A) Y2.7  vier Mitglieder, die in KEINEM Einzelangebot stehen.
 *             Dafür sind die vier Kräfte OHNE Katalog-Fähigkeit richtig:
 *             `sweepMarktpraesenz()` legt für sie NIE ein Einzelangebot an
 *             (Bedingung 6 fehlt). Die Exklusivität hält damit DAUERHAFT, nicht
 *             bis zum nächsten Cron-Takt.
 *
 *   (B) Y2.4  der Gegenstand für M4c.3: drei Mitglieder, eines davon **im
 *             Einsatz**. `capacityExchangeService` rechnet die freie Kopfzahl
 *             als `SUM(CASE WHEN NOT gebunden THEN 1 ELSE 0 END)`. Gemessen
 *             nach dem Laden: **Mitglieder 3, frei 2.** Wer die Oberfläche
 *             öffnet und drei sieht, hat den Riegel gefunden.
 *
 * `quelle = 'manuell'` IST KEIN SCHMUCK, und das ist gemessen: die Rücknahme des
 * Sweeps fasst ausschließlich `quelle = 'live_belegschaft'` an. Mit der falschen
 * Herkunft hätte der nächste Takt beide Angebote abgeräumt — geprüft durch einen
 * echten `sweepMarktpraesenz()`-Lauf: 2 Angebote und 7 Mitgliedschaften vorher,
 * dieselben danach, freie Kopfzahl weiter 2.
 *
 * Geprüft wird die FORM der Saat — das Tor lädt keine Saat.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findeWurzel() {
  for (const start of [__dirname, process.cwd()]) {
    let dir = path.resolve(start);
    for (let i = 0; i < 8; i++) {
      const saat = path.join(dir, "sql", "seeds", "y2-3-sammelangebote.sql");
      if (fs.existsSync(saat) && fs.statSync(saat).size > 4000) return dir;
      const eltern = path.dirname(dir);
      if (eltern === dir) break;
      dir = eltern;
    }
  }
  return null;
}

const ROOT = findeWurzel();
const suite = ROOT ? describe : describe.skip;
const SAAT = ROOT ? fs.readFileSync(path.join(ROOT, "sql", "seeds", "y2-3-sammelangebote.sql"), "utf8") : "";
const OHNE_KOMMENTAR = SAAT.replace(/--[^\n]*/g, " ");
const DATENTEIL = (() => {
  const i = OHNE_KOMMENTAR.indexOf("DO $vollstaendig$");
  return i > 0 ? OHNE_KOMMENTAR.slice(0, i) : OHNE_KOMMENTAR;
})();
const DIENST = ROOT ? fs.readFileSync(path.join(ROOT, "api", "services", "capacityExchangeService.js"), "utf8") : "";

/** Die Mitglieder-Einfügung eines der beiden Angebote. */
function mitglieder(postId) {
  const bloecke = DATENTEIL.match(/INSERT INTO capacity_post_pool_members[\s\S]*?(?=ON CONFLICT)/gi) || [];
  return bloecke.find((b) => b.includes(postId)) || "";
}

const POOL_A = "bb000000-0000-4000-8000-00000000a001";
const POOL_B = "bb000000-0000-4000-8000-00000000a002";
/* Die vier Kräfte ohne Katalog-Fähigkeit (HPS-009..012). */
const OHNE_FAEHIGKEIT = ["d009", "d010", "d011", "d012"];

suite("Y2.4/Y2.7 — Sammelangebote mit eigenen Mitgliedern", () => {

  it("(A) vier Mitglieder, und alle vier sind Kräfte OHNE Katalog-Fähigkeit", () => {
    const block = mitglieder(POOL_A);
    assert.ok(block.length > 100,
      `Die Mitglieder-Einfügung von (A) ließ sich nicht abgrenzen (${block.length} Zeichen)`);
    const ids = [...block.matchAll(/00000000(d\d{3})'/g)].map((m) => m[1]);
    assert.equal(new Set(ids).size, 4,
      `Erwartet vier VERSCHIEDENE Mitglieder, gefunden ${new Set(ids).size} (${ids.join(", ")}).`);
    /* DER PUNKT: nur Kräfte ohne Katalog-Fähigkeit halten die Exklusivität
       dauerhaft. Mit Fähigkeit legt der Sweep ein Einzelangebot an, und das
       Sammelangebot führt wieder die Doppelbuchung vor. */
    const falsch = ids.filter((k) => !OHNE_FAEHIGKEIT.includes(k));
    assert.deepEqual(falsch, [],
      `Diese Mitglieder von (A) sind nicht aus der Gruppe ohne Katalog-Fähigkeit: ${falsch.join(", ")}. `
      + "sweepMarktpraesenz() legt für eine Kraft MIT Fähigkeit ein Einzelangebot an — damit "
      + "steht sie doppelt, und die Bühne führt genau die Doppelbuchung vor, die sie widerlegen soll.");
  });

  it("(A) die Saat PRÜFT, dass die vier keine Fähigkeit tragen — nicht nur annimmt", () => {
    /* Eine Behauptung im Kommentar hält nicht: gibt jemand einer der vier später
       eine Fähigkeit, ist die Exklusivität beim nächsten Cron-Takt weg. Also
       muss die Saat es selbst prüfen. */
    assert.match(SAAT, /SELECT count\(\*\) INTO n FROM worker_profile_skills/,
      "Die Saat prüft nicht, ob die vier Pool-Kräfte fähigkeitsfrei sind. Bekommt eine von "
      + "ihnen später eine Katalog-Fähigkeit, legt der Sweep ein Einzelangebot an und die "
      + "Exklusivität ist lautlos weg.");
    assert.match(SAAT, /IF n <> 0 THEN/,
      "Die Prüfung wertet ihr Ergebnis nicht aus");
    assert.match(SAAT, /Doppelbuchung vor, die es widerlegen soll/,
      "Die Fehlermeldung nennt den Grund nicht — dann weiß der Leser nicht, warum das zählt");
  });

  it("(B) drei Mitglieder: eines gebunden, eines doppelt, eines frei", () => {
    const block = mitglieder(POOL_B);
    assert.ok(block.length > 100, "Die Mitglieder-Einfügung von (B) ließ sich nicht abgrenzen");
    const ids = [...block.matchAll(/00000000(d\d{3})'/g)].map((m) => m[1]);
    assert.equal(new Set(ids).size, 3,
      `Erwartet drei verschiedene Mitglieder, gefunden ${new Set(ids).size} (${ids.join(", ")})`);
    assert.ok(ids.includes("d007"),
      "Tomasz Nowak (d007) fehlt. Er ist die GEBUNDENE Kraft — ohne sie ist die Lücke zwischen "
      + "Mitgliederzahl und freier Kopfzahl nicht da, und M4c.3 hat keinen Gegenstand.");
    assert.ok(ids.includes("d001"),
      "Jonas Harms (d001) fehlt. Er ist der BEWUSST doppelt geführte Mensch — er steht "
      + "zusätzlich in einem automatischen Einzelangebot, und genau das verlangt Y2.4.");
  });

  it("die freie Kopfzahl wird so gerechnet, wie der Dienst sie rechnet", () => {
    /* Die Notbremse der Saat bildet `SUM(CASE WHEN NOT gebunden ...)` nach. Weicht
       sie von `capacityExchangeService` ab, prüft sie etwas anderes als die
       Oberfläche zeigt — und das wäre schlimmer als keine Prüfung. */
    assert.match(DIENST, /CASE WHEN NOT \$\{gebundenSql\("m\.worker_profile_id"\)\} THEN 1 ELSE 0 END/,
      "Der Dienst rechnet die freie Kopfzahl nicht mehr so — diese Zusicherung beruft sich "
      + "darauf und müsste neu gelesen werden");
    assert.match(SAAT, /worker_assignment_links bl ON bl\.worker_user_id\s*=\s*bw\.user_id/,
      "Die Notbremse der Saat prüft die Bindung nicht über worker_assignment_links.worker_user_id "
      + "— dann rechnet sie anders als gebundenSql() und belegt die falsche Zahl.");
    assert.match(SAAT, /IF frei <> 2 THEN/,
      "Die Notbremse verlangt nicht genau ZWEI freie von drei Mitgliedern. Ohne diese Lücke ist "
      + "der Riegel aus M4c.3 („ein Sammelangebot kann nie mehr Menschen liefern, als frei sind\") "
      + "nicht vorführbar.");
  });

  it("die Herkunft ist 'manuell' — sonst räumt der nächste Cron-Takt die Bühne ab", () => {
    /* Gemessen: die Rücknahme des Sweeps fasst ausschließlich
       `quelle = 'live_belegschaft'` an. Ein echter sweepMarktpraesenz()-Lauf ließ
       beide Angebote und alle sieben Mitgliedschaften unberührt. */
    const posts = DATENTEIL.match(/INSERT INTO capacity_posts[\s\S]*?(?=ON CONFLICT)/gi) || [];
    assert.equal(posts.length, 2, `Erwartet zwei Sammelangebote, gefunden ${posts.length}`);
    for (const p of posts) {
      assert.match(p, /'manuell'/,
        "Ein Sammelangebot trägt nicht quelle='manuell'. Mit 'live_belegschaft' räumt die "
        + "Rücknahme des Sweeps es beim nächsten Takt ab, und die Bühne ist nach einer Stunde "
        + "wieder leer — ohne dass jemand es merkt.");
      assert.ok(!/'live_belegschaft'/.test(p),
        "Ein Sammelangebot behauptet die Herkunft 'live_belegschaft'. Dann gehört es dem Sweep, "
        + "und der nimmt es zurück, weil er es nicht selbst angelegt hätte.");
    }
  });

  it("der Katalogname wird gelesen, nicht getippt", () => {
    const treffer = (DATENTEIL.match(/FROM platform_skills ps\s*\n?\s*WHERE ps\.name = 'Lagerhelfer:in' AND ps\.is_active AND ps\.status = 'approved'/g) || []).length;
    assert.equal(treffer, 2,
      `Nur ${treffer} von zwei Angeboten lesen primary_skill_id aus platform_skills. Mit einer `
      + "getippten Kennung zeigt das Angebot auf eine fremde oder nicht existierende Fähigkeit, "
      + "und die INSERT..SELECT legt lautlos keine Zeile an.");
  });

  it("die Saat verlangt die Belegschaft aus Y1.4 — und zählt sie", () => {
    assert.match(SAAT, /IF n <> 6 THEN/,
      "Die Saat prüft nicht, ob alle sechs benötigten Kräfte da sind. Fehlt eine, bricht sie an "
      + "einem Fremdschlüssel ab, und niemand erkennt, dass nur die Reihenfolge fehlte.");
    assert.ok(SAAT.includes("y1-4-belegschaft.sql"),
      "Die Fehlermeldung nennt nicht, welche Saat zuerst laufen muss");
  });

  it("die Notbremse prüft alle vier Eigenschaften an ihrer Bedingung", () => {
    for (const [bedingung, was] of [
      [/IF mitglieder <> 4 THEN/, "vier Mitglieder in (A)"],
      [/IF exklusiv <> 0 THEN/, "keines davon in einem Einzelangebot"],
      [/IF mitglieder <> 3 THEN/, "drei Mitglieder in (B)"],
      [/IF frei <> 2 THEN/, "genau zwei davon frei"],
      [/IF doppelt < 1 THEN/, "mindestens einer doppelt geführt"],
    ]) {
      assert.match(SAAT, bedingung,
        `Die Notbremse prüft nicht: ${was}. Eine Notbremse, die nur einen Teil prüft, lässt die `
        + "Saat erfolgreich durchlaufen und die Lage halb hinterlassen.");
    }
  });

  it("ein zweiter Lauf verdoppelt nichts", () => {
    const konflikte = (OHNE_KOMMENTAR.match(/ON CONFLICT/g) || []).length;
    assert.ok(konflikte >= 4, `Nur ${konflikte} ON-CONFLICT-Klauseln, erwartet mindestens vier`);
    assert.match(OHNE_KOMMENTAR, /ON CONFLICT \(capacity_post_id, worker_profile_id\) DO NOTHING/,
      "Die Mitgliedschaften haben keinen Konflikt-Zweig auf ihrem Eindeutigkeits-Paar — "
      + "ein zweiter Lauf bricht dann am UNIQUE ab.");
    assert.ok(!/uuid_generate_v4\(\)|gen_random_uuid\(\)/.test(OHNE_KOMMENTAR),
      "Die Saat erzeugt Kennungen zur Laufzeit — dann ist sie nicht wiederholbar");
  });
});
