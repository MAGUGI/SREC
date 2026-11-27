const AppError = require('../errors/AppError');
const validateIdParam = (paramName = 'id') => (req, res, next) => {
  const value = req.params[paramName];
  if (!/^[1-9]\d*$/.test(value) || Number(value) > 2147483647) {
    return next(AppError.badRequest('O identificador deve ser um inteiro positivo.', 'INVALID_ID_PARAM'));
  }
  req.validated = { ...(req.validated || {}), [paramName]: Number(value) };
  return next();
};
module.exports = validateIdParam;
