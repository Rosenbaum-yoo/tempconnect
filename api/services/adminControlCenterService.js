import * as ssoService from "./ssoService.js";

const ADMIN_TAB_ORDER = [
  "users",
  "orgs",
  "audit",
  "metrics",
  "activity",
  "requests",
  "strategic",
  "revenue",
  "features",
  "releases"
];

const SSO_ALLOWED_PLANS = new Set(["PRO", "INDIVIDUELL"]);

function normalizePlan(plan) {
  const normalized = String(plan || "DEMO").toUpperCase();
  if (normalized === "FREE") return "DEMO";
  if (normalized === "ENTERPRISE" || normalized === "INDIVIDUAL") return "INDIVIDUELL";
  return normalized;
}

function toneForState(state) {
  if (state === "active") return "ok";
  if (state === "restricted" || state === "enterprise_only") return "warn";
  if (state === "admin_only") return "neutral";
  return "muted";
}

function badgeForState(state) {
  switch (state) {
    case "active": return "aktiv";
    case "restricted": return "eingeschränkt";
    case "enterprise_only": return "enterprise-only";
    case "admin_only": return "admin-only";
    case "planned": return "geplant";
    default: return "unbekannt";
  }
}

function compactSummary(items = []) {
  return items.filter(Boolean).map(function (item) {
    return {
      label: item.label,
      value: item.value
    };
  });
}

function supportLink(label, link) {
  if (!label || !link) return null;
  return { label, ...link };
}

function buildCard(payload) {
  return {
    key: payload.key,
    title: payload.title,
    description: payload.description,
    state: payload.state,
    tone: payload.tone || toneForState(payload.state),
    badge: payload.badge || badgeForState(payload.state),
    available: payload.state === "active",
    access_message: payload.access_message || "",
    primary_action: payload.primary_action || null,
    support_links: (payload.support_links || []).filter(Boolean),
    summary: compactSummary(payload.summary || []),
    maturity_note: payload.maturity_note || null
  };
}

function workflowDefinitions() {
  return [
    { label: "Requisition", value: "DRAFT → PENDING_APPROVAL → OPEN → SHORTLISTED → FILLED" },
    { label: "Deal", value: "CREATED → OFFER_SENT → ACCEPTED → CONFIRMED → COMPLETED" },
    { label: "Capacity Post", value: "draft → active → paused / filled / expired / archived" },
    { label: "Submission", value: "DRAFT → SUBMITTED → UNDER_REVIEW → ACCEPTED / REJECTED" }
  ];
}

export function resolveAdminAccess(viewer = {}, requestContext = {}) {
  const orgRole = requestContext.orgRole || viewer.org_role || null;
  const orgId = requestContext.orgId || viewer.org_id || null;
  const orgName = requestContext.orgName || viewer.org_name || null;
  const legacyAdmin = requestContext.userRole === "admin" || viewer.role === "admin";
  const isPlatformAdmin = orgRole === "platform_admin" || legacyAdmin;
  const isOrgAdmin = orgRole === "owner" || orgRole === "admin";
  const isAdmin = isPlatformAdmin || isOrgAdmin;

  return {
    is_admin: isAdmin,
    is_platform_admin: isPlatformAdmin,
    is_org_admin: isOrgAdmin,
    can_manage_org_settings: isPlatformAdmin || isOrgAdmin,
    can_view_workspace: isAdmin,
    has_org: Boolean(orgId),
    org_id: orgId,
    org_name: orgName,
    org_role: orgRole,
    access_level: isPlatformAdmin
      ? "platform_admin"
      : isOrgAdmin
        ? orgRole
        : "restricted"
  };
}

