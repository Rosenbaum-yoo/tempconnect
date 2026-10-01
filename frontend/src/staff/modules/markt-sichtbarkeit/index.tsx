import { useState } from "react";
import { useSccQuery } from "@scc/hooks/useSccQuery";
import { sccApi } from "@scc/api/client";
import { useConfirm } from "@scc/state/ConfirmContext";
import { useToast } from "@scc/state/ToastContext";

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

/* ── Die Kuratier-Anzeige (M4b.2, nachgeholt) ─────────────────────────────
   Der Endpunkt liefert diese beiden Felder seit N8.1b-6/-7 mit. Gemessen am
   2026-10-01: im GANZEN Frontend kein einziger Treffer auf ihre Namen — der Typ
   unten kannte sie nicht, also war ihr Inhalt unerreichbar. Eine Zahl, die der
   Server berechnet und niemand sieht, ist derselbe Verlust wie die
   Sichtbarkeits-Zahl, die diese Seite ueberhaupt erst hierher gebracht hat
   (M0-Bericht, Punkt 29) — nur eine Schicht weiter oben.

   WARUM BEIDES AUF DIESER SEITE UND NICHT AUF EIGENEN: es ist DIESELBE Frage,
   und der Server sagt das im Kommentar der Route ausdruecklich. Die
   katalogfremden Rollen sagen, was FALSCH drin steht; die Vorschlaege sagen,
   was noch FEHLT. Wer beides zusammen sieht, erkennt, dass der haeufigste Fall
   eine ZUORDNUNG ist — und genau das ist der Hebel, der die unauffindbaren
   Kraefte oben sichtbar macht. Drei Seiten daraus zu machen heisst, den
   Zusammenhang zu verstecken, den man gerade gemessen hat. */

type Zuordnungsziel = { id: string; name: string };

type Vorschlag = {
  id: string;
  name: string;
  kategorie: string | null;
  seit: string | null;
  /** Wie viele Kraefte diese Faehigkeit schon tragen — beim Zuordnen werden
      genau sie umgehaengt. Darum steht die Zahl in der Wirkungsvorschau. */
  traeger: number;
  vorgeschlagen_von_org: string | null;
  zuordnungsvorschlag: Zuordnungsziel[];
};

type KatalogfremdeRolle = {
  rolle: string;
  eintraege: number;
  seiten: string[];
};

interface SichtbarkeitData {
  verfuegbar: boolean;
  gesamt: { aktive: number; ohne_skill: number; ohne_ort: number; unsichtbar: number };
  je_agentur: Agentur[];
  hinweis: string;
  faehigkeits_vorschlaege?: {
    verfuegbar: boolean;
    anzahl: number;
    vorschlaege: Vorschlag[];
  };
  katalogfremde_rollen?: {
    verfuegbar: boolean;
    anzahl: number;
    eintraege: number;
    rollen: KatalogfremdeRolle[];
    hinweis?: string;
  };
}

/* Die Fehlerkennungen des Dienstes in Saetze. Ohne das zeigt der globale Dialog
   seinen rohen Code inline an (ConfirmContext faengt den Wurf und schreibt
   `e.message`) — "ZIEL_IST_VORSCHLAG" ist fuer den Lesenden keine Auskunft. */
const FEHLERTEXT: Record<string, string> = {
  VORSCHLAG_FEHLT: "Der Vorschlag wurde nicht mitgeschickt. Seite neu laden.",
  UNBEKANNTE_ENTSCHEIDUNG: "Diese Entscheidung kennt der Katalog nicht.",
  BEGRUENDUNG_FEHLT: "Die Begründung braucht mindestens 10 Zeichen — sie steht später im Prüfpfad.",
  ZIEL_FEHLT: "Zum Zuordnen fehlt der Katalogeintrag, auf den zugeordnet werden soll.",
  ZIEL_UNGUELTIG: "Dieser Katalogeintrag existiert nicht oder ist nicht aktiv.",
  ZIEL_IST_VORSCHLAG: "Das Ziel ist selbst noch ein Vorschlag. Erst den entscheiden, dann zuordnen.",
  NICHT_GEFUNDEN: "Dieser Vorschlag existiert nicht mehr.",
  SCHON_ENTSCHIEDEN: "Jemand hat diesen Vorschlag gerade entschieden. Seite neu laden."
};

