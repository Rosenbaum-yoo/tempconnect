/**
 * P10 Spur D / Welle D3 — die Spaltentabelle.
 *
 * WAS HIER GELOEST WIRD
 * "Welche Spaltenueberschrift meint welches Feld" stand bisher als hartkodierte
 * Liste im Browser. Jede neue Schreibweise eines Kunden brauchte einen Deploy,
 * und der Server kannte die Zuordnung ueberhaupt nicht.
 *
 * WARUM DIE ZUORDNUNG HIER LIEGT UND NICHT IM BROWSER
 * D4 hat gezeigt, was passiert, wenn dieselbe Regel an zwei Orten steht: die
 * Land-Umwandlung existiert doppelt und wird nur noch durch einen
 * Vergleichstest zusammengehalten, der den Browser-Quelltext ausliest. Das ist
 * eine Sicherung, keine Loesung. Bei den Spaltennamen wird die Doppelung
 * deshalb gar nicht erst angelegt: der Browser fragt, dieser Dienst antwortet.
 * Der Wizard rendert nur noch das Ergebnis.
 *
 * DREI STUFEN DER ERKENNUNG, IN DIESER REIHENFOLGE
 *   1. Ueberschrift trifft einen Alias   ("Gebdatum" -> date_of_birth)
 *   2. Prioritaet entscheidet Konflikte  ("Name" und "Nachname" in derselben
 *                                         Datei: die eindeutige Spalte gewinnt)
 *   3. Inhalt verraet das Feld           (Werte mit "@" sind die E-Mail-Spalte,
 *                                         auch wenn die Ueberschrift schweigt)
 *
 * Stufe 3 laeuft NUR fuer Ueberschriften, die gar nichts getroffen haben, und
 * nur fuer Felder mit einem eindeutigen Muster. Ein Datum ist nicht eindeutig —
 * "Eintrittsdatum" saehe aus wie ein Geburtsdatum. Lieber nicht zuordnen als
 * falsch zuordnen: eine falsche Spalte schreibt stillschweigend falsche Daten
 * in Personalakten.
 */

/** Wie lange der Katalog gehalten wird. Referenzdaten, aendern sich selten. */
export const KATALOG_TTL_MS = 10 * 60 * 1000;

/** Wie viele Beispielwerte je Spalte fuer die Inhaltserkennung reichen. */
export const MAX_PROBEN = 20;

/** Ab welchem Anteil passender Proben eine Spalte als erkannt gilt. */
export const PROBEN_SCHWELLE = 0.6;

const _cache = new Map();

/** Nur fuer Tests: verwirft den Cache. */
export function resetFieldCatalogCache() {
  _cache.clear();
}

/**
 * Die EINE Normalisierungsregel fuer Spaltenschluessel.
 *
 * Klein schreiben, Umlaute falten, alles ausser a-z0-9 entfernen. Damit treffen
 * "Geb.-Datum", "geb datum", "GEB_DATUM" und "Gebdatum" denselben Schluessel.
 *
 * Genau hier lag der gemeldete Fehler: die alte Regel entfernte Punkte und
 * Bindestriche, liess aber den Unterstrich stehen und die Umlaute ungefaltet.
 * Deshalb traf der Alias "geb_datum" ausgerechnet "Gebdatum" nicht.
 *
 * Die CHECK-Bedingung auf `csv_import_field_aliases.alias_key` erzwingt dieselbe
 * Form in der Datenbank — ein Alias, der diese Regel nicht erfuellt, laesst sich
 * nicht einfuegen und koennte sonst nie treffen.
 */
