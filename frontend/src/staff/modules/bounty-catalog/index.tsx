/**
 * Rabatt-Katalog — plattformweite Treue- und Leistungsbounties (P9 Welle A2).
 *
 * NICHT ZU VERWECHSELN mit "Marketplace Visibility → Bounties". Das sind zwei
 * verschiedene Dinge mit demselben Namen:
 *   Marketplace Visibility  bezahlte Sichtbarkeit je Kunde, mit Freigabe-Workflow
 *   Rabatt-Katalog (hier)   plattformweite Rabatte, die jeder Kunde verdienen kann
 *
 * Zwei Hebel mit bewusst unterschiedlicher Wirkung:
 *   Not-Aus (aktiv/aus)  stoppt sofort alles — auch laufende Vergaben. Der Rabatt
 *                        endet mit dem Klick.
 *   Zeitraum             steuert nur, WANN das Bounty verdient werden kann. Wer es
 *                        im Fenster verdient hat, behaelt es danach.
 * Die Unterscheidung steht ausgeschrieben in der Oberflaeche: ein Schalter, dessen
 * Tragweite man raten muss, wird entweder nie oder einmal zu oft benutzt.
 *
 * Endpunkte: GET /bounty-catalog · POST /bounty-catalog/update
 * (requireStaff + Step-up High + Confirm/Reason + Audit).
 */
import { useState, useEffect, useCallback } from "react";
import { sccApi } from "@scc/api/client";
import { useConfirm } from "@scc/state/ConfirmContext";
import { useStepUp } from "@scc/state/StepUpContext";
import { useToast } from "@scc/state/ToastContext";
import { PageHeader } from "@scc/components/ui/PageHeader";
import { EmptyState } from "@scc/components/ui/EmptyState";
import { ErrorBanner } from "@scc/components/ui/ErrorBanner";

interface BountyRow {
  key: string;
  name_de: string;
  description_de: string;
  category: string;
  icon: string;
  discount_pct: number;
  threshold_type: string;
  is_recurring: boolean;
  is_active: boolean;
  inactive_reason: string | null;
  available_from: string | null;
  available_until: string | null;
  verdienbar: boolean;
  hinweis: string | null;
  aktive_vergaben: number;
  vergaben_gesamt: number;
  updated_at: string | null;
}

interface Katalog {
  items: BountyRow[];
  aktiv: number;
  verdienbar: number;
  max_discount_pct_je_bounty: number;
}

function tag(iso: string | null): string {
  if (!iso) return "–";
  const [j, m, t] = iso.split("-");
  return t && m && j ? `${t}.${m}.${j}` : iso;
}

function zeitraum(b: BountyRow): string {
  if (!b.available_from && !b.available_until) return "unbefristet";
  if (b.available_from && b.available_until) return `${tag(b.available_from)} – ${tag(b.available_until)}`;
  if (b.available_from) return `ab ${tag(b.available_from)}`;
  return `bis ${tag(b.available_until)}`;
}

function zustandsPille(b: BountyRow) {
  if (!b.is_active) return <span className="scc-pill scc-pill--danger">abgeschaltet</span>;
  if (!b.verdienbar) return <span className="scc-pill scc-pill--warn">ausserhalb Zeitraum</span>;
  // --live, nicht --ok: die Klasse --ok gibt es im SCC-Stylesheet nicht, der
  // Normalzustand waere sonst farblos und damit von "ohne Aussage" nicht zu
  // unterscheiden.
  return <span className="scc-pill scc-pill--live">aktiv</span>;
}

