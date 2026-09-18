// 작업 문서 읽기 계약 검사: 파일 역할, 식별자 줄 문법(결정·계획 항목·잔여 질문·질문 닫힘), 후보 줄 이슈와 readLines, 장부 표시어, 단계, 번호 참조.
// 임시 폴더에 작업 어댑터만 도는 작은 프로젝트를 만들어 buildGraph로 읽는다. spec-kit 0.65.2 템플릿 예시 줄은 fixtures/spec-kit-examples 사본으로 읽는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGraph } from '../src/cli.mjs';
import { checkProblems } from '../src/check.mjs';
import { derive, overviewSlice } from '../src/derive.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const made = [];
test.after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

// files: { 상대 경로: 내용 }. 설정은 작업 어댑터 하나, 여정은 journeys(없으면 빈 목록)
async function project(files, { journeys = [], config = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'livemap 작업 문서 계약 검사-'));
  made.push(dir);
  const all = {
    'map/config.json': JSON.stringify({ engine: 2, adapters: ['tasks'], tasks: { dir: 'tasks', index: 'tasks/index.md' }, semantic: 'map/semantic/journeys.json', ...config }),
    'map/semantic/journeys.json': JSON.stringify({ journeys }),
    ...files,
  };
  for (const [rel, text] of Object.entries(all)) { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text); }
  return open(dir);
}
async function open(dir) {
  const r = await buildGraph(dir);
  const task = (name) => r.g.get('task', name);
  const issues = (code) => r.g.issues.filter((i) => i.code === code);
  return { ...r, dir, task, issues, problems: checkProblems(r.data, r.cfg), overview: overviewSlice(r.data) };
}
const md = (...lines) => lines.join('\n') + '\n';
const index = (...sections) => md('# 작업', '', ...sections.flat());
const NONE_LEFT = ['## 잔여 열린 질문', '', '없음: 모두 닫음'];

test('SC-1 식별자 줄: 스펙 final 목록 결정(일반·굵게)은 세고 취소선은 빼며, 표 첫 칸 DEC는 근거 줄 이슈, 제목 줄 DEC·펜스 안 예시·계획 파일 DEC 줄은 후보가 아님', async () => {
  const p = await project({
    'tasks/index.md': index('## 진행', '| [a](20260101-a/task_plan.md) |'),
    'tasks/20260101-a/spec/final.md': md(
      '# 스펙', //1
      '## 결정 사항', //2
      '- DEC-1 [결정]: 근거', //3
      '- **DEC-2** [확정]: 근거', //4
      '- ~~DEC-3~~ 폐기한 결정', //5
      '### DEC-4 제목 줄', //6
      '| DEC-5·DEC-6 | 표로 쓴 결정 |', //7
      '```markdown', //8
      '- DEC-8 예시', //9
      '| DEC-9 | 예시 |', //10
      '```', //11
      ...NONE_LEFT, //12~14
    ),
    'tasks/20260101-a/task_plan.md': md('# 계획', '- [ ] PN-01 첫 항목', '## Decisions Made', '- DEC-1 옮겨 적음', '| DEC-2 | 옮겨 적음 |'),
  });
  const t = p.task('20260101-a').props;
  assert.equal(t.dec, 2);
  assert.deepEqual(t.readLines, { 'tasks/20260101-a/spec/final.md': [3, 4, 14], 'tasks/20260101-a/task_plan.md': [2] });
  assert.deepEqual(p.issues('tasks.unread-definition').map((i) => [i.subject, i.anchors]), [[{ kind: 'task', id: '20260101-a' }, [{ file: 'tasks/20260101-a/spec/final.md', line: 7, excerpt: '| DEC-5·DEC-6 | 표로 쓴 결정 |' }]]]);
  assert.deepEqual(p.g.get('decision', 'DEC-2').props.definers, ['20260101-a']);
  assert.equal(p.g.get('decision', 'DEC-3').props.struck, true);
  for (const id of ['DEC-4', 'DEC-8', 'DEC-9']) assert.equal(p.g.get('decision', id), null, id);
  // 결정 노드는 1.1.1처럼 스펙 final 줄에서 만든다(계획 파일 줄은 결정 수·후보에 들지 않음)
  assert.equal(p.g.get('decision', 'DEC-1').props.file, 'tasks/20260101-a/spec/final.md');
  assert.equal(p.issues('tasks.unread-definition').flatMap((i) => i.anchors).some((a) => a.file.endsWith('task_plan.md')), false);
});

