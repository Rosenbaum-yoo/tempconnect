/**
 * Mail & Notifications — SCC Phase E/F
 * Read-only Operator-Sicht auf den Mailversand: welcher Provider real aktiv ist
 * (Fähigkeiten + Warnungen aus describeEmail), plattformweite Zustell-Summen je
 * Mail-Status, Kanal-Verteilung und die letzten Notifications (Empfänger maskiert).
 *
 * Reine Aggregations-/Ansichtsschicht: KEINE Mutation, KEIN Versand. Versand/Retry
 * laufen über die bestehenden Notification-/Email-Pfade. "Domain owns truth,
 * SCC owns aggregation."
 *
 * Endpunkte: GET /mail/overview · /mail/meta (beide requireStaff).
 */

import { useState, useEffect, useCallback } from "react";
import { sccApi } from "@scc/api/client";
import { fmtDate, fmtNum } from "@scc/utils/format";

// ─── Types (Shapes = Backend staffMailCenterService.js) ──

interface EmailCapabilities {
  outbound_delivery: boolean;
  pooled_connections: boolean;
  bounce_tracking: boolean;
  dev_logging: boolean;
}

interface EmailProvider {
  provider: "smtp" | "sendgrid" | "console" | "disabled";
  source: string;
  smtp_configured: boolean;
  sendgrid_configured: boolean;
  from: string | null;
  capabilities: EmailCapabilities;
  warnings: string[];
}

interface MailTotals {
  events: number;
  by_status: Record<string, number>;
}

interface EventRow {
  event_key: string;
  total: number;
  failed: number;
  no_smtp: number;
}

interface RecentRow {
  id: string;
  created_at: string | null;
  context_type: string;
  event_key: string;
  recipient_role: string;
  recipient: string | null;
  dispatched_via: string;
  mail_status: string | null;
  mail_error: string | null;
}

interface OverviewScope {
  platform: boolean;
  status: string | null;
  limit: number;
}

interface MailOverview {
  available: boolean;
  email: EmailProvider;
  totals: MailTotals;
  channels: Record<string, number>;
  events_by_key: EventRow[];
  recent: RecentRow[];
  scope: OverviewScope;
  generated_at: string;
}

interface MailMeta {
  mail_statuses: string[];
  dispatch_channels: string[];
}

// ─── Labels & Tones ──────────────────────────────────────

const PROVIDER_LABELS: Record<string, string> = {
  smtp:     "SMTP",
  sendgrid: "SendGrid",
  console:  "Console (nur Logging)",
  disabled: "Deaktiviert",
};

const STATUS_LABELS: Record<string, string> = {
  ok:      "Zugestellt",
  failed:  "Fehlgeschlagen",
  no_smtp: "Kein SMTP",
  skipped: "Übersprungen",
  none:    "Nur in-app",
};

const STATUS_TONE: Record<string, string> = {
  ok:      "ok",
  failed:  "danger",
  no_smtp: "warn",
  skipped: "warn",
  none:    "warn",
};

const STATUS_ORDER = ["ok", "failed", "no_smtp", "skipped", "none"];

const CHANNEL_LABELS: Record<string, string> = {
  db:      "In-App",
  email:   "E-Mail",
  both:    "In-App + Mail",
  skipped: "Übersprungen",
};

const CHANNEL_ORDER = ["both", "email", "db", "skipped"];

const CONTEXT_LABELS: Record<string, string> = {
  subscription_request: "Abo-Anfrage",
  enterprise_request:   "Enterprise-Anfrage",
};

const ROLE_LABELS: Record<string, string> = {
  customer: "Kunde",
  staff:    "Staff",
};

// Reihenfolge der Capability-Pills (= describeEmail-Felder)
const CAPS: Array<[keyof EmailCapabilities, string]> = [
  ["outbound_delivery",  "Echter Versand"],
  ["pooled_connections", "Pooling"],
  ["bounce_tracking",    "Bounce-Tracking"],
  ["dev_logging",        "Dev-Logging"],
];

function providerLabel(p: string): string { return PROVIDER_LABELS[p] ?? p; }
function statusLabel(s: string): string { return STATUS_LABELS[s] ?? s; }
function statusTone(s: string): string { return STATUS_TONE[s] ?? "warn"; }
function channelLabel(c: string): string { return CHANNEL_LABELS[c] ?? c; }
function contextLabel(c: string): string { return CONTEXT_LABELS[c] ?? c; }
function roleLabel(r: string): string { return ROLE_LABELS[r] ?? r; }

