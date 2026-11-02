const ResourceService = require('../services/resourceService');
const asyncHandler = require('../middlewares/asyncHandler');

const ResourceController = {
  createResource: asyncHandler(async (req, res) => {
    res.status(201).json(await ResourceService.create(req.body));
  }),
  getAllResources: asyncHandler(async (req, res) => res.json(await ResourceService.list())),
  getResourceById: asyncHandler(async (req, res) => res.json(await ResourceService.getById(req.validated.id))),
  updateResource: asyncHandler(async (req, res) => res.json(await ResourceService.update(req.validated.id, req.body))),
  deleteResource: asyncHandler(async (req, res) => {
    await ResourceService.remove(req.validated.id);
    res.json({ message: 'Recurso excluído com sucesso.' });
  }),
};
module.exports = ResourceController;