test('SC-1 계획 항목: 계획 파일 체크박스 전부(임의 접두어·번호 없음·[X]·들여쓰기), 머리 번호만 정의, task_plan.md가 plan.md보다 앞서고 다른 루트 md 체크박스는 후보 아님', async () => {
  const p = await project({
    'tasks/20260101-a/task_plan.md': md('# 계획', '- [x] DP-01 첫', '- [X] SR-02 둘', '  - [ ] 번호 없는 하위 항목', '- [ ] (계획 외) DEC-17 집행', '- [ ] ~~PN-03~~ 드롭'),
    'tasks/20260101-a/plan.md': md('- [ ] PN-09 무시되는 계획'),
    'tasks/20260101-a/notes.md': md('- [ ] 다른 문서 체크박스'),
  });
  const t = p.task('20260101-a').props;
  assert.deepEqual([t.pnDone, t.pnOpen, t.plan, t.planFile, t.reading.plan], [2, 3, 'tasks/20260101-a/task_plan.md', 'tasks/20260101-a/task_plan.md', 'rule']);
  assert.deepEqual(t.readLines, { 'tasks/20260101-a/task_plan.md': [2, 3, 4, 5, 6] });
  assert.deepEqual(['DP-01', 'SR-02'].map((id) => p.g.get('decision', id).props), [
    { kind: 'plan-item', done: true, file: 'tasks/20260101-a/task_plan.md', definers: ['20260101-a'], definedAt: [{ task: '20260101-a', file: 'tasks/20260101-a/task_plan.md', line: 2 }] },
    { kind: 'plan-item', done: true, file: 'tasks/20260101-a/task_plan.md', definers: ['20260101-a'], definedAt: [{ task: '20260101-a', file: 'tasks/20260101-a/task_plan.md', line: 3 }] },
  ]);
  for (const id of ['PN-09', 'DEC-17', 'PN-03']) assert.equal(p.g.get('decision', id), null, id);
  assert.equal(p.issues('tasks.unread-checklist').length, 0);
});

test('SC-1 계획 대체 규칙: 체크박스를 가진 유일한 루트 md를 계획으로 읽고, 둘 이상이면 unknown과 tasks.unread-checklist, spec/·phase/·execution/은 보지 않음', async () => {
  const p = await project({
    'tasks/20260101-single/spec.md': md('# 단일 스펙', '- [x] PN-01 a', '- [ ] 번호 없음'),
    'tasks/20260101-single/README.md': md('# 설명'),
    'tasks/20260101-single/phase/p.md': md('- [ ] P1-01 phase 문서'),
    'tasks/20260101-single/spec/initial.md': md('- [ ] PN-02 스펙 초안'),
    'tasks/20260102-multi/a.md': md('- [ ] 하나'),
    'tasks/20260102-multi/b.md': md('- [x] 둘', '- [ ] 셋'),
    'tasks/20260102-multi/execution/e.md': md('- [ ] 실행 기록'),
    'tasks/20260103-empty/notes.md': md('# 조사'),
  });
  const s = p.task('20260101-single').props;
  assert.deepEqual([s.plan, s.planFile, s.pnDone, s.pnOpen, s.reading.plan], [null, 'tasks/20260101-single/spec.md', 1, 1, 'rule']);
  assert.match(s.readingNotes.plan, /대체 규칙.*spec\.md/);
  assert.deepEqual(s.readLines, { 'tasks/20260101-single/spec.md': [2, 3] });
  assert.equal(p.g.get('decision', 'PN-01').props.file, 'tasks/20260101-single/spec.md');
  const m = p.task('20260102-multi').props;
  assert.deepEqual([m.planFile, m.pnDone, m.pnOpen, m.reading.plan], [null, 0, 0, 'unknown']);
  const [u] = p.issues('tasks.unread-checklist');
  assert.deepEqual(u.anchors.map((a) => [a.file, a.line]), [['tasks/20260102-multi/a.md', 1], ['tasks/20260102-multi/b.md', 1], ['tasks/20260102-multi/b.md', 2]]);
  assert.deepEqual(u.resolutions, ['source', 'judge']);
  assert.equal(p.task('20260103-empty').props.reading.plan, 'none');
});

