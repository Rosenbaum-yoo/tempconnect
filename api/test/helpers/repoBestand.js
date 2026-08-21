/**
 * Was traegt DIESER Checkout — und was gehoert ueberhaupt zum Repo?
 *
 * WARUM ES DIESE DATEI GIBT (P2-W1)
 * Zwei Waechter (`docsConsistency`, `dokuWaechter`) haben aus einem FEHLENDEN
 * Pfad einen Befund abgeleitet. Das klingt harmlos und ist es nicht: beide waren
 * in jedem Worktree dauerhaft rot, und zwei Sitzungen sind unabhaengig
 * voneinander hineingelaufen und haben Zeit damit verbracht, einen Fehler zu
 * suchen, den es nicht gab.
 *
 * Die Ursache ist immer dieselbe: Der Haupt-Checkout traegt Dateien, die git
 * bewusst ignoriert — `.agents/` (der Skill), `docs/launch/*` (Geschaefts-
 * unterlagen), `frontend/support-ops/` (SOC-Quellen). Ein `git worktree` und ein
 * frischer `git clone` tragen sie nicht. Ein Waechter, der den Dateibaum
 * abklappert, faellt damit je nach Arbeitsplatz anders aus:
 *
 *     Haupt-Checkout   ignorierte Dateien da   -> gruen
 *     Worktree / CI    ignorierte Dateien weg  -> rot
 *
 * Das ist kein Befund, sondern eine Eigenschaft der Umgebung. Schlimmer noch:
 * es wirkt in beide Richtungen. Im Haupt-Checkout hat eine ignorierte Datei
 * (`docs/launch/C_HETZNER-DEPLOY-RUNBOOK.md`) vier echte Dokumente als
 * "verlinkt" erscheinen lassen, die im Repo selbst in keinem Index stehen —
 * darunter ausgerechnet `docs/security/TENANT_ISOLATION_MODEL.md`. Der Waechter
 * war also nicht nur falsch rot, er war an anderer Stelle auch falsch gruen.
 *
 * DIE REGEL, DIE SICH DARAUS ERGIBT
 * Ein Waechter darf sein Urteil nur aus dem ableiten, was JEDER Checkout traegt —
 * also aus dem, was git kennt. Nicht aus dem Dateibaum, den er zufaellig vorfindet.
 *
 * Was ignoriert ist, ist deshalb kein Befund, sondern ein NICHT GEPRUEFTER
 * Bereich: er wird benannt und gezaehlt, aber nicht bewertet. Der Unterschied
 * zwischen "ich habe nachgesehen, da ist nichts" und "ich konnte nicht
 * nachsehen" ist der ganze Punkt.
 *
 * WAS DAS NICHT AUFWEICHT
 * `git check-ignore` befragt den Index mit: eine GETRACKTE Datei gilt nie als
 * ignoriert, auch wenn eine `.gitignore`-Regel auf sie passt. Eine geloeschte
 * oder umbenannte getrackte Datei bleibt damit rot — genau die Richtung, die die
 * Waechter fangen sollen. Man kann einen Befund also nicht dadurch verschwinden
 * lassen, dass man den Pfad in `.gitignore` eintraegt, solange die Datei
 * getrackt ist.
 *
 * Fehlt git, wird laut abgebrochen statt still durchgewinkt (CLAUDE.md §0.9:
 * kein stiller Skip — ein Waechter, der sich selbst ueberspringt, ist schlimmer
 * als keiner, weil die Suite trotzdem gruen aussieht).
 */

import { execFileSync } from "node:child_process";
import path from "node:path";

/** Immer Vorwaerts-Schraegstriche — git spricht posix, auch unter Windows. */
function posix(p) {
  return p.split(path.sep).join("/");
}

