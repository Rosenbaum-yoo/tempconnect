/**
 * Freischaltungen — Schalter je Kunde oder plattformweit (W-E10, 2026-10-01).
 *
 * Aus dem Admin Panel hierher umgezogen, und dabei ehrlich gemacht: dort liess
 * sich jeder Tarifschluessel setzen, gelesen wird im Code aber nur, was in
 * `api/config/freischaltHebel.js` steht. Diese Seite bietet nur diese Hebel an.
 *
 * Drei Regeln stehen sichtbar in der Oberflaeche, weil das Team eine Person ist
 * und das Risiko das Versehen ist, nicht der Vorsatz:
 *   - VOR jeder Aenderung die Wirkung: was gilt heute fuer diese Firma, und woher
 *   - eine Ausnahme je Firma verfaellt (hoechstens ein Jahr) — keine stille Dauerregel
 *   - Eintraege, die nichts bewirken, heissen so, mit Grund
 *
 * Endpunkte: GET /freischaltungen · GET /freischaltungen/wirkung · GET /freischaltungen/firmen
 *            POST /freischaltungen/setzen · POST /freischaltungen/:id/entfernen
 */
import { useState, useEffect, useCallback } from "react";
import { sccApi } from "@scc/api/client";
import { useConfirm } from "@scc/state/ConfirmContext";
import { useStepUp } from "@scc/state/StepUpContext";
import { useToast } from "@scc/state/ToastContext";
import { PageHeader } from "@scc/components/ui/PageHeader";
import { EmptyState } from "@scc/components/ui/EmptyState";
import { ErrorBanner } from "@scc/components/ui/ErrorBanner";

interface Stand { enabled: boolean; quelle: "standard" | "plattform" | "firma"; gilt_bis: string | null; eintrag_id: number | null }
interface Hebel {
  key: string; name: string; wirkung: string; aus_bedeutet: string; standard: boolean; seite: string | null;
  plattform: { id: number; enabled: boolean; gilt_bis: string | null } | null;
  gilt_plattformweit: boolean; ausnahmen_an: number; ausnahmen_aus: number;
}
interface Eintrag {
  id: number; hebel: string; hebel_name: string | null; org_id: string | null; org_name: string | null; org_type: string | null;
  enabled: boolean; grund: string | null; gilt_bis: string | null; gesetzt_am: string; gesetzt_von: string | null;
  wirkt: boolean; warum_nicht: string | null;
}
interface Uebersicht { hebel: Hebel[]; eintraege: Eintrag[]; wirkungslos: number; max_tage_je_ausnahme: number; heute: string }
interface Firma { id: string; name: string; type: string }
interface Wirkung { org: Firma | null; heute: Stand; eigene_ausnahmen: number | null }

const SEITE: Record<string, string> = { agency: "Zeitarbeitsfirmen", company: "Unternehmen" };

function tag(iso: string | null): string {
  if (!iso) return "unbefristet";
  const [j, m, t] = iso.slice(0, 10).split("-");
  return t && m && j ? `${t}.${m}.${j}` : iso;
}

function plusTage(iso: string, tage: number): string {
  const [j, m, t] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(j, m - 1, t + tage));
  return d.toISOString().slice(0, 10);
}

function quelleText(s: Stand): string {
  if (s.quelle === "firma") return `eigene Ausnahme${s.gilt_bis ? ` bis ${tag(s.gilt_bis)}` : ""}`;
  if (s.quelle === "plattform") return "plattformweiter Schalter";
  return "Standard";
}

const an = (b: boolean) => (b ? "an" : "aus");

