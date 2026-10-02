/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EIN „NÄCHSTER GRIFF" MUSS AUF ETWAS OFFENES ZEIGEN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * DER ANLASS, und er ist dreimal derselbe. Am 2026-10-02 gemessen:
 *
 *   `docs/UEBERGABE.md`  „K1 ist der nächste Griff"        → K1 war seit
 *                                                            2026-08-29 gebaut
 *   `docs/UEBERGABE.md`  „nächster Griff: K3.5"            → ✅ vollständig
 *   `docs/UEBERGABE.md`  „nächster Griff: E-K3-1 bis -3"   → am 2026-08-31
 *                                                            beantwortet
 *   `K_BOUNTY_…md`       Statuszeile „K3 offen"            → jede K3-Zeile ✅
 *
 * Wer eine Arbeitsanweisung liest, fängt oben an. Vier Zeiger auf fertige Arbeit
 * heißen: die nächste Sitzung baut etwas, das längst steht — und merkt es erst,
 * wenn sie den Code liest. Das ist in diesem Projekt schon einmal passiert und in
 * der Erinnerung als „Arbeitsanweisung zeigt auf Erledigtes" festgehalten. Eine
 * Erinnerung hilft dem, der sie hat; ein Wächter hilft allen.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WAS HIER GEPRÜFT WIRD — UND WARUM ES OHNE URTEIL GEHT
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Diese Probe entscheidet NICHT, was fertig ist. Sie vergleicht nur zwei
 * Aussagen des Repos miteinander:
 *
 *   1. Ein Satz „der nächste Griff: X" gegen die Phasentabelle, die X definiert.
 *      Trägt die Zeile dort ✅ (gebaut) oder ⚠️ (entschiedene Nicht-Umsetzung),
 *      ist der Zeiger tot.
 *   2. Eine Statuszeile „A ✅ · B offen" gegen dieselben Tabellen im eigenen
 *      Dokument. Sagt sie ✅ und die Tabelle hat offene Zeilen — oder umgekehrt —
 *      widerspricht ein Dokument sich selbst.
 *
 * Beides ist nachrechenbar. Deshalb kann die Probe nicht „nach einer Woche
 * abgeschaltet" werden: sie behauptet nichts über den Stand der Arbeit.
 *
 * DIE AUSNAHME IST AUSDRÜCKLICH UND KOSTET EINEN SATZ: ein Zeiger darf stehen
 * bleiben, wenn er seine AUFLÖSUNG daneben trägt (`⏭` oder „Erledigt"). Eine
 * Chronik ist wertvoll — sie erklärt, warum etwas so gebaut wurde. Nur darf sie
 * nicht aussehen wie eine Anweisung.
 *
 * Run: node --test --test-force-exit test/planZeigerIstLebendig.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

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

const ROOT = findeWurzel(path.join("docs", "UEBERGABE.md"));
const suite = ROOT ? describe : describe.skip;

/** Alle Dokumente, die Phasentabellen führen könnten. */
function planDateien() {
  const dir = path.join(ROOT, "docs", "features");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".md"))
    .map((f) => ({ rel: "docs/features/" + f, text: fs.readFileSync(path.join(dir, f), "utf8") }));
}

/** Fertig = ✅ (gebaut) ODER ⚠️ (entschiedene Nicht-Umsetzung). */
const FERTIG = /✅|⚠/;

/**
 * Die Zeile einer Phase in einer Tabelle: `| K3.5 | … |`.
 * Der Name muss die ERSTE Zelle FÜLLEN — `| K3.5 ✅ |` zählt, `| K3.5x |` nicht.
 * Ohne diese Schärfe fände `K3` auch die Zeile von `K3.5` und eine Prüfung auf
 * „alle K3-Zeilen fertig" wäre etwas anderes als gemeint.
 */
