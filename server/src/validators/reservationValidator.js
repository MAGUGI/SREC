const MAX_CLOCK_SKEW_MS = 60 * 1000;
const parseTimestamp = (value) => {
  if (!(typeof value === 'string' || value instanceof Date)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const validateReservationWindow = ({ start_time, end_time }, now = new Date()) => {
  const start = parseTimestamp(start_time);
  if (!start) return { valid: false, code: 'INVALID_START_TIME', message: 'O início da reserva não é uma data/hora válida.' };
  const end = parseTimestamp(end_time);
  if (!end) return { valid: false, code: 'INVALID_END_TIME', message: 'O término da reserva não é uma data/hora válida.' };
  if (end.getTime() <= start.getTime()) return { valid: false, code: 'END_BEFORE_START', message: 'O término da reserva deve ser posterior ao início.' };
  if (start.getTime() < now.getTime() - MAX_CLOCK_SKEW_MS) return { valid: false, code: 'START_IN_THE_PAST', message: 'Não é possível reservar um horário que já passou.' };
  return { valid: true, start, end };
};

module.exports = { validateReservationWindow, MAX_CLOCK_SKEW_MS };
