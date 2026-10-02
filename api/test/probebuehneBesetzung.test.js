/**
 * ═══════════════════════════════════════════════════════════════════════════
 * IST DIE BESETZUNG VOLLSTÄNDIG? (Y6.1 – Y6.4)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Y6 fragt nicht nach einer weiteren Saat, sondern nach einer EIGENSCHAFT aller
 * Saaten zusammen: ist die Bühne vollständig, datumsfrei, passwortfrei und
 * wiederholbar? Die einzelnen Wächter (`probebuehne*.test.js`) prüfen je eine
 * Datei. Dieser hier prüft den BESTAND — und das ist der Unterschied, der
 * zählt: eine neue Saat, die ein festes Datum oder ein Passwort mitbringt, kommt
 * an einem Wächter vorbei, der nur die Datei seiner eigenen Welle liest.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WARUM Y6.1 EINEN GELTUNGSBEREICH BRAUCHT — UND KEINE PAUSCHALE
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Gemessen am 2026-10-02 gegen die laufende Datenbank: **233 Aufzählungs-CHECKs
 * auf 117 Tabellen**, und **100 Spalten** haben mindestens einen erlaubten Wert
 * ohne Beispiel. „Die Besetzung ist vollständig" kann also NICHT „jeder legale
 * Wert im ganzen Schema" heißen. Das wäre nicht ehrgeizig, sondern falsch:
 *
 *   - `platform_events.event_type` (35 Werte), `requisition_events.event_type`
 *     (23), `audit_log.action_type`: PROTOKOLLE. Ihr Wert entsteht, wenn die
 *     Handlung passiert. Eine Saat, die sie füllt, fälscht Geschichte.
 *   - `invoices.currency` = USD/GBP, `rate_cards.currency`: DACH-first. Es gibt
 *     keinen Kunden, der in Dollar abgerechnet wird.
 *   - `payment_sessions.method` = stripe/paypal: der Zahlungsanbieter ist
 *     Tier-1-Konfiguration und steht auf „manual". Eine erfundene
 *     Stripe-Sitzung wäre eine Behauptung über einen Anbieter, der nicht
 *     angebunden ist.
 *   - `*.sla_status` = BREACHED/MET/RUNNING: das rechnet der Sweep aus. Eine
 *     Saat, die BREACHED hinschreibt, widerspricht der Stelle, die darüber
 *     entscheidet.
 *   - `assignment_staffing_*`: die Maschinerie der Welle M. Ihre Zustände
 *     entstehen, wenn eine Kampagne läuft.
 *
 * Deshalb ist Y6.1 eine RATSCHE MIT GELTUNGSBEREICH, nach dem Muster von
 * `docs/.docs-consistency-baseline.json`: die Registratur unten nennt, was die
 * Bühne BEANSPRUCHT. Darin muss jeder Wert ein Beispiel haben. Alles andere
 * steht als gemessene Bestandsaufnahme in `docs/features/Y_PROBEBUEHNE.md` —
 * damit niemand das Grün hier für Vollständigkeit des Schemas hält.
 *
 * Die drei Dinge, die der Plan wörtlich nennt — **Rolle, Plan, Zustand** —
 * binden an den CODE, nicht an eine Abschrift: `STAFF_ROLLEN`,
 * `CANONICAL_PLAN_KEYS` und die Rollenliste von `PERMISSIONS` werden
 * importiert. Eine Kopie geht beim nächsten Wert auseinander, ohne rot zu
 * werden.
 *
 * Run: node --test --test-force-exit test/probebuehneBesetzung.test.js
 * Mit Datenbank: DATABASE_URL=… node --test test/probebuehneBesetzung.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasDb, createPool } from "./integration/helpers.js";
import { STAFF_ROLLEN } from "../config/staffRollen.js";
import { CANONICAL_PLAN_KEYS } from "../config/planCatalog.js";
import { PERMISSIONS, ROLE_HIERARCHY } from "../services/rbacService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findeWurzel(relPfad) {
  for (const start of [process.cwd(), __dirname]) {
    let dir = path.resolve(start);
    for (let i = 0; i < 8; i++) {
      if (fs.existsSync(path.join(dir, relPfad))) return dir;
      const eltern = path.dirname(dir);
      if (eltern === dir) break;
      dir = eltern;
    }
  }
  return null;
}

const SAAT_DIR = path.join("sql", "seeds");
const ROOT = findeWurzel(SAAT_DIR);
const suite = ROOT ? describe : describe.skip;

/** Alle Saaten, jede einmal mit und einmal ohne Kommentare. */
const SAATEN = ROOT
  ? fs.readdirSync(path.join(ROOT, SAAT_DIR))
    .filter((f) => f.endsWith(".sql"))
    .map((f) => {
      const roh = fs.readFileSync(path.join(ROOT, SAAT_DIR, f), "utf8");
      return { name: f, roh, text: roh.replace(/--[^\n]*/g, " ") };
    })
  : [];

/** Der Datenteil einer Saat: ohne Kommentare UND ohne den Bremsen-Block. */
function datenteil(s) {
  const i = s.text.indexOf("DO $vollstaendig$");
  return i > 0 ? s.text.slice(0, i) : s.text;
}

const ALLE_DATEN = SAATEN.map(datenteil).join("\n");

