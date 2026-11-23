ALTER TABLE link_requests
  ADD COLUMN IF NOT EXISTS relationship_category text NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS ended_at timestamptz;

ALTER TABLE link_requests
  DROP CONSTRAINT IF EXISTS link_requests_request_status_check;
ALTER TABLE link_requests
  ADD CONSTRAINT link_requests_request_status_check
  CHECK (request_status IN ('pending','accepted','declined','cancelled','ended'));

UPDATE link_requests
SET relationship_category = CASE
  WHEN lower(relationship_type) LIKE '%couple%' OR lower(relationship_type) LIKE '%crush%' OR lower(relationship_type) LIKE '%plan%' OR lower(relationship_type) LIKE '%amour%' THEN 'romance'
  WHEN lower(relationship_type) LIKE '%ami%' OR lower(relationship_type) LIKE '%friend%' THEN 'friendship'
  WHEN lower(relationship_type) LIKE '%rival%' OR lower(relationship_type) LIKE '%ennemi%' THEN 'rivalry'
  WHEN lower(relationship_type) LIKE '%frère%' OR lower(relationship_type) LIKE '%soeur%' OR lower(relationship_type) LIKE '%sœur%' OR lower(relationship_type) LIKE '%père%' OR lower(relationship_type) LIKE '%mère%' OR lower(relationship_type) LIKE '%cousin%' OR lower(relationship_type) LIKE '%oncle%' OR lower(relationship_type) LIKE '%tante%' OR lower(relationship_type) LIKE '%famille%' THEN 'family'
  WHEN lower(relationship_type) LIKE '%ex %' OR lower(relationship_type) LIKE '%ancienne%' THEN 'past'
  ELSE relationship_category
END;

CREATE TABLE IF NOT EXISTS link_profiles (
  character_id uuid PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  description text,
  desired_links jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(desired_links) = 'array'),
  published_at timestamptz NOT NULL DEFAULT now(),
  last_bumped_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS link_discussions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
  request_id uuid UNIQUE REFERENCES link_requests(id) ON DELETE CASCADE,
  character_a_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  character_b_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  created_by_character_id uuid REFERENCES characters(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (character_a_id <> character_b_id)
);

CREATE TABLE IF NOT EXISTS link_discussion_hidden (
  discussion_id uuid NOT NULL REFERENCES link_discussions(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  hidden_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (discussion_id, character_id)
);

CREATE INDEX IF NOT EXISTS link_profiles_published_idx
  ON link_profiles(published_at DESC);
CREATE INDEX IF NOT EXISTS link_discussions_character_a_idx
  ON link_discussions(character_a_id, created_at DESC);
CREATE INDEX IF NOT EXISTS link_discussions_character_b_idx
  ON link_discussions(character_b_id, created_at DESC);
