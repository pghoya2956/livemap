// 판정 파일 검사: map/judgments/<작업 폴더>.json 읽기, 필드 검증, 근거 조각 대조(한 줄 확인·0줄 stale·여러 줄 invalid),
// 적용 순서(규칙 → planFile → lines → questions → 읽기 상태), judged·stale 상태, 판정 초안(judgmentDraft)과 stale 후보 줄, 종료 코드.
// 임시 폴더에 작업 어댑터만 도는 작은 프로젝트를 만들어 buildGraph로 읽고, 종료 코드는 bin을 자식 프로세스로 부른다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGraph } from '../src/cli.mjs';
import { checkProblems } from '../src/check.mjs';
import { overviewSlice } from '../src/derive.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = join(resolve(HERE, '..'), 'bin', 'livemap.mjs');
const made = [];
test.after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

const md = (...lines) => lines.join('\n') + '\n';
const index = (...sections) => md('# 작업', '', ...sections.flat());
const NONE_LEFT = ['## 잔여 열린 질문', '', '없음: 모두 닫음'];

function write(dir, files) {
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), typeof text === 'string' ? text : JSON.stringify(text, null, 2) + '\n');
  }
}
async function project(files) {
  const dir = mkdtempSync(join(tmpdir(), 'livemap 판정 파일 검사-'));
  made.push(dir);
  write(dir, {
    'map/config.json': JSON.stringify({ engine: 1, adapters: ['tasks'], tasks: { dir: 'tasks', index: 'tasks/index.md' }, semantic: 'map/semantic/journeys.json' }),
    'map/semantic/journeys.json': JSON.stringify({ journeys: [] }),
    ...files,
  });
  return open(dir);
}
async function open(dir) {
  const r = await buildGraph(dir);
  return {
    ...r, dir,
    task: (name) => r.g.get('task', name).props,
    issues: (code) => r.g.issues.filter((i) => i.code === code),
    codes: () => r.g.issues.map((i) => i.code).sort(),
    problems: checkProblems(r.data, r.cfg),
    overview: overviewSlice(r.data),
    rerun: (more) => { write(dir, more); return open(dir); },
  };
}
const cli = (dir, args) => { const r = spawnSync(process.execPath, [BIN, ...args], { cwd: dir, encoding: 'utf8' }); return { code: r.status, out: r.stdout, err: r.stderr }; };

// 완료 작업 하나: 표로 쓴 결정 한 줄(후보), 잔여 질문 없음
const DONE_SPEC = md('# 완료 작업', '', '## 결정 사항', '', '| ID | 결정 |', '|---|---|', '| **DEC-1** | 결제 링크는 서버에서 만들고 만료 시간을 둔다 |', '', ...NONE_LEFT);
const DONE = {
  'tasks/index.md': index('## 완료', '| [done](20260101-done/spec/final.md) |'),
  'tasks/20260101-done/spec/final.md': DONE_SPEC,
};
const decJudgment = (text = '| **DEC-1** | 결제 링크는 서버에서 만들고', extra = {}) => ({
  schema: 1, task: '20260101-done', by: 'agent',
  lines: [{ at: { file: 'tasks/20260101-done/spec/final.md', text }, as: 'definition', id: 'DEC-1' }], ...extra,
});

test('SC-7 판정 lines definition: 표 첫 칸 결정 줄을 정의로 더해 후보 이슈가 사라지고, 노드 judged·data.json judgments[]·readLines에 남는다', async () => {
  const before = await project(DONE);
  assert.equal(before.task('20260101-done').dec, 0);
  assert.equal(before.issues('tasks.unread-definition').length, 1);
  const draft = before.problems.find((p) => p.code === 'tasks.unread-definition').judgmentDraft;
  assert.deepEqual(draft, { task: '20260101-done', lines: [{ at: null, as: null, id: 'DEC-1' }] });
  assert.equal(before.task('20260101-done').judged, null);
  assert.deepEqual(before.data.judgments, []);

  const p = await before.rerun({ 'map/judgments/20260101-done.json': decJudgment() });
  const t = p.task('20260101-done');
  assert.deepEqual(p.codes(), []);
  assert.equal(t.dec, 1);
  assert.equal(t.judged, 'map/judgments/20260101-done.json');
  assert.deepEqual(t.readLines['tasks/20260101-done/spec/final.md'], [7, 11]);
  assert.deepEqual(p.g.get('decision', 'DEC-1').props.definers, ['20260101-done']);
  assert.deepEqual(p.data.judgments, [{ task: '20260101-done', file: 'map/judgments/20260101-done.json', by: 'agent', note: null, applied: 1, stale: 0, invalid: 0 }]);
  assert.equal(p.data.tasks[0].judged, 'map/judgments/20260101-done.json');
  // 판정 파일이 있어도 문제 없으면 종료 코드 0
  assert.equal(cli(p.dir, ['check']).code, 0);
});

