/**
 * Rabatt-Faelle — der Einzelfall statt des Katalogs (Welle K1).
 *
 * NICHT ZU VERWECHSELN mit „Rabatt-Katalog“. Die beiden gehoeren zusammen und
 * beantworten verschiedene Fragen:
 *   Rabatt-Katalog   die REGEL — welche Bounties gibt es, was bringen sie
 *   Rabatt-Faelle    der EINZELFALL — was bekommt Kunde X, warum, was ist
 *                    ausgefallen, und wie greift man ein
 *
 * WARUM ES DIESE FLAECHE GIBT
 * Der Treue-Rabatt laeuft automatisch und traegt echtes Geld. Faellt die
 * Ermittlung aus, entstand bisher nur eine Log-Zeile — ein Kunde mit 8 % zahlte
 * den vollen Preis, und der einzige Zeuge war eine Datei, die niemand liest.
 * Seit K1.1 entsteht ein Befund; hier wird er sichtbar.
 *
 * DER EINGRIFF (Plan-Abschnitt 3a): Es gibt keine zweite Staff-Rolle, ein
 * Vier-Augen-Prinzip waere dauerhaft blockiert. Der Schutz ist strukturell und
 * liegt im Backend — diese Oberflaeche BESTAETIGT nur die Zahl, die der Server
 * gerechnet hat. Deshalb gibt es hier kein Betragsfeld, sondern eine Auswahl
 * aus dem Katalog und eine Wirkungsvorschau in Euro.
 *
 * Endpunkte: GET /rabatt-faelle · /rabatt-faelle/:id · /rabatt-faelle/:id/eingriff-vorschau
 *            GET /rabatt-vorschau · /rabatt-monat · POST /rabatt-eingriff
 */
import { useState, useEffect, useCallback } from "react";
import { sccApi } from "@scc/api/client";
import { useConfirm } from "@scc/state/ConfirmContext";
import { useStepUp } from "@scc/state/StepUpContext";
import { useToast } from "@scc/state/ToastContext";
import { PageHeader } from "@scc/components/ui/PageHeader";
import { EmptyState } from "@scc/components/ui/EmptyState";
import { ErrorBanner } from "@scc/components/ui/ErrorBanner";
import { fmtCents, fmtDate, fmtDateShort } from "@scc/utils/format";

/* ── Formen ──────────────────────────────────────────────────────────── */

interface FallZeile {
  user_id: string; email: string;
  org_id: string | null; org_name: string | null;
  plan: string; abo_status: string; periode_endet: string | null;
  bounties: number; roh_pct: number; deckel_pct: number; satz_pct: number;
  gedeckelt: boolean;
  stufe: { key: string; name: string } | null;
  ausfaelle: number; letzter_ausfall: string | null; eingriffe_offen: number;
}

interface Liste { items: FallZeile[]; limit: number; offset: number; weitere: boolean }

interface Bounty {
  key: string; name: string; kategorie: string; discount_pct: number;
  zaehlt: boolean; vergabe_aktiv: boolean; katalog_aktiv: boolean;
  inactive_reason: string | null; progress: number; earned_at: string | null;
}

interface Ausfall {
  id: number; abrechnungsmonat: string; stelle: string; grund: string;
  angesetzt_pct: number; netto_cents: number | null; vorfaelle: number;
  zuerst_am: string; zuletzt_am: string; invoice_number: string | null;
}

interface Eingriff {
  id: string; bounty_key: string; zusatz_pct: number;
  erwartete_ersparnis_cents: number; tatsaechliche_ersparnis_cents: number | null;
  grund: string; angelegt_am: string; verbraucht_am: string | null;
  invoice_number?: string | null; kunde_email?: string; akteur_email?: string | null;
}

interface Fall {
  kunde: { user_id: string; email: string; seit: string; org_id: string | null; org_name: string | null };
  satz: {
    satz_pct: number; roh_pct: number; deckel_pct: number; gedeckelt: boolean;
    stufe: { key: string; name: string; max_discount_pct: number } | null;
    stufe_ausgefallen: string | null; satz_naechster_lauf_pct: number;
  };
  bounties: Bounty[];
  abrechnung: {
    plan: string; status: string; periode_endet: string | null; faellig: boolean;
    org_name: string | null; netto_cents: number | null;
    rabatt_cents: number | null; zahlbetrag_netto_cents: number | null;
  } | null;
  rechnungen: Array<{
    id: string; invoice_number: string; status: string; issued_at: string | null;
    amount_cents: number; total_cents: number; discount_pct: number;
    discount_amount_cents: number; discount_source: string | null;
  }>;
  ausfaelle: Ausfall[];
  eingriffe: Eingriff[];
  offener_eingriff: Eingriff | null;
}

