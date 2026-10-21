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

  const removeResource = useCallback((id) => api.deleteResource(id), []);

  return { resources, loading, load, createResource, removeResource };
}
