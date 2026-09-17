// 로드맵 이력 날짜 검사(SC-11): 임시 git 저장소에 roadmap.md를 커밋해 가며 완료일(completedAt)·결정 대기 시작일(waitingSince)을 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Graph, runAdapter } from '../src/lib/graph.mjs';
import { makeFs } from '../src/lib/util.mjs';
import roadmap from '../src/adapters/roadmap.mjs';

const made = [];
test.after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'livemap 이력 검사-')); made.push(d); return d; };

// 커밋 시각을 고정하는 git 호출(서명·훅·전역 설정 영향 없음)
function repo() {
  const dir = tmp();
  const git = (args, date) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@example.org', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
  });
  git(['init', '-q', '-b', 'main']);
  mkdirSync(join(dir, 'tasks'), { recursive: true });
  const write = (text, file = 'tasks/roadmap.md') => { mkdirSync(join(dir, file, '..'), { recursive: true }); writeFileSync(join(dir, file), text); };
  const commit = (text, date, file = 'tasks/roadmap.md') => { write(text, file); git(['add', '-A']); git(['commit', '-q', '-m', 'docs: roadmap'], date); };
  return { dir, git, write, commit };
}
const section = (id, status, waiting = '') => `## 항목 ${id}\n\n- id: ${id}\n- 상태: ${status}\n${waiting ? `- 결정 대기: ${waiting}\n` : ''}`;
const doc = (...sections) => `# 로드맵\n\n${sections.join('\n')}`;
function read(dir, file = 'tasks/roadmap.md') {
  const g = new Graph();
  runAdapter(g, 'roadmap', (g) => roadmap(g, makeFs(dir), { roadmap: { file }, git: { branch: 'main' } }));
  const dates = Object.fromEntries([...g.of('milestone'), ...g.of('release')].map((n) => [n.id, [n.props.completedAt, n.props.waitingSince]]));
  return { g, dates, adapter: g.adapters[0] };
}
const T1 = '2026-09-10T10:00:00+09:00', T2 = '2026-09-11T11:00:00+09:00', T3 = '2026-09-12T12:00:00+09:00', T4 = '2026-09-13T13:00:00+09:00';
const utc = (t) => new Date(t).toISOString();

test('SC-11 이력 날짜: 새 항목이 완료로 등장하면 그 커밋, 진행 → 완료는 전이 커밋', () => {
  const r = repo();
  r.commit(doc(section('a', '완료'), section('b', '진행')), T1);
  r.commit(doc(section('a', '완료'), section('b', '완료')), T2);
  assert.deepEqual(read(r.dir).dates, { a: [utc(T1), null], b: [utc(T2), null] });
});

test('SC-11 이력 날짜: 완료 → 진행 → 완료는 마지막 전이 시각, 완료 뒤 삭제된 항목은 다시 나타난 커밋부터', () => {
  const r = repo();
  r.commit(doc(section('a', '완료'), section('b', '완료')), T1);
  r.commit(doc(section('a', '진행')), T2);
  assert.equal(read(r.dir).dates.a[0], null);
  r.commit(doc(section('a', '완료')), T3);
  assert.equal(read(r.dir).dates.a[0], utc(T3));
  // b는 T2에서 사라졌다. 작업트리에만 다시 완료로 적으면 null
  r.write(doc(section('a', '완료'), section('b', '완료')));
  assert.deepEqual(read(r.dir).dates.b, [null, null]);
  r.commit(doc(section('a', '완료'), section('b', '완료')), T4);
  assert.deepEqual(read(r.dir).dates.b, [utc(T4), null]);
});

test('SC-11 이력 날짜: 결정 대기 등장·문구만 변경은 시작일 유지, 삭제 뒤 재등장은 새 시작일', () => {
  const r = repo();
  r.commit(doc(section('a', '다음')), T1);
  r.commit(doc(section('a', '다음', '사용자: 범위')), T2);
  r.commit(doc(section('a', '다음', '사용자: 범위와 순서')), T3);
  assert.deepEqual(read(r.dir).dates.a, [null, utc(T2)]);
  r.commit(doc(section('a', '다음')), T4);
  assert.deepEqual(read(r.dir).dates.a, [null, null]);
  r.commit(doc(section('a', '다음', '다시 고를 것')), '2026-09-14T09:00:00Z');
  assert.deepEqual(read(r.dir).dates.a, [null, '2026-09-14T09:00:00.000Z']);
});

test('SC-11 이력 날짜: 미커밋 완료·미커밋 결정 대기는 null', () => {
  const r = repo();
  r.commit(doc(section('a', '진행')), T1);
  r.write(doc(section('a', '완료', '작업트리에만 있음')));
  assert.deepEqual(read(r.dir).dates.a, [null, null]);
});

test('SC-11 이력 날짜: 마일스톤 절의 결정 대기 시작일도 구간 규칙으로 계산', () => {
  const r = repo();
  const ms = (waiting) => `## 마일스톤: 묶음\n\n- id: rel\n- 상태: 진행\n${waiting ? `- 결정 대기: ${waiting}\n` : ''}`;
  r.commit(doc(ms(''), section('a', '진행')), T1);
  r.commit(doc(ms('사용자: 순서'), section('a', '진행')), T2);
  r.commit(doc(ms('사용자: 순서 확정'), section('a', '진행')), T3);
  assert.deepEqual(read(r.dir).dates.rel, [undefined, utc(T2)]);
});

test('SC-11 이력 날짜: 파일 이름을 바꿔도 이전 경로의 이력을 따라간다', () => {
  const r = repo();
  r.commit(doc(section('a', '완료'), section('b', '다음', '결정')), T1);
  r.git(['mv', 'tasks/roadmap.md', 'docs-roadmap.md']);
  r.git(['commit', '-q', '-m', 'move'], T2);
  r.commit(doc(section('a', '완료'), section('b', '다음', '결정'), section('c', '완료')), T3, 'docs-roadmap.md');
  assert.deepEqual(read(r.dir, 'docs-roadmap.md').dates, { a: [utc(T1), null], b: [null, utc(T1)], c: [utc(T3), null] });
});

test('SC-11 이력 날짜: 얕은 클론은 null과 partial, git 없음은 null이고 상태가 바뀌지 않는다', () => {
  const r = repo();
  r.commit(doc(section('a', '진행')), T1);
  r.commit(doc(section('a', '완료', '대기')), T2);
  const shallow = join(tmp(), 'shallow');
  execFileSync('git', ['clone', '-q', '--depth', '1', '--branch', 'main', `file://${r.dir}`, shallow], { stdio: 'ignore', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } });
  const s = read(shallow);
  assert.deepEqual(s.dates, { a: [null, null] });
  assert.deepEqual([s.adapter.status, s.adapter.error], ['partial', '얕은 클론: 완료일·결정 대기 시작일 생략']);

  const plainDir = tmp();
  mkdirSync(join(plainDir, 'tasks'));
  writeFileSync(join(plainDir, 'tasks/roadmap.md'), doc(section('a', '완료', '대기')));
  const n = read(plainDir);
  assert.deepEqual(n.dates, { a: [null, null] });
  assert.deepEqual([n.adapter.status, n.adapter.error], ['ok', null]);
});
