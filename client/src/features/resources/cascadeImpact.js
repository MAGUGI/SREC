import { RESERVATION_STATUS } from '../../constants/domain';

/**
 * What deleting a resource takes with it, given the ON DELETE CASCADE on
 * reservations.resource_id. Counts EVERYTHING that will be deleted, not only
 * what is still scheduled.
 */
export function cascadeImpact(reservations, resourceId, { now = new Date() } = {}) {
  const affected = reservations.filter(
    (reservation) => String(reservation.resource_id) === String(resourceId)
  );
  const future = affected.filter(
    (reservation) => new Date(reservation.start_time).getTime() > now.getTime()
  );
  const scheduledFuture = future
    .filter((reservation) => reservation.status === RESERVATION_STATUS.SCHEDULED)
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

  return {
    total: affected.length,
    future: future.length,
    scheduledFuture: scheduledFuture.length,
    past: affected.length - future.length,
    // Names of the next people affected, so the dialog is not just a number.
    upcomingNames: [...new Set(scheduledFuture.map((reservation) => reservation.user_name))].slice(
      0,
      3
    ),
  };
}
