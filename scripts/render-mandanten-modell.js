#!/usr/bin/env node
/**
 * Rendert den Zustandsteil von `docs/security/TENANT_ISOLATION_MODEL.md` aus
 * `api/test/fixtures/mandantenTabellen.json` — und ERHEBT das Register seit
 * 2026-10-01 auch selbst gegen die laufende Datenbank.
 *
 *   node scripts/render-mandanten-modell.js            # nur anzeigen
 *   node scripts/render-mandanten-modell.js --write     # ins Dokument schreiben
 *   node scripts/render-mandanten-modell.js --erheben   # Register gegen die DB messen
 *   node scripts/render-mandanten-modell.js --pruefen   # schreibt nichts, Exit 1 bei Drift
 *
 * Warum generiert statt gepflegt: siehe api/test/helpers/mandantenModell.js.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WARUM `--erheben` NACHGEWACHSEN IST (2026-10-01)
 *
 * `mandantenModellWaechter.test.js` war rot und sagte:
 *
 *     Registry und Datenbank sind auseinandergelaufen. **Neu erheben** und
 *     `node scripts/render-mandanten-modell.js --write` ausfuehren.
 *
 * Der zweite Teil ging — dieses Skript rendert seit dem 2026-08-21. Für den
 * ERSTEN Teil, das Neu-Erheben, gab es **keinen Befehl**. Die einzige Stelle,
 * an der das Register je gemessen wurde, war eine Messung von Hand am
 * 2026-08-21 (`registry.erhebung` beschreibt sie). Wer die rote Probe las,
 * bekam also eine Anweisung, deren erste Hälfte kein Werkzeug hatte — und die
 * Drift ließ sich auf dem dokumentierten Weg nicht schließen.
 *
 * Gemerkt hat es niemand, weil der DB-gebundene Teil des Wächters im üblichen
 * Prüflauf **übersprungen** wird: ohne `DATABASE_URL` meldet er „keine
 * Datenbank" und zählt als grün.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * DIE ERHEBUNG FASST EIN URTEIL NICHT AN
 *
 * Fünf der Einstufungen stehen im Register. Vier davon sind **Definitionen
 * über Messwerte** und werden von `mandantenModellWaechter.test.js` (Zeile
 * 81–87) wörtlich erzwungen:
 *
 *     bereit             zeilen > 0 && ohneOrg === 0
 *     bereit_ohne_daten  zeilen === 0
 *     blockiert_daten    zeilen > 0 && ohneOrg > 0
 *     geschuetzt         rls            ← nur RLS, NICHT zusätzlich FORCE
 *
 * Die fünfte, `kein_mandantentraeger`, hat dort **keine Bedingung**, und das
 * ist Absicht: sie heißt nicht „hat keine Org-Spalte", sondern **„ist nicht
 * mandantenprivat"**. `users`, `organizations`, `platform_skills`,
 * `platform_events` tragen sehr wohl einen Fremdschlüssel auf `organizations`
 * (`users.org_id`, `organizations.parent_org_id`) und sind trotzdem absichtlich
 * plattformweit. Das ist ein Urteil, und eine Zahl kann es nicht ersetzen.
 *
 * Ein erster Entwurf dieser Erhebung stufte alle Tabellen neu aus den
 * Messwerten ein. Das Ergebnis sah ordentlich aus und war falsch:
 * **`kein_mandantentraeger` fiel von 17 auf 0**, und 24 von 79 Einstufungen
 * wären still umgeschrieben worden, darunter `audit_log: geschuetzt ->
 * blockiert_daten`. Deshalb: diese eine Einstufung bleibt immer stehen.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { rendereModell, MARKER_START, MARKER_ENDE } from "../api/test/helpers/mandantenModell.js";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.resolve(HIER, "..");
const REGISTRY = path.join(WURZEL, "api/test/fixtures/mandantenTabellen.json");
const DOKUMENT = path.join(WURZEL, "docs/security/TENANT_ISOLATION_MODEL.md");

/* ── Messung ───────────────────────────────────────────────────────────────── */

