const { RESOURCE_TYPE, RESOURCE_TYPES, isValidResourceType, isValidCapacity } = require('./resourceType');

describe('tipos de recurso', () => {
  it('tem exatamente os dois tipos que o front oferece', () => {
    expect(RESOURCE_TYPES).toEqual(['workstation', 'meeting_room']);
  });

  it.each([
    ['workstation', 'workstation', true],
    ['meeting_room', 'meeting_room', true],
    ['tipo inventado (BUG-10)', 'sofa', false],
    ['variação de caixa', 'Workstation', false],
    ['com espaço', 'meeting_room ', false],
    ['string vazia', '', false],
    ['null', null, false],
    ['undefined', undefined, false],
  ])('isValidResourceType — %s → %s', (_cenario, value, expected) => {
    expect(isValidResourceType(value)).toBe(expected);
  });

  it('o enum cobre o que o front renderiza', () => {
    expect(RESOURCE_TYPES).toContain(RESOURCE_TYPE.MEETING_ROOM);
    expect(RESOURCE_TYPES).toContain(RESOURCE_TYPE.WORKSTATION);
    expect(RESOURCE_TYPES).toHaveLength(2);
  });
});

describe('isValidCapacity', () => {
  it.each([
    ['mínimo', 1, true],
    ['típico', 6, true],
    ['máximo', 100, true],
    ['zero (BUG-09)', 0, false],
    ['negativo (BUG-09)', -5, false],
    ['acima do máximo', 101, false],
    ['fracionário', 2.5, false],
    ['string numérica', '6', false],
    ['NaN', Number.NaN, false],
    ['Infinity', Number.POSITIVE_INFINITY, false],
    ['null', null, false],
    ['undefined', undefined, false],
  ])('%s → %s', (_cenario, value, expected) => {
    expect(isValidCapacity(value)).toBe(expected);
  });
});