export function resolveSsoCardAvailability({ viewer = {}, access = {}, configured = false, mode = ssoService.getSSOMode() } = {}) {
  const plan = normalizePlan(viewer.plan);
  if (!access.has_org) {
    return {
      state: "restricted",
      code: "ORG_REQUIRED",
      message: "SSO / SAML benötigt einen gültigen Organisationskontext.",
      cta: { type: "href", href: "/public/enterprise.html", label: "Zur Übersicht" }
    };
  }
  if (!access.can_manage_org_settings) {
    return {
      state: "admin_only",
      code: "ORG_SETTINGS_REQUIRED",
      message: "SSO / SAML darf nur von Ownern, Admins oder platform_admin verwaltet werden.",
      cta: null
    };
  }
  if (!SSO_ALLOWED_PLANS.has(plan)) {
    return {
      state: "enterprise_only",
      code: "PLAN_REQUIRED",
      message: "SSO / SAML wird erst ab PRO bzw. individuellen Enterprise-Konfigurationen produktiv freigeschaltet.",
      cta: { type: "href", href: "/public/sla_abo.html", label: "Tarif prüfen" }
    };
  }
  if (mode !== "saml") {
    return {
      state: "restricted",
      code: "SSO_STUB_MODE",
      message: "Die aktuelle Runtime läuft noch im Stub-Modus. Die SSO-Konfiguration bleibt deshalb bewusst soft-locked, bis die produktive SAML-Laufzeit aktiv ist.",
      cta: supportLink("Security der Organisation", { type: "href", href: "/public/organization.html?tab=security" })
    };
  }
  return {
    state: "active",
    code: null,
    message: configured
      ? "SSO / SAML ist für Ihre Organisation konfiguriert und administrierbar."
      : "SSO / SAML kann jetzt produktiv eingerichtet werden.",
    cta: { type: "href", href: "/public/sso_config.html", label: configured ? "SSO verwalten" : "SSO einrichten" }
  };
}

async function queryAdminSummary(pool) {
  const defaults = {
    total_users: 0,
    new_users_30d: 0,
    total_orgs: 0,
    active_capacity_posts: 0,
    requisition_backlog: 0,
    active_offers: 0,
    audit_events_30d: 0,
    audit_actors_30d: 0,
    configured_sso_orgs: 0
  };

  const results = await Promise.allSettled([
    pool.query("SELECT COUNT(*)::int AS total_users, COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS new_users_30d FROM users"),
    pool.query("SELECT COUNT(*)::int AS total_orgs FROM organizations WHERE is_active = TRUE"),
    pool.query("SELECT COUNT(*)::int AS active_capacity_posts FROM capacity_posts WHERE is_active = TRUE"),
    pool.query(
      `SELECT COUNT(*)::int AS requisition_backlog
       FROM requisitions
       WHERE status IN ('PENDING_APPROVAL', 'APPROVED', 'OPEN', 'IN_REVIEW', 'SHORTLISTED')`
    ),
    pool.query(
      `SELECT COUNT(*)::int AS active_offers
       FROM offers
       WHERE LOWER(COALESCE(status, '')) IN ('draft', 'sent', 'countered')`
    ),
    pool.query(
      `SELECT
         COUNT(*)::int AS audit_events_30d,
         COUNT(DISTINCT actor_id)::int AS audit_actors_30d
       FROM audit_log
       WHERE created_at >= NOW() - INTERVAL '30 days'`
    ),
    pool.query("SELECT COUNT(*)::int AS configured_sso_orgs FROM org_sso_config WHERE is_active = TRUE")
  ]);

  const rows = results.map(function (result) {
    return result.status === "fulfilled" ? (result.value.rows[0] || {}) : {};
  });

  return {
    ...defaults,
    ...rows[0],
    ...rows[1],
    ...rows[2],
    ...rows[3],
    ...rows[4],
    ...rows[5],
    ...rows[6]
  };
}

