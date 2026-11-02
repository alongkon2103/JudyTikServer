BEGIN;
CREATE TABLE judytik.game_categories(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),slug varchar(80) NOT NULL UNIQUE,name varchar(80) NOT NULL,description text NOT NULL DEFAULT '',sort_order integer NOT NULL DEFAULT 0 CHECK(sort_order>=0),status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE judytik.games(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),slug varchar(80) NOT NULL UNIQUE,name varchar(80) NOT NULL,description text NOT NULL DEFAULT '',category_id uuid REFERENCES judytik.game_categories(id) ON DELETE RESTRICT,platform varchar(80) NOT NULL DEFAULT 'pc',cover_url text,url text,status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),sort_order integer NOT NULL DEFAULT 0 CHECK(sort_order>=0),metadata jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(metadata)='object'),revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX games_status_sort_order_id_idx ON judytik.games(status,sort_order,id);
CREATE INDEX games_category_id_status_idx ON judytik.games(category_id,status);
CREATE TABLE judytik.game_presets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),game_id uuid NOT NULL REFERENCES judytik.games(id) ON DELETE RESTRICT,slug varchar(80) NOT NULL,name varchar(80) NOT NULL,description text NOT NULL DEFAULT '',format text NOT NULL CHECK(format IN ('action-preset-v1','game-event-v1')),payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=1048576),is_default boolean NOT NULL DEFAULT false,status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),version integer NOT NULL DEFAULT 1 CHECK(version>0),revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(game_id,slug),CHECK(NOT is_default OR status='published'));
CREATE UNIQUE INDEX game_presets_one_default ON judytik.game_presets(game_id) WHERE is_default;
CREATE INDEX game_presets_game_id_status_idx ON judytik.game_presets(game_id,status);
CREATE TABLE judytik.game_preset_versions(preset_id uuid NOT NULL REFERENCES judytik.game_presets(id) ON DELETE RESTRICT,version integer NOT NULL CHECK(version>0),snapshot jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(preset_id,version));
CREATE FUNCTION judytik.protect_game_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.id<>OLD.id OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1 THEN
  RAISE EXCEPTION 'Immutable game ID/creation or non-monotonic revision' USING ERRCODE='23514';
 END IF;
 NEW.updated_at:=clock_timestamp(); RETURN NEW;
END $$;
CREATE TRIGGER game_category_revision_guard BEFORE UPDATE ON judytik.game_categories FOR EACH ROW EXECUTE FUNCTION judytik.protect_game_revision();
CREATE TRIGGER game_revision_guard BEFORE UPDATE ON judytik.games FOR EACH ROW EXECUTE FUNCTION judytik.protect_game_revision();
CREATE TRIGGER game_preset_revision_guard BEFORE UPDATE ON judytik.game_presets FOR EACH ROW EXECUTE FUNCTION judytik.protect_game_revision();
COMMIT;
