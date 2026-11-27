// Regra central do SREC em forma executável: duas reservas do mesmo espaço
// não podem se sobrepor no tempo.
//
// A mesma regra vive em dois outros lugares, com papéis diferentes:
// * `ReservationModel.checkAvailability` (`start_time < $3 AND end_time > $2`)
//   dá a resposta 409 no caminho sequencial;
// * a constraint `reservations_no_overlap` (`tstzrange(...) WITH &&`) é a
//   garantia sob concorrência (BUG-01).
// Esta função é a especificação das duas, testável sem banco. Se a semântica
// mudar aqui, tem de mudar lá também, e `reservationModel.test.js` trava isso.

const toInstant = (value) => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * Intervalos semiabertos [start, end): dois intervalos que apenas se encostam
 * NÃO se sobrepõem. Data inutilizável em qualquer lado devolve false, nunca
 * lança. Quem garante que a janela é válida antes é `validateReservationWindow`.
 */
const overlaps = (a = {}, b = {}) => {
  const aStart = toInstant(a.start_time);
  const aEnd = toInstant(a.end_time);
  const bStart = toInstant(b.start_time);
  const bEnd = toInstant(b.end_time);

  if (!aStart || !aEnd || !bStart || !bEnd) {
    return false;
  }
  return aStart.getTime() < bEnd.getTime() && aEnd.getTime() > bStart.getTime();
};

module.exports = { overlaps };
