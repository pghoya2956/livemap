import test from 'node:test';
test('resorts', async () => { await request('/api/resorts'); await rpc('list_resorts'); });
