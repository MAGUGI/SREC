const { parseInstant, ISO_8601_WITH_OFFSET } = require('./datetime');

describe('parseInstant', () => {
  // Tabela P da spec QA-02, ajustada ao contrato de BE-07 (#41): a string sem
  // offset, que o datetime-local do client mandava e que causava BUG-07,
  // agora é recusada com INVALID_DATETIME em vez de ser interpretada no fuso
  // do servidor.
  it.each([
    ['P-01 ISO com Z', '2026-11-10T10:00:00.000Z', '2026-11-10T10:00:00.000Z'],
    ['P-02 ISO com offset de São Paulo', '2026-11-10T14:00:00-03:00', '2026-11-10T17:00:00.000Z'],
    ['P-03 ISO sem segundos, com offset', '2026-11-10T14:00-03:00', '2026-11-10T17:00:00.000Z'],
    ['P-04 ISO com espaço em volta', '  2026-11-10T10:00:00Z  ', '2026-11-10T10:00:00.000Z'],
    ['P-05 offset positivo', '2026-11-10T10:00:00+02:00', '2026-11-10T08:00:00.000Z'],
  ])('%s → %s', (_scenario, value, expectedIso) => {
    expect(parseInstant(value, 'start_time').toISOString()).toBe(expectedIso);
  });

  it.each([
    ['P-06 ISO sem offset (BUG-07)', '2026-11-10T10:00'],
    ['P-07 string vazia', ''],
    ['P-08 só espaços', '   '],
    ['P-09 texto', 'amanhã às dez'],
    ['P-10 null', null],
    ['P-11 undefined', undefined],
    ['P-12 número', 1763000000000],
    ['P-13 Date', new Date('2026-11-10T10:00:00.000Z')],
    ['P-14 só a data', '2026-11-10'],
    ['P-15 formato do Postgres sem T', '2026-11-10 10:00:00-03'],
    ['P-16 mês 13 com offset', '2026-13-10T10:00:00Z'],
  ])('%s → 400 INVALID_DATETIME', (_scenario, value) => {
    expect(() => parseInstant(value, 'start_time')).toThrow(
      expect.objectContaining({ statusCode: 400, code: 'INVALID_DATETIME' }),
    );
  });

  it('P-17 informa o campo e o valor recebido no erro', () => {
    expect(() => parseInstant('2026-11-10T10:00', 'end_time')).toThrow(
      expect.objectContaining({ details: { field: 'end_time', received: '2026-11-10T10:00' } }),
    );
  });

  it('P-18 o mesmo instante independe do fuso em que foi escrito', () => {
    const saoPaulo = parseInstant('2026-11-10T14:00:00-03:00', 'start_time');
    const utc = parseInstant('2026-11-10T17:00:00Z', 'start_time');

    expect(saoPaulo.getTime()).toBe(utc.getTime());
  });

  it('P-19 a expressão regular exige offset explícito', () => {
    expect(ISO_8601_WITH_OFFSET.test('2026-11-10T10:00:00Z')).toBe(true);
    expect(ISO_8601_WITH_OFFSET.test('2026-11-10T10:00:00')).toBe(false);
  });
});
