/**
 * Produkt-Updates ("Was ist neu") — Mitteilungen an die ganze Plattform (W-E10, 2026-10-01).
 *
 * Aus dem Admin Panel hierher umgezogen. Dort konnte bis zum Fix 9c4af72 jeder
 * Kunden-Admin Mitteilungen an alle Nutzer anlegen und mailen. Hier ist die Bauart
 * gestuft, damit nichts versehentlich bei allen erscheint:
 *   - Speichern legt immer einen ENTWURF an (Step-up, kein Grund)
 *   - Veroeffentlichen und Mailen sind eigene Schritte, mit Wirkung im Dialog,
 *     Step-up HOCH und Begruendung
 *   - eine veroeffentlichte Mitteilung aendert sich nur mit Begruendung
 *   - gemailt wird hoechstens einmal; ohne Versandweg steht es VOR dem Klick da
 *   - gemailt wird in Paketen (Owner-Entscheid 2026-10-01): 20 je Minute, das erste
 *     sofort. Die Liste zeigt den Stand ("312 von 1.240"), aktualisiert sich selbst,
 *     solange ein Versand laeuft, und bietet "Anhalten" — wer nach dem dritten
 *     Paket einen Fehler im Text bemerkt, stoppt den Rest. Stockt der Versand
 *     (kein Takt, etwa ohne Redis), gibt es "Naechstes Paket" von Hand.
 *
 * Endpunkte: GET/POST /produkt-updates · PATCH /produkt-updates/:id
 *            POST /produkt-updates/:id/veroeffentlichen | /mailen | /paket | /versand-anhalten | /loeschen
 */
import { useState, useEffect, useCallback, type ChangeEvent } from "react";
import { sccApi } from "@scc/api/client";
import { useConfirm } from "@scc/state/ConfirmContext";
import { useStepUp } from "@scc/state/StepUpContext";
import { useToast } from "@scc/state/ToastContext";
import { PageHeader } from "@scc/components/ui/PageHeader";
import { EmptyState } from "@scc/components/ui/EmptyState";
import { ErrorBanner } from "@scc/components/ui/ErrorBanner";

interface Mitteilung {
  id: string; title: string; summary: string | null; body: string | null;
  audiences: string[]; min_plan: string | null; visibility: "public" | "internal";
  status: "draft" | "published"; published_at: string | null;
  show_in_app: boolean; send_email_on_publish: boolean; email_sent_at: string | null;
  show_as_modal: boolean; created_at: string; updated_at: string;
}
/** Der Stand eines Versands, wie der Server ihn bewertet (`bewerteStand`). */
interface Versand {
  alter_versand?: boolean; gestartet_am: string | null;
  gesamt?: number; gesendet?: number; offen?: number; in_arbeit?: number; unklar?: number;
  fehlgeschlagen?: number; entfallen?: number; fertig?: boolean; pausiert?: boolean; stockt?: boolean;
  rest_minuten?: number;
}
type Zeile = Mitteilung & { versand: Versand | null };
interface Liste { items: Zeile[]; paket_groesse: number; mail_versand_bereit: boolean }
interface Vorschau {
  verfuegbar: boolean; zielgruppe?: number; abgemeldet?: number; wuerden_gesendet?: number;
  paket_groesse?: number; pakete?: number; dauer_minuten?: number;
}
interface Start {
  gestartet: boolean; eingereiht: number; abgemeldet?: number; hinweis?: string; fehler?: string;
  erstes_paket?: { gesendet: number; kein_versandweg?: boolean } | null;
}

const zahl = (n: number | undefined) => new Intl.NumberFormat("de-DE").format(n ?? 0);

