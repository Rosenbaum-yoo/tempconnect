/**
 * Welche Tests beweisen das ABBILD — und welche den Repo-Checkout?
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WORUM ES GEHT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * CLAUDE.md fuehrt unter P1-C einen Pflichtschritt vor jedem Release:
 *
 *     docker exec tempconnect_api sh -c "cd /app && npm run test:unit"
 *
 * Am 2026-08-25 gemessen: **124 rote Tests von 9261**. Nicht weil etwas kaputt
 * waere — sondern weil das Abbild gar nicht enthaelt, was die Haelfte davon
 * liest. `docker inspect` zeigt, was im Container liegt:
 *
 *     <repo>/api              -> /app          (vollstaendig)
 *     <repo>/sql/migrations   -> /app/sql/migrations
 *     <repo>/frontend/public/js -> /app/frontend/public/js
 *
 * Kein `frontend/public/*.html`, kein `docs/`, kein `nginx/`, keine
 * compose-Dateien, kein `.env.prod.example`. Ein Test, der `frontend/public/
 * mitarbeiter.html` oeffnet, kann dort nur scheitern — und tut es seit Monaten.
 *
 * Ein Gate, das strukturell nie gruen werden kann, ist kein Gate. Es ist eine
 * Zeile in einer Checkliste, die jeder ueberspringt.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DIE TRENNUNG IST INHALTLICH, NICHT KOSMETISCH
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Das Abbild liefert die API aus: Routen, Dienste, Middleware, Migrationen.
 * Es liefert NICHT die Oberflaeche, nicht die Dokumentation, nicht die
 * Infrastruktur-Konfiguration. Tests ueber diese Dinge gehoeren nicht in ein
 * Abbild-Gate — nicht weil sie stoeren, sondern weil sie eine ANDERE Sache
 * pruefen. Sie laufen im vollen Lauf auf dem Host und in CI, wo der Checkout da
 * ist, und dort sind sie Pflicht wie eh und je.
 *
 * `--suite=image` schliesst also nicht "die laestigen" aus, sondern die, deren
 * Gegenstand gar nicht ausgeliefert wird.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM EINE REGEL UND KEINE NAMENSLISTE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Eine Liste von 26 Dateinamen waere in vier Wochen falsch — dieselbe Sorte
 * Karteileiche, gegen die in diesem Repo mehrere Waechter stehen. Also entlang
 * einer Eigenschaft: **greift die Datei ueber `api/` hinaus?**
 *
 * Die Eigenschaft ist gemessen, nicht geraten. Erst drei Versuche daneben:
 * Verzeichnisnamen (`frontend/`, `docs/`) waehlten falsch, weil es `api/docs/`
 * und `api/scripts/` auch gibt; ein einzelnes Muster fuer den Aufstieg uebersah
 * die Haelfte, weil das Repo ihn in vier Schreibweisen kennt. Der Abgleich
 * gegen alle 26 im Container roten Dateien zeigt: mit den vier Idiomen unten
 * faellt keine einzige durch.
 *
 * Kommt eine fuenfte Schreibweise dazu, wird der Abbild-Lauf rot und nennt die
 * Datei — dann gehoert das Idiom hierher. Das ist der laute Weg; ein stiller
 * waere schlimmer.
 */

/**
 * Die vier gemessenen Schreibweisen des Aufstiegs ueber `api/` hinaus.
 *
 * `path.resolve(__dirname, "..")` allein zaehlt NICHT — das ist `api/` selbst
 * und steht in fast jeder Testdatei. Erst der zweite Schritt verlaesst das,
 * was im Abbild liegt.
 */
