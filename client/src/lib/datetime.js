function pad(value) {
  return String(value).padStart(2, '0');
}

function offsetOf(date) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absolute = Math.abs(offsetMinutes);
  return `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
}

/**
 * Converts a <input type="datetime-local"> value ("2026-10-21T14:00") to
 * ISO 8601 with offset ("2026-10-21T14:00:00-03:00"), the BE-07 contract.
 * Without the offset the user's local time was stored as if it were UTC
 * (BUG-07), and the backend now rejects it with 400 INVALID_DATETIME.
 */
export function localInputToIso(localValue) {
  if (!localValue) return '';
  const date = new Date(localValue);
  if (Number.isNaN(date.getTime())) return '';
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${offsetOf(date)}`
  );
}

/** Reverse path, to fill a datetime-local input from an API timestamp. */
export function isoToLocalInput(isoValue) {
  if (!isoValue) return '';
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return '';
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}
