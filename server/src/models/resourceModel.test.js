const ResourceModel = require('./resourceModel');
const db = require('../config/database');
jest.mock('../config/database');
describe('ResourceModel.update', () => {
  it('uses COALESCE for omitted fields', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 1 }] });
    await ResourceModel.update(1, { capacity: 4 });
    expect(db.query.mock.calls[0][0]).toContain('COALESCE($1, name)');
    expect(db.query.mock.calls[0][1]).toEqual([null, null, 4, 1]);
  });
});
