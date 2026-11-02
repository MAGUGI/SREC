const { overlaps } = require('./timeWindow');
const { validateReservationWindow } = require('../validators/reservationValidator');

/** Açúcar para montar janelas no dia 10/11/2026 em UTC. */
const w = (start, end) => ({
  start_time: `2026-11-10T${start}:00.000Z`,
  end_time: `2026-11-10T${end}:00.000Z`,
});

const EXISTING = w('10:00', '11:00'); // reserva já no banco: 10:00 → 11:00

const TABLE = [
  ['O-01 antes, disjunto', w('08:00', '09:00'), false],
  ['O-02 encostando antes (termina 10:00)', w('09:00', '10:00'), false],
  ['O-03 parcial à esquerda', w('09:30', '10:30'), true],
  ['O-04 idêntico', w('10:00', '11:00'), true],
  ['O-05 contido', w('10:15', '10:45'), true],
  ['O-06 contendo', w('09:00', '12:00'), true],
  ['O-07 parcial à direita', w('10:30', '11:30'), true],
  ['O-08 encostando depois (começa 11:00)', w('11:00', '12:00'), false],
  ['O-09 depois, disjunto', w('12:00', '13:00'), false],
];

describe('overlaps — intervalos semiabertos [start, end)', () => {
  // A tabela abaixo é a mesma da spec QA-02, linha por linha.
  it.each(TABLE)('%s → %s', (_scenario, candidate, expected) => {
    expect(overlaps(EXISTING, candidate)).toBe(expected);
  });

  it.each(TABLE)('O-10 simetria em "%s": overlaps(a, b) === overlaps(b, a)', (_scenario, candidate) => {
    expect(overlaps(EXISTING, candidate)).toBe(overlaps(candidate, EXISTING));
  });

  // Este é o teste que impede o "off by one" na N3.
  it('O-02/O-08 NÃO conflita quando uma reserva termina exatamente quando a outra começa', () => {
    const morning = w('09:00', '10:00');
    const next = w('10:00', '11:00');

    expect(overlaps(morning, next)).toBe(false);
    expect(overlaps(next, morning)).toBe(false);
  });

  it('O-11/O-12 trocar < por <= quebraria a agenda: milissegundos de folga decidem', () => {
    const previous = w('09:00', '10:00');
    const oneMsAfter = { start_time: '2026-11-10T10:00:00.001Z', end_time: '2026-11-10T11:00:00.000Z' };
    const oneMsBefore = { start_time: '2026-11-10T09:59:59.999Z', end_time: '2026-11-10T11:00:00.000Z' };

    expect(overlaps(previous, oneMsAfter)).toBe(false);
    expect(overlaps(previous, oneMsBefore)).toBe(true);
  });

  it('O-13 considera o dia inteiro contendo a reserva como sobreposição', () => {
    const wholeDay = { start_time: '2026-11-10T00:00:00.000Z', end_time: '2026-11-11T00:00:00.000Z' };

    expect(overlaps(EXISTING, wholeDay)).toBe(true);
  });

  it('O-14 não conflita quando é o mesmo horário em dias diferentes', () => {
    const nextDay = { start_time: '2026-11-11T10:00:00.000Z', end_time: '2026-11-11T11:00:00.000Z' };

    expect(overlaps(EXISTING, nextDay)).toBe(false);
  });

  // BUG-02: é por isso que a janela tem de ser validada ANTES da sobreposição.
  it('O-15 uma janela invertida não colide com nada — o motivo de BUG-02 ser crítico', () => {
    const inverted = w('11:00', '09:00');
    const now = new Date('2026-11-10T08:00:00.000Z');

    expect(overlaps(EXISTING, inverted)).toBe(false);
    expect(validateReservationWindow(inverted, now)).toMatchObject({ valid: false, code: 'END_BEFORE_START' });
  });

  it.each([
    ['texto nos dois campos', { start_time: 'ontem', end_time: 'amanhã' }],
    ['objeto vazio', {}],
    ['string vazia', { start_time: '', end_time: '2026-11-10T11:00:00.000Z' }],
    ['Date inválido', { start_time: new Date('nada'), end_time: '2026-11-10T11:00:00.000Z' }],
    ['número em vez de data', { start_time: 1763000000000, end_time: '2026-11-10T11:00:00.000Z' }],
  ])('O-16 devolve false, sem lançar, quando a data é inutilizável: %s', (_scenario, candidate) => {
    expect(overlaps(EXISTING, candidate)).toBe(false);
    expect(overlaps(candidate, EXISTING)).toBe(false);
  });

  it('O-16 não lança nem sem argumento', () => {
    expect(() => overlaps()).not.toThrow();
    expect(overlaps()).toBe(false);
  });

  it('O-17 aceita Date e string ISO indistintamente', () => {
    const asDate = {
      start_time: new Date('2026-11-10T10:30:00.000Z'),
      end_time: new Date('2026-11-10T11:30:00.000Z'),
    };

    expect(overlaps(EXISTING, asDate)).toBe(true);
  });

  it('O-18 compara instantes, não relógio de parede: 14:00-03:00 é o mesmo que 17:00Z', () => {
    const existingInSaoPaulo = { start_time: '2026-11-10T14:00:00-03:00', end_time: '2026-11-10T15:00:00-03:00' };
    const sameSlotInUtc = { start_time: '2026-11-10T17:00:00Z', end_time: '2026-11-10T18:00:00Z' };
    const touchingInUtc = { start_time: '2026-11-10T18:00:00Z', end_time: '2026-11-10T19:00:00Z' };

    expect(overlaps(existingInSaoPaulo, sameSlotInUtc)).toBe(true);
    expect(overlaps(existingInSaoPaulo, touchingInUtc)).toBe(false);
  });
});
