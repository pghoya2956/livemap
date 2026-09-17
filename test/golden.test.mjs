// 1.0.1 호환 검사: 픽스처 mini를 git 밖 임시 폴더에서 build한 세 생성물이 1.0.1 골든(test/fixtures/golden-1.0.1, generatedAt 제거)의 모든 경로·값을 포함하는지 본다.
// 새 필드 추가는 허용하고 제거·이름 변경·값 변경은 실패다. graph.json 배열은 노드 kind:id, 엣지 from·kind·to로 짝짓고 나머지 배열은 위치로 짝짓는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../src/cli.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN = join(HERE, 'fixtures', 'golden-1.0.1');
const made = [];
test.after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

const keyOf = (path, x) => (path === 'nodes' ? `${x.kind}:${x.id}` : path === 'edges' ? `${x.from}·${x.kind}·${x.to}` : null);
// a의 모든 경로·값이 c에 있는지. 빠진 경로 목록을 돌려준다
function missing(a, c, path = '') {
  if (Array.isArray(a)) {
    if (!Array.isArray(c)) return [`${path}: 배열 아님`];
    if (path === 'nodes' || path === 'edges') {
      const byKey = new Map(c.map((x) => [keyOf(path, x), x]));
      return a.flatMap((x) => { const k = keyOf(path, x); return byKey.has(k) ? missing(x, byKey.get(k), `${path}[${k}]`) : [`${path}[${k}]: 없음`]; });
    }
    return a.flatMap((x, i) => (i < c.length ? missing(x, c[i], `${path}[${i}]`) : [`${path}[${i}]: 없음`]));
  }
  if (a && typeof a === 'object') {
    if (!c || typeof c !== 'object' || Array.isArray(c)) return [`${path}: 객체 아님`];
    return Object.entries(a).flatMap(([k, v]) => (k in c ? missing(v, c[k], path ? `${path}.${k}` : k) : [`${path ? `${path}.` : ''}${k}: 없음`]));
  }
  return Object.is(a, c) ? [] : [`${path}: ${JSON.stringify(a)} → ${JSON.stringify(c)}`];
}

test('포함 대조 함수: 제거·값 변경·짝 없는 노드는 잡고, 필드 추가·노드 순서 변경은 통과', () => {
  const a = { x: 1, list: [{ y: 2 }], nodes: [{ kind: 'k', id: '1', props: { p: 1 } }, { kind: 'k', id: '2', props: {} }], edges: [{ from: 'a', kind: 'e', to: 'b' }] };
  assert.deepEqual(missing(a, { ...a, extra: true, nodes: [a.nodes[1], { ...a.nodes[0], props: { p: 1, q: 2 } }] }), []);
  assert.deepEqual(missing(a, { list: [{ y: 3 }], nodes: [a.nodes[0]], edges: [] }), ['x: 없음', 'list[0].y: 2 → 3', 'nodes[k:2]: 없음', 'edges[a·e·b]: 없음']);
});

test('골든 1.0.1: graph·data·overview의 모든 경로·값이 1.1.0 생성물에 있다', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'livemap 골든 검사-'));
  made.push(dir);
  cpSync(join(HERE, 'fixtures', 'mini'), join(dir, 'mini'), { recursive: true });
  await build(join(dir, 'mini'), join(dir, 'out'));
  for (const f of ['graph.json', 'data.json', 'overview.json']) {
    const golden = readJson(join(GOLDEN, f));
    assert.equal('generatedAt' in golden, false, `${f} 골든에 generatedAt이 남음`);
    assert.deepEqual(missing(golden, readJson(join(dir, 'out', f))), [], f);
  }
});
