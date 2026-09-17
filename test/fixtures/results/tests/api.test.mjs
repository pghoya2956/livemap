// 결과 계약 픽스처: 실제로 통과하는 검사. LIVEMAP_FIXTURE_FAIL=1이면 이 파일의 검사 하나가 실패한다.
import test from 'node:test';
import assert from 'node:assert/strict';

const calls = [];
const request = async (path) => { calls.push(path); return { ok: true }; };
const rpc = async (name) => { calls.push(name); return []; };

test('resorts', async () => { await request('/api/resorts'); await rpc('list_resorts'); assert.deepEqual(calls, ['/api/resorts', 'list_resorts']); });
test('fixture switch', () => { assert.notEqual(process.env.LIVEMAP_FIXTURE_FAIL, '1'); });
