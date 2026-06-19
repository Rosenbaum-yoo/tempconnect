/**
 * Support Vendor Management — externer Support (BPO, z.B. Indien).
 *
 * Vendor-Lebenszyklus + externe Agenten. Externe Agenten arbeiten erst, wenn
 * der Vendor VERIFIZIERT ist (status='active', Gate api/middleware/supportAccess.js)
 * und optional aus freigegebenen IP-Netzen. Alle Mutationen: Step-up + Confirm +
 * Reason + serverseitiges Audit (staff_control.support_vendor.*).
 */
import { useState, useCallback, useEffect } from "react";
import { useSccQuery } from "@scc/hooks/useSccQuery";
import { sccApi } from "@scc/api/client";
import { useConfirm } from "@scc/state/ConfirmContext";
import { useStepUp } from "@scc/state/StepUpContext";
import { useToast } from "@scc/state/ToastContext";
import { fmtDate } from "@scc/utils/format";

interface VendorRow {
  id: string; name: string; contract_ref: string | null; status: string; is_active: boolean;
  allowed_ip_cidrs: string[]; verified_at: string | null; created_at: string; active_agents: number;
}
interface AgentRow {
  id: string; email: string; role: string; scope: string; data_scope: string; is_active: boolean; created_at: string;
}
interface VendorDetail extends VendorRow { verified_by: string | null; updated_at: string; agents: AgentRow[]; }

const EXTERNAL_ROLES = ["external_support_agent", "external_support_supervisor"];

function statusTone(status: string) {
  return status === "active" ? "ok" : status === "suspended" ? "danger" : "warn";
}
function statusLabel(status: string) {
  return status === "active" ? "Verifiziert" : status === "suspended" ? "Gesperrt" : "Ausstehend";
}

