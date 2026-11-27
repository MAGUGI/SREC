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
  it.each([
    ['reservations_no_overlap', '23P01', 409, 'RESERVATION_OVERLAP'],
    ['reservations_time_window_check', '23514', 400, 'END_BEFORE_START'],
    ['reservations_status_check', '23514', 400, 'INVALID_RESERVATION_STATUS'],
    ['resources_type_check', '23514', 400, 'INVALID_RESOURCE_TYPE'],
    ['resources_capacity_check', '23514', 400, 'INVALID_CAPACITY'],
  ])('maps constraint %s → %i %s', (constraint, sqlstate, status, code) => {
    const res = response();
    errorHandler(Object.assign(new Error('pg error'), { code: sqlstate, constraint }), req, res);
    expect(res.status).toHaveBeenCalledWith(status);
    expect(res.json).toHaveBeenCalledWith({ error: expect.any(String), code });
  });
  it('maps CORS ORIGIN_NOT_ALLOWED to 403', () => {
    const res = response();
    errorHandler(Object.assign(new Error('blocked'), { statusCode: 403, code: 'ORIGIN_NOT_ALLOWED' }), req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Origem não autorizada.', code: 'ORIGIN_NOT_ALLOWED' });
  });
});
