ALTER TABLE agenda_events ADD COLUMN IF NOT EXISTS cancelled_at timestamptz NULL;
