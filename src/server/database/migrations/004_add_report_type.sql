-- Add a first-class report type (bug | feature | question | task) so the widget
-- can offer multiple report kinds and integrations can route them differently.
-- Existing rows default to 'bug'. Fresh installs already have this column from
-- initSchema()'s base CREATE TABLE; the migration runner tolerates the resulting
-- "duplicate column name" error and records the migration as applied.
ALTER TABLE reports ADD COLUMN report_type TEXT NOT NULL DEFAULT 'bug';
CREATE INDEX IF NOT EXISTS idx_reports_report_type ON reports(report_type);
