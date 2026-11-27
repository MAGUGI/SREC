const ReservationModel = require('../models/reservationModel');
const ResourceModel = require('../models/resourceModel');
const AppError = require('../errors/AppError');
const { validateReservationWindow } = require('../validators/reservationValidator');
const { parseInstant } = require('../utils/datetime');
const { RESERVATION_STATUSES, isValidStatus, allowedSources } = require('../domain/reservationStatus');

const ReservationService = {
  async create(input) {
    const fields = ['resourceId', 'userName', 'startTime', 'endTime'].filter((field) => input[field] === undefined || input[field] === null || input[field] === '');
    if (fields.length) throw AppError.badRequest('Todos os campos são obrigatórios.', 'MISSING_FIELDS', { fields });
    const resource = await ResourceModel.findById(input.resourceId);
    if (!resource) throw AppError.notFound('O espaço informado não existe.', 'RESOURCE_NOT_FOUND');
    const start = parseInstant(input.startTime, 'start_time');
    const end = parseInstant(input.endTime, 'end_time');
    const window = validateReservationWindow({ start_time: start, end_time: end });
    if (!window.valid) throw AppError.badRequest(window.message, window.code);
    if (!await ReservationModel.checkAvailability(input.resourceId, start, end)) throw AppError.conflict('Já existe uma reserva para este espaço no período selecionado.', 'RESERVATION_OVERLAP');
    try {
      return await ReservationModel.create(input.resourceId, input.userName, start, end);
    } catch (err) {
      if (err.code === '23P01') throw AppError.conflict('Já existe uma reserva para este espaço no período selecionado.', 'RESERVATION_OVERLAP');
      throw err;
    }
  },
  async list() { return ReservationModel.findAll(); },
  async getById(id) {
    const reservation = await ReservationModel.findById(id);
    if (!reservation) throw AppError.notFound('Reserva não encontrada.', 'RESERVATION_NOT_FOUND');
    return reservation;
  },
  async changeStatus(id, status) {
    if (!isValidStatus(status)) throw AppError.badRequest(`Status inválido. Valores aceitos: ${RESERVATION_STATUSES.join(', ')}.`, 'INVALID_RESERVATION_STATUS');
    const updated = await ReservationModel.updateStatus(id, status, allowedSources(status));
    if (updated) return updated;
    const current = await ReservationModel.findById(id);
    if (!current) throw AppError.notFound('Reserva não encontrada.', 'RESERVATION_NOT_FOUND');
    throw AppError.conflict(`Não é possível mudar o status de "${current.status}" para "${status}".`, 'INVALID_STATUS_TRANSITION');
  },
  async remove(id) {
    const reservation = await ReservationModel.delete(id);
    if (!reservation) throw AppError.notFound('Reserva não encontrada.', 'RESERVATION_NOT_FOUND');
    return reservation;
  },
};
module.exports = ReservationService;
