#!/usr/bin/env node
/**
 * Der Wichtigkeits-Wächter — offene Punkte nach Klassen A, B und C.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WORUM ES GEHT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Owner 2026-10-01: „wollen wir so ein Wichtigkeits-Wächter bauen, der nach
 * Wichtigkeit noch nicht erledigte Sachen regelmäßig prüft und eine Erinnerung
 * an mich schickt durch dich — hierarchisch strukturiert eben nach
 * Wichtigkeitsklassen A, B und C".
 *
 * Offene Punkte standen bis dahin in vier Listen an drei Orten (Übergabe:
 * Reihenfolge, Owner-Liste, Owner-Entscheidungen; Go-Live-Liste: P0), jede mit
 * eigener Gewichtung oder ganz ohne. Niemand sah sie zusammen, und niemand
 * erinnerte den Owner an das, was nur er lösen kann. `docs/WICHTIGKEIT.md` ist
 * der Index darüber: Klasse, wer handelt, nächster Schritt, Quelle.
 *
 * Dieses Skript tut drei Dinge:
 *   1. das Register lesen (`leseRegister`),
 *   2. es gegen die vier Listen prüfen (`pruefeRegister`) — jeder dort offene
 *      Posten muss hier eingestuft sein, und keine offene Zeile hier darf auf
 *      etwas zeigen, das dort erledigt ist,
 *   3. die Erinnerung schreiben (`erinnerung`): A ausführlich, B je eine
 *      Zeile, C nur in der ersten Woche des Monats als Liste.
 *
 * Die wöchentliche Zustellung macht eine Routine in Claude Code (Montag früh,
 * Push und E-Mail): sie holt den Stand von GitHub, ruft dieses Skript mit
 * `--zweige=…` und gibt die Ausgabe weiter. Welcher Zweig gilt, entscheidet
 * der jüngste Commit am Register (`waehleFrischesten`) — die Cloud-Sitzung und
 * K1 pflegen es beide.
 *
 * AUFRUF (aus dem Projektordner)
 *   node api/scripts/wichtigkeit.mjs                    Erinnerung für heute
 *   node api/scripts/wichtigkeit.mjs --alle             mit der C-Liste
 *   node api/scripts/wichtigkeit.mjs --pruefen          Form und Kopplung; Rückgabe 1 bei Befund
 *   node api/scripts/wichtigkeit.mjs --heute=2026-10-05 als wäre heute dieser Tag
 *   node api/scripts/wichtigkeit.mjs --zweige=a,b       Register vom jüngsten dieser Zweige (origin)
 */
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { todayDE } from "../utils/dateDE.js";

export const KLASSEN = ["A", "B", "C"];
export const KLASSEN_TITEL = {
  A: "muss vor dem Livegang stehen",
  B: "wichtig, bald",
  C: "später",
};
/** Reihenfolge in der Erinnerung: was beim Owner liegt, zuerst. */
export const WER = ["Owner", "Cloud", "K1", "Extern"];
const WER_TEXT = { Owner: "bei dir", Cloud: "bei der Cloud-Sitzung", K1: "bei K1", Extern: "bei Externen" };
const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

/* ── Datum ohne Zeitzonen-Falle: nur Kalendertage, gerechnet in UTC ─────────── */

function tagWert(iso) {
  const [j, m, t] = iso.split("-").map(Number);
  return Date.UTC(j, m - 1, t);
}
function gueltigesDatum(iso) {
  if (!DATUM.test(iso || "")) return false;
  const d = new Date(tagWert(iso));
  return d.toISOString().slice(0, 10) === iso;
}
/** Ganze Tage von `von` bis `bis` (positiv, wenn `bis` später liegt). */
export function tageZwischen(von, bis) {
  return Math.round((tagWert(bis) - tagWert(von)) / 86400000);
}
function deutsch(iso) {
  const [j, m, t] = iso.split("-");
  return `${t}.${m}.${j}`;
}
function wochentag(iso) {
  return WOCHENTAGE[new Date(tagWert(iso)).getUTCDay()];
}
/** Erster Tag des Folgemonats — dann kommt die C-Liste wieder. */
function naechsterMonatsanfang(iso) {
  const [j, m] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(j, m, 1));
  return d.toISOString().slice(0, 10);
}

/* ── Markdown → Klartext (Push und E-Mail zeigen keine Sternchen) ───────────── */