test('SC-7 판정 lines ignore: 후보에서 빼고 정의·결정 수는 그대로, 코드 펜스 안 원문 줄도 근거로 확인한다', async () => {
  const spec = md('# 스펙', '| DEC-1 | 옮겨 적은 예시 줄이다 이 표는 참조일 뿐 |', '```markdown', '| DEC-2 | 펜스 안에 둔 결정 설명 줄을 근거로 쓴다 |', '```', ...NONE_LEFT);
  const p = await project({
    'tasks/index.md': index('## 완료', '| [done](20260101-done/spec/final.md) |'),
    'tasks/20260101-done/spec/final.md': spec,
    'map/judgments/20260101-done.json': {
      schema: 1, task: '20260101-done', by: 'human', note: '참조 표',
      lines: [
        { at: { file: 'tasks/20260101-done/spec/final.md', text: '옮겨 적은 예시 줄이다 이 표는 참조일 뿐' }, as: 'ignore' },
        { at: { file: 'tasks/20260101-done/spec/final.md', text: '펜스 안에 둔 결정 설명 줄을 근거로 쓴다' }, as: 'definition', id: 'DEC-2' },
      ],
    },
  });
  const t = p.task('20260101-done');
  assert.deepEqual(p.codes(), []);
  assert.equal(t.dec, 1);
  assert.equal(p.g.get('decision', 'DEC-1'), null);
  assert.deepEqual(p.g.get('decision', 'DEC-2').props.definers, ['20260101-done']);
  assert.deepEqual(p.data.judgments.map((j) => [j.by, j.note, j.applied]), [['human', '참조 표', 2]]);
});

test('SC-7 근거 조각: 줄 번호를 쓰지 않아 위에 줄이 더해져도 확인, 조각이 사라지면 judgment.stale과 후보 줄 초안, 두 줄이면 judgment.invalid(error, 종료 코드 1)', async () => {
  const p = await project({ ...DONE, 'map/judgments/20260101-done.json': decJudgment() });
  assert.deepEqual(p.codes(), []);

  // 위에 줄을 더함: 그대로 확인
  const shifted = await p.rerun({ 'tasks/20260101-done/spec/final.md': md('# 완료 작업', '', '앞에 더한 문단', '', '더한 줄 둘') + DONE_SPEC.split('\n').slice(1).join('\n') });
  assert.deepEqual(shifted.codes(), []);
  assert.equal(shifted.task('20260101-done').dec, 1);

  // 조각을 한 글자 바꿈: stale, 규칙 후보 이슈는 판정이 잡고 있어 다시 내지 않는다
  const stale = await p.rerun({ 'tasks/20260101-done/spec/final.md': DONE_SPEC.replace('서버에서 만들고', '서버에서 만든다, 그리고') });
  assert.deepEqual(stale.codes(), ['judgment.stale']);
  const si = stale.issues('judgment.stale')[0];
  assert.equal(si.level, 'warn');
  assert.deepEqual(si.subject, { kind: 'judgment', id: '20260101-done' });
  assert.deepEqual(si.anchors.map((a) => a.file), ['map/judgments/20260101-done.json', 'tasks/20260101-done/spec/final.md']);
  assert.deepEqual(si.judgmentDraft, {
    task: '20260101-done',
    lines: [{ at: null, as: 'definition', id: 'DEC-1' }],
    candidates: [{ file: 'tasks/20260101-done/spec/final.md', line: 7, excerpt: '| **DEC-1** | 결제 링크는 서버에서 만든다, 그리고 만료 시간을 둔다 |' }],
  });
  assert.equal(stale.task('20260101-done').dec, 0);
  assert.equal(stale.data.judgments[0].stale, 1);
  assert.equal(cli(stale.dir, ['check']).code, 0);

  // 같은 조각을 가진 줄을 하나 더: invalid(error), 종료 코드 1, 적용하지 않음
  const dup = await p.rerun({ 'tasks/20260101-done/spec/final.md': DONE_SPEC.replace('만료 시간을 둔다 |', '만료 시간을 둔다 |\n| **DEC-1** | 결제 링크는 서버에서 만들고 다시 적은 줄 |') });
  assert.deepEqual(dup.codes(), ['judgment.invalid', 'tasks.unread-definition']);
  const di = dup.issues('judgment.invalid')[0];
  assert.equal(di.level, 'error');
  assert.deepEqual(di.anchors.map((a) => [a.file, a.line]), [['map/judgments/20260101-done.json', null], ['tasks/20260101-done/spec/final.md', 7], ['tasks/20260101-done/spec/final.md', 8]]);
  const r = cli(dup.dir, ['check', '--json']);
  assert.equal(r.code, 1);
  assert.equal(JSON.parse(r.out).errors, 1);
});

