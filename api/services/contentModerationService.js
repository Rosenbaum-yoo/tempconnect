/**
 * contentModerationService — automatischer Schimpfwort-/Beleidigungs-Filter (Deutsch).
 *
 * Prueft Freitext (z. B. Bewertungs-Kommentare). Treffer werden in der Staff-Moderation
 * geflaggt (Staff entscheidet final). Bewusst konservativ, self-contained (keine Dependency,
 * kein externer Dienst) und erweiterbar — die Wortliste unten ist die einzige Pflegestelle.
 *
 *   moderateComment(text) -> { flagged: boolean, matches: [{ word, severity }], severity }
 *
 * Erkennung ist normalisierungsbasiert: lowercase, Umlaute/ß, Leetspeak (sch31sse),
 * Sonderzeichen-Entschaerfung und Wiederholungs-Kollaps (scheisssse). Wort-Anfangsgrenze
 * faengt das Wort + Komposita (arschloch -> arschlochgesicht), vermeidet aber Mid-Wort-
 * Fehltreffer (z. B. "geschiffe" matcht nicht "schiff").
 */

// Kuratierte DE-Liste. Wird wie der Eingabetext normalisiert verglichen.
const BADWORDS = [
  // critical — Hassrede / Slurs
  { w: "neger", s: "critical" }, { w: "nigger", s: "critical" }, { w: "kanake", s: "critical" },
  { w: "schwuchtel", s: "critical" }, { w: "judensau", s: "critical" }, { w: "untermensch", s: "critical" },
  // high — schwere Beleidigungen
  { w: "hurensohn", s: "high" }, { w: "wichser", s: "high" }, { w: "fotze", s: "high" },
  { w: "arschloch", s: "high" }, { w: "missgeburt", s: "high" }, { w: "schlampe", s: "high" },
  { w: "hure", s: "high" }, { w: "fick", s: "high" }, { w: "ficken", s: "high" }, { w: "verpiss", s: "high" },
  // medium — Beleidigungen
  { w: "scheisse", s: "medium" }, { w: "scheiss", s: "medium" }, { w: "kacke", s: "medium" },
  { w: "idiot", s: "medium" }, { w: "vollidiot", s: "medium" }, { w: "depp", s: "medium" },
  { w: "spasti", s: "medium" }, { w: "spast", s: "medium" }, { w: "behindert", s: "medium" },
  { w: "trottel", s: "medium" }, { w: "vollpfosten", s: "medium" }, { w: "arsch", s: "medium" },
  // low — abwertend
  { w: "bloedsinn", s: "low" }, { w: "loser", s: "low" }, { w: "versager", s: "low" },
  { w: "dummkopf", s: "low" }, { w: "nichtskoenner", s: "low" },
  // weitere kuratierte Beleidigungen (erweiterbar)
  { w: "drecksau", s: "high" }, { w: "miststueck", s: "high" }, { w: "abschaum", s: "high" },
  { w: "bastard", s: "high" }, { w: "dreckschwein", s: "high" },
  { w: "assi", s: "medium" }, { w: "mistkerl", s: "medium" }, { w: "drecksack", s: "medium" },
  { w: "penner", s: "medium" }, { w: "pisser", s: "medium" }, { w: "vollhorst", s: "medium" }
];

const SEV_RANK = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };
const SEV_BY_RANK = ["none", "low", "medium", "high", "critical"];
const LEET = { "1": "i", "!": "i", "3": "e", "4": "a", "@": "a", "5": "s", "$": "s", "0": "o", "7": "t" };

/**
 * Zieht auseinandergezogene Schreibweisen wieder zusammen: "a r s c h" -> "arsch".
 *
 * WARUM NICHT EINFACH ALLE LEERZEICHEN ENTFERNEN: dann enthaelt "Der Marsch war lang"
 * das Wort "arsch" mitten im Wort, und die Wortgrenzen-Regel unten kann es nicht mehr
 * abfangen — nach dem Entfernen gibt es keine Grenzen mehr. Das Ergebnis waeren
 * Fehlalarme auf voellig harmlosen Texten.
 *
 * Zusammengezogen wird deshalb NUR das, was das Ausweichmuster ausmacht: eine Folge von
 * mindestens drei einzelnen Buchstaben. Normale Woerter bleiben unberuehrt.
 *
 * Bewusst nicht abgedeckt: teilweises Trennen wie "ar sch loch". Das zuverlaessig zu
 * fangen braucht unscharfen Abgleich, und der erzeugt in einem B2B-Bewertungstext mehr
 * falsche Treffer als er verhindert.
 */
function zieheGesperrtesZusammen(s) {
  const tokens = s.split(/(\s+)/);
  const out = [];
  let lauf = [];
  const spuelen = () => {
    if (lauf.length >= 3) out.push(lauf.join(""));
    else if (lauf.length) out.push(lauf.join(" "));
    lauf = [];
  };
  for (const tok of tokens) {
    if (/^\s+$/.test(tok)) continue;
    if (tok.length === 1) lauf.push(tok);
    else { spuelen(); out.push(tok); }
  }
  spuelen();
  return out.join(" ");
}

function normalize(text) {
  let s = String(text == null ? "" : text).toLowerCase();
  s = s.replace(/[1!34@5$07]/g, (c) => LEET[c] || c);          // Leetspeak
  s = s.replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss"); // Umlaute/ß
  s = s.replace(/[^a-z\s]/g, "");                               // Sonderzeichen weg (Evasion)
  s = s.replace(/([a-z])\1{2,}/g, "$1$1");                      // 3+ Wiederholungen -> 2
  s = zieheGesperrtesZusammen(s);                               // "a r s c h" -> "arsch"
  return s;
}

/**
 * @param {string} text
 * @returns {{ flagged: boolean, matches: Array<{word:string, severity:string}>, severity: string }}
 */
export function moderateComment(text) {
  const norm = normalize(text);
  if (!norm) return { flagged: false, matches: [], severity: "none" };
  const matches = [];
  let maxRank = 0;
  for (const bw of BADWORDS) {
    // (^|Nicht-Buchstabe) vor dem Wort -> Wortanfang/Komposita, kein Mid-Wort-Fehltreffer.
    const re = new RegExp("(^|[^a-z])" + bw.w);
    if (re.test(norm)) {
      matches.push({ word: bw.w, severity: bw.s });
      if (SEV_RANK[bw.s] > maxRank) maxRank = SEV_RANK[bw.s];
    }
  }
  return { flagged: matches.length > 0, matches, severity: SEV_BY_RANK[maxRank] };
}

export const _internals = { normalize, BADWORDS };
