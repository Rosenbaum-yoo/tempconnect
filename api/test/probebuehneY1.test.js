/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIE PROBEBÜHNE HAT DIE FORM, DIE SIE VORFÜHRBAR MACHT (Y1.2)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WAS Y1.2 LÖST, gemessen am 2026-10-01 vor dem Bau:
 *
 *   Organisationen                                       2940
 *   davon mit mehr als EINEM Standort                        1
 *   Mitgliedschaften mit Standortbindung                     0   ← von 252
 *   Organisationen mit >1 Standort UND >1 Mitglied            0
 *
 * Die letzte Zeile ist der Befund. Welle U hat die Standortgrenze gebaut; der
 * Vorgang *„ich melde mich als Standortleitung Hamburg an und darf Berlin nicht
 * sehen"* ließ sich nicht einmal **herstellen**, weil es keine zweite Person in
 * derselben Firma an einem anderen Standort gab. Nicht dünn belegt — nicht
 * vorführbar.
 *
 * Nach dem Laden von `sql/seeds/y1-2-standorte.sql`: beide Nullen stehen auf 1.
 *
 * WARUM DIESE PROBE DIE DATEI PRÜFT UND NICHT DIE DATENBANK. Das Tor lädt keine
 * Saat — eine DB-gebundene Zusicherung wäre auf jedem Rechner rot, auf dem die
 * Bühne (noch) nicht geladen ist, und das wäre eine Rotfärbung ohne Befund.
 * Geprüft wird deshalb die **Form der Saat**: dass sie genau die Struktur
 * anlegt, die den Beweis trägt. Dass sie es dann wirklich tut, ist an der
 * laufenden Datenbank gemessen (Ergebnis oben).
 *
 * UND SIE PRÜFT DIE EINE SACHE, DIE NIE WIEDER PASSIEREN DARF: kein Passwort
 * und kein Hash in der Datei. Die drei älteren Saaten tragen `DemoPass2026!`,
 * `Demo2026!` und `password123` im Klartext in einem öffentlichen Repo. Die neue
 * nimmt das Passwort aus `app.seed_passwort` und hasht beim Laden mit
 * `pgcrypto`. Y6.3, vorweggenommen für die Datei, die ab heute dazukommt.
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
      const saat = path.join(dir, "sql", "seeds", "y1-2-standorte.sql");
      if (fs.existsSync(saat) && fs.statSync(saat).size > 2000) return dir;
      const eltern = path.dirname(dir);
      if (eltern === dir) break;
      dir = eltern;
    }
  }
  return null;
}

const ROOT = findeWurzel();
const suite = ROOT ? describe : describe.skip;
const SAAT = ROOT ? fs.readFileSync(path.join(ROOT, "sql", "seeds", "y1-2-standorte.sql"), "utf8") : "";

/** Der Rumpf einer Einfügung in eine bestimmte Tabelle, Kommentare entfernt. */
function einfuegung(tabelle) {
  const ohne = SAAT.replace(/--[^\n]*/g, " ");
  const re = new RegExp("INSERT\\s+INTO\\s+" + tabelle + "\\b[\\s\\S]*?;", "i");
  const m = ohne.match(re);
  return m ? m[0] : "";
}

