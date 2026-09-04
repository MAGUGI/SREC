const ResourceModel = require('../models/resourceModel');

const ResourceController = {
  async createResource(req, res) {
    try {
      const { name, type, capacity } = req.body;
      if (!name || !type) {
        return res.status(400).json({ error: 'Name and type are required' });
      }
      const newResource = await ResourceModel.create(name, type, capacity || 1);
      res.status(201).json(newResource);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async getAllResources(req, res) {
    try {
      const resources = await ResourceModel.findAll();
      res.json(resources);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async getResourceById(req, res) {
    try {
      const { id } = req.params;
      const resource = await ResourceModel.findById(id);
      if (!resource) {
        return res.status(404).json({ error: 'Resource not found' });
      }
      res.json(resource);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async updateResource(req, res) {
    try {
      const { id } = req.params;
      const { name, type, capacity } = req.body;
      const updatedResource = await ResourceModel.update(id, name, type, capacity);
      if (!updatedResource) {
        return res.status(404).json({ error: 'Resource not found' });
      }
      res.json(updatedResource);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async deleteResource(req, res) {
    try {
      const { id } = req.params;
      const deletedResource = await ResourceModel.delete(id);
      if (!deletedResource) {
        return res.status(404).json({ error: 'Resource not found' });
      }
      res.json({ message: 'Resource deleted successfully' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
};

module.exports = ResourceController;
