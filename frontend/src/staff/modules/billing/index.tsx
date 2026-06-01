/**
 * Billing — SCC Phase D / Slice 2
 * Read-only Operator-Sicht auf die Abrechnung: welcher Provider real aktiv ist
 * (Fähigkeiten + Warnungen aus describeBilling), plattformweite Rechnungs-Summen
 * je Status und die letzten Rechnungen.
 *
 * Reine Aggregations-/Ansichtsschicht: KEINE Mutation. Statuswechsel/Abrechnung
 * laufen über die bestehenden Payment-/Subscription-Pfade. "Domain owns truth,
 * SCC owns aggregation."
 *
 * Endpunkte: GET /billing/overview · /billing/meta (beide requireStaff).
 */

import { useState, useEffect, useCallback } from "react";
import { sccApi } from "@scc/api/client";
import { fmtDate, fmtDateShort, fmtNum, fmtCents } from "@scc/utils/format";

// ─── Types (Shapes = Backend staffBillingOverviewService.js) ──

interface BillingCapabilities {
  self_service_checkout: boolean;
  recurring: boolean;
  customer_portal: boolean;
  webhooks: boolean;
  manual_invoicing: boolean;
}

interface BillingProvider {
  provider: "stripe" | "manual" | "disabled";
  source: string;
  payment_mode: string;
  stripe_configured: boolean;
  capabilities: BillingCapabilities;
  warnings: string[];
}

interface StatusBucket {
  count: number;
  gross_cents: number;
}

interface BillingTotals {
  invoices: number;
  gross_cents: number;
  net_cents: number;
  tax_cents: number;
  currency: string;
  by_status: Record<string, StatusBucket>;
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  billing_name: string | null;
  plan: string | null;
  status: string;
  total_cents: number;
  currency: string;
  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
}

interface AttentionRow {
  id: string;
  invoice_number: string;
  billing_name: string | null;
  plan: string | null;
  status: string;
  total_cents: number;
  currency: string;
  issued_at: string | null;
  due_at: string | null;
  days_overdue: number;
}

interface OverviewScope {
  platform: boolean;
  status: string | null;
  limit: number;
  attention_limit: number;
}

interface BillingOverview {
  available: boolean;
  billing: BillingProvider;
  totals: BillingTotals;
  recent_invoices: InvoiceRow[];
  attention: AttentionRow[];
  scope: OverviewScope;
  generated_at: string;
}

interface BillingMeta {
  invoice_statuses: string[];
}

// ─── Labels & Tones ──────────────────────────────────────

const PROVIDER_LABELS: Record<string, string> = {
  stripe:   "Stripe",
  manual:   "Manuelle Abrechnung",
  disabled: "Deaktiviert",
};

const STATUS_LABELS: Record<string, string> = {
  issued:  "Gestellt",
  paid:    "Bezahlt",
  overdue: "Überfällig",
  void:    "Storniert",
};

const STATUS_TONE: Record<string, string> = {
  issued:  "warn",
  paid:    "ok",
  overdue: "danger",
  void:    "warn",
};

const STATUS_ORDER = ["issued", "paid", "overdue", "void"];

// Reihenfolge der Capability-Pills (= describeBilling-Felder)
const CAPS: Array<[keyof BillingCapabilities, string]> = [
  ["self_service_checkout", "Self-Service Checkout"],
  ["recurring",             "Wiederkehrend"],
  ["customer_portal",       "Kundenportal"],
  ["webhooks",              "Webhooks"],
  ["manual_invoicing",      "Manuelle Rechnung"],
];

function providerLabel(p: string): string {
  return PROVIDER_LABELS[p] ?? p;
}

function statusLabel(s: string): string {
  return STATUS_LABELS[s] ?? s;
}

function statusTone(s: string): string {
  return STATUS_TONE[s] ?? "warn";
}

/** Provider-Pill-Tonalität: stripe-aktiv=live, stripe-ohne-Key/disabled=danger, manual=neutral. */
function providerPillClass(b: BillingProvider): string {
  if (b.provider === "stripe")   return b.stripe_configured ? " scc-pill--live" : " scc-pill--danger";
  if (b.provider === "disabled") return " scc-pill--danger";
  return ""; // manual = neutral (Soll-Zustand für DE-B2B)
}

function planLabel(plan: string | null): string {
  if (!plan) return "–";
  return plan.charAt(0).toUpperCase() + plan.slice(1).toLowerCase();
}

/** Dunning-Schweregrad nach Überfälligkeitsdauer (Net-14-Logik): >14 Tage kritisch, sonst Warnung. */
function dunningTone(days: number): string {
  return days > 14 ? "danger" : "warn";
}

// ─── Provider-Status-Karte ───────────────────────────────

