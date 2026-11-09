-- Cover data lives outside catalogue rows and commits atomically with the imported game.
CREATE TABLE judytik.game_covers (
 game_id uuid PRIMARY KEY REFERENCES judytik.games(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
 data bytea NOT NULL CHECK (octet_length(data) BETWEEN 1 AND 1048576),
 created_at timestamptz NOT NULL DEFAULT now()
);
