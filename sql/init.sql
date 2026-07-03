CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  due_date DATE,
  daily_target INTEGER NOT NULL DEFAULT 10,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  reminder_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  reminder_time TIME,
  disclaimer_accepted BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  target_count INTEGER NOT NULL DEFAULT 10,
  actual_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS movement_events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  mode TEXT NOT NULL DEFAULT 'quick',
  session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_movement_events_user_time ON movement_events(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_user_start ON sessions(user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS movement_context (
  id SERIAL PRIMARY KEY,
  movement_event_id INTEGER NOT NULL UNIQUE REFERENCES movement_events(id) ON DELETE CASCADE,
  position TEXT,
  activity TEXT,
  hydration_level INTEGER,
  stress_level INTEGER,
  ate_recently BOOLEAN,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  sleep_quality INTEGER,
  mood TEXT,
  energy_level INTEGER,
  physical_notes TEXT,
  concerns TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, entry_date)
);

CREATE TABLE IF NOT EXISTS reminder_presets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_count INTEGER NOT NULL,
  preset_type TEXT NOT NULL DEFAULT 'custom',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS partner_access (
  id SERIAL PRIMARY KEY,
  primary_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  partner_email TEXT NOT NULL,
  access_level TEXT NOT NULL DEFAULT 'view',
  accepted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS milestone_preferences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  show_milestones BOOLEAN NOT NULL DEFAULT TRUE,
  show_countdown BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journal_user_date ON journal_entries(user_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_movement_context_event ON movement_context(movement_event_id);
CREATE INDEX IF NOT EXISTS idx_partner_access_primary ON partner_access(primary_user_id);
