CREATE TABLE judytik.live_history (
 user_id uuid NOT NULL REFERENCES judytik.users(id) ON DELETE CASCADE,
 id uuid NOT NULL,
 creator_device_id uuid NOT NULL,
 started_at timestamptz NOT NULL,
 data jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,id),
 FOREIGN KEY(user_id,creator_device_id) REFERENCES judytik.devices(user_id,id) ON DELETE CASCADE,
 CONSTRAINT live_history_data CHECK (
  jsonb_typeof(data)='object' AND octet_length(data::text)<=1048576
  AND data ?& ARRAY['version','id','sequence','username','roomId','title','startedAt','updatedAt','endedAt','status','durationSeconds','stats','gifts','chart']
  AND data-ARRAY['version','id','sequence','username','roomId','title','startedAt','updatedAt','endedAt','status','durationSeconds','stats','gifts','chart']='{}'::jsonb
  AND (data->'stats') ?& ARRAY['peakViewers','likes','coins','followers','chats','shares','giftCount','unknownGiftCount']
  AND (data->'stats')-ARRAY['peakViewers','likes','coins','followers','chats','shares','giftCount','unknownGiftCount']='{}'::jsonb
  AND data->'version'='1'::jsonb AND lower(data->>'id')=id::text
  AND jsonb_typeof(data->'sequence')='number' AND jsonb_typeof(data->'durationSeconds')='number'
  AND (data->>'sequence')::numeric BETWEEN 1 AND 9007199254740991
  AND (data->>'sequence')::numeric=trunc((data->>'sequence')::numeric)
  AND (data->>'startedAt')::timestamptz=started_at
  AND data->>'status' IN ('active','completed','interrupted')
  AND jsonb_typeof(data->'stats')='object'
  AND jsonb_typeof(data->'gifts')='array' AND jsonb_array_length(data->'gifts')<=2000
  AND jsonb_typeof(data->'chart')='array' AND jsonb_array_length(data->'chart')<=720
 )
);
CREATE INDEX live_history_account_started ON judytik.live_history(user_id,started_at DESC,id DESC);
CREATE FUNCTION judytik.protect_live_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE key text; gift jsonb; updated_gift jsonb;
BEGIN
 IF NEW.user_id<>OLD.user_id OR NEW.id<>OLD.id OR NEW.creator_device_id<>OLD.creator_device_id OR NEW.started_at<>OLD.started_at
  OR NEW.created_at<>OLD.created_at OR NEW.data->'username' IS DISTINCT FROM OLD.data->'username'
  OR NEW.data->'roomId' IS DISTINCT FROM OLD.data->'roomId' OR NEW.data->'startedAt' IS DISTINCT FROM OLD.data->'startedAt'
  OR (NEW.data->>'sequence')::numeric<=(OLD.data->>'sequence')::numeric
  OR (NEW.data->>'durationSeconds')::numeric<(OLD.data->>'durationSeconds')::numeric
  OR (NEW.data->>'updatedAt')::timestamptz<(OLD.data->>'updatedAt')::timestamptz
  OR (OLD.data->>'status'<>'active' AND (NEW.data->'status' IS DISTINCT FROM OLD.data->'status' OR NEW.data->'endedAt' IS DISTINCT FROM OLD.data->'endedAt'))
 THEN RAISE EXCEPTION 'immutable or regressing LIVE history' USING ERRCODE='23514'; END IF;
 FOREACH key IN ARRAY ARRAY['peakViewers','likes','coins','followers','chats','shares','giftCount','unknownGiftCount'] LOOP
  IF (OLD.data->'stats'->>key) IS NOT NULL AND ((NEW.data->'stats'->>key) IS NULL OR (NEW.data->'stats'->>key)::numeric<(OLD.data->'stats'->>key)::numeric)
  THEN RAISE EXCEPTION 'regressing LIVE history counter' USING ERRCODE='23514'; END IF;
 END LOOP;
 FOR gift IN SELECT value FROM jsonb_array_elements(OLD.data->'gifts') LOOP
  SELECT value INTO updated_gift FROM jsonb_array_elements(NEW.data->'gifts') WHERE value->>'id'=gift->>'id';
  IF updated_gift IS NULL OR (updated_gift->>'count')::numeric<(gift->>'count')::numeric OR (updated_gift->>'totalCoins')::numeric<(gift->>'totalCoins')::numeric
  THEN RAISE EXCEPTION 'regressing LIVE history gift' USING ERRCODE='23514'; END IF;
 END LOOP;
 NEW.updated_at=now();
 RETURN NEW;
END $$;
CREATE TRIGGER live_history_guard BEFORE UPDATE ON judytik.live_history FOR EACH ROW EXECUTE FUNCTION judytik.protect_live_history();
ALTER TABLE judytik.live_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE judytik.live_history FORCE ROW LEVEL SECURITY;
CREATE POLICY read_own_live_history ON judytik.live_history FOR SELECT USING(user_id=judytik.request_user_id());
CREATE POLICY insert_own_live_history ON judytik.live_history FOR INSERT WITH CHECK(user_id=judytik.request_user_id() AND creator_device_id=nullif(current_setting('judytik.device_id',true),'')::uuid);
CREATE POLICY update_own_live_history ON judytik.live_history FOR UPDATE USING(user_id=judytik.request_user_id() AND creator_device_id=nullif(current_setting('judytik.device_id',true),'')::uuid) WITH CHECK(user_id=judytik.request_user_id() AND creator_device_id=nullif(current_setting('judytik.device_id',true),'')::uuid);
