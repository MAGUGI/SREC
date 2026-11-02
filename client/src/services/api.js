import { request } from './http';
import { localInputToIso } from '../lib/datetime';

export const api = {
  // Resources
  getResources(options) {
    return request('/resources', options);
  },

  getResource(id, options) {
    return request(`/resources/${id}`, options);
  },

  createResource(data) {
    return request('/resources', { method: 'POST', body: data });
  },

  updateResource(id, data) {
    return request(`/resources/${id}`, { method: 'PUT', body: data });
  },

  deleteResource(id) {
    return request(`/resources/${id}`, { method: 'DELETE' });
  },

  // Reservations
  getReservations(options) {
    return request('/reservations', options);
  },

  createReservation(data) {
    return request('/reservations', {
      method: 'POST',
      body: {
        ...data,
        // BE-07 contract: times always go out as ISO 8601 with offset.
        start_time: localInputToIso(data.start_time),
        end_time: localInputToIso(data.end_time),
      },
    });
  },

  updateReservationStatus(id, status) {
    return request(`/reservations/${id}/status`, { method: 'PATCH', body: { status } });
  },

  deleteReservation(id) {
    return request(`/reservations/${id}`, { method: 'DELETE' });
  },
};