test('SC-7 judgment.invalid: JSON 깨짐, 스키마 위반, 폴더 이름 바뀜, 없는 근거 파일, 20자 미만 조각, 번호 없는 근거 줄, none과 items 동시 사용', async () => {
  const base = { ...DONE };
  const cases = {
    broken: '{ "schema": 1, ',
    schema: { schema: 2, task: '20260101-done', by: 'agent' },
    by: { schema: 1, task: '20260101-done', by: 'robot' },
    taskName: { schema: 1, task: '20260101-other', by: 'agent' },
    as: { schema: 1, task: '20260101-done', by: 'agent', lines: [{ at: { file: 'tasks/20260101-done/spec/final.md', text: '| **DEC-1** | 결제 링크는 서버에서 만들고' }, as: 'checked', id: 'DEC-1' }] },
    noId: { schema: 1, task: '20260101-done', by: 'agent', lines: [{ at: { file: 'tasks/20260101-done/spec/final.md', text: '| **DEC-1** | 결제 링크는 서버에서 만들고' }, as: 'definition' }] },
    both: { schema: 1, task: '20260101-done', by: 'agent', questions: { none: { at: { file: 'tasks/20260101-done/spec/final.md', text: '없음: 모두 닫음 그리고 더 긴 조각' } }, items: [] } },
    state: { schema: 1, task: '20260101-done', by: 'agent', questions: { items: [{ id: 'OQ-1', state: 'maybe', at: { file: 'tasks/20260101-done/spec/final.md', text: '| **DEC-1** | 결제 링크는 서버에서 만들고' } }] } },
    planFile: { schema: 1, task: '20260101-done', by: 'agent', planFile: 'missing.md' },
    missingFile: decJudgment(undefined, { lines: [{ at: { file: 'tasks/20260101-done/spec/gone.md', text: '| **DEC-1** | 결제 링크는 서버에서 만들고' }, as: 'definition', id: 'DEC-1' }] }),
    short: decJudgment('| **DEC-1** | 결제'),
    wrongId: decJudgment(undefined, { lines: [{ at: { file: 'tasks/20260101-done/spec/final.md', text: '| **DEC-1** | 결제 링크는 서버에서 만들고' }, as: 'definition', id: 'DEC-7' }] }),
  };
  for (const [name, body] of Object.entries(cases)) {
    const p = await project({ ...base, 'map/judgments/20260101-done.json': body });
    const inv = p.issues('judgment.invalid');
    assert.ok(inv.length >= 1, `${name}: ${JSON.stringify(p.codes())}`);
    assert.ok(inv.every((i) => i.level === 'error' && i.subject.kind === 'judgment' && i.anchors[0].file === 'map/judgments/20260101-done.json'), name);
    // 무효 판정은 값을 바꾸지 않는다: 표 결정 후보 이슈가 남는다
    assert.equal(p.issues('tasks.unread-definition').length, 1, name);
    assert.equal(p.task('20260101-done').dec, 0, name);
  }
  // 작업 폴더 이름이 바뀜: 판정 파일 이름의 폴더가 없음
  const renamed = await project({
    'tasks/index.md': index('## 완료', '| [done](20260101-done-renamed/spec/final.md) |'),
    'tasks/20260101-done-renamed/spec/final.md': DONE_SPEC,
    'map/judgments/20260101-done.json': decJudgment(),
  });
  assert.deepEqual(renamed.issues('judgment.invalid').map((i) => [i.subject.id, i.message]), [['20260101-done', '판정 대상 작업 폴더 없음: tasks/20260101-done']]);
  // json이 아닌 파일은 보지 않는다
  const other = await project({ ...base, 'map/judgments/README.md': '# 판정\n' });
  assert.deepEqual(other.codes(), ['tasks.unread-definition']);
});

