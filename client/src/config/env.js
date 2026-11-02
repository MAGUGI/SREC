// The only place in the client that reads import.meta.env.
const DEFAULT_API_BASE_URL = 'http://localhost:5000/api';
const DEFAULT_TIMEOUT_MS = 10000;

// `http://host/api/` and `http://host/api` must build the same URLs.
function stripTrailingSlash(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export const env = {
  apiBaseUrl: stripTrailingSlash(import.meta.env.VITE_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL),
  apiTimeoutMs: Number(import.meta.env.VITE_API_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
};
