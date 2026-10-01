/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIE SAAT SPERRT SICH SELBST — AUF JEDEM LADEWEG (Y0.1)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WARUM DIESE DATEI ZUERST KOMMT: Welle Y legt eine Probebühne an — eine
 * größere, strukturierte Demo-Welt. Von allen Fehlern dieser Welle ist genau
 * einer **nicht zurücknehmbar**: anmeldbare Konten, die versehentlich in einer
 * Produktionsdatenbank landen. Alles andere lässt sich löschen; ein Login, das
 * eine Woche offen stand, nicht.
 *
 * BEFUND (gemessen 2026-10-01, vier Ladewege nachgegangen):
 *
 * Migration 052 war seit dem Vorfall sauber gegatet (`app.seed_demo_world`),
 * und 125 räumte den Altbestand auf. Die Sperre galt aber **nur für die
 * Migrationskette**. Daneben lagen drei Saat-Dateien unter `sql/seeds/`, die
 * fünf anmeldbare Konten mit echtem bcrypt-Hash anlegen — und die hatten:
 *
 *   - **keine** Sperre in der Datei selbst (0 von 3),
 *   - **keine** Transaktionsklammer in `dev-data.sql`, so dass ein Abbruch
 *     oben die Anweisungen darunter nicht gestoppt hätte,
 *   - als einzigen Schutz einen `NODE_ENV`-Vergleich im ladenden Skript.
 *
 * DER SCHUTZ PRÜFTE DEN FALSCHEN GEGENSTAND. `scripts/dev/seed-data.sh` liest
 * `NODE_ENV` der **Shell**, schreibt aber in die Datenbank des **Containers**.
 * Auf einem Produktions-Host hat die Shell eines Betreibers üblicherweise kein
 * `NODE_ENV` — der Riegel fiel damit auf `"development"` zurück und ließ durch.
 *
 * UND ES GAB EINEN WEG DANEBEN. `docs/SALES_DEMO_PATH.md` dokumentierte
 * zweimal `psql $DATABASE_URL < sql/seeds/demo-sales.sql`. Dieser Befehl geht
 * am Skript vorbei und damit an JEDER Prüfung — dokumentiert, kopierbar, mit
 * dem Hinweis „NIEMALS in Produktion" als einziger Absicherung. Ein Satz ist
 * kein Riegel.
 *
 * WAS GEBAUT WURDE: die Sperre sitzt jetzt in der Datei, die die Zeilen anlegt.
 * Damit gilt sie für jeden Ladeweg — Skript, Direktaufruf, künftige Pfade, die
 * heute noch niemand kennt. Das ladende Skript setzt den Schalter (`PGOPTIONS`,
 * genau wie `sql/migrate.sh`) und verlangt ihn ausdrücklich, statt ihn aus der
 * Umgebung zu erraten.
 *
 * GEMESSENER BEWEIS an der laufenden Datenbank (2026-10-01):
 *   - ohne Schalter, alle drei Dateien: `ERROR: … SEED_DEMO_WORLD nicht aktiv`
 *   - **6** Folge-Anweisungen mit `current transaction is aborted` blockiert
 *   - **0** erfolgreiche Einfügungen, psql endet mit `ROLLBACK` (das eigene
 *     `COMMIT;` der Datei wurde zur Rücknahme)
 *   - `users` unverändert bei 409 vorher **und** nachher
 *   - mit Schalter: der Block lässt durch (zurückgerollt, keine Zeile blieb)
 *
 * WAS DIESE PROBE NICHT KANN: sie führt keine Saat aus — das täte eine
 * DB-gebundene Probe, und die Sperre selbst ist oben an der echten Datenbank
 * bewiesen. Hier wird die **Form** festgehalten, damit niemand sie wegnimmt:
 * die vier Ladewege, der Schalter, die Reihenfolge, die Transaktionsklammer.
 *
 * ZUSAMMENHANG: dieselbe Klasse wie `test/dokumentierteBefehleLaufen.test.js`
 * (ein dokumentierter Befehl, der nicht tut, was dasteht) und
 * `test/abbildIstSelbstgenuegsam.test.js` (eine Zusage im Kommentar statt im
 * Mechanismus).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* Aufwärts suchen UND auf Inhalt prüfen: Docker legt Mount-Ziele als leere
   Verzeichnisse an, und ein leeres Verzeichnis macht jede Prüfung lautlos
   grün. Verankert wird an den Dingen, die diese Probe wirklich braucht. */