test('SC-7 판정 questions: 완료 작업의 닫히지 않은 질문을 다른 작업 문서 근거로 resolved, 절 없는 작업은 items(OQ-B1)가 목록, none은 0, 모두 judged', async () => {
  const booking = md('# 예약', '## 잔여 열린 질문', '| ID | 질문 |', '|---|---|', '| OQ-28 | 초대 대상의 계정 가입을 어느 스펙에서 제공할지 |');
  const p = await project({
    'tasks/index.md': index('## 완료', '| [b](20260101-booking/spec/final.md) |', '| [s](20260102-signup/spec.md) |', '| [v](20260103-video/spec/final.md) |', '| [n](20260104-none/spec/final.md) |'),
    'tasks/20260101-booking/spec/final.md': booking,
    'tasks/20260102-signup/spec.md': md('# 가입', '- [x] PN-01 초대', '**초대(OQ-28) 종결.** 계정 없는 이메일로 초대하면 가입 링크를 보낸다'),
    'tasks/20260103-video/spec/final.md': md('# 영상', '## 열린 질문', '| ID | 질문 |', '|---|---|', '| OQ-B1 | 썸네일을 매 프레임 다시 만들지 여부 |', '| OQ-B2 | 자막 서체를 어디서 받을지 정한다 |'),
    'tasks/20260104-none/spec/final.md': md('# 없음', '## 결정', '- DEC-1 질문 절 없이 끝난 조사 작업이다 남은 질문도 없다'),
  });
  assert.deepEqual(p.codes(), ['tasks.questions-open-done', 'tasks.questions-unknown', 'tasks.questions-unknown']);
  assert.deepEqual(p.problems.filter((x) => x.code === 'tasks.questions-unknown').map((x) => x.judgmentDraft), [
    { task: '20260103-video', questions: { none: { at: null } } },
    { task: '20260104-none', questions: { none: { at: null } } },
  ]);

  const j = await p.rerun({
    'map/judgments/20260101-booking.json': { schema: 1, task: '20260101-booking', by: 'agent', note: '가입 작업이 닫음', questions: { items: [{ id: 'OQ-28', state: 'resolved', at: { file: 'tasks/20260102-signup/spec.md', text: '초대(OQ-28) 종결.** 계정 없는 이메일로 초대' } }] } },
    'map/judgments/20260103-video.json': { schema: 1, task: '20260103-video', by: 'agent', questions: { items: [
      { id: 'OQ-B1', state: 'open', at: { file: 'tasks/20260103-video/spec/final.md', text: '| OQ-B1 | 썸네일을 매 프레임 다시 만들지' } },
      { id: 'OQ-B2', state: 'resolved', at: { file: 'tasks/20260103-video/spec/final.md', text: '| OQ-B2 | 자막 서체를 어디서 받을지' } },
    ] } },
    'map/judgments/20260104-none.json': { schema: 1, task: '20260104-none', by: 'human', questions: { none: { at: { file: 'tasks/20260104-none/spec/final.md', text: '질문 절 없이 끝난 조사 작업이다 남은 질문도 없다' } } } },
  });
  assert.deepEqual(j.codes(), []);
  const q = (name) => { const t = j.task(name); return [t.openQuestions, t.openQuestionIds, t.reading.openQuestions]; };
  assert.deepEqual(q('20260101-booking'), [0, [], 'judged']);
  assert.deepEqual(q('20260103-video'), [1, ['OQ-B1'], 'judged']);
  assert.deepEqual(q('20260104-none'), [0, [], 'judged']);
  assert.deepEqual([j.overview.counts.openQuestions, j.overview.counts.reading.openQuestions], [1, 'judged']);
  // 근거 조각을 바꾸면 그 값은 stale이고 질문은 규칙 값으로 돌아가되 규칙 이슈를 다시 내지 않는다
  const s = await j.rerun({ 'tasks/20260102-signup/spec.md': md('# 가입', '- [x] PN-01 초대', '**초대(OQ-28) 종결됨.** 계정 없는 이메일로 초대하면 가입 링크를 보낸다') });
  assert.deepEqual(s.codes(), ['judgment.stale']);
  assert.deepEqual([s.task('20260101-booking').openQuestions, s.task('20260101-booking').reading.openQuestions], [1, 'stale']);
  assert.deepEqual(s.issues('judgment.stale')[0].judgmentDraft, {
    task: '20260101-booking', questions: { items: [{ id: 'OQ-28', state: 'resolved', at: null }] },
    candidates: [{ file: 'tasks/20260102-signup/spec.md', line: 3, excerpt: '**초대(OQ-28) 종결됨.** 계정 없는 이메일로 초대하면 가입 링크를 보낸다' }],
  });
});

