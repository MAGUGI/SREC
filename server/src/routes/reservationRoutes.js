const express = require('express');
const router = express.Router();
const ReservationController = require('../controllers/reservationController');
const validateIdParam = require('../middlewares/validateIdParam');

router.post('/', ReservationController.createReservation);
router.get('/', ReservationController.getAllReservations);
router.get('/:id', validateIdParam(), ReservationController.getReservationById);
router.patch('/:id/status', validateIdParam(), ReservationController.updateReservationStatus);
router.delete('/:id', validateIdParam(), ReservationController.deleteReservation);

module.exports = router;
