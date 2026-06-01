/* ═══════════════════════════════════════════════════════
   Admin Panel — Control Center Logic
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var controlCenter = null;
  var usersOffset = 0;
  var usersLimit = 50;
  var actOffset = 0;
  var actLimit = 50;
  var _foKeysLoaded = false;
  var currentAdminUserId = null;

  function el(id) { return document.getElementById(id); }
  function esc(value) {
    var div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }
  function emptyState(message) {
    return '<p class="empty">' + esc(message) + '</p>';
  }
  function displayPlanLabel(plan) {
    if (window.PlanFeatures && typeof window.PlanFeatures.getDisplayPlanLabel === 'function') {
      return window.PlanFeatures.getDisplayPlanLabel(plan || 'DEMO');
    }
    var normalized = (plan || 'DEMO').toUpperCase();
    if (normalized === 'FREE') return 'DEMO';
    if (normalized === 'ENTERPRISE' || normalized === 'INDIVIDUELL') return 'Individueller Tarif';
    return normalized;
  }
  function formatDateTime(value) {
    return value ? new Date(value).toLocaleString('de-DE') : '–';
  }
  function formatStrategicStatus(status) {
    var map = {
      eingegangen: 'Eingegangen',
      rueckfrage_offen: 'Rückfrage offen',
      angebot_erstellt: 'Angebot erstellt',
      bestaetigt: 'Bestätigt',
      aktiviert: 'Aktiviert',
      abgelehnt: 'Abgelehnt',
      abgeschlossen: 'Abgeschlossen'
    };
    if (!status) return '–';
    return map[status] || String(status).replace(/_/g, ' ');
  }
  function safeJson(value) {
    return JSON.stringify(value == null ? '' : String(value));
  }
  function describeError(error, fallback) {
    if (!error) return fallback;
    if (typeof error === 'string') return error;
    if (typeof error.message === 'string' && error.message.trim()) return error.message;
    if (error.message && typeof error.message === 'object') {
      if (typeof error.message.message === 'string' && error.message.message.trim()) return error.message.message;
      if (typeof error.message.code === 'string' && error.message.code.trim()) return error.message.code;
    }
    if (error.error && typeof error.error === 'object') {
      if (typeof error.error.message === 'string' && error.error.message.trim()) return error.error.message;
      if (typeof error.error.code === 'string' && error.error.code.trim()) return error.error.code;
    }
    if (typeof error.code === 'string' && error.code.trim()) return error.code;
    try {
      return JSON.stringify(error);
    } catch (_err) {
      return fallback;
    }
  }
  function toInteger(value, fallback, min, max) {
    var parsed = parseInt(value, 10);
    if (!isFinite(parsed)) parsed = fallback;
    if (typeof min === 'number' && parsed < min) parsed = min;
    if (typeof max === 'number' && parsed > max) parsed = max;
    return parsed;
  }
  function renderUsersPaging(total) {
    var pages = Math.ceil((total || 0) / Math.max(usersLimit, 1));
    if (!pages || pages <= 1) return '';
    var currentPage = Math.floor(usersOffset / usersLimit) + 1;
    currentPage = Math.max(1, Math.min(pages, currentPage));
    var windowSize = 7;
    var startPage = Math.max(1, currentPage - Math.floor(windowSize / 2));
    var endPage = Math.min(pages, startPage + windowSize - 1);
    if ((endPage - startPage + 1) < windowSize) {
      startPage = Math.max(1, endPage - windowSize + 1);
    }
    var paging = '';
    if (currentPage > 1) {
      paging += '<button class="btn" onclick="loadUsers(' + Math.max(0, usersOffset - usersLimit) + ')">&laquo; Zurück</button>';
    }
    for (var page = startPage; page <= endPage; page++) {
      var pageOffset = (page - 1) * usersLimit;
      var cls = page === currentPage ? ' primary' : '';
      paging += '<button class="btn' + cls + '" onclick="loadUsers(' + pageOffset + ')">' + page + '</button>';
    }
    if (currentPage < pages) {
      paging += '<button class="btn" onclick="loadUsers(' + (currentPage * usersLimit) + ')">Weiter &raquo;</button>';
    }
    return paging;
  }
  function getRequestedTab() {
    return new URLSearchParams(window.location.search).get('tab') || '';
  }
  function setRequestedTab(tab) {
    var url = new URL(window.location.href);
    if (tab) url.searchParams.set('tab', tab);
    else url.searchParams.delete('tab');
    window.history.replaceState({}, '', url.toString());
  }
  function allowedTabs() {
    return (((controlCenter || {}).context || {}).access || {}).allowed_tabs || [];
  }
  function renderStatCells(items, className) {
    return (items || []).map(function (item) {
      return '<div class="' + className + '">' +
        '<span class="' + className + '__label">' + esc(item.label) + '</span>' +
        '<span class="' + className + '__value">' + esc(item.value) + '</span>' +
      '</div>';
    }).join('');
  }
  function renderAction(action, primary) {
    if (!action || !action.label) return '';
    var cls = primary ? 'admin-card-action admin-card-action--primary' : 'admin-card-link';
    if (action.type === 'tab' && action.target) {
      return '<button type="button" class="' + cls + '" data-action-type="tab" data-target="' + esc(action.target) + '">' + esc(action.label) + '</button>';
    }
    if (action.href) {
      return '<a class="' + cls + '" href="' + esc(action.href) + '">' + esc(action.label) + '</a>';
    }
    return '';
  }
  function iconForCard(key) {
    return {
      admin: '&#128295;',
      users_orgs: '&#128101;',
      audit_log: '&#128220;',
      platform_metrics: '&#128202;',
      sso_saml: '&#128274;',
      workflows: '&#9881;'
    }[key] || '&#128195;';
  }
  function stateToneClass(state) {
    if (state === 'active') return 'admin-card-state--active';
    if (state === 'restricted' || state === 'enterprise_only') return 'admin-card-state--restricted';
    if (state === 'admin_only') return 'admin-card-state--admin_only';
    return 'admin-card-state--planned';
  }
  function statusTag(status) {
    if (status === 'SUCCESS') return '<span class="tag green">SUCCESS</span>';
    if (status === 'DENIED') return '<span class="tag red">DENIED</span>';
    if (status === 'FAILED') return '<span class="tag muted">FAILED</span>';
    return '<span class="tag muted">' + esc(status || '–') + '</span>';
  }
  function setAdminRevenueExportStatus(message, tone) {
    var target = el('adminRevenueExportStatus');
    if (!target) return;
    target.style.color = tone === 'good'
      ? 'var(--good)'
      : tone === 'bad'
        ? 'var(--bad)'
        : tone === 'warn'
          ? 'var(--warn)'
          : 'var(--muted)';
    target.textContent = message || '';
  }
  function setAdminRevenueExportButtonsDisabled(disabled) {
    Array.prototype.slice.call(document.querySelectorAll('button[onclick*="exportAdminRevenueFinanceTruth"]')).forEach(function (button) {
      button.disabled = !!disabled;
    });
  }
  function parseFileNameFromDisposition(headerValue, fallback) {
    if (!headerValue) return fallback;
    var match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(headerValue);
    var raw = match ? (match[1] || match[2]) : null;
    if (!raw) return fallback;
    try { return decodeURIComponent(raw); } catch (_err) { return raw; }
  }
  function triggerBlobDownload(blob, fileName) {
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(function () {
      URL.revokeObjectURL(link.href);
      link.remove();
    }, 1500);
  }

  function renderContextPanel() {
    var context = controlCenter.context || {};
    var user = context.user || {};
    var access = context.access || {};
    currentAdminUserId = user.id || null;
    el('adminContextPanel').innerHTML =
      '<div class="admin-context-panel__head">' +
        '<div>' +
          '<h2 class="admin-context-panel__title">Admin-Zentrale</h2>' +
          '<p class="admin-context-panel__desc">Bestehende Plattformlogik, Card-States und klare Soft-Locks statt globalem Totalsperrer.</p>' +
        '</div>' +
        '<span class="admin-card-state ' + stateToneClass(access.is_admin ? 'active' : 'admin_only') + '">' + esc(access.access_level || 'restricted') + '</span>' +
      '</div>' +
      '<div class="admin-context-stats">' +
        renderStatCells([
          { label: 'Benutzer', value: controlCenter.summary.total_users || 0 },
          { label: 'Organisationen', value: controlCenter.summary.total_orgs || 0 },
          { label: 'Plan', value: user.plan_display_label || displayPlanLabel(user.plan) },
          { label: 'Organisation', value: user.org_name || 'keine Organisation' }
        ], 'admin-context-stat') +
      '</div>';

    el('adminWorkspaceMeta').innerHTML = renderStatCells([
      { label: 'Rolle', value: user.org_role || user.role || 'restricted' },
      { label: 'Backlog', value: controlCenter.summary.requisition_backlog || 0 },
      { label: 'Audit 30 Tage', value: controlCenter.summary.audit_events_30d || 0 }
    ], 'admin-workspace__meta-item');
  }

  function renderRoadmap() {
    var roadmap = (((controlCenter || {}).context || {}).roadmap) || [];
    el('adminRoadmap').innerHTML =
      '<div class="admin-roadmap-panel__head">' +
        '<div>' +
          '<h2 class="admin-roadmap-panel__title">Priorisierte Ausbaufolge</h2>' +
          '<p class="admin-roadmap-panel__desc">Starke Cards zuerst, bewusst kontrollierte Bereiche danach.</p>' +
        '</div>' +
      '</div>' +
      '<ol class="admin-roadmap-list">' +
        roadmap.map(function (item) { return '<li>' + esc(item) + '</li>'; }).join('') +
      '</ol>';
  }

  function renderStateBanner() {
    var banner = el('adminStateBanner');
    var access = (((controlCenter || {}).context || {}).access) || {};
    if (access.is_admin) {
      banner.hidden = true;
      banner.className = 'admin-state-banner';
      banner.innerHTML = '';
      return;
    }
    banner.hidden = false;
    banner.className = 'admin-state-banner admin-state-banner--neutral';
    banner.innerHTML =
      '<div class="admin-state-banner__head">' +
        '<div>' +
          '<h2 class="admin-state-banner__title">Per-Card-Zugriff aktiv</h2>' +
          '<p class="admin-state-banner__desc">Die Zentrale bleibt sichtbar, aber operative Plattformbereiche werden bewusst pro Card freigeschaltet oder soft-gelockt.</p>' +
        '</div>' +
      '</div>' +
      '<div class="admin-card-actions">' +
        '<a class="admin-card-action admin-card-action--primary" href="/public/organization.html?tab=members">Zum Organisationsbereich</a>' +
        '<a class="admin-card-action" href="/public/executive_dashboard.html">Zum Executive Dashboard</a>' +
      '</div>';
  }

  function renderHubCards() {
    var cards = controlCenter.cards || {};
    var order = controlCenter.card_order || Object.keys(cards);
    el('adminHubGrid').innerHTML = order.map(function (key) {
      var card = cards[key];
      if (!card) return '';
      return '<article class="ds-hub-card admin-hub-card admin-hub-card--' + esc(card.state) + '">' +
        '<div class="ds-hub-card__icon">' + iconForCard(key) + '</div>' +
        '<div class="ds-hub-card__content">' +
          '<div class="admin-card-head">' +
            '<div>' +
              '<div class="ds-hub-card__title">' + esc(card.title) + '</div>' +
              '<p class="ds-hub-card__desc">' + esc(card.description || '') + '</p>' +
            '</div>' +
            '<span class="admin-card-state ' + stateToneClass(card.state) + '">' + esc(card.badge || card.state) + '</span>' +
          '</div>' +
          '<div class="admin-card-summary">' + renderStatCells(card.summary || [], 'admin-card-summary__item') + '</div>' +
          '<div class="admin-card-access">' + esc(card.access_message || '') + '</div>' +
          (card.primary_action ? '<div class="admin-card-actions">' + renderAction(card.primary_action, true) + '</div>' : '') +
          ((card.support_links || []).length ? '<div class="admin-card-links">' + card.support_links.map(function (item) { return renderAction(item, false); }).join('') + '</div>' : '') +
          (card.maturity_note ? '<div class="admin-card-maturity">' + esc(card.maturity_note) + '</div>' : '') +
        '</div>' +
      '</article>';
    }).join('');
  }

  function configureWorkspace() {
    var workspace = el('admin-content');
    var tabs = allowedTabs();
    Array.from(document.querySelectorAll('#tabBar .tab-btn')).forEach(function (button) {
      button.style.display = tabs.indexOf(button.dataset.tab) >= 0 ? '' : 'none';
    });
    if (!tabs.length) {
      workspace.style.display = 'none';
      return;
    }
    workspace.style.display = 'block';
    var requested = getRequestedTab();
    var fallback = tabs.indexOf('users') >= 0 ? 'users' : tabs[0];
    openTab(tabs.indexOf(requested) >= 0 ? requested : fallback, { updateUrl: true, force: true });
  }

  function openTab(tab, options) {
    options = options || {};
    if (!tab || allowedTabs().indexOf(tab) < 0) return;
    document.querySelectorAll('#tabBar .tab-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.tab-panel').forEach(function (panel) {
      panel.classList.toggle('active', panel.id === ('tab-' + tab));
    });
    if (options.updateUrl !== false) setRequestedTab(tab);
    ensureTabLoaded(tab, options.force === true);
  }

  function ensureTabLoaded(tab, force) {
    if (tab === 'users') return loadUsers(force ? 0 : usersOffset);
    if (tab === 'orgs' && (force || !el('orgsTable').innerHTML)) return loadOrgs();
    if (tab === 'audit' && (force || !el('auditTable').innerHTML)) return loadAudit();
    if (tab === 'metrics' && (force || !el('metricsGrid').innerHTML)) return loadMetrics();
    if (tab === 'activity' && (force || !el('activityTimeline').innerHTML)) return loadActivityFeed();
    if (tab === 'requests' && (force || !el('boRequestsTable').innerHTML)) return loadBackofficeRequests();
    if (tab === 'strategic' && (force || !el('strategicTable').innerHTML)) return loadStrategicRequests();
    if (tab === 'revenue' && (force || !el('revenueGrid').innerHTML)) return loadRevenue();
    if (tab === 'features') return loadFeatureOverrides();
    if (tab === 'releases' && typeof window.loadProductReleases === 'function') return window.loadProductReleases();
  }

  async function loadUsers(offset) {
    var usersTable = el('usersTable');
    var usersPaging = el('usersPaging');
    if (!usersTable || !usersPaging) return;
    usersOffset = toInteger(offset, 0, 0);
    var searchInput = el('userSearch');
    var q = searchInput ? searchInput.value.trim() : '';
    usersTable.innerHTML = '<p class="ds-text-sm ds-text-muted">Lade Benutzer…</p>';
    usersPaging.innerHTML = '';
    try {
      var d = await TC.api.get('/admin/users?limit=' + usersLimit + '&offset=' + usersOffset + (q ? '&q=' + encodeURIComponent(q) : ''));
      var payload = (d && d.data) || {};
      usersLimit = toInteger(payload.limit, usersLimit, 1, 500);
      usersOffset = toInteger(payload.offset, usersOffset, 0);
      var items = Array.isArray(payload.items) ? payload.items : [];
      var total = toInteger(payload.total, 0, 0);
      if (!items.length) {
        usersTable.innerHTML = emptyState('Keine Benutzer gefunden.');
        return;
      }

      var html = '<table class="admin-table"><thead><tr><th>E-Mail</th><th>Firma</th><th>Organisation</th><th>Org-Rolle</th><th>Plan</th><th>Verifiziert</th><th>Aktionen</th></tr></thead><tbody>';
      items.forEach(function (u) {
        var userId = safeJson(u.id);
        var userPlan = String(u.plan || 'DEMO').toUpperCase();
        var actions = '<select onchange="adminEditUser(' + userId + ',&quot;role&quot;,this.value)" class="ds-select ds-select--xs">';
        ['company', 'agency', 'admin', 'inactive'].forEach(function (role) {
          actions += '<option value="' + role + '"' + (u.role === role ? ' selected' : '') + '>' + role + '</option>';
        });
        actions += '</select>';
        actions += '<select onchange="adminEditUser(' + userId + ',&quot;plan&quot;,this.value)" class="ds-select ds-select--xs">';
        ['DEMO', 'BASIS', 'PLUS', 'PRO', 'INDIVIDUELL'].forEach(function (plan) {
          var selected = userPlan === plan || (plan === 'INDIVIDUELL' && userPlan === 'ENTERPRISE') || (plan === 'DEMO' && userPlan === 'FREE');
          actions += '<option value="' + plan + '"' + (selected ? ' selected' : '') + '>' + esc(displayPlanLabel(plan)) + '</option>';
        });
        actions += '</select>';
        if (!u.is_verified) actions += ' <button class="btn good ds-btn--xs" onclick="adminEditUser(' + userId + ',&quot;is_verified&quot;,true)">Verifizieren</button>';
        if (u.role !== 'inactive') actions += ' <button class="btn bad ds-btn--xs" onclick="adminDeactivate(' + userId + ')">Deaktivieren</button>';

        html += '<tr>' +
          '<td>' + esc(u.email || '') + '</td>' +
          '<td>' + esc(u.company_name || '–') + '</td>' +
          '<td>' + esc(u.org_name || '–') + '</td>' +
          '<td><span class="tag blue">' + esc(u.org_role || '–') + '</span></td>' +
          '<td>' + esc(displayPlanLabel(userPlan || 'DEMO')) + '</td>' +
          '<td>' + (u.is_verified ? '<span class="tag green">Ja</span>' : '<span class="tag red">Nein</span>') + '</td>' +
          '<td style="white-space:nowrap">' + actions + '</td>' +
        '</tr>';
      });
      html += '</tbody></table>';
      usersTable.innerHTML = html;
      usersPaging.innerHTML = renderUsersPaging(total);
    } catch (e) {
      usersTable.innerHTML = '<p class="ds-text-sm" style="color:var(--bad)">' + esc(describeError(e, 'Benutzer konnten nicht geladen werden.')) + '</p>';
      usersPaging.innerHTML = '';
    }
  }

  async function loadOrgs() {
    var d = await TC.api.get('/admin/organizations');
    var items = (d.data && d.data.items) || [];
    if (!items.length) {
      el('orgsTable').innerHTML = emptyState('Keine Organisationen.');
      return;
    }
    var currentOrgId = ((((controlCenter || {}).context || {}).user || {}).org_id) || '';
    var html = '<table class="admin-table"><thead><tr><th>Name</th><th>Typ</th><th>Plan</th><th>Mitglieder</th><th>Standorte</th><th>Status</th><th>Aktion</th></tr></thead><tbody>';
    items.forEach(function (o) {
      var currentLink = String(o.id || '') === String(currentOrgId || '')
        ? '<a class="btn ds-btn--xs" href="/public/organization.html?tab=members">Org-Center</a>'
        : '–';
      html += '<tr>' +
        '<td>' + esc(o.name || '') + '</td>' +
        '<td>' + esc(o.org_type || '–') + '</td>' +
        '<td>' + esc(displayPlanLabel(o.plan || 'DEMO')) + '</td>' +
        '<td>' + (o.member_count || 0) + '</td>' +
        '<td>' + (o.location_count || 0) + '</td>' +
        '<td>' + (o.is_active ? '<span class="tag green">Aktiv</span>' : '<span class="tag red">Inaktiv</span>') + '</td>' +
        '<td>' + currentLink + '</td>' +
      '</tr>';
    });
    html += '</tbody></table>';
    el('orgsTable').innerHTML = html;
  }

  function syncAuditExportLink(params) {
    el('auditExportLink').href = '/api/admin/audit-log/export/csv' + (params.length ? '?' + params.join('&') : '');
  }

  async function loadAudit() {
    var params = [];
    var actor = el('auditActor').value.trim(); if (actor) params.push('actor_search=' + encodeURIComponent(actor));
    var org = el('auditOrg').value.trim(); if (org) params.push('org_search=' + encodeURIComponent(org));
    var entityType = el('auditEntity').value.trim(); if (entityType) params.push('entity_type=' + encodeURIComponent(entityType));
    var action = el('auditAction').value.trim(); if (action) params.push('action=' + encodeURIComponent(action));
    var actionType = el('auditActionType').value; if (actionType) params.push('action_type=' + encodeURIComponent(actionType));
    var status = el('auditStatus').value; if (status) params.push('status=' + encodeURIComponent(status));
    var from = el('auditFrom').value; if (from) params.push('from=' + encodeURIComponent(from));
    var to = el('auditTo').value; if (to) params.push('to=' + encodeURIComponent(to));
    params.push('limit=100');
    syncAuditExportLink(params);

    var d = await TC.api.get('/admin/audit-log?' + params.join('&'));
    var items = (d.data && d.data.items) || [];
    el('auditDetail').innerHTML = '';
    if (!items.length) {
      el('auditTable').innerHTML = emptyState('Keine Audit-Einträge.');
      return;
    }

    var html = '<table class="admin-table"><thead><tr><th>Zeitpunkt</th><th>Aktion</th><th>Ressource</th><th>Akteur</th><th>Organisation</th><th>Status</th><th></th></tr></thead><tbody>';
    items.forEach(function (a) {
      var detailBtn = (a.entity_type && a.entity_id)
        ? '<button class="btn ds-btn--xs" onclick="loadAuditRecentChanges(' + safeJson(a.entity_type) + ',' + safeJson(a.entity_id) + ')">Details</button>'
        : '';
      html += '<tr>' +
        '<td style="white-space:nowrap">' + esc(formatDateTime(a.created_at)) + '</td>' +
        '<td><strong>' + esc(a.action_label || a.action || '') + '</strong><div class="ds-text-sm" style="color:var(--muted)">' + esc(a.action_type || '–') + '</div></td>' +
        '<td>' + esc(a.resource || ((a.entity_type || '') + ' #' + (a.entity_id || ''))) + '</td>' +
        '<td>' + esc(a.user || a.actor_email || a.actor_id || '–') + '</td>' +
        '<td>' + esc(a.org_name || a.org_id || '–') + '</td>' +
        '<td>' + statusTag(a.status) + '</td>' +
        '<td>' + detailBtn + '</td>' +
      '</tr>';
    });
    html += '</tbody></table>';
    el('auditTable').innerHTML = html;
  }

  async function loadAuditRecentChanges(entityType, entityId) {
    el('auditDetail').innerHTML = '<p class="ds-text-sm ds-text-muted">Lade Änderungen…</p>';
    var d = await TC.api.get('/admin/audit-log/recent-changes?entity_type=' + encodeURIComponent(entityType) + '&entity_id=' + encodeURIComponent(entityId));
    var items = (d.data && d.data.items) || [];
    if (!items.length) {
      el('auditDetail').innerHTML = emptyState('Keine Detailänderungen gefunden.');
      return;
    }
    el('auditDetail').innerHTML =
      '<h3 class="admin-detail-panel__title">Recent Changes – ' + esc(entityType) + ' #' + esc(entityId) + '</h3>' +
      '<div class="admin-detail-list">' +
      items.map(function (item) {
        return '<div class="admin-detail-item">' +
          '<div class="admin-detail-item__meta">' +
            '<span>' + esc(formatDateTime(item.created_at)) + '</span>' +
            '<span>' + esc(item.actor_name || item.actor_email || '–') + '</span>' +
            '<span>' + esc(item.action_type || '–') + '</span>' +
            '<span>' + esc(item.status || '–') + '</span>' +
          '</div>' +
          '<div class="admin-detail-item__action">' + esc(item.action || '') + '</div>' +
          ((item.old_values || item.new_values || item.details)
            ? '<code>' + esc(JSON.stringify(item.new_values || item.details || item.old_values, null, 2)) + '</code>'
            : '<div class="ds-text-sm" style="color:var(--muted)">Keine Detaildaten</div>') +
        '</div>';
      }).join('') +
      '</div>';
  }

  function renderMetricBreakdown(title, map) {
    var entries = Object.keys(map || {});
    if (!entries.length) return '';
    return '<div style="margin-top:18px">' +
      '<h4 style="margin:0 0 8px;font-size:14px;font-weight:700">' + esc(title) + '</h4>' +
      '<table class="admin-table"><thead><tr><th>Typ</th><th>Anzahl</th></tr></thead><tbody>' +
      entries.map(function (key) {
        return '<tr><td>' + esc(key) + '</td><td>' + esc(map[key]) + '</td></tr>';
      }).join('') +
      '</tbody></table>' +
    '</div>';
  }

  async function loadMetrics() {
    var d = await TC.api.get('/admin/metrics');
    var m = d.data || {};
    var tiles = [
      { lbl: 'Benutzer gesamt', val: (m.users && m.users.total) || 0 },
      { lbl: 'Neu (30 Tage)', val: (m.users && m.users.last_30d) || 0 },
      { lbl: 'Organisationen', val: (m.organizations && m.organizations.total) || 0 },
      { lbl: 'Aktive Personalangebote', val: (m.capacity_posts && m.capacity_posts.active) || 0 },
      { lbl: 'Req-Backlog', val: (m.summary && m.summary.requisition_backlog) || 0 },
      { lbl: 'Aktive Angebote', val: (m.summary && m.summary.active_offers) || 0 },
      { lbl: 'Events 30 Tage', val: (m.summary && m.summary.event_total_30d) || 0 }
    ];
    el('metricsGrid').innerHTML = tiles.map(function (tile) {
      return '<div class="metric-tile"><div class="val">' + esc(tile.val) + '</div><div class="lbl">' + esc(tile.lbl) + '</div></div>';
    }).join('');

    var labels = {
      executive_dashboard: 'Executive Dashboard',
      organization_center: 'Organization Control Center',
      system_health: 'System Health',
      requisitions_backlog: 'Arbeitsplatzangebot-Backlog',
      activity_feed: 'Governance Timeline'
    };
    var descriptions = {
      executive_dashboard: 'Managementsicht und Executive-KPIs öffnen.',
      organization_center: 'Bestehende Org-Steuerung und Usage-/Security-Bereiche nutzen.',
      system_health: 'Systemdiagnostik und Operations-Status öffnen.',
      requisitions_backlog: 'Offene Arbeitsplatzangebote prüfen.',
      activity_feed: 'Governance-Timeline mit lesbaren Ereignissen öffnen.'
    };
    var drilldowns = m.drilldowns || {};
    el('metricsDeepLinks').innerHTML = Object.keys(drilldowns).map(function (key) {
      return '<a class="admin-link-card" href="' + esc(drilldowns[key]) + '">' +
        '<div class="admin-link-card__title">' + esc(labels[key] || key) + '</div>' +
        '<div class="admin-link-card__desc">' + esc(descriptions[key] || 'Zielseite öffnen.') + '</div>' +
      '</a>';
    }).join('');

    el('metricsDetail').innerHTML =
      '<div class="admin-context-stats">' +
        renderStatCells([
          { label: 'Users', value: (m.users && m.users.total) || 0 },
          { label: 'Orgs', value: (m.organizations && m.organizations.total) || 0 },
          { label: 'Personalangebote', value: (m.capacity_posts && m.capacity_posts.active) || 0 },
          { label: 'Events', value: (m.events && m.events.total) || 0 }
        ], 'admin-context-stat') +
      '</div>' +
      renderMetricBreakdown('Arbeitsplatzangebote nach Status', m.requisitions || {}) +
      renderMetricBreakdown('Angebote nach Status', m.offers || {}) +
      renderMetricBreakdown('Plattform-Events nach Typ', (m.events && m.events.by_type) || {});
  }

  async function exportAdminRevenueFinanceTruth(format) {
    var normalized = String(format || '').toLowerCase();
    if (normalized !== 'csv' && normalized !== 'json') return;
    setAdminRevenueExportButtonsDisabled(true);
    setAdminRevenueExportStatus('Export wird erstellt…', 'muted');
    try {
      if (normalized === 'csv') {
        var response = await TC.api.request('/reporting/finance-truth/export?format=csv', { method: 'GET', rawResponse: true });
        var csvBlob = await response.blob();
        var csvName = parseFileNameFromDisposition(
          response.headers.get('content-disposition'),
          'finance-truth-' + new Date().toISOString().slice(0, 10) + '.csv'
        );
        triggerBlobDownload(csvBlob, csvName);
      } else {
        var payload = await TC.api.get('/reporting/finance-truth/export?format=json');
        var jsonBlob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
        var jsonName = 'finance-truth-' + new Date().toISOString().slice(0, 10) + '.json';
        triggerBlobDownload(jsonBlob, jsonName);
      }
      setAdminRevenueExportStatus('Export bereitgestellt.', 'good');
    } catch (error) {
      setAdminRevenueExportStatus('Export fehlgeschlagen: ' + ((error && error.message) || 'Unbekannter Fehler'), 'bad');
    } finally {
      setAdminRevenueExportButtonsDisabled(false);
    }
  }

  async function loadRevenue() {
    var target = el('revenueGrid');
    function exportToolbar(message) {
      return '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px">' +
        "<button class=\"btn\" type=\"button\" onclick=\"exportAdminRevenueFinanceTruth('csv')\">Export CSV</button>" +
        "<button class=\"btn\" type=\"button\" onclick=\"exportAdminRevenueFinanceTruth('json')\">Export JSON</button>" +
        '<span id="adminRevenueExportStatus" class="ds-text-sm ds-text-muted" aria-live="polite">' + esc(message || 'CSV/JSON Snapshot für Audit verfügbar.') + '</span>' +
      '</div>';
    }
    target.innerHTML = exportToolbar('Lade Revenue-Metriken…') + '<p class="ds-text-sm ds-text-muted">Lade Revenue-Metriken…</p>';
    try {
      var d = await TC.api.get('/admin/revenue');
      var m = d.data || {};
      var subscription = m.subscription_truth || {};
      var invoice = m.invoice_truth || {};
      var payment = m.payment_truth || {};
      var billable = m.billable_truth || {};
      var recon = m.reconciliation_30d || {};
      var retention = m.retention_truth || {};
      var pilotTruth = m.pilot_conversion_truth || {};
      var retHeadline = retention.headline || {};
      var retUsage = retention.usage_intensity || {};
      var pilotHeadline = pilotTruth.headline || {};
      var pilotTransitions = pilotTruth.transitions || {};
      var pilotStages = Array.isArray(pilotTruth.current_stage_distribution) ? pilotTruth.current_stage_distribution : [];
      var pilotTariffRows = ((((pilotTruth || {}).gtm_learning || {}).by_tariff_path) || []).slice(0, 5);
      var pilotIcpRows = ((((pilotTruth || {}).gtm_learning || {}).by_icp) || []).slice(0, 5);
      var pilotModules = (((pilotTruth || {}).gtm_learning || {}).product_area_usage) || [];
      var pilotAtRisk = ((((pilotTruth || {}).org_drilldown || {}).at_risk) || []).slice(0, 8);
      var pilotBottlenecks = ((((pilotTruth || {}).gtm_learning || {}).onboarding_bottlenecks) || []).slice(0, 5);
      var pilotQuality = pilotTruth.quality_flags || {};

      function toNumber(value, fallback) {
        var n = Number(value);
        return Number.isFinite(n) ? n : fallback;
      }
      function euro(value) {
        return toNumber(value, 0).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';
      }
      function euroCents(cents) {
        return (toNumber(cents, 0) / 100).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';
      }
      function percent(value) {
        if (value == null || !isFinite(Number(value))) return '–';
        return Number(value).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
      }
      function days(value) {
        if (value == null || !isFinite(Number(value))) return '–';
        return Number(value).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' d';
      }
      function stageLabel(stage) {
        var labels = {
          lead: 'Lead',
          qualified: 'Qualifiziert',
          registered: 'Registriert',
          pilot_started: 'Pilot gestartet',
          pilot_activated: 'Pilot aktiviert',
          first_core_flow_executed: 'Erster Kernfluss',
          pilot_successful_usage: 'Belastbare Nutzung',
          commercial_pricing_clarified: 'Pricing klar',
          paid_live: 'Zahlend live',
          lost_aborted: 'Verloren'
        };
        return labels[stage] || stage || '–';
      }
      function tariffPathLabel(path) {
        var labels = {
          pilot: 'Pilot-Pfad',
          direct_contract: 'Direktvertrag',
          catalog_paid: 'Katalog / live',
          lead_only: 'Lead only',
          unclassified: 'Unklassifiziert'
        };
        return labels[path] || path || '–';
      }
      function moduleLabel(module) {
        var labels = {
          demand: 'Demand',
          deal: 'Deal',
          delivery: 'Delivery',
          vendor_governance: 'Vendor Governance'
        };
        return labels[module] || module || '–';
      }
      function renderPricingSourceRows(rows) {
        if (!rows.length) return '<p class="ds-text-sm ds-text-muted">Keine Preisquellen-Daten verfügbar.</p>';
        return '<table class="admin-table"><thead><tr><th>Preisquelle</th><th>Subscriber</th><th>MRR</th><th>ARR</th></tr></thead><tbody>' +
          rows.map(function (row) {
            return '<tr>' +
              '<td>' + esc(row.source || 'unknown') + '</td>' +
              '<td>' + esc(row.subscribers || 0) + '</td>' +
              '<td>' + esc(euro(row.mrr || 0)) + '</td>' +
              '<td>' + esc(euro(row.arr || 0)) + '</td>' +
            '</tr>';
          }).join('') +
          '</tbody></table>';
      }

      var pendingQuotes = toNumber((m.custom_quote_pending && m.custom_quote_pending.count) || subscription.pending_quote_subscribers || 0, 0);
      var spendInvoiceGap = toNumber(recon.spend_invoice_gap_cents || 0, 0);
      var coveragePct = recon.coverage_ratio_pct == null ? '–' : (String(recon.coverage_ratio_pct) + '%');
      var pricingRows = Array.isArray(m.pricing_state_breakdown) ? m.pricing_state_breakdown : [];

      var cards = [
        { lbl: 'Contractual MRR', val: euro(subscription.contractually_active_mrr || m.mrr_total || 0), color: 'var(--ds-success)' },
        { lbl: 'Catalog MRR (theoretisch)', val: euro(subscription.catalog_mrr_theoretical || m.catalog_mrr_theoretical || 0), color: 'var(--ds-brand)' },
        { lbl: 'Open Receivables', val: euroCents(invoice.open_receivables_cents || 0), color: toNumber(invoice.overdue_receivables_cents || 0, 0) > 0 ? '#f87171' : 'var(--ds-warning)' },
        { lbl: 'Paid Revenue', val: euroCents(invoice.paid_revenue_cents || 0), color: 'var(--ds-success)' },
        { lbl: 'Billable (uninvoiced)', val: billable.available === false ? '–' : euroCents(billable.approved_uninvoiced_amount_cents || 0), color: 'var(--ds-accent)' },
        { lbl: 'Pending Quotes', val: pendingQuotes, color: pendingQuotes > 0 ? 'var(--ds-warning)' : 'var(--ds-success)' },
        { lbl: 'Completed Payments', val: payment.available === false ? '–' : euroCents(payment.completed_amount_cents || 0), color: 'var(--ds-brand)' },
        { lbl: 'Spend↔Invoice Gap (30d)', val: recon.available === false ? '–' : euroCents(spendInvoiceGap), color: recon.available === false ? 'var(--ds-text-secondary)' : (spendInvoiceGap > 0 ? 'var(--ds-warning)' : 'var(--ds-success)') },
        { lbl: 'Active Paid Orgs', val: toNumber(retHeadline.active_paid_orgs || 0, 0), color: 'var(--ds-brand)' },
        { lbl: 'Retained Logos', val: toNumber(retHeadline.retained_logos || 0, 0), color: 'var(--ds-success)' },
        { lbl: 'Logo Churn Rate', val: percent(retHeadline.logo_churn_rate_pct), color: toNumber(retHeadline.logo_churn_rate_pct || 0, 0) >= 10 ? 'var(--bad)' : 'var(--ds-warning)' },
        { lbl: 'NRR', val: percent(retHeadline.net_revenue_retention_pct), color: toNumber(retHeadline.net_revenue_retention_pct || 0, 0) >= 100 ? 'var(--ds-success)' : 'var(--ds-warning)' },
        { lbl: 'Inactive but Paying', val: toNumber(retHeadline.inactive_but_paying_orgs || 0, 0), color: toNumber(retHeadline.inactive_but_paying_orgs || 0, 0) > 0 ? 'var(--ds-warning)' : 'var(--ds-success)' },
        { lbl: 'PQA', val: toNumber(retHeadline.pqa_orgs || 0, 0), color: '#4fa7ff' },
        { lbl: 'Active Pilots', val: toNumber(pilotHeadline.active_pilots || 0, 0), color: 'var(--ds-brand)' },
        { lbl: 'Activated Pilots', val: toNumber(pilotHeadline.activated_pilots || 0, 0), color: '#4fa7ff' },
        { lbl: 'Converted Pilots', val: toNumber(pilotHeadline.converted_pilots || 0, 0), color: 'var(--ds-success)' },
        { lbl: 'At-Risk Pilots', val: toNumber(pilotHeadline.at_risk_pilots || 0, 0), color: toNumber(pilotHeadline.at_risk_pilots || 0, 0) > 0 ? 'var(--ds-warning)' : 'var(--ds-success)' },
        { lbl: 'Ø Tage bis Aktivierung', val: days(pilotHeadline.avg_days_to_activation), color: 'var(--ds-text)' },
        { lbl: 'Ø Tage bis Conversion', val: days(pilotHeadline.avg_days_to_conversion), color: 'var(--ds-text)' }
      ];

      var html = exportToolbar('CSV/JSON Snapshot für Audit verfügbar.');
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:20px">';
      cards.forEach(function (kpi) {
        html += '<div class="metric-tile"><div class="val" style="color:' + kpi.color + '">' + esc(kpi.val) + '</div><div class="lbl">' + esc(kpi.lbl) + '</div></div>';
      });
      html += '</div>';

      html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px">';
      html += '<div class="admin-detail-item"><h4 style="margin:0 0 8px">Preisquellen (MRR)</h4>' + renderPricingSourceRows(pricingRows) + '</div>';
      html += '<div class="admin-detail-item"><h4 style="margin:0 0 8px">Invoice-Lifecycle</h4>' +
        '<div class="admin-context-stats">' + renderStatCells([
          { label: 'Draft', value: invoice.draft_count || 0 },
          { label: 'Issued', value: invoice.issued_count || 0 },
          { label: 'Overdue', value: invoice.overdue_count || 0 },
          { label: 'Paid', value: invoice.paid_count || 0 },
          { label: 'Void', value: invoice.void_count || 0 }
        ], 'admin-context-stat') + '</div>' +
        '<p class="ds-text-sm ds-text-muted" style="margin-top:8px">Invoiced: ' + esc(euroCents(invoice.invoiced_revenue_cents || 0)) + ' · Paid: ' + esc(euroCents(invoice.paid_revenue_cents || 0)) + ' · Open: ' + esc(euroCents(invoice.open_receivables_cents || 0)) + '</p>' +
        (invoice.available === false ? '<p class="ds-text-sm ds-text-muted">Invoice-Wahrheit ist im aktuellen Schema noch nicht vollständig verfügbar.</p>' : '') +
      '</div>';
      html += '<div class="admin-detail-item"><h4 style="margin:0 0 8px">Payment Sessions</h4>' +
        '<div class="admin-context-stats">' + renderStatCells([
          { label: 'Completed', value: payment.completed_count || 0 },
          { label: 'Pending', value: payment.pending_count || 0 },
          { label: 'Failed', value: payment.failed_count || 0 },
          { label: 'Expired', value: payment.expired_count || 0 }
        ], 'admin-context-stat') + '</div>' +
        '<p class="ds-text-sm ds-text-muted" style="margin-top:8px">Completed Amount: ' + esc(euroCents(payment.completed_amount_cents || 0)) + '</p>' +
        (payment.available === false ? '<p class="ds-text-sm ds-text-muted">Payment-Truth ist im aktuellen Schema noch nicht vollständig verfügbar.</p>' : '') +
      '</div>';
      html += '<div class="admin-detail-item"><h4 style="margin:0 0 8px">Leistungsbasierte Fakturierung</h4>' +
        '<div class="admin-context-stats">' + renderStatCells([
          { label: 'Billable Timesheets', value: billable.approved_uninvoiced_timesheets || 0 },
          { label: 'Billable Hours', value: toNumber(billable.approved_uninvoiced_hours || 0, 0).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' h' },
          { label: 'Missing Rate', value: billable.missing_rate_count || 0 }
        ], 'admin-context-stat') + '</div>' +
        '<p class="ds-text-sm ds-text-muted" style="margin-top:8px">Uninvoiced Billable Volume: ' + esc(euroCents(billable.approved_uninvoiced_amount_cents || 0)) + '</p>' +
        (billable.available === false ? '<p class="ds-text-sm ds-text-muted">Billable-Wahrheit ist im aktuellen Schema noch nicht vollständig verfügbar.</p>' : '') +
      '</div>';
      html += '<div class="admin-detail-item"><h4 style="margin:0 0 8px">Spend ↔ Invoice Bridge (30 Tage)</h4>' +
        '<p class="ds-text-sm ds-text-muted">Approved Spend: ' + esc(euroCents(recon.approved_spend_30d_cents || 0)) + '</p>' +
        '<p class="ds-text-sm ds-text-muted">Operational Invoiced: ' + esc(euroCents(recon.operational_invoiced_30d_cents || 0)) + '</p>' +
        '<p class="ds-text-sm ds-text-muted">Gap: ' + esc(euroCents(spendInvoiceGap)) + ' · Coverage: ' + esc(coveragePct) + '</p>' +
        (recon.available === false ? '<p class="ds-text-sm ds-text-muted">Spend/Invoice-Reconciliation ist im aktuellen Schema noch nicht vollständig verfügbar.</p>' : '') +
      '</div>';
      html += '<div class="admin-detail-item"><h4 style="margin:0 0 8px">Retention / Churn / Usage Truth</h4>' +
        '<div class="admin-context-stats">' + renderStatCells([
          { label: 'Active Customer', value: retHeadline.active_customer_orgs || 0 },
          { label: 'Previous Cohort', value: retHeadline.previous_active_customer_orgs || 0 },
          { label: 'Retained Rate', value: percent(retHeadline.retained_logo_rate_pct) },
          { label: 'Logo Churn', value: percent(retHeadline.logo_churn_rate_pct) },
          { label: 'Gross Churn MRR', value: euro(retHeadline.gross_revenue_churn_mrr || 0) },
          { label: 'Expansion MRR', value: euro(retHeadline.expansion_mrr || 0) },
          { label: 'NRR', value: percent(retHeadline.net_revenue_retention_pct) },
          { label: 'Pilot Converted', value: retHeadline.pilot_converted_orgs_30d || 0 }
        ], 'admin-context-stat') + '</div>' +
        '<p class="ds-text-sm ds-text-muted" style="margin-top:8px">Usage Bands: High ' + esc(retUsage.high || 0) + ' · Medium ' + esc(retUsage.medium || 0) + ' · Low ' + esc(retUsage.low || 0) + ' · Dormant ' + esc(retUsage.dormant || 0) + '</p>' +
        '<p class="ds-text-sm ds-text-muted">At-Risk Accounts: ' + esc((((retention.org_drilldown || {}).at_risk || []).length || 0)) + ' · PQA: ' + esc((((retention.org_drilldown || {}).pqa || []).length || 0)) + '</p>' +
        ((retention.quality_flags && retention.quality_flags.usage_source_available === false) ? '<p class="ds-text-sm ds-text-muted">Usage-Quelle derzeit nicht verfügbar; usage-basierte Kohortenwerte sind eingeschränkt.</p>' : '') +
      '</div>';
      html += '<div class="admin-detail-item"><h4 style="margin:0 0 8px">Pilot / Conversion Truth</h4>' +
        '<div class="admin-context-stats">' + renderStatCells([
          { label: 'Tracked Orgs', value: pilotHeadline.tracked_orgs || 0 },
          { label: 'Leads', value: pilotHeadline.leads || 0 },
          { label: 'Qualified', value: pilotHeadline.qualified || 0 },
          { label: 'Registered', value: pilotHeadline.registered || 0 },
          { label: 'Active Pilots', value: pilotHeadline.active_pilots || 0 },
          { label: 'Activated Pilots', value: pilotHeadline.activated_pilots || 0 },
          { label: 'Converted Pilots', value: pilotHeadline.converted_pilots || 0 },
          { label: 'At-Risk Pilots', value: pilotHeadline.at_risk_pilots || 0 }
        ], 'admin-context-stat') + '</div>' +
        '<p class="ds-text-sm ds-text-muted" style="margin-top:8px">Pilot → Aktiviert: ' + esc(percent((pilotTransitions.pilot_started_to_activated || {}).rate_pct)) + ' · Aktiviert → Paid: ' + esc(percent((pilotTransitions.activated_to_paid_live || {}).rate_pct)) + ' · Pilot → Lost: ' + esc(percent((pilotTransitions.pilot_to_lost || {}).rate_pct)) + '</p>' +
        '<p class="ds-text-sm ds-text-muted">Ø Tage bis Aktivierung: ' + esc(days(pilotHeadline.avg_days_to_activation)) + ' · Ø Tage bis Conversion: ' + esc(days(pilotHeadline.avg_days_to_conversion)) + '</p>' +
        (pilotQuality.pre_registration_lead_capture_available === false ? '<p class="ds-text-sm ds-text-muted">Lead-Capture vor Registrierung ist nur teilweise vorhanden; Fallbacks werden transparent ausgewiesen.</p>' : '') +
        (pilotQuality.pricing_clarity_timestamps_partially_inferred ? '<p class="ds-text-sm ds-text-muted">Pricing-Klarheit nutzt teilweise abgeleitete historische Zeitanker.</p>' : '') +
      '</div>';
      html += '<div class="admin-detail-item"><h4 style="margin:0 0 8px">Pilot Funnel / Stages / Risiken</h4>' +
        '<div style="overflow:auto">' +
          '<table class="admin-table"><thead><tr><th>Stage</th><th>Orgs</th><th>Ø Tage</th><th>At-Risk</th></tr></thead><tbody>' +
            (pilotStages.length ? pilotStages.map(function (row) {
              return '<tr>' +
                '<td>' + esc(stageLabel(row.stage)) + '</td>' +
                '<td>' + esc(row.orgs || 0) + '</td>' +
                '<td>' + esc(days(row.avg_days_in_stage)) + '</td>' +
                '<td>' + esc(row.at_risk_orgs || 0) + '</td>' +
              '</tr>';
            }).join('') : '<tr><td colspan="4">Keine Funnel-Stufen vorhanden.</td></tr>') +
          '</tbody></table>' +
        '</div>' +
        '<div style="overflow:auto;margin-top:12px">' +
          '<table class="admin-table"><thead><tr><th>Transition</th><th>Cohort</th><th>Converted</th><th>Rate</th></tr></thead><tbody>' +
            [
              { label: 'Lead → Registrierung', data: pilotTransitions.lead_to_registered || {} },
              { label: 'Registrierung → Pilotstart', data: pilotTransitions.registration_to_pilot_started || {} },
              { label: 'Pilotstart → Aktivierung', data: pilotTransitions.pilot_started_to_activated || {} },
              { label: 'Aktivierung → Paid', data: pilotTransitions.activated_to_paid_live || {} },
              { label: 'Pilot → Lost', data: pilotTransitions.pilot_to_lost || {} }
            ].map(function (row) {
              return '<tr>' +
                '<td>' + esc(row.label) + '</td>' +
                '<td>' + esc(row.data.cohort_count || 0) + '</td>' +
                '<td>' + esc(row.data.converted_count || 0) + '</td>' +
                '<td>' + esc(percent(row.data.rate_pct)) + '</td>' +
              '</tr>';
            }).join('') +
          '</tbody></table>' +
        '</div>' +
        (pilotAtRisk.length ? '<div style="overflow:auto;margin-top:12px"><table class="admin-table"><thead><tr><th>Organisation</th><th>Stage</th><th>Risk</th><th>Hinweise</th></tr></thead><tbody>' +
          pilotAtRisk.map(function (row) {
            return '<tr>' +
              '<td>' + esc(row.org_name || row.org_id || '–') + '</td>' +
              '<td>' + esc(stageLabel(row.current_stage)) + '</td>' +
              '<td>' + esc(row.risk_score || 0) + '</td>' +
              '<td>' + esc(((row.risk_reasons || []).slice(0, 2)).join(' · ') || '–') + '</td>' +
            '</tr>';
          }).join('') +
        '</tbody></table></div>' : '') +
      '</div>';
      html += '<div class="admin-detail-item"><h4 style="margin:0 0 8px">GTM Learnings</h4>' +
        '<div style="overflow:auto">' +
          '<table class="admin-table"><thead><tr><th>Pfad</th><th>Tracked</th><th>Aktiviert</th><th>Converted</th></tr></thead><tbody>' +
            (pilotTariffRows.length ? pilotTariffRows.map(function (row) {
              return '<tr>' +
                '<td>' + esc(tariffPathLabel(row.label || row.key)) + '</td>' +
                '<td>' + esc(row.tracked_orgs || 0) + '</td>' +
                '<td>' + esc(percent(row.activation_rate_pct)) + '</td>' +
                '<td>' + esc(percent(row.conversion_rate_pct)) + '</td>' +
              '</tr>';
            }).join('') : '<tr><td colspan="4">Keine Tarifpfade vorhanden.</td></tr>') +
          '</tbody></table>' +
        '</div>' +
        '<div style="overflow:auto;margin-top:12px">' +
          '<table class="admin-table"><thead><tr><th>ICP</th><th>Tracked</th><th>Aktiviert</th><th>Converted</th></tr></thead><tbody>' +
            (pilotIcpRows.length ? pilotIcpRows.map(function (row) {
              return '<tr>' +
                '<td>' + esc(row.label || row.key || '–') + '</td>' +
                '<td>' + esc(row.tracked_orgs || 0) + '</td>' +
                '<td>' + esc(percent(row.activation_rate_pct)) + '</td>' +
                '<td>' + esc(percent(row.conversion_rate_pct)) + '</td>' +
              '</tr>';
            }).join('') : '<tr><td colspan="4">Keine ICP-Learnings vorhanden.</td></tr>') +
          '</tbody></table>' +
        '</div>' +
        '<p class="ds-text-sm ds-text-muted" style="margin-top:8px">' +
          (pilotBottlenecks.length
            ? ('Onboarding-Bottlenecks: ' + pilotBottlenecks.map(function (row) { return row.label + ' (' + row.blocked_pilots + ')'; }).join(' · '))
            : 'Keine dominanten Onboarding-Bottlenecks identifiziert.') +
        '</p>' +
        (pilotModules.length ? '<div style="overflow:auto;margin-top:12px"><table class="admin-table"><thead><tr><th>Produktbereich</th><th>Pilot-Orgs</th><th>Active Pilots</th><th>Successful Usage</th><th>Events</th></tr></thead><tbody>' +
          pilotModules.map(function (row) {
            return '<tr>' +
              '<td>' + esc(moduleLabel(row.module)) + '</td>' +
              '<td>' + esc(row.pilot_orgs || 0) + '</td>' +
              '<td>' + esc(row.active_pilot_orgs || 0) + '</td>' +
              '<td>' + esc(row.successful_usage_orgs || 0) + '</td>' +
              '<td>' + esc(row.event_count || 0) + '</td>' +
            '</tr>';
          }).join('') +
        '</tbody></table></div>' : '') +
      '</div>';
      html += '</div>';
      target.innerHTML = html;
    } catch (e) {
      target.innerHTML =
        exportToolbar('Revenue-Metriken nicht geladen. Export kann separat versucht werden.') +
        '<p class="ds-text-sm" style="color:var(--bad)">' + esc(e.message || 'Revenue nicht verfügbar') + '</p>';
    }
  }

  async function loadStrategicRequests() {
    var status = el('scStatus') ? el('scStatus').value : '';
    var qs = status ? ('?status=' + encodeURIComponent(status)) : '';
    var target = el('strategicTable');
    target.innerHTML = '<p class="ds-text-sm ds-text-muted">Lade Kooperationsanfragen…</p>';
    try {
      var d = await TC.api.get('/admin/strategic-collaboration/requests' + qs);
      var items = (d.data && d.data.items) || [];
      if (!items.length) { target.innerHTML = emptyState('Keine Kooperationsanfragen gefunden.'); return; }
      var statusOptions = ['eingegangen', 'rueckfrage_offen', 'angebot_erstellt', 'bestaetigt', 'aktiviert', 'abgelehnt', 'abgeschlossen'];
      var html = '<table class="admin-table"><thead><tr><th>Zeitpunkt</th><th>Status</th><th>Owner</th><th>Unternehmen</th><th>Kontakt</th><th>E-Mail</th><th>Scope</th><th>Typ</th><th>Aktion</th></tr></thead><tbody>';
      items.forEach(function (r) {
        var scope = [r.region_scope || null, r.site_count ? (String(r.site_count) + ' Standorte') : null].filter(Boolean).join(' | ') || '—';
        var statusValue = r.status || 'eingegangen';
        var select = '<select class="ds-select ds-select--xs" id="sc-status-' + esc(r.id) + '">';
        statusOptions.forEach(function (value) { select += '<option value="' + value + '"' + (statusValue === value ? ' selected' : '') + '>' + esc(formatStrategicStatus(value)) + '</option>'; });
        select += '</select>';
        var ownerName = r.assigned_to_name || r.assigned_to_email || r.assigned_to_company || null;
        var ownerMeta = (!r.assigned_to_name && r.assigned_to_email) ? null : (r.assigned_to_email || null);
        var ownerLabel = ownerName ? (esc(ownerName) + (ownerMeta ? '<div class="ds-text-sm" style="color:var(--muted)">' + esc(ownerMeta) + '</div>' : '')) : '—';
        var assignAction = '';
        if (currentAdminUserId) {
          var isMine = String(r.assigned_to_user_id || '') === String(currentAdminUserId);
          assignAction = isMine
            ? '<button class="btn ds-btn--xs" onclick="updateStrategicAssignment(' + safeJson(r.id) + ', null)">Freigeben</button>'
            : '<button class="btn primary ds-btn--xs" onclick="updateStrategicAssignment(' + safeJson(r.id) + ', ' + safeJson(currentAdminUserId) + ')">Übernehmen</button>';
        }
        var modules = Array.isArray(r.requested_modules) ? r.requested_modules : [];
        var interest = [
          r.interest_enterprise_support ? 'Enterprise-Support' : null,
          r.interest_framework_conditions ? 'Rahmenkonditionen' : null,
          r.interest_strategic_cooperation ? 'Kooperation' : null
        ].filter(Boolean).join(' · ');
        var details = '<details><summary>Details</summary>' +
          '<div class="ds-text-sm" style="color:var(--muted);margin:6px 0">Status aktualisiert: ' + esc(formatDateTime(r.status_updated_at || r.updated_at || r.created_at)) + '</div>' +
          '<div class="ds-text-sm" style="margin-bottom:6px">Nachricht: ' + esc(r.message || '—') + '</div>' +
          '<div class="ds-text-sm" style="margin-bottom:6px">Interesse: ' + esc(interest || '—') + '</div>' +
          '<div class="ds-text-sm" style="margin-bottom:6px">Module: ' + esc(modules.length ? modules.join(', ') : '—') + '</div>' +
          '<label class="ds-text-sm" style="display:block;margin-bottom:4px">Ops-Notiz</label>' +
          '<textarea class="ds-input" rows="2" id="sc-note-' + esc(r.id) + '">' + esc(r.ops_notes || '') + '</textarea>' +
          '<div style="margin-top:6px"><button class="btn ds-btn--xs" onclick="updateStrategicNotes(' + safeJson(r.id) + ')">Notiz speichern</button></div>' +
        '</details>';
        var actionBlock = '<div style="white-space:nowrap">' + select + ' <button class="btn primary ds-btn--xs" onclick="updateStrategicStatus(' + safeJson(r.id) + ')">Speichern</button></div>' + details;
        html += '<tr>' +
          '<td style="white-space:nowrap">' + esc(formatDateTime(r.created_at)) + '</td>' +
          '<td><span class="tag blue">' + esc(formatStrategicStatus(statusValue)) + '</span></td>' +
          '<td>' + ownerLabel + '<div style="margin-top:6px">' + assignAction + '</div></td>' +
          '<td>' + esc(r.requester_company_name || '—') + '</td>' +
          '<td>' + esc(r.contact_name || '—') + '</td>' +
          '<td>' + esc(r.contact_email || '—') + '</td>' +
          '<td>' + esc(scope) + '</td>' +
          '<td>' + esc(r.source_context === 'enterprise_config' ? 'Konfiguration individueller Tarife' : 'Public Profil') + '</td>' +
          '<td>' + actionBlock + '</td>' +
        '</tr>';
      });
      html += '</tbody></table>';
      target.innerHTML = html;
    } catch (e) {
      target.innerHTML = '<p class="ds-text-sm" style="color:var(--bad)">' + esc(e.message || 'Kooperationsanfragen nicht verfügbar') + '</p>';
    }
  }

  async function updateStrategicStatus(id) {
    var sel = el('sc-status-' + id);
    if (!sel) return;
    try {
      await TC.api.patch('/admin/strategic-collaboration/requests/' + encodeURIComponent(id) + '/status', { status: sel.value });
      loadStrategicRequests();
    } catch (e) {
      alert('Status-Update fehlgeschlagen: ' + (e.message || e.code || e.status || 'Unbekannt'));
    }
  }

  async function updateStrategicAssignment(id, assignedToUserId) {
    try {
      await TC.api.patch('/admin/strategic-collaboration/requests/' + encodeURIComponent(id) + '/assign', {
        assigned_to_user_id: assignedToUserId
      });
      loadStrategicRequests();
    } catch (e) {
      alert('Zuweisung fehlgeschlagen: ' + (e.message || e.code || e.status || 'Unbekannt'));
    }
  }

  async function updateStrategicNotes(id) {
    var noteEl = el('sc-note-' + id);
    if (!noteEl) return;
    try {
      await TC.api.patch('/admin/strategic-collaboration/requests/' + encodeURIComponent(id) + '/notes', {
        ops_notes: noteEl.value || ''
      });
      loadStrategicRequests();
    } catch (e) {
      alert('Notiz-Update fehlgeschlagen: ' + (e.message || e.code || e.status || 'Unbekannt'));
    }
  }

  async function adminEditUser(id, field, value) {
    var body = {};
    body[field] = value;
    try {
      await TC.api.patch('/admin/users/' + encodeURIComponent(id), body);
      loadUsers(usersOffset);
    } catch (e) {
      alert('Fehler: ' + (e.message || e.code || e.status || 'Unbekannt'));
    }
  }

  async function adminDeactivate(id) {
    if (!confirm('Benutzer wirklich deaktivieren?')) return;
    try {
      await TC.api.post('/admin/users/' + encodeURIComponent(id) + '/deactivate');
      loadUsers(usersOffset);
    } catch (e) {
      alert('Deaktivierung fehlgeschlagen: ' + (e.message || e.code || e.status || 'Unbekannt'));
    }
  }

  async function loadActivityFeed(offset) {
    actOffset = offset || 0;
    var params = ['limit=' + actLimit, 'offset=' + actOffset];
    var actionType = el('actFeedType').value; if (actionType) params.push('action_type=' + encodeURIComponent(actionType));
    var from = el('actFeedFrom').value; if (from) params.push('from=' + encodeURIComponent(from));
    var to = el('actFeedTo').value; if (to) params.push('to=' + encodeURIComponent(to));
    var target = el('activityTimeline');
    target.innerHTML = '<p class="ds-text-sm ds-text-muted">Lade Aktivitäten…</p>';
    try {
      var d = await TC.api.get('/admin/activity-feed?' + params.join('&'));
      var items = (d.data && d.data.items) || [];
      var total = (d.data && d.data.total) || 0;
      if (!items.length) {
        target.innerHTML = emptyState('Keine Aktivitäten gefunden.');
        el('activityPaging').innerHTML = '';
        return;
      }
      var severityColors = {
        success: 'var(--good,#34d399)',
        warning: 'var(--warn,#fbbf24)',
        danger: 'var(--bad,#f87171)',
        muted: 'var(--muted,#888)',
        info: 'var(--brand,#4a9eff)'
      };
      target.innerHTML = items.map(function (event) {
        return '<div class="act-timeline-item">' +
          '<span class="act-timeline-icon">' + (event.icon || '&#128308;') + '</span>' +
          '<div class="act-timeline-body">' +
            '<div class="act-timeline-head">' +
              '<span class="act-timeline-label">' + esc(event.action_label || event.action || '') + '</span>' +
              '<span class="act-timeline-time">' + esc(formatDateTime(event.timestamp)) + '</span>' +
            '</div>' +
            '<div class="act-timeline-meta">' +
              (event.user ? '<span>' + esc(event.user) + '</span>' : '') +
              (event.resource ? '<span style="color:' + (severityColors[event.severity] || severityColors.info) + '">' + esc(event.resource) + '</span>' : '') +
              (event.action_type ? '<span class="act-timeline-type">' + esc(event.action_type) + '</span>' : '') +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('');
      var pages = Math.ceil(total / actLimit);
      var paging = '';
      if (pages > 1) {
        for (var i = 0; i < pages && i < 20; i++) {
          var cls = i * actLimit === actOffset ? ' primary' : '';
          paging += '<button class="btn' + cls + '" onclick="loadActivityFeed(' + (i * actLimit) + ')">' + (i + 1) + '</button>';
        }
      }
      el('activityPaging').innerHTML = paging;
    } catch (e) {
      target.innerHTML = '<p class="ds-text-sm" style="color:var(--bad)">' + esc(e.message || 'Aktivitäten nicht verfügbar') + '</p>';
    }
  }

  async function loadBackofficeRequests() {
    var status = el('boReqStatus') ? el('boReqStatus').value : '';
    var qs = status ? ('?status=' + encodeURIComponent(status)) : '';
    var target = el('boRequestsTable');
    target.innerHTML = '<p class="ds-text-sm ds-text-muted">Lade Requests…</p>';
    try {
      var d = await TC.api.get('/admin/requests' + qs);
      var items = (d.data && d.data.items) || [];
      if (!items.length) { target.innerHTML = emptyState('Keine Requests gefunden.'); return; }
      var statuses = ['SENT', 'ACCEPTED', 'DECLINED', 'FILLED', 'FINALIZED', 'CANCELED'];
      var html = '<table class="admin-table"><thead><tr><th>Zeitpunkt</th><th>Status</th><th>Requester</th><th>Receiver</th><th>Rolle/Region</th><th>Statusänderung</th></tr></thead><tbody>';
      items.forEach(function (r) {
        var roleRegion = [r.role || null, r.region || null].filter(Boolean).join(' / ') || '—';
        var requester = r.requester_company || r.requester_email || '—';
        var receiver = r.receiver_company || r.receiver_email || '—';
        var select = '<select class="ds-select ds-select--xs" id="bo-req-status-' + esc(r.id) + '">';
        statuses.forEach(function (state) { select += '<option value="' + state + '"' + (r.status === state ? ' selected' : '') + '>' + state + '</option>'; });
        select += '</select>';
        html += '<tr>' +
          '<td style="white-space:nowrap">' + esc(formatDateTime(r.created_at)) + '</td>' +
          '<td><span class="tag blue">' + esc(r.status || 'SENT') + '</span></td>' +
          '<td>' + esc(requester) + '</td>' +
          '<td>' + esc(receiver) + '</td>' +
          '<td>' + esc(roleRegion) + '</td>' +
          '<td style="white-space:nowrap">' + select + ' <button class="btn primary ds-btn--xs" onclick="updateBackofficeRequestStatus(' + safeJson(r.id) + ')">Speichern</button></td>' +
        '</tr>';
      });
      html += '</tbody></table>';
      target.innerHTML = html;
    } catch (e) {
      target.innerHTML = '<p class="ds-text-sm" style="color:var(--bad)">' + esc(e.message || 'Requests nicht verfügbar') + '</p>';
    }
  }

  async function updateBackofficeRequestStatus(id) {
    var sel = el('bo-req-status-' + id);
    if (!sel) return;
    if (!confirm('Request-Status wirklich auf "' + sel.value + '" setzen?')) return;
    try {
      await TC.api.patch('/admin/requests/' + encodeURIComponent(id) + '/status', { status: sel.value });
      loadBackofficeRequests();
    } catch (e) {
      alert('Statusänderung fehlgeschlagen: ' + (e.message || e.code || e.status || 'Unbekannt'));
    }
  }

  async function loadFeatureKeys() {
    if (_foKeysLoaded) return;
    try {
      var d = await TC.api.get('/admin/feature-keys');
      var keys = (d.data && d.data.keys) || [];
      var select = el('foFeatureKey');
      select.innerHTML = '<option value="">-- Feature wählen --</option>';
      keys.forEach(function (key) {
        select.innerHTML += '<option value="' + esc(key) + '">' + esc(key) + '</option>';
      });
      _foKeysLoaded = true;
    } catch (_e) {
      _foKeysLoaded = false;
    }
  }

  async function loadFeatureOverrides() {
    loadFeatureKeys();
    var target = el('foTable');
    target.innerHTML = '<p class="ds-text-sm ds-text-muted">Lade Overrides…</p>';
    try {
      var d = await TC.api.get('/admin/feature-overrides');
      var items = (d.data && d.data.items) || [];
      if (!items.length) { target.innerHTML = emptyState('Keine Feature-Overrides vorhanden.'); return; }
      var html = '<table class="admin-table"><thead><tr><th>ID</th><th>Feature</th><th>Org</th><th>Aktiviert</th><th>Grund</th><th>Ablauf</th><th>Erstellt</th><th></th></tr></thead><tbody>';
      items.forEach(function (item) {
        var org = item.org_name ? esc(item.org_name) + ' (#' + esc(item.org_id) + ')' : '<em>Global</em>';
        html += '<tr>' +
          '<td>' + esc(item.id) + '</td>' +
          '<td><code>' + esc(item.feature_key) + '</code></td>' +
          '<td>' + org + '</td>' +
          '<td>' + (item.enabled ? '<span class="tag green">Ja</span>' : '<span class="tag red">Nein</span>') + '</td>' +
          '<td>' + esc(item.reason || '—') + '</td>' +
          '<td>' + esc(item.expires_at ? formatDateTime(item.expires_at) : '—') + '</td>' +
          '<td>' + esc(item.created_at ? formatDateTime(item.created_at) : '—') + '</td>' +
          '<td><button class="btn bad ds-btn--xs" onclick="deleteFeatureOverride(' + safeJson(item.id) + ')">Löschen</button></td>' +
        '</tr>';
      });
      html += '</tbody></table>';
      target.innerHTML = html;
    } catch (e) {
      target.innerHTML = '<p class="ds-text-sm" style="color:var(--bad)">' + esc(e.message || 'Overrides nicht verfügbar') + '</p>';
    }
  }

  async function saveFeatureOverride() {
    var featureKey = el('foFeatureKey').value;
    if (!featureKey) { alert('Bitte Feature-Key auswählen'); return; }
    var body = {
      feature_key: featureKey,
      enabled: el('foEnabled').value === 'true',
      reason: el('foReason').value || null
    };
    var orgId = el('foOrgId').value;
    if (orgId) body.org_id = parseInt(orgId, 10);
    var expires = el('foExpires').value;
    if (expires) body.expires_at = new Date(expires).toISOString();
    try {
      await TC.api.put('/admin/feature-overrides', body);
      loadFeatureOverrides();
    } catch (e) {
      alert('Fehler: ' + (e.message || e.code || e.status || 'Unbekannt'));
    }
  }

  async function deleteFeatureOverride(id) {
    if (!confirm('Override wirklich löschen?')) return;
    try {
      await TC.api.delete('/admin/feature-overrides/' + encodeURIComponent(id));
      loadFeatureOverrides();
    } catch (e) {
      alert('Fehler: ' + (e.message || e.code || e.status || 'Unbekannt'));
    }
  }

  async function boot() {
    document.addEventListener('click', function (event) {
      var action = event.target.closest('[data-action-type="tab"]');
      if (!action) return;
      event.preventDefault();
      openTab(action.dataset.target, { updateUrl: true, force: true });
    });
    el('tabBar').addEventListener('click', function (event) {
      var button = event.target.closest('.tab-btn');
      if (!button) return;
      openTab(button.dataset.tab, { updateUrl: true });
    });
    try {
      var bootstrap = await TC.api.get('/admin/control-center');
      controlCenter = bootstrap.data || {};
      renderContextPanel();
      renderRoadmap();
      renderHubCards();
      renderStateBanner();
      configureWorkspace();
    } catch (e) {
      if (e.status === 401) {
        // Sitzung abgelaufen → Login-Redirect
        window.location.href = '/?error=access_denied';
        return;
      }
      if (e.status === 403 && e.code === 'ADMIN_REQUIRED') {
        // Eingeloggter Nutzer ohne Admin-Rolle → Per-Card-Zugriff-Ansicht zeigen statt Redirect.
        // Nutzer soll sehen, welche Bereiche existieren, und wie er ggf. Zugriff bekommt.
        var me = {};
        try {
          var meResult = await TC.api.get('/me');
          me = (meResult && meResult.data) || meResult || {};
        } catch (_) { /* /api/me Fehler: leerer Kontext */ }
        controlCenter = {
          context: {
            user: { id: me.id, org_name: me.org_name, plan: me.plan, org_role: me.org_role },
            access: { is_admin: false, access_level: 'restricted', allowed_tabs: [] },
            roadmap: []
          },
          summary: { total_users: 0, total_orgs: 0, requisition_backlog: 0, audit_events_30d: 0 },
          card_order: ['admin', 'users_orgs', 'audit_log', 'platform_metrics', 'sso_saml', 'workflows'],
          cards: {
            admin:            { title: 'Admin-Übersicht',             state: 'admin_only', description: 'Vollzugriff nur für Admins und Plattformverantwortliche.' },
            users_orgs:       { title: 'Benutzer & Organisationen',        state: 'admin_only', description: 'Verwaltung aller Nutzer, Rollen und Organisationen.' },
            audit_log:        { title: 'Audit-Log',                        state: 'admin_only', description: 'Plattformweite Aktivitäten und unveränderlicher Prüfpfad.' },
            platform_metrics: { title: 'Plattform-Metriken',               state: 'admin_only', description: 'Nutzungs- und Performance-Kennzahlen der Gesamtplattform.' },
            sso_saml:         { title: 'SSO / SAML',                       state: 'admin_only', description: 'Unternehmensweite Single-Sign-On-Konfiguration.' },
            workflows:        { title: 'Workflows & Automatisierung',       state: 'admin_only', description: 'Prozessautomatisierung und Benachrichtigungsflows.' }
          }
        };
        renderContextPanel();
        renderRoadmap();
        renderHubCards();
        renderStateBanner();
        configureWorkspace();
        return;
      }
      el('adminStateBanner').hidden = false;
      el('adminStateBanner').className = 'admin-state-banner admin-state-banner--warn';
      el('adminStateBanner').innerHTML =
        '<div class="admin-state-banner__head"><div><h2 class="admin-state-banner__title">Admin-Zentrale derzeit nicht verfügbar</h2><p class="admin-state-banner__desc">' +
        esc(describeError(e, 'Bootstrap konnte nicht geladen werden.')) +
        '</p></div></div>';
    }
  }

  window.loadUsers = loadUsers;
  window.loadOrgs = loadOrgs;
  window.loadAudit = loadAudit;
  window.loadAuditRecentChanges = loadAuditRecentChanges;
  window.loadMetrics = loadMetrics;
  window.loadStrategicRequests = loadStrategicRequests;
  window.updateStrategicStatus = updateStrategicStatus;
  window.updateStrategicAssignment = updateStrategicAssignment;
  window.updateStrategicNotes = updateStrategicNotes;
  window.loadActivityFeed = loadActivityFeed;
  window.loadBackofficeRequests = loadBackofficeRequests;
  window.updateBackofficeRequestStatus = updateBackofficeRequestStatus;
  window.loadFeatureOverrides = loadFeatureOverrides;
  window.saveFeatureOverride = saveFeatureOverride;
  window.deleteFeatureOverride = deleteFeatureOverride;
  window.exportAdminRevenueFinanceTruth = exportAdminRevenueFinanceTruth;
  window.adminEditUser = adminEditUser;
  window.adminDeactivate = adminDeactivate;

  boot();
})();
