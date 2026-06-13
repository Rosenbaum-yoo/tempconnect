"use strict";

const API = '/api';
const esc = (s) => { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; };
const params = new URLSearchParams(location.search);
let subId = params.get('id');
const linkId = params.get('link_id');

let sub = null;
let entries = {};
let advancedVisible = false;
let prefill = null;
let assignmentData = null; // For link_id flow
let pickedWeekStart = null; // For week picker
const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const EDITABLE = ['draft', 'needs_correction'];
const SURCHARGES = [
  { id: 'zs-nacht',  tag: '[Nachtschicht]',  label: 'Nachtschichtzuschlag' },
  { id: 'zs-sonn',   tag: '[Sonntag]',        label: 'Sonntagsarbeit' },
  { id: 'zs-fei',    tag: '[Feiertag]',       label: 'Feiertagsarbeit' },
  { id: 'zs-bereit', tag: '[Bereitschaft]',   label: 'Bereitschaftsdienst' },
  { id: 'zs-fahrt',  tag: '[Fahrtkosten]',    label: 'Fahrtkosten vereinbart' },
];

let _csrfToken = null;
async function getCsrf() {
  if (_csrfToken) return _csrfToken;
  const r = await fetch(`${API}/csrf`, { credentials:'include' });
  const d = await r.json(); _csrfToken = d.token; return _csrfToken;
}

/* ── Init ───────────────────────────────────────────────────────── */
(async function init() {
  if (!subId && !linkId) { location.href = 'einsatzportal-stundenzettel.html'; return; }
  try {
    if (linkId && !subId) {
      // Neuen Stundenzettel für ein Assignment erstellen
      await createFromLink();
    } else {
      await loadSubmission();
    }
    await tryLoadPrefill();
    renderView();
  } catch(e) {
    if (e.message === 'NOT_AUTH') { location.href = 'worker-login.html'; return; }
    if (e.message === 'DUPLICATE_WEEK') { showToast('F\u00fcr diese Woche existiert bereits ein Stundenzettel.', 'error'); return; }
    showToast('Fehler beim Laden', 'error');
  }
})();

async function createFromLink() {
  // 1) Assignment-Daten laden
  const ar = await fetch(`${API}/worker/assignments/${linkId}`, { credentials:'include' });
  if (ar.status === 401) throw new Error('NOT_AUTH');
  if (!ar.ok) throw new Error('ASSIGNMENT_LOAD_FAILED');
  assignmentData = await ar.json();

  // 2) Aktuelle Woche berechnen
  const { weekStart, weekEnd } = getCurrentWeek();
  pickedWeekStart = weekStart;

  // 3) Week-Picker anzeigen + Submission erstellen
  await createSubmissionForWeek(weekStart, weekEnd);
}

async function createSubmissionForWeek(weekStart, weekEnd) {
  const csrf = await getCsrf();
  const body = {
    worker_assignment_link_id: linkId,
    org_id: assignmentData.org_id,
    supplier_org_id: assignmentData.supplier_org_id,
    assignment_id: assignmentData.assignment_id,
    week_start: weekStart,
    week_end: weekEnd
  };
  const r = await fetch(`${API}/worker/submissions`, {
    method:'POST', credentials:'include',
    headers:{'Content-Type':'application/json','x-csrf-token':csrf},
    body: JSON.stringify(body)
  });
  const d = await r.json();
  if (!r.ok) {
    if (d.error === 'DUPLICATE_WEEK') {
      const existing = await findExistingSubmissionForWeek(assignmentData?.assignment_id, weekStart);
      if (existing?.id) {
        subId = String(existing.id);
        history.replaceState(null, '', `worker-timesheet.html?id=${subId}&link_id=${linkId}`);
        await loadSubmission();
        return;
      }
    }
    throw new Error(d.error || 'CREATE_FAILED');
  }
  subId = String(d.id);
  // Update URL without reload
  history.replaceState(null, '', `worker-timesheet.html?id=${subId}&link_id=${linkId}`);
  await loadSubmission();
}

