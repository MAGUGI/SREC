import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { ApiError } from './http';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function respond({ status = 200, body = null, text = null, ok = status < 400 }) {
  const raw = text ?? (body === null ? '' : JSON.stringify(body));
  return Promise.resolve({
    ok,
    status,
    statusText: 'Erro',
    text: () => Promise.resolve(raw),
    json: () => Promise.resolve(JSON.parse(raw)),
  });
}

describe('camada de API', () => {
  // FAILS BEFORE: the received api.js dropped the body ('Erro ao atualizar status').
  it('repassa a mensagem do servidor no PATCH de status', async () => {
    fetch.mockReturnValue(respond({ status: 400, body: { error: 'status inválido' } }));
    await expect(api.updateReservationStatus(1, 'xpto')).rejects.toThrow('status inválido');
  });

  // FAILS BEFORE: the received api.js dropped the body ('Erro ao deletar recurso').
  it('repassa a mensagem do servidor no DELETE de recurso', async () => {
    fetch.mockReturnValue(respond({ status: 404, body: { error: 'Resource not found' } }));
    await expect(api.deleteResource(999)).rejects.toThrow('Resource not found');
  });

  it('expõe o status HTTP e o code do backend no ApiError', async () => {
    fetch.mockReturnValue(
      respond({ status: 404, body: { error: 'nao achei', code: 'RESOURCE_NOT_FOUND' } })
    );
    const error = await api.getResources().catch((err) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(404);
    expect(error.code).toBe('RESOURCE_NOT_FOUND');
    expect(error.isNotFound).toBe(true);
  });

  // FAILS BEFORE: res.json() on an HTML body threw SyntaxError.
  it('não quebra quando o servidor responde HTML em vez de JSON', async () => {
    fetch.mockReturnValue(respond({ status: 500, text: '<!DOCTYPE html><h1>Error</h1>' }));
    const error = await api.createResource({ name: 'x', type: 'workstation' }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).not.toMatch(/Unexpected token|not valid JSON/);
  });

  it('transforma falha de rede em ApiError de status 0', async () => {
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    const error = await api.getResources().catch((err) => err);
    expect(error.isNetwork).toBe(true);
  });

  it('usa VITE_API_BASE_URL e manda Accept: application/json', async () => {
    fetch.mockReturnValue(respond({ body: [] }));
    await api.getResources();
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(
      `${import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api'}/resources`
    );
    expect(init.headers.Accept).toBe('application/json');
  });

  it('não envia Content-Type em requisição sem corpo', async () => {
    fetch.mockReturnValue(respond({ body: { message: 'ok' } }));
    await api.deleteReservation(1);
    expect(fetch.mock.calls[0][1].headers?.['Content-Type']).toBeUndefined();
  });

  it('devolve null quando o corpo é vazio (204)', async () => {
    fetch.mockReturnValue(respond({ status: 204, text: '' }));
    await expect(api.deleteResource(1)).resolves.toBeNull();
  });

  // FAILS BEFORE (BUG-07, client side): datetime-local value went out without offset.
  it('envia o horário da reserva em ISO 8601 com offset', async () => {
    fetch.mockReturnValue(respond({ status: 201, body: { id: 1 } }));
    await api.createReservation({
      resource_id: 1,
      user_name: 'Carlos',
      start_time: '2026-10-21T14:00',
      end_time: '2026-10-21T15:00',
    });
    const sent = JSON.parse(fetch.mock.calls[0][1].body);
    // Any timezone: the offset is present and it is the same instant the user
    // typed as local time (in Sao Paulo this is '2026-10-21T14:00:00-03:00').
    expect(sent.start_time).toMatch(/^2026-10-21T14:00:00[+-]\d{2}:\d{2}$/);
    expect(sent.end_time).toMatch(/^2026-10-21T15:00:00[+-]\d{2}:\d{2}$/);
    expect(new Date(sent.start_time).getTime()).toBe(new Date('2026-10-21T14:00').getTime());
  });
});