function findeWurzel() {
  for (const start of [__dirname, process.cwd()]) {
    let dir = path.resolve(start);
    for (let i = 0; i < 8; i++) {
      const saat = path.join(dir, "sql", "seeds", "dev-data.sql");
      const lader = path.join(dir, "scripts", "dev", "seed-data.sh");
      if (fs.existsSync(saat) && fs.statSync(saat).size > 500
          && fs.existsSync(lader) && fs.statSync(lader).size > 500) return dir;
      const eltern = path.dirname(dir);
      if (eltern === dir) break;
      dir = eltern;
    }
  }
  return null;
}

const ROOT = findeWurzel();
const suite = ROOT ? describe : describe.skip;

const lies = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const SCHALTER = "app.seed_demo_world";

/* Kommentare entfernen: ein "INSERT INTO users" im Kommentar fügt nichts ein,
   und ein Schaltername im Kommentar sperrt nichts. Beides hat in dieser
   Sitzung schon Rückmutationen grün gelassen. */
/* Zeilenweise Variante: Kommentarinhalt schwärzen, Zeilennummern behalten.
   Gebraucht, wo die REIHENFOLGE geprüft wird — der Schaltername steht auch in
   der Begründung über dem Block, und eine Suche nach dem bloßen Namen findet
   dann den Kommentar statt der Anweisung. Genau so ist Rückmutation A2 beim
   ersten Lauf grün geblieben. */
function zeilenOhneKommentar(sql) {
  let inBlock = false;
  return sql.split(/\r?\n/).map((z) => {
    let s = z;
    if (inBlock) { const e = s.indexOf("*/"); if (e < 0) return ""; inBlock = false; s = s.slice(e + 2); }
    for (;;) {
      const a = s.indexOf("/*");
      if (a < 0) break;
      const e = s.indexOf("*/", a + 2);
      if (e < 0) { s = s.slice(0, a); inBlock = true; break; }
      s = s.slice(0, a) + " " + s.slice(e + 2);
    }
    const i = s.indexOf("--");
    return i >= 0 ? s.slice(0, i) : s;
  });
}

