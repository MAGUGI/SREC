import { env } from '../config/env';

// Carries what the backend error middleware sends ({ error, code, details })
// plus the HTTP status, so callers can react per status instead of per text.
export class ApiError extends Error {
  constructor(message, { status, body, url } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status ?? 0;
    this.body = body ?? null;
    this.code = body?.code ?? null;
    this.details = body?.details ?? null;
    this.url = url ?? '';
  }

  get isNotFound() {
    return this.status === 404;
  }

  get isConflict() {
    return this.status === 409;
  }

  get isValidation() {
    return this.status === 400 || this.status === 422;
  }

  get isNetwork() {
    return this.status === 0;
  }
}

// Reads the body once and never throws: an HTML 500 or an empty 204 must not
// break error handling (the received api.js called res.json() blindly).
async function readBody(response) {
  const raw = await response.text().catch(() => '');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return { error: raw.slice(0, 200) };
  }
}

function messageFrom(body, response) {
  return (
    body?.error ||
    body?.message ||
    `${response.status} ${response.statusText || 'Erro na requisição'}`
  );
}

export async function request(path, { method = 'GET', body, signal } = {}) {
  const url = `${env.apiBaseUrl}${path}`;
  const hasBody = body !== undefined;

  let response;
  try {
    response = await fetch(url, {
      method,
      signal: signal ?? AbortSignal.timeout(env.apiTimeoutMs),
      headers: {
        Accept: 'application/json',
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      },
      body: hasBody ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Não foi possível falar com o servidor do SREC.', { url });
  }

  const payload = await readBody(response);
  if (!response.ok) {
    throw new ApiError(messageFrom(payload, response), {
      status: response.status,
      body: payload,
      url,
    });
  }
  return payload;
}
