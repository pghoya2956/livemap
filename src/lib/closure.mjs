// import 닫힘: 화면 페이지 파일에서 로컬 import를 따라간다(router 어댑터에서 분리).
//   fileClosure     1.1.1 파일 닫힘. 화면 files·source·mockVia·fixedVia와 git 변경 연결이 쓴다(바꾸지 않는다)
//   literalSources  리터럴 추출 전용 닫힘. localDirs 안 파일은 파일 전체(깊이 3, import type 제외, 재수출 추적),
//                   앱 폴더 안이지만 localDirs 밖인 모듈은 가져온 이름의 최상위 선언만(깊이 2), 그 부분 모듈의 import는 따라가지 않는다
import { join, dirname } from 'node:path';

export function resolveLocal(fs, from, spec) {
  const base = join(from, '..', spec);
  for (const cand of [base + '.tsx', base + '.ts', join(base, 'index.tsx'), join(base, 'index.ts')]) if (fs.has(cand)) return cand;
  return null;
}

const inDirs = (file, dirs) => dirs.some((d) => file.startsWith(d + '/'));

// 1.1.1 파일 닫힘(깊이 3, localDirs 안만). 순서는 방문 순서
export function fileClosure(fs, file, localDirs, depth = 3, seen = new Set()) {
  if (seen.has(file) || depth < 0) return seen;
  seen.add(file);
  for (const m of fs.read(file).matchAll(/from\s+(['"])(\.[^'"]+)\1/g)) {
    const t = resolveLocal(fs, file, m[2]);
    if (t && inDirs(t, localDirs)) fileClosure(fs, t, localDirs, depth - 1, seen);
  }
  return seen;
}

// import·export … from 문: { kind: 'import'|'export', spec, names: [가져올 원래 이름], as: { 이 파일 쪽 이름: 원래 이름 }, namespace, all }. import type·type 지정자는 뺀다
const FROM_STMT = /^[ \t]*(import|export)\s+(type\s+)?([\w$*{}\s,]*?)\s*from\s*(['"])(\.[^'"]+)\4/gm;
export function importsOf(text) {
  const out = [];
  for (const m of text.matchAll(FROM_STMT)) {
    if (m[2]) continue;
    const clause = m[3].trim();
    const st = { kind: m[1], spec: m[5], names: [], as: {}, namespace: null, all: false };
    const braces = clause.match(/\{([^}]*)\}/);
    if (braces) {
      for (const part of braces[1].split(',')) {
        const p = part.trim();
        if (!p || /^type\s/.test(p)) continue;
        const [orig, local = orig] = p.split(/\s+as\s+/).map((x) => x.trim());
        st.names.push(orig);
        st.as[local] = orig;
      }
    }
    const rest = clause.replace(/\{[^}]*\}/, '').split(',').map((s) => s.trim()).filter(Boolean);
    for (const r of rest) {
      const ns = r.match(/^\*\s*as\s+([\w$]+)$/);
      if (ns) { st.namespace = ns[1]; st.all = true; }
      else if (r === '*') st.all = true;
      else if (m[1] === 'import' && /^[\w$]+$/.test(r)) { st.names.push('default'); st.as[r] = 'default'; }
    }
    out.push(st);
  }
  return out;
}

// 최상위 선언: 열 0에서 시작하는 선언 줄부터 다음 선언 줄 앞까지. [{ name, start, end }] (0부터 센 줄, end 제외)
const DECL = /^(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|var|class|interface|type|enum)\s+([\w$]+)/;
const BOUNDARY = /^(?:export|import|function|async\s+function|const|let|var|class|interface|type\s+[\w$]+|enum|declare)\b/;
export function topLevelDeclarations(text) {
  const lines = text.split('\n');
  const starts = [];
  lines.forEach((l, i) => { if (BOUNDARY.test(l)) starts.push(i); });
  const out = [];
  starts.forEach((s, k) => {
    const m = lines[s].match(DECL);
    const def = /^export\s+default\b/.test(lines[s]);
    if (!m && !def) return;
    out.push({ name: def ? 'default' : m[1], alias: def && m ? m[1] : null, start: s, end: k + 1 < starts.length ? starts[k + 1] : lines.length });
  });
  return out;
}

// 리터럴 추출 닫힘: [{ file, ranges: null(파일 전체) | [[start, end]] }]. 파일은 방문 순서, 범위는 줄 순
export function literalSources(fs, page, { localDirs, appDir, depth = 3 }) {
  const whole = new Set();
  const parsed = new Map();
  const imports = (f) => { if (!parsed.has(f)) parsed.set(f, importsOf(fs.read(f))); return parsed.get(f); };
  const queue = [];
  const want = (file, names) => queue.push([file, names]);
  const inApp = (f) => !appDir || appDir === '.' || f.startsWith(appDir + '/');

  const walk = (file, d) => {
    if (whole.has(file) || d < 0) return;
    whole.add(file);
    const text = fs.read(file);
    for (const st of imports(file)) {
      const t = resolveLocal(fs, file, st.spec);
      if (!t) continue;
      if (inDirs(t, localDirs)) { walk(t, d - 1); continue; }
      if (!inApp(t)) continue;
      // 네임스페이스 import는 파일에서 ns.이름으로 쓴 이름만, export *는 이름을 모르므로 넣지 않는다
      const names = st.namespace ? [...new Set([...text.matchAll(new RegExp(`\\b${st.namespace.replace(/\$/g, '\\$')}\\.([\\w$]+)`, 'g'))].map((m) => m[1]))] : st.names;
      if (names.length) want(t, names);
    }
  };
  walk(page, depth);

  // 부분 모듈: 가져온 이름의 최상위 선언(깊이 1)과 그 범위가 쓰는 같은 모듈의 다른 선언(깊이 2). 없는 이름은 재수출을 따라간다
  const ranges = new Map();
  const done = new Map();
  while (queue.length) {
    const [file, names] = queue.shift();
    if (whole.has(file)) continue;
    const seen = done.get(file) || new Set();
    done.set(file, seen);
    const todo = names.filter((n) => !seen.has(n));
    if (!todo.length) continue;
    for (const n of todo) seen.add(n);
    const text = fs.read(file);
    const lines = text.split('\n');
    const decls = topLevelDeclarations(text);
    const byName = new Map();
    for (const dcl of decls) { if (!byName.has(dcl.name)) byName.set(dcl.name, dcl); if (dcl.alias && !byName.has(dcl.alias)) byName.set(dcl.alias, dcl); }
    const picked = ranges.get(file) || new Map();
    ranges.set(file, picked);
    const add = (dcl) => picked.set(dcl.start, dcl);
    const reexports = importsOf(text).filter((s) => s.kind === 'export');
    for (const n of todo) {
      const dcl = byName.get(n);
      if (dcl) {
        add(dcl);
        const body = lines.slice(dcl.start, dcl.end).join('\n');
        for (const other of decls) if (other !== dcl && other.name !== 'default' && new RegExp(`(^|[^\\w$.])${other.name.replace(/\$/g, '\\$')}(?![\\w$])`).test(body)) add(other);
        continue;
      }
      for (const st of reexports) {
        if (!(st.all || n in st.as)) continue;
        const t = resolveLocal(fs, file, st.spec);
        if (!t) continue;
        if (inDirs(t, localDirs)) walk(t, 0);
        else if (inApp(t)) want(t, [st.as[n] ?? n]);
      }
    }
  }
  const out = [...whole].map((file) => ({ file, ranges: null }));
  for (const [file, picked] of ranges) {
    if (whole.has(file) || !picked.size) continue;
    out.push({ file, ranges: [...picked.values()].sort((a, b) => a.start - b.start).map((d) => [d.start, d.end]) });
  }
  return out;
}

export const appDirOf = (app) => dirname(app);
