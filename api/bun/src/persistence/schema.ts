export const schema = `
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS applications (
    internal_id INTEGER PRIMARY KEY,
    id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS flags (
    internal_id INTEGER PRIMARY KEY,
    id TEXT NOT NULL UNIQUE,
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS flag_applications (
    flag_internal_id INTEGER NOT NULL REFERENCES flags(internal_id) ON DELETE CASCADE,
    application_internal_id INTEGER NOT NULL REFERENCES applications(internal_id) ON DELETE CASCADE,
    PRIMARY KEY (flag_internal_id, application_internal_id)
  );

  CREATE INDEX IF NOT EXISTS idx_flag_applications_application
    ON flag_applications(application_internal_id);
  CREATE INDEX IF NOT EXISTS idx_flags_created_at ON flags(created_at);
  CREATE INDEX IF NOT EXISTS idx_applications_created_at ON applications(created_at);
`;
