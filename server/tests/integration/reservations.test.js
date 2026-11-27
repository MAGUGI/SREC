const {
  api,
  pool,
  resetDatabase,
  insertResource,
  insertReservation,
  countReservations,
  statusOf,
  slot,
} = require('../helpers/api');

const reserve = (resourceId, window, userName = 'Ana') =>
  api().post('/api/reservations').send({ resource_id: resourceId, user_name: userName, ...window });

describe('API de reservas', () => {
  let room;

  beforeEach(async () => {
    await resetDatabase();
    room = await insertResource();
  });
  afterAll(() => pool.end());

  describe('POST /api/reservations — janela', () => {
    it('V-01 janela futura válida → 201 com status scheduled', async () => {
      const response = await reserve(room.id, slot('14:00', '15:00'));

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ resource_id: room.id, user_name: 'Ana', status: 'scheduled' });
    });

    it('V-02 sem user_name → 400 sem gravar', async () => {
      const response = await api().post('/api/reservations').send({ resource_id: room.id, ...slot('14:00', '15:00') });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'MISSING_FIELDS' });
      expect(await countReservations()).toBe(0);
    });

    // BUG-02: a reserva invertida era aceita com 201 e nunca colidia com nada.
    it('V-03 end_time antes de start_time → 400 sem gravar (BUG-02)', async () => {
      const response = await reserve(room.id, slot('16:00', '15:00'));

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'END_BEFORE_START' });
      expect(await countReservations()).toBe(0);
    });

    it('V-04 end_time igual a start_time → 400 sem gravar (BUG-02)', async () => {
      const response = await reserve(room.id, slot('15:00', '15:00'));

      expect(response.status).toBe(400);
      expect(await countReservations()).toBe(0);
    });

    // BUG-08: reserva no passado era aceita.
    it('V-05 janela no passado → 400 sem gravar (BUG-08)', async () => {
      const response = await reserve(room.id, slot('14:00', '15:00', '2020-01-10'));

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'START_IN_THE_PAST' });
      expect(await countReservations()).toBe(0);
    });

    // BUG-07: sem offset, o horário era lido no fuso do servidor.
    it('V-29 datetime sem offset → 400 INVALID_DATETIME (BUG-07)', async () => {
      const response = await reserve(room.id, { start_time: '2030-01-10T14:00', end_time: '2030-01-10T15:00' });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'INVALID_DATETIME' });
    });

    it('V-30 devolve o mesmo instante que recebeu, em UTC (BUG-07)', async () => {
      const response = await reserve(room.id, slot('14:00', '15:00'));

      expect(response.status).toBe(201);
      expect(response.body.start_time).toBe('2030-01-10T17:00:00.000Z');
      expect(response.body.end_time).toBe('2030-01-10T18:00:00.000Z');
    });
  });

  describe('POST /api/reservations — sobreposição', () => {
    beforeEach(() => insertReservation({ resourceId: room.id, ...{ start: '2030-01-10T10:00:00-03:00', end: '2030-01-10T11:00:00-03:00' } }));

    // A mesma tabela O-01..O-09 de src/domain/timeWindow.test.js, agora contra
    // o SQL de checkAvailability e o Postgres de verdade.
    it.each([
      ['V-06 parcial à esquerda', '09:30', '10:30', 409],
      ['V-06b parcial à direita', '10:30', '11:30', 409],
      ['V-07 intervalo idêntico', '10:00', '11:00', 409],
      ['V-08 intervalo contido', '10:15', '10:45', 409],
      ['V-08b intervalo contendo', '09:00', '12:00', 409],
      ['V-09 começa quando a anterior termina', '11:00', '12:00', 201],
      ['V-10 termina quando a seguinte começa', '09:00', '10:00', 201],
      ['V-10b antes, disjunto', '08:00', '09:00', 201],
      ['V-10c depois, disjunto', '12:00', '13:00', 201],
    ])('%s (%s → %s) → %s', async (_scenario, start, end, expected) => {
      const response = await reserve(room.id, slot(start, end));

      expect(response.status).toBe(expected);
      if (expected === 409) expect(response.body).toMatchObject({ code: 'RESERVATION_OVERLAP' });
    });

    it('V-11 horário liberado por reserva cancelada → 201', async () => {
      await pool.query("UPDATE reservations SET status = 'cancelled'");

      const response = await reserve(room.id, slot('10:00', '11:00'));

      expect(response.status).toBe(201);
    });

    it('V-11b o mesmo horário em outro espaço não conflita → 201', async () => {
      const other = await insertResource({ name: 'Sala Verde' });

      const response = await reserve(other.id, slot('10:00', '11:00'));

      expect(response.status).toBe(201);
    });

    // BUG-01 (CRÍTICO): checkAvailability e INSERT separados deixavam 5×201.
    it('V-12 20 requisições concorrentes no mesmo slot → exatamente 1×201 e 19×409, zero 5xx (BUG-01)', async () => {
      const responses = await Promise.all(
        Array.from({ length: 20 }, (_, i) => reserve(room.id, slot('14:00', '15:00'), `Pessoa ${i}`)),
      );
      const statuses = responses.map((r) => r.status);

      expect(statuses.filter((s) => s === 201)).toHaveLength(1);
      expect(statuses.filter((s) => s === 409)).toHaveLength(19);
      expect(statuses.filter((s) => s >= 500)).toHaveLength(0);
      expect(Number((await pool.query("SELECT COUNT(*) AS n FROM reservations WHERE start_time = '2030-01-10T14:00:00-03:00'")).rows[0].n)).toBe(1);
    });
  });

  describe('POST /api/reservations — espaço', () => {
    it('V-13 resource_id inexistente → 404 (BUG-04/BE-04)', async () => {
      const response = await reserve(999999, slot('14:00', '15:00'));

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    });

    it('V-14 resource_id não numérico "abc" → 400 (BUG-04)', async () => {
      const response = await reserve('abc', slot('14:00', '15:00'));

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/reservations', () => {
    it('V-15 lista em ordem de start_time → 200', async () => {
      await insertReservation({ resourceId: room.id, userName: 'Tarde', start: '2030-01-10T15:00:00-03:00', end: '2030-01-10T16:00:00-03:00' });
      await insertReservation({ resourceId: room.id, userName: 'Manhã', start: '2030-01-10T09:00:00-03:00', end: '2030-01-10T10:00:00-03:00' });

      const response = await api().get('/api/reservations');

      expect(response.status).toBe(200);
      expect(response.body.map((r) => r.user_name)).toEqual(['Manhã', 'Tarde']);
    });

    it('V-16 id existente → 200', async () => {
      const created = await insertReservation({ resourceId: room.id, start: '2030-01-10T15:00:00-03:00', end: '2030-01-10T16:00:00-03:00' });

      const response = await api().get(`/api/reservations/${created.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: created.id, user_name: 'Ana' });
    });

    it('V-17 id inexistente → 404', async () => {
      const response = await api().get('/api/reservations/999999');

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ code: 'RESERVATION_NOT_FOUND' });
    });

    it('V-18 id não numérico "abc" → 400 (BUG-04)', async () => {
      const response = await api().get('/api/reservations/abc');

      expect(response.status).toBe(400);
    });
  });

  describe('PATCH /api/reservations/:id/status', () => {
    let reservation;

    beforeEach(async () => {
      reservation = await insertReservation({ resourceId: room.id, start: '2030-01-10T15:00:00-03:00', end: '2030-01-10T16:00:00-03:00' });
    });

    const patch = (id, body) => api().patch(`/api/reservations/${id}/status`).send(body);

    it('V-19 scheduled → cancelled → 200', async () => {
      const response = await patch(reservation.id, { status: 'cancelled' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('cancelled');
    });

    it('V-20 scheduled → completed → 200', async () => {
      const response = await patch(reservation.id, { status: 'completed' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('completed');
    });

    // BUG-03: qualquer string era gravada com 200; corpo vazio gravava NULL.
    it.each([
      ['V-21 "banana"', { status: 'banana' }],
      ['V-22 corpo sem status', {}],
      ['V-22b status null', { status: null }],
    ])('%s → 400 e o status no banco não muda (BUG-03)', async (_scenario, body) => {
      const response = await patch(reservation.id, body);

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'INVALID_RESERVATION_STATUS' });
      expect(await statusOf(reservation.id)).toBe('scheduled');
    });

    it.each([
      ['cancelled', 'completed'],
      ['cancelled', 'scheduled'],
      ['completed', 'cancelled'],
      ['completed', 'scheduled'],
      ['scheduled', 'scheduled'],
    ])('V-23 %s → %s → 409 INVALID_STATUS_TRANSITION (BE-03)', async (from, to) => {
      await pool.query('UPDATE reservations SET status = $1 WHERE id = $2', [from, reservation.id]);

      const response = await patch(reservation.id, { status: to });

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ code: 'INVALID_STATUS_TRANSITION' });
      expect(await statusOf(reservation.id)).toBe(from);
    });

    it('V-24 id inexistente → 404', async () => {
      const response = await patch(999999, { status: 'cancelled' });

      expect(response.status).toBe(404);
    });

    it('V-25 id não numérico "abc" → 400 (BUG-04)', async () => {
      const response = await patch('abc', { status: 'cancelled' });

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /api/reservations/:id', () => {
    it('V-26 id existente → 200 e o GET seguinte dá 404', async () => {
      const created = await insertReservation({ resourceId: room.id, start: '2030-01-10T15:00:00-03:00', end: '2030-01-10T16:00:00-03:00' });

      const response = await api().delete(`/api/reservations/${created.id}`);

      expect(response.status).toBe(200);
      expect((await api().get(`/api/reservations/${created.id}`)).status).toBe(404);
    });

    it('V-27 id inexistente → 404', async () => {
      const response = await api().delete('/api/reservations/999999');

      expect(response.status).toBe(404);
    });

    it('V-28 id não numérico "abc" → 400 (BUG-04)', async () => {
      const response = await api().delete('/api/reservations/abc');

      expect(response.status).toBe(400);
    });
  });

  // A última linha de defesa: nenhum caminho de código, nem um psql manual,
  // fura as constraints de BE-01/02/03.
  describe('constraints do banco', () => {
    it('V-31 INSERT direto sobreposto falha com 23P01 (BE-01)', async () => {
      await insertReservation({ resourceId: room.id, start: '2030-01-10T10:00:00-03:00', end: '2030-01-10T11:00:00-03:00' });

      await expect(
        insertReservation({ resourceId: room.id, start: '2030-01-10T10:30:00-03:00', end: '2030-01-10T11:30:00-03:00' }),
      ).rejects.toMatchObject({ code: '23P01' });
    });

    it('V-32 INSERT direto com janela invertida falha com 23514 (BE-02)', async () => {
      await expect(
        insertReservation({ resourceId: room.id, start: '2030-01-10T11:00:00-03:00', end: '2030-01-10T10:00:00-03:00' }),
      ).rejects.toMatchObject({ code: '23514' });
    });

    it('V-33 UPDATE direto com status fora do enum falha com 23514 (BE-03)', async () => {
      const created = await insertReservation({ resourceId: room.id, start: '2030-01-10T10:00:00-03:00', end: '2030-01-10T11:00:00-03:00' });

      await expect(pool.query("UPDATE reservations SET status = 'banana' WHERE id = $1", [created.id])).rejects.toMatchObject({ code: '23514' });
    });
  });
});
