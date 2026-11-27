const ResourceService = require('./resourceService');
const ResourceModel = require('../models/resourceModel');
jest.mock('../models/resourceModel');
describe('ResourceService', () => {
  beforeEach(() => jest.clearAllMocks());
  it('rejects an empty update', async () => {
    await expect(ResourceService.update(1, {})).rejects.toMatchObject({ code: 'EMPTY_UPDATE', statusCode: 400 });
  });
  it('updates only supplied fields', async () => {
    ResourceModel.update.mockResolvedValue({ id: 1, capacity: 4 });
    await expect(ResourceService.update(1, { capacity: 4 })).resolves.toEqual({ id: 1, capacity: 4 });
  });
  it.each([
    ['tipo fora do enum (BUG-10)', { name: 'Sofá', type: 'sofa' }, 'INVALID_RESOURCE_TYPE'],
    ['capacidade zero (BUG-09)', { name: 'Mesa', type: 'workstation', capacity: 0 }, 'INVALID_CAPACITY'],
    ['capacidade negativa (BUG-09)', { name: 'Mesa', type: 'workstation', capacity: -5 }, 'INVALID_CAPACITY'],
    ['capacidade fracionária', { name: 'Mesa', type: 'workstation', capacity: 2.5 }, 'INVALID_CAPACITY'],
    ['capacidade não numérica', { name: 'Mesa', type: 'workstation', capacity: 'abc' }, 'INVALID_CAPACITY'],
    ['capacidade acima do máximo', { name: 'Mesa', type: 'workstation', capacity: 101 }, 'INVALID_CAPACITY'],
  ])('create recusa %s sem chamar o model', async (_scenario, body, code) => {
    await expect(ResourceService.create(body)).rejects.toMatchObject({ code, statusCode: 400 });
    expect(ResourceModel.create).not.toHaveBeenCalled();
  });
  it('create assume capacidade 1 quando ela é omitida', async () => {
    ResourceModel.create.mockResolvedValue({ id: 1 });
    await ResourceService.create({ name: 'Mesa', type: 'workstation' });
    expect(ResourceModel.create).toHaveBeenCalledWith('Mesa', 'workstation', 1);
  });
  it.each([
    ['tipo fora do enum (BUG-10)', { type: 'sofa' }, 'INVALID_RESOURCE_TYPE'],
    ['capacidade zero (BUG-09)', { capacity: 0 }, 'INVALID_CAPACITY'],
    ['capacidade negativa (BUG-09)', { capacity: -5 }, 'INVALID_CAPACITY'],
    ['capacidade não numérica', { capacity: 'abc' }, 'INVALID_CAPACITY'],
  ])('update recusa %s sem chamar o model', async (_scenario, fields, code) => {
    await expect(ResourceService.update(1, fields)).rejects.toMatchObject({ code, statusCode: 400 });
    expect(ResourceModel.update).not.toHaveBeenCalled();
  });
  it('returns a not found error', async () => {
    ResourceModel.findById.mockResolvedValue(undefined);
    await expect(ResourceService.getById(1)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
  });
});