/** Trägerspalten: Fremdschlüssel auf `organizations`. Wörtlich wie im Wächter —
 *  zwei Abfragen für dieselbe Frage wären zwei Wahrheiten, und dann schließt
 *  dieses Skript eine Drift, die der Wächter weiter meldet. */
const SQL_TRAEGER = `
  SELECT DISTINCT c.conrelid::regclass::text AS tabelle, a.attname AS spalte
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
  WHERE c.contype = 'f' AND c.confrelid = 'organizations'::regclass
  ORDER BY 1, 2`;

const SQL_RLS = `
  SELECT c.relname AS tabelle, c.relrowsecurity AS rls, c.relforcerowsecurity AS force
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'`;

const SQL_POLICIES = `
  SELECT tablename AS tabelle, policyname AS name
  FROM pg_policies WHERE schemaname = 'public' ORDER BY 1, 2`;

/** Die eine Einstufung, die kein Messwert ist — und deshalb unantastbar. */
const URTEIL = "kein_mandantentraeger";
const VERMERK_NEU = "NOCH NICHT BEURTEILT — vorlaeufig aus der Messung eingestuft am ";

export function stufeAusMessung({ rls, zeilen, ohneOrg }) {
  if (rls) return "geschuetzt";
  if (zeilen === 0) return "bereit_ohne_daten";
  if (ohneOrg === 0) return "bereit";
  return "blockiert_daten";
}

export function grundText({ rls, force, zeilen, ohneOrg }) {
  if (rls) {
    return "RLS ist aktiv"
      + (force ? " und FORCE steht" : " (ohne FORCE — Tabelleneigner umgehen die Policy)")
      + " — eine Verbindung ohne Org-Kontext sieht hier nichts.";
  }
  if (zeilen === 0) {
    return "Traegerspalte vorhanden, noch keine Zeilen — RLS technisch moeglich, aber an echten Daten nicht nachweisbar.";
  }
  if (ohneOrg === 0) {
    return "Traegerspalte in allen " + zeilen + " Zeilen gefuellt — RLS ohne Datenausfall aktivierbar.";
  }
  return ohneOrg + " von " + zeilen + " Zeilen ohne Traeger — RLS wuerde genau diese Zeilen unsichtbar machen.";
}

async function verbinde() {
  /* `pg` liegt in `api/node_modules` — dieses Skript steht eine Ebene darüber.
     Ein schlichtes `import "pg"` scheitert hier mit „Cannot find package 'pg'",
     deshalb wird der Auflösungspunkt ausdrücklich auf `api/package.json`
     gesetzt. Gemessen 2026-10-01: ohne das bricht `--erheben` ab, bevor es die
     erste Zeile liest. */
  const { createRequire } = await import("node:module");
  const verlange = createRequire(path.join(WURZEL, "api", "package.json"));
  const pg = verlange("pg");
  if (process.env.DATABASE_URL) return new pg.Pool({ connectionString: process.env.DATABASE_URL });
  if (!process.env.DB_HOST) return null;
  return new pg.Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || process.env.POSTGRES_USER,
    password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD,
    database: process.env.DB_NAME || process.env.POSTGRES_DB,
  });
}

