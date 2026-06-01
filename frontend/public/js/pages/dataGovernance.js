(function() {
  'use strict';

  var csrfToken = '';
  var currentMe = null;
  var governanceAccess = {
    canRead: false,
    canWrite: false,
    canExport: false,
    canAnonymize: false,
    canRetention: false,
    canRequests: false,
    mode: 'hidden',
    reason: ''
  };
  var GOVERNANCE_FILTER_STORAGE_KEY = 'tc.dataGovernance.filters.v1';

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function resolveSurfaceAccess(me, key) {
    if (window.TC && window.TC.surfaceAccess && typeof window.TC.surfaceAccess.resolve === 'function') {
      return window.TC.surfaceAccess.resolve(me, key) || { canRead: false, canWrite: false, mode: 'hidden', reason: '' };
    }
    return { canRead: false, canWrite: false, mode: 'hidden', reason: '' };
  }

  function renderGovernanceState(tone, title, text) {
    var el = document.getElementById('dataGovernanceState');
    if (!el) return;
    if (!title && !text) {
      el.className = 'page-state';
      el.innerHTML = '';
      el.style.display = 'none';
      return;
    }
    el.className = 'page-state page-state--' + (tone || 'info');
    el.innerHTML = '<div class="page-state__title">' + esc(title || '') + '</div><div class="page-state__text">' + esc(text || '') + '</div>';
    el.style.display = '';
  }

  function sectionMessage(text) {
    return '<div class="empty-state">' + esc(text) + '</div>';
  }

  function describeGovernanceAccess(access) {
    if (!access || access.canRead) return '';
    return access.reason || 'DSGVO-Governance ist fuer diese Rolle derzeit nicht freigeschaltet.';
  }

  function allowedTabs() {
    var tabs = ['inventory'];
    if (governanceAccess.canRequests) tabs.push('requests');
    if (governanceAccess.canRetention) tabs.push('retention');
    if (governanceAccess.canExport || governanceAccess.canAnonymize) tabs.push('actions');
    return tabs;
  }

  function firstAllowedTab() {
    var tabs = allowedTabs();
    return tabs.length ? tabs[0] : 'inventory';
  }

  function isTabAllowed(name) {
    return allowedTabs().indexOf(name) !== -1;
  }

  function syncTabVisibility() {
    var tabConfig = [
      { name: 'inventory', tabId: 'dataGovernanceTabInventory', panelId: 'panel-inventory', allowed: governanceAccess.canRead },
      { name: 'requests', tabId: 'dataGovernanceTabRequests', panelId: 'panel-requests', allowed: governanceAccess.canRequests },
      { name: 'retention', tabId: 'dataGovernanceTabRetention', panelId: 'panel-retention', allowed: governanceAccess.canRetention },
      { name: 'actions', tabId: 'dataGovernanceTabActions', panelId: 'panel-actions', allowed: governanceAccess.canExport || governanceAccess.canAnonymize }
    ];
    tabConfig.forEach(function(item) {
      var tab = document.getElementById(item.tabId);
      var panel = document.getElementById(item.panelId);
      if (tab) tab.style.display = item.allowed ? '' : 'none';
      if (panel) panel.style.display = item.allowed ? '' : 'none';
    });
  }

  function syncActionVisibility() {
    var requestButton = document.getElementById('dataGovernanceRequestButton');
    if (requestButton) requestButton.style.display = governanceAccess.canRequests ? '' : 'none';

    var retentionButtons = [
      document.getElementById('dataGovernanceRetentionDryRunButton'),
      document.getElementById('dataGovernanceRetentionCleanupButton')
    ];
    retentionButtons.forEach(function(button) {
      if (button) button.disabled = !governanceAccess.canRetention;
    });

    var exportUserSection = document.getElementById('dataGovernanceExportUserSection');
    var exportOrgSection = document.getElementById('dataGovernanceExportOrgSection');
    var anonymizeSection = document.getElementById('dataGovernanceAnonymizeSection');
    if (exportUserSection) exportUserSection.style.display = governanceAccess.canExport ? '' : 'none';
    if (exportOrgSection) exportOrgSection.style.display = governanceAccess.canExport ? '' : 'none';
    if (anonymizeSection) anonymizeSection.style.display = governanceAccess.canAnonymize ? '' : 'none';

    var exportButtons = [
      document.getElementById('dataGovernanceExportUserButton'),
      document.getElementById('dataGovernanceExportOrgButton')
    ];
    exportButtons.forEach(function(button) {
      if (button) button.disabled = !governanceAccess.canExport;
    });

    var anonymizeButtons = [
      document.getElementById('dataGovernanceCheckAnonButton'),
      document.getElementById('dataGovernanceExecAnonButton')
    ];
    anonymizeButtons.forEach(function(button) {
      if (button) button.disabled = !governanceAccess.canAnonymize;
    });
  }

  function applyGovernanceAccess() {
    syncTabVisibility();
    syncActionVisibility();
    if (!governanceAccess.canRead) {
      renderGovernanceState('info', 'DSGVO-Governance ausgeblendet', describeGovernanceAccess(governanceAccess));
      document.getElementById('catGrid').innerHTML = sectionMessage(describeGovernanceAccess(governanceAccess));
      document.getElementById('catTable').innerHTML = '<tr><td colspan="4" class="empty-state">' + esc(describeGovernanceAccess(governanceAccess)) + '</td></tr>';
      document.getElementById('reqTable').innerHTML = '<tr><td colspan="6" class="empty-state">DSGVO-Anfragen bleiben fuer diese Rolle ausgeblendet.</td></tr>';
      document.getElementById('retTable').innerHTML = '<tr><td colspan="5" class="empty-state">Retention bleibt fuer diese Rolle ausgeblendet.</td></tr>';
      document.getElementById('cleanupResult').style.display = 'none';
      document.getElementById('anonResult').style.display = 'none';
      return false;
    }
    if (governanceAccess.mode === 'read_only') {
      renderGovernanceState('info', 'DSGVO-Governance eingeschraenkt', governanceAccess.reason || 'Einzelne Governance-Aktionen bleiben fuer diese Rolle kontrolliert.');
    } else {
      renderGovernanceState();
    }
    return true;
  }

  async function getCsrf() {
    if (csrfToken) return csrfToken;
    try {
      var response = await fetch('/api/csrf', { credentials: 'include' });
      if (!response.ok) return '';
      var payload = await response.json();
      csrfToken = payload.token || payload.csrfToken || '';
    } catch (_err) {
      return '';
    }
    return csrfToken;
  }

  async function api(path, opts) {
    var options = Object.assign({ credentials: 'include' }, opts || {});
    var method = String(options.method || 'GET').toUpperCase();
    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      var headers = Object.assign({}, options.headers || {});
      headers['Content-Type'] = 'application/json';
      if (method !== 'GET' && method !== 'HEAD') {
        headers['x-csrf-token'] = await getCsrf();
      }
      options.headers = headers;
      options.body = JSON.stringify(options.body);
    }
    try {
      var response = await fetch('/api' + path, options);
      if (response.status === 401) {
        location.href = '/';
        return null;
      }
      var contentType = response.headers.get('content-type') || '';
      var payload = null;
      if (contentType.indexOf('application/json') !== -1) {
        try { payload = await response.json(); } catch (_err) { payload = null; }
      } else {
        try { payload = await response.text(); } catch (_err2) { payload = null; }
      }
      if (!response.ok) {
        return { _error: true, status: response.status, payload: payload };
      }
      return payload;
    } catch (_err3) {
      return { _error: true, status: 0, payload: { error: 'Netzwerkfehler oder Server nicht erreichbar.' } };
    }
  }

  function parseApiError(result, fallback) {
    if (!result) return fallback;
    var payload = result._error ? (result.payload || {}) : result;
    if (typeof payload === 'string' && payload) return payload;
    if (payload && typeof payload.error === 'string' && payload.error) return payload.error;
    if (payload && typeof payload.message === 'string' && payload.message) return payload.message;
    if (payload && Array.isArray(payload.details) && payload.details.length) return payload.details.join(', ');
    if (payload && typeof payload.details === 'string' && payload.details) return payload.details;
    return fallback;
  }
  function readStoredGovernanceFilters() {
    try {
      var raw = sessionStorage.getItem(GOVERNANCE_FILTER_STORAGE_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) { return {}; }
  }
  function writeStoredGovernanceFilters(filters) {
    try { sessionStorage.setItem(GOVERNANCE_FILTER_STORAGE_KEY, JSON.stringify(filters || {})); }
    catch (e) { /* Session-Storage kann lokal blockiert sein. */ }
  }
  function readUrlGovernanceFilters() {
    var params = new URLSearchParams(window.location.search || '');
    var filters = {};
    if (params.has('tab')) filters.tab = params.get('tab') || '';
    if (params.has('request_status')) filters.requestStatus = params.get('request_status') || '';
    if (params.has('request_type')) filters.requestType = params.get('request_type') || '';
    return filters;
  }
  function currentGovernanceTab() {
    var active = document.querySelector('.tab.active');
    return active ? active.dataset.tab : '';
  }
  function persistGovernanceFilters(overrides) {
    var statusEl = document.getElementById('fReqStatus');
    var typeEl = document.getElementById('fReqType');
    var status = overrides && Object.prototype.hasOwnProperty.call(overrides, 'requestStatus')
      ? overrides.requestStatus
      : (statusEl ? statusEl.value : '');
    var type = overrides && Object.prototype.hasOwnProperty.call(overrides, 'requestType')
      ? overrides.requestType
      : (typeEl ? typeEl.value : '');
    var tab = overrides && Object.prototype.hasOwnProperty.call(overrides, 'tab')
      ? overrides.tab
      : currentGovernanceTab();
    writeStoredGovernanceFilters({ tab: tab || '', requestStatus: status || '', requestType: type || '' });
  }
  function applyGovernanceFilterDefaults() {
    var urlFilters = readUrlGovernanceFilters();
    var hasUrlFilters = Object.keys(urlFilters).length > 0;
    var stored = hasUrlFilters ? {} : readStoredGovernanceFilters();
    var status = urlFilters.requestStatus || stored.requestStatus || '';
    var type = urlFilters.requestType || stored.requestType || '';
    var statusEl = document.getElementById('fReqStatus');
    var typeEl = document.getElementById('fReqType');
    if (statusEl) statusEl.value = status || '';
    if (typeEl) typeEl.value = type || '';
    return { tab: urlFilters.tab || stored.tab || '' };
  }

  function downloadJson(payload, fileName) {
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(function() {
      URL.revokeObjectURL(link.href);
      link.remove();
    }, 1500);
  }

  function switchTab(name, persist) {
    var shouldPersist = persist !== false;
    var nextTab = isTabAllowed(name) ? name : firstAllowedTab();
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function(tab) {
      tab.classList.toggle('active', tab.dataset.tab === nextTab);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.tab-panel'), function(panel) {
      panel.classList.toggle('active', panel.id === 'panel-' + nextTab);
    });
    if (shouldPersist) persistGovernanceFilters({ tab: nextTab });
    if (nextTab === 'requests') loadRequests(false);
    if (nextTab === 'retention') loadRetention();
  }

  function renderInventory(inv) {
    if (!inv || !inv.categories) {
      document.getElementById('catGrid').innerHTML = sectionMessage('Dateninventar konnte derzeit nicht geladen werden.');
      document.getElementById('catTable').innerHTML = '<tr><td colspan="4" class="empty-state">Keine Inventardaten verfügbar.</td></tr>';
      return;
    }
    var cats = inv.categories;
    var keys = Object.keys(cats);
    document.getElementById('catGrid').innerHTML = keys.length ? keys.map(function(k) {
      var c = cats[k];
      var tagClass = 'cat-' + k.toLowerCase().replace('kategorie_', '');
      return '<div class="kpi-tile"><span class="kpi-val"><span class="cat-tag ' + tagClass + '">' + esc(k) + '</span></span><span class="kpi-label">' + esc(c.label) + '</span></div>';
    }).join('') : sectionMessage('Keine Inventardaten vorhanden.');

    document.getElementById('catTable').innerHTML = keys.length ? keys.map(function(k) {
      var c = cats[k];
      var tagClass = 'cat-' + k.toLowerCase().replace('kategorie_', '');
      return '<tr><td><span class="cat-tag ' + tagClass + '">' + esc(k) + '</span> ' + esc(c.label) + '</td>' +
        '<td>' + esc(c.description || '–') + '</td>' +
        '<td style="font-size:11px">' + (c.tables || []).map(function(t) { return esc(t); }).join(', ') + '</td>' +
        '<td>' + esc(c.retention || '–') + '</td></tr>';
    }).join('') : '<tr><td colspan="4" class="empty-state">Keine Inventardaten vorhanden.</td></tr>';
  }

  async function loadInventory() {
    if (!governanceAccess.canRead) return;
    var result = await api('/data-governance/inventory');
    if (!result || result._error || !result.data) {
      renderInventory(null);
      return;
    }
    renderInventory(result.data);
  }

  async function loadRequests(persist) {
    var shouldPersist = persist !== false;
    var tbody = document.getElementById('reqTable');
    if (!governanceAccess.canRequests) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">DSGVO-Anfragen bleiben fuer diese Rolle ausgeblendet.</td></tr>';
      return;
    }
    var qs = '?limit=100';
    var status = document.getElementById('fReqStatus').value;
    var type = document.getElementById('fReqType').value;
    if (shouldPersist) persistGovernanceFilters({ requestStatus: status || '', requestType: type || '' });
    if (status) qs += '&status=' + encodeURIComponent(status);
    if (type) qs += '&request_type=' + encodeURIComponent(type);
    var result = await api('/data-governance/requests' + qs);
    if (!result || result._error || !result.data || !result.data.items || !result.data.items.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Keine DSGVO-Anfragen gefunden.</td></tr>';
      return;
    }
    tbody.innerHTML = result.data.items.map(function(item) {
      var badge = '<span class="badge badge-' + item.status + '">' + esc(item.status) + '</span>';
      var created = item.created_at ? item.created_at.slice(0, 10) : '–';
      var actions = '';
      if ((item.status === 'pending' || item.status === 'in_progress') && governanceAccess.canRequests) {
        actions = '<button class="btn" style="padding:2px 8px;font-size:11px" onclick="completeReq(\'' + item.id + '\')">Abschließen</button>';
      }
      return '<tr><td>' + esc(item.request_type) + '</td><td>' + esc(item.subject_type) + (item.subject_id ? ' ' + esc(item.subject_id.slice(0, 8)) + '…' : '') + '</td>' +
        '<td>' + created + '</td><td>' + badge + '</td><td>' + esc(item.completed_by_name || '–') + '</td><td>' + actions + '</td></tr>';
    }).join('');
  }

  async function completeReq(id) {
    if (!governanceAccess.canRequests) return;
    if (!confirm('Anfrage als abgeschlossen markieren?')) return;
    var result = await api('/data-governance/requests/' + id + '/complete', { method: 'PATCH', body: { result_summary: { completed_manually: true } } });
    if (result && !result._error) {
      renderGovernanceState('good', 'Anfrage abgeschlossen', 'Die DSGVO-Anfrage wurde erfolgreich abgeschlossen.');
      loadRequests();
    } else {
      renderGovernanceState('bad', 'Abschluss fehlgeschlagen', parseApiError(result, 'Die DSGVO-Anfrage konnte nicht abgeschlossen werden.'));
    }
  }

  async function loadRetention() {
    var tbody = document.getElementById('retTable');
    if (!governanceAccess.canRetention) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Retention bleibt fuer diese Rolle ausgeblendet.</td></tr>';
      return;
    }
    var result = await api('/data-governance/retention/status');
    if (!result || result._error || !result.data) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Keine Retention-Daten verfügbar.</td></tr>';
      return;
    }
    var policies = result.data.policies || {};
    var status = result.data.status || {};
    var keys = Object.keys(policies);
    tbody.innerHTML = keys.length ? keys.map(function(key) {
      var policy = policies[key];
      var state = status[key] || {};
      var pct = state.total > 0 ? Math.round((state.expired || 0) / state.total * 100) : 0;
      var color = pct > 20 ? 'var(--bad)' : pct > 5 ? 'var(--warn)' : 'var(--good)';
      return '<tr><td><strong>' + esc(key) + '</strong></td><td>' + esc(policy.retention || '–') + '</td><td style="font-size:12px">' + esc(policy.legal_basis || '–') + '</td>' +
        '<td>' + (state.total || 0) + ' Einträge</td>' +
        '<td><div style="font-size:11px;font-weight:600">' + (state.expired || 0) + ' abgelaufen</div><div class="retention-bar"><div class="retention-fill" style="width:' + pct + '%;background:' + color + '"></div></div></td></tr>';
    }).join('') : '<tr><td colspan="5" class="empty-state">Keine Retention-Daten verfügbar.</td></tr>';
  }

  async function runRetentionCleanup(dryRun) {
    if (!governanceAccess.canRetention) return;
    if (!dryRun && !confirm('Retention-Bereinigung WIRKLICH durchführen? Gelöschte Daten können nicht wiederhergestellt werden!')) return;
    var result = await api('/data-governance/retention/cleanup', { method: 'POST', body: { dry_run: dryRun } });
    var output = document.getElementById('cleanupResult');
    output.style.display = 'block';
    if (result && !result._error) {
      output.textContent = JSON.stringify(result.data, null, 2);
      renderGovernanceState('good', dryRun ? 'Dry-Run abgeschlossen' : 'Bereinigung abgeschlossen', dryRun ? 'Die Retention-Simulation wurde erfolgreich erstellt.' : 'Die Retention-Bereinigung wurde erfolgreich durchgeführt.');
      if (!dryRun) loadRetention();
    } else {
      output.textContent = parseApiError(result, 'Fehler bei der Bereinigung.');
      renderGovernanceState('bad', 'Bereinigung fehlgeschlagen', parseApiError(result, 'Die Retention-Bereinigung konnte nicht ausgeführt werden.'));
    }
  }

  async function exportUser() {
    if (!governanceAccess.canExport) return;
    var userId = document.getElementById('exportUserId').value.trim();
    if (!userId) {
      renderGovernanceState('warn', 'User-ID fehlt', 'Bitte User-ID für den Export eingeben.');
      return;
    }
    var result = await api('/data-governance/export/user/' + encodeURIComponent(userId));
    if (result && !result._error) {
      downloadJson(result.data, 'dsgvo-export-user-' + userId.slice(0, 8) + '.json');
      renderGovernanceState('good', 'User-Export bereit', 'Der Benutzerexport wurde erfolgreich erstellt.');
    } else {
      renderGovernanceState('bad', 'User-Export fehlgeschlagen', parseApiError(result, 'Der Benutzerexport konnte nicht erstellt werden.'));
    }
  }

  async function exportOrg() {
    if (!governanceAccess.canExport) return;
    var result = await api('/data-governance/export/org');
    if (result && !result._error) {
      downloadJson(result.data, 'dsgvo-export-org.json');
      renderGovernanceState('good', 'Org-Export bereit', 'Der Organisationsexport wurde erfolgreich erstellt.');
    } else {
      renderGovernanceState('bad', 'Org-Export fehlgeschlagen', parseApiError(result, 'Der Organisationsexport konnte nicht erstellt werden.'));
    }
  }

  async function checkAnon() {
    if (!governanceAccess.canAnonymize) return;
    var userId = document.getElementById('anonUserId').value.trim();
    if (!userId) {
      renderGovernanceState('warn', 'User-ID fehlt', 'Bitte User-ID für die Prüfung eingeben.');
      return;
    }
    var result = await api('/data-governance/anonymize/user/' + encodeURIComponent(userId) + '/check');
    var output = document.getElementById('anonResult');
    output.style.display = 'block';
    if (!result || result._error) {
      output.textContent = parseApiError(result, 'Fehler bei der Prüfung.');
      renderGovernanceState('bad', 'Prüfung fehlgeschlagen', parseApiError(result, 'Die Anonymisierungsprüfung konnte nicht ausgeführt werden.'));
      return;
    }
    output.textContent = result.data.can_delete
      ? '✓ Anonymisierung möglich — keine Blocker gefunden.'
      : '✗ Anonymisierung blockiert:\n' + JSON.stringify(result.data.blockers, null, 2);
    renderGovernanceState('info', 'Prüfung abgeschlossen', result.data.can_delete ? 'Die Anonymisierung ist für diesen Nutzer aktuell zulässig.' : 'Die Anonymisierung ist aktuell blockiert. Details stehen im Prüfprotokoll.');
  }

  async function execAnon() {
    if (!governanceAccess.canAnonymize) return;
    var userId = document.getElementById('anonUserId').value.trim();
    if (!userId) {
      renderGovernanceState('warn', 'User-ID fehlt', 'Bitte User-ID für die Anonymisierung eingeben.');
      return;
    }
    if (!confirm('ACHTUNG: Die Anonymisierung von User ' + userId.slice(0, 8) + '… ist UNWIDERRUFLICH.\n\nFortfahren?')) return;
    var result = await api('/data-governance/anonymize/user/' + encodeURIComponent(userId), { method: 'POST' });
    var output = document.getElementById('anonResult');
    output.style.display = 'block';
    if (result && !result._error) {
      output.textContent = JSON.stringify(result.data, null, 2);
      renderGovernanceState('good', 'Anonymisierung abgeschlossen', 'Der Nutzer wurde erfolgreich anonymisiert.');
    } else {
      output.textContent = parseApiError(result, 'Fehler bei der Anonymisierung.');
      renderGovernanceState('bad', 'Anonymisierung fehlgeschlagen', parseApiError(result, 'Die Anonymisierung konnte nicht durchgeführt werden.'));
    }
  }

  function openRequestModal() {
    if (!governanceAccess.canRequests) return;
    document.getElementById('modalOverlay').style.display = 'flex';
  }

  function closeModal() {
    document.getElementById('modalOverlay').style.display = 'none';
    document.getElementById('reqForm').reset();
  }

  async function submitRequest(event) {
    event.preventDefault();
    if (!governanceAccess.canRequests) return false;
    var result = await api('/data-governance/requests', {
      method: 'POST',
      body: {
        request_type: document.getElementById('fmType').value,
        subject_type: document.getElementById('fmSubjectType').value,
        subject_id: document.getElementById('fmSubjectId').value.trim() || null,
        notes: document.getElementById('fmNotes').value.trim() || null
      }
    });
    if (result && !result._error) {
      closeModal();
      renderGovernanceState('good', 'Anfrage erstellt', 'Die DSGVO-Anfrage wurde erfolgreich angelegt.');
      switchTab('requests');
    } else {
      renderGovernanceState('bad', 'Anfrage fehlgeschlagen', parseApiError(result, 'Die DSGVO-Anfrage konnte nicht erstellt werden.'));
    }
    return false;
  }

  async function init() {
    currentMe = await api('/me');
    governanceAccess = resolveSurfaceAccess(currentMe, 'data_governance');
    if (!applyGovernanceAccess()) return;
    await loadInventory();
    var defaults = applyGovernanceFilterDefaults();
    var initialTab = defaults.tab && isTabAllowed(defaults.tab) ? defaults.tab : firstAllowedTab();
    switchTab(initialTab, false);
  }

  window.switchTab = switchTab;
  window.loadRequests = loadRequests;
  window.completeReq = completeReq;
  window.loadRetention = loadRetention;
  window.runRetentionCleanup = runRetentionCleanup;
  window.exportUser = exportUser;
  window.exportOrg = exportOrg;
  window.checkAnon = checkAnon;
  window.execAnon = execAnon;
  window.openRequestModal = openRequestModal;
  window.closeModal = closeModal;
  window.submitRequest = submitRequest;

  init();
})();
