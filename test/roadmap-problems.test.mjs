// 로드맵 problem 두 문장(1.3.0): 선행 순환과 마일스톤 순서 역행. derive가 roadmap[].problems에 싣고 check는 경고(warn)로 낸다.
// 문장 틀은 Phase 0이 굳힌 계약이다 — `선행 순환: {id} → {id} → …`, `마일스톤 순서 역행: {선행 id}({마일스톤}) → {항목 id}({마일스톤})`.
// 판정 규칙은 화면 ui/lib/tree.js와 같다: 순환은 자기에게 되돌아오는 선행, 역행은 선행이 더 오른쪽 열(마일스톤 파일 순서, 미배정은 맨 오른쪽)에 있는 경우.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGraph } from '../src/cli.mjs';
import { checkProblems } from '../src/check.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const made = [];
test.after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

// mini를 임시 폴더로 복사하고 tasks/roadmap.md만 갈아 끼워 빌드한다
async function build({ fixture, text }) {
  const dir = mkdtempSync(join(tmpdir(), 'livemap 로드맵 문제-'));
  made.push(dir);
  cpSync(join(HERE, 'fixtures', 'mini'), dir, { recursive: true });
  if (fixture) copyFileSync(join(HERE, 'fixtures', 'roadmap', `${fixture}.md`), join(dir, 'tasks/roadmap.md'));
  else writeFileSync(join(dir, 'tasks/roadmap.md'), text);
  return buildGraph(dir);
}
const NEW = /^(선행 순환|마일스톤 순서 역행)/;
const newProblems = (data) => Object.fromEntries(data.roadmap.map((m) => [m.id, m.problems.filter((p) => NEW.test(p))]).filter(([, ps]) => ps.length));
const item = (id, deps = [], ms = null) => `## ${id}\n\n- id: ${id}\n- 상태: 다음\n${deps.length ? `- 선행: ${deps.join(', ')}\n` : ''}${ms ? `- 마일스톤: ${ms}\n` : ''}\n`;

test('SC-10 roadmap problem: 마일스톤 순서 역행은 선행이 오른쪽 열인 엣지마다 한 문장, 항목 쪽에 싣는다(ms-backward)', async () => {
  const { data, cfg } = await build({ fixture: 'ms-backward' });
  assert.deepEqual(newProblems(data), {
    search: ['마일스톤 순서 역행: shared-search(r3) → search(r1)'],
    notify: ['마일스톤 순서 역행: notify-rules(r3) → notify(r2)'],
  });
  const hits = checkProblems(data, cfg).filter((p) => p.code === 'roadmap.milestone-backward');
  assert.deepEqual(hits.map((p) => [p.level, p.msg, p.subject.id]), [
    ['warn', '로드맵 검색 화면: 마일스톤 순서 역행: shared-search(r3) → search(r1)', 'search'],
    ['warn', '로드맵 알림 발송: 마일스톤 순서 역행: notify-rules(r3) → notify(r2)', 'notify'],
  ]);
});

test('SC-10 roadmap problem: 역행이 없는 마일스톤 자료와 미배정 항목은 문장이 없다(ms-normal·ms-unassigned)', async () => {
  for (const fixture of ['ms-normal', 'ms-unassigned']) assert.deepEqual(newProblems((await build({ fixture })).data), {}, fixture);
});

test('SC-10 roadmap problem: 미배정(맨 오른쪽 열) 항목이 배정 항목의 선행이면 역행이고 마일스톤 자리는 「마일스톤 없음」', async () => {
  const text = '# 로드맵\n\n## 마일스톤: 하나\n\n- id: m1\n- 상태: 진행\n\n' + item('loose') + item('ghosted', [], 'nope') + item('pinned', ['loose', 'ghosted'], 'm1');
  assert.deepEqual(newProblems((await build({ text })).data), {
    pinned: ['마일스톤 순서 역행: loose(마일스톤 없음) → pinned(m1)', '마일스톤 순서 역행: ghosted(마일스톤 없음) → pinned(m1)'],
  });
});

test('SC-10 roadmap problem: 마일스톤 절이 없으면(layer 모드) 역행 문장이 없다', async () => {
  const text = '# 로드맵\n\n' + item('first') + item('second', ['first']) + item('third', ['second', 'first']);
  assert.deepEqual(newProblems((await build({ text })).data), {});
});

test('SC-5 roadmap problem: 선행 순환은 순환에 든 항목마다 자기에서 시작해 돌아오는 가장 짧은 경로, 순환 뒤 항목은 싣지 않는다', async () => {
  const text = '# 로드맵\n\n' + item('a', ['b']) + item('b', ['a']) + item('c', ['a']) + item('s', ['s']) + item('x', ['z']) + item('y', ['x']) + item('z', ['y']);
  const { data, cfg } = await build({ text });
  assert.deepEqual(newProblems(data), {
    a: ['선행 순환: a → b → a'],
    b: ['선행 순환: b → a → b'],
    s: ['선행 순환: s → s'],
    x: ['선행 순환: x → y → z → x'],
    y: ['선행 순환: y → z → x → y'],
    z: ['선행 순환: z → x → y → z'],
  });
  const hits = checkProblems(data, cfg).filter((p) => p.code === 'roadmap.dep-cycle');
  assert.equal(hits.length, 6);
  assert.ok(hits.every((p) => p.level === 'warn'));
});