export async function erhebe(alt) {
  const pool = await verbinde();
  if (!pool) {
    console.error("[mandanten-modell] Keine Datenbank konfiguriert (DATABASE_URL oder DB_HOST).");
    console.error("                   Erheben braucht die LAUFENDE Datenbank: das Modell soll nicht");
    console.error("                   aus den Migrationen abgeleitet werden, die laufen nachweislich");
    console.error("                   auseinander (Erkenntnis M0-B9).");
    console.error("                   Nur rendern geht ohne Datenbank: --write");
    process.exit(2);
  }
  try {
    const traeger = new Map();
    for (const r of (await pool.query(SQL_TRAEGER)).rows) {
      if (!traeger.has(r.tabelle)) traeger.set(r.tabelle, []);
      traeger.get(r.tabelle).push(r.spalte);
    }
    const rlsKarte = new Map((await pool.query(SQL_RLS)).rows.map((r) => [r.tabelle, r]));
    const policyKarte = new Map();
    for (const r of (await pool.query(SQL_POLICIES)).rows) {
      if (!policyKarte.has(r.tabelle)) policyKarte.set(r.tabelle, []);
      policyKarte.get(r.tabelle).push(r.name);
    }

    const heute = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
    const altKarte = new Map((alt.tabellen || []).map((t) => [t.tabelle, t]));
    const tabellen = [];
    const meldungen = [];

    for (const tabelle of [...new Set([...altKarte.keys(), ...traeger.keys()])].sort((a, b) => a.localeCompare(b))) {
      const r = rlsKarte.get(tabelle);
      const vorher = altKarte.get(tabelle);
      if (!r) {
        /* Steht im Register, existiert aber nicht mehr. NICHT still entfernen:
           der Wächter prüft genau das, und ein stilles Löschen nimmt ihm den
           Befund weg. */
        meldungen.push("  ! " + tabelle + ": im Register, aber nicht in der Datenbank — Eintrag bleibt stehen, der Waechter meldet es");
        tabellen.push(vorher);
        continue;
      }
      const spalten = (traeger.get(tabelle) || []).sort();
      const { rows: [z] } = await pool.query(`SELECT count(*)::int AS n FROM "${tabelle}"`);
      let ohneOrg = 0;
      if (spalten.length) {
        const bedingung = spalten.map((s) => `"${s}" IS NULL`).join(" AND ");
        const { rows: [o] } = await pool.query(`SELECT count(*)::int AS n FROM "${tabelle}" WHERE ${bedingung}`);
        ohneOrg = o.n;
      }
      const gemessen = {
        orgSpalten: spalten,
        zeilen: z.n,
        ohneOrg,
        rls: r.rls,
        force: r.force,
        policies: (policyKarte.get(tabelle) || []).sort(),
      };

      if (vorher) {
        const alteSpalten = (vorher.orgSpalten || []).join("+");
        if (alteSpalten !== spalten.join("+")) {
          meldungen.push("  ~ " + tabelle + ": Traegerspalten " + (alteSpalten || "—") + " -> " + (spalten.join("+") || "—"));
        }
        if (vorher.einstufung === URTEIL) {
          tabellen.push({ tabelle, ...gemessen, einstufung: URTEIL, begruendung: vorher.begruendung });
          continue;
        }
        const stufe = stufeAusMessung(gemessen);
        if (stufe === vorher.einstufung) {
          tabellen.push({ tabelle, ...gemessen, einstufung: stufe, begruendung: vorher.begruendung });
        } else {
          tabellen.push({ tabelle, ...gemessen, einstufung: stufe, begruendung: grundText(gemessen) });
          meldungen.push("  ~ " + tabelle + ": " + vorher.einstufung + " -> " + stufe
            + "  (" + gemessen.ohneOrg + "/" + gemessen.zeilen + " ohne Traeger, rls=" + gemessen.rls + ")");
        }
        continue;
      }

      const stufe = stufeAusMessung(gemessen);
      tabellen.push({
        tabelle, ...gemessen,
        einstufung: stufe,
        begruendung: VERMERK_NEU + heute + ". Traeger: " + (spalten.join(", ") || "keiner")
          + "; " + gemessen.zeilen + " Zeilen, davon " + ohneOrg + " ohne Traeger"
          + "; RLS " + (r.rls ? "an" : "aus") + (r.force ? " mit FORCE" : "")
          + ". Ob diese Tabelle mandantenprivat ist, ist ein Urteil und steht noch aus.",
      });
      meldungen.push("  + " + tabelle + ": NEU, vorlaeufig \"" + stufe + "\" — beurteilen und Begruendung ersetzen");
    }

    const zusammenfassung = {};
    for (const t of tabellen) zusammenfassung[t.einstufung] = (zusammenfassung[t.einstufung] || 0) + 1;

    return {
      ergebnis: {
        zweck: alt.zweck,
        stand: heute,
        erhebung: alt.erhebung,
        einstufungen: alt.einstufungen,
        zusammenfassung: Object.fromEntries(Object.entries(zusammenfassung).sort()),
        tabellen,
        rlsAktivLautDatenbank: tabellen.filter((t) => t.rls).map((t) => t.tabelle).sort(),
        rlsAktivHinweis: alt.rlsAktivHinweis,
      },
      meldungen,
    };
  } finally {
    await pool.end();
  }
}

