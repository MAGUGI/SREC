import { describe, expect, it } from 'vitest';
import { validateResource } from './validation';

const VALID = { name: 'Sala Alpha', type: 'meeting_room', capacity: 8 };
const check = (overrides) => validateResource({ ...VALID, ...overrides });

describe('validateResource', () => {
  it('aceita um espaço válido', () => {
    expect(check({})).toEqual({});
  });

  it('exige o nome e limita a 100 caracteres', () => {
    expect(check({ name: '' })).toHaveProperty('name');
    expect(check({ name: 'a'.repeat(101) })).toHaveProperty('name');
  });

  it('recusa tipo fora do enum', () => {
    expect(check({ type: 'auditorio' })).toHaveProperty('type');
  });

  it.each([0, -3, 2.5, ''])('recusa capacidade %s', (capacity) => {
    expect(check({ capacity })).toHaveProperty('capacity');
  });

  it('aceita capacidade vinda do input como texto', () => {
    expect(check({ capacity: '4' })).toEqual({});
  });
});
