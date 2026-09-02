/**
 * Operations — SCC WAVE 08
 *
 * Infra-Health-Panel: neuester Snapshot pro Host aus `infrastructure_snapshots`
 *   CPU / RAM / Disk mit Schwellwert-Farben + Mini-Bar
 *   TLS-Tage / Docker-Healthcheck / Backup-Alter / Deployment-Version
 *   Alter Snapshot → warn, kein Snapshot → Zero-State
 *
 * Runbook-Log: letzte 20 Runs aus `staff_control_runbook_runs`
 *   KPI-Karten (success / failed / running)
 *   Dauer-Berechnung
 *
 * Reload-Button für manuelle Aktualisierung (beide Bereiche gleichzeitig)
 */

import { useSccQuery } from "@scc/hooks/useSccQuery";
import { fmtDate }     from "@scc/utils/format";

// ─── Types ───────────────────────────────────────────────────

interface InfraSnapshot {
  host_name:              string;
  env:                    string;
  cpu_percent:            number | null;
  ram_percent:            number | null;
  disk_percent:           number | null;
  docker_running_count:   number;
  docker_unhealthy_count: number;
  tls_days_remaining:     number | null;
  backup_age_h:           number | null;
  deployment_version:     string | null;
  deployment_status:      string | null;
  collected_at:           string;
}

interface RunbookRun {
  runbook_key: string;
  status:      string;
  started_at:  string;
  finished_at: string | null;
}

// Live-Diagnostics (Phase I): lose typisiert — getSystemDiagnostics liefert je Komponente
// nur secret-freie Felder (Status/Latenz/Booleans/Zähler/Provider-Name/Warntexte).
interface HealthComponent {
  status:              string;
  latency_ms?:         number;
  error?:              string;
  provider?:           string;
  automated?:          boolean;
  outbound?:           boolean;
  capabilities_active?: number;
  warnings?:           string[];
  error_rate_pct?:     number;
  uptime_s?:           number;
  pool?:    { total: number; idle: number; waiting: number; utilization_pct: number };
  memory?:  { rss_mb: number; heap_used_mb: number; heap_total_mb: number; external_mb: number };
  latency?: { p50_ms: number; p95_ms: number; p99_ms: number };
}

interface ServiceHealth {
  status:      string;
  checked_at?: string;
  response_ms?: number;
  version?:    string;
  components:  Record<string, HealthComponent>;
}

interface OperationsData {
  mail_versand?: MailVersand | null;
  betriebs_takt?: BetriebsTakt | null;
  generated_at?:   string;
  infra_health:    InfraSnapshot[];
  recent_runs:     RunbookRun[];
  service_health?: ServiceHealth | null;
  errors?:         Array<{ area: string; error: string }>;
}

// ─── Service-Health helpers (Phase I Slice 2) ────────────────

const HEALTH_LABELS: Record<string, string> = {
  database: "Datenbank", redis: "Redis / Queue", api: "API",
  process: "Prozess",    billing: "Billing",     email: "E-Mail",
};
const HEALTH_ORDER = ["database", "redis", "api", "process", "billing", "email"];

function healthTone(status: string): string {
  if (status === "critical") return "danger";
  if (status === "degraded") return "warn";
  if (status === "ok")       return "ok";
  return ""; // unconfigured / configured / unknown → neutral (kein Fehler)
}

function healthLabel(status: string): string {
  const map: Record<string, string> = {
    ok: "OK", degraded: "DEGRADIERT", critical: "KRITISCH",
    unconfigured: "NICHT KONFIG.", configured: "KONFIG.",
  };
  return map[status] ?? status.toUpperCase();
}