test('SC-1 스펙 final 대체: 루트 final.md를 스펙 final로 읽고 specFile·readingNotes에 남기며 spec 불리언은 그대로', async () => {
  const p = await project({
    'tasks/20260101-root/final.md': md('# 스펙', '- **DEC-1** 굵은 결정', '## Remaining Open Questions', '| ID | Question |', '|---|---|', '| OQ-01 | 영문 절 |'),
    'tasks/20260101-root/task_plan.md': md('- [ ] PN-01 a'),
  });
  const t = p.task('20260101-root').props;
  assert.deepEqual(t.spec, { initial: false, review: false, final: false });
  assert.deepEqual([t.specFile, t.dec, t.openQuestions, t.openQuestionIds, t.reading.openQuestions], ['tasks/20260101-root/final.md', 1, 1, ['OQ-01'], 'rule']);
  assert.match(t.readingNotes.spec, /final\.md/);
  assert.deepEqual(t.readLines['tasks/20260101-root/final.md'], [2, 6]);
});

test('SC-5 잔여 질문: 마지막 절의 첫 표만, 대시·없음 행은 0, 번호 하나가 아닌 행은 후보와 partial, 그 절 밖 열린 질문 표는 세지 않음', async () => {
  const p = await project({
    'tasks/20260101-q/spec/final.md': md(
      '# 스펙', //1
      '## 열린 질문', //2
      '| ID | 질문 | 처리 결과 |', //3
      '|---|---|---|', //4
      '| OQ-01 | 답한 질문 | DEC-1 |', //5
      '## 잔여 열린 질문', //6
      '| ID | 질문 |', //7
      '|---|---|', //8
      '| — | 없음 |', //9
      '| OQ-02 | 옛 절 |', //10
      '## 잔여 열린 질문(재검토)', //11
      '| ID | 질문 |', //12
      '|---|---|', //13
      '| OQ-03 | 남은 질문 |', //14
      '| - | - |', //15
      '| 없음 | |', //16
      '| OQ-04·OQ-05 | 둘을 한 행에 |', //17
      '| OQ-B1 | 원문 번호 |', //18
      '| ~~OQ-06~~ | 취소선 |', //19
      '| RQ-01 | 다른 접두어 |', //20
      '', //21
      '| OQ-07 | 둘째 표 |', //22
    ),
    'tasks/20260101-q/task_plan.md': md('- [ ] PN-01 a'),
  });
  const t = p.task('20260101-q').props;
  assert.deepEqual([t.openQuestions, t.openQuestionIds, t.reading.openQuestions, t.oq], [1, ['OQ-03'], 'partial', 4]);
  assert.match(t.readingNotes.openQuestions, /절 2개 중 마지막/);
  assert.deepEqual(t.readLines['tasks/20260101-q/spec/final.md'], [14, 15, 16]);
  const [u] = p.issues('tasks.unread-definition');
  assert.deepEqual(u.anchors.map((a) => a.line), [17, 18, 19, 20]);
  assert.equal(u.anchors[1].excerpt, '| OQ-B1 | 원문 번호 |');
});

