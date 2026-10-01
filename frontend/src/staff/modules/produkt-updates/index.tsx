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
 *
 * Endpunkte: GET/POST /produkt-updates · PATCH /produkt-updates/:id
 *            POST /produkt-updates/:id/veroeffentlichen | /mailen | /loeschen
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
interface Liste { items: Mitteilung[]; mail_obergrenze: number; mail_versand_bereit: boolean }
interface Vorschau {
  verfuegbar: boolean; zielgruppe?: number; abgemeldet?: number;
  wuerden_gesendet?: number; obergrenze?: number; ueber_obergrenze?: number;
}

/** Die Zahl vor dem Klick (Owner-Entscheid 2026-10-01) — dieselbe Ermittlung wie der Versand. */
async function empfaengerSatz(id: string): Promise<string> {
  try {
    const v = await sccApi.get<Vorschau>(`/produkt-updates/${id}/empfaenger`);
    if (!v?.verfuegbar) return "";
    let satz = ` Die E-Mail geht an ${v.wuerden_gesendet ?? 0} ${v.wuerden_gesendet === 1 ? "Person" : "Personen"}`;
    if (v.abgemeldet) satz += ` (${v.abgemeldet} ${v.abgemeldet === 1 ? "hat" : "haben"} Produkt-Mails abbestellt)`;
    if (v.ueber_obergrenze) satz += `; ${v.ueber_obergrenze} bekämen wegen der Obergrenze von ${v.obergrenze} keine`;
    return satz + ". Jede Mail enthält einen Abmeldelink.";
  } catch {
    return " Die Empfängerzahl ließ sich gerade nicht ermitteln.";
  }
}

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
    const zahl = mail && liste?.mail_versand_bereit ? await empfaengerSatz(m.id) : "";
    confirm({
      title: `Veröffentlichen: ${m.title}`,
      hint:
        `Erscheint ab sofort bei: ${empfaenger(m)}.` +
        (m.show_as_modal ? " Als Hinweisfenster beim nächsten Öffnen." : "") +
        (mail
          ? (liste?.mail_versand_bereit
            ? ` Danach geht einmalig eine E-Mail raus.${zahl}`
            : " Eine E-Mail ist vorgesehen, aber es ist kein Versandweg verbunden — es wird nichts gesendet.")
          : ""),
      onConfirm: async (reason: string) => {
        await stepUp();
        const r = await sccApi.post<{ mail: { gesendet: number; hinweis?: string } | null }>(
          `/produkt-updates/${m.id}/veroeffentlichen`, { confirmed: true, reason });
        toast.success(r?.mail ? `Veröffentlicht — ${r.mail.gesendet} E-Mails gesendet.` : "Veröffentlicht.");
        await load();
      },
    });
  }

  async function maile(m: Mitteilung) {
    const zahl = liste?.mail_versand_bereit ? await empfaengerSatz(m.id) : "";
    confirm({
      title: `Per E-Mail senden: ${m.title}`,
      hint: liste?.mail_versand_bereit
        ? `Zielgruppe: ${empfaenger(m)}.${zahl} Nur einmal — ein zweiter Versand ist danach gesperrt.`
        : "Es ist kein Versandweg verbunden — es würde nichts gesendet.",
      dangerLabel: "E-Mails senden",
      onConfirm: async (reason: string) => {
        await stepUp();
        const r = await sccApi.post<{ gesendet: number; uebersprungen: number; abgemeldet?: number; hinweis?: string }>(
          `/produkt-updates/${m.id}/mailen`, { confirmed: true, reason });
        toast.success(r?.hinweis ?? `${r.gesendet} E-Mails gesendet${r.abgemeldet ? `, ${r.abgemeldet} abbestellt` : ""}.`);
        await load();
      },
    });
  }

  function zurueckziehen(m: Mitteilung) {
    confirm({
      title: `Zurückziehen: ${m.title}`,
      hint: "Die Mitteilung verschwindet bei allen und wird wieder ein Entwurf. Bereits gesendete E-Mails bleiben gesendet.",
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
                      <td style={{ fontSize: 12 }}>
                        {m.email_sent_at ? `gesendet ${datum(m.email_sent_at)}` : m.send_email_on_publish ? "beim Veröffentlichen" : "–"}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button className="scc-btn" onClick={() => oeffne(m)}>Bearbeiten</button>{" "}
                        {m.status === "draft" && <button className="scc-btn scc-btn--primary" onClick={() => void veroeffentliche(m)}>Veröffentlichen</button>}
                        {m.status === "published" && !m.email_sent_at && m.visibility === "public" && (
                          <><button className="scc-btn" onClick={() => void maile(m)}>Mailen</button>{" "}</>
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