function phasenZeilen(text, name) {
  /* DIE ERSTE ZELLE MUSS DER NAME SEIN UND SONST NICHTS.
   *
   * Erster Entwurf liess `[^|]*` nach dem Namen zu — und las damit die Zeilen
   * einer MESSTABELLE als Phasen: `| K3.6, Ausgangslage | 65,83 % | …` galt als
   * offene Phase K3.6, weil dort kein Haken steht. Gemessen: drei solche Zeilen
   * im K-Plan, und die Probe klagte eine Statuszeile an, die richtig war.
   *
   * Eine Zelle wie „K3.6, Ausgangslage" ist eine Beschriftung, keine Phase. Also
   * wird die Zelle HERAUSGESCHNITTEN und GANZ verglichen — Fettung und ein
   * Zustandszeichen dürfen dran sein, mehr nicht. */
  const erlaubt = new RegExp("^\\s*\\*{0,2}" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    + "(?:\\.\\d+)?\\*{0,2}\\s*(?:\\u2705|\\u26a0\\ufe0f?)?\\s*$");
  const zeilen = text.split(/\r?\n/);

  /* UND DIE ZEILE MUSS IN EINER PHASENTABELLE STEHEN.
   *
   * Die Zelle allein genuegt nicht: `| **K3.8** | **90,57 %** | …` ist eine Zeile
   * der MUTATIONSTABELLE, erste Zelle genau der Name, kein Haken — und damit fuer
   * den ersten Entwurf eine offene Phase. Zwei Fehlalarme in Folge aus demselben
   * Grund; der zweite ueberlebte sogar die Verscharfung auf „ganze Zelle".
   *
   * Unterscheidbar sind die beiden am KOPF: die Phasentabellen dieses Hauses
   * beginnen durchgaengig mit `| Phase | Inhalt | Stand/Nachweis/… |`, die
   * Messtabelle mit `| Lauf | gesamt | … |`. Also wird aufwaerts gesucht, bis die
   * Trennzeile und darueber der Kopf kommt. Das ist konservativ: eine Tabelle, die
   * nicht `Phase` heisst, wird nicht geprueft — lieber eine Zeile zu wenig als ein
   * Fehlalarm, denn ein Waechter mit Fehlalarmen wird abgeschaltet. */
  function inPhasentabelle(i) {
    for (let k = i - 1; k >= 0 && k >= i - 60; k--) {
      const z = zeilen[k];
      if (!z.startsWith("|")) return false;              // Tabelle zu Ende, kein Kopf
      if (/^\|[\s:-]+\|/.test(z)) {                      // die Trennzeile
        const kopf = (zeilen[k - 1] || "").slice(1).split("|")[0] || "";
        return kopf.trim().replace(/\*/g, "") === "Phase";
      }
    }
    return false;
  }

  const treffer = [];
  for (let i = 0; i < zeilen.length; i++) {
    const z = zeilen[i];
    if (!z.startsWith("|")) continue;
    const ersteZelle = z.slice(1).split("|")[0];
    if (ersteZelle === undefined) continue;
    if (!erlaubt.test(ersteZelle)) continue;
    if (!inPhasentabelle(i)) continue;
    treffer.push(z);
  }
  return treffer;
}

/** In welchem Plan-Dokument ist eine Phase definiert? */
function definiertIn(dateien, name) {
  return dateien.filter((d) => phasenZeilen(d.text, name).length > 0);
}

