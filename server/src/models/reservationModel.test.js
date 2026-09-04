const ReservationModel = require('./reservationModel');
const db = require('../config/database');

jest.mock('../config/database');

describe('ReservationModel', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkAvailability', () => {
    it('should return true if no overlapping reservations exist', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const isAvailable = await ReservationModel.checkAvailability(
        1,
        '2024-10-10 10:00:00',
        '2024-10-10 11:00:00',
      );

      expect(isAvailable).toBe(true);
      expect(db.query).toHaveBeenCalledTimes(1);
    });

    it('should return false if overlapping reservations exist', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const isAvailable = await ReservationModel.checkAvailability(
        1,
        '2024-10-10 10:30:00',
        '2024-10-10 11:30:00',
      );

      expect(isAvailable).toBe(false);
      expect(db.query).toHaveBeenCalledTimes(1);
    });
  });
});
