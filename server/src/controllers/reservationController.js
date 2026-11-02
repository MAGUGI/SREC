const ReservationService = require('../services/reservationService');
const asyncHandler = require('../middlewares/asyncHandler');

const ReservationController = {
  createReservation: asyncHandler(async (req, res) => {
    const reservation = await ReservationService.create({
      resourceId: req.body.resource_id,
      userName: req.body.user_name,
      startTime: req.body.start_time,
      endTime: req.body.end_time,
    });
    res.status(201).json(reservation);
  }),
  getAllReservations: asyncHandler(async (req, res) => res.json(await ReservationService.list())),
  getReservationById: asyncHandler(async (req, res) => res.json(await ReservationService.getById(req.validated.id))),
  updateReservationStatus: asyncHandler(async (req, res) => res.json(await ReservationService.changeStatus(req.validated.id, req.body.status))),
  deleteReservation: asyncHandler(async (req, res) => {
    await ReservationService.remove(req.validated.id);
    res.json({ message: 'Reserva excluída com sucesso.' });
  }),
};
module.exports = ReservationController;