export function klartext(s) {
  return String(s ?? "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/* ── 1. Das Register lesen ────────────────────────────────────────────────── */

function zellen(zeile) {
  return zeile.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((z) => z.trim());
}

/**
 * Liest `docs/WICHTIGKEIT.md`. Offene Punkte stehen unter `## A — …`,
 * `## B — …`, `## C — …` (7 Spalten), erledigte unter `## Erledigt` (4).
 * Formfehler werden gesammelt, nicht geworfen — die Erinnerung soll auch mit
 * einer kaputten Zeile noch kommen, nur mit Hinweis.
 */
export function leseRegister(text) {
  const fehler = [];
  const punkte = [];
  const erledigt = [];
  const kopf = String(text).match(/^\*\*Livegang:\*\*\s*(\d{4}-\d{2}-\d{2})/m);
  const livegang = kopf ? kopf[1] : null;
  if (!livegang) fehler.push("Kopfzeile „**Livegang:** JJJJ-MM-TT“ fehlt");

  let abschnitt = null;
  String(text).split("\n").forEach((zeile, i) => {
    const klasse = zeile.match(/^## (A|B|C) — /);
    if (klasse) { abschnitt = klasse[1]; return; }
    if (/^## Erledigt\b/.test(zeile)) { abschnitt = "erledigt"; return; }
    if (/^## /.test(zeile)) { abschnitt = null; return; }
    if (!abschnitt || !/^\|\s*OP-/.test(zeile)) return;

    const z = zellen(zeile);
    if (abschnitt === "erledigt") {
      if (z.length !== 4) { fehler.push(`Zeile ${i + 1} (${z[0]}): „Erledigt“ braucht 4 Spalten, gefunden ${z.length}`); return; }
      erledigt.push({ nr: z[0], was: z[1], am: z[2], beleg: z[3], zeile: i + 1 });
      return;
    }
    if (z.length !== 7) {
      fehler.push(`Zeile ${i + 1} (${z[0]}): 7 Spalten erwartet, gefunden ${z.length} — steht ein „|“ im Text?`);
      return;
    }
    const [nr, was, wer, schritt, seit, frist, quelle] = z;
    punkte.push({
      nr, klasse: abschnitt, was, wer, schritt, seit,
      frist: frist === "" || frist === "—" ? null : frist,
      quelle, zeile: i + 1,
    });
  });
  return { livegang, punkte, erledigt, fehler };
}

/* ── 2. Die vier Listen lesen, aus denen das Register gespeist wird ──────── */

function abschnittAb(text, kopfMuster, endeMuster = /^## /) {
  const zeilen = String(text).split("\n");
  const start = zeilen.findIndex((z) => kopfMuster.test(z));
  if (start < 0) return null;
  const rest = zeilen.slice(start + 1);
  const ende = rest.findIndex((z) => endeMuster.test(z));
  return ende < 0 ? rest : rest.slice(0, ende);
}

/**
 * Liest offen/erledigt aus Übergabe und Go-Live-Liste. Fehlt ein Abschnitt,
 * steht er als `null` da — `pruefeRegister` meldet das, statt still nichts zu
 * prüfen (eine Sammlung, die nichts findet, misst ihre eigene Leere).
 */
export function leseQuellen({ uebergabe = "", todos = "" } = {}) {
  const neu = () => ({ offen: new Set(), erledigt: new Set() });

  let reihenfolge = null;
  const r = abschnittAb(uebergabe, /^## Die Reihenfolge der offenen Arbeit/);
  if (r) {
    reihenfolge = neu();
    for (const z of r) {
      const t = z.match(/^\|\s*(~~)?([0-9]+[a-z]?)(~~)?\s*\|/);
      if (t) (t[1] ? reihenfolge.erledigt : reihenfolge.offen).add(t[2]);
    }
  }

  let ownerListe = null;
  const o = abschnittAb(uebergabe, /^## Was auf dem Owner liegt/, /^#{2,3} /);
  if (o) {
    ownerListe = neu();
    for (const z of o) {
      const t = z.match(/^\|\s*(\d+)\s*\|/);
      if (t) (z.includes("✅") ? ownerListe.erledigt : ownerListe.offen).add(t[1]);
    }
  }

  let entscheidungen = null;
  const e = abschnittAb(uebergabe, /^## Offene Owner-Entscheidungen/);
  if (e) {
    entscheidungen = neu();
    for (const z of e) {
      if (/^- ~~/.test(z)) {
        // Durchgestrichene Zeile: jede Kennung darin gilt als entschieden
        // („~~E-E1/E-E2/E-E3~~ ✅“). Offen hat beim Prüfen Vorrang.
        for (const k of z.matchAll(/\b([A-Z]-[A-Z]\d+)\b/g)) entscheidungen.erledigt.add(k[1]);
        continue;
      }
      const t = z.match(/^- \*\*([A-Z]-[A-Z]\d+)\b/);
      if (t) (z.includes("✅") ? entscheidungen.erledigt : entscheidungen.offen).add(t[1]);
    }
  }

  let golive = null;
  const zeilen = String(todos).split("\n");
  if (zeilen.some((z) => /^## P0 - Go-Live-Blocker/.test(z))) {
    golive = neu();
    zeilen.forEach((z, i) => {
      const t = z.match(/^### (~~)?(P0\.\d+)\b/);
      if (!t) return;
      if (t[1]) { golive.erledigt.add(t[2]); return; }
      // Kopf und die nächsten drei Zeilen — aber nie über den nächsten Eintrag
      // hinaus, sonst erbt ein erledigter Posten das OFFEN seines Nachbarn.
      const danach = zeilen.slice(i + 1, i + 4);
      const ende = danach.findIndex((d) => /^#{2,3} /.test(d));
      const umfeld = [z, ...(ende < 0 ? danach : danach.slice(0, ende))].join("\n");
      (/OFFEN/.test(umfeld) ? golive.offen : golive.erledigt).add(t[2]);
    });
  }

  return { reihenfolge, ownerListe, entscheidungen, golive };
}

/** Die geprüften Verweise in der Spalte „Quelle“. */
export const VERWEISE = [
  { art: "reihenfolge", name: "Reihenfolge #", muster: /Reihenfolge #([0-9]+[a-z]?)\b/g },
  { art: "ownerListe", name: "Owner-Liste #", muster: /Owner-Liste #(\d+)\b/g },
  { art: "entscheidungen", name: "Entscheidung ", muster: /Entscheidung ([A-Z]-[A-Z]\d+)\b/g },
  { art: "golive", name: "Go-Live ", muster: /Go-Live (P0\.\d+)\b/g },
];

/**
 * Prüft Form und Kopplung. Liefert eine Liste lesbarer Befunde (leer = gut).
 * `existiert(pfad)` beantwortet, ob ein Verweis relativ zu `docs/` auf eine
 * echte Datei zeigt; ohne `quellen` wird nur die Form geprüft.
 */
export function pruefeRegister(reg, { quellen = null, existiert = () => true, heute = null } = {}) {
  const befunde = [...reg.fehler];
  const gesehen = new Map();
  for (const p of [...reg.punkte, ...reg.erledigt]) {
    if (!/^OP-\d{2,}$/.test(p.nr)) befunde.push(`${p.nr}: Nummer nicht im Format OP-nn`);
    if (gesehen.has(p.nr)) befunde.push(`${p.nr}: Nummer doppelt (Zeilen ${gesehen.get(p.nr)} und ${p.zeile})`);
    gesehen.set(p.nr, p.zeile);
  }

  for (const p of reg.punkte) {
    if (!WER.includes(p.wer)) befunde.push(`${p.nr}: „Wer“ ist „${p.wer}“ — erlaubt: ${WER.join(", ")}`);
    if (!klartext(p.was)) befunde.push(`${p.nr}: „Was“ ist leer`);
    if (!klartext(p.schritt)) befunde.push(`${p.nr}: „Nächster Schritt“ ist leer`);
    if (!gueltigesDatum(p.seit)) befunde.push(`${p.nr}: „Seit“ ist kein Datum (JJJJ-MM-TT): ${p.seit}`);
    else if (heute && tageZwischen(heute, p.seit) > 0) befunde.push(`${p.nr}: „Seit“ liegt in der Zukunft: ${p.seit}`);
    if (p.frist !== null && !gueltigesDatum(p.frist)) befunde.push(`${p.nr}: „Frist“ ist kein Datum: ${p.frist}`);
    const links = [...p.quelle.matchAll(/\]\(([^)#]+)(#[^)]*)?\)/g)].map((m) => m[1]);
    if (links.length === 0) befunde.push(`${p.nr}: „Quelle“ ohne Verweis auf eine Datei`);
    for (const l of links) if (!/^https?:/.test(l) && !existiert(l)) befunde.push(`${p.nr}: Verweis auf eine Datei, die es nicht gibt: ${l}`);
  }
  for (const p of reg.erledigt) {
    if (!gueltigesDatum(p.am)) befunde.push(`${p.nr}: „Erledigt am“ ist kein Datum: ${p.am}`);
    if (!klartext(p.beleg)) befunde.push(`${p.nr}: erledigt ohne Beleg (Commit, Test)`);
  }

  if (!quellen) return befunde;

  for (const v of VERWEISE) {
    const quelle = quellen[v.art];
    if (!quelle) { befunde.push(`Liste „${v.name.trim()}“ nicht gefunden — Abschnitt umbenannt? Dann hier mitziehen.`); continue; }
    const eingestuft = new Set();
    for (const p of reg.punkte) {
      for (const m of p.quelle.matchAll(v.muster)) {
        const k = m[1];
        eingestuft.add(k);
        if (quelle.erledigt.has(k) && !quelle.offen.has(k)) {
          befunde.push(`${p.nr} zeigt auf ${v.name}${k}, das dort erledigt ist — nach „Erledigt“ verschieben`);
        } else if (!quelle.offen.has(k)) {
          befunde.push(`${p.nr} verweist auf ${v.name}${k}, das es dort nicht gibt`);
        }
      }
    }
    for (const k of quelle.offen) {
      if (!eingestuft.has(k)) befunde.push(`${v.name}${k} ist offen, aber nicht eingestuft — Zeile in docs/WICHTIGKEIT.md ergänzen`);
    }
  }
  return befunde;
}

/* ── 3. Die Erinnerung ───────────────────────────────────────────────────── */

function faellig(p, livegang) {
  if (p.frist) return p.frist;
  return p.klasse === "A" ? livegang : null;
}

/**
 * Sortierung in einer Klasse: überfällig zuerst, dann das Älteste. Dass beim
 * Owner Liegendes oben steht, macht die Gruppierung in `erinnerung` (sie geht
 * `WER` der Reihe nach durch) — ein zweites Kriterium hier wäre toter Code.
 */
export function sortiere(punkte, { heute, livegang }) {
  const ueber = (p) => { const f = faellig(p, livegang); return f && tageZwischen(f, heute) > 0 ? 0 : 1; };
  return [...punkte].sort((a, b) =>
    ueber(a) - ueber(b)
    || (a.seit < b.seit ? -1 : a.seit > b.seit ? 1 : 0)
    || (a.nr < b.nr ? -1 : 1));
}

/**
 * Die Erinnerung als Klartext — für Push, E-Mail und Terminal gleich lesbar.
 * A: jeder Punkt mit nächstem Schritt. B: eine Zeile je Punkt. C: Liste nur in
 * der ersten Woche des Monats (bei der Montagsroutine: am ersten Montag) oder
 * mit `alleC`, sonst nur die Zahl.
 */
export function erinnerung(reg, { heute, alleC = false, hinweise = [] } = {}) {
  const tag = Number(heute.slice(8, 10));
  const zeigeC = alleC || tag <= 7;
  const zeilen = [];
  const offen = { A: [], B: [], C: [] };
  for (const p of reg.punkte) offen[p.klasse].push(p);
  const beiDir = (k) => offen[k].filter((p) => p.wer === "Owner").length;

  zeilen.push(`Wichtigkeits-Wächter — ${wochentag(heute)}, ${deutsch(heute)}`);
  if (reg.livegang) {
    const rest = tageZwischen(heute, reg.livegang);
    zeilen.push(rest >= 0
      ? `Livegang ${deutsch(reg.livegang)}: noch ${rest} Tage.`
      : `Livegang ${deutsch(reg.livegang)}: seit ${-rest} Tagen überschritten.`);
  }
  zeilen.push(`Offen: A ${offen.A.length} · B ${offen.B.length} · C ${offen.C.length} — davon bei dir: A ${beiDir("A")} · B ${beiDir("B")} · C ${beiDir("C")}`);
  const frisch = reg.erledigt.filter((p) => gueltigesDatum(p.am) && tageZwischen(p.am, heute) >= 0 && tageZwischen(p.am, heute) <= 7);
  if (frisch.length) zeilen.push(`Erledigt in den letzten 7 Tagen: ${frisch.length} — ${frisch.map((p) => `${p.nr} ${klartext(p.was)}`).join(" · ")}`);

  for (const k of KLASSEN) {
    zeilen.push("");
    const liste = sortiere(offen[k], { heute, livegang: reg.livegang });
    if (k === "C" && !zeigeC) {
      zeilen.push(`C — ${KLASSEN_TITEL.C} (${liste.length}): die Liste kommt in der ersten Woche des Monats (nächste ab ${deutsch(naechsterMonatsanfang(heute))}).`);
      continue;
    }
    zeilen.push(`${k} — ${KLASSEN_TITEL[k]} (${liste.length})`);
    if (!liste.length) { zeilen.push("  nichts offen"); continue; }
    for (const wer of WER) {
      const gruppe = liste.filter((p) => p.wer === wer);
      if (!gruppe.length) continue;
      zeilen.push(`  ${WER_TEXT[wer]} (${gruppe.length}):`);
      for (const p of gruppe) {
        const f = faellig(p, reg.livegang);
        const ueber = f && tageZwischen(f, heute) > 0 ? `ÜBERFÄLLIG seit ${deutsch(f)} — ` : "";
        if (k === "A") {
          const alter = gueltigesDatum(p.seit) ? ` (seit ${tageZwischen(p.seit, heute)} Tagen)` : "";
          zeilen.push(`  - ${p.nr} ${ueber}${klartext(p.was)}${alter}`);
          zeilen.push(`    nächster Schritt: ${klartext(p.schritt)}`);
        } else {
          zeilen.push(`  - ${p.nr} ${ueber}${klartext(p.was)} — ${klartext(p.schritt)}`);
        }
      }
    }
  }
  if (hinweise.length) {
    zeilen.push("");
    zeilen.push(`Hinweis: das Register hat ${hinweise.length} Befund(e) — node api/scripts/wichtigkeit.mjs --pruefen`);
  }
  zeilen.push("");
  zeilen.push("Einstufen, verschieben, abhaken: docs/WICHTIGKEIT.md — oder einfach Claude sagen.");
  return zeilen.join("\n");
}

/* ── Welcher Stand gilt? Der jüngste Commit am Register ──────────────────── */

function gitAusfuehren(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

/**
 * Wählt unter den Zweigen den, dessen letzter Commit am Register am jüngsten
 * ist, und liefert dessen Fassung. Ein fehlender Zweig wird übergangen; gibt
 * es keinen, `null`. Holen (`git fetch`) muss der Aufrufer vorher.
 */
export function waehleFrischesten({ zweige, datei = "docs/WICHTIGKEIT.md", remote = "origin", ausfuehren = gitAusfuehren, cwd } = {}) {
  let bester = null;
  for (const zweig of zweige) {
    try {
      const zeit = Number(String(ausfuehren(["log", "-1", "--format=%ct", `${remote}/${zweig}`, "--", datei], cwd)).trim());
      if (!Number.isFinite(zeit) || zeit <= 0) continue;
      if (!bester || zeit > bester.zeit) bester = { zweig, zeit };
    } catch {
      /* Zweig gibt es (noch) nicht — übergehen */
    }
  }
  if (!bester) return null;
  return { ...bester, text: String(ausfuehren(["show", `${remote}/${bester.zweig}:${datei}`], cwd)) };
}

/* ── Aufruf von der Kommandozeile ────────────────────────────────────────── */

function main(argv) {
  const wurzel = resolve(import.meta.dirname, "..", "..");
  const opt = Object.fromEntries(argv.map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
  const heute = typeof opt.heute === "string" ? opt.heute : todayDE();
  if (!gueltigesDatum(heute)) { console.error(`--heute ist kein Datum: ${heute}`); return 2; }

  let text;
  let herkunft = "";
  if (typeof opt.zweige === "string") {
    const z = waehleFrischesten({ zweige: opt.zweige.split(",").map((s) => s.trim()).filter(Boolean), cwd: wurzel });
    if (!z) { console.error("Kein Zweig mit docs/WICHTIGKEIT.md gefunden (vorher git fetch?)."); return 2; }
    text = z.text;
    herkunft = `Stand: ${z.zweig}, letzter Commit am Register ${new Date(z.zeit * 1000).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}`;
  } else {
    text = readFileSync(join(wurzel, "docs", "WICHTIGKEIT.md"), "utf8");
  }

  const reg = leseRegister(text);
  const lesen = (rel) => { const p = join(wurzel, rel); return existsSync(p) ? readFileSync(p, "utf8") : ""; };
  const quellen = typeof opt.zweige === "string" ? null : leseQuellen({ uebergabe: lesen("docs/UEBERGABE.md"), todos: lesen("docs/PILOT_GO_LIVE_TODOS.md") });
  const befunde = pruefeRegister(reg, { quellen, heute, existiert: (rel) => existsSync(join(wurzel, "docs", rel)) });

  if (opt.pruefen) {
    if (!befunde.length) { console.log(`Register in Ordnung: ${reg.punkte.length} offen, ${reg.erledigt.length} erledigt.`); return 0; }
    console.log(`Register: ${befunde.length} Befund(e)`);
    for (const b of befunde) console.log(`  - ${b}`);
    return 1;
  }
  console.log(erinnerung(reg, { heute, alleC: Boolean(opt.alle), hinweise: befunde }));
  if (herkunft) console.log(herkunft);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
