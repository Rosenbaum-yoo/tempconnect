(function(global) {
  'use strict';

  var root = global.TC = global.TC || {};

  var RATE_CARD_READ_ROLES = {
    platform_admin: true,
    owner: true,
    admin: true,
    program_manager: true,
    hiring_manager: true,
    supplier_manager: true,
    finance: true,
    viewer: true
  };

  var RATE_CARD_WRITE_ROLES = {
    platform_admin: true,
    owner: true,
    admin: true,
    program_manager: true,
    finance: true
  };

  var VENDOR_POOL_READ_ROLES = {
    platform_admin: true,
    owner: true,
    admin: true,
    supplier_manager: true,
    program_manager: true,
    hiring_manager: true,
    finance: true
  };

  var VENDOR_POOL_WRITE_ROLES = {
    platform_admin: true,
    owner: true,
    admin: true,
    supplier_manager: true,
    program_manager: true
  };

  var SUPPLIER_READ_ROLES = {
    platform_admin: true,
    owner: true,
    admin: true,
    supplier_manager: true,
    program_manager: true,
    hiring_manager: true,
    finance: true,
    viewer: true
  };

  var SUPPLIER_WRITE_ROLES = {
    platform_admin: true,
    owner: true,
    admin: true,
    supplier_manager: true,
    program_manager: true
  };

  var EXECUTIVE_READ_ROLES = {
    platform_admin: true,
    owner: true,
    admin: true,
    program_manager: true,
    finance: true
  };

  var COMPLIANCE_READ_ROLES = {
    platform_admin: true,
    owner: true,
    admin: true,
    supplier_manager: true,
    program_manager: true,
    hiring_manager: true,
    finance: true,
    member: true
  };

  var COMPLIANCE_MANAGE_ROLES = {
    platform_admin: true,
    owner: true,
    admin: true,
    supplier_manager: true
  };

  var COMPLIANCE_VERIFY_ROLES = {
    platform_admin: true,
    owner: true,
    admin: true,
    supplier_manager: true
  };

  var COMPLIANCE_UPLOAD_ROLES = {
    platform_admin: true,
    owner: true,
    admin: true,
    supplier_user: true
  };

  var DATA_GOVERNANCE_EXPORT_ROLES = {
    platform_admin: true,
    owner: true,
    admin: true
  };

  function normalizePlan(plan) {
    var normalized = String(plan || 'DEMO').toUpperCase();
    if (normalized === 'FREE') return 'DEMO';
    if (normalized === 'ENTERPRISE' || normalized === 'INDIVIDUAL') return 'INDIVIDUELL';
    return normalized;
  }

  function normalizeOrgType(me) {
    var orgType = String(me && me.org_type || '').trim().toLowerCase();
    if (orgType) return orgType;
    var legacyRole = String(me && me.role || '').trim().toLowerCase();
    if (legacyRole === 'company' || legacyRole === 'agency' || legacyRole === 'worker') return legacyRole;
    return '';
  }

  function hasPlanFeature(plan, featureKey) {
    var normalizedPlan = normalizePlan(plan);
    if (typeof PlanFeatures !== 'undefined' && PlanFeatures && typeof PlanFeatures.hasFeature === 'function') {
      return PlanFeatures.hasFeature(normalizedPlan, featureKey);
    }
    if (featureKey === 'rate_card_management' || featureKey === 'spend_analytics' || featureKey === 'data_governance') {
      return normalizedPlan === 'PRO' || normalizedPlan === 'INDIVIDUELL';
    }
    return false;
  }

  function roleAllowed(map, roleKey) {
    return !!map[String(roleKey || '').trim()];
  }

  function cloneSharedAccess(sharedAccess) {
    if (!sharedAccess) return null;
    var normalized = Object.assign({}, sharedAccess);
    normalized.state = sharedAccess.state || sharedAccess.mode || 'soft_locked';
    normalized.mode = sharedAccess.mode || sharedAccess.state || 'soft_locked';
    normalized.canRead = sharedAccess.canRead === true;
    normalized.canWrite = sharedAccess.canWrite === true;
    normalized.reason = sharedAccess.reason || '';
    return normalized;
  }

  function softLocked(reason, extra, mode) {
    return Object.assign({
      state: 'soft_locked',
      mode: mode || 'soft_locked',
      canRead: false,
      canWrite: false,
      reason: reason || ''
    }, extra || {});
  }

  function readOnly(reason, extra, mode) {
    return Object.assign({
      state: 'read_only',
      mode: mode || 'read_only',
      canRead: true,
      canWrite: false,
      reason: reason || ''
    }, extra || {});
  }

  function full(extra, mode) {
    return Object.assign({
      state: 'full',
      mode: mode || 'full',
      canRead: true,
      canWrite: true,
      reason: ''
    }, extra || {});
  }

  function buyerSurface(orgType, canRead, canWrite, messages, extra) {
    if (orgType && orgType !== 'company') {
      return softLocked(messages.orgReason, extra, 'org_locked');
    }
    if (!canRead) {
      return softLocked(messages.roleReason, extra, 'role_locked');
    }
    if (!canWrite) {
      return readOnly(messages.readOnlyReason, extra, 'read_only');
    }
    return full(extra, 'full');
  }

  function analyticsSurface(orgType, hasFeatureAccess, canRead, messages, extra) {
    if (orgType && orgType !== 'company') {
      return softLocked(messages.orgReason, extra, 'org_locked');
    }
    if (!hasFeatureAccess) {
      return softLocked(messages.planReason, extra, 'plan_locked');
    }
    if (!canRead) {
      return softLocked(messages.roleReason, extra, 'role_locked');
    }
    return full(Object.assign({ canWrite: false }, extra || {}), 'full');
  }

  function resolveRateCardFallback(me) {
    var orgType = normalizeOrgType(me);
    var plan = normalizePlan(me && me.plan);
    var orgRole = String(me && me.org_role || '').trim();
    var planAllowed = hasPlanFeature(plan, 'rate_card_management');

    if (!me) {
      return softLocked('Preisrahmen sind derzeit nicht verifizierbar.', {}, 'locked');
    }
    if (!planAllowed) {
      return softLocked('Preisrahmen bleiben fuer berechtigte PRO-/Individuell-Zugaenge reserviert.', {}, 'plan_locked');
    }
    if (orgType && orgType !== 'company') {
      return softLocked('Preisrahmen bleiben in dieser Steuerungsschicht buyer-seitig fuer Unternehmensorganisationen reserviert.', {}, 'org_locked');
    }
    if (!roleAllowed(RATE_CARD_READ_ROLES, orgRole)) {
      return softLocked('Preisrahmen bleiben nur fuer leseberechtigte Procurement-/Steuerungsrollen sichtbar.', {}, 'role_locked');
    }
    if (!roleAllowed(RATE_CARD_WRITE_ROLES, orgRole)) {
      return readOnly('Preisrahmen bleiben in Ihrer Sicht lesbar, Veraenderungen erfolgen ueber schreibberechtigte Procurement-Rollen.', {}, 'read_only');
    }
    return full({}, 'full');
  }

  function resolveVendorPoolFallback(me) {
    var orgType = normalizeOrgType(me);
    var orgRole = String(me && me.org_role || '').trim();
    return buyerSurface(
      orgType,
      roleAllowed(VENDOR_POOL_READ_ROLES, orgRole),
      roleAllowed(VENDOR_POOL_WRITE_ROLES, orgRole),
      {
        orgReason: 'Lieferantensteuerung ist als buyer-seitige Unternehmensflaeche modelliert und bleibt fuer Zeitarbeitsfirmen bewusst soft-locked.',
        roleReason: 'Lieferantensteuerung bleibt nur fuer freigegebene Procurement-/Steuerungsrollen sichtbar.',
        readOnlyReason: 'Lieferantensteuerung bleibt in Ihrer Rolle lesbar; Tiering und Statusaenderungen erfolgen ueber schreibberechtigte Procurement-Rollen.'
      },
      { canManage: roleAllowed(VENDOR_POOL_WRITE_ROLES, orgRole) }
    );
  }

  function resolveSupplierScorecardFallback(me) {
    var orgType = normalizeOrgType(me);
    var orgRole = String(me && me.org_role || '').trim();
    return buyerSurface(
      orgType,
      roleAllowed(SUPPLIER_READ_ROLES, orgRole),
      roleAllowed(SUPPLIER_WRITE_ROLES, orgRole),
      {
        orgReason: 'Lieferantenbewertung ist als buyer-seitige Unternehmensflaeche modelliert und bleibt fuer Zeitarbeitsfirmen bewusst soft-locked.',
        roleReason: 'Lieferantenbewertung bleibt nur fuer freigegebene Procurement-/Steuerungsrollen sichtbar.',
        readOnlyReason: 'Lieferantenbewertung bleibt in Ihrer Rolle lesbar; Notizen und operative Pflege erfolgen ueber freigegebene Procurement-Rollen.'
      },
      { canAnnotate: roleAllowed(SUPPLIER_WRITE_ROLES, orgRole) }
    );
  }

  function resolveSpendAnalyticsFallback(me) {
    var orgType = normalizeOrgType(me);
    var orgRole = String(me && me.org_role || '').trim();
    return analyticsSurface(
      orgType,
      hasPlanFeature(me && me.plan, 'spend_analytics'),
      roleAllowed(EXECUTIVE_READ_ROLES, orgRole),
      {
        orgReason: 'Spend & Kosten ist als buyer-seitige Unternehmensanalyse modelliert und bleibt fuer Zeitarbeitsfirmen bewusst soft-locked.',
        planReason: 'Spend & Kosten bleibt fuer berechtigte PRO-/Individuell-Zugaenge reserviert.',
        roleReason: 'Spend & Kosten bleibt fuer Executive-/Finance-Rollen reserviert.'
      },
      { canExport: roleAllowed(EXECUTIVE_READ_ROLES, orgRole) }
    );
  }

  function resolveExecutiveDashboardFallback(me) {
    var orgType = normalizeOrgType(me);
    var orgRole = String(me && me.org_role || '').trim();
    return analyticsSurface(
      orgType,
      true,
      roleAllowed(EXECUTIVE_READ_ROLES, orgRole),
      {
        orgReason: 'Steuerung & Analytik ist als buyer-seitige Managementsicht modelliert und bleibt fuer Zeitarbeitsfirmen bewusst soft-locked.',
        planReason: '',
        roleReason: 'Steuerung & Analytik bleibt fuer Executive-/Finance-Rollen reserviert.'
      },
      { canExport: roleAllowed(EXECUTIVE_READ_ROLES, orgRole) }
    );
  }

  function resolveComplianceOverviewFallback(me) {
    var orgRole = String(me && me.org_role || '').trim();
    var canRead = roleAllowed(COMPLIANCE_READ_ROLES, orgRole);
    var canManage = roleAllowed(COMPLIANCE_MANAGE_ROLES, orgRole);
    var canVerify = roleAllowed(COMPLIANCE_VERIFY_ROLES, orgRole);
    var canUpload = roleAllowed(COMPLIANCE_UPLOAD_ROLES, orgRole);

    if (!canRead) {
      if (canUpload) {
        return softLocked(
          'Dieses interne Compliance-Cockpit ist keine reine Upload-Oberflaeche. Sicht, Verifikation und Pflege bleiben an freigegebene Rollen gebunden.',
          { canUpload: true, canVerify: false, canDelete: false, canManage: false },
          'role_locked'
        );
      }
      return softLocked(
        'Compliance bleibt nur fuer freigegebene Rollen lesbar.',
        { canUpload: false, canVerify: false, canDelete: false, canManage: false },
        'role_locked'
      );
    }
    if (canManage || canVerify || canUpload) {
      return full({
        canUpload: canUpload,
        canVerify: canVerify,
        canDelete: canManage,
        canManage: canManage
      }, 'full');
    }
    return readOnly(
      'Compliance bleibt in Ihrer Rolle lesbar; Upload, Verifikation und Aenderungen erfolgen ueber freigegebene Rollen.',
      { canUpload: false, canVerify: false, canDelete: false, canManage: false },
      'read_only'
    );
  }

  function resolveDataGovernanceFallback(me) {
    var plan = normalizePlan(me && me.plan);
    var orgRole = String(me && me.org_role || '').trim();
    var canExport = roleAllowed(DATA_GOVERNANCE_EXPORT_ROLES, orgRole);
    var canAnonymize = roleAllowed(DATA_GOVERNANCE_EXPORT_ROLES, orgRole);
    var canRetention = roleAllowed(DATA_GOVERNANCE_EXPORT_ROLES, orgRole);
    var canRequests = roleAllowed(DATA_GOVERNANCE_EXPORT_ROLES, orgRole);
    var canRead = canExport || canAnonymize || canRetention || canRequests;
    var fullAccess = canExport && canAnonymize && canRetention && canRequests;
    var extra = {
      canExport: canExport,
      canAnonymize: canAnonymize,
      canRetention: canRetention,
      canRequests: canRequests
    };

    if (!hasPlanFeature(plan, 'data_governance')) {
      return softLocked('DSGVO-Governance bleibt fuer berechtigte PRO-/Individuell-Zugaenge reserviert.', extra, 'plan_locked');
    }
    if (!canRead) {
      return softLocked('DSGVO-Governance bleibt fuer Owner/Admin vorbehalten.', extra, 'role_locked');
    }
    if (!fullAccess) {
      return readOnly('DSGVO-Governance ist fuer Ihre Rolle nur teilweise freigegeben; sensible Export-, Retention- oder Loeschaktionen bleiben kontrolliert.', extra, 'read_only');
    }
    return full(extra, 'full');
  }

  function resolve(me, key) {
    var shared = cloneSharedAccess(me && me.surface_access && me.surface_access[key]);
    if (shared) return shared;
    switch (key) {
      case 'rate_cards':
        return resolveRateCardFallback(me);
      case 'vendor_pool':
        return resolveVendorPoolFallback(me);
      case 'supplier_scorecard':
        return resolveSupplierScorecardFallback(me);
      case 'spend_analytics':
        return resolveSpendAnalyticsFallback(me);
      case 'executive_dashboard':
        return resolveExecutiveDashboardFallback(me);
      case 'compliance_overview':
        return resolveComplianceOverviewFallback(me);
      case 'data_governance':
        return resolveDataGovernanceFallback(me);
      default:
        return softLocked('Dieser Bereich ist derzeit nicht verifizierbar.', {}, 'locked');
    }
  }

  root.surfaceAccess = {
    normalizePlan: normalizePlan,
    resolve: resolve
  };
})(window);
