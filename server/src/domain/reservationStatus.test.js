const {
  ReservationStatus,
  RESERVATION_STATUSES,
  ALLOWED_TRANSITIONS,
  isValidStatus,
  isFinalStatus,
  canTransition,
  allowedSources,
} = require('./reservationStatus');

const { SCHEDULED, CANCELLED, COMPLETED } = ReservationStatus;

describe('enum de status', () => {
  it('tem exatamente os três status do sistema recebido', () => {
    expect(RESERVATION_STATUSES).toEqual(['scheduled', 'cancelled', 'completed']);
  });

  // Os literais vêm do banco recebido; mudar qualquer um quebra dado já
  // gravado e a constraint reservations_status_check.
  it('mantém os literais gravados no banco', () => {
    expect(SCHEDULED).toBe('scheduled');
    expect(CANCELLED).toBe('cancelled');
    expect(COMPLETED).toBe('completed');
  });

  it('é imutável: vocabulário e tabela de transições estão congelados', () => {
    expect(Object.isFrozen(ReservationStatus)).toBe(true);
    expect(Object.isFrozen(RESERVATION_STATUSES)).toBe(true);
    expect(Object.isFrozen(ALLOWED_TRANSITIONS)).toBe(true);
    for (const targets of Object.values(ALLOWED_TRANSITIONS)) {
      expect(Object.isFrozen(targets)).toBe(true);
    }
  });

  it.each([
    ['scheduled', 'scheduled', true],
    ['cancelled', 'cancelled', true],
    ['completed', 'completed', true],
    ['string fora do enum (BUG-03)', 'banana', false],
    ['variação de caixa', 'Scheduled', false],
    ['com espaço', ' scheduled', false],
    ['string vazia', '', false],
    ['null (corpo sem status, BUG-03)', null, false],
    ['undefined', undefined, false],
    ['número', 1, false],
    ['objeto', { status: 'scheduled' }, false],
  ])('isValidStatus — %s → %s', (_scenario, value, expected) => {
    expect(isValidStatus(value)).toBe(expected);
  });
});

describe('canTransition', () => {
  it.each([
    ['S-01 agendada → cancelada', SCHEDULED, CANCELLED, true],
    ['S-02 agendada → concluída', SCHEDULED, COMPLETED, true],
    ['S-03 agendada → agendada (sem efeito)', SCHEDULED, SCHEDULED, false],
    ['S-04 cancelada → agendada (ressuscitar)', CANCELLED, SCHEDULED, false],
    ['S-05 cancelada → concluída', CANCELLED, COMPLETED, false],
    ['S-06 cancelada → cancelada', CANCELLED, CANCELLED, false],
    ['S-07 concluída → agendada', COMPLETED, SCHEDULED, false],
    ['S-08 concluída → cancelada', COMPLETED, CANCELLED, false],
    ['S-09 concluída → concluída', COMPLETED, COMPLETED, false],
    ['S-10 agendada → fora do enum (BUG-03)', SCHEDULED, 'banana', false],
    ['S-11 agendada → string vazia', SCHEDULED, '', false],
    ['S-12 agendada → null (BUG-03)', SCHEDULED, null, false],
    ['S-13 agendada → undefined', SCHEDULED, undefined, false],
    ['S-14 origem fora do enum', 'banana', CANCELLED, false],
    ['S-15 origem null', null, CANCELLED, false],
  ])('%s → %s', (_scenario, from, to, expected) => {
    expect(canTransition(from, to)).toBe(expected);
  });

  it('cobre as nove combinações do enum, e exatamente duas são permitidas', () => {
    const combinations = RESERVATION_STATUSES.flatMap((from) => RESERVATION_STATUSES.map((to) => [from, to]));
    const allowed = combinations.filter(([from, to]) => canTransition(from, to));

    expect(combinations).toHaveLength(9);
    expect(allowed).toHaveLength(2);
    expect(allowed).toEqual(expect.arrayContaining([[SCHEDULED, CANCELLED], [SCHEDULED, COMPLETED]]));
  });

  it('não lança para nenhuma entrada', () => {
    expect(() => canTransition(undefined, undefined)).not.toThrow();
    expect(() => canTransition({}, [])).not.toThrow();
    expect(canTransition('constructor', 'toString')).toBe(false);
  });
});

describe('isFinalStatus', () => {
  it.each([
    [SCHEDULED, false],
    [CANCELLED, true],
    [COMPLETED, true],
    ['banana', false],
    [null, false],
  ])('%s → %s', (status, expected) => {
    expect(isFinalStatus(status)).toBe(expected);
  });

  it('todo status final recusa qualquer transição de saída', () => {
    for (const from of RESERVATION_STATUSES.filter(isFinalStatus)) {
      for (const to of RESERVATION_STATUSES) {
        expect(canTransition(from, to)).toBe(false);
      }
    }
  });
});

// allowedSources alimenta o `WHERE status = ANY($3)` do UPDATE atômico de
// ReservationModel.updateStatus: é a mesma tabela lida ao contrário.
describe('allowedSources', () => {
  it.each([
    [COMPLETED, [SCHEDULED]],
    [CANCELLED, [SCHEDULED]],
    [SCHEDULED, []],
    ['banana', []],
  ])('para chegar em %s, a reserva precisa estar em %j', (to, expected) => {
    expect(allowedSources(to)).toEqual(expected);
  });

  it('é coerente com canTransition para as nove combinações', () => {
    for (const to of RESERVATION_STATUSES) {
      for (const from of RESERVATION_STATUSES) {
        expect(allowedSources(to).includes(from)).toBe(canTransition(from, to));
      }
    }
  });
});
