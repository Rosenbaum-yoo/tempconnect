/**
 * Das Staff Control Center ist von der Kundenplattform aus NICHT erreichbar.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DER ANLASS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Owner-Vorgabe 2026-09-01, woertlich:
 *
 *   „staff darf doch nicht aus der plattform erreichbar sein, keine kachel
 *    dafuer. das ist nur fuer mich ein kontrollcentrum, kein kundenzugang.
 *    niemals. festschreiben, niemals wieder aufwuehlen, darf nie wieder
 *    passieren."
 *
 * Anlass war ein Missverstaendnis: die Rede war von einer Kachel INNERHALB des
 * Staff Centers (Betriebszustand der Takte). Gelesen wurde sie als Kachel AUF
 * der Plattform, die ins Staff Center fuehrt. Der Owner hat damit eine echte
 * Luecke benannt — es gab keine Regel, die das verbietet, und keinen Pruefer,
 * der es bemerkt haette.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WAS HIER GEPRUEFT WIRD
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Kein Weg von `frontend/public/` nach `/staff`. Das ist die Kundenplattform —
 * Unternehmen, Zeitarbeitsfirmen UND das Einsatzportal der Mitarbeiter. Keine
 * dieser Rollen hat im Staff Center etwas zu suchen, auch nicht als toter Link.
 *
 * Zusaetzlich wird die STRUKTURELLE Trennung festgenagelt: `/staff` hat eine
 * eigene Sitzung mit eigenem Cookie. Faellt die weg, waere das Staff Center Teil
 * derselben Sitzungswelt wie die Plattform — der schwerere Fehler, weil ihn
 * niemand sieht.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DIE FALLE, DIE DIESEN WAECHTER FAST WERTLOS GEMACHT HAETTE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `/staff` ist eine Teilzeichenkette von `/staffing-assignments`,
 * `/staffing-requests`, `/staffing-choice-sets` — und die kommen in der
 * Plattform DUTZENDFACH vor. Ein Waechter, der schlicht nach "/staff" sucht,
 * meldet 18 Fundstellen, von denen keine einzige ein Staff-Weg ist. Er waere
 * nach einer Woche abgeschaltet.
 *
 * Deshalb: `/staff` zaehlt nur, wenn KEIN Wortzeichen folgt. `/staff/`, `/staff"`
 * und `/staff` am Ende sind Treffer; `/staffing-...` ist keiner. Beide Faelle
 * sind unten als Selbstprobe festgehalten — ein Waechter, der nie anschlaegt,
 * ist von einem kaputten nicht zu unterscheiden.
 *
 * Run: node --test --test-force-exit test/staffNieAusDerPlattform.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* Aufwaerts suchen statt Ebenen raten — Stryker laeuft in einem Sandkasten. */
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

const PLATTFORM_REL = "frontend/public";
const ROOT = findeWurzel(PLATTFORM_REL);
const suite = ROOT ? describe : describe.skip;

/**
 * Die drei internen Flaechen. Fuer alle gilt dieselbe Regel — die Vorgabe des
 * Owners gilt dem Kundenzugang, nicht einem einzelnen Namen.
 */
const FLAECHEN = [
  { pfad: "staff",         name: "Staff Control Center" },
  { pfad: "owner-control", name: "Owner Control Center" },
  { pfad: "support-ops",   name: "Support Center" }
];