async function findExistingSubmissionForWeek(assignmentId, weekStart) {
  if (!assignmentId || !weekStart) return null;
  const q = new URLSearchParams({
    assignment_id: assignmentId,
    week_from: weekStart,
    week_to: weekStart,
    limit: '20'
  });
  const r = await fetch(`${API}/worker/submissions?${q.toString()}`, { credentials: 'include' });
  if (!r.ok) return null;
  const d = await r.json();
  const items = Array.isArray(d?.items) ? d.items : [];
  if (!items.length) return null;
  const preferred = items.find((s) => ['draft', 'needs_correction'].includes(s.status)) || items[0];
  return preferred || null;
}

function getCurrentWeek() {
  const now = new Date(), day = now.getDay();
  const mon = new Date(now); mon.setDate(now.getDate() - (day===0?6:day-1));
  const sun = new Date(mon); sun.setDate(mon.getDate()+6);
  return { weekStart: mon.toISOString().slice(0,10), weekEnd: sun.toISOString().slice(0,10) };
}

function shiftWeek(dir) {
  if (!pickedWeekStart || !assignmentData) return;
  const d = new Date(pickedWeekStart);
  d.setDate(d.getDate() + (dir * 7));
  const sun = new Date(d); sun.setDate(d.getDate()+6);
  pickedWeekStart = d.toISOString().slice(0,10);
  // Recreate submission for new week
  document.getElementById('loadingState').style.display = '';
  document.getElementById('content').style.display = 'none';
  createSubmissionForWeek(pickedWeekStart, sun.toISOString().slice(0,10))
    .then(() => tryLoadPrefill())
    .then(() => renderView())
    .catch(e => {
      if (e.message === 'DUPLICATE_WEEK') {
        showToast('F\u00fcr diese Woche existiert bereits ein Stundenzettel.', 'error');
        // Revert
        const rev = new Date(pickedWeekStart); rev.setDate(rev.getDate() - (dir*7));
        pickedWeekStart = rev.toISOString().slice(0,10);
      } else { showToast('Fehler: ' + e.message, 'error'); }
      document.getElementById('loadingState').style.display = 'none';
      document.getElementById('content').style.display = 'block';
    });
}

async function loadSubmission() {
  const res = await fetch(`${API}/worker/submissions/${subId}`, { credentials: 'include' });
  if (res.status === 401) throw new Error('NOT_AUTH');
  if (res.status === 403) { location.href = 'einsatzportal-stundenzettel.html'; return; }
  if (!res.ok) throw new Error('LOAD_FAILED');
  sub = await res.json();
  entries = {};
  (sub.entries || []).forEach(e => { entries[e.work_date] = e; });
}

async function tryLoadPrefill() {
  if (!sub) return;
  try {
    const res = await fetch(`${API}/worker/submissions/${subId}/prefill`, { credentials: 'include' });
    if (res.ok) { const d = await res.json(); prefill = d.prefill || null; }
  } catch { /* non-critical */ }
}

