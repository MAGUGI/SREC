-- BUG-09 e BUG-10 (#47): tipo e capacidade do espaço passam a ser garantidos
-- também pelo banco, não só pelo service. Aborta se já houver linha inválida:
-- dado ruim precisa ser corrigido à mão, nunca apagado em silêncio.
DO $$
DECLARE invalid_count integer;
BEGIN
  SELECT COUNT(*) INTO invalid_count FROM resources
   WHERE type NOT IN ('workstation', 'meeting_room') OR capacity NOT BETWEEN 1 AND 100;
  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Existem % espaço(s) com tipo fora do enum ou capacidade fora de 1 a 100.', invalid_count;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resources_type_check') THEN
    ALTER TABLE resources ADD CONSTRAINT resources_type_check
      CHECK (type IN ('workstation', 'meeting_room'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resources_capacity_check') THEN
    ALTER TABLE resources ADD CONSTRAINT resources_capacity_check
      CHECK (capacity BETWEEN 1 AND 100);
  END IF;
END $$;
