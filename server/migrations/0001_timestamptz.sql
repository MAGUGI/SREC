CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_no_overlap;
ALTER TABLE resources
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'America/Sao_Paulo',
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'America/Sao_Paulo';

ALTER TABLE reservations
  ALTER COLUMN start_time TYPE TIMESTAMPTZ USING start_time AT TIME ZONE 'America/Sao_Paulo',
  ALTER COLUMN end_time TYPE TIMESTAMPTZ USING end_time AT TIME ZONE 'America/Sao_Paulo',
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'America/Sao_Paulo',
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'America/Sao_Paulo';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservations_no_overlap') THEN
    ALTER TABLE reservations ADD CONSTRAINT reservations_no_overlap
      EXCLUDE USING gist (resource_id WITH =, tstzrange(start_time, end_time) WITH &&)
      WHERE (status <> 'cancelled');
  END IF;
END $$;
