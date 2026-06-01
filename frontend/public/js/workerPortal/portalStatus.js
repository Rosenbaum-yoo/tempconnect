"use strict";

/**
 * portalStatus.js — Status-Label-Maps für das Einsatzportal
 * Laden: <script src="/public/js/workerPortal/portalStatus.js">
 * Exponiert: window.PortalStatus
 *
 * Enthält Status-Mappings + Hilfsfunktionen für:
 *  - Worker-Submissions (komplette 9-Stufen-Statusmaschine)
 *  - Assignments (Worker-Perspektive)
 *  - Dokumente/Nachweise
 *  - Notifications
 */
(function () {

  /* ── Submission-Status ─────────────────────────────────────────── */
  var SUBMISSION_LABELS = {
    draft:                   'Entwurf',
    submitted:               'Eingereicht',
    under_review:            'In Prüfung',
    needs_correction:        'Korrektur erforderlich',
    approved_internal:       'Intern genehmigt',
    rejected:                'Abgelehnt',
    sent_to_customer:        'Beim Kunden',
    customer_confirmed:      'Vom Kunden bestätigt',
    customer_rejected:       'Vom Kunden abgelehnt',
    posted_to_timesheet:     'Abgerechnet',
    // Legacy-Kompatibilität
    accepted_into_timesheet: 'Angenommen'
  };

  var SUBMISSION_BADGE_CLASS = {
    draft:                   'ep-badge-draft',
    submitted:               'ep-badge-submitted',
    under_review:            'ep-badge-under-review',
    needs_correction:        'ep-badge-needs-correction',
    approved_internal:       'ep-badge-accepted',
    rejected:                'ep-badge-rejected',
    sent_to_customer:        'ep-badge-submitted',
    customer_confirmed:      'ep-badge-accepted',
    customer_rejected:       'ep-badge-rejected',
    posted_to_timesheet:     'ep-badge-accepted',
    accepted_into_timesheet: 'ep-badge-accepted'
  };

  var SUBMISSION_ALERT_CLASS = {
    draft:                   'warning',
    submitted:               'info',
    under_review:            'warning',
    needs_correction:        'danger',
    approved_internal:       'success',
    rejected:                'danger',
    sent_to_customer:        'info',
    customer_confirmed:      'success',
    customer_rejected:       'danger',
    posted_to_timesheet:     'success',
    accepted_into_timesheet: 'success'
  };

  /* ── Assignment-Status ─────────────────────────────────────────── */
  var ASSIGNMENT_LABELS = {
    pending_confirmation: 'Bestätigung ausstehend',
    confirmed:            'Bestätigt',
    declined:             'Abgelehnt',
    unavailable:          'Abwesend gemeldet',
    active:               'Aktiv',
    completed:            'Abgeschlossen',
    cancelled:            'Storniert'
  };

  /* ── Dokument-Status ───────────────────────────────────────────── */
  var DOCUMENT_LABELS = {
    pending_review: 'In Prüfung',
    verified:       'Verifiziert',
    rejected:       'Abgelehnt',
    expired:        'Abgelaufen',
    archived:       'Archiviert'
  };

  var DOCUMENT_CATEGORY_LABELS = {
    qualification: 'Qualifikation',
    identity:      'Identität',
    permit:        'Erlaubnis',
    medical:       'Medizinisch',
    training:      'Schulung',
    other:         'Sonstiges'
  };

  /* ── Notification-Typen ────────────────────────────────────────── */
  var NOTIFICATION_LABELS = {
    assignment_confirmed:        'Einsatz bestätigt',
    assignment_declined:         'Einsatz abgelehnt',
    assignment_new:              'Neuer Einsatz',
    assignment_cancelled:        'Einsatz storniert',
    submission_approved:         'Stundenzettel genehmigt',
    submission_needs_correction: 'Korrektur erforderlich',
    submission_rejected:         'Stundenzettel abgelehnt',
    staffing_invite:             'Einsatz-Einladung',
    staffing_choice_set:         'Einsatz-Auswahl',
    document_verified:           'Nachweis verifiziert',
    document_rejected:           'Nachweis abgelehnt',
    document_expiring:           'Nachweis läuft ab',
    general:                     'Mitteilung'
  };

  /* ── Hilfsfunktionen ───────────────────────────────────────────── */

  function submissionLabel(status) {
    return SUBMISSION_LABELS[status] || status || 'Unbekannt';
  }

  /** Gibt fertiges <span class="ep-badge ...">...</span> zurück */
  function submissionBadgeHtml(status) {
    var cls  = SUBMISSION_BADGE_CLASS[status] || 'ep-badge-draft';
    var lbl  = SUBMISSION_LABELS[status] || status || '';
    var icon = '';
    if (status === 'needs_correction' || status === 'customer_rejected' || status === 'rejected') icon = '⚠ ';
    else if (status === 'customer_confirmed' || status === 'accepted_into_timesheet' || status === 'posted_to_timesheet') icon = '✓ ';
    return '<span class="ep-badge ' + cls + '">' + icon + lbl + '</span>';
  }

  function submissionAlertClass(status) {
    return SUBMISSION_ALERT_CLASS[status] || 'info';
  }

  function assignmentLabel(status) {
    return ASSIGNMENT_LABELS[status] || status || 'Unbekannt';
  }

  function documentLabel(status) {
    return DOCUMENT_LABELS[status] || status || 'Unbekannt';
  }

  /** 'bad' | 'warn' | 'ok' | 'info' */
  function documentBadgeState(doc) {
    var status = (doc && (doc.effective_status || doc.status)) || '';
    if (status === 'expired' || status === 'rejected') return 'bad';
    if (status === 'pending_review' || (doc && doc.is_expiring_soon)) return 'warn';
    if (status === 'verified') return 'ok';
    return 'info';
  }

  function documentBadgeLabel(doc) {
    var status = (doc && (doc.effective_status || doc.status)) || '';
    if (status === 'expired')        return 'Abgelaufen';
    if (status === 'rejected')       return 'Abgelehnt';
    if (doc && doc.is_expiring_soon) return 'Fristkritisch';
    if (status === 'pending_review') return 'In Prüfung';
    if (status === 'verified')       return 'Verifiziert';
    if (status === 'archived')       return 'Archiviert';
    return 'Offen';
  }

  function documentCategoryLabel(category) {
    return DOCUMENT_CATEGORY_LABELS[category] || category || 'Dokument';
  }

  function notificationLabel(type) {
    return NOTIFICATION_LABELS[type] || type || 'Mitteilung';
  }

  /* ── Export ────────────────────────────────────────────────────── */
  window.PortalStatus = {
    // Konstanten
    SUBMISSION_LABELS:      SUBMISSION_LABELS,
    SUBMISSION_BADGE_CLASS: SUBMISSION_BADGE_CLASS,
    SUBMISSION_ALERT_CLASS: SUBMISSION_ALERT_CLASS,
    ASSIGNMENT_LABELS:      ASSIGNMENT_LABELS,
    DOCUMENT_LABELS:        DOCUMENT_LABELS,
    DOCUMENT_CATEGORY_LABELS: DOCUMENT_CATEGORY_LABELS,
    NOTIFICATION_LABELS:    NOTIFICATION_LABELS,
    // Funktionen
    submissionLabel:        submissionLabel,
    submissionBadgeHtml:    submissionBadgeHtml,
    submissionAlertClass:   submissionAlertClass,
    assignmentLabel:        assignmentLabel,
    documentLabel:          documentLabel,
    documentBadgeState:     documentBadgeState,
    documentBadgeLabel:     documentBadgeLabel,
    documentCategoryLabel:  documentCategoryLabel,
    notificationLabel:      notificationLabel
  };
})();
