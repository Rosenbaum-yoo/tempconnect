import { useSccQuery } from "@scc/hooks/useSccQuery";

/* ── Markt-Sichtbarkeit ───────────────────────────────────────────────────
   Wessen Kraefte sind am Markt unauffindbar — und warum.

   Die Zahl gab es schon: `sweepMarktpraesenz` misst bei jedem Lauf mit, wie
   viele aktive Kraefte gar nicht materialisiert werden koennen. Sie ging in
   den Antwortkoerper eines internen Endpunkts und in eine Log-Zeile, danach
   war sie weg (M0-Bericht, Punkt 29). Gemessen am 2026-09-02: 30 von 33.

   Warum diese Sicht wertvoll ist, obwohl sie nichts ueber den Arbeitsmarkt
   sagt: sie nennt einen PFLEGEZUSTAND, den die Kundin selbst beheben kann —
   und der Hebel ist der groesste im ganzen Marktplatz. Werden die 30 sichtbar,
   verzehnfacht sich die Angebotsseite, bevor eine einzige Anzeige geschaltet
   wird.

   Was sie ausdruecklich NICHT behauptet: dass der Rest sichtbar IST. Die
   Materialisierung schliesst zusaetzlich Abwesende aus und verlangt einen
   Agentur-Nutzer. Dieser Vorbehalt kommt als Feld `hinweis` vom Server mit
   und wird hier gezeigt, nicht weggelassen. */

type Agentur = {
  org_id: string | null;
  name: string;
  aktive: number;
  ohne_skill: number;
  ohne_ort: number;
  unsichtbar: number;
};

interface SichtbarkeitData {
  verfuegbar: boolean;
  gesamt: { aktive: number; ohne_skill: number; ohne_ort: number; unsichtbar: number };
  je_agentur: Agentur[];
  hinweis: string;
}

/** Anteil als Prozentzahl, ohne Division durch null. */
function anteil(teil: number, ganz: number): string {
  if (!ganz) return "—";
  return `${Math.round((teil / ganz) * 100)} %`;
}

export default function MarktSichtbarkeit() {
  const { data, loading, error, reload } = useSccQuery<SichtbarkeitData>("/markt-sichtbarkeit");

  if (loading) return <div className="scc-loading">Lade Markt-Sichtbarkeit…</div>;
  if (error) {
    return (
      <div className="scc-error-inline">
        Fehler: {error}
        <button className="scc-btn" onClick={reload} style={{ marginLeft: 8 }}>Retry</button>
      </div>
    );
  }

  /* Nicht lesbar ist ein Befund, keine Entwarnung — ein leeres Feld waere von
     "alles sichtbar" nicht zu unterscheiden. */
  if (!data || data.verfuegbar === false) {
    return (
      <div>
        <div className="scc-section__header">
          <h1 className="scc-section__title">Markt-Sichtbarkeit</h1>
        </div>
        <div className="scc-error-inline">
          Der Bestand konnte nicht gelesen werden. Das ist ein Befund, keine Entwarnung —
          solange er fehlt, ist unbekannt, wie viele Kräfte am Markt unauffindbar sind.
        </div>
      </div>
    );
  }

  const g = data.gesamt;
  const betroffen = data.je_agentur.filter((a) => a.unsichtbar > 0);

  return (
    <div>
      <div className="scc-section__header">
        <h1 className="scc-section__title">Markt-Sichtbarkeit</h1>
        <div className="scc-section__sub">
          Wessen Kräfte am Markt unauffindbar sind — und woran es liegt.
        </div>
      </div>

      <div className="scc-grid" style={{ marginBottom: 16 }}>
        <div className="scc-card">
          <div className="scc-card__eyebrow">Aktive Kräfte</div>
          <div className="scc-card__value">{g.aktive}</div>
        </div>
        <div className={`scc-card${g.unsichtbar > 0 ? " scc-card--danger" : " scc-card--ok"}`}>
          <div className="scc-card__eyebrow">Am Markt unauffindbar</div>
          <div className="scc-card__value">{g.unsichtbar}</div>
          <div className="scc-card__hint">{anteil(g.unsichtbar, g.aktive)} des Bestands</div>
        </div>
        <div className={`scc-card${g.ohne_skill > 0 ? " scc-card--warn" : ""}`}>
          <div className="scc-card__eyebrow">Ohne Katalog-Fähigkeit</div>
          <div className="scc-card__value">{g.ohne_skill}</div>
          <div className="scc-card__hint">können gar nicht erst eingestellt werden</div>
        </div>
        <div className={`scc-card${g.ohne_ort > 0 ? " scc-card--warn" : ""}`}>
          <div className="scc-card__eyebrow">Ohne gepflegten Ort</div>
          <div className="scc-card__value">{g.ohne_ort}</div>
          <div className="scc-card__hint">Fähigkeit vorhanden, Ort fehlt</div>
        </div>
      </div>

      {betroffen.length === 0 ? (
        <div className="scc-empty-state">
          <div className="scc-empty-state__icon">○</div>
          <div className="scc-empty-state__text">
            Keine Agentur hat unauffindbare Kräfte. Nichts anzurufen.
          </div>
        </div>
      ) : (
        <table className="scc-table">
          <thead>
            <tr>
              <th>Agentur</th>
              <th>Aktive</th>
              <th>Unauffindbar</th>
              <th>Anteil</th>
              <th>Ohne Fähigkeit</th>
              <th>Ohne Ort</th>
            </tr>
          </thead>
          <tbody>
            {betroffen.map((a) => (
              <tr key={a.org_id || a.name}>
                <td>
                  <strong>{a.name}</strong>
                  {a.org_id ? (
                    <div className="scc-muted" style={{ fontSize: 11 }}>{a.org_id}</div>
                  ) : null}
                </td>
                <td>{a.aktive}</td>
                <td>
                  <span className={`scc-status scc-status--${
                    a.unsichtbar === a.aktive ? "critical" : "warn"}`}>
                    {a.unsichtbar}
                  </span>
                </td>
                <td>{anteil(a.unsichtbar, a.aktive)}</td>
                <td>{a.ohne_skill}</td>
                <td>{a.ohne_ort}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Der Vorbehalt kommt vom Server mit und wird gezeigt, nicht weggelassen:
          eine Zahl, deren Grenzen der Leser nicht kennt, ist keine offene Zahl. */}
      <p className="scc-muted" style={{ fontSize: 12, marginTop: 14, maxWidth: "70ch", lineHeight: 1.7 }}>
        {data.hinweis}
      </p>
    </div>
  );
}
