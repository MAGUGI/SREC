const ReservationModel = require('../models/reservationModel');

const ReservationController = {
  async createReservation(req, res) {
    try {
      const { resource_id, user_name, start_time, end_time } = req.body;
      if (!resource_id || !user_name || !start_time || !end_time) {
        return res.status(400).json({ error: 'All fields are required' });
      }

      // Check availability
      const isAvailable = await ReservationModel.checkAvailability(
        resource_id,
        start_time,
        end_time,
      );
      if (!isAvailable) {
        return res
          .status(409)
          .json({ error: 'Resource is not available for the selected time slot' });
      }

      const newReservation = await ReservationModel.create(
        resource_id,
        user_name,
        start_time,
        end_time,
      );
      res.status(201).json(newReservation);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async getAllReservations(req, res) {
    try {
      const reservations = await ReservationModel.findAll();
      res.json(reservations);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async getReservationById(req, res) {
    try {
      const { id } = req.params;
      const reservation = await ReservationModel.findById(id);
      if (!reservation) {
        return res.status(404).json({ error: 'Reservation not found' });
      }
      res.json(reservation);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async updateReservationStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const updatedReservation = await ReservationModel.updateStatus(id, status);
      if (!updatedReservation) {
        return res.status(404).json({ error: 'Reservation not found' });
      }
      res.json(updatedReservation);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async deleteReservation(req, res) {
    try {
      const { id } = req.params;
      const deletedReservation = await ReservationModel.delete(id);
      if (!deletedReservation) {
        return res.status(404).json({ error: 'Reservation not found' });
      }
      res.json({ message: 'Reservation deleted successfully' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
};

module.exports = ReservationController;
