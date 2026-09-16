import { join } from 'node:path';
// 검사 어댑터: tests/ 파일에서 test 노드를 만들고, 파일 안의 goto('/…')·'/api/…' 문자열로 screen·api를 덮는(covers) 엣지를 잇는다.
export default function tests(g, fs, cfg) {
  const c = cfg.tests;
  const files = fs.walk(c.dir, (p) => /\.(test|spec)\.mjs$/.test(p));
  if (!files.length) return `검사 파일 없음: ${c.dir}`;
  const gate = new RegExp(c.gatePattern);
  // 검사 파일이 helpers를 거쳐 API를 부르는 경우가 많아, 같은 폴더 안 로컬 import를 닫힘으로 합쳐 본다.
  const closure = (file, depth = 2, seen = new Set()) => {
    if (seen.has(file) || depth < 0) return seen;
    seen.add(file);
    for (const m of fs.read(file).matchAll(/from\s+'(\.[^']+)'/g)) {
      const t = join(file, '..', m[1]);
      if (t.startsWith(c.dir + '/') && fs.has(t)) closure(t, depth - 1, seen);
    }
    return seen;
  };
  for (const f of files) {
    const own = fs.read(f);
    const t = [...closure(f)].map(fs.read).join('\n');
    const count = (own.match(/^\s*(?:test|it)\(/gm) || []).length;
    const id = f;
    g.add('test', id, f.replace(`${c.dir}/`, '').replace(/\.(test|spec)\.mjs$/, ''), { kind: f.endsWith('.spec.mjs') ? 'e2e' : 'unit', count, gated: gate.test(own) }, { file: f, line: 1, rule: 'tests:test(|it(' });
    for (const s of g.of('screen')) {
      const goto = s.id.replace(/:\w+/g, '');
      if ((goto.length > 1 && t.includes(`goto('${goto}`)) || (s.id === '/' && t.includes("goto('/')"))) g.link('test', id, 'covers', 'screen', s.id);
    }
    for (const a of g.of('api')) {
      const key = a.id.replace(':id', '');
      if (t.includes(`'${a.id}'`) || (a.id.includes(':id') && new RegExp(`'${key}[^']`).test(t))) g.link('test', id, 'covers', 'api', a.id);
    }
    // DB 함수 직접 호출(rpc('name') 또는 /rest/v1/rpc/name)
    for (const f of g.of('function')) {
      if (new RegExp(`rpc\\(\\s*['\"\`]${f.id}['\"\`]|/rpc/${f.id}\\b`).test(t)) g.link('test', id, 'covers', 'function', f.id);
    }
  }
  return null;
}
