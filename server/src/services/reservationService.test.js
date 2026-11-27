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
});