export async function buildAdminControlCenter(pool, viewer, requestContext = {}) {
  const access = resolveAdminAccess(viewer, requestContext);
  const plan = normalizePlan(viewer.plan);
  const summary = await queryAdminSummary(pool).catch(function () {
    return {
      total_users: 0,
      new_users_30d: 0,
      total_orgs: 0,
      active_capacity_posts: 0,
      requisition_backlog: 0,
      active_offers: 0,
      audit_events_30d: 0,
      audit_actors_30d: 0,
      configured_sso_orgs: 0
    };
  });

  let ssoConfigured = false;
  if (access.org_id) {
    try {
      const ssoConfig = await ssoService.getSSOConfig(pool, access.org_id);
      ssoConfigured = Boolean(ssoConfig);
    } catch {
      ssoConfigured = false;
    }
  }

  const sso = resolveSsoCardAvailability({
    viewer,
    access,
    configured: ssoConfigured,
    mode: ssoService.getSSOMode()
  });

  const adminCard = buildCard({
    key: "admin",
    title: "Admin",
    description: "Kontext, Zuständigkeit und priorisierte Einstiegspunkte für die Plattformzentrale.",
    state: "active",
    summary: [
      { label: "Zugriff", value: access.is_admin ? access.access_level : "eingeschränkt" },
      { label: "Organisation", value: access.org_name || "keine Organisation" },
      { label: "Plan", value: viewer.plan_display_label || plan }
    ],
    primary_action: access.is_admin
      ? { type: "tab", target: "users", label: "Arbeitsbereich öffnen" }
      : { type: "href", href: "/public/enterprise.html", label: "Zur Übersicht" },
    access_message: access.is_admin
      ? "Die Plattformzentrale ist freigeschaltet."
      : "Die Admin-Zentrale bleibt sichtbar, aber operative Plattformbereiche sind für dieses Konto kontrolliert eingeschränkt."
  });

  const usersOrgsCard = buildCard({
    key: "users_orgs",
    title: "Benutzer & Organisationen",
    description: "Benutzerübersicht, Rollen, Organisationszuordnung und der Einstieg in den bestehenden Organisationsbereich.",
    state: access.is_admin ? "active" : "admin_only",
    summary: [
      { label: "Benutzer", value: summary.total_users || 0 },
      { label: "Neue Nutzer 30 Tage", value: summary.new_users_30d || 0 },
      { label: "Organisationen", value: summary.total_orgs || 0 }
    ],
    primary_action: access.is_admin
      ? { type: "tab", target: "users", label: "Benutzer öffnen" }
      : access.has_org
        ? { type: "href", href: "/public/organization.html?tab=members", label: "Zum Organisationsbereich" }
        : null,
    support_links: [
      access.is_admin ? supportLink("Organisationen", { type: "tab", target: "orgs" }) : null,
      access.has_org ? supportLink("Rollen & Rechte", { type: "href", href: "/public/organization.html?tab=roles" }) : null,
      access.has_org ? supportLink("Mitglieder", { type: "href", href: "/public/organization.html?tab=members" }) : null
    ],
    access_message: access.is_admin
      ? "Die zentrale Benutzer- und Organisationsverwaltung ist sofort nutzbar."
      : "Plattformweite Benutzer- und Organisationspflege ist admin-only. Ihr organisationsbezogener Bereich bleibt über das Organization Control Center erreichbar."
  });

  const auditCard = buildCard({
    key: "audit_log",
    title: "Audit-Log",
    description: "Chronologische Plattformnachvollziehbarkeit mit Filtern, Export und Recent-Changes-Drilldowns.",
    state: access.is_admin ? "active" : "admin_only",
    summary: [
      { label: "Events 30 Tage", value: summary.audit_events_30d || 0 },
      { label: "Akteure 30 Tage", value: summary.audit_actors_30d || 0 }
    ],
    primary_action: access.is_admin
      ? { type: "tab", target: "audit", label: "Audit öffnen" }
      : access.has_org
        ? { type: "href", href: "/public/organization.html?tab=audit", label: "Org-Audit öffnen" }
        : null,
    support_links: [
      access.is_admin ? supportLink("Governance Timeline", { type: "tab", target: "activity" }) : null,
      access.is_admin ? supportLink("CSV Export", { type: "href", href: "/api/admin/audit-log/export/csv" }) : null
    ],
    access_message: access.is_admin
      ? "Das Plattform-Audit ist freigeschaltet."
      : "Plattformweites Audit bleibt admin-only. Der organisationsbezogene Audit-Trail ist weiterhin im Organization Control Center zugänglich."
  });

  const metricsCard = buildCard({
    key: "platform_metrics",
    title: "Plattform-Metriken",
    description: "Belastbare Plattformkennzahlen zu Nutzern, Orgs, Personalangeboten, Arbeitsplatzangeboten, Angeboten und Operations.",
    state: access.is_admin ? "active" : "restricted",
    summary: [
      { label: "Aktive Personalangebote", value: summary.active_capacity_posts || 0 },
      { label: "Req-Backlog", value: summary.requisition_backlog || 0 },
      { label: "Aktive Angebote", value: summary.active_offers || 0 }
    ],
    primary_action: access.is_admin
      ? { type: "tab", target: "metrics", label: "Metriken öffnen" }
      : { type: "href", href: "/public/executive_dashboard.html", label: "Executive Dashboard" },
    support_links: [
      supportLink("System Health", { type: "href", href: "/public/system-health.html" }),
      supportLink("Executive Dashboard", { type: "href", href: "/public/executive_dashboard.html" }),
      access.is_admin ? supportLink("Governance Timeline", { type: "tab", target: "activity" }) : null
    ],
    access_message: access.is_admin
      ? "Die Plattformmetriken sind freigeschaltet."
      : "Plattformweite Admin-Metriken bleiben kontrolliert. Organisations- und Executive-KPIs stehen weiterhin über die bestehenden Steuerungsseiten zur Verfügung."
  });

  const ssoCard = buildCard({
    key: "sso_saml",
    title: "SSO / SAML",
    description: "Org-bezogene SSO-Konfiguration inklusive IdP/SP-Metadaten, Enforce-SSO und Enterprise-Freigabelogik.",
    state: sso.state,
    summary: [
      { label: "Runtime", value: ssoService.getSSOMode() === "saml" ? "SAML" : "Stub" },
      { label: "Org-Konfiguriert", value: ssoConfigured ? "ja" : "nein" },
      { label: "SSO-Orgs", value: summary.configured_sso_orgs || 0 }
    ],
    primary_action: sso.cta,
    support_links: [
      access.has_org ? supportLink("Security der Organisation", { type: "href", href: "/public/organization.html?tab=security" }) : null
    ],
    access_message: sso.message,
    maturity_note: sso.state === "active"
      ? "Voll aktiv"
      : "Bewusst soft-locked bis Guarding, Planfreigabe und Runtime vollständig tragfähig sind."
  });

  const workflowsCard = buildCard({
    key: "workflows",
    title: "Workflows & State Machines",
    description: "Konkrete Plattform-Lifecycles statt generischer BPM-Spielereien.",
    state: "planned",
    summary: workflowDefinitions(),
    primary_action: null,
    support_links: [],
    access_message: "Die echten Zustandsmodelle existieren bereits, aber eine operative Admin-Steuerungsoberfläche wird bewusst erst mit klaren Guardrails freigeschaltet.",
    maturity_note: "Geplant – Referenz sichtbar, keine Fake-Steuerung"
  });

  return {
    generated_at: new Date().toISOString(),
    summary,
    context: {
      user: {
        id: viewer.id,
        email: viewer.email,
        company_name: viewer.company_name || null,
        role: viewer.role || null,
        plan,
        plan_display_label: viewer.plan_display_label || plan,
        org_id: access.org_id,
        org_name: access.org_name,
        org_role: access.org_role
      },
      access: {
        ...access,
        allowed_tabs: access.can_view_workspace ? ADMIN_TAB_ORDER : []
      },
      roadmap: [
        "Benutzer & Organisationen",
        "Audit-Log",
        "Plattform-Metriken",
        "SSO / SAML",
        "Workflows & State Machines"
      ]
    },
    card_order: ["admin", "users_orgs", "audit_log", "platform_metrics", "sso_saml", "workflows"],
    cards: {
      admin: adminCard,
      users_orgs: usersOrgsCard,
      audit_log: auditCard,
      platform_metrics: metricsCard,
      sso_saml: ssoCard,
      workflows: workflowsCard
    }
  };
}
