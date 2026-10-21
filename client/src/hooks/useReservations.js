import { useCallback, useState } from 'react';
import { api } from '../services/api';

export function useReservations() {
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReservations(await api.getReservations());
    } finally {
      setLoading(false);
    }
  }, []);

  const createReservation = useCallback((payload) => api.createReservation(payload), []);

  const changeStatus = useCallback((id, status) => api.updateReservationStatus(id, status), []);

  const removeReservation = useCallback((id) => api.deleteReservation(id), []);

  return {
    reservations,
    loading,
    load,
    createReservation,
    changeStatus,
    removeReservation,
  };
}
