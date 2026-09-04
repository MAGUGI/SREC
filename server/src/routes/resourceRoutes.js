const express = require('express');
const router = express.Router();
const ResourceController = require('../controllers/resourceController');

router.post('/', ResourceController.createResource);
router.get('/', ResourceController.getAllResources);
router.get('/:id', ResourceController.getResourceById);
router.put('/:id', ResourceController.updateResource);
router.delete('/:id', ResourceController.deleteResource);

module.exports = router;
