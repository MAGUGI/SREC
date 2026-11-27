const AppError = require('../errors/AppError');
const ISO_8601_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;

function parseInstant(value, field) {
  if (typeof value !== 'string' || !ISO_8601_WITH_OFFSET.test(value.trim())) {
    throw AppError.badRequest(`O campo "${field}" deve estar em ISO 8601 com offset, por exemplo 2026-10-23T14:00:00-03:00.`, 'INVALID_DATETIME', { field, received: value });
  }
  const instant = new Date(value.trim());
  if (Number.isNaN(instant.getTime())) {
    throw AppError.badRequest(`O campo "${field}" não é uma data válida.`, 'INVALID_DATETIME', { field, received: value });
  }
  return instant;
}
module.exports = { parseInstant, ISO_8601_WITH_OFFSET };