export default function BountyCatalog() {
  const confirm = useConfirm();
  const stepUp = useStepUp();
  const toast = useToast();

  const [katalog, setKatalog] = useState<Katalog | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [offen, setOffen] = useState<string | null>(null);

  // Entwurfswerte des gerade offenen Eintrags. Bewusst lokal: erst der
  // Bestaetigungsdialog macht daraus eine Aenderung.
  const [entwurf, setEntwurf] = useState<{ aktiv: boolean; von: string; bis: string; rabatt: string } | null>(null);

  const load = useCallback(async () => {
    setLaedt(true);
    setFehler(null);
    try {
      const res = await sccApi.get<Katalog>("/bounty-catalog");
      setKatalog(res);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Der Rabatt-Katalog konnte nicht geladen werden.");
    } finally {
      setLaedt(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function oeffne(b: BountyRow) {
    setOffen(b.key);
    setEntwurf({
      aktiv: b.is_active,
      von: b.available_from ?? "",
      bis: b.available_until ?? "",
      rabatt: String(b.discount_pct),
    });
  }

  function speichere(b: BountyRow) {
    if (!entwurf || !katalog) return;
    const rabattZahl = Number(entwurf.rabatt);
    if (!Number.isFinite(rabattZahl) || rabattZahl < 0 || rabattZahl > katalog.max_discount_pct_je_bounty) {
      toast.error(`Der Rabattsatz muss zwischen 0 und ${katalog.max_discount_pct_je_bounty} liegen.`);
      return;
    }
    if (entwurf.von && entwurf.bis && entwurf.bis < entwurf.von) {
      toast.error("Das Ende des Zeitraums liegt vor seinem Beginn.");
      return;
    }

    // Nur geänderte Felder senden. Wer alles mitschickt, überschreibt am Server
    // den hinterlegten Abschaltgrund und lässt jede Rabattänderung an einem
    // aktiven Bounty im Protokoll als "eingeschaltet" erscheinen.
    const patch: Record<string, unknown> = { bounty_key: b.key };
    if (entwurf.aktiv !== b.is_active) patch.is_active = entwurf.aktiv;
    if ((entwurf.von || null) !== b.available_from) patch.available_from = entwurf.von || null;
    if ((entwurf.bis || null) !== b.available_until) patch.available_until = entwurf.bis || null;
    if (rabattZahl !== b.discount_pct) patch.discount_pct = rabattZahl;

    if (Object.keys(patch).length === 1) {
      toast.error("Es wurde nichts geändert.");
      return;
    }

    const wirdAbgeschaltet = b.is_active && !entwurf.aktiv;
    const hinweis = wirdAbgeschaltet
      ? `Beendet das Bounty sofort. ${b.aktive_vergaben} laufende `
        + `${b.aktive_vergaben === 1 ? "Vergabe wird" : "Vergaben werden"} entzogen, der Rabatt entfaellt ab sofort.`
      : "Aenderung am Rabatt-Katalog. Zeitraeume steuern nur, wann das Bounty verdient werden kann — "
        + "bereits verdiente Bounties bleiben bestehen.";

    confirm({
      title: `Rabatt-Bounty aendern: ${b.name_de}`,
      hint: hinweis,
      dangerLabel: wirdAbgeschaltet ? "Bounty abschalten" : undefined,
      onConfirm: async (reason: string) => {
        await stepUp();
        const res = await sccApi.post<{ entzogene_vergaben: number }>("/bounty-catalog/update", {
          ...patch, confirmed: true, reason,
        });
        const entzogen = res?.entzogene_vergaben ?? 0;
        toast.success(
          entzogen > 0
            ? `Gespeichert — ${entzogen} laufende ${entzogen === 1 ? "Vergabe wurde" : "Vergaben wurden"} entzogen.`
            : "Gespeichert."
        );
        setOffen(null);
        setEntwurf(null);
        await load();
      },
    });
  }

  const gesamtRabatt = (katalog?.items ?? [])
    .filter((b) => b.is_active)
    .reduce((s, b) => s + b.discount_pct, 0);

  const feldStil = {
    padding: "6px 8px", background: "var(--scc-panel)", color: "inherit",
    border: "1px solid var(--scc-line)", borderRadius: 4, fontSize: 12,
  };

  return (
    <>
      <PageHeader
        title="Rabatt-Katalog"
        subtitle="Treue- und Leistungsbounties, die jeder Kunde verdienen kann. Nicht zu verwechseln mit der bezahlten Marktplatz-Sichtbarkeit."
      />

      {fehler && <ErrorBanner message={fehler} onRetry={() => void load()} />}

      {laedt && !katalog && <div className="scc-card">Lade Rabatt-Katalog…</div>}

      {katalog && (
        <>
          <div className="scc-card" style={{ marginBottom: 14, display: "flex", gap: 28, flexWrap: "wrap" }}>
            {[
              { label: "Eintraege", wert: String(katalog.items.length) },
              { label: "aktiv", wert: String(katalog.aktiv) },
              { label: "gerade verdienbar", wert: String(katalog.verdienbar) },
              { label: "Rabatt aller aktiven", wert: `${gesamtRabatt.toFixed(1)} %` },
            ].map((k) => (
              <div key={k.label}>
                <div style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--scc-muted)" }}>
                  {k.label}
                </div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{k.wert}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "var(--scc-muted)", margin: "-6px 0 16px" }}>
            „Rabatt aller aktiven" ist die Summe des Katalogs, nicht was ein einzelner Kunde bekommt —
            der ist zusaetzlich durch seine Stufe gedeckelt.
          </div>

          {katalog.items.length === 0 ? (
            <EmptyState message="Kein Bounty im Katalog." />
          ) : (
            <div className="scc-card" style={{ overflowX: "auto" }}>
              <table className="scc-table">
                <thead>
                  <tr>
                    {["Bounty", "Bedingung", "Rabatt", "Zustand", "Zeitraum", "Halten es", ""].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {katalog.items.map((b) => (
                    <tr key={b.key} style={{ opacity: b.is_active ? 1 : 0.65 }}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{b.icon} {b.name_de}</div>
                        <div style={{ fontSize: 11, color: "var(--scc-muted)", maxWidth: 320 }}>{b.description_de}</div>
                        {b.hinweis && (
                          <div style={{ fontSize: 11, color: "var(--scc-muted)", marginTop: 3, maxWidth: 320 }}>
                            {b.hinweis}
                          </div>
                        )}
                      </td>
                      <td style={{ fontFamily: "monospace", fontSize: 11 }}>
                        {b.threshold_type}
                        {b.is_recurring && (
                          <div style={{ fontFamily: "inherit", color: "var(--scc-muted)" }}>wiederkehrend</div>
                        )}
                      </td>
                      <td style={{ fontWeight: 600 }}>{b.discount_pct.toFixed(1)} %</td>
                      <td>{zustandsPille(b)}</td>
                      <td style={{ fontSize: 12 }}>{zeitraum(b)}</td>
                      <td style={{ fontWeight: 600 }}>{b.aktive_vergaben}</td>
                      <td>
                        <button className="scc-btn" onClick={() => (offen === b.key ? setOffen(null) : oeffne(b))}>
                          {offen === b.key ? "Schliessen" : "Bearbeiten"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {offen && entwurf && (() => {
            const b = katalog.items.find((x) => x.key === offen);
            if (!b) return null;
            return (
              <div className="scc-card" style={{ marginTop: 14 }}>
                <div className="scc-card__eyebrow">Bearbeiten — {b.name_de}</div>

                <label style={{ display: "flex", alignItems: "flex-start", gap: 10, margin: "12px 0" }}>
                  <input
                    type="checkbox" checked={entwurf.aktiv}
                    onChange={(e) => setEntwurf({ ...entwurf, aktiv: e.target.checked })}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    <span style={{ fontSize: 13 }}>Bounty ist aktiv</span>
                    <span style={{ display: "block", fontSize: 11, color: "var(--scc-muted)", marginTop: 2 }}>
                      Ausschalten beendet sofort alles: keine neue Vergabe, kein Rabatt — und laufende
                      Vergaben werden entzogen.
                    </span>
                  </span>
                </label>

                {b.is_active && !entwurf.aktiv && b.aktive_vergaben > 0 && (
                  <div style={{ fontSize: 12, margin: "0 0 12px", padding: "8px 10px", border: "1px solid var(--scc-line)", borderRadius: 4 }}>
                    <b>{b.aktive_vergaben}</b> laufende {b.aktive_vergaben === 1 ? "Vergabe wird" : "Vergaben werden"} entzogen.
                  </div>
                )}

                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <label style={{ fontSize: 11, color: "var(--scc-muted)" }}>
                    Verdienbar ab<br />
                    <input type="date" value={entwurf.von} onChange={(e) => setEntwurf({ ...entwurf, von: e.target.value })} style={feldStil} />
                  </label>
                  <label style={{ fontSize: 11, color: "var(--scc-muted)" }}>
                    Verdienbar bis<br />
                    <input type="date" value={entwurf.bis} onChange={(e) => setEntwurf({ ...entwurf, bis: e.target.value })} style={feldStil} />
                  </label>
                  <label style={{ fontSize: 11, color: "var(--scc-muted)" }}>
                    Rabattsatz % (0–{katalog.max_discount_pct_je_bounty})<br />
                    <input
                      type="number" min={0} max={katalog.max_discount_pct_je_bounty} step={0.5}
                      value={entwurf.rabatt} onChange={(e) => setEntwurf({ ...entwurf, rabatt: e.target.value })}
                      style={{ ...feldStil, width: 110 }}
                    />
                  </label>
                  <button className="scc-btn scc-btn--primary" onClick={() => speichere(b)}>Speichern</button>
                </div>

                <div style={{ fontSize: 11, color: "var(--scc-muted)", marginTop: 12 }}>
                  Leerer Zeitraum heisst unbefristet. Der Zeitraum steuert nur, wann das Bounty
                  verdient werden kann — wer es bereits hat, behaelt es. Begruendung und Step-up
                  folgen im naechsten Schritt.
                </div>
              </div>
            );
          })()}

          <div style={{ fontSize: 11, color: "var(--scc-muted)", marginTop: 14 }}>
            Neue Bounty-Ideen brauchen weiterhin Code: jede Bedingung muss ausgewertet werden koennen.
            Was hier geschaltet wird, ist Konfiguration — an/aus, Zeitraum, Rabattsatz.
          </div>
        </>
      )}
    </>
  );
}