function fmtUptime(s: number): string {
  if (s < 60)    return `${s}s`;
  if (s < 3600)  return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function componentDetail(key: string, c: HealthComponent): string {
  switch (key) {
    case "database":
      if (c.error) return c.error;
      return `${c.latency_ms ?? "–"}ms${c.pool ? ` · Pool ${c.pool.utilization_pct}%` : ""}`;
    case "redis":
      if (c.status === "unconfigured") return "nicht konfiguriert";
      if (c.error) return c.error;
      return (c.latency_ms ?? -1) >= 0 ? `${c.latency_ms}ms` : c.status;
    case "api":
      return `Fehlerrate ${c.error_rate_pct ?? 0}%${c.latency ? ` · p95 ${c.latency.p95_ms}ms` : ""}`;
    case "process":
      return `Uptime ${c.uptime_s != null ? fmtUptime(c.uptime_s) : "–"}${c.memory ? ` · ${c.memory.rss_mb}MB RSS` : ""}`;
    case "billing":
      return `${c.provider ?? "–"}${c.automated ? " · automatisiert" : ""}`;
    case "email":
      return `${c.provider ?? "–"}${c.outbound ? " · Versand aktiv" : ""}`;
    default:
      return c.status;
  }
}

// ─── Threshold helpers ───────────────────────────────────────

function pctTone(v: number | null): string {
  if (v == null) return "";
  if (v > 90) return "danger";
  if (v > 70) return "warn";
  return "ok";
}

function tlsTone(days: number | null): string {
  if (days == null) return "";
  if (days < 7)  return "danger";
  if (days < 30) return "warn";
  return "ok";
}

function backupTone(h: number | null): string {
  if (h == null) return "";
  if (h > 25) return "danger";
  if (h > 6)  return "warn";
  return "ok";
}

function dockerTone(unhealthy: number): string {
  return unhealthy > 0 ? "danger" : "ok";
}

function hostTone(s: InfraSnapshot): string {
  const bad = [
    pctTone(s.cpu_percent)  === "danger",
    pctTone(s.ram_percent)  === "danger",
    pctTone(s.disk_percent) === "danger",
    tlsTone(s.tls_days_remaining) === "danger",
    backupTone(s.backup_age_h)    === "danger",
    s.docker_unhealthy_count > 0,
    s.deployment_status === "failed",
  ].some(Boolean);
  const warn = !bad && [
    pctTone(s.cpu_percent)  === "warn",
    pctTone(s.ram_percent)  === "warn",
    pctTone(s.disk_percent) === "warn",
    tlsTone(s.tls_days_remaining) === "warn",
    backupTone(s.backup_age_h)    === "warn",
  ].some(Boolean);
  return bad ? "danger" : warn ? "warn" : "";
}

function fmtPct(v: number | null): string {
  return v == null ? "–" : `${Math.round(v)}%`;
}

function fmtBackup(h: number | null): string {
  if (h == null) return "–";
  if (h < 1) return "<1h";
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function fmtTls(d: number | null): string {
  return d == null ? "–" : `${d}T`;
}

function runTone(status: string): string {
  if (status === "success") return "ok";
  if (status === "running")  return "warn";
  return "danger";
}

function duration(start: string, end: string | null): string {
  if (!end) return "läuft…";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ─── MiniBar component ───────────────────────────────────────

function MiniBar({ pct, tone }: { pct: number | null; tone: string }) {
  const v = Math.min(100, Math.max(0, pct ?? 0));
  const color =
    tone === "danger" ? "var(--scc-danger)"
    : tone === "warn" ? "var(--scc-warn)"
    : "var(--scc-ok)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{
        width: 60, height: 5, background: "var(--scc-line)",
        borderRadius: 3, overflow: "hidden", flexShrink: 0,
      }}>
        <div style={{ width: `${v}%`, height: "100%", background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, color, minWidth: 32 }}>{fmtPct(pct)}</span>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────

/* ── M1.1 · Der Betriebstakt ──────────────────────────────────────────────
   Die Frage "laeuft das noch?" gehoert hierher und nicht in ein eigenes Modul:
   sie ist genau die Frage, wegen der jemand Operations aufschlaegt.

   Der wichtigste Zustand ist STILL — eine Aufgabe, die noch nie lief. Genau so
   ist die Marktplatz-Automatik ein Jahr lang durchgerutscht: nichts war alt,
   nichts war rot, es war einfach nichts da. Deshalb steht sie hier ganz oben
   und in der auffaelligsten Farbe. */

type TaktAufgabe = {
  aufgabe: string;
  zustand: "still" | "spaet" | "fehler" | "ok";
  minuten_her: number | null;
  soll_min: number | null;
  zweck: string | null;
  dauer_ms?: number | null;
  laeufe?: number;
  fehler_in_folge?: number;
  letzter_fehler?: string | null;
  quelle?: string | null;
  grund: string | null;
};

type BetriebsTakt = {
  ueberwacht: TaktAufgabe[];
  beobachtet: { aufgabe: string; minuten_her: number | null; ergebnis: string;
                laeufe: number; quelle: string | null }[];
  zusammenfassung: { ueberwacht: number; still: number; spaet: number;
                     fehler: number; ok: number; beobachtet: number };
  toleranz: number;
};

const TAKT_TEXT: Record<TaktAufgabe["zustand"], string> = {
  still:  "nie gelaufen",
  spaet:  "überfällig",
  fehler: "letzter Lauf gescheitert",
  ok:     "läuft"
};

/* Der stille Zustand bekommt den schärfsten Ton, nicht den mildesten: „nie
   gelaufen" ist der Zustand, der ein Jahr lang unbemerkt bleiben kann. */
const TAKT_TON: Record<TaktAufgabe["zustand"], string> = {
  still:  "critical",
  spaet:  "warn",
  fehler: "error",
  ok:     "ok"
};

/** Aus Minuten wird eine Angabe, die ein Mensch liest. */
function seit(minuten: number | null): string {
  if (minuten == null) return "—";
  if (minuten < 60) return `vor ${minuten} min`;
  if (minuten < 1440) return `vor ${Math.round(minuten / 60)} h`;
  return `vor ${Math.round(minuten / 1440)} d`;
}

function BetriebsTaktKachel({ takt }: { takt: BetriebsTakt | null }) {
  if (!takt) {
    /* Kein stiller Leerzustand: dass der Takt NICHT gelesen werden konnte, ist
       selbst ein Befund — und von „alles in Ordnung" nicht zu unterscheiden,
       wenn hier nichts steht. */
    return (
      <>
        <div className="scc-section__header" style={{ marginTop: 0 }}>
          <h2 className="scc-section__title" style={{ fontSize: 14 }}>Betriebstakt</h2>
        </div>
        <div className="scc-error-inline" style={{ marginBottom: 28 }}>
          Der Betriebstakt konnte nicht gelesen werden. Das ist ein Befund, keine
          Entwarnung — solange er fehlt, ist unbekannt, ob die Automatismen laufen.
        </div>
      </>
    );
  }

  const z = takt.zusammenfassung;
  const dringend = takt.ueberwacht.filter((a) => a.zustand !== "ok");

  return (
    <>
      <div className="scc-section__header" style={{ marginTop: 0 }}>
        <h2 className="scc-section__title" style={{ fontSize: 14 }}>Betriebstakt</h2>
        <span className="scc-muted" style={{ fontSize: 12 }}>
          {z.ueberwacht} überwacht · überfällig ab Intervall × {takt.toleranz}
        </span>
      </div>

      <div className="scc-grid" style={{ marginBottom: 16 }}>
        <div className={`scc-card${z.ok > 0 ? " scc-card--ok" : ""}`}>
          <div className="scc-card__eyebrow">Laufen im Takt</div>
          <div className="scc-card__value">{z.ok}</div>
        </div>
        <div className={`scc-card${z.spaet > 0 ? " scc-card--warn" : ""}`}>
          <div className="scc-card__eyebrow">Überfällig</div>
          <div className="scc-card__value">{z.spaet}</div>
        </div>
        <div className={`scc-card${z.fehler > 0 ? " scc-card--danger" : ""}`}>
          <div className="scc-card__eyebrow">Gescheitert</div>
          <div className="scc-card__value">{z.fehler}</div>
        </div>
        <div className={`scc-card${z.still > 0 ? " scc-card--danger" : ""}`}>
          <div className="scc-card__eyebrow">Nie gelaufen</div>
          <div className="scc-card__value">{z.still}</div>
          <div className="scc-card__hint">
            {z.still > 0 ? "Automatik ist nie angesprungen" : "alle Aufgaben kennen einen Lauf"}
          </div>
        </div>
      </div>

      {dringend.length === 0 ? (
        <div className="scc-empty-state" style={{ marginBottom: 28 }}>
          <div className="scc-empty-state__icon">○</div>
          <div className="scc-empty-state__text">
            Alle {z.ueberwacht} überwachten Aufgaben laufen im Takt.
          </div>
        </div>
      ) : (
        <table className="scc-table" style={{ marginBottom: 28 }}>
          <thead>
            <tr>
              <th>Aufgabe</th><th>Zustand</th><th>Zuletzt</th><th>Soll</th><th>Befund</th>
            </tr>
          </thead>
          <tbody>
            {dringend.map((a) => (
              <tr key={a.aufgabe}>
                <td>
                  <strong>{a.aufgabe}</strong>
                  {a.zweck ? (
                    <div className="scc-muted" style={{ fontSize: 11 }}>{a.zweck}</div>
                  ) : null}
                </td>
                <td>
                  <span className={`scc-status scc-status--${TAKT_TON[a.zustand]}`}>
                    {TAKT_TEXT[a.zustand]}
                  </span>
                </td>
                <td>{seit(a.minuten_her)}</td>
                <td>{a.soll_min != null ? `alle ${a.soll_min} min` : "—"}</td>
                <td className="scc-muted">{a.grund || a.letzter_fehler || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {takt.beobachtet.length > 0 ? (
        <div className="scc-muted" style={{ fontSize: 12, marginTop: -16, marginBottom: 28 }}>
          Dazu {takt.beobachtet.length} Aufgabe(n), die laufen, ohne überwacht zu
          sein — zuletzt {seit(takt.beobachtet[0]?.minuten_her ?? null)}.
        </div>
      ) : null}
    </>
  );
}

/* ── M1.3 · Das Versandprotokoll ──────────────────────────────────────────
   Dieselbe Frage wie beim Betriebstakt, nur fuer Mails: was SCHWEIGT?

   Ein Zweck, zu dem in sieben Tagen kein einziger Versuch lief, hat in der
   Tabelle keine Zeile — er faellt aus jeder Abfrage heraus. Deshalb kommt die
   Liste der erwarteten Zwecke aus dem Code (ZWECKE_ERWARTET), und der Dienst
   fuellt sie auf. "stumm" ist der Befund, "keine Zeile" waere es nicht.

   Und "ohne Versandweg" zaehlt getrennt von "fehlgeschlagen": das erste ist
   ein Konfigurationsfehler, das zweite ein Betriebsvorfall. Sie brauchen
   verschiedene Antworten, also stehen sie in verschiedenen Spalten. */

type MailZweck = {
  zweck: string;
  erwartet: boolean;
  versucht: number;
  zugestellt: number;
  fehlgeschlagen: number;
  ohne_versandweg: number;
  stumm: boolean;
  letzte_um: string | null;
  letzter_weg: string | null;
  letzter_fehler: string | null;
  auffaellig: boolean;
};

type MailVersand = {
  verfuegbar: boolean;
  fenster_tage: number;
  zwecke: MailZweck[];
  zusammenfassung: {
    zwecke: number; versucht: number; zugestellt: number;
    fehlgeschlagen: number; ohne_versandweg: number; stumm: number;
  };
};

function MailVersandKachel({ mail }: { mail: MailVersand | null }) {
  if (!mail || !mail.verfuegbar) {
    /* Nicht lesbar ist ein Befund, keine Entwarnung — dieselbe Regel wie
       beim Betriebstakt. Ein leeres Feld sieht aus wie "alles in Ordnung". */
    return (
      <>
        <div className="scc-section__header" style={{ marginTop: 0 }}>
          <h2 className="scc-section__title" style={{ fontSize: 14 }}>Mailversand</h2>
        </div>
        <div className="scc-error-inline" style={{ marginBottom: 28 }}>
          Das Versandprotokoll konnte nicht gelesen werden. Solange es fehlt, ist
          unbekannt, ob Einladungen und Zahlungserinnerungen ankommen.
        </div>
      </>
    );
  }

  const z = mail.zusammenfassung;
  const auffaellig = mail.zwecke.filter((x) => x.auffaellig);

  return (
    <>
      <div className="scc-section__header" style={{ marginTop: 0 }}>
        <h2 className="scc-section__title" style={{ fontSize: 14 }}>Mailversand</h2>
        <span className="scc-muted" style={{ fontSize: 12 }}>
          {z.zwecke} Zwecke · letzte {mail.fenster_tage} Tage
        </span>
      </div>

      <div className="scc-grid" style={{ marginBottom: 16 }}>
        <div className={`scc-card${z.zugestellt > 0 ? " scc-card--ok" : ""}`}>
          <div className="scc-card__eyebrow">Zugestellt</div>
          <div className="scc-card__value">{z.zugestellt}</div>
          <div className="scc-card__hint">von {z.versucht} Versuchen</div>
        </div>
        <div className={`scc-card${z.fehlgeschlagen > 0 ? " scc-card--warn" : ""}`}>
          <div className="scc-card__eyebrow">Fehlgeschlagen</div>
          <div className="scc-card__value">{z.fehlgeschlagen}</div>
        </div>
        <div className={`scc-card${z.ohne_versandweg > 0 ? " scc-card--danger" : ""}`}>
          <div className="scc-card__eyebrow">Ohne Versandweg</div>
          <div className="scc-card__value">{z.ohne_versandweg}</div>
          <div className="scc-card__hint">
            {z.ohne_versandweg > 0
              ? "nie versucht — kein Transport konfiguriert"
              : "jeder Versuch hatte einen Weg"}
          </div>
        </div>
        <div className={`scc-card${z.stumm > 0 ? " scc-card--warn" : ""}`}>
          <div className="scc-card__eyebrow">Stumme Zwecke</div>
          <div className="scc-card__value">{z.stumm}</div>
          <div className="scc-card__hint">erwartet, aber kein Versuch</div>
        </div>
      </div>

      {auffaellig.length === 0 ? (
        <div className="scc-empty-state" style={{ marginBottom: 28 }}>
          <div className="scc-empty-state__icon">○</div>
          <div className="scc-empty-state__text">
            Alle erwarteten Zwecke haben in den letzten {mail.fenster_tage} Tagen
            zugestellt.
          </div>
        </div>
      ) : (
        <table className="scc-table" style={{ marginBottom: 28 }}>
          <thead>
            <tr>
              <th>Zweck</th><th>Befund</th><th>Zugestellt</th>
              <th>Ohne Weg</th><th>Letzter Fehler</th>
            </tr>
          </thead>
          <tbody>
            {auffaellig.map((x) => (
              <tr key={x.zweck}>
                <td>
                  <strong>{x.zweck}</strong>
                  {x.letzter_weg ? (
                    <div className="scc-muted" style={{ fontSize: 11 }}>zuletzt via {x.letzter_weg}</div>
                  ) : null}
                </td>
                <td>
                  <span className={`scc-status scc-status--${
                    x.ohne_versandweg > 0 ? "critical"
                      : x.stumm ? "warn"
                        : x.fehlgeschlagen > 0 ? "error" : "ok"}`}>
                    {x.ohne_versandweg > 0 ? "ohne Versandweg"
                      : x.stumm ? "kein Versuch"
                        : `${x.fehlgeschlagen} fehlgeschlagen`}
                  </span>
                </td>
                <td>{x.zugestellt} / {x.versucht}</td>
                <td>{x.ohne_versandweg}</td>
                <td className="scc-muted">{x.letzter_fehler || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

export default function Operations() {
  const { data, loading, error, reload } = useSccQuery<OperationsData>("/operations");

  if (loading) return <div className="scc-loading">Lade Operations…</div>;
  if (error) return (
    <div className="scc-error-inline">
      Fehler: {error}
      <button className="scc-btn" onClick={reload} style={{ marginLeft: 8 }}>Retry</button>
    </div>
  );

  const takt   = data?.betriebs_takt ?? null;
  const mail   = data?.mail_versand ?? null;
  const infra  = data?.infra_health ?? [];
  const runs   = data?.recent_runs  ?? [];
  const health = data?.service_health ?? null;

  const successCount = runs.filter((r) => r.status === "success").length;
  const failedCount  = runs.filter((r) => r.status === "failed" || r.status === "error").length;
  const runningCount = runs.filter((r) => r.status === "running").length;

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="scc-section__header">
        <h1 className="scc-section__title">Operations</h1>
        <div className="scc-section__sub">
          Infra-Health + Runbook-Läufe.
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
            ↺ Aktualisieren
          </button>
        </div>
      </div>

      <BetriebsTaktKachel takt={takt} />

      <MailVersandKachel mail={mail} />

      {/* ── Live-Service-Health (Phase I Slice 2) ───────────── */}
      {health && (
        <>
          <div className="scc-section__header" style={{ marginTop: 0 }}>
            <h2 className="scc-section__title" style={{ fontSize: 14 }}>Live-Service-Health</h2>
            <span className="scc-muted" style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span className={`scc-status scc-status--${healthTone(health.status) || "ok"}`} style={{ fontSize: 10 }}>
                {healthLabel(health.status)}
              </span>
              {health.response_ms != null && <span>{health.response_ms}ms</span>}
            </span>
          </div>

          <div
            className="scc-grid"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", marginBottom: 28 }}
          >
            {HEALTH_ORDER.filter((k) => health.components?.[k]).map((k) => {
              const c = health.components[k];
              const tone = healthTone(c.status);
              return (
                <div key={k} className={`scc-card${tone ? ` scc-card--${tone}` : ""}`}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{HEALTH_LABELS[k] ?? k}</span>
                    <span className={`scc-status scc-status--${tone || "ok"}`} style={{ fontSize: 10 }}>
                      {healthLabel(c.status)}
                    </span>
                  </div>
                  <div className="scc-muted" style={{ fontSize: 11 }}>{componentDetail(k, c)}</div>
                  {/* Provider-Warnungen (billing/email) — secret-frei aus Slice 1 */}
                  {(c.warnings?.length ?? 0) > 0 && (
                    <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
                      {c.warnings!.map((w, i) => (
                        <div key={i} style={{ fontSize: 10, color: "var(--scc-warn)", lineHeight: 1.35 }}>{w}</div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Infra-Health-Panel ──────────────────────────────── */}
      <div className="scc-section__header" style={{ marginTop: 0 }}>
        <h2 className="scc-section__title" style={{ fontSize: 14 }}>Infra-Health</h2>
        <span className="scc-muted" style={{ fontSize: 12 }}>
          {infra.length > 0 ? `${infra.length} Host${infra.length !== 1 ? "s" : ""} · letzte 24 h` : "Kein Snapshot"}
        </span>
      </div>

      {infra.length === 0 ? (
        <div className="scc-empty-state" style={{ marginBottom: 28 }}>
          <div className="scc-empty-state__icon">○</div>
          <div className="scc-empty-state__text">
            Keine Infra-Snapshots der letzten 24 h — kein Collector aktiv.
          </div>
        </div>
      ) : (
        <div
          className="scc-grid"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", marginBottom: 28 }}
        >
          {infra.map((s) => {
            const tone = hostTone(s);
            return (
              <div key={s.host_name} className={`scc-card${tone ? ` scc-card--${tone}` : ""}`}>
                {/* Host-Kopf */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{s.host_name}</span>
                    <span className="scc-muted" style={{ marginLeft: 6, fontSize: 11 }}>{s.env}</span>
                  </div>
                  <span
                    className={`scc-status scc-status--${tone || "ok"}`}
                    style={{ fontSize: 10 }}
                  >
                    {tone === "danger" ? "KRITISCH" : tone === "warn" ? "WARNUNG" : "OK"}
                  </span>
                </div>

                {/* Metriken */}
                <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12 }}>
                  {/* CPU */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="scc-muted" style={{ minWidth: 50 }}>CPU</span>
                    <MiniBar pct={s.cpu_percent} tone={pctTone(s.cpu_percent)} />
                  </div>
                  {/* RAM */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="scc-muted" style={{ minWidth: 50 }}>RAM</span>
                    <MiniBar pct={s.ram_percent} tone={pctTone(s.ram_percent)} />
                  </div>
                  {/* Disk */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="scc-muted" style={{ minWidth: 50 }}>Disk</span>
                    <MiniBar pct={s.disk_percent} tone={pctTone(s.disk_percent)} />
                  </div>

                  {/* Separator */}
                  <div style={{ height: 1, background: "var(--scc-line)", margin: "2px 0" }} />

                  {/* TLS */}
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="scc-muted">TLS</span>
                    <span style={{ color: `var(--scc-${tlsTone(s.tls_days_remaining) || "text"})`, fontSize: 12 }}>
                      {fmtTls(s.tls_days_remaining)}
                    </span>
                  </div>
                  {/* Backup */}
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="scc-muted">Backup</span>
                    <span style={{ color: `var(--scc-${backupTone(s.backup_age_h) || "text"})`, fontSize: 12 }}>
                      {fmtBackup(s.backup_age_h)}
                    </span>
                  </div>
                  {/* Docker */}
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="scc-muted">Docker</span>
                    <span
                      style={{
                        fontSize: 12,
                        color: `var(--scc-${dockerTone(s.docker_unhealthy_count)})`,
                      }}
                    >
                      {s.docker_running_count} laufend
                      {s.docker_unhealthy_count > 0 && ` · ${s.docker_unhealthy_count} unhealthy`}
                    </span>
                  </div>
                  {/* Deployment */}
                  {s.deployment_version && (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span className="scc-muted">Deploy</span>
                      <span
                        className="scc-code"
                        style={{
                          fontSize: 10,
                          color: s.deployment_status === "failed" ? "var(--scc-danger)" : undefined,
                        }}
                      >
                        {s.deployment_version}
                        {s.deployment_status && ` · ${s.deployment_status}`}
                      </span>
                    </div>
                  )}
                </div>

                {/* Timestamp */}
                <div className="scc-muted" style={{ fontSize: 10, marginTop: 8, textAlign: "right" }}>
                  {new Date(s.collected_at).toLocaleTimeString("de-DE")} Uhr
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Runbook-Log ─────────────────────────────────────── */}
      <div className="scc-section__header">
        <h2 className="scc-section__title" style={{ fontSize: 14 }}>Runbook-Log</h2>
        <span className="scc-muted" style={{ fontSize: 12 }}>letzte 20 Läufe</span>
      </div>

      {runs.length > 0 && (
        <div className="scc-grid" style={{ marginBottom: 16 }}>
          <div className={`scc-card${successCount > 0 ? " scc-card--ok" : ""}`}>
            <div className="scc-card__eyebrow">Erfolgreiche Läufe</div>
            <div className="scc-card__value">{successCount}</div>
          </div>
          <div className={`scc-card${failedCount > 0 ? " scc-card--danger" : ""}`}>
            <div className="scc-card__eyebrow">Fehlgeschlagen</div>
            <div className="scc-card__value">{failedCount}</div>
          </div>
          {runningCount > 0 && (
            <div className="scc-card scc-card--warn">
              <div className="scc-card__eyebrow">Laufen gerade</div>
              <div className="scc-card__value">{runningCount}</div>
            </div>
          )}
        </div>
      )}

      {runs.length === 0 ? (
        <div className="scc-empty-state">
          <div className="scc-empty-state__icon">○</div>
          <div className="scc-empty-state__text">
            Noch keine Runbook-Läufe — starte einen über „Automation".
          </div>
        </div>
      ) : (
        <table className="scc-table">
          <thead>
            <tr>
              <th>Runbook</th>
              <th>Status</th>
              <th>Gestartet</th>
              <th>Dauer</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r, i) => (
              <tr key={i}>
                <td><span className="scc-code">{r.runbook_key}</span></td>
                <td>
                  <span className={`scc-status scc-status--${runTone(r.status)}`}>
                    {r.status}
                  </span>
                </td>
                <td className="scc-muted">{fmtDate(r.started_at)}</td>
                <td className="scc-muted">{duration(r.started_at, r.finished_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Backend-Warnungen */}
      {(data?.errors?.length ?? 0) > 0 && (
        <div style={{
          marginTop: 16, padding: "8px 12px",
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