/** Die Zahl vor dem Klick (Owner-Entscheid 2026-10-01) — dieselbe Ermittlung wie der Versand. */
async function empfaengerSatz(id: string): Promise<string> {
  try {
    const v = await sccApi.get<Vorschau>(`/produkt-updates/${id}/empfaenger`);
    if (!v?.verfuegbar) return "";
    const n = v.wuerden_gesendet ?? 0;
    let satz = ` Die E-Mail geht an ${zahl(n)} ${n === 1 ? "Person" : "Personen"}`;
    if (v.abgemeldet) satz += ` (${zahl(v.abgemeldet)} ${v.abgemeldet === 1 ? "hat" : "haben"} Produkt-Mails abbestellt)`;
    satz += ".";
    if ((v.pakete ?? 0) > 1) {
      satz += ` Sie geht in ${zahl(v.pakete)} Paketen zu ${v.paket_groesse} raus — das erste sofort, fertig in etwa ${zahl(v.dauer_minuten)} Minuten. Anhalten geht jederzeit.`;
    } else if (n > 0) {
      satz += " Sie geht sofort raus.";
    }
    return satz + " Jede Mail enthält einen Abmeldelink.";
  } catch {
    return " Die Empfängerzahl ließ sich gerade nicht ermitteln.";
  }
}

/** Die Rueckmeldung nach dem Start — ehrlich: eingereiht ist nicht zugestellt. */
function startSatz(r: Start | null | undefined): string {
  if (!r) return "";
  if (r.hinweis) return r.hinweis;
  if (r.fehler) return "Der E-Mail-Versand ließ sich nicht starten.";
  if (!r.gestartet) return "Es wurde nichts gesendet.";
  const sofort = r.erstes_paket?.gesendet ?? 0;
  if (r.erstes_paket?.kein_versandweg) return `${zahl(r.eingereiht)} Empfänger eingereiht — aber es ist kein Versandweg eingerichtet, nichts ist raus.`;
  return sofort >= r.eingereiht
    ? `${zahl(sofort)} E-Mails gesendet.`
    : `${zahl(r.eingereiht)} Empfänger eingereiht, ${zahl(sofort)} sofort gesendet — der Rest folgt in Paketen.`;
}

/** Der Versand in einer Zeile der Liste. */
function versandText(m: Zeile): string {
  const v = m.versand;
  if (!v) return m.send_email_on_publish ? "beim Veröffentlichen" : "–";
  if (v.alter_versand) return `gesendet ${datum(v.gestartet_am)}`;
  const kern = `${zahl(v.gesendet)} von ${zahl(v.gesamt)} gesendet`;
  const rest: string[] = [];
  if (v.fehlgeschlagen) rest.push(`${zahl(v.fehlgeschlagen)} fehlgeschlagen`);
  if (v.entfallen) rest.push(`${zahl(v.entfallen)} entfallen`);
  if (v.unklar) rest.push(`${zahl(v.unklar)} unklar`);
  const zusatz = rest.length ? ` (${rest.join(", ")})` : "";
  if (v.fertig) return `fertig: ${kern}${zusatz}`;
  if (v.pausiert) return `${kern} — ruht, solange die Mitteilung zurückgezogen ist${zusatz}`;
  if (v.stockt) return `${kern} — stockt: kein Takt seit einigen Minuten${zusatz}`;
  return `${kern} — noch etwa ${zahl(v.rest_minuten)} Min.${zusatz}`;
}

/** Laeuft ein Versand, der sich noch bewegen kann? Dann aktualisiert sich die Liste selbst. */
const laeuft = (m: Zeile) => Boolean(m.versand && !m.versand.alter_versand && !m.versand.fertig);

const ZIELGRUPPEN: [string, string][] = [
  ["company", "Unternehmen"],
  ["agency", "Zeitarbeitsfirmen"],
  ["worker", "Arbeitskräfte"],
  ["supplier_user", "Lieferanten (extern)"],
];
const PLAENE = ["BASIS", "PLUS", "PRO", "INDIVIDUELL"];

interface Entwurf {
  title: string; summary: string; body: string; audiences: string[]; min_plan: string;
  visibility: "public" | "internal"; show_in_app: boolean; show_as_modal: boolean; send_email_on_publish: boolean;
}
const LEER: Entwurf = {
  title: "", summary: "", body: "", audiences: [], min_plan: "", visibility: "public",
  show_in_app: true, show_as_modal: false, send_email_on_publish: false,
};

function datum(iso: string | null): string {
  if (!iso) return "–";
  return new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" })
    .format(new Date(iso));
}

