// 화면 어댑터: React Router의 <Route> 선언에서 screen 노드를 만든다. 페이지와 그 로컬 import 닫힘에서 데이터 출처(live/mock/mixed)와 호출 API를 읽는다.
import { join, relative } from 'node:path';

export default function router(g, fs, cfg) {
  const c = cfg.router;
  if (!fs.has(c.app)) return `라우터 파일 없음: ${c.app}`;
  const pageFiles = fs.walk(c.pagesDir, (p) => /\.tsx?$/.test(p));
  const owner = new Map();
  for (const f of pageFiles) for (const m of fs.read(f).matchAll(/export\s+(?:function|const)\s+([A-Z]\w+)/g)) owner.set(m[1], f);

  const resolveLocal = (from, spec) => {
    const base = join(from, '..', spec);
    for (const cand of [base + '.tsx', base + '.ts', join(base, 'index.tsx'), join(base, 'index.ts')]) if (fs.has(cand)) return cand;
    return null;
  };
  const closure = (file, depth = 3, seen = new Set()) => {
    if (seen.has(file) || depth < 0) return seen;
    seen.add(file);
    for (const m of fs.read(file).matchAll(/from\s+'(\.[^']+)'/g)) {
      const t = resolveLocal(file, m[1]);
      if (t && c.localDirs.some((d) => t.startsWith(d + '/'))) closure(t, depth - 1, seen);
    }
    return seen;
  };
  const classify = (file) => {
    const files = [...closure(file)];
    const all = files.map(fs.read).join('\n');
    const mockVia = files.filter((f) => fs.read(f).includes(c.mockPattern));
    // 코드에 고정된 표시값(이름·사진·문구·가격 표시)을 읽는 파일. 출처 분류는 바꾸지 않고 따로 센다.
    const fixedVia = c.fixedPattern ? files.filter((f) => fs.read(f).includes(c.fixedPattern)) : [];
    const live = all.includes(c.livePattern);
    const hookNames = Object.keys(c.hookApi || {});
    const hooks = hookNames.length ? [...new Set([...all.matchAll(new RegExp(`use(${hookNames.join('|')})\\b`, 'g'))].map((m) => m[1]))] : [];
    const source = mockVia.length && live ? 'mixed' : mockVia.length ? 'mock' : live ? 'live' : 'static';
    return { files, mockVia: mockVia.map((f) => relative('web/src', f)), fixedVia: fixedVia.map((f) => relative('web/src', f)), source, apis: hooks.map((h) => c.hookApi[h]).filter(Boolean) };
  };

  const app = fs.read(c.app);
  let parent = null, n = 0;
  app.split('\n').forEach((line, i) => {
    const m = line.match(/<Route\s+(?:path="([^"]+)"|(index))[^>]*element=\{(?:\w*[gG]uard\()?<(\w+)/);
    if (m) {
      const own = m[2] ? '' : m[1];
      const path = parent ? (own ? `${parent}/${own}` : parent) : own;
      const isLayout = !/\/>\s*$/.test(line.trim()) && !/<\/Route>/.test(line);
      if (isLayout) { parent = m[1]; return; }
      if (path === '*' || path.endsWith('/*')) return;
      const file = owner.get(m[3]) || null;
      const cls = file ? classify(file) : { files: [], mockVia: [], fixedVia: [], source: 'static', apis: [] };
      g.add('screen', path, path, { component: m[3], file, guarded: /[gG]uard\(/.test(line) || parent !== null, source: cls.source, mockVia: cls.mockVia, fixedVia: cls.fixedVia, files: cls.files, last: file ? fs.lastCommit(file) : null }, { file: c.app, line: i + 1, rule: 'router:<Route path>' });
      for (const a of cls.apis) { g.add('api', a, a); g.link('screen', path, 'calls', 'api', a); }
      n += 1;
    }
    if (/<\/Route>/.test(line)) parent = null;
  });
  return n === 0 ? '라우트 0건' : null;
}
