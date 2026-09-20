// 로컬 뷰와 export. 127.0.0.1 전용.
// 브라우저 주소 → 파일 배치는 locate() 하나가 정하고, serve(재빌드)·serve --static·export가 같은 배치를 쓴다.
//   /map/  /map/map.css  /map/map.js  /map/fonts/*   → 화면 폴더(패키지 site/)
//   /map/captures/<id>.jpg                           → 캡처 폴더(프로젝트 config.captures.site)
//   /map/data/*.json                                 → 생성물 폴더(--out)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, copyFileSync, writeFileSync } from 'node:fs';
import { join, extname, resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
export const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'site');
export const DATA_FILES = ['data.json', 'overview.json', 'graph.json'];
// 구조 지도(2.1.0)의 두 파일. graphify 어댑터가 없는 프로젝트에는 없으므로 선택 파일이다: 있으면 서빙·내보내기에 담고 없어도 실패하지 않는다
export const OPTIONAL_DATA_FILES = ['architecture.md', 'architecture.json'];
export const EXPORT_MARK = '.livemap-export';
export const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

// 주소(/map/ 아래 경로)를 { kind, rel }로 푼다. 숨김 파일·경로 탈출은 null.
export function locate(pathname) {
  if (!pathname.startsWith('/map/')) return null;
  let rel = pathname.slice('/map/'.length);
  if (rel === '') rel = 'index.html';
  let parts;
  try { parts = rel.split('/').map((p) => decodeURIComponent(p)); } catch { return null; }
  if (parts.some((p) => p === '' || p.startsWith('.') || /[\\/\0]/.test(p))) return null;
  if (parts[0] === 'data') return parts.length === 2 ? { kind: 'data', rel: parts[1] } : null;
  if (parts[0] === 'captures') return parts.length === 2 ? { kind: 'captures', rel: parts[1] } : null;
  return { kind: 'site', rel: parts.join('/') };
}

const inside = (base, file) => file === base || file.startsWith(base.endsWith(sep) ? base : base + sep);

// 배치 종류별 원본 폴더. 재빌드 서빙은 패키지·프로젝트·생성물 세 곳, static은 export 폴더 한 곳.
export function sourcesFor({ static: dir, out, captures }) {
  if (dir) return { site: dir, captures: join(dir, 'captures'), data: join(dir, 'data') };
  return { site: SITE, captures, data: out };
}

export function serve({ root, out, port, build, captures, static: staticDir }) {
  const src = sourcesFor({ static: staticDir, out, captures });
  let last = 0;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;
    if (path === '/' || path === '/map') { res.writeHead(302, { location: '/map/' }); return res.end(); }
    // 배포 서빙과 같은 CSP를 걸어 인라인 스타일·스크립트 의존을 로컬에서 먼저 잡는다.
    res.setHeader('content-security-policy', CSP);
    const loc = locate(path);
    if (!loc) { res.writeHead(path.startsWith('/map/') ? 403 : 404); return res.end('not found'); }
    try {
      if (loc.kind === 'data' && !staticDir && Date.now() - last > 5000) { await build(); last = Date.now(); }
      const base = src[loc.kind];
      const file = resolve(base, loc.rel);
      if (!inside(base, file)) { res.writeHead(403); return res.end(); }
      if (!(await stat(file)).isFile()) throw new Error('not a file');
      const cache = loc.kind === 'data' ? 'no-store' : 'no-cache';
      res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': cache });
      res.end(await readFile(file));
    } catch {
      res.writeHead(404); res.end('not found');
    }
  });
  const label = staticDir ? `static ${staticDir}` : `root ${root}`;
  server.listen(port, '127.0.0.1', () => console.log(`map serve → http://127.0.0.1:${port}/map/  (${label})`));
  return server;
}

// 폴더 안 파일을 숨김 파일 빼고 상대 경로로 나열한다.
function listFiles(dir, prefix = '') {
  if (!existsSync(dir)) return [];
  const acc = [];
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith('.')) continue;
    const abs = join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(abs).isDirectory()) acc.push(...listFiles(abs, rel));
    else acc.push(rel);
  }
  return acc;
}

// export 폴더를 serve --static이 읽는 배치(locate의 역)로 만든다. 종료 코드를 돌려준다.
export function exportSite({ out, captures, target }) {
  const missing = DATA_FILES.filter((f) => !existsSync(join(out, f)));
  if (missing.length) { console.error(`생성물 없음(${missing.join(', ')}): 먼저 livemap build --out ${out}`); return 2; }
  if (existsSync(target)) {
    if (!statSync(target).isDirectory()) { console.error(`export 대상이 폴더가 아님: ${target}`); return 2; }
    const entries = readdirSync(target);
    if (entries.length && !entries.includes(EXPORT_MARK)) {
      console.error(`export 대상이 비어 있지 않고 이전 export 폴더도 아님(지우지 않음): ${target}`);
      return 2;
    }
    rmSync(target, { recursive: true, force: true });
  }
  const dst = sourcesFor({ static: target });
  const copies = [
    ...listFiles(SITE).map((rel) => [join(SITE, rel), join(dst.site, rel)]),
    ...listFiles(captures).filter((f) => !f.includes('/') && f.endsWith('.jpg')).map((f) => [join(captures, f), join(dst.captures, f)]),
    ...DATA_FILES.map((f) => [join(out, f), join(dst.data, f)]),
    ...OPTIONAL_DATA_FILES.filter((f) => existsSync(join(out, f))).map((f) => [join(out, f), join(dst.data, f)]),
  ];
  for (const [from, to] of copies) { mkdirSync(dirname(to), { recursive: true }); copyFileSync(from, to); }
  writeFileSync(join(target, EXPORT_MARK), 'livemap export\n');
  const caps = copies.filter(([, to]) => dirname(to) === dst.captures).length;
  console.log(`map export → ${target}: 파일 ${copies.length} (캡처 ${caps})`);
  return 0;
}
