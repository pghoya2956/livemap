// 작업 어댑터: tasks/<date>-<slug>/ 폴더에서 task 노드를 만든다. 단계는 폴더 안 문서로, 상태는 계획 문서 머리와 장부(tasks/index.md) 표 행으로 판정한다.
// 결정·계획 항목 정의 위치를 defines 엣지와 decision 노드 definers로 남겨 여정 장면의 refs가 작업 문서로 이어지게 한다.
//
// 작업 문서 읽기 계약(docs/adapter-contract.md, docs/issue-codes.md):
//   파일 역할  스펙 final = spec/final.md, 없으면 작업 루트 final.md(specFile). 계획 = task_plan.md → plan.md → 체크박스를 가진 유일한 루트 md(planFile)
//   식별자 줄  md 블록 읽개(lib/md-blocks.mjs) 위에서 줄 모양으로 읽고, 같은 범위의 후보 줄 중 규칙이 읽지 못한 줄은 근거 줄을 단 이슈로 낸다
//   센 줄      노드 readLines { 파일: [줄 번호] } — 결정 정의, 계획 파일 체크박스, 잔여 질문 표 행
//   읽기 상태  plan·openQuestions·stage(lib/reading.mjs)
import { readBlocks } from '../lib/md-blocks.mjs';
import { setReading } from '../lib/reading.mjs';

const DEC_ID = /^DEC-\d+$/;
const PLAN_ID = /^[A-Z]{1,4}[0-9]?-[0-9]+$/;
const OQ_ID = /^OQ-(\d+)$/;
const LEGACY_PLAN_ID = /^(?:PN|P\d)-\d+$/i;
// 장부 절 제목 표시어(대소문자 무시). 한 제목에 여럿이면 이 순서로 앞선 것
const MARKERS = [
  ['폐기', ['폐기', 'cancel', 'abandon']],
  ['완료', ['완료', 'complete', 'done', 'shipped']],
  ['대기', ['대기', '중단', '보류', 'paused', 'blocked']],
  ['진행', ['진행', '실행 장부', 'in progress', '현재', 'active']],
];
// 같은 작업이 여러 절에 있을 때(1.1.1 우선순위)
const STATUS_ORDER = ['폐기', '진행', '완료', '대기'];
const LABEL = '작업 문서';

