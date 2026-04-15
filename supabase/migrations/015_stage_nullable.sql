-- Migration 015: Make projects.stage nullable
-- Needed for ERP projects where the old deal_stage enum doesn't apply.
-- IIoT projects keep backward-compatible stage values via application-level mapping.

ALTER TABLE projects ALTER COLUMN stage DROP NOT NULL;