/* ── Render ────────────────────────────────────────────────── */
function renderView() {
  document.getElementById('loadingState').style.display = 'none';
  document.getElementById('content').style.display = 'block';

  document.getElementById('headerWeek').textContent = fmtWeek(sub.week_start, sub.week_end);
  document.getElementById('statusBadge').innerHTML = badge(sub.status);

  // Banners
  if (sub.status === 'needs_correction') {
    document.getElementById('correctionNoteText').textContent = sub.correction_note || 'Bitte überprüfen Sie Ihre Angaben.';
    document.getElementById('correctionBanner').style.display = 'block';
  }
  if (!EDITABLE.includes(sub.status)) {
    document.getElementById('readonlyStatus').textContent = statusLabel(sub.status);
    document.getElementById('readonlyBanner').style.display = 'flex';
  }
  if (sub.reviewer_comment) {
    document.getElementById('reviewerCommentText').textContent = sub.reviewer_comment;
    document.getElementById('reviewerCommentBox').style.display = 'flex';
  }

  // KW-Picker (nur bei link_id flow)
  if (linkId && pickedWeekStart) {
    const wp = document.getElementById('weekPicker');
    wp.style.display = 'block';
    document.getElementById('weekPickerLabel').textContent = fmtWeek(sub.week_start, sub.week_end);
  }

  // Einsatz-Info aus Prefill
  if (prefill) {
    const aiBox = document.getElementById('assignmentInfo');
    if (prefill.worker_description) document.getElementById('aiDescription').textContent = prefill.worker_description;
    const dates = [];
    if (prefill.start_date) dates.push('Von: ' + fmtDateStr(prefill.start_date));
    if (prefill.planned_end_date) dates.push('Bis: ' + fmtDateStr(prefill.planned_end_date));
    if (dates.length) document.getElementById('aiDates').textContent = dates.join(' · ');
    const shift = [];
    if (prefill.default_shift_start) shift.push('Schicht: ' + prefill.default_shift_start);
    if (prefill.default_shift_end)   shift.push('– ' + prefill.default_shift_end);
    if (prefill.default_break_minutes) shift.push('· Pause: ' + prefill.default_break_minutes + ' Min.');
    if (shift.length) document.getElementById('aiShift').textContent = shift.join(' ');
    aiBox.style.display = 'block';
  }

  // Totals
  updateTotals();
  renderCompletionState();

  // Wochenraster
  buildWeekGrid();

  // Kommentar (Surcharge-Tags aus Kommentar herausfiltern für Textarea)
  const editable = EDITABLE.includes(sub.status);
  if (sub.worker_comment) {
    let clean = sub.worker_comment;
    SURCHARGES.forEach(s => { clean = clean.replace(s.tag, '').trim(); });
    document.getElementById('workerComment').value = clean;
    loadSurcharges();
  }
  if (!editable) {
    document.getElementById('workerComment').disabled = true;
    SURCHARGES.forEach(s => { const el = document.getElementById(s.id); if (el) el.disabled = true; });
  }

  // CTA Bar
  if (editable) {
    document.getElementById('ctaBar').style.display = 'flex';
  }
}

function buildWeekGrid() {
  const grid = document.getElementById('weekGrid');
  grid.innerHTML = '';
  const start = new Date(sub.week_start);
  const editable = EDITABLE.includes(sub.status);
  const hasSavedEntries = Object.keys(entries).length > 0;

  for (let i = 0; i < 7; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const entry = entries[dateStr] || {};
    const hasEntry = !!entries[dateStr];

    // Prefill-Defaults für Mo–Fr wenn keine gespeicherten Einträge vorhanden
    const isWorkday = i < 5;
    const usePrefill = prefill && editable && !hasSavedEntries && isWorkday;
    const defHours = usePrefill ? (prefill.default_hours_per_day || '') : '';
    const defBreak = usePrefill ? (prefill.default_break_minutes || '') : '';
    const defStart = usePrefill ? (prefill.default_shift_start   || '') : '';
    const defEnd   = usePrefill ? (prefill.default_shift_end     || '') : '';

    const row = document.createElement('div');
    row.className = 'wk-day-row' + (hasEntry ? ' has-data' : '');
    row.id = `row-${dateStr}`;

    row.innerHTML = `
      <div class="wk-day-label">
        ${DAYS[i]}
        <div class="date">${d.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})}</div>
      </div>
      <div>
        <div class="wk-day-inputs">
          <input type="number" min="0" max="24" step="0.5"
            class="wk-input" id="reg-${dateStr}"
            value="${entry.hours_regular || defHours}"
            placeholder="Std."
            ${!editable ? 'disabled' : ''}
            onchange="onEntryChange('${dateStr}')">
          <input type="number" min="0" max="12" step="0.5"
            class="wk-input" id="ot-${dateStr}"
            value="${entry.hours_overtime || ''}"
            placeholder="ÜS"
            ${!editable ? 'disabled' : ''}
            onchange="onEntryChange('${dateStr}')">
          <input type="number" min="0" max="120" step="5"
            class="wk-input" id="brk-${dateStr}"
            value="${entry.break_minutes || defBreak}"
            placeholder="Paus."
            ${!editable ? 'disabled' : ''}
            style="width:65px" onchange="onEntryChange('${dateStr}')">
        </div>
        <div class="advanced-row" style="display:${advancedVisible?'flex':'none'};gap:6px;margin-top:6px">
          <input type="time" class="wk-input time" id="st-${dateStr}"
            value="${entry.shift_start || defStart}"
            placeholder="Von" ${!editable ? 'disabled' : ''}
            onchange="onEntryChange('${dateStr}')">
          <input type="time" class="wk-input time" id="et-${dateStr}"
            value="${entry.shift_end || defEnd}"
            placeholder="Bis" ${!editable ? 'disabled' : ''}
            onchange="onEntryChange('${dateStr}')">
        </div>
      </div>`;
    grid.appendChild(row);
  }
  updateTotals();
}