test('SC-5 잔여 질문: 없음: 한 줄은 0, 절 없음은 unknown과 tasks.questions-unknown, spec/initial.md만 있으면 unknown(이슈 없음), 스펙 없음·폐기 작업은 none', async () => {
  const p = await project({
    'tasks/index.md': index('## 폐기', '| [d](20260105-dropped/task_plan.md) |'),
    'tasks/20260101-none/spec/final.md': md('# 스펙', ...NONE_LEFT),
    'tasks/20260102-nosec/spec/final.md': md('# 스펙', '## 열린 질문', '| OQ-B1 | 절이 없는 스펙 |'),
    'tasks/20260103-initial/spec/initial.md': md('# 초안', '## 열린 질문', '| OQ-01 | 검토 전 |'),
    'tasks/20260104-nospec/notes.md': md('# 조사'),
    'tasks/20260105-dropped/spec/final.md': md('# 스펙', '## 잔여 열린 질문', '| OQ-01 | 폐기 작업 |', '| OQ-X | 폐기 작업 |'),
    'tasks/20260105-dropped/task_plan.md': md('- [ ] PN-01 a'),
  });
  const q = (name) => { const t = p.task(name).props; return [t.openQuestions, t.reading.openQuestions]; };
  assert.deepEqual(q('20260101-none'), [0, 'rule']);
  assert.deepEqual(p.task('20260101-none').props.readLines, { 'tasks/20260101-none/spec/final.md': [4] });
  assert.deepEqual(q('20260102-nosec'), [null, 'unknown']);
  assert.deepEqual(q('20260103-initial'), [null, 'unknown']);
  assert.deepEqual(q('20260104-nospec'), [0, 'none']);
  assert.deepEqual(q('20260105-dropped'), [0, 'none']);
  assert.deepEqual(p.issues('tasks.questions-unknown').map((i) => [i.subject.id, i.anchors]), [['20260102-nosec', [{ file: 'tasks/20260102-nosec/spec/final.md', line: null }]]]);
  // 폐기 작업은 표 행을 읽되 세지 않고 이슈를 내지 않는다
  assert.deepEqual(p.task('20260105-dropped').props.readLines['tasks/20260105-dropped/spec/final.md'], [3, 4]);
  assert.equal(p.g.issues.some((i) => i.subject?.id === '20260105-dropped'), false);
});

