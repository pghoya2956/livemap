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
import { derive } from '../src/derive.mjs';
import { check } from '../src/check.mjs';

const MINI = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'mini');
const made = [];
test.after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

// 로드맵 본문으로 어댑터를 돌린 그래프
function readRoadmap(text, cfg = { roadmap: { file: 'tasks/roadmap.md' } }) {
  const dir = mkdtempSync(join(tmpdir(), 'livemap 마일스톤 검사-'));
  made.push(dir);
  mkdirSync(join(dir, 'tasks'), { recursive: true });
  writeFileSync(join(dir, 'tasks/roadmap.md'), text);
  const g = new Graph();
  runAdapter(g, 'roadmap', (g) => roadmap(g, makeFs(dir), cfg));
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

// ---- derive·check ----
const SEM = {
  actors: { u: '사용자' },
  journeys: [
    { id: 'j1', title: '여정 가', actor: 'u', steps: [{ id: 's1', label: '하나', status: 'live' }, { id: 's2', label: '둘', status: 'mock' }] },
    { id: 'j2', title: '여정 나', actor: 'u', steps: [{ id: 's1', label: '셋', status: 'live' }] },
  ],
};
const CFG = { roadmap: { file: 'tasks/roadmap.md' }, semantic: 'map/semantic/journeys.json' };
const TASKS = [['20260101-a', '작업 가', '대기', 2, 3], ['20260102-b', '작업 나', '진행', 1, 1]];
function derived(text, { sem = SEM, cfg = CFG } = {}) {
  const g = readRoadmap(text, cfg);
  for (const [name, title, status, pnDone, pnOpen] of TASKS) g.add('task', name, title, { stage: '실행', status, pnDone, pnOpen, oq: 0, dec: 0, recentCommits: 0 });
  const d = derive(g, sem, cfg, { captureExists: () => null });
  return { d, lines: check(d, cfg).filter((p) => /마일스톤|선행 미완|배우 사전/.test(p.msg)).map((p) => `${p.level === 'error' ? '✗' : '△'} ${p.msg}`) };
}
const ms = (title, id, status, extra = '') => `## 마일스톤: ${title}\n\n${id ? `- id: ${id}\n` : ''}- 상태: ${status}\n${extra}\n`;
const item = (title, id, status, extra = '') => `## ${title}\n\n- id: ${id}\n- 상태: ${status}\n${extra}\n`;

test('SC-10 derive: roadmap[] 새 필드와 blockedBy 세 종류', () => {
  const { d } = derived(
    item('가', 'a', '진행', '- 결정 대기: 사용자: 범위를 고른다\n- 선행: b\n- 작업: 20260101-a\n- 마일스톤: one\n')
    + item('나', 'b', '다음', '- 결정 대기: 10:30 회의\n')
    + item('다', 'c', '완료', '- 결정 대기: 남은 문구\n- 작업: 20260101-a\n'));
  const [a, b, c] = d.roadmap;
  assert.deepEqual([a.milestone, a.completedAt, a.waitingSince, a.waitingWho, a.waitingWhat], ['one', null, null, '사용자', '범위를 고른다']);
  assert.deepEqual([b.milestone, b.waitingWho, b.waitingWhat], [null, null, '10:30 회의']);
  assert.deepEqual(a.blockedBy, ['waiting', 'deps', 'task']);
  assert.deepEqual(b.blockedBy, ['waiting']);
  assert.deepEqual(c.blockedBy, ['task']);
  assert.deepEqual(d.issues, []);
});

test('SC-10 derive: milestones[] 원소 키, 단계 한 번만, 계획 항목 합, blocked', () => {
  const { d } = derived(
    ms('하나', 'one', '진행', '- 목표일: 2026-10-01\n')
    + ms('둘', 'two', '다음', '- 결정 대기: 사용자: 순서\n')
    + ms('셋', 'three', '완료', '- 완료일: 2026-09-01\n')
    + item('가', 'a', '진행', '- 장면: j1/s1, j1/s2, j9/zz\n- 작업: 20260101-a, 20269999-none\n- 마일스톤: one\n')
    + item('나', 'b', '다음', '- 장면: j1/s1, j2/s1\n- 작업: 20260101-a, 20260102-b\n- 마일스톤: one\n')
    + item('다', 'c', '완료', '- 결정 대기: 끝난 항목의 문구\n- 마일스톤: three\n'));
  assert.deepEqual(d.milestones.map((m) => Object.keys(m)), d.milestones.map(() => ['id', 'order', 'title', 'status', 'goal', 'completedOn', 'targetOn', 'waitingOn', 'waitingWho', 'waitingWhat', 'waitingSince', 'items', 'progress', 'plans', 'blocked', 'problems', 'warnings', 'src']));
  const [one, two, three] = d.milestones;
  assert.deepEqual([one.order, one.items, one.progress, one.plans, one.targetOn, one.completedOn], [1, ['a', 'b'], { live: 2, total: 3 }, { done: 3, total: 7 }, '2026-10-01', null]);
  assert.deepEqual([two.items, two.progress, two.plans, two.waitingWho, two.waitingWhat, two.blocked], [[], { live: 0, total: 0 }, { done: 0, total: 0 }, '사용자', '순서', true]);
  assert.equal(one.blocked, true); // a가 task(대기)로 막힘
  assert.equal(three.blocked, false); // 완료 항목의 결정 대기는 막힘이 아니다
  assert.equal(three.completedOn, '2026-09-01');
});

test('SC-10 derive: sources 기본값·바꾼 값, tasks[].roadmapItems', () => {
  const text = item('가', 'a', '진행', '- 작업: 20260101-a\n') + item('나', 'b', '다음', '- 작업: 20260101-a, 20260102-b\n');
  const { d } = derived(text);
  assert.deepEqual(d.sources, { semantic: 'map/semantic/journeys.json', roadmap: 'tasks/roadmap.md' });
  assert.deepEqual(Object.fromEntries(d.tasks.map((t) => [t.name, t.roadmapItems])), { '20260101-a': ['a', 'b'], '20260102-b': ['b'] });
  const other = derive(new Graph(), SEM, { semantic: 'docs/flows.json' }, { captureExists: () => null });
  assert.deepEqual(other.sources, { semantic: 'docs/flows.json', roadmap: null });
  assert.deepEqual(other.milestones, []);
});

const CLEAN = ms('하나', 'one', '진행') + item('가', 'a', '진행', '- 마일스톤: one\n');
test('SC-10 check: 규칙에 맞는 마일스톤·마일스톤 절 없는 로드맵은 새 줄 0', () => {
  assert.deepEqual(derived(CLEAN).lines, []);
  assert.deepEqual(derived(item('가', 'a', '진행') + item('나', 'b', '완료')).lines, []);
});

const RULES = [
  ['오류: id 없음', ms('하나', null, '진행') + item('가', 'a', '완료'), '✗ 마일스톤 하나: id 없음'],
  ['오류: 마일스톤 id 중복', CLEAN + ms('둘', 'one', '다음'), '✗ 마일스톤 id 중복: one'],
  ['오류: 항목 id와 같은 마일스톤 id', ms('하나', 'a', '진행') + item('가', 'a', '진행', '- 마일스톤: a\n'), '✗ 마일스톤 id 중복: a'],
  ['오류: 알 수 없는 상태', ms('하나', 'one', '모름') + item('가', 'a', '진행', '- 마일스톤: one\n'), '✗ 마일스톤 하나: 알 수 없는 상태 모름'],
  ['오류: 날짜 형식(없는 날짜)', ms('하나', 'one', '완료', '- 완료일: 2026-02-30\n') + item('가', 'a', '완료', '- 마일스톤: one\n'), '✗ 마일스톤 하나: 날짜 형식 완료일 2026-02-30'],
  ['오류: 날짜 형식(형식 밖)', CLEAN.replace('- 상태: 진행\n', '- 상태: 진행\n- 목표일: 10월 1일\n'), '✗ 마일스톤 하나: 날짜 형식 목표일 10월 1일'],
  ['오류: 항목이 없는 마일스톤 id', CLEAN + item('나', 'b', '다음', '- 마일스톤: ghost\n'), '✗ 로드맵 나: 마일스톤 없음 ghost'],
  ['경고: 완료인데 미완료 항목', ms('하나', 'one', '완료', '- 완료일: 2026-09-01\n') + item('가', 'a', '다음', '- 마일스톤: one\n'), '△ 마일스톤 하나: 완료인데 미완료 항목 1'],
  ['경고: 항목이 모두 완료인데 상태', ms('하나', 'one', '진행') + item('가', 'a', '완료', '- 마일스톤: one\n'), '△ 마일스톤 하나: 항목이 모두 완료인데 상태 진행'],
  ['경고: 진행 항목이 있는데 상태', ms('하나', 'one', '다음') + item('가', 'a', '진행', '- 마일스톤: one\n'), '△ 마일스톤 하나: 진행 항목이 있는데 상태 다음'],
  ['경고: 묶인 항목 없음', CLEAN + ms('둘', 'two', '이후'), '△ 마일스톤 둘: 묶인 항목 없음'],
  ['경고: 완료일과 상태(완료인데 없음)', ms('하나', 'one', '완료') + item('가', 'a', '완료', '- 마일스톤: one\n'), '△ 마일스톤 하나: 완료일과 상태가 맞지 않음'],
  ['경고: 완료일과 상태(진행인데 있음)', CLEAN.replace('- 상태: 진행\n', '- 상태: 진행\n- 완료일: 2026-09-01\n'), '△ 마일스톤 하나: 완료일과 상태가 맞지 않음'],
  ['경고: 진행 마일스톤 2개', CLEAN + ms('둘', 'two', '진행') + item('나', 'b', '진행', '- 마일스톤: two\n'), '△ 진행 마일스톤 2개: 하나, 둘'],
  ['경고: 진행인데 마일스톤 없음', CLEAN + item('나', 'b', '진행'), '△ 로드맵 나: 진행인데 마일스톤 없음'],
  ['경고: 진행인데 선행 미완(마일스톤 무관)', item('가', 'a', '진행', '- 선행: b, c\n') + item('나', 'b', '다음') + item('다', 'c', '완료'), '△ 로드맵 가: 진행인데 선행 미완 나'],
];
for (const [name, text, line] of RULES) {
  test(`SC-10 check 규칙 ${name}`, () => {
    const { lines } = derived(text);
    assert.ok(lines.includes(line), `${line}\n실제:\n${lines.join('\n')}`);
  });
}

test('SC-10 check: 배우 사전에 없는 값은 여정·단계마다 경고, 단계가 여정 배우를 물려받으면 한 번', () => {
  const sem = { actors: { u: '사용자' }, journeys: [
    { id: 'j1', title: '여정 가', actor: 'x', steps: [{ id: 's1', label: '하나', status: 'mock' }, { id: 's2', label: '둘', status: 'mock', actor: 'x' }] },
    { id: 'j2', title: '여정 나', actor: 'u', steps: [{ id: 's1', label: '셋', status: 'mock', actor: 'staff' }, { id: 's2', label: '넷', status: 'mock', actor: 'u' }] },
  ] };
  assert.deepEqual(derived(CLEAN, { sem }).lines, ['△ 여정 가: 배우 사전에 없는 값 x', '△ 여정 나 › 셋: 배우 사전에 없는 값 staff']);
  // 배우 사전이 없는 프로젝트는 비교할 사전이 없어 경고하지 않는다
  assert.deepEqual(derived(CLEAN, { sem: { ...sem, actors: undefined } }).lines, []);
});

test('SC-10 check: 픽스처 mini의 check 출력은 1.0.1과 같다(마일스톤 절 없음)', async () => {
  const { buildGraph } = await import('../src/cli.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'livemap 마일스톤 검사-'));
  made.push(dir);
  const { cpSync } = await import('node:fs');
  cpSync(MINI, dir, { recursive: true });
  const { data, cfg } = await buildGraph(dir);
  assert.deepEqual(check(data, cfg).map((p) => `${p.level === 'error' ? '✗' : '△'} ${p.msg}`), [
    '△ 여정 하나 › 동작 장면: intent 비어 있음',
    '△ 여정 하나 › 목업 장면: intent 비어 있음',
    '△ 여정 하나 › 없는 라우트: intent 비어 있음',
    '✗ 여정 하나 › 없는 라우트: 라우트 없음: /nope',
    '△ 여정 하나 › 없는 라우트: planned 인데 화면이 있음(mock 이 맞는지 확인)',
    '✗ 로드맵 둘째 항목: 장면 없음: j1/zz',
    '✗ 로드맵 둘째 항목: 작업 폴더 없음: 20269999-none',
    '✗ 로드맵 둘째 항목: 선행 항목 없음: ghost',
    '✗ 로드맵 둘째 항목: 알 수 없는 상태: 모름',
    '△ 어느 화면도 부르지 않는 API 2: /api/login, /api/items/:id',
    '△ 배포 sha가 main 이력에 없어 뒤처짐을 계산하지 못함',
  ]);
});
