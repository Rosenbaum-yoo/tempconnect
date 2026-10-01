/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DREI GEGENSTÄNDE FEHLTEN GANZ, NICHT TEILWEISE (Y2.3 · Y2.5 · Y2.6)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * GEMESSEN AM 2026-10-01:
 *
 *   `invoices`                   **0 Zeilen** — alle FÜNF Zustände unbesetzt.
 *                                Die Mahnstrecke aus Y2.3 war nicht zeigbar.
 *   `company_worker_blocklist`   **0 Zeilen** — Y2.5s zentrale Zusage
 *                                („bei A gesperrt, bei B sichtbar") hatte kein
 *                                Beispiel.
 *   Fähigkeits-Vorschläge        **0** — alle 162 Katalog-Einträge standen auf
 *                                `approved`. Die Kuratierfläche hatte nichts zu
 *                                kuratieren.
 *
 * EINE LEERE TABELLE IST SCHLIMMER ALS EIN UNBESETZTER ZUSTAND: beim Zustand
 * sieht man wenigstens die Liste. Bei der leeren Tabelle sieht man nichts und
 * weiß nicht, ob die Fläche kaputt ist oder nur leer.
 *
 * Nach `sql/seeds/y2-1-geldwege.sql`, gemessen: fünf Rechnungszustände, **5 von
 * 5 Summen rechnen auf**, kein festes Kalenderdatum in der Datei, die Sperre bei
 * Nordlicht UND die Kraft weiter mit einem offenen Angebot im Markt, ein
 * `proposed` und ein `merged` mit korrektem Ziel.
 *
 * DIE GELD-ARITHMETIK IST HIER KEIN DETAIL. Eine Bühne für Geldwege, deren
 * Summen nicht aufgehen, ist das Gegenteil eines Belegs: wer sie vorführt,
 * zeigt einen Rechenfehler als Produkt. Die Datenbank erzwingt
 * `gross - discount = amount`; `total = amount + tax` erzwingt sie NICHT, und
 * genau deshalb steht es hier.
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
      const saat = path.join(dir, "sql", "seeds", "y2-1-geldwege.sql");
      if (fs.existsSync(saat) && fs.statSync(saat).size > 3000) return dir;
      const eltern = path.dirname(dir);
      if (eltern === dir) break;
      dir = eltern;
    }
  }
  return null;
}

const ROOT = findeWurzel();
const suite = ROOT ? describe : describe.skip;
const SAAT = ROOT ? fs.readFileSync(path.join(ROOT, "sql", "seeds", "y2-1-geldwege.sql"), "utf8") : "";
const OHNE_KOMMENTAR = SAAT.replace(/--[^\n]*/g, " ");
/* Nur der Teil, der Zeilen anlegt — die Notbremse nennt jeden Zustand selbst. */
const DATENTEIL = (() => {
  const i = OHNE_KOMMENTAR.indexOf("DO $vollstaendig$");
  return i > 0 ? OHNE_KOMMENTAR.slice(0, i) : OHNE_KOMMENTAR;
})();

/** Die fünf Zahlenspalten jeder Rechnungszeile, in Reihenfolge der Spaltenliste. */
function rechnungen() {
  const block = (DATENTEIL.match(/INSERT INTO invoices[\s\S]*?(?=ON CONFLICT)/i) || [""])[0];
  /* Je Zeile: brutto, rabatt_pct, rabatt_cents, netto, steuer_pct, steuer_cents, summe */
  return [...block.matchAll(/(\d+), (\d+), (\d+), (\d+), (19\.0), (\d+), (\d+), 'EUR',\s*\n\s*'(\w+)'/g)]
    .map((m) => ({
      brutto: +m[1], rabattProzent: +m[2], rabattCents: +m[3], netto: +m[4],
      steuerCents: +m[6], summe: +m[7], status: m[8],
    }));
}

