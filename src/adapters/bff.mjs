// API 어댑터: BFF(app/server.mjs)의 라우트 목록 항목 route('METHOD', '/api/…', …) 또는 url.pathname 분기에서 api 노드를 만들고,
// 핸들러 블록의 rpc/·rpcCall('이름')·auth 호출을 function 노드로 잇는다.
export default function bff(g, fs, cfg) {
  const c = cfg.bff;
  if (!fs.has(c.server)) return `서버 파일 없음: ${c.server}`;
  const server = fs.read(c.server);
  const lines = server.split('\n');
  const isRouteLine = (l) => /url\.pathname === '\/api\/[^']+'/.test(l) || /url\.pathname\.match\(/.test(l) || /^\s*route\('/.test(l) || /^\];/.test(l);
  let n = 0;
  const seenPaths = new Set();
  lines.forEach((line, i) => {
    const m = line.match(/^\s*route\('(\w+)', '(\/api\/[^']+)'/) || line.match(/req\.method === '(\w+)' && url\.pathname === '([^']+)'/) || line.match(/url\.pathname === '(\/api\/[^']+)'/);
    if (!m) return;
    const method = m.length === 3 ? m[1] : 'POST';
    const path = m.length === 3 ? m[2] : m[1];
    if (!path.startsWith('/api')) return;
    let end = i + 1;
    while (end < lines.length && !isRouteLine(lines[end])) end += 1;
    const block = lines.slice(i, end).join('\n');
    const rpc = [...new Set([...block.matchAll(/rpc\/(\w+)|rpcCall\('(\w+)'/g)].map((x) => x[1] || x[2]))];
    const auth = [...new Set([...block.matchAll(/\/auth\/v1\/(\w+)/g)].map((x) => 'auth:' + x[1]))];
    // 같은 경로가 메서드별로 따로 있으면(GET·POST /api/teams) id를 "METHOD 경로"로 나눈다.
    const id = seenPaths.has(path) ? `${method} ${path}` : path;
    seenPaths.add(path);
    g.add('api', id, `${method} ${path}`, { method, calls: [...rpc, ...auth] }, { file: c.server, line: i + 1, rule: /route\('/.test(line) ? 'bff:route()' : 'bff:url.pathname ===' });
    for (const f of rpc) { g.add('function', f, f); g.link('api', id, 'invokes', 'function', f); }
    n += 1;
  });
  for (const d of c.dynamicRoutes || []) {
    if (!server.includes(d.match)) continue;
    const line = fs.lineOf(server, d.match);
    for (const [method, path, calls] of d.routes) {
      g.add('api', path, `${method} ${path}`, { method, calls }, { file: c.server, line, rule: 'bff:config.dynamicRoutes' });
      for (const f of calls) { g.add('function', f, f); g.link('api', path, 'invokes', 'function', f); }
      n += 1;
    }
  }
  return n === 0 ? 'API 0건' : null;
}
