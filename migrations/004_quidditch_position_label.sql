-- Keep the persisted Quidditch positions aligned with the character form.
ALTER TABLE public.characters DROP CONSTRAINT IF EXISTS characters_quidditch_check;
ALTER TABLE public.characters ADD CONSTRAINT characters_quidditch_check CHECK (quidditch_position IS NULL OR quidditch_position IN ('Poursuiveurs','Gardien','Batteur','Attrapeur','Pas de Quidditch'));