const markerOf = (title) => { const t = title.toLowerCase(); return MARKERS.find(([, words]) => words.some((w) => t.includes(w)))?.[0] || null; };
const isResidualTitle = (t) => (/잔여/.test(t) && /질문/.test(t)) || (/remaining/i.test(t) && /question/i.test(t));
const isZeroCell = (c) => c === '' || /^[-—–]+$/.test(c) || /^없음/.test(c);
// 계획 항목 설명: 머리 번호·slug·실행 주체 표시 뒤 첫 콜론 다음. 콜론이 없으면 머리 번호 뒤 글자
const descriptionOf = (item) => {
  let t = item.head && PLAN_ID.test(item.head.id) ? item.head.rest : item.text;
  const k = t.search(/[:：]/);
  if (k >= 0) t = t.slice(k + 1);
  return t.trim().replace(/^[*_~`"'“]+/, '');
};
const cut = (s) => s.trim();

export default function tasks(g, fs, cfg) {
  const c = cfg.tasks;
  const dirs = fs.ls(c.dir).filter((n) => /^\d{8}-/.test(n) && fs.isDir(`${c.dir}/${n}`)).sort();
  if (!dirs.length) return `작업 폴더 없음: ${c.dir}`;
  const index = fs.has(c.index) ? fs.read(c.index) : '';
  const sections = Object.fromEntries(index.split(/^## /m).slice(1).map((s) => [s.split('\n')[0].trim(), s]));
  const mdIn = (rel) => fs.ls(rel).filter((f) => f.endsWith('.md'));
  const heading = (rel) => { if (!rel || !fs.has(rel) || fs.isDir(rel)) return null; const m = fs.read(rel).match(/^#\s+(.+)$/m); return m ? m[1].trim() : null; };
  // 장부 노드(1.1.1 절 이름 규칙 그대로): 현재 실행 장부·실행 대기·중단
  const rows = (s) => (s || '').split('\n').filter((l) => l.startsWith('|') && !/^\|[-\s|]+\|$/.test(l)).slice(1).map((l) => l.split('|').slice(1, -1).map((x) => x.trim()));
  for (const [i, r] of rows(sections['현재 실행 장부']).entries()) g.add('ledger', `running-${i}`, r[0], { state: 'running', owner: r[1], scope: r[2], done: r[3] }, { file: c.index, line: null, rule: 'tasks:index 현재 실행 장부' });
  for (const [i, r] of rows(sections['실행 대기·중단']).entries()) g.add('ledger', `waiting-${i}`, r[0], { state: /^완료/.test(r[1]) ? 'done' : 'waiting', status: r[1], resume: r[2] }, { file: c.index, line: null, rule: 'tasks:index 실행 대기·중단' });

  // 파일 읽기는 한 번: 블록과 원문 줄
  const cache = new Map();
  const doc = (rel) => {
    if (!cache.has(rel)) { const text = fs.read(rel); cache.set(rel, { blocks: readBlocks(text), lines: text.split(/\r?\n/) }); }
    return cache.get(rel);
  };
  const anchor = (file, line) => ({ file, line, excerpt: cut(doc(file).lines[line - 1] ?? '') });

  // 장부 상태: 표 행 중 (<폴더>/ 또는 (<폴더>) 링크를 가진 행만, 절 제목 표시어로 분류
  const ledgerOf = new Map(); // 작업 → { statuses: Set, dropped }
  const unknownSections = new Map(); // 절 제목 줄 → { title, anchors }
  if (index) {
    const ib = readBlocks(index);
    const ilines = index.split(/\r?\n/);
    for (const b of ib) {
      if (b.type !== 'row') continue;
      const names = new Set([...b.cells.join(' | ').matchAll(/\((\d{8}-[^/()\s]+)(?:\/|\))/g)].map((m) => m[1]));
      if (!names.size) continue;
      const marked = b.path.slice().reverse().map((p) => ({ p, m: markerOf(p.text) })).find((x) => x.m);
      if (!marked) {
        const sec = b.path[b.path.length - 1];
        const key = sec ? sec.line : 0;
        if (!unknownSections.has(key)) unknownSections.set(key, { title: sec ? sec.text : '(제목 없음)', anchors: [] });
        unknownSections.get(key).anchors.push({ file: c.index, line: b.line, excerpt: cut(ilines[b.line - 1] ?? '') });
        continue;
      }
      const dropped = /\*\*폐기\*\*|폐기\*\*/.test(b.cells.join(' | '));
      for (const n of names) {
        if (!ledgerOf.has(n)) ledgerOf.set(n, { statuses: new Set(), dropped: false });
        const e = ledgerOf.get(n);
        e.statuses.add(marked.m);
        // 1.1.1 규칙: 장부 완료 행 글자의 **폐기**
        if (dropped && marked.m === '완료') e.dropped = true;
      }
    }
  }

  // 정의 수집: 번호 → [{ task, file, line }]. 노드는 1.1.1처럼 처음 만난 곳에서 만든다
  const definedAt = new Map();
  const struckIds = new Set();
  const define = (id, task, file, line) => { if (!definedAt.has(id)) definedAt.set(id, []); const list = definedAt.get(id); if (!list.some((d) => d.task === task)) list.push({ task, file, line }); };
  // link: 'always' 정의 작업, 'created' 1.1.1 호환 줄(노드를 만든 작업만 잇는다), 'never' 취소선 정의
  const addNode = (task, id, props, file, line, rule, link) => {
    const created = !g.get('decision', id);
    if (created) g.add('decision', id, id, { ...props, file }, { file, line, rule });
    if (link === 'always' || (link === 'created' && created)) g.link('task', task, 'defines', 'decision', id);
  };

  for (const name of dirs) {
    const base = `${c.dir}/${name}`;
    const spec = { initial: fs.has(`${base}/spec/initial.md`), review: fs.has(`${base}/spec/review-log.md`), final: fs.has(`${base}/spec/final.md`) };
    const plan = fs.has(`${base}/task_plan.md`) ? `${base}/task_plan.md` : fs.has(`${base}/plan.md`) ? `${base}/plan.md` : null;
    const phases = mdIn(`${base}/phase`).length;
    const execution = mdIn(`${base}/execution`).length;
    const verification = ['verification.md', 'phase-verification.md'].filter((f) => fs.has(`${base}/${f}`)).map((f) => `${base}/${f}`);
    const stage = verification.length ? '검증' : execution ? '실행' : plan && phases ? 'phase 계획' : plan ? '계획' : spec.final ? '스펙 확정' : spec.initial ? '스펙 초안' : '조사·기록';
    const specFile = spec.final ? `${base}/spec/final.md` : fs.has(`${base}/final.md`) && !fs.isDir(`${base}/final.md`) ? `${base}/final.md` : null;
    const readLines = {};
    const read = (file, line) => { (readLines[file] ||= []).push(line); };
    const notes = {};

    // 계획 파일: task_plan.md → plan.md → 체크박스를 가진 유일한 루트 md
    const checkboxes = (file) => doc(file).blocks.filter((b) => b.type === 'item' && b.checkbox !== null);
    let planFile = plan, planReading = 'rule';
    let rootBoxes = [];
    if (!plan) {
      rootBoxes = fs.ls(base).filter((f) => f.endsWith('.md') && !fs.isDir(`${base}/${f}`)).sort().map((f) => `${base}/${f}`).filter((f) => checkboxes(f).length);
      if (rootBoxes.length === 1) { planFile = rootBoxes[0]; notes.plan = `대체 규칙: 체크박스를 가진 유일한 루트 문서 ${planFile}`; }
      else if (rootBoxes.length > 1) planReading = 'unknown';
      else planReading = 'none';
    }
    const planText = plan ? fs.read(plan) : '';
    const led = ledgerOf.get(name);
    // 상태: 계획 문서 머리·장부 완료 행의 **폐기**, 그다음 장부 절 표시어(폐기·진행·완료·대기), 없으면 기록
    const status = /\*\*폐기\*\*/.test(planText.slice(0, 2000)) || led?.dropped ? '폐기' : STATUS_ORDER.find((s) => led?.statuses.has(s)) || '기록';
    const title = heading(plan) || heading(`${base}/spec/final.md`) || heading(`${base}/spec/initial.md`) || heading(`${base}/README.md`) || heading(`${base}/${mdIn(base)[0] || ''}`) || name.slice(9);

    const issues = [];
    const issue = (code, message, anchors, extra = {}) => issues.push([code, message, anchors, extra]);

    // 결정: 스펙 final 목록 머리 번호(굵게 포함, 취소선 제외)만 센다. 표 첫 칸 DEC 번호는 후보 줄
    let dec = 0, oq = 0;
    const decTable = [];
    if (specFile) {
      const { blocks } = doc(specFile);
      for (const b of blocks) {
        if (b.type === 'item' && b.head && DEC_ID.test(b.head.id)) {
          if (b.head.struck) { struckIds.add(b.head.id); addNode(name, b.head.id, { kind: 'spec-dec' }, specFile, b.line, 'tasks:- DEC-nn', 'never'); continue; }
          dec += 1;
          read(specFile, b.line);
          define(b.head.id, name, specFile, b.line);
          addNode(name, b.head.id, { kind: 'spec-dec' }, specFile, b.line, 'tasks:- DEC-nn', 'always');
        } else if (b.type === 'row' && /DEC-\d+/.test(b.cells[0])) decTable.push(b.line);
      }
      // oq: 1.1.1 규칙(spec/final.md의 `| OQ-n |` 표 행 수) 그대로
      if (spec.final) oq = (fs.read(specFile).match(/^\| OQ-\d+ \|/gm) || []).length;
    }
    if (decTable.length) issue('tasks.unread-definition', `스펙 final 표 첫 칸의 결정 번호 ${decTable.length}줄을 규칙으로 읽지 않음`, decTable.map((l) => anchor(specFile, l)));
    // 1.1.1 호환 노드: 계획 파일의 `- DEC-nn` 목록 줄(옮겨 적기). 결정 수·정의 작업·후보에 들지 않는다
    if (plan) for (const b of doc(plan).blocks) if (b.type === 'item' && b.marker === '-' && b.indent === 0 && b.checkbox === null && b.head && !b.head.bold && !b.head.struck && DEC_ID.test(b.head.id)) addNode(name, b.head.id, { kind: 'spec-dec' }, plan, b.line, 'tasks:- DEC-nn', 'created');

    // 계획 항목: 계획 파일의 체크박스 전부. 머리 번호가 있으면 정의
    let pnDone = 0, pnOpen = 0;
    const checked = [];
    if (planFile) {
      for (const b of checkboxes(planFile)) {
        if (b.checked) { pnDone += 1; checked.push(b); } else pnOpen += 1;
        read(planFile, b.line);
        if (b.head && !b.head.struck && PLAN_ID.test(b.head.id)) {
          define(b.head.id, name, planFile, b.line);
          addNode(name, b.head.id, { kind: 'plan-item', done: b.checked }, planFile, b.line, 'tasks:- [ ] PN-nn', 'always');
        }
      }
      if (planReading === 'rule' && pnDone + pnOpen === 0) planReading = 'none';
    } else if (rootBoxes.length > 1) {
      issue('tasks.unread-checklist', `계획 파일 없이 체크박스를 가진 루트 문서 ${rootBoxes.length}개`, rootBoxes.flatMap((f) => checkboxes(f).map((b) => anchor(f, b.line))));
      notes.plan = `계획 파일이 없고 체크박스를 가진 루트 문서가 ${rootBoxes.length}개: ${rootBoxes.join(', ')}`;
    }
    // 1.1.1 호환 노드: 스펙 final의 계획 초안 체크박스(PN·P<숫자>). 계획 항목 수·정의 작업에 들지 않는다
    if (spec.final) for (const b of checkboxes(`${base}/spec/final.md`)) if (b.head && LEGACY_PLAN_ID.test(b.head.id)) addNode(name, b.head.id.toUpperCase(), { kind: 'plan-item', done: b.checked }, `${base}/spec/final.md`, b.line, 'tasks:- [ ] PN-nn', 'created');

    // 잔여 질문: 제목에 잔여+질문(remaining+question)이 든 마지막 절의 첫 표
    let openQuestions = 0, openQuestionIds = [], qReading = 'none';
    if (status === '폐기') qReading = 'none';
    else if (!specFile) { if (spec.initial || spec.review) { qReading = 'unknown'; openQuestions = null; notes.openQuestions = '검토 전: spec/final.md 없음'; } }
    else {
      const { blocks } = doc(specFile);
      const secs = blocks.filter((b) => b.type === 'heading' && isResidualTitle(b.text));
      if (!secs.length) {
        qReading = 'unknown'; openQuestions = null;
        notes.openQuestions = `잔여 질문 절 없음: ${specFile}`;
        issue('tasks.questions-unknown', '스펙 final에 잔여 질문 절 없음', [{ file: specFile, line: null }]);
      } else {
        const sec = secs[secs.length - 1];
        if (secs.length > 1) notes.openQuestions = `잔여 질문 절 ${secs.length}개 중 마지막(${sec.line}줄)을 읽음`;
        const inSec = blocks.filter((b) => b.type !== 'heading' && b.path.some((p) => p.line === sec.line));
        const tableRows = inSec.filter((b) => b.type === 'row');
        const first = tableRows.length ? tableRows[0].table : null;
        const rowsOf = tableRows.filter((b) => b.table === first && !b.header);
        const none = inSec.find((b) => b.type === 'text' && /^없음/.test(b.text));
        if (first === null && !none) {
          qReading = 'unknown'; openQuestions = null;
          notes.openQuestions = `잔여 질문 절에 표도 \`없음:\` 줄도 없음: ${specFile}:${sec.line}`;
          issue('tasks.questions-unknown', '잔여 질문 절에 표도 없음: 줄도 없음', [anchor(specFile, sec.line)]);
        } else {
          if (none && first === null) read(specFile, none.line);
          const ids = [], odd = [];
          for (const b of rowsOf) {
            const cell = b.cells[0];
            if (b.head && !b.head.struck && OQ_ID.test(b.head.id) && b.head.rest.trim() === '') { ids.push({ id: b.head.id, n: Number(b.head.id.match(OQ_ID)[1]), line: b.line }); read(specFile, b.line); }
            else if (isZeroCell(cell)) read(specFile, b.line);
            else odd.push(b.line);
          }
          // 질문 닫힘: 체크한 계획 항목의 설명이 같은 번호로 시작(숫자 앞 0 무시)
          const closes = (q) => checked.some((b) => { const m = descriptionOf(b).match(/^OQ-0*(\d+)(?!\d)/); return m && Number(m[1]) === q.n; });
          const open = ids.filter((q) => !closes(q));
          openQuestions = open.length;
          openQuestionIds = open.map((q) => q.id);
          qReading = 'rule';
          if (odd.length) {
            qReading = 'partial';
            issue('tasks.unread-definition', `잔여 질문 표에서 첫 칸이 번호 하나가 아닌 행 ${odd.length}`, odd.map((l) => anchor(specFile, l)));
          }
          if (status === '완료' && open.length) {
            qReading = 'partial';
            issue('tasks.questions-open-done', `완료 작업에 닫히지 않은 잔여 질문 ${open.length}`, open.map((q) => anchor(specFile, q.line)), {
              judgmentDraft: { task: name, questions: { items: open.map((q) => ({ id: q.id, state: null, at: null })) } },
            });
          }
        }
      }
    }
    // 폐기 작업의 잔여 질문 표는 읽되 세지 않는다
    if (status === '폐기' && specFile) {
      const { blocks } = doc(specFile);
      const secs = blocks.filter((b) => b.type === 'heading' && isResidualTitle(b.text));
      const sec = secs[secs.length - 1];
      if (sec) for (const b of blocks) if (b.type === 'row' && b.path.some((p) => p.line === sec.line)) read(specFile, b.line);
    }

    // 단계: 파이프라인 문서가 없으면 1.1.1 기본값 문자열에 읽기 상태 unknown
    const noPipeline = stage === '조사·기록';
    if (noPipeline && (status === '진행' || status === '대기')) issue('tasks.stage-unknown', `${status} 작업에 파이프라인 문서 없음`, []);

    const ref = fs.hasGit() ? fs.resolveRef(cfg.git?.branch || 'main') : null;
    const recent = ref ? Number(fs.git('rev-list', '--count', ref, `--since=${cfg.git?.sinceDays || 14} days ago`, '--', base) || 0) : 0;
    // 위키 출처 수: wiki.sources 설정이 없으면 0
    const wikiSources = cfg.wiki?.sources && fs.has(cfg.wiki.sources) ? (fs.read(cfg.wiki.sources).match(new RegExp(name, 'g')) || []).length : 0;
    for (const f of Object.keys(readLines)) readLines[f] = [...new Set(readLines[f])].sort((a, b) => a - b);
    const node = g.add('task', name, title, {
      date: `${name.slice(0, 4)}-${name.slice(4, 6)}-${name.slice(6, 8)}`, slug: name.slice(9), stage, status, spec, plan, phases, execution, verification, dec, pnDone, pnOpen, oq,
      recentCommits: recent, wikiSources, files: fs.walk(base, (p) => p.endsWith('.md')).length, last: fs.lastCommit(base),
      openQuestions, openQuestionIds, planFile, specFile, readLines,
    }, { file: plan || base, line: 1, rule: 'tasks:folder' });
    setReading(node, 'plan', planReading, notes.plan);
    setReading(node, 'openQuestions', qReading, notes.openQuestions);
    setReading(node, 'stage', noPipeline ? 'unknown' : 'rule', noPipeline ? '파이프라인 문서 없음(스펙·계획·phase·execution·검증 문서)' : undefined);
    if (specFile && !spec.final) node.props.readingNotes.spec = `스펙 final 대체: ${specFile}`;
    for (const [code, message, anchors, extra] of issues) g.issue('warn', LABEL, message, { code, subject: { kind: 'task', id: name }, anchors, ...extra });
  }

  // 장부: 표시어 없는 절의 작업 링크 행
  for (const { title, anchors } of unknownSections.values()) g.issue('warn', '작업 장부', `표시어가 없는 절의 작업 링크 행 ${anchors.length}: ${title}`, { code: 'tasks.index-section-unknown', subject: { kind: 'ledger', id: title }, anchors });

  // 번호마다 정의한 작업 목록. 취소선 정의만 있는 번호는 struck
  for (const d of g.of('decision')) {
    if (d.props.kind === 'wiki') continue;
    const list = (definedAt.get(d.id) || []).slice().sort((a, b) => a.task.localeCompare(b.task));
    d.props.definers = list.map((x) => x.task);
    d.props.definedAt = list;
    if (!list.length && struckIds.has(d.id)) d.props.struck = true;
  }
  return null;
}
