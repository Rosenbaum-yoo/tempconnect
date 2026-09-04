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
 * `/staff`, aber NICHT `/staffing-...`.
 *
 * Der negative Lookahead ist der ganze Wert dieses Ausdrucks: ohne ihn traefe
 * er jede Besetzungs-Route der Plattform und waere unbrauchbar.
 */
const STAFF_WEG = /\/staff(?![A-Za-z0-9_-])/;

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
const STAFF_ANWENDUNG = path.join("frontend", "public", "staff");

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
        if (path.relative(ROOT, p) === STAFF_ANWENDUNG) continue;
        lauf(p);
      } else if (/\.(html|js)$/.test(eintrag.name)) {
        treffer.push(p);
      }
    }
  })(wurzel);
  return treffer;
}

suite("Das Staff Control Center ist von der Plattform aus nicht erreichbar", () => {

  it("kein Weg von der Kundenplattform nach /staff", () => {
    const dateien = plattformDateien();

    /* Ein Pruefer, der nichts liest, ist still gruen. Diese Zusicherung ist
     * nicht Deko: faellt die Verzeichnissuche um, faellt der Waechter mit. */
    assert.ok(dateien.length > 50,
      `nur ${dateien.length} Plattformdateien gefunden — die Suche greift nicht mehr`);

    const funde = [];
    for (const datei of dateien) {
      const zeilen = fs.readFileSync(datei, "utf8").split("\n");
      zeilen.forEach((zeile, i) => {
        if (STAFF_WEG.test(zeile)) {
          funde.push(`${path.relative(ROOT, datei)}:${i + 1}  ${zeile.trim().slice(0, 120)}`);
        }
      });
    }

    assert.deepEqual(funde, [],
      "Die Kundenplattform darf keinen Weg ins Staff Control Center anbieten — "
      + "keine Kachel, keinen Link, keine Weiterleitung, auch keinen toten. "
      + "Das Staff Center ist das Kontrollzentrum des Betreibers, kein Kundenzugang "
      + "(Owner-Vorgabe 2026-09-01, docs/FLAECHEN.md).\n  "
      + funde.join("\n  "));
  });

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

  it("S: der Waechter erkennt einen echten Staff-Weg", () => {
    /* Selbstprobe. Genau die Kachel, vor der die Owner-Vorgabe warnt. */
    for (const zeile of [
      '<a href="/staff/" class="hub-card">Staff Control Center</a>',
      "window.location.href = '/staff';",
      '<a href="/staff/dashboard">Betrieb</a>'
    ]) {
      assert.ok(STAFF_WEG.test(zeile), `haette anschlagen muessen: ${zeile}`);
    }
  });

  it("S: der Waechter verwechselt Besetzung nicht mit Staff", () => {
    /* Gegenprobe. Diese Aufrufe stehen dutzendfach in der Plattform und sind
     * voellig in Ordnung — ein Waechter, der sie anklagt, wird abgeschaltet. */
    for (const zeile of [
      "PortalApi.get('/worker/staffing-requests')",
      "fetch(`${API}/staffing-assignments/${id}/suggestions`)",
      "await fetch(API + '/marketplace/offers/' + id + '/staffing-context')",
      "api('/staffing-choice-sets')"
    ]) {
      assert.ok(!STAFF_WEG.test(zeile), `haette schweigen muessen: ${zeile}`);
    }
  });
});
