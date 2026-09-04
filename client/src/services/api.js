const API_BASE_URL = 'http://localhost:5000/api';

export const api = {
  // Resources
  async getResources() {
    const res = await fetch(`${API_BASE_URL}/resources`);
    if (!res.ok) throw new Error('Falha ao carregar recursos');
    return res.json();
  },

  async createResource(data) {
    const res = await fetch(`${API_BASE_URL}/resources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erro ao criar recurso');
    }
    return res.json();
  },

  async updateResource(id, data) {
    const res = await fetch(`${API_BASE_URL}/resources/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erro ao atualizar recurso');
    }
    return res.json();
  },

  async deleteResource(id) {
    const res = await fetch(`${API_BASE_URL}/resources/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Erro ao deletar recurso');
    return res.json();
  },

  // Reservations
  async getReservations() {
    const res = await fetch(`${API_BASE_URL}/reservations`);
    if (!res.ok) throw new Error('Falha ao carregar reservas');
    return res.json();
  },

  async createReservation(data) {
    const res = await fetch(`${API_BASE_URL}/reservations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erro ao criar reserva');
    }
    return res.json();
  },

  async updateReservationStatus(id, status) {
    const res = await fetch(`${API_BASE_URL}/reservations/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error('Erro ao atualizar status');
    return res.json();
  },

  async deleteReservation(id) {
    const res = await fetch(`${API_BASE_URL}/reservations/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Erro ao cancelar reserva');
    return res.json();
  },
};
