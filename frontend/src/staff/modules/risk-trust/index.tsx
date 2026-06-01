/**
 * Risk / Trust — SCC WAVE 09
 *
 * KPI-Karten (4): DSGVO offen · Compliance abgelaufen · läuft ≤30T ab · High-Risk-Aktionen 7T
 * DSGVO-Anfragen-Liste: offene pending/in_progress, älteste zuerst (Fristen-Priorität)
 *   Typ / Betreff-Typ / Org / Status / Erstellt / Notiz
 *   "Alle laden"-Button → Drill-Down über GET /risk-trust/dsgvo-requests
 * Compliance-Dokumente: abgelaufen + läuft in 30 Tagen ab, farbkodiert
 *   "Alle laden"-Button → Drill-Down über GET /risk-trust/compliance-docs
 * High-Risk-Audit-Timeline: High/Critical Staff-Aktionen letzte 7 Tage
 * Vollständiger Zero-State pro Sektion
 */

import { useState, useCallback } from "react";
import { useSccQuery }  from "@scc/hooks/useSccQuery";
import { sccApi }       from "@scc/api/client";
import { fmtNum }       from "@scc/utils/format";

// ─── Types ───────────────────────────────────────────────────

interface RiskKpi {
  dsgvo_requests_open:         number;
  compliance_docs_expired:     number;
  compliance_docs_expiring_30d:number;
  high_risk_actions_7d:        number;
}

interface DsgvoRequest {
  id:                  string;
  request_type:        string;
  subject_type:        string;
  status:              string;
  notes:               string | null;
  created_at:          string;
  org_name:            string | null;
  requested_by_name:   string | null;
  requested_by_email:  string | null;
}

interface ComplianceDoc {
  id:         string;
  doc_type:   string;
  doc_name:   string;
  status:     string;
  valid_from: string | null;
  valid_until:string | null;
  org_name:   string | null;
}

interface AuditEntry {
  id:         string;
  actor_id:   string | null;
  area:       string;
  action:     string;
  status:     string;
  risk_level: string;
  reason:     string | null;
  created_at: string;
}

interface RiskSnapshot {
  generated_at:        string;
  kpi:                 RiskKpi;
  dsgvo_recent:        DsgvoRequest[];
  compliance_expiring: ComplianceDoc[];
  high_risk_audit:     AuditEntry[];
  errors?:             Array<{ area: string; error: string }>;
}

interface DrillDownResponse {
  items: DsgvoRequest[] | ComplianceDoc[];
  total: number;
  limit: number;
  offset: number;
}

// ─── Lookup-Tabellen ─────────────────────────────────────────

const REQUEST_TYPE_LABELS: Record<string, string> = {
  export:           "Datenexport",
  deletion:         "Löschung",
  anonymization:    "Anonymisierung",
  retention_review: "Aufbewahrungsprüfung",
  inquiry:          "Auskunft",
};

const SUBJECT_TYPE_LABELS: Record<string, string> = {
  user:         "Nutzer",
  worker:       "Arbeitnehmer",
  organization: "Organisation",
};

const STATUS_LABELS: Record<string, string> = {
  pending:     "Ausstehend",
  in_progress: "In Bearbeitung",
  completed:   "Abgeschlossen",
  rejected:    "Abgelehnt",
  cancelled:   "Storniert",
};

const STATUS_TONES: Record<string, string> = {
  pending:     "warn",
  in_progress: "warn",
  completed:   "ok",
  rejected:    "danger",
  cancelled:   "",
};

const DOC_TYPE_LABELS: Record<string, string> = {
  aueg_erlaubnis:    "AÜG-Erlaubnis",
  unbedenklichkeit:  "Unbedenklichkeit",
  uvv_nachweis:      "UVV-Nachweis",
  versicherung:      "Versicherung",
  zertifikat:        "Zertifikat",
  gewerbeanmeldung:  "Gewerbeanmeldung",
  handelsregister:   "Handelsregister",
  datenschutz:       "Datenschutz",
  arbeitssicherheit: "Arbeitssicherheit",
  qualifikation:     "Qualifikation",
  sonstige:          "Sonstige",
};

const RISK_TONES: Record<string, string> = {
  critical: "danger",
  high:     "danger",
  medium:   "warn",
  low:      "ok",
};

// ─── Helpers ─────────────────────────────────────────────────

function expiryTone(validUntil: string | null): string {
  if (!validUntil) return "";
  const diffMs = new Date(validUntil).getTime() - Date.now();
  const days   = diffMs / 86_400_000;
  if (days < 0)  return "danger";   // bereits abgelaufen
  if (days < 7)  return "danger";
  if (days < 30) return "warn";
  return "ok";
}