/* Die AUSFÜHRBARE Schalterprüfung, nicht irgendeine Erwähnung des Namens. */
const ANWEISUNG = /current_setting\(\s*'app\.seed_demo_world'/;

/* ── Anleitung oder Fundbeschreibung? ──────────────────────────────────────
   D1 und D2 unten suchen nach etwas Verbotenem im Text. Beide waren beim
   ersten Lauf an MEINEM EIGENEN Befundbericht rot: wer einen toten Pfad
   dokumentiert, muss ihn nennen. Der erste Entwurf prüfte deshalb, ob in
   DERSELBEN ZEILE eine Verneinung steht — und das reicht nicht, weil Sätze
   umbrechen: „…nannten Skripte, die es" / „nicht gibt (`sql/seed.sh`…)".
   Geprüft wird jetzt der ABSATZ. Ein Codeblock dagegen hat keinen Satz, der
   ihn relativieren könnte, und zählt immer — genau dort stand der Befund vom
   2026-10-01 (ein ```bash-Block in docs/SALES_DEMO_PATH.md). */
const VERNEINUNG = /fruehere|frühere|vorbei|nicht gibt|nicht mehr|niemals|verweigert|umgeht|umging|existiert nicht|gab es nie|war falsch/i;

/* Eine ANLEITUNG wird von Prosa NIE entschuldigt — auch nicht von einer
   Verneinung im selben Absatz. Denn eine Verneinung über Pfad A entschuldigt
   Pfad B nicht, und genau daran ist eine Rückmutation einmal entwischt: sie
   setzte „**Anleitung:** `sql/seed.sh` ausfuehren" neben meinen eigenen Satz
   „…weil es diese Datei nicht gibt". Zwei Pfade, eine Verneinung, falsches Grün. */
const ANLEITUNG = /\b(Anleitung|Aufruf|Nutzung|Usage|Befehl|ausf(ü|ue)hren|starten|Ladebefehl)\b/i;

/** Absätze einer Datei: zusammenhängende nicht-leere Zeilen, je Zeilennummer. */
function absatzKarte(text) {
  const z = text.split(/\r?\n/);
  const karte = new Array(z.length).fill("");
  let ab = 0;
  const schreibe = (von, bis) => {
    const stueck = z.slice(von, bis).join(" ");
    for (let i = von; i < bis; i++) karte[i] = stueck;
  };
  for (let i = 0; i <= z.length; i++) {
    if (i === z.length || z[i].replace(/^>\s?/, "").trim() === "") { schreibe(ab, i); ab = i + 1; }
  }
  return karte;
}

/** Für jede Zeile: liegt sie in einem ```-Codeblock? */
function zaunKarte(text) {
  const z = text.split(/\r?\n/);
  const karte = new Array(z.length).fill(false);
  let drin = false;
  for (let i = 0; i < z.length; i++) {
    if (/^\s*```/.test(z[i])) { drin = !drin; karte[i] = true; continue; }
    karte[i] = drin;
  }
  return karte;
}

function ohneKommentar(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/* Tabellen, deren Zeilen eine "Welt" ausmachen. Katalogtabellen (Pläne, Rollen,
   Fähigkeiten) gehören absichtlich in jede Installation und stehen nicht hier. */
const WELT = ["organizations", "org_memberships", "worker_profiles", "locations",
  "departments", "subscriptions", "requisitions", "offers", "assignments",
  "contracts", "vendor_pool", "listings", "capacity_posts"];

function fuegtEinIn(sql, tabellen) {
  const rein = ohneKommentar(sql);
  return tabellen.filter((t) =>
    new RegExp("INSERT\\s+INTO\\s+(?:public\\.)?" + t + "\\b", "i").test(rein));
}

/* Saat-Dateien, die Welt- ODER Anmelde-Zeilen anlegen. Die Liste wird nicht
   aufgeschrieben, sondern gefunden: eine neue Saat-Datei fällt damit
   automatisch unter alle Prüfungen. */
function saatDateien() {
  const dir = path.join(ROOT, "sql", "seeds");
  return fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()
    .map((f) => ({ name: f, rel: "sql/seeds/" + f, sql: fs.readFileSync(path.join(dir, f), "utf8") }))
    .filter((d) => fuegtEinIn(d.sql, [...WELT, "users"]).length > 0);
}

function migrationen() {
  const dir = path.join(ROOT, "sql", "migrations");
  return fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()
    .map((f) => ({ name: f, sql: fs.readFileSync(path.join(dir, f), "utf8") }));
}

suite("Y0.1 — die Saat sperrt sich selbst, auf jedem Ladeweg", () => {

  /* ─────────────────────────────────────────────────────────────────────────
     TEIL A — die Saat-Dateien sperren sich selbst
     Die Sperre gehört in die Datei, die die Zeilen anlegt. Nur dort gilt sie
     für JEDEN Ladeweg, auch für einen, den es heute noch nicht gibt.
     ───────────────────────────────────────────────────────────────────────── */

  it("A1: jede Saat-Datei, die Zeilen anlegt, prüft den Schalter selbst", () => {
    const dateien = saatDateien();
    /* Notbremse: ohne Gegenstand ist jede Zusicherung darunter leer grün. */
    assert.ok(dateien.length >= 3,
      `Erwartet mindestens 3 Saat-Dateien mit Einfügungen, gefunden ${dateien.length}`);
    for (const d of dateien) {
      assert.ok(ohneKommentar(d.sql).includes(SCHALTER),
        `${d.rel} legt Zeilen an (${fuegtEinIn(d.sql, [...WELT, "users"]).join(", ")}), prüft aber ${SCHALTER} nicht`);
    }
  });

  it("A2: die Sperre steht VOR der ersten Einfügung", () => {
    for (const d of saatDateien()) {
      const z = zeilenOhneKommentar(d.sql);
      const iSperre = z.findIndex((s) => ANWEISUNG.test(s));
      const iInsert = z.findIndex((s) => /^\s*INSERT\s+INTO/i.test(s));
      assert.ok(iSperre >= 0, `${d.rel}: keine Sperre gefunden`);
      assert.ok(iInsert >= 0, `${d.rel}: keine Einfügung gefunden — Probe prüft nichts`);
      assert.ok(iSperre < iInsert,
        `${d.rel}: Sperre in Zeile ${iSperre + 1} steht NACH der ersten Einfügung in Zeile ${iInsert + 1} — eine Sperre hinter der Tat ist Deko`);
    }
  });

  it("A3: die Sperre WIRFT — ein Hinweis allein hält nichts auf", () => {
    for (const d of saatDateien()) {
      const rein = ohneKommentar(d.sql);
      /* Der Abschnitt von der Schalterprüfung bis zum Ende ihres Blocks. */
      const ab = rein.indexOf(SCHALTER);
      const block = rein.slice(ab, ab + 600);
      assert.match(block, /RAISE\s+EXCEPTION/i,
        `${d.rel}: die Schalterprüfung wirft keine Ausnahme. RAISE NOTICE oder ein bloßes RETURN würde die Anweisungen darunter weiterlaufen lassen`);
    }
  });

  it("A4: die Bedingung ist IS DISTINCT FROM — nicht <>, das bei fehlendem Schalter durchlässt", () => {
    for (const d of saatDateien()) {
      const rein = ohneKommentar(d.sql);
      const ab = rein.indexOf(SCHALTER);
      const block = rein.slice(ab, ab + 300);
      assert.match(block, /IS\s+DISTINCT\s+FROM\s+'true'/i,
        `${d.rel}: Vergleich ist nicht IS DISTINCT FROM 'true'. `
        + `current_setting(…, true) liefert bei NICHT GESETZTEM Schalter NULL — `
        + `"NULL <> 'true'" ist NULL, die IF-Bedingung also falsch, und die Saat läuft genau im gefährlichen Fall durch`);
    }
  });

  it("A5: jede gesperrte Saat-Datei steht in einer Transaktion — sonst leckt der Abbruch", () => {
    for (const d of saatDateien()) {
      const z = zeilenOhneKommentar(d.sql);
      const iBegin = z.findIndex((s) => s.trim() === "BEGIN;");
      const iCommit = z.findIndex((s) => s.trim() === "COMMIT;");
      const iSperre = z.findIndex((s) => ANWEISUNG.test(s));
      assert.ok(iBegin >= 0, `${d.rel}: kein BEGIN; — ohne Transaktion ist jede Anweisung ihre eigene, und der Abbruch der Sperre stoppt die darunter NICHT`);
      assert.ok(iCommit > iBegin, `${d.rel}: kein COMMIT; nach BEGIN;`);
      assert.ok(iBegin < iSperre,
        `${d.rel}: BEGIN; (Zeile ${iBegin + 1}) steht nach der Sperre (Zeile ${iSperre + 1}) — die Ausnahme würde keine Transaktion abbrechen`);
    }
  });

  /* ─────────────────────────────────────────────────────────────────────────
     TEIL B — die Migrationskette
     ───────────────────────────────────────────────────────────────────────── */

  it("B1: Migration 052 fügt keine Zeile außerhalb des gegateten Blocks ein", () => {
    const sql = lies("sql/migrations/052_demo_seed_world.sql");
    const z = ohneKommentar(sql).split(/\r?\n/);
    const ab = z.findIndex((s) => s.includes("DO $seed_demo_world$"));
    const bis = z.findIndex((s, i) => i > ab && s.includes("$seed_demo_world$") && !s.includes("DO "));
    assert.ok(ab >= 0 && bis > ab, "052: gegateter Block nicht gefunden");
    const draussen = [];
    for (let i = 0; i < z.length; i++) {
      if (i > ab && i < bis) continue;
      if (/^\s*INSERT\s+INTO/i.test(z[i])) draussen.push(i + 1);
    }
    assert.deepEqual(draussen, [],
      `052: Einfügungen außerhalb des gegateten Blocks in Zeile(n) ${draussen.join(", ")} — die laufen auch auf Produktion`);
    /* Und der Block prüft wirklich den Schalter. */
    assert.ok(z.slice(ab, ab + 8).join("\n").includes(SCHALTER),
      "052: der Block heißt seed_demo_world, prüft den Schalter aber nicht");
  });

  it("B2: Migration 125 räumt den Altbestand auf — und nur ohne Schalter", () => {
    const rein = ohneKommentar(lies("sql/migrations/125_remediate_demo_seed_backdoor.sql"));
    assert.ok(rein.includes(SCHALTER),
      "125 prüft den Schalter nicht — sie würde in dev die absichtlich offenen Demo-Logins mit zusperren");
    assert.match(rein, /IS\s+DISTINCT\s+FROM\s+'true'/i,
      "125: umgekehrtes Gate fehlt oder vergleicht falsch");
    assert.match(rein, /UPDATE\s+users[\s\S]{0,400}password_hash/i,
      "125 setzt keinen password_hash mehr — die Aufräumwirkung ist weg");
  });

  it("B3: KEINE Migration legt ungegatet ein Konto an — ohne Ausnahme", () => {
    const treffer = migrationen()
      .filter((m) => fuegtEinIn(m.sql, ["users"]).length > 0)
      .filter((m) => !ohneKommentar(m.sql).includes(SCHALTER));
    assert.deepEqual(treffer.map((m) => m.name), [],
      "Diese Migration(en) fügen ungegatet in users ein. Ein Konto ist ein Anmeldeweg — "
      + "dafür gibt es keine begründete Ausnahme, auch nicht für eine Reparatur. "
      + "Siehe 125_remediate_demo_seed_backdoor.sql: genau das war der Vorfall.");
  });

  it("B4: Welt-Zeilen ungegatet nur mit benannter Begründung", () => {
    /* Zwei gemessene Ausnahmen, beide mit Grund — nicht mit Zuruf:
       039: die Einfügungen hängen an einem Riegel ANDERER Art (existiert der
            dev-data-Nutzer a0000000-…-001?). Auf Produktion existiert er nicht,
            also No-Op. Gemessen am 2026-10-01 im DO $demo$-Block der Datei.
       041: echter Nachtrag — eine Organisation pro BESTEHENDEM Nutzer, aus
            dessen eigenen Daten (r.user_id/r.org_name in einer LOOP). Legt
            kein Konto an, schafft keinen Anmeldeweg. */
    const AUSNAHMEN = {
      "039_demo_mode.sql": "gegatet über die Existenz des dev-data-Nutzers a0000000-…-001 (DO $demo$ + früher RETURN)",
      "041_backfill_org_memberships.sql": "Nachtrag über bestehende Nutzer (LOOP über r.user_id), legt kein Konto an",
    };
    const offen = migrationen()
      .filter((m) => fuegtEinIn(m.sql, WELT).length > 0)
      .filter((m) => !ohneKommentar(m.sql).includes(SCHALTER))
      .map((m) => m.name)
      .filter((n) => !(n in AUSNAHMEN));
    assert.deepEqual(offen, [],
      `Ungegatete Welt-Einfügung ohne Begründung: ${offen.join(", ")}. `
      + "Entweder hinter app.seed_demo_world setzen oder hier mit gemessenem Grund eintragen.");

    /* Eine Ausnahmeliste, die auf verschwundene Dateien zeigt, verdeckt
       stillschweigend neue Fälle: jeder Eintrag muss existieren UND noch
       wirklich ungegatet einfügen, sonst gehört er gelöscht. */
    for (const [name, grund] of Object.entries(AUSNAHMEN)) {
      const p = path.join(ROOT, "sql", "migrations", name);
      assert.ok(fs.existsSync(p), `Ausnahme ${name} existiert nicht mehr — Eintrag entfernen`);
      assert.ok(grund.length > 30, `Ausnahme ${name} ohne tragfähige Begründung`);
    }
    /* Und 039s eigener Riegel muss stehen — die Begründung oben behauptet ihn. */
    const m039 = ohneKommentar(lies("sql/migrations/039_demo_mode.sql"));
    assert.match(m039, /IF\s+NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+users\s+WHERE\s+id\s*=\s*'a0000000-0000-0000-0000-000000000001'/i,
      "039: der in der Ausnahmeliste behauptete Riegel (Existenz des dev-data-Nutzers) fehlt — dann ist die Ausnahme hinfällig");
  });

  /* ─────────────────────────────────────────────────────────────────────────
     TEIL C — die ladenden Skripte
     ───────────────────────────────────────────────────────────────────────── */

  it("C1: seed-data.sh verlangt ausdrückliche Zustimmung, nicht eine erratene Umgebung", () => {
    const sh = lies("scripts/dev/seed-data.sh");
    assert.match(sh, /SEED_DEMO_WORLD_NORM=\$\(printf/,
      "seed-data.sh normalisiert SEED_DEMO_WORLD nicht (gleiche Form wie sql/migrate.sh)");
    assert.match(sh, /if\s+\[\s+"\$SEED_DEMO_WORLD_NORM"\s+!=\s+"true"\s+\][\s\S]{0,200}fail/,
      "seed-data.sh bricht ohne Schalter nicht ab. Der NODE_ENV-Vergleich allein genügt nicht: "
      + "er liest die Shell, geschrieben wird in den Container — auf einem Prod-Host ist NODE_ENV "
      + "üblicherweise ungesetzt und der Riegel fällt auf \"development\" zurück");
  });

  it("C2: seed-data.sh gibt die Schalter wirklich an die Sitzung weiter", () => {
    const sh = lies("scripts/dev/seed-data.sh");
    /* Nicht auf die ganze Zeichenkette prüfen: in PGOPTIONS stehen inzwischen
       ZWEI Schalter, und eine wörtliche Prüfung wurde dadurch rot, obwohl sie
       nichts Falsches gefunden hatte. Geprüft wird, dass der Schalter DRIN ist. */
    assert.match(sh, new RegExp("PGOPTIONS=\"[^\"]*-c " + SCHALTER.replace(/\./g, "\\.") + "=true"),
      "seed-data.sh setzt den Schalter nicht per PGOPTIONS — dann verweigern die Saat-Dateien "
      + "auch den erlaubten Entwickler-Pfad, und der Riegel wird umgangen statt benutzt");
    /* Und der zweite Schalter: ohne ihn kann sql/seeds/y1-probebuehne.sql nicht
       laden, denn sie trägt ABSICHTLICH kein Passwort im Repo (Y6.3) und hasht
       beim Laden aus `app.seed_passwort`. */
    assert.match(sh, /PGOPTIONS="[^"]*-c app\.seed_passwort=/,
      "seed-data.sh reicht app.seed_passwort nicht weiter. Dann bricht die Probebühne beim "
      + "Laden ab — oder, schlimmer, jemand schreibt wieder ein Passwort in die Datei.");
  });

  it("C3: seed-data.sh macht einen Fehler zum Fehler", () => {
    const sh = lies("scripts/dev/seed-data.sh");
    assert.match(sh, /psql\s+-v\s+ON_ERROR_STOP=1/,
      "ohne ON_ERROR_STOP endet psql mit 0, auch wenn die ganze Transaktion abgebrochen ist — "
      + "das Skript meldete dann \"Seed geladen\", obwohl keine einzige Zeile entstand");
  });

  it("C4: die Zustimmung steht vor dem TRUNCATE — nicht danach", () => {
    const z = lies("scripts/dev/seed-data.sh").split(/\r?\n/);
    const iZustimmung = z.findIndex((s) => s.includes('"$SEED_DEMO_WORLD_NORM" != "true"'));
    const iTruncate = z.findIndex((s) => /TRUNCATE\s+users/i.test(s));
    const iList = z.findIndex((s) => s.includes('"$DO_LIST" = true'));
    assert.ok(iZustimmung >= 0 && iTruncate > 0, "Zustimmung oder TRUNCATE nicht gefunden");
    assert.ok(iZustimmung < iTruncate,
      `Zustimmung (Zeile ${iZustimmung + 1}) steht nach TRUNCATE users CASCADE (Zeile ${iTruncate + 1})`);
    /* Und sie darf das harmlose Auflisten nicht blockieren: --list legt keine
       Zeile an und muss ohne Schalter funktionieren. */
    assert.ok(iList >= 0 && iList < iZustimmung,
      "--list liegt hinter der Zustimmung — Auflisten legt keine Zeile an und darf nicht am Schalter scheitern");
  });

  it("C5: migrate.sh gibt den Schalter weiter und steht standardmäßig auf false", () => {
    const sh = lies("sql/migrate.sh");
    assert.match(sh, new RegExp("PGOPTIONS=.*-c " + SCHALTER.replace(/\./g, "\\.") + "="),
      "migrate.sh reicht den Schalter nicht mehr als Session-GUC weiter — 052 würde dann nie seeden "
      + "oder, schlimmer, von einer anderen Quelle gesetzt werden");
    assert.match(sh, /\$\{SEED_DEMO_WORLD:-false\}/,
      "migrate.sh hat keine Vorgabe false mehr — ein nicht gesetzter Schalter muss SPERREN, nicht öffnen");
  });

  /* ─────────────────────────────────────────────────────────────────────────
     TEIL D — kein Weg daneben
     ───────────────────────────────────────────────────────────────────────── */

  it("D1: nichts im Baum dokumentiert einen Ladebefehl, der am Riegel vorbeigeht", () => {
    const treffer = [];
    const geh = (dir, tiefe = 0) => {
      if (tiefe > 6) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) geh(p, tiefe + 1);
        else if (/\.(md|sh|sql|ya?ml)$/.test(e.name)) {
          const t = fs.readFileSync(p, "utf8");
          const zeilen = t.split(/\r?\n/);
          const absatz = absatzKarte(t);
          const zaun = zaunKarte(t);
          for (let i = 0; i < zeilen.length; i++) {
            /* Direktaufruf: psql … < sql/seeds/… — umgeht jedes Skript. */
            if (!/psql[^\n]*<\s*(?:\$?\{?\w*\}?\/)?sql\/seeds\//.test(zeilen[i])) continue;
            /* In einem Codeblock ist es eine ANLEITUNG — dort steht kein Satz,
               der ihn relativieren könnte. Genau dort stand der Befund. */
            const istAnleitung = zaun[i] || !VERNEINUNG.test(absatz[i]);
            if (istAnleitung) {
              treffer.push(path.relative(ROOT, p).replace(/\\/g, "/")
                + ":" + (i + 1) + ": " + zeilen[i].trim().slice(0, 80));
            }
          }
        }
      }
    };
    geh(ROOT);
    assert.deepEqual(treffer, [],
      "Dieser Befehl geht an scripts/dev/seed-data.sh und damit an jeder Prüfung vorbei:\n  "
      + treffer.join("\n  ")
      + "\nErlaubt ist: SEED_DEMO_WORLD=true ./scripts/dev/seed-data.sh --file=<datei>");
  });

  it("D2: jedes in docs/ als Pfad genannte Skript existiert", () => {
    const fehlend = new Map();
    let gesehen = 0;
    const geh = (dir, tiefe = 0) => {
      if (tiefe > 6) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name.startsWith(".")) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { geh(p, tiefe + 1); continue; }
        if (!e.name.endsWith(".md")) continue;
        const t = fs.readFileSync(p, "utf8");
        const absatz = absatzKarte(t);
        /* Zeilenanfänge aus dem ROHTEXT: bei CRLF ist ein Zeilenumbruch zwei
           Zeichen, und eine aus `split()` gerechnete Zuordnung driftet dann
           Zeile um Zeile weiter nach vorn. */
        const anfaenge = [0];
        for (let k = 0; k < t.length; k++) if (t[k] === "\n") anfaenge.push(k + 1);
        const zeileVon = (offset) => {
          let lo = 0, hi = anfaenge.length - 1;
          while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (anfaenge[mid] <= offset) lo = mid; else hi = mid - 1; }
          return lo;
        };
        for (const m of t.matchAll(/`\.?\/?((?:sql|scripts|api|e2e|frontend|nginx)\/[\w./-]*\.sh)`/g)) {
          gesehen++;
          if (fs.existsSync(path.join(ROOT, m[1]))) continue;
          /* Ein Pfad, dessen ABSATZ sagt, dass es ihn nicht gibt, ist eine
             Fundbeschreibung — keine Anleitung. Zeilenlokal zu prüfen reicht
             nicht: „…nannten Skripte, die es" / „nicht gibt (`sql/seed.sh`…)".
             Steht die Zeile aber in ANLEITUNGSFORM, sticht das die Entschuldigung
             aus: der historische Befund war genau „**Anleitung:** `sql/seed.sh`
             ausführen" in docs/pilot/PILOT_CORE_FLOW.md. */
          const zeileNr = zeileVon(m.index);
          const zeilentext = (t.split(/\r?\n/)[zeileNr] || "");
          if (!ANLEITUNG.test(zeilentext) && VERNEINUNG.test(absatz[zeileNr] || "")) continue;
          const wo = path.relative(ROOT, p).replace(/\\/g, "/");
          if (!fehlend.has(m[1])) fehlend.set(m[1], new Set());
          fehlend.get(m[1]).add(wo);
        }
      }
    };
    geh(path.join(ROOT, "docs"));
    /* Notbremse: ohne Gegenstand wäre "nichts fehlt" leer grün. */
    assert.ok(gesehen >= 15, `Erwartet mindestens 15 Skript-Nennungen in docs/, gefunden ${gesehen}`);
    assert.deepEqual([...fehlend.keys()], [],
      "Die Doku nennt Skripte, die es nicht gibt:\n  "
      + [...fehlend].map(([k, v]) => k + " (in " + [...v].join(", ") + ")").join("\n  ")
      + "\nGemessen am 2026-10-01 waren das sql/seed.sh und scripts/verify_release_dir.sh — "
      + "letzteres hieß wirklich scripts/release-verify.sh.");
  });

  it("D3: compose sperrt standardmäßig, Produktion ausdrücklich", () => {
    assert.match(lies("docker-compose.yml"), /SEED_DEMO_WORLD:\s*\$\{SEED_DEMO_WORLD:-false\}/,
      "docker-compose.yml: Vorgabe ist nicht mehr false");
    assert.match(lies("docker-compose.prod.yml"), /SEED_DEMO_WORLD:\s*"?false"?/,
      "docker-compose.prod.yml sagt nicht mehr ausdrücklich false — auf Produktion ist Schweigen zu wenig");
    assert.match(lies(".env.example"), /SEED_DEMO_WORLD=false/,
      ".env.example: die Vorlage, die jeder kopiert, muss auf false stehen");
  });
});
