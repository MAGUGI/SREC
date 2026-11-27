const AppError = require('../errors/AppError');
const logger = require('../utils/logger');
const { SQLSTATE_TO_HTTP, CONSTRAINT_OVERRIDES } = require('../errors/pgErrorCodes');
const GENERIC_ERROR = Object.freeze({ statusCode: 500, code: 'INTERNAL_ERROR', message: 'Erro interno do servidor.' });
// O express.json() (body-parser) sinaliza o erro em `type` e não traz `code`.
const BODY_PARSER_ERRORS = new Map([
  ['entity.parse.failed', { statusCode: 400, code: 'INVALID_JSON', message: 'O corpo da requisição não é um JSON válido.' }],
  ['entity.too.large', { statusCode: 413, code: 'PAYLOAD_TOO_LARGE', message: 'O corpo da requisição excede o tamanho máximo permitido.' }],
]);
const translateBodyParserError = (err) => BODY_PARSER_ERRORS.get(err?.type);

const translate = (err) => {
  if (err instanceof AppError) return { statusCode: err.statusCode, code: err.code, message: err.message, details: err.details };
  if (err && err.statusCode && err.code && !err.sqlState) return {
    statusCode: err.statusCode,
    code: err.code,
    message: err.code === 'ORIGIN_NOT_ALLOWED' ? 'Origem não autorizada.' : 'Requisição rejeitada.',
  };
  if (err && CONSTRAINT_OVERRIDES[err.constraint]) return CONSTRAINT_OVERRIDES[err.constraint];
  if (err && SQLSTATE_TO_HTTP[err.code]) return SQLSTATE_TO_HTTP[err.code];
  return GENERIC_ERROR;
};

const errorHandler = (err, req, res, _next) => {
  const translated = translateBodyParserError(err) ?? translate(err);
  logger.error({
    method: req.method, path: req.originalUrl, statusCode: translated.statusCode,
    code: translated.code, sqlstate: err && err.code, constraint: err && err.constraint,
    reason: err && err.message, stack: translated.statusCode >= 500 && err ? err.stack : undefined,
  });
  const body = { error: translated.message, code: translated.code };
  if (translated.details) body.details = translated.details;
  return res.status(translated.statusCode).json(body);
};
module.exports = errorHandler;
