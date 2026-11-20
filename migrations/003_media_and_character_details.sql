-- Persistent media uploads and character profile details for Hogwarts Phone
ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS sexual_orientation text,
  ADD COLUMN IF NOT EXISTS profile_media_id uuid;

ALTER TABLE public.instagram_posts
  ADD COLUMN IF NOT EXISTS media_id uuid;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS media_id uuid;

CREATE TABLE IF NOT EXISTS public.media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  character_id uuid REFERENCES public.characters(id) ON DELETE SET NULL,
  media_kind text NOT NULL CHECK (media_kind IN ('avatar','instagram','message','gallery')),
  mime_type text NOT NULL,
  file_name text NOT NULL,
  byte_size integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 52428800),
  content bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.characters
  ADD CONSTRAINT characters_profile_media_fk
  FOREIGN KEY (profile_media_id) REFERENCES public.media_assets(id) ON DELETE SET NULL;
ALTER TABLE public.instagram_posts
  ADD CONSTRAINT instagram_posts_media_fk
  FOREIGN KEY (media_id) REFERENCES public.media_assets(id) ON DELETE SET NULL;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_media_fk
  FOREIGN KEY (media_id) REFERENCES public.media_assets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS media_assets_character_idx ON public.media_assets(character_id, created_at DESC);
CREATE INDEX IF NOT EXISTS media_assets_owner_idx ON public.media_assets(owner_user_id, created_at DESC);

-- Group avatars and Instagram following
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS avatar_media_id uuid;
ALTER TABLE public.conversations ADD CONSTRAINT conversations_avatar_media_fk
  FOREIGN KEY (avatar_media_id) REFERENCES public.media_assets(id) ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS public.instagram_follows (
  follower_character_id uuid NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  followed_character_id uuid NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_character_id, followed_character_id),
  CHECK (follower_character_id <> followed_character_id)
);
CREATE INDEX IF NOT EXISTS instagram_follows_followed_idx ON public.instagram_follows(followed_character_id, created_at DESC);

-- Chunked uploads keep large media below serverless request-size limits.
CREATE TABLE IF NOT EXISTS public.media_upload_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  media_kind text NOT NULL CHECK (media_kind IN ('avatar','instagram','message','gallery')),
  mime_type text NOT NULL,
  file_name text NOT NULL,
  total_bytes integer NOT NULL CHECK (total_bytes > 0 AND total_bytes <= 52428800),
  chunk_count integer NOT NULL CHECK (chunk_count > 0 AND chunk_count <= 100),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.media_upload_chunks (
  session_id uuid NOT NULL REFERENCES public.media_upload_sessions(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL CHECK (chunk_index >= 0),
  content bytea NOT NULL,
  PRIMARY KEY (session_id, chunk_index)
);
CREATE INDEX IF NOT EXISTS media_upload_sessions_created_idx ON public.media_upload_sessions(created_at);
