-- Migration 042: Add link_path column to notifications table.
-- Fixes: workerNotificationService inserts link_path but column was missing,
-- causing all worker notifications to fail silently.
-- Also enables enterprise notifications to carry direct deep-link URLs.

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link_path TEXT;

COMMENT ON COLUMN notifications.link_path IS 'Optional deep-link path for click-through navigation (e.g. /public/requisitions.html?id=...)';
