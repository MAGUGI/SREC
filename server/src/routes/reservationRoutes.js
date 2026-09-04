const express = require('express');
const router = express.Router();
const ReservationController = require('../controllers/reservationController');

router.post('/', ReservationController.createReservation);
router.get('/', ReservationController.getAllReservations);
router.get('/:id', ReservationController.getReservationById);
router.patch('/:id/status', ReservationController.updateReservationStatus);
router.delete('/:id', ReservationController.deleteReservation);

module.exports = router;
