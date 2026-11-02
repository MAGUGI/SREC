const validateIdParam = require('./validateIdParam');
describe('validateIdParam', () => {
  it('publishes a positive integer', () => {
    const req = { params: { id: '42' } };
    const next = jest.fn();
    validateIdParam()(req, {}, next);
    expect(req.validated.id).toBe(42);
    expect(next).toHaveBeenCalledWith();
  });
  it.each(['0', '-1', '1.5', 'abc', '2147483648'])('rejects %s', (id) => {
    const next = jest.fn();
    validateIdParam()({ params: { id } }, {}, next);
    expect(next.mock.calls[0][0]).toMatchObject({ code: 'INVALID_ID_PARAM', statusCode: 400 });
  });
});