suite("Plan-Zeiger sind lebendig — kein „nächster Griff\" auf fertige Arbeit", () => {

  it("die Dokumente werden wirklich gelesen", () => {
    const dateien = planDateien();
    assert.ok(dateien.length >= 10,
      `nur ${dateien.length} Plan-Dokumente gefunden — die Suche greift nicht mehr`);
    const uebergabe = fs.readFileSync(path.join(ROOT, "docs", "UEBERGABE.md"), "utf8");
    assert.ok(uebergabe.length > 50000, `UEBERGABE.md ist nur ${uebergabe.length} Zeichen lang`);
    /* Und die Phasen-Erkennung muss etwas finden — sonst ist alles darunter
     * still grün. Gemessen: der K-Plan führt K0 bis K4. */
    const k = dateien.find((d) => d.rel.includes("K_BOUNTY"));
    assert.ok(k, "der K-Plan ist nicht mehr da — dann ist der Anlass dieser Probe weg");
    assert.ok(phasenZeilen(k.text, "K1").length >= 3,
      "die Phasen-Erkennung findet die K1-Zeilen nicht mehr");
  });

  it("jeder „nächste Griff\" zeigt auf etwas Offenes — oder trägt seine Auflösung", () => {
    const uebergabe = fs.readFileSync(path.join(ROOT, "docs", "UEBERGABE.md"), "utf8");
    const dateien = planDateien();
    const zeilen = uebergabe.split(/\r?\n/);
    const tot = [];
    let gepruefte = 0;

    for (let i = 0; i < zeilen.length; i++) {
      const z = zeilen[i];
      const treffer = z.match(/n(ä|ae)chste[rn]?\s+Griff/i);
      if (!treffer) continue;

      /* EIN ZITIERTER ZEIGER IST KEIN ZEIGER.
       *
       * Diese Probe hat als erstes ihre eigene Begruendung angeklagt: der Satz
       * „Diese Zeile nannte bis zum 2026-10-02 »K1 ist der naechste Griff«" ist
       * die DOKUMENTATION der Behebung, nicht die Anweisung. Dieselbe Falle wie
       * fuenfmal in Welle K3: der Pruefer liest den Kommentar, der ihn erklaert.
       *
       * Der Unterschied ist sichtbar: ein lebender Zeiger steht nicht in
       * Anfuehrungszeichen. */
      const davor = z.slice(0, treffer.index);
      const danach = z.slice(treffer.index);
      if (/„/.test(davor) && /“|"/.test(danach)) continue;

      /* Die Auflösung darf auf derselben Zeile oder in der direkt folgenden
       * stehen — Markdown bricht Sätze um, und ein Umbruch ist kein neuer
       * Gedanke. Genau diese Falle hat in Welle Y0 einen Wächter wertlos
       * gemacht: zeilenweise gelesen, satzweise gemeint. */
      const umfeld = [z, zeilen[i + 1] || "", zeilen[i + 2] || ""].join(" ");
      if (/⏭|erledigt|Erledigt|abgeschlossen|beantwortet/.test(umfeld)) continue;

      const namen = [...new Set((z.match(/\b[A-Z]\d+(?:\.\d+)?\b/g) || []))];
      for (const name of namen) {
        const quellen = definiertIn(dateien, name);
        if (quellen.length === 0) continue;   // kein Plan kennt den Namen
        gepruefte++;
        for (const q of quellen) {
          const rs = phasenZeilen(q.text, name);
          const offen = rs.filter((r) => !FERTIG.test(r));
          if (offen.length === 0) {
            tot.push(`UEBERGABE.md:${i + 1} nennt ${name} als naechsten Griff — `
              + `in ${q.rel} sind ALLE ${rs.length} Zeile(n) dazu fertig`);
          }
        }
      }
    }

    assert.ok(gepruefte >= 1,
      "kein einziger „naechster Griff\" mit Phasenbezug gefunden — dann prueft diese "
      + "Zusicherung nichts. Entweder ist die Formulierung geaendert worden oder die "
      + "Namenserkennung ist kaputt.");
    assert.deepEqual(tot, [],
      `${tot.length} Zeiger auf fertige Arbeit:\n  ` + tot.join("\n  ")
      + "\n\nWer eine Arbeitsanweisung liest, faengt oben an und baut, was laengst steht. "
      + "Entweder auf etwas Offenes zeigen, oder die Aufloesung daneben schreiben "
      + "(⏭ / „Erledigt\") — dann bleibt der Satz als Chronik stehen.");
  });

  it("keine Statuszeile widerspricht ihrer eigenen Phasentabelle", () => {
    const widerspruch = [];
    let gepruefte = 0;

    for (const d of planDateien()) {
      for (const zeile of d.text.split(/\r?\n/)) {
        if (!/^>?\s*\*\*Status/.test(zeile)) continue;
        if (!/✅/.test(zeile)) continue;      // nur Zeilen, die Phasen abhaken

        /* `K1 ✅` und `K3 offen` aus derselben Zeile lesen. */
        const fertigGenannt = [...zeile.matchAll(/\b([A-Z]\d+)\b[^·|]{0,24}?✅/g)].map((m) => m[1]);
        const offenGenannt = [...zeile.matchAll(/\b([A-Z]\d+)\b[^·|]{0,12}?offen/g)].map((m) => m[1]);

        for (const name of new Set(fertigGenannt)) {
          const rs = phasenZeilen(d.text, name);
          if (rs.length === 0) continue;
          gepruefte++;
          const offen = rs.filter((r) => !FERTIG.test(r));
          if (offen.length > 0) {
            widerspruch.push(`${d.rel}: Statuszeile hakt ${name} ab, die Tabelle hat `
              + `${offen.length} offene Zeile(n) dazu`);
          }
        }
        for (const name of new Set(offenGenannt)) {
          const rs = phasenZeilen(d.text, name);
          if (rs.length === 0) continue;
          gepruefte++;
          const offen = rs.filter((r) => !FERTIG.test(r));
          if (offen.length === 0) {
            widerspruch.push(`${d.rel}: Statuszeile nennt ${name} „offen", in der Tabelle `
              + `sind ALLE ${rs.length} Zeile(n) dazu fertig`);
          }
        }
      }
    }

    assert.ok(gepruefte >= 3,
      `nur ${gepruefte} Phasen aus Statuszeilen geprueft — die Erkennung greift nicht mehr`);
    assert.deepEqual(widerspruch, [],
      `${widerspruch.length} Statuszeile(n) widersprechen der eigenen Tabelle:\n  `
      + widerspruch.join("\n  ")
      + "\n\nDie Statuszeile steht oben und wird zuerst gelesen. Widerspricht sie der "
      + "Tabelle darunter, glaubt der Leser der Zeile — und baut das Falsche.");
  });
});