test('SC-5 질문 닫힘: 체크한 계획 항목 설명이 번호로 시작하면 닫히고(실행 주체 표시·숫자 앞 0), 언급만 한 항목·체크 안 한 항목은 닫지 않으며, 완료 작업의 남은 행은 partial과 tasks.questions-open-done', async () => {
  const spec = md('# 스펙', '## 잔여 열린 질문', '| ID | 질문 |', '|---|---|', '| OQ-01 | a |', '| OQ-2 | b |', '| OQ-03 | c |', '| OQ-04 | d |', '| OQ-05 | e |');
  const plan = md(
    '# 계획',
    '- [x] P0-01 oq01-x `@서브에이전트`: OQ-01 합의 — X',
    '- [x] P0-02 oq2: OQ-002 합의',
    '- [x] PN-14 recheck: DEC-45 재확인, OQ-03이 막는 PN 없음 확인',
    '- [ ] P0-04 oq04: OQ-04 합의',
    '- [x] P0-05 both: OQ-05·OQ-06 합의',
    '- [x] P0-06 oq-other: OQ-40 합의',
  );
  const p = await project({
    'tasks/index.md': index('## 완료 작업', '| [done](20260101-done/task_plan.md) |', '## 진행', '| [run](20260102-run/task_plan.md) |'),
    'tasks/20260101-done/spec/final.md': spec, 'tasks/20260101-done/task_plan.md': plan,
    'tasks/20260102-run/spec/final.md': spec, 'tasks/20260102-run/task_plan.md': plan,
  });
  const done = p.task('20260101-done').props, run = p.task('20260102-run').props;
  assert.deepEqual([done.status, done.openQuestions, done.openQuestionIds, done.reading.openQuestions], ['완료', 2, ['OQ-03', 'OQ-04'], 'partial']);
  assert.deepEqual([run.status, run.openQuestions, run.openQuestionIds, run.reading.openQuestions], ['진행', 2, ['OQ-03', 'OQ-04'], 'rule']);
  const issues = p.issues('tasks.questions-open-done');
  assert.equal(issues.length, 1);
  assert.deepEqual(issues[0], {
    level: 'warn', label: '작업 문서', message: '완료 작업에 닫히지 않은 잔여 질문 2', adapter: 'tasks', code: 'tasks.questions-open-done',
    subject: { kind: 'task', id: '20260101-done' },
    anchors: [{ file: 'tasks/20260101-done/spec/final.md', line: 7, excerpt: '| OQ-03 | c |' }, { file: 'tasks/20260101-done/spec/final.md', line: 8, excerpt: '| OQ-04 | d |' }],
    resolutions: ['judge'],
    judgmentDraft: { task: '20260101-done', questions: { items: [{ id: 'OQ-03', state: null, at: null }, { id: 'OQ-04', state: null, at: null }] } },
  });
  // 개요: 열린 질문 합계와 상태, 작업별 수. 이슈는 check --json 문제로 간다
  assert.deepEqual([p.overview.counts.openQuestions, p.overview.counts.reading.openQuestions], [4, 'partial']);
  assert.deepEqual(p.overview.tasks.map((t) => [t.id, t.openQuestions]).sort(), [['20260101-done', 2], ['20260102-run', 2]]);
  assert.deepEqual(p.data.tasks.find((t) => t.name === '20260101-done').openQuestionIds, ['OQ-03', 'OQ-04']);
  assert.equal('readLines' in p.data.tasks[0] && p.data.tasks[0].readLines !== undefined, false);
  const pr = p.problems.find((x) => x.code === 'tasks.questions-open-done');
  assert.equal(pr.msg, '작업 문서: 완료 작업에 닫히지 않은 잔여 질문 2');
  assert.deepEqual(pr.judgmentDraft.questions.items.map((i) => i.id), ['OQ-03', 'OQ-04']);
});

test('SC-6 장부: 절 제목 표시어(한·영)로 링크 행을 분류하고 여럿이면 폐기·완료·대기·진행 순, 문단 언급 무시, 모르는 절 경고, 1.1.1 우선순위와 **폐기**, 장부 노드는 1.1.1 절 이름 그대로', async () => {
  const plan = md('- [ ] PN-01 a');
  const p = await project({
    'tasks/index.md': index(
      '## In Progress', '', '| Task | Status |', '|---|---|', '| [A](20260101-a/task_plan.md) | ◐ |', '| [H](20260108-h/task_plan.md) | ◐ |', '',
      '## Paused', '', '| [B](20260102-b/task_plan.md) | ◑ |', '',
      '## Completed', '', '| [C](20260103-c/task_plan.md) | ● |', '| [A](20260101-a/task_plan.md) | ● |', '| [D](20260104-d) — **폐기** | 기각 |', '',
      '## 완료·보류 묶음', '', '| [E](20260105-e/task_plan.md) | |', '',
      '## 현재 작업', '', '문단에서 [F](20260106-f/task_plan.md)를 언급한다.', '',
      '## 메모', '', '| [G](20260107-g/task_plan.md) | |', '',
      '## 현재 실행 장부', '', '| 워크스트림 | Owner | 쓰기 범위 | 완료 기준 |', '|---|---|---|---|', '| 일 | 세션 | `x/` | 끝 |',
    ),
    ...Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((x, i) => [`tasks/2026010${i + 1}-${x}/task_plan.md`, plan])),
    'tasks/20260108-h/task_plan.md': md('# **폐기** 계획', '- [ ] PN-01 a'),
  });
  const status = Object.fromEntries(p.g.of('task').map((t) => [t.id.slice(9), t.props.status]));
  assert.deepEqual(status, { a: '진행', b: '대기', c: '완료', d: '폐기', e: '완료', f: '기록', g: '기록', h: '폐기' });
  const [u] = p.issues('tasks.index-section-unknown');
  assert.deepEqual([u.subject, u.anchors.map((a) => a.excerpt), u.resolutions], [{ kind: 'ledger', id: '메모' }, ['| [G](20260107-g/task_plan.md) | |'], ['source']]);
  assert.equal(p.issues('tasks.index-section-unknown').length, 1);
  assert.deepEqual(p.g.of('ledger').map((l) => [l.id, l.label, l.props.owner]), [['running-0', '일', '세션']]);
});