function ProviderCard({ billing }: { billing: BillingProvider }) {
  const caps = billing.capabilities;
  return (
    <div className="scc-card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div className="scc-card__eyebrow">Abrechnungsweg</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
            <span className={`scc-pill${providerPillClass(billing)}`} style={{ fontSize: 13 }}>
              {providerLabel(billing.provider)}
            </span>
            <span className="scc-pill scc-pill--stub" style={{ fontSize: 10 }} title="Herkunft der Provider-Auflösung">
              {billing.source === "explicit" ? "explizit gesetzt" : "abgeleitet"}
            </span>
            <span className="scc-pill" style={{ fontSize: 10 }} title="PAYMENT_MODE">
              Modus: {billing.payment_mode}
            </span>
            {billing.provider === "stripe" && (
              <span
                className={`scc-pill scc-pill--${billing.stripe_configured ? "live" : "danger"}`}
                style={{ fontSize: 10 }}
                title="Ist ein echter Stripe-Secret-Key hinterlegt?"
              >
                {billing.stripe_configured ? "Key hinterlegt" : "Key fehlt"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Fähigkeiten — ●=aktiv, ○=inaktiv (nicht nur Farbe) */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
        {CAPS.map(([key, label]) => {
          const on = !!caps[key];
          return (
            <span
              key={key}
              className={`scc-pill${on ? " scc-pill--live" : ""}`}
              style={{ fontSize: 11, opacity: on ? 1 : 0.6 }}
              title={on ? "aktiv" : "inaktiv"}
            >
              {on ? "●" : "○"} {label}
            </span>
          );
        })}
      </div>

      {/* Warnungen (ehrliche Degradierung statt stiller Fehlannahme) */}
      {billing.warnings.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {billing.warnings.map((w, i) => (
            <div
              key={i}
              className="scc-status scc-status--warn"
              style={{ display: "block", marginTop: 4, fontSize: 11, lineHeight: 1.4, padding: "4px 8px" }}
            >
              {w}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Module Root ─────────────────────────────────────────

export default function Billing() {
  const [meta,   setMeta]   = useState<BillingMeta | null>(null);
  const [status, setStatus] = useState("");          // angewandter Status-Filter (Recent-Liste)
  const [resp,    setResp]    = useState<BillingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState<string | null>(null);

  // Meta einmalig (Filter-Optionen = kanonische Statusliste)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const m = await sccApi.get<BillingMeta>("/billing/meta");
        if (alive) setMeta(m);
      } catch { /* Dropdown bleibt leer — Übersicht funktioniert trotzdem */ }
    })();
    return () => { alive = false; };
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const qs = new URLSearchParams();
      if (status) qs.set("status", status);
      const path = qs.toString() ? `/billing/overview?${qs.toString()}` : "/billing/overview";
      const d = await sccApi.get<BillingOverview>(path);
      setResp(d);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  const totals  = resp?.totals;
  const invoices = resp?.recent_invoices ?? [];
  const attention = resp?.attention ?? [];

  const kpis: Array<[string, string]> = totals
    ? [
        ["Rechnungen", fmtNum(totals.invoices)],
        ["Brutto",     fmtCents(totals.gross_cents)],
        ["Netto",      fmtCents(totals.net_cents)],
        ["Steuer",     fmtCents(totals.tax_cents)],
      ]
    : [];

  return (
    <div>
      <div className="scc-section__header">
        <div>
          <h1 className="scc-section__title">Billing</h1>
          <div className="scc-section__sub">
            Abrechnungsweg, plattformweite Rechnungs-Summen und letzte Rechnungen. Read-only Aggregat — Mutationen laufen über die Payment-/Abo-Pfade.
          </div>
        </div>
        <button className="scc-btn" onClick={() => void load()} aria-label="Reload">↺ Reload</button>
      </div>

      {loading && <div className="scc-muted" style={{ padding: 10 }}>Lade…</div>}
      {err     && <div className="scc-error-inline">{err}</div>}

      {!loading && !err && resp && (
        <>
          {/* ── Provider-Status ──────────────────────────── */}
          <ProviderCard billing={resp.billing} />

          {/* ── Totals KPI-Grid ──────────────────────────── */}
          <div className="scc-grid" style={{ marginBottom: 16 }}>
            {kpis.map(([label, value]) => (
              <div className="scc-card" key={label}>
                <div className="scc-card__eyebrow">{label}</div>
                <div className="scc-card__value" style={{ fontSize: 15 }}>{value}</div>
              </div>
            ))}
          </div>

          {/* ── Überfällig / Inkasso-Worklist ────────────── */}
          {/* Operator-getriebenes Dunning: älteste offene Forderung zuerst.
              KEIN Auto-Cancel, KEINE Mail von hier — nur Sichtbarkeit. */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
              <div style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--scc-muted)" }}>
                Überfällig · Inkasso-Worklist
              </div>
              {attention.length > 0 && (
                <span className="scc-status scc-status--danger" style={{ fontSize: 11 }}>
                  {fmtNum(attention.length)} offen
                </span>
              )}
            </div>

            {attention.length === 0 ? (
              <div className="scc-status scc-status--ok" style={{ display: "block", fontSize: 12, padding: "6px 10px" }}>
                Keine überfälligen Forderungen.
              </div>
            ) : (
              <table className="scc-table">
                <thead>
                  <tr>
                    <th>Nr.</th><th>Kunde</th><th>Plan</th><th>Status</th>
                    <th style={{ textAlign: "right" }}>Betrag</th>
                    <th>Fällig</th>
                    <th style={{ textAlign: "right" }}>Überfällig</th>
                  </tr>
                </thead>
                <tbody>
                  {attention.map((inv) => (
                    <tr key={inv.id}>
                      <td style={{ fontFamily: "var(--scc-mono, monospace)", fontSize: 11 }}>{inv.invoice_number}</td>
                      <td>{inv.billing_name ?? "–"}</td>
                      <td>{planLabel(inv.plan)}</td>
                      <td><span className={`scc-status scc-status--${statusTone(inv.status)}`}>{statusLabel(inv.status)}</span></td>
                      <td style={{ textAlign: "right" }}>{fmtCents(inv.total_cents)}</td>
                      <td>{fmtDateShort(inv.due_at)}</td>
                      <td style={{ textAlign: "right" }}>
                        <span className={`scc-status scc-status--${dunningTone(inv.days_overdue)}`}>
                          {fmtNum(inv.days_overdue)} {inv.days_overdue === 1 ? "Tag" : "Tage"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {attention.length >= resp.scope.attention_limit && (
              <div className="scc-muted" style={{ fontSize: 10, marginTop: 4 }}>
                Begrenzt auf die {fmtNum(resp.scope.attention_limit)} ältesten offenen Forderungen.
              </div>
            )}
          </div>

          {/* ── Summen je Status ─────────────────────────── */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--scc-muted)", marginBottom: 6 }}>
              Summen je Status
            </div>
            <table className="scc-table">
              <thead>
                <tr><th>Status</th><th style={{ textAlign: "right" }}>Anzahl</th><th style={{ textAlign: "right" }}>Brutto</th></tr>
              </thead>
              <tbody>
                {STATUS_ORDER.map((s) => {
                  const b = totals?.by_status?.[s] ?? { count: 0, gross_cents: 0 };
                  return (
                    <tr key={s}>
                      <td><span className={`scc-status scc-status--${statusTone(s)}`}>{statusLabel(s)}</span></td>
                      <td style={{ textAlign: "right" }}>{fmtNum(b.count)}</td>
                      <td style={{ textAlign: "right" }}>{fmtCents(b.gross_cents)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Letzte Rechnungen ────────────────────────── */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
              <div style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--scc-muted)" }}>
                Letzte Rechnungen{resp.scope.status ? ` · ${statusLabel(resp.scope.status)}` : ""}
              </div>
              <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Rechnungen nach Status filtern">
                <option value="">Status: alle</option>
                {(meta?.invoice_statuses ?? STATUS_ORDER).map((s) => (
                  <option key={s} value={s}>{statusLabel(s)}</option>
                ))}
              </select>
            </div>

            {invoices.length === 0 ? (
              <div className="scc-muted" style={{ fontSize: 12, padding: 10 }}>
                {resp.scope.status ? "Keine Rechnungen in diesem Status." : "Noch keine Rechnungen."}
              </div>
            ) : (
              <table className="scc-table">
                <thead>
                  <tr>
                    <th>Nr.</th><th>Kunde</th><th>Plan</th><th>Status</th>
                    <th style={{ textAlign: "right" }}>Betrag</th>
                    <th>Gestellt</th><th>Fällig</th><th>Bezahlt</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td style={{ fontFamily: "var(--scc-mono, monospace)", fontSize: 11 }}>{inv.invoice_number}</td>
                      <td>{inv.billing_name ?? "–"}</td>
                      <td>{planLabel(inv.plan)}</td>
                      <td><span className={`scc-status scc-status--${statusTone(inv.status)}`}>{statusLabel(inv.status)}</span></td>
                      <td style={{ textAlign: "right" }}>{fmtCents(inv.total_cents)}</td>
                      <td>{fmtDateShort(inv.issued_at)}</td>
                      <td>{fmtDateShort(inv.due_at)}</td>
                      <td>{fmtDateShort(inv.paid_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Footer ───────────────────────────────────── */}
          <div style={{ fontSize: 10, color: "var(--scc-muted)", marginTop: 16, borderTop: "1px solid var(--scc-line)", paddingTop: 8 }}>
            Read-only Plattform-Aggregat. Abrechnung/Statuswechsel laufen über die Payment-/Abo-Pfade.
            {" · "}Limit {fmtNum(resp.scope.limit)}
            {" · "}Datenstand: {fmtDate(resp.generated_at)}
          </div>
        </>
      )}
    </div>
  );
}