function fehlerSatz(e: unknown): string {
  const code = (e as { code?: string })?.code;
  if (code && FEHLERTEXT[code]) return FEHLERTEXT[code];
  return (e as { message?: string })?.message || "Die Entscheidung konnte nicht gespeichert werden.";
}

/** Tag ohne Uhrzeit, in deutscher Schreibweise. Kein roher ISO-Schnitt. */
function tag(wert: string | null): string {
  if (!wert) return "—";
  const d = new Date(wert);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
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

      <Vorschlaege daten={data.faehigkeits_vorschlaege} nachladen={reload} />
      <KatalogfremdeRollen daten={data.katalogfremde_rollen} />
    </div>
  );
}

/* ── Offene Fähigkeits-Vorschläge ────────────────────────────────────────── */

function Vorschlaege({
  daten,
  nachladen
}: {
  daten: SichtbarkeitData["faehigkeits_vorschlaege"];
  nachladen: () => void;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  /* Pro Zeile sperren, nicht global: zwei Vorschläge nacheinander zu entscheiden
     ist der Normalfall, und ein Knopf, der währenddessen überall tot ist, liest
     sich wie ein Fehler. */
  const [laeuft, setLaeuft] = useState<string | null>(null);

  /* Nicht lesbar ist ein Befund, keine Entwarnung — genau wie oben. Fehlt das
     Feld ganz (ältere Antwort), wird das gesagt und nicht als "keine
     Vorschläge" ausgegeben: die beiden sehen sonst gleich aus. */
  if (!daten) {
    return (
      <section style={{ marginTop: 28 }}>
        <div className="scc-section__header">
          <h2 className="scc-section__title">Offene Fähigkeits-Vorschläge</h2>
        </div>
        <div className="scc-error-inline">
          Die Antwort enthält das Feld <span className="scc-code">faehigkeits_vorschlaege</span> nicht.
          Solange es fehlt, ist unbekannt, wie viele Vorschläge auf eine Entscheidung warten.
        </div>
      </section>
    );
  }
  if (daten.verfuegbar === false) {
    return (
      <section style={{ marginTop: 28 }}>
        <div className="scc-section__header">
          <h2 className="scc-section__title">Offene Fähigkeits-Vorschläge</h2>
        </div>
        <div className="scc-error-inline">
          Die Vorschläge konnten nicht gelesen werden. Das ist ein Befund, keine Entwarnung.
        </div>
      </section>
    );
  }

  async function entscheide(
    v: Vorschlag,
    entscheidung: "zuordnen" | "annehmen" | "ablehnen",
    ziel?: Zuordnungsziel
  ) {
    /*
     * WIRKUNGSVORSCHAU IM HINWEIS, nicht erst in der Rückmeldung. Beim Zuordnen
     * hängen die Träger dieser Fähigkeit auf das Ziel um — das ist eine
     * Datenänderung an fremden Profilen, und sie steht vor der Bestätigung da.
     * Hausregel: eine Handlung nennt ihre Folge, bevor sie sie hat.
     */
    const hinweis =
      entscheidung === "zuordnen"
        ? `„${v.name}" wird zum Alias von „${ziel?.name}". ` +
          (v.traeger > 0
            ? `${v.traeger} ${v.traeger === 1 ? "Zuordnung" : "Zuordnungen"} ` +
              `${v.traeger === 1 ? "wird" : "werden"} auf den Katalogeintrag umgehängt.`
            : "Es hängen noch keine Kräfte daran.")
        : entscheidung === "annehmen"
          ? `„${v.name}" wird ein eigener Katalogeintrag und ab dann plattformweit wählbar. ` +
            "Der Katalog soll präziser werden, nicht größer — prüfe zuerst, ob ein " +
            "vorhandener Eintrag gemeint ist."
          : `„${v.name}" wird abgelehnt. ` +
            (v.traeger > 0
              ? `${v.traeger} ${v.traeger === 1 ? "Kraft trägt" : "Kräfte tragen"} ` +
                "diese Angabe bereits — sie bleibt dann ohne Katalogbezug und damit " +
                "am Markt unauffindbar."
              : "Es hängen keine Kräfte daran.");

    const titel =
      entscheidung === "zuordnen" ? `„${v.name}" zuordnen`
        : entscheidung === "annehmen" ? `„${v.name}" in den Katalog aufnehmen`
          : `„${v.name}" ablehnen`;

    confirm({
      title: titel,
      hint: hinweis,
      dangerLabel: entscheidung === "ablehnen" ? "Ablehnen" : undefined,
      onConfirm: async (reason: string) => {
        setLaeuft(v.id);
        try {
          await sccApi.post(
            `/faehigkeits-vorschlaege/${encodeURIComponent(v.id)}/entscheiden`,
            {
              confirmed: true,
              reason,
              entscheidung,
              ...(ziel ? { ziel_skill_id: ziel.id } : {})
            }
          );
          toast.success(
            entscheidung === "zuordnen"
              ? `„${v.name}" ist jetzt Alias von „${ziel?.name}".`
              : entscheidung === "annehmen"
                ? `„${v.name}" steht im Katalog.`
                : `„${v.name}" ist abgelehnt.`
          );
          nachladen();
        } catch (e) {
          /* Weiterwerfen mit LESBAREM Satz: der globale Dialog bleibt dann offen
             und zeigt ihn inline — der Mensch kann korrigieren, statt neu
             anzufangen. Ein Toast hier würde den Dialog schließen und die
             eingegebene Begründung wegwerfen. */
          throw new Error(fehlerSatz(e));
        } finally {
          setLaeuft(null);
        }
      }
    });
  }

  return (
    <section style={{ marginTop: 28 }}>
      <div className="scc-section__header">
        <h2 className="scc-section__title">
          Offene Fähigkeits-Vorschläge{daten.anzahl > 0 ? ` (${daten.anzahl})` : ""}
        </h2>
        <div className="scc-section__sub">
          Was eine Zeitarbeitsfirma eingetragen hat und der Katalog noch nicht kennt.
          Der häufigste Fall ist eine Schreibvariante — dann <strong>zuordnen</strong>,
          nicht aufnehmen.
        </div>
      </div>

      {daten.vorschlaege.length === 0 ? (
        <div className="scc-empty-state">
          <div className="scc-empty-state__icon">○</div>
          <div className="scc-empty-state__text">Derzeit keine offenen Vorschläge.</div>
          <div className="scc-empty-state__hint">
            Nichts zu entscheiden. Neue Vorschläge entstehen, wenn jemand eine Fähigkeit
            einträgt, die im Katalog fehlt.
          </div>
        </div>
      ) : (
        <table className="scc-table">
          <thead>
            <tr>
              <th>Vorschlag</th>
              <th>Kategorie</th>
              <th>Träger</th>
              <th>Seit</th>
              <th>Von</th>
              <th>Entscheidung</th>
            </tr>
          </thead>
          <tbody>
            {daten.vorschlaege.map((v) => {
              const busy = laeuft === v.id;
              return (
                <tr key={v.id}>
                  <td><strong>{v.name}</strong></td>
                  <td>{v.kategorie || <span className="scc-muted">—</span>}</td>
                  <td>
                    {v.traeger > 0 ? (
                      <span className="scc-status scc-status--warn">{v.traeger}</span>
                    ) : (
                      <span className="scc-muted">0</span>
                    )}
                  </td>
                  <td>{tag(v.seit)}</td>
                  <td>{v.vorgeschlagen_von_org || <span className="scc-muted">—</span>}</td>
                  {/* DER HEBEL STEHT AN DER ZEILE, nicht in einer Leiste darüber:
                      wer entscheidet, sieht Name, Trägerzahl und Vorschlag in
                      derselben Augenhöhe. Eine Sammelaktion über Vorschläge
                      verschiedener Gewerke wäre genau die Flüchtigkeit, die den
                      Katalog verwässert. */}
                  <td style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    {v.zuordnungsvorschlag.length > 0 ? (
                      v.zuordnungsvorschlag.map((z) => (
                        <button
                          key={z.id}
                          className="scc-btn scc-btn--primary"
                          disabled={busy}
                          title={`„${v.name}" als Schreibvariante von „${z.name}" führen`}
                          onClick={() => entscheide(v, "zuordnen", z)}
                        >
                          → {z.name}
                        </button>
                      ))
                    ) : (
                      /* Kein toter Knopf: ohne naheliegenden Eintrag ist
                         „zuordnen" serverseitig nicht erfüllbar (ZIEL_FEHLT).
                         Statt ihn anzuzeigen und scheitern zu lassen, steht hier,
                         warum er fehlt. */
                      <span className="scc-muted" style={{ fontSize: 11 }}>
                        kein naheliegender Katalogeintrag
                      </span>
                    )}
                    <button
                      className="scc-btn"
                      disabled={busy}
                      title="Als eigenen Katalogeintrag aufnehmen"
                      onClick={() => entscheide(v, "annehmen")}
                    >
                      {busy ? "…" : "Aufnehmen"}
                    </button>
                    <button
                      className="scc-btn scc-btn--danger"
                      disabled={busy}
                      onClick={() => entscheide(v, "ablehnen")}
                    >
                      Ablehnen
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

/* ── Katalogfremde Rollen ────────────────────────────────────────────────── */

function KatalogfremdeRollen({ daten }: { daten: SichtbarkeitData["katalogfremde_rollen"] }) {
  /*
   * DIE BEZEICHNUNGEN SELBST, nicht ihre Anzahl. Eine Zahl „17 katalogfremde
   * Rollen" ist nicht bearbeitbar: wer sie aufräumen soll, muss lesen, WELCHE
   * Schreibweise danebenliegt — „Lagerhelfer" neben „Lagerhelfer:in" erkennt man
   * nur im Wortlaut. Darum die Liste, mit der Zahl als Kopf.
   */
  if (!daten || daten.verfuegbar === false) {
    return (
      <section style={{ marginTop: 28 }}>
        <div className="scc-section__header">
          <h2 className="scc-section__title">Katalogfremde Rollen</h2>
        </div>
        <div className="scc-error-inline">
          {daten
            ? "Die katalogfremden Rollen konnten nicht gelesen werden. Das ist ein Befund, keine Entwarnung."
            : "Die Antwort enthält das Feld katalogfremde_rollen nicht."}
        </div>
      </section>
    );
  }

  return (
    <section style={{ marginTop: 28 }}>
      <div className="scc-section__header">
        <h2 className="scc-section__title">
          Katalogfremde Rollen{daten.anzahl > 0 ? ` (${daten.anzahl})` : ""}
        </h2>
        <div className="scc-section__sub">
          Bezeichnungen in Angeboten und Bedarfen, die der Katalog nicht kennt —
          {" "}zusammen {daten.eintraege} {daten.eintraege === 1 ? "Eintrag" : "Einträge"}.
        </div>
      </div>

      {daten.rollen.length === 0 ? (
        <div className="scc-empty-state">
          <div className="scc-empty-state__icon">○</div>
          <div className="scc-empty-state__text">Jede verwendete Rolle steht im Katalog.</div>
          <div className="scc-empty-state__hint">Nichts nachzutragen.</div>
        </div>
      ) : (
        <table className="scc-table">
          <thead>
            <tr>
              <th>Bezeichnung</th>
              <th>Einträge</th>
              <th>Seite</th>
            </tr>
          </thead>
          <tbody>
            {daten.rollen.map((r) => (
              <tr key={r.rolle}>
                <td><strong>{r.rolle}</strong></td>
                <td>{r.eintraege}</td>
                <td style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {r.seiten.length === 0 ? (
                    <span className="scc-muted">—</span>
                  ) : (
                    r.seiten.map((s) => (
                      <span
                        key={s}
                        className={`scc-pill${s === "angebot" ? "" : " scc-pill--warn"}`}
                      >
                        {s === "angebot" ? "Angebot" : s === "bedarf" ? "Bedarf" : s}
                      </span>
                    ))
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Auch dieser Vorbehalt kommt vom Server und bleibt stehen: er sagt, dass
          hier NICHT gelöscht wird — an diesen Bezeichnungen hängen Angebote und
          Bedarfe. Ohne den Satz liest die Liste sich wie eine Aufräum-Erlaubnis. */}
      {daten.hinweis ? (
        <p className="scc-muted" style={{ fontSize: 12, marginTop: 14, maxWidth: "70ch", lineHeight: 1.7 }}>
          {daten.hinweis}
        </p>
      ) : null}
    </section>
  );
}
