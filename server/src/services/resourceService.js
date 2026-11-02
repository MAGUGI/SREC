const ResourceModel = require('../models/resourceModel');
const AppError = require('../errors/AppError');
const { RESOURCE_TYPES, MIN_CAPACITY, MAX_CAPACITY, isValidResourceType, isValidCapacity } = require('../domain/resourceType');

const assertType = (type) => {
  if (!isValidResourceType(type)) throw AppError.badRequest(`Tipo de espaço inválido. Use: ${RESOURCE_TYPES.join(', ')}.`, 'INVALID_RESOURCE_TYPE');
};
const assertCapacity = (capacity) => {
  if (!isValidCapacity(capacity)) throw AppError.badRequest(`A capacidade deve ser um número inteiro de ${MIN_CAPACITY} a ${MAX_CAPACITY}.`, 'INVALID_CAPACITY');
};

const ResourceService = {
  async create({ name, type, capacity = 1 }) {
    if (!name || !type) throw AppError.badRequest('Nome e tipo são obrigatórios.', 'RESOURCE_FIELDS_REQUIRED');
    assertType(type);
    assertCapacity(capacity);
    return ResourceModel.create(name, type, capacity);
  },
  async list() { return ResourceModel.findAll(); },
  async getById(id) {
    const resource = await ResourceModel.findById(id);
    if (!resource) throw AppError.notFound('Recurso não encontrado.', 'RESOURCE_NOT_FOUND');
    return resource;
  },
  async update(id, fields) {
    if (!fields || Object.keys(fields).length === 0) throw AppError.badRequest('Informe ao menos um campo para atualizar.', 'EMPTY_UPDATE');
    if (fields.name !== undefined && !String(fields.name).trim()) throw AppError.badRequest('O nome não pode ser vazio.', 'INVALID_NAME');
    if (fields.type !== undefined) assertType(fields.type);
    if (fields.capacity !== undefined) assertCapacity(fields.capacity);
    const resource = await ResourceModel.update(id, fields);
    if (!resource) throw AppError.notFound('Recurso não encontrado.', 'RESOURCE_NOT_FOUND');
    return resource;
  },
  async remove(id) {
    const resource = await ResourceModel.delete(id);
    if (!resource) throw AppError.notFound('Recurso não encontrado.', 'RESOURCE_NOT_FOUND');
    return resource;
  },
};
module.exports = ResourceService;
