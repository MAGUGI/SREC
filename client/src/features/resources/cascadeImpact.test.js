import { describe, expect, it } from 'vitest';
import { cascadeImpact } from './cascadeImpact';

const NOW = new Date('2026-10-20T12:00:00-03:00');
const make = (id, resourceId, startIso, status, userName) => ({
  id,
  resource_id: resourceId,
  user_name: userName,
  start_time: startIso,
  end_time: startIso,
  status,
});

const RESERVATIONS = [
  make(1, 1, '2026-10-10T10:00:00-03:00', 'completed', 'Ana'),
  make(2, 1, '2026-10-26T10:00:00-03:00', 'scheduled', 'Carla'),
  make(3, 1, '2026-10-25T10:00:00-03:00', 'scheduled', 'Bruno'),
  make(4, 1, '2026-10-27T10:00:00-03:00', 'cancelled', 'Dani'),
  make(5, 2, '2026-10-28T10:00:00-03:00', 'scheduled', 'Elis'),
  make(6, 1, '2026-10-29T10:00:00-03:00', 'scheduled', 'Bruno'),
];

describe('cascadeImpact', () => {
  it('conta só as reservas do recurso alvo', () => {
    expect(cascadeImpact(RESERVATIONS, 1, { now: NOW }).total).toBe(5);
  });

  it('separa futuras de passadas', () => {
    const impact = cascadeImpact(RESERVATIONS, 1, { now: NOW });
    expect(impact.future).toBe(4);
    expect(impact.past).toBe(1);
  });

  it('conta separadamente as futuras ainda agendadas', () => {
    expect(cascadeImpact(RESERVATIONS, 1, { now: NOW }).scheduledFuture).toBe(3);
  });

  it('lista os próximos responsáveis em ordem de horário, sem repetir', () => {
    expect(cascadeImpact(RESERVATIONS, 1, { now: NOW }).upcomingNames).toEqual(['Bruno', 'Carla']);
  });

  it('compara resource_id como string e como número', () => {
    expect(cascadeImpact(RESERVATIONS, '1', { now: NOW }).total).toBe(5);
  });

  it('devolve zeros para recurso sem reserva', () => {
    expect(cascadeImpact(RESERVATIONS, 99, { now: NOW })).toEqual({
      total: 0,
      future: 0,
      scheduledFuture: 0,
      past: 0,
      upcomingNames: [],
    });
  });

  it('não quebra com lista vazia', () => {
    expect(cascadeImpact([], 1, { now: NOW }).total).toBe(0);
  });
});