interface Vorschau {
  ok: boolean; code?: string; grund?: string;
  bounty_key?: string; bounty_name?: string; bounty_pct?: number;
  satz_heute?: number; satz_nachher?: number; zusatz_pct?: number; deckel?: number;
  netto_cents?: number | null; rabatt_vorher_cents?: number | null;
  rabatt_nachher_cents?: number | null; ersparnis_cents?: number | null;
  fortschritt?: number;
}

interface LaufPosten {
  subscription_id: string; user_id: string; plan: string; status: string;
  grund?: string; org_name?: string | null; email?: string | null;
  periode_ab?: string; netto_cents?: number; rabatt_pct?: number;
  rabatt_cents?: number; rabatt_quelle?: string | null; automatik_pct?: number;
  eingriff?: { id: string; bounty_key: string; zusatz_pct: number } | null;
  ausfall?: string | null;
}

interface Lauf {
  stand: string; faellig: number; rechnungen: number; uebersprungen: number;
  mit_eingriff: number; summe_netto_cents: number; summe_rabatt_cents: number;
  posten: LaufPosten[]; abgeschnitten: boolean;
}

interface Monat {
  monat: string; anzahl: number; anzahl_offen: number;
  summe_cents: number; summe_erwartet_cents: number; summe_tatsaechlich_cents: number;
  eingriffe: Eingriff[];
  ausfaelle: Array<Ausfall & { kunde_email: string; org_name: string | null }>;
  ausfaelle_anzahl: number; ausfaelle_vorfaelle: number;
}

type Reiter = "faelle" | "lauf" | "monat";

/* ── Kleinteile ──────────────────────────────────────────────────────── */

function pct(n: number | null | undefined): string {
  return `${Number(n ?? 0).toFixed(1).replace(".", ",")} %`;
}

/** Der laufende Monat in Europe/Berlin — nie ein roher UTC-Schnitt. */
function monatJetzt(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit",
  }).format(new Date());
}

function stellenName(stelle: string): string {
  return stelle === "stufe" ? "Stufen-Abfrage" : "Rabattsatz";
}

const kachelStil = {
  labelStil: {
    fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" as const,
    color: "var(--scc-muted)",
  },
  wertStil: { fontSize: 20, fontWeight: 700 },
};

function Kacheln({ werte }: { werte: Array<{ label: string; wert: string; ton?: string }> }) {
  return (
    <div className="scc-card" style={{ marginBottom: 14, display: "flex", gap: 28, flexWrap: "wrap" }}>
      {werte.map((k) => (
        <div key={k.label}>
          <div style={kachelStil.labelStil}>{k.label}</div>
          <div style={{ ...kachelStil.wertStil, color: k.ton || "inherit" }}>{k.wert}</div>
        </div>
      ))}
    </div>
  );
}

/* ── Modul ───────────────────────────────────────────────────────────── */