function toggleAdvanced() {
  advancedVisible = !advancedVisible;
  document.querySelectorAll('.advanced-row').forEach(el => {
    el.style.display = advancedVisible ? 'flex' : 'none';
  });
  document.getElementById('toggleDetails').textContent = advancedVisible ? '− Details' : '+ Details';
}

/* ── Entry Change ──────────────────────────────────────────── */
function onEntryChange(dateStr) {
  const row = document.getElementById(`row-${dateStr}`);
  const regRaw = document.getElementById(`reg-${dateStr}`).value.trim();
  const otRaw  = document.getElementById(`ot-${dateStr}`).value.trim();
  const brkRaw = document.getElementById(`brk-${dateStr}`).value.trim();
  const stRaw  = (document.getElementById(`st-${dateStr}`)?.value || '').trim();
  const etRaw  = (document.getElementById(`et-${dateStr}`)?.value || '').trim();
  const hasAny = regRaw !== '' || otRaw !== '' || brkRaw !== '' || stRaw !== '' || etRaw !== '';
  row.classList.toggle('has-data', hasAny);
  updateTotals();
  renderCompletionState();
}

function updateTotals() {
  let totalReg = 0, totalOt = 0;
  const start = new Date(sub.week_start);
  for (let i = 0; i < 7; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const regEl = document.getElementById(`reg-${dateStr}`);
    const otEl  = document.getElementById(`ot-${dateStr}`);
    if (regEl) totalReg += parseFloat(regEl.value) || 0;
    if (otEl)  totalOt  += parseFloat(otEl.value)  || 0;
  }
  document.getElementById('totalHours').textContent = (totalReg + totalOt).toFixed(1).replace('.', ',') + ' h';
  document.getElementById('totalOvertime').textContent = totalOt.toFixed(1).replace('.', ',') + ' h';
}

function getWeekDates() {
  const dates = [];
  const start = new Date(sub.week_start);
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function computeCompletionFromForm() {
  const dates = getWeekDates();
  const missingDates = [];
  for (const dateStr of dates) {
    const regEl = document.getElementById(`reg-${dateStr}`);
    const otEl = document.getElementById(`ot-${dateStr}`);
    const brkEl = document.getElementById(`brk-${dateStr}`);
    const stEl = document.getElementById(`st-${dateStr}`);
    const etEl = document.getElementById(`et-${dateStr}`);
    if (!regEl || !otEl || !brkEl || !stEl || !etEl) {
      missingDates.push(dateStr);
      continue;
    }
    const regRaw = regEl.value.trim();
    const otRaw = otEl.value.trim();
    const brkRaw = brkEl.value.trim();
    const stRaw = stEl.value.trim();
    const etRaw = etEl.value.trim();
    const hasAny = regRaw !== '' || otRaw !== '' || brkRaw !== '' || stRaw !== '' || etRaw !== '';
    if (!hasAny) missingDates.push(dateStr);
  }
  return { expected_days: dates.length, filled_days: dates.length - missingDates.length, missing_dates: missingDates, is_complete: missingDates.length === 0 };
}

function renderCompletionState() {
  const c = computeCompletionFromForm();
  const btn = document.getElementById('btnSubmit');
  const hint = document.getElementById('completionHint');
  const missingLabels = c.missing_dates.map((d) => new Date(d).toLocaleDateString('de-DE', { weekday: 'short' }));
  if (hint) {
    if (c.is_complete) {
      hint.style.display = 'flex';
      hint.innerHTML = '<span>✅</span><span>Woche vollständig erfasst. Sie können jetzt final einreichen.</span>';
    } else {
      hint.style.display = 'flex';
      hint.innerHTML = `<span>ℹ️</span><span>Noch offen: ${missingLabels.join(', ')}. Bitte Tage ausfüllen oder mit 0h bestätigen.</span>`;
    }
  }
  if (!btn) return;
  if (c.is_complete) {
    btn.disabled = false;
    btn.title = '';
  } else {
    btn.disabled = true;
    btn.title = 'Bitte alle 7 Tage erfassen oder als 0h bestätigen.';
  }
}

/* ── Save Draft ────────────────────────────────────────────── */
async function saveDraft() {
  const btn = document.getElementById('btnSave');
  btn.disabled = true; btn.textContent = '⏳…';

  try {
    await uploadEntries();
    const fullComment = buildComment();
    if (fullComment !== (sub.worker_comment || '')) {
      const csrf = await getCsrf();
      await fetch(`${API}/worker/submissions/${subId}/comment`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ note: fullComment })
      });
      sub.worker_comment = fullComment;
    }
    showToast('Entwurf gespeichert \u2713', 'success');
  } catch {
    showToast('Fehler beim Speichern', 'error');
  } finally {
    btn.disabled = false; btn.textContent = '💾 Speichern';
  }
}

