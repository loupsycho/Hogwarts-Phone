-- Gazette: publication media, private correspondence, reactions and identity.
ALTER TABLE public.gazette_articles
  ADD COLUMN IF NOT EXISTS image_media_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gazette_articles_image_media_fk') THEN
    ALTER TABLE public.gazette_articles
      ADD CONSTRAINT gazette_articles_image_media_fk
      FOREIGN KEY (image_media_id) REFERENCES public.media_assets(id) ON DELETE SET NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_assets_media_kind_check') THEN
    ALTER TABLE public.media_assets DROP CONSTRAINT media_assets_media_kind_check;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_assets_media_kind_check') THEN
    ALTER TABLE public.media_assets
      ADD CONSTRAINT media_assets_media_kind_check
      CHECK (media_kind IN ('avatar','instagram','message','gallery','gazette'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.gazette_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  avatar_media_id uuid REFERENCES public.media_assets(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.gazette_settings(id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.gazette_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL UNIQUE REFERENCES public.characters(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gazette_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.gazette_threads(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('character','gazette')),
  sender_user_id uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  body text NOT NULL DEFAULT '',
  media_id uuid REFERENCES public.media_assets(id) ON DELETE SET NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(trim(body)) > 0 OR media_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.gazette_reactions (
  article_id uuid NOT NULL REFERENCES public.gazette_articles(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  reaction text NOT NULL CHECK (reaction IN ('like','dislike')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (article_id, character_id)
);

CREATE INDEX IF NOT EXISTS gazette_threads_updated_idx
  ON public.gazette_threads(updated_at DESC);
CREATE INDEX IF NOT EXISTS gazette_messages_thread_idx
  ON public.gazette_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS gazette_messages_unread_idx
  ON public.gazette_messages(read_at, created_at) WHERE sender_type='character';
CREATE INDEX IF NOT EXISTS gazette_reactions_article_idx
  ON public.gazette_reactions(article_id, reaction);