export default function RabattFaelle() {
  const confirm = useConfirm();
  const stepUp = useStepUp();
  const toast = useToast();

  const [reiter, setReiter] = useState<Reiter>("faelle");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(true);

  const [liste, setListe] = useState<Liste | null>(null);
  const [suche, setSuche] = useState("");
  const [nurAuffaellige, setNurAuffaellige] = useState(false);

  const [fall, setFall] = useState<Fall | null>(null);
  const [fallLaedt, setFallLaedt] = useState(false);
  const [gewaehltesBounty, setGewaehltesBounty] = useState("");
  const [vorschau, setVorschau] = useState<Vorschau | null>(null);
  const [vorschauLaedt, setVorschauLaedt] = useState(false);

  const [lauf, setLauf] = useState<Lauf | null>(null);
  const [monat, setMonat] = useState<Monat | null>(null);
  const [monatWahl, setMonatWahl] = useState(monatJetzt());

  /* ── Laden ─────────────────────────────────────────────────────────── */

  const ladeListe = useCallback(async () => {
    setLaedt(true); setFehler(null);
    try {
      const teile = [
        `limit=50`,
        suche ? `q=${encodeURIComponent(suche)}` : "",
        nurAuffaellige ? "nur_auffaellige=true" : "",
      ].filter(Boolean).join("&");
      setListe(await sccApi.get<Liste>(`/rabatt-faelle?${teile}`));
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Die Rabatt-Faelle konnten nicht geladen werden.");
    } finally { setLaedt(false); }
  }, [suche, nurAuffaellige]);

  const ladeFall = useCallback(async (userId: string) => {
    setFallLaedt(true); setVorschau(null); setGewaehltesBounty("");
    try {
      setFall(await sccApi.get<Fall>(`/rabatt-faelle/${userId}`));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Der Einzelfall konnte nicht geladen werden.");
      setFall(null);
    } finally { setFallLaedt(false); }
  }, [toast]);

  const ladeLauf = useCallback(async () => {
    setLaedt(true); setFehler(null);
    try { setLauf(await sccApi.get<Lauf>("/rabatt-vorschau")); }
    catch (e) { setFehler(e instanceof Error ? e.message : "Die Vorschau konnte nicht geladen werden."); }
    finally { setLaedt(false); }
  }, []);

  const ladeMonat = useCallback(async (m: string) => {
    setLaedt(true); setFehler(null);
    try { setMonat(await sccApi.get<Monat>(`/rabatt-monat?monat=${encodeURIComponent(m)}`)); }
    catch (e) { setFehler(e instanceof Error ? e.message : "Die Monatsuebersicht konnte nicht geladen werden."); }
    finally { setLaedt(false); }
  }, []);

  useEffect(() => {
    if (reiter === "faelle") void ladeListe();
    if (reiter === "lauf") void ladeLauf();
    if (reiter === "monat") void ladeMonat(monatWahl);
  }, [reiter, ladeListe, ladeLauf, ladeMonat, monatWahl]);

  /* ── Der Eingriff ──────────────────────────────────────────────────── */

  async function hoelVorschau(bountyKey: string) {
    if (!fall || !bountyKey) return;
    setVorschauLaedt(true);
    try {
      setVorschau(await sccApi.get<Vorschau>(
        `/rabatt-faelle/${fall.kunde.user_id}/eingriff-vorschau?bounty_key=${encodeURIComponent(bountyKey)}`
      ));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Die Wirkung konnte nicht berechnet werden.");
      setVorschau(null);
    } finally { setVorschauLaedt(false); }
  }

  function greifeEin() {
    if (!fall || !vorschau?.ok || vorschau.ersparnis_cents == null) return;
    const ersparnis = vorschau.ersparnis_cents;

    confirm({
      title: `Rabatt-Eingriff: ${fall.kunde.email}`,
      // Bestaetigt wird DIE ZAHL, nicht eine abstrakte Handlung. Ein Mensch
      // uebersieht eine Handlung, aber selten einen falschen Betrag in Euro.
      hint:
        `Die naechste Rechnung wird um ${fmtCents(ersparnis)} niedriger `
        + `(${pct(vorschau.satz_heute)} → ${pct(vorschau.satz_nachher)}). `
        + `Grund: „${vorschau.bounty_name}“ haette zaehlen muessen. `
        + `Der Eingriff wirkt GENAU EINMAL — danach entscheidet wieder die Automatik. `
        + `Die Rechnung weist den Eingriff als Quelle aus.`,
      onConfirm: async (reason: string) => {
        await stepUp();
        await sccApi.post("/rabatt-eingriff", {
          user_id: fall.kunde.user_id,
          bounty_key: vorschau.bounty_key,
          // Die bestaetigte Zahl geht zurueck an den Server. Weicht sie von der
          // dort neu berechneten ab, wird ABGELEHNT — nicht stillschweigend
          // etwas anderes getan.
          erwartete_ersparnis_cents: ersparnis,
          confirmed: true, reason,
        });
        toast.success(`Eingriff angelegt — naechste Rechnung ${fmtCents(ersparnis)} niedriger.`);
        setVorschau(null); setGewaehltesBounty("");
        await ladeFall(fall.kunde.user_id);
        await ladeListe();
      },
    });
  }

  /* ── Darstellung ───────────────────────────────────────────────────── */

  const reiterKnopf = (k: Reiter, label: string) => (
    <button
      key={k}
      className={`scc-btn${reiter === k ? " scc-btn--primary" : ""}`}
      onClick={() => { setReiter(k); setFall(null); }}
    >{label}</button>
  );

  return (
    <>
      <PageHeader
        title="Rabatt-Faelle"
        subtitle="Welchen Rabatt bekommt ein Kunde, warum — und wo ist die Ermittlung ausgefallen. Der Katalog steht unter „Rabatt-Katalog“."
      />

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {reiterKnopf("faelle", "Kunden")}
        {reiterKnopf("lauf", "Naechster Lauf")}
        {reiterKnopf("monat", "Monatsuebersicht")}
      </div>

      {fehler && <ErrorBanner message={fehler} onRetry={() => {
        if (reiter === "faelle") void ladeListe();
        else if (reiter === "lauf") void ladeLauf();
        else void ladeMonat(monatWahl);
      }} />}

      {/* ── Kunden ─────────────────────────────────────────────────── */}
      {reiter === "faelle" && (
        <>
          <div className="scc-card" style={{ marginBottom: 14, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void ladeListe(); }}
              placeholder="E-Mail oder Firma…"
              style={{
                padding: "6px 8px", background: "var(--scc-panel)", color: "inherit",
                border: "1px solid var(--scc-line)", borderRadius: 4, fontSize: 12, minWidth: 240,
              }}
            />
            <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={nurAuffaellige} onChange={(e) => setNurAuffaellige(e.target.checked)} />
              nur Auffaellige (Ausfall oder offener Eingriff)
            </label>
            <button className="scc-btn" onClick={() => void ladeListe()}>Suchen</button>
          </div>

          {laedt && !liste && <div className="scc-card">Lade Rabatt-Faelle…</div>}

          {liste && liste.items.length === 0 && (
            <EmptyState message={
              nurAuffaellige
                ? "Kein Kunde mit Ausfall oder offenem Eingriff — die Automatik laeuft."
                : "Kein Kunde mit einem aktiven Rabatt."
            } />
          )}

          {liste && liste.items.length > 0 && (
            <div className="scc-card" style={{ overflowX: "auto" }}>
              <table className="scc-table">
                <thead>
                  <tr>{["Kunde", "Plan", "Bounties", "Satz", "Stufe", "Auffaellig", ""].map((h) => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {liste.items.map((z) => (
                    <tr key={z.user_id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{z.org_name || z.email}</div>
                        {z.org_name && <div style={{ fontSize: 11, color: "var(--scc-muted)" }}>{z.email}</div>}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {z.plan}
                        <div style={{ color: "var(--scc-muted)", fontSize: 11 }}>{z.abo_status}</div>
                      </td>
                      <td>{z.bounties}</td>
                      <td style={{ fontWeight: 600 }}>
                        {pct(z.satz_pct)}
                        {z.gedeckelt && (
                          <div style={{ fontSize: 11, fontWeight: 400, color: "var(--scc-muted)" }}>
                            von {pct(z.roh_pct)} gedeckelt
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: 12 }}>{z.stufe ? z.stufe.name : <span style={{ color: "var(--scc-muted)" }}>keine</span>}</td>
                      <td>
                        {z.ausfaelle > 0 && (
                          <span className="scc-pill scc-pill--danger">
                            {z.ausfaelle} {z.ausfaelle === 1 ? "Ausfall" : "Ausfaelle"}
                          </span>
                        )}
                        {z.eingriffe_offen > 0 && (
                          <span className="scc-pill scc-pill--warn" style={{ marginLeft: 4 }}>Eingriff offen</span>
                        )}
                        {z.ausfaelle === 0 && z.eingriffe_offen === 0 && (
                          <span style={{ color: "var(--scc-muted)", fontSize: 12 }}>–</span>
                        )}
                      </td>
                      <td>
                        <button className="scc-btn" onClick={() => void ladeFall(z.user_id)}>Ansehen</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {liste.weitere && (
                <div style={{ fontSize: 11, color: "var(--scc-muted)", marginTop: 10 }}>
                  Es gibt weitere Faelle als die hier gezeigten — die Suche grenzt ein.
                </div>
              )}
            </div>
          )}

          {fallLaedt && <div className="scc-card" style={{ marginTop: 14 }}>Lade Einzelfall…</div>}

          {fall && !fallLaedt && (
            <div className="scc-card" style={{ marginTop: 14 }}>
              <div className="scc-card__eyebrow">
                Einzelfall — {fall.kunde.org_name || fall.kunde.email}
              </div>

              {fall.satz.stufe_ausgefallen && (
                <div style={{
                  margin: "12px 0", padding: "10px 12px", borderRadius: 4,
                  border: "1px solid var(--scc-line)", fontSize: 12,
                }}>
                  <b>Die Stufen-Abfrage ist ausgefallen.</b> Der Deckel steht ersatzweise auf{" "}
                  {pct(fall.satz.deckel_pct)} — nicht zu verwechseln mit „hat noch keine Stufe“.
                  <div style={{ color: "var(--scc-muted)", marginTop: 4, fontFamily: "monospace", fontSize: 11 }}>
                    {fall.satz.stufe_ausgefallen}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: 28, flexWrap: "wrap", margin: "12px 0 18px" }}>
                {[
                  { label: "Satz heute", wert: pct(fall.satz.satz_pct) },
                  { label: "Summe der Bounties", wert: pct(fall.satz.roh_pct) },
                  { label: "Obergrenze der Stufe", wert: pct(fall.satz.deckel_pct) },
                  { label: "Stufe", wert: fall.satz.stufe?.name ?? "keine" },
                  ...(fall.satz.satz_naechster_lauf_pct !== fall.satz.satz_pct
                    ? [{ label: "naechster Lauf", wert: pct(fall.satz.satz_naechster_lauf_pct) }]
                    : []),
                ].map((k) => (
                  <div key={k.label}>
                    <div style={kachelStil.labelStil}>{k.label}</div>
                    <div style={kachelStil.wertStil}>{k.wert}</div>
                  </div>
                ))}
              </div>

              {fall.satz.gedeckelt && (
                <div style={{ fontSize: 11, color: "var(--scc-muted)", margin: "-10px 0 16px" }}>
                  Die Summe der Bounties liegt ueber der Obergrenze seiner Stufe — angesetzt wird
                  die Obergrenze. Ein Eingriff kann daran nichts aendern.
                </div>
              )}

              {/* Naechste Rechnung */}
              <div style={{ marginBottom: 18 }}>
                <div className="scc-card__eyebrow">Naechste Rechnung</div>
                {fall.abrechnung ? (
                  <div style={{ fontSize: 13, marginTop: 6 }}>
                    {fall.abrechnung.plan} · Netto {fmtCents(fall.abrechnung.netto_cents)}
                    {" − "}Rabatt {fmtCents(fall.abrechnung.rabatt_cents)}
                    {" = "}<b>{fmtCents(fall.abrechnung.zahlbetrag_netto_cents)}</b>
                    <div style={{ fontSize: 11, color: "var(--scc-muted)", marginTop: 3 }}>
                      Periode endet {fmtDateShort(fall.abrechnung.periode_endet)}
                      {fall.abrechnung.faellig ? " — faellig" : ""}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--scc-muted)", marginTop: 6 }}>
                    Kein abrechenbares Abo mit aufloesbarem Preis — ein Rabatt haette nichts,
                    worauf er wirken koennte.
                  </div>
                )}
              </div>

              {/* Bounties */}
              <div className="scc-card__eyebrow">Bounties</div>
              {fall.bounties.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--scc-muted)", margin: "6px 0 18px" }}>
                  Dieser Kunde hat noch kein Bounty verdient.
                </div>
              ) : (
                <div style={{ overflowX: "auto", margin: "6px 0 18px" }}>
                  <table className="scc-table">
                    <thead>
                      <tr>{["Bounty", "Rabatt", "Zaehlt", "Fortschritt", "Verdient am"].map((h) => <th key={h}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {fall.bounties.map((b) => (
                        <tr key={b.key} style={{ opacity: b.zaehlt ? 1 : 0.6 }}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{b.name}</div>
                            {!b.katalog_aktiv && (
                              <div style={{ fontSize: 11, color: "var(--scc-muted)" }}>
                                Katalogeintrag abgeschaltet{b.inactive_reason ? ` — ${b.inactive_reason}` : ""}
                              </div>
                            )}
                          </td>
                          <td>{pct(b.discount_pct)}</td>
                          <td>
                            {b.zaehlt
                              ? <span className="scc-pill scc-pill--live">ja</span>
                              : <span className="scc-pill scc-pill--warn">nein</span>}
                          </td>
                          <td style={{ fontSize: 12 }}>{b.progress} %</td>
                          <td style={{ fontSize: 12 }}>{b.earned_at ? fmtDateShort(b.earned_at) : "–"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Ausfaelle */}
              {fall.ausfaelle.length > 0 && (
                <>
                  <div className="scc-card__eyebrow">Ausfaelle der Ermittlung</div>
                  <div style={{ overflowX: "auto", margin: "6px 0 18px" }}>
                    <table className="scc-table">
                      <thead>
                        <tr>{["Monat", "Stelle", "Angesetzt", "Vorfaelle", "Rechnung", "Zuletzt", "Grund"].map((h) => <th key={h}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {fall.ausfaelle.map((a) => (
                          <tr key={a.id}>
                            <td style={{ fontSize: 12 }}>{fmtDateShort(a.abrechnungsmonat)}</td>
                            <td><span className="scc-pill scc-pill--danger">{stellenName(a.stelle)}</span></td>
                            <td style={{ fontSize: 12 }}>{pct(a.angesetzt_pct)}</td>
                            <td>{a.vorfaelle}</td>
                            <td style={{ fontSize: 12 }}>{a.invoice_number || "–"}</td>
                            <td style={{ fontSize: 12 }}>{fmtDate(a.zuletzt_am)}</td>
                            <td style={{ fontFamily: "monospace", fontSize: 11, maxWidth: 300 }}>{a.grund}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {/* Rechnungen */}
              <div className="scc-card__eyebrow">Letzte Rechnungen</div>
              {fall.rechnungen.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--scc-muted)", margin: "6px 0 18px" }}>
                  Noch keine Rechnung.
                </div>
              ) : (
                <div style={{ overflowX: "auto", margin: "6px 0 18px" }}>
                  <table className="scc-table">
                    <thead>
                      <tr>{["Nummer", "Gestellt", "Status", "Netto", "Rabatt", "Quelle", "Gesamt"].map((h) => <th key={h}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {fall.rechnungen.map((r) => (
                        <tr key={r.id}>
                          <td style={{ fontFamily: "monospace", fontSize: 12 }}>{r.invoice_number}</td>
                          <td style={{ fontSize: 12 }}>{fmtDateShort(r.issued_at)}</td>
                          <td style={{ fontSize: 12 }}>{r.status}</td>
                          <td>{fmtCents(r.amount_cents)}</td>
                          <td>{Number(r.discount_pct) > 0 ? `${pct(r.discount_pct)} · ${fmtCents(r.discount_amount_cents)}` : "–"}</td>
                          <td style={{ fontSize: 12 }}>
                            {r.discount_source === "bounty_eingriff"
                              ? <span className="scc-pill scc-pill--warn">Eingriff</span>
                              : r.discount_source === "bounty"
                                ? <span className="scc-pill scc-pill--live">Automatik</span>
                                : "–"}
                          </td>
                          <td>{fmtCents(r.total_cents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Eingriff */}
              <div className="scc-card__eyebrow">Eingriff</div>

              {fall.offener_eingriff ? (
                <div style={{ fontSize: 13, margin: "8px 0 4px", padding: "10px 12px", border: "1px solid var(--scc-line)", borderRadius: 4 }}>
                  Ein Eingriff ist offen: <b>+{pct(fall.offener_eingriff.zusatz_pct)}</b> aus{" "}
                  „{fall.offener_eingriff.bounty_key}“, erwartete Wirkung{" "}
                  {fmtCents(fall.offener_eingriff.erwartete_ersparnis_cents)}.
                  <div style={{ fontSize: 11, color: "var(--scc-muted)", marginTop: 4 }}>
                    Angelegt {fmtDate(fall.offener_eingriff.angelegt_am)} — „{fall.offener_eingriff.grund}“.
                    Er wirkt auf die naechste Rechnung und verfaellt danach. Solange er offen ist,
                    ist kein zweiter moeglich.
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: "var(--scc-muted)", margin: "8px 0 10px" }}>
                    Kein Betragsfeld: es wird ein Katalogeintrag gewaehlt, der haette zaehlen
                    muessen. Das System prueft die Bedingung gegen die echten Daten und rechnet
                    den Zuschlag selbst — die Obergrenze der Stufe gilt weiter.
                  </div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                    <select
                      value={gewaehltesBounty}
                      onChange={(e) => { setGewaehltesBounty(e.target.value); setVorschau(null); }}
                      style={{
                        padding: "6px 8px", background: "var(--scc-panel)", color: "inherit",
                        border: "1px solid var(--scc-line)", borderRadius: 4, fontSize: 12, minWidth: 260,
                      }}
                    >
                      <option value="">Bounty waehlen…</option>
                      {fall.bounties.filter((b) => !b.zaehlt).map((b) => (
                        <option key={b.key} value={b.key}>{b.name} (+{pct(b.discount_pct)})</option>
                      ))}
                    </select>
                    <button
                      className="scc-btn"
                      disabled={!gewaehltesBounty || vorschauLaedt}
                      onClick={() => void hoelVorschau(gewaehltesBounty)}
                    >{vorschauLaedt ? "Rechne…" : "Wirkung berechnen"}</button>
                  </div>

                  {fall.bounties.filter((b) => !b.zaehlt).length === 0 && (
                    <div style={{ fontSize: 11, color: "var(--scc-muted)", marginTop: 8 }}>
                      Alle Bounties dieses Kunden zaehlen bereits — es gibt nichts nachzutragen.
                    </div>
                  )}

                  {vorschau && !vorschau.ok && (
                    <div style={{
                      marginTop: 12, padding: "10px 12px", borderRadius: 4,
                      border: "1px solid var(--scc-line)", fontSize: 13,
                    }}>
                      <b>Kein Eingriff moeglich.</b> {vorschau.grund}
                      {typeof vorschau.fortschritt === "number" && (
                        <div style={{ fontSize: 11, color: "var(--scc-muted)", marginTop: 4 }}>
                          Fortschritt: {vorschau.fortschritt} %
                        </div>
                      )}
                    </div>
                  )}

                  {vorschau?.ok && (
                    <div style={{
                      marginTop: 12, padding: "12px 14px", borderRadius: 4,
                      border: "1px solid var(--scc-line)",
                    }}>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>
                        Die naechste Rechnung wird um {fmtCents(vorschau.ersparnis_cents)} niedriger.
                      </div>
                      <div style={{ fontSize: 12, color: "var(--scc-muted)", marginTop: 6 }}>
                        {pct(vorschau.satz_heute)} → {pct(vorschau.satz_nachher)}
                        {" · "}Zuschlag {pct(vorschau.zusatz_pct)} aus „{vorschau.bounty_name}“
                        {vorschau.zusatz_pct !== vorschau.bounty_pct && (
                          <> — gekuerzt von {pct(vorschau.bounty_pct)} durch die Obergrenze {pct(vorschau.deckel)}</>
                        )}
                        <br />
                        Netto {fmtCents(vorschau.netto_cents)}: Rabatt{" "}
                        {fmtCents(vorschau.rabatt_vorher_cents)} → {fmtCents(vorschau.rabatt_nachher_cents)}
                      </div>
                      <button className="scc-btn scc-btn--primary" style={{ marginTop: 12 }} onClick={greifeEin}>
                        Eingreifen — {fmtCents(vorschau.ersparnis_cents)}
                      </button>
                      <div style={{ fontSize: 11, color: "var(--scc-muted)", marginTop: 8 }}>
                        Bestaetigt wird diese Zahl. Weicht sie beim Anlegen ab, wird abgelehnt statt
                        gerechnet. Der Eingriff wirkt genau einmal und steht als Quelle auf der Rechnung.
                      </div>
                    </div>
                  )}
                </>
              )}

              {fall.eingriffe.length > 0 && (
                <div style={{ overflowX: "auto", marginTop: 14 }}>
                  <table className="scc-table">
                    <thead>
                      <tr>{["Angelegt", "Bounty", "Zuschlag", "Erwartet", "Tatsaechlich", "Rechnung", "Grund"].map((h) => <th key={h}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {fall.eingriffe.map((e) => (
                        <tr key={e.id}>
                          <td style={{ fontSize: 12 }}>{fmtDate(e.angelegt_am)}</td>
                          <td style={{ fontSize: 12 }}>{e.bounty_key}</td>
                          <td>+{pct(e.zusatz_pct)}</td>
                          <td>{fmtCents(e.erwartete_ersparnis_cents)}</td>
                          <td>{e.verbraucht_am ? fmtCents(e.tatsaechliche_ersparnis_cents) : <span className="scc-pill scc-pill--warn">offen</span>}</td>
                          <td style={{ fontFamily: "monospace", fontSize: 11 }}>{e.invoice_number || "–"}</td>
                          <td style={{ fontSize: 11, maxWidth: 260 }}>{e.grund}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Naechster Lauf ─────────────────────────────────────────── */}
      {reiter === "lauf" && (
        <>
          {laedt && !lauf && <div className="scc-card">Berechne die Vorschau…</div>}
          {lauf && (
            <>
              <Kacheln werte={[
                { label: "faellig", wert: String(lauf.faellig) },
                { label: "Rechnungen", wert: String(lauf.rechnungen) },
                { label: "uebersprungen", wert: String(lauf.uebersprungen) },
                { label: "mit Eingriff", wert: String(lauf.mit_eingriff) },
                { label: "Netto gesamt", wert: fmtCents(lauf.summe_netto_cents) },
                { label: "Rabatt gesamt", wert: fmtCents(lauf.summe_rabatt_cents) },
              ]} />
              <div style={{ fontSize: 11, color: "var(--scc-muted)", margin: "-6px 0 16px" }}>
                Stand {fmtDate(lauf.stand)}. Diese Vorschau rechnet mit derselben Auswahl und
                derselben Entscheidung wie der echte Lauf — und schreibt nichts.
                {lauf.abgeschnitten && " Es sind mehr Abos faellig, als hier gezeigt werden."}
              </div>

              {lauf.posten.length === 0 ? (
                <EmptyState message="Derzeit ist kein Abo faellig." />
              ) : (
                <div className="scc-card" style={{ overflowX: "auto" }}>
                  <table className="scc-table">
                    <thead>
                      <tr>{["Kunde", "Plan", "Periode ab", "Netto", "Rabatt", "Quelle", "Hinweis"].map((h) => <th key={h}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {lauf.posten.map((p) => (
                        <tr key={p.subscription_id} style={{ opacity: p.status === "rechnung" ? 1 : 0.65 }}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{p.org_name || p.email || p.user_id.slice(0, 8)}</div>
                            {p.org_name && p.email && (
                              <div style={{ fontSize: 11, color: "var(--scc-muted)" }}>{p.email}</div>
                            )}
                          </td>
                          <td style={{ fontSize: 12 }}>{p.plan}</td>
                          <td style={{ fontSize: 12 }}>{p.periode_ab || "–"}</td>
                          <td>{p.netto_cents != null ? fmtCents(p.netto_cents) : "–"}</td>
                          <td>
                            {p.status === "rechnung" && Number(p.rabatt_pct) > 0
                              ? <>{pct(p.rabatt_pct)} · {fmtCents(p.rabatt_cents)}</>
                              : "–"}
                          </td>
                          <td style={{ fontSize: 12 }}>
                            {p.rabatt_quelle === "bounty_eingriff"
                              ? <span className="scc-pill scc-pill--warn">Eingriff</span>
                              : p.rabatt_quelle === "bounty"
                                ? <span className="scc-pill scc-pill--live">Automatik</span>
                                : "–"}
                          </td>
                          <td style={{ fontSize: 11 }}>
                            {p.status === "uebersprungen" && (
                              <span className="scc-pill scc-pill--warn">{p.grund}</span>
                            )}
                            {p.status === "fehler" && (
                              <span className="scc-pill scc-pill--danger">{p.grund}</span>
                            )}
                            {p.ausfall && (
                              <div style={{ color: "var(--scc-muted)", fontFamily: "monospace", marginTop: 3 }}>
                                Rabatt nicht ermittelbar: {p.ausfall}
                              </div>
                            )}
                            {p.eingriff && (
                              <div style={{ color: "var(--scc-muted)", marginTop: 3 }}>
                                +{pct(p.eingriff.zusatz_pct)} aus „{p.eingriff.bounty_key}“
                              </div>
                            )}
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
      )}

      {/* ── Monatsuebersicht ───────────────────────────────────────── */}
      {reiter === "monat" && (
        <>
          <div className="scc-card" style={{ marginBottom: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: 11, color: "var(--scc-muted)" }}>
              Monat<br />
              <input
                type="month" value={monatWahl}
                onChange={(e) => setMonatWahl(e.target.value || monatJetzt())}
                style={{
                  padding: "6px 8px", background: "var(--scc-panel)", color: "inherit",
                  border: "1px solid var(--scc-line)", borderRadius: 4, fontSize: 12,
                }}
              />
            </label>
          </div>

          {laedt && !monat && <div className="scc-card">Lade Monatsuebersicht…</div>}

          {monat && (
            <>
              <Kacheln werte={[
                { label: "Eingriffe", wert: String(monat.anzahl) },
                { label: "davon offen", wert: String(monat.anzahl_offen) },
                { label: "Wirkung gesamt", wert: fmtCents(monat.summe_cents) },
                { label: "Ausfaelle", wert: String(monat.ausfaelle_anzahl) },
                { label: "Vorfaelle", wert: String(monat.ausfaelle_vorfaelle) },
              ]} />
              <div style={{ fontSize: 11, color: "var(--scc-muted)", margin: "-6px 0 16px" }}>
                „Wirkung gesamt“ zaehlt bei verbrauchten Eingriffen die tatsaechliche, bei offenen
                die erwartete Ersparnis — die Summe stammt aus genau den Zeilen unten.
                Gezaehlt wird nach Anlagemonat.
              </div>

              <div className="scc-card__eyebrow">Eingriffe</div>
              {monat.eingriffe.length === 0 ? (
                <div className="scc-card" style={{ marginBottom: 14 }}>
                  In diesem Monat wurde nicht eingegriffen — die Automatik hat allein entschieden.
                </div>
              ) : (
                <div className="scc-card" style={{ overflowX: "auto", marginBottom: 14 }}>
                  <table className="scc-table">
                    <thead>
                      <tr>{["Angelegt", "Kunde", "Bounty", "Zuschlag", "Erwartet", "Tatsaechlich", "Rechnung", "Von", "Grund"].map((h) => <th key={h}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {monat.eingriffe.map((e) => (
                        <tr key={e.id}>
                          <td style={{ fontSize: 12 }}>{fmtDate(e.angelegt_am)}</td>
                          <td style={{ fontSize: 12 }}>{e.kunde_email}</td>
                          <td style={{ fontSize: 12 }}>{e.bounty_key}</td>
                          <td>+{pct(e.zusatz_pct)}</td>
                          <td>{fmtCents(e.erwartete_ersparnis_cents)}</td>
                          <td>{e.verbraucht_am ? fmtCents(e.tatsaechliche_ersparnis_cents) : <span className="scc-pill scc-pill--warn">offen</span>}</td>
                          <td style={{ fontFamily: "monospace", fontSize: 11 }}>{e.invoice_number || "–"}</td>
                          <td style={{ fontSize: 11 }}>{e.akteur_email || "–"}</td>
                          <td style={{ fontSize: 11, maxWidth: 220 }}>{e.grund}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="scc-card__eyebrow">Ausfaelle der Ermittlung</div>
              {monat.ausfaelle.length === 0 ? (
                <div className="scc-card">
                  Kein Ausfall in diesem Monat — die Rabatt-Ermittlung lief durch.
                </div>
              ) : (
                <div className="scc-card" style={{ overflowX: "auto" }}>
                  <table className="scc-table">
                    <thead>
                      <tr>{["Kunde", "Stelle", "Angesetzt", "Netto", "Vorfaelle", "Rechnung", "Zuletzt", "Grund"].map((h) => <th key={h}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {monat.ausfaelle.map((a) => (
                        <tr key={a.id}>
                          <td style={{ fontSize: 12 }}>
                            <div style={{ fontWeight: 600 }}>{a.org_name || a.kunde_email}</div>
                            {a.org_name && <div style={{ color: "var(--scc-muted)", fontSize: 11 }}>{a.kunde_email}</div>}
                          </td>
                          <td><span className="scc-pill scc-pill--danger">{stellenName(a.stelle)}</span></td>
                          <td style={{ fontSize: 12 }}>{pct(a.angesetzt_pct)}</td>
                          <td>{a.netto_cents != null ? fmtCents(a.netto_cents) : "–"}</td>
                          <td>{a.vorfaelle}</td>
                          <td style={{ fontFamily: "monospace", fontSize: 11 }}>{a.invoice_number || "–"}</td>
                          <td style={{ fontSize: 12 }}>{fmtDate(a.zuletzt_am)}</td>
                          <td style={{ fontFamily: "monospace", fontSize: 11, maxWidth: 280 }}>{a.grund}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ fontSize: 11, color: "var(--scc-muted)", marginTop: 14 }}>
                Es gibt heute keinen Kanal, der das Team von sich aus erreicht — deshalb wird ein
                Ausfall festgehalten und hier gezeigt, statt eine Meldung zu behaupten, die nirgends
                ankommt.
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