function git(wurzel, argumente, erlaubteCodes = [0]) {
  try {
    return execFileSync("git", ["-C", wurzel, ...argumente], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
  } catch (fehler) {
    if (erlaubteCodes.includes(fehler.status)) return fehler.stdout ?? "";
    throw new Error(
      `git ${argumente.join(" ")} in ${wurzel} fehlgeschlagen (Code ${fehler.status}).\n` +
      `Dieser Waechter braucht git, um getrackte von ignorierten Dateien zu unterscheiden. ` +
      `Ohne diese Unterscheidung wuerde er je nach Checkout ein anderes Urteil faellen — ` +
      `deshalb bricht er hier ab, statt sich still zu ueberspringen.\n` +
      `${fehler.stderr || fehler.message}`
    );
  }
}

/**
 * Alle vom Repo getrackten Dateien, repo-relativ und posix-normalisiert.
 *
 * Bewusst der Index und nicht der Dateibaum: das ist die einzige Menge, die in
 * jedem Checkout desselben Commits identisch ist.
 *
 * @param {string} wurzel Absoluter Pfad zur Repo-Wurzel
 * @returns {string[]}
 */
export function getrackteDateien(wurzel) {
  /*
   * Erst pruefen, ob `wurzel` wirklich die Repo-Spitze ist. `git ls-files` aus
   * einem UNTERverzeichnis heraus laeuft naemlich klaglos durch und liefert
   * Pfade relativ zu diesem Unterverzeichnis — der Aufrufer bekaeme eine
   * plausible, aber falsch verankerte Liste und wuerde sie gegen die Repo-Wurzel
   * halten. Das ist dieselbe Sorte Fehler, die dieser Helfer beheben soll: eine
   * Pruefung, die je nach Startverzeichnis etwas anderes bedeutet.
   */
  const spitze = posix(git(wurzel, ["rev-parse", "--show-toplevel"]).trim());
  const gefragt = posix(path.resolve(wurzel));
  if (spitze.toLowerCase().replace(/\/+$/, "") !== gefragt.toLowerCase().replace(/\/+$/, "")) {
    throw new Error(
      `${wurzel} ist nicht die Repo-Wurzel (die liegt bei ${spitze}). ` +
      `Aus einem Unterverzeichnis waeren alle Pfade falsch verankert — ` +
      `deshalb bricht der Helfer hier ab, statt eine plausible falsche Liste zu liefern.`
    );
  }

  const dateien = git(wurzel, ["ls-files", "-z"]).split("\0").filter(Boolean).map(posix);
  if (dateien.length === 0) {
    throw new Error(
      `git ls-files liefert in ${wurzel} keine einzige Datei — das ist keine Repo-Wurzel. ` +
      `Ein Waechter, der hier weiterliefe, pruefte nichts und waere trotzdem gruen.`
    );
  }
  return dateien;
}

/**
 * Welche der uebergebenen Pfade ignoriert git bewusst?
 *
 * Ein Pfad muss dafuer weder existieren noch eine Datei sein — `check-ignore`
 * urteilt ueber den Pfad, nicht ueber seinen Inhalt. Genau das wird gebraucht:
 * die Frage lautet "traegt dieser Checkout den Pfad absichtlich nicht?", und die
 * ist auch dann zu beantworten, wenn nichts da ist, das man ansehen koennte.
 *
 * Exit-Code 1 heisst bei `check-ignore` "kein Treffer" und ist kein Fehler.
 *
 * @param {string} wurzel Absoluter Pfad zur Repo-Wurzel
 * @param {Iterable<string>} pfade repo-relative Pfade
 * @returns {Set<string>} die Teilmenge, die git ignoriert
 */
export function ignoriertePfade(wurzel, pfade) {
  const liste = [...pfade].map(posix).filter(Boolean);
  if (liste.length === 0) return new Set();

  /* `--stdin` mit -z in BEIDE Richtungen: Pfade mit Leerzeichen oder Umlauten
   * wuerden sonst je nach `core.quotePath` verstuemmelt zurueckkommen. */
  let ausgabe;
  try {
    ausgabe = execFileSync("git", ["-C", wurzel, "check-ignore", "-z", "--stdin"], {
      input: liste.join("\0"),
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
  } catch (fehler) {
    if (fehler.status === 1) return new Set();   // nichts ignoriert
    throw new Error(
      `git check-ignore in ${wurzel} fehlgeschlagen (Code ${fehler.status}).\n${fehler.stderr || fehler.message}`
    );
  }
  return new Set(ausgabe.split("\0").filter(Boolean).map(posix));
}

/**
 * Traegt dieses Repo den Pfad bewusst nicht — auch wenn es ein VERZEICHNIS ist?
 *
 * Fuer Dateien genuegt {@link ignoriertePfade}. Bei Verzeichnissen gibt es eine
 * Falle, die teuer war: eine Regel wie `.agents/` (mit Schraegstrich) trifft nur
 * Verzeichnisse. Existiert das Verzeichnis nicht — und genau das ist im Worktree
 * ja der Fall —, kann git nicht wissen, dass der Pfad eines waere, und meldet
 * "nicht ignoriert". Die Frage wird also ausgerechnet dann falsch beantwortet,
 * wenn man sie stellt.
 *
 * Der naheliegende Ausweg, den Pfad mit Schraegstrich zu sondieren, ist FALSCH:
 * ein abschliessender Schraegstrich hebelt den Index-Abgleich aus, und git
 * meldet dann fuer jeden beliebigen Pfad einen Treffer auf eine LEERE Zeile der
 * `.gitignore` (hier: Zeile 147). `docs/README.md/` gilt damit als ignoriert,
 * obwohl die Datei getrackt ist. Ein Waechter, der darauf baut, entschuldigt
 * alles.
 *
 * Verlaesslich ist die Sonde auf einen KINDPFAD: `.agents/.sonde` trifft die
 * Regel `.agents/` sauber, waehrend ein erfundenes `docs/erfunden/.sonde` nicht
 * trifft. Damit die Sonde nichts entschuldigen kann, was zum Repo gehoert, gilt
 * sie nur fuer Pfade, unter denen KEINE getrackte Datei liegt: ein Verzeichnis
 * mit getracktem Inhalt ist Teil des Repos, sein Fehlen also ein echter Befund.
 *
 * @param {string} wurzel Absoluter Pfad zur Repo-Wurzel
 * @param {Iterable<string>} pfade repo-relative Pfade (Datei ODER Verzeichnis)
 * @param {string[]} getrackt Ergebnis von {@link getrackteDateien}
 * @returns {Set<string>} die Teilmenge, die dieses Repo bewusst nicht traegt
 */
export function nichtImRepo(wurzel, pfade, getrackt) {
  const liste = [...new Set([...pfade].map(posix).filter(Boolean))];
  if (liste.length === 0) return new Set();

  const ergebnis = ignoriertePfade(wurzel, liste);

  /* Nur Pfade, die weder selbst getrackt sind noch getrackten Inhalt haben,
   * duerfen ueberhaupt in die Verzeichnis-Sonde. */
  const getracktesSet = new Set(getrackt);
  const offen = liste.filter(
    (p) =>
      !ergebnis.has(p) &&
      !getracktesSet.has(p) &&
      !getrackt.some((t) => t.startsWith(`${p}/`))
  );
  if (offen.length === 0) return ergebnis;

  const sonden = new Map(offen.map((p) => [`${p}/.sonde-nicht-im-repo`, p]));
  for (const treffer of ignoriertePfade(wurzel, sonden.keys())) {
    ergebnis.add(sonden.get(treffer));
  }
  return ergebnis;
}

/**
 * Bestand fuer Ziel-Aufloesung: jede getrackte Datei plus alle ihre
 * Vorfahren-Verzeichnisse, kleingeschrieben.
 *
 * Warum nicht `fs.existsSync`: ein Link auf eine ignorierte Datei loest im
 * Haupt-Checkout auf und im Klon nicht. Gegen den Index gefragt, faellt das
 * Urteil ueberall gleich aus — und ein Link ins Ignorierte wird zu Recht als tot
 * gemeldet, denn wer das Repo klont, findet dort nichts.
 *
 * @param {string[]} getrackt Ergebnis von {@link getrackteDateien}
 * @returns {Set<string>}
 */
export function bestandMitVerzeichnissen(getrackt) {
  const bestand = new Set();
  for (const datei of getrackt) {
    bestand.add(datei.toLowerCase());
    let verzeichnis = path.posix.dirname(datei);
    while (verzeichnis && verzeichnis !== "." && verzeichnis !== "/") {
      bestand.add(verzeichnis.toLowerCase());
      verzeichnis = path.posix.dirname(verzeichnis);
    }
  }
  return bestand;
}
