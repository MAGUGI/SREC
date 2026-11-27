import { describe, expect, it } from 'vitest';
import { isoToLocalInput, localInputToIso } from './datetime';

describe('localInputToIso', () => {
  it('acrescenta o offset do fuso ao value do datetime-local', () => {
    expect(localInputToIso('2026-10-21T14:00')).toMatch(/^2026-10-21T14:00:00[+-]\d{2}:\d{2}$/);
  });

  it('é idempotente na ida e volta', () => {
    expect(isoToLocalInput(localInputToIso('2026-10-21T14:00'))).toBe('2026-10-21T14:00');
  });

  it('devolve string vazia para entrada vazia ou inválida', () => {
    expect(localInputToIso('')).toBe('');
    expect(localInputToIso('não é data')).toBe('');
  });
});