function fmtExpiry(validUntil: string | null): string {
  if (!validUntil) return "–";
  const diffMs = new Date(validUntil).getTime() - Date.now();
  const days   = Math.floor(Math.abs(diffMs) / 86_400_000);
  if (diffMs < 0) return `${days}T überfällig`;
  if (days === 0) return "heute";
  return `in ${days}T`;
}

function fmtDateShort(d: string): string {
  return new Date(d).toLocaleDateString("de-DE", {
    day: "2-digit", month: "2-digit", year: "2-digit",
  });
}

function fmtDateTime(d: string): string {
  return new Date(d).toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function ageDays(d: string): number {
  return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
}

// ─── Component ───────────────────────────────────────────────

export default function RiskTrust() {
  const { data, loading, error, reload } = useSccQuery<RiskSnapshot>("/risk-trust");

  // DSGVO Drill-Down
  const [dsgvoFull,        setDsgvoFull]        = useState<DsgvoRequest[] | null>(null);
  const [dsgvoLoading,     setDsgvoLoading]      = useState(false);
  const [dsgvoErr,         setDsgvoErr]          = useState<string | null>(null);

  // Compliance Drill-Down
  const [compFull,         setCompFull]          = useState<ComplianceDoc[] | null>(null);
  const [compLoading,      setCompLoading]        = useState(false);
  const [compErr,          setCompErr]            = useState<string | null>(null);

  const loadAllDsgvo = useCallback(async () => {
    setDsgvoLoading(true); setDsgvoErr(null);
    try {
      const resp = await sccApi.get<DrillDownResponse>("/risk-trust/dsgvo-requests");
      setDsgvoFull(resp.items as DsgvoRequest[]);
    } catch (e: unknown) {
      setDsgvoErr(e instanceof Error ? e.message : String(e));
    } finally { setDsgvoLoading(false); }
  }, []);

  const loadAllComp = useCallback(async () => {
    setCompLoading(true); setCompErr(null);
    try {
      const resp = await sccApi.get<DrillDownResponse>("/risk-trust/compliance-docs");
      setCompFull(resp.items as ComplianceDoc[]);
    } catch (e: unknown) {
      setCompErr(e instanceof Error ? e.message : String(e));
    } finally { setCompLoading(false); }
  }, []);

  // ── Loading / Error ───────────────────────────────────────
  if (loading) return <div className="scc-loading">Lade Risk / Trust…</div>;
  if (error) return (
    <div className="scc-error-inline">
      Fehler: {error}
      <button className="scc-btn" onClick={reload} style={{ marginLeft: 8 }}>Retry</button>
    </div>
  );

  const kpi     = data?.kpi ?? { dsgvo_requests_open: 0, compliance_docs_expired: 0, compliance_docs_expiring_30d: 0, high_risk_actions_7d: 0 };
  const dsgvo   = dsgvoFull ?? data?.dsgvo_recent ?? [];
  const comp    = compFull  ?? data?.compliance_expiring ?? [];
  const audit   = data?.high_risk_audit ?? [];
  const totalDsgvo = kpi.dsgvo_requests_open;
  const totalComp  = kpi.compliance_docs_expired + kpi.compliance_docs_expiring_30d;

  // Trust-Score ableiten
  const trustScore =
    kpi.dsgvo_requests_open === 0 &&
    kpi.compliance_docs_expired === 0 &&
    kpi.high_risk_actions_7d === 0
      ? "ok" : kpi.dsgvo_requests_open > 5 || kpi.compliance_docs_expired > 3
        ? "danger" : "warn";

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="scc-section__header">
        <h1 className="scc-section__title">Risk / Trust</h1>
        <div className="scc-section__sub">
          DSGVO · Compliance · High-Risk-Aktionen
          {data?.generated_at && (
            <span className="scc-muted" style={{ marginLeft: 8, fontSize: 11 }}>
              Stand: {new Date(data.generated_at).toLocaleTimeString("de-DE")}
            </span>
          )}
          <button
            className="scc-btn"
            onClick={reload}
            style={{ marginLeft: 12, fontSize: 11, padding: "2px 8px" }}
          >
            ↺
          </button>
        </div>
      </div>

      {/* ── KPI-Karten ─────────────────────────────────────── */}
      <div className="scc-grid">
        <div className={`scc-card${kpi.dsgvo_requests_open > 0 ? kpi.dsgvo_requests_open >= 5 ? " scc-card--danger" : " scc-card--warn" : ""}`}>
          <div className="scc-card__eyebrow">DSGVO-Anfragen offen</div>
          <div className="scc-card__value">{fmtNum(kpi.dsgvo_requests_open)}</div>
          <div className="scc-card__hint">
            {kpi.dsgvo_requests_open === 0
              ? "Keine offenen Anfragen."
              : kpi.dsgvo_requests_open < 5
              ? "Bitte zeitnah bearbeiten (Fristen)."
              : "Kritisch — Fristen prüfen, ggf. eskalieren."}
          </div>
        </div>

        <div className={`scc-card${kpi.compliance_docs_expired > 0 ? " scc-card--danger" : kpi.compliance_docs_expiring_30d > 0 ? " scc-card--warn" : ""}`}>
          <div className="scc-card__eyebrow">Compliance-Dokumente</div>
          <div className="scc-card__value">{fmtNum(kpi.compliance_docs_expired)}</div>
          <div className="scc-card__hint">
            abgelaufen · {fmtNum(kpi.compliance_docs_expiring_30d)} läuft ≤30T ab
          </div>
        </div>

        <div className={`scc-card${kpi.high_risk_actions_7d > 0 ? " scc-card--warn" : ""}`}>
          <div className="scc-card__eyebrow">High-Risk-Aktionen 7T</div>
          <div className="scc-card__value">{fmtNum(kpi.high_risk_actions_7d)}</div>
          <div className="scc-card__hint">High / Critical Staff-Aktionen</div>
        </div>

        <div className={`scc-card scc-card--${trustScore}`}>
          <div className="scc-card__eyebrow">Trust-Score</div>
          <div className="scc-card__value">
            {trustScore === "ok" ? "GRÜN" : trustScore === "warn" ? "HANDLUNGSBEDARF" : "KRITISCH"}
          </div>
          <div className="scc-card__hint">
            {trustScore === "ok"
              ? "Keine offenen Risiko-Items."
              : `${kpi.dsgvo_requests_open + kpi.compliance_docs_expired} offene Pflicht-Items.`}
          </div>
        </div>
      </div>

      {/* ── DSGVO-Anfragen ──────────────────────────────────── */}
      <div className="scc-section__header" style={{ marginTop: 20 }}>
        <h2 className="scc-section__title" style={{ fontSize: 14 }}>DSGVO-Anfragen</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="scc-muted" style={{ fontSize: 12 }}>{totalDsgvo} offen</span>
          {!dsgvoFull && totalDsgvo > 10 && (
            <button
              className="scc-btn"
              style={{ fontSize: 11, padding: "2px 8px" }}
              onClick={loadAllDsgvo}
              disabled={dsgvoLoading}
            >
              {dsgvoLoading ? "Laden…" : `Alle ${totalDsgvo} laden`}
            </button>
          )}
        </div>
      </div>

      {dsgvoErr && (
        <div className="scc-error-inline" style={{ marginBottom: 12, fontSize: 12 }}>
          {dsgvoErr}
        </div>
      )}

      {dsgvo.length === 0 ? (
        <div className="scc-empty-state" style={{ marginBottom: 24 }}>
          <div className="scc-empty-state__icon">✓</div>
          <div className="scc-empty-state__text">Keine offenen DSGVO-Anfragen.</div>
        </div>
      ) : (
        <table className="scc-table" style={{ marginBottom: 28 }}>
          <thead>
            <tr>
              <th>Typ</th>
              <th>Betreff</th>
              <th>Org</th>
              <th>Anfrager</th>
              <th>Status</th>
              <th>Alter</th>
              <th>Erstellt</th>
            </tr>
          </thead>
          <tbody>
            {dsgvo.map((r) => (
              <tr key={r.id}>
                <td>
                  <span className="scc-code" style={{ fontSize: 11 }}>
                    {REQUEST_TYPE_LABELS[r.request_type] ?? r.request_type}
                  </span>
                </td>
                <td className="scc-muted" style={{ fontSize: 12 }}>
                  {SUBJECT_TYPE_LABELS[r.subject_type] ?? r.subject_type}
                </td>
                <td className="scc-muted" style={{ fontSize: 12 }}>{r.org_name ?? "–"}</td>
                <td className="scc-muted" style={{ fontSize: 11 }}>
                  {r.requested_by_name ?? r.requested_by_email ?? "–"}
                </td>
                <td>
                  <span className={`scc-status scc-status--${STATUS_TONES[r.status] ?? ""}`}>
                    {STATUS_LABELS[r.status] ?? r.status}
                  </span>
                </td>
                <td style={{
                  fontSize: 12,
                  color: ageDays(r.created_at) > 25 ? "var(--scc-danger)"
                       : ageDays(r.created_at) > 10 ? "var(--scc-warn)"
                       : "inherit",
                }}>
                  {ageDays(r.created_at)}T
                </td>
                <td className="scc-muted" style={{ fontSize: 11 }}>{fmtDateShort(r.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── Compliance-Dokumente ────────────────────────────── */}
      <div className="scc-section__header">
        <h2 className="scc-section__title" style={{ fontSize: 14 }}>Compliance-Dokumente</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="scc-muted" style={{ fontSize: 12 }}>
            {fmtNum(kpi.compliance_docs_expired)} abgelaufen
            {kpi.compliance_docs_expiring_30d > 0 && ` · ${fmtNum(kpi.compliance_docs_expiring_30d)} läuft ≤30T ab`}
          </span>
          {!compFull && totalComp > 20 && (
            <button
              className="scc-btn"
              style={{ fontSize: 11, padding: "2px 8px" }}
              onClick={loadAllComp}
              disabled={compLoading}
            >
              {compLoading ? "Laden…" : `Alle ${totalComp} laden`}
            </button>
          )}
        </div>
      </div>

      {compErr && (
        <div className="scc-error-inline" style={{ marginBottom: 12, fontSize: 12 }}>
          {compErr}
        </div>
      )}

      {comp.length === 0 ? (
        <div className="scc-empty-state" style={{ marginBottom: 24 }}>
          <div className="scc-empty-state__icon">✓</div>
          <div className="scc-empty-state__text">Alle Compliance-Dokumente gültig.</div>
        </div>
      ) : (
        <table className="scc-table" style={{ marginBottom: 28 }}>
          <thead>
            <tr>
              <th>Org</th>
              <th>Dokumenttyp</th>
              <th>Name</th>
              <th>Status</th>
              <th>Gültig bis</th>
              <th>Frist</th>
            </tr>
          </thead>
          <tbody>
            {comp.map((d) => {
              const tone = expiryTone(d.valid_until);
              return (
                <tr key={d.id}>
                  <td className="scc-muted" style={{ fontSize: 12 }}>{d.org_name ?? "–"}</td>
                  <td>
                    <span className="scc-code" style={{ fontSize: 11 }}>
                      {DOC_TYPE_LABELS[d.doc_type] ?? d.doc_type}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {d.doc_name}
                  </td>
                  <td>
                    <span className={`scc-status scc-status--${STATUS_TONES[d.status] ?? ""}`}>
                      {STATUS_LABELS[d.status] ?? d.status}
                    </span>
                  </td>
                  <td className="scc-muted" style={{ fontSize: 12 }}>
                    {d.valid_until ? fmtDateShort(d.valid_until) : "–"}
                  </td>
                  <td style={{ fontSize: 12, color: `var(--scc-${tone || "text"})`, fontWeight: tone === "danger" ? 600 : undefined }}>
                    {fmtExpiry(d.valid_until)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* ── High-Risk-Audit-Timeline ─────────────────────────── */}
      <div className="scc-section__header">
        <h2 className="scc-section__title" style={{ fontSize: 14 }}>High-Risk-Aktionen (letzte 7 Tage)</h2>
        <span className="scc-muted" style={{ fontSize: 12 }}>
          {fmtNum(kpi.high_risk_actions_7d)} Einträge
        </span>
      </div>

      {audit.length === 0 ? (
        <div className="scc-empty-state" style={{ marginBottom: 24 }}>
          <div className="scc-empty-state__icon">✓</div>
          <div className="scc-empty-state__text">Keine High/Critical-Aktionen in den letzten 7 Tagen.</div>
        </div>
      ) : (
        <table className="scc-table">
          <thead>
            <tr>
              <th>Zeitpunkt</th>
              <th>Bereich</th>
              <th>Aktion</th>
              <th>Risiko</th>
              <th>Status</th>
              <th>Begründung</th>
            </tr>
          </thead>
          <tbody>
            {audit.map((a) => (
              <tr key={a.id}>
                <td className="scc-muted" style={{ fontSize: 11, whiteSpace: "nowrap" }}>
                  {fmtDateTime(a.created_at)}
                </td>
                <td>
                  <span className="scc-code" style={{ fontSize: 11 }}>{a.area}</span>
                </td>
                <td style={{ fontSize: 12, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.action}
                </td>
                <td>
                  <span className={`scc-status scc-status--${RISK_TONES[a.risk_level] ?? ""}`}>
                    {a.risk_level}
                  </span>
                </td>
                <td className="scc-muted" style={{ fontSize: 12 }}>
                  {a.status}
                </td>
                <td className="scc-muted" style={{ fontSize: 12, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.reason ?? "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Backend-Warnungen */}
      {(data?.errors?.length ?? 0) > 0 && (
        <div style={{
          marginTop: 20, padding: "8px 12px",
          background: "rgba(255,108,114,0.06)",
          borderRadius: 6, border: "1px solid var(--scc-danger)",
        }}>
          <div style={{ fontSize: 11, color: "var(--scc-danger)", marginBottom: 4 }}>
            Backend-Warnungen:
          </div>
          {data!.errors!.map((e, i) => (
            <div key={i} className="scc-muted" style={{ fontSize: 11 }}>{e.area}: {e.error}</div>
          ))}
        </div>
      )}
    </div>
  );
}
