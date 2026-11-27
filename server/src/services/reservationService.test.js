const ReservationService = require('./reservationService');
const ReservationModel = require('../models/reservationModel');
const ResourceModel = require('../models/resourceModel');
jest.mock('../models/reservationModel');
jest.mock('../models/resourceModel');

const input = { resourceId: 1, userName: 'Ana', startTime: '2030-10-23T14:00:00-03:00', endTime: '2030-10-23T15:00:00-03:00' };
describe('ReservationService', () => {
  beforeEach(() => jest.clearAllMocks());
  it('creates a reservation for an available resource', async () => {
    ResourceModel.findById.mockResolvedValue({ id: 1 });
    ReservationModel.checkAvailability.mockResolvedValue(true);
    ReservationModel.create.mockResolvedValue({ id: 10 });
    await expect(ReservationService.create(input)).resolves.toEqual({ id: 10 });
    expect(ReservationModel.create).toHaveBeenCalledWith(1, 'Ana', expect.any(Date), expect.any(Date));
  });
  it('rejects an occupied slot', async () => {
    ResourceModel.findById.mockResolvedValue({ id: 1 });
    ReservationModel.checkAvailability.mockResolvedValue(false);
    await expect(ReservationService.create(input)).rejects.toMatchObject({ code: 'RESERVATION_OVERLAP', statusCode: 409 });
  });
  it('rejects a missing resource', async () => {
    ResourceModel.findById.mockResolvedValue(undefined);
    await expect(ReservationService.create(input)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
  });
  it('rejects an offsetless datetime', async () => {
    ResourceModel.findById.mockResolvedValue({ id: 1 });
    await expect(ReservationService.create({ ...input, startTime: '2030-10-23T14:00' })).rejects.toMatchObject({ code: 'INVALID_DATETIME' });
  });
  it('rejects missing required fields with details', async () => {
    await expect(ReservationService.create({ resourceId: 1, userName: '' })).rejects.toMatchObject({
      code: 'MISSING_FIELDS',
      statusCode: 400,
      details: { fields: ['userName', 'startTime', 'endTime'] },
    });
  });
  it('rejects end_time before start_time (BE-02)', async () => {
    ResourceModel.findById.mockResolvedValue({ id: 1 });
    await expect(
      ReservationService.create({ ...input, startTime: '2030-10-23T16:00:00-03:00', endTime: '2030-10-23T15:00:00-03:00' })
    ).rejects.toMatchObject({ code: 'END_BEFORE_START', statusCode: 400 });
  });
  it('translates concurrent 23P01 exclusion violation into 409 RESERVATION_OVERLAP (BE-01)', async () => {
    ResourceModel.findById.mockResolvedValue({ id: 1 });
    ReservationModel.checkAvailability.mockResolvedValue(true);
    ReservationModel.create.mockRejectedValue(Object.assign(new Error('overlap'), { code: '23P01' }));
    await expect(ReservationService.create(input)).rejects.toMatchObject({ code: 'RESERVATION_OVERLAP', statusCode: 409 });
  });
  it('rethrows unexpected database errors on create', async () => {
    ResourceModel.findById.mockResolvedValue({ id: 1 });
    ReservationModel.checkAvailability.mockResolvedValue(true);
    ReservationModel.create.mockRejectedValue(new Error('db down'));
    await expect(ReservationService.create(input)).rejects.toThrow('db down');
  });
  it('lists all reservations', async () => {
    ReservationModel.findAll.mockResolvedValue([{ id: 1 }]);
    await expect(ReservationService.list()).resolves.toEqual([{ id: 1 }]);
  });
  it('gets reservation by id or throws 404', async () => {
    ReservationModel.findById.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce(undefined);
    await expect(ReservationService.getById(1)).resolves.toEqual({ id: 1 });
    await expect(ReservationService.getById(99)).rejects.toMatchObject({ code: 'RESERVATION_NOT_FOUND', statusCode: 404 });
  });
  it('validates status value and transitions in changeStatus (BE-03)', async () => {
    await expect(ReservationService.changeStatus(1, 'invalid')).rejects.toMatchObject({
      code: 'INVALID_RESERVATION_STATUS',
      statusCode: 400,
    });

    ReservationModel.updateStatus.mockResolvedValueOnce({ id: 1, status: 'completed' });
    await expect(ReservationService.changeStatus(1, 'completed')).resolves.toEqual({ id: 1, status: 'completed' });

    ReservationModel.updateStatus.mockResolvedValueOnce(undefined);
    ReservationModel.findById.mockResolvedValueOnce(undefined);
    await expect(ReservationService.changeStatus(99, 'cancelled')).rejects.toMatchObject({
      code: 'RESERVATION_NOT_FOUND',
      statusCode: 404,
    });

    ReservationModel.updateStatus.mockResolvedValueOnce(undefined);
    ReservationModel.findById.mockResolvedValueOnce({ id: 1, status: 'completed' });
    await expect(ReservationService.changeStatus(1, 'cancelled')).rejects.toMatchObject({
      code: 'INVALID_STATUS_TRANSITION',
      statusCode: 409,
    });
  });
  it('removes reservation or throws 404', async () => {
    ReservationModel.delete.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce(undefined);
    await expect(ReservationService.remove(1)).resolves.toEqual({ id: 1 });
    await expect(ReservationService.remove(99)).rejects.toMatchObject({ code: 'RESERVATION_NOT_FOUND', statusCode: 404 });
  });
});
