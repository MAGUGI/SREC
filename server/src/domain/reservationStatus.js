const ReservationStatus = Object.freeze({
  SCHEDULED: 'scheduled',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
});
const RESERVATION_STATUSES = Object.freeze(Object.values(ReservationStatus));
const ALLOWED_TRANSITIONS = Object.freeze({
  scheduled: Object.freeze(['completed', 'cancelled']),
  cancelled: Object.freeze([]),
  completed: Object.freeze([]),
});
const isValidStatus = (value) => RESERVATION_STATUSES.includes(value);
const isFinalStatus = (value) => isValidStatus(value) && ALLOWED_TRANSITIONS[value].length === 0;
const canTransition = (from, to) => isValidStatus(from) && isValidStatus(to) && ALLOWED_TRANSITIONS[from].includes(to);
const allowedSources = (to) => RESERVATION_STATUSES.filter((from) => ALLOWED_TRANSITIONS[from].includes(to));

module.exports = { ReservationStatus, RESERVATION_STATUSES, ALLOWED_TRANSITIONS, isValidStatus, isFinalStatus, canTransition, allowedSources };