test('SC-6 단계: 파이프라인 문서가 없으면 1.1.1 문자열에 reading.stage unknown, tasks.stage-unknown은 진행·대기 작업에만', async () => {
  const p = await project({
    'tasks/index.md': index('## 진행', '| [a](20260101-a/notes.md) |', '## 대기', '| [b](20260102-b/notes.md) |', '## 완료', '| [c](20260103-c/notes.md) |', '| [d](20260104-d/task_plan.md) |'),
    'tasks/20260101-a/notes.md': md('# 조사'),
    'tasks/20260102-b/notes.md': md('# 조사'),
    'tasks/20260103-c/notes.md': md('# 조사'),
    'tasks/20260104-d/task_plan.md': md('- [x] PN-01 a'),
  });
  const st = (name) => [p.task(name).props.stage, p.task(name).props.reading.stage];
  assert.deepEqual(['20260101-a', '20260102-b', '20260103-c', '20260104-d'].map(st), [['조사·기록', 'unknown'], ['조사·기록', 'unknown'], ['조사·기록', 'unknown'], ['계획', 'rule']]);
  assert.deepEqual(p.issues('tasks.stage-unknown').map((i) => [i.subject.id, i.message, i.resolutions]), [['20260101-a', '진행 작업에 파이프라인 문서 없음', ['source']], ['20260102-b', '대기 작업에 파이프라인 문서 없음', ['source']]]);
});

