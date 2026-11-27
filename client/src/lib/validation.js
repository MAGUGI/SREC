/** Now rounded to the minute, in the <input type="datetime-local"> format. */
export function nowForDateTimeInput(reference = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return (
    `${reference.getFullYear()}-${pad(reference.getMonth() + 1)}-${pad(reference.getDate())}` +
    `T${pad(reference.getHours())}:${pad(reference.getMinutes())}`
  );
}

export function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

export function hasErrors(errors) {
  return Object.keys(errors).length > 0;
}

/**
 * Turns a server rejection into field errors. The backend sends
 * { error, code, details }: `codeToField` places the message under the field
 * the code refers to, and `details.field` wins when present. The server
 * message always replaces the client one.
 */
export function serverFieldErrors(apiError, codeToField = {}) {
  const message = apiError?.body?.error ?? apiError?.message;
  const field = apiError?.details?.field ?? codeToField[apiError?.code];
  return field && message ? { [field]: message } : {};
}
