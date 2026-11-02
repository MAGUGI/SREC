import { describe, expect, it } from 'vitest';
import { validateReservation } from './validation';

const NOW = new Date('2030-01-10T12:00:00');
const VALID = {
  resource_id: 1,
  user_name: 'Carlos Silva',
  start_time: '2030-01-10T14:00',
  end_time: '2030-01-10T15:00',
};

const check = (overrides) => validateReservation({ ...VALID, ...overrides }, { now: NOW });

describe('validateReservation (espelho da BE-02)', () => {
  it('aceita uma janela válida no futuro', () => {
    expect(check({})).toEqual({});
  });

  it('exige o espaço', () => {
    expect(check({ resource_id: '' })).toHaveProperty('resource_id');
  });

  it('exige o responsável', () => {
    expect(check({ user_name: '   ' })).toHaveProperty('user_name');
  });

  it('limita o responsável a 100 caracteres', () => {
    expect(check({ user_name: 'a'.repeat(101) })).toHaveProperty('user_name');
    expect(check({ user_name: 'a'.repeat(100) })).toEqual({});
  });

  it('exige início e término válidos', () => {
    expect(check({ start_time: '' })).toHaveProperty('start_time');
    expect(check({ end_time: 'não é data' })).toHaveProperty('end_time');
  });

  it('recusa término igual ao início', () => {
    expect(check({ end_time: VALID.start_time }).end_time).toBe(
      'O término da reserva deve ser posterior ao início.'
    );
  });

  it('recusa término antes do início', () => {
    expect(check({ end_time: '2030-01-10T13:00' })).toHaveProperty('end_time');
  });

  it('recusa início no passado', () => {
    const errors = check({ start_time: '2030-01-09T14:00', end_time: '2030-01-09T15:00' });
    expect(errors.start_time).toBe('Não é possível reservar um horário que já passou.');
  });

  it('tolera até 60 s de atraso de relógio no início, como o servidor', () => {
    const now = new Date('2030-01-10T14:00:30');
    expect(validateReservation(VALID, { now })).toEqual({});
  });
});
