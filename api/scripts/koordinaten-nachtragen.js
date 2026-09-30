#!/usr/bin/env node
/**
 * Welle N2.0b — die Koordinaten fuer den BESTAND.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM ES IHN GIBT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Seit N2.0 bekommt jeder NEUE Bedarf und jedes NEUE Angebot beim Anlegen
 * Koordinaten. Der Bestand hat sie nicht — und `matchingEngine.scoreMatch`
 * rechnet die Entfernung nur, wenn BEIDE Seiten welche haben. Solange die
 * bestehenden Zeilen leer bleiben, laeuft der laufende Marktplatz weiter ueber
 * den Rueckfall "gleiche Stadt, exakt geschrieben" mit 60 % des Ortsgewichts.
 *
 * Gemessen am 2026-09-06:
 *
 *   capacity_posts  status='active'   13 ohne Koordinaten, alle nachtragbar
 *   demand_requests status='open'      9 ohne Koordinaten, alle nachtragbar
 *
 * Das ist der Grund fuer ein Skript statt einer Migration: die Punkte kommen
 * von einem FREMDEN Dienst ueber das Netz. Eine Migration, die auf Nominatim
 * wartet, kann beim Aufspielen haengen oder scheitern — und ein halb
 * ausgefuehrtes Schema ist teurer als fehlende Koordinaten.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WAS ER TUT UND WAS NICHT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   * Nur Zeilen OHNE Koordinaten. Eine vorhandene Angabe wird nie
 *     ueberschrieben — sie kann von Hand gesetzt und genauer sein.
 *   * Standardmaessig nur der LEBENDE Bestand (aktive Angebote, offene
 *     Bedarfe). Geschlossene Zeilen zu geokodieren kostet Abfragen bei einem
 *     fremden Dienst fuer etwas, das niemand mehr sucht. `--alle` hebt das auf.
 *   * EINE Abfrage je Sekunde. Nominatim bittet ausdruecklich darum; wer
 *     schneller fragt, wird gesperrt — und zwar fuer alle, die diese Adresse
 *     benutzen.
 *   * EIN ORT WIRD EINMAL GEFRAGT. Der erste Trockenlauf zeigte 22 Zeilen mit
 *     sieben verschiedenen Orten — "21031 Hamburg" allein siebenmal.
 *   * Wiederholbar. Ein zweiter Lauf findet nur noch, was beim ersten nicht
 *     aufloesbar war.
 *   * `--trocken` zeigt, was er taete, und fragt niemanden.
 *
 * Die eigentliche Arbeit macht `marktGeoService.koordinatenNachtragen` — also
 * genau derselbe Code wie beim Anlegen. Eine zweite Fassung hier waere die
 * Sorte Abschrift, die beim ersten Regelwechsel auseinanderlaeuft.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AUFRUF
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   DATABASE_URL=postgres://…  node scripts/koordinaten-nachtragen.js
 *   …                                                        --trocken
 *   …                                                        --alle
 *   …                                                        --grenze=50
 */

import pg from "pg";
import { pathToFileURL } from "node:url";

import * as marktGeo from "../services/marktGeoService.js";
import * as geoService from "../services/geoService.js";

const hat = (name) => process.argv.includes(`--${name}`);
const wert = (name) => {
  const treffer = process.argv.find((a) => a.startsWith(`--${name}=`));
  return treffer ? treffer.slice(name.length + 3) : null;
};

/** Nominatim bittet um hoechstens eine Abfrage je Sekunde. */
const PAUSE_MS = 1100;
const schlafen = (ms) => new Promise((fertig) => setTimeout(fertig, ms));

/**
 * Ein Ort wird EINMAL gefragt, egal wie viele Zeilen ihn nennen.
 *
 * Der erste Trockenlauf zeigte 22 Zeilen mit ganzen SIEBEN verschiedenen Orten:
 * "21031 Hamburg" siebenmal, "Berlin" sechsmal, "50667 Köln" dreimal. Zweiundzwanzig
 * Abfragen fuer sieben Antworten waeren nicht nur langsam, sondern unhoeflich
 * gegenueber einem Dienst, der freiwillig und kostenlos antwortet — und der
 * genau deshalb um Zurueckhaltung bittet.
 *
 * Der Speicher sitzt HIER und nicht im Dienst: er gilt fuer EINEN Lauf. Ein
 * dauerhafter Zwischenspeicher waere eine andere Entscheidung mit anderen
 * Fragen (wann veraltet ein Ort? wo liegt er?) — die stellt sich hier nicht.
 *
 * Gebaut ueber die Einspeisung, die `koordinatenNachtragen` ohnehin hat: der
 * Dienst bleibt die EINE Fassung, das Skript reicht ihm nur einen Frager, der
 * sich erinnert. Auch ein NICHT-Treffer wird gemerkt — sonst fragt der Lauf
 * denselben unbekannten Ort siebenmal vergeblich.
 */