/**
 * Ein WEG in eine interne Flaeche — und ausdruecklich keine Erwaehnung.
 *
 * ZWEI PRAEZISIONEN, und beide sind der ganze Wert dieses Ausdrucks:
 *
 * 1. NEGATIVER LOOKAHEAD. `/staff` steckt in `/staffing-assignments`,
 *    `/staffing-requests`, `/staffing-choice-sets` — die stehen dutzendfach in
 *    der Plattform und sind voellig in Ordnung. Ohne den Lookahead meldet der
 *    Waechter 18 Fehlalarme und keinen echten Fund; er waere nach einer Woche
 *    abgeschaltet.
 *
 * 2. LOOKBEHIND AUF ANFUEHRUNGSZEICHEN ODER EIN ZIEL-ATTRIBUT. Erreichbarkeit
 *    heisst: der Pfad steht als WERT eines Ziels — `href="/staff/"`,
 *    `location.href = '/owner-control/'`. Steht er im Fliesstext, ist er Prosa.
 *
 *    Der erste Entwurf liess hier JEDES `=` gelten, um auch unquotierte
 *    HTML-Attribute (`<a href=/staff/>`) zu fangen. Die Gegenprobe hat das
 *    sofort widerlegt: `?return=/owner-control/` ist eine ABFRAGEZEICHENFOLGE,
 *    kein Linkziel — der Waechter klagte den Kommentar an, der die
 *    Gegenrichtung beschreibt. Deshalb stehen jetzt nur die drei Attribute da,
 *    die wirklich ein Ziel benennen.
 *    Gemessen am 2026-09-01: `js/pages/landing.js` erwaehnt `/owner-control/`
 *    zweimal in Kommentaren ueber das Ruecksprungziel nach der Anmeldung
 *    (`?return=`, gegen offene Umleitung geprueft mit `/^\/(?![/\\])/`). Das ist
 *    kein Weg von der Plattform, sondern die Gegenrichtung — die Flaeche schickt
 *    zur Anmeldung und zurueck. Ein Waechter, der das anklagt, zwingt zu einer
 *    Ausnahmeliste, und eine Ausnahmeliste verwaesert die Regel.
 *
 * Umgekehrt gilt: eine externe Adresse wie `"https://fremd.de/staff/"` faellt
 * durch, weil dem Pfad dort ein Buchstabe vorausgeht — richtig so, sie fuehrt
 * nicht in unsere Flaeche.
 */
function wegNach(pfad) {
  return new RegExp('(?<=["\'`]|href=|src=|action=)\\/' + pfad + '(?![A-Za-z0-9_-])');
}

/**
 * Die EINZIGE erlaubte Ausnahme: die Staff-Anwendung selbst.
 *
 * Sie wird nach `frontend/public/staff/` gebaut und laedt von dort ihr eigenes
 * Buendel (`/staff/assets/...`). Das ist kein Weg VON der Plattform INS Staff
 * Center, sondern das Staff Center. Die Ausnahme ist bewusst ein exakter Pfad
 * und kein Verzeichnisname — ein `staff`-Ordner an anderer Stelle bliebe
 * geprueft.
 *
 * Bemerkenswert und hier festgehalten, weil es beim Lesen ueberrascht: Staff und
 * Plattform liegen im SELBEN Dokumentenwurzelverzeichnis. Getrennt sind sie
 * nicht durch die Ablage, sondern durch Sitzung und Zugangspruefung — siehe die
 * zweite Probe unten. Wer die Ablage fuer die Trennung haelt, sichert das
 * Falsche.
 */
const EIGENE_ANWENDUNGEN = FLAECHEN
  .map((f) => path.join("frontend", "public", f.pfad))
  .filter((rel) => fs.existsSync(path.join(ROOT || ".", rel)));

/** Alle Dateien der Kundenplattform, in denen ein Weg stehen koennte. */
function plattformDateien() {
  const wurzel = path.join(ROOT, PLATTFORM_REL);
  const treffer = [];
  const auslassen = new Set(["node_modules", "vendor", "assets", "img", "fonts"]);
  (function lauf(dir) {
    for (const eintrag of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, eintrag.name);
      if (eintrag.isDirectory()) {
        if (auslassen.has(eintrag.name)) continue;
        if (EIGENE_ANWENDUNGEN.includes(path.relative(ROOT, p))) continue;
        lauf(p);
      } else if (/\.(html|js)$/.test(eintrag.name)) {
        treffer.push(p);
      }
    }
  })(wurzel);
  return treffer;
}