async function uploadEntries() {
  const dates = getWeekDates();
  for (const dateStr of dates) {
    const reg = parseFloat(document.getElementById(`reg-${dateStr}`)?.value) || 0;
    const ot  = parseFloat(document.getElementById(`ot-${dateStr}`)?.value)  || 0;
    const brk = parseInt(document.getElementById(`brk-${dateStr}`)?.value)   || 0;
    const st  = document.getElementById(`st-${dateStr}`)?.value || null;
    const et  = document.getElementById(`et-${dateStr}`)?.value || null;
    const csrf = await getCsrf();
    const res = await fetch(`${API}/worker/submissions/${subId}/entries`, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
      body: JSON.stringify({
        work_date: dateStr,
        hours_regular: reg, hours_overtime: ot,
        break_minutes: brk,
        shift_start: st || null, shift_end: et || null
      })
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || 'ENTRY_SAVE_FAILED');
    }
  }
}

/* ── Submit ────────────────────────────────────────────────── */
function submitSubmission() {
  const total = getTotalHours();
  document.getElementById('confirmText').textContent =
    `Möchten Sie ${total.toFixed(1).replace('.',',')} Stunden für ${fmtWeek(sub.week_start, sub.week_end)} einreichen?`;
  document.getElementById('confirmOverlay').style.display = 'flex';
}

function closeConfirm() {
  document.getElementById('confirmOverlay').style.display = 'none';
}

async function doSubmit() {
  const btn = document.getElementById('confirmBtn');
  btn.disabled = true; btn.textContent = '⏳…';
  try {
    const completion = computeCompletionFromForm();
    if (!completion.is_complete) {
      const missing = completion.missing_dates.map((d) => new Date(d).toLocaleDateString('de-DE', { weekday: 'short' })).join(', ');
      showToast(`Bitte fehlende Tage ergänzen/bestätigen: ${missing}`, 'error');
      btn.disabled = false; btn.textContent = 'Einreichen';
      return;
    }
    await uploadEntries();
    // Kommentar inkl. Zuschläge speichern
    const csrf = await getCsrf();
    const fullComment = buildComment();
    if (fullComment !== (sub.worker_comment || '')) {
      await fetch(`${API}/worker/submissions/${subId}/comment`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ note: fullComment })
      });
    }
    const action = sub.status === 'needs_correction' ? 'correct' : 'submit';
    const res = await fetch(`${API}/worker/submissions/${subId}/${action}`, {
      method: 'POST', credentials: 'include',
      headers: { 'x-csrf-token': csrf }
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'FEHLER');
    closeConfirm();
    showToast('Stunden erfolgreich eingereicht! ✓', 'success');
    setTimeout(() => location.href = 'einsatzportal-stundenzettel.html', 1800);
  } catch(e) {
    if (e.message === 'INCOMPLETE_WEEK') {
      showToast('Die Woche ist noch nicht vollständig erfasst.', 'error');
    } else {
      showToast('Fehler beim Einreichen.', 'error');
    }
    btn.disabled = false; btn.textContent = 'Einreichen';
  }
}

