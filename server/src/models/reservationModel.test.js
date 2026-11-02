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

    // Teste de implementação, de propósito: a fonte da regra é `overlaps` em
    // src/domain/timeWindow.js (intervalo semiaberto). Trocar `<` por `<=`
    // aqui faria a reserva das 11h ser recusada porque a das 10h termina às
    // 11h, e a suíte precisa quebrar em vez de a regra mudar em silêncio.
    it('usa comparação estrita, coerente com overlaps do domínio', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      await ReservationModel.checkAvailability(1, '2026-11-10T10:00:00.000Z', '2026-11-10T11:00:00.000Z');

      const [sql, params] = db.query.mock.calls[0];

      expect(sql).toContain('start_time < $3');
      expect(sql).toContain('end_time > $2');
      expect(sql).not.toMatch(/<=|>=/);
      expect(params).toEqual([1, '2026-11-10T10:00:00.000Z', '2026-11-10T11:00:00.000Z', 'cancelled']);
    });

    it('ignora reservas canceladas ao procurar conflito', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      await ReservationModel.checkAvailability(1, '2026-11-10T10:00:00.000Z', '2026-11-10T11:00:00.000Z');

      const [sql] = db.query.mock.calls[0];

      expect(sql).toContain('status <> $4');
    });
  });
});
