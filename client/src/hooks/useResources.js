import { useCallback, useState } from 'react';
import { api } from '../services/api';

export function useResources() {
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setResources(await api.getResources());
    } finally {
      setLoading(false);
    }
  }, []);

  const createResource = useCallback(
    (payload) =>
      api.createResource({
        name: payload.name,
        type: payload.type,
        capacity: Number(payload.capacity),
      }),
    []
  );

  // Always the three fields: a full PUT works whether or not the backend
  // accepts partial bodies (BUG-05 / BE-05).
  const updateResource = useCallback(
    (id, payload) =>
      api.updateResource(id, {
        name: payload.name,
        type: payload.type,
        capacity: Number(payload.capacity),
      }),
    []
  );

  const removeResource = useCallback((id) => api.deleteResource(id), []);

  // Fresh reservation list for the cascade warning: the delete dialog must not
  // count from a list loaded minutes ago (FE-05, BUG-06).
  const fetchReservations = useCallback(() => api.getReservations(), []);

  return {
    resources,
    loading,
    load,
    createResource,
    updateResource,
    removeResource,
    fetchReservations,
  };
}
