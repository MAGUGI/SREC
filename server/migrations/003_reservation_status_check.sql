DO $$
DECLARE invalid_count integer;
BEGIN
  SELECT COUNT(*) INTO invalid_count FROM reservations
   WHERE status IS NULL OR status NOT IN ('scheduled', 'cancelled', 'completed');
  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Existem % reserva(s) com status fora do enum.', invalid_count;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservations_status_check') THEN
    ALTER TABLE reservations ADD CONSTRAINT reservations_status_check
      CHECK (status IN ('scheduled', 'cancelled', 'completed'));
  END IF;
END $$;
