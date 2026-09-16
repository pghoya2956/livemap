// 변경 어댑터: 최근 N일 main 커밋을 commit 노드로 만들고, 건드린 파일을 screen(페이지·닫힘 파일)·api·migration 노드에 changes 엣지로 잇는다.
export default function gitAdapter(g, fs, cfg) {
  const c = cfg.git;
  if (!fs.hasGit()) return 'git 없음';
  const ref = fs.resolveRef(c.branch);
  if (!ref) return `브랜치 없음: ${c.branch}`;
  const head = fs.git('rev-parse', ref);
  const log = fs.git('log', ref, `--since=${c.sinceDays} days ago`, '--format=%x1e%h|%ad|%an|%s', '--date=iso-strict', '--name-only');
  const areaOf = (p) => { for (const [prefix, area] of c.areas) if (prefix.startsWith('.') && !prefix.includes('/') ? p.endsWith(prefix) : p.startsWith(prefix)) return area; return '기타'; };
  const fileToScreens = {};
  for (const s of g.of('screen')) for (const f of s.props.files || []) (fileToScreens[f] ||= []).push(s.id);
  const serverFile = cfg.bff?.server || null;
  let n = 0;
  for (const chunk of log.split('\x1e').filter(Boolean)) {
    const [headLine, ...rest] = chunk.trim().split('\n');
    const [sha, date, author, ...s] = headLine.split('|');
    const files = rest.filter(Boolean);
    const areas = [...new Set(files.map(areaOf))];
    const runtime = files.some((f) => c.runtimePaths.some((p) => f === p || f.startsWith(p + '/')));
    g.add('commit', sha, s.join('|'), { date, author, files: files.length, areas, runtime }, { file: null, line: null, rule: `git:log ${ref}` });
    for (const f of files) {
      for (const sid of fileToScreens[f] || []) g.link('commit', sha, 'changes', 'screen', sid);
      if (f === serverFile) for (const a of g.of('api')) g.link('commit', sha, 'changes', 'api', a.id);
      if (cfg.migrations?.dir && f.startsWith(cfg.migrations.dir + '/')) { const id = f.split('/').pop(); if (g.get('migration', id)) g.link('commit', sha, 'changes', 'migration', id); }
    }
    n += 1;
  }
  g.add('deploy', 'head', 'main', { sha: head.slice(0, 7), full: head, subject: fs.git('log', '-1', '--format=%s', ref), date: fs.git('log', '-1', '--format=%ad', '--date=iso-strict', ref) }, { file: null, line: null, rule: 'git:rev-parse' });
  return n === 0 ? `${c.sinceDays}일 커밋 0건` : null;
}