test('SC-6 번호 참조: definers, 여럿이면 tasks.ambiguous-ref와 폴더 이름 순 첫 작업(partial), 한정 참조, 번호 범위는 첫 번호, 미해결은 기존 오류·새 접두어는 경고', async () => {
  const step = (id, refs) => ({ id, label: `장면 ${id}`, intent: '의도', status: 'planned', refs });
  const journeys = [{ id: 'j', title: '여정', steps: [
    step('s1', ['DEC-1', 'DEC-2', '20260102-b#DEC-1', 'SR-01']), step('s2', ['DEC-1~3']), step('s3', ['20260109-none#DEC-1']),
    step('s4', ['20260101-a#DEC-2']), step('s5', ['XY-09']), step('s6', ['PN-77']),
  ] }];
  const p = await project({
    'tasks/20260101-a/spec/final.md': md('- DEC-1 a', ...NONE_LEFT),
    'tasks/20260101-a/task_plan.md': md('- [ ] SR-01 x'),
    'tasks/20260102-b/spec/final.md': md('- **DEC-1** b', '- DEC-2 c', ...NONE_LEFT),
  }, { journeys });
  const d1 = p.g.get('decision', 'DEC-1').props;
  assert.deepEqual([d1.definers, d1.definedAt], [['20260101-a', '20260102-b'], [{ task: '20260101-a', file: 'tasks/20260101-a/spec/final.md', line: 1 }, { task: '20260102-b', file: 'tasks/20260102-b/spec/final.md', line: 1 }]]);
  const steps = p.data.semantic.journeys[0].steps;
  assert.deepEqual(steps[0].refNodes.map((r) => [r.ref, r.task, r.reading, r.definers]), [
    ['DEC-1', '20260101-a', 'partial', ['20260101-a', '20260102-b']], ['DEC-2', '20260102-b', 'rule', ['20260102-b']],
    ['20260102-b#DEC-1', '20260102-b', 'rule', ['20260101-a', '20260102-b']], ['SR-01', '20260101-a', 'rule', ['20260101-a']],
  ]);
  assert.deepEqual([steps[1].refNodes[0].task, steps[1].refNodes[0].reading], ['20260101-a', 'partial']);
  const amb = p.issues('tasks.ambiguous-ref');
  assert.deepEqual(amb.map((i) => [i.subject.id, i.anchors]), [['j/s1', d1.definedAt.map(({ file, line }) => ({ file, line }))], ['j/s2', d1.definedAt.map(({ file, line }) => ({ file, line }))]]);
  const lines = p.problems.map((x) => [x.level, x.code, x.msg]);
  for (const [s, ref] of [['s3', '20260109-none#DEC-1'], ['s4', '20260101-a#DEC-2'], ['s6', 'PN-77']]) assert.ok(lines.some(([l, c, m]) => l === 'error' && c === 'step.ref-unresolved' && m === `여정 › 장면 ${s}: 참조 미해결: ${ref}`), s);
  assert.ok(lines.some(([l, , m]) => l === 'warn' && m === '여정 › 장면 s5: 번호 참조 대상 없음: XY-09'));
  assert.equal(lines.filter(([l]) => l === 'error').length, 3);
  // 같은 그래프로 derive를 다시 해도 모호 참조 이슈는 늘지 않는다
  derive(p.g, { journeys }, p.cfg, { captureExists: () => null });
  assert.equal(p.issues('tasks.ambiguous-ref').length, 2);
});

test('SC-6 wiki.sources 설정이 없으면 위키 출처 0이고 작업 어댑터는 ok', async () => {
  const p = await project({ 'tasks/20260101-a/task_plan.md': md('- [ ] PN-01 a') });
  assert.equal('wiki' in p.cfg, false);
  assert.deepEqual(p.data.adapters.map((a) => [a.name, a.status]), [['tasks', 'ok']]);
  assert.equal(p.task('20260101-a').props.wikiSources, 0);
});

test('SC-1 SC-5 SC-6 spec-kit 0.65.2 템플릿 예시 줄: 결정 줄·잔여 질문 표·계획 항목·질문 수명·장부 절을 규칙으로 읽고 tasks.* 이슈 0', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'livemap spec-kit 예시 검사-'));
  made.push(dir);
  cpSync(join(HERE, 'fixtures', 'spec-kit-examples'), dir, { recursive: true });
  const p = await open(dir);
  const t = (name) => p.task(name).props;
  assert.deepEqual(['20260101-example', '20260102-paused', '20260103-done'].map((n) => [t(n).status, t(n).stage, t(n).pnDone, t(n).pnOpen, t(n).dec, t(n).openQuestions, t(n).reading]), [
    ['진행', '계획', 0, 3, 2, 1, { plan: 'rule', openQuestions: 'rule', stage: 'rule' }],
    ['대기', '계획', 1, 1, 0, 0, { plan: 'rule', openQuestions: 'none', stage: 'rule' }],
    ['완료', '계획', 2, 0, 1, 0, { plan: 'rule', openQuestions: 'rule', stage: 'rule' }],
  ]);
  assert.deepEqual(t('20260101-example').openQuestionIds, ['OQ-04']);
  assert.deepEqual(p.g.get('decision', 'P0-03').props.definers, ['20260101-example']);
  assert.deepEqual(p.problems.filter((x) => x.code.startsWith('tasks.')), []);
});
