CREATE EXTENSION IF NOT EXISTS btree_gist;

UPDATE reservations SET status = 'scheduled' WHERE status IS NULL;
ALTER TABLE reservations ALTER COLUMN status SET DEFAULT 'scheduled';
ALTER TABLE reservations ALTER COLUMN status SET NOT NULL;

DO $$
DECLARE overlapping_count integer;
BEGIN
  SELECT COUNT(*) INTO overlapping_count
    FROM reservations a JOIN reservations b
      ON a.id < b.id
     AND a.resource_id = b.resource_id
     AND a.status <> 'cancelled' AND b.status <> 'cancelled'
     AND a.start_time < b.end_time AND a.end_time > b.start_time;
  IF overlapping_count > 0 THEN
    RAISE EXCEPTION 'Existem % par(es) de reservas sobrepostas na base.', overlapping_count;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservations_no_overlap') THEN
    ALTER TABLE reservations ADD CONSTRAINT reservations_no_overlap
      EXCLUDE USING gist (resource_id WITH =, tstzrange(start_time, end_time) WITH &&)
      WHERE (status <> 'cancelled');
  END IF;
END $$;