/**
 * Alle Einfuege-Bloecke einer TABELLE, ueber alle Saaten hinweg.
 *
 * WARUM NICHT IM GANZEN KORPUS GESUCHT WIRD: der erste Entwurf tat das, und er
 * war an einer Stelle still gruen. `invoices.plan = 'DEMO'` galt als besetzt,
 * weil `'DEMO'` irgendwo im Korpus steht — naemlich als `organizations.plan` in
 * einer anderen Saat. Gemessen gegen die Datenbank hatte `invoices` aber NUR
 * `PLUS`. Wer einen Wert irgendwo im Text sucht, kann eine fehlende Spalte nie
 * als fehlend melden.
 */
function bloeckeFuer(tabelle) {
  const re = new RegExp("INSERT\\s+INTO\\s+" + tabelle + "\\b[\\s\\S]*?;", "gi");
  return SAATEN.map(datenteil).flatMap((d) => d.match(re) || []).join("\n");
}

/**
 * DIE REGISTRATUR — was die Bühne beansprucht.
 *
 * Je Eintrag: die Werte (aus dem Code, wo es eine Quelle gibt) und die Begründung,
 * warum dieser Zustand sichtbar sein MUSS. Ein Eintrag ohne Begründung wäre eine
 * Pflicht ohne Grund, und die wird beim ersten Widerstand gestrichen.
 */
const REGISTRATUR = [
  {
    gegenstand: "Staff-Rollen", tabelle: "tempconnect_staff", spalte: "role",
    werte: STAFF_ROLLEN,
    warum: "Jede Rolle gatet andere Fachbereiche (darfStaffBereich). Eine Rolle ohne "
      + "Träger ist eine Behauptung — fünf von sechs waren es bis Y4."
  },
  {
    gegenstand: "Org-Rollen", tabelle: "org_memberships", spalte: "role_key",
    /* `worker` steht ABSICHTLICH extra: die beiden Code-Quellen kennen ihn nicht
     * (0 von 63 Rechten, kein Eintrag in ROLE_HIERARCHY), der CHECK der Tabelle
     * aber schon — und 37 Zeilen tragen ihn. Er ist nicht vergessen, er ist
     * ausserhalb des Rechtesystems: `api/config/arbeiterRiegel.js` gatet das
     * Einsatzportal ueber Pfade statt ueber Permissions. Ohne diese Zeile waere
     * die Registratur bei 12 und niemandem faellt auf, dass die dreizehnte
     * Rolle anders funktioniert. */
    werte: [...new Set(Object.values(PERMISSIONS).flat()
      .concat(Object.keys(ROLE_HIERARCHY)).concat(["worker"]))].sort(),
    warum: "63 Rechte, 13 Rollen, und hasPermission() erbt über ROLE_HIERARCHY. "
      + "platform_admin hat dadurch 63 von 63 Rechten — die mächtigste Org-Rolle des "
      + "Systems, und sie hatte keinen einzigen Träger."
  },
  {
    gegenstand: "Plan", tabelle: "organizations", spalte: "plan",
    werte: CANONICAL_PLAN_KEYS,
    warum: "Der Plan entscheidet über Entitlements. Jeder kanonische Plan braucht eine Org."
  },
  {
    gegenstand: "Plan auf der Rechnung", tabelle: "invoices", spalte: "plan",
    werte: CANONICAL_PLAN_KEYS,
    warum: "Die Rechnung zeigt den Plan. Nur PLUS hatte ein Beispiel — eine "
      + "DEMO-Rechnung sieht anders aus als eine INDIVIDUELL-Rechnung."
  },
  {
    gegenstand: "Einladungs-Zustand", tabelle: "worker_invites", spalte: "status",
    werte: ["pending", "accepted", "expired", "revoked"],
    warum: "Die Einladungsfläche zeigt je Zustand etwas anderes; verfallen und "
      + "zurückgezogen sind die beiden, die ein Disponent erklären muss."
  },
  {
    gegenstand: "Nachweis-Zustand", tabelle: "worker_profile_documents", spalte: "status",
    werte: ["pending_review", "verified", "rejected", "archived"],
    warum: "Ein abgelehnter Nachweis ist der Fall, in dem die Fläche einen Grund "
      + "zeigen muss. Es gab keinen."
  },
  {
    gegenstand: "Abwesenheits-Art", tabelle: "worker_absences", spalte: "art",
    werte: ["krank", "urlaub", "termin", "sonstiges"],
    warum: "K-3 im Regiebuch läuft über die Abwesenheit. Nur „krank\" hatte ein Beispiel — "
      + "und nur „krank\" verdeckt eine Kraft am Markt."
  },
  {
    gegenstand: "Abwesenheits-Zustand", tabelle: "worker_absences", spalte: "zustand",
    werte: ["wirksam", "beantragt", "abgelehnt"],
    warum: "„beantragt\" ist der Zustand, in dem der Disponent entscheiden muss. "
      + "Ohne Beispiel ist die Entscheidungsfläche nicht vorführbar."
  },
  {
    gegenstand: "Arbeiter-Zustandswechsel", tabelle: "worker_status_events",
    /* ZWEI SPALTEN, UND DAS IST HIER DIE EHRLICHE ANGABE. Die Tabelle hat
     * `von_zustand` UND `nach_zustand`; diese Probe liest den Einfuege-Block als
     * TEXT und kann nicht sagen, in welcher Spalte ein Wert steht. Eine
     * Rueckmutation hat genau das gezeigt: `('abwesend','inaktiv',…)` zu
     * `('abwesend','abwesend',…)` geaendert — und `'inaktiv'` stand weiterhin im
     * Block, naemlich als `von_zustand` der naechsten Zeile. Die Probe blieb
     * gruen.
     *
     * Also wird hier das BEHAUPTET, was die Probe wirklich prueft: jeder Zustand
     * kommt in einem Wechsel vor (egal auf welcher Seite). Die scharfe Form —
     * jeder Zustand ist ZIEL eines Wechsels, und die Kette endet im
     * tatsaechlichen Zustand der Kraft — steht als Notbremse in
     * `sql/seeds/y6-besetzung.sql`, wo SQL die Spalte kennt. Eine Zusicherung,
     * die mehr behauptet als sie prueft, ist schlimmer als eine, die weniger
     * behauptet: die erste luegt, die zweite laesst nur etwas offen. */
    spalte: "von_zustand / nach_zustand",
    werte: ["verfuegbar", "im_einsatz", "montage", "abwesend", "inaktiv"],
    warum: "Die Zustandsgeschichte einer Kraft ist die Begründung dafür, warum sie "
      + "am Markt fehlt. Zwei der fünf Zustände kamen darin nie als Ziel vor, und keine "
      + "Saat schrieb überhaupt in die Tabelle."
  }
];

