const ResourceController = require('./resourceController');
const ResourceService = require('../services/resourceService');
jest.mock('../services/resourceService');
describe('resource controller', () => {
  it('delegates creation and returns 201', async () => {
    ResourceService.create.mockResolvedValue({ id: 1 });
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await ResourceController.createResource({ body: { name: 'Sala', type: 'meeting_room' } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
