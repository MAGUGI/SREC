class AppError extends Error {
  constructor(message, { statusCode = 500, code = 'INTERNAL_ERROR', details } = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, AppError);
  }
  static badRequest(message, code = 'BAD_REQUEST', details) { return new AppError(message, { statusCode: 400, code, details }); }
  static notFound(message, code = 'NOT_FOUND') { return new AppError(message, { statusCode: 404, code }); }
  static conflict(message, code = 'CONFLICT') { return new AppError(message, { statusCode: 409, code }); }
}
module.exports = AppError;