/** Wer die Mitteilung sieht — in einem Satz, fuer Liste und Dialog. */
function empfaenger(m: { audiences: string[]; min_plan: string | null; visibility: string }): string {
  if (m.visibility === "internal") return "nur TempConnect intern";
  const wer = m.audiences.length
    ? m.audiences.map((a) => ZIELGRUPPEN.find((z) => z[0] === a)?.[1] ?? a).join(", ")
    : "alle Nutzer";
  return m.min_plan ? `${wer}, ab Tarif ${m.min_plan}` : wer;
}

export default function ProduktUpdates() {
  const confirm = useConfirm();
  const stepUp = useStepUp();
  const toast = useToast();

  const [liste, setListe] = useState<Liste | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [offen, setOffen] = useState<string | "neu" | null>(null);
  const [entwurf, setEntwurf] = useState<Entwurf>(LEER);
  const [speichert, setSpeichert] = useState(false);

  const load = useCallback(async () => {
    setLaedt(true);
    setFehler(null);
    try {
      setListe(await sccApi.get<Liste>("/produkt-updates"));
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Die Produkt-Updates konnten nicht geladen werden.");
    } finally {
      setLaedt(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  /* Live-Stand: solange ein Versand laeuft, alle 15 Sekunden neu laden — ein Paket
   * geht je Minute, schneller zu fragen bringt nichts. Steht nichts mehr aus, ruht es. */
  const aktiv = Boolean(liste?.items.some(laeuft));
  useEffect(() => {
    if (!aktiv) return undefined;
    const t = window.setInterval(() => { void load(); }, 15000);
    return () => window.clearInterval(t);
  }, [aktiv, load]);

  function oeffne(m: Mitteilung | null) {
    setOffen(m ? m.id : "neu");
    setEntwurf(m ? {
      title: m.title, summary: m.summary ?? "", body: m.body ?? "", audiences: m.audiences ?? [],
      min_plan: m.min_plan ?? "", visibility: m.visibility, show_in_app: m.show_in_app,
      show_as_modal: m.show_as_modal, send_email_on_publish: m.send_email_on_publish,
    } : LEER);
  }

  function rumpf() {
    return {
      title: entwurf.title.trim(), summary: entwurf.summary || null, body: entwurf.body || null,
      audiences: entwurf.audiences, min_plan: entwurf.min_plan || null, visibility: entwurf.visibility,
      show_in_app: entwurf.show_in_app, show_as_modal: entwurf.show_as_modal,
      send_email_on_publish: entwurf.send_email_on_publish,
    };
  }

  async function speichere() {
    if (!entwurf.title.trim()) { toast.error("Ein Titel fehlt."); return; }
    const bestehend = liste?.items.find((m) => m.id === offen) ?? null;
    if (bestehend?.status === "published") {
      confirm({
        title: `Veröffentlichte Mitteilung ändern: ${bestehend.title}`,
        hint: `Die Änderung sehen sofort: ${empfaenger(bestehend)}.`,
        onConfirm: async (reason: string) => {
          await stepUp();
          await sccApi.patch(`/produkt-updates/${bestehend.id}`, { ...rumpf(), confirmed: true, reason });
          toast.success("Geändert.");
          setOffen(null);
          await load();
        },
      });
      return;
    }
    setSpeichert(true);
    try {
      await stepUp();
      if (bestehend) await sccApi.patch(`/produkt-updates/${bestehend.id}`, rumpf());
      else await sccApi.post("/produkt-updates", rumpf());
      toast.success("Als Entwurf gespeichert — noch für niemanden sichtbar.");
      setOffen(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Speichern hat nicht geklappt.");
    } finally {
      setSpeichert(false);
    }
  }

  async function veroeffentliche(m: Mitteilung) {
    const mail = m.send_email_on_publish && m.visibility === "public";
    const satz = mail && liste?.mail_versand_bereit ? await empfaengerSatz(m.id) : "";
    confirm({
      title: `Veröffentlichen: ${m.title}`,
      hint:
        `Erscheint ab sofort bei: ${empfaenger(m)}.` +
        (m.show_as_modal ? " Als Hinweisfenster beim nächsten Öffnen." : "") +
        (mail
          ? (liste?.mail_versand_bereit
            ? ` Danach geht einmalig eine E-Mail raus.${satz}`
            : " Eine E-Mail ist vorgesehen, aber es ist kein Versandweg verbunden — es wird nichts gesendet.")
          : ""),
      onConfirm: async (reason: string) => {
        await stepUp();
        const r = await sccApi.post<{ mail: Start | null }>(
          `/produkt-updates/${m.id}/veroeffentlichen`, { confirmed: true, reason });
        toast.success(r?.mail ? `Veröffentlicht — ${startSatz(r.mail)}` : "Veröffentlicht.");
        await load();
      },
    });
  }

  async function maile(m: Mitteilung) {
    const satz = liste?.mail_versand_bereit ? await empfaengerSatz(m.id) : "";
    confirm({
      title: `Per E-Mail senden: ${m.title}`,
      hint: liste?.mail_versand_bereit
        ? `Zielgruppe: ${empfaenger(m)}.${satz} Nur einmal — ein zweiter Versand ist danach gesperrt.`
        : "Es ist kein Versandweg verbunden — es würde nichts gesendet.",
      dangerLabel: "E-Mails senden",
      onConfirm: async (reason: string) => {
        await stepUp();
        const r = await sccApi.post<Start>(`/produkt-updates/${m.id}/mailen`, { confirmed: true, reason });
        toast.success(startSatz(r));
        await load();
      },
    });
  }

  /** Die Handkurbel — fuer einen Versand, der stockt (kein Takt, etwa ohne Redis). */
  async function naechstesPaket(m: Zeile) {
    try {
      await stepUp();
      const r = await sccApi.post<{ paket: { gesendet: number; erneut: number; entfallen: number; kein_versandweg: boolean } }>(
        `/produkt-updates/${m.id}/paket`, {});
      toast.success(r.paket.kein_versandweg
        ? "Kein Versandweg eingerichtet — nichts ist raus."
        : `${zahl(r.paket.gesendet)} E-Mails gesendet${r.paket.erneut ? `, ${zahl(r.paket.erneut)} folgen im nächsten Paket erneut` : ""}.`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Das Paket ließ sich nicht senden.");
    }
  }

  function halteAn(m: Zeile) {
    confirm({
      title: `Versand anhalten: ${m.title}`,
      hint: `Gesendet sind ${zahl(m.versand?.gesendet)} von ${zahl(m.versand?.gesamt)}. Die übrigen ${zahl(m.versand?.offen)} bekommen diese Mail nicht mehr — das lässt sich nicht fortsetzen.`,
      dangerLabel: "Anhalten",
      onConfirm: async (reason: string) => {
        await stepUp();
        const r = await sccApi.post<{ angehalten: number }>(`/produkt-updates/${m.id}/versand-anhalten`, { confirmed: true, reason });
        toast.success(`Angehalten — ${zahl(r.angehalten)} Mails gehen nicht mehr raus.`);
        await load();
      },
    });
  }

  function zurueckziehen(m: Zeile) {
    confirm({
      title: `Zurückziehen: ${m.title}`,
      hint: m.versand && (m.versand.offen ?? 0) > 0
        ? `Die Mitteilung verschwindet bei allen und wird wieder ein Entwurf. Der laufende E-Mail-Versand ruht (${zahl(m.versand.offen)} offen) und geht weiter, wenn sie erneut veröffentlicht wird — mit dem dann gültigen Text. Ganz stoppen: „Anhalten“.`
        : "Die Mitteilung verschwindet bei allen und wird wieder ein Entwurf. Bereits gesendete E-Mails bleiben gesendet.",
      dangerLabel: "Zurückziehen",
      onConfirm: async (reason: string) => {
        await stepUp();
        await sccApi.patch(`/produkt-updates/${m.id}`, { status: "draft", confirmed: true, reason });
        toast.success("Zurückgezogen.");
        await load();
      },
    });
  }

  function loesche(m: Mitteilung) {
    confirm({
      title: `Löschen: ${m.title}`,
      hint: m.status === "published"
        ? `Die Mitteilung ist veröffentlicht und verschwindet bei: ${empfaenger(m)}.`
        : "Der Entwurf wird gelöscht.",
      dangerLabel: "Löschen",
      onConfirm: async (reason: string) => {
        await stepUp();
        await sccApi.post(`/produkt-updates/${m.id}/loeschen`, { confirmed: true, reason });
        toast.success("Gelöscht.");
        await load();
      },
    });
  }

  const feld = {
    padding: "6px 8px", background: "var(--scc-panel)", color: "inherit",
    border: "1px solid var(--scc-line)", borderRadius: 4, fontSize: 12, width: "100%",
  };
  const klein = { fontSize: 11, color: "var(--scc-muted)" } as const;
  const umschalten = (k: keyof Entwurf) => (e: ChangeEvent<HTMLInputElement>) =>
    setEntwurf({ ...entwurf, [k]: e.target.checked });

  return (
    <>
      <PageHeader
        title="Produkt-Updates"
        subtitle="Mitteilungen an die Plattform („Was ist neu“). Speichern legt einen Entwurf an — Veröffentlichen und Mailen sind eigene Schritte."
      />

      {fehler && <ErrorBanner message={fehler} onRetry={() => void load()} />}
      {laedt && !liste && <div className="scc-card">Lade Produkt-Updates…</div>}

      {liste && !liste.mail_versand_bereit && (
        <div className="scc-card" style={{ marginBottom: 14, borderColor: "var(--scc-warn)" }}>
          Kein E-Mail-Versandweg verbunden — Veröffentlichen geht, E-Mails werden nicht gesendet.
        </div>
      )}

      {liste && (
        <>
          <div style={{ marginBottom: 14 }}>
            <button className="scc-btn scc-btn--primary" onClick={() => oeffne(null)}>Neue Mitteilung</button>
          </div>

          {offen && (
            <div className="scc-card" style={{ marginBottom: 14 }}>
              <div className="scc-card__eyebrow">{offen === "neu" ? "Neue Mitteilung (Entwurf)" : "Mitteilung bearbeiten"}</div>
              <div style={{ display: "grid", gap: 10, marginTop: 10, maxWidth: 720 }}>
                <label style={klein}>Titel *<br />
                  <input value={entwurf.title} maxLength={500} style={feld} onChange={(e) => setEntwurf({ ...entwurf, title: e.target.value })} />
                </label>
                <label style={klein}>Kurzfassung (erscheint in der Liste und in der E-Mail)<br />
                  <textarea rows={3} value={entwurf.summary} maxLength={8000} style={feld} onChange={(e) => setEntwurf({ ...entwurf, summary: e.target.value })} />
                </label>
                <label style={klein}>Ausführlicher Text (optional)<br />
                  <textarea rows={5} value={entwurf.body} maxLength={50000} style={feld} onChange={(e) => setEntwurf({ ...entwurf, body: e.target.value })} />
                </label>
                <div style={klein}>Für wen? (keine Auswahl = alle Nutzer)
                  <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 4, color: "var(--scc-text)" }}>
                    {ZIELGRUPPEN.map(([k, name]) => (
                      <label key={k} style={{ fontSize: 12 }}>
                        <input type="checkbox" checked={entwurf.audiences.includes(k)}
                          onChange={(e) => setEntwurf({
                            ...entwurf,
                            audiences: e.target.checked ? [...entwurf.audiences, k] : entwurf.audiences.filter((a) => a !== k),
                          })} /> {name}
                      </label>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  <label style={klein}>Ab Tarif<br />
                    <select value={entwurf.min_plan} style={{ ...feld, width: 180 }} onChange={(e) => setEntwurf({ ...entwurf, min_plan: e.target.value })}>
                      <option value="">jeder Tarif</option>
                      {PLAENE.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </label>
                  <label style={klein}>Sichtbarkeit<br />
                    <select value={entwurf.visibility} style={{ ...feld, width: 200 }}
                      onChange={(e) => setEntwurf({ ...entwurf, visibility: e.target.value as "public" | "internal" })}>
                      <option value="public">öffentlich (Kunden)</option>
                      <option value="internal">nur TempConnect intern</option>
                    </select>
                  </label>
                </div>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12 }}>
                  <label><input type="checkbox" checked={entwurf.show_in_app} onChange={umschalten("show_in_app")} /> in der App zeigen</label>
                  <label><input type="checkbox" checked={entwurf.show_as_modal} onChange={umschalten("show_as_modal")} /> als Hinweisfenster</label>
                  <label><input type="checkbox" checked={entwurf.send_email_on_publish} onChange={umschalten("send_email_on_publish")} /> beim Veröffentlichen mailen</label>
                </div>
                <div style={{ fontSize: 12 }}>Sehen werden es: <b>{empfaenger({ ...entwurf, min_plan: entwurf.min_plan || null })}</b></div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="scc-btn scc-btn--primary" disabled={speichert} onClick={() => void speichere()}>
                    {speichert ? "…" : "Speichern"}
                  </button>
                  <button className="scc-btn" onClick={() => setOffen(null)}>Abbrechen</button>
                </div>
              </div>
            </div>
          )}

          {liste.items.length === 0 ? (
            <EmptyState message="Noch keine Mitteilung. „Neue Mitteilung“ legt einen Entwurf an." />
          ) : (
            <div className="scc-card" style={{ overflowX: "auto" }}>
              <table className="scc-table">
                <thead>
                  <tr>{["Mitteilung", "Für", "Zustand", "E-Mail", ""].map((x) => <th key={x}>{x}</th>)}</tr>
                </thead>
                <tbody>
                  {liste.items.map((m) => (
                    <tr key={m.id}>
                      <td style={{ maxWidth: 360 }}>
                        <div style={{ fontWeight: 600 }}>{m.title}</div>
                        {m.summary && <div style={{ ...klein, marginTop: 2 }}>{m.summary.slice(0, 160)}{m.summary.length > 160 ? "…" : ""}</div>}
                      </td>
                      <td style={{ fontSize: 12 }}>{empfaenger(m)}{m.show_as_modal ? " · Hinweisfenster" : ""}</td>
                      <td>
                        {m.status === "published"
                          ? <span className="scc-pill scc-pill--live">veröffentlicht {datum(m.published_at)}</span>
                          : <span className="scc-pill scc-pill--stub">Entwurf</span>}
                      </td>
                      <td style={{ fontSize: 12, minWidth: 180 }}>
                        <div style={m.versand?.stockt ? { color: "var(--scc-warn)" } : undefined}>{versandText(m)}</div>
                        {m.versand && !m.versand.alter_versand && (m.versand.gesamt ?? 0) > 0 && (
                          <div aria-hidden="true" style={{ marginTop: 4, height: 4, borderRadius: 2, background: "var(--scc-line)", overflow: "hidden" }}>
                            <div style={{
                              height: "100%",
                              width: `${Math.round(100 * (m.versand.gesendet ?? 0) / (m.versand.gesamt || 1))}%`,
                              background: m.versand.fertig ? "var(--scc-ok)" : "var(--scc-accent)",
                            }} />
                          </div>
                        )}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button className="scc-btn" onClick={() => oeffne(m)}>Bearbeiten</button>{" "}
                        {m.status === "draft" && <button className="scc-btn scc-btn--primary" onClick={() => void veroeffentliche(m)}>Veröffentlichen</button>}
                        {m.status === "published" && !m.email_sent_at && m.visibility === "public" && (
                          <><button className="scc-btn" onClick={() => void maile(m)}>Mailen</button>{" "}</>
                        )}
                        {m.versand?.stockt && (
                          <><button className="scc-btn" onClick={() => void naechstesPaket(m)}>Nächstes Paket</button>{" "}</>
                        )}
                        {(m.versand?.offen ?? 0) > 0 && (
                          <><button className="scc-btn" onClick={() => halteAn(m)}>Anhalten</button>{" "}</>
                        )}
                        {m.status === "published" && <><button className="scc-btn" onClick={() => zurueckziehen(m)}>Zurückziehen</button>{" "}</>}
                        <button className="scc-btn" onClick={() => loesche(m)}>Löschen</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
