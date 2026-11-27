const { validateReservationWindow, MAX_CLOCK_SKEW_MS } = require('./reservationValidator');

const NOW = new Date('2026-11-10T08:00:00.000Z');

/** Açúcar para montar janelas no dia 10/11/2026 em UTC. */
const w = (start, end) => ({
  start_time: `2026-11-10T${start}:00.000Z`,
  end_time: `2026-11-10T${end}:00.000Z`,
});

describe('validateReservationWindow', () => {
  // Tabela W da spec QA-02, ajustada ao contrato entregue em BE-02 (#41):
  // o contrato do Backend vence nos nomes; onde o comportamento diverge da
  // spec há um comentário na linha, e a divergência está explicada no PR.
  it.each([
    ['W-01 janela válida de 1h no futuro', w('10:00', '11:00'), null],
    ['W-02 janela curta de 15 min', w('10:00', '10:15'), null],
    ['W-03 janela longa de 8h', w('10:00', '18:00'), null],
    ['W-04 fim antes do início (BUG-02)', w('11:00', '09:00'), 'END_BEFORE_START'],
    // A spec previa ZERO_DURATION; BE-02 trata duração zero como fim não posterior ao início.
    ['W-05 duração zero', w('10:00', '10:00'), 'END_BEFORE_START'],
    ['W-06 início no passado (BUG-08)', w('07:00', '09:00'), 'START_IN_THE_PAST'],
    // A spec previa DURATION_TOO_SHORT/TOO_LONG; BE-02 não tem limite de duração.
    ['W-07 janela de 10 min, sem duração mínima', w('10:00', '10:10'), null],
    ['W-08 janela de 9h, sem duração máxima', w('10:00', '19:00'), null],
    ['W-09 início ilegível', { start_time: 'amanhã', end_time: 'depois' }, 'INVALID_START_TIME'],
    ['W-10 sem start_time', { end_time: '2026-11-10T11:00:00.000Z' }, 'INVALID_START_TIME'],
    ['W-11 sem end_time', { start_time: '2026-11-10T10:00:00.000Z' }, 'INVALID_END_TIME'],
    ['W-12 objeto vazio', {}, 'INVALID_START_TIME'],
    ['W-18 fim ilegível', { start_time: '2026-11-10T10:00:00.000Z', end_time: 'depois' }, 'INVALID_END_TIME'],
    ['W-19 número em vez de data', { start_time: 1763000000000, end_time: '2026-11-10T11:00:00.000Z' }, 'INVALID_START_TIME'],
  ])('%s → %s', (_scenario, window, expectedCode) => {
    const result = validateReservationWindow(window, NOW);

    if (expectedCode === null) {
      expect(result.valid).toBe(true);
    } else {
      expect(result).toMatchObject({ valid: false, code: expectedCode });
      expect(typeof result.message).toBe('string');
    }
  });

  it('W-13 aceita janela que começa exatamente agora', () => {
    const result = validateReservationWindow({ start_time: NOW.toISOString(), end_time: '2026-11-10T09:00:00.000Z' }, NOW);

    expect(result.valid).toBe(true);
  });

  // A spec previa recusar 1 ms no passado; BE-02 tolera 60 s de diferença de
  // relógio entre cliente e servidor. A borda passou a ser MAX_CLOCK_SKEW_MS.
  it('W-14 aceita início até 60 s no passado (tolerância de relógio) e recusa depois disso', () => {
    const end = '2026-11-10T09:00:00.000Z';
    const atTheEdge = new Date(NOW.getTime() - MAX_CLOCK_SKEW_MS).toISOString();
    const pastTheEdge = new Date(NOW.getTime() - MAX_CLOCK_SKEW_MS - 1).toISOString();

    expect(MAX_CLOCK_SKEW_MS).toBe(60 * 1000);
    expect(validateReservationWindow({ start_time: atTheEdge, end_time: end }, NOW).valid).toBe(true);
    expect(validateReservationWindow({ start_time: pastTheEdge, end_time: end }, NOW)).toMatchObject({
      valid: false,
      code: 'START_IN_THE_PAST',
    });
  });

  // Precedência: a janela invertida reporta o campo certo.
  it('W-15 reporta END_BEFORE_START, não START_IN_THE_PAST, quando a janela está invertida no passado', () => {
    const result = validateReservationWindow(w('07:00', '06:00'), NOW);

    expect(result.code).toBe('END_BEFORE_START');
  });

  it('W-16 não lança para entrada inválida', () => {
    expect(() => validateReservationWindow({}, NOW)).not.toThrow();
    expect(() => validateReservationWindow({ start_time: null, end_time: undefined }, NOW)).not.toThrow();
  });

  it('W-17 usa o relógio real quando `now` não é informado', () => {
    const hour = 60 * 60 * 1000;
    const future = {
      start_time: new Date(Date.now() + 24 * hour).toISOString(),
      end_time: new Date(Date.now() + 25 * hour).toISOString(),
    };

    expect(validateReservationWindow(future).valid).toBe(true);
  });

  it('W-20 devolve os instantes já convertidos quando a janela é válida', () => {
    const result = validateReservationWindow(w('10:00', '11:00'), NOW);

    expect(result.start).toEqual(new Date('2026-11-10T10:00:00.000Z'));
    expect(result.end).toEqual(new Date('2026-11-10T11:00:00.000Z'));
  });

  it('W-21 aceita Date além de string', () => {
    const result = validateReservationWindow(
      { start_time: new Date('2026-11-10T10:00:00.000Z'), end_time: new Date('2026-11-10T11:00:00.000Z') },
      NOW,
    );

    expect(result.valid).toBe(true);
  });
});
