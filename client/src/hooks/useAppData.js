import { useCallback, useEffect } from 'react';
import { useResources } from './useResources';
import { useReservations } from './useReservations';

export function useAppData(showFeedback) {
  const {
    resources,
    loading: loadingResources,
    load: loadResources,
    ...resourceActions
  } = useResources();
  const {
    reservations,
    loading: loadingReservations,
    load: loadReservations,
    ...reservationActions
  } = useReservations();

  // CS-08 preserved on purpose: every mutation still reloads both lists.
  const reloadAll = useCallback(async () => {
    try {
      await Promise.all([loadResources(), loadReservations()]);
    } catch (err) {
      showFeedback(err.message, 'error');
    }
  }, [loadResources, loadReservations, showFeedback]);

  // TODO(FE-04): this suppression is CS-12 and is removed there.
  useEffect(() => {
    reloadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    resources,
    reservations,
    loading: loadingResources || loadingReservations,
    resourceActions,
    reservationActions,
    reloadAll,
  };
}