export const AUFSTIEG = [
  {
    id: "zwei-schritte-in-einem-aufruf",
    muster: /["'`]\.\.["'`]\s*,\s*["'`]\.\./,
    beispiel: 'path.join(__dirname, "..", "..")',
  },
  {
    id: "zwei-schritte-in-einem-literal",
    muster: /\.\.[/\\]\.\./,
    beispiel: 'path.join(__dirname, "../..")',
  },
  {
    id: "ab-api-root-noch-einen-hoch",
    /* `const API_ROOT = resolve(__dirname, "..")` und danach
       `resolve(API_ROOT, "..", …)` — zwei verkettete Einzelschritte. Genau
       diese Form hat die ersten Entwuerfe der Regel scheitern lassen. */
    muster: /\bAPI_ROOT\s*,\s*["'`]\.\.|(?:^|[^A-Za-z_])REPO_ROOT\b/m,
    beispiel: 'const REPO_ROOT = path.resolve(API_ROOT, "..")',
  },
  {
    id: "eigene-wurzelsuche",
    /* Die Waechter suchen die Repo-Wurzel selbst und pruefen sie auf Inhalt. */
    muster: /\bfindeWurzel\b|\bWURZEL_KANDIDATEN\b/,
    beispiel: "function findeWurzel() { … }",
  },
];

/*
 * Kommentare zaehlen nicht.
 *
 * Beim ersten Lauf im Container schloss sich `abbildSuite.test.js` selbst aus:
 * die Datei NENNT die Idiome, um sie zu pruefen, und die Regel las die eigene
 * Erklaerung als Aufstieg. Dieselbe Falle ist in dieser Sitzung dreimal
 * zugeschnappt (assetWaechter E1, nativerAbbruch, hier) — ein textsuchender
 * Waechter findet zuverlaessig als Erstes seine eigene Beschreibung.
 *
 * Zeilentreu ersetzt statt geloescht: die Regel selbst braucht keine
 * Zeilennummern, aber die naechste Auswertung vielleicht schon.
 */
const leeren = (m) => m.replace(/[^\n]/g, " ");
export function ohneKommentare(quelltext) {
  /*
   * REIHENFOLGE IST NICHT EGAL: erst Zeilen-, dann Blockkommentare.
   *
   * Andersherum gemessen am 2026-08-25 an `test/pricingPage.test.js`: der
   * Zeilenkommentar
   *
   *     // die Testdatei (api/test/*) zwei Ebenen hoch zum Repo-Root
   *
   * enthaelt mit `/*` einen Blockkommentar-Anfang. Wer Bloecke zuerst entfernt,
   * liest ihn als echten Anfang, sucht das naechste Ende — und loescht dabei
   * 15 Zeilen ECHTEN Code, darunter genau die Zeile, um die es geht. Die Datei
   * wurde dadurch falsch einsortiert.
   *
   * Zeilenkommentare zuerst entfernt diesen Anfang, bevor er schaden kann. Der
   * umgekehrte Fall (ein `//` INNERHALB eines Blocks) ist harmlos: der Block
   * wird ohnehin geleert.
   */
  return quelltext
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + leeren(m.slice(p.length)))
    .replace(/\/\*[\s\S]*?\*\//g, leeren);
}

/**
 * Greift dieser Quelltext ueber `api/` hinaus?
 * Liefert die id des Idioms (fuer die Begruendung im Lauf) oder null.
 */
export function brauchtRepoCheckout(quelltext) {
  const code = ohneKommentare(quelltext);
  for (const a of AUFSTIEG) {
    if (a.muster.test(code)) return a.id;
  }
  return null;
}

/**
 * Teilt eine Dateiliste in "beweist das Abbild" und "braucht den Checkout".
 *
 * `lies` wird injiziert, damit die Aufteilung ohne Dateisystem pruefbar ist —
 * ein Test, der dafuer echte Dateien braucht, prueft am Ende die Dateien und
 * nicht die Regel.
 */
export function teileNachAbbild(dateien, lies) {
  const imAbbild = [];
  const brauchtCheckout = [];
  for (const datei of dateien) {
    let grund = null;
    try {
      grund = brauchtRepoCheckout(lies(datei));
    } catch {
      /* Unlesbar? Dann im Zweifel mitlaufen lassen: ein Test, der wegen eines
         Lesefehlers still aus dem Gate faellt, waere die schlimmere Variante. */
      grund = null;
    }
    if (grund) brauchtCheckout.push({ datei, grund });
    else imAbbild.push(datei);
  }
  return { imAbbild, brauchtCheckout };
}
