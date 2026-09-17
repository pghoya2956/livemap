// 마일스톤 검사(SC-10): 로드맵 어댑터의 마일스톤 절·항목 키, derive의 마일스톤·막힘 파생, check의 마일스톤 규칙과 배우 사전 경고.
// 로드맵 파일 하나만 있는 임시 폴더(git 없음)를 어댑터에 읽힌다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Graph, runAdapter } from '../src/lib/graph.mjs';
import { makeFs } from '../src/lib/util.mjs';
import roadmap from '../src/adapters/roadmap.mjs';

const MINI = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'mini');
const made = [];
test.after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

// 로드맵 본문으로 어댑터를 돌린 그래프
function readRoadmap(text) {
  const dir = mkdtempSync(join(tmpdir(), 'livemap 마일스톤 검사-'));
  made.push(dir);
  mkdirSync(join(dir, 'tasks'), { recursive: true });
  writeFileSync(join(dir, 'tasks/roadmap.md'), text);
  const g = new Graph();
  runAdapter(g, 'roadmap', (g) => roadmap(g, makeFs(dir), { roadmap: { file: 'tasks/roadmap.md' } }));
  return g;
}
const items = (g) => g.of('milestone').map((m) => [m.id, m.label, m.props.order]);

const MINI_ROADMAP = readFileSync(join(MINI, 'tasks/roadmap.md'), 'utf8');
const WITH_MILESTONES = MINI_ROADMAP
  .replace('# 로드맵\n', '# 로드맵\n\n## 마일스톤: 첫 묶음\n\n첫 묶음 목표.\n\n- id: one\n- 상태: 진행\n- 목표일: 2026-10-01\n- 결정 대기: 사용자: 범위를 고른다\n- 담당: 아무개\n')
  .replace('## 둘째 항목', '## 마일스톤：둘째 묶음\n\n- id: two\n- 상태: 완료\n- 완료일: 2026-09-01\n\n## 둘째 항목')
  .replace('- 결정 대기: 고를 것', '- 결정 대기: 고를 것\n- 마일스톤: one\n- 담당: 누군가');

test('SC-10 roadmap: 반각·전각 콜론 마일스톤 절을 release 노드로 읽고 속성·목표를 남긴다', () => {
  const g = readRoadmap(WITH_MILESTONES);
  assert.deepEqual(g.of('release').map((r) => [r.id, r.label, r.props.order, r.props.status]), [['one', '첫 묶음', 1, '진행'], ['two', '둘째 묶음', 2, '완료']]);
  const one = g.get('release', 'one').props;
  assert.deepEqual([one.goal, one.targetOn, one.completedOn, one.waitingOn], ['첫 묶음 목표.', '2026-10-01', '', '사용자: 범위를 고른다']);
  assert.equal(g.get('release', 'two').props.completedOn, '2026-09-01');
  assert.equal(g.get('release', 'one').src.file, 'tasks/roadmap.md');
  assert.equal(g.get('release', 'one').src.line, 3);
  assert.equal(g.adapters[0].status, 'ok');
});

test('SC-10 roadmap: 마일스톤 절을 끼워도 항목 id·제목·order가 같다(항목 절만 센다)', () => {
  const before = readRoadmap(MINI_ROADMAP);
  const after = readRoadmap(WITH_MILESTONES);
  assert.deepEqual(items(after), items(before));
  assert.deepEqual(items(before), [['first', '첫 항목', 1], ['second', '둘째 항목', 2]]);
  // id 없는 항목의 자동 id도 항목만 센다
  const auto = readRoadmap('## 마일스톤: 묶음\n\n- id: r\n- 상태: 진행\n\n## 가\n\n- 상태: 진행\n\n## 마일스톤: 다른 묶음\n\n- id: s\n- 상태: 다음\n\n## 나\n\n- 상태: 다음\n');
  assert.deepEqual(items(auto), [['m1', '가', 1], ['m2', '나', 2]]);
});

test('SC-10 roadmap: 항목 마일스톤 키, 모르는 키 무시, release → 항목 contains 엣지', () => {
  const g = readRoadmap(WITH_MILESTONES);
  assert.equal(g.get('milestone', 'first').props.milestone, 'one');
  assert.equal(g.get('milestone', 'second').props.milestone, null);
  assert.equal(g.get('milestone', 'first').props['담당'], undefined);
  assert.equal(g.get('release', 'one').props['담당'], undefined);
  assert.deepEqual(g.out('release', 'one', 'contains').map((n) => n.kind + ':' + n.id), ['milestone:first']);
  assert.deepEqual(g.out('release', 'two', 'contains'), []);
  // 마일스톤 절이 없으면 1.0.1과 같은 속성 키에 날짜·마일스톤 키만 더해진다
  const plain = readRoadmap(MINI_ROADMAP);
  assert.deepEqual(Object.keys(plain.get('milestone', 'first').props), ['order', 'goal', 'status', 'mode', 'tasks', 'scenes', 'deps', 'waitingOn', 'done', 'milestone', 'completedAt', 'waitingSince']);
  assert.equal(plain.of('release').length, 0);
});

test('SC-10 roadmap: 마일스톤 id 없음·중복은 노드에 표시하고 먼저 나온 절을 남긴다', () => {
  const g = readRoadmap('## 마일스톤: 이름만\n\n- 상태: 진행\n\n## 마일스톤: 앞\n\n- id: dup\n- 상태: 진행\n\n## 마일스톤: 뒤\n\n- id: dup\n- 상태: 다음\n\n## 항목\n\n- 상태: 진행\n');
  const rs = g.of('release');
  assert.deepEqual(rs.map((r) => [r.label, r.props.order, r.props.idMissing]), [['이름만', 1, true], ['앞', 2, false]]);
  assert.equal(g.get('release', 'dup').props.status, '진행');
  assert.equal(g.get('release', 'dup').props.duplicates, 1);
});