suite("Y6 — ist die Besetzung vollstaendig, datumsfrei, passwortfrei, wiederholbar?", () => {

  it("die Saaten werden wirklich gelesen", () => {
    assert.ok(SAATEN.length >= 11,
      `nur ${SAATEN.length} Saaten gefunden — die Verzeichnissuche greift nicht mehr`);
    assert.ok(ALLE_DATEN.length > 60000,
      `nur ${ALLE_DATEN.length} Zeichen Datenteil — wird noch gelesen?`);
  });

  it("die Registratur ist an den CODE gebunden, nicht an eine Abschrift", () => {
    /* Diese Zusicherung schützt die Registratur gegen die Drift, gegen die sie
     * selbst schützt. Verliert sie ihre Code-Quelle, prüft sie nur noch eine
     * Liste, die jemand vor Monaten getippt hat. */
    const staff = REGISTRATUR.find((r) => r.gegenstand === "Staff-Rollen");
    assert.deepEqual([...staff.werte].sort(), [...STAFF_ROLLEN].sort(),
      "die Staff-Rollen der Registratur stammen nicht mehr aus staffRollen.js");
    const plan = REGISTRATUR.find((r) => r.spalte === "plan" && r.tabelle === "organizations");
    assert.deepEqual([...plan.werte].sort(), [...CANONICAL_PLAN_KEYS].sort(),
      "die Plan-Werte der Registratur stammen nicht mehr aus planCatalog.js");
    const org = REGISTRATUR.find((r) => r.gegenstand === "Org-Rollen");
    assert.ok(org.werte.includes("platform_admin") && org.werte.includes("viewer"),
      "die Org-Rollen der Registratur stammen nicht mehr aus rbacService.js");
    assert.ok(org.werte.length >= 13,
      `nur ${org.werte.length} Org-Rollen aus dem Code gelesen, erwartet mindestens 13`);
    for (const e of REGISTRATUR) {
      assert.ok(e.warum && e.warum.length > 40,
        `Registratur-Eintrag ${e.gegenstand} hat keine Begruendung. Eine Pflicht ohne `
        + "Grund wird beim ersten Widerstand gestrichen.");
    }
  });

  it("Y6.1 · jeder Wert der Registratur kommt in einer Saat vor", () => {
    /* Die DB-freie Hälfte: steht der Wert überhaupt in einer Saat? Das ist
     * schwächer als „es gibt eine Zeile" (das prüft die datenbankgebundene
     * Probe unten), aber es läuft im Tor bei jedem Commit — und es fängt genau
     * den Fall, der sonst erst beim Release auffällt: ein neuer legaler Wert im
     * Code, den keine Saat besetzt. */
    const luecken = [];
    for (const e of REGISTRATUR) {
      const bloecke = bloeckeFuer(e.tabelle);
      if (bloecke.length === 0) {
        /* Nicht hier abbrechen: eine Zusicherung mitten in der Schleife beendet
         * den Bericht beim ERSTEN Fund, und dann sieht man eine Luecke statt
         * aller. Gemessen: so verdeckte `worker_status_events` die restlichen
         * zwanzig. */
        luecken.push(`${e.tabelle}: KEINE Einfuegung in irgendeiner Saat   (${e.gegenstand})`);
        continue;
      }
      for (const w of e.werte) {
        if (!new RegExp("'" + w + "'").test(bloecke)) {
          luecken.push(`${e.tabelle}.${e.spalte} = '${w}'   (${e.gegenstand})`);
        }
      }
    }
    assert.deepEqual(luecken, [],
      `${luecken.length} Wert(e) der Registratur hat keine Saat:\n  ` + luecken.join("\n  ")
      + "\n\nEin legaler Zustand ohne Beispiel ist kein fehlender Datensatz, sondern ein "
      + "fehlender ZUSTAND: niemand hat je gesehen, was die Oberflaeche dort zeigt.");
  });

  it("Y6.2 · kein festes Datum in IRGENDEINER Saat", () => {
    /* Jede Y-Saat prüft das heute selbst. Genau darin liegt die Lücke: eine
     * neue Saat bringt ihren eigenen Wächter mit — oder keinen. Diese Probe
     * liest das VERZEICHNIS, nicht eine Datei, und kann deshalb nichts
     * übersehen, was dazukommt.
     *
     * Ein festes Datum ist in einer Bühne kein Schönheitsfehler: „läuft in drei
     * Tagen ab" ist genau dann noch wahr, wenn das Datum relativ ist. Ein
     * fester Wert macht die Bühne mit jedem Tag unwahrer, und zwar lautlos. */
    const funde = [];
    for (const s of SAATEN) {
      for (const treffer of s.text.match(/'20\d\d-\d\d-\d\d[^']*'/g) || []) {
        funde.push(`${s.name}: ${treffer}`);
      }
    }
    assert.deepEqual(funde, [],
      `${funde.length} festes Datum/Daten in Saaten:\n  ` + funde.join("\n  ")
      + "\n\nRelativ schreiben (CURRENT_DATE, NOW() + INTERVAL …). Ein fester Wert macht "
      + "die Buehne mit jedem Tag unwahrer, ohne dass etwas rot wird.");
  });

  it("Y6.3 · kein neues Klartext-Passwort in einer Saat oder Migration", () => {
    /* RATSCHE, nicht Verbot. Es gibt DREI bekannte Klartext-Passwörter im Repo
     * (gemessen; sie stehen unten namentlich). Sie zu entfernen ist eine
     * Owner-Entscheidung, weil sie auf einem ANMELDEWEG liegen: wer sie
     * ersetzt, sperrt bestehende Demo-Zugänge aus. Also wird hier nicht
     * aufgeräumt, sondern eingefroren — ein VIERTES wird rot.
     *
     * Die Y-Saaten machen es vor: `crypt(current_setting('app.seed_passwort'))`
     * hasht beim Laden, und ohne gesetzten Wert verweigern sie. Das ist das
     * Muster, dem eine neue Saat folgt. */
    /* Die Altliste, mit Dateinamen WIE SIE HEISSEN. Der erste Entwurf schrieb
     * `052_demo_world.sql` — die Datei heisst `052_demo_seed_world.sql`, und der
     * geratene Name liess sie durch die Ratsche fallen, statt sie zu dulden.
     * Gemessen wurden dadurch zwei „neue" Funde, von denen keiner neu war. */
    const BEKANNT = new Set([
      /* ─────────────────────────────────────────────────────────────────────
       * DREI EINTRAEGE WENIGER (Owner-Punkt 16, 2026-10-02)
       * ─────────────────────────────────────────────────────────────────────
       *
       * Hier standen bis heute auch:
       *   sql/migrations/052_demo_seed_world.sql   (DemoPass2026!, 6x als Hash)
       *   sql/seeds/demo-sales.sql                 (Hash fuer 3 Konten)
       *   sql/seeds/dev-data.sql                   (Hash fuer 2 Konten)
       *
       * Alle drei hashen jetzt beim Laden aus `app.seed_passwort`. Beim Umbau
       * kam ein Befund dazu, der die Entscheidung leicht machte: demo-sales und
       * dev-data trugen DENSELBEN Hash, und der passte zu KEINEM der beiden
       * dokumentierten Passwoerter ("Demo2026!" bzw. "password123") noch zu acht
       * weiteren Kandidaten — bei gruener Selbstprobe des Vergleichers. Die fuenf
       * Konten waren mit den dokumentierten Zugangsdaten unbenutzbar, waehrend
       * das Repo behauptete, sie seien es. Der Umbau hat sie reparieren muessen,
       * nicht nur entschaerfen.
       *
       * Belegt durch einen Wegwerf-Frischinstall MIT Demo-Welt: Kette exit=0,
       * sechs Konten, bcryptjs bestaetigt das Umgebungspasswort und lehnt
       * DemoPass2026! ab. Das Tor dazu ist jetzt Vorgabe in
       * sql/test-fresh-install.sh.
       */

      /* Die Remediation. Sie MUSS den Hash nennen: ohne ihn kann sie die
       * betroffenen Konten nicht praezise und nicht idempotent finden. Der
       * Ersatz-Hash ist absichtlich einer ohne bekanntes Vorbild — siehe die
       * beiden Zusicherungen darunter, die das pruefen statt es zu glauben.
       * Sie ist seit dem 2026-10-02 der EINZIGE verbleibende Eintrag, und das
       * soll so bleiben: 052 kann den gesuchten Hash nicht mehr erzeugen, aber
       * auf Bestands-Datenbanken liegt er noch. */
      "sql/migrations/125_remediate_demo_seed_backdoor.sql"
    ]);
    const MUSTER = /\$2[aby]?\$\d\d\$[./A-Za-z0-9]{20,}/;     // ein bcrypt-Hash im Klartext
    /* `[a-z_]*` nach dem Wort, und das kam aus einer Rueckmutation, die gruen
     * blieb: `UPDATE users SET password_hash = 'Geheim123456xyz'` wurde NICHT
     * gefunden, weil der Ausdruck direkt hinter `password` ein `=` oder `:`
     * verlangte — und dort stand `_hash`. Das ist der wahrscheinlichste Weg, auf
     * dem ein Klartext-Passwort ueberhaupt in eine Saat geraet: jemand schreibt
     * ihn in die Hash-Spalte, weil die Spalte danach klingt. */
    const KLARTEXT = /(?:password|passwort|passwd)[a-z_]*\s*[:=]\s*'[^']{6,}'/i;

    const funde = [];
    const kandidaten = [];
    for (const unter of ["sql/seeds", "sql/migrations"]) {
      const dir = path.join(ROOT, unter);
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql"))) {
        kandidaten.push(`${unter}/${f}`);
      }
    }
    assert.ok(kandidaten.length > 100,
      `nur ${kandidaten.length} SQL-Dateien geprueft — die Suche greift nicht`);

    for (const rel of kandidaten) {
      const t = fs.readFileSync(path.join(ROOT, rel), "utf8");
      const ohneKommentar = t.replace(/--[^\n]*/g, " ");
      if (MUSTER.test(ohneKommentar) || KLARTEXT.test(ohneKommentar)) {
        if (!BEKANNT.has(rel)) funde.push(rel);
      }
    }
    assert.deepEqual(funde, [],
      `${funde.length} Datei(en) mit einem Passwort oder bcrypt-Hash im Klartext:\n  `
      + funde.join("\n  ")
      + "\n\nMuster der Y-Saaten verwenden: crypt(current_setting('app.seed_passwort'), "
      + "gen_salt('bf', 10)) und ohne gesetzten Wert verweigern. Die drei bekannten "
      + "Altfaelle sind eingefroren, weil ihre Aenderung einen ANMELDEWEG betrifft "
      + "(Owner-Entscheidung, docs/UEBERGABE.md).");

    /* Und die Ratsche zieht nur an, wenn die Altliste nicht wächst — und wenn
     * sie keine erledigten Einträge mehr enthält. Sonst steht sie in fünf Jahren
     * noch da und niemand weiß, ob sie noch stimmt. */
    const erledigt = [...BEKANNT].filter((rel) => {
      const p = path.join(ROOT, rel);
      if (!fs.existsSync(p)) return true;
      const t = fs.readFileSync(p, "utf8").replace(/--[^\n]*/g, " ");
      return !MUSTER.test(t) && !KLARTEXT.test(t);
    });
    assert.deepEqual(erledigt, [],
      `${erledigt.length} Eintrag/Eintraege der Altliste sind erledigt (bereinigt oder `
      + `geloescht) — bitte hier streichen, sonst zieht die Ratsche nie an:\n  `
      + erledigt.join("\n  "));
  });

  it("Y6.3 · 052 kann die Hintertuer nicht mehr bauen — und 125 trifft sie weiter", async () => {
    /* ═══════════════════════════════════════════════════════════════════════
     * DIE SCHAERFSTE ZUSICHERUNG DIESER DATEI — und sie kam aus einer Frage, die
     * sich beim Aufraeumen der Altliste stellte: woher weiss man, dass
     * Migration 125 die Hintertuer wirklich schliesst?
     *
     * 125 neutralisiert sechs Demo-Konten, aber nur die, deren `password_hash`
     * GENAU der oeffentlich dokumentierte Demo-Hash ist. Das ist richtig so
     * (Praezision und Idempotenz). Es heisst aber auch: aendert jemand das
     * Passwort in 052 — oder den Hash dort —, trifft die Bedingung in 125 ins
     * Leere. Die Migration laeuft dann durch, meldet nichts, und auf jeder
     * BESTEHENDEN Installation bleibt die Backdoor offen. Kein Test haette das
     * bemerkt.
     *
     * Deshalb wird hier gerechnet, nicht gelesen: der Hash aus 125 muss das
     * bcrypt des in 052 dokumentierten Passworts sein. Gemessen am 2026-10-02:
     * er ist es (`DemoPass2026!`).
     * ═══════════════════════════════════════════════════════════════════════ */
    const bcrypt = (await import("bcryptjs")).default;
    const p052 = path.join(ROOT, "sql", "migrations", "052_demo_seed_world.sql");
    const p125 = path.join(ROOT, "sql", "migrations", "125_remediate_demo_seed_backdoor.sql");
    assert.ok(fs.existsSync(p052) && fs.existsSync(p125),
      "052/125 nicht gefunden — wurden sie umbenannt? Dann ist auch die Altliste oben falsch.");
    const t052 = fs.readFileSync(p052, "utf8");
    const t125 = fs.readFileSync(p125, "utf8");

    /* ───────────────────────────────────────────────────────────────────────
     * DIE RICHTUNG HAT SICH GEDREHT (Owner-Punkt 16, 2026-10-02)
     * ───────────────────────────────────────────────────────────────────────
     *
     * Diese Probe las das Passwort frueher AUS 052 — es stand dort im Kopf, und
     * genau das war der Mangel. 052 hasht jetzt beim Laden aus
     * `app.seed_passwort` und nennt kein Passwort mehr. Die Probe ist deshalb
     * nicht verschwunden, sondern hat die Richtung gewechselt:
     *
     *   VORHER  052 MUSS ein Passwort nennen, sonst trifft 125 ins Leere.
     *   JETZT   052 DARF keines nennen — und 125 muss das historische
     *           trotzdem weiter treffen.
     *
     * Dass das historische Passwort nun HIER steht, ist der Preis und eine
     * bewusste Wahl. Es muss irgendwo stehen, sonst kann niemand pruefen, dass
     * 125 noch das Richtige sucht; und ein Waechter ist der ehrlichste Ort
     * dafuer. Es ist ausserdem kein Zugang mehr, sondern ein VERBRANNTES
     * Passwort: oeffentlich dokumentiert (docs/PILOT_GO_LIVE_TODOS.md), auf
     * Produktion von 125 neutralisiert, und keine Datei im Repo kann es noch
     * vergeben. Sechs weitere Waechter fuehren es schon als VERBOTENE
     * Zeichenkette — hier ist es das Suchmuster einer Aufraeumung.
     */
    const HISTORISCH = "DemoPass2026" + "!";  // bewusst zerlegt: kein Volltreffer fuer Geheimnis-Suchen
    const pw = HISTORISCH;

    /* ── Die neue Richtung, Teil 1: 052 traegt keinen Hash mehr ───────────── */
    const hashes052 = t052.match(/\$2[aby]\$\d\d\$[./A-Za-z0-9]{10,}/g) || [];
    assert.deepEqual(hashes052, [],
      "052 traegt wieder einen bcrypt-Hash. Ein Hash im oeffentlichen Repo ist ein Passwort "
      + "mit Umweg: wer ihn hat, kann offline raten — und der Klartext stand hier "
      + "erfahrungsgemaess zwei Zeilen darueber im Kommentar. Genau das war der Vorfall, "
      + "den 125 aufraeumen musste.");

    /* ── Teil 2: auch kein Klartext in einer ANWEISUNG ───────────────────── */
    const t052ohne = t052.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
    for (const wort of [HISTORISCH, "Demo2026!", "password123"]) {
      assert.ok(!t052ohne.includes(wort),
        `052 setzt '${wort}' in einer ANWEISUNG. In der Begruendung darf es stehen, im SQL nicht.`);
    }

    /* ── Teil 3: der Mechanismus ist wirklich da, nicht nur der Hash weg ──
     * Ohne diese Zusicherung waere Teil 1 auch durch "Konten ohne Passwort"
     * erfuellt — gruen, und die Demo-Welt unbenutzbar. */
    assert.match(t052, /crypt\(\s*current_setting\('app\.seed_passwort'\)/,
      "052 bildet den Hash nicht aus dem Schalter. Das ist der Mechanismus, der das "
      + "Passwort aus dem Repo haelt: current_setting('app.seed_passwort') + gen_salt('bf').");
    assert.match(t052, /gen_salt\('bf'/,
      "kein bcrypt-Salz — ein anderes Verfahren bestuende bcryptjs.compare nicht, und die "
      + "Demo-Konten waeren nicht anmeldbar");
    /* RUECKMUTATION 2026-10-02, und sie hat diese Zusicherung erst scharf gemacht:
     * hier stand ein FENSTER-Muster (`app\.seed_passwort[\s\S]{0,400}RAISE`).
     * Ersetzt man die Bedingung durch `IF false THEN`, bleibt der Name
     * `app.seed_passwort` an anderen Stellen stehen (Kommentar, Laengenpruefung)
     * und innerhalb von 400 Zeichen steht auch ein RAISE — die Probe blieb GRUEN,
     * waehrend die Pruefung weg war. Ein Fenster trifft, was zufaellig darin
     * liegt; geprueft wird jetzt die BEDINGUNG selbst. */
    const leerPruefung = /IF\s+coalesce\(current_setting\('app\.seed_passwort',\s*true\),\s*''\)\s*=\s*''\s+THEN\s*\n\s*RAISE/;
    assert.match(t052, leerPruefung,
      "052 prueft nicht mehr, ob app.seed_passwort LEER ist, bevor es hasht — oder die "
      + "Pruefung steht nicht direkt vor einem RAISE. crypt('') liefert einen GUELTIGEN "
      + "Hash fuer das leere Passwort: anmeldbar fuer jeden, der es versucht.");
    assert.match(t052, /length\(current_setting\('app\.seed_passwort'[^)]*\)\)\s*<\s*12/,
      "keine Mindestlaenge in 052. Drei dieser Konten stehen auf ENTERPRISE-Funktionsniveau.");

    /* ── Teil 4: 052 legt pgcrypto selbst an ──────────────────────────────
     * GEMESSEN am 2026-10-02: nichts im Repo legt die Erweiterung an — nicht
     * init.sql (nur uuid-ossp), keine Migration. In der Entwicklungsdatenbank
     * lag sie nur, weil sie jemand von Hand angelegt hatte. Ohne crypt() kann
     * 052 nicht hashen, und ein Frischinstall haette es nicht gehabt. */
    assert.match(t052, /CREATE EXTENSION IF NOT EXISTS pgcrypto/,
      "052 legt pgcrypto nicht an. Nichts sonst im Repo tut es — auf einem Frischinstall "
      + "gaebe es crypt() nicht, und die Demo-Welt entstuende nie (oder, schlimmer, jemand "
      + "schreibt den festen Hash zurueck, weil 'crypt geht hier nicht').");

    /* Alle bcrypt-Hashes in 125: der eine SUCHT (im WHERE), der andere ERSETZT. */
    const hashes = [...new Set(t125.match(/\$2[aby]?\$\d\d\$[./A-Za-z0-9]{50,60}/g) || [])];
    assert.equal(hashes.length, 2,
      `${hashes.length} bcrypt-Hashes in 125, erwartet genau 2 (der gesuchte und der ersetzende)`);
    const gesucht = hashes.filter((h) => bcrypt.compareSync(pw, h));
    assert.equal(gesucht.length, 1,
      `Der in 052 dokumentierte Demo-Zugang passt zu ${gesucht.length} der Hashes in 125, `
      + "erwartet genau 1. Bei 0 sucht die Remediation einen Hash, den es nicht mehr gibt: "
      + "sie laeuft durch, meldet nichts, und auf jeder BESTEHENDEN Installation bleibt der "
      + "Passwort-Login der Demo-Konten offen. Bei 2 wuerde sie den Ersatz-Hash gleich "
      + "wieder als Backdoor erkennen.");

    /* Und der Ersatz darf kein naheliegendes Vorbild haben — sonst taeuscht die
     * Migration eine Schliessung vor. 125 nennt ihn "gueltig FORMATIERT, aber
     * UNKNACKBAR"; das ist eine Behauptung, und hier steht die Probe dazu. */
    const ersatz = hashes.find((h) => h !== gesucht[0]);
    const NAHELIEGEND = [pw, "Demo2026!", "password123", "demo", "test", "", "admin",
      "changeme", "tempconnect", "disabled", "none", "geheim", pw.replace("!", "")];
    const knackbar = NAHELIEGEND.filter((k) => { try { return bcrypt.compareSync(k, ersatz); } catch { return false; } });
    assert.deepEqual(knackbar, [],
      `Der Ersatz-Hash in 125 ist das bcrypt von ${JSON.stringify(knackbar)}. Dann schliesst `
      + "die Migration keine Hintertuer, sondern setzt eine neue ein.");
    assert.match(ersatz, /^\$2[aby]\$\d\d\$.{53}$/,
      "der Ersatz-Hash ist nicht gueltig FORMATIERT — bcryptjs.compare kann dann werfen "
      + "statt false zu liefern, und aus einem gesperrten Login wird ein 500er");
  });

  it("Y6.4 · jede Einfuegung in jeder Saat ist wiederholbar", () => {
    /* Zweimal laufen muss dieselbe Besetzung ergeben. Der Nachweis am Bestand
     * ist der Doppellauf (je Welle gemessen); diese Probe hält die FORM, und
     * zwar über alle Saaten: eine Einfügung ohne `ON CONFLICT` und ohne
     * `WHERE NOT EXISTS` legt beim zweiten Lauf Doppel an.
     *
     * GEPRUEFT WIRD JE ANWEISUNG, NICHT GEZAEHLT. Der erste Entwurf zaehlte
     * `INSERT INTO` gegen `ON CONFLICT` + `WHERE NOT EXISTS` je Datei und
     * meldete zwei Saaten als nicht wiederholbar. Beide waren es: `dev-data.sql`
     * schreibt `WHERE u.email = … AND NOT EXISTS (…)` — dieselbe Wirkung, andere
     * Zeichenkette. Zaehlen hat hier zweimal gelogen, einmal in jede Richtung:
     * es erzeugt Fehlalarme UND es laesst sich betrügen, weil zwei
     * Konfliktbehandlungen in EINER Anweisung für eine zweite ohne einstehen.
     * Also wird jede Anweisung einzeln angesehen. */
    const schwach = [];
    for (const s of SAATEN) {
      const d = datenteil(s);
      /* Eine Anweisung: von `INSERT INTO` bis zum naechsten Semikolon. */
      for (const anweisung of d.match(/INSERT\s+INTO[\s\S]*?;/gi) || []) {
        if (/ON CONFLICT/i.test(anweisung) || /\bNOT EXISTS\s*\(/i.test(anweisung)) continue;
        const tabelle = (anweisung.match(/INSERT\s+INTO\s+(\w+)/i) || [])[1] || "?";
        schwach.push(`${s.name}: INSERT INTO ${tabelle} ohne ON CONFLICT und ohne NOT EXISTS`);
      }
    }
    assert.deepEqual(schwach, [],
      `${schwach.length} Saat(en) sind nicht wiederholbar:\n  ` + schwach.join("\n  ")
      + "\n\nEin zweiter Lauf legt dort Doppel an. Bei Zugangstabellen ist ein Doppel "
      + "kein harmloser Datenmuell: welche Zeile gilt, entscheidet dann die Reihenfolge.");
  });

  it("Y6.4 · jede Saat sperrt sich selbst und verlangt ihr Passwort", () => {
    /* Die Sperre ist die Eigenschaft, die eine Buehnen-Saat von einem Unfall
     * trennt. Sie wird je Datei von `saatSperreHaelt.test.js` geprueft; hier
     * steht die Gegenprobe aus Y6-Sicht: KEINE Saat ohne Sperre, und keine Saat,
     * die anmeldbare Konten anlegt, ohne Passwort-Pflicht. */
    const ohneSperre = SAATEN
      .filter((s) => !/current_setting\(\s*'app\.seed_demo_world'/.test(s.text))
      .map((s) => s.name);
    assert.deepEqual(ohneSperre, [],
      `${ohneSperre.length} Saat(en) ohne Sperre: ${ohneSperre.join(", ")}`);

    const ohnePflicht = SAATEN
      .filter((s) => /crypt\(current_setting\('app\.seed_passwort'\)/.test(s.text))
      .filter((s) => !/app\.seed_passwort', true\), ''\) = ''/.test(s.text))
      .map((s) => s.name);
    assert.deepEqual(ohnePflicht, [],
      `${ohnePflicht.length} Saat(en) hashen app.seed_passwort, verweigern aber nicht, `
      + `wenn es fehlt: ${ohnePflicht.join(", ")}. Ohne gesetzten Wert wuerde `
      + "current_setting werfen — oder, schlimmer, ein leerer Wert wuerde gehasht.");
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Y6.1 SPALTENGENAU — GEGEN DIE LAUFENDE DATENBANK
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Die Probe oben liest SAAT-TEXT. Sie kann damit zwei Dinge nicht:
 *
 *   1. sagen, in welcher SPALTE ein Wert steht (`worker_status_events` hat
 *      `von_zustand` und `nach_zustand` — im Text sind beide nur Zeichenketten),
 *   2. wissen, ob die Zeile am Ende wirklich ENTSTEHT (ein `WHERE NOT EXISTS`,
 *      das nie zutrifft, steht im Text genauso da wie eine Einfuegung, die
 *      greift).
 *
 * Beides kann nur die Datenbank. Diese Probe fragt sie deshalb spaltengenau —
 * und sie laeuft im normalen Tor NICHT, sondern erst mit `DATABASE_URL`. Das ist
 * kein Mangel, sondern die Arbeitsteilung des Hauses (`--suite=db-gated`,
 * `--verlange-datenbank` fuer Release und CI).
 *
 * Run: DATABASE_URL=… node --test test/probebuehneBesetzung.test.js
 */
describe("Y6.1 spaltengenau — jeder Wert der Registratur hat eine Zeile",
  { skip: !hasDb && "Keine Datenbank konfiguriert" }, () => {

  it("kein Wert der Registratur ist unbesetzt", async () => {
    const pool = createPool();
    try {
      const luecken = [];
      for (const e of REGISTRATUR) {
        /* Die Spalte der Registratur kann zwei nennen ("von_zustand /
         * nach_zustand") — dann wird jede einzeln gefragt und der Wert gilt als
         * besetzt, wenn er in EINER davon vorkommt. Genau das behauptet der
         * Eintrag, nicht mehr. */
        const spalten = e.spalte.split("/").map((s) => s.trim()).filter(Boolean);
        for (const w of e.werte) {
          let gefunden = 0;
          for (const sp of spalten) {
            /* Bezeichner kommen aus der Registratur, nicht von aussen — und
             * werden trotzdem gequotet. Eine Probe, die Bezeichner einsetzt,
             * soll das Muster vormachen, das ueberall gilt. */
            const sql = `SELECT count(*)::int AS n FROM "${e.tabelle.replace(/"/g, '""')}" `
              + `WHERE "${sp.replace(/"/g, '""')}"::text = $1`;
            const { rows } = await pool.query(sql, [w]);
            gefunden += rows[0].n;
          }
          if (gefunden === 0) luecken.push(`${e.tabelle}.${e.spalte} = '${w}'   (${e.gegenstand})`);
        }
      }
      assert.deepEqual(luecken, [],
        `${luecken.length} Wert(e) der Registratur haben im BESTAND keine Zeile:\n  `
        + luecken.join("\n  ")
        + "\n\nDas ist der schaerfere Befund als die Textprobe daneben: hier ist die Saat "
        + "entweder nicht geladen, oder sie laeuft und die Zeile entsteht trotzdem nicht "
        + "(ein WHERE NOT EXISTS, das nie zutrifft, sieht im Text wie eine Einfuegung aus).");
    } finally {
      await pool.end();
    }
  });

  it("die Zustandsgeschichte widerspricht der Belegschaftsflaeche nicht", async () => {
    /* Die Probe zum teuersten Fehler dieser Welle. Die Kette fuer HPS-003 war
     * zuerst gegen `NOW()` gerechnet — und lag damit VOR dem Anfangs-Ereignis,
     * das die Plattform beim Anlegen des Profils schreibt. Die Historie
     * behauptete eine Vergangenheit vor der Entstehung, und die Notbremse der
     * Saat prueft seither, dass ihre eigene Zeile die juengste ist.
     *
     * Hier steht die Gegenprobe aus Sicht des BESTANDS: das juengste Ereignis
     * und der tatsaechliche Zustand muessen zusammenpassen. Eine Kraft, die als
     * frei gezeigt wird und deren Geschichte auf „im Einsatz" endet, laesst
     * jeden Leser der Historie glauben. */
    const pool = createPool();
    try {
      const PROFIL = "b1000000-0000-4000-8000-00000000d003";
      const { rows: letzte } = await pool.query(
        `SELECT nach_zustand, zeitpunkt FROM worker_status_events
          WHERE worker_profile_id = $1 ORDER BY zeitpunkt DESC, id DESC LIMIT 1`, [PROFIL]);
      assert.equal(letzte.length, 1,
        "HPS-003 hat kein Zustandsereignis — die Kette aus y6-besetzung.sql ist nicht angekommen");

      const { rows: frei } = await pool.query(
        `SELECT NOT EXISTS (
           SELECT 1 FROM worker_absences a
            WHERE a.worker_profile_id = $1 AND a.zustand = 'wirksam'
              AND a.aufgehoben_am IS NULL
              AND a.von <= CURRENT_DATE AND (a.bis IS NULL OR a.bis >= CURRENT_DATE)
         ) AS frei`, [PROFIL]);

      if (frei[0].frei) {
        assert.equal(letzte[0].nach_zustand, "verfuegbar",
          `HPS-003 ist heute frei, die Zustandsgeschichte endet aber auf `
          + `"${letzte[0].nach_zustand}". Zwei Flaechen widersprechen sich, und der Leser `
          + "glaubt eher der Historie.");
      } else {
        assert.notEqual(letzte[0].nach_zustand, "verfuegbar",
          "HPS-003 ist heute abwesend, die Geschichte endet aber auf \"verfuegbar\"");
      }
    } finally {
      await pool.end();
    }
  });
});