suite("Y1.2 — die Probebühne trägt die Form, die die Standortgrenze vorführbar macht", () => {

  it("drei Standorte an EINER Organisation, genau einer als Hauptsitz", () => {
    const block = einfuegung("org_locations");
    assert.ok(block, "keine Einfügung in org_locations — die Bühne hätte keine Standorte");
    /* Die Tabelle heißt org_locations. `company_locations` hängt an user_id statt
       an org_id, trägt eine einzige Zeile und ist das Modell von vor den
       Organisationen; ALLE sieben location_id-Fremdschlüssel zeigen auf
       org_locations. Eine Saat, die die andere füllt, sähe richtig aus. */
    assert.ok(!/INSERT\s+INTO\s+company_locations/i.test(SAAT),
      "Die Saat füllt company_locations. Das ist die Tabelle VOR den Organisationen "
      + "(hängt an user_id); kein location_id-Fremdschlüssel der Plattform zeigt dorthin. "
      + "Sie würde nichts beweisen.");
    const orgIds = [...block.matchAll(/'(b0000000-[0-9a-f-]+)',\s*\n?\s*'(b0000000-[0-9a-f-]+)'/g)];
    const staedte = [...block.matchAll(/'(Hamburg|Schoenefeld|Muenchen)'/g)].map((m) => m[1]);
    assert.equal(new Set(staedte).size, 3,
      `Erwartet drei verschiedene Städte, gefunden ${[...new Set(staedte)].join(", ") || "keine"} — `
      + "mit zwei Standorten in derselben Stadt ist die Grenze schlechter vorführbar");
    assert.equal((block.match(/TRUE,\s+TRUE\)/g) || []).length, 1,
      "Genau EIN Standort muss is_hq=TRUE tragen. Keiner wäre ein unbelegter Standardfall, "
      + "zwei wären ein Widerspruch.");
    assert.ok(orgIds.length >= 3, "die drei Standorte hängen nicht alle an einer Organisation");
  });

  it("drei Mitgliedschaften, und GENAU EINE ist an einen Standort gebunden", () => {
    const block = einfuegung("org_memberships");
    assert.ok(block, "keine Einfügung in org_memberships — dann gibt es keine Menschen");
    /* Das ist der Kern von Y1.2. Zwei Rollen sehen org-weit, eine sieht einen
       Standort. Ohne die dritte Zeile ist die Grenze wieder nicht vorführbar;
       ohne die ersten zwei gibt es nichts, wogegen sie sich abgrenzt. */
    const zeilen = block.split(/\r?\n/).filter((z) => /^\s*\('b0000000-/.test(z) || /TRUE\)/.test(z));
    const mitStandort = (block.match(/'b0000000-0000-4000-8000-00000000a00[123]',\s*TRUE/g) || []).length;
    const ohneStandort = (block.match(/,\s*NULL,\s*TRUE/g) || []).length;
    assert.equal(mitStandort, 1,
      `Genau EINE Mitgliedschaft muss eine location_id tragen, gefunden ${mitStandort}. `
      + "Keine: die Grenze bleibt unvorführbar (im ganzen Bestand waren es 0 von 252). "
      + "Mehrere: dann fehlt die org-weite Gegenprobe.");
    assert.equal(ohneStandort, 2,
      `Zwei Mitgliedschaften müssen OHNE Standortbindung sein, gefunden ${ohneStandort} — `
      + "sonst gibt es niemanden, der alle drei Standorte sieht");
    assert.ok(zeilen.length >= 3, "weniger als drei Mitgliedschaften");
  });

  it("die drei Rollen sind verschieden und alle im CHECK erlaubt", () => {
    const block = einfuegung("org_memberships");
    const rollen = [...block.matchAll(/'(owner|admin|program_manager|hiring_manager|supplier_manager|finance|member|supplier_user|platform_admin|recruiter|dispatcher|viewer|worker)'/g)]
      .map((m) => m[1]);
    assert.equal(new Set(rollen).size, 3,
      `Erwartet drei VERSCHIEDENE Rollen, gefunden ${[...new Set(rollen)].join(", ") || "keine"}. `
      + "Dreimal dieselbe Rolle führt keine Rollenlogik vor. Erlaubte Werte stehen im "
      + "CHECK von org_memberships (13 Stück) — eine erfundene Rolle würde beim Laden brechen.");
    assert.ok(rollen.includes("admin"),
      "Die Verwaltung fehlt. Sie ist die org-weite Sicht, gegen die sich die Standortleitung abgrenzt.");
  });

  it("die Abteilungen hängen am Standort — die zweite Ebene der Bindung", () => {
    const block = einfuegung("org_departments");
    assert.ok(block, "keine Abteilungen — dann ist org_departments.location_id weiter unbelegt");
    const gebunden = (block.match(/'b0000000-0000-4000-8000-00000000a00[123]'/g) || []).length;
    assert.equal(gebunden, 3,
      `Erwartet drei standortgebundene Abteilungen, gefunden ${gebunden}. `
      + "Eine Abteilung ohne location_id behauptet die Bindung, ohne sie zu zeigen.");
  });

  it("KEIN Passwort und KEIN Hash in der Datei", () => {
    /* Die eine Sache, die nie wieder passieren darf. Y6.3, vorweggenommen. */
    const hashes = SAAT.match(/\$2[aby]\$\d\d\$[./A-Za-z0-9]{10,}/g) || [];
    assert.deepEqual(hashes, [],
      "Die Saat trägt einen bcrypt-Hash. Ein Hash im öffentlichen Repo ist ein Passwort "
      + "mit Umweg: wer ihn hat, kann offline raten, und der Klartext steht erfahrungsgemäß "
      + "zwei Zeilen darüber im Kommentar.");
    /* Klartext-Kandidaten: die drei bekannten und alles, was wie eine Zuweisung
       aussieht. Die Erwähnung der ALTEN Passwörter in der Begründung ist erlaubt
       und auch nötig — sie steht in einem Kommentar, nicht in einer Anweisung. */
    const ohneKommentar = SAAT.replace(/--[^\n]*/g, " ");
    for (const wort of ["DemoPass2026!", "Demo2026!", "password123"]) {
      assert.ok(!ohneKommentar.includes(wort),
        `Die Saat setzt '${wort}' in einer ANWEISUNG. Die drei alten Passwörter dürfen in der `
        + "Begründung vorkommen, nicht im SQL.");
    }
    assert.match(SAAT, /crypt\(\s*current_setting\('app\.seed_passwort'\)/,
      "Der Hash entsteht nicht aus dem Schalter. Genau das ist der Mechanismus, der das "
      + "Passwort aus dem Repo hält: current_setting('app.seed_passwort') + gen_salt('bf').");
    assert.match(SAAT, /gen_salt\('bf'/,
      "Kein bcrypt-Salz — ein anderes Verfahren würde bcryptjs.compare nicht bestehen, "
      + "und die Konten wären nicht anmeldbar");
  });

  it("ohne Schalter kein Hash: die Saat verweigert sich bei leerem oder kurzem Passwort", () => {
    assert.match(SAAT, /app\.seed_passwort[\s\S]{0,200}RAISE EXCEPTION/,
      "Ein leeres app.seed_passwort muss die Saat ABBRECHEN. Ohne Prüfung würde crypt('') "
      + "einen gültigen Hash für das leere Passwort erzeugen — anmeldbar für jeden.");
    assert.match(SAAT, /length\(current_setting\('app\.seed_passwort'[^)]*\)\)\s*<\s*12/,
      "Keine Mindestlänge. Diese Konten sind anmeldbar; ein kurzes Passwort macht die Bühne "
      + "zur Tür.");
    assert.match(SAAT, /pg_extension WHERE extname = 'pgcrypto'/,
      "Die Saat prüft pgcrypto nicht. Fehlt die Erweiterung, bricht crypt() mit einem "
      + "Funktionsfehler ab — und der nächste Reflex wäre, den Hash wieder in die Datei zu schreiben.");
  });

  it("stabile Kennungen, damit ein zweiter Lauf nichts verdoppelt", () => {
    /* Gemessen: zweiter Lauf ändert users/org_locations/org_memberships nicht. */
    const konflikte = (SAAT.match(/ON CONFLICT/g) || []).length;
    assert.ok(konflikte >= 5,
      `Nur ${konflikte} ON-CONFLICT-Klauseln. Jede Einfügung der Bühne braucht eine, sonst `
      + "bricht der zweite Lauf oder verdoppelt.");
    assert.ok(!/uuid_generate_v4\(\)/.test(SAAT),
      "Die Saat erzeugt UUIDs zur Laufzeit. Dann ist sie nicht wiederholbar und die Bühne "
      + "lässt sich nicht gezielt wieder entfernen.");
    /* Hex-gültig: ein 'y' wäre keine UUID — der erste Entwurf hatte genau das. */
    const ungueltig = SAAT.match(/'[0-9a-f]*[g-z][0-9a-z]*-[0-9a-z]{4}-[0-9a-z]{4}-/g) || [];
    assert.deepEqual(ungueltig, [],
      "Eine Kennung enthält Zeichen außerhalb von Hex und ist damit keine UUID — "
      + "die Saat würde beim Laden brechen.");
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Y1.5 — DIE STANDORT*AUSWERTUNG*, NICHT NUR DIE STANDORT*GRENZE*
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Y1.2 oben macht die Standort-GRENZE vorführbar: `standort.hamburg@` sieht
 * Berlin und München nicht. Gemessen am 2026-10-02 fehlte daneben die
 * AUSWERTUNG: von **73 Requisitions im ganzen Bestand trug keine einzige einen
 * Standort**, und Nordlicht hatte überhaupt keine. Über **fünfzehn**
 * Abfragestellen in `reportingService.js` und `spendAnalyticsService.js` hängen an
 * `r.location_id = $N` — keine davon hat je eine Zeile getroffen.
 *
 * Dieselbe Klasse wie die zwölf unbesetzten Zustände aus Y1.3: nicht fehlende
 * Daten, sondern ein fehlender ZUSTAND. Ein Filter, der nie etwas gefiltert hat,
 * ist eine Behauptung — und für einen Kunden mit fünfzig Standorten ist er der
 * Pfad, in dem er lebt.
 *
 * Die Prüfungen hier liegen in DIESER Datei und nicht in einer neuen: Y1.5 ist
 * der Anhang zu Y1.2, und zwei Dateien für eine Welle hätten zwei Orte, an denen
 * dieselbe Wahrheit veralten kann.
 */
const SAAT5 = ROOT ? fs.readFileSync(path.join(ROOT, "sql", "seeds", "y1-5-standortauswertung.sql"), "utf8") : "";
const OHNE5 = SAAT5.replace(/--[^\n]*/g, " ");
/* Nur der Datenteil: der Bremsen-Block nennt jede Dringlichkeit und jeden
 * Spaltennamen, weil er sie PRUEFT. Wer ihn mitliest, bekommt jede Zusicherung
 * geschenkt. */
const DATEN5 = (() => {
  const i = OHNE5.indexOf("DO $vollstaendig$");
  return i > 0 ? OHNE5.slice(0, i) : OHNE5;
})();

suite("Y1.5 — der Standortfilter des Reportings hat erstmals Zeilen", () => {

  it("die Saat ist da und wird gelesen", () => {
    assert.ok(SAAT5.length > 3000, `Saat zu kurz (${SAAT5.length} Zeichen) — wird sie noch gelesen?`);
    assert.match(DATEN5, /INSERT INTO requisitions/, "kein Einfüge-Befehl für requisitions");
  });

  it("die drei Standorte tragen UNGLEICH viele Bedarfe", () => {
    /* Ungleich ist die eigentliche Zusage. Bei drei gleich großen Standorten
     * sieht „Hamburg" wie ein Drittel aus, und man kann nicht unterscheiden, ob
     * gefiltert wurde oder geteilt. */
    const je = {};
    for (const m of DATEN5.matchAll(/'(b0000000-0000-4000-8000-00000000a00[123])'/g)) {
      je[m[1]] = (je[m[1]] || 0) + 1;
    }
    const zahlen = Object.values(je).sort((a, b) => a - b);
    assert.equal(zahlen.length, 3,
      `${zahlen.length} Standorte in der Saat, erwartet 3 (Hamburg, Berlin, München)`);
    assert.notEqual(zahlen[0], zahlen[1],
      `zwei Standorte haben gleich viele Bedarfe (${zahlen}) — dann unterscheidet ein `
      + "gefiltertes Ergebnis sich nicht erkennbar von einer Division");
    assert.notEqual(zahlen[1], zahlen[2], `zwei Standorte haben gleich viele Bedarfe (${zahlen})`);
  });

  it("die beiden vorher unbesetzten Dringlichkeiten sind besetzt", () => {
    /* Gemessen vor dieser Saat: `normal` 60, `high` 13, `urgent` und `notdienst`
     * **null**. Das sind die Stufen, an denen die Oberfläche farbig wird und der
     * SLA-Takt kürzer rechnet. */
    for (const d of ["urgent", "notdienst"]) {
      assert.ok(new RegExp("'" + d + "'").test(DATEN5),
        `die Dringlichkeit '${d}' kommt in der Saat nicht vor — sie hatte vorher `
        + "im ganzen Bestand kein Beispiel");
    }
  });

  it("KEIN SLA-Zustand aus der Saat — die Werte gehören dem Sweep", () => {
    /* Dieselbe Regel, die in Y6 den Geltungsbereich der Registratur begrenzt:
     * `RUNNING`/`MET`/`BREACHED` rechnet der Sweep aus. Eine Saat, die sie
     * hinschreibt, widerspricht der Stelle, die darüber entscheidet. */
    for (const spalte of ["sla_status", "sla_due_at", "sla_met_at", "sla_breached_at"]) {
      assert.ok(!new RegExp(spalte + "\\s*[,)]").test(DATEN5.split("INSERT INTO requisitions")[1] || ""),
        `die Saat setzt ${spalte}. Diese Werte rechnet der Sweep aus; eine Saat, die sie `
        + "hinschreibt, widerspricht der entscheidenden Stelle.");
    }
    assert.match(OHNE5, /sla_status IS NOT NULL/,
      "die Notbremse prüft nicht, dass kein SLA-Zustand gesetzt wurde");
  });

  it("der Freitext und die Kennung dürfen nicht auseinanderlaufen", () => {
    /* `location_city` ist der ältere Weg und wird von eigenen Trigramm-Indizes
     * gelesen. Ein Bedarf, dessen Kennung Hamburg sagt und dessen Freitext etwas
     * anderes, erscheint in der einen Auswertung und in der anderen nicht. */
    assert.match(OHNE5, /lower\(coalesce\(r\.location_city, ''\)\) <> lower\(l\.city\)/,
      "die Notbremse prüft nicht, dass location_city zur Standort-Kennung passt");

    /* UND DER WERT, NICHT DER SPALTENNAME. Erster Entwurf prüfte
     * `/location_city/` — und blieb grün, als die Rückmutation den WERT auf NULL
     * setzte: der Spaltenname steht ja weiter in der Spaltenliste. Eine
     * Zusicherung, die einen Namen sucht, wo ein Wert gemeint ist, prüft die
     * Buchhaltung statt der Sache.
     *
     * Dass ein NULL-Wert nicht durchkommt, hält am Ende die Notbremse der Saat
     * (sie vergleicht gegen `l.city` und bricht bei leer ab) — die sieht die
     * Datenbank, diese Probe nur den Text. Deshalb hier die Auswahlliste. */
    const auswahl = DATEN5.slice(DATEN5.indexOf("INSERT INTO requisitions"),
      DATEN5.indexOf("FROM (VALUES"));
    assert.match(auswahl, /r\.stadt\s*,\s*r\.plz/,
      "die Saat übergibt Stadt und Postleitzahl nicht aus der Zeilenliste — steht dort "
      + "NULL, fehlt der Bedarf in jeder Auswertung, die den Freitext liest, und "
      + "erscheint in jeder, die die Kennung liest");
  });

  it("die Auswertung, die das bedient, filtert wirklich auf location_id", () => {
    /* DIE BINDUNG AN DIE WIRKUNG. Ohne sie prüft alles darüber nur, dass eine
     * Saat Zeilen anlegt — und nicht, dass diese Zeilen einen Pfad bedienen, den
     * es gibt. Zieht der Filter um oder verschwindet er, wird das hier rot und
     * nicht erst beim Durchspielen. */
    const dienste = ["api/services/reportingService.js", "api/services/spendAnalyticsService.js"]
      .map((p) => fs.readFileSync(path.join(ROOT, p), "utf8"));
    const treffer = dienste.join("\n").match(/r\.location_id\s*=\s*\$/g) || [];
    assert.ok(treffer.length >= 5,
      `nur ${treffer.length} Abfragestellen filtern auf r.location_id, erwartet mindestens 5 — `
      + "wenn der Filter umgezogen ist, bedient diese Saat niemanden mehr");
  });

  it("stabile Kennungen und die Sperre, wie in jeder Saat", () => {
    assert.match(OHNE5, /current_setting\(\s*'app\.seed_demo_world'/,
      "die Saat hat keine Sperre");
    assert.match(OHNE5, /ON CONFLICT \(id\)/,
      "ohne ON CONFLICT (id) legt der zweite Lauf Doppel an");
    const feste = OHNE5.match(/'20\d\d-\d\d-\d\d/g) || [];
    assert.deepEqual(feste, [], `festes Datum in der Saat: ${feste.join(", ")}`);
  });
});
