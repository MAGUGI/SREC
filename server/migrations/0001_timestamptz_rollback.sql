ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_no_overlap;
ALTER TABLE reservations
  ALTER COLUMN start_time TYPE TIMESTAMP USING start_time AT TIME ZONE 'America/Sao_Paulo',
  ALTER COLUMN end_time TYPE TIMESTAMP USING end_time AT TIME ZONE 'America/Sao_Paulo',
  ALTER COLUMN created_at TYPE TIMESTAMP USING created_at AT TIME ZONE 'America/Sao_Paulo',
  ALTER COLUMN updated_at TYPE TIMESTAMP USING updated_at AT TIME ZONE 'America/Sao_Paulo';
ALTER TABLE resources
  ALTER COLUMN created_at TYPE TIMESTAMP USING created_at AT TIME ZONE 'America/Sao_Paulo',
  ALTER COLUMN updated_at TYPE TIMESTAMP USING updated_at AT TIME ZONE 'America/Sao_Paulo';