/* ── Surcharge Helpers ────────────────────────────────────── */
function loadSurcharges() {
  const comment = sub.worker_comment || '';
  SURCHARGES.forEach(s => {
    const el = document.getElementById(s.id);
    if (el) el.checked = comment.includes(s.tag);
  });
}

function buildComment() {
  const tags = SURCHARGES
    .filter(s => { const el = document.getElementById(s.id); return el && el.checked; })
    .map(s => s.tag);
  const textComment = document.getElementById('workerComment').value.trim();
  return [...tags, textComment].filter(Boolean).join(' ').trim();
}

function toggleZuschlaege() {
  const el = document.getElementById('zuschlaege');
  const btn = document.getElementById('btnZuschlaege');
  const vis = el.style.display !== 'none';
  el.style.display = vis ? 'none' : 'block';
  btn.textContent = vis ? '+ Anzeigen' : '− Ausblenden';
}

/* ── Helpers ───────────────────────────────────────────────── */
function getTotalHours() {
  const start = new Date(sub.week_start);
  let t = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const ds = d.toISOString().slice(0, 10);
    t += parseFloat(document.getElementById(`reg-${ds}`)?.value || 0);
    t += parseFloat(document.getElementById(`ot-${ds}`)?.value  || 0);
  }
  return t;
}
function fmtWeek(start, end) {
  if (!start) return '';
  const s = new Date(start), e = new Date(end);
  const fmt = d => d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' });
  return `KW ${getKW(s)} · ${fmt(s)}–${fmt(e)}`;
}
function getKW(d) {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
  const y = tmp.getUTCFullYear();
  return Math.floor((tmp - new Date(Date.UTC(y,0,1))) / 604800000) + 1;
}
function badge(status) {
  const map = {
    draft:                   '<span class="wk-badge wk-badge-draft">Entwurf</span>',
    submitted:               '<span class="wk-badge wk-badge-submitted">Eingereicht</span>',
    under_review:            '<span class="wk-badge wk-badge-under-review">In Prüfung</span>',
    needs_correction:        '<span class="wk-badge wk-badge-needs-correction">Korrigieren</span>',
    approved_internal:       '<span class="wk-badge wk-badge-under-review">Intern freigegeben</span>',
    sent_to_customer:        '<span class="wk-badge wk-badge-under-review">\uD83D\uDCE8 Beim Kunden zur Pr\u00fcfung</span>',
    customer_confirmed:      '<span class="wk-badge wk-badge-accepted">✓ Vom Kunden bestätigt</span>',
    customer_rejected:       '<span class="wk-badge wk-badge-rejected">⚠ Vom Kunden abgelehnt</span>',
    posted_to_timesheet:     '<span class="wk-badge wk-badge-accepted">✓ In Abrechnung</span>',
    accepted_into_timesheet: '<span class="wk-badge wk-badge-accepted">Angenommen</span>',
    rejected:                '<span class="wk-badge wk-badge-rejected">Abgelehnt</span>',
  };
  return map[status] || `<span class="wk-badge wk-badge-draft">${esc(status)}</span>`;
}
function statusLabel(status) {
  const map = {
    submitted:               'Eingereicht',
    under_review:            'In Prüfung',
    approved_internal:       'Intern freigegeben',
    sent_to_customer:        'Beim Kunden zur Pr\u00fcfung',
    customer_confirmed:      'Vom Kunden bestätigt',
    customer_rejected:       'Vom Kunden abgelehnt',
    posted_to_timesheet:     'In Abrechnung',
    accepted_into_timesheet: 'Angenommen',
    rejected:                'Abgelehnt',
    superseded:              'Ersetzt',
  };
  return map[status] || status;
}
function fmtDateStr(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function showToast(msg, type='') {
  const t = document.getElementById('wk-toast');
  t.textContent = msg; t.className = type ? `show ${type}` : 'show';
  setTimeout(() => t.className = '', 3000);
}

/* ── Expose functions called from HTML onclick handlers ──── */
window.shiftWeek = shiftWeek;
window.toggleAdvanced = toggleAdvanced;
window.onEntryChange = onEntryChange;
window.saveDraft = saveDraft;
window.submitSubmission = submitSubmission;
window.closeConfirm = closeConfirm;
window.doSubmit = doSubmit;
window.toggleZuschlaege = toggleZuschlaege;
