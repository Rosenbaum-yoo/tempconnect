/**
 * Marketplace Visibility Center — SCC M-06
 *
 * Tabs:
 *   1. Übersicht       — KPI-Karten + Kurzlisten aus /snapshot
 *   2. Anfragen        — Sichtbarkeits-Anträge (status=submitted) — approve/reject/suspend
 *   3. Review-Queue    — Rating-Moderation (pending/flagged) — approve/reject
 *   4. Bounties        — Wartende Bounties — approve/activate/reject
 *
 * Sicherheitsinvarianten (Backend erzwingt, Frontend spiegelt):
 *   - Approve/Reject:   requireStepUp + requireConfirmAndReason
 *   - Suspend/Activate: requireStepUpHigh + requireConfirmAndReason
 *   - Bounties NIE auto-aktiv: activate ist ein separater High-Step-up-Schritt
 */

import { useState, useCallback } from "react";
import { sccApi }       from "@scc/api/client";
import { useSccQuery }  from "@scc/hooks/useSccQuery";
import { useConfirm }   from "@scc/state/ConfirmContext";
import { useStepUp }    from "@scc/state/StepUpContext";
import { useToast }     from "@scc/state/ToastContext";
import { fmtDate, fmtNum } from "@scc/utils/format";

// ─── Types ───────────────────────────────────────────────────

interface VisibilitySnapshot {
  pending_submissions: number;
  approved_profiles:   number;
  pending_moderation:  number;
  pending_bounties:    number;
  recent_pending:      VisibilityItem[];
  recent_moderation:   ModerationItem[];
  recent_bounties:     BountyItem[];
}

interface VisibilityItem {
  org_id:           string;
  org_name:         string | null;
  status:           string;
  is_public:        boolean;
  submitted_at:     string | null;
  updated_at:       string;
  rejection_reason: string | null;
}

interface ModerationItem {
  moderation_id: string;
  rating_id:     string;
  status:        string;
  flag_reason:   string | null;
  queued_at:     string;
  stars:         number;
  comment:       string | null;
  rated_at:      string;
  rater_name:    string | null;
  rated_name:    string | null;
}

interface BountyItem {
  id:            string;
  org_id:        string;
  org_name:      string | null;
  status:        string;
  bounty_type:   string;
  title:         string | null;
  description:   string | null;
  budget_cents:  number | null;
  expires_at:    string | null;
  staff_note:    string | null;
  created_at:    string;
}

interface AbuseReportItem {
  id:                  string;
  reason:              string;
  details:             string | null;
  status:              string;
  created_at:          string;
  reported_org_name:   string | null;
  reported_org_id:     string;
}

// ─── Tab definition ──────────────────────────────────────────

type TabKey = "overview" | "submissions" | "moderation" | "bounties" | "reports";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview",    label: "Übersicht" },
  { key: "submissions", label: "Anfragen" },
  { key: "moderation",  label: "Review-Queue" },
  { key: "bounties",    label: "Bounties" },
  { key: "reports",     label: "Meldungen" },
];

// ─── Helpers ─────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const tone: Record<string, string> = {
    draft:      "",
    submitted:  "warn",
    approved:   "live",
    rejected:   "danger",
    suspended:  "danger",
    paused:     "stub",
    pending:    "warn",
    flagged:    "danger",
    active:     "live",
    expired:    "stub",
    cancelled:  "stub",
  };
  const cls = tone[status] ? `scc-status scc-status--${tone[status]}` : "scc-status";
  return <span className={cls}>{status}</span>;
}

function fmtBudget(cents: number | null): string {
  if (cents == null) return "–";
  return `${(cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €`;
}

function StarRow({ stars }: { stars: number }) {
  return (
    <span aria-label={`${stars} von 5 Sternen`}>
      {"★".repeat(Math.max(0, Math.min(5, stars)))}{"☆".repeat(5 - Math.max(0, Math.min(5, stars)))}
    </span>
  );
}

// ─── Tab: Übersicht ──────────────────────────────────────────

