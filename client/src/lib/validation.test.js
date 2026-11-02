import { describe, expect, it } from 'vitest';
import { hasErrors, isBlank, nowForDateTimeInput, serverFieldErrors } from './validation';

describe('validation helpers', () => {
  it('formata o agora no padrão do datetime-local', () => {
    expect(nowForDateTimeInput(new Date(2026, 9, 21, 9, 5, 42))).toBe('2026-10-21T09:05');
  });

  it('isBlank trata nulo, indefinido e espaços como vazio', () => {
    expect([null, undefined, '', '   '].every(isBlank)).toBe(true);
    expect(isBlank(0)).toBe(false);
  });

  it('hasErrors só é verdadeiro com ao menos um campo', () => {
    expect(hasErrors({})).toBe(false);
    expect(hasErrors({ name: 'x' })).toBe(true);
  });

  it('serverFieldErrors usa o code do backend para achar o campo', () => {
    const error = { code: 'END_BEFORE_START', body: { error: 'msg do servidor' } };
    expect(serverFieldErrors(error, { END_BEFORE_START: 'end_time' })).toEqual({
      end_time: 'msg do servidor',
    });
  });

  it('serverFieldErrors prefere details.field ao mapa de codes', () => {
    const error = {
      code: 'INVALID_DATETIME',
      details: { field: 'start_time' },
      body: { error: 'formato inválido' },
    };
    expect(serverFieldErrors(error, {})).toEqual({ start_time: 'formato inválido' });
  });

  it('serverFieldErrors devolve vazio para erro sem campo (rede, 500)', () => {
    expect(serverFieldErrors(new Error('Falha de rede'), {})).toEqual({});
  });
});