test('SC-7 판정 questions와 lines: 잔여 질문 표에서 번호 하나가 아닌 행을 판정하면 후보 이슈가 사라지고 judged', async () => {
  const spec = md('# 스펙', '## 잔여 열린 질문', '| ID | 질문 |', '|---|---|', '| OQ-01 | 첫 질문 |', '| OQ-04·OQ-05 | 두 질문을 한 행에 묶어 적은 행 |', '| RQ-01 | 다른 접두어로 적은 남은 질문 |');
  const p = await project({
    'tasks/index.md': index('## 진행', '| [a](20260101-a/task_plan.md) |'),
    'tasks/20260101-a/spec/final.md': spec,
    'tasks/20260101-a/task_plan.md': md('# 계획', '- [ ] PN-01 a'),
  });
  assert.deepEqual([p.codes(), p.task('20260101-a').reading.openQuestions], [['tasks.unread-definition'], 'partial']);
  assert.deepEqual(p.problems[0].judgmentDraft, { task: '20260101-a', questions: { items: [{ id: 'OQ-04', state: null, at: null }, { id: 'OQ-05', state: null, at: null }, { id: 'RQ-01', state: null, at: null }] } });
  const j = await p.rerun({ 'map/judgments/20260101-a.json': { schema: 1, task: '20260101-a', by: 'agent',
    lines: [{ at: { file: 'tasks/20260101-a/spec/final.md', text: '| RQ-01 | 다른 접두어로 적은 남은' }, as: 'definition', id: 'RQ-01' }],
    questions: { items: [{ id: 'OQ-04', state: 'resolved', at: { file: 'tasks/20260101-a/spec/final.md', text: '| OQ-04·OQ-05 | 두 질문을 한 행에' } }] } } });
  assert.deepEqual(j.codes(), []);
  const t = j.task('20260101-a');
  assert.deepEqual([t.openQuestions, t.openQuestionIds, t.reading.openQuestions], [2, ['OQ-01', 'RQ-01'], 'judged']);
});

test('SC-7 판정 planFile: 계획 파일 없이 체크박스 문서가 둘인 작업에서 고른 파일의 체크박스를 세고(체크 여부는 원문), judged, tasks.unread-checklist가 사라진다', async () => {
  const files = {
    'tasks/index.md': index('## 완료', '| [a](20260101-a/notes.md) |'),
    'tasks/20260101-a/notes.md': md('# 노트', '- [x] 조사', '- [ ] 남은 일'),
    'tasks/20260101-a/todo.md': md('# 할 일', '- [ ] 다른 목록'),
    'tasks/20260101-a/spec/final.md': md('# 스펙', ...NONE_LEFT),
  };
  const p = await project(files);
  assert.deepEqual(p.codes(), ['tasks.unread-checklist']);
  assert.deepEqual(p.problems[0].judgmentDraft, { task: '20260101-a', planFile: null });
  const j = await p.rerun({ 'map/judgments/20260101-a.json': { schema: 1, task: '20260101-a', by: 'agent', planFile: 'notes.md' } });
  const t = j.task('20260101-a');
  assert.deepEqual(j.codes(), []);
  assert.deepEqual([t.planFile, t.pnDone, t.pnOpen, t.reading.plan, t.plan], ['tasks/20260101-a/notes.md', 1, 1, 'judged', null]);
});

