-- Instagram replies and comment reactions (development branch only).
-- Idempotent migration for the Hogwarts Phone Instagram feature.

ALTER TABLE public.instagram_comments
  ADD COLUMN IF NOT EXISTS parent_comment_id uuid
  REFERENCES public.instagram_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS instagram_comments_parent_idx
  ON public.instagram_comments(parent_comment_id, created_at);

CREATE TABLE IF NOT EXISTS public.instagram_comment_likes (
  comment_id uuid NOT NULL REFERENCES public.instagram_comments(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, character_id)
);

CREATE INDEX IF NOT EXISTS instagram_comment_likes_character_idx
  ON public.instagram_comment_likes(character_id, created_at DESC);
