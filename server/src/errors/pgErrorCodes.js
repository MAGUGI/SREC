const SQLSTATE_TO_HTTP = Object.freeze({
  '22P02': { statusCode: 400, code: 'INVALID_IDENTIFIER', message: 'Parâmetro em formato inválido.' },
  '23502': { statusCode: 400, code: 'MISSING_REQUIRED_FIELD', message: 'Um campo obrigatório não foi informado.' },
  '23503': { statusCode: 409, code: 'RELATED_RESOURCE_NOT_FOUND', message: 'O espaço informado não existe.' },
  '23514': { statusCode: 409, code: 'CONSTRAINT_VIOLATION', message: 'A operação viola uma regra de integridade dos dados.' },
  '23P01': { statusCode: 409, code: 'RESERVATION_OVERLAP', message: 'Já existe uma reserva para este espaço no período selecionado.' },
});
const CONSTRAINT_OVERRIDES = Object.freeze({
  reservations_no_overlap: SQLSTATE_TO_HTTP['23P01'],
  reservations_time_window_check: { statusCode: 400, code: 'END_BEFORE_START', message: 'O término da reserva deve ser posterior ao início.' },
  reservations_status_check: { statusCode: 400, code: 'INVALID_RESERVATION_STATUS', message: 'Status de reserva inválido.' },
  resources_type_check: { statusCode: 400, code: 'INVALID_RESOURCE_TYPE', message: 'Tipo de espaço inválido.' },
  resources_capacity_check: { statusCode: 400, code: 'INVALID_CAPACITY', message: 'A capacidade deve ser um número inteiro de 1 a 100.' },
});
module.exports = { SQLSTATE_TO_HTTP, CONSTRAINT_OVERRIDES };
