DO $$
DECLARE inverted_count integer;
BEGIN
  SELECT COUNT(*) INTO inverted_count FROM reservations WHERE end_time <= start_time;
  IF inverted_count > 0 THEN
    RAISE EXCEPTION 'Existem % reserva(s) com end_time <= start_time.', inverted_count;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservations_time_window_check') THEN
    ALTER TABLE reservations ADD CONSTRAINT reservations_time_window_check
      CHECK (end_time > start_time);
  END IF;
END $$;
