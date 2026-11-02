import { isBlank } from '../../lib/validation';

// Same 60 s tolerance as the backend (BE-02, MAX_CLOCK_SKEW_MS).
export const MAX_CLOCK_SKEW_MS = 60 * 1000;
// VARCHAR(100) in the schema: longer names would fail on the server.
export const MAX_NAME_LENGTH = 100;

// Backend error codes (BE-02, BE-01) and the field each one is about.
export const RESERVATION_ERROR_FIELDS = {
  INVALID_START_TIME: 'start_time',
  START_IN_THE_PAST: 'start_time',
  RESERVATION_OVERLAP: 'start_time',
  INVALID_END_TIME: 'end_time',
  END_BEFORE_START: 'end_time',
  RESOURCE_NOT_FOUND: 'resource_id',
  RELATED_RESOURCE_NOT_FOUND: 'resource_id',
};

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Mirrors the BE-02 window rules and messages. The server is the authority;
 * this only spares the user a round trip to find out.
 */
export function validateReservation(values, { now = new Date() } = {}) {
  const errors = {};

  if (isBlank(values.resource_id)) {
    errors.resource_id = 'Selecione um espaço.';
  }
  if (isBlank(values.user_name)) {
    errors.user_name = 'Informe o nome do responsável.';
  } else if (values.user_name.trim().length > MAX_NAME_LENGTH) {
    errors.user_name = `O nome do responsável tem no máximo ${MAX_NAME_LENGTH} caracteres.`;
  }

  const start = toDate(values.start_time);
  const end = toDate(values.end_time);

  if (!start) {
    errors.start_time = 'Informe o horário de início.';
  } else if (start.getTime() < now.getTime() - MAX_CLOCK_SKEW_MS) {
    errors.start_time = 'Não é possível reservar um horário que já passou.';
  }

  if (!end) {
    errors.end_time = 'Informe o horário de término.';
  } else if (start && end.getTime() <= start.getTime()) {
    errors.end_time = 'O término da reserva deve ser posterior ao início.';
  }

  return errors;
}