export function merkenderFrager(melden, wege = null) {
  const gemerkt = new Map();
  let echteAbfragen = 0;

  const einmal = (schluessel, fragen) => async (...args) => {
    if (gemerkt.has(schluessel(...args))) return gemerkt.get(schluessel(...args));
    const punkt = await fragen(...args);
    gemerkt.set(schluessel(...args), punkt);
    echteAbfragen++;
    /* Die Pause gehoert an die echte Abfrage, nicht an die Zeile: ein Treffer
       aus dem Speicher hat niemanden belastet und muss niemanden warten lassen.
       In der Probe ist sie 0 — sonst dauerte jede Probe eine Sekunde je Ort. */
    if (PAUSE_MS > 0 && !wege) await schlafen(PAUSE_MS);
    return punkt;
  };

  /* `wege` ist die Naht fuer die Probe: sonst liesse sich der Speicher nur
     gegen das echte Nominatim pruefen — also gar nicht. Ohne Angabe steht hier
     der echte Dienst, und die Standardfassung ist genau die, die laeuft. */
  const echt = wege || { geocode: geoService.geocode, geocodeQuery: geoService.geocodeQuery };

  return {
    geocode: einmal((plz, ort) => `s|${plz || ""}|${ort || ""}`, echt.geocode),
    geocodeQuery: einmal((q) => `q|${q}`, echt.geocodeQuery),
    bericht: () => ({ echteAbfragen, verschiedene: gemerkt.size }),
    melden
  };
}

const FLAECHEN = [
  {
    tabelle: "capacity_posts",
    lebend: "status = 'active'",
    name: "Angebote"
  },
  {
    tabelle: "demand_requests",
    lebend: "status = 'open'",
    name: "Bedarfe"
  }
];

async function offeneZeilen(pool, flaeche, alle, grenze) {
  const { rows } = await pool.query(
    `SELECT id, location_city, location_postal, location_lat, location_lng
       FROM ${flaeche.tabelle}
      WHERE location_lat IS NULL
        AND location_lng IS NULL
        AND (location_city IS NOT NULL OR location_postal IS NOT NULL)
        ${alle ? "" : `AND ${flaeche.lebend}`}
      ORDER BY created_at DESC
      LIMIT $1`,
    [grenze]
  );
  return rows;
}

export async function nachtragen({ pool, alle = false, trocken = false, grenze = 500, melden = console.log, frager = null }) {
  let gefunden = 0;
  let gesetzt = 0;
  let ohneTreffer = 0;
  const wege = frager || merkenderFrager(melden);

  for (const flaeche of FLAECHEN) {
    const zeilen = await offeneZeilen(pool, flaeche, alle, grenze);
    gefunden += zeilen.length;
    melden(`[geo] ${flaeche.name}: ${zeilen.length} Zeile(n) ohne Koordinaten`
      + (alle ? " (gesamter Bestand)" : " (nur lebende)"));

    for (const zeile of zeilen) {
      if (trocken) {
        melden(`[geo]   wuerde fragen: ${zeile.location_postal || "—"} ${zeile.location_city || "—"}`);
        continue;
      }
      const danach = await marktGeo.koordinatenNachtragen(pool, flaeche.tabelle, zeile, {
        geocode: wege.geocode,
        geocodeQuery: wege.geocodeQuery,
        logger: { warn: (d, m) => melden(`[geo]   ${m}: ${d?.err || ""}`) }
      });
      if (danach.location_lat != null) {
        gesetzt++;
        melden(`[geo]   ${zeile.location_postal || ""} ${zeile.location_city || ""}`
          + ` -> ${Number(danach.location_lat).toFixed(4)}, ${Number(danach.location_lng).toFixed(4)}`);
      } else {
        ohneTreffer++;
        melden(`[geo]   ${zeile.location_postal || ""} ${zeile.location_city || ""} -> kein Treffer`);
      }
    }
  }

  const { echteAbfragen, verschiedene } = wege.bericht ? wege.bericht() : { echteAbfragen: 0, verschiedene: 0 };
  melden("");
  melden(`[geo] ${gefunden} gefunden, ${gesetzt} gesetzt, ${ohneTreffer} ohne Treffer`
    + (trocken ? "  (Trockenlauf — nichts geschrieben)" : ""));
  if (!trocken) {
    melden(`[geo] ${echteAbfragen} Abfrage(n) fuer ${verschiedene} verschiedene Ort(e)`
      + ` — ${Math.max(0, gefunden - echteAbfragen)} Zeile(n) aus dem Speicher`);
  }
  /* `ohneTreffer` ist KEIN Fehler: manche Orte kennt der Kartendienst nicht,
     und die Zeile bleibt gueltig. Ein zweiter Lauf findet genau diese wieder. */
  return { gefunden, gesetzt, ohneTreffer };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[geo] DATABASE_URL fehlt — ohne Datenbank gibt es nichts nachzutragen.");
    process.exitCode = 1;
    return;
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    await nachtragen({
      pool,
      alle: hat("alle"),
      trocken: hat("trocken"),
      grenze: Math.max(1, parseInt(wert("grenze"), 10) || 500)
    });
  } finally {
    await pool.end();
  }
}

const direktAufgerufen = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (direktAufgerufen) main();