test('SC-7 판정은 체크 여부·장부 상태·단계를 바꾸지 못한다: 그런 필드는 무시하고 원문 값을 쓴다', async () => {
  const files = {
    'tasks/index.md': index('## 진행', '| [a](20260101-a/task_plan.md) |'),
    'tasks/20260101-a/task_plan.md': md('# 계획', '- [ ] PN-01 아직 안 한 항목', '- [x] PN-02 한 항목'),
    'tasks/20260101-a/spec/final.md': md('# 스펙', ...NONE_LEFT),
  };
  const p = await project(files);
  const before = p.task('20260101-a');
  const j = await p.rerun({ 'map/judgments/20260101-a.json': {
    schema: 1, task: '20260101-a', by: 'agent', status: '완료', stage: '검증', checked: { 'PN-01': true },
    lines: [{ at: { file: 'tasks/20260101-a/task_plan.md', text: '- [ ] PN-01 아직 안 한 항목' }, as: 'ignore', checked: true }],
  } });
  const t = j.task('20260101-a');
  assert.deepEqual(j.codes(), []);
  assert.deepEqual([t.status, t.stage, t.pnDone, t.pnOpen, t.reading.stage], [before.status, before.stage, before.pnDone, before.pnOpen, before.reading.stage]);
  assert.deepEqual([t.status, t.pnDone, t.pnOpen], ['진행', 1, 1]);
});

test('SC-7 판정 파일이 없는 프로젝트: judgment.* 없음, 노드 judged null, data.json judgments 빈 배열, 텍스트 줄과 종료 코드 그대로', async () => {
  const p = await project(DONE);
  assert.equal(p.codes().some((c) => c.startsWith('judgment.')), false);
  assert.equal(p.task('20260101-done').judged, null);
  assert.deepEqual(p.data.judgments, []);
  const r = cli(p.dir, ['check']);
  assert.equal(r.code, 0);
  assert.deepEqual(r.out.trim().split('\n'), ['△ 작업 문서: 스펙 final 표 첫 칸의 결정 번호 1줄을 규칙으로 읽지 않음', 'map check: 통과 (경고 1)']);
  assert.equal(readFileSync(join(p.dir, 'tasks/20260101-done/spec/final.md'), 'utf8'), DONE_SPEC);
});

test('SC-7 판정 초안 번호: 잔여 질문 표 첫 칸의 하이픈 둘인 번호(R-OQ-01)와 다른 번호 모양을 칸 원문 번호 그대로 싣는다', async () => {
  const spec = md('# 스펙', '## 잔여 열린 질문', '| ID | 질문 |', '|---|---|',
    '| R-OQ-01 | 검토에서 남긴 첫 질문 |', '| R-OQ-02 | 검토에서 남긴 둘째 질문 |', '| OQ-04·OQ-05 | 두 질문을 한 행에 묶어 적은 행 |',
    '| ~~OQ-01~~ | 취소선으로 닫은 질문 |', '| OQ-H2b | 영문 소문자가 붙은 번호 |', '| OQ-B1 | 문자와 숫자를 섞은 번호 |');
  const p = await project({
    'tasks/index.md': index('## 진행', '| [a](20260101-a/task_plan.md) |'),
    'tasks/20260101-a/spec/final.md': spec,
    'tasks/20260101-a/task_plan.md': md('# 계획', '- [ ] PN-01 a'),
  });
  assert.deepEqual(p.codes(), ['tasks.unread-definition']);
  const ids = p.problems[0].judgmentDraft.questions.items.map((e) => e.id);
  assert.deepEqual(ids, ['R-OQ-01', 'R-OQ-02', 'OQ-04', 'OQ-05', 'OQ-01', 'OQ-H2b', 'OQ-B1']);
});
