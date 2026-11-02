const { CONSTRAINT_OVERRIDES } = require('./pgErrorCodes');

describe('CONSTRAINT_OVERRIDES de resources (#47)', () => {
  it.each([
    ['resources_type_check', 'INVALID_RESOURCE_TYPE'],
    ['resources_capacity_check', 'INVALID_CAPACITY'],
  ])('%s → 400 %s, mesmo código da validação do service', (constraint, code) => {
    expect(CONSTRAINT_OVERRIDES).toHaveProperty([constraint], expect.objectContaining({ statusCode: 400, code }));
  });
});