suite("Das Staff Control Center ist von der Plattform aus nicht erreichbar", () => {

  it("die Suche liest die Plattform wirklich", () => {
    /* Ein Pruefer, der nichts liest, ist still gruen. Diese Zusicherung ist
     * nicht Deko: faellt die Verzeichnissuche um, faellt der Waechter mit. */
    const dateien = plattformDateien();
    assert.ok(dateien.length > 50,
      `nur ${dateien.length} Plattformdateien gefunden — die Suche greift nicht mehr`);
  });

  for (const flaeche of FLAECHEN) {
    it(`kein Weg von der Kundenplattform nach /${flaeche.pfad}`, () => {
      const muster = wegNach(flaeche.pfad);
      const funde = [];
      for (const datei of plattformDateien()) {
        fs.readFileSync(datei, "utf8").split("\n").forEach((zeile, i) => {
          if (muster.test(zeile)) {
            funde.push(`${path.relative(ROOT, datei)}:${i + 1}  ${zeile.trim().slice(0, 120)}`);
          }
        });
      }
      assert.deepEqual(funde, [],
        `Die Kundenplattform darf keinen Weg in das ${flaeche.name} anbieten — `
        + "keine Kachel, keinen Link, keine Weiterleitung, auch keinen toten. "
        + "Die internen Flaechen sind Kontrollzentren des Betreibers, kein Kundenzugang "
        + "(Owner-Vorgabe 2026-09-01, docs/FLAECHEN.md).\n  "
        + funde.join("\n  "));
    });
  }

  it("die Staff-Sitzung ist eine eigene Welt — eigener Pfad, eigenes Cookie", () => {
    /* Der Link ist das Sichtbare. Die Sitzung ist das Tragende: teilte sich das
     * Staff Center das Plattform-Cookie, waere jede angemeldete Kundensitzung
     * eine halbe Staff-Sitzung — und kein Link noetig. */
    const app = fs.readFileSync(path.join(ROOT, "api", "app.js"), "utf8");
    assert.match(app, /app\.use\(\s*["']\/staff["']\s*,\s*session\(/,
      "die eigene Sitzung auf /staff ist weg — damit gilt die Plattform-Sitzung auch dort");
    assert.match(app, /name:\s*["']tc\.staff\.sid["']/,
      "das eigene Staff-Cookie ist weg");
  });

  it("S: der Waechter erkennt einen echten Weg in jede der drei Flaechen", () => {
    /* Selbstprobe. Genau die Kachel, vor der die Owner-Vorgabe warnt. */
    for (const [pfad, zeile] of [
      ["staff",         '<a href="/staff/" class="hub-card">Staff Control Center</a>'],
      ["staff",         "window.location.href = '/staff';"],
      ["staff",         "<a href=/staff/>Betrieb</a>"],
      ["owner-control", "location.assign('/owner-control/')"],
      ["support-ops",   '<a href="/support-ops/tickets">Support</a>']
    ]) {
      assert.ok(wegNach(pfad).test(zeile), `haette anschlagen muessen: ${zeile}`);
    }
  });

  it("S: der Waechter verwechselt Besetzung nicht mit Staff", () => {
    /* Gegenprobe eins. Diese Aufrufe stehen dutzendfach in der Plattform und
     * sind voellig in Ordnung — ein Waechter, der sie anklagt, wird
     * abgeschaltet. */
    for (const zeile of [
      "PortalApi.get('/worker/staffing-requests')",
      "fetch(`${API}/staffing-assignments/${id}/suggestions`)",
      "await fetch(API + '/marketplace/offers/' + id + '/staffing-context')",
      "api('/staffing-choice-sets')"
    ]) {
      assert.ok(!wegNach("staff").test(zeile), `haette schweigen muessen: ${zeile}`);
    }
  });

  it("S: der Waechter haelt Prosa nicht fuer einen Weg", () => {
    /* Gegenprobe zwei — der Fall, der ihn beinahe zu einer Ausnahmeliste
     * gezwungen haette. Beide Zeilen stehen so in `js/pages/landing.js` und
     * beschreiben die GEGENRICHTUNG: die Flaeche schickt zur Anmeldung und
     * zurueck. Eine externe Adresse faellt aus demselben Grund durch. */
    for (const zeile of [
      "var _returnUrl   = null;   // open-redirect-sicheres Ziel nach Login (?return=, z.B. /owner-control/)",
      "  // Open-redirect-sicheres Rueck-Ziel nach Login (z.B. aus dem OCC: ?return=/owner-control/).",
      'fetch("https://fremd.example/staff/")'
    ]) {
      for (const f of FLAECHEN) {
        assert.ok(!wegNach(f.pfad).test(zeile), `haette schweigen muessen: ${zeile}`);
      }
    }
  });
});