/** Provider-Pill-Tonalität: disabled=danger, echter Versand=live, sonst neutral (console = Dev). */
function providerPillClass(e: EmailProvider): string {
  if (e.provider === "disabled") return " scc-pill--danger";
  if (e.capabilities.outbound_delivery) return " scc-pill--live";
  return ""; // console / fehlkonfiguriert → neutral, Warnung steht separat
}

// ─── Provider-Status-Karte ───────────────────────────────

function ProviderCard({ email }: { email: EmailProvider }) {
  const caps = email.capabilities;
  return (
    <div className="scc-card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div className="scc-card__eyebrow">Versandweg</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
            <span className={`scc-pill${providerPillClass(email)}`} style={{ fontSize: 13 }}>
              {providerLabel(email.provider)}
            </span>
            <span className="scc-pill scc-pill--stub" style={{ fontSize: 10 }} title="Herkunft der Provider-Auflösung">
              {email.source === "explicit" ? "explizit gesetzt" : "abgeleitet"}
            </span>
            {email.from && (
              <span className="scc-pill" style={{ fontSize: 10 }} title="Absenderadresse (SMTP_FROM)">
                Von: {email.from}
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
      {email.warnings.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {email.warnings.map((w, i) => (
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

export default function Mail() {
  const [meta,    setMeta]    = useState<MailMeta | null>(null);
  const [status,  setStatus]  = useState("");          // angewandter Status-Filter (Recent-Liste)
  const [resp,    setResp]    = useState<MailOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState<string | null>(null);

  // Meta einmalig (Filter-Optionen = kanonische Statusliste)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const m = await sccApi.get<MailMeta>("/mail/meta");
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
      const path = qs.toString() ? `/mail/overview?${qs.toString()}` : "/mail/overview";
      const d = await sccApi.get<MailOverview>(path);
      setResp(d);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  const totals  = resp?.totals;
  const channels = resp?.channels;
  const events  = resp?.events_by_key ?? [];
  const recent  = resp?.recent ?? [];

  const kpis: Array<[string, string]> = totals
    ? [
        ["Ereignisse",     fmtNum(totals.events)],
        ["Zugestellt",     fmtNum(totals.by_status.ok ?? 0)],
        ["Fehlgeschlagen", fmtNum(totals.by_status.failed ?? 0)],
        ["Kein SMTP",      fmtNum(totals.by_status.no_smtp ?? 0)],
      ]
    : [];

  return (
    <div>
      <div className="scc-section__header">
        <div>
          <h1 className="scc-section__title">Mail &amp; Notifications</h1>
          <div className="scc-section__sub">
            Versandweg, plattformweite Zustell-Summen und letzte Notifications. Read-only Aggregat — Versand/Retry laufen über die Notification-/Email-Pfade.
          </div>
        </div>
        <button className="scc-btn" onClick={() => void load()} aria-label="Reload">↺ Reload</button>
      </div>

      {loading && <div className="scc-muted" style={{ padding: 10 }}>Lade…</div>}
      {err     && <div className="scc-error-inline">{err}</div>}

      {!loading && !err && resp && (
        <>
          {/* ── Provider-Status ──────────────────────────── */}
          <ProviderCard email={resp.email} />

          {/* ── Totals KPI-Grid ──────────────────────────── */}
          <div className="scc-grid" style={{ marginBottom: 16 }}>
            {kpis.map(([label, value]) => (
              <div className="scc-card" key={label}>
                <div className="scc-card__eyebrow">{label}</div>
                <div className="scc-card__value" style={{ fontSize: 15 }}>{value}</div>
              </div>
            ))}
          </div>

          {/* ── Summen je Mail-Status ────────────────────── */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--scc-muted)", marginBottom: 6 }}>
              Summen je Mail-Status
            </div>
            <table className="scc-table">
              <thead>
                <tr><th>Status</th><th style={{ textAlign: "right" }}>Anzahl</th></tr>
              </thead>
              <tbody>
                {STATUS_ORDER.map((s) => (
                  <tr key={s}>
                    <td><span className={`scc-status scc-status--${statusTone(s)}`}>{statusLabel(s)}</span></td>
                    <td style={{ textAlign: "right" }}>{fmtNum(totals?.by_status?.[s] ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Kanal-Verteilung ─────────────────────────── */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--scc-muted)", marginBottom: 6 }}>
              Zustellkanäle
            </div>
            <table className="scc-table">
              <thead>
                <tr><th>Kanal</th><th style={{ textAlign: "right" }}>Anzahl</th></tr>
              </thead>
              <tbody>
                {CHANNEL_ORDER.map((c) => (
                  <tr key={c}>
                    <td>{channelLabel(c)}</td>
                    <td style={{ textAlign: "right" }}>{fmtNum(channels?.[c] ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Verteilung je Event-Typ ──────────────────── */}
          {events.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--scc-muted)", marginBottom: 6 }}>
                Nach Event-Typ
              </div>
              <table className="scc-table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th style={{ textAlign: "right" }}>Gesamt</th>
                    <th style={{ textAlign: "right" }}>Fehlgeschlagen</th>
                    <th style={{ textAlign: "right" }}>Kein SMTP</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev) => (
                    <tr key={ev.event_key}>
                      <td style={{ fontFamily: "var(--scc-mono, monospace)", fontSize: 11 }}>{ev.event_key}</td>
                      <td style={{ textAlign: "right" }}>{fmtNum(ev.total)}</td>
                      <td style={{ textAlign: "right" }}>
                        {ev.failed > 0
                          ? <span className="scc-status scc-status--danger">{fmtNum(ev.failed)}</span>
                          : <span className="scc-muted">0</span>}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {ev.no_smtp > 0
                          ? <span className="scc-status scc-status--warn">{fmtNum(ev.no_smtp)}</span>
                          : <span className="scc-muted">0</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Letzte Notifications ─────────────────────── */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
              <div style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--scc-muted)" }}>
                Letzte Notifications{resp.scope.status ? ` · ${statusLabel(resp.scope.status)}` : ""}
              </div>
              <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Notifications nach Mail-Status filtern">
                <option value="">Status: alle</option>
                {(meta?.mail_statuses ?? STATUS_ORDER).map((s) => (
                  <option key={s} value={s}>{statusLabel(s)}</option>
                ))}
              </select>
            </div>

            {recent.length === 0 ? (
              <div className="scc-muted" style={{ fontSize: 12, padding: 10 }}>
                {resp.scope.status ? "Keine Notifications in diesem Status." : "Noch keine Notifications."}
              </div>
            ) : (
              <table className="scc-table">
                <thead>
                  <tr>
                    <th>Zeit</th><th>Kontext</th><th>Event</th><th>Empfänger</th>
                    <th>Kanal</th><th>Status</th><th>Fehler</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r) => (
                    <tr key={r.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{fmtDate(r.created_at)}</td>
                      <td>{contextLabel(r.context_type)}</td>
                      <td style={{ fontFamily: "var(--scc-mono, monospace)", fontSize: 11 }}>{r.event_key}</td>
                      <td>
                        <span style={{ fontFamily: "var(--scc-mono, monospace)", fontSize: 11 }}>{r.recipient ?? "–"}</span>
                        <span className="scc-muted" style={{ fontSize: 10, marginLeft: 6 }}>{roleLabel(r.recipient_role)}</span>
                      </td>
                      <td>{channelLabel(r.dispatched_via)}</td>
                      <td>
                        {r.mail_status
                          ? <span className={`scc-status scc-status--${statusTone(r.mail_status)}`}>{statusLabel(r.mail_status)}</span>
                          : <span className="scc-muted">–</span>}
                      </td>
                      <td style={{ fontSize: 11, color: "var(--scc-muted)", maxWidth: 260, wordBreak: "break-word" }}>
                        {r.mail_error ?? "–"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Footer ───────────────────────────────────── */}
          <div style={{ fontSize: 10, color: "var(--scc-muted)", marginTop: 16, borderTop: "1px solid var(--scc-line)", paddingTop: 8 }}>
            Read-only Plattform-Aggregat. Empfänger PII-maskiert. Versand/Retry laufen über die Notification-/Email-Pfade.
            {" · "}Limit {fmtNum(resp.scope.limit)}
            {" · "}Datenstand: {fmtDate(resp.generated_at)}
          </div>
        </>
      )}
    </div>
  );
}
