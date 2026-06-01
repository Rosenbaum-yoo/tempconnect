/* Admin — Product release notes (What's New) */
(function () {
  'use strict';

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  async function loadReleases() {
    var box = document.getElementById('pr-table');
    if (!box) return;
    box.innerHTML = '<p class="empty">Lade\u2026</p>';
    try {
      var d = await TC.api.get('/admin/product-releases');
      var items = (d.data && d.data.items) || [];
      if (!items.length) {
        box.innerHTML = '<p class="empty">Keine Eintr\u00e4ge.</p>';
        return;
      }
      var h = '<table class="admin-table"><thead><tr><th>Titel</th><th>Status</th><th>Sichtbarkeit</th><th>Modal</th><th>E-Mail</th><th>Aktionen</th></tr></thead><tbody>';
      items.forEach(function (r) {
        h += '<tr><td>' + esc(r.title || '') + '<br/><span style="font-size:11px;color:#8d9bba">' + esc(r.id || '') + '</span></td>';
        h += '<td><span class="tag blue">' + esc(r.status || '') + '</span></td>';
        h += '<td>' + esc(r.visibility || '') + '</td>';
        h += '<td>' + (r.show_as_modal ? 'Ja' : 'Nein') + '</td>';
        h += '<td>' + (r.email_sent_at ? 'Gesendet' : (r.send_email_on_publish ? 'Bei Publish' : '—')) + '</td>';
        h += '<td style="white-space:nowrap">';
        if (r.status !== 'published') {
          h += '<button class="btn good ds-btn--xs" onclick="adminPublishRelease(\'' + r.id + '\')">Publish</button> ';
        }
        h += '<button class="btn ds-btn--xs" onclick="adminSendReleaseEmail(\'' + r.id + '\')">E-Mail</button> ';
        h += '<button class="btn bad ds-btn--xs" onclick="adminDeleteRelease(\'' + r.id + '\')">L\u00f6schen</button>';
        h += '</td></tr>';
      });
      h += '</tbody></table>';
      box.innerHTML = h;
    } catch (e) {
      box.innerHTML = '<p class="empty">Fehler beim Laden.</p>';
    }
  }

  async function saveRelease(e) {
    e.preventDefault();
    var body = {
      title: document.getElementById('pr-title').value.trim(),
      summary: document.getElementById('pr-summary').value.trim() || null,
      body: document.getElementById('pr-body').value.trim() || null,
      feature_key: document.getElementById('pr-feature').value.trim() || null,
      required_feature_key: document.getElementById('pr-req-feature').value.trim() || null,
      min_plan: (document.getElementById('pr-min-plan').value || null),
      visibility: document.getElementById('pr-visibility').value,
      status: document.getElementById('pr-status').value,
      show_in_app: document.getElementById('pr-inapp').checked,
      send_email_on_publish: document.getElementById('pr-email').checked,
      show_as_modal: document.getElementById('pr-modal').checked,
      priority: parseInt(document.getElementById('pr-priority').value, 10) || 0,
      audiences: []
    };
    document.querySelectorAll('input[name="pr-aud"]:checked').forEach(function (c) {
      body.audiences.push(c.value);
    });
    try {
      await TC.api.post('/admin/product-releases', body);
      document.getElementById('pr-form').reset();
      loadReleases();
      alert('Gespeichert.');
    } catch (err) {
      alert('Fehler: ' + (err.message || err.code));
    }
  }

  window.adminPublishRelease = async function (id) {
    try {
      var d = await TC.api.post('/admin/product-releases/' + id + '/publish', {});
      var em = d.data && d.data.email;
      if (em) alert('Publish OK. E-Mail: ' + (em.sent || 0) + ' gesendet.');
      else alert('Publish OK.');
      loadReleases();
    } catch (e) { alert('Fehler'); }
  };

  window.adminSendReleaseEmail = async function (id) {
    if (!confirm('E-Mail-Versand an passende Nutzer (gecappt)?')) return;
    try {
      var d = await TC.api.post('/admin/product-releases/' + id + '/send-email', { confirm: true });
      var r = d.data || {};
      alert('Gesendet: ' + (r.sent || 0) + ', \u00fcbersprungen: ' + (r.skipped || 0));
      loadReleases();
    } catch (e) { alert('Fehler'); }
  };

  window.adminDeleteRelease = async function (id) {
    if (!confirm('Eintrag wirklich l\u00f6schen?')) return;
    try {
      await TC.api.delete('/admin/product-releases/' + id);
      loadReleases();
    } catch (e) { alert('Fehler'); }
  };

  var form = document.getElementById('pr-form');
  if (form) form.addEventListener('submit', saveRelease);

  window.loadProductReleases = loadReleases;
})();