export default function SupportVendors() {
  const { data, loading, error, reload } = useSccQuery<{ items: VendorRow[] }>("/support-vendors");
  const confirm = useConfirm();
  const stepUp = useStepUp();
  const toast = useToast();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<VendorDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Formularfelder
  const [newName, setNewName] = useState("");
  const [newContract, setNewContract] = useState("");
  const [ipText, setIpText] = useState("");
  const [agentEmail, setAgentEmail] = useState("");
  const [agentRole, setAgentRole] = useState(EXTERNAL_ROLES[0]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const d = await sccApi.get<VendorDetail>(`/support-vendors/${id}`);
      setDetail(d);
      setIpText((d.allowed_ip_cidrs || []).join(", "));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Detail konnte nicht geladen werden.");
    } finally {
      setDetailLoading(false);
    }
  }, [toast]);

  useEffect(() => { if (selectedId) loadDetail(selectedId); else setDetail(null); }, [selectedId, loadDetail]);

  const refreshAll = useCallback(() => { reload(); if (selectedId) loadDetail(selectedId); }, [reload, selectedId, loadDetail]);

  // ── Mutationen (Step-up + Confirm + Reason) ──────────────────────────────
  const runMutation = useCallback((title: string, hint: string, fn: (reason: string) => Promise<void>, dangerLabel?: string) => {
    confirm({
      title, hint, dangerLabel,
      onConfirm: async (reason) => { await stepUp(); await fn(reason); },
    });
  }, [confirm, stepUp]);

  const createVendor = () => {
    const name = newName.trim();
    if (!name) { toast.warn("Bitte einen Vendor-Namen eingeben."); return; }
    runMutation(`Vendor anlegen: ${name}`, "Der Vendor startet als 'Ausstehend' und muss separat verifiziert werden.", async (reason) => {
      await sccApi.post("/support-vendors", { confirmed: true, reason, name, contract_ref: newContract.trim() || null });
      toast.success(`Vendor "${name}" angelegt (Status: Ausstehend).`);
      setNewName(""); setNewContract(""); reload();
    });
  };

  const verifyVendor = (v: VendorRow) => runMutation(
    `Vendor verifizieren: ${v.name}`,
    "Damit dürfen externe Agenten dieses Vendors arbeiten. Nur freigeben, wenn der Dienstleister vertraglich + sicherheitstechnisch geprüft ist.",
    async (reason) => { await sccApi.post(`/support-vendors/${v.id}/verify`, { confirmed: true, reason }); toast.success(`${v.name} verifiziert.`); refreshAll(); }
  );

  const suspendVendor = (v: VendorRow) => runMutation(
    `Vendor sperren (Kill-Switch): ${v.name}`,
    "Sperrt sofort ALLE externen Agenten dieses Vendors. Reversibel über erneute Verifizierung.",
    async (reason) => { await sccApi.post(`/support-vendors/${v.id}/status`, { confirmed: true, reason, status: "suspended" }); toast.success(`${v.name} gesperrt.`); refreshAll(); },
    "Sperren"
  );

  const saveIps = (v: VendorDetail) => {
    const cidrs = ipText.split(",").map((s) => s.trim()).filter(Boolean);
    runMutation(`IP-Allowlist setzen: ${v.name}`, cidrs.length === 0 ? "Leere Liste = keine IP-Beschränkung." : `Zugriff nur aus ${cidrs.length} Netz(en).`, async (reason) => {
      await sccApi.post(`/support-vendors/${v.id}/ip-allowlist`, { confirmed: true, reason, cidrs });
      toast.success("IP-Allowlist aktualisiert."); refreshAll();
    });
  };

  const addAgent = (v: VendorDetail) => {
    const email = agentEmail.trim();
    if (!email) { toast.warn("Bitte E-Mail des Agenten eingeben."); return; }
    runMutation(`Externen Agenten hinzufügen: ${email}`, `Rolle ${agentRole} bei ${v.name}. Der Account muss bereits als Plattform-Nutzer existieren. Daten werden für externe Agenten serverseitig maskiert.`, async (reason) => {
      await sccApi.post("/support-vendors/agents", { confirmed: true, reason, email, role: agentRole, vendor_id: v.id });
      toast.success(`${email} als ${agentRole} hinzugefügt.`); setAgentEmail(""); refreshAll();
    });
  };

  const suspendAgent = (a: AgentRow) => runMutation(
    `Agent sperren: ${a.email}`, "Entzieht dem Agenten sofort den Support-Zugang.",
    async (reason) => { await sccApi.post(`/support-vendors/agents/${a.id}/suspend`, { confirmed: true, reason }); toast.success(`${a.email} gesperrt.`); refreshAll(); },
    "Sperren"
  );

  if (loading) return <div className="scc-loading">Lade Vendor-Verwaltung…</div>;
  if (error) return (
    <div className="scc-error-inline">Fehler: {error}
      <button className="scc-btn" onClick={reload} style={{ marginLeft: 8 }}>Retry</button>
    </div>
  );

  const vendors = data?.items ?? [];
  const active = vendors.filter((v) => v.status === "active").length;
  const pending = vendors.filter((v) => v.status === "pending").length;

  return (
    <div>
      <div className="scc-section__header">
        <h1 className="scc-section__title">Support-Vendor-Verwaltung</h1>
        <div className="scc-section__sub">
          Externer Support (BPO). Externe Agenten arbeiten erst nach Vendor-Verifizierung + optionaler IP-Allowlist;
          ihre Sicht ist serverseitig maskiert (keine Klar-PII).
          <button className="scc-btn" onClick={refreshAll} style={{ marginLeft: 12, fontSize: 11, padding: "2px 8px" }}>↺ Aktualisieren</button>
        </div>
      </div>

      <div className="scc-grid" style={{ marginBottom: 20 }}>
        <div className="scc-card"><div className="scc-card__eyebrow">Vendors</div><div className="scc-card__value">{vendors.length}</div></div>
        <div className="scc-card scc-card--ok"><div className="scc-card__eyebrow">Verifiziert</div><div className="scc-card__value">{active}</div></div>
        {pending > 0 && <div className="scc-card"><div className="scc-card__eyebrow">Ausstehend</div><div className="scc-card__value scc-muted">{pending}</div></div>}
      </div>

      {/* Neuer Vendor */}
      <div className="scc-card" style={{ padding: 14, marginBottom: 20 }}>
        <div className="scc-card__eyebrow" style={{ marginBottom: 8 }}>Neuen Vendor anlegen</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input className="scc-input" placeholder="Name (z.B. India Support BPO)" value={newName} onChange={(e) => setNewName(e.target.value)} style={{ minWidth: 240 }} />
          <input className="scc-input" placeholder="Vertrags-Ref (optional)" value={newContract} onChange={(e) => setNewContract(e.target.value)} />
          <button className="scc-btn scc-btn--primary" onClick={createVendor}>Anlegen</button>
        </div>
      </div>

      {vendors.length === 0 ? (
        <div className="scc-empty-state"><div className="scc-empty-state__icon">○</div><div className="scc-empty-state__text">Noch keine Vendors angelegt.</div></div>
      ) : (
        <table className="scc-table">
          <thead><tr><th>Vendor</th><th>Status</th><th>Aktive Agenten</th><th>IP-Allowlist</th><th>Aktionen</th></tr></thead>
          <tbody>
            {vendors.map((v) => (
              <tr key={v.id} style={selectedId === v.id ? { background: "rgba(99,102,241,0.06)" } : undefined}>
                <td>
                  <div style={{ fontWeight: 500 }}>{v.name}</div>
                  {v.contract_ref && <div className="scc-muted" style={{ fontSize: 11 }}>{v.contract_ref}</div>}
                </td>
                <td><span className={`scc-status scc-status--${statusTone(v.status)}`}>{statusLabel(v.status)}</span></td>
                <td>{v.active_agents}</td>
                <td className="scc-muted" style={{ fontSize: 11 }}>{v.allowed_ip_cidrs.length === 0 ? "— (keine)" : `${v.allowed_ip_cidrs.length} Netz(e)`}</td>
                <td>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button className="scc-btn" style={{ fontSize: 11, padding: "3px 10px" }} onClick={() => setSelectedId(selectedId === v.id ? null : v.id)}>
                      {selectedId === v.id ? "Schließen" : "Details"}
                    </button>
                    {v.status !== "active" && <button className="scc-btn scc-btn--primary" style={{ fontSize: 11, padding: "3px 10px" }} onClick={() => verifyVendor(v)}>Verifizieren</button>}
                    {v.status === "active" && <button className="scc-btn scc-btn--danger" style={{ fontSize: 11, padding: "3px 10px" }} onClick={() => suspendVendor(v)}>Sperren</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Detail-Pane */}
      {selectedId && (
        <div className="scc-card" style={{ marginTop: 16, padding: 16 }}>
          {detailLoading || !detail ? <div className="scc-loading">Lade Detail…</div> : (
            <>
              <h2 className="scc-section__title" style={{ fontSize: 15, marginBottom: 4 }}>{detail.name}</h2>
              <div className="scc-muted" style={{ fontSize: 12, marginBottom: 14 }}>
                Status: <span className={`scc-status scc-status--${statusTone(detail.status)}`}>{statusLabel(detail.status)}</span>
                {detail.verified_at && <> · verifiziert am {fmtDate(detail.verified_at)}</>} · angelegt {fmtDate(detail.created_at)}
              </div>

              {/* IP-Allowlist */}
              <div className="scc-card__eyebrow" style={{ marginBottom: 6 }}>IP-Allowlist (CIDR, kommagetrennt — leer = keine Beschränkung)</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
                <input className="scc-input" placeholder="z.B. 203.0.113.0/24, 198.51.100.7" value={ipText} onChange={(e) => setIpText(e.target.value)} style={{ minWidth: 320 }} />
                <button className="scc-btn" onClick={() => saveIps(detail)}>IPs speichern</button>
              </div>

              {/* Externe Agenten */}
              <div className="scc-card__eyebrow" style={{ marginBottom: 8 }}>Externe Agenten ({detail.agents.length})</div>
              {detail.agents.length === 0 ? (
                <div className="scc-muted" style={{ fontSize: 12, marginBottom: 12 }}>Noch keine Agenten zugeordnet.</div>
              ) : (
                <table className="scc-table" style={{ marginBottom: 12 }}>
                  <thead><tr><th>E-Mail</th><th>Rolle</th><th>Daten-Scope</th><th>Status</th><th>Aktion</th></tr></thead>
                  <tbody>
                    {detail.agents.map((a) => (
                      <tr key={a.id} style={a.is_active ? undefined : { opacity: 0.55 }}>
                        <td style={{ fontFamily: "monospace", fontSize: 12 }}>{a.email}</td>
                        <td>{a.role}</td>
                        <td className="scc-muted">{a.data_scope}</td>
                        <td><span className={`scc-status scc-status--${a.is_active ? "ok" : "danger"}`}>{a.is_active ? "Aktiv" : "Gesperrt"}</span></td>
                        <td>{a.is_active && <button className="scc-btn scc-btn--danger" style={{ fontSize: 11, padding: "3px 10px" }} onClick={() => suspendAgent(a)}>Sperren</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* Agent hinzufügen */}
              <div className="scc-card__eyebrow" style={{ marginBottom: 6 }}>Externen Agenten hinzufügen</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <input className="scc-input" placeholder="E-Mail (vorhandener Plattform-Nutzer)" value={agentEmail} onChange={(e) => setAgentEmail(e.target.value)} style={{ minWidth: 280 }} />
                <select className="scc-input" value={agentRole} onChange={(e) => setAgentRole(e.target.value)}>
                  <option value="external_support_agent">external_support_agent</option>
                  <option value="external_support_supervisor">external_support_supervisor</option>
                </select>
                <button className="scc-btn scc-btn--primary" onClick={() => addAgent(detail)} disabled={detail.status !== "active"}>Hinzufügen</button>
                {detail.status !== "active" && <span className="scc-muted" style={{ fontSize: 11 }}>Erst Vendor verifizieren.</span>}
              </div>
            </>
          )}
        </div>
      )}

      <div style={{ marginTop: 24, padding: "10px 14px", background: "rgba(99,102,241,0.06)", borderRadius: 6, border: "1px solid rgba(99,102,241,0.2)", fontSize: 11, color: "var(--scc-muted)" }}>
        Jede Aktion erfordert Re-Auth + Begründung und erzeugt einen Audit-Eintrag (<span className="scc-code">staff_control.support_vendor.*</span>).
        Externe Agenten sehen nur maskierte Daten (keine Klar-E-Mail/-Telefon/-Namen) und nur Fälle ihres Vendors.
      </div>
    </div>
  );
}
