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

  /* ── i18n (P6) ─────────────────────────────────────────────────────
     Die DE-Maps oben bleiben die Quelle der Wahrheit UND der Fallback —
     das DE-Woerterbuch wird daraus erzeugt, damit kein Text doppelt
     gepflegt wird und nie auseinanderlaufen kann. Nur Englisch steht
     explizit hier. Ohne geladenes i18n.js verhaelt sich das Modul exakt
     wie vorher (Portal-Seiten ohne Sprachschicht bleiben lauffaehig). */
  var EN_LABELS = {
    'ep.status.sub.draft': 'Draft',
    'ep.status.sub.submitted': 'Submitted',
    'ep.status.sub.under_review': 'Under review',
    'ep.status.sub.needs_correction': 'Correction required',
    'ep.status.sub.approved_internal': 'Approved internally',
    'ep.status.sub.rejected': 'Rejected',
    'ep.status.sub.sent_to_customer': 'With the client',
    'ep.status.sub.customer_confirmed': 'Confirmed by client',
    'ep.status.sub.customer_rejected': 'Rejected by client',
    'ep.status.sub.posted_to_timesheet': 'Invoiced',
    'ep.status.sub.accepted_into_timesheet': 'Accepted',
    'ep.status.asg.pending_confirmation': 'Confirmation pending',
    'ep.status.asg.confirmed': 'Confirmed',
    'ep.status.asg.declined': 'Declined',
    'ep.status.asg.unavailable': 'Reported absent',
    'ep.status.asg.active': 'Active',
    'ep.status.asg.completed': 'Completed',
    'ep.status.asg.cancelled': 'Cancelled',
    'ep.status.doc.pending_review': 'Under review',
    'ep.status.doc.verified': 'Verified',
    'ep.status.doc.rejected': 'Rejected',
    'ep.status.doc.expired': 'Expired',
    'ep.status.doc.archived': 'Archived',
    'ep.status.cat.qualification': 'Qualification',
    'ep.status.cat.identity': 'Identity',
    'ep.status.cat.permit': 'Permit',
    'ep.status.cat.medical': 'Medical',
    'ep.status.cat.training': 'Training',
    'ep.status.cat.other': 'Other',
    'ep.status.note.assignment_confirmed': 'Assignment confirmed',
    'ep.status.note.assignment_declined': 'Assignment declined',
    'ep.status.note.assignment_new': 'New assignment',
    'ep.status.note.assignment_cancelled': 'Assignment cancelled',
    'ep.status.note.submission_approved': 'Timesheet approved',
    'ep.status.note.submission_needs_correction': 'Correction required',
    'ep.status.note.submission_rejected': 'Timesheet rejected',
    'ep.status.note.staffing_invite': 'Assignment invitation',
    'ep.status.note.staffing_choice_set': 'Assignment choice',
    'ep.status.note.document_verified': 'Document verified',
    'ep.status.note.document_rejected': 'Document rejected',
    'ep.status.note.document_expiring': 'Document expiring',
    'ep.status.note.general': 'Message',
    'ep.status.unknown': 'Unknown',
    'ep.status.docFallback': 'Document',
    'ep.status.docCritical': 'Deadline critical',
    'ep.status.docOpen': 'Open'
  };

  var EXTRA_DE = {
    'ep.status.unknown': 'Unbekannt',
    'ep.status.docFallback': 'Dokument',
    'ep.status.docCritical': 'Fristkritisch',
    'ep.status.docOpen': 'Offen'
  };

  var PREFIXES = [
    ['ep.status.sub.', SUBMISSION_LABELS],
    ['ep.status.asg.', ASSIGNMENT_LABELS],
    ['ep.status.doc.', DOCUMENT_LABELS],
    ['ep.status.cat.', DOCUMENT_CATEGORY_LABELS],
    ['ep.status.note.', NOTIFICATION_LABELS]
  ];

  (function registerI18n() {
    if (!window.TCi18n) return;
    var de = {};
    PREFIXES.forEach(function (pair) {
      Object.keys(pair[1]).forEach(function (k) { de[pair[0] + k] = pair[1][k]; });
    });
    Object.keys(EXTRA_DE).forEach(function (k) { de[k] = EXTRA_DE[k]; });
    window.TCi18n.register('de', de);
    window.TCi18n.register('en', EN_LABELS);
  })();

  /** Uebersetzt, faellt auf den deutschen Bestandstext zurueck. */
  function tr(key, fallback) {
    if (window.TCi18n) {
      var v = window.TCi18n.t(key);
      if (v) return v;
    }
    return fallback;
  }

  /* ── Hilfsfunktionen ───────────────────────────────────────────── */

  function submissionLabel(status) {
    return tr('ep.status.sub.' + status, SUBMISSION_LABELS[status]) || status || tr('ep.status.unknown', 'Unbekannt');
  }

  /**
   * Gibt fertiges <span class="ep-badge ...">...</span> zurück.
   * Die Bedeutung traegt die Badge-Klasse (Farbe) plus die Beschriftung — frueher stand
   * hier zusaetzlich ein Emoji, das dieselbe Aussage ein zweites Mal machte.
   */
  function submissionBadgeHtml(status) {
    var cls  = SUBMISSION_BADGE_CLASS[status] || 'ep-badge-draft';
    var lbl  = tr('ep.status.sub.' + status, SUBMISSION_LABELS[status]) || status || '';
    return '<span class="ep-badge ' + cls + '">' + lbl + '</span>';
  }

  function submissionAlertClass(status) {
    return SUBMISSION_ALERT_CLASS[status] || 'info';
  }

  function assignmentLabel(status) {
    return tr('ep.status.asg.' + status, ASSIGNMENT_LABELS[status]) || status || tr('ep.status.unknown', 'Unbekannt');
  }

  function documentLabel(status) {
    return tr('ep.status.doc.' + status, DOCUMENT_LABELS[status]) || status || tr('ep.status.unknown', 'Unbekannt');
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
    if (status === 'expired')        return documentLabel('expired');
    if (status === 'rejected')       return documentLabel('rejected');
    if (doc && doc.is_expiring_soon) return tr('ep.status.docCritical', 'Fristkritisch');
    if (status === 'pending_review') return documentLabel('pending_review');
    if (status === 'verified')       return documentLabel('verified');
    if (status === 'archived')       return documentLabel('archived');
    return tr('ep.status.docOpen', 'Offen');
  }

  function documentCategoryLabel(category) {
    return tr('ep.status.cat.' + category, DOCUMENT_CATEGORY_LABELS[category]) || category || tr('ep.status.docFallback', 'Dokument');
  }

  function notificationLabel(type) {
    return tr('ep.status.note.' + type, NOTIFICATION_LABELS[type]) || type || tr('ep.status.note.general', 'Mitteilung');
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