export function normalisiereSchluessel(text) {
  if (typeof text !== "string") return "";
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Laedt Felder und Aliase. Plattformweite Eintraege (`org_id IS NULL`) gelten
 * fuer alle; kundeneigene kommen dazu und schlagen bei gleicher Prioritaet die
 * allgemeinen, weil sie den konkreten Export dieses Kunden beschreiben.
 *
 * Faellt bei einem DB-Fehler auf den letzten Stand zurueck, statt den Import
 * lahmzulegen — aber NICHT auf eine hartkodierte Liste. Es gibt im Repo kein
 * Muster "Server tot, nimm die alten Werte", und ein stiller Rueckfall waere
 * genau die zweite Wahrheit, die dieser Dienst abschafft.
 */
export async function ladeFeldkatalog(pool, { orgId = null, jetzt = Date.now(), force = false } = {}) {
  const schluessel = orgId || "_global";
  const gemerkt = _cache.get(schluessel);
  if (!force && gemerkt && jetzt - gemerkt.geladenUm < KATALOG_TTL_MS) return gemerkt.katalog;

  try {
    const [felder, aliase] = await Promise.all([
      pool.query(
        `SELECT field_key, label_key, is_required, sort_order, value_pattern
           FROM csv_import_fields
          WHERE is_active = TRUE
          ORDER BY sort_order ASC, field_key ASC`
      ),
      pool.query(
        `SELECT field_key, alias_key, alias_label, language, priority,
                (org_id IS NOT NULL) AS ist_eigen
           FROM csv_import_field_aliases
          WHERE is_active = TRUE
            AND (org_id IS NULL OR org_id = $1)
          ORDER BY priority DESC, alias_key ASC`,
        [orgId]
      )
    ]);

    const katalog = baueKatalog(felder.rows, aliase.rows);
    _cache.set(schluessel, { katalog, geladenUm: jetzt });
    return katalog;
  } catch (err) {
    if (gemerkt) return gemerkt.katalog;
    throw err;
  }
}

/** Formt die beiden Ergebnismengen zu einer Nachschlagestruktur. */
export function baueKatalog(felderRows, aliasRows) {
  const felder = (felderRows || []).map((f) => ({
    field_key:     f.field_key,
    label_key:     f.label_key,
    is_required:   Boolean(f.is_required),
    sort_order:    Number(f.sort_order) || 0,
    value_pattern: f.value_pattern || null
  }));

  // Ein Schluessel kann auf mehrere Felder zeigen ("Name" auf Nach- und
  // Vorname). Alle Kandidaten behalten, die Prioritaet entscheidet spaeter.
  const nachSchluessel = new Map();
  for (const a of aliasRows || []) {
    const liste = nachSchluessel.get(a.alias_key) || [];
    liste.push({
      field_key:   a.field_key,
      alias_label: a.alias_label,
      language:    a.language || null,
      // Kundeneigene Aliase beschreiben den konkreten Export dieses Kunden und
      // stechen deshalb die allgemeinen, ohne dass jemand Prioritaeten pflegen muss.
      priority:    (Number(a.priority) || 0) + (a.ist_eigen ? 1000 : 0),
      ist_eigen:   Boolean(a.ist_eigen)
    });
    nachSchluessel.set(a.alias_key, liste);
  }
  for (const liste of nachSchluessel.values()) liste.sort((x, y) => y.priority - x.priority);

  return { felder, aliase: nachSchluessel };
}

/**
 * Ordnet Spaltenueberschriften den Zielfeldern zu.
 *
 * @param katalog  Ergebnis von ladeFeldkatalog()
 * @param spalten  [{ header: "Gebdatum", proben: ["12.03.1988", ...] }]
 * @returns { zuordnung, treffer, offen, mehrdeutig }
 */
export function ordneSpaltenZu(katalog, spalten) {
  const felder = katalog?.felder || [];
  const aliase = katalog?.aliase || new Map();
  const eingaben = Array.isArray(spalten) ? spalten : [];

  /*
   * Alle Bewerbungen einsammeln, dann nach Prioritaet vergeben. Der alte Weg
   * ("erster Treffer gewinnt", je Ueberschrift von oben nach unten) war von der
   * Reihenfolge der Felder abhaengig: stand "Name" vor "Nachname" in der Liste,
   * gewann die mehrdeutige Spalte. Jetzt gewinnt die staerkere Bewerbung,
   * unabhaengig von der Reihenfolge in Datei und Katalog.
   */
  const bewerbungen = [];
  eingaben.forEach((s, i) => {
    const header = typeof s?.header === "string" ? s.header : "";
    const schluessel = normalisiereSchluessel(header);
    if (!schluessel) return;
    for (const kandidat of aliase.get(schluessel) || []) {
      bewerbungen.push({ index: i, header, schluessel, ...kandidat });
    }
  });

  bewerbungen.sort((a, b) => (b.priority - a.priority) || (a.index - b.index));

  const zuordnung = {};
  const treffer = [];
  const vergebeneFelder = new Set();
  const vergebeneSpalten = new Set();
  const abgelehnt = [];

  for (const b of bewerbungen) {
    if (vergebeneSpalten.has(b.index) || vergebeneFelder.has(b.field_key)) {
      abgelehnt.push(b);
      continue;
    }
    vergebeneSpalten.add(b.index);
    vergebeneFelder.add(b.field_key);
    zuordnung[b.header] = b.field_key;
    treffer.push({
      header:      b.header,
      field_key:   b.field_key,
      alias_label: b.alias_label,
      via:         b.ist_eigen ? "alias_eigen" : "alias"
    });
  }

  /*
   * Inhaltserkennung, nur fuer das, was uebrig ist. Der Owner nennt den Fall
   * ausdruecklich: die E-Mail-Spalte ist die, deren Werte ein "@" enthalten.
   * Nur Felder mit eindeutigem Muster nehmen daran teil.
   */
  for (const feld of felder) {
    if (!feld.value_pattern || vergebeneFelder.has(feld.field_key)) continue;
    let muster;
    try { muster = new RegExp(feld.value_pattern); } catch { continue; }

    let beste = null;
    eingaben.forEach((s, i) => {
      if (vergebeneSpalten.has(i)) return;
      const proben = (Array.isArray(s?.proben) ? s.proben : [])
        .filter((v) => typeof v === "string" && v.trim() !== "")
        .slice(0, MAX_PROBEN);
      if (!proben.length) return;
      const anteil = proben.filter((v) => muster.test(v)).length / proben.length;
      if (anteil >= PROBEN_SCHWELLE && (!beste || anteil > beste.anteil)) {
        beste = { index: i, header: typeof s.header === "string" ? s.header : "", anteil };
      }
    });

    if (beste) {
      vergebeneSpalten.add(beste.index);
      vergebeneFelder.add(feld.field_key);
      zuordnung[beste.header] = feld.field_key;
      treffer.push({
        header:    beste.header,
        field_key: feld.field_key,
        via:       "inhalt",
        anteil:    Math.round(beste.anteil * 100)
      });
    }
  }

  const offen = eingaben
    .map((s, i) => ({ header: typeof s?.header === "string" ? s.header : "", index: i }))
    .filter((s) => !vergebeneSpalten.has(s.index) && s.header !== "")
    .map((s) => s.header);

  /*
   * Wo eine zweite Spalte dasselbe Feld beansprucht hat, wird das benannt statt
   * verschwiegen. Stehen "Name" und "Nachname" in einer Datei, soll der Nutzer
   * sehen, warum "Name" leer bleibt — sonst wirkt es wie ein Fehler.
   */
  const mehrdeutig = abgelehnt
    .filter((b) => zuordnung[b.header] === undefined)
    .map((b) => ({ header: b.header, field_key: b.field_key, alias_label: b.alias_label }));

  return { zuordnung, treffer, offen, mehrdeutig };
}

/** Die Pflichtfelder, die nach der Zuordnung noch fehlen. */
export function fehlendePflichtfelder(katalog, zuordnung) {
  const belegt = new Set(Object.values(zuordnung || {}));
  return (katalog?.felder || [])
    .filter((f) => f.is_required && !belegt.has(f.field_key))
    .map((f) => f.field_key);
}

/**
 * Merkt sich eine Schreibweise fuer genau diese Organisation.
 *
 * Das ist der Kern des Versprechens "neue Synonyme sind ein INSERT, kein
 * Deploy": ordnet ein Kunde eine unbekannte Spalte einmal von Hand zu, kennt
 * der Import sie beim naechsten Mal — ohne dass jemand etwas ausrollen muss.
 *
 * Bewusst org-gebunden: die Schreibweise eines Kunden ist seine Sache und darf
 * nicht ungeprueft die Zuordnung aller anderen veraendern.
 */
export async function merkeAlias(pool, { orgId, fieldKey, header, createdBy = null, language = "de" }) {
  const aliasKey = normalisiereSchluessel(header);
  if (!orgId) throw new Error("merkeAlias: orgId fehlt");
  if (!aliasKey) return { gespeichert: false, grund: "LEERER_SCHLUESSEL" };

  const feld = await pool.query(
    `SELECT 1 FROM csv_import_fields WHERE field_key = $1 AND is_active = TRUE`,
    [fieldKey]
  );
  if (!feld.rows.length) return { gespeichert: false, grund: "UNBEKANNTES_FELD" };

  const { rows } = await pool.query(
    `INSERT INTO csv_import_field_aliases
       (field_key, alias_key, alias_label, language, priority, org_id, created_by)
     VALUES ($1, $2, $3, $4, 100, $5, $6)
     ON CONFLICT (org_id, field_key, alias_key) DO UPDATE
       SET is_active = TRUE, alias_label = EXCLUDED.alias_label
     RETURNING id, alias_key, alias_label`,
    [fieldKey, aliasKey, String(header).trim().slice(0, 200), language, orgId, createdBy]
  );

  _cache.delete(orgId);
  return { gespeichert: true, alias: rows[0] };
}
