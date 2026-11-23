ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS group_kind text NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS house text NULL;

ALTER TABLE conversations
  ADD CONSTRAINT conversations_group_kind_check CHECK (group_kind IN ('custom','house')),
  ADD CONSTRAINT conversations_house_check CHECK (house IS NULL OR house IN ('Gryffindor','Slytherin','Ravenclaw','Hufflepuff')),
  ADD CONSTRAINT conversations_house_group_consistency CHECK (
    (group_kind='house' AND house IS NOT NULL AND conversation_type='group')
    OR (group_kind='custom' AND house IS NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS conversations_one_house_group_idx
  ON conversations(house) WHERE group_kind='house';

INSERT INTO conversations(conversation_type,title,group_kind,house)
SELECT 'group',v.title,'house',v.house
FROM (VALUES
  ('Gryffondor','Gryffindor'),
  ('Serpentard','Slytherin'),
  ('Serdaigle','Ravenclaw'),
  ('Poufsouffle','Hufflepuff')
) AS v(title,house)
WHERE NOT EXISTS (
  SELECT 1 FROM conversations c WHERE c.group_kind='house' AND c.house=v.house
);

CREATE OR REPLACE FUNCTION sync_character_house_group_membership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM conversation_members cm
  USING conversations c
  WHERE cm.conversation_id=c.id
    AND cm.character_id=NEW.id
    AND c.group_kind='house'
    AND (NEW.character_type <> 'student' OR c.house IS DISTINCT FROM NEW.house);

  IF NEW.character_type='student' AND NEW.house IS NOT NULL THEN
    INSERT INTO conversation_members(conversation_id,character_id)
    SELECT c.id,NEW.id
    FROM conversations c
    WHERE c.group_kind='house' AND c.house=NEW.house
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS characters_sync_house_group_membership ON characters;
CREATE TRIGGER characters_sync_house_group_membership
AFTER INSERT OR UPDATE OF character_type,house ON characters
FOR EACH ROW EXECUTE FUNCTION sync_character_house_group_membership();

INSERT INTO conversation_members(conversation_id,character_id)
SELECT c.id,ch.id
FROM conversations c
JOIN characters ch ON ch.character_type='student' AND ch.house=c.house
WHERE c.group_kind='house'
ON CONFLICT DO NOTHING;

UPDATE notifications n SET notification_type=CASE WHEN n.notification_type='message' THEN 'group_message' ELSE n.notification_type END,target_type='group_conversation' FROM conversations c WHERE c.id=n.target_id AND c.conversation_type='group' AND n.target_type='conversation';
