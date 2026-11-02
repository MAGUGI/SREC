const errorHandler = require('./errorHandler');
const AppError = require('../errors/AppError');
const logger = require('../utils/logger');
jest.mock('../utils/logger');
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
const req = { method: 'GET', originalUrl: '/test' };
// Formato do erro que o express.json() (body-parser) entrega ao errorHandler:
// status/statusCode e type, mas nenhum `code`.
const bodyParserError = (type, status, message) => Object.assign(new Error(message), { type, status, statusCode: status, expose: true });
describe('errorHandler', () => {
  beforeEach(() => jest.clearAllMocks());
  it('serializes AppError', () => {
    const res = response();
    errorHandler(AppError.notFound('Não encontrado.', 'NOT_FOUND'), req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Não encontrado.', code: 'NOT_FOUND' });
  });
  it('does not leak unknown errors', () => {
    const res = response();
    errorHandler(new Error('secret database path'), req, res);
    expect(res.json).toHaveBeenCalledWith({ error: 'Erro interno do servidor.', code: 'INTERNAL_ERROR' });
  });
  it.each([
    ['JSON malformado', 'entity.parse.failed', 400, 'INVALID_JSON'],
    ['corpo acima do limite', 'entity.too.large', 413, 'PAYLOAD_TOO_LARGE'],
  ])('%s (%s) → %i %s, logado sem stack', (_scenario, type, status, code) => {
    const res = response();
    errorHandler(bodyParserError(type, status, 'detalhe do parser'), req, res);
    expect(res.status).toHaveBeenCalledWith(status);
    expect(res.json).toHaveBeenCalledWith({ error: expect.any(String), code });
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ statusCode: status, code, stack: undefined }));
  });
});
