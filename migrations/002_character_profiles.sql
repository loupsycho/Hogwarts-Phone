-- Hogwarts Phone: extended character profile fields
ALTER TABLE public.characters ADD COLUMN IF NOT EXISTS age integer;
ALTER TABLE public.characters ADD COLUMN IF NOT EXISTS character_kind text;
ALTER TABLE public.characters ADD COLUMN IF NOT EXISTS quidditch_position text;
ALTER TABLE public.characters ADD COLUMN IF NOT EXISTS optional_courses text[] NOT NULL DEFAULT ARRAY[]::text[];
ALTER TABLE public.characters ADD COLUMN IF NOT EXISTS important_role text;
ALTER TABLE public.characters ADD COLUMN IF NOT EXISTS house_responsibility text;

ALTER TABLE public.characters ADD CONSTRAINT characters_character_kind_check CHECK (character_kind IS NULL OR character_kind IN ('OC','Saga'));
ALTER TABLE public.characters ADD CONSTRAINT characters_age_check CHECK (age IS NULL OR age BETWEEN 17 AND 100);
ALTER TABLE public.characters ADD CONSTRAINT characters_student_age_check CHECK (character_type <> 'student' OR age IS NULL OR age = 17);
ALTER TABLE public.characters ADD CONSTRAINT characters_quidditch_check CHECK (quidditch_position IS NULL OR quidditch_position IN ('Chasseur','Gardien','Batteur','Attrapeur','Pas de Quidditch'));
ALTER TABLE public.characters ADD CONSTRAINT characters_important_role_check CHECK (important_role IS NULL OR important_role IN ('Préfet de la maison','Sous-préfet','Aucun'));
ALTER TABLE public.characters ADD CONSTRAINT characters_house_responsibility_check CHECK (house_responsibility IS NULL OR house_responsibility IN ('Gryffondor','Serdaigle','Serpentard','Poufsouffle','Non'));