export default function Freischaltungen() {
  const confirm = useConfirm();
  const stepUp = useStepUp();
  const toast = useToast();

  const [daten, setDaten] = useState<Uebersicht | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(true);

  // Ausnahme je Firma — Entwurf
  const [hebelKey, setHebelKey] = useState<string>("");
  const [suche, setSuche] = useState("");
  const [treffer, setTreffer] = useState<Firma[]>([]);
  const [firma, setFirma] = useState<Firma | null>(null);
  const [wirkung, setWirkung] = useState<Wirkung | null>(null);
  const [zielAn, setZielAn] = useState<boolean>(false);
  const [bis, setBis] = useState<string>("");
  const [formFehler, setFormFehler] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLaedt(true);
    setFehler(null);
    try {
      const d = await sccApi.get<Uebersicht>("/freischaltungen");
      setDaten(d);
      setHebelKey((k) => k || d.hebel[0]?.key || "");
      setBis((b) => b || plusTage(d.heute, 90));
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Die Freischaltungen konnten nicht geladen werden.");
    } finally {
      setLaedt(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Firmensuche, leicht verzoegert
  useEffect(() => {
    if (!hebelKey || suche.trim().length < 2 || (firma && suche === firma.name)) { setTreffer([]); return; }
    const t = setTimeout(async () => {
      try {
        const d = await sccApi.get<{ firmen: Firma[] }>(
          `/freischaltungen/firmen?hebel=${encodeURIComponent(hebelKey)}&suche=${encodeURIComponent(suche.trim())}`
        );
        setTreffer(d.firmen);
      } catch { setTreffer([]); }
    }, 250);
    return () => clearTimeout(t);
  }, [suche, hebelKey, firma]);

  async function waehleFirma(f: Firma) {
    setFirma(f);
    setSuche(f.name);
    setTreffer([]);
    setFormFehler(null);
    setWirkung(null);
    try {
      const w = await sccApi.get<Wirkung>(
        `/freischaltungen/wirkung?hebel=${encodeURIComponent(hebelKey)}&org_id=${encodeURIComponent(f.id)}`
      );
      setWirkung(w);
      setZielAn(!w.heute.enabled);
    } catch (e) {
      setFormFehler(e instanceof Error ? e.message : "Die Wirkung liess sich nicht ermitteln.");
    }
  }

  function setzeAusnahme() {
    const h = daten?.hebel.find((x) => x.key === hebelKey);
    if (!h || !firma || !wirkung || !daten) return;
    if (!bis) { setFormFehler("Eine Ausnahme braucht ein Ende."); return; }
    if (bis < daten.heute) { setFormFehler("Das Ende liegt in der Vergangenheit."); return; }
    if (bis > plusTage(daten.heute, daten.max_tage_je_ausnahme)) {
      setFormFehler(`Höchstens ${daten.max_tage_je_ausnahme} Tage.`);
      return;
    }
    const gleich = wirkung.heute.enabled === zielAn;
    confirm({
      title: `${h.name} für ${firma.name}: ${an(zielAn)}`,
      hint:
        `Heute: ${an(wirkung.heute.enabled)} (${quelleText(wirkung.heute)}). ` +
        `Danach: ${an(zielAn)} bis einschließlich ${tag(bis)}, dann gilt wieder der plattformweite Stand. ` +
        (zielAn ? h.wirkung : h.aus_bedeutet) +
        (gleich ? " Hinweis: am heutigen Zustand ändert sich nichts — nur Quelle und Ende." : ""),
      dangerLabel: zielAn ? undefined : "Ausnahme setzen",
      onConfirm: async (reason: string) => {
        await stepUp();
        await sccApi.post("/freischaltungen/setzen", {
          hebel: h.key, org_id: firma.id, enabled: zielAn, gilt_bis: bis, confirmed: true, reason,
        });
        toast.success(`${h.name} für ${firma.name}: ${an(zielAn)} bis ${tag(bis)}.`);
        setFirma(null); setSuche(""); setWirkung(null);
        await load();
      },
    });
  }

  async function plattformweit(h: Hebel) {
    let unberuehrt = 0;
    try {
      const w = await sccApi.get<Wirkung>(`/freischaltungen/wirkung?hebel=${encodeURIComponent(h.key)}`);
      unberuehrt = w.eigene_ausnahmen ?? 0;
    } catch { /* Vorschau ohne Zahl ist besser als keine */ }
    const ziel = !h.gilt_plattformweit;
    confirm({
      title: `${h.name} plattformweit ${an(ziel)}schalten?`,
      hint:
        `Gilt sofort für alle ${SEITE[h.seite ?? ""] ?? "Kunden"} ohne eigene Ausnahme. ` +
        (unberuehrt ? `${unberuehrt} ${unberuehrt === 1 ? "Firma hat" : "Firmen haben"} eine eigene Ausnahme und ${unberuehrt === 1 ? "bleibt" : "bleiben"} unberührt. ` : "") +
        (ziel ? h.wirkung : h.aus_bedeutet) +
        (ziel === h.standard ? " Das entspricht dem Standard — alternativ den plattformweiten Eintrag entfernen." : ""),
      dangerLabel: ziel ? undefined : "Plattformweit ausschalten",
      onConfirm: async (reason: string) => {
        await stepUp();
        await sccApi.post("/freischaltungen/setzen", { hebel: h.key, enabled: ziel, confirmed: true, reason });
        toast.success(`${h.name}: plattformweit ${an(ziel)}.`);
        await load();
      },
    });
  }

  function entferne(e: Eintrag) {
    const wer = e.org_name ?? "plattformweit";
    confirm({
      title: `Eintrag entfernen: ${e.hebel_name ?? e.hebel} — ${wer}`,
      hint: e.wirkt
        ? (e.org_id
          ? `Für ${wer} gilt danach wieder der plattformweite Stand.`
          : "Danach gilt wieder der Standard — außer bei Firmen mit eigener Ausnahme.")
        : `Der Eintrag bewirkt heute nichts (${e.warum_nicht}). Entfernen räumt nur auf.`,
      dangerLabel: e.wirkt ? "Entfernen" : undefined,
      onConfirm: async (reason: string) => {
        await stepUp();
        await sccApi.post(`/freischaltungen/${e.id}/entfernen`, { confirmed: true, reason });
        toast.success("Eintrag entfernt.");
        await load();
      },
    });
  }

  const feld = {
    padding: "6px 8px", background: "var(--scc-panel)", color: "inherit",
    border: "1px solid var(--scc-line)", borderRadius: 4, fontSize: 12,
  };
  const klein = { fontSize: 11, color: "var(--scc-muted)" } as const;

  return (
    <>
      <PageHeader
        title="Freischaltungen"
        subtitle="Schalter je Kunde oder plattformweit. Angeboten wird nur, was der Code wirklich liest — eine Ausnahme je Firma verfällt."
      />

      {fehler && <ErrorBanner message={fehler} onRetry={() => void load()} />}
      {laedt && !daten && <div className="scc-card">Lade Freischaltungen…</div>}

      {daten && (
        <>
          {daten.hebel.map((h) => (
            <div key={h.key} className="scc-card" style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
                <div style={{ maxWidth: 640 }}>
                  <div className="scc-card__eyebrow">Wirkt bei {SEITE[h.seite ?? ""] ?? "allen Kunden"}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, margin: "4px 0" }}>{h.name}</div>
                  <div style={{ fontSize: 12 }}>{h.wirkung}</div>
                  <div style={{ ...klein, marginTop: 4 }}>Aus heißt: {h.aus_bedeutet}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div>
                    <span className={`scc-pill ${h.gilt_plattformweit ? "scc-pill--live" : "scc-pill--danger"}`}>
                      plattformweit {an(h.gilt_plattformweit)}
                    </span>
                  </div>
                  <div style={{ ...klein, marginTop: 4 }}>
                    {h.plattform ? `Schalter${h.plattform.gilt_bis ? ` bis ${tag(h.plattform.gilt_bis)}` : ""}` : `Standard (${an(h.standard)})`}
                    {" · "}Ausnahmen: {h.ausnahmen_an} an, {h.ausnahmen_aus} aus
                  </div>
                  <button className="scc-btn" style={{ marginTop: 8 }} onClick={() => void plattformweit(h)}>
                    Plattformweit {an(!h.gilt_plattformweit)}schalten
                  </button>
                </div>
              </div>
            </div>
          ))}

          <div className="scc-card" style={{ marginBottom: 14 }}>
            <div className="scc-card__eyebrow">Ausnahme für eine Firma</div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end", marginTop: 10 }}>
              {daten.hebel.length > 1 && (
                <label style={klein}>
                  Schalter<br />
                  <select value={hebelKey} style={feld}
                    onChange={(e) => { setHebelKey(e.target.value); setFirma(null); setSuche(""); setWirkung(null); }}>
                    {daten.hebel.map((h) => <option key={h.key} value={h.key}>{h.name}</option>)}
                  </select>
                </label>
              )}
              <label style={{ ...klein, position: "relative" }}>
                Firma ({SEITE[daten.hebel.find((h) => h.key === hebelKey)?.seite ?? ""] ?? "alle"})<br />
                <input
                  value={suche} placeholder="Name eingeben…" style={{ ...feld, width: 260 }}
                  onChange={(e) => { setSuche(e.target.value); setFirma(null); setWirkung(null); }}
                />
                {treffer.length > 0 && (
                  <div className="scc-card" style={{ position: "absolute", zIndex: 5, top: "100%", left: 0, width: 280, padding: 4 }}>
                    {treffer.map((f) => (
                      <button key={f.id} className="scc-nav-item" style={{ width: "100%" }} onClick={() => void waehleFirma(f)}>
                        {f.name}
                      </button>
                    ))}
                  </div>
                )}
              </label>
              {wirkung && (
                <>
                  <label style={klein}>
                    Danach<br />
                    <select value={zielAn ? "an" : "aus"} style={feld} onChange={(e) => setZielAn(e.target.value === "an")}>
                      <option value="aus">aus</option>
                      <option value="an">an</option>
                    </select>
                  </label>
                  <label style={klein}>
                    Gilt bis einschließlich<br />
                    <input type="date" value={bis} min={daten.heute}
                      max={plusTage(daten.heute, daten.max_tage_je_ausnahme)} style={feld}
                      onChange={(e) => setBis(e.target.value)} />
                  </label>
                  <button className="scc-btn scc-btn--primary" onClick={setzeAusnahme}>Ausnahme setzen</button>
                </>
              )}
            </div>
            {wirkung && firma && (
              <div style={{ fontSize: 12, marginTop: 10 }}>
                Heute gilt für <b>{firma.name}</b>: <b>{an(wirkung.heute.enabled)}</b> ({quelleText(wirkung.heute)}).
              </div>
            )}
            {formFehler && <div style={{ fontSize: 12, marginTop: 8, color: "var(--scc-danger)" }}>{formFehler}</div>}
            <div style={{ ...klein, marginTop: 10 }}>
              Eine Ausnahme gilt höchstens {daten.max_tage_je_ausnahme} Tage und endet am genannten Tag um Mitternacht (Berlin).
              Begründung und Step-up folgen im nächsten Schritt; alles steht im Staff-Protokoll.
            </div>
          </div>

          <div className="scc-card" style={{ overflowX: "auto" }}>
            <div className="scc-card__eyebrow" style={{ marginBottom: 8 }}>
              Alle Einträge{daten.wirkungslos > 0 ? ` — ${daten.wirkungslos} ohne Wirkung` : ""}
            </div>
            {daten.eintraege.length === 0 ? (
              <EmptyState message="Keine Einträge. Es gilt überall der Standard." />
            ) : (
              <table className="scc-table">
                <thead>
                  <tr>{["Für", "Schalter", "Zustand", "Gilt bis", "Grund", "Gesetzt", "Wirkt", ""].map((x) => <th key={x}>{x}</th>)}</tr>
                </thead>
                <tbody>
                  {daten.eintraege.map((e) => (
                    <tr key={e.id} style={{ opacity: e.wirkt ? 1 : 0.65 }}>
                      <td>{e.org_name ?? <b>plattformweit</b>}</td>
                      <td>{e.hebel_name ?? <code>{e.hebel}</code>}</td>
                      <td>{an(e.enabled)}</td>
                      <td>{tag(e.gilt_bis)}</td>
                      <td style={{ maxWidth: 260, fontSize: 12 }}>{e.grund ?? "–"}</td>
                      <td style={{ fontSize: 11 }}>{tag(e.gesetzt_am)}{e.gesetzt_von ? <><br />{e.gesetzt_von}</> : null}</td>
                      <td>
                        {e.wirkt
                          ? <span className="scc-pill scc-pill--live">wirkt</span>
                          : <span className="scc-pill scc-pill--warn" title={e.warum_nicht ?? ""}>ohne Wirkung</span>}
                        {!e.wirkt && <div style={{ ...klein, maxWidth: 200 }}>{e.warum_nicht}</div>}
                      </td>
                      <td><button className="scc-btn" onClick={() => entferne(e)}>Entfernen</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </>
  );
}
