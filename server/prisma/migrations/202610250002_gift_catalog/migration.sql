BEGIN;
-- CreateTable
CREATE TABLE "judytik"."gifts" (
    "id" VARCHAR(20) NOT NULL,
    "name_override" VARCHAR(255),
    "image_override" TEXT,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "search_text" TEXT NOT NULL,
    "revision" BIGINT NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "judytik"."gift_regions" (
    "gift_id" VARCHAR(20) NOT NULL,
    "region" VARCHAR(2) NOT NULL,
    "provider_name" VARCHAR(255) NOT NULL,
    "coins" INTEGER NOT NULL,
    "image_url" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "gift_type" INTEGER NOT NULL,
    "combo" BOOLEAN NOT NULL,
    "source_observed_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "gift_regions_pkey" PRIMARY KEY ("gift_id","region")
);

-- CreateTable
CREATE TABLE "judytik"."gift_catalog_state" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "revision" BIGINT NOT NULL DEFAULT 0,
    "last_synced_at" TIMESTAMPTZ,

    CONSTRAINT "gift_catalog_state_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gift_regions_region_coins_gift_id_idx" ON "judytik"."gift_regions"("region", "coins", "gift_id");

-- AddForeignKey
ALTER TABLE "judytik"."gift_regions" ADD CONSTRAINT "gift_regions_gift_id_fkey" FOREIGN KEY ("gift_id") REFERENCES "judytik"."gifts"("id") ON DELETE CASCADE ON UPDATE NO ACTION;


ALTER TABLE judytik.gifts ADD CONSTRAINT numeric_gift_id CHECK(id ~ '^[1-9][0-9]{0,19}$'),
 ADD CONSTRAINT gift_positive_revision CHECK(revision>0),
 ADD CONSTRAINT bounded_gift_aliases CHECK(cardinality(aliases)<=20),
 ADD CONSTRAINT nonempty_gift_override CHECK(name_override IS NULL OR length(btrim(name_override)) BETWEEN 1 AND 255);
ALTER TABLE judytik.gift_regions ADD CONSTRAINT supported_gift_region CHECK(region IN ('TH','US')),
 ADD CONSTRAINT gift_nonnegative_coins CHECK(coins>=0),
 ADD CONSTRAINT nonempty_provider_name CHECK(length(btrim(provider_name)) BETWEEN 1 AND 255);
ALTER TABLE judytik.gift_catalog_state ADD CONSTRAINT catalog_singleton CHECK(id=1),
 ADD CONSTRAINT catalog_revision_nonnegative CHECK(revision>=0);
INSERT INTO judytik.gift_catalog_state(id) VALUES(1);
CREATE FUNCTION judytik.protect_gift_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.id<>OLD.id OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1 THEN
  RAISE EXCEPTION 'Immutable gift ID/creation or non-monotonic revision' USING ERRCODE='23514';
 END IF;
 NEW.updated_at:=clock_timestamp();RETURN NEW;
END $$;
CREATE TRIGGER gift_revision_guard BEFORE UPDATE ON judytik.gifts FOR EACH ROW EXECUTE FUNCTION judytik.protect_gift_revision();

ALTER TABLE judytik.audit_events ADD COLUMN resource_key VARCHAR(80);
COMMIT;
