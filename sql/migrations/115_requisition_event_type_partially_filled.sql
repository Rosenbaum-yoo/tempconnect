-- Migration 115: PARTIALLY_FILLED zum event_type-Check hinzufuegen
-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 113 fuegte PARTIALLY_FILLED als gueltigen Requisitions-Status ein,
-- erweiterte aber die CHECK-Constraint auf requisition_events.event_type nicht.
-- Dadurch schlaegt jeder Status-Uebergang nach PARTIALLY_FILLED mit einem
-- DB-Constraint-Fehler fehl, wenn writeEvent() aufgerufen wird.
--
-- Fix: Constraint droppen und mit PARTIALLY_FILLED neu anlegen (idempotent).

ALTER TABLE requisition_events
  DROP CONSTRAINT IF EXISTS requisition_events_event_type_check;

ALTER TABLE requisition_events
  ADD CONSTRAINT requisition_events_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'CREATED'::text,
    'SUBMITTED_FOR_APPROVAL'::text,
    'APPROVED'::text,
    'REJECTED'::text,
    'OPENED'::text,
    'CANDIDATE_ADDED'::text,
    'CANDIDATE_REMOVED'::text,
    'CANDIDATE_SHORTLISTED'::text,
    'CANDIDATE_REJECTED'::text,
    'IN_REVIEW'::text,
    'SHORTLISTED'::text,
    'PARTIALLY_FILLED'::text,
    'FILLED'::text,
    'CLOSED'::text,
    'CANCELLED'::text,
    'REOPENED'::text,
    'COMMENT'::text,
    'NOTE'::text,
    'ASSIGNMENT_CHANGED'::text,
    'FIELD_CHANGED'::text,
    'SLA_STARTED'::text,
    'SLA_MET'::text,
    'SLA_BREACHED'::text
  ]));
