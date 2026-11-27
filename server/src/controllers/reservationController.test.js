const ReservationController = require('./reservationController');
const ReservationService = require('../services/reservationService');
jest.mock('../services/reservationService');

const makeRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });

describe('ReservationController', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a reservation and returns 201', async () => {
    const created = { id: 1, resource_id: 2, user_name: 'Ana' };
    ReservationService.create.mockResolvedValue(created);
    const res = makeRes();
    const req = {
      body: {
        resource_id: 2,
        user_name: 'Ana',
        start_time: '2030-10-23T14:00:00-03:00',
        end_time: '2030-10-23T15:00:00-03:00',
      },
    };

    await ReservationController.createReservation(req, res, jest.fn());
    expect(ReservationService.create).toHaveBeenCalledWith({
      resourceId: 2,
      userName: 'Ana',
      startTime: '2030-10-23T14:00:00-03:00',
      endTime: '2030-10-23T15:00:00-03:00',
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(created);
  });

  it('lists all reservations', async () => {
    ReservationService.list.mockResolvedValue([{ id: 1 }]);
    const res = makeRes();
    await ReservationController.getAllReservations({}, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }]);
  });

  it('gets a reservation by validated id', async () => {
    ReservationService.getById.mockResolvedValue({ id: 7 });
    const res = makeRes();
    await ReservationController.getReservationById({ validated: { id: 7 } }, res, jest.fn());
    expect(ReservationService.getById).toHaveBeenCalledWith(7);
    expect(res.json).toHaveBeenCalledWith({ id: 7 });
  });

  it('updates reservation status', async () => {
    ReservationService.changeStatus.mockResolvedValue({ id: 7, status: 'completed' });
    const res = makeRes();
    await ReservationController.updateReservationStatus({ validated: { id: 7 }, body: { status: 'completed' } }, res, jest.fn());
    expect(ReservationService.changeStatus).toHaveBeenCalledWith(7, 'completed');
    expect(res.json).toHaveBeenCalledWith({ id: 7, status: 'completed' });
  });

  it('deletes a reservation and returns confirmation message', async () => {
    ReservationService.remove.mockResolvedValue({ id: 7 });
    const res = makeRes();
    await ReservationController.deleteReservation({ validated: { id: 7 } }, res, jest.fn());
    expect(ReservationService.remove).toHaveBeenCalledWith(7);
    expect(res.json).toHaveBeenCalledWith({ message: 'Reserva excluída com sucesso.' });
  });

  it('forwards TypeError to next when req.body is undefined (N2-QA-01)', async () => {
    const next = jest.fn();
    await ReservationController.createReservation({ body: undefined }, makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(TypeError));
  });
});