suite("Y2 — die Geldwege und die drei leeren Tabellen", () => {

  it("Y2.3: alle fünf Rechnungszustände kommen in einer ANWEISUNG vor", () => {
    for (const status of ["draft", "issued", "overdue", "paid", "void"]) {
      assert.match(DATENTEIL, new RegExp("'" + status + "'"),
        `Der Rechnungszustand '${status}' steht in keiner zeilenanlegenden Anweisung. `
        + "Gemessen hatte `invoices` NULL Zeilen — alle fünf Zustände waren unbesetzt.");
    }
    /* Und beide Rechnungsarten: eine Abo-Rechnung ist ein anderer Weg als eine
       operative, und beide Flächen zeigen sie getrennt. */
    for (const art of ["operational", "subscription"]) {
      assert.match(DATENTEIL, new RegExp("'" + art + "'"),
        `Die Rechnungsart '${art}' fehlt. Abo- und Einsatz-Abrechnung laufen getrennt; `
        + "eine Bühne mit nur einer Art zeigt die Hälfte.");
    }
  });

  it("DIE SUMMEN RECHNEN AUF — jede Zeile einzeln", () => {
    const r = rechnungen();
    /* Notbremse: ohne erkannte Zeilen ist alles darunter leer grün. */
    assert.equal(r.length, 5,
      `Nur ${r.length} Rechnungszeilen erkannt, erwartet fünf. Entweder fehlt eine, oder die `
      + "Spaltenreihenfolge hat sich geändert — dann prüft diese Zusicherung nichts mehr.");
    for (const z of r) {
      assert.equal(z.brutto - z.rabattCents, z.netto,
        `${z.status}: brutto ${z.brutto} - Rabatt ${z.rabattCents} ergibt nicht netto ${z.netto}. `
        + "Die Datenbank erzwingt das (CHECK) — die Saat würde beim Laden brechen.");
      assert.equal(z.netto + z.steuerCents, z.summe,
        `${z.status}: netto ${z.netto} + MwSt ${z.steuerCents} ergibt nicht ${z.summe}. `
        + "DIESE Rechnung erzwingt die Datenbank NICHT — eine Bühne für Geldwege mit falscher "
        + "Summe zeigt einen Rechenfehler als Produkt.");
      assert.equal(z.steuerCents, Math.round(z.netto * 0.19),
        `${z.status}: 19 % von ${z.netto} sind ${Math.round(z.netto * 0.19)}, nicht ${z.steuerCents}.`);
      if (z.rabattProzent > 0) {
        assert.equal(z.rabattCents, Math.round(z.brutto * z.rabattProzent / 100),
          `${z.status}: ${z.rabattProzent} % von ${z.brutto} sind `
          + `${Math.round(z.brutto * z.rabattProzent / 100)}, nicht ${z.rabattCents}.`);
      }
    }
    /* Mindestens eine Zeile MIT Rabatt — sonst ist die Rabattrechnung ungeprüft. */
    assert.ok(r.some((z) => z.rabattProzent > 0),
      "Keine Rechnung trägt einen Rabatt. Dann bleibt der Rabattpfad (discount_pct, "
      + "discount_amount_cents) ohne Beispiel, und die Zusicherung darüber prüft ihn nie.");
  });

  it("Y2.3: alle Fälligkeiten sind RELATIV, kein Kalenderdatum", () => {
    const feste = OHNE_KOMMENTAR.match(/'20\d\d-\d\d-\d\d/g) || [];
    assert.deepEqual(feste, [],
      `Die Saat trägt feste Kalenderdaten (${feste.join(", ")}). Y2.3 verlangt ausdrücklich `
      + "relative Werte: „die Mahnstrecke zeigt echte Fälligkeiten statt ,vor zwei Jahren'\". "
      + "Ein festes Datum ist in drei Wochen falsch.");
    assert.match(DATENTEIL, /\(CURRENT_DATE \+ \d+\)::timestamptz/,
      "Keine Fälligkeit in der ZUKUNFT — dann fehlt der gewöhnliche Fall „gestellt, noch nicht fällig\"");
    assert.match(DATENTEIL, /\(CURRENT_DATE - \d+\)::timestamptz/,
      "Keine Fälligkeit in der VERGANGENHEIT — dann fehlt die Überfälligkeit, also die Mahnstrecke");
  });

  it("Y2.3: die überfällige Rechnung trägt eine Mahnstufe und hängt am gesperrten Kunden", () => {
    const block = (DATENTEIL.match(/INSERT INTO invoices[\s\S]*?(?=ON CONFLICT)/i) || [""])[0];
    /* Die Zeile mit 'overdue' herausschneiden und IHRE Werte prüfen — nicht den
       ganzen Block, sonst trifft die Zusicherung eine andere Zeile. */
    const zeile = (block.match(/\('b7000000-0000-4000-8000-00000000a003'[\s\S]*?(?='b7000000-0000-4000-8000-00000000a004'|$)/) || [""])[0];
    assert.match(zeile, /'overdue'/, "die dritte Zeile ist nicht die überfällige");
    assert.match(zeile, /\n\s+2, now\(\) - interval '\d+ days'/,
      "Die überfällige Rechnung trägt keine Mahnstufe > 0 mit Mahndatum. Ohne beides zeigt die "
      + "Mahnstrecke eine Überfälligkeit, aber keinen Vorgang.");
    /* Und sie hängt an der Organisation, die wegen Zahlungsausfall gesperrt ist
       (Y1.3) — eine Überfälligkeit ohne Folge wäre ein halber Vorgang. */
    assert.match(zeile, /'b3000000-0000-4000-8000-000000000005'/,
      "Die überfällige Rechnung hängt nicht an der Organisation, die wegen Zahlungsausfall "
      + "gesperrt ist (Y1.3). Überfälligkeit und Sperre gehören zusammen; getrennt zeigen sie "
      + "zwei Zustände, die nichts miteinander zu tun haben.");
  });

  it("Y2.5: die Sperre nennt BEIDE Seiten — gesperrt bei A, Lieferant B", () => {
    assert.match(DATENTEIL, /INSERT INTO company_worker_blocklist/i,
      "keine Sperre — Y2.5 bleibt ohne Beispiel (gemessen: die Tabelle war LEER)");
    const block = (DATENTEIL.match(/INSERT INTO company_worker_blocklist[\s\S]*?(?=ON CONFLICT)/i) || [""])[0];
    assert.match(block, /'b0000000-0000-4000-8000-000000000001'/,
      "Die Sperre gilt nicht bei Nordlicht Logistik. Sie muss bei einem Kunden gelten, der "
      + "auch Einsätze hat — sonst ist die Sperre folgenlos.");
    assert.match(block, /'b5000000-0000-4000-8000-00000000c001'/,
      "Die Sperre trifft nicht Jonas Harms. Nur bei ihm lässt sich die Gegenseite zeigen: er "
      + "steht mit einem automatischen Angebot im Markt und bleibt dort sichtbar.");
    assert.match(block, /'b1000000-0000-4000-8000-000000000001'/,
      "Die Sperre nennt den vermittelnden Lieferanten nicht. Ohne supplier_org_id fehlt die "
      + "Angabe, über wen die Kraft kam.");
    assert.match(block, /CURRENT_DATE \+ 90/,
      "Die Sperre hat kein relatives Ende. Ohne blocked_until ist sie unbefristet, und mit "
      + "einem festen Datum läuft sie irgendwann ab, ohne dass es jemand merkt.");
  });

  it("Y2.6: ein VORSCHLAG und eine ZUSAMMENFÜHRUNG — zwei verschiedene Fälle", () => {
    assert.match(DATENTEIL, /'proposed'/,
      "Kein offener Vorschlag. Gemessen standen alle 162 Katalog-Einträge auf 'approved' — "
      + "die Kuratierfläche hatte nichts zu kuratieren.");
    assert.match(DATENTEIL, /'merged'/,
      "Keine zusammengeführte Schreibvariante. Vorschlag und Zusammenführung sind VERSCHIEDENE "
      + "Fälle: der eine wartet auf eine Entscheidung, der andere ist entschieden.");
    /* Das Ziel wird AUS dem Katalog gelesen, nicht getippt. */
    assert.match(DATENTEIL, /FROM platform_skills ps\s*\n?\s*WHERE ps\.name = 'Lagerhelfer:in'/,
      "Das Zusammenführungs-Ziel ist getippt statt aus platform_skills gelesen. Ein Tippfehler "
      + "ließe merged_into_skill_id ins Leere zeigen — und die INSERT..SELECT legte lautlos "
      + "keine Zeile an.");
    /* Beide sind is_active = FALSE: ein Vorschlag darf nicht schon zählen. */
    const vorschlag = (DATENTEIL.match(/'Kaltlager-Kommissionierung[\s\S]*?'proposed'/) || [""])[0];
    assert.match(vorschlag, /FALSE, 'proposed'/,
      "Der Vorschlag steht auf is_active = TRUE. Dann erfüllt er das Katalog-Tor "
      + "(`is_active AND status='approved'` ist zwar nicht erfüllt, aber andere Abfragen lesen "
      + "nur is_active) und zählte als freigegebene Fähigkeit, obwohl niemand ihn entschieden hat.");
  });

  it("die Notbremse prüft die ZUSTÄNDE, nicht ihren Text", () => {
    assert.match(SAAT, /array_length\(fehlt, 1\) > 0/,
      "Die Notbremse wertet ihre Sammelliste nicht aus");
    const pruefungen = (SAAT.match(/IF NOT EXISTS \(SELECT 1 FROM (invoices|company_worker_blocklist|platform_skills)/g) || []).length;
    assert.ok(pruefungen >= 12,
      `Nur ${pruefungen} Einzelprüfungen in der Notbremse, erwartet mindestens zwölf. `
      + "Eine Notbremse, die nur einen Teil prüft, lässt die Saat erfolgreich durchlaufen und "
      + "einen Gegenstand fehlen.");
    assert.match(SAAT, /dunning_level > 0/,
      "Die Notbremse prüft die Mahnstufe nicht — dann könnte die Mahnstrecke ohne Vorgang "
      + "„erledigt\" aussehen");
    assert.match(SAAT, /merged_into_skill_id IS NOT NULL/,
      "Die Notbremse prüft nicht, ob die Zusammenführung ein Ziel hat");
  });

  it("die Saat verlangt ihre Grundlagen — und sagt welche", () => {
    for (const [id, datei] of [
      ["b0000000-0000-4000-8000-000000000001", "y1-2-standorte.sql"],
      ["b1000000-0000-4000-8000-000000000001", "y1-4-belegschaft.sql"],
      ["b5000000-0000-4000-8000-00000000c001", "y3-arbeiterstadien.sql"],
    ]) {
      assert.match(SAAT, new RegExp("IF NOT EXISTS \\(SELECT 1 FROM (organizations|users) WHERE id = '" + id + "'\\) THEN"),
        `Die Saat prüft nicht, ob ${id} vorhanden ist. Ohne Prüfung bricht sie mit einem `
        + "Fremdschlüsselfehler ab, und niemand erkennt, dass nur die Reihenfolge fehlte.");
      assert.ok(SAAT.includes(datei),
        `Die Fehlermeldung nennt ${datei} nicht — dann weiß der Leser nicht, was zuerst laufen muss`);
    }
  });

  it("ein zweiter Lauf verdoppelt nichts", () => {
    const konflikte = (OHNE_KOMMENTAR.match(/ON CONFLICT/g) || []).length;
    assert.ok(konflikte >= 4, `Nur ${konflikte} ON-CONFLICT-Klauseln, erwartet mindestens vier`);
    assert.ok(!/uuid_generate_v4\(\)|gen_random_uuid\(\)/.test(OHNE_KOMMENTAR),
      "Die Saat erzeugt Kennungen zur Laufzeit — dann ist sie nicht wiederholbar");
  });
});