/* ── Rendern ───────────────────────────────────────────────────────────────── */

export function setzeAbschnitt(text, registry) {
  const von = text.indexOf(MARKER_START);
  const bis = text.indexOf(MARKER_ENDE);
  if (von === -1 || bis === -1 || bis < von) {
    console.error(`Marker nicht gefunden in ${DOKUMENT}.\nErwartet:\n  ${MARKER_START}\n  ${MARKER_ENDE}`);
    console.error("Ohne Marken wuerde ein Schreiblauf von Hand gepflegten Text ueberschreiben.");
    process.exit(1);
  }
  return text.slice(0, von) + MARKER_START + "\n" + rendereModell(registry) + "\n" + text.slice(bis);
}

/* ── Einstieg ──────────────────────────────────────────────────────────────── */

async function main() {
  const argv = process.argv.slice(2);
  const nurPruefen = argv.includes("--pruefen") || argv.includes("--check");
  const willErheben = argv.includes("--erheben");
  const willSchreiben = argv.includes("--write");

  let registry = JSON.parse(fs.readFileSync(REGISTRY, "utf8"));

  if (willErheben && !nurPruefen) {
    const { ergebnis, meldungen } = await erhebe(registry);
    const gleichOhneDatum = JSON.stringify({ ...registry, stand: null }, null, 2)
      === JSON.stringify({ ...ergebnis, stand: null }, null, 2);
    if (gleichOhneDatum) {
      console.log("[mandanten-modell] Register unveraendert (" + ergebnis.tabellen.length + " Tabellen) — nichts geschrieben.");
    } else {
      fs.writeFileSync(REGISTRY, JSON.stringify(ergebnis, null, 2) + "\n");
      registry = ergebnis;
      console.log("[mandanten-modell] Register erhoben: " + registry.tabellen.length + " Tabellen, Stand " + registry.stand + ".");
      for (const m of meldungen) console.log(m);
      const offen = registry.tabellen.filter((t) => (t.begruendung || "").startsWith(VERMERK_NEU));
      if (offen.length) {
        console.log("");
        console.log("  " + offen.length + " Tabelle(n) sind NOCH NICHT BEURTEILT. Die Einstufung stammt aus der");
        console.log("  Messung, nicht aus einer Entscheidung. `kein_mandantentraeger` heisst");
        console.log("  \"nicht mandantenprivat\" und laesst sich nicht messen — bitte je Tabelle");
        console.log("  entscheiden und die Begruendung ersetzen.");
      }
    }
  }

  /* Ohne --write und ohne --pruefen: nur anzeigen (das Verhalten von 2026-08-21). */
  if (!willSchreiben && !nurPruefen) {
    if (!willErheben) process.stdout.write(rendereModell(registry) + "\n");
    return;
  }

  const text = fs.readFileSync(DOKUMENT, "utf8");
  const neu = setzeAbschnitt(text, registry);

  if (nurPruefen) {
    if (neu === text) {
      console.log("[mandanten-modell] Dokument ist auf dem Stand des Registers.");
      return;
    }
    console.error("[mandanten-modell] DRIFT: das Dokument weicht vom Register ab.");
    console.error("                   Schreiben mit: node scripts/render-mandanten-modell.js --write");
    process.exit(1);
  }

  if (neu === text) {
    console.log("[mandanten-modell] Dokument unveraendert — nichts geschrieben.");
  } else {
    fs.writeFileSync(DOKUMENT, neu);
    console.log(`${path.relative(WURZEL, DOKUMENT)} neu gerendert (${registry.tabellen.length} Tabellen).`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((e) => {
    console.error("[mandanten-modell] " + (e?.message || e));
    process.exit(2);
  });
}

export { REGISTRY, DOKUMENT, URTEIL, VERMERK_NEU };