function OverviewTab() {
  const { data, loading, error, reload } = useSccQuery<{ data: VisibilitySnapshot }>(
    "/marketplace-visibility/snapshot"
  );

  if (loading) return <div className="scc-loading">Lade Übersicht…</div>;
  if (error)   return <div className="scc-error-inline">Fehler: {error}</div>;

  const snap = data?.data;
  if (!snap)   return <div className="scc-muted">Keine Daten.</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <button className="scc-btn" onClick={reload} aria-label="Übersicht neu laden">
          ↺ Reload
        </button>
      </div>

      {/* KPI-Grid */}
      <div className="scc-grid" style={{ marginBottom: 24 }}>
        {[
          ["Offene Anfragen",        snap.pending_submissions,  "warn"],
          ["Genehmigte Profile",     snap.approved_profiles,    "live"],
          ["Bewertungen (Queue)",    snap.pending_moderation,   snap.pending_moderation > 0 ? "warn" : ""],
          ["Bounties (pending)",     snap.pending_bounties,     snap.pending_bounties > 0 ? "warn" : ""],
        ].map(([label, value, tone]) => (
          <div className="scc-card" key={String(label)}>
            <div className="scc-card__eyebrow">{label}</div>
            <div
              className="scc-card__value"
              style={{
                fontSize: 28,
                color: tone === "warn" ? "var(--scc-warn)"
                     : tone === "live" ? "var(--scc-success)"
                     : undefined,
              }}
            >
              {fmtNum(Number(value))}
            </div>
          </div>
        ))}
      </div>

      {/* Recent pending submissions */}
      {snap.recent_pending.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, letterSpacing: ".2em", textTransform: "uppercase", color: "var(--scc-muted)", marginBottom: 6 }}>
            Zuletzt eingereichte Profile
          </div>
          <table className="scc-table">
            <thead>
              <tr><th>Org</th><th>Status</th><th>Eingereicht</th></tr>
            </thead>
            <tbody>
              {snap.recent_pending.map((r) => (
                <tr key={r.org_id}>
                  <td>{r.org_name ?? r.org_id.slice(0, 8) + "…"}</td>
                  <td><StatusPill status={r.status} /></td>
                  <td style={{ color: "var(--scc-muted)", fontSize: 11 }}>
                    {r.submitted_at ? fmtDate(r.submitted_at) : "–"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent moderation queue items */}
      {snap.recent_moderation.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, letterSpacing: ".2em", textTransform: "uppercase", color: "var(--scc-muted)", marginBottom: 6 }}>
            Zuletzt in Moderation-Queue
          </div>
          <table className="scc-table">
            <thead>
              <tr><th>Von</th><th>Für</th><th>Sterne</th><th>Status</th><th>Eingang</th></tr>
            </thead>
            <tbody>
              {snap.recent_moderation.map((m) => (
                <tr key={m.moderation_id}>
                  <td style={{ fontSize: 11 }}>{m.rater_name ?? "–"}</td>
                  <td style={{ fontSize: 11 }}>{m.rated_name ?? "–"}</td>
                  <td><StarRow stars={m.stars} /></td>
                  <td><StatusPill status={m.status} /></td>
                  <td style={{ color: "var(--scc-muted)", fontSize: 11 }}>{fmtDate(m.queued_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent bounties */}
      {snap.recent_bounties.length > 0 && (
        <div>
          <div style={{ fontSize: 10, letterSpacing: ".2em", textTransform: "uppercase", color: "var(--scc-muted)", marginBottom: 6 }}>
            Zuletzt ausstehende Bounties
          </div>
          <table className="scc-table">
            <thead>
              <tr><th>Org</th><th>Typ</th><th>Budget</th><th>Status</th><th>Erstellt</th></tr>
            </thead>
            <tbody>
              {snap.recent_bounties.map((b) => (
                <tr key={b.id}>
                  <td style={{ fontSize: 11 }}>{b.org_name ?? "–"}</td>
                  <td style={{ fontSize: 11 }}>{b.bounty_type}</td>
                  <td style={{ fontSize: 11 }}>{fmtBudget(b.budget_cents)}</td>
                  <td><StatusPill status={b.status} /></td>
                  <td style={{ color: "var(--scc-muted)", fontSize: 11 }}>{fmtDate(b.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {snap.pending_submissions === 0 && snap.pending_moderation === 0 && snap.pending_bounties === 0 && (
        <div className="scc-muted" style={{ textAlign: "center", padding: 32 }}>
          Keine ausstehenden Aktionen.
        </div>
      )}
    </div>
  );
}

// ─── Tab: Anfragen (Sichtbarkeits-Anträge) ───────────────────

function SubmissionsTab() {
  const confirm = useConfirm();
  const stepUp  = useStepUp();
  const toast   = useToast();

  const { data, loading, error, reload } = useSccQuery<{ data: VisibilityItem[] }>(
    "/marketplace-visibility/pending"
  );

  const items: VisibilityItem[] = data?.data ?? [];

  const doApprove = useCallback((orgId: string, orgName: string | null) => {
    confirm({
      title: `Profil genehmigen: ${orgName ?? orgId.slice(0, 8)}`,
      hint:  "Setzt status=approved. Das Profil wird im Marketplace sichtbar. Audit risk_level=medium.",
      onConfirm: async (reason) => {
        await stepUp();
        await sccApi.post(
          `/marketplace-visibility/${encodeURIComponent(orgId)}/approve`,
          { confirmed: true, reason }
        );
        toast.success("Profil genehmigt — jetzt öffentlich sichtbar.");
        reload();
      },
    });
  }, [confirm, stepUp, toast, reload]);

  const doReject = useCallback((orgId: string, orgName: string | null) => {
    confirm({
      title: `Profil ablehnen: ${orgName ?? orgId.slice(0, 8)}`,
      hint:  "Setzt status=rejected. Begründung wird gespeichert. Org kann erneut einreichen.",
      onConfirm: async (reason) => {
        await stepUp();
        await sccApi.post(
          `/marketplace-visibility/${encodeURIComponent(orgId)}/reject`,
          { confirmed: true, reason, rejection_reason: reason }
        );
        toast.warn("Profil abgelehnt.");
        reload();
      },
    });
  }, [confirm, stepUp, toast, reload]);

  const doSuspend = useCallback((orgId: string, orgName: string | null) => {
    confirm({
      title: `Profil suspendieren: ${orgName ?? orgId.slice(0, 8)}`,
      hint:  "HIGH-RISK-AKTION: Setzt status=suspended. Profil sofort aus Marketplace entfernt. Audit risk_level=high.",
      onConfirm: async (reason) => {
        await stepUp();
        await sccApi.post(
          `/marketplace-visibility/${encodeURIComponent(orgId)}/suspend`,
          { confirmed: true, reason, suspension_reason: reason }
        );
        toast.warn("Profil suspendiert.");
        reload();
      },
    });
  }, [confirm, stepUp, toast, reload]);

  if (loading) return <div className="scc-loading">Lade Anfragen…</div>;
  if (error)   return <div className="scc-error-inline">Fehler: {error}</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: "var(--scc-muted)" }}>
          {items.length === 0 ? "Keine offenen Anfragen." : `${items.length} Anfrage${items.length !== 1 ? "n" : ""} in Bearbeitung`}
        </div>
        <button className="scc-btn" onClick={reload} aria-label="Anfragen neu laden">↺ Reload</button>
      </div>

      {items.length === 0 ? (
        <div className="scc-muted" style={{ textAlign: "center", padding: 40 }}>
          Keine eingereichten Profile zur Prüfung.
        </div>
      ) : (
        <table className="scc-table">
          <thead>
            <tr>
              <th>Org</th>
              <th>Status</th>
              <th>Öffentlich?</th>
              <th>Eingereicht</th>
              <th style={{ textAlign: "right" }}>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.org_id}>
                <td>
                  <strong>{r.org_name ?? "–"}</strong>
                  <div style={{ fontSize: 10, color: "var(--scc-muted)" }}>{r.org_id.slice(0, 12)}…</div>
                </td>
                <td><StatusPill status={r.status} /></td>
                <td style={{ fontSize: 12 }}>{r.is_public ? "Ja" : "Nein"}</td>
                <td style={{ fontSize: 11, color: "var(--scc-muted)" }}>
                  {r.submitted_at ? fmtDate(r.submitted_at) : "–"}
                </td>
                <td>
                  <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <button
                      className="scc-btn scc-btn--primary"
                      onClick={() => doApprove(r.org_id, r.org_name)}
                      title="Profil im Marketplace freischalten"
                    >
                      Genehmigen
                    </button>
                    <button
                      className="scc-btn"
                      onClick={() => doReject(r.org_id, r.org_name)}
                      title="Profil ablehnen — Org kann neu einreichen"
                    >
                      Ablehnen
                    </button>
                    <button
                      className="scc-btn scc-btn--danger"
                      onClick={() => doSuspend(r.org_id, r.org_name)}
                      title="Profil sofort suspendieren (High-Risk)"
                    >
                      Suspendieren
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Tab: Review-Queue (Rating-Moderation) ───────────────────

function ModerationTab() {
  const confirm = useConfirm();
  const stepUp  = useStepUp();
  const toast   = useToast();

  const { data, loading, error, reload } = useSccQuery<{ data: ModerationItem[] }>(
    "/marketplace-visibility/moderation-queue"
  );

  const items: ModerationItem[] = data?.data ?? [];

  const doApproveRating = useCallback((ratingId: string, ratedName: string | null) => {
    confirm({
      title: `Bewertung genehmigen für: ${ratedName ?? "Unbekannt"}`,
      hint:  "Setzt status=approved. Bewertung wird öffentlich sichtbar. Audit risk_level=medium.",
      onConfirm: async (reason) => {
        await stepUp();
        await sccApi.post(
          `/marketplace-visibility/ratings/${encodeURIComponent(ratingId)}/approve`,
          { confirmed: true, reason }
        );
        toast.success("Bewertung genehmigt.");
        reload();
      },
    });
  }, [confirm, stepUp, toast, reload]);

  const doRejectRating = useCallback((ratingId: string, ratedName: string | null) => {
    confirm({
      title: `Bewertung ablehnen für: ${ratedName ?? "Unbekannt"}`,
      hint:  "Setzt status=rejected. Bewertung bleibt nicht-öffentlich.",
      onConfirm: async (reason) => {
        await stepUp();
        await sccApi.post(
          `/marketplace-visibility/ratings/${encodeURIComponent(ratingId)}/reject`,
          { confirmed: true, reason, rejection_reason: reason }
        );
        toast.warn("Bewertung abgelehnt.");
        reload();
      },
    });
  }, [confirm, stepUp, toast, reload]);

  if (loading) return <div className="scc-loading">Lade Moderation-Queue…</div>;
  if (error)   return <div className="scc-error-inline">Fehler: {error}</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: "var(--scc-muted)" }}>
          {items.length === 0
            ? "Queue ist leer."
            : `${items.length} Bewertung${items.length !== 1 ? "en" : ""} warten auf Prüfung`}
        </div>
        <button className="scc-btn" onClick={reload} aria-label="Queue neu laden">↺ Reload</button>
      </div>

      {items.length === 0 ? (
        <div className="scc-muted" style={{ textAlign: "center", padding: 40 }}>
          Keine Bewertungen in der Moderation-Queue.
        </div>
      ) : (
        <table className="scc-table">
          <thead>
            <tr>
              <th>Von</th>
              <th>Für</th>
              <th>Sterne</th>
              <th>Kommentar</th>
              <th>Status</th>
              <th>Eingang</th>
              <th style={{ textAlign: "right" }}>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.moderation_id}>
                <td style={{ fontSize: 11 }}>{m.rater_name ?? "–"}</td>
                <td style={{ fontSize: 11 }}>{m.rated_name ?? "–"}</td>
                <td><StarRow stars={m.stars} /></td>
                <td style={{ maxWidth: 200, fontSize: 11, color: "var(--scc-muted)" }}>
                  {m.comment ? (
                    <span title={m.comment}>
                      {m.comment.length > 80 ? m.comment.slice(0, 80) + "…" : m.comment}
                    </span>
                  ) : "–"}
                  {m.flag_reason && (
                    <div style={{ color: "var(--scc-danger)", fontSize: 10, marginTop: 2 }}>
                      Flag: {m.flag_reason}
                    </div>
                  )}
                </td>
                <td><StatusPill status={m.status} /></td>
                <td style={{ fontSize: 11, color: "var(--scc-muted)" }}>{fmtDate(m.queued_at)}</td>
                <td>
                  <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                    <button
                      className="scc-btn scc-btn--primary"
                      onClick={() => doApproveRating(m.rating_id, m.rated_name)}
                      title="Bewertung freischalten"
                    >
                      Genehmigen
                    </button>
                    <button
                      className="scc-btn scc-btn--danger"
                      onClick={() => doRejectRating(m.rating_id, m.rated_name)}
                      title="Bewertung ablehnen"
                    >
                      Ablehnen
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Tab: Bounties ───────────────────────────────────────────

function BountiesTab() {
  const confirm = useConfirm();
  const stepUp  = useStepUp();
  const toast   = useToast();

  const { data, loading, error, reload } = useSccQuery<{ data: BountyItem[] }>(
    "/marketplace-visibility/bounties"
  );

  const [expiresAt, setExpiresAt] = useState<Record<string, string>>({});
  const [staffNote, setStaffNote] = useState<Record<string, string>>({});

  const items: BountyItem[] = data?.data ?? [];

  const doApproveBounty = useCallback((id: string, orgName: string | null) => {
    confirm({
      title: `Bounty genehmigen: ${orgName ?? "Org"}`,
      hint:  "Setzt status=approved. Bounty kann danach (separater Schritt) aktiviert werden. Nicht auto-aktiviert! Audit risk_level=medium.",
      onConfirm: async (reason) => {
        await stepUp();
        await sccApi.post(
          `/marketplace-visibility/bounties/${encodeURIComponent(id)}/approve`,
          {
            confirmed:  true,
            reason,
            expires_at: expiresAt[id] || null,
            staff_note: staffNote[id] || null,
          }
        );
        toast.success("Bounty genehmigt (noch nicht aktiv).");
        reload();
      },
    });
  }, [confirm, stepUp, toast, reload, expiresAt, staffNote]);

  const doActivateBounty = useCallback((id: string, orgName: string | null) => {
    confirm({
      title: `Bounty AKTIVIEREN: ${orgName ?? "Org"}`,
      hint:  "HIGH-RISK: Bounty wird live — sofort für alle Nutzer sichtbar. Nur möglich nach vorheriger Genehmigung. Nicht reversibel ohne Kündigung.",
      onConfirm: async (reason) => {
        await stepUp();
        await sccApi.post(
          `/marketplace-visibility/bounties/${encodeURIComponent(id)}/activate`,
          { confirmed: true, reason }
        );
        toast.success("Bounty aktiviert und live.");
        reload();
      },
    });
  }, [confirm, stepUp, toast, reload]);

  const doRejectBounty = useCallback((id: string, orgName: string | null) => {
    confirm({
      title: `Bounty ablehnen: ${orgName ?? "Org"}`,
      hint:  "Setzt status=rejected. Begründung wird gespeichert.",
      onConfirm: async (reason) => {
        await stepUp();
        await sccApi.post(
          `/marketplace-visibility/bounties/${encodeURIComponent(id)}/reject`,
          { confirmed: true, reason, rejection_reason: reason }
        );
        toast.warn("Bounty abgelehnt.");
        reload();
      },
    });
  }, [confirm, stepUp, toast, reload]);

  if (loading) return <div className="scc-loading">Lade Bounties…</div>;
  if (error)   return <div className="scc-error-inline">Fehler: {error}</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: "var(--scc-muted)" }}>
          {items.length === 0
            ? "Keine ausstehenden Bounties."
            : `${items.length} Bounty${items.length !== 1 ? "s" : ""} warten auf Staff-Aktion`}
        </div>
        <button className="scc-btn" onClick={reload} aria-label="Bounties neu laden">↺ Reload</button>
      </div>

      {items.length === 0 ? (
        <div className="scc-muted" style={{ textAlign: "center", padding: 40 }}>
          Keine Bounties warten auf Staff-Prüfung.
        </div>
      ) : (
        items.map((b) => (
          <div
            key={b.id}
            style={{
              border: "1px solid var(--scc-line)",
              borderRadius: 2,
              padding: "12px 14px",
              marginBottom: 12,
              background: "var(--scc-panel)",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {b.title ?? `Bounty (${b.bounty_type})`}
                </div>
                <div style={{ fontSize: 11, color: "var(--scc-muted)", marginTop: 2 }}>
                  {b.org_name ?? b.org_id.slice(0, 12) + "…"}
                  {" · "}Typ: {b.bounty_type}
                  {" · "}Budget: {fmtBudget(b.budget_cents)}
                  {" · "}Erstellt: {fmtDate(b.created_at)}
                </div>
              </div>
              <StatusPill status={b.status} />
            </div>

            {/* Description */}
            {b.description && (
              <div style={{ fontSize: 12, color: "var(--scc-muted)", marginTop: 8, maxWidth: 600 }}>
                {b.description}
              </div>
            )}

            {/* Approve params */}
            {b.status === "pending" && (
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
                <label style={{ fontSize: 11, color: "var(--scc-muted)" }}>
                  Ablaufdatum (optional):
                </label>
                <input
                  type="date"
                  value={expiresAt[b.id] ?? ""}
                  onChange={(e) => setExpiresAt((prev) => ({ ...prev, [b.id]: e.target.value }))}
                  style={{ maxWidth: 160 }}
                  aria-label="Ablaufdatum Bounty"
                />
                <input
                  type="text"
                  placeholder="Staff-Notiz (optional)"
                  value={staffNote[b.id] ?? ""}
                  onChange={(e) => setStaffNote((prev) => ({ ...prev, [b.id]: e.target.value }))}
                  style={{ maxWidth: 240 }}
                  aria-label="Staff-Notiz zum Bounty"
                />
              </div>
            )}

            {/* Actions */}
            <div style={{
              display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap",
              paddingTop: 8, borderTop: "1px solid var(--scc-line)",
            }}>
              {b.status === "pending" && (
                <>
                  <button
                    className="scc-btn scc-btn--primary"
                    onClick={() => doApproveBounty(b.id, b.org_name)}
                    title="Genehmigen — Bounty noch nicht live"
                  >
                    Genehmigen
                  </button>
                  <button
                    className="scc-btn scc-btn--danger"
                    onClick={() => doRejectBounty(b.id, b.org_name)}
                  >
                    Ablehnen
                  </button>
                </>
              )}
              {b.status === "approved" && (
                <>
                  <button
                    className="scc-btn scc-btn--danger"
                    onClick={() => doActivateBounty(b.id, b.org_name)}
                    title="High-Risk: Bounty sofort live schalten"
                  >
                    Aktivieren (live)
                  </button>
                  <button
                    className="scc-btn"
                    onClick={() => doRejectBounty(b.id, b.org_name)}
                    title="Doch noch ablehnen"
                  >
                    Ablehnen
                  </button>
                </>
              )}
              {(b.status !== "pending" && b.status !== "approved") && (
                <span style={{ fontSize: 11, color: "var(--scc-muted)" }}>
                  Keine Aktionen verfügbar (Status: {b.status}).
                </span>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Tab: Meldungen (Abuse Reports) ─────────────────────────

const REASON_LABELS: Record<string, string> = {
  spam:                  "Spam",
  fake_profile:          "Gefälschtes Profil",
  misleading_info:       "Irreführende Angaben",
  inappropriate_content: "Unangemessener Inhalt",
  other:                 "Sonstiges",
};

function AbuseReportsTab() {
  const confirm = useConfirm();
  const stepUp  = useStepUp();
  const toast   = useToast();

  const { data, loading, error, reload } = useSccQuery<{ data: AbuseReportItem[] }>(
    "/marketplace-visibility/abuse-reports"
  );

  const items: AbuseReportItem[] = data?.data ?? [];

  const doResolve = useCallback((id: string, orgName: string | null) => {
    confirm({
      title: `Meldung erledigen: ${orgName ?? "Org"}`,
      hint:  "Meldung als bearbeitet markieren. Profil bleibt aktiv — ggf. separat suspendieren. Audit risk_level=medium.",
      onConfirm: async (reason) => {
        await stepUp();
        await sccApi.post(
          `/marketplace-visibility/abuse-reports/${encodeURIComponent(id)}/resolve`,
          { confirmed: true, reason }
        );
        toast.success("Meldung als erledigt markiert.");
        reload();
      },
    });
  }, [confirm, stepUp, toast, reload]);

  const doDismiss = useCallback((id: string, orgName: string | null) => {
    confirm({
      title: `Meldung abweisen: ${orgName ?? "Org"}`,
      hint:  "Meldung als unbegründet markieren. Keine weiteren Maßnahmen. Audit risk_level=low.",
      onConfirm: async (reason) => {
        await stepUp();
        await sccApi.post(
          `/marketplace-visibility/abuse-reports/${encodeURIComponent(id)}/dismiss`,
          { confirmed: true, reason }
        );
        toast.warn("Meldung abgewiesen.");
        reload();
      },
    });
  }, [confirm, stepUp, toast, reload]);

  if (loading) return <div className="scc-loading">Lade Meldungen…</div>;
  if (error)   return <div className="scc-error-inline">Fehler: {error}</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: "var(--scc-muted)" }}>
          {items.length === 0
            ? "Keine offenen Meldungen."
            : `${items.length} offene Meldung${items.length !== 1 ? "en" : ""}`}
        </div>
        <button className="scc-btn" onClick={reload} aria-label="Meldungen neu laden">↺ Reload</button>
      </div>

      {items.length === 0 ? (
        <div className="scc-muted" style={{ textAlign: "center", padding: 40 }}>
          Keine offenen Abuse-Reports.
        </div>
      ) : (
        <table className="scc-table">
          <thead>
            <tr>
              <th>Gemeldete Org</th>
              <th>Grund</th>
              <th>Details</th>
              <th>Gemeldet am</th>
              <th style={{ textAlign: "right" }}>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong style={{ fontSize: 13 }}>{r.reported_org_name ?? "–"}</strong>
                  <div style={{ fontSize: 10, color: "var(--scc-muted)" }}>
                    {r.reported_org_id.slice(0, 12)}…
                  </div>
                </td>
                <td>
                  <span className="scc-pill scc-pill--warn" style={{ fontSize: 11 }}>
                    {REASON_LABELS[r.reason] ?? r.reason}
                  </span>
                </td>
                <td style={{ fontSize: 11, color: "var(--scc-muted)", maxWidth: 220 }}>
                  {r.details ? (
                    <span title={r.details}>
                      {r.details.length > 80 ? r.details.slice(0, 80) + "…" : r.details}
                    </span>
                  ) : "–"}
                </td>
                <td style={{ fontSize: 11, color: "var(--scc-muted)" }}>
                  {fmtDate(r.created_at)}
                </td>
                <td>
                  <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <button
                      className="scc-btn scc-btn--danger"
                      onClick={() => doResolve(r.id, r.reported_org_name)}
                      title="Meldung bearbeitet — ggf. Profil separat suspendieren"
                    >
                      Erledigt
                    </button>
                    <button
                      className="scc-btn"
                      onClick={() => doDismiss(r.id, r.reported_org_name)}
                      title="Meldung unbegründet — keine Maßnahme"
                    >
                      Abweisen
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Module Root ─────────────────────────────────────────────

export default function MarketplaceVisibility() {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  return (
    <div>
      {/* Section Header */}
      <div className="scc-section__header">
        <div>
          <h1 className="scc-section__title">Marketplace Visibility Center</h1>
          <div className="scc-section__sub">
            Profilsichtbarkeit · Review-Queue · Bounties — OPT-IN, default OFF.
            {" "}Alle Freischaltungen sind Staff-genehmigt.
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="scc-tabs" role="tablist" aria-label="Marketplace Visibility Tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={activeTab === t.key}
            className={`scc-inbox__filter${activeTab === t.key ? " is-active" : ""}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ marginTop: 16 }}>
        {activeTab === "overview"    && <OverviewTab />}
        {activeTab === "submissions" && <SubmissionsTab />}
        {activeTab === "moderation"  && <ModerationTab />}
        {activeTab === "bounties"    && <BountiesTab />}
        {activeTab === "reports"     && <AbuseReportsTab />}
      </div>
    </div>
  );
}
