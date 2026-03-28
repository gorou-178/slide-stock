-- Migration: 0003_drop_status
-- Description: Remove status column from stocks table
-- status was always 'ready' after ADR-004 removed async queue processing

ALTER TABLE stocks DROP COLUMN status;
