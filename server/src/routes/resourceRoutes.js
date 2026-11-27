const express = require('express');
const router = express.Router();
const ResourceController = require('../controllers/resourceController');
const validateIdParam = require('../middlewares/validateIdParam');

router.post('/', ResourceController.createResource);
router.get('/', ResourceController.getAllResources);
router.get('/:id', validateIdParam(), ResourceController.getResourceById);
router.put('/:id', validateIdParam(), ResourceController.updateResource);
router.delete('/:id', validateIdParam(), ResourceController.deleteResource);

module.exports = router;
