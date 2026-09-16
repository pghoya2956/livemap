// 작업 어댑터: tasks/<date>-<slug>/ 폴더에서 task 노드를 만든다. 단계는 폴더 안 문서로, 상태는 폴더 문서를 먼저 보고 장부(tasks/index.md)를 보조로 판정한다.
// DEC-nn·PN-nn 정의 위치를 defines 엣지로 남겨 여정 장면의 refs가 스펙 문서로 이어지게 한다.
export default function tasks(g, fs, cfg) {
  const c = cfg.tasks;
  const dirs = fs.ls(c.dir).filter((n) => /^\d{8}-/.test(n) && fs.isDir(`${c.dir}/${n}`)).sort();
  if (!dirs.length) return `작업 폴더 없음: ${c.dir}`;
  const index = fs.has(c.index) ? fs.read(c.index) : '';
  const sections = Object.fromEntries(index.split(/^## /m).slice(1).map((s) => [s.split('\n')[0].trim(), s]));
  const mdIn = (rel) => fs.ls(rel).filter((f) => f.endsWith('.md'));
  const heading = (rel) => { if (!rel || !fs.has(rel) || fs.isDir(rel)) return null; const m = fs.read(rel).match(/^#\s+(.+)$/m); return m ? m[1].trim() : null; };
  // 장부 행 파싱: 현재 실행 장부·실행 대기·완료 작업
  const rows = (s) => (s || '').split('\n').filter((l) => l.startsWith('|') && !/^\|[-\s|]+\|$/.test(l)).slice(1).map((l) => l.split('|').slice(1, -1).map((x) => x.trim()));
  for (const [i, r] of rows(sections['현재 실행 장부']).entries()) g.add('ledger', `running-${i}`, r[0], { state: 'running', owner: r[1], scope: r[2], done: r[3] }, { file: c.index, line: null, rule: 'tasks:index 현재 실행 장부' });
  for (const [i, r] of rows(sections['실행 대기·중단']).entries()) g.add('ledger', `waiting-${i}`, r[0], { state: /^완료/.test(r[1]) ? 'done' : 'waiting', status: r[1], resume: r[2] }, { file: c.index, line: null, rule: 'tasks:index 실행 대기·중단' });

  for (const name of dirs) {
    const base = `${c.dir}/${name}`;
    const spec = { initial: fs.has(`${base}/spec/initial.md`), review: fs.has(`${base}/spec/review-log.md`), final: fs.has(`${base}/spec/final.md`) };
    const plan = fs.has(`${base}/task_plan.md`) ? `${base}/task_plan.md` : fs.has(`${base}/plan.md`) ? `${base}/plan.md` : null;
    const phases = mdIn(`${base}/phase`).length;
    const execution = mdIn(`${base}/execution`).length;
    const verification = ['verification.md', 'phase-verification.md'].filter((f) => fs.has(`${base}/${f}`)).map((f) => `${base}/${f}`);
    const stage = verification.length ? '검증' : execution ? '실행' : plan && phases ? 'phase 계획' : plan ? '계획' : spec.final ? '스펙 확정' : spec.initial ? '스펙 초안' : '조사·기록';
    const doneRow = (sections['완료 작업'] || '').split('\n').find((l) => l.includes(`(${name}/`)) || '';
    const mention = (sec) => (sections[sec] || '').includes(`(${name}/`);
    const planText = plan ? fs.read(plan) : '';
    // 폴더 문서 우선: 계획 문서에 폐기·완료 표기가 있으면 그것, 없으면 장부
    const status = /\*\*폐기\*\*/.test(planText.slice(0, 2000)) || /\*\*폐기\*\*|폐기\*\*/.test(doneRow) ? '폐기'
      : mention('현재 실행 장부') ? '진행'
      : doneRow ? '완료'
      : mention('실행 대기·중단') ? '대기'
      : mention('현재 작업') ? '진행' : '기록';
    const title = heading(plan) || heading(`${base}/spec/final.md`) || heading(`${base}/spec/initial.md`) || heading(`${base}/README.md`) || heading(`${base}/${mdIn(base)[0] || ''}`) || name.slice(9);
    let dec = 0, pnDone = 0, pnOpen = 0, oq = 0;
    for (const f of [`${base}/spec/final.md`, plan].filter((f) => f && fs.has(f))) {
      const t = fs.read(f);
      for (const m of t.matchAll(/^- (DEC-\d+)/gm)) { dec += 1; if (!g.get('decision', m[1])) { g.add('decision', m[1], m[1], { kind: 'spec-dec', file: f }, { file: f, line: fs.lineOf(t, m[0]), rule: 'tasks:- DEC-nn' }); g.link('task', name, 'defines', 'decision', m[1]); } }
      for (const m of t.matchAll(/^- \[(x| )\] ((?:PN|P\d)-\d+)/gim)) {
        const done = m[1].toLowerCase() === 'x'; if (done) pnDone += 1; else pnOpen += 1;
        const pid = m[2].toUpperCase();
        if (!g.get('decision', pid)) { g.add('decision', pid, pid, { kind: 'plan-item', done, file: f }, { file: f, line: fs.lineOf(t, m[0]), rule: 'tasks:- [ ] PN-nn' }); g.link('task', name, 'defines', 'decision', pid); }
      }
      oq += (t.match(/^\| OQ-\d+ \|/gm) || []).length;
    }
    const ref = fs.hasGit() ? fs.resolveRef(cfg.git?.branch || 'main') : null;
    const recent = ref ? Number(fs.git('rev-list', '--count', ref, `--since=${cfg.git?.sinceDays || 14} days ago`, '--', base) || 0) : 0;
    const wikiSources = fs.has(cfg.wiki?.sources) ? (fs.read(cfg.wiki?.sources).match(new RegExp(name, 'g')) || []).length : 0;
    g.add('task', name, title, { date: `${name.slice(0, 4)}-${name.slice(4, 6)}-${name.slice(6, 8)}`, slug: name.slice(9), stage, status, spec, plan, phases, execution, verification, dec, pnDone, pnOpen, oq, recentCommits: recent, wikiSources, files: fs.walk(base, (p) => p.endsWith('.md')).length, last: fs.lastCommit(base) }, { file: plan || base, line: 1, rule: 'tasks:folder' });
  }
  return null;
}
