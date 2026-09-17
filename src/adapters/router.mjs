// 화면 어댑터: React Router의 <Route> 선언에서 screen 노드를 만든다. 페이지와 그 로컬 import 닫힘에서 데이터 출처(live/mock/mixed)를 읽고,
// 리터럴 추출 닫힘의 /api/ 문자열 리터럴을 화면 노드 apiLiterals에 적는다. API 노드 대응·calls 엣지는 모든 어댑터 뒤 연결 단계(src/link.mjs)가 한다.
// router.hookApi가 있으면 1.x 동안 1.1.1처럼 대응표로 노드와 엣지를 만들고(합집합), 쓴 키를 hookApiKeys에 남긴다(연결 단계의 정리 경고용).
import { relative } from 'node:path';
import { fileClosure, literalSources, appDirOf } from '../lib/closure.mjs';
import { extractApiLiterals } from '../lib/literals.mjs';

export default function router(g, fs, cfg) {
  const c = cfg.router;
  if (!fs.has(c.app)) return `라우터 파일 없음: ${c.app}`;
  const pageFiles = fs.walk(c.pagesDir, (p) => /\.tsx?$/.test(p));
  const owner = new Map();
  for (const f of pageFiles) for (const m of fs.read(f).matchAll(/export\s+(?:function|const)\s+([A-Z]\w+)/g)) owner.set(m[1], f);

  const hookApi = c.hookApi || null;
  const appDir = appDirOf(c.app);
  const classify = (file) => {
    // 화면 files·source·mockVia·fixedVia는 1.1.1 파일 닫힘 그대로(리터럴 추출 닫힘은 여기에 쓰지 않는다)
    const files = [...fileClosure(fs, file, c.localDirs)];
    const all = files.map(fs.read).join('\n');
    const mockVia = files.filter((f) => fs.read(f).includes(c.mockPattern));
    // 코드에 고정된 표시값(이름·사진·문구·가격 표시)을 읽는 파일. 출처 분류는 바꾸지 않고 따로 센다.
    const fixedVia = c.fixedPattern ? files.filter((f) => fs.read(f).includes(c.fixedPattern)) : [];
    const live = all.includes(c.livePattern);
    const hookNames = Object.keys(hookApi || {});
    const hooks = hookNames.length ? [...new Set([...all.matchAll(new RegExp(`use(${hookNames.join('|')})\\b`, 'g'))].map((m) => m[1]))] : [];
    const source = mockVia.length && live ? 'mixed' : mockVia.length ? 'mock' : live ? 'live' : 'static';
    return { files, mockVia: mockVia.map((f) => relative('web/src', f)), fixedVia: fixedVia.map((f) => relative('web/src', f)), source, hooks: hooks.filter((h) => hookApi[h]), apiLiterals: literalsOf(file) };
  };
  // 리터럴: 파일·줄·경로가 같은 것은 한 번. 파일 방문 순서, 줄 순
  const literalsOf = (file) => {
    const out = [], seen = new Set();
    for (const src of literalSources(fs, file, { localDirs: c.localDirs, appDir })) {
      const text = fs.read(src.file);
      const chunks = src.ranges ? src.ranges.map(([s, e]) => [text.split('\n').slice(s, e).join('\n'), s + 1]) : [[text, 1]];
      for (const [chunk, start] of chunks) {
        for (const lit of extractApiLiterals(chunk, start)) {
          const key = `${src.file}:${lit.line}:${lit.path}:${lit.open ? 1 : 0}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ path: lit.path, ...(lit.open ? { open: true } : {}), file: src.file, line: lit.line, matched: [] });
        }
      }
    }
    return out;
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
      const cls = file ? classify(file) : { files: [], mockVia: [], fixedVia: [], source: 'static', hooks: [], apiLiterals: [] };
      const props = { component: m[3], file, guarded: /[gG]uard\(/.test(line) || parent !== null, source: cls.source, mockVia: cls.mockVia, fixedVia: cls.fixedVia, files: cls.files, last: file ? fs.lastCommit(file) : null, apiLiterals: cls.apiLiterals };
      if (hookApi) props.hookApiKeys = cls.hooks;
      g.add('screen', path, path, props, { file: c.app, line: i + 1, rule: 'router:<Route path>' });
      for (const h of cls.hooks) { const a = hookApi[h]; g.add('api', a, a); g.link('screen', path, 'calls', 'api', a); }
      n += 1;
    }
    if (/<\/Route>/.test(line)) parent = null;
  });
  return n === 0 ? '라우트 0건' : null;
}
