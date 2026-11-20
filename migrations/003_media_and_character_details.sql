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
  media_kind text NOT NULL CHECK (media_kind IN ('avatar','instagram','message')),
  mime_type text NOT NULL,
  file_name text NOT NULL,
  byte_size integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 12582912),
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
